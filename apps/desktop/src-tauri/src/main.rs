#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod kernel;

use kernel::KernelManager;
use serde::Serialize;
use std::collections::HashSet;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex};
use tauri::Emitter;
use tauri::Manager;
use tokio::sync::Mutex;

const PROVIDER_ENV_ALLOWED_PREFIXES: [&str; 2] = ["OPENAI_", "ANTHROPIC_"];
const MAX_PROVIDER_ENV_KEY_LEN: usize = 128;
const MAX_PROVIDER_ENV_VALUE_LEN: usize = 16 * 1024;
const KERNEL_START_LAST_ERROR: &str = "Engine failed to start within timeout";
const KERNEL_START_TIMEOUT_ERROR: &str = "Engine failed to become healthy within 60s";
const BLOCKED_ENV_KEYS: [&str; 9] = [
    "LD_PRELOAD",
    "DYLD_INSERT_LIBRARIES",
    "DYLD_LIBRARY_PATH",
    "PATH",
    "HOME",
    "SHELL",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "OPENCODE_CLIENT",
];

static DATA_FILE_WRITE_LOCK: StdMutex<()> = StdMutex::new(());

// ---------------------------------------------------------------------------
// Data paths — platform-native directories (isolated from user's OpenCode)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataPaths {
    /// Root data directory
    pub data: String,
    /// Configuration files (settings.json)
    pub config: String,
    /// Ephemeral cache (download artifacts)
    pub cache: String,
    /// Log files
    pub logs: String,
    /// Downloaded kernel binaries
    pub kernels: String,
    /// AlderCowork-managed Skills
    pub skills: String,
    /// OpenCode kernel state (isolated from ~/.config/opencode)
    pub kernel_state: String,
    /// Default workspace directory (user can work here immediately)
    pub workspace: String,
}

fn resolve_data_paths(app: &tauri::AppHandle) -> DataPaths {
    // Tauri provides platform-native paths via its path resolver:
    //   macOS:   ~/Library/Application Support/com.aldercowork.desktop
    //   Linux:   $XDG_DATA_HOME/com.aldercowork.desktop
    //   Windows: %APPDATA%/com.aldercowork.desktop
    let app_data = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from(".aldercowork"));

    let app_cache = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| app_data.join("cache"));

    let app_log = app
        .path()
        .app_log_dir()
        .unwrap_or_else(|_| app_data.join("logs"));

    let to_string = |p: PathBuf| -> String { p.to_string_lossy().into_owned() };

    DataPaths {
        data: to_string(app_data.clone()),
        config: to_string(app_data.clone()),
        cache: to_string(app_cache),
        logs: to_string(app_log),
        kernels: to_string(app_data.join("kernels")),
        skills: to_string(app_data.join("skills")),
        kernel_state: to_string(app_data.join("kernel-state")),
        workspace: to_string(app_data.join("workspace")),
    }
}

fn canonical_config_root(config_dir: &str) -> Result<PathBuf, String> {
    std::fs::create_dir_all(config_dir).map_err(|e| format!("Failed to create config dir: {e}"))?;

    std::fs::canonicalize(config_dir).map_err(|e| format!("Config dir not found: {e}"))
}

fn sanitize_relative_path(relative_path: &str) -> Result<&Path, String> {
    let path = Path::new(relative_path);

    if path.as_os_str().is_empty() {
        return Err("Path is required".into());
    }

    if path.is_absolute() {
        return Err("Absolute paths are not allowed".into());
    }

    for component in path.components() {
        if matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        ) {
            return Err("Path traversal denied".into());
        }
    }

    Ok(path)
}

fn validate_provider_env(env: Vec<(String, String)>) -> Result<Vec<(String, String)>, String> {
    let mut normalized = Vec::with_capacity(env.len());
    let mut seen = HashSet::with_capacity(env.len());

    for (key, value) in env {
        if key.is_empty() {
            return Err("Provider env key is required".into());
        }

        if key.len() > MAX_PROVIDER_ENV_KEY_LEN {
            return Err(format!("Provider env key is too long: {key}"));
        }

        if value.len() > MAX_PROVIDER_ENV_VALUE_LEN {
            return Err(format!("Provider env value is too long: {key}"));
        }

        if key.contains('\0') || value.contains('\0') {
            return Err(format!("Provider env contains NUL byte: {key}"));
        }

        if !key
            .chars()
            .all(|ch| ch.is_ascii_uppercase() || ch.is_ascii_digit() || ch == '_')
        {
            return Err(format!(
                "Provider env key contains invalid characters: {key}"
            ));
        }

        if !PROVIDER_ENV_ALLOWED_PREFIXES
            .iter()
            .any(|prefix| key.starts_with(prefix))
        {
            return Err(format!("Provider env key not allowed: {key}"));
        }

        if PROVIDER_ENV_ALLOWED_PREFIXES.contains(&key.as_str()) {
            return Err(format!("Provider env key is incomplete: {key}"));
        }

        if BLOCKED_ENV_KEYS.contains(&key.as_str()) {
            return Err(format!("Dangerous system env key denied: {key}"));
        }

        if !seen.insert(key.clone()) {
            return Err(format!("Duplicate provider env key: {key}"));
        }

        normalized.push((key, value));
    }

    Ok(normalized)
}

fn open_data_file_for_write(path: &Path) -> Result<std::fs::File, String> {
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);

    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
        options.custom_flags(libc::O_CLOEXEC | libc::O_NOFOLLOW);
    }

    options.open(path).map_err(|e| format!("Write error: {e}"))
}

async fn stop_kernel_runtime(state: &Arc<Mutex<KernelManager>>) {
    let child = {
        let mut mgr = state.lock().await;
        mgr.take_child()
    };

    if let Some(child) = child {
        kernel::stop_child_process(child).await;
    }
}

async fn start_kernel_runtime(
    app: &tauri::AppHandle,
    state: &Arc<Mutex<KernelManager>>,
    extra_env: Option<Vec<(String, String)>>,
) -> Result<kernel::KernelInfo, String> {
    let info = {
        let mut mgr = state.lock().await;
        mgr.spawn_process(app, extra_env)?
    };

    // The process was already running before this invocation.
    if info.status == "running" {
        return Ok(info);
    }

    let launched_port = info.port;
    let launched_pid = info.pid;

    if kernel::wait_for_ready(launched_port).await {
        let mut mgr = state.lock().await;
        if mgr.pid_matches(launched_pid) {
            mgr.clear_last_error();
        }

        return Ok(kernel::KernelInfo {
            port: launched_port,
            pid: launched_pid,
            status: "running".into(),
        });
    }

    let child = {
        let mut mgr = state.lock().await;
        if mgr.pid_matches(launched_pid) {
            mgr.set_last_error(KERNEL_START_LAST_ERROR);
        }
        mgr.take_child_if_pid(launched_pid)
    };

    if let Some(child) = child {
        kernel::stop_child_process(child).await;
    }

    Err(KERNEL_START_TIMEOUT_ERROR.into())
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn start_kernel(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<KernelManager>>>,
) -> Result<kernel::KernelInfo, String> {
    let kernel_state = state.inner().clone();
    start_kernel_runtime(&app, &kernel_state, None).await
}

#[tauri::command]
async fn stop_kernel(state: tauri::State<'_, Arc<Mutex<KernelManager>>>) -> Result<(), String> {
    let kernel_state = state.inner().clone();
    stop_kernel_runtime(&kernel_state).await;
    Ok(())
}

#[tauri::command]
async fn restart_kernel(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<KernelManager>>>,
) -> Result<kernel::KernelInfo, String> {
    let kernel_state = state.inner().clone();
    stop_kernel_runtime(&kernel_state).await;
    start_kernel_runtime(&app, &kernel_state, None).await
}

/// Restart kernel with fresh provider environment variables.
/// Called when user changes API keys in Settings.
#[tauri::command]
async fn restart_kernel_with_env(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<KernelManager>>>,
    env: Vec<(String, String)>,
) -> Result<kernel::KernelInfo, String> {
    let validated_env = validate_provider_env(env)?;
    let kernel_state = state.inner().clone();

    {
        let mut mgr = kernel_state.lock().await;
        mgr.set_provider_env(validated_env);
    }

    stop_kernel_runtime(&kernel_state).await;
    start_kernel_runtime(&app, &kernel_state, None).await
}

/// Store provider env without restarting.
/// Useful for initial setup — env will be used on next start/restart.
#[tauri::command]
async fn set_provider_env(
    state: tauri::State<'_, Arc<Mutex<KernelManager>>>,
    env: Vec<(String, String)>,
) -> Result<(), String> {
    let validated_env = validate_provider_env(env)?;
    let mut mgr = state.lock().await;
    mgr.set_provider_env(validated_env);
    Ok(())
}

#[tauri::command]
async fn kernel_status(
    state: tauri::State<'_, Arc<Mutex<KernelManager>>>,
) -> Result<kernel::KernelStatusPayload, String> {
    let mgr = state.lock().await;
    Ok(mgr.status())
}

/// Returns all platform-native data paths for the frontend to use.
#[tauri::command]
async fn get_data_paths(app: tauri::AppHandle) -> Result<DataPaths, String> {
    Ok(resolve_data_paths(&app))
}

/// Returns the default workspace directory path.
#[tauri::command]
async fn get_default_workspace(app: tauri::AppHandle) -> Result<String, String> {
    let paths = resolve_data_paths(&app);
    Ok(paths.workspace)
}

/// Open a native folder picker and return the selected path.
/// Returns None if the user cancels.
#[tauri::command]
async fn select_workspace() -> Result<Option<String>, String> {
    let result = tokio::task::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Open Project")
            .pick_folder()
    })
    .await
    .map_err(|e| format!("Dialog thread error: {e}"))?;

    Ok(result.map(|p| p.to_string_lossy().into_owned()))
}

/// Read a file from the data directory.
/// Path must be relative to the data root (security: no absolute paths).
#[tauri::command]
async fn read_data_file(app: tauri::AppHandle, relative_path: String) -> Result<String, String> {
    let paths = resolve_data_paths(&app);
    let canonical_root = canonical_config_root(&paths.config)?;
    let safe_relative = sanitize_relative_path(&relative_path)?;
    let full_path = canonical_root.join(safe_relative);

    // If file doesn't exist yet, return empty string (not an error).
    if !full_path.exists() {
        return Ok(String::new());
    }

    let canonical_file =
        std::fs::canonicalize(&full_path).map_err(|e| format!("Path resolution error: {e}"))?;

    if !canonical_file.starts_with(&canonical_root) {
        return Err("Path traversal denied".into());
    }

    std::fs::read_to_string(&canonical_file).map_err(|e| format!("Read error: {e}"))
}

/// Write a file to the data directory.
/// Path must be relative to the data root (security: no absolute paths).
#[tauri::command]
async fn write_data_file(
    app: tauri::AppHandle,
    relative_path: String,
    content: String,
) -> Result<(), String> {
    let paths = resolve_data_paths(&app);
    let canonical_root = canonical_config_root(&paths.config)?;
    let safe_relative = sanitize_relative_path(&relative_path)?;
    let parent_relative = safe_relative.parent().unwrap_or_else(|| Path::new(""));
    let full_parent = canonical_root.join(parent_relative);
    std::fs::create_dir_all(&full_parent)
        .map_err(|e| format!("Failed to create directory: {e}"))?;

    let canonical_parent =
        std::fs::canonicalize(&full_parent).map_err(|e| format!("Path resolution error: {e}"))?;
    if !canonical_parent.starts_with(&canonical_root) {
        return Err("Path traversal denied".into());
    }

    let file_name = safe_relative
        .file_name()
        .ok_or_else(|| "Path must target a file".to_string())?;
    let target_path = canonical_parent.join(file_name);

    let _write_guard = DATA_FILE_WRITE_LOCK
        .lock()
        .map_err(|_| "Write lock poisoned".to_string())?;
    let mut file = open_data_file_for_write(&target_path)?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Write error: {e}"))?;
    file.sync_all()
        .map_err(|e| format!("Write flush error: {e}"))?;

    Ok(())
}

/// Write OpenCode's native config.json to the kernel-state directory.
///
/// This is how AlderCowork configures the kernel: by writing directly to
/// OpenCode's own config format at {kernel-state}/opencode/config.json.
/// OpenCode reads this on startup and picks up provider keys, base URLs, etc.
///
/// The content parameter is the FULL JSON config string (not a patch).
#[tauri::command]
async fn write_kernel_config(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let paths = resolve_data_paths(&app);
    let opencode_config_dir = PathBuf::from(&paths.kernel_state).join("opencode");

    // Ensure the opencode config directory exists
    std::fs::create_dir_all(&opencode_config_dir)
        .map_err(|e| format!("Failed to create opencode config dir: {e}"))?;

    let config_path = opencode_config_dir.join("config.json");

    // Validate it's valid JSON before writing
    serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|e| format!("Invalid JSON: {e}"))?;

    std::fs::write(&config_path, &content)
        .map_err(|e| format!("Failed to write kernel config: {e}"))?;

    eprintln!("[main] wrote kernel config to {}", config_path.display());
    Ok(())
}

/// Read OpenCode's config.json from the kernel-state directory.
/// Returns empty string if the file doesn't exist yet.
#[tauri::command]
async fn read_kernel_config(app: tauri::AppHandle) -> Result<String, String> {
    let paths = resolve_data_paths(&app);
    let config_path = PathBuf::from(&paths.kernel_state)
        .join("opencode")
        .join("config.json");

    if !config_path.exists() {
        return Ok(String::new());
    }

    std::fs::read_to_string(&config_path).map_err(|e| format!("Failed to read kernel config: {e}"))
}

// ---------------------------------------------------------------------------
// Skill management commands
// ---------------------------------------------------------------------------

/// Sanitize a raw string into a valid, clean skill directory name.
/// Rules: lowercase, only [a-z0-9-], collapse hyphens, strip trailing version suffixes.
fn sanitize_skill_name(raw: &str) -> String {
    // Step 1: lowercase, replace non-alphanumeric with hyphens
    let mut chars: Vec<char> = raw
        .to_lowercase()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' {
                ch
            } else {
                '-'
            }
        })
        .collect();

    // Step 2: collapse consecutive hyphens
    chars.dedup_by(|a, b| *a == '-' && *b == '-');

    let mut name: String = chars.into_iter().collect();
    name = name.trim_matches('-').to_string();

    // Step 3: strip trailing version-like suffixes (e.g. -v2-0-1, -2-0-1)
    // Walk backward: if the tail is all digits and hyphens (optionally starting with 'v'),
    // strip it.
    if let Some(last_alpha_pos) = name.rfind(|ch: char| ch.is_ascii_alphabetic() && ch != 'v') {
        let tail = &name[last_alpha_pos + 1..];
        // If tail looks like "-v2-0-1" or "-2-0-1" (starts with - then digits/hyphens)
        let clean_tail = tail.trim_start_matches('-');
        let clean_tail = clean_tail.strip_prefix('v').unwrap_or(clean_tail);
        if !clean_tail.is_empty() && clean_tail.chars().all(|ch| ch.is_ascii_digit() || ch == '-') {
            name = name[..=last_alpha_pos].trim_end_matches('-').to_string();
        }
    }

    if name.is_empty() {
        "imported-skill".to_string()
    } else {
        name
    }
}

/// Skill directory entry returned to the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDirEntry {
    /// Skill ID — relative path from skills root (e.g. "my-skill" or "monorepo/sub-skill")
    pub id: String,
    /// Absolute path to the skill directory
    pub path: String,
    /// Whether a SKILL.md exists in this directory
    pub has_skill_md: bool,
    /// Whether a skill.yaml exists in this directory
    pub has_skill_yaml: bool,
}

/// Recursively discover all directories containing SKILL.md or skill.yaml
/// under the given root. Supports monorepo layouts.
fn discover_skills_recursive(root: &Path, base: &Path, results: &mut Vec<SkillDirEntry>) {
    let entries = match std::fs::read_dir(root) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let entry_path = entry.path();
        if !entry_path.is_dir() {
            continue;
        }

        // Skip hidden directories and node_modules
        let _dir_name = match entry_path.file_name().and_then(|n| n.to_str()) {
            Some(name) if !name.starts_with('.') && name != "node_modules" => name.to_string(),
            _ => continue,
        };

        let has_skill_md = entry_path.join("SKILL.md").exists();
        let has_skill_yaml = entry_path.join("skill.yaml").exists();

        if has_skill_md || has_skill_yaml {
            // This directory IS a skill — register it
            let relative = entry_path
                .strip_prefix(base)
                .unwrap_or(&entry_path)
                .to_string_lossy()
                .replace('\\', "/");

            results.push(SkillDirEntry {
                id: relative.clone(),
                path: entry_path.to_string_lossy().into_owned(),
                has_skill_md,
                has_skill_yaml,
            });
            // Do NOT recurse into a skill directory (a skill is a leaf)
        } else {
            // Not a skill — recurse deeper (could be a monorepo container)
            discover_skills_recursive(&entry_path, base, results);
        }
    }
}

/// List all skill directories under {data}/skills/.
/// Recursively discovers skills in nested structures (monorepos).
#[tauri::command]
async fn list_skill_dirs(app: tauri::AppHandle) -> Result<Vec<SkillDirEntry>, String> {
    let paths = resolve_data_paths(&app);
    let skills_dir = PathBuf::from(&paths.skills);

    if !skills_dir.exists() {
        return Ok(vec![]);
    }

    let mut result = Vec::new();
    discover_skills_recursive(&skills_dir, &skills_dir, &mut result);
    result.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(result)
}

/// Read a file inside a skill directory.
/// skill_id is the directory name, relative_path is relative to that directory.
#[tauri::command]
async fn read_skill_file(
    app: tauri::AppHandle,
    skill_id: String,
    relative_path: String,
) -> Result<String, String> {
    let paths = resolve_data_paths(&app);
    let skills_root = PathBuf::from(&paths.skills);

    // Validate skill_id — allow forward slashes for nested skills (monorepo),
    // but block path traversal and hidden directories
    if skill_id.contains('\\') || skill_id.contains("..")
        || skill_id.starts_with('.') || skill_id.is_empty()
        || skill_id.split('/').any(|seg| seg.starts_with('.') || seg.is_empty())
    {
        return Err("Invalid skill ID".into());
    }

    let safe_relative = sanitize_relative_path(&relative_path)?;
    let file_path = skills_root.join(&skill_id).join(safe_relative);

    if !file_path.exists() {
        return Ok(String::new());
    }

    // Verify canonical path stays within skills directory
    let canonical = std::fs::canonicalize(&file_path)
        .map_err(|e| format!("Path resolution error: {e}"))?;
    let canonical_root = std::fs::canonicalize(&skills_root)
        .map_err(|e| format!("Skills root resolution error: {e}"))?;
    if !canonical.starts_with(&canonical_root) {
        return Err("Path traversal denied".into());
    }

    std::fs::read_to_string(&canonical).map_err(|e| format!("Read error: {e}"))
}

/// Remove a skill directory entirely.
#[tauri::command]
async fn remove_skill(app: tauri::AppHandle, skill_id: String) -> Result<(), String> {
    let paths = resolve_data_paths(&app);
    let skills_root = PathBuf::from(&paths.skills);

    if skill_id.contains('\\') || skill_id.contains("..")
        || skill_id.starts_with('.') || skill_id.is_empty()
        || skill_id.split('/').any(|seg| seg.starts_with('.') || seg.is_empty())
    {
        return Err("Invalid skill ID".into());
    }

    let skill_dir = skills_root.join(&skill_id);
    if !skill_dir.exists() {
        return Ok(());
    }

    // Verify canonical path is within skills directory
    let canonical = std::fs::canonicalize(&skill_dir)
        .map_err(|e| format!("Path resolution error: {e}"))?;
    let canonical_root = std::fs::canonicalize(&skills_root)
        .map_err(|e| format!("Skills root resolution error: {e}"))?;
    if !canonical.starts_with(&canonical_root) {
        return Err("Path traversal denied".into());
    }

    std::fs::remove_dir_all(&canonical).map_err(|e| format!("Failed to remove skill: {e}"))
}

/// Open a native file picker for skill archives (zip/tar.gz/tgz).
/// Returns None if user cancels.
#[tauri::command]
async fn select_skill_archive() -> Result<Option<String>, String> {
    let result = tokio::task::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Import Skill Archive")
            .add_filter("Archives", &["zip", "tar.gz", "tgz", "tar"])
            .pick_file()
    })
    .await
    .map_err(|e| format!("Dialog thread error: {e}"))?;

    Ok(result.map(|p| p.to_string_lossy().into_owned()))
}

/// Import a skill from a local archive file.
/// Extracts into {skills}/{derived-name}/.
#[tauri::command]
async fn import_skill_archive(
    app: tauri::AppHandle,
    archive_path: String,
) -> Result<String, String> {
    let paths = resolve_data_paths(&app);
    let skills_root = PathBuf::from(&paths.skills);
    let src = PathBuf::from(&archive_path);

    if !src.exists() {
        return Err("Archive file not found".into());
    }

    let raw_name = src.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("imported-skill")
        .to_string();

    // Strip double extension for .tar.gz, then sanitize
    let stripped = if raw_name.ends_with(".tar") {
        raw_name.trim_end_matches(".tar").to_string()
    } else {
        raw_name
    };
    let skill_name = sanitize_skill_name(&stripped);

    let dest = skills_root.join(&skill_name);
    std::fs::create_dir_all(&dest)
        .map_err(|e| format!("Failed to create skill directory: {e}"))?;

    let archive_lower = archive_path.to_lowercase();

    if archive_lower.ends_with(".zip") {
        // Use system unzip
        let output = std::process::Command::new("unzip")
            .args(["-o", &archive_path, "-d"])
            .arg(&dest)
            .output()
            .map_err(|e| format!("Failed to run unzip: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("unzip failed: {stderr}"));
        }
    } else if archive_lower.ends_with(".tar.gz")
        || archive_lower.ends_with(".tgz")
        || archive_lower.ends_with(".tar")
    {
        let output = std::process::Command::new("tar")
            .args(["xf", &archive_path, "-C"])
            .arg(&dest)
            .output()
            .map_err(|e| format!("Failed to run tar: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("tar extract failed: {stderr}"));
        }
    } else {
        return Err("Unsupported archive format. Use .zip, .tar.gz, or .tgz".into());
    }

    // If the archive contained a single top-level directory, hoist its contents
    hoist_single_child_dir(&dest)?;

    Ok(skill_name)
}

/// If a directory contains exactly one child directory and no files,
/// move the child's contents up one level (common pattern for archives).
fn hoist_single_child_dir(dir: &Path) -> Result<(), String> {
    let entries: Vec<_> = std::fs::read_dir(dir)
        .map_err(|e| format!("Failed to read dir: {e}"))?
        .filter_map(|e| e.ok())
        .collect();

    if entries.len() != 1 {
        return Ok(());
    }

    let single = &entries[0];
    if !single.path().is_dir() {
        return Ok(());
    }

    // Move all children of the single subdirectory up to `dir`
    let child_dir = single.path();
    let child_entries = std::fs::read_dir(&child_dir)
        .map_err(|e| format!("Failed to read child dir: {e}"))?;

    for entry in child_entries {
        let entry = entry.map_err(|e| format!("Read entry error: {e}"))?;
        let src_path = entry.path();
        let dest_name = src_path.file_name()
            .ok_or_else(|| "Invalid file name".to_string())?;
        let dest_path = dir.join(dest_name);

        std::fs::rename(&src_path, &dest_path)
            .map_err(|e| format!("Failed to move {}: {e}", src_path.display()))?;
    }

    // Remove the now-empty subdirectory
    let _ = std::fs::remove_dir(&child_dir);
    Ok(())
}

/// Import a skill by cloning a Git repository (shallow clone).
/// The repo is cloned into {skills}/{derived-name}/.
#[tauri::command]
async fn import_skill_git(
    app: tauri::AppHandle,
    repo_url: String,
) -> Result<String, String> {
    let paths = resolve_data_paths(&app);
    let skills_root = PathBuf::from(&paths.skills);

    // Validate URL — must look like a git repository
    if !repo_url.starts_with("https://") && !repo_url.starts_with("git@") {
        return Err("Git URL must start with https:// or git@".into());
    }

    // Derive skill name from URL
    let skill_name = repo_url
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or("imported-skill")
        .trim_end_matches(".git")
        .to_string();

    if skill_name.is_empty() || skill_name.starts_with('.') {
        return Err("Cannot derive skill name from URL".into());
    }

    let dest = skills_root.join(&skill_name);

    // If destination already exists, remove it for re-import
    if dest.exists() {
        std::fs::remove_dir_all(&dest)
            .map_err(|e| format!("Failed to clean existing skill: {e}"))?;
    }

    let output = tokio::process::Command::new("git")
        .args(["clone", "--depth=1", &repo_url])
        .arg(&dest)
        .output()
        .await
        .map_err(|e| format!("Failed to run git clone: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Clean up partial clone
        let _ = std::fs::remove_dir_all(&dest);
        return Err(format!("git clone failed: {stderr}"));
    }

    // Remove .git directory to save space (we don't need history)
    let git_dir = dest.join(".git");
    if git_dir.exists() {
        let _ = std::fs::remove_dir_all(&git_dir);
    }

    Ok(skill_name)
}

// ---------------------------------------------------------------------------
// Skill activation — per-skill symlinks into OpenCode discovery paths
// ---------------------------------------------------------------------------

/// Extract the leaf directory name from a skill ID (e.g. "my-skills/web-scraper" → "web-scraper")
fn skill_leaf_name(skill_id: &str) -> &str {
    skill_id.rsplit('/').next().unwrap_or(skill_id)
}

/// Activate a skill by creating a symlink in the appropriate discovery directory.
/// scope: "global" → {kernel-state}/opencode/.agents/skills/{leaf}
/// scope: "workspace" → {workspace}/.agents/skills/{leaf}
#[tauri::command]
async fn activate_skill(
    app: tauri::AppHandle,
    skill_id: String,
    scope: String,
    workspace_path: Option<String>,
) -> Result<(), String> {
    let data_paths = resolve_data_paths(&app);
    let source = PathBuf::from(&data_paths.skills).join(&skill_id);
    if !source.exists() {
        return Err(format!("Skill not found: {skill_id}"));
    }

    let leaf = skill_leaf_name(&skill_id);
    let link_path = match scope.as_str() {
        "global" => {
            let dir = PathBuf::from(&data_paths.kernel_state)
                .join("opencode")
                .join(".agents")
                .join("skills");
            let _ = std::fs::create_dir_all(&dir);
            dir.join(leaf)
        }
        "workspace" => {
            let ws = workspace_path.ok_or("workspace_path required for workspace scope")?;
            let dir = PathBuf::from(&ws).join(".agents").join("skills");
            let _ = std::fs::create_dir_all(&dir);
            dir.join(leaf)
        }
        _ => return Err(format!("Invalid scope: {scope}")),
    };

    // Remove existing link/dir at target
    if link_path.is_symlink() || link_path.exists() {
        let _ = std::fs::remove_file(&link_path);
        let _ = std::fs::remove_dir_all(&link_path);
    }

    #[cfg(unix)]
    std::os::unix::fs::symlink(&source, &link_path)
        .map_err(|e| format!("symlink failed: {e}"))?;

    #[cfg(windows)]
    std::os::windows::fs::symlink_dir(&source, &link_path)
        .map_err(|e| format!("symlink failed: {e}"))?;

    Ok(())
}

/// Deactivate a skill by removing the symlink from the discovery directory.
#[tauri::command]
async fn deactivate_skill(
    app: tauri::AppHandle,
    skill_id: String,
    scope: String,
    workspace_path: Option<String>,
) -> Result<(), String> {
    let data_paths = resolve_data_paths(&app);
    let leaf = skill_leaf_name(&skill_id);

    let link_path = match scope.as_str() {
        "global" => {
            PathBuf::from(&data_paths.kernel_state)
                .join("opencode")
                .join(".agents")
                .join("skills")
                .join(leaf)
        }
        "workspace" => {
            let ws = workspace_path.ok_or("workspace_path required for workspace scope")?;
            PathBuf::from(&ws).join(".agents").join("skills").join(leaf)
        }
        _ => return Err(format!("Invalid scope: {scope}")),
    };

    if link_path.is_symlink() {
        std::fs::remove_file(&link_path)
            .map_err(|e| format!("Failed to remove symlink: {e}"))?;
    } else if link_path.exists() {
        std::fs::remove_dir_all(&link_path)
            .map_err(|e| format!("Failed to remove: {e}"))?;
    }

    Ok(())
}

/// Skill activation status returned to the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillActivation {
    pub skill_id: String,
    pub global: bool,
    pub workspace: bool,
}

/// Scan activation symlinks and return the state of all skills.
#[tauri::command]
async fn get_skill_activations(
    app: tauri::AppHandle,
    workspace_path: Option<String>,
) -> Result<Vec<SkillActivation>, String> {
    let data_paths = resolve_data_paths(&app);
    let skills_root = PathBuf::from(&data_paths.skills);

    // Enumerate all installed skills
    let mut results: Vec<SkillActivation> = Vec::new();
    let mut all_skills: Vec<(String, String)> = Vec::new(); // (id, leaf_name)

    fn collect_skills(root: &Path, base: &Path, out: &mut Vec<(String, String)>) {
        let entries = match std::fs::read_dir(root) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let p = entry.path();
            if !p.is_dir() { continue; }
            let name = match p.file_name().and_then(|n| n.to_str()) {
                Some(n) if !n.starts_with('.') => n.to_string(),
                _ => continue,
            };
            let has_skill = p.join("SKILL.md").exists() || p.join("skill.yaml").exists();
            if has_skill {
                let rel = p.strip_prefix(base).unwrap_or(&p).to_string_lossy().replace('\\', "/");
                out.push((rel, name));
            } else {
                collect_skills(&p, base, out);
            }
        }
    }

    collect_skills(&skills_root, &skills_root, &mut all_skills);

    // Check global activation
    let global_dir = PathBuf::from(&data_paths.kernel_state)
        .join("opencode")
        .join(".agents")
        .join("skills");

    // Check workspace activation
    let ws_dir = workspace_path.map(|ws| {
        PathBuf::from(&ws).join(".agents").join("skills")
    });

    for (skill_id, leaf) in &all_skills {
        let global = global_dir.join(leaf).is_symlink() || global_dir.join(leaf).exists();
        let workspace = ws_dir.as_ref().map_or(false, |d| {
            d.join(leaf).is_symlink() || d.join(leaf).exists()
        });
        results.push(SkillActivation {
            skill_id: skill_id.clone(),
            global,
            workspace,
        });
    }

    Ok(results)
}

// ---------------------------------------------------------------------------
// App bootstrap
// ---------------------------------------------------------------------------

fn main() {
    let kernel_manager = Arc::new(Mutex::new(KernelManager::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .manage(kernel_manager.clone())
        .setup(move |app| {
            // Resolve data paths and configure kernel state isolation
            let data_paths = resolve_data_paths(app.handle());

            // Ensure critical directories exist at startup
            let dirs_to_create = [
                &data_paths.data,
                &data_paths.config,
                &data_paths.cache,
                &data_paths.logs,
                &data_paths.kernels,
                &data_paths.skills,
                &data_paths.kernel_state,
                &data_paths.workspace,
            ];
            for dir in dirs_to_create {
                if let Err(e) = std::fs::create_dir_all(dir) {
                    eprintln!("[main] failed to create dir {dir}: {e}");
                }
            }

            // Also ensure {kernel_state}/opencode/ exists for config.json
            let opencode_dir = PathBuf::from(&data_paths.kernel_state).join("opencode");
            if let Err(e) = std::fs::create_dir_all(&opencode_dir) {
                eprintln!("[main] failed to create opencode config dir: {e}");
            }

            // Deploy AlderCowork system prompt to {kernel_state}/opencode/prompts/aldercowork.txt
            // This file is referenced via {file:./prompts/aldercowork.txt} in OpenCode's config.json
            let prompts_dir = opencode_dir.join("prompts");
            if let Err(e) = std::fs::create_dir_all(&prompts_dir) {
                eprintln!("[main] failed to create prompts dir: {e}");
            }
            let prompt_src = app.path().resolve(
                "resources/prompts/aldercowork.txt",
                tauri::path::BaseDirectory::Resource,
            );
            match prompt_src {
                Ok(src) if src.exists() => {
                    let dest = prompts_dir.join("aldercowork.txt");
                    if let Err(e) = std::fs::copy(&src, &dest) {
                        eprintln!("[main] failed to deploy prompt file: {e}");
                    } else {
                        eprintln!("[main] deployed aldercowork prompt to {}", dest.display());
                    }
                }
                _ => {
                    // Fallback: write embedded prompt if resource bundle not available (dev mode)
                    let dest = prompts_dir.join("aldercowork.txt");
                    if !dest.exists() {
                        let fallback = include_str!("../resources/prompts/aldercowork.txt");
                        if let Err(e) = std::fs::write(&dest, fallback) {
                            eprintln!("[main] failed to write fallback prompt: {e}");
                        }
                    }
                }
            }

            // Ensure config.json has AlderCowork agent identity before kernel starts.
            // This is a merge, not overwrite — preserves existing provider keys.
            let config_path = opencode_dir.join("config.json");
            {
                let mut config: serde_json::Value = if config_path.exists() {
                    let raw = std::fs::read_to_string(&config_path).unwrap_or_default();
                    serde_json::from_str(&raw).unwrap_or(serde_json::json!({}))
                } else {
                    serde_json::json!({})
                };

                if !config.is_object() {
                    config = serde_json::json!({});
                }

                let obj = config
                    .as_object_mut()
                    .expect("config should be object after normalization");
                obj.entry("$schema")
                    .or_insert(serde_json::json!("https://opencode.ai/config.json"));

                // Inject AlderCowork agent identity — overrides built-in build agent's prompt.
                // No model field: uses the global `model` from config.json.
                {
                    let agent = obj
                        .entry("agent")
                        .or_insert(serde_json::json!({}))
                        .as_object_mut();
                    if let Some(agent_obj) = agent {
                        let build = agent_obj
                            .entry("build")
                            .or_insert(serde_json::json!({}))
                            .as_object_mut();
                        if let Some(build_obj) = build {
                            build_obj.insert(
                                "description".to_string(),
                                serde_json::json!("AlderCowork — versatile AI assistant for research, writing, analysis, and general tasks"),
                            );
                            build_obj.insert(
                                "prompt".to_string(),
                                serde_json::json!("{file:./prompts/aldercowork.txt}"),
                            );
                        }
                    }
                }

                // Remove any stale non-standard keys that would cause OpenCode
                // config validation to reject the entire file
                obj.remove("_aldercowork_skills");

                if let Ok(json_str) = serde_json::to_string_pretty(&config) {
                    if let Err(e) = std::fs::write(&config_path, &json_str) {
                        eprintln!("[main] failed to write config.json: {e}");
                    }
                }
            }

            // Ensure {kernel-state}/opencode/.agents/skills/ exists as a real directory
            // for per-skill activation symlinks. Uses the `.agents` agent-compatible
            // directory convention, consistent with workspace scope.
            let kernel_agents_dir = opencode_dir.join(".agents");
            let kernel_skills_dir = kernel_agents_dir.join("skills");
            // Clean up legacy symlink from previous path layout
            if kernel_skills_dir.is_symlink() {
                let _ = std::fs::remove_file(&kernel_skills_dir);
            }
            if let Err(e) = std::fs::create_dir_all(&kernel_skills_dir) {
                eprintln!("[main] failed to create kernel skills dir: {e}");
            }

            eprintln!("[main] data paths: {:?}", data_paths);

            // Auto-start kernel with data isolation
            let handle = app.handle().clone();
            let mgr = kernel_manager.clone();
            let kernel_state_dir = data_paths.kernel_state.clone();

            tauri::async_runtime::spawn(async move {
                eprintln!("[main] auto-starting engine...");
                {
                    let mut manager = mgr.lock().await;
                    manager.set_kernel_state_dir(kernel_state_dir);
                }

                match start_kernel_runtime(&handle, &mgr, None).await {
                    Ok(info) => {
                        eprintln!("[main] engine started on port {}", info.port);
                        let _ = handle.emit("kernel-started", &info);
                    }
                    Err(e) => {
                        eprintln!("[main] engine start failed: {e}");
                        let _ = handle.emit("kernel-error", e.to_string());
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_kernel,
            stop_kernel,
            restart_kernel,
            restart_kernel_with_env,
            set_provider_env,
            kernel_status,
            get_data_paths,
            get_default_workspace,
            select_workspace,
            read_data_file,
            write_data_file,
            write_kernel_config,
            read_kernel_config,
            list_skill_dirs,
            read_skill_file,
            remove_skill,
            select_skill_archive,
            import_skill_archive,
            import_skill_git,
            activate_skill,
            deactivate_skill,
            get_skill_activations,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

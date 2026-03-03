#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod kernel;
mod skill;

use kernel::KernelManager;
use serde::Serialize;
use std::collections::HashSet;
use std::fs::OpenOptions;
use std::io::{ErrorKind, Write};
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
    pub data: String,
    pub config: String,
    pub cache: String,
    pub logs: String,
    pub kernels: String,
    pub skills: String,
    pub kernel_state: String,
    pub workspace: String,
}

pub fn resolve_data_paths(app: &tauri::AppHandle) -> DataPaths {
    // Tauri provides platform-native paths via its path resolver:
    //   macOS:   ~/Library/Application Support/com.aldercowork.desktop
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

pub fn sanitize_relative_path(relative_path: &str) -> Result<&Path, String> {
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

fn open_secure_temp_file_for_write(dest_path: &Path) -> Result<(PathBuf, std::fs::File), String> {
    let parent = dest_path
        .parent()
        .ok_or_else(|| "Invalid destination path".to_string())?;
    std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;

    let file_name = dest_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid destination file name".to_string())?;

    let mut options = OpenOptions::new();
    options.write(true).create_new(true);

    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
        options.custom_flags(libc::O_CLOEXEC | libc::O_NOFOLLOW);
    }

    for attempt in 0..12u32 {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let tmp_name = format!(".{file_name}.tmp-{}-{}-{}", std::process::id(), now, attempt);
        let tmp_path = parent.join(tmp_name);

        match options.open(&tmp_path) {
            Ok(file) => return Ok((tmp_path, file)),
            Err(e) if e.kind() == ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("Write error: {e}")),
        }
    }

    Err("Failed to allocate temp file for write".into())
}

fn atomic_write_secure(path: &Path, content: &[u8]) -> Result<(), String> {
    let (tmp_path, mut file) = open_secure_temp_file_for_write(path)?;

    file.write_all(content)
        .map_err(|e| format!("Write error: {e}"))?;
    file.sync_all()
        .map_err(|e| format!("Write flush error: {e}"))?;
    drop(file);

    #[cfg(windows)]
    {
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
    }

    std::fs::rename(&tmp_path, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        format!("Atomic rename failed: {e}")
    })?;

    Ok(())
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

#[tauri::command]
async fn get_data_paths(app: tauri::AppHandle) -> Result<DataPaths, String> {
    Ok(resolve_data_paths(&app))
}

#[tauri::command]
async fn get_default_workspace(app: tauri::AppHandle) -> Result<String, String> {
    let paths = resolve_data_paths(&app);
    Ok(paths.workspace)
}

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

#[tauri::command]
async fn read_data_file(app: tauri::AppHandle, relative_path: String) -> Result<String, String> {
    let paths = resolve_data_paths(&app);
    let canonical_root = canonical_config_root(&paths.config)?;
    let safe_relative = sanitize_relative_path(&relative_path)?;
    let full_path = canonical_root.join(safe_relative);

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
#[tauri::command]
async fn write_kernel_config(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let paths = resolve_data_paths(&app);
    let opencode_config_dir = PathBuf::from(&paths.kernel_state).join("opencode");

    std::fs::create_dir_all(&opencode_config_dir)
        .map_err(|e| format!("Failed to create opencode config dir: {e}"))?;

    let config_path = opencode_config_dir.join("config.json");

    serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|e| format!("Invalid JSON: {e}"))?;

    atomic_write_secure(&config_path, content.as_bytes())
        .map_err(|e| format!("Failed to write kernel config: {e}"))?;

    eprintln!("[main] wrote kernel config to {}", config_path.display());
    Ok(())
}

/// Read OpenCode's config.json from the kernel-state directory.
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
// App bootstrap
// ---------------------------------------------------------------------------

fn main() {
    let kernel_manager = Arc::new(Mutex::new(KernelManager::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(kernel_manager.clone())
        .setup(move |app| {
            let data_paths = resolve_data_paths(app.handle());

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

            let opencode_dir = PathBuf::from(&data_paths.kernel_state).join("opencode");
            if let Err(e) = std::fs::create_dir_all(&opencode_dir) {
                eprintln!("[main] failed to create opencode config dir: {e}");
            }

            // Deploy system prompt to {kernel_state}/opencode/prompts/aldercowork.txt
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
                    let dest = prompts_dir.join("aldercowork.txt");
                    if !dest.exists() {
                        let fallback = include_str!("../resources/prompts/aldercowork.txt");
                        if let Err(e) = std::fs::write(&dest, fallback) {
                            eprintln!("[main] failed to write fallback prompt: {e}");
                        }
                    }
                }
            }

            // Merge AlderCowork agent identity into config.json
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

                obj.remove("_aldercowork_skills");

                // Inject skills.paths for OpenCode skill discovery via XDG-isolated directory
                {
                    let skills_dir = opencode_dir
                        .join(".agents")
                        .join("skills")
                        .to_string_lossy()
                        .into_owned();
                    let skills = obj
                        .entry("skills")
                        .or_insert(serde_json::json!({}))
                        .as_object_mut();
                    if let Some(skills_obj) = skills {
                        skills_obj.insert(
                            "paths".to_string(),
                            serde_json::json!([skills_dir]),
                        );
                    }
                }

                if let Ok(json_str) = serde_json::to_string_pretty(&config) {
                    if let Err(e) = atomic_write_secure(&config_path, json_str.as_bytes()) {
                        eprintln!("[main] failed to write config.json: {e}");
                    }
                }
            }

            // Ensure activation symlink directory exists
            let kernel_agents_dir = opencode_dir.join(".agents");
            let kernel_skills_dir = kernel_agents_dir.join("skills");
            if kernel_skills_dir.is_symlink() {
                let _ = std::fs::remove_file(&kernel_skills_dir);
            }
            if let Err(e) = std::fs::create_dir_all(&kernel_skills_dir) {
                eprintln!("[main] failed to create kernel skills dir: {e}");
            }

            eprintln!("[main] data paths: {:?}", data_paths);

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
            skill::list_skill_dirs,
            skill::read_skill_file,
            skill::remove_skill,
            skill::select_skill_archive,
            skill::import_skill_archive,
            skill::import_skill_git,
            skill::activate_skill,
            skill::deactivate_skill,
            skill::get_skill_activations,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

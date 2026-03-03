use crate::kernel::KernelManager;
use crate::resolve_data_paths;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{timeout, Duration};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDirEntry {
    pub id: String,
    pub path: String,
    pub has_skill_md: bool,
    pub has_skill_yaml: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillActivation {
    pub skill_id: String,
    pub global: bool,
    pub workspace: bool,
}

// ---------------------------------------------------------------------------
// Skill name sanitization
// ---------------------------------------------------------------------------

/// Sanitize a raw string into a valid, clean skill directory name.
/// Rules: lowercase, only [a-z0-9-], collapse hyphens, strip trailing version suffixes.
fn sanitize_skill_name(raw: &str) -> String {
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

    chars.dedup_by(|a, b| *a == '-' && *b == '-');

    let mut name: String = chars.into_iter().collect();
    name = name.trim_matches('-').to_string();

    // Strip trailing version-like suffixes (e.g. -v2-0-1, -2-0-1)
    if let Some(last_alpha_pos) = name.rfind(|ch: char| ch.is_ascii_alphabetic() && ch != 'v') {
        let tail = &name[last_alpha_pos + 1..];
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

// ---------------------------------------------------------------------------
// Skill discovery (recursive, supports monorepo layouts)
// ---------------------------------------------------------------------------

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

        let _dir_name = match entry_path.file_name().and_then(|n| n.to_str()) {
            Some(name) if !name.starts_with('.') && name != "node_modules" => name.to_string(),
            _ => continue,
        };

        let has_skill_md = entry_path.join("SKILL.md").exists();
        let has_skill_yaml = entry_path.join("skill.yaml").exists();

        if has_skill_md || has_skill_yaml {
            let relative = entry_path
                .strip_prefix(base)
                .unwrap_or(&entry_path)
                .to_string_lossy()
                .replace('\\', "/");

            results.push(SkillDirEntry {
                id: relative,
                path: entry_path.to_string_lossy().into_owned(),
                has_skill_md,
                has_skill_yaml,
            });
        } else {
            discover_skills_recursive(&entry_path, base, results);
        }
    }
}

fn collect_installed_skills(root: &Path, base: &Path, out: &mut Vec<(String, String)>) {
    let entries = match std::fs::read_dir(root) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if !p.is_dir() {
            continue;
        }
        let name = match p.file_name().and_then(|n| n.to_str()) {
            Some(n)
                if !n.starts_with('.')
                    && n != "node_modules"
                    && n != "target"
                    && n != "dist"
                    && n != "build"
                    && n != ".git" =>
            {
                n.to_string()
            }
            _ => continue,
        };
        let has_skill = p.join("SKILL.md").exists() || p.join("skill.yaml").exists();
        if has_skill {
            let rel = p
                .strip_prefix(base)
                .unwrap_or(&p)
                .to_string_lossy()
                .replace('\\', "/");
            out.push((rel, name));
        } else {
            collect_installed_skills(&p, base, out);
        }
    }
}

// ---------------------------------------------------------------------------
// Skill ID validation (shared guard)
// ---------------------------------------------------------------------------

fn validate_skill_id(skill_id: &str) -> Result<(), String> {
    if skill_id.contains('\\')
        || skill_id.contains("..")
        || skill_id.starts_with('.')
        || skill_id.is_empty()
        || skill_id
            .split('/')
            .any(|seg| seg.starts_with('.') || seg.is_empty())
    {
        return Err("Invalid skill ID".into());
    }
    Ok(())
}

fn skill_leaf_name(skill_id: &str) -> &str {
    skill_id.rsplit('/').next().unwrap_or(skill_id)
}

// ---------------------------------------------------------------------------
// Archive extraction — pure Rust, no system commands
// ---------------------------------------------------------------------------

fn extract_zip(archive_path: &Path, dest: &Path) -> Result<(), String> {
    let file =
        std::fs::File::open(archive_path).map_err(|e| format!("Failed to open archive: {e}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip archive: {e}"))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Zip entry error: {e}"))?;

        let entry_path = match entry.enclosed_name() {
            Some(p) => p.to_owned(),
            None => continue, // skip unsafe paths
        };

        let out_path = dest.join(&entry_path);

        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)
                .map_err(|e| format!("Failed to create dir: {e}"))?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create dir: {e}"))?;
            }
            let mut outfile = std::fs::File::create(&out_path)
                .map_err(|e| format!("Failed to create file: {e}"))?;
            std::io::copy(&mut entry, &mut outfile)
                .map_err(|e| format!("Failed to extract file: {e}"))?;

            // Preserve executable permission on Unix
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Some(mode) = entry.unix_mode() {
                    std::fs::set_permissions(&out_path, std::fs::Permissions::from_mode(mode))
                        .ok();
                }
            }
        }
    }
    Ok(())
}

fn extract_tar(archive_path: &Path, dest: &Path) -> Result<(), String> {
    let file =
        std::fs::File::open(archive_path).map_err(|e| format!("Failed to open archive: {e}"))?;

    let lower = archive_path.to_string_lossy().to_lowercase();
    if lower.ends_with(".tar.gz") || lower.ends_with(".tgz") {
        let decoder = flate2::read::GzDecoder::new(file);
        let mut archive = tar::Archive::new(decoder);
        archive
            .unpack(dest)
            .map_err(|e| format!("tar.gz extraction failed: {e}"))?;
    } else {
        let mut archive = tar::Archive::new(file);
        archive
            .unpack(dest)
            .map_err(|e| format!("tar extraction failed: {e}"))?;
    }
    Ok(())
}

/// If a directory contains exactly one child directory and no files,
/// move the child's contents up one level.
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

    let child_dir = single.path();
    let child_entries = std::fs::read_dir(&child_dir)
        .map_err(|e| format!("Failed to read child dir: {e}"))?;

    for entry in child_entries {
        let entry = entry.map_err(|e| format!("Read entry error: {e}"))?;
        let src_path = entry.path();
        let dest_name = src_path
            .file_name()
            .ok_or_else(|| "Invalid file name".to_string())?;
        let dest_path = dir.join(dest_name);

        std::fs::rename(&src_path, &dest_path)
            .map_err(|e| format!("Failed to move {}: {e}", src_path.display()))?;
    }

    let _ = std::fs::remove_dir(&child_dir);
    Ok(())
}

// ---------------------------------------------------------------------------
// Git URL parsing
// ---------------------------------------------------------------------------

/// Parse a hosting platform URL that may point to a subdirectory.
/// Recognises GitHub / GitLab / Gitea `/tree/{branch}/{path}` convention.
/// Returns `(clone_url, Option<(branch, subpath)>)`.
fn parse_git_url(raw: &str) -> (String, Option<(String, String)>) {
    let url = raw.trim_end_matches('/');

    if let Some(tree_pos) = url.find("/tree/") {
        let repo_root = &url[..tree_pos];
        let after_tree = &url[tree_pos + "/tree/".len()..];

        if let Some(slash) = after_tree.find('/') {
            let branch = &after_tree[..slash];
            let subpath = &after_tree[slash + 1..];
            if !subpath.is_empty() {
                return (
                    format!("{repo_root}.git"),
                    Some((branch.to_string(), subpath.to_string())),
                );
            }
        }
        return (format!("{repo_root}.git"), None);
    }

    (url.to_string(), None)
}

/// Shallow-clone an entire repository into `dest`.
async fn import_git_shallow(clone_url: &str, dest: &Path) -> Result<(), String> {
    let output = timeout(
        Duration::from_secs(90),
        tokio::process::Command::new("git")
            .args(["clone", "--depth=1", clone_url])
            .arg(dest)
            .env("GIT_TERMINAL_PROMPT", "0")
            .output(),
    )
    .await
    .map_err(|_| "git clone timed out".to_string())?
    .map_err(|e| format!("Failed to run git clone: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let _ = std::fs::remove_dir_all(dest);
        return Err(format!("git clone failed: {stderr}"));
    }
    Ok(())
}

/// Sparse-checkout a single subdirectory from a remote repository.
async fn import_git_sparse(
    clone_url: &str,
    branch: &str,
    subpath: &str,
    dest: &Path,
) -> Result<(), String> {
    let output = timeout(
        Duration::from_secs(90),
        tokio::process::Command::new("git")
            .args([
                "clone",
                "--depth=1",
                "--filter=blob:none",
                "--no-checkout",
                "--branch",
                branch,
                clone_url,
            ])
            .arg(dest)
            .env("GIT_TERMINAL_PROMPT", "0")
            .output(),
    )
    .await
    .map_err(|_| "git clone timed out".to_string())?
    .map_err(|e| format!("Failed to run git clone: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let _ = std::fs::remove_dir_all(dest);
        return Err(format!("git clone failed: {stderr}"));
    }

    let output = tokio::process::Command::new("git")
        .args(["sparse-checkout", "set", subpath])
        .current_dir(dest)
        .output()
        .await
        .map_err(|e| format!("sparse-checkout set failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let _ = std::fs::remove_dir_all(dest);
        return Err(format!("sparse-checkout set failed: {stderr}"));
    }

    let output = tokio::process::Command::new("git")
        .arg("checkout")
        .current_dir(dest)
        .output()
        .await
        .map_err(|e| format!("git checkout failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let _ = std::fs::remove_dir_all(dest);
        return Err(format!("git checkout failed: {stderr}"));
    }

    // Hoist subdirectory contents to dest root
    let nested = dest.join(subpath);
    if nested.is_dir() {
        let entries = std::fs::read_dir(&nested)
            .map_err(|e| format!("Failed to read sparse directory: {e}"))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Read entry error: {e}"))?;
            let src_path = entry.path();
            let name = src_path
                .file_name()
                .ok_or_else(|| "Invalid file name".to_string())?;
            let dest_path = dest.join(name);
            std::fs::rename(&src_path, &dest_path)
                .map_err(|e| format!("Failed to move {}: {e}", src_path.display()))?;
        }

        let mut cur = nested;
        while cur != *dest {
            let _ = std::fs::remove_dir(&cur);
            cur = match cur.parent() {
                Some(p) => p.to_path_buf(),
                None => break,
            };
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Kernel dispose notification
// ---------------------------------------------------------------------------

async fn notify_kernel_dispose(state: &Arc<Mutex<KernelManager>>) {
    let port = {
        let mgr = state.lock().await;
        let status = mgr.status();
        if !status.running {
            return;
        }
        match status.port {
            Some(p) => p,
            None => return,
        }
    };

    let url = format!("http://127.0.0.1:{port}/global/dispose");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .unwrap_or_default();

    match client.post(&url).send().await {
        Ok(resp) if resp.status().is_success() => {
            eprintln!("[skill] kernel instance state invalidated");
        }
        Ok(resp) => {
            eprintln!("[skill] dispose returned {}", resp.status());
        }
        Err(e) => {
            eprintln!("[skill] dispose request failed (kernel may be busy): {e}");
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_skill_dirs(app: tauri::AppHandle) -> Result<Vec<SkillDirEntry>, String> {
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

#[tauri::command]
pub async fn read_skill_file(
    app: tauri::AppHandle,
    skill_id: String,
    relative_path: String,
) -> Result<String, String> {
    let paths = resolve_data_paths(&app);
    let skills_root = PathBuf::from(&paths.skills);

    validate_skill_id(&skill_id)?;

    let safe_relative = crate::sanitize_relative_path(&relative_path)?;
    let file_path = skills_root.join(&skill_id).join(safe_relative);

    if !file_path.exists() {
        return Ok(String::new());
    }

    let canonical = std::fs::canonicalize(&file_path)
        .map_err(|e| format!("Path resolution error: {e}"))?;
    let canonical_root = std::fs::canonicalize(&skills_root)
        .map_err(|e| format!("Skills root resolution error: {e}"))?;
    if !canonical.starts_with(&canonical_root) {
        return Err("Path traversal denied".into());
    }

    std::fs::read_to_string(&canonical).map_err(|e| format!("Read error: {e}"))
}

#[tauri::command]
pub async fn remove_skill(app: tauri::AppHandle, skill_id: String) -> Result<(), String> {
    let paths = resolve_data_paths(&app);
    let skills_root = PathBuf::from(&paths.skills);

    validate_skill_id(&skill_id)?;

    let skill_dir = skills_root.join(&skill_id);
    if !skill_dir.exists() {
        return Ok(());
    }

    let canonical = std::fs::canonicalize(&skill_dir)
        .map_err(|e| format!("Path resolution error: {e}"))?;
    let canonical_root = std::fs::canonicalize(&skills_root)
        .map_err(|e| format!("Skills root resolution error: {e}"))?;
    if !canonical.starts_with(&canonical_root) {
        return Err("Path traversal denied".into());
    }

    std::fs::remove_dir_all(&canonical).map_err(|e| format!("Failed to remove skill: {e}"))
}

#[tauri::command]
pub async fn select_skill_archive() -> Result<Option<String>, String> {
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

/// Import a skill from a local archive file using pure-Rust extraction.
#[tauri::command]
pub async fn import_skill_archive(
    app: tauri::AppHandle,
    archive_path: String,
) -> Result<String, String> {
    let paths = resolve_data_paths(&app);
    let skills_root = PathBuf::from(&paths.skills);
    let src = PathBuf::from(&archive_path);

    if !src.exists() {
        return Err("Archive file not found".into());
    }

    let raw_name = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("imported-skill")
        .to_string();

    let stripped = if raw_name.ends_with(".tar") {
        raw_name.trim_end_matches(".tar").to_string()
    } else {
        raw_name
    };
    let skill_name = sanitize_skill_name(&stripped);

    let dest = skills_root.join(&skill_name);
    if dest.exists() {
        std::fs::remove_dir_all(&dest)
            .map_err(|e| format!("Failed to clean existing skill: {e}"))?;
    }
    std::fs::create_dir_all(&dest)
        .map_err(|e| format!("Failed to create skill directory: {e}"))?;

    let archive_lower = archive_path.to_lowercase();

    let extract_result = if archive_lower.ends_with(".zip") {
        extract_zip(&src, &dest)
    } else if archive_lower.ends_with(".tar.gz")
        || archive_lower.ends_with(".tgz")
        || archive_lower.ends_with(".tar")
    {
        extract_tar(&src, &dest)
    } else {
        return Err("Unsupported archive format. Use .zip, .tar.gz, or .tgz".into());
    };

    if let Err(error) = extract_result {
        let _ = std::fs::remove_dir_all(&dest);
        return Err(error);
    }

    if let Err(error) = hoist_single_child_dir(&dest) {
        let _ = std::fs::remove_dir_all(&dest);
        return Err(error);
    }

    Ok(skill_name)
}

/// Import a skill by cloning a Git repository (shallow clone).
/// Supports both plain repo URLs and subdirectory URLs.
#[tauri::command]
pub async fn import_skill_git(
    app: tauri::AppHandle,
    repo_url: String,
) -> Result<String, String> {
    let paths = resolve_data_paths(&app);
    let skills_root = PathBuf::from(&paths.skills);

    if !repo_url.starts_with("https://") && !repo_url.starts_with("git@") {
        return Err("Git URL must start with https:// or git@".into());
    }

    let (clone_url, subdir_info) = parse_git_url(&repo_url);

    let raw_name = if let Some((_, ref subpath)) = subdir_info {
        subpath
            .trim_end_matches('/')
            .rsplit('/')
            .next()
            .unwrap_or("imported-skill")
            .to_string()
    } else {
        clone_url
            .trim_end_matches('/')
            .rsplit('/')
            .next()
            .unwrap_or("imported-skill")
            .trim_end_matches(".git")
            .to_string()
    };

    let skill_name = sanitize_skill_name(&raw_name);
    let dest = skills_root.join(&skill_name);

    if dest.exists() {
        std::fs::remove_dir_all(&dest)
            .map_err(|e| format!("Failed to clean existing skill: {e}"))?;
    }

    if let Some((ref branch, ref subpath)) = subdir_info {
        import_git_sparse(&clone_url, branch, subpath, &dest).await?;
    } else {
        import_git_shallow(&clone_url, &dest).await?;
    }

    let git_dir = dest.join(".git");
    if git_dir.exists() {
        let _ = std::fs::remove_dir_all(&git_dir);
    }

    Ok(skill_name)
}

#[tauri::command]
pub async fn activate_skill(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<KernelManager>>>,
    skill_id: String,
    scope: String,
    workspace_path: Option<String>,
) -> Result<(), String> {
    let data_paths = resolve_data_paths(&app);

    validate_skill_id(&skill_id)?;

    let skills_root = PathBuf::from(&data_paths.skills);
    let source = skills_root.join(&skill_id);
    if !source.is_dir() {
        return Err(format!("Skill not found: {skill_id}"));
    }

    let canonical = std::fs::canonicalize(&source)
        .map_err(|e| format!("Path resolution error: {e}"))?;
    let canonical_root = std::fs::canonicalize(&skills_root)
        .map_err(|e| format!("Skills root resolution error: {e}"))?;
    if !canonical.starts_with(&canonical_root) {
        return Err("Path traversal denied".into());
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

    if link_path.is_symlink() || link_path.exists() {
        let _ = std::fs::remove_file(&link_path);
        let _ = std::fs::remove_dir_all(&link_path);
    }

    #[cfg(unix)]
    std::os::unix::fs::symlink(&canonical, &link_path)
        .map_err(|e| format!("symlink failed: {e}"))?;

    #[cfg(windows)]
    std::os::windows::fs::symlink_dir(&canonical, &link_path)
        .map_err(|e| format!("symlink failed: {e}"))?;

    notify_kernel_dispose(&state).await;

    Ok(())
}

#[tauri::command]
pub async fn deactivate_skill(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<KernelManager>>>,
    skill_id: String,
    scope: String,
    workspace_path: Option<String>,
) -> Result<(), String> {
    let data_paths = resolve_data_paths(&app);
    let leaf = skill_leaf_name(&skill_id);

    let link_path = match scope.as_str() {
        "global" => PathBuf::from(&data_paths.kernel_state)
            .join("opencode")
            .join(".agents")
            .join("skills")
            .join(leaf),
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

    notify_kernel_dispose(&state).await;

    Ok(())
}

#[tauri::command]
pub async fn get_skill_activations(
    app: tauri::AppHandle,
    workspace_path: Option<String>,
) -> Result<Vec<SkillActivation>, String> {
    let data_paths = resolve_data_paths(&app);
    let skills_root = PathBuf::from(&data_paths.skills);

    let mut all_skills: Vec<(String, String)> = Vec::new();
    collect_installed_skills(&skills_root, &skills_root, &mut all_skills);

    let global_dir = PathBuf::from(&data_paths.kernel_state)
        .join("opencode")
        .join(".agents")
        .join("skills");

    let ws_dir = workspace_path.map(|ws| PathBuf::from(&ws).join(".agents").join("skills"));

    let results = all_skills
        .iter()
        .map(|(skill_id, leaf)| {
            let global = global_dir.join(leaf).is_symlink() || global_dir.join(leaf).exists();
            let workspace = ws_dir
                .as_ref()
                .map_or(false, |d| d.join(leaf).is_symlink() || d.join(leaf).exists());
            SkillActivation {
                skill_id: skill_id.clone(),
                global,
                workspace,
            }
        })
        .collect();

    Ok(results)
}

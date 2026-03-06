use crate::kernel::KernelManager;
use crate::resolve_data_paths;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{timeout, Duration};
use walkdir::WalkDir;

const OPEN_SOURCE_CATALOG: &str =
    include_str!("../resources/marketplace/open-source-catalog.json");

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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SkillActivation {
    pub skill_id: String,
    pub global: bool,
    pub workspace: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SkillPermissions {
    #[serde(default)]
    pub fs: Vec<String>,
    #[serde(default)]
    pub network: Vec<String>,
    pub shell: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillCompat {
    pub aldercowork: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillProvenance {
    pub source: String,
    pub commit: Option<String>,
    pub digest: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SkillTriggers {
    #[serde(default)]
    pub keywords: Vec<String>,
    #[serde(default)]
    pub file_patterns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillEval {
    pub min_pass_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRuntimeManifest {
    pub id: String,
    pub version: String,
    pub publisher: String,
    pub license: String,
    pub entry: String,
    #[serde(default)]
    pub permissions: SkillPermissions,
    pub compat: SkillCompat,
    pub provenance: Option<SkillProvenance>,
    #[serde(default)]
    pub triggers: SkillTriggers,
    pub eval: Option<SkillEval>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillCatalogPackageFile {
    pub path: String,
    pub content: String,
    #[serde(default)]
    pub executable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillCatalogPackage {
    pub format: String,
    pub checksum: String,
    pub signature: Option<String>,
    pub url: Option<String>,
    #[serde(default)]
    pub inline_files: Vec<SkillCatalogPackageFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillCatalogManifest {
    #[serde(flatten)]
    pub runtime: SkillRuntimeManifest,
    pub source: String,
    pub display_name: String,
    pub summary: String,
    pub icon: Option<String>,
    #[serde(default)]
    pub categories: Vec<String>,
    pub homepage: Option<String>,
    pub repository: Option<String>,
    pub published_at: String,
    pub release_notes: Option<String>,
    pub package: SkillCatalogPackage,
    pub min_desktop_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceSkillSummary {
    pub id: String,
    pub version: String,
    pub source: String,
    pub display_name: String,
    pub summary: String,
    pub publisher: String,
    pub categories: Vec<String>,
    pub published_at: String,
    pub icon: Option<String>,
    pub risk: String,
    pub installed_version: Option<String>,
    pub update_available: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceSearchResult {
    pub items: Vec<MarketplaceSkillSummary>,
    pub next_cursor: Option<String>,
    pub source_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillAuditFinding {
    pub code: String,
    pub severity: String,
    pub title: String,
    pub detail: String,
    pub file: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillAuditReport {
    pub report_id: String,
    pub skill_id: String,
    pub version: String,
    pub source: String,
    pub status: String,
    pub severity: String,
    pub install_allowed: bool,
    pub summary: String,
    pub generated_at: String,
    pub checksum_verified: bool,
    pub signature_verified: bool,
    #[serde(default)]
    pub suspicious_files: Vec<String>,
    #[serde(default)]
    pub recommended_actions: Vec<String>,
    #[serde(default)]
    pub tool_calls: Vec<String>,
    #[serde(default)]
    pub findings: Vec<SkillAuditFinding>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillAuditBadge {
    pub severity: String,
    pub status: String,
    pub summary: String,
    pub report_id: String,
    pub generated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillUpdateState {
    pub available: bool,
    pub latest_version: Option<String>,
    pub published_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkillRecord {
    #[serde(flatten)]
    pub manifest: SkillRuntimeManifest,
    pub display_name: String,
    pub summary: String,
    pub source: String,
    pub source_label: String,
    pub installed_at: String,
    pub activation: SkillActivationFlags,
    pub preview: String,
    pub audit: Option<SkillAuditBadge>,
    pub update: SkillUpdateState,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SkillActivationFlags {
    pub global: bool,
    pub workspace: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedSkillRecord {
    #[serde(flatten)]
    pub manifest: SkillRuntimeManifest,
    pub staged_id: String,
    pub source: String,
    pub source_label: String,
    pub display_name: String,
    pub summary: String,
    pub preview: String,
    pub staged_at: String,
    pub audit: Option<SkillAuditReport>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillUpdateRecord {
    pub skill_id: String,
    pub current_version: String,
    pub latest_version: String,
    pub source: String,
    pub published_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceProviderConfig {
    pub source: String,
    pub label: String,
    pub catalog_url: Option<String>,
    pub auth_token: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageSkillPackageRequest {
    pub source: String,
    pub source_label: Option<String>,
    pub archive_path: Option<String>,
    pub git_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StagedSkillMeta {
    staged_id: String,
    source: String,
    source_label: String,
    skill_id: String,
    version: String,
    display_name: String,
    summary: String,
    preview: String,
    staged_at: String,
    checksum_verified: bool,
    signature_verified: bool,
    expected_checksum: Option<String>,
    provider: Option<MarketplaceProviderConfig>,
    activation: Option<SkillActivationFlags>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogEnvelope {
    source_label: Option<String>,
    items: Vec<SkillCatalogManifest>,
}

#[derive(Debug, Clone)]
struct ParsedSkill {
    manifest: SkillRuntimeManifest,
    display_name: String,
    summary: String,
    preview: String,
}

// ---------------------------------------------------------------------------
// Skill name sanitization
// ---------------------------------------------------------------------------

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

    if let Some(last_alpha_pos) = name.rfind(|ch: char| ch.is_ascii_alphabetic() && ch != 'v') {
        let tail = &name[last_alpha_pos + 1..];
        let clean_tail = tail.trim_start_matches('-');
        let clean_tail = clean_tail.strip_prefix('v').unwrap_or(clean_tail);
        if !clean_tail.is_empty() && clean_tail.chars().all(|ch| ch.is_ascii_digit() || ch == '-')
        {
            name = name[..=last_alpha_pos].trim_end_matches('-').to_string();
        }
    }

    if name.is_empty() {
        "imported-skill".to_string()
    } else {
        name
    }
}

fn default_manifest(id: &str) -> SkillRuntimeManifest {
    SkillRuntimeManifest {
        id: id.to_string(),
        version: "0.0.0".into(),
        publisher: "local".into(),
        license: "unknown".into(),
        entry: "instruction".into(),
        permissions: SkillPermissions {
            fs: vec![],
            network: vec![],
            shell: None,
        },
        compat: SkillCompat {
            aldercowork: ">=0.1.0".into(),
        },
        provenance: None,
        triggers: SkillTriggers::default(),
        eval: None,
    }
}

// ---------------------------------------------------------------------------
// Paths and serialization helpers
// ---------------------------------------------------------------------------

fn staging_root(app: &tauri::AppHandle) -> PathBuf {
    PathBuf::from(resolve_data_paths(app).skill_staging)
}

fn audit_root(app: &tauri::AppHandle) -> PathBuf {
    PathBuf::from(resolve_data_paths(app).skill_audit_reports)
}

fn now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    secs.to_string()
}

fn make_stage_id(skill_id: &str, version: &str) -> String {
    format!(
        "{}-{}-{}",
        sanitize_skill_name(skill_id),
        sanitize_skill_name(version),
        std::process::id()
    )
}

fn stage_dir(app: &tauri::AppHandle, staged_id: &str) -> PathBuf {
    staging_root(app).join(staged_id)
}

fn stage_content_dir(app: &tauri::AppHandle, staged_id: &str) -> PathBuf {
    stage_dir(app, staged_id).join("content")
}

fn stage_meta_path(app: &tauri::AppHandle, staged_id: &str) -> PathBuf {
    stage_dir(app, staged_id).join("meta.json")
}

fn stage_audit_path(app: &tauri::AppHandle, staged_id: &str) -> PathBuf {
    stage_dir(app, staged_id).join("audit.json")
}

fn report_path_for(app: &tauri::AppHandle, skill_id: &str, version: &str) -> PathBuf {
    audit_root(app)
        .join(sanitize_skill_name(skill_id))
        .join(format!("{}.json", sanitize_skill_name(version)))
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {e}"))?;
    }
    let payload =
        serde_json::to_vec_pretty(value).map_err(|e| format!("JSON encode failed: {e}"))?;
    let mut file = std::fs::File::create(path).map_err(|e| format!("Write failed: {e}"))?;
    file.write_all(&payload)
        .map_err(|e| format!("Write failed: {e}"))?;
    Ok(())
}

fn read_json_file<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, String> {
    let raw = std::fs::read_to_string(path).map_err(|e| format!("Read failed: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("JSON decode failed: {e}"))
}

// ---------------------------------------------------------------------------
// Discovery and validation
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
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
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
        let has_skill = path.join("SKILL.md").exists() || path.join("skill.yaml").exists();
        if has_skill {
            let rel = path
                .strip_prefix(base)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            out.push((rel, name));
        } else {
            collect_installed_skills(&path, base, out);
        }
    }
}

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
// Package handling
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
            None => continue,
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

fn hoist_single_child_dir(dir: &Path) -> Result<(), String> {
    let entries: Vec<_> = std::fs::read_dir(dir)
        .map_err(|e| format!("Failed to read dir: {e}"))?
        .filter_map(|e| e.ok())
        .collect();

    if entries.len() != 1 || !entries[0].path().is_dir() {
        return Ok(());
    }

    let child_dir = entries[0].path();
    let child_entries = std::fs::read_dir(&child_dir)
        .map_err(|e| format!("Failed to read child dir: {e}"))?;

    for entry in child_entries {
        let entry = entry.map_err(|e| format!("Read entry error: {e}"))?;
        let src_path = entry.path();
        let name = src_path
            .file_name()
            .ok_or_else(|| "Invalid file name".to_string())?;
        let dest_path = dir.join(name);
        std::fs::rename(&src_path, &dest_path)
            .map_err(|e| format!("Failed to move {}: {e}", src_path.display()))?;
    }

    let _ = std::fs::remove_dir(&child_dir);
    Ok(())
}

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

fn write_inline_package(package: &SkillCatalogPackage, dest: &Path) -> Result<bool, String> {
    let mut files = package.inline_files.clone();
    files.sort_by(|a, b| a.path.cmp(&b.path));
    let digest = checksum_inline_files(&files);
    if digest != package.checksum {
        return Err("Marketplace package checksum verification failed".into());
    }
    for file in files {
        let relative = crate::sanitize_relative_path(&file.path)?;
        let out_path = dest.join(relative);
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {e}"))?;
        }
        std::fs::write(&out_path, file.content)
            .map_err(|e| format!("Failed to write inline package file: {e}"))?;
        #[cfg(unix)]
        if file.executable {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&out_path, std::fs::Permissions::from_mode(0o755));
        }
    }
    Ok(true)
}

fn checksum_inline_files(files: &[SkillCatalogPackageFile]) -> String {
    let mut hasher = Sha256::new();
    for file in files {
        hasher.update(file.path.as_bytes());
        hasher.update([0]);
        hasher.update(file.content.as_bytes());
        hasher.update([0]);
        hasher.update([if file.executable { 1 } else { 0 }]);
    }
    format!("{:x}", hasher.finalize())
}

async fn fetch_with_auth(
    url: &str,
    token: &Option<String>,
) -> Result<reqwest::Response, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP client init failed: {e}"))?;
    let mut request = client.get(url);
    if let Some(token) = token {
        if !token.trim().is_empty() {
            request = request.bearer_auth(token);
        }
    }
    request
        .send()
        .await
        .map_err(|e| format!("Marketplace request failed: {e}"))
}

async fn materialize_catalog_package(
    package: &SkillCatalogPackage,
    dest: &Path,
    auth_token: &Option<String>,
) -> Result<(bool, bool), String> {
    if package.format == "inline" {
        let checksum_verified = write_inline_package(package, dest)?;
        return Ok((checksum_verified, package.signature.is_some()));
    }

    let url = package
        .url
        .clone()
        .ok_or_else(|| "Marketplace package URL is missing".to_string())?;
    let response = fetch_with_auth(&url, auth_token).await?;
    if !response.status().is_success() {
        return Err(format!("Marketplace package download failed: {}", response.status()));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read marketplace package: {e}"))?;
    let digest = format!("{:x}", Sha256::digest(&bytes));
    if digest != package.checksum {
        return Err("Marketplace package checksum verification failed".into());
    }
    let archive_ext = if package.format == "tar.gz" { "tar.gz" } else { "zip" };
    let archive_path = dest.join(format!("download.{archive_ext}"));
    std::fs::write(&archive_path, &bytes)
        .map_err(|e| format!("Failed to persist package download: {e}"))?;

    if package.format == "tar.gz" {
        extract_tar(&archive_path, dest)?;
    } else {
        extract_zip(&archive_path, dest)?;
    }
    let _ = std::fs::remove_file(&archive_path);
    Ok((true, package.signature.is_some()))
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    for entry in WalkDir::new(src) {
        let entry = entry.map_err(|e| format!("Walk error: {e}"))?;
        let path = entry.path();
        let relative = path
            .strip_prefix(src)
            .map_err(|e| format!("Strip prefix failed: {e}"))?;
        let target = dest.join(relative);
        if entry.file_type().is_dir() {
            std::fs::create_dir_all(&target)
                .map_err(|e| format!("Failed to create dir: {e}"))?;
            continue;
        }
        if entry.file_type().is_symlink() {
            return Err(format!("Symlink is not allowed in skill package: {}", path.display()));
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {e}"))?;
        }
        std::fs::copy(path, &target).map_err(|e| format!("Failed to copy file: {e}"))?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

fn parse_frontmatter(raw: &str) -> (Option<String>, Option<String>, String) {
    let lines: Vec<&str> = raw.lines().collect();
    if lines.first().map(|s| s.trim()) != Some("---") {
        return (None, None, raw.trim().to_string());
    }
    let Some(end_index) = lines
        .iter()
        .enumerate()
        .skip(1)
        .find_map(|(idx, line)| if line.trim() == "---" { Some(idx) } else { None })
    else {
        return (None, None, raw.trim().to_string());
    };

    let frontmatter = &lines[1..end_index];
    let body = lines[end_index + 1..].join("\n").trim().to_string();
    let mut name = None;
    let mut description = None;

    for line in frontmatter {
        if let Some(value) = line.strip_prefix("name:") {
            name = Some(value.trim().trim_matches('"').trim_matches('\'').to_string());
        }
        if let Some(value) = line.strip_prefix("description:") {
            description = Some(value.trim().trim_matches('"').trim_matches('\'').to_string());
        }
    }

    (name, description, body)
}

fn parse_skill_dir(skill_root: &Path, fallback_id: &str) -> Result<ParsedSkill, String> {
    let mut manifest = default_manifest(fallback_id);
    let mut display_name = fallback_id.to_string();
    let mut summary = String::new();
    let mut preview = String::new();

    let yaml_path = skill_root.join("skill.yaml");
    if yaml_path.exists() {
        let raw =
            std::fs::read_to_string(&yaml_path).map_err(|e| format!("Read error: {e}"))?;
        let parsed = serde_yaml::from_str::<SkillRuntimeManifest>(&raw)
            .map_err(|e| format!("Invalid skill.yaml: {e}"))?;
        manifest = parsed;
    }

    let markdown_path = skill_root.join("SKILL.md");
    if markdown_path.exists() {
        let raw =
            std::fs::read_to_string(&markdown_path).map_err(|e| format!("Read error: {e}"))?;
        let (name, description, body) = parse_frontmatter(&raw);
        if let Some(name) = name {
            display_name = name;
        }
        if let Some(description) = description {
            summary = description;
        }
        preview = body.chars().take(3000).collect();
        if summary.is_empty() {
            summary = preview.lines().next().unwrap_or_default().trim().to_string();
        }
    }

    if manifest.id.is_empty() {
        manifest.id = fallback_id.to_string();
    }
    if display_name.is_empty() {
        display_name = manifest.id.clone();
    }

    Ok(ParsedSkill {
        manifest,
        display_name,
        summary,
        preview,
    })
}

// ---------------------------------------------------------------------------
// Marketplace loading
// ---------------------------------------------------------------------------

async fn load_catalog(
    provider: &MarketplaceProviderConfig,
) -> Result<(String, Vec<SkillCatalogManifest>), String> {
    let source_label = provider.label.clone();
    let raw = if provider.source == "open-source" && provider.catalog_url.as_deref().unwrap_or("").is_empty() {
        OPEN_SOURCE_CATALOG.to_string()
    } else {
        let url = provider
            .catalog_url
            .clone()
            .ok_or_else(|| "Marketplace catalog URL is missing".to_string())?;
        let response = fetch_with_auth(&url, &provider.auth_token).await?;
        if !response.status().is_success() {
            return Err(format!("Marketplace catalog request failed: {}", response.status()));
        }
        response
            .text()
            .await
            .map_err(|e| format!("Failed to read marketplace catalog: {e}"))?
    };

    if let Ok(envelope) = serde_json::from_str::<CatalogEnvelope>(&raw) {
        let label = envelope.source_label.unwrap_or(source_label);
        return Ok((label, envelope.items));
    }

    let items = serde_json::from_str::<Vec<SkillCatalogManifest>>(&raw)
        .map_err(|e| format!("Invalid marketplace catalog: {e}"))?;
    Ok((source_label, items))
}

fn version_is_newer(next: &str, current: &str) -> bool {
    match (semver::Version::parse(next), semver::Version::parse(current)) {
        (Ok(next), Ok(current)) => next > current,
        _ => next > current,
    }
}

fn summarize_catalog_risk(item: &SkillCatalogManifest) -> String {
    if item.runtime.permissions.shell.as_deref() == Some("full") {
        return "high".into();
    }
    if item.runtime.permissions.fs.iter().any(|p| p == "write")
        || item.runtime.permissions.shell.as_deref() == Some("restricted")
    {
        return "medium".into();
    }
    if !item.runtime.permissions.network.is_empty() {
        return "info".into();
    }
    "low".into()
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

fn push_finding(
    findings: &mut Vec<SkillAuditFinding>,
    code: &str,
    severity: &str,
    title: &str,
    detail: String,
    file: Option<String>,
) {
    findings.push(SkillAuditFinding {
        code: code.to_string(),
        severity: severity.to_string(),
        title: title.to_string(),
        detail,
        file,
    });
}

fn severity_rank(severity: &str) -> usize {
    match severity {
        "critical" => 4,
        "high" => 3,
        "medium" => 2,
        "low" => 1,
        _ => 0,
    }
}

fn max_severity(findings: &[SkillAuditFinding]) -> String {
    findings
        .iter()
        .max_by_key(|finding| severity_rank(&finding.severity))
        .map(|finding| finding.severity.clone())
        .unwrap_or_else(|| "low".into())
}

fn extract_tool_calls(markdown: &str) -> Vec<String> {
    let mut tool_calls = vec![];
    for line in markdown.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("- ") {
            if rest.contains('@') {
                tool_calls.push(rest.to_string());
            }
        }
    }
    tool_calls.truncate(6);
    tool_calls
}

fn audit_skill_content(
    skill_root: &Path,
    meta: &StagedSkillMeta,
    parsed: &ParsedSkill,
) -> Result<SkillAuditReport, String> {
    let mut findings = vec![];
    let mut suspicious_files = vec![];

    if !skill_root.join("SKILL.md").exists() {
        push_finding(
            &mut findings,
            "missing-skill-md",
            "critical",
            "缺少 SKILL.md",
            "技能包缺少人工可读的 SKILL.md，已拒绝安装。".into(),
            None,
        );
    }
    if !skill_root.join("skill.yaml").exists() {
        push_finding(
            &mut findings,
            "missing-skill-yaml",
            "medium",
            "缺少 skill.yaml",
            "技能包没有 machine-readable manifest，后续治理能力会受限。".into(),
            None,
        );
    }

    if parsed.manifest.permissions.shell.as_deref() == Some("full") {
        push_finding(
            &mut findings,
            "shell-full",
            "high",
            "声明完整 Shell 权限",
            "该技能声明了 shell: full，意味着执行阶段可能运行任意本地命令。".into(),
            Some("skill.yaml".into()),
        );
    }
    if parsed.manifest.permissions.shell.as_deref() == Some("restricted") {
        push_finding(
            &mut findings,
            "shell-restricted",
            "medium",
            "声明受限 Shell 权限",
            "该技能需要命令执行能力，建议在受控工作区内使用。".into(),
            Some("skill.yaml".into()),
        );
    }
    if parsed.manifest.permissions.fs.iter().any(|p| p == "write") {
        push_finding(
            &mut findings,
            "fs-write",
            "medium",
            "声明文件写权限",
            "该技能可修改工作区文件，安装前应确认来源可信。".into(),
            Some("skill.yaml".into()),
        );
    }
    if !parsed.manifest.permissions.network.is_empty() {
        push_finding(
            &mut findings,
            "network",
            "info",
            "声明外部网络访问",
            format!(
                "该技能会访问以下网络目标：{}",
                parsed.manifest.permissions.network.join(", ")
            ),
            Some("skill.yaml".into()),
        );
    }

    for entry in WalkDir::new(skill_root) {
        let entry = entry.map_err(|e| format!("Walk error: {e}"))?;
        let path = entry.path();
        let relative = path
            .strip_prefix(skill_root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");

        if entry.file_type().is_symlink() {
            push_finding(
                &mut findings,
                "symlink",
                "critical",
                "发现符号链接",
                "技能包包含 symlink，存在越权访问风险。".into(),
                Some(relative),
            );
            continue;
        }

        if entry.file_type().is_file() {
            let metadata = entry.metadata().map_err(|e| format!("Metadata error: {e}"))?;
            if metadata.len() > 512 * 1024 {
                suspicious_files.push(relative.clone());
                push_finding(
                    &mut findings,
                    "large-file",
                    "medium",
                    "发现超大文件",
                    format!("文件 {} 超过 512KB，需要人工确认其用途。", relative),
                    Some(relative.clone()),
                );
            }

            if relative.ends_with(".sh")
                || relative.ends_with(".command")
                || relative.ends_with(".exe")
                || relative.ends_with(".bat")
            {
                suspicious_files.push(relative.clone());
                push_finding(
                    &mut findings,
                    "executable-file",
                    "high",
                    "包含可执行脚本/程序",
                    format!("检测到可执行文件 {}，请确认其执行边界。", relative),
                    Some(relative.clone()),
                );
            }

            if metadata.len() <= 128 * 1024 {
                let raw = std::fs::read(path).map_err(|e| format!("Read error: {e}"))?;
                if let Ok(content) = String::from_utf8(raw) {
                    let lower = content.to_lowercase();
                    if lower.contains("curl | sh")
                        || lower.contains("rm -rf")
                        || lower.contains("sudo ")
                        || lower.contains("invoke('shell")
                    {
                        suspicious_files.push(relative.clone());
                        push_finding(
                            &mut findings,
                            "dangerous-pattern",
                            "high",
                            "检测到危险命令模式",
                            format!("文件 {} 含有高风险命令模式，需要人工复核。", relative),
                            Some(relative.clone()),
                        );
                    }
                }
            }
        }
    }

    let severity = max_severity(&findings);
    let install_allowed = !matches!(severity.as_str(), "critical" | "high");
    let status = if install_allowed { "passed" } else { "blocked" };
    let summary = match severity.as_str() {
        "critical" => "审计阻断：技能包存在结构性高危风险，禁止安装。",
        "high" => "审计阻断：技能包含高危能力或可执行内容，默认禁止安装。",
        "medium" => "审计通过但需谨慎：技能具备写入或受限命令能力。",
        "info" => "审计通过：技能包含外部网络访问，请关注数据外发边界。",
        _ => "审计通过：技能仅声明低风险或只读能力。",
    }
    .to_string();

    let mut recommended_actions = vec!["安装前阅读 SKILL.md 与 skill.yaml，确认触发范围。".into()];
    if parsed.manifest.permissions.fs.iter().any(|p| p == "write") {
        recommended_actions.push("仅在可回滚的工作区中激活该技能。".into());
    }
    if parsed.manifest.permissions.shell.is_some() {
        recommended_actions.push("避免在含敏感凭据的环境中执行该技能。".into());
    }
    if !parsed.manifest.permissions.network.is_empty() {
        recommended_actions.push("确认网络目标符合组织外发策略。".into());
    }
    if !install_allowed {
        recommended_actions.push("若确需使用，请先人工审阅全部脚本与命令模板。".into());
    }

    Ok(SkillAuditReport {
        report_id: format!("{}-{}", meta.skill_id, meta.version),
        skill_id: meta.skill_id.clone(),
        version: meta.version.clone(),
        source: meta.source.clone(),
        status: status.into(),
        severity,
        install_allowed,
        summary,
        generated_at: now_iso(),
        checksum_verified: meta.checksum_verified,
        signature_verified: meta.signature_verified,
        suspicious_files,
        recommended_actions,
        tool_calls: extract_tool_calls(&parsed.preview),
        findings,
    })
}

// ---------------------------------------------------------------------------
// Installed-state helpers
// ---------------------------------------------------------------------------

fn activation_flags_for(
    data_paths: &crate::DataPaths,
    skill_id: &str,
    workspace_path: &Option<String>,
) -> SkillActivationFlags {
    let leaf = skill_leaf_name(skill_id);
    let global_dir = PathBuf::from(&data_paths.kernel_state)
        .join("opencode")
        .join(".agents")
        .join("skills");
    let ws_dir = workspace_path
        .as_ref()
        .map(|ws| PathBuf::from(ws).join(".agents").join("skills"));
    SkillActivationFlags {
        global: global_dir.join(leaf).exists(),
        workspace: ws_dir
            .as_ref()
            .map_or(false, |dir| dir.join(leaf).exists()),
    }
}

fn load_audit_badge(app: &tauri::AppHandle, skill_id: &str, version: &str) -> Option<SkillAuditBadge> {
    let path = report_path_for(app, skill_id, version);
    let report = read_json_file::<SkillAuditReport>(&path).ok()?;
    Some(SkillAuditBadge {
        severity: report.severity,
        status: report.status,
        summary: report.summary,
        report_id: report.report_id,
        generated_at: report.generated_at,
    })
}

fn installed_record_from_dir(
    app: &tauri::AppHandle,
    skill_dir: &Path,
    skill_id: &str,
    source_label: &str,
    workspace_path: &Option<String>,
) -> Result<InstalledSkillRecord, String> {
    let parsed = parse_skill_dir(skill_dir, skill_id)?;
    let data_paths = resolve_data_paths(app);
    let activation = activation_flags_for(&data_paths, &parsed.manifest.id, workspace_path);
    let audit = load_audit_badge(app, &parsed.manifest.id, &parsed.manifest.version);
    let installed_at = std::fs::metadata(skill_dir)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|t| t.elapsed().ok().map(|_| now_iso()))
        .unwrap_or_else(now_iso);

    Ok(InstalledSkillRecord {
        manifest: parsed.manifest.clone(),
        display_name: parsed.display_name,
        summary: parsed.summary,
        source: parsed
            .manifest
            .provenance
            .as_ref()
            .map(|value| value.source.clone())
            .unwrap_or_else(|| "local-archive".into()),
        source_label: source_label.to_string(),
        installed_at,
        activation,
        preview: parsed.preview,
        audit,
        update: SkillUpdateState {
            available: false,
            latest_version: None,
            published_at: None,
        },
    })
}

fn load_staged_meta(app: &tauri::AppHandle, staged_id: &str) -> Result<StagedSkillMeta, String> {
    read_json_file(&stage_meta_path(app, staged_id))
}

fn staged_record_from_meta(app: &tauri::AppHandle, meta: &StagedSkillMeta) -> Result<StagedSkillRecord, String> {
    let parsed = parse_skill_dir(&stage_content_dir(app, &meta.staged_id), &meta.skill_id)?;
    let audit = read_json_file::<SkillAuditReport>(&stage_audit_path(app, &meta.staged_id)).ok();
    Ok(StagedSkillRecord {
        manifest: parsed.manifest,
        staged_id: meta.staged_id.clone(),
        source: meta.source.clone(),
        source_label: meta.source_label.clone(),
        display_name: meta.display_name.clone(),
        summary: meta.summary.clone(),
        preview: meta.preview.clone(),
        staged_at: meta.staged_at.clone(),
        audit,
    })
}

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

async fn stage_marketplace_skill(
    app: &tauri::AppHandle,
    provider: MarketplaceProviderConfig,
    skill_id: String,
    version: Option<String>,
    activation: Option<SkillActivationFlags>,
) -> Result<StagedSkillRecord, String> {
    let (source_label, items) = load_catalog(&provider).await?;
    let item = items
        .into_iter()
        .find(|item| {
            item.runtime.id == skill_id
                && version
                    .as_ref()
                    .map_or(true, |version| item.runtime.version == *version)
        })
        .ok_or_else(|| "Marketplace skill not found".to_string())?;

    let staged_id = make_stage_id(&item.runtime.id, &item.runtime.version);
    let content_dir = stage_content_dir(app, &staged_id);
    if content_dir.exists() {
        std::fs::remove_dir_all(stage_dir(app, &staged_id))
            .map_err(|e| format!("Failed to clean stage: {e}"))?;
    }
    std::fs::create_dir_all(&content_dir).map_err(|e| format!("Failed to create stage: {e}"))?;

    let (checksum_verified, signature_verified) =
        materialize_catalog_package(&item.package, &content_dir, &provider.auth_token).await?;
    let _ = hoist_single_child_dir(&content_dir);
    let parsed = parse_skill_dir(&content_dir, &item.runtime.id)?;
    let meta = StagedSkillMeta {
        staged_id: staged_id.clone(),
        source: provider.source.clone(),
        source_label,
        skill_id: parsed.manifest.id.clone(),
        version: parsed.manifest.version.clone(),
        display_name: item.display_name,
        summary: item.summary,
        preview: parsed.preview.clone(),
        staged_at: now_iso(),
        checksum_verified,
        signature_verified,
        expected_checksum: Some(item.package.checksum),
        provider: Some(provider),
        activation,
    };
    write_json_file(&stage_meta_path(app, &staged_id), &meta)?;
    staged_record_from_meta(app, &meta)
}

async fn activate_skill_impl(
    app: &tauri::AppHandle,
    state: &Arc<Mutex<KernelManager>>,
    skill_id: &str,
    scope: &str,
    workspace_path: &Option<String>,
) -> Result<(), String> {
    let data_paths = resolve_data_paths(app);
    validate_skill_id(skill_id)?;

    let skills_root = PathBuf::from(&data_paths.skills);
    let source = skills_root.join(skill_id);
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

    let leaf = skill_leaf_name(skill_id);
    let link_path = match scope {
        "global" => {
            let dir = PathBuf::from(&data_paths.kernel_state)
                .join("opencode")
                .join(".agents")
                .join("skills");
            let _ = std::fs::create_dir_all(&dir);
            dir.join(leaf)
        }
        "workspace" => {
            let ws = workspace_path
                .clone()
                .ok_or("workspace_path required for workspace scope")?;
            let dir = PathBuf::from(ws).join(".agents").join("skills");
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

    notify_kernel_dispose(state).await;
    Ok(())
}

async fn deactivate_skill_impl(
    app: &tauri::AppHandle,
    state: &Arc<Mutex<KernelManager>>,
    skill_id: &str,
    scope: &str,
    workspace_path: &Option<String>,
) -> Result<(), String> {
    let data_paths = resolve_data_paths(app);
    let leaf = skill_leaf_name(skill_id);

    let link_path = match scope {
        "global" => PathBuf::from(&data_paths.kernel_state)
            .join("opencode")
            .join(".agents")
            .join("skills")
            .join(leaf),
        "workspace" => {
            let ws = workspace_path
                .clone()
                .ok_or("workspace_path required for workspace scope")?;
            PathBuf::from(ws).join(".agents").join("skills").join(leaf)
        }
        _ => return Err(format!("Invalid scope: {scope}")),
    };

    if link_path.is_symlink() {
        std::fs::remove_file(&link_path)
            .map_err(|e| format!("Failed to remove symlink: {e}"))?;
    } else if link_path.exists() {
        std::fs::remove_dir_all(&link_path).map_err(|e| format!("Failed to remove: {e}"))?;
    }

    notify_kernel_dispose(state).await;
    Ok(())
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

#[tauri::command]
pub async fn search_marketplace_skills(
    app: tauri::AppHandle,
    provider: MarketplaceProviderConfig,
    query: Option<String>,
) -> Result<MarketplaceSearchResult, String> {
    let (source_label, items) = load_catalog(&provider).await?;
    let installed = list_installed_skills_with_state(app.clone(), None).await?;
    let installed_map = installed
        .into_iter()
        .map(|item| (item.manifest.id.clone(), item.manifest.version.clone()))
        .collect::<HashMap<_, _>>();
    let normalized_query = query.unwrap_or_default().trim().to_lowercase();

    let mut results = items
        .into_iter()
        .filter(|item| {
            normalized_query.is_empty()
                || item.runtime.id.to_lowercase().contains(&normalized_query)
                || item.display_name.to_lowercase().contains(&normalized_query)
                || item.summary.to_lowercase().contains(&normalized_query)
                || item
                    .categories
                    .iter()
                    .any(|category| category.to_lowercase().contains(&normalized_query))
        })
        .map(|item| {
            let installed_version = installed_map.get(&item.runtime.id).cloned();
            let update_available = installed_version
                .as_ref()
                .map(|current| version_is_newer(&item.runtime.version, current))
                .unwrap_or(false);
            let risk = summarize_catalog_risk(&item);
            MarketplaceSkillSummary {
                id: item.runtime.id.clone(),
                version: item.runtime.version.clone(),
                source: provider.source.clone(),
                display_name: item.display_name.clone(),
                summary: item.summary.clone(),
                publisher: item.runtime.publisher.clone(),
                categories: item.categories.clone(),
                published_at: item.published_at.clone(),
                icon: item.icon.clone(),
                risk,
                installed_version,
                update_available,
            }
        })
        .collect::<Vec<_>>();

    results.sort_by(|a, b| a.display_name.cmp(&b.display_name));

    Ok(MarketplaceSearchResult {
        items: results,
        next_cursor: None,
        source_label,
    })
}

#[tauri::command]
pub async fn get_marketplace_skill(
    provider: MarketplaceProviderConfig,
    skill_id: String,
    version: Option<String>,
) -> Result<SkillCatalogManifest, String> {
    let (_, items) = load_catalog(&provider).await?;
    items
        .into_iter()
        .find(|item| {
            item.runtime.id == skill_id
                && version
                    .as_ref()
                    .map_or(true, |version| item.runtime.version == *version)
        })
        .ok_or_else(|| "Marketplace skill not found".to_string())
}

#[tauri::command]
pub async fn download_marketplace_skill(
    app: tauri::AppHandle,
    provider: MarketplaceProviderConfig,
    skill_id: String,
    version: Option<String>,
) -> Result<StagedSkillRecord, String> {
    stage_marketplace_skill(&app, provider, skill_id, version, None).await
}

#[tauri::command]
pub async fn stage_skill_package(
    app: tauri::AppHandle,
    request: StageSkillPackageRequest,
) -> Result<StagedSkillRecord, String> {
    let staged_id = make_stage_id(
        request.source_label.as_deref().unwrap_or(&request.source),
        "staged",
    );
    let base_dir = stage_dir(&app, &staged_id);
    let content_dir = stage_content_dir(&app, &staged_id);
    if base_dir.exists() {
        std::fs::remove_dir_all(&base_dir).map_err(|e| format!("Failed to clean stage: {e}"))?;
    }
    std::fs::create_dir_all(&content_dir).map_err(|e| format!("Failed to create stage: {e}"))?;

    let archive_path_for_stage = request.archive_path.clone();
    let git_url_for_stage = request.git_url.clone();

    match request.source.as_str() {
        "local-archive" => {
            let archive_path = archive_path_for_stage
                .ok_or_else(|| "archivePath is required".to_string())?;
            let src = PathBuf::from(&archive_path);
            if !src.exists() {
                return Err("Archive file not found".into());
            }
            let lower = archive_path.to_lowercase();
            if lower.ends_with(".zip") {
                extract_zip(&src, &content_dir)?;
            } else if lower.ends_with(".tar.gz") || lower.ends_with(".tgz") || lower.ends_with(".tar")
            {
                extract_tar(&src, &content_dir)?;
            } else {
                return Err("Unsupported archive format".into());
            }
        }
        "git" => {
            let git_url = git_url_for_stage
                .ok_or_else(|| "gitUrl is required".to_string())?;
            let (clone_url, subdir_info) = parse_git_url(&git_url);
            if let Some((branch, subpath)) = subdir_info {
                import_git_sparse(&clone_url, &branch, &subpath, &content_dir).await?;
            } else {
                import_git_shallow(&clone_url, &content_dir).await?;
            }
            let git_dir = content_dir.join(".git");
            if git_dir.exists() {
                let _ = std::fs::remove_dir_all(&git_dir);
            }
        }
        _ => return Err("Unsupported staging source".into()),
    }

    let _ = hoist_single_child_dir(&content_dir);
    let fallback_id = request
        .archive_path
        .as_ref()
        .and_then(|path| {
            Path::new(path)
                .file_stem()
                .and_then(|value| value.to_str())
                .map(sanitize_skill_name)
        })
        .or_else(|| {
            request
                .git_url
                .as_ref()
                .and_then(|url| url.trim_end_matches('/').rsplit('/').next().map(sanitize_skill_name))
        })
        .unwrap_or_else(|| staged_id.clone());
    let parsed = parse_skill_dir(&content_dir, &fallback_id)?;
    let meta = StagedSkillMeta {
        staged_id: staged_id.clone(),
        source: request.source,
        source_label: request
            .source_label
            .unwrap_or_else(|| "Manual Import".into()),
        skill_id: parsed.manifest.id.clone(),
        version: parsed.manifest.version.clone(),
        display_name: parsed.display_name.clone(),
        summary: parsed.summary.clone(),
        preview: parsed.preview.clone(),
        staged_at: now_iso(),
        checksum_verified: false,
        signature_verified: false,
        expected_checksum: None,
        provider: None,
        activation: None,
    };
    write_json_file(&stage_meta_path(&app, &staged_id), &meta)?;
    staged_record_from_meta(&app, &meta)
}

#[tauri::command]
pub async fn audit_staged_skill(
    app: tauri::AppHandle,
    staged_id: String,
) -> Result<SkillAuditReport, String> {
    let meta = load_staged_meta(&app, &staged_id)?;
    let parsed = parse_skill_dir(&stage_content_dir(&app, &staged_id), &meta.skill_id)?;
    let report = audit_skill_content(&stage_content_dir(&app, &staged_id), &meta, &parsed)?;
    write_json_file(&stage_audit_path(&app, &staged_id), &report)?;
    Ok(report)
}

#[tauri::command]
pub async fn get_skill_audit_report(
    app: tauri::AppHandle,
    report_id: Option<String>,
    skill_id: Option<String>,
    version: Option<String>,
    staged_id: Option<String>,
) -> Result<SkillAuditReport, String> {
    if let Some(staged_id) = staged_id {
        return read_json_file(&stage_audit_path(&app, &staged_id));
    }

    let skill_id = if let Some(report_id) = report_id {
        report_id
            .split('-')
            .next()
            .map(|value| value.to_string())
            .or(skill_id)
            .ok_or_else(|| "skillId is required".to_string())?
    } else {
        skill_id.ok_or_else(|| "skillId is required".to_string())?
    };

    let version = version.ok_or_else(|| "version is required".to_string())?;
    read_json_file(&report_path_for(&app, &skill_id, &version))
}

#[tauri::command]
pub async fn approve_staged_skill_install(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<KernelManager>>>,
    staged_id: String,
    workspace_path: Option<String>,
) -> Result<InstalledSkillRecord, String> {
    let meta = load_staged_meta(&app, &staged_id)?;
    let parsed = parse_skill_dir(&stage_content_dir(&app, &staged_id), &meta.skill_id)?;
    let report: SkillAuditReport = read_json_file(&stage_audit_path(&app, &staged_id))
        .map_err(|_| "Skill must be audited before installation".to_string())?;
    if !report.install_allowed {
        return Err("Skill installation is blocked by audit".into());
    }

    let data_paths = resolve_data_paths(&app);
    let skills_root = PathBuf::from(&data_paths.skills);
    let target = skills_root.join(&parsed.manifest.id);
    if target.exists() {
        std::fs::remove_dir_all(&target).map_err(|e| format!("Failed to replace skill: {e}"))?;
    }
    std::fs::create_dir_all(&target).map_err(|e| format!("Failed to create skill dir: {e}"))?;
    copy_dir_recursive(&stage_content_dir(&app, &staged_id), &target)?;

    write_json_file(
        &report_path_for(&app, &parsed.manifest.id, &parsed.manifest.version),
        &report,
    )?;

    if let Some(activation) = meta.activation {
        if activation.global {
            activate_skill_impl(&app, state.inner(), &parsed.manifest.id, "global", &workspace_path)
                .await?;
        }
        if activation.workspace {
            activate_skill_impl(
                &app,
                state.inner(),
                &parsed.manifest.id,
                "workspace",
                &workspace_path,
            )
            .await?;
        }
    }

    dismiss_staged_skill(app.clone(), staged_id).await?;
    installed_record_from_dir(&app, &target, &parsed.manifest.id, &meta.source_label, &workspace_path)
}

#[tauri::command]
pub async fn dismiss_staged_skill(app: tauri::AppHandle, staged_id: String) -> Result<(), String> {
    let dir = stage_dir(&app, &staged_id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("Failed to remove stage: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn list_installed_skills_with_state(
    app: tauri::AppHandle,
    workspace_path: Option<String>,
) -> Result<Vec<InstalledSkillRecord>, String> {
    let paths = resolve_data_paths(&app);
    let skills_root = PathBuf::from(&paths.skills);
    if !skills_root.exists() {
        return Ok(vec![]);
    }

    let mut all = vec![];
    let mut entries: Vec<(String, String)> = vec![];
    collect_installed_skills(&skills_root, &skills_root, &mut entries);
    for (skill_id, _) in entries {
        let dir = skills_root.join(&skill_id);
        if let Ok(record) = installed_record_from_dir(&app, &dir, &skill_id, "Installed", &workspace_path) {
            all.push(record);
        }
    }
    all.sort_by(|a, b| a.display_name.cmp(&b.display_name));
    Ok(all)
}

#[tauri::command]
pub async fn check_skill_updates(
    app: tauri::AppHandle,
    provider: MarketplaceProviderConfig,
    workspace_path: Option<String>,
) -> Result<Vec<SkillUpdateRecord>, String> {
    let (_, items) = load_catalog(&provider).await?;
    let catalog = items
        .into_iter()
        .map(|item| (item.runtime.id.clone(), item))
        .collect::<BTreeMap<_, _>>();
    let installed = list_installed_skills_with_state(app, workspace_path).await?;

    let mut updates = vec![];
    for skill in installed {
        if let Some(item) = catalog.get(&skill.manifest.id) {
            if version_is_newer(&item.runtime.version, &skill.manifest.version) {
                updates.push(SkillUpdateRecord {
                    skill_id: skill.manifest.id,
                    current_version: skill.manifest.version,
                    latest_version: item.runtime.version.clone(),
                    source: provider.source.clone(),
                    published_at: item.published_at.clone(),
                });
            }
        }
    }
    Ok(updates)
}

#[tauri::command]
pub async fn update_skill(
    app: tauri::AppHandle,
    provider: MarketplaceProviderConfig,
    skill_id: String,
    workspace_path: Option<String>,
) -> Result<StagedSkillRecord, String> {
    let installed = list_installed_skills_with_state(app.clone(), workspace_path.clone()).await?;
    let current = installed
        .into_iter()
        .find(|item| item.manifest.id == skill_id)
        .ok_or_else(|| "Installed skill not found".to_string())?;
    let activation = Some(current.activation.clone());
    stage_marketplace_skill(&app, provider, current.manifest.id, None, activation).await
}

#[tauri::command]
pub async fn import_skill_archive(
    app: tauri::AppHandle,
    archive_path: String,
) -> Result<String, String> {
    let staged = stage_skill_package(
        app.clone(),
        StageSkillPackageRequest {
            source: "local-archive".into(),
            source_label: Some("Archive".into()),
            archive_path: Some(archive_path),
            git_url: None,
        },
    )
    .await?;
    Ok(staged.manifest.id)
}

#[tauri::command]
pub async fn import_skill_git(
    app: tauri::AppHandle,
    repo_url: String,
) -> Result<String, String> {
    let staged = stage_skill_package(
        app.clone(),
        StageSkillPackageRequest {
            source: "git".into(),
            source_label: Some("Git".into()),
            archive_path: None,
            git_url: Some(repo_url),
        },
    )
    .await?;
    Ok(staged.manifest.id)
}

#[tauri::command]
pub async fn activate_skill(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<KernelManager>>>,
    skill_id: String,
    scope: String,
    workspace_path: Option<String>,
) -> Result<(), String> {
    activate_skill_impl(&app, state.inner(), &skill_id, &scope, &workspace_path).await
}

#[tauri::command]
pub async fn deactivate_skill(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<KernelManager>>>,
    skill_id: String,
    scope: String,
    workspace_path: Option<String>,
) -> Result<(), String> {
    deactivate_skill_impl(&app, state.inner(), &skill_id, &scope, &workspace_path).await
}

#[tauri::command]
pub async fn get_skill_activations(
    app: tauri::AppHandle,
    workspace_path: Option<String>,
) -> Result<Vec<SkillActivation>, String> {
    let data_paths = resolve_data_paths(&app);
    let skills_root = PathBuf::from(&data_paths.skills);
    let mut all_skills = vec![];
    collect_installed_skills(&skills_root, &skills_root, &mut all_skills);

    let global_dir = PathBuf::from(&data_paths.kernel_state)
        .join("opencode")
        .join(".agents")
        .join("skills");
    let ws_dir = workspace_path.map(|ws| PathBuf::from(ws).join(".agents").join("skills"));

    Ok(all_skills
        .iter()
        .map(|(skill_id, leaf)| SkillActivation {
            skill_id: skill_id.clone(),
            global: global_dir.join(leaf).exists(),
            workspace: ws_dir
                .as_ref()
                .map_or(false, |dir| dir.join(leaf).exists()),
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seeded_catalog() -> Vec<SkillCatalogManifest> {
        serde_json::from_str::<CatalogEnvelope>(OPEN_SOURCE_CATALOG)
            .expect("catalog should parse")
            .items
    }

    #[test]
    fn embedded_catalog_checksums_match_inline_packages() {
        for item in seeded_catalog() {
            let digest = checksum_inline_files(&item.package.inline_files);
            assert_eq!(digest, item.package.checksum, "checksum mismatch for {}", item.runtime.id);
        }
    }

    #[test]
    fn semver_update_detection_prefers_newer_versions() {
        assert!(version_is_newer("1.2.0", "1.1.9"));
        assert!(!version_is_newer("1.2.0", "1.2.0"));
        assert!(!version_is_newer("0.9.0", "1.0.0"));
    }

    #[test]
    fn high_risk_seed_is_blocked_by_audit() {
        let cleaner = seeded_catalog()
            .into_iter()
            .find(|item| item.runtime.id == "workspace-cleaner")
            .expect("seed skill should exist");
        let temp_root = std::env::temp_dir().join(format!("aldercowork-skill-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp_root);
        std::fs::create_dir_all(&temp_root).expect("temp dir");
        write_inline_package(&cleaner.package, &temp_root).expect("inline package should materialize");

        let parsed = parse_skill_dir(&temp_root, &cleaner.runtime.id).expect("skill should parse");
        let meta = StagedSkillMeta {
            staged_id: "test".into(),
            source: "open-source".into(),
            source_label: "Open Skill Market".into(),
            skill_id: parsed.manifest.id.clone(),
            version: parsed.manifest.version.clone(),
            display_name: cleaner.display_name,
            summary: cleaner.summary,
            preview: parsed.preview.clone(),
            staged_at: now_iso(),
            checksum_verified: true,
            signature_verified: false,
            expected_checksum: Some(cleaner.package.checksum),
            provider: None,
            activation: None,
        };
        let report = audit_skill_content(&temp_root, &meta, &parsed).expect("audit should succeed");
        assert_eq!(report.status, "blocked");
        assert!(!report.install_allowed);
        assert!(matches!(report.severity.as_str(), "high" | "critical"));

        let _ = std::fs::remove_dir_all(&temp_root);
    }
}

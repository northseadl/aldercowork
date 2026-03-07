use crate::{atomic_write_secure, DataPaths};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri::Manager;

const PROFILE_REGISTRY_RELATIVE_PATH: &str = "global/profile-registry.json";
const HUB_TOKEN_FILE: &str = ".hub-token";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnterpriseProfileMetadata {
    pub hub_url: String,
    pub organization_id: String,
    pub organization_name: String,
    pub user_id: String,
    pub user_name: String,
    pub hub_host_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppProfile {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub created_at: String,
    pub updated_at: String,
    pub enterprise: Option<EnterpriseProfileMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileRegistry {
    pub active_profile_id: String,
    pub profiles: Vec<AppProfile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileRegistrySnapshot {
    pub active_profile_id: String,
    pub profiles: Vec<AppProfile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileMutationResult {
    pub active_profile_id: String,
    pub target_profile_id: String,
    pub profiles: Vec<AppProfile>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectEnterpriseProfileRequest {
    pub hub_url: String,
    pub label: Option<String>,
    pub auth_token: Option<String>,
    pub activate: Option<bool>,
}

fn now_string() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string()
}

fn app_data_root(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from(".aldercowork"))
}

fn registry_path(app: &AppHandle) -> PathBuf {
    app_data_root(app).join(PROFILE_REGISTRY_RELATIVE_PATH)
}

fn sanitize_segment(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "default".into();
    }

    let mut out = String::with_capacity(trimmed.len());
    for ch in trimmed.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
            out.push(ch.to_ascii_lowercase());
        } else {
            out.push('-');
        }
    }

    let normalized = out.trim_matches('-').trim_matches('.');
    if normalized.is_empty() {
        "default".into()
    } else {
        normalized.to_string()
    }
}

fn normalize_hub_url(raw: &str) -> String {
    raw.trim().trim_end_matches('/').to_string()
}

fn hub_hash(url: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(url.as_bytes());
    let digest = hasher.finalize();
    digest[..6]
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>()
}

fn local_default_profile() -> AppProfile {
    let now = now_string();
    AppProfile {
        id: "local:default".into(),
        kind: "local".into(),
        label: "Local".into(),
        created_at: now.clone(),
        updated_at: now,
        enterprise: None,
    }
}

fn ensure_local_profile(registry: &mut ProfileRegistry) {
    if registry
        .profiles
        .iter()
        .all(|profile| profile.id != "local:default")
    {
        registry.profiles.insert(0, local_default_profile());
    }

    if registry.active_profile_id.is_empty()
        || registry
            .profiles
            .iter()
            .all(|profile| profile.id != registry.active_profile_id)
    {
        registry.active_profile_id = "local:default".into();
    }
}

fn save_registry(app: &AppHandle, registry: &ProfileRegistry) -> Result<(), String> {
    let path = registry_path(app);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create profile registry dir: {e}"))?;
    }

    let content = serde_json::to_string_pretty(registry)
        .map_err(|e| format!("Failed to serialize profile registry: {e}"))?;
    atomic_write_secure(&path, content.as_bytes())
        .map_err(|e| format!("Failed to write profile registry: {e}"))
}

pub fn load_or_init_profile_registry(app: &AppHandle) -> Result<ProfileRegistry, String> {
    let path = registry_path(app);
    if !path.exists() {
        let mut registry = ProfileRegistry {
            active_profile_id: "local:default".into(),
            profiles: vec![local_default_profile()],
        };
        ensure_local_profile(&mut registry);
        save_registry(app, &registry)?;
        return Ok(registry);
    }

    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read profile registry: {e}"))?;
    let mut registry = serde_json::from_str::<ProfileRegistry>(&raw).unwrap_or(ProfileRegistry {
        active_profile_id: "local:default".into(),
        profiles: vec![local_default_profile()],
    });

    let original_active = registry.active_profile_id.clone();
    let original_count = registry.profiles.len();
    ensure_local_profile(&mut registry);
    if registry.active_profile_id != original_active || registry.profiles.len() != original_count {
        save_registry(app, &registry)?;
    }

    Ok(registry)
}

pub fn get_profile_registry_snapshot(app: &AppHandle) -> Result<ProfileRegistrySnapshot, String> {
    let registry = load_or_init_profile_registry(app)?;
    Ok(ProfileRegistrySnapshot {
        active_profile_id: registry.active_profile_id,
        profiles: registry.profiles,
    })
}

pub fn get_active_profile(app: &AppHandle) -> Result<AppProfile, String> {
    let registry = load_or_init_profile_registry(app)?;
    registry
        .profiles
        .into_iter()
        .find(|profile| profile.id == registry.active_profile_id)
        .ok_or_else(|| "Active profile not found".to_string())
}

fn enterprise_profile_id(normalized_hub_url: &str, organization_id: &str, user_id: &str) -> String {
    format!(
        "enterprise:{}:{}:{}",
        hub_hash(normalized_hub_url),
        sanitize_segment(organization_id),
        sanitize_segment(user_id),
    )
}

fn profile_dir_name(profile: &AppProfile) -> String {
    if profile.kind == "enterprise" {
        if let Some(ent) = &profile.enterprise {
            return format!(
                "enterprise~{}~{}~{}",
                &ent.hub_host_hash,
                sanitize_segment(&ent.organization_id),
                sanitize_segment(&ent.user_id),
            );
        }
    }
    "local~default".into()
}

pub fn profile_root_dir(app: &AppHandle, profile: &AppProfile) -> PathBuf {
    app_data_root(app)
        .join("profiles")
        .join(profile_dir_name(profile))
}

pub fn resolve_profile_data_paths(app: &AppHandle, profile: &AppProfile) -> DataPaths {
    let profile_root = profile_root_dir(app, profile);
    let engine_opencode = profile_root.join("engine").join("opencode");
    let workspace = profile_root.join("workspace");

    let to_string = |path: PathBuf| path.to_string_lossy().into_owned();

    DataPaths {
        config_dir: to_string(profile_root.join("config")),
        credentials_dir: to_string(profile_root.join("config").join("credentials")),
        skills_dir: to_string(profile_root.join("skills")),
        skill_staging_dir: to_string(profile_root.join("skill-staging")),
        audit_reports_dir: to_string(profile_root.join("audit-reports")),
        engine_dir: to_string(profile_root.join("engine")),
        engine_config_dir: to_string(engine_opencode.clone()),
        engine_skills_dir: to_string(engine_opencode.join(".agents").join("skills")),
        workspace_dir: to_string(workspace),
        profile_id: profile.id.clone(),
        profile_kind: profile.kind.clone(),
        profile_label: profile.label.clone(),
    }
}

pub fn resolve_active_data_paths(app: &AppHandle) -> DataPaths {
    get_active_profile(app)
        .map(|profile| resolve_profile_data_paths(app, &profile))
        .unwrap_or_else(|_| resolve_profile_data_paths(app, &local_default_profile()))
}

pub fn sync_profile_settings_file(app: &AppHandle, profile: &AppProfile) -> Result<(), String> {
    let data_paths = resolve_profile_data_paths(app, profile);
    let settings_path = PathBuf::from(&data_paths.config_dir).join("settings.json");
    if let Some(parent) = settings_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create settings dir: {e}"))?;
    }

    let mut settings = if settings_path.exists() {
        std::fs::read_to_string(&settings_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
            .unwrap_or_else(|| json!({}))
    } else {
        json!({})
    };

    if !settings.is_object() {
        settings = json!({});
    }

    let settings_obj = settings
        .as_object_mut()
        .ok_or_else(|| "Settings JSON must be an object".to_string())?;
    settings_obj.insert(
        "mode".into(),
        json!(if profile.kind == "enterprise" {
            "enterprise"
        } else {
            "standalone"
        }),
    );

    if profile.kind == "enterprise" {
        settings_obj.insert("configured".into(), json!(true));
    }

    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {e}"))?;
    atomic_write_secure(&settings_path, content.as_bytes())
        .map_err(|e| format!("Failed to write profile settings: {e}"))
}

pub fn write_profile_hub_token(
    app: &AppHandle,
    profile: &AppProfile,
    token: &str,
) -> Result<(), String> {
    let data_paths = resolve_profile_data_paths(app, profile);
    let token_path = PathBuf::from(&data_paths.credentials_dir).join(HUB_TOKEN_FILE);
    if let Some(parent) = token_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create profile credential dir: {e}"))?;
    }

    atomic_write_secure(&token_path, token.as_bytes())
        .map_err(|e| format!("Failed to persist Hub token: {e}"))
}

pub fn connect_enterprise_profile(
    app: &AppHandle,
    request: ConnectEnterpriseProfileRequest,
) -> Result<ProfileMutationResult, String> {
    let normalized_hub_url = normalize_hub_url(&request.hub_url);
    if normalized_hub_url.is_empty() {
        return Err("Hub URL is required".into());
    }

    let organization_id = "auto";
    let user_id = "auto";

    let mut registry = load_or_init_profile_registry(app)?;
    let profile_id = enterprise_profile_id(&normalized_hub_url, organization_id, user_id);
    let now = now_string();

    let created_at = registry
        .profiles
        .iter()
        .find(|profile| profile.id == profile_id)
        .map(|profile| profile.created_at.clone())
        .unwrap_or_else(|| now.clone());

    let label = request
        .label
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| normalized_hub_url.clone());

    let profile = AppProfile {
        id: profile_id.clone(),
        kind: "enterprise".into(),
        label,
        created_at,
        updated_at: now,
        enterprise: Some(EnterpriseProfileMetadata {
            hub_url: normalized_hub_url.clone(),
            organization_id: organization_id.into(),
            organization_name: organization_id.into(),
            user_id: user_id.into(),
            user_name: user_id.into(),
            hub_host_hash: hub_hash(&normalized_hub_url),
        }),
    };

    if let Some(existing_index) = registry
        .profiles
        .iter()
        .position(|existing| existing.id == profile_id)
    {
        registry.profiles[existing_index] = profile.clone();
    } else {
        registry.profiles.push(profile.clone());
    }

    ensure_local_profile(&mut registry);

    if request.activate.unwrap_or(true) {
        registry.active_profile_id = profile_id.clone();
    }

    save_registry(app, &registry)?;
    sync_profile_settings_file(app, &profile)?;

    if let Some(token) = request.auth_token.as_ref() {
        write_profile_hub_token(app, &profile, token.trim())?;
    }

    Ok(ProfileMutationResult {
        active_profile_id: registry.active_profile_id,
        target_profile_id: profile_id,
        profiles: registry.profiles,
    })
}

pub fn switch_active_profile(app: &AppHandle, profile_id: &str) -> Result<ProfileMutationResult, String> {
    let mut registry = load_or_init_profile_registry(app)?;
    let target = registry
        .profiles
        .iter()
        .find(|profile| profile.id == profile_id)
        .cloned()
        .ok_or_else(|| format!("Profile not found: {profile_id}"))?;

    registry.active_profile_id = profile_id.to_string();
    save_registry(app, &registry)?;
    sync_profile_settings_file(app, &target)?;

    Ok(ProfileMutationResult {
        active_profile_id: registry.active_profile_id,
        target_profile_id: profile_id.to_string(),
        profiles: registry.profiles,
    })
}

pub fn remove_profile(
    app: &AppHandle,
    profile_id: &str,
    purge_data: bool,
) -> Result<ProfileMutationResult, String> {
    if profile_id == "local:default" {
        return Err("The default local profile cannot be removed".into());
    }

    let mut registry = load_or_init_profile_registry(app)?;
    let profile = registry
        .profiles
        .iter()
        .find(|item| item.id == profile_id)
        .cloned()
        .ok_or_else(|| format!("Profile not found: {profile_id}"))?;

    registry.profiles.retain(|item| item.id != profile_id);
    ensure_local_profile(&mut registry);

    if registry.active_profile_id == profile_id {
        registry.active_profile_id = "local:default".into();
    }

    save_registry(app, &registry)?;

    if purge_data {
        let root = profile_root_dir(app, &profile);
        if root.exists() {
            std::fs::remove_dir_all(&root)
                .map_err(|e| format!("Failed to remove profile data: {e}"))?;
        }
    }

    let active_profile = registry
        .profiles
        .iter()
        .find(|item| item.id == registry.active_profile_id)
        .cloned()
        .ok_or_else(|| "Active profile missing after removal".to_string())?;
    sync_profile_settings_file(app, &active_profile)?;

    Ok(ProfileMutationResult {
        active_profile_id: registry.active_profile_id,
        target_profile_id: profile_id.to_string(),
        profiles: registry.profiles,
    })
}

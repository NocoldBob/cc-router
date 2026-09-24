use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::models::ProviderConfig;

const APP_DIRECTORY: &str = "local.ccrouter.desktop";
const PROVIDERS_FILE: &str = "providers.json";
const WORKSPACE_ROUTES_FILE: &str = "workspace-routes.json";
const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderCatalog {
    schema_version: u32,
    providers: Vec<ProviderConfig>,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct WorkspaceRoutes {
    schema_version: u32,
    routes: HashMap<String, String>,
}

pub fn save_provider_catalog(providers: &[ProviderConfig]) -> Result<(), String> {
    validate_catalog(providers)?;
    let catalog = ProviderCatalog {
        schema_version: SCHEMA_VERSION,
        providers: providers.to_vec(),
    };
    write_json(&data_directory()?.join(PROVIDERS_FILE), &catalog)
}

pub fn load_provider_catalog() -> Result<Vec<ProviderConfig>, String> {
    let path = data_directory()?.join(PROVIDERS_FILE);
    let bytes = fs::read(&path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            "Shared Provider configuration is not initialized. Open CC Router once and save the configuration."
                .to_string()
        } else {
            format!("Could not read shared Provider configuration: {error}")
        }
    })?;
    let catalog: ProviderCatalog = serde_json::from_slice(&bytes)
        .map_err(|error| format!("Could not parse shared Provider configuration: {error}"))?;
    if catalog.schema_version != SCHEMA_VERSION {
        return Err(format!(
            "Unsupported Provider configuration schema version: {}.",
            catalog.schema_version
        ));
    }
    validate_catalog(&catalog.providers)?;
    Ok(catalog.providers)
}

pub fn select_provider_for_workspace(workspace: &Path, provider_id: &str) -> Result<(), String> {
    let providers = load_provider_catalog()?;
    let provider = providers
        .iter()
        .find(|provider| provider.route.id == provider_id)
        .ok_or_else(|| "The selected Provider does not exist.".to_string())?;
    if !provider.enabled {
        return Err("The selected Provider is disabled.".into());
    }

    let key = normalize_workspace(workspace)?;
    let mut routes = load_workspace_routes()?;
    routes.schema_version = SCHEMA_VERSION;
    routes.routes.insert(key, provider_id.to_string());
    write_json(&data_directory()?.join(WORKSPACE_ROUTES_FILE), &routes)
}

pub fn clear_provider_for_workspace(workspace: &Path) -> Result<(), String> {
    let key = normalize_workspace(workspace)?;
    let mut routes = load_workspace_routes()?;
    routes.routes.remove(&key);
    write_json(&data_directory()?.join(WORKSPACE_ROUTES_FILE), &routes)
}

pub fn selected_provider_for_workspace(workspace: &Path) -> Result<Option<String>, String> {
    let workspace = normalize_workspace(workspace)?;
    let routes = load_workspace_routes()?;
    Ok(routes
        .routes
        .iter()
        .filter(|(candidate, _)| path_contains(&workspace, candidate))
        .max_by_key(|(candidate, _)| candidate.len())
        .map(|(_, provider_id)| provider_id.clone()))
}

pub fn data_directory() -> Result<PathBuf, String> {
    if let Some(path) = env::var_os("CC_ROUTER_DATA_DIR").filter(|value| !value.is_empty()) {
        return Ok(PathBuf::from(path));
    }
    #[cfg(windows)]
    {
        let app_data = env::var_os("APPDATA").ok_or_else(|| {
            "APPDATA is unavailable; CC Router data directory cannot be located.".to_string()
        })?;
        return Ok(PathBuf::from(app_data).join(APP_DIRECTORY));
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(config_home) = env::var_os("XDG_CONFIG_HOME").filter(|value| !value.is_empty())
        {
            return Ok(PathBuf::from(config_home).join(APP_DIRECTORY));
        }
        let home = env::var_os("HOME").ok_or_else(|| {
            "HOME is unavailable; CC Router data directory cannot be located.".to_string()
        })?;
        return Ok(PathBuf::from(home).join(".config").join(APP_DIRECTORY));
    }
    #[allow(unreachable_code)]
    Err("This operating system is not supported.".into())
}

fn validate_catalog(providers: &[ProviderConfig]) -> Result<(), String> {
    if providers.is_empty() {
        return Err("At least one Provider is required.".into());
    }
    let mut ids = HashSet::new();
    for provider in providers {
        provider.validate()?;
        if !ids.insert(provider.route.id.as_str()) {
            return Err(format!("Duplicate Provider ID: {}.", provider.route.id));
        }
    }
    Ok(())
}

fn load_workspace_routes() -> Result<WorkspaceRoutes, String> {
    let path = data_directory()?.join(WORKSPACE_ROUTES_FILE);
    match fs::read(&path) {
        Ok(bytes) => {
            let routes: WorkspaceRoutes = serde_json::from_slice(&bytes)
                .map_err(|error| format!("Could not parse workspace routes: {error}"))?;
            if routes.schema_version != 0 && routes.schema_version != SCHEMA_VERSION {
                return Err(format!(
                    "Unsupported workspace route schema version: {}.",
                    routes.schema_version
                ));
            }
            Ok(routes)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(WorkspaceRoutes {
            schema_version: SCHEMA_VERSION,
            routes: HashMap::new(),
        }),
        Err(error) => Err(format!("Could not read workspace routes: {error}")),
    }
}

fn normalize_workspace(path: &Path) -> Result<String, String> {
    if !path.is_dir() {
        return Err("The workspace directory does not exist.".into());
    }
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("Could not resolve workspace directory: {error}"))?;
    Ok(normalize_canonical_path(&canonical))
}

fn path_contains(workspace: &str, candidate: &str) -> bool {
    Path::new(workspace).starts_with(Path::new(candidate))
}

fn normalize_canonical_path(path: &Path) -> String {
    #[cfg(windows)]
    return path
        .to_string_lossy()
        .trim_end_matches(['\\', '/'])
        .replace('/', "\\")
        .to_ascii_lowercase();
    #[cfg(not(windows))]
    {
        let value = path.to_string_lossy();
        if value == "/" {
            "/".into()
        } else {
            value.trim_end_matches('/').into()
        }
    }
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let directory = path
        .parent()
        .ok_or_else(|| "Shared configuration path has no parent directory.".to_string())?;
    fs::create_dir_all(directory)
        .map_err(|error| format!("Could not create shared configuration directory: {error}"))?;
    let temporary = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("Could not serialize shared configuration: {error}"))?;
    fs::write(&temporary, bytes)
        .map_err(|error| format!("Could not write shared configuration: {error}"))?;
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("Could not replace shared configuration: {error}"))?;
    }
    fs::rename(temporary, path)
        .map_err(|error| format!("Could not finalize shared configuration: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ProviderRoute;

    fn provider(id: &str) -> ProviderConfig {
        ProviderConfig {
            route: ProviderRoute {
                id: id.into(),
                display_name: id.into(),
                base_url: "https://example.com/anthropic".into(),
                auth_env_name: "EXAMPLE_API_KEY".into(),
                main_model: "example-model".into(),
                fast_model: String::new(),
                opus_model: String::new(),
                sonnet_model: String::new(),
                haiku_model: String::new(),
                fable_model: String::new(),
                subagent_model: String::new(),
                effort_level: String::new(),
                auto_compact_window: String::new(),
                max_context_tokens: String::new(),
            },
            notes: String::new(),
            enabled: true,
            accent: "green".into(),
        }
    }

    #[test]
    fn provider_catalog_serialization_never_contains_credentials() {
        let catalog = ProviderCatalog {
            schema_version: SCHEMA_VERSION,
            providers: vec![provider("example")],
        };
        let json = serde_json::to_string(&catalog).unwrap();

        assert!(!json.contains("authToken"));
        assert!(!json.contains("API Key"));
    }

    #[cfg(windows)]
    #[test]
    fn workspace_match_requires_a_path_boundary() {
        assert!(path_contains("c:\\code\\app\\src", "c:\\code\\app"));
        assert!(path_contains("c:\\code\\app", "c:\\code\\app"));
        assert!(!path_contains("c:\\code\\application", "c:\\code\\app"));
    }

    #[cfg(not(windows))]
    #[test]
    fn workspace_match_is_case_sensitive_and_requires_a_path_boundary() {
        assert!(path_contains(
            "/home/user/code/app/src",
            "/home/user/code/app"
        ));
        assert!(path_contains("/home/user/code/app", "/home/user/code/app"));
        assert!(!path_contains(
            "/home/user/code/application",
            "/home/user/code/app"
        ));
        assert!(!path_contains("/home/user/code/App", "/home/user/code/app"));
    }

    #[test]
    fn duplicate_provider_ids_are_rejected() {
        assert!(validate_catalog(&[provider("same"), provider("same")]).is_err());
    }
}

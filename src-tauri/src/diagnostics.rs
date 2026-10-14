use std::env;

use serde::Serialize;

use crate::credentials;
use crate::models::RouteSnapshot;
use crate::provider_store;
use crate::sessions::now_unix;
use crate::system_env;

/// One provider entry in the diagnostics report. Contains only data that is
/// already present in the secret-free shared Provider catalog plus a boolean
/// credential flag — API keys are never read for diagnostics.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDiagnostics {
    pub id: String,
    pub display_name: String,
    pub base_url: String,
    pub main_model: String,
    pub enabled: bool,
    pub credential_configured: bool,
}

/// Redacted report suitable for attaching to an issue. Environment variables
/// are reported by name only, user home directories are replaced with `~`,
/// and no credential value is ever loaded, so the serialized report cannot
/// contain API keys, prompt content, or route variable values.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsReport {
    pub generated_at_unix: u64,
    pub app_version: String,
    pub platform: String,
    pub credential_store: String,
    pub persistent_route_supported: bool,
    pub cli_available: bool,
    pub cli_path_redacted: Option<String>,
    /// Route/mode variables present in the CC Router process environment,
    /// names only. These are the variables that isolated launches override.
    pub inherited_variable_names: Vec<String>,
    /// Windows user-route variables currently set, names only.
    pub user_route_variable_names: Vec<String>,
    pub user_route_auth_token_set: bool,
    pub providers: Vec<ProviderDiagnostics>,
    pub provider_catalog_error: Option<String>,
}

pub fn collect_diagnostics(
    platform: &str,
    cli_available: bool,
    cli_path: Option<String>,
    persistent_route_supported: bool,
    inherited_variable_names: Vec<String>,
) -> DiagnosticsReport {
    let (user_route_variable_names, user_route_auth_token_set) = user_route_summary();
    let (providers, provider_catalog_error) = provider_summaries();

    DiagnosticsReport {
        generated_at_unix: now_unix(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        platform: platform.to_string(),
        credential_store: credentials::credential_store_name().into(),
        persistent_route_supported,
        cli_available,
        cli_path_redacted: cli_path.map(|path| redact_home(&path)),
        inherited_variable_names,
        user_route_variable_names,
        user_route_auth_token_set,
        providers,
        provider_catalog_error,
    }
}

fn provider_summaries() -> (Vec<ProviderDiagnostics>, Option<String>) {
    match provider_store::load_provider_catalog() {
        Ok(providers) => (
            providers
                .into_iter()
                .map(|provider| ProviderDiagnostics {
                    credential_configured: credentials::provider_token_exists(&provider.route.id)
                        .unwrap_or(false),
                    id: provider.route.id,
                    display_name: provider.route.display_name,
                    base_url: provider.route.base_url,
                    main_model: provider.route.main_model,
                    enabled: provider.enabled,
                })
                .collect(),
            None,
        ),
        Err(error) => (Vec::new(), Some(error)),
    }
}

fn user_route_summary() -> (Vec<String>, bool) {
    if !cfg!(windows) {
        return (Vec::new(), false);
    }
    match system_env::read_user_route() {
        Ok(state) => (
            route_snapshot_names(&state.snapshot),
            state.snapshot.auth_token_set,
        ),
        Err(_) => (Vec::new(), false),
    }
}

fn route_snapshot_names(snapshot: &RouteSnapshot) -> Vec<String> {
    [
        ("ANTHROPIC_BASE_URL", &snapshot.base_url),
        ("ANTHROPIC_MODEL", &snapshot.model),
        ("ANTHROPIC_DEFAULT_OPUS_MODEL", &snapshot.opus_model),
        ("ANTHROPIC_DEFAULT_SONNET_MODEL", &snapshot.sonnet_model),
        ("ANTHROPIC_DEFAULT_HAIKU_MODEL", &snapshot.haiku_model),
        ("ANTHROPIC_DEFAULT_FABLE_MODEL", &snapshot.fable_model),
        ("CLAUDE_CODE_SUBAGENT_MODEL", &snapshot.subagent_model),
        ("CLAUDE_CODE_EFFORT_LEVEL", &snapshot.effort_level),
        (
            "CLAUDE_CODE_AUTO_COMPACT_WINDOW",
            &snapshot.auto_compact_window,
        ),
        (
            "CLAUDE_CODE_MAX_CONTEXT_TOKENS",
            &snapshot.max_context_tokens,
        ),
    ]
    .into_iter()
    .filter(|(_, value)| value.is_some())
    .map(|(name, _)| name.to_string())
    .collect()
}

/// Replaces the current user's home directory prefix with `~` so issue
/// reports do not reveal account names.
pub fn redact_home(path: &str) -> String {
    let Some(home) = home_directory() else {
        return path.to_string();
    };
    let home = home.trim_end_matches(['\\', '/', '\r', '\n']);
    if home.is_empty() {
        return path.to_string();
    }
    let lower_path = path.to_ascii_lowercase();
    let lower_home = home.to_ascii_lowercase();
    if lower_path == lower_home {
        return "~".to_string();
    }
    for separator in ['\\', '/'] {
        let prefix = format!("{lower_home}{separator}");
        if lower_path.starts_with(&prefix) {
            let cut = prefix.len();
            if path.is_char_boundary(cut) {
                return format!("~{separator}{}", &path[cut..]);
            }
        }
    }
    path.to_string()
}

fn home_directory() -> Option<String> {
    #[cfg(windows)]
    let variable = "USERPROFILE";
    #[cfg(not(windows))]
    let variable = "HOME";
    env::var_os(variable)
        .map(|value| value.to_string_lossy().into_owned())
        .map(|value| value.trim_end().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn route_snapshot_names_report_names_without_values() {
        let snapshot = RouteSnapshot {
            base_url: Some("https://secret-host.example.com".into()),
            model: Some("secret-model-value".into()),
            auth_token_set: true,
            ..Default::default()
        };

        let names = route_snapshot_names(&snapshot);

        assert_eq!(names, ["ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL"]);
        let json = serde_json::to_string(&names).unwrap();
        assert!(!json.contains("secret-host"));
        assert!(!json.contains("secret-model-value"));
    }

    #[test]
    fn report_serialization_contains_no_route_values() {
        let report = DiagnosticsReport {
            generated_at_unix: 1_700_000_000,
            app_version: "0.0.0-test".into(),
            platform: "windows".into(),
            credential_store: "Test Store".into(),
            persistent_route_supported: true,
            cli_available: true,
            cli_path_redacted: Some("~\\.local\\bin\\claude.exe".into()),
            inherited_variable_names: vec!["ANTHROPIC_MODEL".into()],
            user_route_variable_names: vec!["ANTHROPIC_BASE_URL".into()],
            user_route_auth_token_set: true,
            providers: vec![ProviderDiagnostics {
                id: "deepseek".into(),
                display_name: "DeepSeek".into(),
                base_url: "https://api.deepseek.com/anthropic".into(),
                main_model: "deepseek-v4-pro[1m]".into(),
                enabled: true,
                credential_configured: true,
            }],
            provider_catalog_error: None,
        };

        let json = serde_json::to_string(&report).unwrap();
        assert!(!json.contains("ANTHROPIC_AUTH_TOKEN\":\""));
        assert!(!json.contains("authToken"));
        assert!(json.contains("cliPathRedacted"));
    }

    #[cfg(windows)]
    #[test]
    fn redacts_the_home_prefix_on_windows() {
        if let Some(home) = home_directory() {
            let joined = format!("{}\\.local\\bin\\claude.exe", home.trim_end_matches('\\'));
            assert_eq!(redact_home(&joined), "~\\.local\\bin\\claude.exe");
            assert_eq!(
                redact_home("D:\\other\\claude.exe"),
                "D:\\other\\claude.exe"
            );
        }
    }

    #[cfg(not(windows))]
    #[test]
    fn redacts_the_home_prefix_on_linux() {
        if let Some(home) = home_directory() {
            let joined = format!("{}/.local/bin/claude", home.trim_end_matches('/'));
            assert_eq!(redact_home(&joined), "~/.local/bin/claude");
            assert_eq!(redact_home("/opt/tools/claude"), "/opt/tools/claude");
        }
    }
}

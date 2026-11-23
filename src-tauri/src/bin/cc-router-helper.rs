use std::env;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{self, Command, Stdio};

use cc_router_lib::backup;
use cc_router_lib::credentials;
use cc_router_lib::diagnostics;
use cc_router_lib::launch;
use cc_router_lib::launch::CLAUDE_MODE_VARIABLES;
use cc_router_lib::models::{ActionResult, ProviderConfig, ROUTE_VARIABLES};
use cc_router_lib::probe;
use cc_router_lib::provider_store;
use cc_router_lib::system_env;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderSummary {
    id: String,
    display_name: String,
    base_url: String,
    main_model: String,
    enabled: bool,
    credential_configured: bool,
    selected: bool,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("CC Router: {error}");
        process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let mut arguments = env::args_os().skip(1);
    let Some(first) = arguments.next() else {
        return Err("Claude executable path or helper command is required.".into());
    };
    let command = first.to_string_lossy();
    match command.as_ref() {
        "version" => {
            println!("{}", env!("CARGO_PKG_VERSION"));
            Ok(())
        }
        "list" => list_providers(parse_workspace(arguments)?),
        "select" => {
            let workspace = required_argument(&mut arguments, "workspace path")?;
            let provider_id = required_argument(&mut arguments, "Provider ID")?;
            provider_store::select_provider_for_workspace(Path::new(&workspace), &provider_id)
        }
        "clear" => {
            let workspace = required_argument(&mut arguments, "workspace path")?;
            provider_store::clear_provider_for_workspace(Path::new(&workspace))
        }
        "probe" => {
            let provider_id = required_argument(&mut arguments, "Provider ID")?;
            probe_provider(&provider_id)
        }
        "sync-catalog" => {
            let mut input = String::new();
            io::stdin()
                .read_to_string(&mut input)
                .map_err(|error| format!("Could not read the Provider catalog: {error}"))?;
            sync_catalog_json(&input)
        }
        "export-catalog" => {
            println!("{}", export_catalog_json()?);
            Ok(())
        }
        "store-credential" => {
            let provider_id = required_argument(&mut arguments, "Provider ID")?;
            let mut input = String::new();
            io::stdin()
                .read_line(&mut input)
                .map_err(|error| format!("Could not read the API key: {error}"))?;
            credentials::save_provider_token(&provider_id, parse_stdin_token(&input)?)
        }
        "delete-credential" => {
            let provider_id = required_argument(&mut arguments, "Provider ID")?;
            credentials::delete_provider_token(&provider_id)
        }
        "launch-terminal" => {
            let provider_id = required_argument(&mut arguments, "Provider ID")?;
            let working_directory = arguments
                .next()
                .map(|value| value.to_string_lossy().into_owned());
            launch_terminal(&provider_id, working_directory)
        }
        "apply-route" => {
            let provider_id = required_argument(&mut arguments, "Provider ID")?;
            apply_route(&provider_id)
        }
        "clear-route" => clear_route(),
        "rollback-route" => rollback_route(),
        "diagnostics" => print_diagnostics(),
        _ => launch_wrapped(PathBuf::from(first), arguments.collect()),
    }
}

fn list_providers(workspace: PathBuf) -> Result<(), String> {
    let selected = provider_store::selected_provider_for_workspace(&workspace)?;
    let providers = provider_store::load_provider_catalog()?;
    let summaries = providers
        .into_iter()
        .map(|provider| -> Result<ProviderSummary, String> {
            let provider_id = provider.route.id.clone();
            let credential_configured = credentials::provider_token_exists(&provider_id)?;
            Ok(ProviderSummary {
                id: provider_id.clone(),
                display_name: provider.route.display_name,
                base_url: provider.route.base_url,
                main_model: provider.route.main_model,
                enabled: provider.enabled,
                credential_configured,
                selected: selected.as_deref() == Some(provider_id.as_str()),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let json = serde_json::to_string(&summaries)
        .map_err(|error| format!("Could not serialize Provider list: {error}"))?;
    println!("{json}");
    Ok(())
}

fn probe_provider(provider_id: &str) -> Result<(), String> {
    let provider = enabled_provider(provider_id)?;
    let token = credentials::read_provider_token(&provider.route.id)?;
    let result = probe::probe_provider(&provider.route, &token);
    let json = serde_json::to_string(&result)
        .map_err(|error| format!("Could not serialize probe result: {error}"))?;
    println!("{json}");
    Ok(())
}

/// Replaces the shared secret-free Provider catalog. The catalog travels over
/// stdin so it never appears in process arguments; validation is the same
/// `provider_store` validation the desktop app uses.
fn sync_catalog_json(input: &str) -> Result<(), String> {
    let providers: Vec<ProviderConfig> = serde_json::from_str(input)
        .map_err(|error| format!("Could not parse the Provider catalog: {error}"))?;
    provider_store::save_provider_catalog(&providers)
}

/// Prints the full secret-free Provider catalog for the extension to import.
/// The catalog contains no credentials by design (asserted in tests).
fn export_catalog_json() -> Result<String, String> {
    let providers = provider_store::load_provider_catalog()?;
    serde_json::to_string(&providers)
        .map_err(|error| format!("Could not serialize the Provider catalog: {error}"))
}

/// Trims the single API key line read from stdin. The token is never echoed,
/// logged, or placed in process arguments.
fn parse_stdin_token(input: &str) -> Result<&str, String> {
    let token = input.trim();
    if token.is_empty() {
        return Err("API key cannot be empty.".into());
    }
    Ok(token)
}

fn launch_terminal(provider_id: &str, working_directory: Option<String>) -> Result<(), String> {
    let provider = enabled_provider(provider_id)?;
    provider.route.validate()?;
    let token = credentials::read_provider_token(&provider.route.id)?;
    let working_directory = launch::validate_working_directory(working_directory)?;
    let environment = provider.route.environment(token);

    launch::launch_isolated_terminal(working_directory.as_deref(), environment)?;
    print_result(ActionResult {
        message: format!(
            "An isolated terminal opened with the {} route.",
            provider.route.display_name
        ),
        changed_variables: Vec::new(),
        process_id: None,
    })
}

fn apply_route(provider_id: &str) -> Result<(), String> {
    launch::persistent_route_guard()?;
    let provider = enabled_provider(provider_id)?;
    provider.route.validate()?;
    let token = credentials::read_provider_token(&provider.route.id)?;
    let previous = system_env::read_user_route()?;
    let directory = provider_store::data_directory()?;
    backup::save_to(&directory, &previous)?;

    if let Err(error) = system_env::write_provider_route(&provider.route, token) {
        let _ = system_env::restore_user_route(&previous.snapshot, previous.auth_token);
        return Err(error);
    }

    print_result(ActionResult {
        message: format!(
            "{} is now the Windows user default. Restart terminals and VS Code to use it.",
            provider.route.display_name
        ),
        changed_variables: ROUTE_VARIABLES.iter().map(|name| (*name).into()).collect(),
        process_id: None,
    })
}

fn clear_route() -> Result<(), String> {
    launch::persistent_route_guard()?;
    let previous = system_env::read_user_route()?;
    let directory = provider_store::data_directory()?;
    backup::save_to(&directory, &previous)?;
    system_env::clear_user_route()?;

    print_result(ActionResult {
        message: "Windows user default route cleared. Restart terminals and VS Code.".into(),
        changed_variables: ROUTE_VARIABLES.iter().map(|name| (*name).into()).collect(),
        process_id: None,
    })
}

fn rollback_route() -> Result<(), String> {
    launch::persistent_route_guard()?;
    let directory = provider_store::data_directory()?;
    let (snapshot, token) = backup::load_from(&directory)?;
    system_env::restore_user_route(&snapshot, token)?;
    backup::clear_at(&directory)?;

    print_result(ActionResult {
        message: "The previous Windows user route was restored. Restart affected apps.".into(),
        changed_variables: ROUTE_VARIABLES.iter().map(|name| (*name).into()).collect(),
        process_id: None,
    })
}

fn print_diagnostics() -> Result<(), String> {
    let cli = launch::resolve_claude_cli(None);
    let report = diagnostics::collect_diagnostics(
        launch::platform_name(),
        cli.is_some(),
        cli.map(|path| path.to_string_lossy().into_owned()),
        cfg!(windows),
        launch::detect_conflicting_variables(|name| env::var_os(name)),
    );
    let json = serde_json::to_string(&report)
        .map_err(|error| format!("Could not serialize the diagnostics report: {error}"))?;
    println!("{json}");
    Ok(())
}

fn enabled_provider(provider_id: &str) -> Result<ProviderConfig, String> {
    let provider = provider_store::load_provider_catalog()?
        .into_iter()
        .find(|provider| provider.route.id == provider_id)
        .ok_or_else(|| "The selected Provider does not exist.".to_string())?;
    if !provider.enabled {
        return Err("The selected Provider is disabled.".into());
    }
    Ok(provider)
}

fn print_result(result: ActionResult) -> Result<(), String> {
    let json = serde_json::to_string(&result)
        .map_err(|error| format!("Could not serialize the result: {error}"))?;
    println!("{json}");
    Ok(())
}

fn launch_wrapped(executable: PathBuf, arguments: Vec<std::ffi::OsString>) -> Result<(), String> {
    if !executable.is_file() {
        return Err("Claude executable supplied by the host does not exist.".into());
    }
    let workspace = env::current_dir()
        .map_err(|error| format!("Could not determine the current workspace: {error}"))?;
    let provider_id =
        provider_store::selected_provider_for_workspace(&workspace)?.ok_or_else(|| {
            "No Provider is selected for this workspace. Run 'CC Router: Select Provider' first."
                .to_string()
        })?;
    let provider = provider_store::load_provider_catalog()?
        .into_iter()
        .find(|provider| provider.route.id == provider_id)
        .ok_or_else(|| "The Provider selected for this workspace no longer exists.".to_string())?;
    if !provider.enabled {
        return Err("The Provider selected for this workspace is disabled.".into());
    }
    let token = credentials::read_provider_token(&provider.route.id)?;
    let environment = provider.route.environment(token);

    let mut child = Command::new(executable);
    child
        .args(arguments)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    for name in CLAUDE_MODE_VARIABLES.iter().chain(ROUTE_VARIABLES.iter()) {
        child.env_remove(name);
    }
    child.envs(environment);

    let status = child
        .status()
        .map_err(|error| format!("Could not launch Claude Code: {error}"))?;
    process::exit(status.code().unwrap_or(1));
}

fn parse_workspace(
    mut arguments: impl Iterator<Item = std::ffi::OsString>,
) -> Result<PathBuf, String> {
    required_argument(&mut arguments, "workspace path").map(PathBuf::from)
}

fn required_argument(
    arguments: &mut impl Iterator<Item = std::ffi::OsString>,
    label: &str,
) -> Result<String, String> {
    arguments
        .next()
        .map(|value| value.to_string_lossy().into_owned())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| format!("Missing {label}."))
}

#[cfg(test)]
mod tests {
    use super::*;
    use cc_router_lib::models::ProviderRoute;

    fn example_catalog_json() -> String {
        let providers = vec![ProviderConfig {
            route: ProviderRoute {
                id: "example".into(),
                display_name: "Example".into(),
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
                api_timeout_ms: String::new(),
                disable_nonessential_traffic: String::new(),
                max_output_tokens: String::new(),
            },
            notes: String::new(),
            enabled: true,
            accent: "green".into(),
        }];
        serde_json::to_string(&providers).unwrap()
    }

    #[test]
    fn provider_summary_exposes_status_but_no_credential_value() {
        let summary = ProviderSummary {
            id: "example".into(),
            display_name: "Example".into(),
            base_url: "https://example.com/anthropic".into(),
            main_model: "example-model".into(),
            enabled: true,
            credential_configured: true,
            selected: false,
        };
        let json = serde_json::to_string(&summary).unwrap();

        assert!(json.contains("credentialConfigured"));
        assert!(!json.contains("authToken"));
        assert!(!json.contains("apiKey"));
        assert!(!json.contains("secret"));
    }

    #[test]
    fn wrapper_clears_all_conflicting_claude_modes() {
        assert_eq!(
            CLAUDE_MODE_VARIABLES,
            [
                "ANTHROPIC_API_KEY",
                "CLAUDE_CODE_USE_BEDROCK",
                "CLAUDE_CODE_USE_VERTEX",
                "CLAUDE_CODE_USE_FOUNDRY",
            ]
        );
        assert!(ROUTE_VARIABLES.contains(&"ANTHROPIC_AUTH_TOKEN"));
        assert!(ROUTE_VARIABLES.contains(&"CLAUDE_CODE_MAX_CONTEXT_TOKENS"));
    }

    #[test]
    fn stdin_token_is_trimmed_and_never_empty() {
        assert_eq!(parse_stdin_token("  token-value\n").unwrap(), "token-value");
        assert!(parse_stdin_token("   \n").is_err());
        assert!(parse_stdin_token("").is_err());
    }

    #[test]
    fn catalog_sync_and_export_roundtrip_without_credentials() {
        // Single test for the whole catalog flow: provider_store resolves its
        // data directory through CC_ROUTER_DATA_DIR at call time, so parallel
        // tests would race on that process-wide variable.
        let directory =
            std::env::temp_dir().join(format!("cc-router-helper-test-{}", process::id()));
        let _ = std::fs::remove_dir_all(&directory);
        env::set_var("CC_ROUTER_DATA_DIR", &directory);

        sync_catalog_json(&example_catalog_json()).unwrap();
        let exported = export_catalog_json().unwrap();
        assert!(exported.contains("example-model"));
        assert!(exported.contains("https://example.com/anthropic"));
        assert!(!exported.contains("authToken"));
        assert!(!exported.contains("API Key"));

        assert!(enabled_provider("example").is_ok());
        let missing = enabled_provider("missing").expect_err("unknown id must fail");
        assert!(missing.contains("does not exist"));

        let disabled_input =
            example_catalog_json().replace("\"enabled\":true", "\"enabled\":false");
        sync_catalog_json(&disabled_input).unwrap();
        let disabled = enabled_provider("example").expect_err("disabled provider must fail");
        assert!(disabled.contains("disabled"));

        let invalid = sync_catalog_json("not json").expect_err("invalid JSON must fail");
        assert!(invalid.contains("Could not parse"));

        let _ = std::fs::remove_dir_all(&directory);
        env::remove_var("CC_ROUTER_DATA_DIR");
    }
}

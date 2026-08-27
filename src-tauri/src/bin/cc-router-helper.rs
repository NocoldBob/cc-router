use std::env;
use std::path::{Path, PathBuf};
use std::process::{self, Command, Stdio};

use cc_router_lib::credentials;
use cc_router_lib::models::ROUTE_VARIABLES;
use cc_router_lib::probe;
use cc_router_lib::provider_store;
use serde::Serialize;

const CLAUDE_MODE_VARIABLES: [&str; 4] = [
    "ANTHROPIC_API_KEY",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
    "CLAUDE_CODE_USE_FOUNDRY",
];

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
        .collect::<Result<Vec<_>, _>>()?;
    let json = serde_json::to_string(&summaries)
        .map_err(|error| format!("Could not serialize Provider list: {error}"))?;
    println!("{json}");
    Ok(())
}

fn probe_provider(provider_id: &str) -> Result<(), String> {
    let provider = provider_store::load_provider_catalog()?
        .into_iter()
        .find(|provider| provider.route.id == provider_id)
        .ok_or_else(|| "The selected Provider does not exist.".to_string())?;
    if !provider.enabled {
        return Err("The selected Provider is disabled.".into());
    }
    let token = credentials::read_provider_token(&provider.route.id)?;
    let result = probe::probe_provider(&provider.route, &token);
    let json = serde_json::to_string(&result)
        .map_err(|error| format!("Could not serialize probe result: {error}"))?;
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
}

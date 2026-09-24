#[cfg(windows)]
use std::collections::HashMap;
#[cfg(windows)]
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
use serde::Deserialize;

#[cfg(not(windows))]
use crate::models::ProviderRoute;
use crate::models::RouteSnapshot;
#[cfg(windows)]
use crate::models::{ProviderRoute, ROUTE_VARIABLES};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Clone, Debug)]
pub struct FullRouteState {
    pub snapshot: RouteSnapshot,
    pub auth_token: Option<String>,
}

#[cfg(not(windows))]
pub fn read_user_route() -> Result<FullRouteState, String> {
    Err(unsupported())
}

#[cfg(not(windows))]
pub fn write_provider_route(_route: &ProviderRoute, _token: String) -> Result<(), String> {
    Err(unsupported())
}

#[cfg(not(windows))]
pub fn clear_user_route() -> Result<(), String> {
    Err(unsupported())
}

#[cfg(not(windows))]
pub fn restore_user_route(_snapshot: &RouteSnapshot, _token: Option<String>) -> Result<(), String> {
    Err(unsupported())
}

#[cfg(not(windows))]
fn unsupported() -> String {
    "Persistent default routing is only available on Windows.".into()
}

#[cfg(windows)]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawRouteState {
    base_url: Option<String>,
    auth_token: Option<String>,
    model: Option<String>,
    opus_model: Option<String>,
    sonnet_model: Option<String>,
    haiku_model: Option<String>,
    fable_model: Option<String>,
    subagent_model: Option<String>,
    effort_level: Option<String>,
    auto_compact_window: Option<String>,
    max_context_tokens: Option<String>,
}

#[cfg(windows)]
pub fn read_user_route() -> Result<FullRouteState, String> {
    let script = r#"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[ordered]@{
  baseUrl = [Environment]::GetEnvironmentVariable('ANTHROPIC_BASE_URL', 'User')
  authToken = [Environment]::GetEnvironmentVariable('ANTHROPIC_AUTH_TOKEN', 'User')
  model = [Environment]::GetEnvironmentVariable('ANTHROPIC_MODEL', 'User')
  opusModel = [Environment]::GetEnvironmentVariable('ANTHROPIC_DEFAULT_OPUS_MODEL', 'User')
  sonnetModel = [Environment]::GetEnvironmentVariable('ANTHROPIC_DEFAULT_SONNET_MODEL', 'User')
  haikuModel = [Environment]::GetEnvironmentVariable('ANTHROPIC_DEFAULT_HAIKU_MODEL', 'User')
  fableModel = [Environment]::GetEnvironmentVariable('ANTHROPIC_DEFAULT_FABLE_MODEL', 'User')
  subagentModel = [Environment]::GetEnvironmentVariable('CLAUDE_CODE_SUBAGENT_MODEL', 'User')
  effortLevel = [Environment]::GetEnvironmentVariable('CLAUDE_CODE_EFFORT_LEVEL', 'User')
  autoCompactWindow = [Environment]::GetEnvironmentVariable('CLAUDE_CODE_AUTO_COMPACT_WINDOW', 'User')
  maxContextTokens = [Environment]::GetEnvironmentVariable('CLAUDE_CODE_MAX_CONTEXT_TOKENS', 'User')
} | ConvertTo-Json -Compress
"#;
    let output = powershell()
        .arg("-Command")
        .arg(script)
        .output()
        .map_err(|error| {
            format!("Could not inspect Windows user environment variables: {error}")
        })?;
    if !output.status.success() {
        return Err("Windows rejected the environment status check.".into());
    }

    let json = String::from_utf8_lossy(&output.stdout);
    let raw: RawRouteState = serde_json::from_str(json.trim())
        .map_err(|error| format!("Could not parse Windows environment status: {error}"))?;
    let auth_token_set = raw
        .auth_token
        .as_ref()
        .is_some_and(|token| !token.trim().is_empty());

    Ok(FullRouteState {
        snapshot: RouteSnapshot {
            base_url: normalize(raw.base_url),
            model: normalize(raw.model),
            opus_model: normalize(raw.opus_model),
            sonnet_model: normalize(raw.sonnet_model),
            haiku_model: normalize(raw.haiku_model),
            fable_model: normalize(raw.fable_model),
            subagent_model: normalize(raw.subagent_model),
            effort_level: normalize(raw.effort_level),
            auto_compact_window: normalize(raw.auto_compact_window),
            max_context_tokens: normalize(raw.max_context_tokens),
            auth_token_set,
        },
        auth_token: normalize(raw.auth_token),
    })
}

#[cfg(windows)]
pub fn write_provider_route(route: &ProviderRoute, token: String) -> Result<(), String> {
    let mut values = ROUTE_VARIABLES
        .iter()
        .map(|name| ((*name).to_string(), None))
        .collect::<HashMap<_, _>>();
    for (name, value) in route.environment(token) {
        values.insert(name, Some(value));
    }
    write_values(values)
}

#[cfg(windows)]
pub fn clear_user_route() -> Result<(), String> {
    write_values(
        ROUTE_VARIABLES
            .iter()
            .map(|name| ((*name).to_string(), None))
            .collect(),
    )
}

#[cfg(windows)]
pub fn restore_user_route(snapshot: &RouteSnapshot, token: Option<String>) -> Result<(), String> {
    let values = HashMap::from([
        (ROUTE_VARIABLES[0].into(), snapshot.base_url.clone()),
        (ROUTE_VARIABLES[1].into(), token),
        (ROUTE_VARIABLES[2].into(), snapshot.model.clone()),
        (ROUTE_VARIABLES[3].into(), snapshot.opus_model.clone()),
        (ROUTE_VARIABLES[4].into(), snapshot.sonnet_model.clone()),
        (ROUTE_VARIABLES[5].into(), snapshot.haiku_model.clone()),
        (ROUTE_VARIABLES[6].into(), snapshot.fable_model.clone()),
        (ROUTE_VARIABLES[7].into(), snapshot.subagent_model.clone()),
        (ROUTE_VARIABLES[8].into(), snapshot.effort_level.clone()),
        (
            ROUTE_VARIABLES[9].into(),
            snapshot.auto_compact_window.clone(),
        ),
        (
            ROUTE_VARIABLES[10].into(),
            snapshot.max_context_tokens.clone(),
        ),
    ]);
    write_values(values)
}

#[cfg(windows)]
fn write_values(values: HashMap<String, Option<String>>) -> Result<(), String> {
    let mut command = powershell();
    command.arg("-Command").arg(write_script());
    for (index, name) in ROUTE_VARIABLES.iter().enumerate() {
        let value = values.get(*name).cloned().flatten();
        command.env(
            format!("CC_ROUTER_PRESENT_{index}"),
            if value.is_some() { "1" } else { "0" },
        );
        command.env(
            format!("CC_ROUTER_VALUE_{index}"),
            value.unwrap_or_default(),
        );
    }

    let status = command
        .status()
        .map_err(|error| format!("Could not update Windows user environment variables: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("Windows rejected the environment variable update.".into())
    }
}

#[cfg(windows)]
fn powershell() -> Command {
    let mut command = Command::new("powershell.exe");
    command.args(["-NoLogo", "-NoProfile", "-NonInteractive"]);
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

#[cfg(windows)]
fn write_script() -> String {
    let mut lines = vec![
        "function Set-CcRouterValue([string]$Name, [string]$Value, [string]$Present) {".into(),
        "  if ($Present -eq '1') { [Environment]::SetEnvironmentVariable($Name, $Value, 'User') }"
            .into(),
        "  else { [Environment]::SetEnvironmentVariable($Name, $null, 'User') }".into(),
        "}".into(),
    ];
    for (index, name) in ROUTE_VARIABLES.iter().enumerate() {
        lines.push(format!(
            "Set-CcRouterValue '{name}' $env:CC_ROUTER_VALUE_{index} $env:CC_ROUTER_PRESENT_{index}"
        ));
    }
    lines.join("\n")
}

#[cfg(windows)]
fn normalize(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        if value.trim().is_empty() {
            None
        } else {
            Some(value)
        }
    })
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn generated_script_never_contains_route_secrets() {
        let script = write_script();
        assert!(script.contains("CC_ROUTER_VALUE_1"));
        assert!(!script.contains("ANTHROPIC_AUTH_TOKEN="));
    }
}

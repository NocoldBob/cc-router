use std::collections::HashMap;
use std::env;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use tauri::AppHandle;

use crate::backup;
use crate::credentials;
use crate::models::{
    ActionResult, CredentialStatus, LaunchReadiness, ProviderConfig, ProviderRoute, RuntimeInfo,
    UserRouteStatus, ROUTE_VARIABLES,
};
use crate::provider_store;
use crate::system_env;

#[cfg(windows)]
const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
const CLAUDE_MODE_VARIABLES: [&str; 4] = [
    "ANTHROPIC_API_KEY",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
    "CLAUDE_CODE_USE_FOUNDRY",
];

#[tauri::command]
pub fn runtime_info(cli_path: Option<String>) -> RuntimeInfo {
    let resolved = resolve_claude_cli(cli_path.as_deref());
    RuntimeInfo {
        native: true,
        platform: platform_name().into(),
        cli_available: resolved.is_some(),
        cli_path: resolved.map(|path| path.to_string_lossy().into_owned()),
        credential_store: credentials::credential_store_name().into(),
        persistent_route_supported: cfg!(windows),
    }
}

#[tauri::command]
pub fn get_launch_readiness(
    route: ProviderRoute,
    cli_path: Option<String>,
    working_directory: Option<String>,
) -> Result<LaunchReadiness, String> {
    let route_valid = route.validate().is_ok();
    let resolved_cli = resolve_claude_cli(cli_path.as_deref());
    let cli_available = resolved_cli.is_some();
    let credential_configured = if route_valid {
        credentials::provider_token_exists(&route.id)?
    } else {
        false
    };
    let working_directory_valid = validate_working_directory(working_directory).is_ok();
    let conflicting_variables = detect_conflicting_variables(|name| env::var_os(name));
    let ready = route_valid && cli_available && credential_configured && working_directory_valid;

    Ok(LaunchReadiness {
        route_valid,
        cli_available,
        cli_path: resolved_cli.map(|path| path.to_string_lossy().into_owned()),
        credential_configured,
        working_directory_valid,
        conflicting_variables,
        ready,
    })
}

#[tauri::command]
pub fn get_credential_status(provider_id: String) -> Result<CredentialStatus, String> {
    Ok(CredentialStatus {
        configured: credentials::provider_token_exists(&provider_id)?,
        provider_id,
    })
}

#[tauri::command]
pub fn save_credential(provider_id: String, token: String) -> Result<CredentialStatus, String> {
    credentials::save_provider_token(&provider_id, &token)?;
    Ok(CredentialStatus {
        provider_id,
        configured: true,
    })
}

#[tauri::command]
pub fn delete_credential(provider_id: String) -> Result<CredentialStatus, String> {
    credentials::delete_provider_token(&provider_id)?;
    Ok(CredentialStatus {
        provider_id,
        configured: false,
    })
}

#[tauri::command]
pub fn sync_provider_catalog(providers: Vec<ProviderConfig>) -> Result<(), String> {
    provider_store::save_provider_catalog(&providers)
}

#[tauri::command]
pub fn get_user_route_status(
    app: AppHandle,
    route: ProviderRoute,
) -> Result<UserRouteStatus, String> {
    route.validate()?;
    #[cfg(not(windows))]
    {
        let _ = app;
        return Ok(UserRouteStatus {
            route: Default::default(),
            matches_selected: false,
            backup_available: false,
        });
    }
    #[cfg(windows)]
    {
        let current = system_env::read_user_route()?.snapshot;
        let expected = route
            .environment(String::new())
            .into_iter()
            .collect::<HashMap<_, _>>();
        let matches_selected = ROUTE_VARIABLES
            .iter()
            .filter(|name| **name != "ANTHROPIC_AUTH_TOKEN")
            .all(|name| expected.get(*name).map(String::as_str) == snapshot_value(&current, name));
        Ok(UserRouteStatus {
            route: current,
            matches_selected,
            backup_available: backup::exists(&app),
        })
    }
}

#[tauri::command]
pub fn launch_claude(
    route: ProviderRoute,
    cli_path: Option<String>,
    working_directory: Option<String>,
) -> Result<ActionResult, String> {
    route.validate()?;
    let token = credentials::read_provider_token(&route.id)?;
    let executable = resolve_claude_cli(cli_path.as_deref()).ok_or_else(|| {
        "Claude Code CLI was not found. Configure its executable path first.".to_string()
    })?;
    let working_directory = validate_working_directory(working_directory)?;
    let environment = route.environment(token);

    let child = launch_isolated_process(&executable, working_directory.as_deref(), environment)?;

    Ok(ActionResult {
        message: format!(
            "Claude Code launched with the {} route.",
            route.display_name
        ),
        changed_variables: Vec::new(),
        process_id: Some(child.id()),
    })
}

#[tauri::command]
pub fn apply_user_route(app: AppHandle, route: ProviderRoute) -> Result<ActionResult, String> {
    persistent_route_guard()?;
    route.validate()?;
    let token = credentials::read_provider_token(&route.id)?;
    let previous = system_env::read_user_route()?;
    backup::save(&app, &previous)?;

    if let Err(error) = system_env::write_provider_route(&route, token) {
        let _ = system_env::restore_user_route(&previous.snapshot, previous.auth_token);
        return Err(error);
    }

    Ok(ActionResult {
        message: format!(
            "{} is now the Windows user default. Restart terminals and VS Code to use it.",
            route.display_name
        ),
        changed_variables: ROUTE_VARIABLES.iter().map(|name| (*name).into()).collect(),
        process_id: None,
    })
}

#[tauri::command]
pub fn clear_user_route(app: AppHandle) -> Result<ActionResult, String> {
    persistent_route_guard()?;
    let previous = system_env::read_user_route()?;
    backup::save(&app, &previous)?;
    system_env::clear_user_route()?;

    Ok(ActionResult {
        message: "Windows user default route cleared. Restart terminals and VS Code.".into(),
        changed_variables: ROUTE_VARIABLES.iter().map(|name| (*name).into()).collect(),
        process_id: None,
    })
}

#[tauri::command]
pub fn rollback_user_route(app: AppHandle) -> Result<ActionResult, String> {
    persistent_route_guard()?;
    let (snapshot, token) = backup::load(&app)?;
    system_env::restore_user_route(&snapshot, token)?;
    backup::clear(&app)?;

    Ok(ActionResult {
        message: "The previous Windows user route was restored. Restart affected apps.".into(),
        changed_variables: ROUTE_VARIABLES.iter().map(|name| (*name).into()).collect(),
        process_id: None,
    })
}

fn resolve_claude_cli(custom_path: Option<&str>) -> Option<PathBuf> {
    if let Some(custom_path) = custom_path.map(str::trim).filter(|path| !path.is_empty()) {
        let path = PathBuf::from(custom_path);
        if path.is_file() {
            return Some(path);
        }
    }

    #[cfg(windows)]
    if let Ok(output) = Command::new("where.exe").arg("claude").output() {
        if output.status.success() {
            if let Some(path) = String::from_utf8_lossy(&output.stdout)
                .lines()
                .map(str::trim)
                .map(PathBuf::from)
                .find(|path| path.is_file())
            {
                return Some(path);
            }
        }
    }

    #[cfg(target_os = "linux")]
    if let Some(path) = find_in_path("claude") {
        return Some(path);
    }

    let mut candidates = Vec::new();
    #[cfg(windows)]
    {
        if let Some(profile) = env::var_os("USERPROFILE") {
            candidates.push(PathBuf::from(profile).join(".local\\bin\\claude.exe"));
        }
        if let Some(app_data) = env::var_os("APPDATA") {
            candidates.push(PathBuf::from(app_data).join("npm\\claude.cmd"));
        }
        if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
            candidates
                .push(PathBuf::from(local_app_data).join("Microsoft\\WinGet\\Links\\claude.exe"));
        }
    }
    #[cfg(target_os = "linux")]
    if let Some(home) = env::var_os("HOME") {
        let home = PathBuf::from(home);
        candidates.push(home.join(".local/bin/claude"));
        candidates.push(home.join(".npm-global/bin/claude"));
    }
    candidates.into_iter().find(|path| path.is_file())
}

fn platform_name() -> &'static str {
    #[cfg(windows)]
    return "windows";
    #[cfg(target_os = "linux")]
    return "linux";
    #[allow(unreachable_code)]
    "unsupported"
}

fn persistent_route_guard() -> Result<(), String> {
    if cfg!(windows) {
        Ok(())
    } else {
        Err("Persistent default routing is not available on Ubuntu. Use process-isolated launch or the VS Code Companion.".into())
    }
}

fn configure_isolated_environment(
    command: &mut Command,
    environment: Vec<(String, String)>,
    working_directory: Option<&Path>,
) {
    for name in CLAUDE_MODE_VARIABLES.iter().chain(ROUTE_VARIABLES.iter()) {
        command.env_remove(name);
    }
    command.envs(environment);
    if let Some(directory) = working_directory {
        command.current_dir(directory);
    }
}

#[cfg(windows)]
fn launch_isolated_process(
    executable: &Path,
    working_directory: Option<&Path>,
    environment: Vec<(String, String)>,
) -> Result<Child, String> {
    let mut command = Command::new("powershell.exe");
    command
        .args(["-NoLogo", "-NoExit", "-Command"])
        .arg(format!(
            "& {}",
            powershell_quote(&executable.to_string_lossy())
        ))
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .creation_flags(CREATE_NEW_CONSOLE);
    configure_isolated_environment(&mut command, environment, working_directory);
    command
        .spawn()
        .map_err(|error| format!("Could not launch Claude Code: {error}"))
}

#[cfg(target_os = "linux")]
fn launch_isolated_process(
    executable: &Path,
    working_directory: Option<&Path>,
    environment: Vec<(String, String)>,
) -> Result<Child, String> {
    let (terminal, arguments) = resolve_linux_terminal().ok_or_else(|| {
        "No supported terminal emulator was found. Install GNOME Terminal, Konsole, Kitty, or Alacritty.".to_string()
    })?;
    let mut command = Command::new(terminal);
    command
        .args(arguments)
        .arg(executable)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    configure_isolated_environment(&mut command, environment, working_directory);
    command
        .spawn()
        .map_err(|error| format!("Could not launch Claude Code terminal: {error}"))
}

#[cfg(target_os = "linux")]
fn resolve_linux_terminal() -> Option<(PathBuf, &'static [&'static str])> {
    [
        ("x-terminal-emulator", &["-e"][..]),
        ("gnome-terminal", &["--"][..]),
        ("konsole", &["-e"][..]),
        ("kitty", &["--"][..]),
        ("alacritty", &["-e"][..]),
    ]
    .into_iter()
    .find_map(|(name, arguments)| find_in_path(name).map(|path| (path, arguments)))
}

#[cfg(target_os = "linux")]
fn find_in_path(name: &str) -> Option<PathBuf> {
    env::var_os("PATH").and_then(|path| {
        env::split_paths(&path)
            .map(|directory| directory.join(name))
            .find(|candidate| candidate.is_file() && is_executable(candidate))
    })
}

#[cfg(target_os = "linux")]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.metadata()
        .is_ok_and(|metadata| metadata.permissions().mode() & 0o111 != 0)
}

fn validate_working_directory(value: Option<String>) -> Result<Option<PathBuf>, String> {
    let Some(value) = value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };
    let path = Path::new(&value);
    if path.is_dir() {
        Ok(Some(path.to_path_buf()))
    } else {
        Err("The selected working directory does not exist.".into())
    }
}

fn detect_conflicting_variables<F>(read_variable: F) -> Vec<String>
where
    F: Fn(&str) -> Option<OsString>,
{
    CLAUDE_MODE_VARIABLES
        .iter()
        .chain(ROUTE_VARIABLES.iter())
        .filter(|name| read_variable(name).is_some())
        .map(|name| (*name).to_string())
        .collect()
}

#[cfg(windows)]
fn powershell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn snapshot_value<'a>(snapshot: &'a crate::models::RouteSnapshot, name: &str) -> Option<&'a str> {
    match name {
        "ANTHROPIC_BASE_URL" => snapshot.base_url.as_deref(),
        "ANTHROPIC_MODEL" => snapshot.model.as_deref(),
        "ANTHROPIC_DEFAULT_OPUS_MODEL" => snapshot.opus_model.as_deref(),
        "ANTHROPIC_DEFAULT_SONNET_MODEL" => snapshot.sonnet_model.as_deref(),
        "ANTHROPIC_DEFAULT_HAIKU_MODEL" => snapshot.haiku_model.as_deref(),
        "ANTHROPIC_DEFAULT_FABLE_MODEL" => snapshot.fable_model.as_deref(),
        "CLAUDE_CODE_SUBAGENT_MODEL" => snapshot.subagent_model.as_deref(),
        "CLAUDE_CODE_EFFORT_LEVEL" => snapshot.effort_level.as_deref(),
        "CLAUDE_CODE_AUTO_COMPACT_WINDOW" => snapshot.auto_compact_window.as_deref(),
        "CLAUDE_CODE_MAX_CONTEXT_TOKENS" => snapshot.max_context_tokens.as_deref(),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[cfg(windows)]
    #[test]
    fn quotes_powershell_paths() {
        assert_eq!(
            powershell_quote("C:\\User's\\claude.cmd"),
            "'C:\\User''s\\claude.cmd'"
        );
    }

    #[test]
    fn conflict_diagnostics_return_names_without_values() {
        let environment = HashMap::from([
            ("ANTHROPIC_API_KEY", OsString::from("must-not-leak")),
            ("ANTHROPIC_MODEL", OsString::from("old-model")),
            ("UNRELATED", OsString::from("ignored")),
        ]);

        let conflicts = detect_conflicting_variables(|name| environment.get(name).cloned());

        assert_eq!(conflicts, ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"]);
        assert!(!format!("{conflicts:?}").contains("must-not-leak"));
        assert!(!format!("{conflicts:?}").contains("old-model"));
    }
}

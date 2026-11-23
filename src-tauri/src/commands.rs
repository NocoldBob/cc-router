use std::collections::HashMap;
use std::env;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use tauri::{AppHandle, State};

use crate::backup;
use crate::credentials;
use crate::diagnostics::{self, DiagnosticsReport};
use crate::launch;
use crate::models::{
    ActionResult, CredentialStatus, LaunchReadiness, ProviderConfig, ProviderRoute, RuntimeInfo,
    UserRouteStatus, ROUTE_VARIABLES,
};
use crate::provider_store;
use crate::sessions::{SessionInfo, SessionRegistry, SessionTarget};
use crate::system_env;

#[cfg(windows)]
const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

#[tauri::command]
pub fn runtime_info(cli_path: Option<String>) -> RuntimeInfo {
    let resolved = launch::resolve_claude_cli(cli_path.as_deref());
    RuntimeInfo {
        native: true,
        platform: launch::platform_name().into(),
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
    let resolved_cli = launch::resolve_claude_cli(cli_path.as_deref());
    let cli_available = resolved_cli.is_some();
    let credential_configured = if route_valid {
        credentials::provider_token_exists(&route.id)?
    } else {
        false
    };
    let working_directory_valid = launch::validate_working_directory(working_directory).is_ok();
    let conflicting_variables = launch::detect_conflicting_variables(|name| env::var_os(name));
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
    sessions: State<'_, Mutex<SessionRegistry>>,
    route: ProviderRoute,
    cli_path: Option<String>,
    working_directory: Option<String>,
) -> Result<ActionResult, String> {
    route.validate()?;
    let token = credentials::read_provider_token(&route.id)?;
    let executable = launch::resolve_claude_cli(cli_path.as_deref()).ok_or_else(|| {
        "Claude Code CLI was not found. Configure its executable path first.".to_string()
    })?;
    let working_directory = launch::validate_working_directory(working_directory)?;
    let environment = route.environment(token);

    let child = launch_isolated_process(&executable, working_directory.as_deref(), environment)?;
    let message = format!(
        "Claude Code launched with the {} route.",
        route.display_name
    );
    record_session(
        &sessions,
        child,
        &route,
        SessionTarget::Claude,
        working_directory,
    );

    Ok(ActionResult {
        message,
        changed_variables: Vec::new(),
        process_id: None,
    })
}

/// Opens a plain terminal window whose process environment already carries
/// the selected route, so any `claude` invocation inside it is isolated
/// without touching the user environment.
#[tauri::command]
pub fn launch_terminal(
    sessions: State<'_, Mutex<SessionRegistry>>,
    route: ProviderRoute,
    working_directory: Option<String>,
) -> Result<ActionResult, String> {
    route.validate()?;
    let token = credentials::read_provider_token(&route.id)?;
    let working_directory = launch::validate_working_directory(working_directory)?;
    let environment = route.environment(token);

    let child = launch::launch_isolated_terminal(working_directory.as_deref(), environment)?;
    let message = format!(
        "An isolated terminal opened with the {} route.",
        route.display_name
    );
    record_session(
        &sessions,
        child,
        &route,
        SessionTarget::Terminal,
        working_directory,
    );

    Ok(ActionResult {
        message,
        changed_variables: Vec::new(),
        process_id: None,
    })
}

/// Opens a VS Code window on the selected working directory. The workspace is
/// recorded in the shared secret-free catalog so the VS Code Companion routes
/// every Claude Code session in it through the chosen Provider; the window
/// process itself also inherits the isolated route environment for fresh VS
/// Code launches.
#[tauri::command]
pub fn launch_vscode(
    sessions: State<'_, Mutex<SessionRegistry>>,
    route: ProviderRoute,
    working_directory: Option<String>,
) -> Result<ActionResult, String> {
    route.validate()?;
    let working_directory = launch::validate_working_directory(working_directory)?
        .ok_or_else(|| "Choose a working directory to open in VS Code first.".to_string())?;
    let token = credentials::read_provider_token(&route.id)?;
    provider_store::select_provider_for_workspace(&working_directory, &route.id)
        .map_err(|error| format!("Could not bind the workspace route: {error}"))?;
    let executable = resolve_vscode_cli().ok_or_else(|| {
        "The VS Code CLI (code) was not found. Install VS Code or add code to PATH.".to_string()
    })?;
    let environment = route.environment(token);

    let mut command = Command::new(executable);
    command
        .arg("--new-window")
        .arg(&working_directory)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    launch::configure_isolated_environment(&mut command, environment, Some(&working_directory));
    let child = command
        .spawn()
        .map_err(|error| format!("Could not launch VS Code: {error}"))?;
    let message = format!(
        "VS Code opened with the {} route for this workspace.",
        route.display_name
    );
    record_session(
        &sessions,
        child,
        &route,
        SessionTarget::VsCode,
        Some(working_directory),
    );

    Ok(ActionResult {
        message,
        changed_variables: Vec::new(),
        process_id: None,
    })
}

/// Lists sessions this CC Router instance launched, with live status. No
/// session content, environment value, or token is ever included.
#[tauri::command]
pub fn list_sessions(sessions: State<'_, Mutex<SessionRegistry>>) -> Vec<SessionInfo> {
    sessions
        .lock()
        .map(|mut registry| registry.list())
        .unwrap_or_default()
}

#[tauri::command]
pub fn kill_session(
    sessions: State<'_, Mutex<SessionRegistry>>,
    session_id: u64,
) -> Result<SessionInfo, String> {
    sessions
        .lock()
        .map_err(|_| "The session registry is unavailable.".to_string())?
        .kill(session_id)
}

/// Builds a redacted diagnostics report for issue reports. Only environment
/// variable names, boolean credential flags, and home-redacted paths leave
/// the process.
#[tauri::command]
pub fn export_diagnostics(cli_path: Option<String>) -> DiagnosticsReport {
    let resolved_cli = launch::resolve_claude_cli(cli_path.as_deref());
    diagnostics::collect_diagnostics(
        launch::platform_name(),
        resolved_cli.is_some(),
        resolved_cli.map(|path| path.to_string_lossy().into_owned()),
        cfg!(windows),
        launch::detect_conflicting_variables(|name| env::var_os(name)),
    )
}

fn record_session(
    sessions: &State<'_, Mutex<SessionRegistry>>,
    child: Child,
    route: &ProviderRoute,
    target: SessionTarget,
    working_directory: Option<PathBuf>,
) {
    if let Ok(mut registry) = sessions.lock() {
        registry.record(
            child,
            &route.id,
            &route.display_name,
            target,
            working_directory.map(|directory| directory.to_string_lossy().into_owned()),
        );
    }
}

#[tauri::command]
pub fn apply_user_route(app: AppHandle, route: ProviderRoute) -> Result<ActionResult, String> {
    launch::persistent_route_guard()?;
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
    launch::persistent_route_guard()?;
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
    launch::persistent_route_guard()?;
    let (snapshot, token) = backup::load(&app)?;
    system_env::restore_user_route(&snapshot, token)?;
    backup::clear(&app)?;

    Ok(ActionResult {
        message: "The previous Windows user route was restored. Restart affected apps.".into(),
        changed_variables: ROUTE_VARIABLES.iter().map(|name| (*name).into()).collect(),
        process_id: None,
    })
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
    launch::configure_isolated_environment(&mut command, environment, working_directory);
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
    let (terminal, arguments) = launch::resolve_linux_terminal().ok_or_else(|| {
        "No supported terminal emulator was found. Install GNOME Terminal, Konsole, Kitty, or Alacritty.".to_string()
    })?;
    let mut command = Command::new(terminal);
    command
        .args(arguments)
        .arg(executable)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    launch::configure_isolated_environment(&mut command, environment, working_directory);
    command
        .spawn()
        .map_err(|error| format!("Could not launch Claude Code terminal: {error}"))
}

fn resolve_vscode_cli() -> Option<PathBuf> {
    #[cfg(windows)]
    if let Ok(output) = Command::new("where.exe").arg("code").output() {
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
    if let Some(path) = launch::find_in_path("code") {
        return Some(path);
    }

    let mut candidates = Vec::new();
    #[cfg(windows)]
    {
        if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
            candidates.push(
                PathBuf::from(&local_app_data).join("Programs\\Microsoft VS Code\\bin\\code.cmd"),
            );
        }
        if let Some(program_files) = env::var_os("ProgramFiles") {
            candidates.push(PathBuf::from(&program_files).join("Microsoft VS Code\\bin\\code.cmd"));
        }
    }
    #[cfg(target_os = "linux")]
    {
        candidates.push(PathBuf::from("/usr/bin/code"));
        candidates.push(PathBuf::from("/snap/bin/code"));
    }
    candidates.into_iter().find(|path| path.is_file())
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
        "API_TIMEOUT_MS" => snapshot.api_timeout_ms.as_deref(),
        "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC" => {
            snapshot.disable_nonessential_traffic.as_deref()
        }
        "CLAUDE_CODE_MAX_OUTPUT_TOKENS" => snapshot.max_output_tokens.as_deref(),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn quotes_powershell_paths() {
        assert_eq!(
            powershell_quote("C:\\User's\\claude.cmd"),
            "'C:\\User''s\\claude.cmd'"
        );
    }
}

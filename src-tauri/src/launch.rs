use std::env;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

/// Variables that select a competing Claude Code backend. Isolated launches
/// always clear them so the injected route cannot be overridden.
pub const CLAUDE_MODE_VARIABLES: [&str; 4] = [
    "ANTHROPIC_API_KEY",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
    "CLAUDE_CODE_USE_FOUNDRY",
];

pub fn platform_name() -> &'static str {
    #[cfg(windows)]
    return "windows";
    #[cfg(target_os = "linux")]
    return "linux";
    #[allow(unreachable_code)]
    "unsupported"
}

pub fn persistent_route_guard() -> Result<(), String> {
    if cfg!(windows) {
        Ok(())
    } else {
        Err("Persistent default routing is not available on Ubuntu. Use process-isolated launch or the VS Code Companion.".into())
    }
}

/// Applies an isolated route environment to a child process: competing
/// Claude variables are removed first so inherited user/system values can
/// never leak into the launched session.
pub fn configure_isolated_environment(
    command: &mut Command,
    environment: Vec<(String, String)>,
    working_directory: Option<&Path>,
) {
    for name in CLAUDE_MODE_VARIABLES
        .iter()
        .chain(crate::models::ROUTE_VARIABLES.iter())
    {
        command.env_remove(name);
    }
    command.envs(environment);
    if let Some(directory) = working_directory {
        command.current_dir(directory);
    }
}

#[cfg(windows)]
pub fn launch_isolated_terminal(
    working_directory: Option<&Path>,
    environment: Vec<(String, String)>,
) -> Result<Child, String> {
    let mut command = Command::new("cmd.exe");
    command
        .args(["/K"])
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .creation_flags(CREATE_NEW_CONSOLE);
    configure_isolated_environment(&mut command, environment, working_directory);
    command
        .spawn()
        .map_err(|error| format!("Could not open an isolated terminal: {error}"))
}

#[cfg(target_os = "linux")]
pub fn launch_isolated_terminal(
    working_directory: Option<&Path>,
    environment: Vec<(String, String)>,
) -> Result<Child, String> {
    let (terminal, arguments) = resolve_linux_terminal().ok_or_else(|| {
        "No supported terminal emulator was found. Install GNOME Terminal, Konsole, Kitty, or Alacritty.".to_string()
    })?;
    let shell = env::var_os("SHELL")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/bin/bash"));
    let mut command = Command::new(terminal);
    command
        .args(arguments)
        .arg(shell)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    configure_isolated_environment(&mut command, environment, working_directory);
    command
        .spawn()
        .map_err(|error| format!("Could not open an isolated terminal: {error}"))
}

#[cfg(target_os = "linux")]
pub fn resolve_linux_terminal() -> Option<(PathBuf, &'static [&'static str])> {
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

pub fn resolve_claude_cli(custom_path: Option<&str>) -> Option<PathBuf> {
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

pub fn validate_working_directory(value: Option<String>) -> Result<Option<PathBuf>, String> {
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

pub fn detect_conflicting_variables<F>(read_variable: F) -> Vec<String>
where
    F: Fn(&str) -> Option<OsString>,
{
    CLAUDE_MODE_VARIABLES
        .iter()
        .chain(crate::models::ROUTE_VARIABLES.iter())
        .filter(|name| read_variable(name).is_some())
        .map(|name| (*name).to_string())
        .collect()
}

#[cfg(target_os = "linux")]
pub fn find_in_path(name: &str) -> Option<PathBuf> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

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

    #[cfg(target_os = "linux")]
    #[test]
    fn ubuntu_disables_persistent_user_routing() {
        assert_eq!(platform_name(), "linux");
        let error = persistent_route_guard().expect_err("Ubuntu must remain process-scoped");
        assert!(error.contains("not available on Ubuntu"));
    }
}

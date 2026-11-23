use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::credentials;
use crate::models::RouteSnapshot;
use crate::system_env::FullRouteState;

const BACKUP_FILE: &str = "route-backup.json";

/// Path-based core, usable from both the Tauri commands and the standalone
/// helper binary. The backup JSON never contains the API token; the token is
/// stored separately in the OS credential store.
pub fn save_to(directory: &Path, state: &FullRouteState) -> Result<(), String> {
    credentials::save_backup_token(state.auth_token.as_deref())?;
    let path = backup_path_in(directory)?;
    let temporary = path.with_extension("json.tmp");
    let json = serde_json::to_vec_pretty(&state.snapshot)
        .map_err(|error| format!("Could not serialize the route backup: {error}"))?;
    fs::write(&temporary, json)
        .map_err(|error| format!("Could not write the route backup: {error}"))?;
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("Could not replace the previous route backup: {error}"))?;
    }
    fs::rename(temporary, path)
        .map_err(|error| format!("Could not finalize the route backup: {error}"))
}

pub fn load_from(directory: &Path) -> Result<(RouteSnapshot, Option<String>), String> {
    let path = directory.join(BACKUP_FILE);
    if !path.exists() {
        return Err("No previous Windows route is available to restore.".into());
    }
    let json =
        fs::read(&path).map_err(|error| format!("Could not read the route backup: {error}"))?;
    let snapshot = serde_json::from_slice(&json)
        .map_err(|error| format!("Could not parse the route backup: {error}"))?;
    let token = credentials::read_backup_token()?;
    Ok((snapshot, token))
}

pub fn exists_in(directory: &Path) -> bool {
    directory.join(BACKUP_FILE).exists()
}

pub fn clear_at(directory: &Path) -> Result<(), String> {
    let path = directory.join(BACKUP_FILE);
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("Could not remove the route backup: {error}"))?;
    }
    credentials::delete_backup_token()
}

pub fn save(app: &AppHandle, state: &FullRouteState) -> Result<(), String> {
    save_to(&app_data_directory(app)?, state)
}

pub fn load(app: &AppHandle) -> Result<(RouteSnapshot, Option<String>), String> {
    load_from(&app_data_directory(app)?)
}

pub fn exists(app: &AppHandle) -> bool {
    app_data_directory(app).is_ok_and(|directory| exists_in(&directory))
}

pub fn clear(app: &AppHandle) -> Result<(), String> {
    clear_at(&app_data_directory(app)?)
}

fn app_data_directory(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate the app data directory: {error}"))
}

fn backup_path_in(directory: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(directory)
        .map_err(|error| format!("Could not create the app data directory: {error}"))?;
    Ok(directory.join(BACKUP_FILE))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backup_schema_contains_no_token_field() {
        let snapshot = RouteSnapshot {
            auth_token_set: true,
            ..RouteSnapshot::default()
        };
        let json = serde_json::to_string(&snapshot).unwrap();

        assert!(json.contains("authTokenSet"));
        assert!(!json.contains("authToken\""));
    }

    #[test]
    fn old_six_variable_backups_remain_readable() {
        let json = r#"{"baseUrl":"https://example.com","model":"old-model","authTokenSet":true}"#;
        let snapshot: RouteSnapshot = serde_json::from_str(json).unwrap();

        assert_eq!(snapshot.model.as_deref(), Some("old-model"));
        assert!(snapshot.subagent_model.is_none());
        assert!(snapshot.auth_token_set);
    }

    #[test]
    fn missing_backup_reports_a_readable_error() {
        let directory = std::env::temp_dir().join("cc-router-backup-test-absent");
        let _ = fs::remove_dir_all(&directory);

        let error = load_from(&directory).expect_err("missing backup must fail");

        assert!(error.contains("No previous Windows route"));
    }
}

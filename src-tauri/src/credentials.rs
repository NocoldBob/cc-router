use crate::models::validate_provider_id;
use std::sync::Mutex;

const PROVIDER_SERVICE: &str = "CC Router Provider API Key";
const BACKUP_SERVICE: &str = "CC Router Route Backup";
const BACKUP_USER: &str = "previous-anthropic-auth-token";
static CREDENTIAL_LOCK: Mutex<()> = Mutex::new(());

fn entry(service: &str, username: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(service, username)
        .map_err(|error| format!("{} is unavailable: {error}", credential_store_name()))
}

pub fn credential_store_name() -> &'static str {
    #[cfg(windows)]
    return "Windows Credential Manager";
    #[cfg(target_os = "linux")]
    return "Linux Secret Service";
    #[allow(unreachable_code)]
    "System credential store"
}

pub fn save_provider_token(provider_id: &str, token: &str) -> Result<(), String> {
    let _guard = credential_guard()?;
    validate_provider_id(provider_id)?;
    let token = token.trim();
    if token.is_empty() {
        return Err("API key cannot be empty.".into());
    }
    entry(PROVIDER_SERVICE, provider_id)?
        .set_password(token)
        .map_err(|error| format!("Could not save API key: {error}"))
}

pub fn read_provider_token(provider_id: &str) -> Result<String, String> {
    let _guard = credential_guard()?;
    validate_provider_id(provider_id)?;
    entry(PROVIDER_SERVICE, provider_id)?
        .get_password()
        .map_err(|error| match error {
            keyring::Error::NoEntry => "No API key is stored for this provider.".into(),
            _ => format!("Could not read API key: {error}"),
        })
}

pub fn provider_token_exists(provider_id: &str) -> Result<bool, String> {
    let _guard = credential_guard()?;
    validate_provider_id(provider_id)?;
    match entry(PROVIDER_SERVICE, provider_id)?.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(format!("Could not inspect API key: {error}")),
    }
}

pub fn delete_provider_token(provider_id: &str) -> Result<(), String> {
    let _guard = credential_guard()?;
    validate_provider_id(provider_id)?;
    delete_entry(PROVIDER_SERVICE, provider_id)
}

pub fn save_backup_token(token: Option<&str>) -> Result<(), String> {
    let _guard = credential_guard()?;
    match token {
        Some(token) => entry(BACKUP_SERVICE, BACKUP_USER)?
            .set_password(token)
            .map_err(|error| format!("Could not secure the route backup: {error}")),
        None => delete_entry(BACKUP_SERVICE, BACKUP_USER),
    }
}

pub fn read_backup_token() -> Result<Option<String>, String> {
    let _guard = credential_guard()?;
    match entry(BACKUP_SERVICE, BACKUP_USER)?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("Could not read the route backup: {error}")),
    }
}

pub fn delete_backup_token() -> Result<(), String> {
    let _guard = credential_guard()?;
    delete_entry(BACKUP_SERVICE, BACKUP_USER)
}

fn credential_guard() -> Result<std::sync::MutexGuard<'static, ()>, String> {
    CREDENTIAL_LOCK
        .lock()
        .map_err(|_| "Credential store access lock was poisoned.".into())
}

fn delete_entry(service: &str, username: &str) -> Result<(), String> {
    match entry(service, username)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Could not remove credential: {error}")),
    }
}

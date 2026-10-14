use std::process::Child;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

/// What kind of process CC Router launched for a session. Session records only
/// ever describe the launcher relationship (Provider name, target, directory);
/// they never carry environment values, tokens, or session content.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionTarget {
    Claude,
    Terminal,
    VsCode,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionStatus {
    Running,
    /// The launcher process exited or detached. Some Linux terminals fork into
    /// a shared server, so a detached terminal window may still be open.
    Exited,
}

struct SessionEntry {
    id: u64,
    pid: u32,
    provider_id: String,
    provider_name: String,
    target: SessionTarget,
    working_directory: Option<String>,
    started_at_unix: u64,
    child: Child,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: u64,
    pub pid: u32,
    pub provider_id: String,
    pub provider_name: String,
    pub target: SessionTarget,
    pub working_directory: Option<String>,
    pub started_at_unix: u64,
    pub status: SessionStatus,
}

#[derive(Default)]
pub struct SessionRegistry {
    entries: Vec<SessionEntry>,
    next_id: u64,
}

impl SessionRegistry {
    #[allow(clippy::too_many_arguments)]
    pub fn record(
        &mut self,
        child: Child,
        provider_id: &str,
        provider_name: &str,
        target: SessionTarget,
        working_directory: Option<String>,
    ) -> SessionInfo {
        self.next_id += 1;
        let entry = SessionEntry {
            id: self.next_id,
            pid: child.id(),
            provider_id: provider_id.to_string(),
            provider_name: provider_name.to_string(),
            target,
            working_directory,
            started_at_unix: now_unix(),
            child,
        };
        let info = session_snapshot(&entry, SessionStatus::Running);
        self.entries.push(entry);
        info
    }

    /// Snapshots every recorded session, refreshing liveness via `try_wait`.
    /// Sessions launched by earlier app runs are intentionally absent: the
    /// registry only tracks processes this instance started.
    pub fn list(&mut self) -> Vec<SessionInfo> {
        self.entries
            .iter_mut()
            .map(|entry| {
                let status = liveness(entry);
                session_snapshot(entry, status)
            })
            .collect()
    }

    /// Best-effort stop of the launcher process CC Router spawned. Child
    /// processes started inside a terminal window may survive; this matches
    /// the documented process-isolation model.
    pub fn kill(&mut self, session_id: u64) -> Result<SessionInfo, String> {
        let entry = self
            .entries
            .iter_mut()
            .find(|entry| entry.id == session_id)
            .ok_or_else(|| "The session is unknown to this CC Router instance.".to_string())?;
        if matches!(liveness(entry), SessionStatus::Running) {
            entry
                .child
                .kill()
                .map_err(|error| format!("Could not stop the session process: {error}"))?;
            // Reap the process so the reported status reflects the kill.
            let _ = entry.child.wait();
        }
        let status = liveness(entry);
        Ok(session_snapshot(entry, status))
    }
}

fn liveness(entry: &mut SessionEntry) -> SessionStatus {
    match entry.child.try_wait() {
        Ok(None) => SessionStatus::Running,
        Ok(Some(_)) | Err(_) => SessionStatus::Exited,
    }
}

fn session_snapshot(entry: &SessionEntry, status: SessionStatus) -> SessionInfo {
    SessionInfo {
        id: entry.id,
        pid: entry.pid,
        provider_id: entry.provider_id.clone(),
        provider_name: entry.provider_name.clone(),
        target: entry.target,
        working_directory: entry.working_directory.clone(),
        started_at_unix: entry.started_at_unix,
        status,
    }
}

pub fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spawn_sleeping_child() -> Child {
        #[cfg(windows)]
        let mut command = {
            let mut command = std::process::Command::new("cmd.exe");
            command.args(["/C", "ping", "-n", "30", "127.0.0.1"]);
            command
        };
        #[cfg(not(windows))]
        let mut command = {
            let mut command = std::process::Command::new("sleep");
            command.arg("30");
            command
        };
        command
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .unwrap()
    }

    #[test]
    fn records_and_lists_sessions_without_environment_data() {
        let mut registry = SessionRegistry::default();
        let info = registry.record(
            spawn_sleeping_child(),
            "deepseek",
            "DeepSeek",
            SessionTarget::Terminal,
            Some("D:\\projects\\app".into()),
        );
        assert_eq!(info.status, SessionStatus::Running);
        assert_eq!(info.target, SessionTarget::Terminal);

        let listed = registry.list();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].provider_id, "deepseek");

        let json = serde_json::to_string(&listed).unwrap();
        assert!(!json.contains("ANTHROPIC_AUTH_TOKEN"));

        registry.kill(info.id).unwrap();
        let after = registry.list();
        assert_eq!(after[0].status, SessionStatus::Exited);
    }

    #[test]
    fn killing_an_unknown_session_fails() {
        let mut registry = SessionRegistry::default();
        assert!(registry.kill(42).is_err());
    }
}

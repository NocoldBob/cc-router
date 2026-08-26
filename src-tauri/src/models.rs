use serde::{Deserialize, Serialize};

pub const ROUTE_VARIABLES: [&str; 11] = [
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "ANTHROPIC_DEFAULT_FABLE_MODEL",
    "CLAUDE_CODE_SUBAGENT_MODEL",
    "CLAUDE_CODE_EFFORT_LEVEL",
    "CLAUDE_CODE_AUTO_COMPACT_WINDOW",
    "CLAUDE_CODE_MAX_CONTEXT_TOKENS",
];

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRoute {
    pub id: String,
    pub display_name: String,
    pub base_url: String,
    pub auth_env_name: String,
    pub main_model: String,
    pub fast_model: String,
    pub opus_model: String,
    pub sonnet_model: String,
    pub haiku_model: String,
    pub fable_model: String,
    pub subagent_model: String,
    pub effort_level: String,
    pub auto_compact_window: String,
    pub max_context_tokens: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    #[serde(flatten)]
    pub route: ProviderRoute,
    pub notes: String,
    pub enabled: bool,
    pub accent: String,
}

impl ProviderConfig {
    pub fn validate(&self) -> Result<(), String> {
        self.route.validate()?;
        if !matches!(self.accent.as_str(), "green" | "blue" | "orange" | "violet") {
            return Err("Provider accent is invalid.".into());
        }
        if self.notes.chars().any(|character| character == '\0') {
            return Err("Provider notes cannot contain null bytes.".into());
        }
        Ok(())
    }
}

impl ProviderRoute {
    pub fn validate(&self) -> Result<(), String> {
        validate_provider_id(&self.id)?;

        if self.display_name.trim().is_empty() {
            return Err("Provider display name is required.".into());
        }
        if !is_supported_url(&self.base_url) {
            return Err(
                "Base URL must use HTTP or HTTPS. Use HTTP only for trusted intranet routes."
                    .into(),
            );
        }
        if !is_env_name(&self.auth_env_name) {
            return Err("API key environment variable name is invalid.".into());
        }
        if self.main_model.trim().is_empty() {
            return Err("Main model is required.".into());
        }

        for value in [
            &self.base_url,
            &self.main_model,
            &self.fast_model,
            &self.opus_model,
            &self.sonnet_model,
            &self.haiku_model,
            &self.fable_model,
            &self.subagent_model,
            &self.effort_level,
            &self.auto_compact_window,
            &self.max_context_tokens,
        ] {
            if value
                .chars()
                .any(|character| matches!(character, '\r' | '\n' | '\0'))
            {
                return Err("Route values cannot contain line breaks or null bytes.".into());
            }
        }

        if !self.effort_level.trim().is_empty()
            && !matches!(
                self.effort_level.trim(),
                "low" | "medium" | "high" | "xhigh" | "max"
            )
        {
            return Err("Claude Code effort level is invalid.".into());
        }

        for value in [&self.auto_compact_window, &self.max_context_tokens] {
            if !value.trim().is_empty()
                && (!value.chars().all(|character| character.is_ascii_digit())
                    || value.trim() == "0")
            {
                return Err("Context window values must be positive integers.".into());
            }
        }

        Ok(())
    }

    pub fn environment(&self, token: String) -> Vec<(String, String)> {
        let opus = fallback(&self.opus_model, &self.main_model);
        let sonnet = fallback(&self.sonnet_model, &self.main_model);
        let haiku = if self.haiku_model.trim().is_empty() {
            fallback(&self.fast_model, &self.main_model)
        } else {
            self.haiku_model.trim().to_string()
        };
        let fable = fallback(&self.fable_model, &self.main_model);
        let subagent = if self.subagent_model.trim().is_empty() {
            fallback(&self.fast_model, &self.main_model)
        } else {
            self.subagent_model.trim().to_string()
        };

        let mut environment = vec![
            (ROUTE_VARIABLES[0].into(), self.base_url.trim().into()),
            (ROUTE_VARIABLES[1].into(), token),
            (ROUTE_VARIABLES[2].into(), self.main_model.trim().into()),
            (ROUTE_VARIABLES[3].into(), opus),
            (ROUTE_VARIABLES[4].into(), sonnet),
            (ROUTE_VARIABLES[5].into(), haiku),
            (ROUTE_VARIABLES[6].into(), fable),
            (ROUTE_VARIABLES[7].into(), subagent),
        ];
        for (name, value) in [
            (ROUTE_VARIABLES[8], &self.effort_level),
            (ROUTE_VARIABLES[9], &self.auto_compact_window),
            (ROUTE_VARIABLES[10], &self.max_context_tokens),
        ] {
            if !value.trim().is_empty() {
                environment.push((name.into(), value.trim().into()));
            }
        }
        environment
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    pub native: bool,
    pub platform: String,
    pub cli_available: bool,
    pub cli_path: Option<String>,
    pub credential_store: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchReadiness {
    pub route_valid: bool,
    pub cli_available: bool,
    pub cli_path: Option<String>,
    pub credential_configured: bool,
    pub working_directory_valid: bool,
    pub conflicting_variables: Vec<String>,
    pub ready: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialStatus {
    pub provider_id: String,
    pub configured: bool,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct RouteSnapshot {
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub opus_model: Option<String>,
    pub sonnet_model: Option<String>,
    pub haiku_model: Option<String>,
    pub fable_model: Option<String>,
    pub subagent_model: Option<String>,
    pub effort_level: Option<String>,
    pub auto_compact_window: Option<String>,
    pub max_context_tokens: Option<String>,
    pub auth_token_set: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserRouteStatus {
    #[serde(flatten)]
    pub route: RouteSnapshot,
    pub matches_selected: bool,
    pub backup_available: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionResult {
    pub message: String,
    pub changed_variables: Vec<String>,
    pub process_id: Option<u32>,
}

pub fn validate_provider_id(id: &str) -> Result<(), String> {
    let valid = !id.is_empty()
        && id.len() <= 80
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'));
    if valid {
        Ok(())
    } else {
        Err("Provider ID may only contain letters, numbers, '-' and '_'.".into())
    }
}

fn fallback(value: &str, fallback_value: &str) -> String {
    if value.trim().is_empty() {
        fallback_value.trim().to_string()
    } else {
        value.trim().to_string()
    }
}

fn is_env_name(value: &str) -> bool {
    let mut characters = value.chars();
    let Some(first) = characters.next() else {
        return false;
    };
    (first.is_ascii_uppercase() || first == '_')
        && characters.all(|character| {
            character.is_ascii_uppercase() || character.is_ascii_digit() || character == '_'
        })
}

fn is_supported_url(value: &str) -> bool {
    let normalized = value.trim().to_ascii_lowercase();
    normalized.starts_with("https://") || normalized.starts_with("http://")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn route() -> ProviderRoute {
        ProviderRoute {
            id: "deepseek".into(),
            display_name: "DeepSeek".into(),
            base_url: "https://api.deepseek.com/anthropic".into(),
            auth_env_name: "DEEPSEEK_API_KEY".into(),
            main_model: "deepseek-v4-pro[1m]".into(),
            fast_model: "deepseek-v4-flash".into(),
            opus_model: String::new(),
            sonnet_model: String::new(),
            haiku_model: String::new(),
            fable_model: String::new(),
            subagent_model: String::new(),
            effort_level: "max".into(),
            auto_compact_window: String::new(),
            max_context_tokens: String::new(),
        }
    }

    #[test]
    fn validates_and_builds_effective_environment() {
        let route = route();
        route.validate().unwrap();
        let environment = route.environment("secret".into());

        assert_eq!(environment[3].1, "deepseek-v4-pro[1m]");
        assert_eq!(environment[5].1, "deepseek-v4-flash");
        assert_eq!(environment[6].1, "deepseek-v4-pro[1m]");
        assert_eq!(environment[7].1, "deepseek-v4-flash");
        assert_eq!(environment[8].1, "max");
    }

    #[test]
    fn accepts_http_routes_and_rejects_invalid_routes() {
        let mut candidate = route();
        candidate.base_url = "http://192.168.10.24:8000/anthropic".into();
        assert!(candidate.validate().is_ok());

        candidate.base_url = "ftp://remote.example.com".into();
        assert!(candidate.validate().is_err());

        candidate.base_url = "https://remote.example.com".into();
        candidate.id = "bad id".into();
        assert!(candidate.validate().is_err());

        candidate.id = "valid-id".into();
        candidate.auto_compact_window = "1M".into();
        assert!(candidate.validate().is_err());
    }
}

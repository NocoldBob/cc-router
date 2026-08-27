use std::time::{Duration, Instant};

use serde::Serialize;

use crate::models::ProviderRoute;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const OVERALL_TIMEOUT: Duration = Duration::from_secs(15);
const PROBE_CONTENT: &str = "ping";
const ANTHROPIC_VERSION: &str = "2023-06-01";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProbeKind {
    Ok,
    Unreachable,
    Timeout,
    AuthFailed,
    ModelUnavailable,
    Overloaded,
    ServerError,
    Unexpected,
}

/// Sanitized probe outcome. Never carries response bodies, error text, or the
/// API token — only the classification, status code, latency, and model name
/// may cross the process boundary.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub kind: ProbeKind,
    pub latency_ms: Option<u64>,
    pub http_status: Option<u16>,
    pub tested_model: String,
}

impl ProbeResult {
    fn new(
        kind: ProbeKind,
        latency_ms: Option<u64>,
        http_status: Option<u16>,
        tested_model: String,
    ) -> Self {
        Self {
            kind,
            latency_ms,
            http_status,
            tested_model,
        }
    }
}

/// Sends one minimal, content-free Anthropic Messages request to the route's
/// endpoint. The probe payload is a fixed "ping" and never includes project
/// content.
pub fn probe_provider(route: &ProviderRoute, token: &str) -> ProbeResult {
    probe_with_timeouts(route, token, CONNECT_TIMEOUT, OVERALL_TIMEOUT)
}

fn probe_with_timeouts(
    route: &ProviderRoute,
    token: &str,
    connect_timeout: Duration,
    overall_timeout: Duration,
) -> ProbeResult {
    let tested_model = route.main_model.trim().to_string();
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(connect_timeout)
        .build();
    let payload = serde_json::json!({
        "model": tested_model,
        "max_tokens": 1,
        "messages": [{ "role": "user", "content": PROBE_CONTENT }],
    });

    let started = Instant::now();
    let response = agent
        .post(&messages_url(&route.base_url))
        .set("x-api-key", token)
        .set("authorization", &format!("Bearer {token}"))
        .set("anthropic-version", ANTHROPIC_VERSION)
        .set("content-type", "application/json")
        .timeout(overall_timeout)
        .send_json(payload);
    let latency_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);

    // The response is dropped unread: bodies stay out of results and logs.
    let result = match response {
        Ok(response) => ProbeResult::new(
            ProbeKind::Ok,
            Some(latency_ms),
            Some(response.status()),
            tested_model,
        ),
        Err(ureq::Error::Status(status, _response)) => ProbeResult::new(
            classify_status(status),
            Some(latency_ms),
            Some(status),
            tested_model,
        ),
        Err(ureq::Error::Transport(transport)) => {
            let kind = classify_transport(&transport);
            ProbeResult::new(kind, Some(latency_ms), None, tested_model)
        }
    };

    if !token.is_empty() {
        debug_assert!(serde_json::to_string(&result).is_ok_and(|json| !json.contains(token)));
    }
    result
}

fn classify_status(status: u16) -> ProbeKind {
    match status {
        401 | 403 => ProbeKind::AuthFailed,
        404 => ProbeKind::ModelUnavailable,
        429 | 529 => ProbeKind::Overloaded,
        500..=599 => ProbeKind::ServerError,
        _ => ProbeKind::Unexpected,
    }
}

/// Only in-flight stalls (read/overall timeouts after connecting) count as
/// `Timeout`. Connection-phase failures, including connect timeouts that
/// Windows reports as `TimedOut`, mean the endpoint cannot be reached.
fn classify_transport(error: &ureq::Transport) -> ProbeKind {
    if error.kind() == ureq::ErrorKind::Io && is_timeout(error) {
        ProbeKind::Timeout
    } else {
        ProbeKind::Unreachable
    }
}

fn is_timeout(error: &ureq::Transport) -> bool {
    use std::error::Error as _;
    let io_timed_out = error
        .source()
        .and_then(|source| source.downcast_ref::<std::io::Error>())
        .is_some_and(|io_error| io_error.kind() == std::io::ErrorKind::TimedOut);
    io_timed_out
        || error
            .message()
            .is_some_and(|message| message.to_ascii_lowercase().contains("timed out"))
}

fn messages_url(base_url: &str) -> String {
    format!("{}/v1/messages", base_url.trim().trim_end_matches('/'))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    const TOKEN: &str = "secret-test-token";

    fn route(base_url: String) -> ProviderRoute {
        ProviderRoute {
            id: "probe-test".into(),
            display_name: "Probe Test".into(),
            base_url,
            auth_env_name: "PROBE_TEST_API_KEY".into(),
            main_model: "probe-model".into(),
            fast_model: String::new(),
            opus_model: String::new(),
            sonnet_model: String::new(),
            haiku_model: String::new(),
            fable_model: String::new(),
            subagent_model: String::new(),
            effort_level: String::new(),
            auto_compact_window: String::new(),
            max_context_tokens: String::new(),
        }
    }

    /// Runs a one-shot fake Anthropic endpoint and returns its address plus a
    /// handle that yields the captured raw request.
    fn serve_once(
        status_line: &'static str,
        body: &'static str,
    ) -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = format!("http://{}", listener.local_addr().unwrap());
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut raw = Vec::new();
            let mut buffer = [0_u8; 4096];
            loop {
                let read = stream.read(&mut buffer).unwrap_or(0);
                if read == 0 {
                    break;
                }
                raw.extend_from_slice(&buffer[..read]);
                if request_complete(&raw) {
                    break;
                }
            }
            let response = format!(
                "{status_line}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                body.len()
            );
            stream.write_all(response.as_bytes()).unwrap();
            String::from_utf8_lossy(&raw).into_owned()
        });
        (address, handle)
    }

    fn request_complete(raw: &[u8]) -> bool {
        let text = String::from_utf8_lossy(raw);
        let Some((headers, body)) = text.split_once("\r\n\r\n") else {
            return false;
        };
        let content_length = headers
            .lines()
            .filter_map(|line| {
                line.to_ascii_lowercase()
                    .strip_prefix("content-length:")
                    .map(str::to_owned)
            })
            .find_map(|value| value.trim().parse::<usize>().ok())
            .unwrap_or(0);
        body.len() >= content_length
    }

    #[test]
    fn probe_reports_ok_without_leaking_the_token() {
        let (address, server) = serve_once("HTTP/1.1 200 OK", "{}");
        let result = probe_provider(&route(address), TOKEN);
        let request = server.join().unwrap();

        assert_eq!(result.kind, ProbeKind::Ok);
        assert_eq!(result.http_status, Some(200));
        assert!(result.latency_ms.is_some());
        assert_eq!(result.tested_model, "probe-model");

        assert!(request.starts_with("POST /v1/messages "));
        assert!(request.contains(&format!("x-api-key: {TOKEN}")));
        assert!(request.contains(&format!("authorization: Bearer {TOKEN}")));
        assert!(request.contains("\"ping\""));
        assert!(request.contains("\"probe-model\""));

        let json = serde_json::to_string(&result).unwrap();
        assert!(!json.contains(TOKEN));
    }

    #[test]
    fn probe_maps_http_failures_to_kinds() {
        for (status_line, expected) in [
            ("HTTP/1.1 401 Unauthorized", ProbeKind::AuthFailed),
            ("HTTP/1.1 404 Not Found", ProbeKind::ModelUnavailable),
            ("HTTP/1.1 429 Too Many Requests", ProbeKind::Overloaded),
            ("HTTP/1.1 503 Service Unavailable", ProbeKind::ServerError),
        ] {
            let (address, server) = serve_once(status_line, "{\"error\":\"redacted\"}");
            let result = probe_provider(&route(address), TOKEN);
            server.join().unwrap();

            assert_eq!(result.kind, expected, "status line: {status_line}");
            let json = serde_json::to_string(&result).unwrap();
            assert!(!json.contains(TOKEN));
            assert!(!json.contains("redacted"));
        }
    }

    #[test]
    fn probe_times_out_when_the_server_stalls() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = format!("http://{}", listener.local_addr().unwrap());
        let server = thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            thread::sleep(Duration::from_secs(2));
            drop(stream);
        });

        let result = probe_with_timeouts(
            &route(address),
            TOKEN,
            Duration::from_millis(200),
            Duration::from_millis(300),
        );
        server.join().unwrap();

        assert_eq!(result.kind, ProbeKind::Timeout);
    }

    #[test]
    fn probe_reports_unreachable_for_closed_ports() {
        let port = TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        let result = probe_with_timeouts(
            &route(format!("http://127.0.0.1:{port}")),
            TOKEN,
            Duration::from_millis(500),
            Duration::from_secs(2),
        );

        assert_eq!(result.kind, ProbeKind::Unreachable);
    }

    #[test]
    fn classify_status_covers_the_documented_kinds() {
        assert_eq!(classify_status(401), ProbeKind::AuthFailed);
        assert_eq!(classify_status(403), ProbeKind::AuthFailed);
        assert_eq!(classify_status(404), ProbeKind::ModelUnavailable);
        assert_eq!(classify_status(429), ProbeKind::Overloaded);
        assert_eq!(classify_status(529), ProbeKind::Overloaded);
        assert_eq!(classify_status(500), ProbeKind::ServerError);
        assert_eq!(classify_status(418), ProbeKind::Unexpected);
    }

    #[test]
    fn messages_url_handles_trailing_slashes() {
        assert_eq!(
            messages_url("https://example.com/anthropic/"),
            "https://example.com/anthropic/v1/messages"
        );
        assert_eq!(
            messages_url(" http://192.168.10.24:8000 "),
            "http://192.168.10.24:8000/v1/messages"
        );
    }
}

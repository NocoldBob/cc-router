# CC Router Security Model

## Scope

CC Router is a Windows and Ubuntu launcher for Claude Code routes that expose an
Anthropic-compatible API. It does not run an HTTP proxy, translate protocols,
inspect model requests, or provide cloud synchronization.

## Recommended Data Flow

```text
OS credential store
          |
          | Rust backend reads the selected key
          v
CC Router launches a new Claude Code process
          |
          | process-scoped environment variables
          v
Claude Code --------------------> selected Provider
```

CC Router is not present in the HTTP request path. The Provider selected by the
user receives the prompts, code, tool output, and other data Claude Code sends.

## Data Storage

| Data | Location | Contains API key |
| --- | --- | --- |
| Provider names, URLs, models, and UI settings | WebView `localStorage` | No |
| Provider API keys | Credential Manager / Linux Secret Service | Yes |
| Previous route snapshot | Tauri application data directory | No |
| Previous route API key | Windows Credential Manager | Yes, Windows only |
| Process-scoped route | New Claude Code process environment | Yes |
| Optional persistent route | Windows user environment | Yes, plaintext |

Provider export files and generated status output do not contain API keys. The
application removes the legacy `authToken` field when loading old Provider data.

## Trust Boundaries

- The WebView receives credential status, never a stored credential value.
- The Rust backend reads credentials only for launch, persistent apply, or
  rollback operations initiated by the user.
- Process-scoped launch does not edit Claude configuration files, user
  environment variables, or shell profiles.
- Persistent routing is confirmation-gated and creates a key-free JSON backup;
  any previous token is backed up separately in Credential Manager.
- Base URLs should use HTTPS; HTTP is accepted only when the user explicitly configures a trusted intranet endpoint.

## Limitations

- Malware or another process running as the same OS user may be able to
  access user credentials or inspect process environments.
- Persistent routing stores `ANTHROPIC_AUTH_TOKEN` as a plaintext user
  environment variable until it is cleared or replaced.
- Provider security, retention, billing, availability, and terms are outside
  the CC Router trust boundary.
- Unsigned installers may trigger Windows SmartScreen or show an unknown
  publisher warning.
- CC Router cannot make an untrusted Provider safe.

## Security-Sensitive Changes

Changes involving credentials, IPC payloads, environment handling, PowerShell
generation, executable launch, import/export, or backup compatibility require
focused regression tests. Automated verification must use fake keys and must
not modify the maintainer's persistent Windows route.

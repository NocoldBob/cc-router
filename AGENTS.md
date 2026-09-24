# CC Router Agent Handoff

Before changing this repository, read:

1. `docs/PRODUCT_STRATEGY_AND_HANDOFF.md`
2. `README.md`

## Product Invariants

- CC Router is a Windows and Ubuntu, no-proxy, process-isolated Claude Code provider launcher.
- Do not add an HTTP proxy, request logging, telemetry, cloud sync, or protocol conversion without an explicit product decision.
- Stored API keys remain in the operating system credential store (Windows Credential Manager or Linux Secret Service) and must never be returned to the frontend, logs, exports, Provider JSON, or `localStorage`.
- Process-scoped launch is the recommended mode and must not mutate user environment variables, shell profiles, or Claude configuration files.
- Persistent Windows routing is optional, confirmation-gated, backed up before mutation, and clearly warns that `ANTHROPIC_AUTH_TOKEN` becomes a plaintext user environment variable.
- Do not describe roadmap items as implemented features.
- Never use a real API key or modify the maintainer's user environment during automated verification.

## Required Checks

```powershell
pnpm lint
pnpm test
pnpm build
cd src-tauri
cargo fmt --all -- --check
cargo test
cargo check
```

Changes to credentials, environment handling, PowerShell generation, IPC payloads, or backup compatibility require focused regression tests.

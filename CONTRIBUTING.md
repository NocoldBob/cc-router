# Contributing to CC Router

Thank you for helping improve CC Router. The project is focused on Windows and
Ubuntu, so changes should preserve its small trust boundary.

## Product Boundaries

- Windows 10/11 x64 and Ubuntu Desktop 22.04/24.04 x64 only.
- Claude Code and Anthropic-compatible Provider routes only.
- No HTTP proxy, protocol conversion, request logging, telemetry, or cloud sync.
- Stored API keys stay in the system credential store and are never returned to
  the frontend, logs, exports, Provider JSON, or `localStorage`.
- Process-scoped launch is the recommended mode and does not modify user
  environment variables, shell profiles, or Claude configuration files.

Read `README.md`, `AGENTS.md`, and
`docs/PRODUCT_STRATEGY_AND_HANDOFF.md` before making behavioral changes.

## Development Setup

Requirements:

- Windows 10/11 with WebView2, or Ubuntu Desktop 22.04/24.04.
- Node.js 20 or newer and pnpm 10.
- Rust stable with the native x64 target.
- Windows: Visual Studio Build Tools with Desktop development with C++.
- Ubuntu: Tauri WebKitGTK, AppIndicator, Rsvg, DBus, and `patchelf` build dependencies.

```powershell
pnpm install --frozen-lockfile
pnpm desktop:info
```

## Required Checks

```powershell
pnpm lint
pnpm test
pnpm build
pnpm vscode:check
cd src-tauri
cargo fmt --all -- --check
cargo test
cargo check
```

Changes involving credentials, IPC payloads, environment handling, generated shell
generation, executable launch, import/export, or backup compatibility require
focused regression tests.

## Safe Testing

- Use fake API keys only.
- Do not commit `.env` files, Provider exports containing secrets, route backup
  files, private paths, private project content, or diagnostic logs.
- Automated tests must not modify the maintainer's user environment or shell profiles.
- Test persistent routing manually only on an expendable test account and
  restore the previous route afterward.

## Pull Requests

- Keep changes focused and explain the user-visible behavior.
- Include tests proportional to the security and behavioral impact.
- Update README, security documentation, and Roadmap language when relevant.
- Do not describe Roadmap items as implemented features.
- Confirm all required checks pass before requesting review.

Report vulnerabilities privately according to `SECURITY.md` rather than opening
a public issue.

# Changelog

All notable user-visible changes will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses semantic versioning.

## [Unreleased]

## [0.5.0] - 2026-11-23

### Added

- New built-in Provider templates verified against official documentation: GLM (Zhipu
  `open.bigmodel.cn/api/anthropic`, GLM-5.2 Coding Plan and GLM-5.3 presets), Qwen on Alibaba
  Cloud Model Studio (Token Plan and Coding Plan endpoints), and MiniMax
  (`api.minimax.cn/anthropic`, MiniMax-M3.1-Flash[1m]).
- A local/LAN deployment template with a `192.168.x.x` placeholder address for self-hosted
  Anthropic-compatible gateways.
- Per-provider atomic model presets are now available for every built-in template, not only
  Kimi Code (DeepSeek Flash/Pro, GLM 5.2/5.3, Qwen default/high-quality, and more).
- Three additional managed route variables: `API_TIMEOUT_MS`,
  `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, and `CLAUDE_CODE_MAX_OUTPUT_TOKENS`, matching
  the official GLM and Qwen Claude Code recommendations. They participate in process-isolated
  launches, the Windows user route (with backup/rollback), manual command output, and
  redacted diagnostics exactly like the existing variables.
- The sidebar Provider picker can re-add any built-in template or create a blank Provider.

### Changed

- DeepSeek template updated to the current official naming: `deepseek-flash[1m]` /
  `deepseek-flash` (the legacy `deepseek-v4-flash` name is now an alias) with the official
  `CLAUDE_CODE_AUTO_COMPACT_WINDOW=786432` recommendation; a `deepseek-v4-pro[1m]`
  quality-first preset remains available.
- Kimi Global follows the official configuration with `kimi-k3[1m]` on every role and a
  `kimi-k3.1-pro` flagship preset; the China platform endpoint difference is documented in
  the template notes.
- Kimi Code templates add the K3.1 Pro family (`k3.1-pro`, `k3.1-pro[1m]`,
  `k3.1-pro-highspeed`) with membership-tier notes; the default preset is now K3.1 Pro 256K.
- All built-in template verification dates now read 2026-11-23.
- VS Code Companion reaches `1.2.0`; its code is unchanged from `1.1.0`, but the bundled
  desktop installer and helper now match desktop `0.5.0`.

## [0.4.0] - 2026-10-14

### Added

- Launch a Provider-isolated terminal from the desktop app: the new window already carries
  the selected route environment, without touching user environment variables or shell profiles.
- Open a working directory in VS Code with a selected Provider: the workspace is bound in the
  shared secret-free catalog so the VS Code Companion routes its Claude Code sessions, and a
  freshly started VS Code window also inherits the isolated route environment.
- Session panel listing every session launched by the running CC Router instance with its
  Provider, target, working directory, and live status, plus an option to stop the launcher
  process. Sessions started by earlier runs or by other tools are never inspected.
- Redacted diagnostics export (`cc-router-diagnostics.json`) for issue reports: application
  version, platform, credential store, CLI detection, environment variable names (never
  values), home-redacted paths, and per-Provider credential flags. API keys are never read.

### Changed

- VS Code Companion reaches `1.1.0`; its code is unchanged from `1.0.0`, but the bundled
  desktop installer now matches desktop `0.4.0` (`1.0.0` bundled desktop `0.3.0`).

### Security

- Updated development-time dependencies to patched versions: `source-map-js` 1.2.2,
  `brace-expansion` 5.0.12, `markdown-it` 14.3.2, and `undici` 7.30.0. These packages only
  appear in build tooling (Vite, `@vscode/vsce`) and are not shipped in the application.
  `braces` 3.0.3 remains the latest published release with an unfixed stack-exhaustion
  advisory; it is only reachable through the VS Code extension packaging tool.

## [0.3.0] - 2026-09-24

### Added

- Native Ubuntu Desktop 22.04/24.04 x64 support with process-isolated Claude Code launch.
- Linux Secret Service credential storage and XDG-compliant shared Provider configuration.
- Ubuntu DEB and AppImage packages, plus a platform-specific Linux VS Code Companion package.
- Dual-platform CI and stable GitHub release packaging for Windows and Ubuntu.

### Changed

- VS Code Companion reaches `1.0.0` and bundles the matching desktop manager and native helper
  separately for Windows x64 and Linux x64.
- Persistent default routing remains Windows-only. Ubuntu never edits `.bashrc`, `.profile`, or
  other shell configuration.

## [0.2.0-beta.3] - 2026-09-24

### Added

- Kimi Code now has one-click model profiles for K3 1M, K3 256K, and the
  quota-saving K2.7 Code (`kimi-for-coding`). Each profile updates all Claude
  model roles, thinking effort, and context-window variables together.
- VS Code Companion can now probe a Provider connection from the sidebar. The bundled
  helper sends a single minimal, content-free Anthropic Messages request and reports a
  sanitized classification (reachable, unreachable, timed out, auth failed, model
  unavailable, overloaded, server error) with latency. Response bodies and API keys
  never leave the helper process.

### Security

- Updated Rust TLS and JavaScript development dependencies to patched versions before
  publishing the beta release.

## [0.2.0-beta.2] - 2026-08-26

### Fixed

- Custom Provider validation now accepts `http://` Base URLs for trusted intranet APIs.
- Saving Provider settings remains independent from Windows default route environment variables;
  persistent user environment writes still happen only after the confirmation-gated
  "Set as Windows default" action.
- VS Code Companion manual refresh now reports shared Provider catalog errors instead of appearing
  to do nothing.
- Added a confirmation-gated repair command for replacing an outdated desktop installation with
  the version bundled in the VSIX.

## [0.2.0-beta.1] - 2026-08-20

### Added

- Windows VS Code Companion extension with per-workspace Provider selection.
- Credential Manager-backed Claude Code process wrapper that keeps API Keys out of VS Code
  settings and extension state.
- Shared, secret-free Provider catalog for desktop and extension interoperability.
- Confirmation-gated desktop installation bundled with the VS Code extension package.
- Illustrated Chinese guide for installing, configuring, verifying, and troubleshooting the
  VS Code integration.

## [0.1.0-beta.1] - 2026-08-19

### Added

- Windows Tauri desktop application for managing Claude Code Provider routes.
- Process-scoped Claude Code launch with isolated route environment variables.
- Windows Credential Manager storage for Provider API keys.
- Optional confirmation-gated Windows user route with backup and rollback.
- Provider import and export without API keys.
- Launch-readiness checks for Claude CLI, credentials, working directory, route validity,
  and inherited Claude environment variable names without exposing their values.
- Verification dates and official documentation links for built-in Provider templates.
- Open-source repository policy, security, contribution, and release files.
- Clean Windows runner smoke tests for NSIS installation, app startup, and uninstall.

[Unreleased]: https://github.com/NocoldBob/cc-router/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/NocoldBob/cc-router/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/NocoldBob/cc-router/compare/v0.2.0-beta.3...v0.3.0
[0.2.0-beta.3]: https://github.com/NocoldBob/cc-router/compare/v0.2.0-beta.2...v0.2.0-beta.3
[0.2.0-beta.2]: https://github.com/NocoldBob/cc-router/compare/v0.2.0-beta.1...v0.2.0-beta.2
[0.2.0-beta.1]: https://github.com/NocoldBob/cc-router/compare/v0.1.0-beta.1...v0.2.0-beta.1
[0.1.0-beta.1]: https://github.com/NocoldBob/cc-router/releases/tag/v0.1.0-beta.1

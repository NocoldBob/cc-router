# Changelog

All notable user-visible changes will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses semantic versioning with prerelease identifiers during
the public beta.

## [Unreleased]

## [0.2.0-beta.3] - 2026-09-07

### Added

- Kimi Code now has one-click model profiles for K3 1M, K3 256K, and the
  quota-saving K2.7 Code (`kimi-for-coding`). Each profile updates all Claude
  model roles, thinking effort, and context-window variables together.
- VS Code Companion can now probe a Provider connection from the sidebar. The bundled
  helper sends a single minimal, content-free Anthropic Messages request and reports a
  sanitized classification (reachable, unreachable, timed out, auth failed, model
  unavailable, overloaded, server error) with latency. Response bodies and API keys
  never leave the helper process.

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

[Unreleased]: https://github.com/NocoldBob/cc-router/compare/v0.2.0-beta.3...HEAD
[0.2.0-beta.3]: https://github.com/NocoldBob/cc-router/compare/v0.2.0-beta.2...v0.2.0-beta.3
[0.2.0-beta.2]: https://github.com/NocoldBob/cc-router/compare/v0.2.0-beta.1...v0.2.0-beta.2
[0.2.0-beta.1]: https://github.com/NocoldBob/cc-router/compare/v0.1.0-beta.1...v0.2.0-beta.1
[0.1.0-beta.1]: https://github.com/NocoldBob/cc-router/releases/tag/v0.1.0-beta.1

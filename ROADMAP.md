# Roadmap

CC Router is intentionally focused on Windows and Ubuntu, Claude Code, and direct
Anthropic-compatible Provider routes. Roadmap items are plans, not implemented
features.

## Release Foundation

- [x] Automated Windows and Ubuntu checks for frontend and Rust code.
- [x] Reproducible releases with package checksums and build provenance.
- [x] Clean-runner installer, application launch, and uninstall verification.
- [x] Clear unsigned-installer and trust-boundary documentation.
- [x] Provider template verification dates and official documentation links.

## Focus Areas

- Redacted diagnostic export suitable for issue reports.
- [x] Optional endpoint and model availability checks that send no project data.
- Launching an isolated terminal or VS Code workspace with a selected Provider.
- [x] Marketplace publishing and compatibility checks for the VS Code Companion.
- [x] Native Ubuntu process-isolated routing and VS Code Companion compatibility.
- Windows ARM64 evaluation.
- Code signing and a carefully designed update path.

## Out of Scope Without a Product Decision

- HTTP proxying or protocol conversion.
- Request, prompt, response, token, usage, or billing logs.
- Telemetry, cloud synchronization, or hosted account services.
- Automatic failover across Providers.
- Managing unrelated AI CLIs, MCP servers, prompts, or sessions.

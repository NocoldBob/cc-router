# Security Policy

## Supported Versions

Security fixes are provided for the latest published release and the `main`
branch only.

## Reporting a Vulnerability

Please do not disclose suspected vulnerabilities, credentials, or sensitive
diagnostics in a public issue.

Use GitHub's private vulnerability reporting feature for this repository. If
that feature is unavailable, open a public issue containing no sensitive
details and ask the maintainers for a private reporting channel.

Useful reports include:

- The affected CC Router version, operating system, and OS version.
- Reproduction steps using fake credentials.
- The expected and observed security boundary.
- Whether the issue affects the system credential store, IPC, process
  environment, generated shell commands, Provider import/export, or route backup data.

Never include a real API key, access token, private project path, or private
project content in a report.

## Security Model

CC Router is not an API proxy. In the recommended mode, it reads a selected
Provider key from Windows Credential Manager or Linux Secret Service and passes route variables only
to a newly launched Claude Code process.

The optional persistent route mode writes `ANTHROPIC_AUTH_TOKEN` to the current
user's Windows environment in plaintext after explicit confirmation. Processes
running as the same OS user may be able to inspect process environments or
access user credentials. CC Router is not a defense against malware already
running with the user's privileges.

The selected Provider still receives data sent by Claude Code. CC Router does
not operate a project backend and does not add another request destination.

See [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md) for the complete data-flow
and trust-boundary description.

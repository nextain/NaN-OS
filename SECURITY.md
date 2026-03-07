# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest (main branch) | Yes |

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please report security issues to: **security@nextain.io**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge your report within 48 hours and provide a detailed response within 7 days.

## Security Architecture

Naia OS uses a tiered permission system for AI tool execution:

| Tier | Access Level | Approval |
|------|-------------|----------|
| 0 | Read-only (chat, search) | Automatic |
| 1 | Local write (files, settings) | User prompt |
| 2 | System (commands, network) | User prompt + audit |
| 3 | Privileged (admin, credentials) | Explicit approval + audit |

All tool executions are logged in a local SQLite audit log.

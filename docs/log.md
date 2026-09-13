---
type: Log
title: Knowledge base log
description: Evolution of this documentation bundle.
status: active
---

# Knowledge log

## 2026-09-13

- Initial bundle created: overview, design rationale, architecture, usage guide, options reference, server API contract, and contribution guide.
- Documented the Lemonade MCP gateway in the architecture page, with the decision and rationale for keeping it external to the plugin.
- Documented release-please on the built-in `GITHUB_TOKEN` with explicit workflow permissions and the "Allow GitHub Actions to create and approve pull requests" repository setting, so no repository secret is required; npm publishing uses trusted publishing (OIDC).
- Simplified the README configuration example: custom host and API key are plugin options, so the provider block is only needed for settings the plugin does not manage.
- Removed the legacy `provider.<id>.options.discovery` configuration nesting; the plugin reads options only from plugin options.
- Swapped the API key environment fallback to prefer `LEMONADE_API_KEY` over `LEMONADE_ADMIN_API_KEY`.
- Added the `servers` option: additional named Lemonade servers register as their own OpenCode providers, merging over the top-level options; provider display names are configurable via `name`.

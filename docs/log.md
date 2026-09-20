---
type: Log
title: Knowledge base log
description: Evolution of this documentation bundle.
status: active
---

# Knowledge log

## 2026-09-20

- Rewrote the bundle for the OpenCode v2 plugin API: the architecture page now describes `Plugin.define` / `setup` and `ctx.provider.transform` in place of the v1 `config` hook, and records the `opencode-lemonade` plugin id.
- Updated the options reference and usage guide to the v2 config forms (`plugins` with `{ package, options }`) and to v2 `Model.Info` field names for per-model overrides (`capabilities`, `limit`, `modelID`).
- Documented two features removed because v2 has no equivalent: the `small_model` option and the `reasoning` capability mapping; the options reference, server API contract, and design rationale note both.
- Recorded provider-preservation behavior: an existing configured provider keeps its settings and defined models, and only new discovered model ids are added.
- Refreshed the README install and configuration instructions for v2 (`plugins` config key, `opencode plugin add`, `.opencode/plugins/` discovery).

## 2026-09-13

- Initial bundle created: overview, design rationale, architecture, usage guide, options reference, server API contract, and contribution guide.
- Documented the Lemonade MCP gateway in the architecture page, with the decision and rationale for keeping it external to the plugin.
- Documented release-please on the built-in `GITHUB_TOKEN` with explicit workflow permissions and the "Allow GitHub Actions to create and approve pull requests" repository setting, so no repository secret is required; npm publishing uses trusted publishing (OIDC).
- Simplified the README configuration example: custom host and API key are plugin options, so the provider block is only needed for settings the plugin does not manage.
- Removed the legacy `provider.<id>.options.discovery` configuration nesting; the plugin reads options only from plugin options.
- Swapped the API key environment fallback to prefer `LEMONADE_API_KEY` over `LEMONADE_ADMIN_API_KEY`.
- Added the `servers` option: additional named Lemonade servers register as their own OpenCode providers, merging over the top-level options; provider display names are configurable via `name`.
- Bumped dev toolchain to TypeScript 7 (native compiler) and `@types/node` 26.
- Published `opencode-lemonade@0.1.0` as the initial npm release; raised the release-please baseline to `0.2.0` for the first automated release.

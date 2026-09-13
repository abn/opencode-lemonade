# Plugin behaviour invariants

Rules specific to this repository, extending the global standards in AGENTS.md.

- The plugin must never block OpenCode startup: any server error, timeout, or malformed response falls back to an empty catalog.
- The fetch timeout timer is always cleared, including on failure, so no handle leaks.
- Host and API key resolution stays layered: option, provider configuration, environment, default. `{env:...}` and `{file:...}` templates resolve whole-string and embedded.
- Pure helpers (`resolveValue`, `matchesPattern`, `filterModel`) stay exported and covered by unit tests; the `config` hook stays the only entrypoint OpenCode calls.

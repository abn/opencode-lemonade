# AGENTS.md

## Project

`opencode-lemonade` is an OpenCode plugin that discovers Lemonade server models
at startup and registers them as an OpenAI-compatible provider. Working
documentation and design live in `docs/`; the options reference is
`docs/reference/options.md`.

## Invariants

- Never run with elevated privileges (sudo) unless a human explicitly asks.
- No AI slop: no em-dashes, no filler prose, no comments that restate the code.
- Docs move with the change: any behaviour change updates the wiki and its
  log (`docs/log.md`).
- Commits are logical units, Conventional Commits, summary-first.
- Parallel work happens in worktrees; never commit to the default branch
  without a reason.
- Automation over manual conformance: `make check` owns the quality gate.
- `.agents/brain/` is local-only scratch space and must never be committed.

## Automation and conventions

- `make check` must pass before any change is considered done.
- Stage explicit paths, never `git add -A`.
- Commit messages follow Conventional Commits (`feat`, `fix`, `docs`, `style`,
  `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`), enforced by a
  commit-msg hook. No trailers, no emoji.
- Hooks are installed by `.agents/bootstrap.sh`; run it once after cloning.

## Verification

A change is done only when `make check` passes with real captured output and
the relevant tests are green. `make check` runs the OKF bundle validation, the
type check, formatting check, the unit tests, and the build.

## Contributor guide

See `docs/contribution/` for how to contribute and the maintainer checklist.

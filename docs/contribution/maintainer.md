---
type: Guide
title: Contribution guide
description: How to contribute and the maintainer checklist.
status: active
---

# Contribution guide

## Working procedure

- State the scope in one sentence before starting: the unit of work, the target, and the outcome.
- Do one scoped change per worktree, branched as `feat/`, `fix/`, `docs/`, `chore/`, or `refactor/`.
- Keep scratch notes in `.agents/brain/`; it is local only and never committed.
- A change is done only when `make check` passes with captured output.

## Maintainer checklist

- `make check` green: OKF bundle valid, type check clean, formatting clean, tests pass, build succeeds.
- CI runs `make check` on every push and pull request; release-please cuts versioned GitHub Releases with the built plugin attached.
- Hooks installed via `.agents/bootstrap.sh` (pre-commit and commit-msg).
- Docs updated when behaviour changes; `docs/log.md` records knowledge-base evolution.
- No em-dashes, no host home paths, no tokens in committed text.

## Releasing

Release-please cuts a GitHub Release on every merged release PR. The release
workflow then uploads the built plugin to the release and publishes the package
to the npm registry with trusted publishing (OIDC), which also generates
provenance attestations. No npm token is stored in the repository.

One-time setup on npmjs.com (required before the first publish succeeds):

1. Ensure the npm account has two-factor authentication enabled.
2. Create the `opencode-lemonade` package with a one-off manual publish: `npm
login`, then `npm publish --access public`. Trusted publishing cannot create
   the first version, because npm's OIDC token exchange returns 404 for
   packages that do not exist yet.
3. Because the manual first publish takes the `0.1.0` version, bump the
   release-please baseline to `0.2.0` (`.release-please-manifest.json`,
   `.release-please-config.json` `initial-version`) so the first automated
   release does not collide.
4. Package settings: Trusted Publishing, add a GitHub Actions publisher for the
   `abn/opencode-lemonade` repository and workflow filename `release.yml`. The
   workflow filename must match exactly.
5. Package settings: Publishing access, select "Require two-factor
   authentication and disallow tokens". Trusted publishers keep working; this
   removes long-lived token risk.

Repository setup (one-time):

- Enable "Allow GitHub Actions to create and approve pull requests" under
  repository Settings, Actions, General. Release-please needs this to open its
  release pull requests with the built-in `GITHUB_TOKEN`.
- No repository secret is required: release-please runs on `GITHUB_TOKEN` with
  the workflow's explicit `contents`, `issues`, and `pull-requests` write
  permissions. Because `GITHUB_TOKEN`-created pull requests and tags do not
  trigger workflow runs, the release pull request itself shows no CI checks;
  main is already gated by CI before the release PR can be merged, and the
  artifact upload and npm publish run in the same workflow as the release.

Notes:

- The `package.json` `repository.url` must match the GitHub repository exactly;
  provenance and trusted publishing both validate it.
- The publish step builds on Node 24, the minimum for npm trusted publishing.
- First publish uses `--access public`; later publishes need no access flag.

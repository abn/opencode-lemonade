# Hooks

Committed wrapper hooks that delegate to pre-commit, wired up via
`core.hooksPath` by `.agents/bootstrap.sh`.

- `pre-commit` runs the repository checks on every commit.
- `commit-msg` validates Conventional Commits on every commit message.

Run `bash .agents/bootstrap.sh` after cloning to point `core.hooksPath` here
and mark the hooks executable.

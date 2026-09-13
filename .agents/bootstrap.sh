#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

mkdir -p .agents/brain/inbox .agents/brain/outbox .agents/brain/tasks .agents/brain/assets

chmod +x .agents/hooks/pre-commit .agents/hooks/commit-msg
git config core.hooksPath .agents/hooks

if ! command -v pre-commit >/dev/null 2>&1; then
  echo "pre-commit not found; install it to enable hooks (pip install pre-commit)." >&2
fi

echo "Bootstrap complete. Scratch area and hooks are ready."

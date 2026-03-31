#!/usr/bin/env bash
set -e

ROOT=$(git rev-parse --show-toplevel)
BASE=$(basename "$ROOT")
BRANCH=${1:-task}
DIR="worktrees/$BRANCH"

git worktree add "$DIR" -b "$BRANCH" main
echo "Created worktree at $DIR"
echo "Now open a new terminal in: $ROOT/$DIR"
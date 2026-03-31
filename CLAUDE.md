# Project instructions

## Goal
Work in small, isolated changes. Prefer targeted edits over broad refactors.

## Workflow
- Before editing, inspect only the relevant files.
- Keep each task scoped to one feature, bugfix, or refactor slice.
- If multiple areas are needed, split the work into separate worktrees.
- Always run tests or lint only for the touched area first.

## Code style
- Follow existing conventions in the repository.
- Avoid unnecessary renames or formatting-only changes.
- Keep commits small and focused.

## Parallel work
- Main worktree is for integration only.
- Each parallel task must use its own worktree.
- Never modify the same files from two worktrees at the same time.

## Output expectations
- Summarize changes briefly.
- Mention files changed.
- Mention tests run.
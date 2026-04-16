---
title: "Skip-Gate Enforcement"
scope: Standard
status: approved
created: 2026-04-16
approved_by: user
---

# Skip-Gate Enforcement Requirements

## Problem Statement

Agent uses `--skip-gate` to bypass all 37 structural checks across 6 stages.
Intermediate stages (brainstorm/plan/review) can also be skipped entirely by
calling `apex stage set <later-stage>` without completing the current one.
This undermines all L4-Gate enforcement built in previous iterations.

## Acceptance Criteria

1. `apex stage complete <stage> --skip-gate` is denied by PreToolUse hook
2. `apex stage set plan` is rejected by CLI if brainstorm not completed
3. `apex stage set execute` is rejected if plan not completed
4. `apex stage set review` is rejected if execute not completed
5. `apex stage set ship` is rejected if review not completed
6. `apex stage set compound` is rejected if ship not completed
7. `--skip-gate` flag removed from CLI help text and logic
8. Normal pipeline flow (no --skip-gate, correct order) still works
9. `apex stage set idle` always works (reset)
10. `apex stage set brainstorm` always works (first stage)
11. All existing tests pass

## Constraints

- Must not break worktree/orchestration flows that set stages programmatically
- `apex stage set idle` must always be available as emergency reset
- Pre-commit hook and PreToolUse hook must not be affected by CLI changes

---
title: "Skip-Gate Enforcement Plan"
status: approved
created: 2026-04-16
---

# Skip-Gate Enforcement Plan

## File Manifest

| File | Action | Purpose |
|------|--------|---------|
| `skill/hooks/apex-forge-gate.sh` | Modify | Add rule to deny `--skip-gate` in Bash commands |
| `src/state/state.ts` | Modify | Add stage ordering validation in `setStage()` |
| `src/cli.ts` | Modify | Remove `--skip-gate` flag from `stage complete` |
| `src/__tests__/skip-gate-enforcement.test.ts` | Create | Tests for all 3 fixes |

## Test Files

- `src/__tests__/skip-gate-enforcement.test.ts` — CLI tests for stage ordering + --skip-gate removal
- `src/__tests__/pretooluse-gate.test.ts` — Add test for --skip-gate denial in hook

## Tasks

### T1: PreToolUse hook denies --skip-gate (AC1)
In `apex-forge-gate.sh`, add a rule in the Bash tool section:
- Detect `--skip-gate` in command string
- Deny with reason: "APEX GATE: --skip-gate is not permitted"
- Must fire BEFORE the git ops check (higher priority)

### T2: Stage ordering in setStage() (AC2-AC6)
In `state.ts` `setStage()`:
- Define ordering map: `{ plan: "brainstorm", execute: "plan", review: "execute", ship: "review", compound: "ship" }`
- For each stage with a predecessor, check `state.history` for a completed entry with `stage === predecessor`
- If not found, throw error: "Cannot enter {stage} — {predecessor} not completed"
- `idle` and `brainstorm` always allowed (AC9, AC10)
- Stages starting with `orchestrate:` bypass ordering (worktree/orch flows)

### T3: Remove --skip-gate from CLI (AC7)
In `cli.ts` `case "stage"` → `sub === "complete"`:
- Remove `rest.includes("--skip-gate")` check
- Remove `skipGate` variable
- Always enforce gate (remove `skipGate` param from `completeStage` call)
- Remove help text reference to `--skip-gate`
In `state.ts` `completeStage()`:
- Remove `skipGate` parameter entirely
- Always run gate

### T4: Tests (AC8, AC11)
- Test stage ordering: `apex stage set plan` without brainstorm → exit 1
- Test stage ordering: `apex stage set plan` after brainstorm → exit 0
- Test --skip-gate removed: `apex stage complete brainstorm --skip-gate` → error/ignored
- Test normal flow still works
- Test idle always allowed
- Test all existing tests pass

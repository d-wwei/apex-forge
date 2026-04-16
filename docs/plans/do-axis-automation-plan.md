---
title: Strategy 3 — Do-Axis Automation Plan
scope: Standard
status: approved
created: 2026-04-16
source: docs/brainstorms/do-axis-automation-requirements.md
tasks: 4
complexity: medium
---

## Problem Frame

Agent wastes attention on mechanical steps (checkpoints, template creation, reading requirements). Automate these in hooks and CLI so agent focuses on content-producing work.

## Decision Log

| Decision | Rationale | Rejected |
|----------|-----------|----------|
| Hardcode key requirements per stage in CLI rather than parsing markdown | Reliable, no markdown parsing fragility; maintainers update both | Dynamic markdown extraction — fragile, slow |
| Use project name from `.apex/state.json` session_id for artifact paths | Already available, consistent naming | Prompt user for project name — adds friction |
| Auto-checkpoint only for push-prompt (AskUserQuestion during ship) | Most impactful checkpoint; other checkpoints are less commonly skipped | Checkpoint all AskUserQuestion calls — over-instrumented |

## File Manifest

| Action | Path |
|--------|------|
| Modify | `src/cli.ts` (stage set handler: inline requirements + artifact template creation) |
| Modify | `skill/hooks/apex-forge-skill-trace.sh` (AskUserQuestion auto-checkpoint) |
| Create | `src/__tests__/stage-set-automation.test.ts` (tests for inline requirements + templates) |

### Test Files

| Path | Tests |
|------|-------|
| `src/__tests__/stage-set-automation.test.ts` | Inline requirements output, artifact template creation |

## Task Decomposition

| ID | Description | Files | Complexity | Deps | AC |
|----|-------------|-------|------------|------|-----|
| T1 | `apex stage set` prints inline key requirements (3-5 per stage) | `src/cli.ts` | small | — | AC5 |
| T2 | `apex stage set` auto-creates artifact templates | `src/cli.ts` | medium | — | AC2, AC3, AC4 |
| T3 | PostToolUse hook auto-checkpoint on AskUserQuestion in ship stage | `skill/hooks/apex-forge-skill-trace.sh` | small | — | AC1 |
| T4 | Tests + build + verification | `src/__tests__/stage-set-automation.test.ts` | small | T1, T2, T3 | AC6, AC7 |

## Test Plan

| AC | Scenario | Test File |
|----|----------|-----------|
| AC1 | Given tool_name=AskUserQuestion and stage=ship, when hook runs, then checkpoint is recorded | Manual verification (hook is shell) |
| AC2 | Given `apex stage set brainstorm`, when no artifact exists, then `docs/brainstorms/{project}-requirements.md` is created | `stage-set-automation.test.ts` |
| AC5 | Given `apex stage set brainstorm`, when stage is set, then output includes key requirements | `stage-set-automation.test.ts` |
| AC6 | Given all changes, when running test suite, then all pass | `bun test` |
| AC7 | Given CLI changes, when building, then build succeeds | `bun build` |

## Dependency Graph

```
T1 ─┐
T2 ─┼─→ T4 (tests + build)
T3 ─┘
```

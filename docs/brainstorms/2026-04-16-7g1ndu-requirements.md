---
title: Strategy 4 — Post-Audit Compliance Reporting
scope: Standard
status: approved
created: 2026-04-16
approved_by: user (pre-approved in task specification)
---

## Problem Statement

No visibility into pipeline compliance after completion. Agent and user cannot see whether each stage was properly executed. Doctor module only checks form (section exists, field has value) but not content quality.

## Constraints

- [已验证] `stage complete ship` handler is at `src/cli.ts:652-670`. Compliance report goes after line 666.
- [已验证] Doctor module (`src/commands/doctor.ts`, 533 lines) has 6 check functions. New content quality checks follow the same `Check[]` pattern.
- [已验证] `getState()` returns full state including artifacts per stage.
- Must rebuild after changes.

## Approaches

1. **Compliance report + doctor content checks** (chosen)
2. **Compliance report only** — Rejected: user specified both.

## Acceptance Criteria

1. `apex stage complete ship` prints a compliance summary showing pass/total per stage + overall grade.
2. `apex doctor` checks brainstorm artifact acceptance criteria count (>=3).
3. `apex doctor` checks plan artifact file manifest paths exist on disk.
4. `apex doctor` checks review artifact persona sections have substantive content (>50 chars each).
5. All existing tests pass.
6. Build succeeds.

## Solution Shape

- `src/cli.ts`: After `Stage completed: ship`, compute per-stage compliance from state artifacts.
- `src/commands/doctor.ts`: Add `checkContentQuality()` function with 3 checks.

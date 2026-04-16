---
name: execute
description: Implement the plan -- TDD-first, with dispatch strategy based on task complexity
---

# Execute Stage

The implementation engine. Read the plan, write tests first, build the code,
verify each step. No design decisions here -- those belong in Plan.

---

**On entry:** `apex stage set execute`
**On completion:** `apex stage complete execute`

## Entry Conditions

1. **Required upstream**: `docs/plans/{name}-plan.md` with `status: approved`. If missing, tell user to run Plan first.
2. Verify plan contains: file manifest, test file paths, task decomposition, all tasks in `apex task list`.
3. If prior execution log exists, offer to resume from incomplete tasks.

---

## Phase Rule

**Execute is the DO phase. No design decisions here.**
Ambiguous requirement → return to Brainstorm. Wrong/incomplete plan → return to Plan. New task needed → return to Plan.

---

## Input Triage

| Category | Criteria | Dispatch Strategy |
|----------|----------|-------------------|
| **Trivial** | 1-2 tasks, no inter-task deps, < 20 lines | Execute inline. |
| **Small** | 3-10 tasks, mostly independent | Parallel dispatch. |
| **Large** | 10+ tasks, deep deps, or architectural | Hierarchical: batches of 3-5. |

Full step-by-step sequences (Trivial/Small/Large) + TDD Rationalization Counters:
→ `skill/details/execute-dispatch.md`

---

## TDD Enforcement

Iron Law: test first, always. No exceptions except throwaway prototypes and generated code.

1. WRITE THE TEST — from plan's test file path; tests acceptance criteria; specific and falsifiable.
2. RUN THE TEST — CONFIRM RED — fails for the right reason, not syntax/import error.
3. IMPLEMENT THE MINIMUM CODE — only enough to pass; no extras.
4. RUN THE TEST — CONFIRM GREEN — passes; no regressions.
5. REFACTOR (optional) — clean up; tests stay green.

TDD rationalization counters: → `skill/details/execute-dispatch.md`

---

## Two-Stage Review (Per Task)

Both stages must PASS before marking a task `done`.

| Stage | Checks | Verdict |
|-------|--------|---------|
| **A: Spec Compliance** | Matches plan description; addresses acceptance criteria; correct files changed | PASS / FAIL + citation |
| **B: Code Quality** | Readable, no dead code; all error paths handled; no regressions; no scope creep | PASS / FAIL + citation |

---

## Progress Tracking

States: `pending → in_progress → review → done` (or `→ blocked`). Use `apex task update T{N} --status {status}`. Maintain a task progress table in the execution log.

---

## Skill Dispatch

When the current task matches a trigger in `bindings.yaml`, load and invoke the corresponding external skill. Sort by `priority`, respect `concurrent` flag, validate output against `output_schema`, map result to AF state, record in `.apex/state.json → skill_invocations[]`.
→ Full flow, schema mismatch handling, invocation trace: `skill/details/execute-skill-dispatch.md`

---

## Artifact Output

Write execution log to `docs/execution/{name}-log.md`. Register after all tasks:
`apex task create --stage execute --artifact docs/execution/{name}-log.md`

Full document structure: → `skill/details/execute-skill-dispatch.md`

---

## Exit Gate

Before `apex stage complete execute`, run the Stage Exit Gate (`gates/stage-exit-gate.md`).

### Structural Checks

| # | Check | Criterion | Verification |
|---|-------|-----------|-------------|
| S1 | All tasks done | Every task in `apex task list` has status `done` | CLI check |
| S2 | Test files exist | Each test file path from the plan exists on disk | File existence |
| S3 | Execution log | `docs/execution/{name}-log.md` exists | File read |

### Substance Prompts (Tier 2+)

| # | Prompt | Cross-reference |
|---|--------|----------------|
| Q1 | Do the tests actually test the acceptance criteria? Cross-reference test files against brainstorm criteria. Flag trivial assertions (e.g., `expect(fn).toBeDefined()`). | `docs/brainstorms/{name}-requirements.md`, test files |
| Q2 | Are there untested edge cases from the plan's test scenarios? Compare plan test scenarios against actual test files. | `docs/plans/{name}-plan.md`, test files |

---

## Completion

| Status | When |
|--------|------|
| **DONE** | All tasks done, tests green, log written. → Proceed to Review. |
| **DONE_WITH_CONCERNS** | All tasks done but deviations documented. |
| **BLOCKED** | Tasks cannot proceed — missing deps or plan gaps. |
| **NEEDS_CONTEXT** | Plan is ambiguous; need clarification. |

---
name: apex-forge-execute
description: Implement the plan — TDD-first, with dispatch strategy based on task complexity
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Execute Stage Preamble
source "$PLUGIN_ROOT/hooks/state-helper"

echo "=== APEX EXECUTE STAGE ==="
apex_set_stage "execute"

# Check for upstream plan artifact
UPSTREAM=$(apex_check_upstream "plan")
if [ "$UPSTREAM" = "NO_UPSTREAM" ]; then
  echo ""
  echo "[apex] WARNING: No approved plan found in docs/plans/"
  echo "UPSTREAM_MISSING=true"
else
  echo ""
  echo "[apex] Found upstream plan artifacts:"
  echo "$UPSTREAM"
  echo "UPSTREAM_MISSING=false"
fi

# Check for existing execution logs (resume)
EXISTING=$(apex_find_upstream "execute")
if [ -n "$EXISTING" ]; then
  echo ""
  echo "[apex] Found existing execution logs:"
  echo "$EXISTING"
  echo "RESUME_AVAILABLE=true"
else
  echo "RESUME_AVAILABLE=false"
fi

apex_ensure_dirs
```

# Execute Stage

> apex-forge / workflow / stages / execute
>
> The implementation engine. Read the plan, write tests first, build the code,
> verify each step. No design decisions here --- those belong in Plan.

---

## Entry Conditions

1. **Required upstream**: An approved plan (`docs/plans/{name}-plan.md` with
   `status: approved`).
2. If `UPSTREAM_MISSING=true`:
   - Tell the user: "No approved plan found. Run `/apex-plan` first, or point
     me to an existing plan."
   - Do NOT implement against unwritten plans.
3. If `RESUME_AVAILABLE=true`:
   - Read the execution log to find which tasks are `done` vs `pending`.
   - "Found execution log for **{name}**. Tasks T1-T3 done, T4-T6 pending. Resume?"

---

## Phase Rule

**Execute is the DO phase. Design decisions do not happen here.**

If during implementation you discover:
- A requirement is ambiguous -> return to Brainstorm
- The plan is wrong or incomplete -> return to Plan
- A new task is needed that is not in the plan -> return to Plan

Document the reason for returning. Do NOT make ad-hoc design decisions
during execution. This is the most common phase violation.

---

## Input Triage

Read the plan and classify the work:

| Category | Criteria | Dispatch Strategy |
|----------|----------|-------------------|
| **Trivial** | 1-2 tasks, no inter-task dependencies, < 20 lines changed | Execute inline. No subagents. Direct implementation. |
| **Small** | 3-10 tasks, mostly independent, moderate complexity | Parallel dispatch. Each independent task gets its own Agent tool call. |
| **Large** | 10+ tasks, deep dependencies, or architectural changes | Hierarchical dispatch. Coordinator breaks into batches, dispatches agents per batch, merges results. |

### Trivial Dispatch

1. Read the task from the plan.
2. Write the test (TDD Step 1).
3. Run the test, confirm RED.
4. Implement the minimum code to pass.
5. Run the test, confirm GREEN.
6. Verify via the 5-step gate.
7. Mark task done.

### Small Dispatch (Parallel Subagents)

For each independent task (no unfinished dependencies):

1. Dispatch via Agent tool with this context:
   - Task ID and description from the plan
   - File paths to create/modify
   - Test file paths
   - Acceptance criteria for this task
   - TDD requirement: write test FIRST, see RED, then implement
2. Do NOT send the full plan to subagents (reduces context pollution).
3. Collect results. Run two-stage review on each (see below).
4. Tasks with dependencies wait until their upstream tasks are done.

### Large Dispatch (Hierarchical)

1. **Coordinator** groups tasks into batches of 3-5 based on dependency graph.
2. Each batch is dispatched as a Small dispatch.
3. Between batches: verify batch outputs, check for integration issues.
4. If a batch fails, do NOT proceed to the next batch. Fix first.

---

## TDD Enforcement

The TDD Iron Law applies to every task. No exceptions except the two
documented in the core protocol (throwaway prototypes, generated code).

### The Sequence (per task)

```
1. WRITE THE TEST
   - Test file path from the plan
   - Test the behavior described in acceptance criteria
   - Test must be specific and falsifiable

2. RUN THE TEST — CONFIRM RED
   - The test MUST fail
   - It must fail for the RIGHT reason (not syntax error, not import error)
   - If it passes: your test is wrong or the feature already exists
   - If it fails for the wrong reason: fix the test first

3. IMPLEMENT THE MINIMUM CODE
   - Only enough to make the test pass
   - No extra features, no "while I'm here" additions
   - Follow the plan's file paths and descriptions

4. RUN THE TEST — CONFIRM GREEN
   - The test must now pass
   - All other tests must still pass (no regressions)
   - If a test fails: fix it before moving on

5. REFACTOR (optional)
   - Clean up if needed
   - Tests must stay green after refactoring
```

### TDD Rationalization Counters

If you catch yourself thinking any of these, stop:

| Thought | Counter |
|---------|---------|
| "I'll write the test after the code" | No. Test first. That is the law. |
| "This is too simple for a test" | Simple things break. Write the test. |
| "Let me just get the code working first" | The test defines "working." Write it first. |
| "I don't know how to test this" | Then you don't understand it well enough to build it. |

---

## Two-Stage Review (Per Task)

After each task is implemented, before marking it done:

### Stage A: Spec Compliance

- Does the implementation match the task description from the plan?
- Does it address the linked acceptance criteria?
- Are the correct files created/modified (match the plan's file manifest)?
- Verdict: PASS / FAIL with specific citation

### Stage B: Code Quality

- Clean code: readable, no dead code, proper naming
- Error handling: all error paths handled, no swallowed exceptions
- No regressions: existing tests still pass
- No scope creep: nothing implemented that is not in the plan
- Verdict: PASS / FAIL with specific citation

Both stages must PASS before a task is marked `done`.

---

## Progress Tracking

Each task transitions through these states:

```
pending -> in_progress -> review -> done
                     \-> blocked
```

Track in the execution log:

```markdown
| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T1   | done   | 14:00   | 14:22     | Tests green |
| T2   | done   | 14:23   | 14:45     | Required plan clarification on edge case |
| T3   | in_progress | 14:46 | - | Working on test setup |
| T4   | pending | - | - | Depends on T2 |
```

---

## Artifact Output

Write execution log to `docs/execution/{name}-log.md`:

```markdown
---
title: "{Feature Name} Execution Log"
source_plan: "docs/plans/{name}-plan.md"
status: in_progress | completed | blocked
started: YYYY-MM-DD
updated: YYYY-MM-DD
tasks_total: {N}
tasks_done: {N}
tasks_blocked: {N}
stage: execute
apex_version: "0.1.0"
---

# {Feature Name} Execution Log

## Task Progress
| Task | Status | Started | Completed | Test Status | Notes |
|------|--------|---------|-----------|-------------|-------|
| T1   | done   | HH:MM   | HH:MM     | GREEN       | {notes} |

## Verification Evidence
{Per-task verification from the 5-step gate}

## Issues Encountered
{Any deviations from plan, unexpected problems, decisions deferred}

## Deviations from Plan
{Any changes made during execution, with rationale and flag for Plan review}
```

---

## Register Artifact and Auto-Transition

After all tasks are done:

```bash
source "$PLUGIN_ROOT/hooks/state-helper"
apex_add_artifact "execute" "docs/execution/{name}-log.md"
```

Then tell the user:

> **Implementation complete.** {N}/{N} tasks done. All tests green.
> Execution log at `docs/execution/{name}-log.md`.
>
> Next: run `/apex-forge-review` for the quality gate.

If any tasks are blocked:

> **Execution partially complete.** {done}/{total} tasks done, {blocked} blocked.
> See execution log for details. Resolve blockers before proceeding to review.

---

## Design Decision Boundary

If you need to make a design decision during execution:

1. **Stop implementing.**
2. Document the decision needed: "Task T3 requires choosing between approach A and B
   for error handling. The plan does not specify."
3. Either:
   - Ask the user for a decision (fast path)
   - Return to `/apex-plan` to update the plan (proper path)
4. Do NOT silently make design choices during execution.

---

## Completion Status

| Status | When |
|--------|------|
| **DONE** | All tasks completed, tests green, execution log written. |
| **DONE_WITH_CONCERNS** | All tasks done but deviations from plan documented. |
| **BLOCKED** | One or more tasks cannot proceed due to missing dependencies or plan gaps. |
| **NEEDS_CONTEXT** | Plan is ambiguous; need clarification before continuing execution. |

---

## Integration Notes

- **From Plan**: the plan's task list is the source of truth. Execute follows it.
- **To Review**: the execution log + modified source files are the inputs.
  Review checks spec compliance and code quality across all tasks.
- **Verify stage**: the 5-step verification gate from `verify.md` runs after
  each task, not just at the end.

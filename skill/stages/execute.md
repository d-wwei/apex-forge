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

1. **Required upstream**: An approved plan (`docs/plans/{name}-plan.md`
   with `status: approved`).
2. If no approved plan is found, tell the user to run the Plan stage first.
   Do NOT implement against unwritten plans.
3. If a prior execution log exists, check which tasks are done vs pending
   and offer to resume.

---

## Phase Rule

**Execute is the DO phase. Design decisions do not happen here.**

If during implementation you discover:
- A requirement is ambiguous -> return to Brainstorm
- The plan is wrong or incomplete -> return to Plan
- A new task is needed not in the plan -> return to Plan

Do NOT make ad-hoc design decisions during execution.

---

## Input Triage

Read the plan and classify the work:

| Category | Criteria | Dispatch Strategy |
|----------|----------|-------------------|
| **Trivial** | 1-2 tasks, no inter-task dependencies, < 20 lines changed | Execute inline. Direct implementation. |
| **Small** | 3-10 tasks, mostly independent, moderate complexity | Parallel dispatch. Each independent task in its own pass. |
| **Large** | 10+ tasks, deep dependencies, or architectural changes | Hierarchical dispatch. Break into batches of 3-5 tasks, execute sequentially. |

### Trivial Dispatch
1. Read the task from the plan.
2. `apex task start T{N}` — mark in_progress (updates Dashboard).
3. Write the test (TDD Step 1).
4. Run the test, confirm RED.
5. Implement the minimum code to pass.
6. Run the test, confirm GREEN.
7. Verify via the 5-step gate.
8. `apex task submit T{N} "evidence: tests pass"` — submit for verification.
9. `apex task verify T{N} pass` — mark done (updates Dashboard).

### Small Dispatch (Parallel)
For each independent task (no unfinished dependencies):
1. Provide task ID, description, file paths, test paths, acceptance criteria.
2. Enforce TDD: write test FIRST, see RED, then implement.
3. Run two-stage review on each result (see below).
4. Tasks with dependencies wait until upstream tasks are done.

### Large Dispatch (Hierarchical)
1. Group tasks into batches of 3-5 based on dependency graph.
2. Execute each batch as a Small dispatch.
3. Between batches: verify outputs, check for integration issues.
4. If a batch fails, do NOT proceed. Fix first.

---

## TDD Enforcement

The TDD Iron Law applies to every task. No exceptions except throwaway
prototypes and generated code.

### The Sequence (per task)

```
1. WRITE THE TEST
   - Test file path from the plan
   - Test the behavior described in acceptance criteria
   - Test must be specific and falsifiable

2. RUN THE TEST -- CONFIRM RED
   - The test MUST fail
   - It must fail for the RIGHT reason (not syntax/import error)

3. IMPLEMENT THE MINIMUM CODE
   - Only enough to make the test pass
   - No extra features, no "while I'm here" additions

4. RUN THE TEST -- CONFIRM GREEN
   - The test must now pass
   - All other tests must still pass (no regressions)

5. REFACTOR (optional)
   - Clean up if needed
   - Tests must stay green after refactoring
```

### TDD Rationalization Counters

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
- Are the correct files created/modified?
- Verdict: PASS / FAIL with specific citation

### Stage B: Code Quality
- Clean code: readable, no dead code, proper naming
- Error handling: all error paths handled
- No regressions: existing tests still pass
- No scope creep: nothing implemented outside the plan
- Verdict: PASS / FAIL with specific citation

Both stages must PASS before a task is marked `done`.

---

## Progress Tracking

Track each task's state: `pending -> in_progress -> review -> done` (or `-> blocked`).

Use `apex task update T{N} --status {status}` to record transitions.

Maintain a progress table in the execution log:

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T1   | done   | 14:00   | 14:22     | Tests green |
| T2   | in_progress | 14:23 | -     | Working on test setup |

---

## Artifact Output

Write execution log to `docs/execution/{name}-log.md` with frontmatter
including title, source plan link, status, dates, and task counts.

The document includes:
- Task progress table
- Verification evidence per task
- Issues encountered
- Deviations from plan (with rationale)

After all tasks are done, register with:
`apex task create --stage execute --artifact docs/execution/{name}-log.md`

---

## Skill Dispatch

When the current task matches a trigger in `bindings.yaml`, load and invoke the corresponding external skill.

**Flow:**
1. Identify current task type (debugging, frontend, QA, design-to-code, etc.)
2. Read `bindings.yaml` → find matching entries under `execute:`
3. Sort by `priority` (lower number = higher priority)
4. For `concurrent: false` skills: execute sequentially, wait for completion
5. For `concurrent: true` skills: may run in parallel with other concurrent skills
6. After skill completes: validate output against `output_schema`
7. Map result to AF state using `mapping` rules (evidence grade, escalation action)
8. Record invocation in `.apex/state.json` → `skill_invocations[]`
9. Continue AF pipeline

**Schema mismatch handling:** If skill output does not match `output_schema`, log a warning and require the agent to manually confirm the mapping result.

**Invocation trace format:**
```json
{
  "stage": "execute",
  "skill": "<skill-name>",
  "version": "<skill-version>",
  "timestamp": "<ISO-8601>",
  "output_status": "<skill output status>",
  "af_mapping": "<mapped AF evidence grade or action>"
}
```

---

## Completion

After all tasks are done:

> **Implementation complete.** {N}/{N} tasks done. All tests green.
> Execution log at `docs/execution/{name}-log.md`.
> Next: proceed to the Review stage for the quality gate.

If any tasks are blocked:

> **Execution partially complete.** {done}/{total} tasks done, {blocked} blocked.
> Resolve blockers before proceeding to review.

| Status | When |
|--------|------|
| **DONE** | All tasks completed, tests green, log written. |
| **DONE_WITH_CONCERNS** | All tasks done but deviations documented. |
| **BLOCKED** | Tasks cannot proceed due to missing dependencies or plan gaps. |
| **NEEDS_CONTEXT** | Plan is ambiguous; need clarification. |

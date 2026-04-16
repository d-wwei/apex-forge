---
parent: skill/stages/execute.md
section: Input Triage → Dispatch Strategies + TDD Rationalization Counters
---

# Execute: Dispatch Strategies (Detail)

## Trivial Dispatch

1. Read the task from the plan.
2. `apex task start T{N}` — mark in_progress (updates Dashboard).
3. Write the test (TDD Step 1).
4. Run the test, confirm RED.
5. Implement the minimum code to pass.
6. Run the test, confirm GREEN.
7. Verify via the 5-step gate.
8. `apex task submit T{N} "evidence: tests pass"` — submit for verification.
9. `apex task verify T{N} pass` — mark done (updates Dashboard).

## Small Dispatch (Parallel)

**BEFORE dispatching sub-agents**, update task status in the main project:
```bash
# Mark all tasks being dispatched as in_progress (updates Dashboard immediately)
apex task assign T{N} && apex task start T{N}
```

For each independent task (no unfinished dependencies):
1. `apex task assign T{N} && apex task start T{N}` — **mandatory, do this BEFORE dispatch**.
2. Provide task ID, description, file paths, test paths, acceptance criteria.
3. Enforce TDD: write test FIRST, see RED, then implement.
4. Run two-stage review on each result (see execute.md Two-Stage Review).
5. Tasks with dependencies wait until upstream tasks are done.

**AFTER each sub-agent completes**, update from the main agent:
```bash
apex task submit T{N} "evidence: <summary>" && apex task verify T{N} pass
```

## Large Dispatch (Hierarchical)

1. Group tasks into batches of 3-5 based on dependency graph.
2. **Before each batch**: `apex task assign T{N} && apex task start T{N}` for all tasks in the batch.
3. Execute each batch as a Small dispatch.
4. **After each batch**: `apex task submit T{N} "evidence"` + `apex task verify T{N} pass` for completed tasks.
5. Between batches: verify outputs, check for integration issues.
6. If a batch fails, do NOT proceed. Fix first.

---

## TDD Rationalization Counters

| Thought | Counter |
|---------|---------|
| "I'll write the test after the code" | No. Test first. That is the law. |
| "This is too simple for a test" | Simple things break. Write the test. |
| "Let me just get the code working first" | The test defines "working." Write it first. |
| "I don't know how to test this" | Then you don't understand it well enough to build it. |

---
name: apex-forge-cross-session-exec
description: "Use when resuming a plan from a previous session, executing persistent plan artifacts across session boundaries, or when a plan was written by a different agent/session. Loads plan, reviews critically, executes with checkpoints."
---

# Cross-Session Plan Execution

Pick up an implementation plan written in a previous session, verify it's still valid, and execute it to completion with progress checkpoints that survive session boundaries.

## When to Use

- Resuming work from a prior session that left behind a plan
- Executing a plan written by a different agent or workflow
- User says "continue", "pick up where I left off", "execute the plan"
- A plan file exists in `.apex/` or `docs/plans/` but no work has started (or work is partial)

## Step 1 — LOAD

Find the plan. Check these locations in order:

```bash
apex status                           # Shows current stage and active artifacts
apex memory recall                    # Lists stored context from previous sessions
```

| Location | When |
|---|---|
| `.apex/state.json` → `artifacts` | Plan was created via AF workflow |
| `docs/plans/` | Convention for persistent plan files |
| `.apex/plans/` | Alternative AF location |
| User-specified path | User tells you where it is |

If no plan is found, stop and ask. Do not guess.

## Step 2 — REVIEW CRITICALLY

Read the entire plan before touching any code.

**Validate assumptions:**
- Do referenced files still exist at the expected paths?
- Have any files been modified since the plan was written? (`git log --since` against plan timestamp)
- Do dependencies listed in the plan still match `package.json` / `Cargo.toml` / etc.?
- Are external APIs or services still available?

**Flag stale items:**
- Files moved or renamed → update plan references
- New code merged since plan was written → check for conflicts or overlap
- Requirements changed → ask user before proceeding

If the plan has critical staleness (>30% of steps affected), stop and recommend re-planning rather than patching.

## Step 3 — RESUME STATE

Never redo completed work.

```bash
apex task list                        # See which tasks are done vs. open
apex task next                        # Find the next task to work on
```

| State | Action |
|---|---|
| No tasks exist yet | Create tasks from the plan |
| Some tasks completed | Resume from first open task |
| All tasks completed | Verify and ship (skip to Step 6) |

Inject prior session context if available:

```bash
apex memory inject                    # Load context from previous session into working memory
```

## Step 4 — EXECUTE

For each open task, follow the AF execute protocol:

```
1. apex task start <ID>
2. Write tests first (TDD)
3. Implement until tests pass
4. Run full verification: lint + type-check + test suite
5. apex task submit <ID> "summary of what was done"
6. apex task verify <ID> pass|fail "evidence"
```

**Verification gate:** Every task must have passing tests and verification before moving on. No exceptions.

**If blocked:** Do not guess or skip. Mark the task blocked, record why, and move to the next unblocked task. Return to blocked tasks after dependencies clear.

## Step 5 — CHECKPOINT

After each task completion, state is persisted automatically via `apex task submit`. This means if the session ends unexpectedly:

- Completed tasks remain marked done
- The next session can resume from Step 3
- No work is lost

**Explicit checkpoint** when you sense the session may end soon or after completing a logical group of tasks:

```bash
apex memory store "Completed tasks T1-T3. T4 blocked on [reason]. Next: T5."
```

## Step 6 — FINISH

When all tasks are done:

1. Run the full test suite one final time
2. Review the complete diff against the plan spec
3. Use `/apex-forge ship` to package and deliver

## Stale Plan Recovery

| Situation | Response |
|---|---|
| Files modified but changes are compatible | Note the drift, proceed with awareness |
| Files modified with conflicting changes | Stop. Show the conflict. Ask user to resolve or re-plan |
| Dependencies added/removed | Update plan to reflect current deps, confirm with user |
| New requirements appeared | Ask user: incorporate into current plan or defer to next cycle? |
| Plan references deleted files | Cannot proceed on affected tasks. Flag and ask. |

## Anti-Patterns

| Pattern | Fix |
|---|---|
| Start executing without reading the full plan | Always complete Step 2 before Step 4 |
| Redo tasks that previous session already finished | Always check `apex task list` first |
| Silently skip stale steps | Flag every discrepancy, even minor ones |
| Proceed with >30% stale plan | Re-plan instead of patching |
| Lose progress by not using apex task tracking | Every task goes through start/submit/verify |

## Integration

- **apex-forge-plan** creates the plans this skill executes
- **apex-forge-subagent-dev** is an alternative executor for same-session work
- **apex-forge-worktree** for isolated branch work during execution

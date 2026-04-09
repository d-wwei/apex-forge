---
name: apex-forge-subagent-dev
description: "Execute implementation plans by dispatching a fresh subagent per task with two-stage review (spec compliance + code quality). Use when tasks are mostly independent and you want to stay in the same session."
---

# Subagent-Driven Development

Execute a plan by dispatching one fresh subagent per task. Each task goes through a two-stage review gate before it's considered complete.

## When to Use

- You have an approved implementation plan with discrete tasks
- Tasks are mostly independent
- You want to stay in the current session (vs. separate worktrees)
- Plan has 3+ tasks that benefit from isolation

## Per-Task Cycle

```
For each task in the plan:

1. DISPATCH implementer subagent
   → Agent implements, writes tests, commits, self-reviews
   → If agent asks questions: answer, re-dispatch

2. DISPATCH spec reviewer subagent
   → Confirms code matches the plan specification
   → If not compliant: implementer fixes, re-review
   → MUST PASS before proceeding

3. DISPATCH code quality reviewer subagent
   → Reviews for quality, patterns, edge cases
   → If not approved: implementer fixes, re-review

4. Mark task complete: apex task verify <ID> pass
5. Move to next task
```

## Implementer Prompt Template

```
Implement task: [TITLE]
Specification: [EXACT SPEC FROM PLAN]

Context:
- Project: [name and purpose]
- Related files: [list]
- Dependencies completed: [list done tasks]

Requirements:
1. Write tests first (TDD)
2. Implement the feature
3. Run all tests, ensure green
4. Commit with descriptive message

Constraints:
- Only modify files listed in the spec
- Do not refactor unrelated code
- If you discover a design issue, report it — don't fix it

Return: Summary of changes + test results
```

## Handling Implementer Status

| Status | Action |
|---|---|
| DONE | Proceed to spec review |
| DONE_WITH_CONCERNS | Read concerns. Fix if correctness-related, note if cosmetic. |
| NEEDS_CONTEXT | Provide missing info, re-dispatch |
| BLOCKED (context) | Provide more context, re-dispatch |
| BLOCKED (too complex) | Break task into smaller pieces |
| BLOCKED (reasoning) | Use more capable model |

## Model Selection

| Task Type | Model Choice |
|---|---|
| Mechanical (rename, move, wire up) | Fast/cheap |
| Standard (implement feature, write tests) | Standard |
| Integration/judgment (API design, error handling) | Most capable |
| Review (spec compliance, code quality) | Most capable |

## Review Gates

### Stage 1: Spec Compliance

```
Review the implementation of [TASK] against its specification.

Spec: [PASTE EXACT SPEC]
Files changed: [LIST]

Check:
- Does the implementation match every requirement in the spec?
- Are there missing requirements?
- Are there additions not in the spec?

Verdict: PASS or FAIL with specific gaps
```

### Stage 2: Code Quality

Only runs AFTER spec compliance passes.

```
Review code quality for [TASK].

Files changed: [LIST]

Check:
- Test coverage adequate?
- Error handling complete?
- Edge cases considered?
- Code follows project patterns?
- No security issues?

Verdict: APPROVED or NEEDS_FIXES with specific items
```

## After All Tasks

1. Run final full code review across the entire implementation
2. Run complete test suite
3. Use `/apex-forge ship` to package and deliver

## Anti-Patterns

| Pattern | Fix |
|---|---|
| Skip spec review ("implementer already self-reviewed") | Both reviews are mandatory. Self-review ≠ external review. |
| Start quality review before spec passes | Spec compliance first. Always. |
| Let implementer fix quality issues without re-review | Every fix requires re-review. |
| Dispatch dependent tasks in parallel | Sequence tasks with dependencies. |

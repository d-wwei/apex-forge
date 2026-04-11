---
name: plan
description: Convert approved requirements into a concrete execution plan with file paths, tasks, and test scenarios
---

# Plan Stage

Convert approved requirements into a concrete, executable plan.
Every task traces back to an acceptance criterion. Every file path is exact.
No implementation code -- plans are decision artifacts.

---

**On entry:** `apex stage set plan`
**On completion:** `apex stage complete plan` + `apex stage artifact plan <plan-file>`

## Entry Conditions

1. **Required upstream**: An approved requirements document from Brainstorm
   (`docs/brainstorms/{name}-requirements.md` with `status: approved`).
2. Verify brainstorm requirements exist before proceeding.
   If no approved requirements are found, tell the user to run the
   Brainstorm stage first. Do NOT plan against unwritten requirements.
3. If an in-progress plan exists (`status: draft`), offer to resume.
   If an approved plan exists, offer to proceed to Execute.

---

## Process

### 1. Read Upstream Requirements

Parse the requirements document and extract:
- Problem statement (restate in 1-2 sentences)
- Acceptance criteria (traceability targets)
- Solution shape (architectural starting point)
- Constraints (non-negotiable boundaries)
- Dependencies (task ordering)

### 2. Plan Quality Bar

Every plan MUST include all of these. A plan missing any item is incomplete.

| Required Element | Description |
|-----------------|-------------|
| **Problem frame** | 1-2 sentences restating the core problem |
| **File paths** | Exact paths of files to create or modify |
| **Test file paths** | Exact paths for test files (one per acceptance criterion minimum) |
| **Decisions with rationale** | "Decision: X. Rationale: because Y, not Z" |
| **Dependency order** | Which tasks must complete before others can start |
| **Test scenarios** | At least one per acceptance criterion, in Given/When/Then |

### 3. Scope Rules

Apply these rules to prevent over-engineering:

**8-Files Rule**: If the plan touches more than 8 files, challenge each one:
- Is this file change essential to meeting the acceptance criteria?
- Can two file changes be consolidated?
- If every file is justified, document why the scope is large.

**2-Classes Rule**: If the plan introduces more than 2 new classes or modules:
- Is this abstraction necessary NOW, or is it premature?
- Can the same behavior be achieved with functions or extending existing classes?

When either rule triggers, present the challenge to the user and ask
whether to proceed or simplify.

### 4. Task Decomposition

Break the plan into discrete, assignable tasks:

| Field | Description |
|-------|-------------|
| **Task ID** | Sequential: T1, T2, T3... |
| **Description** | What this task accomplishes (1-2 sentences) |
| **Files** | Exact file paths this task creates or modifies |
| **Test files** | Exact test file paths for this task |
| **Complexity** | trivial / small / medium / large |
| **Dependencies** | Other task IDs that must complete first |
| **Acceptance criteria** | Which requirement criteria this task addresses |

### 5. NO Implementation Code

Plans contain directional pseudo-code at most. Actual code belongs in Execute.

- **Allowed**: "Function `validateInput` checks field types against schema
  and returns a ValidationResult with errors array."
- **Forbidden**: `function validateInput(data: unknown): ValidationResult { ... }`

---

## Artifact Output

Write to `docs/plans/{name}-plan.md` with frontmatter including title, scope,
status, dates, source requirements link, task count, and complexity estimate.

The document includes:
- Problem frame
- Decision log (decision / rationale / alternatives rejected)
- File manifest (create, modify, test files)
- Task list with full decomposition
- Test plan (acceptance criterion / scenario / test file)
- Dependency graph

---

## Plan Approval

- **Standard and Deep scope**: Present the plan and wait for explicit user approval.
- **Lightweight scope**: Auto-approve is permitted if the plan has 3 or fewer
  tasks and all acceptance criteria are covered.
- Update `status: approved` on approval.

After approval, register each task from the plan into the task board:

```bash
# Register every T{N} from the plan into .apex/tasks.json
apex task create "T1: <title>" "<description>" [DEP1 DEP2...]
apex task create "T2: <title>" "<description>" [DEP1 DEP2...]
# ... one per task in the decomposition table

# Record the plan document as an artifact
apex stage artifact plan "docs/plans/{name}-plan.md"
```

This is mandatory. Without `apex task create`, the Dashboard Kanban board stays empty.

---

## Completion

After writing and approving the plan:

> **Plan locked in.** Written to `docs/plans/{name}-plan.md` with {N} tasks.
> Next: proceed to the Execute stage to start implementation.

Do NOT auto-advance to Execute. The user invokes the next stage explicitly.

| Status | When |
|--------|------|
| **DONE** | Plan approved and written to artifact file. |
| **DONE_WITH_CONCERNS** | Approved with noted scope or complexity caveats. |
| **BLOCKED** | Plan rejected or upstream requirements missing. |
| **NEEDS_CONTEXT** | Cannot complete plan without additional info. |

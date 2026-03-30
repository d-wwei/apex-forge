---
name: apex-forge-plan
description: Convert approved requirements into a concrete execution plan with file paths, tasks, and test scenarios
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Plan Stage Preamble
source "$PLUGIN_ROOT/hooks/state-helper"

echo "=== APEX PLAN STAGE ==="
apex_set_stage "plan"

# Check for upstream brainstorm artifact
UPSTREAM=$(apex_check_upstream "brainstorm")
if [ "$UPSTREAM" = "NO_UPSTREAM" ]; then
  echo ""
  echo "[apex] WARNING: No approved requirements found in docs/brainstorms/"
  echo "UPSTREAM_MISSING=true"
else
  echo ""
  echo "[apex] Found upstream brainstorm artifacts:"
  echo "$UPSTREAM"
  echo "UPSTREAM_MISSING=false"
fi

# Check for existing plan artifacts (resume)
EXISTING=$(apex_find_upstream "plan")
if [ -n "$EXISTING" ]; then
  echo ""
  echo "[apex] Found existing plan artifacts:"
  echo "$EXISTING"
  echo "RESUME_AVAILABLE=true"
else
  echo "RESUME_AVAILABLE=false"
fi

apex_ensure_dirs
```

# Plan Stage

> apex-forge / workflow / stages / plan
>
> Convert approved requirements into a concrete, executable plan.
> Every task traces back to an acceptance criterion. Every file path is exact.
> No implementation code --- plans are decision artifacts.

---

## Entry Conditions

1. **Required upstream**: An approved requirements document from Brainstorm
   (`docs/brainstorms/{name}-requirements.md` with `status: approved`).
2. If `UPSTREAM_MISSING=true` from the preamble:
   - Tell the user: "No approved requirements found. Run `/apex-forge-brainstorm`
     first to capture requirements, or point me to an existing requirements doc."
   - Do NOT plan against unwritten or unapproved requirements.
3. If `RESUME_AVAILABLE=true`:
   - Check each found plan file for `status: draft`:
     - "Found an in-progress plan for **{name}** from {date}. Resume?"
   - Check for `status: approved`:
     - "Plan for **{name}** already approved. Proceed to `/apex-forge-execute`?"

---

## Process

### 1. Read Upstream Requirements

Parse the requirements document and extract:
- Problem statement (restate in 1-2 sentences as the problem frame)
- Acceptance criteria (these become the traceability targets)
- Solution shape (this is the architectural starting point)
- Constraints (these are non-negotiable boundaries)
- Dependencies (these determine task ordering)

### 2. Plan Quality Bar

Every plan MUST include all of these. A plan missing any item is incomplete.

| Required Element | Description |
|-----------------|-------------|
| **Problem frame** | 1-2 sentences restating the core problem from requirements |
| **File paths** | Exact paths of files to create or modify (no "somewhere in src/") |
| **Test file paths** | Exact paths for test files (one per acceptance criterion minimum) |
| **Decisions with rationale** | Key decisions stated as "Decision: X. Rationale: because Y, not Z" |
| **Dependency order** | Which tasks must complete before others can start |
| **Test scenarios** | At least one scenario per acceptance criterion, in Given/When/Then format |

### 3. Scope Challenge

Apply these rules to prevent over-engineering:

**8-Files Rule**: If the plan touches more than 8 files, challenge each one:
- Is this file change essential to meeting the acceptance criteria?
- Can two file changes be consolidated?
- If every file is justified, document why the scope is large.

**2-Classes Rule**: If the plan introduces more than 2 new classes or modules:
- Is this abstraction necessary NOW, or is it premature?
- Can the same behavior be achieved with functions or extending existing classes?
- If the abstractions are justified, document the reasoning.

When either rule triggers, present the challenge to the user:
> "This plan touches {N} files / introduces {N} new classes. Here is the
> justification for each. Want to proceed, or should we simplify?"

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
| **Acceptance criteria** | Which requirement criteria this task addresses (by number) |

### 5. NO Implementation Code

Plans contain directional pseudo-code at most. Actual code belongs in Execute.

- **Allowed**: "Function `validateInput` checks field types against schema and returns
  a ValidationResult with errors array."
- **Forbidden**: `function validateInput(data: unknown): ValidationResult { ... }`

If you catch yourself writing real code, stop. You are in Plan, not Execute.

---

## Artifact Output

Write to `docs/plans/{name}-plan.md` using this template:

```markdown
---
title: "{Feature Name} Plan"
scope: lightweight | standard | deep
status: draft | approved | rejected
created: YYYY-MM-DD
updated: YYYY-MM-DD
source_requirements: "docs/brainstorms/{name}-requirements.md"
task_count: {N}
estimated_complexity: trivial | small | medium | large
stage: plan
apex_version: "0.1.0"
---

# {Feature Name} Plan

## Problem Frame
{1-2 sentence restatement from requirements}

## Decision Log
| Decision | Rationale | Alternatives Rejected |
|----------|-----------|----------------------|
| {decision} | {why} | {what else was considered} |

## File Manifest
### Files to Create
- `path/to/new/file.ts` — {purpose}

### Files to Modify
- `path/to/existing/file.ts` — {what changes and why}

### Test Files
- `path/to/test/file.test.ts` — {what it validates}

## Task List

### T1: {Task Title}
- **Description**: {what this task does}
- **Files**: `path/to/file.ts`
- **Test**: `path/to/file.test.ts`
- **Complexity**: small
- **Dependencies**: none
- **Criteria**: AC-1, AC-3

### T2: {Task Title}
...

## Test Plan
| Acceptance Criterion | Test Scenario (Given/When/Then) | Test File |
|---------------------|--------------------------------|-----------|
| AC-1: {criterion} | Given {setup}, When {action}, Then {expected} | `path/test.ts` |

## Dependency Graph
{ASCII diagram or ordered list showing task execution order}

## Approval
- **Status**: {draft | approved}
- **Approved by**: {user}
- **Date**: {YYYY-MM-DD}
- **Notes**: {conditions}
```

---

## Plan Approval

- For **Standard** and **Deep** scope: present the plan and wait for explicit user
  approval. "Here is the plan. Review the tasks, file paths, and test scenarios.
  Ready to proceed?"
- For **Lightweight** scope: auto-approve is permitted if the plan has 3 or fewer
  tasks and all acceptance criteria are covered.
- Update `status: approved` and `updated` date on approval.

---

## Register Artifact and Auto-Transition

After writing and approving the plan:

```bash
source "$PLUGIN_ROOT/hooks/state-helper"
apex_add_artifact "plan" "docs/plans/{name}-plan.md"
```

Then tell the user:

> **Plan locked in.** Written to `docs/plans/{name}-plan.md` with {N} tasks.
>
> Next: run `/apex-forge-execute` to start implementation.

Do NOT auto-advance to Execute. The user invokes the next stage explicitly.

---

## Integration Notes

- **From Brainstorm**: the requirements doc is the sole input. Every task must trace
  to at least one acceptance criterion. Untraceable tasks are out of scope.
- **To Execute**: the plan is the source of truth. Executors follow the task list.
  If a design decision is needed during execution, return to Plan.
- **Scope determines dispatch**: task count and complexity from this plan feed into
  Execute's triage (Trivial / Small / Large).

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

1. `docs/brainstorms/{name}-requirements.md` must exist with `status: approved`.
2. Document must contain: Acceptance Criteria, Constraints, scope classification.
3. If any check fails: report which check failed; do not plan. Instruct user to complete Brainstorm first.
4. If a `draft` plan exists, offer to resume. If an `approved` plan exists, offer to proceed to Execute.

## Process

### 1. Read Upstream Requirements

Extract: problem statement, acceptance criteria, solution shape, constraints, dependencies.

### 2. Plan Quality Bar

| Required Element | Description |
|-----------------|-------------|
| **Problem frame** | 1-2 sentences restating the core problem |
| **File paths** | Exact paths of files to create or modify |
| **Test file paths** | Exact paths for test files (one per acceptance criterion minimum) |
| **Decisions with rationale** | "Decision: X. Rationale: because Y, not Z" |
| **Dependency order** | Which tasks must complete before others can start |
| **Test scenarios** | At least one per acceptance criterion, in Given/When/Then |

### 3. Scope Rules

**8-Files Rule**: >8 files touched — challenge each: essential? consolidatable? Document if justified.
**2-Classes Rule**: >2 new classes/modules — is the abstraction necessary now? Could functions suffice?
When either triggers, present the challenge and ask whether to proceed or simplify.

### 4. Task Decomposition

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

Directional pseudo-code at most. Actual code belongs in Execute.
- **Allowed**: prose describing what a function does and what it returns.
- **Forbidden**: actual function signatures or bodies.

## Artifact Output

Write to `docs/plans/{name}-plan.md`, then register: `apex stage artifact plan "docs/plans/{name}-plan.md"`

→ See `skill/details/plan-template.md` for full document structure (frontmatter, problem frame, decision log, file manifest, task list, test plan, dependency graph).

## Plan Approval

- **Standard and Deep scope**: Present the plan and wait for explicit user approval.
- **Lightweight scope**: Auto-approve if ≤3 tasks and all acceptance criteria are covered.
- Update `status: approved` on approval.

After approval, register tasks and artifact — both mandatory:
```bash
apex task create "T1: <title>" "<description>" [DEP...]   # repeat for every T{N}
apex stage artifact plan "docs/plans/{name}-plan.md"
```

## Exit Gate

### Structural Checks

| # | Check | Criterion | Verification |
|---|-------|-----------|-------------|
| S1 | Artifact exists | `docs/plans/{name}-plan.md` exists | File read |
| S2 | Artifact registered | `apex stage artifact plan` was called | .apex/state.json artifacts |
| S3 | File manifest | Document contains file manifest with exact paths | Section scan |
| S4 | Test file paths | Document contains test file paths section | Section scan |
| S5 | Task decomposition | Document contains tasks (T1, T2...) with ID, description, files, dependencies | Section scan |
| S6 | Tasks registered | All T{N} from plan exist in `apex task list` | CLI check |
| S7 | Status approved | Frontmatter `status: approved` | Frontmatter check |

### Substance Prompts (Tier 2+)

| # | Prompt | Cross-reference |
|---|--------|----------------|
| Q1 | Does every task trace back to at least one acceptance criterion? Are there acceptance criteria with no corresponding task? | `docs/brainstorms/{name}-requirements.md` |
| Q2 | Are test scenarios meaningful — do they test behavior (given/when/then) or just existence? Flag any test that merely checks "function is callable" without verifying behavior. | Test scenario section in plan |

---

## Completion

Report: **Plan locked in.** Written to `docs/plans/{name}-plan.md` with {N} tasks. Do NOT auto-advance to Execute.

| Status | When |
|--------|------|
| **DONE** | Plan approved and written to artifact file. |
| **DONE_WITH_CONCERNS** | Approved with noted scope or complexity caveats. |
| **BLOCKED** | Plan rejected or upstream requirements missing. |
| **NEEDS_CONTEXT** | Cannot complete plan without additional info. |

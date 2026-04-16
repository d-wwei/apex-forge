# Plan Artifact Template

Full document structure for `docs/plans/{name}-plan.md`.

## Frontmatter

```yaml
---
title: "{Feature Name} Plan"
scope: standard | lightweight | deep
status: draft | approved
created: YYYY-MM-DD
updated: YYYY-MM-DD
source_requirements: docs/brainstorms/{name}-requirements.md
task_count: N
complexity: trivial | small | medium | large
---
```

## Document Sections

### Problem Frame
1–2 sentences restating the core problem from the requirements document.

### Decision Log
Each decision entry:
- **Decision**: What was chosen.
- **Rationale**: Why, with explicit reference to acceptance criteria or constraints.
- **Alternatives rejected**: What else was considered and why it was ruled out.

### File Manifest
Three sub-sections with exact paths (no globs, no placeholders):

| Category | Path | Action |
|----------|------|--------|
| Create   | `src/foo/bar.ts` | New file |
| Modify   | `src/existing.ts` | Add function X |
| Test     | `tests/foo/bar.test.ts` | New test file |

### Task List
Full decomposition table — one row per task:

| Task ID | Description | Files | Test Files | Complexity | Dependencies | Acceptance Criteria |
|---------|-------------|-------|-----------|-----------|-------------|---------------------|
| T1 | ... | `path/a.ts` | `tests/a.test.ts` | small | — | AC-1 |
| T2 | ... | `path/b.ts` | `tests/b.test.ts` | medium | T1 | AC-2, AC-3 |

### Test Plan
One row per acceptance criterion:

| Acceptance Criterion | Scenario | Given / When / Then | Test File |
|---------------------|----------|----------------------|-----------|
| AC-1 | Happy path | Given X, When Y, Then Z | `tests/a.test.ts` |

### Dependency Graph
Text or ASCII representation of task ordering, e.g.:

```
T1 → T2 → T4
T1 → T3 → T4
```

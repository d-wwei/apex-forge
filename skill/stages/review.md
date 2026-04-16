---
name: review
description: Dynamic multi-persona quality gate -- selects reviewers based on diff content
---

# Review Stage

**On entry:** `apex stage set review` | **On completion:** `apex stage complete review`

## Entry Conditions

1. Execute stage complete: all tasks done, tests passing, `docs/execution/{name}-log.md` exists.
2. Gather context: execution log + git diff of changed files.
3. Verify: `apex task list` all `done`; run test suite; if any check fails, report it and halt.

## Review Modes

| Mode | Behavior |
|------|----------|
| **Interactive** (default) | Pause at each gate, ask user at decision points |
| **Autofix** | Apply safe fixes automatically, surface gated/manual as todos |
| **Report-only** | Read-only, no changes to source files |
| **Headless** | Structured JSON output, no interaction |

## Review Scope

Read execution log (what was built) + plan (what should have been built) + each changed file fresh. Run test suite. Determine conditional personas from changed file types.

## Dynamic Persona Selection

### Always-On Personas

| Persona | Focus |
|---------|-------|
| **Security Reviewer** | Injection, SSRF, trust boundaries, auth/authz, secrets, data exposure, cryptography |
| **Correctness Reviewer** | Edge cases, error handling, state consistency, contract compliance, resource management, null propagation |
| **Spec Compliance Reviewer** | Plan adherence, acceptance criteria, file manifest, scope boundary, test coverage, deviation docs |

Full persona descriptions: `skill/details/review-personas.md`

### Conditional Personas (activate based on changed file types)

| Persona | Activates When |
|---------|----------------|
| SQL Safety | `.sql`, migration files, ORM models, repository/DAO changes |
| Frontend | `.tsx`, `.jsx`, `.vue`, `.svelte`, `.css`, `.scss`, `.less` |
| API Contract | Route handlers, controllers, resolvers, API schemas |
| Performance | Hot paths, workers, cache layers, batch processors |
| Dependency | `package.json`, `requirements.txt`, `go.mod`, lock files |
| Test Quality | Test/spec files changed |
| Configuration | `.env`, config files, CI/CD, Dockerfiles |
| Concurrency | Async/await, threads, locks, mutexes, channels, queues |
| Schema Drift | DB schemas, type definitions, GraphQL, protobuf, OpenAPI |
| Framework (Rails/React/Next.js/Django/Go/Vue/Svelte) | Framework-specific files (`.rb`, `.py`, `.go`, `.tsx`, `.vue`, config files) |

### Adversarial Reviewer (always runs last)

Actively tries to break the code using: Assumption Violation, Composition Failures, Cascade Construction, Abuse Cases.
Full technique descriptions: `skill/details/review-personas.md`

## Finding Format

Each finding: **Severity** (P0–P3) | **Persona** | **Confidence** (high/medium/low) | **File** (`path:line`) | **Description** | **Evidence** | **Suggested fix** | **Autofix class** (safe_auto / gated_auto / manual / advisory)

### Severity Levels

| Severity | Definition | Action |
|----------|-----------|--------|
| **P0** | Security vulnerability, data loss, crash | Fix immediately. Blocks ship. |
| **P1** | Functional bug affecting users | Fix before ship. |
| **P2** | Quality issue, code smell, missing test | Fix before completing review. ≤10 lines → fix now. >10 lines → create task, fix before ship. |
| **P3** | Minor improvement, style nit | Track for later. May defer to next iteration. |

## Artifact Output

Write `docs/reviews/{name}-review.md` (summary, per-persona findings, auto-fixes, suppressed findings, verification evidence).
Then: `apex task create --stage review --artifact docs/reviews/{name}-review.md`

## Skill Dispatch

Load and invoke external skills per `bindings.yaml` for domain-specific review (security, frontend, UX).
Design reviews run a two-layer flow: `gates/design-baseline.md` first; only on pass, load `/tasteful-frontend`.
Record each invocation in `.apex/state.json → skill_invocations[]`; aggregate verdicts into final status.

Full 10-step flow + invocation trace format: `skill/details/review-skill-dispatch.md`

## Exit Gate

Before `apex stage complete review`, run the Stage Exit Gate (`gates/stage-exit-gate.md`).

### Structural Checks

| # | Check | Criterion | Verification |
|---|-------|-----------|-------------|
| S1 | Artifact exists | `docs/reviews/{name}-review.md` exists | File read |
| S2 | Artifact registered | `apex stage artifact review` was called | .apex/state.json artifacts |
| S3–S6 | All 4 persona sections present | Security, Correctness, Spec Compliance, Adversarial sections all exist | Section scan |
| S7 | Status field | Status is DONE or DONE_WITH_CONCERNS | Frontmatter/content check |
| S8 | No unresolved P0 | No finding with severity P0 has unresolved status | Content scan |
| S9 | No unresolved P2 | All P2 findings are resolved (fixed or converted to task with fix committed) | Content scan |

### Substance Prompts (Tier 2+)

| # | Prompt | Cross-reference |
|---|--------|----------------|
| Q1 | Every finding must cite a specific `file:line`. Flag any that uses "potential issue" or "might be problematic" without a concrete location. | Review artifact |
| Q2 | Adversarial section must name at least one specific assumption violation or abuse case with a concrete scenario — not boilerplate "no significant issues found". | Review artifact |

## Completion

| Status | When | Next Step |
|--------|------|-----------|
| **DONE** | No P0, P1, or P2 findings unresolved | Proceed to Ship stage |
| **DONE_WITH_CONCERNS** | No P0, P1/P2 resolved, P3 acknowledged | Acknowledge and proceed to Ship |
| **BLOCKED** | Any P0, or unresolved P1/P2 | Fix issues, re-run review |
| **NEEDS_CONTEXT** | Missing info for assessment | Provide context, re-run review |

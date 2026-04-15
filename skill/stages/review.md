---
name: review
description: Dynamic multi-persona quality gate -- selects reviewers based on diff content
---

# Review Stage

The quality gate. A dynamic panel of reviewers selected based on what actually
changed. No rubber-stamping. Every claim backed by fresh evidence.

---

**On entry:** `apex stage set review`
**On completion:** `apex stage complete review`

## Entry Conditions

1. Execute stage should be complete (all tasks done, tests passing).
2. Gather context: execution log from `docs/execution/`, git diff of changed files.
3. If neither execution log nor diff is found, ask what to review.

### Upstream Entry Verification

Before starting Review work, verify Execute stage completeness:

1. All tasks in `apex task list` must have status `done`.
2. `docs/execution/{name}-log.md` must exist.
3. Run test suite — all tests must pass.
4. If any check fails: report which check failed. Instruct user to complete Execute first.

---

## EVIDENTIARY DISCIPLINE

```
================================================================
  THIS STAGE ENFORCES EVIDENTIARY DISCIPLINE.

  While Review is active, all factual claims must be tagged:

    [已验证] — Based on actual investigation (read code, traced
               call graph, ran test, checked behavior).
    [假设]   — Unverified speculation. Must be explicitly marked.

  Review-specific violations:
    ✗ "This code path can't be reached" without tracing callers.
    ✗ "This edge case doesn't apply" without usage data or evidence.
    ✗ "Input is already sanitized upstream" without tracing the
      sanitization call chain.
    ✗ "Performance is acceptable" without benchmark or measurement.
    ✗ "Not an issue" dismissal of a finding without specific
      evidence for why it's not an issue.
    ✗ "This function handles null correctly" without reading
      the implementation.

  When about to dismiss a finding or claim code is safe:
    → STOP. Either verify now (read the code, trace the path,
      run the test), or tag [假设] and explain why verification
      is deferred.

  Findings MUST cite specific file:line evidence.
  Dismissals MUST explain what was checked and why the issue
  does not apply.

  This is a hard constraint, same severity as "no code in
  Brainstorm."
================================================================
```

---

## Review Modes

| Mode | Behavior |
|------|----------|
| **Interactive** (default) | Pause at each gate, ask user at decision points |
| **Autofix** | Apply safe fixes automatically, surface gated/manual as todos |
| **Report-only** | Read-only, no changes to source files |
| **Headless** | Structured JSON output, no interaction |

---

## Review Scope

1. Read the execution log to understand what was built.
2. Read the plan to understand what SHOULD have been built.
3. Read each changed file fresh (not from memory).
4. Run the test suite to establish current status.
5. Determine which conditional personas to activate based on changed file types.

---

## Dynamic Persona Selection

### Always-On Personas

**Persona 1: Security Reviewer** -- Injection, SSRF, trust boundaries, auth/authz, secrets, data exposure, cryptography.

**Persona 2: Correctness Reviewer** -- Edge cases, error handling, state consistency, contract compliance, resource management, boundary conditions, null propagation.

**Persona 3: Spec Compliance Reviewer** -- Plan adherence, acceptance criteria coverage, file manifest match, scope boundary, test coverage, deviation documentation.

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
| Rails | `.rb`, `Gemfile`, `config/routes` |
| React/Next.js | `.tsx`/`.jsx`, `next.config` |
| Python/Django | `.py`, `requirements.txt`, `pyproject.toml` |
| Go | `.go`, `go.mod` |
| Vue/Svelte | `.vue`/`.svelte` files |

### Adversarial Reviewer (always runs last)

Uses four techniques:
1. **Assumption Violation** -- List implicit assumptions, construct violation scenarios.
2. **Composition Failures** -- Identify component boundaries, construct seam failures.
3. **Cascade Construction** -- Trace minor triggers through 3+ step failure chains.
4. **Abuse Cases** -- For each new endpoint/input, model malicious usage.

---

## Finding Format

```
### Finding: {short description}
- **Severity**: P0 | P1 | P2 | P3
- **Persona**: {which reviewer}
- **Confidence**: high | medium | low
- **File**: `path/to/file.ts:line`
- **Description**: {the issue}
- **Evidence**: {what was observed}
- **Suggested fix**: {concrete approach}
- **Autofix class**: safe_auto | gated_auto | manual | advisory
```

### Severity Levels

| Severity | Definition | Action |
|----------|-----------|--------|
| **P0** | Security vulnerability, data loss, crash | Fix immediately. Blocks ship. |
| **P1** | Functional bug affecting users | Fix before ship. |
| **P2** | Quality issue, code smell, missing test | Fix before completing review. Estimated fix ≤ 10 lines → fix now, no deferral. Estimated fix > 10 lines → create task, still fix before ship. |
| **P3** | Minor improvement, style nit | Track for later. May defer to next iteration. |

### Autofix Classes

| Class | Meaning |
|-------|---------|
| **safe_auto** | Mechanical fix, safe to apply without human review |
| **gated_auto** | Likely correct but needs human confirmation |
| **manual** | Requires human judgment |
| **advisory** | Informational only |

---

## Artifact Output

Write to `docs/reviews/{name}-review.md` with summary, per-persona findings,
auto-fixes applied, suppressed findings, and verification evidence.

After writing, register with:
`apex task create --stage review --artifact docs/reviews/{name}-review.md`

---

## Skill Dispatch

When the review involves specific domains, load and invoke external skills per `bindings.yaml`.

**Flow:**
1. Analyze the diff to determine which review triggers apply (code review, security, frontend visual, product UX)
2. Read `bindings.yaml` → find matching entries under `review:`
3. Sort by `priority` (lower number = higher priority)
4. For `concurrent: false` skills: execute sequentially
5. For `concurrent: true` skills: may run in parallel
6. **Design review special flow** (two-layer):
   a. First: run `gates/design-baseline.md` (AF-owned, objective checks)
   b. If baseline fails → REJECTED, return to Execute. Do NOT proceed to layer 2.
   c. If baseline passes → load `/tasteful-frontend` for subjective deep review
7. After each skill completes: validate output against `output_schema`
8. Map result to AF review state using `mapping` rules
9. Record invocation in `.apex/state.json` → `skill_invocations[]`
10. Aggregate all skill verdicts into final review status

**Invocation trace format:**
```json
{
  "stage": "review",
  "skill": "<skill-name>",
  "version": "<skill-version>",
  "timestamp": "<ISO-8601>",
  "output_status": "<skill verdict>",
  "af_mapping": "<mapped AF review result>"
}
```

---

## Exit Gate

Before `apex stage complete review`, run the Stage Exit Gate (`gates/stage-exit-gate.md`).

### Structural Checks

| # | Check | Criterion | Verification |
|---|-------|-----------|-------------|
| S1 | Artifact exists | `docs/reviews/{name}-review.md` exists | File read |
| S2 | Artifact registered | `apex stage artifact review` was called | .apex/state.json artifacts |
| S3 | Security section | Document contains Security Reviewer findings section | Section scan |
| S4 | Correctness section | Document contains Correctness Reviewer findings section | Section scan |
| S5 | Spec Compliance section | Document contains Spec Compliance Reviewer findings section | Section scan |
| S6 | Adversarial section | Document contains Adversarial Reviewer findings section | Section scan |
| S7 | Status field | Status is DONE or DONE_WITH_CONCERNS | Frontmatter/content check |
| S8 | No unresolved P0 | No finding with severity P0 has unresolved status | Content scan |
| S9 | No unresolved P2 | All P2 findings are resolved (fixed or converted to task with fix committed) | Content scan |

### Substance Prompts (Tier 2+)

| # | Prompt | Cross-reference |
|---|--------|----------------|
| Q1 | Are findings backed by specific file:line evidence? Read each finding and flag any that says "potential issue" or "might be problematic" without citing a specific file path and line number. | Review artifact |
| Q2 | Is the adversarial section genuine? Does it identify real risks with concrete scenarios, or does it contain boilerplate like "no significant issues found"? A genuine adversarial section names at least one specific assumption violation or abuse case with a concrete scenario. | Review artifact |
| Q3 | Are "not an issue" dismissals backed by [已验证] evidence? Flag any finding dismissal that claims code is safe, an edge case doesn't apply, or a path can't be reached without citing specific file:line evidence or test output. Untagged dismissals are violations. | Review artifact |
| Q4 | Are behavioral claims about code verified? Flag assertions like "this handles null", "input is sanitized upstream", or "this function is thread-safe" that lack [已验证] tag with specific evidence (file read, traced call chain, ran test). | Review artifact, codebase |

---

## Completion

Based on status, report to user:

| Status | When | Next Step |
|--------|------|-----------|
| **DONE** | No P0, P1, or P2 findings unresolved | Proceed to Ship stage |
| **DONE_WITH_CONCERNS** | No P0, P1/P2 resolved, P3 acknowledged | Acknowledge and proceed to Ship |
| **BLOCKED** | Any P0, or unresolved P1/P2 | Fix issues, re-run review |
| **NEEDS_CONTEXT** | Missing info for assessment | Provide context, re-run review |

---
name: review
description: Dynamic multi-persona quality gate -- selects reviewers based on diff content
---

# Review Stage

The quality gate. A dynamic panel of reviewers selected based on what actually
changed. No rubber-stamping. Every claim backed by fresh evidence.

---

## Entry Conditions

1. Execute stage should be complete (all tasks done, tests passing).
2. Gather context: execution log from `docs/execution/`, git diff of changed files.
3. If neither execution log nor diff is found, ask what to review.

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
| **P2** | Quality issue, code smell, missing test | Fix in current cycle. |
| **P3** | Minor improvement, style nit | Track for later. |

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

## Completion

Based on status, report to user:

| Status | When | Next Step |
|--------|------|-----------|
| **DONE** | No P0 or P1 findings | Proceed to Ship stage |
| **DONE_WITH_CONCERNS** | No P0, P1 acknowledged | Acknowledge and proceed to Ship |
| **BLOCKED** | Any P0 or unresolved P1 | Fix issues, re-run review |
| **NEEDS_CONTEXT** | Missing info for assessment | Provide context, re-run review |

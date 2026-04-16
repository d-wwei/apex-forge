---
parent: skill/stages/review.md
---

# Review Personas — Full Descriptions

## Always-On Personas

### Persona 1: Security Reviewer

Focus areas: injection attacks (SQL, command, SSTI, SSRF), trust boundary violations,
authentication and authorization flaws, secrets or credentials in code or configs,
data exposure (PII, tokens, internal paths), and cryptographic misuse (weak algorithms,
hardcoded keys, improper IV/nonce handling).

### Persona 2: Correctness Reviewer

Focus areas: edge cases (empty inputs, boundary values, off-by-one), error handling
(unhandled exceptions, swallowed errors, missing rollback), state consistency (race
conditions, partial writes, stale cache), contract compliance (function preconditions,
return value invariants), resource management (leaks of file handles, connections,
memory), and null/undefined propagation.

### Persona 3: Spec Compliance Reviewer

Focus areas: plan adherence (every task in the plan reflected in changes), acceptance
criteria coverage (each criterion verifiably met), file manifest match (no unexpected
files created or deleted), scope boundary (no undeclared out-of-scope changes),
test coverage (each new code path has a corresponding test), and deviation
documentation (any intentional deviation from spec is recorded).

---

## Adversarial Reviewer — Four Techniques

The Adversarial Reviewer always runs last. It does not confirm that the code looks
correct — it actively tries to break it using the following four techniques:

### 1. Assumption Violation

List every implicit assumption the code makes (e.g., "input is always a non-empty
string", "the external service always responds within 5 seconds", "user IDs are
monotonically increasing"). For each assumption, construct a concrete scenario where
that assumption is violated and trace what the code does in that scenario.

### 2. Composition Failures

Identify every component boundary in the changed code (function calls, module imports,
service clients, middleware chains). For each boundary, construct a seam failure:
what happens if the component on the other side behaves incorrectly, is slow,
returns an unexpected shape, or is unavailable?

### 3. Cascade Construction

Identify minor, low-severity triggers (a slightly malformed header, an off-by-one
in a loop counter, a transient network hiccup). Trace each trigger forward through
at least 3 steps. Does the minor trigger amplify into data corruption, service
unavailability, or silent data loss? Name the full chain.

### 4. Abuse Cases

For each new endpoint, input field, or user-controlled parameter introduced by
the diff, model explicit malicious usage: what does an attacker who knows the code
do with this surface? Cover at minimum: resource exhaustion, privilege escalation,
data exfiltration, and denial-of-service.

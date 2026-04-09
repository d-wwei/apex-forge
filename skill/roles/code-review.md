---
name: code-review
description: Pre-landing diff review with security, correctness, and quality analysis
---

# Code Review

Pre-landing diff review. Every finding is concrete: file, line, severity, and a suggested fix. No vague "consider improving" comments.

---

## REVIEW SCOPE

Read the full diff before starting any analysis. If the diff is large (>500 lines), process in sections:
1. New files first (understand what was added)
2. Modified files by directory (understand scope)
3. Deleted files last (understand removals)

---

## REVIEW CHECKLIST

### 1. SQL Safety

| Check | What to Look For |
|-------|-----------------|
| **Injection** | String concatenation in queries, unparameterized user input |
| **N+1 queries** | Loops that execute queries, missing eager loading |
| **Missing indexes** | New WHERE/JOIN columns without corresponding index migration |
| **Migration safety** | Destructive ops without reversibility, missing `IF EXISTS` |
| **Transaction scope** | Multi-table mutations outside a transaction |

### 2. LLM Trust Boundaries

| Check | What to Look For |
|-------|-----------------|
| **Prompt injection** | User input concatenated directly into prompts |
| **Output trust** | LLM output used in SQL, shell commands, or eval without sanitization |
| **Token exposure** | API keys in client-side code or logs |
| **Cost control** | Unbounded token usage, missing rate limits on LLM calls |

### 3. Conditional Side Effects

| Check | What to Look For |
|-------|-----------------|
| **If/else mutations** | Branches that modify state — ensure both paths handled |
| **Early returns** | Return before cleanup/rollback code executes |
| **Implicit fallthrough** | Switch/case without break, missing else branches |
| **Null propagation** | Optional chaining hiding null where it should be caught |

### 4. Security (OWASP Top 10)

| Check | What to Look For |
|-------|-----------------|
| **A01: Broken Access Control** | Missing auth checks on new endpoints, IDOR |
| **A02: Cryptographic Failures** | Hardcoded secrets, weak hashing, plain-text storage |
| **A03: Injection** | SQL, XSS, command injection, template injection |
| **A04: Insecure Design** | Missing rate limits, no abuse prevention |
| **A05: Security Misconfiguration** | Debug mode in prod config, permissive CORS |
| **A06: Vulnerable Components** | Known CVEs in added dependencies |
| **A07: Auth Failures** | Weak password rules, missing MFA hooks |
| **A08: Data Integrity** | Unsigned data in critical paths |
| **A09: Logging Failures** | Sensitive data in logs, missing audit trail |
| **A10: SSRF** | User-controlled URLs in server-side requests |

### 5. Error Handling

| Check | What to Look For |
|-------|-----------------|
| **Swallowed errors** | Empty catch blocks |
| **Generic handlers** | `catch (Exception e)` hiding specific failures |
| **Missing error paths** | Happy path only, error/edge cases ignored |
| **Error exposure** | Stack traces in user-facing errors |
| **Retry without backoff** | Retry loops without exponential backoff or max attempts |

### 6. Test Coverage

| Check | What to Look For |
|-------|-----------------|
| **New code without tests** | Changed files without corresponding test changes |
| **Test quality** | Tests that only check happy path |
| **Flaky patterns** | `setTimeout`, `sleep`, fixed ports, time-dependent assertions |
| **Mock accuracy** | Mocks that don't match the actual interface |

### 7. Code Quality

| Check | What to Look For |
|-------|-----------------|
| **Dead code** | Unused imports, unreachable branches, commented-out code |
| **Naming** | Misleading names, abbreviations without context |
| **Complexity** | Functions > 50 lines, nesting > 3 levels |
| **Duplication** | Copy-pasted logic that should be extracted |
| **Type safety** | `any` types, unchecked casts, missing null checks |

---

## FINDING FORMAT

Every finding must include ALL of these fields:

```
finding: [clear description of the issue]
severity: P0 | P1 | P2 | P3
file: [exact file path]
line: [line number or range]
category: sql | llm-trust | side-effect | security | error-handling | test | quality
evidence: [the actual code that demonstrates the issue]
suggested_fix: [concrete code change, not "consider improving"]
```

| Severity | Meaning | Review Impact |
|----------|---------|---------------|
| P0 | Security vulnerability, data loss risk | BLOCK — must fix |
| P1 | Functional bug, incorrect behavior | BLOCK — must fix |
| P2 | Quality issue, maintainability concern | SHIP_WITH_FIXES — should fix |
| P3 | Style, minor improvement, nit | SHIP — track for later |

---

## VERDICTS

The review ends with exactly one verdict:

**SHIP**: No P0 or P1 findings. P2 count < 3. Code meets quality bar.

**SHIP_WITH_FIXES**: No P0. P1 count <= 2 with clear fixes. Or P2 count >= 3.

**BLOCK**: Any P0 finding. Or P1 count > 2. Or fundamental design issue.

Each verdict includes: confidence level, one-sentence summary, and (for SHIP_WITH_FIXES/BLOCK) a numbered list of required fixes with file:line references.

---

## COMPLETION STATUS

| Status | When |
|--------|------|
| **DONE** | Review complete, verdict rendered with evidence |
| **DONE_WITH_CONCERNS** | Review complete but confidence is low (large diff, unfamiliar domain) |
| **BLOCKED** | Cannot review — diff is empty, git state is broken, files missing |
| **NEEDS_CONTEXT** | Cannot assess correctness without understanding the spec/requirements |

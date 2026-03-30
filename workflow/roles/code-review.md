---
name: apex-forge-code-review
description: Pre-landing diff review with security, correctness, and quality analysis
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Code Review Role Preamble
source "${APEX_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}/hooks/state-helper"

echo "=== APEX CODE REVIEW ROLE ==="
apex_set_stage "code-review"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
apex_telemetry_start "code-review"

# ---------------------------------------------------------------------------
# Git context
# ---------------------------------------------------------------------------
if ! command -v git &>/dev/null || ! git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
  echo "[code-review] ERROR: Not a git repository. Code review requires git."
  echo "REVIEW_READY=false"
  exit 1
fi

CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")
MERGE_BASE=$(git merge-base HEAD "${DEFAULT_BRANCH}" 2>/dev/null || git merge-base HEAD main 2>/dev/null || echo "")

if [ -z "$MERGE_BASE" ]; then
  echo "[code-review] WARNING: Could not find merge base. Using HEAD~10 as fallback."
  MERGE_BASE="HEAD~10"
fi

echo "[code-review] Branch: $CURRENT_BRANCH"
echo "[code-review] Base: $DEFAULT_BRANCH"
echo "[code-review] Merge base: $MERGE_BASE"

# Get diff stats
DIFF_STAT=$(git diff --stat "${MERGE_BASE}..HEAD" 2>/dev/null || echo "(no diff)")
FILES_CHANGED=$(git diff --name-only "${MERGE_BASE}..HEAD" 2>/dev/null || echo "")
FILE_COUNT=$(echo "$FILES_CHANGED" | grep -c . 2>/dev/null || echo "0")
COMMITS=$(git log --oneline "${MERGE_BASE}..HEAD" 2>/dev/null || echo "(no commits)")
COMMIT_COUNT=$(echo "$COMMITS" | grep -c . 2>/dev/null || echo "0")

echo "[code-review] Files changed: $FILE_COUNT"
echo "[code-review] Commits: $COMMIT_COUNT"
echo ""
echo "[code-review] Diff summary:"
echo "$DIFF_STAT"

echo "REVIEW_READY=true"

apex_ensure_dirs
```

# Code Review Role

> apex-forge / workflow / roles / code-review
>
> Pre-landing diff review. Every finding is concrete: file, line, severity,
> and a suggested fix. No vague "consider improving" comments.

---

## REVIEW SCOPE

Read the full diff before starting any analysis:

```bash
# Full diff against base branch
git diff $(git merge-base HEAD main)..HEAD

# File list
git diff --name-only $(git merge-base HEAD main)..HEAD

# Commit messages (for intent)
git log --oneline $(git merge-base HEAD main)..HEAD
```

If the diff is large (>500 lines), process it in sections:
1. New files first (understand what was added)
2. Modified files by directory (understand scope)
3. Deleted files last (understand removals)

---

## REVIEW CHECKLIST

### 1. SQL Safety

Scan every file touching database queries:

| Check | What to Look For |
|-------|-----------------|
| **Injection** | String concatenation in queries, unparameterized user input |
| **N+1 queries** | Loops that execute queries, missing eager loading |
| **Missing indexes** | New WHERE/JOIN columns without corresponding index migration |
| **Migration safety** | Destructive ops without reversibility, missing `IF EXISTS` |
| **Transaction scope** | Multi-table mutations outside a transaction |
| **Lock contention** | Long transactions, table locks, missing row-level locks |

### 2. LLM Trust Boundaries

If the codebase involves LLM/AI features:

| Check | What to Look For |
|-------|-----------------|
| **Prompt injection** | User input concatenated directly into prompts |
| **Output trust** | LLM output used in SQL, shell commands, or eval without sanitization |
| **Token exposure** | API keys in client-side code or logs |
| **Cost control** | Unbounded token usage, missing rate limits on LLM calls |
| **Hallucination handling** | LLM output treated as factual without verification |

### 3. Conditional Side Effects

| Check | What to Look For |
|-------|-----------------|
| **If/else mutations** | Branches that modify state — ensure both paths are handled |
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
| **A07: Auth Failures** | Weak password rules, missing MFA hooks, session fixation |
| **A08: Data Integrity** | Unsigned data in critical paths, missing checksums |
| **A09: Logging Failures** | Sensitive data in logs, missing audit trail for auth |
| **A10: SSRF** | User-controlled URLs in server-side requests |

### 5. Error Handling

| Check | What to Look For |
|-------|-----------------|
| **Swallowed errors** | Empty catch blocks, `catch (e) {}`, `rescue => nil` |
| **Generic handlers** | `catch (Exception e)` hiding specific failure modes |
| **Missing error paths** | Happy path implemented, error/edge cases ignored |
| **Error exposure** | Stack traces or internal details in user-facing errors |
| **Retry without backoff** | Retry loops without exponential backoff or max attempts |

### 6. Test Coverage

| Check | What to Look For |
|-------|-----------------|
| **New code without tests** | Changed files without corresponding test changes |
| **Test quality** | Tests that only check happy path, missing edge cases |
| **Flaky patterns** | `setTimeout`, `sleep`, fixed ports, time-dependent assertions |
| **Mock accuracy** | Mocks that don't match the actual interface they replace |
| **Integration gaps** | Unit tests pass but component interactions untested |

### 7. Code Quality

| Check | What to Look For |
|-------|-----------------|
| **Dead code** | Unused imports, unreachable branches, commented-out code |
| **Naming** | Misleading names, abbreviations without context |
| **Complexity** | Functions > 50 lines, nesting > 3 levels, cyclomatic complexity |
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

Severity definitions:

| Severity | Meaning | Review Impact |
|----------|---------|---------------|
| P0 | Security vulnerability, data loss risk | BLOCK — must fix |
| P1 | Functional bug, incorrect behavior | BLOCK — must fix |
| P2 | Quality issue, maintainability concern | SHIP_WITH_FIXES — should fix |
| P3 | Style, minor improvement, nit | SHIP — track for later |

---

## VERDICTS

The review ends with exactly one verdict:

### SHIP

No P0 or P1 findings. P2 count < 3. Code meets quality bar.

```
VERDICT: SHIP
CONFIDENCE: high
SUMMARY: [one sentence]
P2_NOTES: [any P2s to track, if present]
```

### SHIP_WITH_FIXES

No P0. P1 count <= 2 with clear fixes. Or P2 count >= 3.

```
VERDICT: SHIP_WITH_FIXES
CONFIDENCE: medium
SUMMARY: [one sentence]
REQUIRED_FIXES: [numbered list with file:line for each]
OPTIONAL_FIXES: [numbered list of P2/P3s]
```

### BLOCK

Any P0 finding. Or P1 count > 2. Or fundamental design issue.

```
VERDICT: BLOCK
CONFIDENCE: high
SUMMARY: [one sentence]
BLOCKING_ISSUES: [numbered list with severity and file:line]
RECOMMENDED_ACTION: [return to execute | return to plan | return to brainstorm]
```

---

## REVIEW REPORT

Write to `docs/reviews/{name}-code-review.md`:

```yaml
---
title: Code Review — {branch name}
date: {ISO date}
reviewer: apex-code-review
branch: {current branch}
base: {base branch}
files_changed: {count}
commits: {count}
verdict: SHIP | SHIP_WITH_FIXES | BLOCK
finding_counts:
  P0: {n}
  P1: {n}
  P2: {n}
  P3: {n}
---
```

Sections:
1. **Summary**: Verdict + one-paragraph rationale.
2. **Diff Overview**: What was changed and why (inferred from commits).
3. **Findings**: Grouped by severity, each with full finding format.
4. **Test Coverage Assessment**: What is tested, what is not.
5. **Approval Conditions**: For SHIP_WITH_FIXES, list exactly what must change.

```
apex_add_artifact "code-review" "docs/reviews/{name}-code-review.md"
```

---

## COMPLETION STATUS

| Status | When |
|--------|------|
| **DONE** | Review complete, verdict rendered with evidence |
| **DONE_WITH_CONCERNS** | Review complete but confidence is low (large diff, unfamiliar domain) |
| **BLOCKED** | Cannot review — diff is empty, git state is broken, files missing |
| **NEEDS_CONTEXT** | Cannot assess correctness without understanding the spec/requirements |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```

---

## PROACTIVE SUGGESTIONS

After review completes:
- Verdict SHIP → suggest `/apex-forge-ship`
- Verdict SHIP_WITH_FIXES → suggest `/apex-forge-execute` to apply fixes, then re-review
- Verdict BLOCK → suggest `/apex-forge-investigate` for P0s or `/apex-plan` for design issues

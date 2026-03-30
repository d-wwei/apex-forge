---
name: apex-forge-qa
description: Systematic QA testing with tiered depth, browser-aware verification, and integrated bug-fix loop
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — QA Role Preamble
source "${APEX_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}/hooks/state-helper"

echo "=== APEX QA ROLE ==="
apex_set_stage "qa"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
_qa_start_ts=$(date +%s)
apex_telemetry_start "qa"

# ---------------------------------------------------------------------------
# Browser detection — find the best available browser tool
# ---------------------------------------------------------------------------
apex_browse_detect() {
  # Priority 1: gstack browse tool ($B shorthand)
  if command -v gstack &>/dev/null && gstack browse --check 2>/dev/null; then
    echo "BROWSE_TOOL=gstack"
    echo "BROWSE_AVAILABLE=true"
    return 0
  fi

  # Priority 2: playwright or puppeteer CLI
  if command -v npx &>/dev/null; then
    if npx --no-install playwright --version &>/dev/null 2>&1; then
      echo "BROWSE_TOOL=playwright"
      echo "BROWSE_AVAILABLE=true"
      return 0
    fi
  fi

  # Priority 3: curl + test runner (headless fallback)
  echo "BROWSE_TOOL=none"
  echo "BROWSE_AVAILABLE=false"
  return 0
}

eval "$(apex_browse_detect)"
echo "[qa] Browser tool: ${BROWSE_TOOL:-none} (available: ${BROWSE_AVAILABLE:-false})"

# Discover test commands
TEST_CMD=""
if [ -f "package.json" ]; then
  TEST_CMD=$(python3 -c "import json; d=json.load(open('package.json')); print(d.get('scripts',{}).get('test',''))" 2>/dev/null || echo "")
fi
[ -f "Makefile" ] && grep -q "^test:" Makefile 2>/dev/null && TEST_CMD="${TEST_CMD:+$TEST_CMD && }make test"
[ -f "pytest.ini" ] || [ -f "pyproject.toml" ] && TEST_CMD="${TEST_CMD:+$TEST_CMD && }python -m pytest"

echo "[qa] Test command: ${TEST_CMD:-'(none detected — will use manual checks)'}"

# Check for upstream artifacts
REVIEW_DOCS=$(apex_find_upstream "review")
EXEC_DOCS=$(apex_find_upstream "execute")
if [ -n "$REVIEW_DOCS" ] || [ -n "$EXEC_DOCS" ]; then
  echo "[qa] Found upstream artifacts to guide QA scope"
fi

apex_ensure_dirs
```

# QA Role

> apex-forge / workflow / roles / qa
>
> Systematic quality assurance with tiered depth, browser-aware verification,
> and an integrated find-test-fix-verify loop.

---

## TIER SELECTION

Determine QA depth before starting. Ask the user if unclear.

| Tier | Scope | When to Use |
|------|-------|-------------|
| **Quick** | P0 + P1 findings only | Pre-commit sanity check, hotfix validation |
| **Standard** | P0 + P1 + P2 | Feature completion, pre-PR |
| **Exhaustive** | P0 + P1 + P2 + P3 + cosmetic | Release candidate, post-merge regression sweep |

Default: **Standard** unless the user specifies otherwise.

---

## QA FLOW

### Step 1: Scope Discovery

1. Read the plan or requirements doc (if exists) to understand what changed.
2. Identify the **surfaces under test**:
   - Which pages/routes were modified?
   - Which API endpoints were changed?
   - Which components were created or updated?
3. Build a **QA checklist** — one line per surface, grouped by feature.

### Step 2: Automated Test Pass

Run the project's test suite FIRST. Do not skip this.

```
Action: Run test suite
If TEST_CMD is available:
  Run it. Read the FULL output.
  Record: total tests, passed, failed, skipped.
If no test suite:
  Note this as a P2 finding ("No automated test suite").
  Proceed to manual verification.
```

### Step 3: Browser Verification (if BROWSE_AVAILABLE)

**With gstack browse:**
```
For each surface:
  1. $B goto <url>
  2. $B screenshot — capture BEFORE state
  3. $B snapshot — capture DOM state
  4. Interact: click buttons, fill forms, trigger state changes
  5. $B screenshot — capture AFTER state
  6. $B snapshot — verify DOM mutations
  7. Check browser console for errors/warnings
```

**Without browser tool (headless fallback):**
```
For each surface:
  1. Run relevant test commands targeting that surface
  2. Check server logs for errors
  3. Verify API responses with curl/httpie if applicable
  4. Note: "Browser verification skipped — no browser tool available"
```

### Step 4: Manual Inspection Checklist

Run through these checks for EVERY changed surface:

**Functional (all tiers):**
- [ ] Happy path works end-to-end
- [ ] Error states display correct messages
- [ ] Empty states render properly
- [ ] Loading states exist and work
- [ ] Form validation triggers on invalid input
- [ ] Navigation flows complete without dead ends

**Data integrity (Standard + Exhaustive):**
- [ ] Data persists after page reload
- [ ] Concurrent operations don't corrupt state
- [ ] Boundary values handled (empty string, max length, special chars)
- [ ] Pagination/infinite scroll works at boundaries

**Visual/UX (Exhaustive only):**
- [ ] Responsive behavior at 320px, 768px, 1024px, 1440px
- [ ] Dark mode / light mode consistency (if applicable)
- [ ] Keyboard navigation works
- [ ] Focus order is logical
- [ ] No layout shifts on interaction

**Security spot-check (all tiers):**
- [ ] No sensitive data in console output
- [ ] No auth tokens in URL parameters
- [ ] XSS: script tags in inputs are escaped
- [ ] CSRF: state-changing requests require tokens

### Step 5: Finding Classification

Every finding gets a severity and evidence:

```
finding: [description]
severity: P0 | P1 | P2 | P3
file: [file:line if applicable]
evidence: [screenshot path, console output, test output]
reproduction: [exact steps to reproduce]
```

| Severity | Definition | Health Impact |
|----------|-----------|---------------|
| P0 | Security hole, data loss, crash | -3 points |
| P1 | Functional bug affecting users | -2 points |
| P2 | Quality issue, UX friction | -1 point |
| P3 | Cosmetic, minor improvement | -0.5 points |

---

## BUG-FIX LOOP

For each finding at or above the tier threshold:

```
1. REPRODUCE: Confirm the bug exists. Take a screenshot/capture evidence.
2. TEST: Write a failing test that demonstrates the bug.
   - Run the test. Confirm RED for the right reason.
3. FIX: Write the minimal fix.
   - The fix addresses root cause, not symptoms.
4. VERIFY: Run the test. Confirm GREEN.
   - Re-run the full test suite. No regressions.
   - If browser available: re-screenshot the affected surface.
5. COMMIT: Stage the fix with a clear message.
   - Format: "fix(<scope>): <description> [QA-<severity>]"
```

**Escalation rule**: If a fix attempt fails twice, invoke the Escalation Ladder
(L1: fundamentally different approach). Do not micro-tweak.

---

## HEALTH SCORE

Calculate a health score starting from 10:

```
score = 10
for each finding:
  if severity == P0: score -= 3
  if severity == P1: score -= 2
  if severity == P2: score -= 1
  if severity == P3: score -= 0.5

score = max(0, score)
```

| Score | Rating | Ship Decision |
|-------|--------|---------------|
| 9-10 | Excellent | Ship with confidence |
| 7-8 | Good | Ship after documenting P2s |
| 5-6 | Fair | Fix P1s before shipping |
| 3-4 | Poor | Fix P0s and P1s, re-run QA |
| 0-2 | Critical | Do not ship. Major rework needed. |

---

## QA REPORT OUTPUT

Write the report to `docs/reviews/{name}-qa.md`:

```yaml
---
title: QA Report — {feature name}
date: {ISO date}
tier: quick | standard | exhaustive
health_score: {0-10}
browser_tool: {gstack | playwright | none}
test_suite: {passed X/Y | no suite}
---
```

### Report Sections

1. **Summary**: One-paragraph verdict with health score.
2. **Test Suite Results**: Pass/fail counts, any failing test names.
3. **Findings**: Grouped by severity (P0 first), each with:
   - Description
   - Steps to reproduce
   - Evidence (screenshot path, output snippet)
   - Status: `open` | `fixed` | `wontfix`
4. **Before/After Evidence**: For each fixed bug, link the before and after
   screenshots or test outputs.
5. **Surfaces Not Tested**: Any areas skipped with reason.
6. **Recommendations**: Next actions if health score < 9.

Register the report:
```
apex_add_artifact "qa" "docs/reviews/{name}-qa.md"
```

---

## COMPLETION STATUS

| Status | When |
|--------|------|
| **DONE** | All findings at or above tier threshold are fixed. Health >= 7. |
| **DONE_WITH_CONCERNS** | P2/P3 findings remain open. Health 5-8. |
| **BLOCKED** | P0 or P1 findings could not be fixed. Needs architecture change. |
| **NEEDS_CONTEXT** | Cannot determine expected behavior for a surface. |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```

---

## PROACTIVE SUGGESTIONS

After QA completes:
- Health < 7 → suggest `/apex-forge-execute` to address findings
- Health >= 9 → suggest `/apex-forge-ship` to land the changes
- Unfixable architecture issues → suggest `/apex-forge-brainstorm` to redesign

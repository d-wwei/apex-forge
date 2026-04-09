---
name: qa
description: Systematic QA testing with tiered depth, verification checklists, and integrated bug-fix loop
---

# QA

Systematic quality assurance with tiered depth, structured verification, and an integrated find-test-fix-verify loop.

---

## TIER SELECTION

Determine QA depth before starting. Ask the user if unclear.

| Tier | Scope | When to Use |
|------|-------|-------------|
| **Quick** | P0 + P1 findings only | Pre-commit sanity check, hotfix validation |
| **Standard** | P0 + P1 + P2 | Feature completion, pre-PR |
| **Exhaustive** | P0 + P1 + P2 + P3 + cosmetic | Release candidate, post-merge regression sweep |

Default: **Standard** unless specified otherwise.

---

## QA FLOW

### Step 1: Scope Discovery

1. Read the plan or requirements doc (if exists) to understand what changed.
2. Identify the **surfaces under test**: pages/routes modified, API endpoints changed, components created or updated.
3. Build a **QA checklist** — one line per surface, grouped by feature.

### Step 2: Automated Test Pass

Run the project's test suite FIRST. Do not skip this.

- If a test suite exists: run it, read the FULL output, record total/passed/failed/skipped.
- If no test suite: note as a P2 finding ("No automated test suite"). Proceed to manual verification.

### Step 3: Browser Verification (if available)

For each surface:
1. Navigate to the page/URL
2. Capture screenshot (BEFORE state)
3. Interact: click buttons, fill forms, trigger state changes
4. Capture screenshot (AFTER state)
5. Check browser console for errors/warnings

If no browser tool is available, verify via test commands, server logs, and API responses. Note: "Browser verification skipped."

### Step 4: Manual Inspection Checklist

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
evidence: [screenshot, console output, test output]
reproduction: [exact steps to reproduce]
```

| Severity | Definition |
|----------|-----------|
| P0 | Security hole, data loss, crash |
| P1 | Functional bug affecting users |
| P2 | Quality issue, UX friction |
| P3 | Cosmetic, minor improvement |

---

## BUG-FIX LOOP

For each finding at or above the tier threshold:

1. **REPRODUCE**: Confirm the bug exists. Capture evidence.
2. **TEST**: Write a failing test that demonstrates the bug. Run it. Confirm RED for the right reason.
3. **FIX**: Write the minimal fix addressing root cause, not symptoms.
4. **VERIFY**: Run the test (GREEN). Re-run the full suite (no regressions). Re-screenshot if applicable.
5. **COMMIT**: Stage the fix with format: `fix(<scope>): <description> [QA-<severity>]`

**Escalation rule**: If a fix attempt fails twice, switch to a fundamentally different approach. Do not micro-tweak.

---

## HEALTH SCORE

Calculate a health score starting from 10:

- P0 finding: -3 points
- P1 finding: -2 points
- P2 finding: -1 point
- P3 finding: -0.5 points

| Score | Rating | Ship Decision |
|-------|--------|---------------|
| 9-10 | Excellent | Ship with confidence |
| 7-8 | Good | Ship after documenting P2s |
| 5-6 | Fair | Fix P1s before shipping |
| 3-4 | Poor | Fix P0s and P1s, re-run QA |
| 0-2 | Critical | Do not ship. Major rework needed. |

---

## COMPLETION STATUS

| Status | When |
|--------|------|
| **DONE** | All findings at or above tier threshold are fixed. Health >= 7. |
| **DONE_WITH_CONCERNS** | P2/P3 findings remain open. Health 5-8. |
| **BLOCKED** | P0 or P1 findings could not be fixed. Needs architecture change. |
| **NEEDS_CONTEXT** | Cannot determine expected behavior for a surface. |

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

## BROWSER QA INTEGRATION

All browser verification uses `apex-forge-browse` (alias: `$B`). The browser is the primary QA tool — never skip it for web-facing surfaces. Every QA tier dispatches `$B` commands directly; browse is not a separate step, it is woven into every phase.

### Setup

```bash
# $B is the apex-forge-browse binary. Start on first command (~3s cold start).
B="apex-forge-browse"
$B goto <target-url>
```

The daemon auto-shuts down after 30 min idle. Cookies, tabs, and sessions persist between calls.

### Tier-Specific Browser Command Patterns

**Quick QA** (smoke check — 30 seconds):

```bash
# 1. Load and verify page renders
$B goto <url>

# 2. Get interactive elements
$B snapshot -i

# 3. Assert key elements exist
$B is visible ".key-element"
$B is visible ".navigation"

# 4. Check for console errors
$B console --errors

# 5. Capture evidence
$B screenshot /tmp/qa-quick.png
```

**Standard QA** (full functional pass — 5-15 minutes):

```bash
# Everything from Quick, plus:

# Responsive testing across breakpoints
$B responsive /tmp/responsive          # mobile, tablet, desktop screenshots

# Form testing
$B snapshot -i                         # find form fields
$B fill @e3 ""                         # test empty submission
$B click @e10                          # submit
$B snapshot -D                         # diff: did validation errors appear?
$B fill @e3 "valid input"
$B click @e10
$B snapshot -D                         # diff: success state?

# State verification
$B snapshot                            # baseline before action
$B click @e5                           # trigger state change
$B snapshot -D                         # diff shows exactly what changed

# Navigation flow
$B links                               # map all navigation targets
$B click @e2                           # follow link
$B is visible ".expected-content"      # verify destination

# Console monitoring after every interaction
$B console --errors
```

**Exhaustive QA** (full audit — 15-30 minutes):

```bash
# Everything from Standard, plus:

# Network request audit
$B network                             # check for failed requests (4xx, 5xx)
$B network --clear                     # reset, then interact and re-check

# Console deep dive
$B console                             # all messages, not just errors

# Performance profiling
$B perf                                # page load timings

# Accessibility audit
$B accessibility                       # full ARIA tree
$B snapshot -i                         # check interactive elements have labels
$B is focused "#first-input"           # verify focus order
$B press Tab                           # keyboard navigation
$B press Tab
$B is focused "#second-input"

# Annotated screenshots for evidence
$B snapshot -i -a -o /tmp/annotated.png  # screenshot with @ref overlay

# Cursor-interactive elements (catches clickable divs the a11y tree misses)
$B snapshot -C
$B click @c1                           # test cursor-interactive elements

# Cross-page text diff
$B diff <staging-url> <prod-url>       # compare environments
```

### QA Test Flow Template

Step-by-step browser-driven QA workflow. Follow this sequence for every surface under test.

**Phase A: Orient**

```bash
$B goto <page-url>
$B snapshot -i -a -o /tmp/qa-orient.png    # annotated screenshot with all interactive elements
$B links                                    # map navigation structure
$B console --errors                         # baseline errors on load
$B text                                     # read visible page content
```

After this step you have: a visual map, a list of links, any pre-existing console errors, and the page text.

**Phase B: Interact and Verify**

For each interactive element found in Phase A:

```bash
# Before state
$B snapshot                                 # store baseline

# Act
$B click @e3                                # or fill, select, hover, upload
$B wait --networkidle                       # wait for async operations

# After state
$B snapshot -D                              # diff: what changed?
$B console --errors                         # any new errors?
$B is visible ".expected-result"            # assert expected outcome
$B screenshot /tmp/qa-after-action.png      # capture evidence
```

**Phase C: Form Testing** (if forms exist)

```bash
$B snapshot -i                              # identify form fields

# Empty submission
$B click @e10                               # submit empty
$B snapshot -D                              # validation errors should appear
$B is visible ".error-message"

# Invalid data
$B fill @e3 "<script>alert('xss')</script>" # XSS test
$B click @e10
$B snapshot -D                              # should be escaped, not executed

# Boundary values
$B fill @e3 "a"                             # min length
$B fill @e4 "aaaa...9999 chars..."          # max length
$B click @e10
$B snapshot -D

# Happy path
$B fill @e3 "valid@email.com"
$B fill @e4 "ValidPassword123"
$B click @e10
$B wait --networkidle
$B is visible ".success-state"
$B screenshot /tmp/qa-form-success.png
```

**Phase D: Responsive Check** (Standard + Exhaustive tiers)

```bash
$B responsive /tmp/qa-responsive            # auto: mobile, tablet, desktop

# Or manual for specific breakpoints
$B viewport 320x568                         # small mobile
$B screenshot /tmp/qa-320.png
$B viewport 768x1024                        # tablet
$B screenshot /tmp/qa-768.png
$B viewport 1440x900                        # desktop
$B screenshot /tmp/qa-1440.png
```

**Phase E: Deep Inspection** (Exhaustive tier only)

```bash
$B network                                  # all network requests
$B console                                  # all console messages
$B perf                                     # load performance timings
$B accessibility                            # full ARIA tree
$B js "document.querySelectorAll('img:not([alt])').length"  # images without alt
$B js "document.querySelectorAll('input:not([aria-label]):not([id])').length"  # unlabeled inputs
```

**Phase F: Evidence Collection**

```bash
# Annotated screenshot showing all interactive elements
$B snapshot -i -a -o /tmp/qa-evidence-annotated.png

# Element-specific crop for bug reports
$B screenshot ".broken-element" /tmp/qa-evidence-crop.png

# Before/after pair for verified fixes
$B screenshot /tmp/qa-before-fix.png
# ... apply fix ...
$B reload
$B screenshot /tmp/qa-after-fix.png
$B snapshot -D                              # diff confirms fix
```

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

### Step 3: Browser Verification

Use `apex-forge-browse` (`$B`) for all browser verification. For each surface:

```bash
# 1. Navigate
$B goto <page-url>

# 2. Capture BEFORE state
$B snapshot -i -a -o /tmp/qa-before.png

# 3. Interact: click buttons, fill forms, trigger state changes
$B fill @e3 "test input"
$B click @e5
$B wait --networkidle

# 4. Capture AFTER state + diff
$B snapshot -D                              # unified diff shows what changed
$B screenshot /tmp/qa-after.png

# 5. Check console for errors/warnings
$B console --errors
```

Follow the **QA Test Flow Template** above for the full interaction sequence per tier.

If `apex-forge-browse` is not available, verify via test commands, server logs, and API responses. Note: "Browser verification skipped."

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
- [ ] Responsive behavior at 320px, 768px, 1024px, 1440px (`$B responsive` or `$B viewport <WxH>`)
- [ ] Dark mode / light mode consistency (if applicable)
- [ ] Keyboard navigation works (`$B press Tab`, `$B is focused <sel>`)
- [ ] Focus order is logical (`$B accessibility`)

**Security spot-check (all tiers):**
- [ ] No sensitive data in console output (`$B console`)
- [ ] No auth tokens in URL parameters (`$B url`)
- [ ] XSS: script tags in inputs are escaped (`$B fill @eN "<script>alert(1)</script>"`)
- [ ] CSRF: state-changing requests require tokens (`$B network`)

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
4. **VERIFY**: Run the test (GREEN). Re-run the full suite (no regressions). Browser re-verify:
   ```bash
   $B reload
   $B screenshot /tmp/qa-fix-after.png
   $B console --errors
   $B snapshot -D                        # diff confirms the fix
   ```
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

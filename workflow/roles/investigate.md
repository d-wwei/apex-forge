---
name: apex-forge-investigate
description: Systematic debugging with root-cause discipline — no fixes without understanding why
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Investigate Role Preamble
source "${APEX_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}/hooks/state-helper"

echo "=== APEX INVESTIGATE ROLE ==="
apex_set_stage "investigate"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
apex_telemetry_start "investigate"

# ---------------------------------------------------------------------------
# Gather environment context
# ---------------------------------------------------------------------------
echo "[investigate] Working directory: $(pwd)"

if command -v git &>/dev/null && git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
  BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")
  RECENT_COMMITS=$(git log --oneline -5 2>/dev/null || echo "(no commits)")
  DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  echo "[investigate] Branch: $BRANCH | Dirty files: $DIRTY"
  echo "[investigate] Recent commits:"
  echo "$RECENT_COMMITS"
else
  echo "[investigate] Not a git repo — no commit history available"
fi

# Check for error logs
for logpath in "logs/" "log/" ".log" "tmp/logs/" "storage/logs/"; do
  if [ -d "$logpath" ] || [ -f "$logpath" ]; then
    echo "[investigate] Found log path: $logpath"
  fi
done

apex_ensure_dirs
```

# Investigate Role

> apex-forge / workflow / roles / investigate
>
> Systematic debugging. The Iron Law: NO FIXES WITHOUT ROOT CAUSE.
> Every fix applied without understanding WHY the bug exists creates
> a new bug waiting to happen.

---

## THE IRON LAW

```
================================================================
  DO NOT FIX ANYTHING UNTIL YOU KNOW WHY IT IS BROKEN.

  Fixing symptoms without root cause is:
  - Gambling that the symptom IS the problem
  - Creating a second bug to mask the first
  - Destroying the evidence you need to find the real issue

  You are a diagnostician, not a slot machine.
================================================================
```

---

## PHASE 1: REPRODUCE

**Goal**: Confirm the bug exists, define its boundaries, capture evidence.

### Steps

1. **Restate the problem** in one sentence. Not the user's words — YOUR understanding.
   If you cannot state the problem clearly, you do not understand it yet.

2. **Reproduce the bug**:
   - Run the failing command/test/flow exactly as described.
   - Capture the FULL output — error messages, stack traces, exit codes.
   - If it does not reproduce, that IS data. Document what you tried.

3. **Instrument boundaries**:
   - What is the last known-good state? (commit, config, data point)
   - What is the first known-bad state?
   - What changed between them? `git log`, `git diff`, config changes, dependency updates.

4. **Classify the bug**:

| Type | Signal | Investigation Focus |
|------|--------|---------------------|
| Regression | Worked before, broke recently | `git bisect`, recent diffs |
| Logic error | Never worked correctly | Trace data flow, check assumptions |
| Integration | Components work alone, fail together | Interface contracts, data format |
| Environment | Works locally, fails elsewhere | Versions, paths, env vars, permissions |
| Race condition | Intermittent, timing-dependent | Concurrency, shared state, ordering |
| Data | Specific inputs trigger failure | Boundary values, encoding, null/empty |

**Evidence requirement**: Phase 1 outputs must be at E2+ (direct evidence).
A screenshot, a stack trace, a test output. Not "I think it fails because..."

---

## PHASE 2: ANALYZE

**Goal**: Identify patterns, trace data flow, narrow the search space.

### Steps

1. **Trace the data flow** from input to failure point:
   - What enters the system?
   - Where does it transform?
   - Where does the expected path diverge from the actual path?

2. **Check recent changes**:
   ```
   git log --oneline --since="1 week ago" -- <relevant paths>
   git diff HEAD~10..HEAD -- <relevant paths>
   ```
   Look for: new conditionals, changed defaults, renamed variables,
   modified error handling, updated dependencies.

3. **Identify patterns**:
   - Does the failure correlate with specific inputs?
   - Does it correlate with specific timing?
   - Does it correlate with specific state (first run vs subsequent, empty vs populated)?

4. **Read the actual code** — not what you think it does, what it ACTUALLY does:
   - Follow the execution path line by line from entry to failure.
   - Note every branch, every early return, every error handler.
   - Mark where assumptions diverge from implementation.

5. **Check the quiet paths**: error handlers that swallow exceptions, catch blocks
   that log and continue, default branches that silently succeed. These are where
   bugs hide.

**Output**: A written analysis with:
- Confirmed data flow path (entry → failure)
- Points where behavior diverges from expectation
- List of suspicious code locations with line numbers

---

## PHASE 3: HYPOTHESIZE

**Goal**: Generate testable hypotheses. Minimum 3. Test the most likely first.

### The 3-Hypothesis Rule

You MUST generate at least 3 distinct hypotheses before fixing anything.
"Distinct" means they identify different root causes, not different symptoms
of the same cause.

```
Hypothesis format:
  H1: [statement of what is wrong and why]
      Evidence for: [what supports this]
      Evidence against: [what contradicts this]
      Test: [how to confirm or deny this hypothesis]
      Confidence: high | medium | low
```

### Hypothesis Testing Protocol

For each hypothesis, starting with the highest confidence:

1. **Design the test**: What specific action would PROVE this hypothesis true or false?
   Not "check the logs" — what specific log entry, in what file, with what content?

2. **Run the test**: Execute it. Read the full output.

3. **Evaluate**:
   - Confirmed → proceed to Phase 4 with this root cause.
   - Denied → document why, move to next hypothesis.
   - Inconclusive → gather more evidence, re-evaluate.

### The 3-Strike Rule

After 3 failed hypotheses:

```
STOP. The architecture of your thinking is wrong.

Do not generate hypothesis #4 from the same mental model.
Instead:
1. List the shared assumptions across all 3 hypotheses.
2. Challenge the most fundamental assumption.
3. Ask: "What if the bug is not where I think it is?"
4. Ask: "What if the bug is not WHAT I think it is?"
5. Consider: Is this a symptom of a deeper problem?
```

This triggers the Escalation Ladder at L2 (Section 7 of SKILL.md).

---

## PHASE 4: IMPLEMENT

**Goal**: Fix the root cause. Verify the fix. Check for regressions.

### Pre-Fix Checklist

Before writing any fix code:
- [ ] Root cause identified with E2+ evidence
- [ ] At least one hypothesis was tested and confirmed
- [ ] The fix addresses the ROOT CAUSE, not a symptom
- [ ] You can explain WHY this fix works in one sentence

### Fix Protocol

1. **Write the regression test FIRST**:
   - The test must fail before the fix (RED).
   - The test captures the exact scenario that triggered the bug.
   - Run the test. Confirm it fails for the RIGHT reason.

2. **Implement the minimal fix**:
   - Change as little as possible. The smallest fix that addresses root cause.
   - Do not refactor during a bug fix. Do not "improve" adjacent code.
   - If the fix requires broader changes, document them for a follow-up task.

3. **Verify the fix**:
   - Run the regression test. Confirm GREEN.
   - Run the full test suite. No new failures.
   - Re-run the original reproduction steps from Phase 1. Confirm the bug is gone.

4. **Check for regressions**:
   - What other code paths touch the same area?
   - Does the fix change any public interface or contract?
   - Are there callers that depended on the buggy behavior?

5. **Document**:
   - What was the bug? (one sentence)
   - What was the root cause? (one sentence)
   - What was the fix? (diff reference)
   - What was the evidence? (test output, screenshot, log)

### Commit Format

```
fix(<scope>): <one-line description>

Root cause: <why it was broken>
Evidence: <how we confirmed>
Regression test: <test file:test name>
```

---

## ESCALATION LADDER INTEGRATION

This role follows the Escalation Ladder from SKILL.md:

| Level | Trigger | Response |
|-------|---------|----------|
| L0 | Normal investigation | Follow Phase 1-4 above |
| L1 | First hypothesis fails | Different approach, not parameter tweaks |
| L2 | 3 hypotheses fail (3-Strike Rule) | Challenge the mental model. 3 NEW hypotheses from different angle |
| L3 | 6 total hypotheses fail | 7-point recovery checklist |
| L4 | Recovery checklist exhausted | Minimal reproduction + escalate to human |

### L3 Recovery Checklist (adapted for investigation)

1. Restate the bug in one sentence.
2. List every hypothesis tested and why each failed.
3. What assumption do all failed hypotheses share?
4. Is that assumption actually true? What is the evidence grade?
5. Search: has this bug been reported/solved before? (git log, issues, docs)
6. Propose a hypothesis that violates the shared assumption.
7. If no viable hypothesis: prepare BLOCKED report.

---

## EVIDENCE GRADING

Every conclusion in this role needs evidence:

| Grade | Acceptable For |
|-------|---------------|
| E0 (guess) | Nothing. Not even a hypothesis label. |
| E1 (indirect) | Forming a hypothesis only |
| E2 (direct) | Hypothesis testing, Phase 1 reproduction |
| E3 (multi-source) | Confirming root cause, closing the investigation |
| E4 (validated) | Claiming a systemic pattern, updating documentation |

---

## INVESTIGATION REPORT

Write to `docs/reviews/{name}-investigation.md`:

```yaml
---
title: Investigation — {bug description}
date: {ISO date}
status: resolved | escalated | deferred
root_cause: {one sentence}
fix_commit: {hash}
regression_test: {file:test}
---
```

Sections: Problem Statement, Reproduction Steps, Analysis, Hypotheses Tested,
Root Cause, Fix Applied, Regression Test, Lessons Learned.

```
apex_add_artifact "investigate" "docs/reviews/{name}-investigation.md"
```

---

## COMPLETION STATUS

| Status | When |
|--------|------|
| **DONE** | Root cause found, fix verified at E3+, regression test green |
| **DONE_WITH_CONCERNS** | Bug fixed but related risks identified |
| **BLOCKED** | Escalation ladder exhausted, cannot determine root cause |
| **NEEDS_CONTEXT** | Cannot reproduce, need more information about the failure |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```

---
name: investigate
description: Systematic debugging with root-cause discipline — no fixes without understanding why
---

# Investigate

Systematic debugging. The Iron Law: NO FIXES WITHOUT ROOT CAUSE.
Every fix applied without understanding WHY the bug exists creates a new bug waiting to happen.

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

1. **Restate the problem** in one sentence. YOUR understanding, not the user's words.
   If you cannot state the problem clearly, you do not understand it yet.

2. **Reproduce the bug**: Run the failing command/test/flow exactly as described.
   Capture the FULL output — error messages, stack traces, exit codes.
   If it does not reproduce, that IS data. Document what you tried.

3. **Instrument boundaries**:
   - What is the last known-good state? (commit, config, data point)
   - What is the first known-bad state?
   - What changed between them? Check git log, git diff, config changes, dependency updates.

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

1. **Trace the data flow** from input to failure point:
   - What enters the system? Where does it transform? Where does the expected path diverge from actual?

2. **Check recent changes**: Look at recent commits touching relevant paths.
   Look for: new conditionals, changed defaults, renamed variables, modified error handling, updated dependencies.

3. **Identify patterns**: Does failure correlate with specific inputs, timing, or state?

4. **Read the actual code** — not what you think it does, what it ACTUALLY does.
   Follow the execution path line by line. Note every branch, every early return, every error handler.

5. **Check the quiet paths**: error handlers that swallow exceptions, catch blocks that log and continue, default branches that silently succeed.

**Output**: Written analysis with confirmed data flow path, divergence points, and suspicious code locations with line numbers.

---

## PHASE 3: HYPOTHESIZE

**Goal**: Generate testable hypotheses. Minimum 3. Test the most likely first.

### The 3-Hypothesis Rule

You MUST generate at least 3 distinct hypotheses before fixing anything.
"Distinct" means different root causes, not different symptoms of the same cause.

```
Hypothesis format:
  H1: [statement of what is wrong and why]
      Evidence for: [what supports this]
      Evidence against: [what contradicts this]
      Test: [how to confirm or deny]
      Confidence: high | medium | low
```

For each hypothesis, starting with highest confidence:
1. **Design the test**: What specific action would PROVE this true or false?
2. **Run the test**: Execute it. Read the full output.
3. **Evaluate**: Confirmed -> Phase 4. Denied -> document why, next hypothesis. Inconclusive -> gather more evidence.

### The 3-Strike Rule

After 3 failed hypotheses: **STOP. Your mental model is wrong.**

1. List the shared assumptions across all 3 hypotheses.
2. Challenge the most fundamental assumption.
3. Ask: "What if the bug is not where I think it is?"
4. Ask: "What if the bug is not WHAT I think it is?"
5. Consider: Is this a symptom of a deeper problem?

Generate 3 NEW hypotheses from a fundamentally different angle.

---

## PHASE 4: IMPLEMENT

**Goal**: Fix the root cause. Verify the fix. Check for regressions.

### Pre-Fix Checklist

- [ ] Root cause identified with E2+ evidence
- [ ] At least one hypothesis was tested and confirmed
- [ ] The fix addresses the ROOT CAUSE, not a symptom
- [ ] You can explain WHY this fix works in one sentence

### Fix Protocol

1. **Write the regression test FIRST**: Must fail before the fix (RED), capturing the exact triggering scenario.
2. **Implement the minimal fix**: Change as little as possible. No refactoring during a bug fix.
3. **Verify**: Run regression test (GREEN). Run full test suite (no new failures). Re-run original reproduction steps.
4. **Check for regressions**: What other code paths touch this area? Does the fix change any public interface? Are there callers that depended on the buggy behavior?

---

## EVIDENCE GRADING

| Grade | Acceptable For |
|-------|---------------|
| E0 (guess) | Nothing. Not even a hypothesis label. |
| E1 (indirect) | Forming a hypothesis only |
| E2 (direct) | Hypothesis testing, Phase 1 reproduction |
| E3 (multi-source) | Confirming root cause, closing the investigation |
| E4 (validated) | Claiming a systemic pattern, updating documentation |

---

## INVESTIGATION REPORT

Output a report with these sections:

```yaml
---
title: Investigation — {bug description}
date: {ISO date}
status: resolved | escalated | deferred
root_cause: {one sentence}
---
```

Sections: Problem Statement, Reproduction Steps, Analysis, Hypotheses Tested, Root Cause, Fix Applied, Regression Test, Lessons Learned.

---

## COMPLETION STATUS

| Status | When |
|--------|------|
| **DONE** | Root cause found, fix verified at E3+, regression test green |
| **DONE_WITH_CONCERNS** | Bug fixed but related risks identified |
| **BLOCKED** | Cannot determine root cause after exhausting hypotheses |
| **NEEDS_CONTEXT** | Cannot reproduce, need more information about the failure |

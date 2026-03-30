---
name: apex-forge-round
description: PDCA round-based execution subskill — structured iteration for locally complex tasks (Tier 2)
user-invocable: true
---

# Round-Based Execution (Tier 2)

## What This Is

When the Complexity Router assigns **Tier 2**, the task requires structured multi-step iteration
but does NOT cross session boundaries. This subskill implements **PDCA rounds** — each round is
a Plan-Do-Check-Act cycle with a named type, entry criteria, defined actions, outputs, and exit
criteria.

Rounds are not freestyle. You declare the round type before starting. You satisfy exit criteria
before moving on. You do not retroactively relabel a round to justify what you did.

---

## Round Types

### 1. clarify

**Purpose**: Gather missing requirements. Resolve ambiguity before committing to an approach.

| Field | Value |
|---|---|
| Entry criteria | Requirements are ambiguous, incomplete, or contradictory |
| Actions | Ask targeted questions. Identify implicit assumptions. Map edge cases the user hasn't mentioned. Compare conflicting signals in the spec. |
| Outputs | Clarified requirements document. List of resolved ambiguities with answers. List of assumptions made (with evidence grade). |
| Exit criteria | Requirements are unambiguous and internally consistent. All critical questions answered or explicitly deferred with rationale. |

**Anti-pattern**: Using clarify as a stall tactic. If you have enough to form a hypothesis, move to explore or hypothesis instead.

---

### 2. explore

**Purpose**: Read code, understand dependencies, map boundaries. Build a mental model of the territory.

| Field | Value |
|---|---|
| Entry criteria | Unknown codebase area, unfamiliar dependency, or unclear system behavior |
| Actions | Read relevant files. Trace call chains. Identify interfaces and contracts. Run existing tests to understand behavior. Map file dependencies. |
| Outputs | Dependency map. Boundary identification (what you can change vs. what you cannot). Key interfaces documented. Evidence-backed understanding (E2+). |
| Exit criteria | You can state a testable hypothesis about how the system works in the relevant area, backed by E2+ evidence. |

**Anti-pattern**: Exploring without a hypothesis. State what you're looking for before you start reading files. Undirected exploration is wandering.

---

### 3. hypothesis

**Purpose**: Generate testable hypotheses about how to proceed when the path is not obvious.

| Field | Value |
|---|---|
| Entry criteria | Evidence gathered from explore round, but no single clear approach. Multiple viable paths exist, or the problem root cause is unclear. |
| Actions | Generate at least 3 distinct hypotheses. For each: state the hypothesis, the evidence supporting it, the evidence against it, and how to test it. Rank by likelihood. |
| Outputs | Hypothesis list (minimum 3). Each with: statement, supporting evidence, counter-evidence, test method, estimated effort to test. Selected hypothesis with rationale. |
| Exit criteria | One hypothesis selected for testing. Selection rationale documented. Fallback hypotheses identified in case the primary fails. |

**Anti-pattern**: Generating only one hypothesis (that's not hypothesis generation, that's confirmation bias). Generating hypotheses that are untestable.

---

### 4. planning

**Purpose**: Convert the selected approach into an actionable task breakdown.

| Field | Value |
|---|---|
| Entry criteria | Approach selected (from hypothesis round or directly from clear requirements) |
| Actions | Decompose into ordered tasks. Identify dependencies between tasks. Specify exact file paths, function signatures, test scenarios. Apply Phase Discipline from the core protocol. |
| Outputs | Task list with dependencies. Each task has: description, file paths, expected inputs/outputs, test criteria. Estimated round count for execution. |
| Exit criteria | Plan is complete enough that an executor can follow it without making design decisions. Plan approved by human (or self-approved in autonomous mode with documented rationale). |

**Anti-pattern**: Plans that are vague enough to require design decisions during execution. "Implement the feature" is not a plan. "Create function X in file Y that takes A and returns B, tested by scenario C" is a plan.

---

### 5. execution

**Purpose**: Implement one slice — the smallest provable unit of work.

| Field | Value |
|---|---|
| Entry criteria | Plan exists. Current task in plan is identified. No unresolved blocking assumptions. |
| Actions | Write the failing test first (TDD Iron Law). Write minimum code to pass. Refactor if needed. Run the full relevant test suite. |
| Outputs | Implemented code. Passing tests. Any deviations from plan documented with rationale. |
| Exit criteria | All tasks in this execution slice are implemented. Tests pass. No new failures introduced. Code matches the plan (or deviations are documented). |

**Anti-pattern**: Implementing multiple slices in one execution round. Each round should be the smallest provable unit. If you're implementing three features in one round, you've merged rounds.

---

### 6. verification

**Purpose**: Run the Verification Gate on everything produced. No success claims without proof.

| Field | Value |
|---|---|
| Entry criteria | Implementation complete for the current slice |
| Actions | Run all tests. Check every claim against evidence. Verify at E3+ (confirmed from multiple sources). Run the code, don't just read it. Check for regressions. |
| Outputs | Verification report: each claim with evidence grade. List of confirmed behaviors. List of any gaps or concerns. |
| Exit criteria | All claims verified at E3+. No unverified claims remain. Any gaps are documented and either resolved or explicitly deferred. |

**Anti-pattern**: "Tests pass" is not verification. Verification means: the test exists, it tests the right thing, it passed, and the behavior matches the spec. All four.

---

### 7. hardening

**Purpose**: Edge cases, error handling, performance. The "what could go wrong" round.

| Field | Value |
|---|---|
| Entry criteria | Verification passed. Core functionality is confirmed working. |
| Actions | Identify edge cases not covered by current tests. Add error handling for failure modes. Check performance characteristics. Review for security implications. Add missing input validation. |
| Outputs | Additional tests for edge cases. Error handling code. Performance observations. Security notes if relevant. |
| Exit criteria | No known gaps remain. Edge cases are covered or explicitly documented as out-of-scope with rationale. Error paths are handled gracefully. |

**Anti-pattern**: Skipping hardening because "it works." Working is the minimum. Hardening is what makes it production-ready.

---

### 8. recovery

**Purpose**: When stuck, back up and try a fundamentally different approach.

| Field | Value |
|---|---|
| Entry criteria | A previous round failed. Escalation Ladder has been triggered. The current approach is not viable. |
| Actions | Apply the Escalation Ladder from the core protocol. At L1: fundamentally different approach. At L2: generate 3 hypotheses. At L3: 7-point recovery checklist. At L4: boundary reduction to minimal reproduction. |
| Outputs | Analysis of why previous approach failed. New approach with rationale for why it avoids the same failure. If L4 reached: escalation report for human. |
| Exit criteria | New viable approach identified and ready for planning. Or: escalation to human with full context (BLOCKED status). |

**Anti-pattern**: "Recovery" that's just retrying the same approach with minor tweaks. If your recovery round looks similar to what failed, you haven't recovered — you've looped.

---

## Round Limits

**Maximum 5 rounds per task.**

This is a hard limit. If your task is not resolved after 5 rounds:

1. You have misassessed complexity (should have been Tier 3).
2. You are stuck in a loop (recovery round should have caught this).
3. The task needs human input that you don't have.

In all three cases, the correct action is **escalate**. Report BLOCKED status with:
- What was accomplished in each round
- What remains unresolved
- Your best hypothesis for why 5 rounds were insufficient
- Recommended next action for the human

Do NOT start a 6th round. Do NOT "just try one more thing."

---

## Between-Round Protocol

After every round completes, before the next round begins:

### 1. Update the Assumption Registry

Review all assumptions. For each:

```
assumption: [statement]
status: confirmed | unverified | disproven | deferred
evidence_grade: E0-E4
source: [where this came from]
carry_forward: safe_to_carry_forward | must_resolve_before_next | invalidates_current_plan
```

- **Confirmed**: Evidence at E2+ supports the assumption. Safe to build on.
- **Unverified**: No evidence for or against. Must be flagged, not treated as fact.
- **Disproven**: Evidence contradicts the assumption. Check all downstream decisions.
- **Deferred**: Explicitly set aside with rationale. Still tracked.

### 2. Round Summary

State in 2-3 sentences:
- What this round accomplished
- What changed in the assumption registry
- What the next round type should be and why

### 3. Carry-Forward Assessment

| Category | Carry-Forward Rule |
|---|---|
| Confirmed facts (E3+) | Safe to carry forward without re-verification |
| Confirmed facts (E2) | Safe to carry forward but flag for re-verification if context changes |
| Unverified assumptions | MUST be explicitly noted as unverified. Cannot be treated as fact in subsequent rounds. |
| Disproven assumptions | Purge immediately. Check all downstream dependencies. |
| Code that was written | Carries forward if tests pass. Must be re-tested if dependencies change. |
| Plans | Carry forward unless an assumption they depend on was disproven. |
| Test results | Carry forward within the same session. Re-run if code or dependencies change. |

---

## Evidence Grading for Carry-Forward

Conclusions that carry forward between rounds require **E2 or higher**:

| Grade | Carry-Forward Allowed? |
|---|---|
| E0 (guess) | NO. Must be upgraded before it can inform decisions in the next round. |
| E1 (indirect) | NO. Sufficient to form a hypothesis, not to carry forward as basis for action. |
| E2 (direct, single source) | YES, with flag. Note that it's single-source and could be contradicted. |
| E3 (multi-source confirmed) | YES. Reliable basis for subsequent rounds. |
| E4 (validated + reproduced) | YES. Strongest basis. Treat as established fact within this task. |

---

## Round Sequencing Patterns

Not every task uses every round type. Common sequences:

| Task Pattern | Typical Sequence |
|---|---|
| Bug fix (clear repro) | explore → execution → verification |
| Bug fix (unclear cause) | explore → hypothesis → execution → verification |
| New feature (clear spec) | planning → execution → verification → hardening |
| New feature (vague spec) | clarify → planning → execution → verification → hardening |
| Refactoring | explore → planning → execution → verification |
| Investigation | explore → hypothesis → verification |

The sequences above are patterns, not prescriptions. Choose the round type that matches where you actually are, not where you wish you were.

---

## Integration with Core Protocol

- Round-based execution operates within Phase Discipline (Section 3 of SKILL.md). Brainstorm/Plan/Execute phases still apply — rounds are the iteration mechanism within those phases.
- Evidence Grading (Section 5) governs all evidence claims within rounds.
- Assumption Registry (Section 6) is updated between every round.
- Escalation Ladder (Section 7) triggers recovery rounds.
- Verification Gate (Section 10) is the standard for verification rounds.
- Completion Status (Section 12) is reported after the final round.

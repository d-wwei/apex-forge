---
title: Evidentiary Discipline Expansion — Plan/Review Stages
status: approved
tier: 2
tasks: 4
---

# Evidentiary Discipline Expansion — Implementation Plan

## Problem Frame

Plan and Review stages lack the evidence tagging ([已验证]/[假设]) that Brainstorm enforces.
Unverified assumptions in plans cause wasted Execute work; unverified dismissals in reviews
let bugs ship.

## Files to Change

| File | Change | Impact |
|------|--------|--------|
| `stages/plan.md` | Add EVIDENTIARY DISCIPLINE block + extend exit gate | Plan stage quality |
| `stages/review.md` | Add EVIDENTIARY DISCIPLINE block + extend exit gate | Review stage quality |

Only 2 files. No TypeScript code. No bindings.yaml changes. No cross-file impact beyond
what these stages already reference (stage-exit-gate.md reads their exit gate sections).

## Decisions

| Decision | Rationale |
|----------|-----------|
| Same tag vocabulary ([已验证]/[假设]) | Consistency across stages. Agents learn one system. [已验证] read brainstorm.md |
| Hard gate block format matches Brainstorm | Visual consistency signals equal severity. [已验证] read brainstorm.md lines 45-68 |
| Stage-specific claim types | Each stage has different dangerous assumptions. Plan: file paths, API capabilities. Review: dismissals, behavioral claims. [已验证] analyzed failure modes |
| Add substance prompts, not structural checks | Evidence tagging is qualitative (substance), not binary (structural). [已验证] consistent with brainstorm Q4 pattern |

## Task Breakdown

### T1: Plan Stage — EVIDENTIARY DISCIPLINE block

Add to `stages/plan.md` after the Entry Conditions section (before Process):
- Hard gate declaration block matching Brainstorm style
- Stage-specific claim types table (file existence, API capability, approach feasibility, performance, dependency)
- Violation examples specific to planning
- "When about to make unverified claim → STOP" rule

Insert point: between line 35 (end of Upstream Entry Verification) and line 38 (Process).

### T2: Plan Stage — Exit Gate extension

Add to `stages/plan.md` Exit Gate → Substance Prompts:
- Q3: Are decisions' rationale tagged with evidence basis? Flag decisions with untagged assumptions.
- Q4: Are file manifest paths verified? Check that referenced files actually exist in the codebase.

Insert point: after existing Q2 (line 161).

### T3: Review Stage — EVIDENTIARY DISCIPLINE block

Add to `stages/review.md` after Entry Conditions section (before Review Modes):
- Hard gate declaration block
- Stage-specific claim types table (dismissals, behavioral claims, edge case assumptions, performance, security)
- Violation examples specific to reviewing
- "When about to dismiss a finding → STOP and verify" rule

Insert point: between line 30 (end of Upstream Entry Verification) and line 33 (Review Modes).

### T4: Review Stage — Exit Gate extension

Add to `stages/review.md` Exit Gate → Substance Prompts:
- Q3: Are "not an issue" dismissals backed by evidence? Flag dismissals without [已验证] tag.
- Q4: Are behavioral claims verified? Flag assertions about code behavior without file:line evidence.

Insert point: after existing Q2 (line 193).

## Dependency Graph

```
T1 (plan.md discipline block) ← no deps
T2 (plan.md exit gate) ← depends on T1 (needs the block to reference)
T3 (review.md discipline block) ← no deps (parallel with T1)
T4 (review.md exit gate) ← depends on T3
```

T1 and T3 can run in parallel. T2 depends on T1. T4 depends on T3.

## Test Strategy

Protocol documentation change — no TypeScript. Verification:
1. Read each modified file, verify block is present and formatted correctly
2. Verify exit gate substance prompts are numbered sequentially (Q3, Q4)
3. Cross-reference: Plan's claim types match plan-specific concerns, Review's match review-specific concerns
4. Verify: same tag vocabulary ([已验证]/[假设]) used in both stages

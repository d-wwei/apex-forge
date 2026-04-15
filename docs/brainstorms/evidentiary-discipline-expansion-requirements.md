---
title: Evidentiary Discipline Expansion — Plan/Review Stages
status: approved
scope: Standard
tier: 2
---

# Evidentiary Discipline Expansion: Plan & Review Stages

## Problem

Brainstorm stage enforces evidence tagging ([已验证]/[假设]) on all factual claims.
Plan and Review stages have no equivalent. This creates a quality gap:

- **Plan**: Decisions bake in unverified assumptions ("this API supports X", "file Y already exports Z").
  When the assumption is wrong, Execute discovers it late — wasted work.
- **Review**: Findings can dismiss issues without verification ("this code path can't be reached",
  "this edge case doesn't apply"). When the dismissal is wrong, bugs ship.

## Requirements

### R1: Plan Stage Evidentiary Discipline

Add evidence tagging to Plan stage, adapted to plan-specific claim types:

| Claim Type | What Must Be Tagged | Example |
|-----------|-------------------|---------|
| File existence | "file X exists and exports Y" | [已验证] read file, confirmed export |
| API/capability | "library X supports feature Y" | [假设] based on docs, not tested |
| Approach feasibility | "this can be done with X" | [已验证] found prior art in codebase |
| Performance | "this will handle N requests" | [假设] no benchmark data |
| Dependency availability | "package X provides function Y" | [已验证] checked node_modules |

### R2: Plan Exit Gate Extension

Add substance check to Plan exit gate verifying:
- Decisions' rationale includes evidence classification
- File manifest paths are verified against actual codebase
- Unverified assumptions are explicitly listed

### R3: Review Stage Evidentiary Discipline

Add evidence tagging to Review stage, adapted to review-specific claim types:

| Claim Type | What Must Be Tagged | Example |
|-----------|-------------------|---------|
| "Not an issue" dismissal | "this code path can't be reached" | [已验证] traced call graph |
| Behavioral claim | "this function handles null correctly" | [已验证] read implementation |
| "Edge case doesn't apply" | "users won't have >1000 items" | [假设] no usage data |
| "Performance acceptable" | "this query is fast enough" | [假设] no benchmark |
| Security claim | "input is already sanitized upstream" | [已验证] traced sanitization |

### R4: Review Exit Gate Extension

Add substance check to Review exit gate verifying:
- Findings cite specific file:line evidence (partially exists as Q1)
- "Not an issue" dismissals include evidence basis
- No untagged behavioral claims in the review artifact

## Constraints

1. Must not change the Brainstorm stage (it already has this)
2. Same tag vocabulary: [已验证] and [假设]
3. Hard gate block format matches Brainstorm's style
4. Must integrate with existing exit gate structure (add rows, don't restructure)

## Success Criteria

1. Plan stage has EVIDENTIARY DISCIPLINE block
2. Plan exit gate has substance check for evidence tagging
3. Review stage has EVIDENTIARY DISCIPLINE block
4. Review exit gate has substance check for evidence tagging
5. Tags use the same vocabulary as Brainstorm ([已验证]/[假设])

---
title: "Full Pipeline Hard Gate — Review"
status: DONE_WITH_CONCERNS
date: 2026-04-12
source_plan: docs/plans/full-pipeline-hardgate-plan.md
---

# Review: Full Pipeline Hard Gate

## Summary

Protocol text changes to three files: `skill/SKILL.md`, `protocol/SKILL.md`,
`using-superpowers/SKILL.md`. No code changes. Four findings identified,
three fixed, one tracked as concern.

## Findings

### Finding 1: Tier 1 + Git Interlock conflict (P1) — FIXED
Git Interlock assumed all pipelines go through Review. Tier 1 legitimately
skips Review. Added "Tier 1 exemption" paragraph to both SKILL.md and
protocol/SKILL.md clarifying Tier 1 does not use stage tracking.

### Finding 2: "stage" vs "phase" terminology (P2) — FIXED
protocol/SKILL.md mixed "phase" and "stage" in new sections. Unified all
new additions to use "stage" (matching CLI `apex stage set`). Pre-existing
uses of "phase" in original text left untouched to minimize churn.

### Finding 3: "always" vs hard-gate exception (P2) — FIXED
using-superpowers line 20 said "always take precedence" then line 28 said
"cannot override". Changed to "take precedence except where hard gates apply"
to eliminate the logical contradiction.

### Finding 4: PostToolUse hook may overwrite edits (P2) — TRACKED
During execution, the apex-forge-dashboard hook modified SKILL.md after an
Edit, requiring re-application. If the hook template-regenerates content,
future edits could be silently reverted. Needs investigation of hook logic.
**Not blocking ship** — edits verified to persist after second application.

## Verdict

**DONE_WITH_CONCERNS**: No P0, no unresolved P1. One P2 concern (Finding 4)
tracked for future investigation. All other findings resolved.

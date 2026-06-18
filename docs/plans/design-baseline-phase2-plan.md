---
title: Design-baseline Phase 2 Implementation Plan
status: approved
tier: 2
tasks: 5
---

# Design-baseline Phase 2 — Implementation Plan

## Overview

Add multi-persona sub-agent design review to `gates/design-baseline.md`. After Phase 1 objective
checks pass, 5 expert personas dispatch in parallel, produce independent findings, and their
verdicts are aggregated. This replaces `tasteful-frontend` in the Review layer.

## Architecture

```
Review Stage detects frontend file changes
  ↓
design-baseline Phase 1 (9 objective checks) — UNCHANGED
  ↓ ALL PASS
design-baseline Phase 2 (5 persona sub-agents, parallel) — NEW
  ↓ verdict aggregation
  ↓ PASS → proceed | BLOCK → return to Execute
```

## Files to Change

| File | Change | Impact |
|------|--------|--------|
| `gates/design-baseline.md` | Add Phase 2 section: persona prompts, dispatch procedure, conflict detection, verdict aggregation | Core implementation |
| `bindings.yaml` | Update `design-review` layers: remove tasteful-frontend from Layer 2, replace with Phase 2 reference | Review trigger config |
| `aliases/design-review.md` | Update description to reflect Phase 1 + Phase 2 flow | User-facing docs |
| `stages/review.md` | Update Skill Dispatch section (lines 146-154) to reference Phase 2 | Review stage integration |
| `stages/ship.md` | No changes needed — line 82 already checks "design-baseline gate run" | Verified: no impact |

## Task Breakdown

### T1: Persona Prompt Templates in design-baseline.md

Add a "Phase 2: Expert Persona Sub-Agents" section to `gates/design-baseline.md` with:

1. **5 persona prompt templates** — each defines: role, focus areas, evaluation criteria, what to look for, output format
2. **Dispatch procedure** — after Phase 1 passes, spawn 5 sub-agents in parallel using Agent tool
3. **Input spec** — each persona receives: changed file paths, git diff, screenshots (if available), Phase 1 results
4. **Output format** — standard review finding format (severity, autofix_class, confidence, file:line evidence)

Persona details:

| Persona | Key Evaluation Questions |
|---------|------------------------|
| UX Designer | Is information hierarchy clear? Are interaction patterns consistent? Does user flow have dead ends? |
| Accessibility Specialist | Screen reader experience? Cognitive load? Motor accessibility beyond tap target size? |
| Brand Guardian | Color palette consistency? Typography hierarchy? Spacing rhythm? Component visual coherence? |
| Performance Analyst | Image optimization? Bundle impact? Paint timing? Layout shifts? Unnecessary re-renders? |
| End User | First impression in 3 seconds? Can I find what I need? Does this feel trustworthy? |

### T2: Conflict Detection & Verdict Aggregation

Add to `gates/design-baseline.md`:

1. **Conflict detection algorithm**:
   - Parse all 5 persona finding lists
   - Group findings that reference the same file:line or same UI element
   - If two personas have contradictory recommendations (one says add, other says remove), flag as conflict
   - Surface conflict with both rationales + persona names

2. **Verdict aggregation** (reuse stage-exit-gate pattern):
   - Each persona produces: PASS / CONCERN / BLOCK + confidence
   - Aggregation: majority vote with confidence weighting
   - Any P0 + high confidence → BLOCK
   - Majority PASS + medium+ confidence → PASS
   - No majority or disagreement → ESCALATE to user with conflict report

3. **Configurable persona set**:
   - Add `phase2_personas` config section
   - Default: all 5 active
   - Projects can disable specific personas via `.apex/config.yaml`

### T3: bindings.yaml Update

Change the `design-review` entry under `review:`:

```yaml
# Before:
layers:
  - gate: design-baseline
    verdict_on_fail: REJECTED
  - skill: tasteful-frontend
    verdict_on_fail: APPROVED_WITH_FIXES

# After:
layers:
  - gate: design-baseline     # Phase 1 (objective) + Phase 2 (multi-persona)
    verdict_on_fail: REJECTED
```

Remove the `tasteful-frontend` layer from review. Keep the `tasteful-frontend` entry
under `execute:` (it still generates design specs during implementation).

### T4: Review Stage Integration

Update `stages/review.md` lines 146-154 (Skill Dispatch section):

- Replace two-layer description with: "design-baseline gate runs Phase 1 (objective) then Phase 2 (multi-persona sub-agents)"
- Remove reference to loading tasteful-frontend in review
- Update the flow description to match new architecture

### T5: Alias Update

Update `aliases/design-review.md`:
- Layer 1: design-baseline Phase 1 (objective checks)
- Layer 2: design-baseline Phase 2 (5 expert persona sub-agents)
- Remove tasteful-frontend reference from review flow

## Dependency Graph

```
T1 (persona prompts) ← no deps
T2 (conflict + aggregation) ← depends on T1 (needs prompt output format)
T3 (bindings.yaml) ← no deps (parallel with T1)
T4 (review.md) ← depends on T1, T2 (needs final architecture)
T5 (alias) ← depends on T4 (needs review.md alignment)
```

## Risk Assessment

1. **Persona prompt quality** — prompts must be specific enough to produce actionable findings, not generic "looks good". Mitigate: include concrete evaluation questions and anti-rubber-stamping instructions.
2. **Sub-agent cost** — 5 parallel agents per design review is expensive. Mitigate: configurable persona set, only runs for frontend changes.
3. **Conflict detection false positives** — different personas discussing the same area != conflict. Mitigate: require contradictory recommendations, not just overlapping scope.

## Test Strategy

This is a protocol/documentation change — no TypeScript code. Verification:
1. Read each modified file, verify structural completeness
2. Verify bindings.yaml parses correctly (no syntax errors)
3. Cross-reference: review.md flow description matches design-baseline.md procedure
4. Cross-reference: alias matches actual gate behavior
5. Dry-run: trace through a hypothetical frontend review scenario mentally

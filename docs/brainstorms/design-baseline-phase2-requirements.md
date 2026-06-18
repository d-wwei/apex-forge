---
title: Design-baseline Phase 2 — Multi-Persona Sub-Agent Design Review
status: approved
scope: Standard
tier: 2
---

# Design-baseline Phase 2: Multi-Persona Sub-Agent Design Review

## Problem

Phase 1 of design-baseline provides binary objective checks (contrast, touch targets, etc.).
When it passes, the review falls through to a single `/tasteful-frontend` invocation for subjective review.
This single-reviewer model has no perspective diversity — one prompt template produces one viewpoint.

Design quality requires multiple specialized perspectives: accessibility, UX flow, brand consistency,
performance impact, and end-user perception. These often conflict (performance vs animation richness,
accessibility vs visual density). A single reviewer cannot surface these tensions.

## Requirements

### R1: 5 Expert Persona Sub-Agents

After Phase 1 passes, spawn 5 independent sub-agents:

| # | Persona | Focus | Judgment Type |
|---|---------|-------|---------------|
| 1 | UX Designer | Information architecture, interaction patterns, user flow coherence | Subjective expert |
| 2 | Accessibility Specialist | Beyond WCAG AA — cognitive load, screen reader experience, motor accessibility | Deep domain |
| 3 | Brand Guardian | Visual consistency with brand guidelines, tone alignment | Subjective expert |
| 4 | Performance Analyst | Render performance, asset weight, Core Web Vitals impact | Quantitative |
| 5 | End User (non-technical) | First impression, clarity, trust signals, emotional response | User perspective |

### R2: Independence

Sub-agents run in parallel. No persona can see another's findings. This is the same independence
requirement as stage-exit-gate substance checks.

### R3: Standard Finding Format

Each persona produces findings using the existing review format:
- severity (P0-P3), autofix_class, confidence, file:line evidence

### R4: Conflict Detection

When two personas produce contradictory findings on the same element/decision,
the system must detect and surface the conflict with both rationales.
Conflicts are NOT auto-resolved — they escalate to the user.

### R5: Verdict Aggregation

Aggregate persona verdicts into a final design review verdict using confidence voting
(same mechanism as stage-exit-gate).

### R6: Configurable Persona Set

Not all projects need all 5 personas. Allow configuration via project settings
to enable/disable specific personas. Default: all 5 active.

### R7: Conditional Activation

Phase 2 only runs when frontend files change (same trigger condition as current design review).
Non-frontend reviews skip Phase 2 entirely.

## Constraints

1. Phase 1 objective checks must still pass before Phase 2 starts
2. Must reuse the existing sub-agent dispatch pattern (Agent tool, parallel)
3. Must integrate with review.md artifact format (findings go into the review doc)
4. Must not break review flow for non-frontend changes
5. Dashboard should show persona dispatch status during review

## Architecture Question

**Phase 2 relationship with tasteful-frontend:**

Current flow: `design-baseline Phase 1 → tasteful-frontend`

Options:
- **A**: Phase 2 sits between Phase 1 and tasteful-frontend (3 layers)
- **B**: Phase 2 subsumes tasteful-frontend's review role (2 layers, personas cover what TF did)
- **C**: Phase 2 personas USE tasteful-frontend's criteria as their evaluation framework

**Decision: Option B.** Phase 2 subsumes tasteful-frontend in Review.
tasteful-frontend remains in Execute (design spec generation) but is replaced
in Review by multi-persona evaluation. This keeps review at 2 layers (Phase 1 + Phase 2)
while gaining specialized perspective diversity.

## Success Criteria

1. 5 persona sub-agents dispatch in parallel after Phase 1 passes
2. Each produces independent findings in standard format
3. Conflicts between personas are detected and surfaced
4. Aggregated verdict gates progression
5. Review artifact includes per-persona findings section
6. Non-frontend reviews unaffected

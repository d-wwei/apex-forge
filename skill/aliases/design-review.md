---
name: apex-forge-design-review
description: "Alias: routes to two-phase design review (Phase 1 objective checks + Phase 2 multi-persona sub-agents)"
---

**This command runs a two-phase design review via `gates/design-baseline.md`.**

1. **Phase 1**: Objective checks (contrast, touch targets, focus, overflow, breakpoints, font size, line height, consistency, hierarchy, empty states). Binary pass/fail.
2. **Phase 2**: 5 expert persona sub-agents (UX Designer, Accessibility Specialist, Brand Guardian, Performance Analyst, End User) dispatched in parallel. Independent findings, conflict detection, verdict aggregation.

If Phase 1 fails → REJECTED, return to Execute. Phase 2 does not run.
If Phase 1 passes → Phase 2 dispatches personas. Aggregated verdict determines outcome.

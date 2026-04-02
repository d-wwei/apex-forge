# Acceptance Loop

Use this reference both **during** and **after** implementation. Fidelity is checked continuously, not just at the end.

## Core rule

Treat fidelity as an iterative optimization problem, not a one-shot generation problem.

## Two modes

### Mode 1: Continuous (during implementation)

Run after each implementation phase and after significant changes. The goal is early detection — catch drift before it compounds.

**Per-phase checks:**

| Phase | What to check |
|-------|--------------|
| 1. Structure | All views exist and are navigable |
| 2. Data | Content is populated, no empty containers |
| 3. Spacing & Typography | Visual rhythm matches, heading hierarchy is clear |
| 4. Viewport Proportions | Key sections match design proportions |
| 5. Component States | Each state variant matches its design reference |
| 6. Detail Polish | Gradients, shadows, borders match at compressed resolution |
| 7. Standalone Components | Standalone and integrated versions are consistent |

**Continuous check protocol:**

1. Screenshot the implementation at the same viewport as the design
2. Compare region-by-region against the design reference
3. Note the top 3 visible differences
4. Fix the highest-impact difference first
5. Re-screenshot and re-compare
6. When no visible differences remain at compressed resolution, the phase passes

See [fidelity-loop.md](fidelity-loop.md) for the full single-variable experiment protocol.

### Mode 2: Final (after implementation converges)

Run when the fidelity loop has stabilized. This is the formal acceptance gate.

## Final review order

1. Structural fidelity
2. Component fidelity
3. Visual fidelity
4. Responsive fidelity
5. Interaction fidelity
6. Evidence and traceability

## Pass criteria

Pass only when:

- the implementation still matches the current spec
- the component map still describes the shipped code
- the most important visual and behavioral requirements hold
- evidence exists for the claim that the task is complete
- the fidelity loop has converged (no further improvements possible at reasonable cost)

## Fail criteria

Fail when:

- a generic substitution weakened an important design element
- the implementation no longer matches the spec
- responsive or interaction behavior is missing
- the output is "close enough" but not explicitly accepted
- component states are incomplete (missing collapsed, error, hover, etc.)

## Theme & CSS Variable Chain Verification

Before visual pass/fail, verify:

1. HTML root has the correct theme class (`<html class="dark">` or `<html class="light">`)
2. CSS file contains matching selectors (`.dark { --bg: #0a0a0a; ... }`)
3. Components use `var(--bg)`, not hardcoded `#0a0a0a`
4. If a theme store exists, its default value matches the HTML class
5. A runtime sync effect keeps HTML class and store aligned

If any layer is missing, mark as **fail** — the theme will not activate correctly regardless of whether individual colors look right in a specific OS setting.

## Screenshot Comparison

When a design reference is available:

1. Take a screenshot of the implementation at the same viewport size
2. Use the appropriate resolution tier: tiny (400px) for structural check, compressed (600px) for detail check
3. Compare region-by-region: header, main content, sidebar, footer
4. Check for: color accuracy, spacing consistency, typography matching, layout alignment
5. Flag any visible drift — even small cumulative differences indicate problems

When drift is found, prefer switching to inline styles with exact pixel values from the design API over adjusting utility classes.

## CSS Framework Pitfalls to Check

- **Tailwind approximation**: verify that `py-2.5` actually equals the design's padding value (it may be 8px instead of 10px)
- **`space-y-N` + Fragments**: verify spacing is consistent when children use React Fragments
- **Missing CSS variable definitions**: verify all `var(--name)` references have corresponding definitions
- **position:sticky failures**: verify sticky elements actually stick (they may silently fail)

See [tactical-patterns.md](tactical-patterns.md) for the full pitfalls list and workarounds.

## Revision rule

Fix the highest-impact fidelity gaps first, then re-run the relevant checks.

Do not compensate for drift with narrative explanations unless the user explicitly accepts the tradeoff.

When multiple small gaps remain but no single fix improves the score, try combining 2-3 related changes in one commit.

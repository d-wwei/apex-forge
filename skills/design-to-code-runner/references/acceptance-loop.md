# Acceptance Loop

Use this reference when deciding whether a design-to-code task is actually done.

## Core rule

Treat fidelity as an acceptance problem, not a generation problem.

## Review order

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

## Fail criteria

Fail when:

- a generic substitution weakened an important design element
- the implementation no longer matches the spec
- responsive or interaction behavior is missing
- the output is "close enough" but not explicitly accepted

## Theme & CSS Variable Chain Verification

Before visual pass/fail, verify:

1. HTML root has the correct theme class (`<html class="dark">` or `<html class="light">`)
2. CSS file contains matching selectors (`.dark { --bg: #0a0a0a; ... }`)
3. Components use `var(--bg)`, not hardcoded `#0a0a0a`
4. If a theme store exists, its default value matches the HTML class
5. A runtime sync effect keeps HTML class and store aligned

If any layer is missing, mark as **fail** — the theme will not activate correctly regardless of whether individual colors look right in a specific OS setting.

## Screenshot Comparison

When a design screenshot is available:

1. Take a screenshot of the generated output at the same viewport size
2. Compare side-by-side with the design screenshot
3. Check for: color accuracy, spacing consistency, typography matching, layout alignment
4. Flag any visible drift — even small cumulative differences indicate utility class approximation problems

When drift is found, prefer switching to inline styles with exact pixel values from the design API over adjusting Tailwind classes.

## CSS Framework Pitfalls to Check

- **Tailwind approximation**: verify that `py-2.5` actually equals the design's padding value (it may be 8px instead of 10px)
- **`space-y-N` + Fragments**: verify spacing is consistent when children use React Fragments
- **Missing CSS variable definitions**: verify all `var(--name)` references have corresponding definitions

## Revision rule

Fix the highest-impact fidelity gaps first, then re-run the relevant checks.

Do not compensate for drift with narrative explanations unless the user explicitly accepts the tradeoff.

# Agent Execution SOP

Use this SOP for any design-to-code task.

## Inputs

Required inputs before coding starts:

- filled implementation spec
- filled component map
- target repo context
- raw design inputs for reference

## Step 1: Read The Spec First

- Read the implementation spec before touching code.
- Read the component map before choosing existing components.
- Review raw design input only as supporting evidence.

Required: yes
Mode: agent-driven

## Step 2: Validate Spec Completeness

Confirm the spec is complete enough to implement:

- structure is defined
- key semantics are defined
- breakpoints are defined
- required states are defined
- non-negotiables are defined
- open questions are recorded

If not complete, update the spec first.

Required: yes
Mode: agent-driven, human-confirmed if blocking ambiguity remains

## Step 3: Resolve Component Mapping

For each spec component:

- map it to an existing repo component, primitive composition, or a new component
- document the choice in the component map
- record forbidden substitutions when needed

Required: yes
Mode: agent-driven

## Step 4: Produce A Short Plan

Before implementation, write down:

- files to change
- components to reuse
- components to create
- verification steps
- likely risks

Required: yes
Mode: agent-driven

## Step 5: Extract Exact Parameters From Design API

Before implementation, query the design tool API (e.g. Pencil `batch_get`, Figma inspect) to extract exact values:

- colors: exact hex/rgba values, not approximations
- spacing: exact pixel values for padding, margin, gap
- sizing: exact width, height, border-radius in pixels
- typography: exact font-size, line-height, font-weight, font-family
- theme tokens: CSS variable names and their values per theme

Do not rely on visual estimation or Tailwind class approximation. Record extracted values in the implementation spec.

Required: yes
Mode: agent-driven

## Step 6: Implement Against The Spec

- follow the implementation spec
- follow the component map
- do not replace missing clarity with improvisation
- if implementation reality forces a change, update the spec or map
- **prefer inline styles with exact pixel values** over CSS framework utility classes when design fidelity is critical (e.g. `style={{ padding: '10px 12px' }}` instead of `py-2.5 px-3`)
- avoid `space-y-N` or similar parent-driven spacing with React Fragments — use explicit margin/gap on each child instead

Required: yes
Mode: agent-driven

## Step 7: Validate Theme & CSS Variable Chain

Before visual verification, confirm the full activation chain:

1. **HTML preset**: `<html class="dark">` (or `light`) is set at build time or via inline script
2. **CSS selectors exist**: `.dark { --var-name: value; }` selectors are defined and reachable
3. **Variables are consumed**: components reference `var(--var-name)`, not hardcoded colors
4. **Store/state default**: if using a theme store (e.g. Zustand), its default matches the HTML class
5. **Runtime sync**: a `useEffect` or equivalent keeps HTML class and store in sync

If any layer is broken, the theme will silently fail. Fix before proceeding to visual review.

Required: yes
Mode: agent-driven

## Step 8: Verify

Run the strongest checks available in the repo, for example:

- local preview
- screenshots (compare side-by-side with design screenshot)
- responsive inspection
- automated tests

Required: yes
Mode: machine-verified where possible

## Step 9: Review Against Acceptance

Compare the result against `templates/acceptance-checklist.md`.

- mark pass or fail honestly
- capture evidence
- list unresolved gaps

Required: yes
Mode: agent-driven, human-reviewable

## Step 10: Revise Until Acceptable

- fix the highest-impact fidelity gaps first
- re-run verification after changes
- escalate only when a tradeoff needs human approval

Required: yes
Mode: agent-driven

## Step 11: Deliver With Traceability

A task is complete only when the repo contains:

- final implementation
- final implementation spec
- final component map
- completed acceptance checklist

Required: yes
Mode: agent-driven

## Hard Rules

- no direct screenshot-to-code jumps
- no silent component substitutions
- no completion without acceptance evidence
- no unresolved ambiguity hidden inside code

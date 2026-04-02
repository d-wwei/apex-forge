# Agent Execution SOP

Use this SOP for any design-to-code task.

## Inputs

Required inputs before coding starts:

- design source (images, HTML, Figma URL, or Paper file)
- filled implementation spec (or template to fill)
- filled component map (or template to fill)
- target repo context
- raw design inputs for reference

## Step 0: Preprocess Design Sources

Before anything else, identify the design source type and extract specifications.

- **Image files**: Create multi-resolution tiers (tiny 400px, compressed 600px, original). Inventory all views/screens. Determine target viewport.
- **HTML/CSS**: Read code directly to extract design tokens (colors, spacing, fonts). Map structure to components.
- **Figma**: Use MCP tools — `get_metadata` → `get_variable_defs` → `get_design_context` → `search_design_system`.
- **Paper (.pen)**: Use MCP tools — `get_editor_state` → `batch_get` → `get_computed_styles` → `get_jsx`.

Output: design token inventory, view inventory, reference images, target viewport dimensions.

Required: yes
Mode: agent-driven

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
- required states are defined (all variants: default, hover, active, collapsed, expanded, error, loading, empty)
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
- implementation phase order (see Step 6)
- verification steps
- likely risks

Required: yes
Mode: agent-driven

## Step 5: Extract Exact Parameters From Design Source

Use the extraction strategy from Step 0:

- **API sources** (Figma/Paper): Query MCP tools for exact hex/rgba, pixel spacing, font specs, CSS variable names.
- **HTML/CSS sources**: Read stylesheet directly.
- **Image sources**: Extract what's readable (layout, palette, hierarchy). Accept that exact values will require iterative tuning.

Record all extracted values in the implementation spec. Do not rely on visual estimation.

Required: yes
Mode: agent-driven

## Step 6: Implement In Phases

Do not implement everything at once. Follow this execution order:

**Phase 1: Structure** — HTML skeleton, routing, layout containers.
- Completion: all views exist and are navigable.

**Phase 2: Data** — Demo content, realistic values, no empty states.
- Completion: all sections have visible content.

**Phase 3: Spacing & Typography** — Gaps, padding, font size hierarchy.
- Completion: visual rhythm matches design. This phase typically has the biggest single-phase impact.

**Phase 4: Viewport Proportions** — vh/vw values, hero height, grid ratios.
- Completion: section proportions match. Requires 2-3 iteration rounds — vh/vw cannot be precisely derived from static images.

**Phase 5: Component States** — collapsed/expanded/active/hover/error/loading/empty.
- Completion: every state variant implemented and compared against design.

**Phase 6: Detail Polish** — Gradients, shadows, borders, decorative elements.
- Completion: pixel-level details match at compressed resolution.

**Phase 7: Standalone Components** — Complex components as separate pages for isolated iteration.
- Completion: standalone version matches design; integrated version matches standalone.

**After each phase, run Step 8 (fidelity loop).** Do not batch multiple phases.

Additional rules:
- follow the implementation spec and component map
- do not replace missing clarity with improvisation
- if implementation reality forces a change, update the spec or map
- **prefer inline styles with exact pixel values** over CSS framework utility classes when design fidelity is critical
- avoid `space-y-N` or similar parent-driven spacing with React Fragments — use explicit margin/gap instead

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

## Step 8: Run Continuous Fidelity Loop

Run after every phase and after significant changes within a phase:

1. Screenshot the current state at the target viewport size
2. Compare with design reference (same region, same resolution tier)
3. Assess: improved, regressed, or unchanged?
4. **Improved** → keep (commit), proceed to next change
5. **Regressed** → discard (revert), try different approach
6. **Unchanged after 3 attempts** → escalate (bigger structural change or ask user)

Key rules:
- **One variable at a time** — isolate the effect of each change
- **Smallest reference image first** — use tiny/ for quick checks, compressed/ for detail
- **Record progress** — track (commit, score, status, description) in a TSV for cross-session continuity
- **Plateau detection** — 3+ unchanged rounds → switch from polish to structural changes

Required: yes (after each implementation phase)
Mode: agent-driven

## Step 9: Final Acceptance Review

After the fidelity loop converges, compare the result against `templates/acceptance-checklist.md`.

- structural fidelity — layout and element hierarchy
- component fidelity — correct components used, no silent substitutions
- visual fidelity — colors, spacing, typography, borders match
- responsive fidelity — breakpoints and adaptive behavior
- interaction fidelity — all states work (including collapsed, error, empty)
- evidence — screenshots, comparison images, fidelity scores

Mark pass or fail honestly. List unresolved gaps.

Required: yes
Mode: agent-driven, human-reviewable

## Step 10: Revise Until Acceptable

- fix the highest-impact fidelity gaps first
- re-run fidelity loop after changes
- when fidelity plateaus, try structural changes before declaring complete
- escalate only when a tradeoff needs human approval

Required: yes
Mode: agent-driven

## Step 11: Deliver With Traceability

A task is complete only when the repo contains:

- final implementation
- final implementation spec (updated if reality changed)
- final component map (updated if reality changed)
- completed acceptance checklist (with evidence)
- fidelity progress log (if iterative tuning was performed)

Required: yes
Mode: agent-driven

## Hard Rules

- no direct screenshot-to-code jumps — always preprocess the design source first
- no silent component substitutions
- no completion without acceptance evidence
- no unresolved ambiguity hidden inside code
- no skipping the fidelity loop between implementation phases
- no multi-variable changes when debugging fidelity regressions

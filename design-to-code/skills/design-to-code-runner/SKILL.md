---
name: design-to-code-runner
description: Execute spec-first design-to-code work from repository assets instead of directly from screenshots. Use when Codex needs to implement UI from designs, create or complete implementation specs, resolve component mappings, enforce anti-drift workflow gates, or review fidelity against acceptance criteria in repos that use files such as AGENTS.md, architecture docs, spec templates, component maps, SOPs, and acceptance checklists.
---

# Design To Code Runner

## Overview

Use the repository as the source of truth. Use this skill to make agents follow the repository workflow consistently: preprocess design sources, discover the contract, create or validate task artifacts, implement in phases, run continuous fidelity checks, and close the acceptance loop.

## Recommended companion skills

This skill relies on browser and desktop automation for the fidelity loop (screenshot capture, visual comparison). Install these companion skills for best results:

- **browser-control** — Background browser automation via CDP Proxy. Use for: opening dev server pages, taking screenshots, scrolling, and comparing — all in background tabs without disturbing the user's active window.
- **chrome-control** — Chrome-specific automation via JXA/AppleScript. Use for: macOS-native Chrome tab control and async JavaScript injection.
- **macOS Desktop Control** (MCP server: `mcp__macos-desktop-control__*`) — System-level window screenshot and interaction. Use for: capturing specific windows via the `target` parameter without stealing focus.

If companion skills are not installed, warn the user:

> "Design-to-code fidelity loop requires browser/desktop automation for screenshot comparison. Recommended: install `browser-control` and/or `chrome-control` skills, or ensure the `macos-desktop-control` MCP server is configured."

### Background operation principle

**Always prefer background operations.** The user and the agent should be able to work simultaneously. Never steal the user's active window focus for routine screenshots or comparisons.

| Tool | Background method |
|------|------------------|
| Browser Control (CDP Proxy) | `curl -s "http://localhost:3456/screenshot?target=ID&file=/tmp/shot.png"` — operates on background tabs |
| macOS Desktop Control | `target: { app: "Google Chrome", title: "..." }` — captures specific window without focus |
| Chrome Control (JXA) | Async JS injection — runs in browser background, retrieves results later |

When taking screenshots for the fidelity loop:
1. **First choice**: CDP Proxy background tab (zero user disruption)
2. **Second choice**: macOS Desktop Control with `target` parameter (brief flash, restored focus)
3. **Last resort**: Foreground screenshot (only when background methods are unavailable)

## Workflow

### 0. Identify and preprocess design sources

Before any implementation, identify the design source type and extract specifications accordingly:

- **Image files** (PNG/JPG/PDF): Prepare multi-resolution versions (tiny 400px, compressed 600px, original). Identify all distinct views/screens. Determine target viewport dimensions.
- **Existing HTML/CSS**: Read the code directly to extract design tokens (colors, spacing, fonts, layout patterns). This is the most precise source — do not guess what you can read.
- **Figma**: Use MCP tools — `get_design_context` for code + screenshot, `get_metadata` for structure, `get_variable_defs` for tokens, `search_design_system` for reusable components.
- **Paper (.pen files)**: Use MCP tools — `batch_get` for node data, `get_computed_styles` for exact CSS values, `get_screenshot` for visual reference, `get_jsx` for code representation.

Do not skip this step. The source type determines the precision of everything that follows. Read [references/design-source-preprocessing.md](references/design-source-preprocessing.md) for the detailed extraction protocol per source type.

### 1. Discover the repository contract

Read repository-native instructions before touching code.

Preferred files:

- `AGENTS.md`
- `docs/architecture.md`
- task-specific `implementation-spec.yaml`
- task-specific `component-map.json`
- `workflows/agent-execution-sop.md`
- task-specific `acceptance-checklist.md`

If the repo does not use these exact paths, search for equivalent files first. Read [references/file-discovery.md](references/file-discovery.md) when path discovery is ambiguous.

### 2. Establish task artifacts before implementation

If task-specific files do not exist yet, create them from the repository templates before coding:

- `implementation-spec.yaml`
- `component-map.json`
- `acceptance-checklist.md`

Use `scripts/bootstrap_task.py` to create these files quickly when the repository follows the scaffold conventions. Read [references/task-artifacts.md](references/task-artifacts.md) when creating or repairing task files manually.

Do not implement directly from screenshots or design inspection alone.

### 3. Validate the implementation spec

Before coding, confirm the spec is complete enough to drive implementation:

- scope is bounded
- intent and non-negotiables are explicit
- structure and component list are explicit
- responsive behavior is explicit
- interaction states are explicit (all variants: collapsed, expanded, active, hover, error, loading, empty)
- acceptance checks are explicit
- assumptions and open questions are captured

If any of these are missing, update the spec first.

### 4. Resolve component mappings

Map each spec component to one of:

- existing repo component
- primitive composition
- new component

Document rationale and forbidden substitutions. Existing repo components are not automatically correct; they are correct only when they preserve the intended hierarchy and behavior.

### 5. Extract exact parameters from design source

Use the extraction strategy identified in step 0:

- **From API sources** (Figma/Paper): Query the design tool MCP for exact hex/rgba color values, exact pixel values for padding/margin/gap/border-radius, exact font-size/line-height/font-weight, CSS variable names and per-theme values.
- **From HTML/CSS sources**: Read the stylesheet directly for all design tokens.
- **From image sources**: Extract what you can (layout structure, approximate palette, typography hierarchy) and accept that exact values will require iterative tuning in the fidelity loop.

Record all extracted values in the implementation spec. Do not estimate what you can query.

### 6. Implement in phases

Do not implement everything at once. Follow this execution order:

| Phase | Focus | Key output |
|-------|-------|-----------|
| 1. Structure | HTML skeleton, routing, containers | All views navigable |
| 2. Data | Demo content, realistic values | No empty states |
| 3. Spacing & Typography | Gaps, padding, font hierarchy | Visual rhythm matches design |
| 4. Viewport Proportions | vh/vw values, hero height, grid ratios | Section proportions correct (2-3 iterations) |
| 5. Component States | collapsed/expanded/active/hover/error | All state variants implemented |
| 6. Detail Polish | Gradients, shadows, borders, decorations | Pixel-level details match |
| 7. Standalone Components | Complex components as separate pages | Isolated iteration for complex parts |

**After each phase, run the fidelity loop (step 8).** Do not batch multiple phases before checking.

Additional implementation rules:
- preserve semantics and hierarchy from the spec
- avoid silent substitutions
- update task artifacts if implementation reality forces a change
- **use inline styles with exact pixel values** for spacing, sizing, and colors when design fidelity is critical
- **avoid Tailwind approximations** (e.g. `py-2.5` for 10px) — utility classes introduce cumulative drift
- **avoid `space-y-N` with React Fragments** — use explicit margin or gap instead

Read [references/implementation-phases.md](references/implementation-phases.md) for completion criteria and detailed guidance per phase.

### 7. Validate theme and CSS variable chain

Before visual review, verify the full activation chain:

1. HTML root has the correct theme class (e.g. `<html class="dark">`)
2. CSS selectors (`.dark {}`) define all required variables
3. Components consume `var(--name)`, not hardcoded colors
4. Theme store default matches HTML class
5. Runtime sync keeps HTML class and store aligned

If any layer is broken, the theme will silently fail to activate.

### 8. Run continuous fidelity loop

Do NOT wait until the end to check your work. After every phase (and after significant changes within a phase):

1. Screenshot the current state
2. Compare with design reference (same region, same viewport)
3. Assess: improved, regressed, or unchanged?
4. **Improved** → keep (commit), proceed to next change
5. **Regressed** → discard (revert), try different approach
6. **Unchanged after 3 attempts** → escalate (bigger structural change or ask user)

Key rules:
- **Change one variable at a time** for clear attribution
- **Use the smallest reference image** that shows the difference (tiny/ first)
- **When score plateaus**, switch from polish to structural changes
- **Record progress** in a TSV for cross-session continuity

Read [references/fidelity-loop.md](references/fidelity-loop.md) for the full protocol including plateau detection and image comparison strategy.

### 9. Run final acceptance review

After the fidelity loop converges, evaluate the result against the task acceptance checklist:

- structural fidelity
- component fidelity
- visual fidelity
- responsive fidelity
- interaction fidelity
- evidence and traceability

Read [references/acceptance-loop.md](references/acceptance-loop.md) for pass/fail decision rules.

### 10. Deliver with traceability

Before finishing, ensure the repository contains:

- final implementation
- final implementation spec
- final component map
- completed acceptance checklist
- fidelity progress log (if iterative tuning was performed)

If a user asks for a summary, explain what changed, what evidence was collected, and what remains open.

## Decision rules

- Prefer repository policy over conversational shorthand.
- Prefer task-specific files over generic templates once task files exist.
- Ask the user only when ambiguity changes scope, semantics, or acceptance.
- When blocked by missing task artifacts, create them first instead of guessing.
- When implementation and spec diverge, update the spec or explicitly surface the conflict.
- When fidelity plateaus, try structural changes before declaring the task complete.

## Useful resources

- Read [references/design-source-preprocessing.md](references/design-source-preprocessing.md) for design source identification and extraction per source type.
- Read [references/file-discovery.md](references/file-discovery.md) for locating equivalent files in non-standard repos.
- Read [references/task-artifacts.md](references/task-artifacts.md) for artifact creation, minimum completeness, and update rules.
- Read [references/implementation-phases.md](references/implementation-phases.md) for phased execution order and completion criteria.
- Read [references/fidelity-loop.md](references/fidelity-loop.md) for continuous screenshot comparison and keep/discard protocol.
- Read [references/acceptance-loop.md](references/acceptance-loop.md) for final fidelity review and correction rules.
- Read [references/tactical-patterns.md](references/tactical-patterns.md) for CSS pitfalls, modern patterns, and workarounds.

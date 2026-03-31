---
name: design-to-code-runner
description: Execute spec-first design-to-code work from repository assets instead of directly from screenshots. Use when Codex needs to implement UI from designs, create or complete implementation specs, resolve component mappings, enforce anti-drift workflow gates, or review fidelity against acceptance criteria in repos that use files such as AGENTS.md, architecture docs, spec templates, component maps, SOPs, and acceptance checklists.
---

# Design To Code Runner

## Overview

Use the repository as the source of truth. Use this skill to make agents follow the repository workflow consistently: discover the contract, create or validate task artifacts, implement against the spec, and close the acceptance loop.

## Workflow

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
- interaction states are explicit
- acceptance checks are explicit
- assumptions and open questions are captured

If any of these are missing, update the spec first.

### 4. Resolve component mappings

Map each spec component to one of:

- existing repo component
- primitive composition
- new component

Document rationale and forbidden substitutions. Existing repo components are not automatically correct; they are correct only when they preserve the intended hierarchy and behavior.

### 5. Extract exact parameters from design API

Before implementation, query the design tool API (Pencil `batch_get`, Figma inspect, etc.) to extract:

- exact hex/rgba color values
- exact pixel values for padding, margin, gap, border-radius
- exact font-size, line-height, font-weight
- CSS variable names and per-theme values

Record these in the implementation spec. Do not estimate from screenshots.

### 6. Implement against the spec

Treat the spec and component map as binding execution inputs.

- preserve semantics
- preserve hierarchy
- avoid silent substitutions
- update the task artifacts if implementation reality forces a change
- **use inline styles with exact pixel values** for spacing, sizing, and colors when design fidelity is critical
- **avoid Tailwind approximations** (e.g. `py-2.5` for 10px) — utility classes introduce cumulative drift
- **avoid `space-y-N` with React Fragments** — use explicit margin or gap instead

Keep prompts thin. The repository files should carry the detailed instructions.

### 7. Validate theme and CSS variable chain

Before visual review, verify the full activation chain:

1. HTML root has the correct theme class (e.g. `<html class="dark">`)
2. CSS selectors (`.dark {}`) define all required variables
3. Components consume `var(--name)`, not hardcoded colors
4. Theme store default matches HTML class
5. Runtime sync keeps HTML class and store aligned

If any layer is broken, the theme will silently fail to activate.

### 8. Run the acceptance loop

Use the strongest checks available in the target repo:

- local preview
- screenshot review
- responsive inspection
- automated tests
- manual design review

Then evaluate the result against the task acceptance checklist. Read [references/acceptance-loop.md](references/acceptance-loop.md) when you need the decision rules for pass, fail, and revision.

### 9. Deliver with traceability

Before finishing, ensure the repository contains:

- final implementation
- final implementation spec
- final component map
- completed acceptance checklist

If a user asks for a summary, explain what changed, what evidence was collected, and what remains open.

## Decision rules

- Prefer repository policy over conversational shorthand.
- Prefer task-specific files over generic templates once task files exist.
- Ask the user only when ambiguity changes scope, semantics, or acceptance.
- When blocked by missing task artifacts, create them first instead of guessing.
- When implementation and spec diverge, update the spec or explicitly surface the conflict.

## Useful resources

- Read [references/file-discovery.md](references/file-discovery.md) for locating equivalent files in non-standard repos.
- Read [references/task-artifacts.md](references/task-artifacts.md) for artifact creation, minimum completeness, and update rules.
- Read [references/acceptance-loop.md](references/acceptance-loop.md) for fidelity review and correction rules.

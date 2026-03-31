# OpenClaw Entry

Use this file as the minimal entry point for OpenClaw or similar open agent runners.

## Goal

Provide a vendor-neutral way to launch the same repository-first design-to-code workflow in environments that may not have native skill support.

## Operating Model

OpenClaw should treat this repository as the contract surface.

Read in this order:

1. `AGENTS.md`
2. `docs/architecture.md`
3. task-local `implementation-spec.yaml`
4. task-local `component-map.json`
5. `workflows/agent-execution-sop.md`
6. task-local `acceptance-checklist.md`

## Minimal Launch Prompt

```text
Execute this design-to-code task using the repository workflow.

Read these files first:
- AGENTS.md
- docs/architecture.md
- workflows/agent-execution-sop.md
- <path-to-implementation-spec.yaml>
- <path-to-component-map.json>
- <path-to-acceptance-checklist.md>

Execution rules:
- implementation spec is the execution truth
- raw design input is evidence, not the final contract
- component substitutions must be explicit
- if the spec is incomplete, fix the spec before coding
- finish only after acceptance review is complete
```

## If The Runner Has No Native Skill Mechanism

That is fine. This repository does not depend on one vendor feature.

In that case, use:

- repository files as the stable policy layer
- task-local files as the task contract
- the launch prompt above as the thin execution wrapper

## Completion Standard

OpenClaw should produce:

- final implementation
- final implementation spec
- final component map
- completed acceptance checklist

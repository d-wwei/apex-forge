# Claude Code Entry

Use this file as the minimal entry point for Claude Code.

## Goal

Make Claude Code execute the repository workflow instead of implementing directly from screenshots or loose conversation.

## Read Order

Before coding, Claude Code should read:

1. `AGENTS.md`
2. `docs/architecture.md`
3. task-local `implementation-spec.yaml`
4. task-local `component-map.json`
5. `workflows/agent-execution-sop.md`
6. task-local `acceptance-checklist.md`

If task-local files do not exist yet, create them from:

- `specs/implementation-spec.template.yaml`
- `specs/component-map.template.json`
- `templates/acceptance-checklist.md`

## Recommended Task Prompt

```text
Use this repository's design-to-code workflow.

Read these files first:
- AGENTS.md
- docs/architecture.md
- workflows/agent-execution-sop.md

Task files:
- <path-to-implementation-spec.yaml>
- <path-to-component-map.json>
- <path-to-acceptance-checklist.md>

Rules:
- treat the implementation spec as the source of execution truth
- do not implement directly from screenshots alone
- do not silently substitute components
- update the spec and component map if implementation reality forces a change
- do not finish until the acceptance checklist is completed
```

## If You Are Using The Repository Skill

If Claude Code supports explicit skill-style invocation in your setup, point it at:

- `skills/design-to-code-runner`

The skill should remain a thin execution layer. The repository files are still the source of truth.

## Completion Standard

Claude Code should not mark the task complete until all of these exist:

- final implementation
- final implementation spec
- final component map
- completed acceptance checklist

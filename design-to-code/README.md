# Agent-Agnostic Design-to-Code

A minimal, open, repository-first scaffold for turning design intent into code with less drift across design tools, coding agents, and sessions.

This repository is not a page generator.
It is a workflow scaffold for teams or solo builders who want a stable middle layer between design input and implementation.

## Why This Exists

Most design-to-code failures are not caused only by lack of visual access.
They happen because there is no stable execution layer between:

`design input -> implementation spec -> component mapping -> execution -> acceptance`

Without that layer:

- agents improvise
- repo defaults override design intent
- the same input produces different outputs
- fidelity is judged by vibe instead of evidence

## Core Rule

- Raw design input is evidence.
- The implementation spec is the execution truth.
- The component map controls how design semantics land in the codebase.
- A task is not complete until it passes acceptance.

## Repository Structure

```text
.
├── AGENTS.md
├── LICENSE
├── README.md
├── docs/
│   ├── agent-entry/
│   └── architecture.md
├── examples/
│   └── marketing-homepage-hero/
├── skills/
│   └── design-to-code-runner/
├── specs/
│   ├── component-map.template.json
│   └── implementation-spec.template.yaml
├── templates/
│   └── acceptance-checklist.md
└── workflows/
    └── agent-execution-sop.md
```

## Start Here

1. Read `AGENTS.md`
2. Read `docs/architecture.md`
3. Copy `specs/implementation-spec.template.yaml` into a task-specific spec file
4. Copy `specs/component-map.template.json` into a task-specific mapping file
5. Copy `templates/acceptance-checklist.md` into a task-specific checklist
6. Follow `workflows/agent-execution-sop.md`

If your agent environment supports skills, use the included skill at `skills/design-to-code-runner` as the thin execution layer. The repository files remain the source of truth.

For minimal agent-specific launch points, see:

- `docs/agent-entry/claude-code.md`
- `docs/agent-entry/cursor.md`
- `docs/agent-entry/openclaw.md`

## Recommended Task Flow

1. Gather design input from any tool
2. Fill the implementation spec
3. Fill the component map
4. Implement against the spec
5. Review against the acceptance checklist
6. Revise until acceptable

## What "Testing" Means In This Repo

This repository is a workflow scaffold, so the main test is operational:

- can a real task be expressed cleanly in the spec?
- can an agent implement from the spec instead of the screenshot?
- can the acceptance checklist catch drift?

Use your product repo's normal checks for implementation validation:

- local preview
- responsive inspection
- screenshot comparison
- automated tests
- manual design review

## First Example

See `examples/marketing-homepage-hero/` for a filled sample task that shows:

- a realistic implementation spec
- a realistic component map
- a realistic acceptance checklist

## Who This Is For

- solo builders using Codex, Claude Code, Cursor, or other agents
- teams that want repository-first execution instead of prompt-only workflows
- codebases where design fidelity matters and generic output is costly

## License

MIT. See `LICENSE`.

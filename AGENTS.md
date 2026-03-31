# AGENTS.md

This repository uses a repository-first design-to-code workflow.

## Execution Order

Every coding agent should follow this order:

1. Read `docs/architecture.md`
2. Read `specs/implementation-spec.template.yaml`
3. Read `specs/component-map.template.json`
4. Read `workflows/agent-execution-sop.md`
5. Use `templates/acceptance-checklist.md` as the completion gate

If your environment supports skills, prefer using the repository skill at:

- `skills/design-to-code-runner`

## Non-Negotiable Rules

1. Do not implement directly from screenshots alone.
2. Treat the implementation spec as the source of execution truth.
3. Do not silently substitute components.
4. Record assumptions and open questions inside the task spec.
5. Do not mark work complete without acceptance evidence.

## What To Produce For Each Task

At minimum, each design-driven task should have:

- one filled implementation spec
- one filled component map
- one acceptance checklist

These may live in the target product repo wherever the team prefers, but the structure should stay compatible with these templates.

## Why This Exists

This file reduces agent variability. Different agents may reason differently, but they should all execute the same repository workflow.

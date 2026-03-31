# Cursor Entry

Use this file as the minimal entry point for Cursor.

## Goal

Make Cursor start from repository rules and task specs instead of default editor habits or generic UI priors.

## Recommended Workspace Rule

If you use Cursor rules, keep the rule thin and point back to repository files.

Suggested rule text:

```text
For design-to-code tasks, do not implement directly from screenshots or vague design descriptions.
Read AGENTS.md, docs/architecture.md, workflows/agent-execution-sop.md, and the task-local implementation spec, component map, and acceptance checklist first.
Treat the implementation spec as the execution truth.
Do not silently substitute components.
Do not mark work complete until the acceptance checklist is satisfied.
```

## Read Order

Cursor should read:

1. `AGENTS.md`
2. `docs/architecture.md`
3. task-local `implementation-spec.yaml`
4. task-local `component-map.json`
5. `workflows/agent-execution-sop.md`
6. task-local `acceptance-checklist.md`

## Recommended Task Prompt

```text
Implement this design task using the repository workflow.

Read first:
- AGENTS.md
- docs/architecture.md
- workflows/agent-execution-sop.md
- <path-to-implementation-spec.yaml>
- <path-to-component-map.json>
- <path-to-acceptance-checklist.md>

Requirements:
- spec first, code second
- no silent component substitutions
- update task files when implementation changes the agreed plan
- complete the acceptance loop before finishing
```

## Notes For Cursor

- Keep long policy out of ad hoc prompts; store it in repo files.
- Prefer task-local files over repo templates once task files exist.
- If a task is underspecified, create or repair the spec before coding.

## Completion Standard

Cursor should finish only when the shipped code still matches:

- the task spec
- the component map
- the acceptance checklist outcome

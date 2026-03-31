# Task Artifacts

Use this reference when creating, validating, or repairing task-local files.

## Minimum artifact set

Each task should have:

- `implementation-spec.yaml`
- `component-map.json`
- `acceptance-checklist.md`

## Minimum completeness rules

### Implementation spec

Must define:

- task scope
- design intent
- semantic structure
- key components
- responsive behavior
- interaction states
- acceptance checks
- assumptions or open questions

### Component map

Must define:

- mapping for every key spec component
- reuse vs primitive vs new component choice
- rationale for sensitive mappings
- forbidden substitutions for risky elements

### Acceptance checklist

Must define:

- structural review points
- component fidelity review points
- visual review points
- responsive review points
- interaction review points
- evidence expectations

## Update rule

If implementation changes the agreed structure, behavior, or mapping, update the task artifacts in the same task, not later.

## Bootstrap helper

If the repository contains:

- `specs/implementation-spec.template.yaml`
- `specs/component-map.template.json`
- `templates/acceptance-checklist.md`

You can run:

```bash
python3 skills/design-to-code-runner/scripts/bootstrap_task.py \
  --repo-root /path/to/repo \
  --task-dir /path/to/repo/tasks/my-task
```

This creates task-local copies using the scaffold naming convention.

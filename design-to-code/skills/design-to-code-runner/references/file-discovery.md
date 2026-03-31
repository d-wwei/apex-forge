# File Discovery

Use this reference when a repository does not follow the exact scaffold paths.

## Canonical files to look for

- agent rules file:
  - `AGENTS.md`
- architecture or system rationale:
  - `docs/architecture.md`
  - `docs/design-to-code.md`
  - `docs/design-system.md`
- task spec:
  - `implementation-spec.yaml`
  - `*.spec.yaml`
- component map:
  - `component-map.json`
  - `component-map.yaml`
- SOP:
  - `workflows/agent-execution-sop.md`
  - `docs/workflow.md`
- acceptance:
  - `acceptance-checklist.md`
  - `qa-checklist.md`

## Search strategy

1. Check the repo root and `docs/`, `specs/`, `templates/`, `tasks/`, `examples/`.
2. Search by file name first.
3. Search by concepts second:
   - `implementation spec`
   - `component map`
   - `acceptance checklist`
   - `design-to-code`
4. If multiple candidates exist, prefer:
   - task-local files over templates
   - explicit execution files over narrative docs
   - current repo conventions over this skill's defaults

## Fallback rule

If no task-specific files exist, use the repository templates or create them from templates before coding.

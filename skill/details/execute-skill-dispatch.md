---
parent: skill/stages/execute.md
section: Skill Dispatch + Artifact Output
---

# Execute: Skill Dispatch (Detail)

## Skill Dispatch Flow

When the current task matches a trigger in `bindings.yaml`, load and invoke the corresponding external skill.

1. Identify current task type (debugging, frontend, QA, design-to-code, etc.)
2. Read `bindings.yaml` → find matching entries under `execute:`
3. Sort by `priority` (lower number = higher priority)
4. For `concurrent: false` skills: execute sequentially, wait for completion
5. For `concurrent: true` skills: may run in parallel with other concurrent skills
6. After skill completes: validate output against `output_schema`
7. Map result to AF state using `mapping` rules (evidence grade, escalation action)
8. Record invocation in `.apex/state.json` → `skill_invocations[]`
9. Continue AF pipeline

**Schema mismatch handling:** If skill output does not match `output_schema`, log a warning and require the agent to manually confirm the mapping result.

### Invocation Trace Format

```json
{
  "stage": "execute",
  "skill": "<skill-name>",
  "version": "<skill-version>",
  "timestamp": "<ISO-8601>",
  "output_status": "<skill output status>",
  "af_mapping": "<mapped AF evidence grade or action>"
}
```

---

## Artifact Output

Write execution log to `docs/execution/{name}-log.md` with frontmatter
including title, source plan link, status, dates, and task counts.

The document includes:
- Task progress table
- Verification evidence per task
- Issues encountered
- Deviations from plan (with rationale)

After all tasks are done, register with:
`apex task create --stage execute --artifact docs/execution/{name}-log.md`

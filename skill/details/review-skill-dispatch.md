---
parent: skill/stages/review.md
---

# Review Skill Dispatch — Full Protocol

## 10-Step Flow

1. Analyze the diff to determine which review triggers apply (code review, security, frontend visual, product UX).
2. Read `bindings.yaml` → find matching entries under `review:`.
3. Sort by `priority` (lower number = higher priority).
4. For `concurrent: false` skills: execute sequentially.
5. For `concurrent: true` skills: may run in parallel.
6. **Design review special flow** (two-layer):
   a. First: run `gates/design-baseline.md` (AF-owned, objective checks).
   b. If baseline fails → REJECTED, return to Execute. Do NOT proceed to layer 2.
   c. If baseline passes → load `/tasteful-frontend` for subjective deep review.
7. After each skill completes: validate output against `output_schema`.
8. Map result to AF review state using `mapping` rules.
9. Record invocation in `.apex/state.json` → `skill_invocations[]`.
10. Aggregate all skill verdicts into final review status.

## Invocation Trace Format

Record each skill invocation in `.apex/state.json`:

```json
{
  "stage": "review",
  "skill": "<skill-name>",
  "version": "<skill-version>",
  "timestamp": "<ISO-8601>",
  "output_status": "<skill verdict>",
  "af_mapping": "<mapped AF review result>"
}
```

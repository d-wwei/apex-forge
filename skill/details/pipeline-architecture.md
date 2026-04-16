# Pipeline Architecture — Detailed Reference

## Backbone + Sidecar

**Backbone** (hard-gated, mandatory): Protects quality baselines that apply to ALL code changes.
```
Brainstorm → Plan → Execute → Review → Ship → [Compound: prompted]
```

**Sidecar** (conditional, mounted on backbone stages): Activated by task characteristics via `bindings.yaml`.
- Execute sidecars: Design sub-flow, Browser QA, ...
- Review sidecars: Design baseline gate, Security audit, SQL safety, ...

Sidecar characteristics:
- Trigger condition not met → sidecar does not run (not a hard gate)
- Can be added/removed without touching backbone definition
- Declared in `bindings.yaml`, not hardcoded in Phase Discipline

---

## Stage Gates: Exit + Entry Verification

Each stage has two automated quality checks run by SubAgents:

### Exit Gate (at `apex stage complete <stage>`)

Dispatches SubAgents per `gates/stage-exit-gate.md` to validate output artifact quality.
Two layers: structural (binary, 1 SubAgent) → substance (qualitative, N SubAgents parallel).

| Tier / Scope | Structural | Substance | Evidence Grade |
|-------------|-----------|-----------|----------------|
| Tier 1 / Lightweight | 1 SubAgent | 1 SubAgent | E2 |
| Tier 2 / Standard | 1 SubAgent | 2 SubAgents | E3 |
| Tier 3 / Deep | 1 SubAgent | 3 SubAgents | E3+ |

**Substance confidence aggregation:**
- All agree + high confidence → PASS (DONE)
- Majority agree + medium+ → PASS_WITH_NOTE (DONE_WITH_CONCERNS)
- No majority or low confidence → ESCALATE (NEEDS_CONTEXT)
- Any P0 + high confidence → BLOCK (BLOCKED)

### Upstream Entry Verification (BEFORE `apex stage set <stage>`)

Inline check (no SubAgent). Verifies previous stage's artifact exists and is structurally complete.
Run upstream check first. Only call `apex stage set` after all checks pass. This prevents Dashboard
from showing a stage the agent hasn't actually entered.

| Stage | Upstream Artifact Required |
|-------|--------------------------|
| Brainstorm | None (first stage) |
| Plan | Brainstorm requirements with `status: approved` |
| Execute | Plan with `status: approved` + tasks registered |
| Review | All tasks `done` + execution log exists + tests pass |
| Ship | Review artifact with status DONE or DONE_WITH_CONCERNS |
| Compound | Git commit exists + review artifact confirmed |

Gate procedure: `gates/stage-exit-gate.md`. Per-stage checklists: each stage file's "Exit Gate" section.

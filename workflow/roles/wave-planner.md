---
name: apex-forge-wave-planner
description: Specialized subagent for wave-level planning — system mapping, scope definition, risk identification
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Wave Planner Role Preamble
source "$PLUGIN_ROOT/hooks/state-helper"

echo "=== APEX WAVE PLANNER ==="
apex_set_stage "wave-planner"
apex_ensure_dirs

# Ensure wave directory exists
WAVE_DIR=".apex/waves"
mkdir -p "$WAVE_DIR"

# Determine next wave number
LAST_WAVE=$(ls "$WAVE_DIR"/wave-*.json 2>/dev/null | sort -V | tail -1 | grep -oP '\d+')
NEXT_WAVE=$((${LAST_WAVE:-0} + 1))
echo "[apex] Next wave number: $NEXT_WAVE"

# Check for system map
if [ -f ".apex/MAP.md" ]; then
  echo "[apex] System map found at .apex/MAP.md"
  MAP_EXISTS="true"
else
  echo "[apex] WARNING: No system map found. Phase 0 mapping should run first."
  MAP_EXISTS="false"
fi

# Check for assumption registry
if [ -f ".apex/assumptions.json" ]; then
  echo "[apex] Assumption registry found"
else
  echo "[apex] No assumption registry — will create one"
  echo '{"assumptions":[],"disproven":[],"confirmed":[]}' > ".apex/assumptions.json"
fi

echo "NEXT_WAVE=$NEXT_WAVE"
echo "MAP_EXISTS=$MAP_EXISTS"
```

# Wave Planner

> apex-forge / workflow / roles / wave-planner
>
> Plan the next wave of work in a Tier 3 project. Identify scope, risks,
> unknowns, and success criteria before any execution begins.

---

## Entry Conditions

1. The project has been classified as **Tier 3** by the Complexity Router.
2. System map (`MAP.md`) should exist. If not, run Phase 0 mapping first.
3. If this is Wave 2+, previous wave outcomes must be reviewed first.

---

## Inputs

| Input | Location | Required |
|-------|----------|----------|
| System map | `.apex/MAP.md` | Yes (create if missing) |
| Previous wave outcomes | `.apex/waves/wave-{N-1}.json` | If Wave 2+ |
| Assumption registry | `.apex/assumptions.json` | Auto-created |
| Project context | `.apex/state.json`, task list | Yes |

---

## Planning Process

### Step 1: Review System Map

Read `.apex/MAP.md` and identify:
- Which areas have been addressed by previous waves
- Which areas remain untouched
- Which areas have the highest value-to-risk ratio
- Any new information that invalidates the current map

If the map is stale or incomplete, update it before proceeding.

### Step 2: Define Wave Scope

A wave is 3-5 rounds. Each round follows round-based-execution. Scope must be:
- **Coherent**: all rounds in the wave serve one goal
- **Completable**: achievable within 3-5 rounds (not aspirational)
- **Verifiable**: has clear success criteria that can be tested
- **Independent**: does not require Wave N+1 to deliver value

Define:
- **Wave goal**: one sentence describing what this wave delivers
- **Rounds**: 3-5 planned rounds, each with a clear objective
- **Deliverables**: concrete artifacts produced by the wave
- **Dependencies**: what must exist before this wave starts

### Step 3: Identify Risks and Unknowns

For each identified risk:
- **What could go wrong**: specific failure scenario
- **Likelihood**: low / medium / high
- **Impact**: low / medium / high / critical
- **Mitigation**: how to reduce or handle the risk
- **Clarify round needed?**: if yes, add a clarify round to the wave plan

Unknowns that cannot be mitigated must become clarify rounds (placed early in the wave).

### Step 4: Define Success Criteria

Each wave must have explicit success criteria:
- At least one must be automatically verifiable (test passes, build succeeds)
- Include both "done" criteria and "done well" criteria
- Define what "blocked" looks like — when should the wave stop and re-plan?

### Step 5: Write Wave Plan

Create `.apex/waves/wave-{N}.json`:

```json
{
  "wave": N,
  "goal": "One sentence wave goal",
  "status": "planned",
  "created_at": "ISO timestamp",
  "scope": {
    "area": "Which system area this wave addresses",
    "boundaries": ["What is IN scope", "What is OUT of scope"]
  },
  "rounds": [
    {
      "round": 1,
      "type": "clarify | build | test | integrate | fix",
      "objective": "What this round achieves",
      "inputs": ["What it needs"],
      "outputs": ["What it produces"],
      "status": "pending"
    }
  ],
  "risks": [
    {
      "description": "What could go wrong",
      "likelihood": "low | medium | high",
      "impact": "low | medium | high | critical",
      "mitigation": "How to handle it"
    }
  ],
  "success_criteria": [
    "Criterion 1 (auto-verifiable)",
    "Criterion 2"
  ],
  "dependencies": ["What must exist before starting"],
  "carry_forward": ["Items from previous wave that need attention"]
}
```

---

## Handoff to Wave Challenger

After writing the wave plan, invoke `apex-wave-challenger` to stress-test it.
Do NOT proceed to execution until the challenger has reviewed the plan.

If the challenger flags Critical issues, revise the plan and re-submit.

---

## Completion Status

| Status | Condition |
|--------|-----------|
| **DONE** | Wave plan written, ready for challenger review |
| **DONE_WITH_CONCERNS** | Wave plan written but contains high-risk items or unresolved unknowns |
| **BLOCKED** | No system map exists and cannot be created |
| **NEEDS_CONTEXT** | Previous wave outcomes missing or incomplete |

---

## Register and Report

```bash
source "$PLUGIN_ROOT/hooks/state-helper"
apex_add_artifact "wave-plan" ".apex/waves/wave-${NEXT_WAVE}.json"
```

Then report:

> **Wave {N} planned.** {round_count} rounds scoped.
> {risk_count} risks identified. Ready for challenger review.

---
name: apex-forge-wave-worker
description: Execution subagent that runs rounds within a wave, tracking state across iterations
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Wave Worker Role Preamble
source "$PLUGIN_ROOT/hooks/state-helper"

echo "=== APEX WAVE WORKER ==="
apex_set_stage "wave-worker"
apex_ensure_dirs

# Find the active wave
WAVE_DIR=".apex/waves"
ACTIVE_WAVE=""

for plan in $(ls "$WAVE_DIR"/wave-*.json 2>/dev/null | sort -V); do
  # Skip challenge files
  [[ "$plan" == *-challenges.json ]] && continue
  STATUS=$(grep -o '"status":\s*"[^"]*"' "$plan" | head -1 | grep -oP '"[^"]*"$' | tr -d '"')
  if [ "$STATUS" = "in_progress" ] || [ "$STATUS" = "planned" ]; then
    ACTIVE_WAVE="$plan"
    break
  fi
done

if [ -z "$ACTIVE_WAVE" ]; then
  echo "[apex] No active wave found."
  echo "ACTIVE_WAVE=none"
else
  echo "[apex] Active wave: $ACTIVE_WAVE"
  echo "ACTIVE_WAVE=$ACTIVE_WAVE"
fi

# Check for assumption registry
if [ -f ".apex/assumptions.json" ]; then
  echo "[apex] Assumption registry loaded"
fi
```

# Wave Worker

> apex-forge / workflow / roles / wave-worker
>
> Execute rounds within a wave. Track state, update assumptions,
> manage carry-forward items, and know when to stop.

---

## Entry Conditions

1. A wave plan exists with `status: "planned"` or `status: "in_progress"`.
2. If the wave has a challenges file, verify verdict is `PASS` (not `REVISE` or `BLOCK`).
3. If `ACTIVE_WAVE=none`: abort and tell the user to run wave-planner first.

---

## Execution Process

### Step 1: Load Wave Plan

Read the wave plan from `.apex/waves/wave-{N}.json`:
- Parse the rounds array
- Identify which rounds are `pending` vs `completed` vs `blocked`
- Set wave status to `in_progress` if currently `planned`

### Step 2: Execute Rounds

For each pending round, in order:

1. **Pre-round check**:
   - Are this round's input dependencies satisfied?
   - Are there any blocking challenges unresolved?
   - Has any assumption been disproven that affects this round?
   - If blocked on any check: skip to escalation (Step 5)

2. **Execute using round-based-execution protocol**:
   - Plan phase: define what this round does (from wave plan)
   - Do phase: execute the work
   - Check phase: verify outputs match expected results
   - Act phase: decide if complete or needs iteration

3. **Post-round update**:
   - Update round status in wave plan (`completed` | `blocked` | `failed`)
   - Record round outcome (what was done, what was produced)
   - Update assumption registry with any confirmed or disproven assumptions
   - Identify carry-forward items for the next round

4. **State persistence**: Write updated wave state after EVERY round.
   Do not batch updates. A crash between rounds must not lose state.

### Step 3: Track Assumptions

After each round, review the assumption registry:

```json
{
  "assumptions": [
    {
      "id": "A1",
      "statement": "The API returns paginated results",
      "status": "unverified | confirmed | disproven",
      "evidence": "What confirmed or disproved it",
      "affected_rounds": [2, 3],
      "updated_at": "ISO timestamp"
    }
  ]
}
```

Rules:
- If an assumption is **confirmed**: mark it and continue
- If an assumption is **disproven**: STOP execution immediately
- Disproven assumptions trigger re-planning (escalate to wave-planner)

### Step 4: Manage Carry-Forward

Items that are not blockers but need attention in future rounds:
- Technical debt introduced during the round
- Edge cases identified but not handled
- TODOs that are out of scope for the current round
- Observations about system behavior

Write carry-forward to the wave state:

```json
{
  "carry_forward": [
    {
      "from_round": 2,
      "item": "Error handling for timeout case not implemented",
      "priority": "must | should | could",
      "target_round": 4
    }
  ]
}
```

### Step 5: Escalation

If execution is blocked, do NOT try to work around it. Escalate:

| Situation | Action |
|-----------|--------|
| Round blocked by missing dependency | Escalate to wave-planner for re-scoping |
| Assumption disproven | Stop, update registry, escalate to wave-planner |
| Round exceeds 2 iterations without progress | Stop, document what was tried, escalate |
| Scope discovered to be larger than planned | Stop, flag scope creep, escalate |
| External blocker (service down, access needed) | Document, mark round as blocked, skip to next if independent |

---

## Hard Rules

- **Max 5 rounds per wave.** If the wave needs more, it was scoped wrong. Escalate.
- **No silent failures.** Every round must produce either a success artifact or a failure report.
- **No assumption drift.** If reality diverges from the plan, stop and re-plan. Do not adapt silently.
- **State survives crashes.** Write state after every round, not at the end.
- **One round at a time.** Do not start round N+1 until round N is fully resolved.

---

## Wave Completion

When all rounds are complete (or the wave is stopped):

1. Update wave status: `completed` | `blocked` | `failed`
2. Write wave summary:

```json
{
  "wave": N,
  "status": "completed",
  "completed_at": "ISO timestamp",
  "rounds_completed": M,
  "rounds_total": K,
  "outcomes": ["What was achieved"],
  "carry_forward": ["Items for the next wave"],
  "assumptions_confirmed": ["A1", "A3"],
  "assumptions_disproven": ["A2"],
  "lessons": ["What we learned"]
}
```

3. If there are carry-forward items, they become inputs for wave-planner on the next wave.

---

## Completion Status

| Status | Condition |
|--------|-----------|
| **DONE** | All rounds completed, wave goal achieved |
| **DONE_PARTIAL** | Some rounds completed, wave partially achieved, carry-forward items exist |
| **BLOCKED** | Cannot proceed without re-planning or external input |
| **FAILED** | Critical assumption disproven or unrecoverable error |

---

## Register and Report

```bash
source "$PLUGIN_ROOT/hooks/state-helper"
apex_add_artifact "wave-outcome" ".apex/waves/wave-${WAVE}.json"
```

Then report:

> **Wave {N} {status}.** {completed}/{total} rounds executed.
> {carry_forward_count} items carried forward.
> {If BLOCKED or FAILED: "Escalation required: {reason}"}

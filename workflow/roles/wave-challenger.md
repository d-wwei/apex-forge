---
name: apex-forge-wave-challenger
description: Adversarial subagent that stress-tests wave plans before execution
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Wave Challenger Role Preamble
source "$PLUGIN_ROOT/hooks/state-helper"

echo "=== APEX WAVE CHALLENGER ==="
apex_set_stage "wave-challenger"
apex_ensure_dirs

# Find the latest wave plan to challenge
WAVE_DIR=".apex/waves"
LATEST_PLAN=$(ls "$WAVE_DIR"/wave-*.json 2>/dev/null | sort -V | tail -1)

if [ -z "$LATEST_PLAN" ]; then
  echo "[apex] ERROR: No wave plan found to challenge."
  echo "PLAN_FOUND=false"
else
  echo "[apex] Challenging: $LATEST_PLAN"
  echo "PLAN_FOUND=true"
  echo "PLAN_PATH=$LATEST_PLAN"
fi
```

# Wave Challenger

> apex-forge / workflow / roles / wave-challenger
>
> Adversarial review of wave plans. Stress-test assumptions, dependencies,
> and scope before any execution resources are committed.

---

## Entry Conditions

1. A wave plan exists at `.apex/waves/wave-{N}.json` with `status: "planned"`.
2. The plan was produced by `apex-wave-planner` or equivalent process.
3. If `PLAN_FOUND=false`: abort and tell the user to run wave-planner first.

---

## Challenge Techniques

Apply ALL four techniques to the wave plan. Do not skip any.

### 1. Assumption Inversion

For each assumption the plan relies on (explicit or implicit):
- State the assumption clearly
- Invert it: "What if this assumption is **wrong**?"
- Assess the consequence: does the wave plan survive?
- If the plan collapses when a single assumption is wrong, that assumption is a **Critical** risk

Common hidden assumptions:
- "The existing API is stable and documented"
- "Tests cover the area we are modifying"
- "The team/user has agreed on the requirements"
- "The dependency will behave as expected"
- "This can be done in the estimated number of rounds"

### 2. Dependency Analysis

Map the critical path through the wave's rounds:
- Which rounds depend on outputs of earlier rounds?
- What is the longest dependency chain?
- If round N fails, which subsequent rounds are blocked?
- Are there any circular dependencies?
- Can any rounds be parallelized instead of sequential?

Flag:
- **Single points of failure**: one round whose failure blocks everything
- **Late integration**: integration happening in the last round (high risk)
- **Missing validation**: outputs consumed without verification

### 3. Scope Creep Detection

Evaluate the wave's boundaries:
- Count the number of distinct concerns the wave addresses
- If more than 2 major concerns: flag as **overloaded**
- Check each round's objective — does it serve the wave goal, or is it tangential?
- Look for "while we are here" items that expand scope
- Estimate: can each round realistically complete in one session?

Scope rules:
- A wave should have ONE goal, not a list of goals
- If the goal contains "and" or "also", it is probably two waves
- 3-5 rounds is the budget — if the plan needs 6+, it must be split

### 4. Risk Amplification

For each risk in the plan:
- What is the **worst realistic case** (not worst imaginable)?
- What is the **cascade effect** — does this risk trigger other risks?
- Is the mitigation actually actionable, or is it vague ("be careful")?
- What is the **detection signal** — how would you know this risk is materializing?

For risks NOT in the plan:
- External dependency failure (API down, service unavailable)
- Data migration or state corruption
- Performance regression under load
- Security implications of the changes

---

## Challenge Output

Write challenges to `.apex/waves/wave-{N}-challenges.json`:

```json
{
  "wave": N,
  "challenged_at": "ISO timestamp",
  "verdict": "PASS | REVISE | BLOCK",
  "challenges": [
    {
      "id": "C1",
      "technique": "assumption-inversion | dependency-analysis | scope-creep | risk-amplification",
      "severity": "info | warning | critical",
      "title": "Short description",
      "detail": "Full explanation of the concern",
      "recommendation": "Specific action to address this",
      "affects_rounds": [1, 3]
    }
  ],
  "summary": {
    "total": N,
    "critical": N,
    "warning": N,
    "info": N
  }
}
```

---

## Verdict Rules

| Verdict | Condition |
|---------|-----------|
| **PASS** | No critical challenges. Warnings are acceptable with noted mitigations. |
| **REVISE** | 1+ critical challenges that can be addressed by modifying the plan. Return to wave-planner. |
| **BLOCK** | Fundamental issues that require re-scoping or more information before planning can continue. |

**Hard rule**: If ANY challenge has `severity: "critical"`, the verdict CANNOT be `PASS`.

---

## Completion Status

| Status | Condition |
|--------|-----------|
| **DONE** | All four techniques applied, challenges written, verdict issued |
| **BLOCKED** | No wave plan found to challenge |
| **NEEDS_CONTEXT** | Wave plan is incomplete or missing required fields |

---

## Register and Report

```bash
source "$PLUGIN_ROOT/hooks/state-helper"
apex_add_artifact "wave-challenges" ".apex/waves/wave-${WAVE}-challenges.json"
```

Then report:

> **Wave {N} challenged.** Verdict: {PASS|REVISE|BLOCK}.
> {critical_count} critical, {warning_count} warnings, {info_count} informational.
> {If REVISE or BLOCK: "Plan must be revised before execution."}

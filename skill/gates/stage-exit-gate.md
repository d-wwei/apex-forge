---
name: stage-exit-gate
description: SubAgent-based quality gate for stage completion. Two-layer checks (structural + substance) with confidence aggregation.
---

# Stage Exit Gate

Runs before `apex stage complete <stage>`. Dispatches SubAgents to validate
the stage's output artifact. The main agent does NOT perform these checks
itself — it dispatches, reads the verdict, and acts on it.

---

## Architecture

```
apex stage complete <stage>
  ↓
Layer 1: Structural Check (1 SubAgent)
  → Binary pass/fail per checklist item
  → ANY fail → BLOCKED (list missing items, do not proceed to Layer 2)
  ↓ ALL pass
Layer 2: Substance Check (N SubAgents, parallel, independent)
  → Each evaluates qualitative prompts independently
  → Each returns: verdict + confidence + findings
  → Agents CANNOT see each other's conclusions (independence requirement)
  ↓
Aggregate substance verdicts (confidence voting)
  ↓
Main Agent reads final verdict → proceed / fix / escalate
```

---

## Tier Scaling

The number of substance SubAgents scales with task complexity.
Read scope from brainstorm artifact frontmatter or `.apex/state.json`.
If scope is unknown, default to **Standard**.

| Tier / Scope | Structural | Substance | Total SubAgents | Evidence Grade |
|-------------|-----------|-----------|-----------------|----------------|
| Tier 1 / Lightweight | 1 | 0 | 1 | E2 (single source) |
| Tier 2 / Standard | 1 | 2 | 3 | E3 (multi-source) |
| Tier 3 / Deep | 1 | 3 | 4 | E3+ (strong multi-source) |

---

## Procedure

### Step 1: Determine Tier

```bash
# Option A: read from brainstorm artifact frontmatter
grep "scope:" docs/brainstorms/*-requirements.md | head -1

# Option B: read from .apex/state.json
apex status --json | jq '.scope // "Standard"'
```

If neither source has a scope value, use **Standard** (Tier 2).

### Step 2: Dispatch Structural Check (1 SubAgent)

Dispatch one SubAgent with the **Structural Check Template** (below).
Input: the stage's structural checklist from the stage file's "Exit Gate" section.

Wait for result. Parse the JSON output.

- **ALL items pass** → proceed to Step 3.
- **ANY item fails** → report failed items to user. Status: **BLOCKED**.
  Do NOT dispatch substance checks. The agent must fix the missing items
  and re-run the gate.

### Step 3: Dispatch Substance Checks (parallel SubAgents)

**Skip this step for Tier 1 / Lightweight.** Tier 1 exits after structural check.

Dispatch N SubAgents (2 for Standard, 3 for Deep) with the **Substance Check Template**.
Each SubAgent receives the same qualitative prompts from the stage file's "Exit Gate" section.

**Independence requirement**: Dispatch all SubAgents in a single parallel batch.
Do NOT share one SubAgent's output with another. Each evaluates independently.

Each SubAgent returns:
```json
{
  "verdict": "PASS | CONCERN | BLOCK",
  "confidence": "high | medium | low",
  "findings": [
    {
      "prompt_id": "Q1",
      "assessment": "...",
      "evidence": "file:line or specific quote",
      "severity": "P0 | P1 | P2 | P3"
    }
  ]
}
```

### Step 4: Aggregate Substance Verdicts

Count verdicts across all substance SubAgents:

| Condition | Aggregated Verdict | Maps To |
|-----------|--------------------|---------|
| All PASS + all high confidence | **PASS** | DONE |
| Majority PASS + average confidence >= medium | **PASS_WITH_NOTE** | DONE_WITH_CONCERNS |
| No majority OR all low confidence | **ESCALATE** | NEEDS_CONTEXT |
| Any BLOCK with high confidence | **BLOCK** | BLOCKED |
| Any finding with severity P0 + high confidence | **BLOCK** | BLOCKED |

Definitions:
- **Majority** = > 50% of substance SubAgents agree on verdict direction.
- **Average confidence**: high=3, medium=2, low=1. Average of majority group >= 2.0 = medium.
- **P0 override**: A single high-confidence P0 finding blocks regardless of other verdicts.
- **2-agent tie** (Standard tier): With 2 SubAgents, any disagreement = 50-50 split = no majority = ESCALATE. This is intentional — disagreement between two independent evaluators signals genuine ambiguity that warrants user input.

### Step 5: Render Final Gate Verdict

| Structural | Substance | Final Verdict | Action |
|-----------|-----------|---------------|--------|
| FAIL | (not run) | **BLOCKED** | Fix structural issues. Re-run gate. |
| PASS | PASS | **PASS** | `apex stage complete` proceeds. |
| PASS | PASS_WITH_NOTE | **PASS_WITH_NOTE** | Proceeds. Notes appended to stage artifact. |
| PASS | ESCALATE | **ESCALATE** | Present findings to user. User decides: fix or override. |
| PASS | BLOCK | **BLOCKED** | Fix substance issues. Re-run gate. |
| PASS | (Tier 1: skipped) | **PASS** | `apex stage complete` proceeds. |

### Step 6: Record Gate Result

```bash
apex trace-skill <stage> stage-exit-gate 1.0.0 <verdict> af_gate:<mapped_status>
```

Example:
```bash
apex trace-skill review stage-exit-gate 1.0.0 PASS af_gate:DONE
apex trace-skill compound stage-exit-gate 1.0.0 BLOCK af_gate:BLOCKED
```

---

## SubAgent Prompt Templates

### Structural Check Template

```
You are a structural quality checker for the {stage} stage of an apex-forge pipeline.

Your job: verify that the stage's output artifact meets structural requirements.
Check each item. Report binary pass/fail with evidence.

**Artifact path**: {artifact_path}
**Additional files to check**: {additional_paths}

**Checklist**:
{checklist_items}

For each item, report:
- Item ID (S1, S2, ...)
- pass or fail
- Evidence: what you found (quote or observation)

Output as JSON:
{{
  "items": [
    {{"id": "S1", "result": "pass|fail", "evidence": "..."}},
    ...
  ],
  "overall": "PASS|FAIL",
  "failed_items": ["S2", "S5"]
}}

Do NOT evaluate quality or depth. Only check structural presence.
```

### Substance Check Template

```
You are an independent quality evaluator for the {stage} stage of an apex-forge pipeline.
You are SubAgent #{agent_id} of {total_agents}. You cannot see other evaluators' conclusions.

Your job: evaluate whether the stage's output artifact meets substance quality standards.
For each prompt below, assess honestly. Back every assessment with specific evidence.

**Artifact path**: {artifact_path}
**Cross-reference files**: {cross_reference_files}

**Evaluation prompts**:
{qualitative_prompts}

For each prompt, report:
- Prompt ID (Q1, Q2, ...)
- verdict: PASS (genuinely meets the bar), CONCERN (marginal, has issues), BLOCK (clearly inadequate)
- confidence: high (clear evidence either way), medium (some ambiguity), low (hard to tell)
- evidence: specific file:line, quote, or observation
- severity: P0 (if a blocking issue is found) | P1 | P2 | P3

Output as JSON:
{{
  "verdict": "PASS|CONCERN|BLOCK",
  "confidence": "high|medium|low",
  "findings": [
    {{"prompt_id": "Q1", "assessment": "...", "verdict": "PASS|CONCERN|BLOCK", "confidence": "high|medium|low", "evidence": "...", "severity": "P2"}},
    ...
  ]
}}

Your overall verdict is the WORST of your per-prompt verdicts.
Your overall confidence is the LOWEST of your per-prompt confidences.
Be honest. Rubber-stamping is a protocol violation.
```

---

## Anti-Patterns

| Anti-Pattern | Detection | Correction |
|-------------|-----------|------------|
| Rubber-stamping | All items PASS with no evidence cited | Re-run with explicit evidence requirement |
| Skipping structural | Jumping to substance without structural pass | Structural MUST pass before substance dispatches |
| Breaking independence | Sharing SubAgent A's output with SubAgent B | Dispatch all substance SubAgents in single parallel batch |
| Main agent self-checking | Main agent reads artifact and checks itself instead of dispatching | Main agent ONLY reads the verdict JSON, never the artifact |
| Ignoring ESCALATE | Treating ESCALATE as PASS | ESCALATE requires user decision — present findings and wait |
| Single-SubAgent substance | Running only 1 substance SubAgent for Tier 2/3 | Follow Tier scaling table — 2 for Standard, 3 for Deep |

---

## Integration With Stage Files

Each stage file defines its own checklist in an "Exit Gate" section:

```markdown
## Exit Gate

Before `apex stage complete {stage}`, run the Stage Exit Gate (`gates/stage-exit-gate.md`).

### Structural Checks
| # | Check | Criterion | Verification |
|---|-------|-----------|-------------|
| S1 | ... | ... | ... |

### Substance Prompts (Tier 2+)
| # | Prompt |
|---|--------|
| Q1 | ... |
```

The gate procedure reads these tables and fills the prompt templates.

---

## Extensibility

- **Adding a check**: Add one row to a stage's structural or substance table.
  The gate procedure does not change.
- **Adding a stage**: Create a new stage file with an Exit Gate section.
  Reference this gate procedure. No changes to this file needed.
- **Adjusting Tier thresholds**: Modify the Tier Scaling table above.

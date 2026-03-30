---
name: apex-forge-autoplan
description: Auto-review pipeline — runs CEO, Eng, and Design reviews sequentially with auto-decisions
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Autoplan Review Pipeline Preamble
source "$PLUGIN_ROOT/hooks/state-helper"

echo "=== APEX AUTOPLAN ==="
apex_set_stage "autoplan"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
apex_telemetry_start "autoplan"

# ---------------------------------------------------------------------------
# Locate plan to review
# ---------------------------------------------------------------------------
PLAN_FILE=""
PLANS=$(apex_find_upstream "plan")
if [ -n "$PLANS" ]; then
  PLAN_FILE=$(echo "$PLANS" | head -1)
  echo "[autoplan] Plan to review: $PLAN_FILE"
  echo "PLAN_FOUND=true"
else
  echo "[autoplan] WARNING: No plan artifacts found in docs/plans/"
  echo "PLAN_FOUND=false"
fi

# Check for brainstorm context
BRAINSTORM=$(apex_find_upstream "brainstorm")
if [ -n "$BRAINSTORM" ]; then
  echo "[autoplan] Brainstorm context available."
  echo "BRAINSTORM_FOUND=true"
else
  echo "BRAINSTORM_FOUND=false"
fi

# Detect project type for eng review
STACK_INFO="unknown"
if [ -f "package.json" ]; then
  STACK_INFO="node"
elif [ -f "pyproject.toml" ] || [ -f "requirements.txt" ]; then
  STACK_INFO="python"
elif [ -f "go.mod" ]; then
  STACK_INFO="go"
fi
echo "[autoplan] Stack: $STACK_INFO"

# Check for design system
DESIGN_FILE=""
[ -f "DESIGN.md" ] && DESIGN_FILE="DESIGN.md"
[ -f "docs/DESIGN.md" ] && DESIGN_FILE="docs/DESIGN.md"
echo "DESIGN_FILE=$DESIGN_FILE"

# Create output directory
mkdir -p ".apex/reviews"
echo "[autoplan] Output: .apex/reviews/"

apex_ensure_dirs
```

# Autoplan

> apex-forge / workflow / roles / autoplan
>
> Automated three-lens review pipeline. Runs CEO, Eng, and Design reviews
> sequentially, then auto-decides obvious issues using 6 decision principles.
> Surfaces only genuine judgment calls for the user.

---

## Entry Conditions

1. A plan document must exist (`PLAN_FOUND=true`).
2. If no plan: "No plan found. Run `/apex-plan` first."
3. Read the plan document completely before beginning the pipeline.
4. If brainstorm context exists, read it for full problem context.

---

## Pipeline Phases

Execute all three phases in order. Each phase produces findings. The auto-decision engine then triages all findings together.

### Phase 1: CEO Review (Scope and Strategy)

Apply the full `/apex-plan-ceo-review` logic in `selective-expansion` mode:

1. **Problem validation**: Is the problem real, evidenced, and worth solving?
2. **Solution fit**: Does the plan solve the stated problem?
3. **Scope discipline**: Right-sized? Pareto-optimal?
4. **Ambition check**: Is this ambitious enough to matter?
5. **Risk awareness**: Are risks identified and mitigated?

Score each CEO dimension (0-10). Record all findings with severity.

Output: list of CEO findings tagged `[CEO]`.

### Phase 2: Engineering Review (Architecture and Execution)

Apply the full `/apex-plan-eng-review` logic:

1. **Architecture**: Component structure, separation of concerns, data flow
2. **Data model**: Schema design, migrations, indexes
3. **API design**: Contracts, versioning, error handling
4. **Test strategy**: Coverage plan, edge cases, negative tests
5. **Performance**: N+1 risks, bundle size, caching
6. **Security**: Auth, input validation, data exposure
7. **Deployment**: Rollback, feature flags, monitoring

Apply the 8-files rule, 2-classes rule, and distribution check.

Output: list of eng findings tagged `[ENG]`.

### Phase 3: Design Review (UI/UX Quality)

Apply the full `/apex-plan-design-review` logic:

1. **Visual hierarchy**: Information priority and reading flow
2. **Typography**: Font choices and scale consistency
3. **Color usage**: Intentional palette with semantic consistency
4. **Spacing/layout**: Grid system and spacing tokens
5. **Responsiveness**: Multi-screen adaptation
6. **Interaction design**: State definitions and user feedback
7. **Accessibility**: Keyboard, screen reader, color independence
8. **Consistency**: Component reuse and pattern language

Score each design dimension (0-10).

Output: list of design findings tagged `[DESIGN]`.

---

## Auto-Decision Engine

After all three phases, process every finding through these 6 principles:

### Principle 1: Agreement Rule

> If two or more perspectives agree on the same issue -> auto-apply

Example: CEO says "this feature is over-scoped" AND eng says "too many files" -> auto-apply scope reduction.

**Action**: Mark as `AUTO_APPLIED`. Note the change. No user input needed.

### Principle 2: Security Escalation

> If any perspective raises a security concern -> escalate to user

Security findings are never auto-decided. Always surface.

**Action**: Mark as `ESCALATE_SECURITY`. Must reach user.

### Principle 3: Taste Default

> If the finding is purely aesthetic/taste with no functional impact -> go with the plan's direction

Example: "Should buttons be rounded or square?" with no accessibility impact.

**Action**: Mark as `PLAN_WINS`. Note the preference but do not block.

### Principle 4: Expansion Challenge

> If two or more perspectives suggest adding scope -> mark as user challenge

When both CEO and design want to expand, this is suspicious. Surface for the user to weigh in on scope creep.

**Action**: Mark as `USER_CHALLENGE`. Requires explicit approval.

### Principle 5: Split Decision

> If one perspective blocks and another passes -> present both

Example: Eng says "architecture is fine" but CEO says "not ambitious enough." Neither auto-wins.

**Action**: Mark as `SPLIT_DECISION`. Present both arguments to user.

### Principle 6: Indifference Rule

> If no perspective feels strongly about the finding -> skip

Low-severity nits that no lens cares deeply about. Do not clutter the user's decision space.

**Action**: Mark as `SKIPPED`. Log but do not surface.

---

## Decision Classification

Classify every finding from all three phases:

```markdown
| # | Finding | Source | Severity | Decision | Rationale |
|---|---------|--------|----------|----------|-----------|
| 1 | {description} | CEO | P1 | AUTO_APPLIED | CEO + Eng agree on scope reduction |
| 2 | {description} | ENG | P0 | ESCALATE_SECURITY | SQL injection risk |
| 3 | {description} | DESIGN | P3 | PLAN_WINS | Taste: button radius preference |
| 4 | {description} | CEO+DESIGN | P2 | USER_CHALLENGE | Both want feature expansion |
| 5 | {description} | ENG vs CEO | P1 | SPLIT_DECISION | Eng approves, CEO questions value |
| 6 | {description} | DESIGN | P3 | SKIPPED | Minor nit, no strong opinion |
```

---

## User Approval Gate

Present to the user only:
1. **ESCALATE_SECURITY** findings (must decide)
2. **USER_CHALLENGE** findings (expansion pressure — approve or reject)
3. **SPLIT_DECISION** findings (genuine disagreement — pick a side)

Format:

```markdown
## Decisions Needing Your Input

### Security (must decide)
{list of security findings with both arguments}

### Scope Challenges (expansion pressure)
{list with CEO and design arguments for expansion}

### Split Decisions (pick a side)
{list with both perspectives and their arguments}

---

Auto-applied: {N} findings
Plan wins (taste): {N} findings
Skipped (low priority): {N} findings
```

---

## Output: Reviewed Plan

After user decisions, produce the final reviewed plan:

1. Apply all AUTO_APPLIED changes inline
2. Apply user decisions
3. Note PLAN_WINS for the record
4. Annotate the original plan with `[AUTOPLAN]` tags where changes were made

---

## Completion Status

| Status | Condition |
|--------|-----------|
| **DONE** | All three reviews complete. All findings classified. User decisions collected. Plan updated. |
| **DONE_WITH_CONCERNS** | Reviews complete. Some SPLIT_DECISION items remain unresolved. |
| **BLOCKED** | Plan has P0 findings from 2+ perspectives. Fundamental rework needed. |
| **NEEDS_CONTEXT** | Cannot complete one or more review phases without additional information. |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```

---

## Artifact Output

Write to `.apex/reviews/{name}-autoplan-review.md`:

```markdown
---
title: "{Feature Name} Autoplan Review"
source_plan: "docs/plans/{name}-plan.md"
status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
date: YYYY-MM-DD
ceo_score: {avg}
eng_findings: {count by severity}
design_score: {avg}
auto_applied: {count}
user_decisions: {count}
skipped: {count}
stage: autoplan
apex_version: "0.1.0"
---
```

```bash
source "$PLUGIN_ROOT/hooks/state-helper"
apex_add_artifact "autoplan" ".apex/reviews/{name}-autoplan-review.md"
```

Report:

> **Autoplan review complete.** Three lenses applied.
> CEO: {avg}/10. Eng: {P0/P1/P2/P3 counts}. Design: {avg}/10.
> Auto-applied: {N}. Needs your input: {N}. Skipped: {N}.
> {If decisions needed: "Review the {N} items above and decide."}
> {If all clear: "Plan is reviewed and ready. Run `/apex-forge-execute`."}

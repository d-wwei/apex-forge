---
name: apex-forge-compound
description: Knowledge extraction — capture what was learned for future reuse
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Compound Stage Preamble
source "$PLUGIN_ROOT/hooks/state-helper"

echo "=== APEX COMPOUND STAGE ==="
apex_set_stage "compound"

# Scan for pipeline artifacts to learn from
echo ""
echo "[apex] Scanning pipeline artifacts for knowledge extraction..."

BRAINSTORM=$(apex_find_upstream "brainstorm")
PLAN=$(apex_find_upstream "plan")
EXEC=$(apex_find_upstream "execute")
REVIEW=$(apex_find_upstream "review")

[ -n "$BRAINSTORM" ] && echo "Brainstorm: $BRAINSTORM"
[ -n "$PLAN" ]       && echo "Plan: $PLAN"
[ -n "$EXEC" ]       && echo "Execution: $EXEC"
[ -n "$REVIEW" ]     && echo "Review: $REVIEW"

# Check for existing solutions (overlap detection)
if [ -d "docs/solutions" ]; then
  EXISTING_SOLUTIONS=$(find docs/solutions -name "*.md" -not -name "INDEX.md" 2>/dev/null | wc -l | tr -d ' ')
  echo ""
  echo "[apex] Existing solution docs: $EXISTING_SOLUTIONS"
else
  EXISTING_SOLUTIONS=0
fi

apex_ensure_dirs
```

# Compound Stage

> apex-forge / workflow / stages / compound
>
> The learning engine. Extract reusable knowledge from completed work.
> This is how the system gets smarter over time. Compound interest on effort.

---

## Trigger Conditions

Compound activates when any of these signals appear:

| Signal | Detection |
|--------|-----------|
| Resolution | "That worked" / "it's fixed" / "merged" / "shipped" |
| Pipeline completion | Ship stage completed successfully |
| Bug resolved | A debugging session reached a fix |
| Pattern discovered | A non-obvious approach was found |
| Workaround found | A limitation was circumvented |
| Manual invocation | User runs `/apex-forge-compound` directly |

If none of these signals are present, ask: "What was resolved? I need context
to capture the right knowledge."

---

## Parallel Analysis

Run three analysis tracks simultaneously:

### Track 1: Context Analyzer

- **What was the situation?** (environment, state, preconditions)
- **Why did the problem arise?** (root cause, contributing factors)
- **What made this problem specific to this project/context?**
- **What was the scope of impact?**

Output: Context summary (3-5 sentences).

### Track 2: Solution Extractor

- **What was tried?** (all approaches, including failures)
- **What actually worked?** (the winning approach)
- **Why did it work when others didn't?** (the differentiating insight)
- **What is the minimal reproduction of the solution?**
- **What is the generalized pattern?** (applicable beyond this specific case)

Output: Solution summary with generalized pattern.

### Track 3: Related Docs Finder

- **Do any existing solution docs in `docs/solutions/` cover similar problems?**
- **Are any existing docs now stale** because of what was learned?
- **Are there related docs that should cross-reference this solution?**

Output: Related doc list with overlap assessment.

---

## Overlap Check

Before writing a new solution doc:

1. Search `docs/solutions/` for existing docs with similar:
   - Problem type (bug, feature, refactor)
   - Component (same area of the codebase)
   - Tags (overlapping keywords)
2. For each potential match, assess overlap:

| Overlap | Action |
|---------|--------|
| **>70%** | Update the existing doc instead of creating a new one. Add the new context, solution details, and date. |
| **30-70%** | Create a new doc but cross-reference the related one with a link. |
| **<30%** | Create a new doc. No cross-reference needed. |

---

## Artifact Output

### Category Selection

Classify the solution into one of these categories (create subdirectory if needed):

| Category | When to Use |
|----------|-------------|
| `bug` | A defect was found and fixed |
| `feature` | A new capability was built |
| `refactor` | Code was restructured without behavior change |
| `integration` | Components were connected or APIs wired up |
| `performance` | A performance issue was diagnosed and resolved |
| `devops` | Build, deploy, or infrastructure issue resolved |
| `debugging` | A hard-to-find issue was diagnosed (the finding itself is the value) |

### Solution Document

Write to `docs/solutions/{category}/{name}.md`:

```markdown
---
title: "{Concise Problem Description}"
problem_type: bug | feature | refactor | integration | performance | devops | debugging
component: "{primary component or area}"
tags: [tag1, tag2, tag3]
date: YYYY-MM-DD
confidence: high | medium | low
source_task: "docs/plans/{name}-plan.md"
related_docs: ["docs/solutions/{other}.md"]
apex_version: "0.1.0"
---

# {Concise Problem Description}

## Context
{Track 1 output: what was the situation, why did this arise}

## Problem
{What specifically went wrong or needed to be built}
{Reproduction steps if applicable}

## What Was Tried
{All approaches, including failures, in chronological order}
1. **Approach A**: {description} -> {outcome: failed because X}
2. **Approach B**: {description} -> {outcome: succeeded}

## Solution
{The winning approach, with enough detail to reapply}
{Code snippets if they are essential to understanding}

## Why It Worked
{The differentiating insight — what made this approach succeed}

## Generalized Pattern
{The abstract pattern, applicable beyond this specific case}
{When to recognize this pattern in future work}

## Prevention
{How to avoid this problem in the future}
{Tests, checks, or practices that would catch it earlier}
```

### Index Update

After writing the solution doc, update `docs/solutions/INDEX.md`:

```markdown
| Date | Category | Title | Path | Tags |
|------|----------|-------|------|------|
| YYYY-MM-DD | {category} | {title} | `docs/solutions/{category}/{name}.md` | {tags} |
```

Create `INDEX.md` if it does not exist, with the table header.

---

## Stale Doc Refresh

If Track 3 identified stale docs:

1. Read each stale doc.
2. Determine what is outdated (referenced file paths changed, approach
   is now superseded, etc.).
3. Either update the doc or add a "Superseded by" note pointing to the new doc.
4. Do NOT delete stale docs. They may contain useful historical context.

---

## Register Artifact and Auto-Transition

After writing the solution:

```bash
source "$PLUGIN_ROOT/hooks/state-helper"
apex_add_artifact "compound" "docs/solutions/{category}/{name}.md"
```

Then tell the user:

> **Knowledge captured.** Written to `docs/solutions/{category}/{name}.md`.
> {If overlap was found: "Updated existing doc at {path}." or "Cross-referenced with {path}."}
> {If stale docs were found: "Also refreshed {N} related docs."}
>
> Session complete. The pipeline has finished for this task.

---

## Integration Notes

- **From Ship**: auto-triggers after successful ship.
- **From any stage**: can be manually invoked after any resolution signal.
- **To future sessions**: solution docs are searched during Brainstorm (Step 3:
  enumerate approaches) and Plan (decision rationale) to leverage past learnings.
- **Overlap check is critical**: duplicate solution docs reduce signal-to-noise.
  Always check before writing.

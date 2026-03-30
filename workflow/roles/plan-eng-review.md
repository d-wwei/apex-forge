---
name: apex-forge-plan-eng-review
description: Engineering architecture review — senior eng manager locking in the execution plan
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Plan Engineering Review Role Preamble
source "$PLUGIN_ROOT/hooks/state-helper"

echo "=== APEX PLAN ENG REVIEW ==="
apex_set_stage "plan-eng-review"

# Locate the plan to review
PLAN_FILE=""
PLANS=$(apex_find_upstream "plan")
if [ -n "$PLANS" ]; then
  PLAN_FILE=$(echo "$PLANS" | head -1)
  echo "[apex] Plan to review: $PLAN_FILE"
  echo "PLAN_FOUND=true"
else
  echo "[apex] WARNING: No plan artifacts found in docs/plans/"
  echo "PLAN_FOUND=false"
fi

# Detect project stack
STACK_INFO=""
if [ -f "package.json" ]; then
  STACK_INFO="node"
  FRAMEWORK=$(python3 -c "
import json
with open('package.json') as f:
    d = json.load(f)
deps = {**d.get('dependencies',{}), **d.get('devDependencies',{})}
frameworks = []
if 'next' in deps: frameworks.append('Next.js')
if 'react' in deps: frameworks.append('React')
if 'vue' in deps: frameworks.append('Vue')
if 'svelte' in deps: frameworks.append('Svelte')
if 'express' in deps: frameworks.append('Express')
if 'fastify' in deps: frameworks.append('Fastify')
if 'prisma' in deps or '@prisma/client' in deps: frameworks.append('Prisma')
if 'drizzle-orm' in deps: frameworks.append('Drizzle')
print(', '.join(frameworks) if frameworks else 'Node.js')
" 2>/dev/null || echo "Node.js")
  echo "[apex] Stack: $FRAMEWORK"
elif [ -f "pyproject.toml" ] || [ -f "requirements.txt" ]; then
  STACK_INFO="python"
  echo "[apex] Stack: Python"
elif [ -f "go.mod" ]; then
  STACK_INFO="go"
  echo "[apex] Stack: Go"
fi

# Count files in plan for scope assessment
if [ -n "$PLAN_FILE" ] && [ -f "$PLAN_FILE" ]; then
  FILE_COUNT=$(grep -c "^[- ] \`" "$PLAN_FILE" 2>/dev/null || echo "0")
  echo "[apex] Files referenced in plan: ~$FILE_COUNT"
fi

# Check for CEO review
CEO_REVIEW=$(ls -t .apex/reviews/*-ceo-review.md 2>/dev/null | head -1)
if [ -n "$CEO_REVIEW" ]; then
  echo "[apex] CEO review available: $CEO_REVIEW"
  echo "CEO_REVIEW_FOUND=true"
else
  echo "CEO_REVIEW_FOUND=false"
fi

mkdir -p ".apex/reviews"
apex_ensure_dirs
```

# Plan Engineering Review

> apex-forge / workflow / roles / plan-eng-review
>
> Persona: Senior engineering manager. Not a nitpicker.
> Focused on: can this plan be executed cleanly? Will it survive contact with reality?

---

## Entry Conditions

1. A plan document must exist (`PLAN_FOUND=true`).
2. If no plan: "No plan found. Run `/apex-plan` first, or point me to the plan document."
3. Read the plan document completely before beginning review.
4. If a CEO review exists, read it for strategic context.

---

## Review Checklist

Seven domains. Each gets a severity-tagged assessment.

### Domain 1: Architecture

| Check | What to Evaluate |
|-------|-----------------|
| **Component structure** | Are the proposed files/modules at the right granularity? Too few monolithic files? Too many micro-files? |
| **Separation of concerns** | Does each module have a single, clear responsibility? |
| **Data flow** | Can you trace the data path from input to output? Are there gaps or implicit assumptions? |
| **Coupling** | Are modules loosely coupled? Would changing one require changing many others? |
| **Existing patterns** | Does the plan follow the project's existing architectural patterns, or introduce new ones? New patterns need justification. |
| **Dependency direction** | Do dependencies point inward (domain doesn't depend on infrastructure)? Or is there spaghetti? |

### Domain 2: Data Model

| Check | What to Evaluate |
|-------|-----------------|
| **Schema design** | Are the proposed tables/collections normalized appropriately? Are relationships correct? |
| **Migration strategy** | Is there a migration plan? Can it be rolled back? Does it handle existing data? |
| **Indexes** | Are indexes proposed for query patterns? Will common queries hit an index or do full scans? |
| **Data integrity** | Foreign keys, unique constraints, NOT NULL where appropriate. Soft delete vs hard delete. |
| **Scale considerations** | Will this schema work at 10x current data volume? Are there obvious N+1 risks in the data model? |

### Domain 3: API Design

| Check | What to Evaluate |
|-------|-----------------|
| **Contracts** | Are request/response shapes defined? Types specified? |
| **Versioning** | Is there a versioning strategy? Will changes break existing clients? |
| **Error handling** | Are error responses standardized? Do they include actionable messages? |
| **Pagination** | Are list endpoints paginated? Cursor-based or offset-based? |
| **Idempotency** | Are mutating operations idempotent where they should be? |
| **Rate limiting** | Is rate limiting considered for public or expensive endpoints? |

### Domain 4: Test Strategy

| Check | What to Evaluate |
|-------|-----------------|
| **Coverage plan** | Are all acceptance criteria mapped to at least one test? |
| **Test types** | Appropriate mix of unit, integration, and e2e? Not all unit tests with no integration. |
| **Edge cases** | Are edge cases from the brainstorm/plan explicitly listed as test scenarios? |
| **Test infrastructure** | Does the plan account for test setup (fixtures, mocks, test database)? |
| **Negative tests** | Are failure paths tested? Not just happy paths. |

### Domain 5: Performance

| Check | What to Evaluate |
|-------|-----------------|
| **N+1 queries** | Does the plan's data access pattern risk N+1? (List endpoint that fetches relations in a loop) |
| **Bundle size** | For frontend: will new dependencies significantly increase bundle? Are they tree-shakeable? |
| **Cold start** | For serverless: will new imports increase cold start time? |
| **Caching** | Is caching strategy addressed for frequently-read, rarely-written data? |
| **Lazy loading** | Are heavy components/routes lazily loaded? |

### Domain 6: Security

| Check | What to Evaluate |
|-------|-----------------|
| **Auth on new endpoints** | Every new API endpoint must have explicit auth. Missing auth = P0. |
| **Input validation** | All user input validated at the boundary. Types, ranges, length limits. |
| **OWASP basics** | Parameterized queries, output encoding, CSRF protection. |
| **Data exposure** | New endpoints don't leak data from other users/tenants. |

### Domain 7: Deployment

| Check | What to Evaluate |
|-------|-----------------|
| **Rollback plan** | If this deploy breaks production, what is the rollback? "Revert the commit" is acceptable. |
| **Feature flags** | Should this be behind a feature flag for gradual rollout? |
| **Monitoring** | Are there new metrics or alerts needed? Will you know if this breaks? |
| **Database migrations** | Are migrations backward-compatible? Can old code run against new schema during rollout? |
| **Environment config** | Are new environment variables documented? Are defaults safe? |

---

## Scope Challenge Rules

These are hard rules for evaluating plan scope.

### The 8-Files Rule

If a plan touches more than 8 files, challenge the scope:

> "This plan modifies {N} files. Plans that touch >8 files have significantly higher defect rates.
> Can this be split into smaller, independently shippable increments?"

Exception: if most files are test files or generated files, the rule is relaxed.

### The 2-Classes Rule

If a plan introduces more than 2 new abstractions (classes, interfaces, types that don't map directly to a domain concept), challenge:

> "This plan introduces {N} new abstractions: {list}. Are all of these necessary?
> Each abstraction is a maintenance cost. YAGNI applies."

### The Distribution Check

For each task in the plan, estimate relative effort:

| Effort Distribution | Assessment |
|--------------------|-----------|
| All tasks roughly equal | Good — balanced plan |
| One task is 50%+ of total effort | Risk — that task probably needs to be broken down further |
| Multiple tasks are "trivial" | Suspicion — are these actually trivial, or is complexity hidden? |

---

## Finding Format

Each concern uses this format:

```markdown
### {SEVERITY}: {short description}
- **Domain**: architecture | data-model | api | testing | performance | security | deployment
- **Plan section**: {which part of the plan this refers to}
- **Concern**: {what the issue is}
- **Recommendation**: {specific suggestion}
- **Alternative**: {different approach if the recommendation is rejected}
- **Effort impact**: {how this changes the plan's effort estimate}
```

Severity levels:

| Severity | Definition |
|----------|-----------|
| **P0** | Architectural flaw that will cause rework. Fix the plan before executing. |
| **P1** | Significant concern that should be addressed. May not block but will cause pain. |
| **P2** | Improvement that would make the plan better. Nice to have. |
| **P3** | Nit or preference. Note for the record. |

---

## Completion Status

| Status | Condition |
|--------|-----------|
| **DONE** | All 7 domains reviewed. No P0 findings. Plan is executable. |
| **DONE_WITH_CONCERNS** | All domains reviewed. P1 concerns documented. Plan is executable with noted risks. |
| **BLOCKED** | P0 findings. Plan needs revision before execution. Return to `/apex-plan`. |
| **NEEDS_CONTEXT** | Cannot evaluate without seeing existing codebase patterns, schema, or infrastructure. |

---

## Artifact Output

Write to `.apex/reviews/{name}-eng-review.md`:

```markdown
---
title: "{Feature Name} Eng Review"
source_plan: "docs/plans/{name}-plan.md"
status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
date: YYYY-MM-DD
findings_total: {N}
p0_count: {N}
p1_count: {N}
p2_count: {N}
scope_files: {N files touched}
scope_challenge: passed | flagged
stage: plan-eng-review
apex_version: "0.1.0"
---

# {Feature Name} — Engineering Review

## Summary
- **Status**: {status}
- **Files in plan**: {N}
- **Scope challenge**: {passed | flagged — with reason}
- **Findings**: P0: {N}, P1: {N}, P2: {N}, P3: {N}

## Architecture Review
{findings or "Architecture is sound."}

## Data Model Review
{findings or "Data model is appropriate."}

## API Design Review
{findings or "API design is clean."}

## Test Strategy Review
{findings or "Test strategy covers acceptance criteria."}

## Performance Review
{findings or "No performance concerns."}

## Security Review
{findings or "Security considerations addressed."}

## Deployment Review
{findings or "Deployment plan is adequate."}

## Scope Analysis
### 8-Files Rule: {pass | flagged}
### 2-Classes Rule: {pass | flagged}
### Distribution Check: {balanced | skewed}

## Annotated Plan
{the original plan with inline review comments marked with [ENG-REVIEW] tags}

## Verdict
{one-paragraph summary: is this plan ready for execution?}
```

---

## Register and Report

```bash
source "$PLUGIN_ROOT/hooks/state-helper"
apex_add_artifact "plan-eng-review" ".apex/reviews/{name}-eng-review.md"
```

Then report:

> **Eng review complete.** Status: {status}. {N} findings ({breakdown}).
> Scope: {N} files, {passed|flagged}.
> Full review at `.apex/reviews/{name}-eng-review.md`.
>
> {If DONE: "Plan is ready for execution. Run `/apex-forge-execute`."}
> {If BLOCKED: "Plan needs revision. {top P0 finding summary}. Return to `/apex-plan`."}
> {If DONE_WITH_CONCERNS: "Plan is executable with noted risks. Review concerns before proceeding."}

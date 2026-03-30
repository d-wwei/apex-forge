---
name: apex-forge-review
description: Dynamic multi-persona quality gate — selects reviewers based on diff content, supports four modes
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Review Stage Preamble
source "$PLUGIN_ROOT/hooks/state-helper"

echo "=== APEX REVIEW STAGE ==="
apex_set_stage "review"

# Check what was implemented
echo ""
echo "[apex] Scanning for implementation artifacts..."

# Check for execution log
EXEC_LOG=$(apex_find_upstream "execute")
if [ -n "$EXEC_LOG" ]; then
  echo "Execution logs found:"
  echo "$EXEC_LOG"
fi

# Check git diff for changed files
if command -v git &>/dev/null && git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
  MERGE_BASE=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null || echo "")
  if [ -n "$MERGE_BASE" ]; then
    CHANGED=$(git diff --name-only "$MERGE_BASE"..HEAD 2>/dev/null)
  else
    CHANGED=$(git diff --name-only HEAD~5 2>/dev/null || git diff --name-only 2>/dev/null || echo "")
  fi

  if [ -n "$CHANGED" ]; then
    echo ""
    echo "Recently changed files (git):"
    echo "$CHANGED"
    echo "CHANGES_FOUND=true"

    # === Diff-based persona activation signals ===
    HAS_SQL=$(echo "$CHANGED" | grep -iE '\.(sql|migration)$|migrations/' || true)
    HAS_ORM=$(echo "$CHANGED" | grep -iE '(model|schema|entity|repository|dao)\.' || true)
    HAS_FRONTEND=$(echo "$CHANGED" | grep -iE '\.(tsx|jsx|vue|svelte|css|scss|less)$' || true)
    HAS_API=$(echo "$CHANGED" | grep -iE '(route|handler|controller|endpoint|api|resolver)\.' || true)
    HAS_HOTPATH=$(echo "$CHANGED" | grep -iE '(worker|queue|cache|stream|batch|pipeline|index)\.' || true)
    HAS_DEPS=$(echo "$CHANGED" | grep -iE '(package\.json|package-lock|yarn\.lock|pnpm-lock|requirements\.txt|Pipfile|go\.mod|go\.sum|Cargo\.toml|Gemfile)$' || true)
    HAS_TESTS=$(echo "$CHANGED" | grep -iE '(test|spec|__tests__|\.test\.|\.spec\.)' || true)
    HAS_CONFIG=$(echo "$CHANGED" | grep -iE '(\.(env|ini|toml|yaml|yml)$|config/|\.github/|Dockerfile|docker-compose|ci\.yml|cd\.yml)' || true)
    HAS_ASYNC=$(echo "$CHANGED" | grep -iE '(worker|queue|channel|mutex|lock|semaphore|async|thread|pool)\.' || true)
    HAS_SCHEMA=$(echo "$CHANGED" | grep -iE '(schema|types|interfaces|\.graphql|\.proto|openapi|swagger)' || true)
    HAS_RAILS=$(echo "$CHANGED" | grep -E '\.(rb)$|Gemfile|config/routes' || true)
    HAS_REACT=$(echo "$CHANGED" | grep -E '\.(tsx|jsx)$|next\.config' || true)
    HAS_PYTHON=$(echo "$CHANGED" | grep -E '\.(py)$|requirements\.txt|pyproject\.toml' || true)
    HAS_GO=$(echo "$CHANGED" | grep -E '\.(go)$|go\.mod' || true)
    HAS_VUE_SVELTE=$(echo "$CHANGED" | grep -E '\.(vue|svelte)$' || true)

    echo ""
    echo "--- Persona activation signals ---"
    [ -n "$HAS_SQL" ] || [ -n "$HAS_ORM" ] && echo "ACTIVATE_SQL_SAFETY=true"
    [ -n "$HAS_FRONTEND" ]  && echo "ACTIVATE_FRONTEND=true"
    [ -n "$HAS_API" ]       && echo "ACTIVATE_API_CONTRACT=true"
    [ -n "$HAS_HOTPATH" ]   && echo "ACTIVATE_PERFORMANCE=true"
    [ -n "$HAS_DEPS" ]      && echo "ACTIVATE_DEPENDENCY=true"
    [ -n "$HAS_TESTS" ]     && echo "ACTIVATE_TEST_QUALITY=true"
    [ -n "$HAS_CONFIG" ]    && echo "ACTIVATE_CONFIGURATION=true"
    [ -n "$HAS_ASYNC" ]     && echo "ACTIVATE_CONCURRENCY=true"
    [ -n "$HAS_SCHEMA" ]    && echo "ACTIVATE_SCHEMA_DRIFT=true"
    [ -n "$HAS_RAILS" ]     && echo "ACTIVATE_RAILS=true"
    [ -n "$HAS_REACT" ]     && echo "ACTIVATE_REACT=true"
    [ -n "$HAS_PYTHON" ]    && echo "ACTIVATE_PYTHON=true"
    [ -n "$HAS_GO" ]        && echo "ACTIVATE_GO=true"
    [ -n "$HAS_VUE_SVELTE" ] && echo "ACTIVATE_VUE_SVELTE=true"
    echo "--- End signals ---"
  else
    echo "CHANGES_FOUND=false"
  fi
else
  echo "Not a git repo or git not available. Relying on execution log."
  echo "CHANGES_FOUND=unknown"
fi

apex_ensure_dirs
```

# Review Stage

> apex-forge / workflow / stages / review
>
> The quality gate. A dynamic panel of reviewers selected based on what actually
> changed. No rubber-stamping. No "looks good to me." Every claim backed by
> fresh evidence.

---

## Entry Conditions

1. Execute stage should be complete (all tasks done, tests passing).
2. The preamble gathered:
   - Execution log from `docs/execution/`
   - Git diff of changed files
   - Persona activation signals based on diff content
3. If neither execution log nor diff is found, ask: "What should I review?
   Point me to the execution log or the files you want reviewed."

---

## Review Modes

This review supports four operating modes. Default is interactive.

| Mode | Invocation | Behavior |
|------|-----------|----------|
| **Interactive** | `/apex-forge-review` (default) | Pause at each gate, ask user at decision points |
| **Autofix** | `/apex-forge-review --autofix` | Apply safe_auto fixes automatically, surface gated/manual as todos |
| **Report-only** | `/apex-forge-review --report-only` | Read-only, no changes to source files, safe for concurrent use |
| **Headless** | `/apex-forge-review --headless` | Structured JSON output, no interaction, terminal signal on completion |

In all modes, every persona runs the same checks with the same rigor.
The mode only controls how findings are surfaced and fixes applied.

---

## Review Scope

Determine what to review:

1. **Read the execution log** to understand what was built and which files changed.
2. **Read the plan** to understand what SHOULD have been built.
3. **Read each changed file** fresh (not from memory).
4. **Run the test suite** to establish current test status.
5. **Read the activation signals** from the preamble to determine which conditional
   personas to activate.

---

## Dynamic Persona Selection

The review panel is assembled dynamically based on what changed. Always-on
personas run on every review. Conditional personas activate only when relevant
files appear in the diff. The Adversarial Reviewer always runs last.

### Always-On Personas

These three run on every review regardless of diff content.

#### Persona 1: Security Reviewer

Focus: can this be exploited?

| Check | What to Look For |
|-------|-----------------|
| **Injection** | SQL injection, XSS, command injection, template injection, path traversal |
| **SSRF** | User-controlled URLs hitting internal services, redirect chains, DNS rebinding |
| **Trust boundaries** | External input treated as trusted, missing validation at boundaries |
| **Auth/AuthZ** | Missing authentication checks, privilege escalation, insecure defaults, IDOR |
| **Secrets** | Hardcoded credentials, API keys in source, secrets in logs or error messages |
| **Data exposure** | PII in logs, overly verbose errors, debug endpoints in production paths |
| **Cryptography** | Weak algorithms, improper key management, missing TLS, broken randomness |

#### Persona 2: Correctness Reviewer

Focus: does this actually work in all cases?

| Check | What to Look For |
|-------|-----------------|
| **Edge cases** | Empty input, null/undefined, max values, unicode, concurrent access |
| **Error handling** | Missing try/catch, swallowed errors, generic messages, unclosed resources |
| **State consistency** | Race conditions, partial updates, missing rollback, stale state |
| **Contract compliance** | Return types match interface, API contracts honored, event schemas valid |
| **Resource management** | Unclosed connections, memory leaks, missing cleanup in error paths |
| **Boundary conditions** | Off-by-one errors, integer overflow, empty collections, single-element edge |
| **Null propagation** | Nullable values passed through call chains without guards |

#### Persona 3: Spec Compliance Reviewer

Focus: does this match what was planned?

| Check | What to Look For |
|-------|-----------------|
| **Plan adherence** | Every task in the plan is implemented. No tasks are missing. |
| **Acceptance criteria** | Each criterion from requirements has a corresponding test or verification |
| **File manifest** | Files created/modified match the plan. No unexpected files. |
| **Scope boundary** | Nothing implemented that was not in the plan (no scope creep) |
| **Test coverage** | Test scenarios from the plan are all present and meaningful |
| **Deviation documentation** | Any deviations from plan are documented with rationale |

---

### Conditional Personas

Activated based on preamble signals. Only run when their trigger condition is met.
If no activation signal fires, the persona is skipped entirely.

#### Persona 4: SQL Safety Reviewer

**Activates when**: diff contains `.sql`, `.migration` files, ORM model changes,
or repository/DAO layer modifications (`ACTIVATE_SQL_SAFETY=true`)

| Check | What to Look For |
|-------|-----------------|
| **Parameterization** | Raw string concatenation in queries, missing prepared statements |
| **Migration safety** | Destructive operations without backfill, missing `IF EXISTS` guards |
| **Index impact** | New queries on unindexed columns, missing index for WHERE/JOIN clauses |
| **Transaction boundaries** | Multi-step mutations outside transactions, missing rollback on failure |
| **N+1 patterns** | Queries inside loops, missing eager loading, unbounded result sets |
| **Schema compatibility** | Backward-incompatible column changes, NOT NULL without defaults |

#### Persona 5: Frontend Reviewer

**Activates when**: diff touches `.tsx`, `.jsx`, `.vue`, `.svelte`, `.css`, `.scss`,
or `.less` files (`ACTIVATE_FRONTEND=true`)

| Check | What to Look For |
|-------|-----------------|
| **XSS surface** | `dangerouslySetInnerHTML`, unescaped user content, unsafe template bindings |
| **Accessibility** | Missing aria labels, keyboard navigation, color contrast, focus management |
| **State management** | Stale closures, missing dependency arrays, uncontrolled re-renders |
| **Bundle impact** | Large imports without tree-shaking, missing lazy loading, unoptimized assets |
| **Browser compatibility** | Unsupported APIs without polyfills, CSS features without fallbacks |
| **Error boundaries** | Missing error boundaries, unhandled promise rejections in components |

#### Persona 6: API Contract Reviewer

**Activates when**: diff modifies route handlers, controllers, resolvers, or API
schema files (`ACTIVATE_API_CONTRACT=true`)

| Check | What to Look For |
|-------|-----------------|
| **Breaking changes** | Removed fields, changed types, new required parameters without versioning |
| **Input validation** | Missing schema validation on request bodies, query params, path params |
| **Response shape** | Inconsistent envelope format, missing error codes, undocumented status codes |
| **Rate limiting** | Missing rate limits on new endpoints, expensive operations without throttle |
| **Versioning** | Breaking changes without version bump, missing deprecation notices |
| **Documentation** | OpenAPI/Swagger out of sync with implementation |

#### Persona 7: Performance Reviewer

**Activates when**: diff touches hot paths, worker files, cache layers, batch
processors, or database-heavy code (`ACTIVATE_PERFORMANCE=true`)

| Check | What to Look For |
|-------|-----------------|
| **Algorithmic complexity** | O(n^2) or worse in loops over collections, nested iterations |
| **Database round-trips** | Multiple queries where one JOIN suffices, missing batch operations |
| **Memory allocation** | Large objects created in loops, unbounded caches, missing pagination |
| **I/O blocking** | Synchronous file/network operations in request paths |
| **Caching** | Missing cache for expensive computations, stale cache without invalidation |
| **Connection pooling** | New connections per request, missing pool configuration |

#### Persona 8: Dependency Reviewer

**Activates when**: `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`,
lock files, or equivalent change (`ACTIVATE_DEPENDENCY=true`)

| Check | What to Look For |
|-------|-----------------|
| **Known vulnerabilities** | New deps with published CVEs, outdated versions with known exploits |
| **License compliance** | Copyleft licenses in proprietary projects, incompatible license combinations |
| **Supply chain** | Typosquatting risk, unmaintained packages (<1 yr), single-maintainer risk |
| **Version pinning** | Unpinned dependencies, caret ranges on major-0 packages |
| **Bundle bloat** | Large transitive dependencies for small utility, duplicated functionality |
| **Lock file integrity** | Lock file changes that don't correspond to manifest changes |

#### Persona 9: Test Quality Reviewer

**Activates when**: test files or spec files change (`ACTIVATE_TEST_QUALITY=true`)

| Check | What to Look For |
|-------|-----------------|
| **Assertion quality** | Tests that only check happy path, `expect(true).toBe(true)` type assertions |
| **Test isolation** | Shared mutable state between tests, order-dependent tests |
| **Mock fidelity** | Mocks that diverge from real behavior, over-mocking that hides bugs |
| **Edge case coverage** | Missing boundary tests, no error path tests, no empty/null input tests |
| **Flakiness signals** | Time-dependent tests, network calls without mocks, race conditions |
| **Test naming** | Unclear test descriptions that don't describe the expected behavior |

#### Persona 10: Configuration Reviewer

**Activates when**: `.env`, config files, CI/CD workflows, Dockerfiles, or
infrastructure definitions change (`ACTIVATE_CONFIGURATION=true`)

| Check | What to Look For |
|-------|-----------------|
| **Secret exposure** | Secrets in config files tracked by git, missing `.gitignore` entries |
| **Environment parity** | Dev/staging/prod config drift, hardcoded environment assumptions |
| **Default safety** | Insecure defaults (debug=true, CORS=*), verbose logging in production |
| **CI/CD integrity** | Missing build steps, uncached dependencies, insecure script execution |
| **Rollback safety** | Config changes that cannot be rolled back independently of code |
| **Feature flags** | Missing kill switches for new features, permanent flags never cleaned up |

#### Persona 11: Concurrency Reviewer

**Activates when**: diff contains async/await patterns, thread management, locks,
mutexes, channels, or queue processing code (`ACTIVATE_CONCURRENCY=true`)

| Check | What to Look For |
|-------|-----------------|
| **Deadlocks** | Lock ordering violations, nested locks, missing timeout on lock acquisition |
| **Race conditions** | Shared mutable state without synchronization, check-then-act patterns |
| **Resource starvation** | Unbounded queues, missing backpressure, thread pool exhaustion |
| **Error propagation** | Swallowed errors in async contexts, unhandled promise rejections |
| **Cancellation** | Missing cancellation support, orphaned goroutines/tasks, leaked connections |
| **Ordering guarantees** | Assumptions about message ordering without enforcement |

#### Persona 12: Schema Drift Reviewer

**Activates when**: database schemas, API type definitions, GraphQL schemas,
protobuf definitions, or OpenAPI specs change (`ACTIVATE_SCHEMA_DRIFT=true`)

| Check | What to Look For |
|-------|-----------------|
| **Type sync** | Database schema and application types out of sync |
| **Migration ordering** | Migrations that depend on application code deployed simultaneously |
| **Client impact** | Schema changes that break existing clients without migration path |
| **Default values** | New required fields without defaults, nullable changes without handling |
| **Enum evolution** | New enum values without exhaustive match updates |
| **Cross-service contracts** | Shared types changed without updating all consumers |

---

### Framework-Specific Personas (conditional, detected by dependency files + code patterns)

#### Persona 14: Rails Reviewer

**Activates when**: diff contains `Gemfile`, `.rb` files, `config/routes.rb`, `db/migrate/`
(`ACTIVATE_RAILS=true`)

| Check | What to Look For |
|-------|-----------------|
| **N+1 queries** | Missing `includes`/`preload`/`eager_load` on associations accessed in loops or views |
| **Mass assignment** | Params passed to models without strong parameters (`permit`) |
| **Unscoped queries** | Controller queries missing `.where(user: current_user)` or equivalent tenant scoping |
| **Hidden side effects** | Callback chains (`before_save`, `after_commit`) that hide business logic or trigger cascades |
| **Missing indexes** | Foreign key columns without database indexes, polymorphic associations without composite index |
| **Raw SQL injection** | String interpolation in SQL fragments without parameterization (`where("name = '#{name}'")`)|

#### Persona 15: React/Next.js Reviewer

**Activates when**: diff contains `package.json` with react, `.tsx`/`.jsx` files, `next.config`
(`ACTIVATE_REACT=true`)

| Check | What to Look For |
|-------|-----------------|
| **useEffect dependencies** | Missing dependency arrays, stale closures over state/props |
| **Render-path side effects** | State updates during render causing infinite re-render loops |
| **Missing key props** | Lists rendered without stable `key` props, or using array index as key on reorderable lists |
| **Component boundary misuse** | Client components that should be server components (and vice versa in Next.js App Router) |
| **Uncontrolled/controlled** | Inputs switching between controlled and uncontrolled, missing `defaultValue` vs `value` |
| **Bundle size impact** | Large library imports without tree-shaking, missing dynamic `import()` for heavy components |
| **Missing error boundaries** | Dynamic content, async components, or third-party widgets without surrounding error boundary |

#### Persona 16: Python/Django Reviewer

**Activates when**: diff contains `requirements.txt`/`pyproject.toml`, `.py` files, `manage.py`
(`ACTIVATE_PYTHON=true`)

| Check | What to Look For |
|-------|-----------------|
| **Command injection** | `subprocess.run(shell=True)` or `os.system()` with user-controlled input |
| **Missing model `__str__`** | Models without `__str__` method, breaking Django admin display and debugging |
| **Template N+1** | QuerySet evaluated inside template loops without `select_related`/`prefetch_related` |
| **Debug in production** | `DEBUG = True` in production settings, `ALLOWED_HOSTS = ['*']` |
| **Missing migration** | Model field changes without a corresponding migration file in the diff |
| **Mutable default args** | Function signatures with mutable defaults (`def f(x=[])`, `def f(d={})`) |
| **Broad except** | Bare `except:` or `except Exception:` catching too broadly, hiding real errors |

#### Persona 17: Go Reviewer

**Activates when**: diff contains `go.mod`, `.go` files
(`ACTIVATE_GO=true`)

| Check | What to Look For |
|-------|-----------------|
| **Unchecked errors** | `err` returned from function but not checked (`_ , err := fn()` then `err` ignored) |
| **Goroutine leaks** | Goroutines spawned without cancellation context or shutdown signal |
| **Race conditions** | Shared mutable state accessed from multiple goroutines without `sync.Mutex` or channels |
| **Context propagation** | `context.Context` not threaded through call chain, `context.Background()` used deep in stack |
| **Missing defer cleanup** | Resources (files, connections, locks) opened without `defer Close()` |
| **Interface pollution** | Interfaces with too many methods, or interfaces defined by the implementor rather than the consumer |

#### Persona 18: Vue/Svelte Reviewer

**Activates when**: diff contains `.vue`/`.svelte` files, `nuxt.config`, `svelte.config`
(`ACTIVATE_VUE_SVELTE=true`)

| Check | What to Look For |
|-------|-----------------|
| **Reactive mutations** | State mutations outside reactive context, direct object property assignment bypassing reactivity |
| **Missing iteration keys** | `v-for` without `:key`, `{#each}` blocks without key expression |
| **Untyped props** | Props declared without type validation or default values |
| **Event listener leaks** | Event listeners or subscriptions added in `onMounted`/`onMount` without cleanup in `onUnmounted`/`onDestroy` |
| **SSR hydration mismatch** | Client-only logic in SSR-rendered components, browser API usage without `onMounted` guard |

---

### Adversarial Reviewer (Always-On, Runs Last)

#### Persona 13: Adversarial Reviewer

Focus: construct plausible failure scenarios. Uses four structured attack techniques.

This persona always runs and always runs after all other personas have completed,
because it uses their findings as input for compound failure scenarios.

**Technique 1: Assumption Violation**
- List every implicit assumption in the implementation (ordering, availability,
  format, size, timing, trust).
- For each assumption, construct a scenario where it is violated.
- Assess: does the code handle the violation, degrade gracefully, or fail hard?

**Technique 2: Composition Failures**
- Identify component boundaries (service calls, module interfaces, data flows).
- Construct scenarios where individual components work correctly but their
  composition fails (type mismatch, timing mismatch, partial failure).
- Focus on the seams, not the components.

**Technique 3: Cascade Construction**
- Start from a minor, plausible trigger (network blip, slow query, full disk).
- Trace the cascade: what does the trigger cause? What does that cause?
- Follow the chain until you reach a user-visible or data-integrity impact.
- If the chain reaches 3+ steps, it is worth reporting.

**Technique 4: Abuse Cases**
- For each new endpoint, input field, or state transition: what would a
  malicious user do?
- Consider: enumeration attacks, resource exhaustion, privilege escalation
  via edge cases, timing attacks, replay attacks.
- Assess whether existing controls actually prevent the abuse or just make
  it slightly harder.

**Output**: the adversarial reviewer produces scenarios, not just findings.
Each scenario includes the attack chain, probability assessment (likely / possible /
unlikely), and blast radius (localized / service / cross-service / data loss).

---

## Finding Format

Each reviewer produces findings in this format:

```markdown
### Finding: {short description}
- **Severity**: P0 | P1 | P2 | P3
- **Persona**: {which reviewer found this}
- **Confidence**: high | medium | low
- **File**: `path/to/file.ts:line`
- **Description**: {what the issue is}
- **Evidence**: {what was observed, with specifics}
- **Suggested fix**: {concrete code change or approach}
- **Autofix class**: safe_auto | gated_auto | manual | advisory
```

### Severity Levels

| Severity | Definition | Action |
|----------|-----------|--------|
| **P0** | Security vulnerability, data loss risk, or crash | Fix immediately. Blocks ship. |
| **P1** | Functional bug affecting users | Fix before ship. |
| **P2** | Quality issue, code smell, missing test | Fix in current cycle. Does not block if acknowledged. |
| **P3** | Minor improvement, style nit, suggestion | Track for later. Does not block. |

### Confidence Levels

| Confidence | Meaning | Surfacing |
|------------|---------|-----------|
| **high** | Concrete evidence: reproduced, confirmed in code, test proves it | Always surfaced |
| **medium** | Likely issue: pattern matches known problems, strong indicators | Surfaced for P0-P2 |
| **low** | Possible concern: theoretical, depends on runtime conditions | Suppressed by default |

**Suppression rule**: Low-confidence findings below P1 are logged in the full
artifact but not surfaced in the summary report. User can request exhaustive
mode to see everything.

### Autofix Classes

| Autofix Class | Meaning | Mode Behavior |
|---------------|---------|---------------|
| **safe_auto** | Mechanical fix, safe to apply without human review | Interactive: suggest. Autofix/Headless: apply. Report-only: log. |
| **gated_auto** | Likely correct but needs human confirmation | Interactive: ask. Autofix: list as todo. Headless: list in output. Report-only: log. |
| **manual** | Requires human judgment to fix correctly | All modes: describe the issue and approach, never auto-apply. |
| **advisory** | Informational only, no fix action needed | All modes: include in report for awareness. |

---

## Verification Gate

Each reviewer MUST pass the 5-step verification gate from `verify.md`
before rendering a verdict. This is non-negotiable.

For the review stage, the gate applies as follows:

1. **State the claim**: "The implementation correctly handles {X}."
2. **Evidence needed**: "I need to see {test output / file content / behavior}."
3. **Gather fresh evidence**: Re-read the file. Run the test. Check the output NOW.
4. **Compare**: Does the evidence support the claim?
5. **Verdict**: VERIFIED / PARTIALLY VERIFIED / REFUTED, with citation.

A reviewer CANNOT claim "no issues found" without evidence of what they
checked. "Looks good to me" is not a valid review.

---

## Headless Mode

When invoked programmatically (`/apex-forge-review --headless` or `mode: headless`),
the review operates without any user interaction:

1. **Persona selection**: runs detection, activates all applicable personas.
2. **Full execution**: all personas run their complete checklist.
3. **Auto-fix**: applies all `safe_auto` fixes automatically.
4. **Structured output**: emits a JSON object to stdout:

```json
{
  "verdict": "SHIP | SHIP_WITH_FIXES | BLOCK",
  "status": "DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT",
  "findings": [
    {
      "id": "SEC-001",
      "severity": "P1",
      "persona": "security",
      "confidence": "high",
      "file": "src/api/auth.ts",
      "line": 42,
      "description": "Missing rate limit on login endpoint",
      "suggested_fix": "Add rate limiter middleware: rateLimiter({ window: '15m', max: 5 })",
      "autofix_class": "gated_auto"
    }
  ],
  "personas_run": ["security", "correctness", "spec-compliance", "api-contract", "adversarial"],
  "personas_skipped": ["sql-safety", "frontend", "dependency", "concurrency"],
  "auto_fixes_applied": [
    {
      "id": "CORRECT-003",
      "file": "src/utils/parse.ts",
      "line": 17,
      "description": "Added null check before .split()",
      "diff": "- const parts = input.split(',')\n+ const parts = input?.split(',') ?? []"
    }
  ],
  "suppressed_count": 3,
  "duration_ms": 12400,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

5. **Artifact**: writes the full run to `.apex/reviews/{timestamp}-review.json`.
6. **Terminal signal**: outputs exactly `REVIEW_COMPLETE` on the last line of stdout.
7. **Degraded mode**: if a persona throws an error or times out, the review
   continues with remaining personas. The failed persona is recorded:

```json
{
  "persona": "concurrency",
  "status": "error",
  "error": "Timeout after 30s analyzing worker pool",
  "impact": "Concurrency checks not performed"
}
```

The verdict is still rendered from the personas that did complete, with a
warning that coverage is partial.

### Verdict Logic (headless)

| Condition | Verdict |
|-----------|---------|
| Zero P0 and zero P1 findings | `SHIP` |
| Zero P0, has P1 but all are `safe_auto` or `gated_auto` with fixes listed | `SHIP_WITH_FIXES` |
| Any P0, or P1 findings that require `manual` intervention | `BLOCK` |

---

## Completion Status

After all activated personas complete:

| Status | Condition |
|--------|-----------|
| **DONE** | No P0 or P1 findings. All reviewers pass verification. |
| **DONE_WITH_CONCERNS** | No P0 findings. P1 findings acknowledged by user (interactive) or all auto-fixable (headless). P2/P3 documented. |
| **BLOCKED** | Any P0 finding, or P1 finding that user has not acknowledged / cannot be auto-fixed. |
| **NEEDS_CONTEXT** | A reviewer cannot assess without more information (missing tests, unclear spec). |

---

## Artifact Output

Write to `docs/reviews/{name}-review.md`:

```markdown
---
title: "{Feature Name} Review"
source_plan: "docs/plans/{name}-plan.md"
source_execution: "docs/execution/{name}-log.md"
status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
mode: interactive | autofix | report-only | headless
reviewed: YYYY-MM-DD
personas_run: [security, correctness, spec-compliance, ...]
personas_skipped: [...]
finding_count: {total}
p0_count: {N}
p1_count: {N}
p2_count: {N}
p3_count: {N}
suppressed_count: {N}
auto_fixes_applied: {N}
stage: review
apex_version: "0.1.0"
---

# {Feature Name} Review

## Summary
- **Status**: {completion status}
- **Mode**: {interactive | autofix | report-only | headless}
- **Files reviewed**: {count}
- **Tests status**: {pass count}/{total count} passing
- **Findings**: {P0: N, P1: N, P2: N, P3: N} ({N} suppressed)
- **Personas activated**: {list}
- **Auto-fixes applied**: {N}

## Always-On Reviews

### Security Review
{Persona 1 findings}

### Correctness Review
{Persona 2 findings}

### Spec Compliance Review
{Persona 3 findings}

## Conditional Reviews
{Only sections for activated personas appear here}

### {Persona Name} Review
{Findings from activated conditional persona}

## Adversarial Review
{Persona 13 scenarios and findings}

## Auto-Fixes Applied
{List of safe_auto fixes that were applied, with diffs}

## Suppressed Findings
{Low-confidence findings, collapsed by default — {N} findings omitted from main report}

## Verification Evidence
{5-step gate results for key claims}

## Recommendation
{Specific next action based on status}
```

---

## Register Artifact and Auto-Transition

After writing the review:

```bash
source "$PLUGIN_ROOT/hooks/state-helper"
apex_add_artifact "review" "docs/reviews/{name}-review.md"
```

Then, based on status:

**DONE**:
> **Review complete.** Status: DONE. No blockers found.
> Personas run: {list}. All passed verification.
> Review at `docs/reviews/{name}-review.md`.
>
> Next: run `/apex-forge-ship` to commit and create a PR.

**DONE_WITH_CONCERNS**:
> **Review complete.** Status: DONE_WITH_CONCERNS.
> {N} concerns documented. {M} auto-fixes applied. See review for details.
>
> Acknowledge concerns and run `/apex-forge-ship`, or fix the concerns first.

**BLOCKED**:
> **Review blocked.** {N} P0/P1 findings require fixes.
> See review for details. Fix the issues and run `/apex-forge-review` again.

**NEEDS_CONTEXT**:
> **Review needs context.** Cannot fully assess without: {missing items}.
> Provide the missing context and run `/apex-forge-review` again.

---

## Integration Notes

- **From Execute**: the execution log + source files are the inputs.
- **To Ship**: review must be DONE or DONE_WITH_CONCERNS (user-acknowledged).
- **Verify stage**: review uses the verification gate internally for every claim.
  The `verify.md` skill is the authority on evidence standards.
- **Persona activation is deterministic**: the same diff always activates the same
  personas. No randomness, no sampling.
- **Headless integration**: CI/CD systems should invoke headless mode, parse the
  JSON output, and gate on the `verdict` field. The `REVIEW_COMPLETE` terminal
  signal confirms the process finished cleanly.
- **Report-only for parallel work**: when multiple developers are working on the
  same branch, use report-only mode to avoid conflicting auto-fixes.

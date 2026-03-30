# Apex Forge: Orchestration Patterns Reference

Version: 0.1.0-draft
Status: RFC
Last Updated: 2026-03-29

---

## About This Document

This is a reference catalog of reusable orchestration patterns for multi-agent
systems. Each pattern has been extracted from a production or near-production
agent framework, generalized, and documented with trade-offs.

Patterns are building blocks. They can be composed: a system might use
Fire-and-Record for coordination, Debounced Memory for persistence, and
Dual-Stage Acceptance for quality. No pattern requires any other specific
pattern, but some compose especially well (noted where relevant).

---

## Table of Contents

1. [Workpad Pattern](#1-workpad-pattern)
2. [Reversed Conversation](#2-reversed-conversation)
3. [Elaboration Rounds](#3-elaboration-rounds)
4. [Sandbox State Propagation](#4-sandbox-state-propagation)
5. [Topology-Aware Distribution](#5-topology-aware-distribution)
6. [Cost-Aware Model Routing](#6-cost-aware-model-routing)
7. [Dual-Stage Acceptance](#7-dual-stage-acceptance)
8. [Resume Semantics](#8-resume-semantics)
9. [Debounced Memory](#9-debounced-memory)
10. [Fire-and-Record](#10-fire-and-record)

---

## 1. Workpad Pattern

**Source Project**: Symphony

### When to Use

- When multiple agents may work on the same task over time (retries, handoffs)
- When you need an audit trail of agent reasoning beyond git history
- When context must survive across agent sessions and context window limits
- When debugging agent failures after the fact

### How It Works

Every task gets a persistent scratchpad file (the "workpad") stored in the
task's workspace directory. When an agent starts working on a task, it reads
the workpad first. As it works, it appends structured notes: what it tried,
what worked, what failed, what it learned. When the agent finishes (success
or failure), the workpad remains. The next agent to touch this task — whether
a retry, a different role, or a human reviewer — reads the same workpad and
has full context.

The workpad is NOT a raw conversation log. It is a curated, structured document
that agents write to intentionally. Think of it as an engineer's lab notebook:
entries are dated, categorized, and written for a future reader.

### Workpad Structure

```markdown
# Workpad: APEX-42

## Attempt 1 (2026-03-29T14:00:00Z, agent: dev-agent-001)

### Plan
- Add rate limiting middleware to the /api/payments endpoint
- Use the existing `rate-limiter` package already in dependencies
- Target: 100 req/min per API key

### Observations
- Found existing rate limiter in `src/middleware/rate-limit.ts` but it
  only supports IP-based limiting, not API-key-based
- The `rate-limiter` package v2.3 supports key-based limiting via
  `keyGenerator` option

### Actions Taken
- Modified `src/middleware/rate-limit.ts` to accept a `keyGenerator` function
- Added API-key extraction from `Authorization` header
- Wrote 4 unit tests in `test/middleware/rate-limit.test.ts`

### Outcome
- 3/4 tests pass, 1 fails: edge case when API key is malformed
- Releasing task — need clarification on expected behavior for malformed keys

### Open Questions
- Should malformed API keys be rate-limited per-IP as fallback, or rejected?

---

## Attempt 2 (2026-03-29T15:30:00Z, agent: dev-agent-002)

### Context from Previous Attempt
- Read attempt 1 notes. The core implementation is done.
- Open question about malformed API keys — checked issue comments,
  PM clarified: reject with 401.

### Actions Taken
- Updated the malformed-key test case to expect 401
- Added explicit validation before rate-limit check
- All 4 tests pass

### Self-Check
- [x] Unit tests pass (4/4)
- [x] Integration tests pass (no regressions)
- [x] Rate: 100 req/min per key confirmed via load test
- [x] Malformed keys return 401

### Outcome
- Submitting for review
```

### Trade-offs

| Advantage | Disadvantage |
|---|---|
| Full audit trail of agent reasoning | Workpad can grow large over many attempts |
| Enables effective retries (resume, not restart) | Agents must be trained to write useful notes |
| Human reviewers get context without reading code | Storage cost for long-running tasks |
| Debugging failed agents is straightforward | Stale notes can mislead if not dated/structured |

### Composes Well With

- **Resume Semantics** (pattern 8): workpad is the primary resume artifact
- **Dual-Stage Acceptance** (pattern 7): reviewers read the workpad
- **Debounced Memory** (pattern 9): long-term facts extracted from workpads

---

## 2. Reversed Conversation

**Source Project**: Chorus

### When to Use

- When you want human oversight without human initiative
- When the cost of agent mistakes is high enough to justify review
- When you need to maintain a human-in-the-loop without slowing agents to
  human typing speed
- When building trust with a new agent system (start reversed, move to
  autonomous as confidence grows)

### How It Works

In a traditional conversation, the human proposes and the AI responds. In
the Reversed Conversation pattern, the AI proposes and the human verifies.
The agent does the thinking, planning, and execution, then presents its
output as a proposal for human approval. The human's job is reduced from
"figure out what to do and tell the AI" to "review what the AI did and
approve or reject."

This inverts the cognitive load. The human doesn't need to know HOW to do
the task — they just need to know whether the result is correct. This is
almost always easier and faster.

### Concrete Example

Traditional flow:
```
Human: "Add rate limiting to the payments endpoint"
Agent: "What rate limit? Per IP or per key? What about malformed keys?"
Human: "100/min per API key. Reject malformed keys."
Agent: "Here's the implementation..."
Human: "Looks good, but you missed the edge case where..."
Agent: "Fixed."
```

Reversed flow:
```
Agent: "I've analyzed APEX-42. Here's my plan:
  - Add API-key-based rate limiting at 100 req/min
  - Use existing rate-limiter package with keyGenerator
  - Reject malformed keys with 401
  - 4 unit tests covering: normal, burst, malformed, missing key
  Approve? (yes / no / modify)"
Human: "yes"
Agent: [executes, presents result]
Agent: "Implementation complete. Self-check passed. PR ready for review."
Human: [reviews PR, approves]
```

The human spoke 1 word instead of multiple sentences. The agent did the
analysis work. The result quality is the same or better because the agent
considered edge cases the human might not have mentioned.

### Implementation

The pattern requires three components:

1. **Proposal Template**: structured format agents use to present plans
2. **Approval API**: mechanism for humans to approve/reject/modify
3. **Modification Handling**: when the human says "modify," the agent
   re-proposes with changes incorporated

```python
class ProposalGate:
    async def submit_proposal(self, task_id: str, proposal: Proposal) -> Approval:
        """Blocks until human responds. Returns approval with optional notes."""
        notification = self.notify_human(task_id, proposal)
        return await self.wait_for_response(notification.id)

class Approval:
    status: Literal["approved", "rejected", "modified"]
    notes: str | None
    modifications: dict | None
```

### Trade-offs

| Advantage | Disadvantage |
|---|---|
| Reduces human cognitive load dramatically | Human must still be available for review |
| Catches errors before execution, not after | Adds latency at each approval gate |
| Builds trust incrementally (human sees quality) | Over-gating can negate autonomy benefits |
| Natural fit for compliance/audit requirements | Requires good proposal formatting to be useful |

### Composes Well With

- **Elaboration Rounds** (pattern 3): proposal can trigger Q&A if needed
- **Control vs Autonomy Axis**: reversed conversation IS the mechanism for controlled mode
- **Dual-Stage Acceptance** (pattern 7): reversed conversation at both planning and review

---

## 3. Elaboration Rounds

**Source Project**: Chorus

### When to Use

- When task descriptions are ambiguous or incomplete
- When the cost of incorrect assumptions is higher than the cost of asking
- When working with complex domain requirements that need clarification
- When a PM agent creates tasks that developer agents need to unpack

### How It Works

Before an agent begins execution, it enters an elaboration phase where it
asks structured clarifying questions. The questions are generated by analyzing
the task description, acceptance criteria, and related context. A human (or
PM agent) responds. This continues for a bounded number of rounds until the
agent has sufficient clarity to proceed, or the round limit is reached.

The key insight: it is almost always cheaper to ask 3 questions upfront than
to build the wrong thing and iterate 3 times. Elaboration rounds formalize
this intuition.

### Round Structure

```
Round 1: Agent reads task → generates questions
  Questions focus on: ambiguous requirements, missing acceptance criteria,
  architectural constraints, edge cases

Round 2: Human/PM answers → agent may ask follow-ups
  Follow-ups focus on: contradictions in answers, new edge cases revealed,
  priority conflicts

Round 3 (if needed): Final clarifications
  Focus on: confirming understanding, summarizing decisions
```

Maximum rounds is configurable (default: 3). After max rounds, the agent
must proceed with its best understanding, noting any remaining uncertainties
in the workpad.

### Elaboration Document

Each elaboration round produces a structured document:

```markdown
# Elaboration: APEX-42

## Round 1

### Agent Questions (2026-03-29T14:00:00Z)
1. The task says "rate limiting" — should this be per-IP, per-API-key, or both?
2. What should happen when a rate limit is exceeded? 429 with retry-after header?
3. Should rate limits be configurable at runtime, or compile-time constants?

### Human Answers (2026-03-29T14:05:00Z)
1. Per-API-key only. IP-based is handled by the load balancer.
2. Yes, 429 with Retry-After header. Include remaining quota in X-RateLimit-* headers.
3. Configurable at runtime via environment variable.

## Round 2

### Agent Questions (2026-03-29T14:06:00Z)
1. For the X-RateLimit headers, should we follow the IETF draft standard
   (RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset) or a custom scheme?
2. Should the runtime config change take effect immediately, or on next request cycle?

### Human Answers (2026-03-29T14:10:00Z)
1. IETF draft standard.
2. Immediately — we use a config watcher pattern already.

## Summary
- Per-API-key rate limiting, 100 req/min (from acceptance criteria)
- 429 + Retry-After + IETF RateLimit-* headers on exceeded
- Runtime configurable via env var, immediate effect
- IP-based limiting out of scope (handled by LB)
```

### Trade-offs

| Advantage | Disadvantage |
|---|---|
| Prevents wasted execution on wrong assumptions | Adds upfront latency before work begins |
| Creates clear documentation of decisions | Requires human availability for answers |
| Reduces retry rate significantly | Over-elaboration can feel like unnecessary process |
| Questions often reveal gaps humans didn't notice | Some agents ask obvious or low-value questions |

### Composes Well With

- **Reversed Conversation** (pattern 2): elaboration IS a reversed conversation (agent asks, human answers)
- **Workpad Pattern** (pattern 1): elaboration summary written to workpad
- **Resume Semantics** (pattern 8): elaboration survives retries

---

## 4. Sandbox State Propagation

**Source Project**: DeerFlow

### When to Use

- When agents can spawn subagents (hierarchical execution)
- When you need containment guarantees that survive delegation
- When resource budgets must be enforced across agent trees
- When preventing privilege escalation in multi-agent hierarchies

### How It Works

Every agent operates within a sandbox — a first-class state object that
defines its boundaries. When an agent spawns a subagent, the sandbox state
is propagated downward with additional restrictions (never fewer). The child
cannot exceed its parent's permissions, budgets, or depth limits. The sandbox
state travels with the agent through the entire hierarchy, creating a
containment envelope that narrows at each level.

Think of it like Unix process privileges: a child process can drop privileges
but never gain them. Sandbox state applies this principle to tools, tokens,
API calls, and wall time.

### Sandbox State Object

```json
{
  "depth": 0,
  "max_depth": 3,
  "agent_id": "orchestrator-001",
  "root_task": "APEX-42",
  "tool_permissions": {
    "allowed": ["*"],
    "denied": []
  },
  "resource_budget": {
    "max_api_calls": 500,
    "api_calls_used": 0,
    "max_tokens": 1000000,
    "tokens_used": 0,
    "max_wall_time_s": 1800,
    "wall_time_started": "2026-03-29T14:00:00Z"
  },
  "data_access": {
    "readable_paths": ["src/", "test/", "docs/"],
    "writable_paths": ["src/", "test/"]
  }
}
```

### Propagation Rules

When spawning a child:

```python
def create_child_sandbox(parent: SandboxState, child_config: dict) -> SandboxState:
    child = SandboxState(
        depth=parent.depth + 1,
        max_depth=parent.max_depth,  # inherited, cannot increase
        parent_id=parent.agent_id,
        root_task=parent.root_task,  # always traces to original task
    )

    # Tools: child can only REMOVE from parent's set, never ADD
    child.tool_permissions.allowed = intersect(
        parent.tool_permissions.allowed,
        child_config.get("allowed_tools", parent.tool_permissions.allowed)
    )
    child.tool_permissions.denied = union(
        parent.tool_permissions.denied,
        child_config.get("denied_tools", [])
    )

    # Budget: child gets a SLICE of parent's remaining budget
    remaining = parent.resource_budget.remaining()
    child.resource_budget = ResourceBudget(
        max_api_calls=min(child_config.get("api_calls", remaining.api_calls), remaining.api_calls),
        max_tokens=min(child_config.get("tokens", remaining.tokens), remaining.tokens),
        max_wall_time_s=min(child_config.get("wall_time", remaining.wall_time), remaining.wall_time),
    )

    # Depth check
    if child.depth >= child.max_depth:
        raise MaxDepthExceeded(f"Cannot spawn at depth {child.depth}, max is {child.max_depth}")

    return child
```

### Enforcement

Sandbox state is enforced at three levels:

1. **Spawn-time**: child sandbox is validated before the subagent starts
2. **Tool-call-time**: MCP middleware checks tool permissions on every call
3. **Budget-time**: resource counters checked before expensive operations

Violations are hard failures, not warnings. An agent that exceeds its sandbox
is terminated immediately.

### Trade-offs

| Advantage | Disadvantage |
|---|---|
| Mathematical containment guarantee | Adds overhead to every tool call (permission check) |
| Budget enforcement prevents runaway costs | Budget partitioning can starve children |
| Prevents privilege escalation by construction | Complex to debug when budget runs out unexpectedly |
| Audit trail of all sandbox state transitions | Requires careful initial budget allocation |

### Composes Well With

- **Subagent Safety** (ARCHITECTURE.md section 7): sandbox IS the safety mechanism
- **Fire-and-Record** (pattern 10): sandbox state recorded in ledger
- **Cost-Aware Model Routing** (pattern 6): budget informs model selection

---

## 5. Topology-Aware Distribution

**Source Project**: RuFlo

### When to Use

- When you need more than the default single-orchestrator topology
- When tasks have communication patterns that favor specific agent layouts
- When scaling beyond a single machine or single orchestrator process
- When different phases of a project need different coordination structures

### How It Works

Instead of committing to a single orchestration topology, the system supports
multiple topologies and can switch between them based on the task structure.
The orchestrator analyzes the task DAG and selects the topology that minimizes
communication overhead and maximizes parallelism. Four topologies are supported,
each optimal for different task shapes.

### Topologies

#### Star Topology (Default)

```
        +---+
        | O |  (Orchestrator)
       /  |  \
      /   |   \
   +---+  +---+  +---+
   | A |  | B |  | C |  (Agents)
   +---+  +---+  +---+
```

- One orchestrator, N independent agents
- Best for: tasks with no inter-agent dependencies
- Communication: O(N) — each agent talks only to orchestrator
- Example: 5 independent bug fixes in different modules

#### Hierarchical Topology

```
        +---+
        | O |
       /     \
    +---+   +---+
    |O1 |   |O2 |  (Sub-orchestrators)
   / \       / \
  A   B     C   D  (Agents)
```

- Tree of orchestrators, each managing a subtree
- Best for: tasks that decompose into independent workstreams
- Communication: O(log N) depth, bounded fan-out
- Example: frontend and backend work streams with dedicated leads

#### Mesh Topology

```
   +---+     +---+
   | A |-----|B  |
   +---+\   /+---+
    |    \ /    |
    |     X     |
    |    / \    |
   +---+/   \+---+
   | C |-----| D |
   +---+     +---+
```

- Agents communicate directly with each other (peer-to-peer)
- Best for: tasks requiring tight collaboration between all agents
- Communication: O(N^2) in worst case, but low latency
- Example: complex refactor where changes in one file affect others

#### Ring Topology

```
   +---+ → +---+ → +---+
   | A |   | B |   | C |
   +---+ ← +---+ ← +---+
```

- Each agent passes work to the next in sequence
- Best for: pipeline processing (analyze → implement → test → review)
- Communication: O(N) total, strictly sequential
- Example: code review pipeline where each agent adds a different perspective

### Topology Selection Heuristic

```python
def select_topology(task_dag: DAG) -> Topology:
    if task_dag.is_independent():        # no edges between tasks
        return StarTopology()
    elif task_dag.is_tree():             # hierarchical decomposition
        return HierarchicalTopology()
    elif task_dag.is_pipeline():         # linear chain
        return RingTopology()
    else:                                # complex interdependencies
        if task_dag.node_count <= 6:
            return MeshTopology()        # mesh is fine for small groups
        else:
            return HierarchicalTopology()  # partition into subtrees
```

### Trade-offs

| Advantage | Disadvantage |
|---|---|
| Optimal coordination for each task shape | Complexity of supporting multiple topologies |
| Can scale beyond single-machine orchestration | Mesh topology has O(N^2) communication cost |
| Hierarchical enables large-scale parallelism | Topology selection heuristic can be wrong |
| Ring is perfect for sequential pipelines | Switching topology mid-execution is disruptive |

### Composes Well With

- **Single-Authority Orchestrator** (ARCHITECTURE.md section 1): star topology IS single-authority
- **Ledger Pattern** (pattern 10): each topology node records to a shared ledger
- **Sandbox State Propagation** (pattern 4): hierarchical topology propagates sandboxes naturally

---

## 6. Cost-Aware Model Routing

**Source Project**: RuFlo

### When to Use

- When running at scale and LLM costs are a meaningful budget line
- When different subtasks have vastly different complexity
- When you want to maximize throughput without overspending on simple tasks
- When you need predictable cost per task or per sprint

### How It Works

Not every subtask needs the most powerful (and most expensive) model. A typo
fix doesn't need the same model as an architectural refactor. Cost-aware model
routing analyzes each subtask's complexity and routes it to the cheapest model
tier that can handle it. The system maintains a cost-performance model that
improves over time as it observes which tasks succeed or fail at each tier.

### Model Tiers

```
Tier 0: WASM Booster (near-zero cost)
  - Deterministic transformations: formatting, renaming, pattern replacement
  - No LLM involved — compiled WASM modules execute directly
  - Latency: <100ms
  - Cost: ~$0.00

Tier 1: Small Model (low cost)
  - Simple, well-defined tasks: test generation from examples, docstring updates
  - Haiku-class model
  - Latency: 1-5s
  - Cost: ~$0.01 per task

Tier 2: Medium Model (moderate cost)
  - Most development tasks: feature implementation, bug fixes, code review
  - Sonnet-class model
  - Latency: 10-60s
  - Cost: ~$0.10 per task

Tier 3: Large Model (high cost)
  - Complex reasoning: architectural decisions, multi-file refactors, security audit
  - Opus-class model
  - Latency: 30-120s
  - Cost: ~$1.00 per task
```

### Routing Logic

```python
class ModelRouter:
    def route(self, task: Task, budget_remaining: float) -> ModelTier:
        complexity = self.estimate_complexity(task)

        # Hard budget constraint
        if budget_remaining < TIER_COSTS[complexity.suggested_tier]:
            return self.downgrade(complexity.suggested_tier, budget_remaining)

        # WASM booster check: can this be done deterministically?
        if self.wasm_registry.has_handler(task.type):
            return ModelTier.WASM

        # Complexity-based routing
        if complexity.score < 0.3:
            return ModelTier.SMALL
        elif complexity.score < 0.7:
            return ModelTier.MEDIUM
        else:
            return ModelTier.LARGE

    def estimate_complexity(self, task: Task) -> ComplexityEstimate:
        """Heuristic complexity scoring based on task attributes."""
        score = 0.0
        score += 0.2 if task.files_affected > 3 else 0.0
        score += 0.2 if task.has_test_requirement else 0.0
        score += 0.2 if "refactor" in task.labels else 0.0
        score += 0.2 if len(task.dependencies) > 2 else 0.0
        score += 0.2 if task.acceptance_criteria_count > 4 else 0.0
        return ComplexityEstimate(score=score, suggested_tier=self.score_to_tier(score))
```

### Feedback Loop

After each task completes, the router records the outcome:

```json
{
  "task_id": "APEX-42",
  "tier_used": "medium",
  "complexity_estimate": 0.55,
  "outcome": "success",
  "tokens_used": 45000,
  "actual_cost": 0.08,
  "retries": 0
}
```

Over time, the router adjusts its complexity thresholds based on success rates
per tier. If Tier 1 (small model) fails too often on tasks scored at 0.25,
the threshold shifts down.

### Trade-offs

| Advantage | Disadvantage |
|---|---|
| 5-10x cost reduction on routine tasks | Misrouting to a weak model wastes a retry |
| WASM tier has near-zero latency and cost | Complexity estimation is heuristic, not exact |
| Budget enforcement prevents cost overruns | Requires maintaining multiple model integrations |
| Feedback loop improves routing over time | Initial routing is based on heuristics, not data |

### Composes Well With

- **Sandbox State Propagation** (pattern 4): budget in sandbox informs tier selection
- **Resume Semantics** (pattern 8): failed tier-1 task retried at tier-2
- **Skills Registry** (ARCHITECTURE.md section 9): skills declare `estimated_tokens` for routing

---

## 7. Dual-Stage Acceptance

**Source Project**: Chorus

### When to Use

- When agent output quality must be verified before integration
- When you want defense-in-depth against both agent errors and reviewer fatigue
- When compliance requires documented evidence of verification
- When building trust gradually (agents self-check first, humans verify the check)

### How It Works

Every task goes through two distinct verification stages before reaching the
terminal `done` state. First, the agent that did the work performs a self-check
against the acceptance criteria, providing concrete evidence for each criterion.
Second, a human reviewer (or admin agent) examines both the work AND the
self-check evidence. The reviewer can approve, reject with feedback, or
request additional evidence.

The critical insight: the self-check is not just "did tests pass?" — it's a
structured evidence document that makes the human reviewer's job faster and
more reliable. A good self-check reduces review time from 30 minutes to 5
minutes because the reviewer knows exactly what to look at.

### Stage 1: Self-Check

The agent produces a self-check document before transitioning to `to_verify`:

```json
{
  "task_id": "APEX-42",
  "agent_id": "dev-agent-002",
  "self_check": {
    "overall_confidence": 0.92,
    "criteria_results": [
      {
        "criterion": "All unit tests pass",
        "status": "pass",
        "evidence": "pytest: 42 passed, 0 failed, 0 skipped (output attached)",
        "evidence_type": "test_output"
      },
      {
        "criterion": "No regressions in integration suite",
        "status": "pass",
        "evidence": "Integration suite: 128 passed, 0 failed (output attached)",
        "evidence_type": "test_output"
      },
      {
        "criterion": "API response time < 200ms",
        "status": "pass",
        "evidence": "Load test: p50=45ms, p95=120ms, p99=180ms",
        "evidence_type": "benchmark"
      },
      {
        "criterion": "Rate limit headers follow IETF draft",
        "status": "pass",
        "evidence": "Verified: RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset headers present",
        "evidence_type": "manual_verification"
      }
    ],
    "known_limitations": [
      "Did not test with >1000 concurrent connections (would need staging environment)"
    ],
    "files_changed": [
      "src/middleware/rate-limit.ts",
      "test/middleware/rate-limit.test.ts",
      "src/config/rate-limit.config.ts"
    ],
    "diff_summary": "+142 -12 across 3 files"
  }
}
```

### Stage 2: Human/Admin Review

The reviewer receives the self-check alongside the actual changes:

```
Review Package for APEX-42:
- Self-check: 4/4 criteria passed, confidence 0.92
- Known limitations: 1 (high-concurrency not tested)
- Files changed: 3
- Diff: +142 -12

Actions: [Approve] [Reject with feedback] [Request more evidence]
```

The reviewer's job is to:
1. Spot-check the evidence (do the test outputs actually show what's claimed?)
2. Review the diff for issues the self-check might miss (security, style, architecture)
3. Evaluate known limitations (is the untested scenario acceptable?)

### Rejection Flow

On rejection, the task returns to `in_progress` with structured feedback:

```json
{
  "rejection_reason": "Evidence insufficient for criterion 3",
  "feedback": "The load test was run with only 10 concurrent users. Need at least 100 to validate the p99 claim.",
  "requested_action": "Re-run load test with 100 concurrent users"
}
```

The agent reads this feedback, addresses it, and re-submits.

### Trade-offs

| Advantage | Disadvantage |
|---|---|
| Catches errors at two independent checkpoints | Adds latency to every task completion |
| Self-check evidence speeds up human review | Agent self-checks can be overconfident |
| Creates auditable verification trail | Requires training agents to produce good evidence |
| Defense-in-depth against both agent and reviewer error | Dual review can feel bureaucratic for simple tasks |

### Composes Well With

- **Reversed Conversation** (pattern 2): review IS a reversed conversation
- **Workpad Pattern** (pattern 1): self-check appended to workpad
- **Control vs Autonomy Axis**: dual-stage is mandatory in controlled mode, optional in high-autonomy

---

## 8. Resume Semantics

**Source Project**: Symphony

### When to Use

- When agent tasks are long-running (>5 minutes)
- When failures are expected and retries are common
- When context windows are limited and tasks may need multiple sessions
- When you want to avoid paying the full cost of re-execution on retry

### How It Works

When an agent fails or exits, its workspace is preserved intact. The next
execution is a resumption, not a restart. The workspace directory persists:
code changes, notes, test outputs, and an attempt counter. The agent's prompt
includes the attempt number, and agents with attempt > 1 are expected to read
previous attempt artifacts before proceeding. An exponential backoff delay
between retries prevents tight failure loops, while normal exits (agent
completed a phase but not the whole task) use a 1-second continuation delay.

The practical effect: a 30-minute task that fails at minute 25 doesn't
restart from minute 0. The retry agent reads what happened, finds the work
95% done, and finishes in 5 minutes.

### State Preserved Across Retries

```
.workspaces/APEX-42/
  code/              # git worktree — all changes from previous attempts
  workpad.md         # structured notes from all attempts
  state.json         # metadata: attempt count, timestamps, failure reasons
  attempt.log        # stdout/stderr from each attempt
  elaboration.md     # clarification Q&A (if elaboration rounds were used)
  self-check.json    # last self-check result (if reached that stage)
```

### Attempt Counter in Prompt

```jinja2
## Context
- Attempt number: {{ attempt }}
{% if attempt > 1 %}
- IMPORTANT: This is a retry. Previous attempt(s) failed.
  Read workpad.md and attempt.log before starting.
  Do NOT repeat work that was already completed successfully.
{% endif %}
```

### Backoff Schedule

```python
def compute_delay(attempt: int, exit_code: int, base: float = 10.0) -> float:
    if exit_code == 0:
        # Normal exit — agent completed a phase, continue quickly
        return 1.0

    # Failure — exponential backoff with jitter
    delay = base * (2 ** (attempt - 1))
    jitter = random.uniform(0, delay * 0.1)
    return min(delay + jitter, 300.0)  # cap at 5 minutes
```

| Attempt | Exit Code | Delay |
|---|---|---|
| 1 | non-zero | ~10s |
| 2 | non-zero | ~20s |
| 3 | non-zero | ~40s |
| 4 | non-zero | ~80s |
| any | 0 | 1s |

### When to Destroy Workspaces

Workspaces are cleaned up only when:
1. Task reaches terminal state (`done` or `closed`)
2. `before_destroy` hook runs (archive logs, push branches)
3. Configurable retention period expires (default: 24h after terminal state)

Never destroy a workspace for a task that might be retried.

### Trade-offs

| Advantage | Disadvantage |
|---|---|
| Massive time/cost savings on retries | Stale workspace state can confuse agents |
| Natural continuation across context limits | Requires agents to be resume-aware |
| Preserves valuable intermediate work | Disk usage grows with workspace count |
| Debugging is easy — all artifacts are there | Complex cleanup logic for terminal states |

### Composes Well With

- **Workpad Pattern** (pattern 1): workpad IS the resume document
- **Elaboration Rounds** (pattern 3): elaboration survives retries
- **Cost-Aware Model Routing** (pattern 6): failed tier-1 retried at tier-2

---

## 9. Debounced Memory

**Source Project**: DeerFlow

### When to Use

- When agents generate knowledge that should persist beyond a single session
- When you need shared context across agents working on related tasks
- When raw conversation history is too noisy to be useful
- When memory writes would otherwise block the agent's critical path

### How It Works

As agents work, they generate facts — distilled, high-confidence observations
about the codebase, the domain, or the task. These facts are not written to
storage immediately. Instead, they accumulate in an in-memory write buffer.
After a configurable debounce interval (default: 30 seconds), the buffer is
flushed to the storage backend in a single batch write. Facts below a
confidence threshold (default: 0.7) are discarded before storage. The
memory layer maintains a maximum fact count (default: 100), evicting the
lowest-confidence facts when the limit is reached.

This pattern ensures that memory operations never slow down agent reasoning.
The agent produces facts at its natural speed, and the memory layer handles
persistence asynchronously.

### Write Buffer

```python
class MemoryWriteBuffer:
    def __init__(self, debounce_interval: float = 30.0, confidence_threshold: float = 0.7):
        self.buffer: list[Fact] = []
        self.last_flush: float = time.time()
        self.debounce_interval = debounce_interval
        self.confidence_threshold = confidence_threshold
        self._flush_task: asyncio.Task | None = None

    def add(self, fact: Fact) -> None:
        """Non-blocking. Adds to buffer, schedules flush if needed."""
        if fact.confidence < self.confidence_threshold:
            return  # discard low-confidence facts immediately

        self.buffer.append(fact)
        self._schedule_flush()

    def _schedule_flush(self) -> None:
        """Ensures a flush is scheduled, but doesn't duplicate."""
        if self._flush_task is None or self._flush_task.done():
            self._flush_task = asyncio.create_task(self._delayed_flush())

    async def _delayed_flush(self) -> None:
        """Wait for debounce interval, then flush."""
        elapsed = time.time() - self.last_flush
        if elapsed < self.debounce_interval:
            await asyncio.sleep(self.debounce_interval - elapsed)

        facts_to_write = self.buffer.copy()
        self.buffer.clear()
        self.last_flush = time.time()

        await self.backend.store(facts_to_write)
```

### Confidence Scoring

Confidence is assigned by the agent when it produces a fact:

| Confidence | Meaning | Example |
|---|---|---|
| 0.95+ | Verified by execution | "Test suite has 142 tests" (counted from test output) |
| 0.8-0.95 | High certainty from code reading | "Auth module uses JWT, not sessions" |
| 0.7-0.8 | Reasonable inference | "Error handling seems inconsistent across modules" |
| 0.5-0.7 | Uncertain, stored with warning | "This might be a legacy pattern" |
| <0.5 | Too uncertain, discarded | "Not sure if this is still used" |

### Eviction Strategy

When fact count exceeds the maximum:

```python
def evict_to_capacity(self, max_facts: int = 100) -> list[str]:
    """Evict lowest-value facts to stay within capacity."""
    all_facts = await self.backend.all()
    if len(all_facts) <= max_facts:
        return []

    # Score = confidence * recency_weight
    scored = [
        (fact, fact.confidence * self._recency_weight(fact.last_accessed))
        for fact in all_facts
    ]
    scored.sort(key=lambda x: x[1], reverse=True)

    keep = scored[:max_facts]
    evict = scored[max_facts:]

    evicted_ids = [fact.id for fact, _ in evict]
    await self.backend.evict(evicted_ids)
    return evicted_ids
```

Recency weight decays linearly: a fact accessed today has weight 1.0, a fact
last accessed 30 days ago has weight 0.5.

### Upload-Event Scrubbing

Before facts are stored, session-scoped references are removed:

```python
SCRUB_PATTERNS = [
    (r"/tmp/[a-zA-Z0-9_-]+/", ""),           # temp paths
    (r"session-[a-f0-9]{8}", "[session]"),     # session IDs
    (r"https?://localhost:\d+", "[local]"),     # local URLs
    (r"/\.workspaces/[^/]+/", ""),             # workspace paths
]

def scrub_fact(fact: Fact) -> Fact:
    content = fact.content
    for pattern, replacement in SCRUB_PATTERNS:
        content = re.sub(pattern, replacement, content)
    return fact.with_content(content)
```

### Trade-offs

| Advantage | Disadvantage |
|---|---|
| Never blocks agent reasoning | 30s window means recent facts may be lost on crash |
| Automatic quality filtering via confidence | Confidence is agent-assigned (can be overconfident) |
| Bounded storage with intelligent eviction | Evicted facts are gone — no "soft delete" |
| Scrubbing prevents stale references | Aggressive scrubbing might remove useful context |

### Composes Well With

- **Workpad Pattern** (pattern 1): facts extracted from workpads at task completion
- **Sandbox State Propagation** (pattern 4): memory writes respect sandbox boundaries
- **Resume Semantics** (pattern 8): memory persists across retries

---

## 10. Fire-and-Record

**Source Project**: RuFlo

### When to Use

- When agent execution time is expensive and blocking is wasteful
- When coordination overhead should not appear on the critical path
- When you need auditability of all orchestration decisions
- When agents and orchestrators operate at different speeds

### How It Works

When an executor agent needs to communicate with the orchestrator (report
progress, signal completion, ask a question, report a failure), it writes an
event to the ledger and immediately continues working. It does not wait for
the orchestrator to acknowledge, process, or respond. The orchestrator reads
the ledger asynchronously, updates its state, and if it needs to redirect the
agent, writes a directive event that the agent picks up on its next natural
checkpoint.

This is the inverse of RPC-based coordination. In an RPC model, the agent
calls the orchestrator and blocks until it gets a response. In fire-and-record,
the agent writes and walks away. The orchestrator is eventually consistent,
not strongly consistent, and that's acceptable because agent work is
idempotent (or made idempotent by workspaces and self-checks).

### Event Flow

```
Timeline:
  t=0   Agent starts work on APEX-42
  t=5   Agent completes subtask A
        → ledger.record({type: "progress", subtask: "A", status: "done"})
        → Agent IMMEDIATELY starts subtask B (does not wait)
  t=6   Orchestrator reads ledger, updates state
  t=12  Agent completes subtask B
        → ledger.record({type: "progress", subtask: "B", status: "done"})
        → Agent starts subtask C
  t=13  Orchestrator reads ledger, notices subtask B conflicts with APEX-43
        → ledger.record({type: "directive", action: "pause subtask C, rebase first"})
  t=15  Agent reaches checkpoint, reads directives
        → Agent pauses subtask C, rebases, then continues
```

### Ledger Interface

```python
class OrchestratorLedger:
    def record(self, event: Event) -> None:
        """Append event. Returns immediately. Thread-safe."""
        self._log.append(event)
        self._notify()  # non-blocking signal to orchestrator

    def read_since(self, timestamp: datetime) -> list[Event]:
        """Read events since a timestamp. Non-blocking."""
        return [e for e in self._log if e.timestamp > timestamp]

    def directives_for(self, agent_id: str) -> list[Event]:
        """Read pending directives for an agent. Non-blocking."""
        return [
            e for e in self._log
            if e.target_agent == agent_id
            and e.event_type == "directive"
            and not e.acknowledged
        ]
```

### Event Types

| Type | Producer | Consumer | Purpose |
|---|---|---|---|
| `progress` | Agent | Orchestrator | Report subtask completion |
| `completion` | Agent | Orchestrator | Signal task is ready for review |
| `failure` | Agent | Orchestrator | Report unrecoverable error |
| `question` | Agent | Orchestrator/Human | Ask for clarification (async) |
| `directive` | Orchestrator | Agent | Redirect, pause, or modify agent behavior |
| `assignment` | Orchestrator | Agent | Assign new work |
| `budget_update` | Orchestrator | Agent | Adjust resource limits |

### Checkpoint Protocol

Agents check for directives at natural pause points:

```python
class AgentCheckpointMixin:
    def checkpoint(self) -> None:
        """Called between subtasks. Checks for orchestrator directives."""
        directives = self.ledger.directives_for(self.agent_id)
        for directive in directives:
            self.handle_directive(directive)
            directive.acknowledge()

    def handle_directive(self, directive: Event) -> None:
        match directive.payload["action"]:
            case "pause":
                self.pause_current_work()
            case "abort":
                self.abort_and_release()
            case "rebase":
                self.rebase_workspace()
            case "budget_update":
                self.update_sandbox(directive.payload["new_budget"])
```

### Why Not Webhooks/Callbacks?

Webhooks require the agent to expose an endpoint. Callbacks require the
orchestrator to maintain connections. Both add infrastructure complexity.
The ledger is a shared append-only log — the simplest possible coordination
primitive. It works in-process (shared memory), cross-process (shared file),
or cross-machine (shared database or message queue).

### Trade-offs

| Advantage | Disadvantage |
|---|---|
| Zero blocking on the agent's critical path | Eventual consistency means stale reads are possible |
| Simple implementation (append-only log) | Directive delivery has variable latency |
| Natural auditability (every event is logged) | Agents must implement checkpoint protocol |
| Works across process/machine boundaries | Ledger can grow large without compaction |

### Composes Well With

- **Ledger Pattern** (ARCHITECTURE.md section 8): this IS the ledger implementation
- **Resume Semantics** (pattern 8): ledger events survive agent restarts
- **Sandbox State Propagation** (pattern 4): budget updates via ledger directives

---

## Pattern Composition Guide

Most production systems use 4-6 of these patterns together. Here are
recommended compositions for common scenarios:

### Solo Developer Agent (simplest)

Patterns: Workpad + Resume Semantics + Dual-Stage Acceptance

A single agent works on one task at a time. The workpad tracks progress,
resume semantics handle failures, and dual-stage acceptance ensures quality.
No need for fire-and-record (no concurrent agents) or topology (only one worker).

### Small Team (3-5 agents)

Patterns: Workpad + Reversed Conversation + Resume Semantics + Fire-and-Record + Cost-Aware Routing

Multiple agents run in parallel under a single orchestrator (star topology).
Fire-and-record keeps coordination non-blocking. Cost-aware routing reduces
spend. Reversed conversation keeps humans in the loop without bottlenecking.

### Enterprise Pipeline (10+ agents)

All 10 patterns.

Large-scale orchestration needs the full toolkit: topology-aware distribution
for scaling, sandbox propagation for safety, elaboration rounds for complex
requirements, debounced memory for shared knowledge. The patterns compose
cleanly because they operate at different layers (coordination, safety,
quality, performance, knowledge).

---

## Appendix: Quick Reference

| # | Pattern | Core Idea | Source |
|---|---|---|---|
| 1 | Workpad | Persistent scratchpad per task | Symphony |
| 2 | Reversed Conversation | AI proposes, human verifies | Chorus |
| 3 | Elaboration Rounds | Structured Q&A before execution | Chorus |
| 4 | Sandbox State Propagation | Containment through hierarchy | DeerFlow |
| 5 | Topology-Aware Distribution | Match topology to task shape | RuFlo |
| 6 | Cost-Aware Model Routing | Cheapest model that can handle it | RuFlo |
| 7 | Dual-Stage Acceptance | Self-check + admin verification | Chorus |
| 8 | Resume Semantics | Persistent workspace, attempt counter | Symphony |
| 9 | Debounced Memory | Async writes, confidence thresholds | DeerFlow |
| 10 | Fire-and-Record | Non-blocking orchestration calls | RuFlo |

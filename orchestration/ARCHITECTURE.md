# Apex Forge: Multi-Agent Orchestration Architecture

Version: 0.1.0-draft
Status: RFC
Last Updated: 2026-03-29

---

## Table of Contents

1. [Overview](#overview)
2. [Core Model: Single-Authority Orchestrator](#1-core-model-single-authority-orchestrator)
3. [Task State Machine](#2-task-state-machine)
4. [Policy File: WORKFLOW.md](#3-policy-file-workflowmd)
5. [Workspace Isolation](#4-workspace-isolation)
6. [Role Enforcement](#5-role-enforcement)
7. [Memory Layer](#6-memory-layer)
8. [Subagent Safety](#7-subagent-safety)
9. [Ledger Pattern](#8-ledger-pattern)
10. [Skills Registry](#9-skills-registry)
11. [Control vs Autonomy Axis](#10-control-vs-autonomy-axis)
12. [Architecture Diagram](#architecture-diagram)

---

## Overview

Apex Forge's orchestration layer defines how multiple AI agents coordinate on
complex, multi-step tasks. It synthesizes proven patterns from several production
agent systems:

- **Symphony**: single-authority dispatch, policy files, workspace isolation
- **Chorus**: task state machines, role enforcement, dual-stage verification
- **DeerFlow**: memory curation, subagent safety, sandbox propagation
- **RuFlo**: ledger pattern, skills registry, topology-aware distribution

The design philosophy: **simple coordination primitives, strict safety boundaries,
pluggable everything else.** An orchestrator should be easy to reason about in
production, easy to debug when things go wrong, and impossible for agents to
subvert.

---

## 1. Core Model: Single-Authority Orchestrator

Derived from: **Symphony**

### Principle

One orchestrator process owns ALL dispatch decisions. There is no distributed
consensus, no leader election, no split-brain scenario. The orchestrator IS the
lock.

### Why Single-Authority

Distributed locking for agent coordination is a solved problem in databases,
but an unsolved problem in LLM agent systems. Agents are non-deterministic,
their execution time varies by orders of magnitude, and their failure modes
include "confidently doing the wrong thing for 10 minutes." A single-authority
model eliminates an entire class of coordination bugs:

- No two agents can claim the same task (single dispatch point)
- No phantom tasks from network partitions (no network involved in dispatch)
- No stale-lock recovery needed (orchestrator holds state in memory)
- Retry logic is trivial (orchestrator sees all failures immediately)

### In-Memory State

The orchestrator maintains four data structures:

```
running_tasks:   Map<TaskID, AgentHandle>    # currently executing
claimed_ids:     Set<TaskID>                 # assigned but not yet started
retry_attempts:  Map<TaskID, int>            # failure count per task
completed:       Set<TaskID>                 # terminal states (done/closed)
```

These are authoritative. The external task tracker (Linear, GitHub Issues, Jira)
is the source of truth for task *content*, but the orchestrator is the source of
truth for task *assignment state* during a run.

### Poll-Based Dispatch

The orchestrator runs a polling loop:

```
every polling_interval:
    1. Fetch open tasks from tracker
    2. Filter: not in claimed_ids, not in completed, dependencies met
    3. Sort by priority (DAG topological order, then explicit priority)
    4. While len(running_tasks) < max_concurrent_agents:
        task = next eligible task
        claim(task)
        spawn_agent(task)
```

Poll-based dispatch is deliberately chosen over event-driven. Events create
back-pressure problems when agents complete faster than new work arrives, and
they complicate retry logic. Polling is predictable, debuggable, and
self-healing (missed events are caught on the next poll).

### Bounded Concurrency

`max_concurrent_agents` is a hard ceiling, not a target. The orchestrator will
never exceed it, even if 50 tasks are eligible. This prevents resource
exhaustion (API rate limits, CPU, memory) and makes cost predictable.

Default: 3. Configurable in WORKFLOW.md.

### Failure Handling

When an agent exits:
- Exit code 0 → mark task as `to_verify`, schedule verification
- Exit code non-zero → increment `retry_attempts[task_id]`
  - If attempts < max_retries → return task to open pool
  - If attempts >= max_retries → mark task as `closed` with failure reason
- Agent timeout → kill agent, treat as non-zero exit

---

## 2. Task State Machine

Derived from: **Chorus**

### States

```
open → assigned → in_progress → to_verify → done
                                    ↓
                                  closed
```

| State | Meaning | Who transitions out |
|---|---|---|
| `open` | Available for assignment | Orchestrator |
| `assigned` | Claimed by an agent, not yet started | Agent (auto on start) |
| `in_progress` | Agent is actively working | Agent (on self-check pass) |
| `to_verify` | Agent believes work is complete, awaiting review | Admin / Human |
| `done` | Verified and accepted | Terminal |
| `closed` | Abandoned, failed, or rejected | Orchestrator or Admin |

### Transition Rules

Every transition is enforced at the service layer. Agents cannot skip states.

```python
ALLOWED_TRANSITIONS = {
    "open":        ["assigned"],
    "assigned":    ["in_progress", "open"],       # can release back
    "in_progress": ["to_verify", "open"],          # can release back
    "to_verify":   ["done", "in_progress"],        # reject sends back
    "done":        [],                             # terminal
    "closed":      ["open"],                       # reopen allowed
}
```

### Release Semantics

`release_task(task_id)` is a graceful unclaim. The agent gives up the task
without marking it as failed. Use cases:

- Agent detects it lacks context to complete the task
- Agent discovers a blocking dependency not captured in the DAG
- Agent's confidence in its approach drops below threshold

Release returns the task to `open` with a note explaining why. The next agent
to claim it sees the note and can adapt.

### DAG Dependencies

Tasks can declare dependencies:

```yaml
task: APEX-42
depends_on: [APEX-40, APEX-41]
```

The orchestrator surfaces blocking hints at claim-time. When an agent claims
APEX-42, the dispatch payload includes:

```json
{
  "blocking_info": {
    "APEX-40": "done",
    "APEX-41": "in_progress — est. 5 min remaining"
  }
}
```

This lets agents decide whether to wait or work on something else.

### Acceptance Criteria

Each task row carries per-task acceptance criteria:

```yaml
acceptance_criteria:
  - "All unit tests pass"
  - "No regressions in integration suite"
  - "API response time < 200ms for the new endpoint"
  - "Code reviewed by at least one human"
```

### Dual-Stage Verification

Verification happens in two stages:

**Stage 1: Developer Self-Check**
The agent runs its own verification before transitioning to `to_verify`.
It must provide evidence:

```json
{
  "self_check": {
    "tests_passed": true,
    "test_output": "42 passed, 0 failed, 0 skipped",
    "lint_clean": true,
    "acceptance_criteria_met": [
      {"criterion": "All unit tests pass", "evidence": "pytest output attached"},
      {"criterion": "No regressions", "evidence": "integration suite green"}
    ]
  }
}
```

**Stage 2: Admin/Human Verification**
A human reviewer (or admin agent with elevated privileges) inspects the work,
the self-check evidence, and the diff. Only they can transition `to_verify → done`.

If rejected, the task returns to `in_progress` with rejection feedback.

---

## 3. Policy File: WORKFLOW.md

Derived from: **Symphony**

### Purpose

WORKFLOW.md is an in-repo behavioral contract. It lives alongside the code,
is version-controlled, and defines how agents should behave for this specific
project. No external configuration server needed.

### Structure

The file has two sections: YAML front matter and a Jinja2 prompt template.

```yaml
# WORKFLOW.md
---
tracker: linear           # or: github, jira, custom
tracker_project: "APEX"   # project identifier in the tracker
polling_interval: 30s     # how often orchestrator checks for new tasks
max_concurrent: 3         # maximum parallel agents
max_retries: 3            # per-task retry limit
retry_backoff_base: 10s   # exponential backoff base
agent_command: "claude -p" # command to spawn an agent
timeout: 30m              # per-task timeout
workspace_root: "./.workspaces"
workspace_hooks:
  after_create: "./scripts/setup-workspace.sh"
  before_destroy: "./scripts/cleanup-workspace.sh"
autonomy_level: balanced  # high, balanced, or controlled
verification:
  require_self_check: true
  require_human_review: true
memory:
  backend: file            # file, sqlite, remote
  confidence_threshold: 0.7
  max_facts: 100
  debounce_interval: 30s
---
```

### Prompt Template

Below the front matter, WORKFLOW.md contains a Jinja2 template that defines the
system prompt for spawned agents:

```jinja2
You are an autonomous software engineer working on {{ tracker_project }}.

## Current Task
- Identifier: {{ issue.identifier }}
- Title: {{ issue.title }}
- Description: {{ issue.description }}
- Priority: {{ issue.priority }}
- Acceptance Criteria:
{% for criterion in issue.acceptance_criteria %}
  - {{ criterion }}
{% endfor %}

## Context
- Attempt number: {{ attempt }} (if > 1, review previous attempt notes)
- Dependencies: {{ issue.dependencies | join(", ") }}
- Workspace: {{ workspace_path }}

## Instructions
1. Read the codebase to understand the relevant area.
2. Implement the required changes.
3. Write tests covering the changes.
4. Run the full test suite.
5. Self-check against all acceptance criteria.
6. If all criteria met, submit for review.
7. If blocked, release the task with a detailed explanation.

{% if attempt > 1 %}
## Previous Attempt Notes
{{ previous_attempt_notes }}
{% endif %}
```

### Overrides

WORKFLOW.md supports per-task overrides via the tracker. Any field in the YAML
front matter can be overridden by a task label:

```
Label: apex:timeout=60m
Label: apex:max_retries=5
Label: apex:autonomy_level=controlled
```

The orchestrator merges these overrides at dispatch time.

---

## 4. Workspace Isolation

Derived from: **Symphony**

### Per-Task Deterministic Directories

Each task gets a workspace directory derived from its identifier:

```
.workspaces/
  APEX-40/
    code/          # git worktree or clone
    workpad.md     # scratchpad / audit trail
    state.json     # workspace metadata
    attempt.log    # log of all attempts
  APEX-41/
    ...
```

The directory name is deterministic: `slugify(task_identifier)`. This means
the same task always maps to the same workspace, regardless of which agent
claims it or how many times it's retried.

### Persistence Across Retries

Workspaces are NOT destroyed on failure. This is critical. When an agent fails
and the task is retried, the next agent inherits:

- The previous agent's code changes (uncommitted or on a branch)
- The workpad with notes about what was attempted
- The state.json with metadata about previous attempts
- The attempt.log with stdout/stderr from prior runs

This enables **resume semantics**: the retry agent can pick up where the previous
one left off, not start from scratch.

### Attempt Counter

The `attempt` counter is injected into every agent's prompt:

```
Attempt number: 3 (if > 1, review previous attempt notes)
```

Agents are expected to check `workpad.md` and `attempt.log` when `attempt > 1`.
This turns retries into continuations rather than restarts.

### Backoff Strategy

On failure:
- **Exponential backoff**: `base * 2^(attempt - 1)` with jitter
  - Attempt 1 failure → wait ~10s
  - Attempt 2 failure → wait ~20s
  - Attempt 3 failure → wait ~40s
- **Normal exit (continuation)**: 1s delay, then immediate re-dispatch
  - Used when an agent exits cleanly but the task isn't done
  - Example: agent hit a token limit and needs a fresh context window

### Workspace Hooks

Lifecycle hooks defined in WORKFLOW.md:

```yaml
workspace_hooks:
  after_create: "./scripts/setup-workspace.sh"
  before_destroy: "./scripts/cleanup-workspace.sh"
```

`after_create` runs once when the workspace is first created (not on retries).
Typical use: install dependencies, set up git worktree, copy config files.

`before_destroy` runs when the task reaches a terminal state and the workspace
is scheduled for cleanup. Typical use: archive logs, push branches.

---

## 5. Role Enforcement

Derived from: **Chorus**

### Principle

An agent's role determines which tools it can access. This is enforced at the
MCP server registration layer, not at the prompt layer. An agent literally
cannot call tools outside its role because those tools are never registered
in its MCP session.

### Role Definitions

```yaml
roles:
  pm:
    description: "Product Manager — analysis and planning"
    tools:
      - idea_analysis
      - proposal_creation
      - requirement_elaboration
      - task_creation
      - priority_assignment
      - dependency_mapping
    forbidden:
      - code_execution
      - file_write
      - git_commit
      - deploy

  developer:
    description: "Developer — implementation and testing"
    tools:
      - code_read
      - code_write
      - test_run
      - lint
      - git_operations
      - self_check
      - release_task
    forbidden:
      - task_creation
      - priority_assignment
      - approve_task
      - deploy

  admin:
    description: "Admin — verification and lifecycle"
    tools:
      - approve_task
      - reject_task
      - close_task
      - reopen_task
      - deploy
      - view_metrics
      - override_assignment
    forbidden:
      - code_write
      - git_commit
```

### Enforcement Mechanism

When the orchestrator spawns an agent, it configures the MCP server to only
expose tools matching the agent's role:

```python
def spawn_agent(task, role):
    allowed_tools = ROLES[role]["tools"]
    mcp_config = build_mcp_config(allowed_tools)
    agent = Agent(
        command=workflow.agent_command,
        mcp_config=mcp_config,
        environment={
            "TASK_ID": task.id,
            "ROLE": role,
            "WORKSPACE": task.workspace_path,
        }
    )
    return agent.start()
```

The agent receives an MCP session where unregistered tools simply don't exist.
There's no "access denied" error — the tool is invisible. This is defense in
depth: even if the agent's prompt is manipulated, it cannot escalate privileges.

### Role Assignment

Roles are assigned per-task in the tracker:

```yaml
task: APEX-42
role: developer
assignee: agent-pool
```

If no role is specified, the orchestrator infers from task type:
- Tasks labeled `feature`, `bug`, `chore` → developer
- Tasks labeled `proposal`, `analysis`, `requirement` → pm
- Tasks labeled `review`, `approve`, `deploy` → admin

---

## 6. Memory Layer

Derived from: **DeerFlow**

### Design Principle

Store LLM-curated facts, not raw conversation history. Raw history is
voluminous, noisy, and full of reasoning traces that are irrelevant to
future tasks. Instead, the memory layer stores distilled knowledge.

### Fact Structure

```json
{
  "id": "fact-0042",
  "content": "The payments module uses Stripe SDK v3.2, not the REST API directly",
  "confidence": 0.92,
  "source": "APEX-38 implementation",
  "created_at": "2026-03-29T14:30:00Z",
  "last_accessed": "2026-03-29T16:00:00Z",
  "tags": ["payments", "stripe", "architecture"]
}
```

### Confidence Thresholds

Every fact has a confidence score between 0.0 and 1.0.

- **>= 0.7** (default threshold): stored and retrievable
- **0.5 - 0.7**: stored but flagged as uncertain, shown with a warning
- **< 0.5**: discarded immediately, never stored

The threshold is configurable in WORKFLOW.md. Higher thresholds for
safety-critical projects, lower for exploratory work.

### Capacity Management

Maximum 100 facts (configurable). When the limit is reached:

1. Sort by confidence (descending)
2. Break ties by last_accessed (most recent wins)
3. Evict the lowest-ranking fact
4. Log the eviction for auditability

This ensures the memory layer stays focused on high-value, actively-used
knowledge.

### Upload-Event Scrubbing

When facts are created from agent sessions, the memory layer scrubs
session-scoped references:

- File paths like `/tmp/apex-workspace-abc123/src/main.rs` → `src/main.rs`
- Session IDs → removed
- Temporary URLs → removed
- Absolute paths within workspaces → converted to relative

This prevents future agents from chasing stale references.

### Debounced Async Writes

Memory writes are debounced and asynchronous:

```
Agent produces fact → enqueue to write buffer
                    → if buffer age < 30s, wait
                    → if buffer age >= 30s, flush to storage
                    → never block the agent's response path
```

The 30s debounce interval (configurable) batches rapid-fire facts into single
writes. This is critical for performance: memory I/O should never slow down
agent reasoning.

### Pluggable Storage Backend

The memory layer defines a simple interface:

```python
class MemoryBackend(Protocol):
    async def store(self, facts: list[Fact]) -> None: ...
    async def query(self, tags: list[str], limit: int) -> list[Fact]: ...
    async def evict(self, fact_ids: list[str]) -> None: ...
    async def all(self) -> list[Fact]: ...
```

Built-in implementations:
- **FileBackend**: JSON file, suitable for single-machine setups
- **SQLiteBackend**: local database, better for concurrent access
- **RemoteBackend**: HTTP API, for centralized memory across deployments

---

## 7. Subagent Safety

Derived from: **DeerFlow**

### Problem

When agents can spawn subagents, you get recursive execution. Without
guardrails, a buggy agent can spawn infinite subagents, or a subagent can
escalate privileges by spawning a parent-level agent.

### Tool Allowlist/Denylist

Every subagent has an explicit tool boundary:

```yaml
subagent_policy:
  researcher:
    allowed_tools: [web_search, read_file, summarize]
    disallowed_tools: [task, spawn_agent, code_write]
  coder:
    allowed_tools: [code_read, code_write, test_run]
    disallowed_tools: [task, spawn_agent, deploy]
```

The critical rule: `disallowed_tools: ["task"]` prevents recursive spawning.
A subagent cannot create new tasks or spawn further subagents unless explicitly
allowed.

### Sandbox State

Sandbox state is a first-class object that flows through the agent hierarchy:

```json
{
  "depth": 2,
  "max_depth": 3,
  "parent_id": "agent-001",
  "root_task": "APEX-42",
  "inherited_tools": ["code_read", "test_run"],
  "forbidden_tools": ["task", "spawn_agent", "deploy"],
  "resource_budget": {
    "api_calls_remaining": 50,
    "tokens_remaining": 100000,
    "wall_time_remaining_s": 300
  }
}
```

When a subagent is spawned, it inherits its parent's sandbox with additional
restrictions (never fewer). Depth is incremented. Budget is partitioned (not
shared — each child gets a slice of the parent's remaining budget).

### Thread Pool Separation

The orchestrator maintains separate thread pools:

```
scheduler_pool:  4 threads  — handles dispatch, state transitions, polling
executor_pool:  N threads  — handles agent execution (N = max_concurrent)
memory_pool:    2 threads  — handles async memory writes
```

This separation prevents deadlock. If all executor threads are occupied by
agents waiting on the scheduler, the scheduler still has its own threads to
process their requests. Without this separation, a full executor pool can
deadlock the entire system.

---

## 8. Ledger Pattern

Derived from: **RuFlo**

### Principle

Orchestration calls are fire-and-record, not blocking RPCs. When an executor
(worker agent) registers progress with the orchestrator, it must NOT wait for
a response before continuing work.

### The Rule

> "NEVER stop after calling the orchestrator -- IMMEDIATELY continue working."

This is the single most important behavioral rule for executor agents. Violation
causes cascading delays.

### Orchestrator as Ledger

The orchestrator is a ledger, not a router:

| Traditional RPC | Ledger Pattern |
|---|---|
| Agent calls orchestrator, waits for response | Agent writes to ledger, continues |
| Orchestrator processes, returns result | Orchestrator reads ledger, updates state |
| Agent acts on result | Agent checks ledger on next cycle |
| Synchronous, blocking | Asynchronous, non-blocking |

### Implementation

```python
class Ledger:
    """Append-only log of orchestration events."""

    def record(self, event: OrchestratorEvent) -> None:
        """Fire-and-forget. Returns immediately."""
        self.events.append(event)
        self.notify_orchestrator()  # non-blocking signal

    def query(self, task_id: str) -> list[OrchestratorEvent]:
        """Read events for a task. Non-blocking."""
        return [e for e in self.events if e.task_id == task_id]
```

### Event Types

```python
@dataclass
class OrchestratorEvent:
    task_id: str
    agent_id: str
    event_type: str    # "progress", "completion", "failure", "question"
    payload: dict
    timestamp: datetime
```

Example flow:
1. Agent completes a subtask → `ledger.record(progress_event)`
2. Agent immediately starts next subtask (does NOT wait)
3. Orchestrator picks up the event asynchronously
4. Orchestrator updates task state, adjusts plan if needed
5. If orchestrator needs to redirect the agent, it writes a directive event
6. Agent checks for directives on its next natural pause point

### Why Not Blocking?

LLM agents are expensive per-second. An agent waiting for an orchestrator
response is burning tokens (or at minimum, holding a context window open).
The ledger pattern ensures agents are always doing useful work.

---

## 9. Skills Registry

Derived from: **RuFlo**

### Concept

Skills are discoverable, reusable behavioral specifications for agents. Instead
of encoding all agent behavior in prompts, skills are registered in a searchable
catalog that agents query at runtime.

### Skill Definition

```yaml
skill:
  name: "code-review"
  version: "1.0.0"
  description: "Review code changes for correctness, style, and security"
  triggers:
    - task_type: "review"
    - label: "needs-review"
  inputs:
    - name: diff
      type: string
      required: true
    - name: language
      type: string
      required: false
  outputs:
    - name: review_comments
      type: list[ReviewComment]
    - name: approval
      type: boolean
  tools_needed:
    - code_read
    - comment_create
  estimated_tokens: 5000
  tags: ["code", "review", "quality"]
```

### Registry Operations

```python
class SkillsRegistry:
    def register(self, skill: SkillDefinition) -> None: ...
    def search(self, tags: list[str]) -> list[SkillDefinition]: ...
    def get(self, name: str, version: str = "latest") -> SkillDefinition: ...
    def list_all(self) -> list[SkillSummary]: ...
```

### Agent Workflow with Skills

1. Agent receives a task
2. Agent queries the registry: `registry.search(tags=task.labels)`
3. Registry returns matching skills, sorted by relevance
4. Agent selects the best-matching skill
5. Agent executes the skill's behavioral template with task-specific inputs
6. Skill outputs are recorded in the ledger

### Why a Registry?

Without a registry, every agent needs to know everything. With a registry,
agents are lightweight dispatchers that discover capabilities at runtime.
This enables:

- Adding new agent capabilities without modifying existing agents
- Versioning behaviors independently of the orchestrator
- A/B testing different skill implementations
- Cost estimation before execution (via `estimated_tokens`)

---

## 10. Control vs Autonomy Axis

### The Spectrum

Different projects need different levels of human oversight. Apex Forge
makes this configurable per-workflow, not hard-coded.

```
High Autonomy ←————————————————————→ High Control
  Symphony-style                      Chorus-style
  Agent runs to                       Human approves
  completion, human                   at every major
  reviews at end                      transition
```

### Three Modes

#### High Autonomy (Symphony-style)

```yaml
autonomy_level: high
```

- Agent receives task and works to completion
- No human checkpoints during execution
- Human reviews the final PR/output only
- Best for: well-defined tasks with clear acceptance criteria, trusted agents,
  low-risk changes

Transitions requiring human approval: `to_verify → done` only.

#### Balanced (Default)

```yaml
autonomy_level: balanced
```

- Human approves the plan before work begins
- Agent is autonomous during implementation
- Human reviews the final output
- Best for: most production workloads, moderate-risk changes

Transitions requiring human approval:
- `open → assigned` (plan review)
- `to_verify → done` (output review)

#### High Control (Chorus-style)

```yaml
autonomy_level: controlled
```

- Human approves at every major transition
- Agent proposes, human confirms, then agent proceeds
- Best for: high-risk changes, compliance-heavy environments, early-stage
  trust building with new agent configurations

Transitions requiring human approval:
- `open → assigned` (assignment review)
- `assigned → in_progress` (plan review)
- `in_progress → to_verify` (implementation review)
- `to_verify → done` (final review)

### Mode Switching

The autonomy level can be changed:
- Globally in WORKFLOW.md
- Per-task via tracker labels: `apex:autonomy_level=controlled`
- At runtime by an admin: `orchestrator.set_autonomy(task_id, "high")`

Tasks that fail multiple times automatically escalate one level toward
`controlled` to increase oversight.

---

## Architecture Diagram

```
                         +-------------------+
                         |   WORKFLOW.md     |
                         |  (Policy File)    |
                         +--------+----------+
                                  |
                                  | configures
                                  v
+-------------+         +--------+----------+         +-----------------+
|   Task      |  poll   |                   |  spawn  |   Agent Pool    |
|   Tracker   +-------->+   ORCHESTRATOR    +-------->+                 |
|  (Linear/   |         |  (Single Auth.)   |         | +-------------+ |
|   GitHub/   |         |                   |         | | PM Agent    | |
|   Jira)     |         | - State Machine   |         | | (role: pm)  | |
|             |         | - Dispatch Loop   |         | +-------------+ |
+-------------+         | - Retry Logic     |         | +-------------+ |
                        | - Concurrency Mgr |         | | Dev Agent   | |
                        |                   |         | | (role: dev) | |
                        +---+-------+---+---+         | +------+------+ |
                            |       |   |             | +------+------+ |
                            |       |   |             | | Admin Agent | |
                            |       |   |             | | (role: adm) | |
                            |       |   |             +-+------+------+-+
                            |       |   |                      |
                  +---------+       |   +--------+             |
                  v                 v            v             v
          +-------+-----+  +-------+----+  +----+------+  +---+--------+
          |   Skills    |  |   Memory   |  |  Ledger   |  |  Review    |
          |  Registry   |  |   Layer    |  | (Events)  |  |  Gate      |
          |             |  |            |  |           |  |            |
          | - Search    |  | - Facts    |  | - Record  |  | - Self-    |
          | - Match     |  | - Curate   |  | - Query   |  |   check    |
          | - Version   |  | - Evict    |  | - Notify  |  | - Admin    |
          +-------------+  | - Scrub    |  +-----------+  |   verify   |
                           +------+-----+                 +------+-----+
                                  |                              |
                                  v                              v
                           +------+-----+                 +------+-----+
                           |  Storage   |                 |  Human     |
                           |  Backend   |                 |  Gate      |
                           |            |                 |            |
                           | file/sql/  |                 | approve /  |
                           | remote     |                 | reject     |
                           +------------+                 +------------+


Task Lifecycle Flow:
====================

  open ──[dispatch]──> assigned ──[agent starts]──> in_progress
                          |                              |
                          |                              |
                    [release_task]                  [self-check]
                          |                              |
                          v                              v
                        open <──[reject]──── to_verify ──[approve]──> done
                                                |
                                           [max retries]
                                                |
                                                v
                                              closed


Role Enforcement (MCP Layer):
=============================

  +-------------------+     +-------------------+     +-------------------+
  |    PM Session     |     |   Dev Session     |     |  Admin Session    |
  |                   |     |                   |     |                   |
  | [idea_analysis]   |     | [code_read]       |     | [approve_task]    |
  | [proposal_create] |     | [code_write]      |     | [reject_task]     |
  | [requirement_elab]|     | [test_run]        |     | [close_task]      |
  | [task_creation]   |     | [lint]            |     | [deploy]          |
  | [priority_assign] |     | [git_operations]  |     | [view_metrics]    |
  |                   |     | [self_check]      |     |                   |
  | X code_write      |     | X task_creation   |     | X code_write      |
  | X git_commit      |     | X deploy          |     | X git_commit      |
  | X deploy          |     | X approve_task    |     |                   |
  +-------------------+     +-------------------+     +-------------------+
```

---

## Appendix: Configuration Reference

### Minimal WORKFLOW.md

```yaml
---
tracker: github
polling_interval: 30s
max_concurrent: 3
agent_command: "claude -p"
---
You are a developer agent. Task: {{ issue.title }}. Attempt: {{ attempt }}.
```

### Full WORKFLOW.md (all options)

```yaml
---
tracker: linear
tracker_project: "APEX"
tracker_api_key_env: "LINEAR_API_KEY"
polling_interval: 30s
max_concurrent: 3
max_retries: 3
retry_backoff_base: 10s
timeout: 30m
agent_command: "claude -p"
workspace_root: "./.workspaces"
workspace_hooks:
  after_create: "./scripts/setup-workspace.sh"
  before_destroy: "./scripts/cleanup-workspace.sh"
autonomy_level: balanced
verification:
  require_self_check: true
  require_human_review: true
memory:
  backend: sqlite
  confidence_threshold: 0.7
  max_facts: 100
  debounce_interval: 30s
subagent:
  max_depth: 3
  default_disallowed: ["task", "spawn_agent"]
skills:
  registry_path: "./skills/"
  auto_discover: true
---
```

---

## Appendix: Glossary

| Term | Definition |
|---|---|
| Orchestrator | Single-authority process that dispatches tasks to agents |
| Executor | Worker agent that performs the actual task |
| Ledger | Append-only event log for non-blocking coordination |
| Workpad | Per-task persistent scratchpad for notes and audit trail |
| Sandbox State | First-class containment object passed through agent hierarchy |
| Skill | Discoverable behavioral spec registered in the skills registry |
| Fact | LLM-curated knowledge stored in the memory layer |
| Release | Graceful unclaim of a task, returning it to the open pool |
| Self-check | Agent's own verification step before requesting human review |

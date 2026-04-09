---
name: apex-forge-parallel-dispatch
description: "Delegate 2+ independent tasks to parallel subagents. Use when facing multiple unrelated failures, independent subsystems, or tasks with no shared state."
---

# Parallel Dispatch

Delegate independent tasks to specialized subagents that run concurrently. Each agent gets isolated context and a focused scope.

## When to Use

- 2+ independent tasks that can be worked on without shared state
- Multiple unrelated failures (different subsystems)
- No sequential dependencies between tasks
- Speed matters: solve N problems in the time of 1

## When NOT to Use

- Related failures (one fix might fix others — investigate first)
- Tasks need full codebase context
- Exploratory debugging (don't know what's broken yet)
- Shared state that agents would interfere with

## Process

### 1. Identify Independent Domains

Group tasks by what they affect. Each group becomes one agent's scope.

```
Task: Fix auth tests + Fix API pagination + Fix CSS layout
→ 3 independent domains: auth, API, frontend
→ 3 parallel agents
```

### 2. Write Focused Agent Prompts

Each agent prompt must be:

- **Focused**: One clear problem domain
- **Self-contained**: All context needed (error messages, file paths, expected behavior)
- **Constrained**: Boundaries on what to touch
- **Specific output**: What should the agent return?

**Good prompt:**
```
Fix the auth token refresh test in src/__tests__/auth.test.ts.
Error: "Token expired" after mock clock advance.
Expected: Token auto-refreshes before expiry.
Constraints: Only modify auth.ts and auth.test.ts.
Return: Summary of changes + test results.
```

**Bad prompt:**
```
Fix all the tests.
```

### 3. Dispatch All Agents Concurrently

Use your agent platform's parallel dispatch mechanism:

- **Claude Code**: Multiple `Agent` tool calls in a single message
- **Codex**: Multiple parallel shell sessions
- **Gemini**: Concurrent agent invocations

All agents launch simultaneously. Do not wait for one to finish before starting the next.

### 4. Review and Integrate

When all agents complete:

1. Read each agent's summary
2. Check for conflicting changes (unlikely if domains are truly independent)
3. Run the full test suite to verify no cross-domain breakage
4. Spot-check any agent that reported issues

## Agent Sizing

| Task Type | Model/Approach |
|---|---|
| Mechanical (isolated, clear spec) | Fast/cheap model or agent |
| Integration (touches boundaries) | Standard model |
| Architecture/judgment | Most capable model |

## Anti-Patterns

| Pattern | Problem | Fix |
|---|---|---|
| Too broad scope | Agent wanders, touches unrelated code | Narrow to one subsystem |
| No context | Agent wastes time rediscovering the problem | Include error messages, file paths |
| No constraints | Agent refactors everything | Specify which files to modify |
| Vague output request | Can't verify success | Ask for specific deliverables |
| Dispatching dependent tasks | Agents interfere or produce conflicts | Sequence dependent tasks, parallelize independent ones |

# Apex Forge CLI Quick Reference

All state management goes through the `apex` CLI. Run commands in the shell.

```
# Project
apex init                              Initialize .apex/ directory
apex status [--json]                   Show current state
apex dashboard [--port PORT]           Start visual dashboard

# Tasks (state machine: open → assigned → in_progress → to_verify → done)
apex task create TITLE [DESC] [DEPS]   Create a task (DEPS = task IDs)
apex task assign TASK_ID               Assign (open → assigned)
apex task start TASK_ID                Start work (assigned → in_progress)
apex task submit TASK_ID EVIDENCE      Submit for review (in_progress → to_verify)
apex task verify TASK_ID [pass|fail]   Verify (to_verify → done or back to in_progress)
apex task block TASK_ID REASON         Block a task
apex task release TASK_ID              Release assignment
apex task list [--status STATUS]       List tasks, optionally filter
apex task next                         Show next available task (respects dependencies)
apex task get TASK_ID                  Show task details

# Memory (persistent facts with confidence scoring)
apex memory add FACT CONFIDENCE [TAGS] Add fact (confidence: 0.0-1.0)
apex memory list [--min N]             List facts, optionally filter by confidence
apex memory search QUERY               Search facts
apex memory inject                     Output facts as XML for prompt injection
apex memory prune                      Remove low-confidence facts
apex memory remove FACT_ID             Delete a specific fact

# Telemetry
apex telemetry start SKILL             Start tracking a skill run
apex telemetry end OUTCOME             End tracking (success|error|abort)
apex telemetry report                  Show usage analytics

# Recovery
apex recover                           Clean stale state, fix stuck tasks
```

## Cross-Agent Compatibility

This skill works with any AI agent that can execute shell commands. The protocol instructions above are universal. State management always goes through the `apex` CLI.

**Tool mapping — use whatever your agent provides:**

| Operation | What to do |
|---|---|
| Read a file | Use your agent's file-read capability |
| Execute a shell command | Use your agent's shell/terminal tool |
| Search code | Use your agent's code search capability |
| Track progress | Use `apex task` CLI commands via shell |
| Store knowledge | Use `apex memory` CLI commands via shell |

**Platform-specific installation:** See `references/platform-setup.md` in this skill's directory.

**Key principle:** The protocol (complexity routing, phase gates, TDD, evidence grading, verification) is pure instruction that works in any agent. The CLI handles state persistence. No agent-specific features required.

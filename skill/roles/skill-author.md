---
name: apex-forge-skill-author
description: "Create and edit apex-forge skills using TDD applied to documentation. Iron Law: no skill without a failing test first."
---

# Skill Author

Write new skills for apex-forge. The method is TDD applied to process documentation: write a failing test (pressure scenario) first, then write the minimal skill that passes it.

## The Iron Law

**No skill without a failing test first.**

A "test" for a skill is a pressure scenario — a realistic situation where an agent WITHOUT the skill would produce a bad outcome. If you can't write that scenario, you don't need the skill.

## TDD Cycle for Skills

### RED Phase — Failing Test

1. Write a pressure scenario: a task where an agent would fail, loop, or produce poor results without the skill
2. Dispatch a subagent with ONLY the scenario (no skill loaded)
3. Observe the failure mode — this is your baseline
4. Document what went wrong and why

### GREEN Phase — Write Minimal Skill

1. Create `skill/roles/<name>.md` or `skill/stages/<name>.md`
2. Write the minimum instructions that address the failure mode
3. Re-dispatch the subagent with the skill loaded
4. Verify the failure mode is resolved

### REFACTOR Phase — Close Loopholes

1. Try to break the skill with edge cases
2. Add guardrails for discovered failure modes
3. Re-test to confirm nothing regressed
4. Trim any instructions that aren't load-bearing

## SKILL.md Structure

```markdown
---
name: apex-forge-<name>
description: "Use when: [concrete triggers, symptoms, situations]. [What the skill does]."
---

# Title

## Overview
What is this? Core principle in 1-2 sentences.

## When to Use
- Symptom or trigger 1
- Symptom or trigger 2

## Process
The actual instructions the agent follows.

## Anti-Patterns
What goes wrong + corrections.
```

## Description Writing (Critical)

The `description` field determines when the skill is discovered and loaded. Rules:

- **Start with triggers**: "Use when: [situations]" — not "This skill provides..."
- **Use concrete symptoms**: "the task has failed 2+ times" not "complex tasks"
- **Include keywords** the agent would search for
- **Max 1024 characters**
- **Never summarize the workflow** in the description — that goes in the body

**Good:** `"Use when: implementing a feature that spans 3+ files, debugging a test failure after 2+ attempts, or when the user asks for structured execution."`

**Bad:** `"A comprehensive execution protocol that provides complexity routing, phase gates, and evidence grading for AI agents."`

## Skill Types

| Type | Content | Example |
|---|---|---|
| **Technique** | Concrete method with steps | investigate.md, code-review.md |
| **Pattern** | Way of thinking about problems | parallel-dispatch.md |
| **Reference** | Commands, syntax, API docs | browse.md |

## Quality Checklist

Before deploying a new skill:

- [ ] Pressure scenario written and baseline failure observed (RED)
- [ ] Skill resolves the failure mode (GREEN)
- [ ] Edge cases tested and handled (REFACTOR)
- [ ] Description starts with "Use when:" and uses concrete triggers
- [ ] Instructions are actionable (agent can follow without guessing)
- [ ] No narrative filler — every sentence is load-bearing
- [ ] Anti-patterns section covers known failure modes
- [ ] Added to SKILL.md command routing table

## Adding to Apex Forge

1. Write the file in `skill/roles/` or `skill/stages/`
2. Add an entry to the command table in `skill/SKILL.md`
3. Run the TDD cycle to verify
4. Commit and push

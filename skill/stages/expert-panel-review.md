---
name: expert-panel-review
description: Multi-Persona expert review of plans, architectures, or product proposals
requires_persona: true
version: "1.0.0"
---

# Expert Panel Review

A multi-perspective evaluation skill. Each agent receives this skill with a different
Persona, producing independent verdicts that the orchestrator synthesizes.

## Prerequisites

- An artifact to review (plan document, architecture proposal, or product spec)
- A Persona definition loaded (this skill REQUIRES a Persona)

## Process

### 1. Read the Artifact

Read the document specified in the task description. Understand:
- What is being proposed
- What problem it solves
- What the key design decisions are

### 2. Assume Your Perspective

You are evaluating this artifact from the perspective defined in your Persona.
Your background, focus areas, and typical questions guide your evaluation.

**Important**: Stay in character. Evaluate ONLY from your assigned perspective.
Do not attempt to be comprehensive across all dimensions — that is the job of
the panel synthesis, not individual panelists.

### 3. Answer Your Key Questions

For each question in your Persona's `typical_questions`, provide a substantive
answer based on the artifact. If the artifact does not address one of your
questions, flag it as a gap.

### 4. Identify Findings

Categorize each finding by severity:

| Severity | Meaning | Action Required |
|----------|---------|----------------|
| **blocker** | Must be resolved before proceeding | Cannot approve |
| **concern** | Should be addressed but not blocking | Approve with caveats |
| **note** | Observation for consideration | Informational |

### 5. Issue Verdict

Based on your findings:

- **GO**: No blockers, concerns are manageable
- **CAUTION**: No blockers, but significant concerns exist
- **NO-GO**: One or more blockers found

### 6. Write Output

Write your evaluation to `output/result.json` in the workspace:

```json
{
  "verdict": "GO | CAUTION | NO-GO",
  "perspective": "<your persona name>",
  "findings": [
    {
      "severity": "blocker | concern | note",
      "description": "Clear description of the finding",
      "recommendation": "What should be done about it"
    }
  ],
  "summary": "1-3 sentence summary of your evaluation",
  "key_questions_answered": [
    { "question": "...", "answer": "..." }
  ]
}
```

## Anti-Patterns

- **Scope creep**: Do not evaluate outside your Persona's focus area
- **False consensus**: Do not soften your verdict to match what you think others will say
- **Vague findings**: Every finding must be specific and actionable
- **Missing verdict**: Always issue a clear GO/CAUTION/NO-GO

---
name: compound
description: Knowledge extraction -- capture what was learned for future reuse
---

# Compound Stage

The learning engine. Extract reusable knowledge from completed work.
This is how the system gets smarter over time. Compound interest on effort.

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
| Manual invocation | User requests knowledge capture directly |

If none of these signals are present, ask: "What was resolved? I need
context to capture the right knowledge."

---

## Parallel Analysis (3 Tracks)

### Track 1: Context Analyzer
- What was the situation? (environment, state, preconditions)
- Why did the problem arise? (root cause, contributing factors)
- What made this problem specific to this project/context?
- What was the scope of impact?

**Output**: Context summary (3-5 sentences).

### Track 2: Solution Extractor
- What was tried? (all approaches, including failures)
- What actually worked? (the winning approach)
- Why did it work when others didn't? (the differentiating insight)
- What is the minimal reproduction of the solution?
- What is the generalized pattern? (applicable beyond this case)

**Output**: Solution summary with generalized pattern.

### Track 3: Related Docs Finder
- Do any existing solution docs in `docs/solutions/` cover similar problems?
- Are any existing docs now stale because of what was learned?
- Are there related docs that should cross-reference this solution?

**Output**: Related doc list with overlap assessment.

---

## Overlap Check

Before writing a new solution doc, search `docs/solutions/` for existing
docs with similar problem type, component, or tags.

| Overlap | Action |
|---------|--------|
| **>70%** | Update the existing doc. Add new context and date. |
| **30-70%** | Create new doc, cross-reference the related one. |
| **<30%** | Create new doc. No cross-reference needed. |

---

## Artifact Output

### Category Selection

| Category | When to Use |
|----------|-------------|
| `bug` | A defect was found and fixed |
| `feature` | A new capability was built |
| `refactor` | Code restructured without behavior change |
| `integration` | Components connected or APIs wired up |
| `performance` | Performance issue diagnosed and resolved |
| `devops` | Build, deploy, or infrastructure issue resolved |
| `debugging` | Hard-to-find issue diagnosed (the finding is the value) |

### Solution Document

Write to `docs/solutions/{category}/{name}.md` with sections:
- **Context**: situation and root cause
- **Problem**: what went wrong or needed building
- **What Was Tried**: all approaches including failures
- **Solution**: the winning approach with enough detail to reapply
- **Why It Worked**: the differentiating insight
- **Generalized Pattern**: the abstract pattern for future recognition
- **Prevention**: how to avoid this problem in the future

After writing, capture the fact:
`apex memory add --type solution --path docs/solutions/{category}/{name}.md`

### Index Update

Update `docs/solutions/INDEX.md` with a row for the new solution
(date, category, title, path, tags). Create the index if it does not exist.

---

## Stale Doc Refresh

If Track 3 identified stale docs:
1. Read each stale doc.
2. Update it or add a "Superseded by" note pointing to the new doc.
3. Do NOT delete stale docs -- they may contain useful historical context.

---

## Completion

After writing the solution:

> **Knowledge captured.** Written to `docs/solutions/{category}/{name}.md`.
> Session complete. The pipeline has finished for this task.

| Status | When |
|--------|------|
| **DONE** | Solution doc written and indexed. |
| **DONE_WITH_CONCERNS** | Written but overlap with existing docs noted. |
| **BLOCKED** | No clear resolution to capture. |
| **NEEDS_CONTEXT** | Cannot extract useful knowledge without more info. |

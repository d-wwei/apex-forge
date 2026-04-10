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

## Parallel Analysis (4 Tracks)

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

### Track 4: Iteration Reflector

After extracting what was learned, reflect on what comes next.

Think along these dimensions:
- **Unfinished edges**: What was descoped, deferred, or intentionally left incomplete?
- **Revealed complexity**: What turned out harder than expected? What deserves deeper investment?
- **New possibilities**: What new capabilities or directions does this iteration unlock?
- **Technical debt incurred**: What shortcuts were taken that should be addressed?
- **Quality gaps**: What areas lack tests, docs, monitoring, or error handling?
- **User-facing gaps**: What does the user still need that this iteration didn't cover?

For each item, assess:
- **Priority**: High (blocks next work or causes pain) / Medium (improves quality) / Low (nice-to-have)
- **Effort**: Small (< 1 day) / Medium (1-3 days) / Large (3+ days)
- **Value**: Why this matters — one sentence

**Output**: List of 3-8 concrete iteration opportunities, each with priority/effort/value.

Do NOT generate vague items like "improve performance" or "add more tests."
Each item must be specific enough that a future Brainstorm stage can act on it directly.

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
`apex memory add "Solution: docs/solutions/{category}/{name}.md" 0.9 solution {category}`

> **Pluggable backend**: The `apex memory add` command automatically selects the best
> available memory backend. If Agent Recall is running, the solution reference is stored
> in both `docs/solutions/` (file) and Agent Recall's database (searchable across sessions).
> If only the local backend is available, it goes to `docs/solutions/` + `.apex/memory.json`.

### Index Update

Update `docs/solutions/INDEX.md` with a row for the new solution
(date, category, title, path, tags). Create the index if it does not exist.

---

## Roadmap Update

After writing the solution doc, use Track 4 output to update the project Roadmap.

### Target File

`docs/iteration-roadmap.md` — create if it does not exist.

### Update Rules

1. **Append, don't overwrite**. New items go into the appropriate section. Existing items stay.
2. **Mark completed items**. If this iteration resolved a previously listed Roadmap item, move it to the "已完成里程碑" section with a completion date.
3. **Merge duplicates**. If Track 4 produces an item that overlaps >70% with an existing Roadmap entry, update the existing entry instead of adding a duplicate.
4. **Maintain priority order**. Within each tier, items are sorted by priority (High → Medium → Low).
5. **Record provenance**. Each new item includes `(来源: {iteration-name}, {date})` so future readers know when and why it was added.

### Roadmap Document Structure

If creating a new Roadmap, use this structure:

```markdown
# {Project Name} Roadmap

> 最后更新：YYYY-MM-DD

---

## 当前状态速览

- **已完成**：{one-line summary of what's done}
- **进行中**：{current focus}
- **下一步**：{highest-priority pending item}

---

## 已完成里程碑

- [x] **{name}** — {one-line summary} ({date})

---

## 高优先级

| 项目 | 现状 → 目标 | 预估 | 价值 | 来源 |
|------|------------|------|------|------|
| {item} | {current} → {target} | 小/中/大 | {why it matters} | ({iteration}, {date}) |

---

## 中优先级

| 项目 | 现状 → 目标 | 预估 | 价值 | 来源 |
|------|------------|------|------|------|

---

## 低优先级 / 探索方向

| 项目 | 说明 | 来源 |
|------|------|------|

---

## 技术债务

| 项目 | 位置 | 说明 | 来源 |
|------|------|------|------|

---

## 已知限制

| 限制 | 影响 | 可能的解法 |
|------|------|-----------|

---

## 建议的下一个迭代

1. {highest priority} — {one-line rationale}
2. ...
3. ...
```

### After Roadmap Update

Capture the update as a memory fact:
`apex memory add "Roadmap updated: {N} new items added to docs/iteration-roadmap.md" 0.7 roadmap iteration`

---

## Stale Doc Refresh

If Track 3 identified stale docs:
1. Read each stale doc.
2. Update it or add a "Superseded by" note pointing to the new doc.
3. Do NOT delete stale docs -- they may contain useful historical context.

---

## Completion

After writing the solution and updating the Roadmap:

> **Knowledge captured.** Solution: `docs/solutions/{category}/{name}.md`.
> **Roadmap updated.** {N} new items added to `docs/iteration-roadmap.md`.
> Session complete. The pipeline has finished for this task.

| Status | When |
|--------|------|
| **DONE** | Solution doc written, indexed, and Roadmap updated. |
| **DONE_WITH_CONCERNS** | Written but overlap with existing docs noted, or Roadmap items are low-confidence. |
| **BLOCKED** | No clear resolution to capture. |
| **NEEDS_CONTEXT** | Cannot extract useful knowledge without more info. |

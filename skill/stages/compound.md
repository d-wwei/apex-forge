---
name: compound
description: Knowledge extraction -- capture what was learned for future reuse
---

# Compound Stage

The learning engine. Extract reusable knowledge from completed work.
This is how the system gets smarter over time. Compound interest on effort.

---

**On entry:** `apex stage set compound`
**On completion:** `apex stage complete compound`

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

## Parallel Analysis (5 Tracks)

> **Canonical spec**: `workflow/stages/compound.md` — 所有平台 plugin 注册的执行入口。
> 以下为摘要，Track 的完整规则（筛子细节、决策表模板等）以 workflow 版为准。

| Track | 职责 | Output |
|-------|------|--------|
| 1. Context Analyzer | 提取情境、根因、影响范围 | Context summary (3-5 sentences) |
| 2. Solution Extractor | 提取方案、失败尝试、泛化模式 | Solution summary with generalized pattern |
| 3. Related Docs Finder | 查找相关/过时文档 | Related doc list with overlap assessment |
| 4. Iteration Reflector | 6 维反思 + 迭代机会 + 路线图快照 | 3-8 iteration opportunities + roadmap snapshot |
| 5. Memory Router | 三筛子（泛化性/复现性/衰减性）路由知识到正确记忆层级 | 路由决策表 + 记忆文件写入 |

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

## Roadmap Snapshot

Handled by the `iteration-reflector` skill (invoked in Track 4).
The skill generates a new immutable snapshot in `docs/roadmaps/roadmap-{timestamp}.md` —
prior snapshot reading, verification-based completion detection, duplicate merging,
and memory capture are all encapsulated in the skill.

---

## Stale Doc Refresh

If Track 3 identified stale docs:
1. Read each stale doc.
2. Update it or add a "Superseded by" note pointing to the new doc.
3. Do NOT delete stale docs -- they may contain useful historical context.

---

## Completion

After writing the solution and invoking the iteration-reflector skill:

> **Knowledge captured.** Solution: `docs/solutions/{category}/{name}.md`.
> **Roadmap updated** by iteration-reflector skill.
> Session complete. The pipeline has finished for this task.

| Status | When |
|--------|------|
| **DONE** | Solution doc written, indexed, and Roadmap updated. |
| **DONE_WITH_CONCERNS** | Written but overlap with existing docs noted, or Roadmap items are low-confidence. |
| **BLOCKED** | No clear resolution to capture. |
| **NEEDS_CONTEXT** | Cannot extract useful knowledge without more info. |

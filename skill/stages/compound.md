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

Delegate to the `iteration-reflector` skill.

Pass Tracks 1-3 output as context. The skill handles:
- 6-dimension reflection (unfinished edges, revealed complexity, new possibilities, tech debt, quality gaps, user-facing gaps)
- Priority/effort/value assessment for each item
- Roadmap snapshot generation (`docs/roadmaps/roadmap-{timestamp}.md`)

See `bindings.yaml` compound section for dispatch configuration.

**Output**: 3-8 concrete iteration opportunities + new roadmap snapshot.

### Track 5: Memory Router

对 Track 1-4 提取出的每条知识，过三个筛子，决定写入哪个记忆层级。

#### 筛子 1：泛化性测试

把知识中的项目名、文件路径、技术栈名词全部去掉。
剩下的内容还有没有指导意义？

- **有** → 候选全局
- **没有** → 项目级，跳过后续筛子

#### 筛子 2：复现性测试

这条经验在一个完全不同的项目（不同语言、不同领域）中会不会遇到？

- **会** → 确认全局
- **不会** → 项目级

#### 筛子 3：衰减性测试

这条知识一年后还成立吗？

- **成立**（原理级）→ 全局
- **可能过时**（工具/API/版本相关）→ 项目级

#### 路由判定

三个筛子的组合决定路由：

- **三筛均通过** 且知识在本项目有具体实例（具体文件路径、具体配置值、具体错误信息）→ **双写**：全局写泛化版本，项目写具体版本
- **三筛均通过** 且知识本身已是抽象原理 → **全局**
- **任一筛子未通过** → **项目级**

#### 路由动作

| 分类 | 写入位置 | 示例 |
|------|---------|------|
| 全局模式 | `~/.claude/memory/` + 全局 `MEMORY.md` | "进程隔离三要素"、"TDD 和 Review 的互补性" |
| 项目经验 | 项目级 `memory/` + 项目 `MEMORY.md` | "本项目 orchestrator 的 retry 路径在 L275" |
| 两者都写 | 全局写泛化版本，项目写具体版本 | 全局："exit 0≠成功"；项目："result.json 必须含 verdict 字段" |

#### 输出格式

在 compound 结束前，输出路由决策表：

```
Memory Router 决策

┌─────┬──────────────┬──────┬──────┬──────┬──────┐
│  #  │ 知识点       │ 泛化 │ 复现 │ 衰减 │ 路由 │
├─────┼──────────────┼──────┼──────┼──────┼──────┤
│ 1   │ {知识描述}   │ ✓    │ ✓    │ 稳定 │ 全局 │
├─────┼──────────────┼──────┼──────┼──────┼──────┤
│ 2   │ {知识描述}   │ ✗    │ -    │ -    │ 项目 │
├─────┼──────────────┼──────┼──────┼──────┼──────┤
│ 3   │ {知识描述}   │ ✓    │ ✓    │ 易变 │ 项目 │
├─────┼──────────────┼──────┼──────┼──────┼──────┤
│ 4   │ {知识描述}   │ ✓    │ ✓    │ 稳定 │ 双写 │
└─────┴──────────────┴──────┴──────┴──────┴──────┘
```

输出决策表后，按路由结果执行写入。

**Output**: 路由决策表 + 对应层级的记忆文件已写入。

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

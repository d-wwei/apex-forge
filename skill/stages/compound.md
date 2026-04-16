---
name: compound
description: Knowledge extraction -- capture what was learned for future reuse
---

# Compound Stage

The learning engine. Extract reusable knowledge from completed work — compound interest on effort.
**On entry:** `apex stage set compound` | **On completion:** `apex stage complete compound`
## Trigger Conditions

| Signal | Detection |
|--------|-----------|
| Resolution | "That worked" / "it's fixed" / "merged" / "shipped" |
| Pipeline completion | Ship stage completed successfully |
| Bug resolved | A debugging session reached a fix |
| Pattern discovered | A non-obvious approach was found |
| Workaround found | A limitation was circumvented |
| Manual invocation | User requests knowledge capture directly |

If none present, ask: "What was resolved?"
**Upstream Entry Verification:** (1) git commit exists for this run; (2) Review artifact is DONE or DONE_WITH_CONCERNS. If not: instruct user to complete Ship first.

## Parallel Analysis (5 Tracks)

> **Canonical spec**: `workflow/stages/compound.md` — Track 完整规则以 workflow 版为准。

| Track | 职责 | Output |
|-------|------|--------|
| 1. Context Analyzer | 提取情境、根因、影响范围 | Context summary (3-5 sentences) |
| 2. Solution Extractor | 提取方案、失败尝试、泛化模式 | Solution summary with generalized pattern |
| 3. Related Docs Finder | 查找相关/过时文档 | Related doc list with overlap assessment |
| 4. Iteration Reflector | 6 维反思 + 迭代机会 + 路线图快照 | 3-8 iteration opportunities + roadmap snapshot |
| 5. Memory Writer | 将教训/模式写入项目记忆或全局记忆（硬门控） | 记忆文件 + MEMORY.md 更新 |

## Overlap Check

Before writing, search `docs/solutions/` for existing docs with similar problem type, component, or tags.

| Overlap | Action |
|---------|--------|
| **>70%** | Update the existing doc. Add new context and date. |
| **30-70%** | Create new doc, cross-reference the related one. |
| **<30%** | Create new doc. No cross-reference needed. |

## Artifact Output — Category Selection

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

Write to `docs/solutions/{category}/{name}.md`. Full section list: see `skill/details/compound-template.md` § Solution Document Required Sections.
After writing, update `docs/solutions/INDEX.md` (date, category, title, path, tags). Create if absent.
**Roadmap Snapshot:** Handled by `iteration-reflector` skill (Track 4) — immutable snapshot in `docs/roadmaps/roadmap-{timestamp}.md`.
**Stale Doc Refresh:** If Track 3 found stale docs: update each or add "Superseded by" note. Do NOT delete.
## Memory Write (HARD GATE)

```
MANDATORY: every lesson/pattern from Tracks 1-4 MUST be written to memory
before the Exit Gate. Skipping = S5 fails = stage cannot complete.
```

### Step 1: Collect Lessons

| Type | Description | Example |
|------|-------------|---------|
| `feedback` | Agent behavior correction or confirmation | "折叠粒度应对齐信息层级" |
| `pattern` | Reusable architectural/process pattern | "恢复触发条件决定存储层" |
| `project` | Project-specific fact or decision | "Dashboard 前端是 vanilla JS" |

If no lessons extracted: Compound quality failure — redo analysis.
**Steps 2–5** (Classify → Write → Propose Global → Verify): see `skill/details/compound-template.md` § Memory Write — Steps 2–5.
## Exit Gate — `gates/stage-exit-gate.md`

### Structural Checks

| # | Check | Criterion | Verification |
|---|-------|-----------|-------------|
| S1 | Solution doc (this cycle) | `docs/solutions/{category}/{name}.md` created or modified this pipeline cycle (mtime after `apex stage set brainstorm` or in `git diff --name-only`). Prior-cycle docs do not satisfy. | Timestamp or git diff |
| S2 | Root Cause section | Doc contains "Root Cause" or "Problem" + cause analysis | Section scan |
| S3 | Prevention section | Doc contains "Prevention" section | Section scan |
| S4 | Roadmap snapshot (this cycle) | `docs/roadmaps/roadmap-*.md` created this pipeline cycle (not pre-existing). Check mtime or `git status`. | Timestamp or git status |
| S5 | Memory entry | At least 1 memory file written this session | Memory dir check |
| S6 | Re-entry prompt issued | The 3-option AskUserQuestion (继续/新进程/结束) was actually called and user responded. Skipping = gate violation. | User response recorded |

### Substance Prompts (Tier 2+)

| # | Prompt | Cross-reference |
|---|--------|----------------|
| Q1 | Does root cause analysis name a specific code path, design decision, or missing constraint — not just a symptom? | Solution doc |
| Q2 | Does the roadmap snapshot reflect current code? Cross-check against git log; flag stale or already-done items. | Roadmap, git log |

## Completion

After solution written and iteration-reflector invoked, report:
> **Knowledge captured.** Solution: `docs/solutions/{category}/{name}.md`. Roadmap updated.
Call `AskUserQuestion` with:
- question: "复盘完成。下一步？"
- header: "Pipeline"
- options:
  1. label: "继续下一个迭代 (Recommended)", description: "在当前会话中重置 pipeline，进入新任务"
  2. label: "在新进程中继续 roadmap", description: "结束当前会话，输出续接提示词供粘贴到新会话使用（避免上下文过长浪费 token）"
  3. label: "结束本轮", description: "保持 compound 状态，下次回来可以看到上轮完成记录"
Full detail for each option: see `skill/details/compound-template.md` § Completion Options — Full Detail.

| Status | When |
|--------|------|
| **DONE** | Solution doc written, indexed, and Roadmap updated. |
| **DONE_WITH_CONCERNS** | Written but overlap with existing docs noted, or Roadmap items are low-confidence. |
| **BLOCKED** | No clear resolution to capture. |
| **NEEDS_CONTEXT** | Cannot extract useful knowledge without more info. |

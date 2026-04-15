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

### Upstream Entry Verification

Before starting Compound work, verify Ship stage completeness:

1. A git commit must exist for this pipeline run (check `git log` and .apex/state.json).
2. Review artifact status must be DONE or DONE_WITH_CONCERNS.
3. If neither condition is met: instruct user to complete Ship first.

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
| 5. Memory Writer | 将教训/模式写入项目记忆或全局记忆（硬门控） | 记忆文件 + MEMORY.md 更新 |

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

## Memory Write (HARD GATE)

```
================================================================
  THIS STEP ENFORCES MANDATORY MEMORY WRITE.

  After pattern extraction (Tracks 1-4), every lesson/pattern
  MUST be written to memory before the Exit Gate.

  Skipping this step = Exit Gate S5 fails = stage cannot complete.
================================================================
```

### Step 1: Collect Lessons

From the Compound analysis (Tracks 1-4), extract every discrete lesson, pattern, or feedback item.
Each item is one of these types (matching the project memory schema):

| Type | Description | Example |
|------|-------------|---------|
| `feedback` | Agent behavior correction or confirmation | "折叠粒度应对齐信息层级" |
| `pattern` | Reusable architectural/process pattern | "恢复触发条件决定存储层" |
| `project` | Project-specific fact or decision | "Dashboard 前端是 vanilla JS" |

If no lessons were extracted, this is a Compound quality failure — go back and do the analysis properly.

### Step 2: Classify Each Lesson

**Default: project memory.** Every lesson goes to project memory unless it meets the global promotion criteria.

**Global promotion criteria** (ALL must be true):
1. **跨项目通用**: The lesson applies to ANY project using apex-forge, not just this codebase
2. **不依赖项目上下文**: Understanding the lesson does not require knowing this project's architecture
3. **长期有效**: The lesson won't become stale when this project's code changes

Examples:
- "UI 折叠粒度对齐信息层级" → **Global** (universal UI principle)
- "TDD + Review 互补性" → **Global** (universal process principle)
- "Dashboard 前端用 sessionStorage 而非 localStorage" → **Project** (specific to this codebase)
- "apex dashboard 通过 #project= hash 传递项目路径" → **Project** (specific implementation detail)

### Step 3: Write Project Memory

For each lesson classified as project-level:

1. Write memory file to the project memory directory:
   ```
   {project_memory_dir}/{type}_{kebab_name}.md
   ```
   With frontmatter:
   ```yaml
   ---
   name: {lesson title}
   description: {one-line summary for MEMORY.md index}
   type: {feedback|pattern|project}
   ---

   {lesson content}

   **Why:** {reason/context}
   **How to apply:** {when/where this applies}
   ```

2. Append to `MEMORY.md` index:
   ```
   - [{title}]({filename}) — {one-line hook, under 150 chars}
   ```

3. Before writing, check if an existing memory covers the same topic — update instead of duplicate.

### Step 4: Propose Global Promotions

For each lesson that meets the global promotion criteria.
**If no lessons qualify for global promotion, skip this step entirely.**

1. Present to user via `AskUserQuestion`:
   - question: "以下教训具有跨项目通用性，是否写入全局记忆？"
   - header: "Global Memory"
   - For each candidate, list as an option with description
   - Include a "全部跳过" option

2. For user-approved items, write to global memory directory (`~/.claude/memory/`):
   - Same frontmatter format as project memory
   - Append to global `MEMORY.md` index

3. If user declines all, that's fine — project memory is already written (Step 3).

### Step 5: Verification

After writing, verify:
- [ ] At least 1 new memory file exists in project memory dir (mtime this session)
- [ ] MEMORY.md index updated with new entry
- [ ] No duplicate entries in MEMORY.md

If verification fails, fix before proceeding to Exit Gate.

---

## Exit Gate

Before `apex stage complete compound`, run the Stage Exit Gate (`gates/stage-exit-gate.md`).

### Structural Checks

| # | Check | Criterion | Verification |
|---|-------|-----------|-------------|
| S1 | Solution doc exists (this iteration) | `docs/solutions/{category}/{name}.md` was **created or modified during the current pipeline cycle** (mtime after `apex stage set brainstorm` timestamp, or appears in `git diff --name-only` since cycle start). Historical docs from prior iterations do not satisfy this check. | File read + timestamp or git diff |
| S2 | Root Cause section | Document contains "Root Cause" or "Problem" + cause analysis section | Section scan |
| S3 | Prevention section | Document contains "Prevention" section | Section scan |
| S4 | Roadmap snapshot (this iteration) | `docs/roadmaps/roadmap-*.md` was **created during the current pipeline cycle** (not a pre-existing file). Check mtime or `git status`/`git diff`. | File existence + timestamp |
| S5 | Memory entry | At least 1 memory file written this session | Memory directory check |
| S6 | Re-entry prompt issued | The 3-option AskUserQuestion (继续/新进程/结束) in the Completion section was **actually called** and user responded. Silently skipping or ending without this prompt is a gate violation. | Flow check: user response recorded |

### Substance Prompts (Tier 2+)

| # | Prompt | Cross-reference |
|---|--------|----------------|
| Q1 | Is the root cause analysis genuine? Does it identify an actual root cause (a specific code path, design decision, or missing constraint), or does it describe a symptom ("the test was failing")? A genuine root cause explains WHY the problem occurred. | Solution doc |
| Q2 | Does the roadmap snapshot reflect current project state? Read the roadmap and cross-reference against actual code and recent git history. Flag any item that references files that don't exist or marks something pending that is actually done. | Roadmap file, git log, codebase |

---

## Completion

After writing the solution and invoking the iteration-reflector skill:

> **Knowledge captured.** Solution: `docs/solutions/{category}/{name}.md`.
> **Roadmap updated** by iteration-reflector skill.

After reporting, call `AskUserQuestion` with:
- question: "复盘完成。下一步？"
- header: "Pipeline"
- options:
  1. label: "继续下一个迭代 (Recommended)", description: "在当前会话中重置 pipeline，进入新任务"
  2. label: "在新进程中继续 roadmap", description: "结束当前会话，输出续接提示词供粘贴到新会话使用（避免上下文过长浪费 token）"
  3. label: "结束本轮", description: "保持 compound 状态，下次回来可以看到上轮完成记录"

**After the user responds** (regardless of choice), record the checkpoint:
```bash
apex compound checkpoint re-entry-prompt
```
This is a hard gate — `apex stage complete compound` will BLOCK if this checkpoint is missing (S6).

**Option A: "继续下一个迭代"**

1. `apex stage set idle`
2. Call `AskUserQuestion` with:
   - question: "请描述下一个任务"
   - header: "New Task"
   - options:
     1. label: "我来输入", description: "在下方输入新任务描述"
3. When user responds, call `Skill('apex-forge', args=user's response)` to re-enter the full pipeline.
   **CRITICAL: Do NOT process the task directly. The Skill tool invocation triggers Initialization → Complexity Router → proper stage tracking. Skipping this = the bug where Dashboard shows nothing.**

**Option B: "在新进程中继续 roadmap"**

Generate a self-contained continuation prompt and output it for the user to copy-paste into a new session. The prompt must contain everything the new session needs to pick up where this one left off.

1. Read the latest roadmap: `docs/roadmaps/roadmap-*.md` (most recent by filename)
2. Read incomplete/pending roadmap items
3. Read recent solution docs for context: `docs/solutions/INDEX.md`
4. Read `.apex/tasks.json` for any unfinished tasks
5. Generate the prompt using this template:

````markdown
请复制以下内容到新的 Claude Code 会话中：

---

/apex-forge

## 续接上下文

上一轮迭代已完成，以下是续接信息：

### 最近完成的工作
{从本次 Compound 的 solution doc 中提取 1-3 句话总结}

### Roadmap 待办项
{从最新 roadmap 文件中提取所有 status != done 的项目，按优先级排列}
{每项格式: - [priority] title — description}

### 未完成的任务
{从 .apex/tasks.json 中提取 status != done 的任务}
{如果全部完成，写 "无"}

### 关键决策记录
{从本次迭代中提取影响后续工作的决策，如架构选择、技术限制}

### 请执行
从 Roadmap 待办项中选取优先级最高的一项，启动新迭代。
````

6. Output the generated prompt wrapped in a code block
7. Tell the user: "粘贴到新会话即可继续。新会话会自动读取 Roadmap 和项目状态。"
8. `apex stage set idle` (reset for clean state when new session starts)

**Prompt generation rules:**
- The prompt must be **self-contained** — new session has no access to this conversation's context
- Include concrete file paths, not references like "上次的 roadmap"
- Include actual content, not "请读取 X 文件" — the prompt should work even if files are unavailable
- Keep under 500 words — enough context without overwhelming the new session's context window
- End with a clear action directive — what to do first

**Option C: "结束本轮"**

Keep stage at `compound`. Do NOT set idle. User will see the completed pipeline state when they return.

| Status | When |
|--------|------|
| **DONE** | Solution doc written, indexed, and Roadmap updated. |
| **DONE_WITH_CONCERNS** | Written but overlap with existing docs noted, or Roadmap items are low-confidence. |
| **BLOCKED** | No clear resolution to capture. |
| **NEEDS_CONTEXT** | Cannot extract useful knowledge without more info. |

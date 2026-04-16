---
parent: compound
description: Full templates and procedures for Solution Document, Memory Write steps 2-5, and Completion options
---

# Compound — Detail Templates

---

## Solution Document Required Sections

Write to `docs/solutions/{category}/{name}.md` with ALL of the following sections:

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

---

## Memory Write — Steps 2–5

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

## Completion Options — Full Detail

### Option A: "继续下一个迭代"

1. `apex stage set idle`
2. Call `AskUserQuestion` with:
   - question: "请描述下一个任务"
   - header: "New Task"
   - options:
     1. label: "我来输入", description: "在下方输入新任务描述"
3. When user responds, call `Skill('apex-forge', args=user's response)` to re-enter the full pipeline.
   **CRITICAL: Do NOT process the task directly. The Skill tool invocation triggers Initialization → Complexity Router → proper stage tracking. Skipping this = the bug where Dashboard shows nothing.**

### Option B: "在新进程中继续 roadmap"

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

**Prompt generation rules (8 rules):**
1. The prompt must be **self-contained** — new session has no access to this conversation's context
2. Include concrete file paths, not references like "上次的 roadmap"
3. Include actual content, not "请读取 X 文件" — the prompt should work even if files are unavailable
4. Keep under 500 words — enough context without overwhelming the new session's context window
5. End with a clear action directive — what to do first
6. Use the exact `/apex-forge` invocation at the top so the new session enters the pipeline
7. List roadmap items verbatim — do not summarize or paraphrase them
8. Mark any items from `.apex/tasks.json` that were blocked, not just pending

### Option C: "结束本轮"

Keep stage at `compound`. Do NOT set idle. User will see the completed pipeline state when they return.

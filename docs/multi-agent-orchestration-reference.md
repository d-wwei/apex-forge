# Apex-Forge 多 Agent 调度机制：完整参考文档

> 基于仓库 `apex-forge` 代码实际情况编写。所有结论均有对应源码位置。
> 仓库总代码量：~19,266 行 TypeScript（`src/` 目录）。运行时：Bun。
> 最后更新：2026-04-13

---

## 目录

1. [架构总览](#1-架构总览)
2. [编排器核心 — orchestrator.ts](#2-编排器核心)
3. [适配器层 — adapters/](#3-适配器层)
4. [双模式调度 — Mode 1 vs Mode 2](#4-双模式调度)
5. [任务模板注册 — registry-seeds.yaml](#5-任务模板注册)
6. [Prompt 构建 — prompt-builder.ts](#6-prompt-构建)
7. [工作空间隔离 — workspace.ts](#7-工作空间隔离)
8. [结果收集与合成 — result-collector.ts](#8-结果收集与合成)
9. [结果验证 — result-validator.ts](#9-结果验证)
10. [重试与退避 — retry.ts](#10-重试与退避)
11. [任务状态机 — tasks.ts + task.ts](#11-任务状态机)
12. [事件溯源 — event-log.ts](#12-事件溯源)
13. [记忆后端 — memory/](#13-记忆后端)
14. [人格系统 — personas/](#14-人格系统)
15. [技能绑定 — bindings.yaml](#15-技能绑定)
16. [阶段门控 — stage-exit-gate.md](#16-阶段门控)
17. [共识模块 — consensus/](#17-共识模块)
18. [Dashboard 可视化 — dashboard.ts](#18-dashboard-可视化)
19. [协议层调度角色 — skill/roles/](#19-协议层调度角色)
20. [配置系统 — config.ts + config.yaml](#20-配置系统)
21. [运行模型与生命周期](#21-运行模型与生命周期)

---

## 1. 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                    Protocol Layer (SKILL.md)                 │
│  阶段门控 · TDD 铁律 · 证据分级 · Git 操作互锁 · 复杂度路由  │
├─────────────────────────────────────────────────────────────┤
│              Orchestrator (src/orchestrator.ts)              │
│  DAG 调度 · 并发控制 · 重试队列 · 模板匹配 · 结果合成        │
├─────────────────────────────────────────────────────────────┤
│              Adapter Layer (src/adapters/)                   │
│  Claude · Codex · Gemini — 统一接口，child_process 子进程    │
├─────────────────────────────────────────────────────────────┤
│              Workspace Layer                                │
│  Git Worktree 隔离 · 权限注入 · DAG Artifact 传递            │
├─────────────────────────────────────────────────────────────┤
│              State Layer                                    │
│  Event Sourcing (JSONL) · tasks.json · state.json · memory  │
├─────────────────────────────────────────────────────────────┤
│              Consensus Layer (可选，未在主流程启用)            │
│  Raft · PBFT · CRDT · Gossip — 分布式 Agent 集群预留         │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 编排器核心

**文件**: `src/orchestrator.ts`（499 行）

### 2.1 入口函数

```typescript
// src/orchestrator.ts:143
export async function runOrchestrator(args: string[]): Promise<void>
```

由 CLI 调用入口：`src/cli.ts:653-655`

```typescript
case "orchestrate":
  const { runOrchestrator } = await import("./orchestrator.js");
  await runOrchestrator(rest);
```

支持参数：
- `--dry-run`：只打印调度计划，不实际 spawn
- `--once`：跑一轮 poll cycle 后退出

### 2.2 主循环

```typescript
// src/orchestrator.ts:175-180
while (!shuttingDown) {
  const allDone = await pollCycle(config, adapters, registry, running,
                                   retryQueue, completedResults, dryRun);
  if (once || dryRun || allDone) break;
  await Bun.sleep(config.polling_interval_ms);  // 默认 30000ms
}
```

**不是 daemon**。前台阻塞的 while 循环，占住终端。退出条件：
- `--once` 模式跑完一轮
- 所有 task 状态为 `done`
- 用户 Ctrl-C（SIGINT）或 SIGTERM

### 2.3 优雅退出（Drain）

```typescript
// src/orchestrator.ts:182-194
if (running.size > 0) {
  const drainTimeout = once ? config.idle_timeout_ms : 30000;
  const deadline = Date.now() + drainTimeout;
  while ((running.size > 0 || retryQueue.length > 0) && Date.now() < deadline) {
    await Bun.sleep(1000);
    await pollCycle(..., false, true);  // reapOnly=true, 只收割不调度
  }
}
```

SIGINT/SIGTERM 后有 30 秒 grace period 等待子进程退出。`--once` 模式等待 `idle_timeout_ms`（默认 30 分钟）。

### 2.4 pollCycle 五步流程

```typescript
// src/orchestrator.ts:200-484
async function pollCycle(...): Promise<boolean>
```

**Step 1 — 收割已完成的子进程**（L211-289）
- 遍历 `running` Map
- 调 `adapter.monitor(handle)` 检查 `process.exitCode`
- 超时检查：`elapsed > config.agent_timeout_ms` → `adapter.kill(handle)` (SIGTERM)
- 读 `output/result.json`（通过 `validateResult` + `collectResult`）
- Mode 1：直接 `taskSubmit` + `taskVerify` → done
- Mode 2：累积到 `completedResults` Map，不立即标 done
- 写 analytics JSONL 日志

**Step 2 — 处理重试队列**（L291-316）
- 检查 `retryAfter` 时间戳是否到期
- 遵守并发限制 `config.max_concurrent_agents`
- 重新 dispatch，注入 retry context（attempt 次数 + 上次失败原因）

**Step 3 — 查找可调度任务**（L318-333）
- 计算 `availableSlots = max_concurrent_agents - running.size`
- 从 `taskList()` 过滤 `status === "open"` 的任务
- **DAG 检查**：`task.depends_on` 中的所有依赖是否为 `done`
- 排除已在 running 或 retryQueue 中的任务

**Step 4 — 调度新任务**（L335-428）
- `matchTemplate(task, registry)` 匹配注册模板
- 根据 `template.dispatch_mode` 决定 Mode 1 或 Mode 2
- 创建 workspace、注入权限配置、注入上游 DAG artifact
- 调 `adapter.spawn()` 拉子进程

**Step 5 — 合成跨模型结果**（L434-469）
- 遍历 `completedResults`，检查某 taskId 的所有 cross-model agent 是否都完成
- 调 `synthesizeFindings(results)` 合成裁决
- `taskSubmit` + `taskVerify`（verdict ≠ "fail" 则 pass）

### 2.5 内存数据结构

```typescript
// src/orchestrator.ts:165-167
const running = new Map<string, RunningAgentEntry>();
// key: "T5"（Mode 1）或 "T5:claude"（Mode 2）
// value: { handle, task, template, adapter }

const retryQueue: Array<{ task, attempt, retryAfter, template }> = [];

const completedResults = new Map<string, AgentResult[]>();
// key: taskId, value: 多个 agent 的结果（Mode 2 累积用）
```

---

## 3. 适配器层

### 3.1 统一接口

**文件**: `src/adapters/runtime.ts`（65 行）

```typescript
export interface RuntimeAdapter {
  name(): string;                    // "claude" | "codex" | "gemini"
  available(): boolean;              // CLI 是否在 PATH 中
  spawn(task, prompt, config): Promise<AgentHandle>;  // 拉子进程
  monitor(handle): AdapterStatus;    // 检查 exitCode
  output(handle): string | null;     // 读 stdout 日志
  kill(handle): void;                // SIGTERM
  resume(sessionId, prompt, config): Promise<AgentHandle>;  // 会话恢复
}

export interface AgentHandle {
  id: string;          // 唯一标识
  taskId: string;      // 对应的 task ID
  adapter: string;     // adapter 名称
  startedAt: number;   // 启动时间戳
  attempt: number;     // 当前重试次数
  logPath: string;     // stdout/stderr 日志路径
  sessionId?: string;  // Claude resume 用
  process?: ChildProcess;  // Node child_process 引用
}
```

### 3.2 Claude Adapter

**文件**: `src/adapters/claude-adapter.ts`（151 行）

- **探测**: `spawnSync("claude", ["--version"])` — L24-29
- **spawn**: `spawn("claude", ["--print", "-p", prompt])` — L44-67
  - 长 prompt (>200KB)：写文件 + shell `cat` 读取，规避 macOS ARG_MAX (256KB)
  - 日志 pipe 到 `.apex/orchestrator-logs/{taskId}.log`
  - prompt 存 `.apex/orchestrator-prompts/` 供审计
- **resume**: `claude --print --resume {sessionId} -p {prompt}` — L105-150

### 3.3 Codex Adapter

**文件**: `src/adapters/codex-adapter.ts`（108 行）

- **探测**: `spawnSync("codex", ["--version"])` — L20-25
- **spawn**: `spawn("codex", ["exec", "--full-auto"])` — L40-56
  - **stdin 管道**：prompt 通过 `proc.stdin.write(prompt)` 传入，不走命令行参数
  - `--full-auto`：启用 workspace-write 沙箱 + 自动审批
- **resume**: 无原生 resume，退化为重新 spawn — L99-107

### 3.4 Gemini Adapter

**文件**: `src/adapters/gemini-adapter.ts`（108 行）

- **探测**: `spawnSync("gemini", ["--version"])` — L20-25
- **spawn**: `spawn("gemini", ["--yolo", "-p", prompt])` — L40-58
  - `--yolo`：自动批准所有操作
  - 长 prompt 处理与 Claude 相同（文件 + shell cat）
- **resume**: 无原生 resume，退化为重新 spawn — L99-107

### 3.5 适配器注册表

**文件**: `src/adapters/adapter-registry.ts`（58 行）

```typescript
// L6-9: 内建适配器工厂列表
const BUILT_IN_ADAPTERS: Array<() => RuntimeAdapter> = [
  () => new ClaudeAdapter(),
  () => new CodexAdapter(),
  () => new GeminiAdapter(),
];

// L16-27: detectAdapters() — 启动时探测可用 CLI
// L33-58: resolveAdapter() — 回退链: claude → codex → gemini → first available
```

### 3.6 其他适配器

- `src/adapters/update-adapter.ts`（161 行）— 自更新逻辑（UpdateKit），与编排无关
- `src/adapters/udd-adapter.ts`（112 行）— UDD (Universal Dev Driver) 协议适配器，与编排无关

---

## 4. 双模式调度

### 4.1 Mode 1 — 单适配器（默认）

```typescript
// src/orchestrator.ts:404-427
const adapter = resolveAdapterForTemplate(adapters, config, template);
const handle = await adapter.spawn(task, prompt, { cwd: ws.path });
running.set(task.id, { handle, task, template, adapter });
// key 无冒号: "T5"
```

- 一个 task → 一个 adapter → 一个子进程
- 子进程退出后直接 `taskSubmit` + `taskVerify` → done
- 失败时进入重试队列

### 4.2 Mode 2 — 跨模型扇出（cross-model）

**触发条件**（`src/orchestrator.ts:370`）：

```typescript
if (template?.dispatch_mode === "cross-model" && adapters.size > 1) {
```

两个条件必须同时满足：模板声明 `cross-model` + 环境有 ≥2 个可用 adapter。

```typescript
// src/orchestrator.ts:371-400
const crossModelAdapters = Array.from(adapters.values());
for (const adapter of crossModelAdapters) {
  const compositeKey = `${task.id}:${adapter.name()}`;
  // → "T5:claude", "T5:codex", "T5:gemini"
  const ws = await createWorkspace(`${task.id}-${adapter.name()}`);
  // 每个 adapter 独立 workspace
  const handle = await adapter.spawn(task, prompt, { cwd: ws.path });
  running.set(compositeKey, { handle, task, template, adapter });
}
```

- 同一个 task → N 个 adapter → N 个子进程（并行）
- 各自写独立的 `output/result.json`
- 全部退出后触发 `synthesizeFindings()`
- Mode 2 失败**不重试**（`src/orchestrator.ts:262`: `!isCrossModel`）

### 4.3 退化行为

只有 1 个 adapter 可用时，`adapters.size > 1` 为 false → 静默退化为 Mode 1。

### 4.4 模型选择（Mode 1）

```typescript
// src/orchestrator.ts:108-139
function resolveAdapterForTemplate(adapters, config, template): RuntimeAdapter
```

优先级：
1. `template.adapter`（显式指定）
2. `config.agents.{review|challenge|consult}`（根据 `model_hint` 映射）
3. `resolveAdapter()` 默认回退链

---

## 5. 任务模板注册

**文件**: `orchestration/registry-seeds.yaml`（1374 行，115 个模板，12 个分类）

### 5.1 分类

```yaml
categories:
  - code-operations       # 15 templates
  - testing               # 各类测试
  - architecture          # 架构评审
  - devops-infrastructure # CI/CD, Docker
  - security              # 安全审计
  - performance           # 性能分析
  - documentation         # 文档生成
  - design-frontend       # 前端设计
  - data-backend          # 数据库/后端
  - agent-orchestration   # Agent 编排
  - incident-response     # 事件响应
  - project-management    # 项目管理
```

### 5.2 模板结构

```yaml
- id: code-review
  name: Code Review
  category: code-operations
  triggers: ["review this", "check my diff", "pre-landing review", ...]
  description: Review code changes for quality, correctness, style...
  inputs: [git_diff, plan_file, style_guide, acceptance_criteria]
  outputs: [findings_report, severity_ratings, verdict, suggested_fixes]
  tools_needed: [git, grep, read, bash]
  model_hint: capable        # fast | balanced | capable
  estimated_tokens: 5000
  skill: thorough-code-review
  persona: experts/security-engineer  # 可选
  dispatch_mode: cross-model          # 可选，触发 Mode 2
  adapter: claude                     # 可选，强制指定 adapter
```

### 5.3 匹配算法

```typescript
// src/orchestrator.ts:88-104
function matchTemplate(task: Task, registry: RegistryTemplate[]): RegistryTemplate | null
```

- 将 `task.title + task.description` 转小写
- 遍历所有模板的 `triggers[]`，统计匹配命中数（`text.includes(trigger)`）
- 返回命中数最高的模板（score > 0 才返回）

### 5.4 声明了 `dispatch_mode: cross-model` 的模板

| 模板 ID | 名称 | 触发词示例 |
|--------|------|-----------|
| `code-review` | Code Review | "review this", "check my diff" |
| `code-review-security` | Security-Focused Code Review | "security review", "audit code" |
| `plan-expert-review` | Expert Panel Plan Review | "review plan", "expert review" |
| `user-panel-review` | User Panel Review | "user review", "usability review" |

---

## 6. Prompt 构建

**文件**: `src/orchestrator/prompt-builder.ts`（187 行）

### 6.1 构建流程

```typescript
// L16-117: buildAgentPrompt(task, template, options)
```

组装顺序：
1. **Task 头**: `You are an AI agent executing task T{N}.` + title + description + dependencies
2. **Agent Role**: 来自 template.name + template.description
3. **Skill 注入**: `loadSkillContent(template.skill)` — 从 `skill/stages/{name}.md` 或 `skill/{name}.md` 读取完整 markdown
4. **Persona 注入**: `loadPersonaContent(template.persona)` — 从 `skill/personas/{name}.yaml` 读取并格式化
5. **Workspace 路径**: 告知 agent 工作目录和输出路径
6. **Retry 上下文**: 上一次失败的 attempt 信息（仅重试时）
7. **DAG 上游结果**: 依赖 task 的 `result.json` 摘要 + `input/` 目录指引
8. **规则**: 保持聚焦、TDD、exit code 约定
9. **输出要求**: 必须写 `output/result.json`

### 6.2 Persona YAML 格式化

```typescript
// L166-186: formatPersonaYaml(yaml)
```

YAML key 到 prompt 文本的映射：
- `name` → `**Role**: {value}`
- `background` → `**Background**: {value}`
- `evaluates_from` → `**Focus**: {value}`
- `blind_spots` → `**Known blind spots**: {value}`
- `output_format` → `**Output format**: {value}`
- `typical_questions:` → `**Key questions to answer**:`

---

## 7. 工作空间隔离

**文件**: `src/orchestrator/workspace.ts`（133 行）

### 7.1 创建

```typescript
// L32-59: createWorkspace(taskId, root = ".workspaces")
```

1. 检测是否在 git repo 中（`git rev-parse --is-inside-work-tree`）
2. **Git repo**: `git worktree add .workspaces/APEX-{taskId} -b apex/{taskId}`
3. **非 Git repo**: 纯目录创建
4. 两种情况都创建 `output/` 和 `input/` 子目录
5. worktree 创建失败时静默回退到纯目录

### 7.2 Artifact 注入

```typescript
// L64-74: injectArtifacts(workspacePath, artifacts)
```

将上游 task 的 `output/result.json` 复制到当前 workspace 的 `input/{taskId}-result.json`。

### 7.3 权限注入

```typescript
// L113-132: writePermissionConfig(workspacePath)
```

向 workspace 写入 `.claude/settings.json`：

```json
{
  "permissions": {
    "allow": ["Read", "Write", "Edit", "Bash(*)", "Glob", "Grep", "Agent"]
  }
}
```

这避免了子 agent 需要 `--dangerously-skip-permissions`。

### 7.4 清理

```typescript
// L79-107: cleanupWorkspace(workspacePath)
```

1. 检测 `.git` 是文件（worktree）还是目录（普通 repo）
2. **Worktree**: `git worktree remove {path} --force` + `git branch -D apex/{taskId}`
3. **纯目录**: `rmSync(path, { recursive: true, force: true })`

---

## 8. 结果收集与合成

**文件**: `src/orchestrator/result-collector.ts`（159 行）

### 8.1 单 Agent 结果收集

```typescript
// L38-80: collectResult(workspacePath, taskId, adapter, exitCode, duration_s, persona?)
```

1. 尝试读 `{workspace}/output/result.json`
2. 解析 `{ verdict, findings[], output|summary }`
3. 失败回退：读 `.apex/orchestrator-logs/{taskId}.log`，verdict 由 exitCode 推导

### 8.2 多 Agent 结果合成

```typescript
// L86-159: synthesizeFindings(results: AgentResult[]): SynthesizedResult
```

**Step 1 — Agent 分类**
- `contributed[]`: exitCode=0 且有 findings 或 verdict
- `partial[]`: exitCode=0 但无 result.json
- `failed[]`: exitCode≠0

**Step 2 — Finding 汇总 + 来源归因**
每个 finding 附加 `source: "{adapter}({persona})"`

**Step 3 — 去重**
```typescript
// L117-125: 精确匹配 description（lowercase + trim）
const key = f.description.toLowerCase().trim();
// 代码注释标记了 "future: similarity"
```

**Step 4 — 分级**
```typescript
// L128-130
const blockers = unique.filter(f => f.severity === "blocker");
const concerns = unique.filter(f => f.severity === "concern");
const notes = unique.filter(f => f.severity === "note");
```

**Step 5 — 裁决**
```typescript
// L133-135: 悲观合并
const verdict =
  blockers.length > 0 ? "fail"   :  // 有 blocker → fail
  allPass             ? "pass"   :  // 全 agent 都 pass → pass
  anyFail             ? "mixed"  :  // 有分歧 → mixed
                        "pass";
```

### 8.3 数据结构

```typescript
export interface SynthesizedResult {
  taskId: string;
  agents: string[];        // 所有参与的 agent 标签
  contributed: string[];   // 产出结构化结果的
  partial: string[];       // 正常退出但无 result.json
  failed: string[];        // 非零退出
  verdict: string;         // "pass" | "fail" | "mixed"
  blockers: Finding[];
  concerns: Finding[];
  notes: Finding[];
  summary: string;         // 人类可读摘要
}

export interface Finding {
  severity: "blocker" | "concern" | "note";
  description: string;
  source?: string;         // 来源 agent
}
```

---

## 9. 结果验证

**文件**: `src/orchestrator/result-validator.ts`（38 行）

```typescript
// L14-37: validateResult(workspacePath, exitCode)
```

验证链：
1. `exitCode !== 0` → `{ status: "failure" }`
2. `output/result.json` 不存在 → `{ status: "partial" }`
3. JSON 解析失败 → `{ status: "partial" }`
4. 缺少 `verdict` 字段 → `{ status: "partial" }`
5. 全部通过 → `{ status: "success", verdict }`

编排器中的使用（`orchestrator.ts:236`）：
```typescript
const effectiveSuccess = validation.status === "success";
```

只有 `"success"` 才算成功。`"partial"`（有产出但不完整）也被视为失败。

---

## 10. 重试与退避

**文件**: `src/orchestrator/retry.ts`（19 行）

### 10.1 重试判定

```typescript
// L5-8
export function shouldRetry(attempt: number, maxRetries: number, exitCode?: number): boolean {
  if (exitCode === 0) return false;  // 成功不重试
  return attempt < maxRetries;       // 未超最大次数
}
```

### 10.2 退避计算

```typescript
// L14-18
export function backoffMs(attempt: number, baseMs: number): number {
  const exponential = baseMs * Math.pow(2, attempt - 1);  // 指数增长
  const jitter = 0.8 + Math.random() * 0.4;               // ±20% 随机抖动
  return Math.round(exponential * jitter);
}
```

默认 `baseMs = 10000`（10 秒）：
- attempt 1: ~10s
- attempt 2: ~20s
- attempt 3: ~40s

### 10.3 Mode 2 不重试

```typescript
// src/orchestrator.ts:262
if (!effectiveSuccess && !isCrossModel && shouldRetry(...)) {
//                       ^^^^^^^^^ Mode 2 不进此分支
```

---

## 11. 任务状态机

### 11.1 状态定义

**文件**: `src/types/task.ts`（37 行）

```typescript
export type TaskStatus = "open" | "assigned" | "in_progress" | "to_verify" | "done" | "blocked";

export const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  open:        ["assigned", "blocked"],
  assigned:    ["in_progress", "open", "blocked"],    // open = release
  in_progress: ["to_verify", "blocked"],
  to_verify:   ["done", "in_progress", "blocked"],    // in_progress = verify fail
  done:        [],                                     // 终态
  blocked:     ["open"],                               // unblock
};
```

### 11.2 Task 数据模型

```typescript
export interface Task {
  id: string;               // "T1", "T2", ...
  title: string;
  description: string;
  status: TaskStatus;
  depends_on: string[];     // DAG 依赖
  blocked_by: string[];
  evidence: string[];
  previous_status?: TaskStatus;   // blocked 前的状态
  block_reason?: string;
  adapter?: string;               // 执行此 task 的 adapter
  persona?: string;
  skill?: string;
  attempt?: number;               // 重试次数
  workspace_path?: string;        // 工作空间路径
  session_id?: string;            // Claude resume 用
  created_at: string;
  updated_at: string;
  completed_at?: string;
}
```

### 11.3 状态转换

**文件**: `src/state/tasks.ts`（236 行）

核心函数：`taskTransition(taskId, toStatus, extra?)` — L63-101

所有便利函数都委托到此：
- `taskCreate(title, desc, dependsOn?)` — L110-133
- `taskAssign(taskId)` — L161-174（含未满足依赖警告）
- `taskStart(taskId)` — L179-181
- `taskSubmit(taskId, evidence)` — L186-191（evidence 必填）
- `taskVerify(taskId, pass)` — L198-206（pass=true → done, false → in_progress）
- `taskBlock(taskId, reason)` — L211-216
- `taskRelease(taskId)` — L221-223
- `taskNext()` — L229-235（找下一个可调度 task）

**编排器调用链**：
```
dispatch → taskAssign(id)       // open → assigned
         → taskStart(id)        // assigned → in_progress
reap     → taskSubmit(id, evidence)  // in_progress → to_verify
         → taskVerify(id, true)      // to_verify → done
```

---

## 12. 事件溯源

**文件**: `src/state/event-log.ts`（386 行）

### 12.1 架构

```
.apex/log/tasks.jsonl    →  materializeTasks()  →  .apex/tasks.json
.apex/log/state.jsonl    →  materializeState()  →  .apex/state.json
.apex/log/memory.jsonl   →  materializeMemory() →  .apex/memory.json
```

每次状态变更：
1. `appendEvent(domain, type, payload)` — 追加一行 JSON 到 JSONL 文件
2. `rebuildAndCache(domain)` — 重放所有事件，生成最新的 JSON 缓存

### 12.2 并发安全

```typescript
// L107-110 注释
// Safety: appendFileSync writes < 4KB are atomic on POSIX (PIPE_BUF).
// Two processes appending simultaneously produce two complete lines.
```

利用 POSIX 文件写入原子性保证（< PIPE_BUF = 4096 字节）。

### 12.3 事件类型

**Task 域**: `task.created`, `task.transitioned`
**State 域**: `stage.set`, `stage.completed`, `artifact.added`, `skill.invoked`
**Memory 域**: `fact.added`, `fact.removed`, `fact.pruned`

### 12.4 事件结构

```typescript
export interface DomainEvent {
  ts: string;             // ISO 时间戳
  session_id: string;     // 当前会话 ID
  domain: "task" | "state" | "memory";
  type: string;           // 事件类型
  payload: Record<string, unknown>;
}
```

---

## 13. 记忆后端

**文件**: `src/memory/` 目录（5 个文件）

### 13.1 接口

**文件**: `src/memory/interface.ts`（76 行）

```typescript
export interface MemoryBackend {
  readonly name: string;  // "agent-recall" | "apex-local"
  addFact(fact, confidence, tags?): Promise<string>;
  searchFacts(query, limit?): Promise<MemoryFact[]>;
  listFacts(minConfidence?): Promise<MemoryFact[]>;
  removeFact(id): Promise<void>;
  pruneFacts(minConfidence?): Promise<number>;
  addSolution(path, category, tags): Promise<void>;
  searchSolutions(query): Promise<SolutionRef[]>;
  injectContext(project): Promise<string>;
  getActiveTask(): Promise<ActiveTask | null>;      // 跨会话恢复
  saveCheckpoint(data): Promise<void>;
}
```

### 13.2 后端探测

**文件**: `src/memory/detector.ts`（55 行）

```typescript
// 优先级 1: Agent Recall (HTTP localhost:37777)
// 探测: fetch /api/search?query=ping, 2 秒超时
// 任何 HTTP 响应 (< 500) 视为可用

// 回退: LocalBackend (.apex/memory.json)
```

结果缓存到进程生命周期内。

### 13.3 Agent Recall 混合后端

**文件**: `src/memory/agent-recall-backend.ts`（289 行）

**双写策略**：
- **写**: 本地 `.apex/memory.json` + Agent Recall HTTP API（fire-and-forget）
- **读**: 只读本地（即时可用）
- **上下文注入**: 优先 Agent Recall（跨会话更丰富），回退本地
- **任务恢复**: 优先 Agent Recall `/api/recovery/active-task`，回退 `.apex/tasks.json`
- **检查点**: 双写 Agent Recall `/api/recovery/checkpoint` + `.apex/checkpoints/{stage}-{ts}.json`

Agent Recall 写失败时不影响本地存储（safety net）。

### 13.4 本地后端

**文件**: `src/memory/local-backend.ts`（146 行）

纯文件存储。所有操作委托到 `src/state/memory.ts` 的函数。

---

## 14. 人格系统

**文件**: `skill/personas/` 目录

### 14.1 专家人格（4 个）

| 文件 | 角色 | 背景 | 评估维度 |
|------|------|------|---------|
| `experts/security-engineer.yaml` | 安全工程师 | 12 年 OWASP, red team | 攻击面, auth/authz, 密钥, CVE |
| `experts/technical-architect.yaml` | 技术架构师 | 15 年分布式系统 | 扩展性, 技术债, 团队能力 |
| `experts/business-strategist.yaml` | 商业策略师 | 10 年产品战略 | 市场, 竞争壁垒, 单元经济 |
| `experts/ux-researcher.yaml` | UX 研究员 | 8 年用户研究 | 任务完成度, 认知负荷, 无障碍 |

### 14.2 用户人格（2 个）

| 文件 | 角色 | 特征 | 评估维度 |
|------|------|------|---------|
| `users/first-time-user.yaml` | 新手用户 | 未读文档 | 可发现性, 5 分钟内首次价值 |
| `users/power-user.yaml` | 资深用户 | 6+ 月日常使用 | 效率, 批量操作, 1000 条规模 |

### 14.3 注入方式

```typescript
// src/orchestrator/prompt-builder.ts:144-161
function loadPersonaContent(personaRef?: string): string | null
// 搜索路径: skill/personas/{ref}.yaml → skill/personas/{ref} → {ref}
```

Persona 通过 `buildAgentPrompt()` 注入到 `## Evaluation Perspective` 段落，子 agent 以此人格视角执行任务。

---

## 15. 技能绑定

**文件**: `skill/bindings.yaml`（130 行）

### 15.1 阶段绑定

| 阶段 | 技能 | 触发条件 | concurrent |
|------|------|---------|-----------|
| **Brainstorm** | product-prd | 产品决策, 新功能规划, 写 PRD | false |
| **Execute** | systematic-debugging | bug, test failure, error | false |
| **Execute** | tasteful-frontend | frontend UI design/implementation | true |
| **Execute** | design-to-code-runner | design mockup, screenshot, Figma | false |
| **Execute** | browser-qa-testing | deployment check, UI regression | false |
| **Review** | thorough-code-review | pre-merge code review (outgoing) | false |
| **Review** | thorough-code-review | received external review (incoming) | false |
| **Review** | security-audit | auth, data, network, deps changes | true |
| **Review** | design-review | frontend visual quality | true |
| **Review** | product-review | product/UX evaluation | true |
| **Review** | codex-consult | 独立第二意见 | true |
| **Compound** | iteration-reflector | 复盘, post-mortem | false |

### 15.2 输出映射

每个绑定定义 `output_schema` + `mapping`，将外部技能的输出转译为 AF 协议动词：

```yaml
mapping:
  RESOLVED + confirmed: { af_evidence: E3 }
  RESOLVED + proven:    { af_evidence: E4 }
  UNRESOLVED:           { af_action: escalation_ladder }
```

### 15.3 多层评审

design-review 使用两层结构：
```yaml
layers:
  - gate: design-baseline       # 第一层：基线门控
    verdict_on_fail: REJECTED
  - skill: tasteful-frontend    # 第二层：美学评审
    verdict_on_fail: APPROVED_WITH_FIXES
```

---

## 16. 阶段门控

**文件**: `skill/gates/stage-exit-gate.md`

### 16.1 两层架构

```
apex stage complete <stage>
  ↓
Layer 1: 结构检查 (1 SubAgent, 二值 pass/fail)
  → ANY checklist item fail → BLOCKED
  ↓ ALL pass
Layer 2: 实质检查 (N SubAgents, 并行独立)
  → 各自输出: verdict + confidence + findings
  → 互不可见
  ↓
Aggregate (置信度投票)
  ↓
Main Agent 决策
```

### 16.2 Tier 缩放

| Tier | 结构 SubAgent | 实质 SubAgent | 证据等级 |
|------|-------------|-------------|---------|
| Tier 1 / Lightweight | 1 | 0 (跳过) | E2 |
| Tier 2 / Standard | 1 | 2 | E3 |
| Tier 3 / Deep | 1 | 3 | E3+ |

### 16.3 裁决聚合

| 条件 | 结果 |
|------|------|
| 全 PASS + 高置信度 | **PASS** (DONE) |
| 多数 PASS + 中置信度 | **PASS_WITH_NOTE** (DONE_WITH_CONCERNS) |
| 无多数 or 低置信度 | **ESCALATE** (NEEDS_CONTEXT) |
| 任何 BLOCK + 高置信度 | **BLOCK** (BLOCKED) |
| 任何 P0 + 高置信度 | **BLOCK** (覆盖其他裁决) |

---

## 17. 共识模块

**文件**: `src/consensus/` 目录（4 个文件）

### 17.1 Raft

**文件**: `src/consensus/raft.ts`

- Leader election（随机超时 150-300ms）
- Log replication（AppendEntries RPC）
- 多数派提交（commitIndex 只推进到多数副本确认的位置）
- Term-based 防分裂

### 17.2 PBFT

**文件**: `src/consensus/bft.ts`

- 三阶段协议：Pre-Prepare → Prepare → Commit
- 容错公式：`3f + 1`（f 个故障节点需要 3f+1 总节点）
- 基于 digest 的消息验证
- View change 机制

### 17.3 CRDT

**文件**: `src/consensus/crdt.ts`

- **GCounter**: 仅增计数器，merge 取 max
- **LWWRegister**: 最后写入胜出，时间戳 + nodeId 仲裁
- **ORSet**: 带墓碑的增删集合

### 17.4 Gossip

**文件**: `src/consensus/gossip.ts`

- 流言传播：每轮随机选 fanout 个节点交换状态
- 单调递增版本号，高版本覆盖低版本
- O(log n) 轮收敛

### 17.5 当前使用状态

**共识模块在编排器主流程中未启用。** 编排器使用的是 `synthesizeFindings()` 的 finding 级合并（悲观合并 + 严重度分级），而非分布式共识协议。共识模块是面向未来多节点 Agent 集群的基础设施储备。

可通过 CLI 测试：`apex consensus test|test-bft|test-gossip|test-crdt|test-all`

---

## 18. Dashboard 可视化

**文件**: `src/dashboard.ts`（~800 行）

### 18.1 双层架构

| 层级 | 端口 | 用途 |
|------|------|------|
| **Hub** | 3456（固定） | 聚合所有项目，多 worktree 视图 |
| **Per-Project** | 3460-3560（路径哈希确定） | 单项目详情（仅 `--port` 模式） |

### 18.2 项目注册

**文件**: `src/registry.ts`

- 注册表: `~/.apex-forge/registry.json`
- 端口分配: `autoPort(projectPath)` — 路径哈希映射到 3460-3560 范围
- 心跳: 每 30 秒 re-register
- 退出清理: SIGINT/SIGTERM 时 unregister

### 18.3 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/state` | GET | 单项目状态（tasks, memory, stage, analytics） |
| `/api/state/aggregated` | GET | 多 worktree 聚合状态 |
| `/api/events` | GET (SSE) | 实时状态流（2 秒轮询） |
| `/api/events/aggregated` | GET (SSE) | 多 worktree 实时流 |
| `/api/projects` | GET | 所有注册项目（含 enrichment） |
| `/api/designs` | GET | .apex/designs/ 中的设计文件 |
| `/api/designs/file` | GET | 单个设计文件内容 |
| `/activity/stream` | GET (SSE) | 事件日志回放（最近 50 条 + 增量） |
| `/status` | GET | 健康检查 + SSE 客户端计数 |

### 18.4 多 Worktree 聚合

**文件**: `src/worktree-discovery.ts`（171 行）

- `discoverWorktrees(dir)`: 通过 `git worktree list --porcelain` 发现所有 worktree
- `groupProjectsByRepo(projects)`: 按共同 repo root 分组
- 每个 worktree 的 task 前缀: `{worktree}/{taskId}`
- 30 秒 TTL 缓存避免频繁 subprocess spawn

### 18.5 PWA 支持

- macOS: 优先打开已安装的 Chrome PWA（搜索 `~/Applications` 下的 `Apex Forge.app`）
- 回退: 打开浏览器 URL
- SSE 客户端计数: 检测是否有活跃查看者，避免重复开窗

---

## 19. 协议层调度角色

**文件**: `skill/roles/` 目录

### 19.1 parallel-dispatch.md

- **用途**: 2+ 独立任务并行派遣
- **前提**: 无共享状态、无顺序依赖
- **流程**: 识别独立域 → 写聚焦 prompt → 并发 dispatch → Review + 集成
- **Agent 规模矩阵**: 机械性 / 集成性 / 架构性 对应不同粒度

### 19.2 subagent-dev.md

- **用途**: Plan 产出的每个 Task 独立由子 Agent 执行
- **Per-task 循环**: Implementer → Spec Reviewer → Code Quality Reviewer → Mark done
- **模型选择**: fast/cheap（机械）→ standard（功能）→ most capable（评审）
- **两阶段 Review 门控**: Spec 不过 → 不进 Quality Review

### 19.3 cross-session-exec.md

- **用途**: 跨会话/跨 Agent 恢复执行
- **Plan 查找路径**: `.apex/state.json` → `docs/plans/` → `.apex/plans/`
- **过时 Plan 恢复矩阵**: compatible / conflicting / deps added / new requirements / deleted files
- **状态恢复**: `apex task list` 找 open tasks + 注入上一次 session 上下文

### 19.4 worktree.md

- **用途**: 需要文件系统隔离的功能开发
- **CLI**: `apex worktree create/list/cleanup`
- **目录策略**: 项目内 `.apex/worktrees/` 或全局 `~/.apex-forge/worktrees/`
- **完成选项**: merge back / push + PR / keep / discard

### 19.5 scope-lock.md

- **用途**: 会话级编辑边界，防止越界修改
- **机制**: 写 `.apex/scope-lock.txt`，每次 Edit/Write 前检查目标路径是否在边界内
- **约束**: 一次只能锁定一个目录

---

## 20. 配置系统

**文件**: `src/types/config.ts`（45 行）+ `src/state/config.ts`（113 行）

### 20.1 配置项

| 键 | 默认值 | 说明 |
|----|--------|------|
| `default_tier` | `"auto"` | 复杂度路由默认层级 |
| `proactive` | `true` | 主动行为开关 |
| `compound_on_resolve` | `true` | Ship 后是否提示复盘 |
| `max_concurrent_agents` | `3` | 最大并发子进程数 |
| `autonomy` | `"balanced"` | Agent 自主程度 |
| `solutions_dir` | `"docs/solutions"` | 解决方案文档目录 |
| `polling_interval_ms` | `30000` | 主循环轮询间隔（30 秒） |
| `max_retries` | `3` | 最大重试次数 |
| `retry_backoff_base_ms` | `10000` | 重试退避基数（10 秒） |
| `agent_command` | `"claude"` | 默认 Agent CLI |
| `idle_timeout_ms` | `1800000` | 空闲超时（30 分钟） |
| `agent_timeout_ms` | `300000` | 单 Agent 执行超时（5 分钟） |
| `agents.review` | — | Review 角色的 Agent 指定 |
| `agents.challenge` | — | Challenge 角色的 Agent 指定 |
| `agents.consult` | — | Consult 角色的 Agent 指定 |

### 20.2 配置文件

```yaml
# .apex/config.yaml — 扁平 key: value 格式
max_concurrent_agents: 5
polling_interval_ms: 15000
agent_timeout_ms: 600000
```

解析器（`src/state/config.ts:29-65`）不依赖外部 YAML 库，仅支持扁平格式。

---

## 21. 运行模型与生命周期

### 21.1 进程拓扑

```
用户终端
  │
  ├── apex orchestrate              ← 编排器进程（前台）
  │     │
  │     ├── claude --print -p ...   ← 子进程 (Mode 1 或 Mode 2)
  │     │     └── cwd: .workspaces/APEX-T1/
  │     │
  │     ├── codex exec --full-auto  ← 子进程 (Mode 2)
  │     │     └── cwd: .workspaces/APEX-T1-codex/
  │     │
  │     └── gemini --yolo -p ...    ← 子进程 (Mode 2)
  │           └── cwd: .workspaces/APEX-T1-gemini/
  │
  └── apex dashboard                ← Dashboard 进程（可选，另开终端）
        └── Bun.serve() on :3456
```

### 21.2 数据流

```
registry-seeds.yaml        .apex/config.yaml
        │                        │
        ▼                        ▼
   matchTemplate()          loadConfig()
        │                        │
        └────────┬───────────────┘
                 ▼
         resolveAdapterForTemplate()
                 │
                 ▼
        createWorkspace()
        writePermissionConfig()
        injectArtifacts()
        buildAgentPrompt()
                 │
                 ▼
          adapter.spawn()
                 │
    ┌────────────┴──────────────┐
    │                           │
  stdout → .apex/               agent writes →
  orchestrator-logs/            workspace/output/
  {taskId}.log                  result.json
    │                           │
    └────────────┬──────────────┘
                 ▼
         validateResult()
         collectResult()
                 │
        ┌────────┴────────┐
        │                 │
     Mode 1:           Mode 2:
     直接 done         累积到 completedResults
                         │
                         ▼
                  synthesizeFindings()
                         │
                         ▼
                  taskSubmit() + taskVerify()
                         │
                         ▼
                  appendEvent("task", ...)
                  rebuildAndCache("task")
                         │
                         ▼
                  .apex/tasks.json (Dashboard 读取)
```

### 21.3 文件系统布局

```
项目根/
├── .apex/
│   ├── config.yaml                    # 编排器配置
│   ├── state.json                     # Pipeline 阶段状态
│   ├── tasks.json                     # 任务列表（Dashboard 读取）
│   ├── memory.json                    # 本地记忆存储
│   ├── log/
│   │   ├── tasks.jsonl                # Task 域事件日志
│   │   ├── state.jsonl                # State 域事件日志
│   │   └── memory.jsonl               # Memory 域事件日志
│   ├── orchestrator-logs/             # 子 Agent stdout/stderr
│   │   ├── T1.log
│   │   ├── T1-codex.log
│   │   └── T1-gemini.log
│   ├── orchestrator-prompts/          # 发给子 Agent 的 prompt（审计用）
│   │   ├── T1-1713000000.txt
│   │   ├── T1-codex-1713000000.txt
│   │   └── T1-gemini-1713000000.txt
│   ├── analytics/
│   │   └── orchestrator.jsonl         # 调度事件 analytics
│   ├── checkpoints/                   # 跨会话检查点
│   ├── reviews/                       # Review 阶段产出物
│   ├── designs/                       # 生成的 UI 设计
│   ├── worktrees/                     # Git worktree 目录
│   └── upgrade-notes/                 # 技能升级备注
├── .workspaces/                       # 编排器子 Agent 工作空间
│   ├── APEX-T1/
│   │   ├── .claude/settings.json      # 权限配置
│   │   ├── output/result.json         # Agent 产出物
│   │   └── input/                     # 上游 DAG 依赖
│   ├── APEX-T1-codex/                 # Mode 2 per-adapter workspace
│   └── APEX-T1-gemini/
├── orchestration/
│   └── registry-seeds.yaml            # 115 个任务模板
├── skill/
│   ├── SKILL.md                       # 主协议文件
│   ├── bindings.yaml                  # 阶段→技能绑定
│   ├── stages/                        # 各阶段详细协议
│   ├── gates/                         # 门控规则
│   ├── roles/                         # 调度角色
│   └── personas/                      # 人格 YAML
│       ├── experts/                   # 4 个专家人格
│       └── users/                     # 2 个用户人格
└── ~/.apex-forge/
    └── registry.json                  # Dashboard 项目注册表
```

### 21.4 关键特性对比矩阵

| 特性 | 实现方式 | 代码位置 |
|------|---------|---------|
| 调度 | DAG 依赖 + 并发槽 | `orchestrator.ts:318-333` |
| 跨模型对冲 | Mode 2 扇出 + finding 合成 | `orchestrator.ts:370-400`, `result-collector.ts:86-159` |
| 工作空间隔离 | Git worktree + 纯目录回退 | `workspace.ts:32-59` |
| 权限注入 | 写 `.claude/settings.json` | `workspace.ts:113-132` |
| 子进程管理 | `child_process.spawn()` + poll exitCode | `claude-adapter.ts:63`, `orchestrator.ts:211-226` |
| 重试 | 指数退避 + 抖动 (Mode 1 only) | `retry.ts:14-18`, `orchestrator.ts:262-270` |
| 超时 | `agent_timeout_ms` + SIGTERM | `orchestrator.ts:215-222` |
| 结果验证 | exitCode + result.json 结构检查 | `result-validator.ts:14-37` |
| 模板匹配 | trigger 关键词命中计数 | `orchestrator.ts:88-104` |
| 状态持久化 | Event Sourcing (JSONL → JSON 缓存) | `event-log.ts:111-135`, `359-385` |
| 跨会话恢复 | Agent Recall HTTP + 本地 tasks.json | `agent-recall-backend.ts:229-265` |
| 实时监控 | SSE 2 秒轮询 + Hub 聚合 | `dashboard.ts:281-304` |
| 人格注入 | YAML → prompt 文本格式化 | `prompt-builder.ts:144-186` |
| 技能绑定 | 阶段 + 触发条件 → 外部技能 | `bindings.yaml` |
| 共识协议 | Raft/PBFT/CRDT/Gossip (预留) | `src/consensus/` |

---

*文档基于 `apex-forge` 仓库 commit `04b75ff` 及之后的代码编写。所有代码位置均为实际文件路径和行号。*

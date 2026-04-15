# Spec: Plan Agent Architecture

> 目标：设计 Plan Agent 的完整架构，包括阶段模型、daemon 进程、通信协议、
> 终端控制机制，使其作为多 Worker 编排的核心具备可观测性、可打断性和持续迭代能力。

## 0. 术语

| 术语 | 含义 |
|------|------|
| Plan Agent | 编排者 AI session，和用户对话，指挥全局。不写代码。 |
| Daemon | TypeScript 常驻进程，做确定性调度/监控，不做判断。 |
| Worker Agent | 独立终端进程，各自在 worktree 里跑完整 AF 协议实现具体任务。 |
| directive | Plan Agent → Worker 的下行指令文件。 |
| escalation | Worker → Plan Agent 的上行问题上报文件。 |

## 1. 架构总览

### 1.1 三层分工

```
人类用户
    │ 对话 / 需求变更 / 审批
    ▼
Plan Agent (AI Session)     ← "将军"：判断 + 决策 + 用户沟通
    │ apex task/worker CLI + 终端直接通信
    ▼
Daemon (TypeScript 进程)    ← "参谋部"：调度 + 监控 + 确定性操作
    │ spawn / kill / merge / 通过终端适配器
    ▼
Worker Agents (独立终端)    ← "士兵"：实现 + 测试 + 自审
```

### 1.2 设计原则

来源：cmux-team 的核心原则，适配到 apex-forge 上下文。

| 原则 | 含义 |
|------|------|
| 确定性的用代码，判断的用 AI | daemon 做调度/监控/merge，Plan Agent 做需求理解/异常诊断/计划调整 |
| 各层只做自己的工作 | Plan Agent 不写代码，Worker 不跟用户对话，daemon 不做决策 |
| 文件系统即 IPC | 所有层通过 `.apex/` 目录下的文件通信 |
| 终端是信号通道，文件是内容通道 | 紧急打断用终端 sendKey/send，结构化信息走 JSON 文件 |
| 增量交付 | Worker 完成一个就 merge 一个，不等所有任务完成 |

## 2. Plan Agent 阶段模型

### 2.1 三个宏阶段

```
Initiation → Monitoring and Controlling → Closure
  (线性,硬门控)    (事件驱动,持续)           (线性,收尾)
```

### 2.2 Initiation 阶段（线性，每步有硬门控）

```
brainstorm → plan → split → kickoff → [首批 spawn + 启动 daemon]
```

#### brainstorm — 需求对齐

**做什么**：和用户讨论需求、约束、优先级、成功标准。

**产出物**：`docs/orchestrations/{name}-requirements.md`
```markdown
---
status: approved  # draft → approved (用户确认)
---
# 需求
...
# 约束
...
# 成功标准
...
```

**退出门控**：
- S1: 产出物文件存在
- S2: `status: approved`（用户明确确认）
- S3: 成功标准可量化（非模糊表述）

**阶段命令**：
```bash
apex stage set orchestrate:brainstorm
# ... 工作 ...
apex stage complete orchestrate:brainstorm
```

#### plan — 整体方案

**做什么**：基于需求制定整体技术方案、架构选型、风险评估。不拆任务。

**产出物**：`docs/orchestrations/{name}-plan.md`
```markdown
---
status: approved
---
# 技术方案
...
# 架构决策
| 决策点 | 选项 A | 选项 B | 选择 | 理由 |
...
# 风险评估
| 风险 | 概率 | 影响 | 缓解措施 |
...
# 涉及的代码区域
...
```

**退出门控**：
- S1: 产出物文件存在
- S2: `status: approved`
- S3: 至少包含技术方案和风险评估两个 section

#### split — 任务拆分

**做什么**：基于 plan 拆分为独立任务，构建依赖 DAG，审查拆分质量。

**产出物**：通过 `apex task create` 创建的任务队列 + DAG 图。

**拆分规则**：
- 每个任务必须能被**一个 Worker 在一个 session 内完成**
- 最大化并行度——最小化跨任务依赖
- 太大（预计 >1 小时）→ 继续拆
- 太小（单函数修改）→ 合并到相关任务
- 每个任务必须有：标题、描述、验收标准、依赖关系、推荐 category

**拆分质量审查**：spawn 一个 SubAgent 做对抗性审查：
> "你是任务拆分审查员。检查这个任务列表：
> 1. 有没有遗漏的工作？对照 plan 逐项检查
> 2. 有没有任务粒度过大？（预估 >1h）
> 3. 有没有隐含依赖没有声明？
> 4. DAG 有没有环？
> 5. 并行度能否提高？有没有不必要的串行依赖？"

**退出门控**：
- S1: `apex task list` 至少有 1 个任务
- S2: 每个任务都有 title + description + depends_on
- S3: DAG 无环（拓扑排序成功）
- S4: 拆分审查通过（无 P0 发现）

#### kickoff — 启动

**做什么**：为每个任务分配 agent，呈现给用户最终确认，然后 spawn 首批 Worker + 启动 daemon。

**Agent 分配优先级链**（和现有 `resolveAgent` 一致）：
1. 用户指定 `--agent`
2. `task.agent` 字段
3. `config.worker_agent_rules[category]`（**注意：此路径目前未接入，需实现**）
4. `config.worker_default_agent`
5. fallback: `"claude"`

**呈现格式**：
```
任务分配方案：
  T1: 设计 UI mockup         → gemini (design)    → 无依赖
  T2: 实现认证 API            → claude (code)      → 无依赖
  T3: 写前端页面              → codex (code)       → 依赖 T1
  T4: 集成测试                → claude (test)      → 依赖 T2, T3

确认？ [yes / adjust]
```

**退出门控**：
- S1: 用户明确确认分配方案
- S2: 速率/预算检查通过（如果 `worker_rate_limit_enabled`）
- S3: 所有无依赖任务已 spawn
- S4: daemon 进程已启动

**阶段完成后**：Plan Agent 进入 Monitoring and Controlling，不再线性推进。

### 2.3 Monitoring and Controlling（事件驱动）

Plan Agent 在此阶段不走线性 pipeline，而是响应事件。

**事件来源和处理**：

| 事件 | 来源 | Plan Agent 的处理 |
|------|------|-------------------|
| Worker 完成 (pass) | daemon 通知 | 确认结果，daemon 自动 integrate+merge+spawn 下游 |
| Worker 完成 (fail) | daemon 通知 | 诊断失败原因，决定：修改任务描述 re-spawn / 创建修复任务 / escalate 给用户 |
| Worker 崩溃 | daemon 通知 | 读 terminal screen tail，判断：临时故障 re-spawn / 任务本身有问题 |
| Worker 上报问题 | daemon 检测 escalation.json | 读取 escalation 内容，和用户讨论后决策（回复 directive / 修改任务 / 取消任务） |
| 用户新需求 | 用户直接对话 | re-brainstorm → 增删改任务 → 通知 daemon（新 ready 任务自动 spawn） |
| 用户修改计划 | 用户直接对话 | 评估影响范围 → 写 directive 给受影响 Worker / kill + re-spawn / 创建新任务 |
| 速率/预算告警 | daemon 通知 | 告知用户当前状态，决定等待还是切换 agent |

**关键规则**：
- Plan Agent 在此阶段始终可用，用户随时可以对话
- Plan Agent 不需要主动轮询 Worker 状态——daemon 负责监控并上报
- Plan Agent 只处理需要判断的事件，确定性操作由 daemon 自动完成

**阶段命令**：
```bash
apex stage set orchestrate:monitoring   # 进入 M&C
# 不需要 apex stage complete — 由条件触发退出
```

**退出条件**：所有任务 done + 无 pending 任务 + 无活跃 Worker → 自动进入 Closure。

**检测者**：Daemon 在每次 tick 中检查此条件（确定性操作，不需要 AI 判断）。
条件满足时 daemon 通过 `notifyPlanAgent` 通知 Plan Agent：
`"所有任务已完成，无活跃 Worker。建议进入 Closure 阶段。"`
Plan Agent 收到通知后执行 `apex stage set orchestrate:closure`。
Daemon 不直接设置 stage——stage 转换是 Plan Agent 的职责（需要用户可见性）。

### 2.4 Closure 阶段（线性，收尾）

```
final-check → summary → done
```

#### final-check — 最终验证

**做什么**：确认主分支状态。

**检查项**：
- 所有 Worker 分支已 merge 到主分支（daemon 增量 merge 的结果）
- 主分支测试全绿
- 无遗留 worktree（`git worktree list` 确认）
- 无遗留 Worker 进程

#### summary — 结案报告

**做什么**：生成项目总结报告。

**产出物**：`docs/orchestrations/{name}-closure.md`
```markdown
# 结案报告: {项目名}

## 执行摘要
- 目标: ...
- 结果: ...
- 耗时: {从 Initiation 到 Closure 的时间}

## 任务清单
| ID | 标题 | Agent | 状态 | 耗时 |
| T1 | ... | claude | done | 25min |

## 决策记录
- brainstorm: {关键决策}
- plan: {架构选型}
- split: {拆分调整}
- M&C: {计划变更}

## 变更历史
- {timestamp}: 用户新增需求 X → 创建 T5
- {timestamp}: T3 失败 → 诊断后 re-spawn

## 成本统计
- 总 token: {from cost-log.jsonl}
- 总成本: ${from cost-log.jsonl}
- 按 agent 分: claude ${X}, gemini ${Y}, codex ${Z}

## 经验教训
{给 Compound 阶段或 iteration-reflector 使用}
```

**退出门控**：
- S1: 结案报告文件存在
- S2: 所有检查项通过

**阶段完成**：
```bash
apex stage complete orchestrate:closure
apex stage set idle  # 回到 idle，可以接新任务
```

### 2.5 阶段事件记录

所有阶段转换通过现有 `apex stage set/complete` 命令记录到事件日志。
stage 名用 `orchestrate:` 前缀，和 Worker 的 brainstorm/plan/execute/review/ship 区分。

```json
{"type": "stage.set", "payload": {"stage": "orchestrate:brainstorm"}, "session_id": "plan-agent-xxx"}
{"type": "stage.set", "payload": {"stage": "orchestrate:plan"}, "session_id": "plan-agent-xxx"}
{"type": "stage.set", "payload": {"stage": "orchestrate:split"}, "session_id": "plan-agent-xxx"}
{"type": "stage.set", "payload": {"stage": "orchestrate:kickoff"}, "session_id": "plan-agent-xxx"}
{"type": "stage.set", "payload": {"stage": "orchestrate:monitoring"}, "session_id": "plan-agent-xxx"}
{"type": "stage.set", "payload": {"stage": "orchestrate:closure"}, "session_id": "plan-agent-xxx"}
```

Dashboard 的 `materializePerSession` 已经能按 session 分组显示，
Plan Agent 的 session 会显示 `orchestrate:*` 阶段序列，
Worker 的 session 显示 brainstorm/plan/execute/review/ship 阶段序列，互不干扰。

### 2.6 M&C 阶段的事件日志

operating 阶段不走线性 stage 转换，改用事件日志记录发生的事情：

```bash
apex orchestrate event <action> [--task <id>] [--detail <json>]
```

写入 `.apex/log/state.jsonl`：
```json
{"type": "orchestration.event", "payload": {"action": "worker_completed", "task": "T1", "verdict": "pass"}}
{"type": "orchestration.event", "payload": {"action": "user_request", "content": "加一个暗黑模式"}}
{"type": "orchestration.event", "payload": {"action": "re_split", "added": ["T5"], "cancelled": ["T3"]}}
{"type": "orchestration.event", "payload": {"action": "worker_spawned", "task": "T5", "agent": "gemini"}}
{"type": "orchestration.event", "payload": {"action": "worker_interrupted", "task": "T2", "reason": "plan change"}}
{"type": "orchestration.event", "payload": {"action": "merge_completed", "task": "T1", "commit": "abc123"}}
{"type": "orchestration.event", "payload": {"action": "escalation_received", "task": "T2", "type": "scope_question"}}
```

Dashboard 读这些事件渲染为时间线视图，而非线性进度条。

## 3. Daemon 设计

### 3.1 职责

daemon 只做确定性操作，不做任何需要 AI 判断的事。

**自动执行（不需要 Plan Agent 参与）**：
- Worker 完成 (verdict=pass) → integrate (集成测试) → merge 到主分支 → 依赖解锁 → spawn 下游
- 新 ready 任务出现（依赖解锁或 Plan Agent 新建）→ 找空闲 slot → spawn
- Worker 状态更新 → 更新 Dashboard 数据

**上报给 Plan Agent（需要判断）**：
- Worker 完成 (verdict=fail 或 blocked) → 通知 Plan Agent 诊断
- Worker 崩溃（PID/terminal 消失 + 无 result.json）→ 通知 Plan Agent
- Worker 上报 escalation → 通知 Plan Agent
- 速率/预算告警（如果 enabled）→ 通知 Plan Agent

### 3.2 进程模型

```typescript
// 新文件: src/orchestrator/daemon.ts

interface DaemonState {
  running: boolean;
  pollInterval: number;          // 默认 10_000ms (10s)
  projectRoot: string;
  workers: Map<string, WorkerState>;  // task_id → state
  rateLimit: RateLimitInfo | null;
  planAgentHandle: WindowHandle | null;  // Plan Agent 的终端窗口
}

interface WorkerState {
  taskId: string;
  meta: WorkerMeta;              // from .apex/workers/T1/meta.json
  lastStatus: WorkerStatus | null;
  lastHealth: WorkerHealth;
  resultChecked: boolean;        // 避免重复处理
}
```

### 3.3 tick 循环

```typescript
async function tick(state: DaemonState): Promise<void> {
  // 1. 扫描所有 Worker
  for (const [taskId, worker] of state.workers) {
    const health = await checkWorkerHealth(taskId);

    // 2. 检测完成
    if (health.completed && !worker.resultChecked) {
      const result = readResult(taskId);
      worker.resultChecked = true;

      if (result.verdict === "pass") {
        // 自动: integrate + merge + spawn 下游
        await autoIntegrate(taskId);
        await autoMerge(taskId);
        await spawnUnblockedTasks(state);
        logEvent("orchestration.event", { action: "merge_completed", task: taskId });
      } else {
        // 上报: 通知 Plan Agent
        notifyPlanAgent(state, `Worker ${taskId} 完成但 verdict=${result.verdict}`);
        logEvent("orchestration.event", { action: "worker_failed", task: taskId, verdict: result.verdict });
      }
    }

    // 3. 检测崩溃
    if (health.crashed) {
      notifyPlanAgent(state, `Worker ${taskId} 崩溃，最后屏幕内容：\n${health.screenTail}`);
      logEvent("orchestration.event", { action: "worker_crashed", task: taskId });
    }

    // 4. 检测 escalation
    const escalation = readEscalation(taskId);
    if (escalation) {
      notifyPlanAgent(state, `Worker ${taskId} 上报问题：${escalation.summary}`);
      logEvent("orchestration.event", { action: "escalation_received", task: taskId, type: escalation.type });
    }
  }

  // 5. 检查新 ready 任务
  await spawnUnblockedTasks(state);

  // 6. 速率/预算检查 (如果 enabled)
  if (config.worker_rate_limit_enabled) {
    const rl = readRateLimit();
    if (rl?.throttled && !state.lastThrottleNotified) {
      notifyPlanAgent(state, `API 速率达到阈值 (${rl.utilization_5h * 100}%)，暂停 spawn`);
      state.lastThrottleNotified = true;
    }
  }
}
```

### 3.4 autoIntegrate — 集成验证

在临时 worktree 中做 merge + test，不污染主分支。

```typescript
async function autoIntegrate(taskId: string): Promise<IntegrateResult> {
  const workerBranch = `apex/${taskId}`;
  const tmpWorktree = `.apex/tmp-integrate-${taskId}`;

  try {
    // 1. 创建临时 worktree（基于当前主分支）
    execSync(`git worktree add "${tmpWorktree}" HEAD --detach`);

    // 2. 在临时 worktree 中 merge Worker 分支
    const mergeResult = spawnSync("bash", ["-c",
      `cd "${tmpWorktree}" && git merge --no-ff ${workerBranch} 2>&1`
    ]);

    if (mergeResult.status !== 0) {
      // merge 冲突 → 不 merge，上报
      logEvent("orchestration.event", { action: "integrate_conflict", task: taskId });
      return { ok: false, reason: "merge_conflict", output: mergeResult.stderr?.toString() };
    }

    // 3. 在合并后的 worktree 中跑测试
    const testResult = spawnSync("bash", ["-c",
      `cd "${tmpWorktree}" && bun test 2>&1`
    ]);

    if (testResult.status !== 0) {
      logEvent("orchestration.event", { action: "integrate_failed", task: taskId });
      return { ok: false, reason: "test_failure", output: testResult.stdout?.toString() };
    }

    return { ok: true };
  } finally {
    // 4. 清理临时 worktree（无论成败）
    try { execSync(`git worktree remove "${tmpWorktree}" --force`); } catch {}
  }
}
```

**失败处理**：
- merge 冲突 → 通知 Plan Agent，由 Plan Agent 创建 conflict-resolution 任务
- 测试失败 → 通知 Plan Agent 诊断（可能是 Worker 代码问题或集成问题）
- 不自动重试，所有失败需要 Plan Agent 判断

### 3.4b autoMerge — 实际合并到主分支

仅在 `autoIntegrate` 通过后调用。在主分支执行真正的 merge。

```typescript
async function autoMerge(taskId: string): Promise<boolean> {
  const workerBranch = `apex/${taskId}`;

  try {
    // fast-forward 优先；如果不能 ff，用 no-ff merge
    execSync(`git merge --ff ${workerBranch} 2>&1`);
    logEvent("orchestration.event", { action: "merge_completed", task: taskId,
      commit: execSync("git rev-parse HEAD").toString().trim() });
    return true;
  } catch {
    // 理论上 autoIntegrate 已验证过，这里不应失败
    // 如果失败（主分支在 integrate 和 merge 之间被修改），重新走 integrate
    logEvent("orchestration.event", { action: "merge_race_retry", task: taskId });
    return false;
  }
}
```

### 3.4c spawnUnblockedTasks — 自动 spawn 就绪任务

daemon 通过 CLI 命令 spawn Worker，不直接操作终端 adapter。
`apex worker spawn` 内部处理 worktree 创建、终端窗口、协议注入。
spawn 后 Worker 的 `WindowHandle` 写入 `.apex/workers/{task_id}/meta.json`，
daemon 后续通过 `meta.json` 跟踪 Worker。

```typescript
async function spawnUnblockedTasks(state: DaemonState): Promise<void> {
  const tasks = readTaskStore();
  const config = await loadConfig();

  for (const task of tasks) {
    // 跳过非 ready 任务
    if (task.status !== "open") continue;
    if (state.workers.has(task.id)) continue;  // 已 spawn

    // 检查依赖是否全部 done
    const depsAllDone = (task.depends_on ?? []).every(
      depId => tasks.find(t => t.id === depId)?.status === "done"
    );
    if (!depsAllDone) continue;

    // 检查并发限制
    const activeCount = [...state.workers.values()].filter(w => !w.resultChecked).length;
    const maxWorkers = config.worker_max_parallel ?? 3;
    if (activeCount >= maxWorkers) break;

    // 速率限制检查
    if (config.worker_rate_limit_enabled) {
      const rl = readRateLimit();
      if (rl?.throttled) break;
    }

    // Spawn via CLI（daemon 不直接操作终端 adapter）
    const agent = resolveAgentForTask(task, config);
    const result = spawnSync("apex", ["worker", "spawn", task.id, "--agent", agent]);

    if (result.status === 0) {
      // 读取 spawn 后写入的 meta.json 获取 WindowHandle
      const meta = readJSON<WorkerMeta>(`.apex/workers/${task.id}/meta.json`);
      state.workers.set(task.id, {
        taskId: task.id,
        meta,
        lastStatus: null,
        lastHealth: { alive: true, completed: false, crashed: false },
        resultChecked: false,
      });
      logEvent("orchestration.event", { action: "worker_spawned", task: task.id, agent });
    } else {
      // spawn 失败 → 通知 Plan Agent
      notifyPlanAgent(state, `Failed to spawn Worker ${task.id}: ${result.stderr?.toString()}`);
    }
  }
}
```

**关键设计决策**：daemon 通过 `apex worker spawn` CLI 子进程 spawn Worker，
而非直接调用 terminal adapter。理由：
- `apex worker spawn` 已封装了 worktree 创建、协议注入、终端窗口创建等所有逻辑
- daemon 不需要重复实现这些逻辑
- Worker 的 `meta.json`（含 WindowHandle）由 `apex worker spawn` 写入，daemon 只读取

### 3.5 notifyPlanAgent — 通知 Plan Agent

daemon 通过 Plan Agent 的终端窗口发送通知：

```typescript
function notifyPlanAgent(state: DaemonState, message: string): void {
  if (!state.planAgentHandle) return;

  const adapter = detectAdapter();

  // 检查 Plan Agent 是否空闲（显示 ❯ 提示符）
  const screen = await adapter.readScreen(state.planAgentHandle, 5);
  const isIdle = screen.includes("❯") && !screen.includes("esc to interrupt");

  if (isIdle) {
    // 直接发送，Plan Agent 当成新消息处理
    adapter.send(state.planAgentHandle, `[DAEMON] ${message}`);
  } else {
    // Plan Agent 正忙，写到通知队列文件，Plan Agent 空闲时检查
    appendNotification(message);
  }
}
```

**注意**：daemon 发送的消息用 `[DAEMON]` 前缀，和 Plan Agent 发给 Worker 的 `[PLAN-AGENT]` 前缀区分。

### 3.6 启动和关闭

**启动**：由 Plan Agent 在 kickoff 阶段末尾触发：
```bash
apex orch start
# → 启动 TypeScript 进程，后台运行
# → 写 PID 到 .apex/orch.pid
# → 写端口到 .apex/orch.port (如果有 HTTP API)
```

> **注意**：CLI 命令用 `apex orch`（orchestration daemon），
> 而非 `apex daemon`（已被 Dashboard launchd 守护进程占用）。

**关闭**：
- Plan Agent 在 Closure 完成后：`apex orch stop`
- 或 daemon 检测到所有任务 done + 无活跃 Worker → 自动停止

### 3.7 启动发现

daemon 启动时扫描 `.apex/workers/` 恢复已有 Worker 的状态。
如果是中断恢复场景（Plan Agent 重新进入 M&C 阶段），daemon 能从文件系统重建内存状态。

## 4. 通信协议

### 4.1 文件通信（结构化，可审计）

#### directive.json — Plan Agent → Worker（下行指令）

**写入方**：Plan Agent
**路径**：`.apex/workers/{task_id}/directive.json`
**读取方**：Worker Agent（在每个阶段边界检查）
**读取后**：Worker 重命名为 `directive.{timestamp}.consumed.json`

```json
{
  "from": "plan-agent",
  "created_at": "2026-04-14T21:00:00Z",
  "action": "amend",
  "content": {
    "description": "API 端点从 /users/batch 改为 /users/import，参数格式不变",
    "affected_sections": ["API endpoint URL"],
    "urgency": "normal"
  }
}
```

**action 枚举**：
- `amend` — 修改任务内容，Worker 调整后继续
- `pause` — 暂停当前工作，等待进一步指示
- `abort` — 放弃当前任务，写 result.json (verdict: "aborted") 后退出
- `info` — 补充信息（回复 Worker 的 escalation），Worker 读取后继续

#### escalation.json — Worker → Plan Agent（上行上报）

**写入方**：Worker Agent
**路径**：`.apex/workers/{task_id}/escalation.json`
**读取方**：daemon 检测 → 通知 Plan Agent
**读取后**：daemon 重命名为 `escalation.{timestamp}.processed.json`

```json
{
  "task_id": "T1",
  "type": "scope_question",
  "stage": "brainstorm",
  "summary": "API 端点 /users/batch 在代码库中不存在",
  "detail": "任务要求实现批量用户导入，依赖 /users/batch 端点，但 grep 整个代码库未找到",
  "suggestion": "需要先创建前置任务：实现 /users/batch 端点",
  "created_at": "2026-04-14T20:00:00Z"
}
```

**type 枚举**：
- `scope_question` — 任务范围有疑问，需要 Plan Agent 澄清
- `blocker` — 发现阻塞项，无法继续
- `discovery` — 发现计划外的问题或机会
- `conflict` — 发现和其他任务的潜在冲突
- `human_intervention` — 人类用户直接操作了 Worker 终端（无 `[PLAN-AGENT]` 前缀的输入）

#### status.json — Worker → daemon（进度更新）

已有，不变。路径：`.apex/workers/{task_id}/status.json`

#### result.json — Worker → daemon（最终结果）

已有，不变。路径：`.apex/workers/{task_id}/result.json`

### 4.2 终端通信（即时，信号级）

#### sendKey — 发送特殊按键

**新增接口方法**（`src/worker/terminal.ts`）：

当前 `TerminalAdapter` 接口（line 13-22）：
```typescript
export interface TerminalAdapter {
  name(): string;
  available(): boolean;
  createWindow(name: string, command: string): Promise<WindowHandle>;
  send(handle: WindowHandle, text: string): Promise<void>;
  readScreen(handle: WindowHandle, lines?: number): Promise<string>;
  close(handle: WindowHandle): Promise<void>;
  isAlive(handle: WindowHandle): Promise<boolean>;
  rename(handle: WindowHandle, name: string): Promise<void>;
}
```

**新增**：
```typescript
  sendKey(handle: WindowHandle, key: string): Promise<void>;
```

**CmuxAdapter 实现**：
```typescript
async sendKey(handle: WindowHandle, key: string): Promise<void> {
  const result = run(this.bin(), ["send-key", handle.id, key]);
  if (!result.ok) {
    throw new Error(`cmux send-key failed: ${result.stderr}`);
  }
}
```

**TmuxAdapter 实现**：
```typescript
async sendKey(handle: WindowHandle, key: string): Promise<void> {
  const result = run("tmux", ["send-keys", "-t", handle.id, key]);
  if (!result.ok) {
    throw new Error(`tmux send-keys failed: ${result.stderr}`);
  }
}
```

**按键映射**：

| 意图 | cmux key 名 | tmux key 名 |
|------|-------------|-------------|
| 中断 (ESC) | `escape` | `Escape` |
| 强制中断 (Ctrl+C) | `ctrl-c` | `C-c` |

#### 消息前缀协议

| 前缀 | 发送方 | 含义 |
|------|--------|------|
| `[PLAN-AGENT]` | Plan Agent → Worker | 上级指令，Worker 优先处理 |
| `[PLAN-AGENT:INTERRUPT]` | Plan Agent → Worker | 紧急中止，配合 ESC 使用 |
| `[PLAN-AGENT:RESUME]` | Plan Agent → Worker | 解除暂停，继续执行 |
| `[DAEMON]` | daemon → Plan Agent | 系统事件通知 |
| 无前缀 | 人类用户 → Worker | Worker 正常响应，阶段边界上报 |

#### 紧急打断流程

Plan Agent 决定打断 Worker T1：

```typescript
const adapter = detectAdapter();
const handle = workerHandles.get("T1");

// 1. 写 directive（结构化内容，Worker 恢复后读取）
writeDirective("T1", {
  action: "amend",
  content: { description: "新的任务要求...", urgency: "high" }
});

// 2. 发送 ESC 中断当前工具执行
await adapter.sendKey(handle, "Escape");  // cmux: "escape", tmux: "Escape"

// 3. 等待 Worker 回到提示符
let idle = false;
for (let i = 0; i < 10; i++) {
  await sleep(2000);
  const screen = await adapter.readScreen(handle, 5);
  if (screen.includes("❯") && !screen.includes("esc to interrupt")) {
    idle = true;
    break;
  }
}

// 4. 发送指令消息
if (idle) {
  await adapter.send(handle,
    "[PLAN-AGENT:INTERRUPT] 任务有变更，请立即检查 .apex/workers/T1/directive.json"
  );
}
```

### 4.3 Worker 协议扩展

Worker 的 protocol-template.ts（`sectionCommunication`）需要新增以下规则：

```markdown
## 终端消息处理

### [PLAN-AGENT] 前缀消息
收到以 [PLAN-AGENT] 开头的消息时，这是来自 Plan Agent 的指令。
- [PLAN-AGENT] → 常规指令，读取 directive.json 后继续
- [PLAN-AGENT:INTERRUPT] → 紧急指令，立即读取 directive.json
- [PLAN-AGENT:RESUME] → 暂停已解除，继续之前的工作

### 无前缀消息
收到不带 [PLAN-AGENT] 前缀的消息时，这是人类用户直接操作你的终端。
正常响应用户，但在下一个阶段边界写入 escalation.json：
  { "type": "human_intervention", "summary": "人类用户直接操作了终端" }

### 阶段边界检查
每次 apex stage complete <stage> 之后、apex stage set <next> 之前：
检查 directive.json 是否存在。如果存在：
- action: "amend" → 读取修改内容，调整后续工作
- action: "pause" → 暂停，等待 [PLAN-AGENT:RESUME]
- action: "abort" → 写 result.json (verdict: "aborted")，退出
- action: "info" → 读取补充信息，继续工作
```

## 5. 增量 Merge 机制

### 5.1 为什么不等最后一起 merge

- 如果 operating 阶段持续加新任务，永远没有"所有任务完成"的时刻
- 有依赖关系的任务（T2 depends on T1）需要 T1 merge 后 T2 才能基于最新代码工作
- 越早 merge 越早发现集成冲突

### 5.2 daemon 的增量 merge 流程

```
Worker T1 完成 (verdict=pass)
    │
    ▼
daemon: autoIntegrate(T1)
    ├── 在临时 worktree 做 merge + 跑测试
    ├── 测试通过 → autoMerge(T1) → 主分支更新
    │   → 记录 event: merge_completed
    │   → 检查依赖 DAG: T2 的依赖全部 done?
    │   → 是 → spawn T2 (基于最新主分支)
    │
    └── 测试失败 → 不 merge
        → 通知 Plan Agent: "T1 集成测试失败"
        → Plan Agent 诊断后决策
```

### 5.3 merge 冲突处理

如果 merge 有冲突：
1. daemon 不自动解决冲突
2. daemon 通知 Plan Agent: "T1 merge 到主分支时有冲突"
3. Plan Agent 创建一个 conflict-resolution 任务 → spawn Worker 解决
4. 或 Plan Agent 通知人类用户手动解决

## 6. Agent 适配层（现有不足 + 需要改进）

### 6.1 resolveAgent — 接入 worker_agent_rules

**当前代码**（`src/commands/worker.ts:27-37`）没有读 `worker_agent_rules`。

**需要改为**：
```typescript
export async function resolveAgent(args: string[], task: Task): Promise<string> {
  // 1. CLI --agent
  const idx = args.indexOf("--agent");
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];

  // 2. task.agent
  if (task.agent) return task.agent;

  // 3. task.adapter (backward compat)
  if (task.adapter) return task.adapter;

  try {
    const config = await loadConfig();

    // 4. worker_agent_rules[category] ← 新增
    if (config.worker_agent_rules && task.category) {
      const rule = config.worker_agent_rules.find(r => r.category === task.category);
      if (rule) return rule.agent;
    }

    // 5. worker_default_agent
    if (config.worker_default_agent) return config.worker_default_agent;
  } catch {}

  // 6. fallback
  return "claude";
}
```

### 6.2 agentStartCommand — 从 config.adapters 读取

**当前**：硬编码 switch-case（`protocol-template.ts:171-181`）。

**需要改为**：优先从 `config.adapters` 读取，硬编码作为 fallback。

```typescript
export async function agentStartCommand(agent: string, worktreePath: string): Promise<string> {
  // 1. 尝试从 config.adapters 读取自定义命令
  try {
    const config = await loadConfig();
    if (config.adapters?.[agent]) {
      const entry = config.adapters[agent];
      const args = entry.args ? entry.args.join(" ") : "";
      return `cd "${worktreePath}" && ${entry.command} ${args}`;
    }
  } catch {}

  // 2. 内置 fallback
  switch (agent) {
    case "codex":
      return `cd "${worktreePath}" && codex --full-auto`;
    case "gemini":
      return `cd "${worktreePath}" && gemini --yolo -p "$(cat .apex/worker-protocol.md)"`;
    case "claude":
    default:
      return `cd "${worktreePath}" && claude --append-system-prompt-file .apex/worker-protocol.md`;
  }
}
```

### 6.3 per-agent 中断策略

不同 Agent 对 ESC 的响应不同。需要 per-agent 中断命令：

```typescript
// 新增: src/worker/interrupt.ts
export function interruptKeys(agent: string): string[] {
  switch (agent) {
    case "claude":
      return ["Escape"];          // Claude Code: ESC 中断当前工具
    case "codex":
      return ["C-c"];             // Codex: Ctrl+C (--full-auto 模式下 ESC 可能无效)
    case "gemini":
      return ["C-c"];             // Gemini: Ctrl+C
    default:
      return ["Escape", "C-c"];   // 未知 agent: 先 ESC 再 Ctrl+C
  }
}
```

## 7. Dashboard 适配

### 7.1 显示 orchestrate:* 阶段

Dashboard 的 `materializePerSession` 已经支持任意 stage 名。
但前端渲染可能需要适配 `orchestrate:*` 前缀的阶段名显示。

**需要改动**：
- 前端识别 `orchestrate:` 前缀 → 用不同颜色/图标区分 Plan Agent 和 Worker 的 pipeline
- orchestration.event 类型的事件 → 渲染为时间线而非进度条

### 7.2 显示 orchestration 事件

M&C 阶段的事件渲染为时间线：
```
14:00  T1 spawned (claude)
14:05  T2 spawned (gemini)
14:23  T1 completed (pass) → merged
14:25  T3 spawned (codex) [unblocked by T1]
14:31  T2 escalation: "API endpoint not found"
14:35  Plan Agent: re-split, created T5
14:40  T5 spawned (claude)
...
```

### 7.3 materializeState 支持 orchestrate:* stage

现有 `runStructuralGate()` 在 `src/state/state.ts` 中是 switch-case，
只处理 brainstorm/plan/execute/review/ship/compound。

**需要扩展**：为 `orchestrate:*` 阶段添加门控检查（或走 default 分支直接通过）。

## 8. Plan Agent 单例与 Daemon 互斥

### 8.1 问题

同一项目目录下如果两个 session 都启动 `apex-master`：
- 两个 Plan Agent 同时创建任务 → task queue 混乱
- 两个 daemon 同时跑 tick → 同一个 Worker 被 merge 两次、被 spawn 两次
- 两个 Plan Agent 同时给同一个 Worker 发 directive → Worker 收到矛盾指令

session 隔离（per-session state cache）解决了 **pipeline stage 混乱**，
但不能解决 **两个编排者同时操作同一批 Worker** 的问题。

### 8.2 方案：lock 文件 + Plan Agent 注册

**单例锁**：daemon 启动时创建 `.apex/orch.lock`，写入 PID 和 session_id。

```json
{
  "pid": 12345,
  "session_id": "apex-2026-04-14-abc123",
  "started_at": "2026-04-14T21:00:00Z"
}
```

**规则**：
- `apex orch start` 时检查 `.apex/orch.lock`
  - lock 不存在 → 创建 lock，启动 daemon
  - lock 存在 + PID 存活 → 拒绝启动，报错："已有活跃的 Plan Agent session (session_id=xxx)"
  - lock 存在 + PID 已死 → 清除 stale lock，正常启动（上次异常退出的残留）
- `apex orch stop` 时删除 `.apex/orch.lock`

**Plan Agent 注册**：daemon 启动时记录 Plan Agent 的终端 handle，
确保 daemon 只通知一个 Plan Agent。

```json
// .apex/orch.lock
{
  "pid": 12345,
  "session_id": "apex-2026-04-14-abc123",
  "plan_agent_handle": { "id": "@42", "name": "plan-agent", "adapter": "cmux" },
  "started_at": "2026-04-14T21:00:00Z"
}
```

**第二个 session 尝试启动 apex-master 时**：
```
$ apex orch start
Error: 已有活跃的编排会话
  Session: apex-2026-04-14-abc123
  Started: 2026-04-14T21:00:00Z
  PID: 12345

选项:
  1. 接管：终止旧 session 的 daemon，启动新的（apex orch start --force）
  2. 加入：作为 Worker 执行者加入，不启动新 daemon
  3. 放弃：退出
```

### 8.3 实现

**新增检查**（`src/commands/orch.ts`）：
```typescript
const LOCK_PATH = ".apex/orch.lock";

async function acquireLock(sessionId: string, planAgentHandle: WindowHandle | null): Promise<boolean> {
  const lockData = JSON.stringify({
    pid: process.pid,
    session_id: sessionId,
    plan_agent_handle: planAgentHandle,
    started_at: new Date().toISOString(),
  });

  // 1. 尝试原子创建（O_CREAT | O_EXCL — 文件已存在则抛异常）
  try {
    writeFileSync(LOCK_PATH, lockData, { flag: "wx" });
    return true;  // 成功获取 lock
  } catch (e: any) {
    if (e.code !== "EEXIST") throw e;  // 非预期错误
  }

  // 2. 文件已存在 → 检查是否 stale（PID 已死）
  let lock: any;
  try {
    lock = JSON.parse(readFileSync(LOCK_PATH, "utf-8"));
  } catch {
    // lock 文件损坏 → 清除后重试
    try { unlinkSync(LOCK_PATH); } catch {}
    return acquireLock(sessionId, planAgentHandle);
  }

  try {
    process.kill(lock.pid, 0); // signal 0 = 存活检测
    // PID 存活 → lock 有效，拒绝
    return false;
  } catch {
    // PID 已死 → stale lock，清除后重试
    try { unlinkSync(LOCK_PATH); } catch {}
    return acquireLock(sessionId, planAgentHandle);
  }
}

function releaseLock(): void {
  try { unlinkSync(LOCK_PATH); } catch {}
}
```

**`--force` 模式**：
```typescript
if (hasFlag(args, "--force")) {
  // 读旧 lock → kill 旧 PID → 清除 lock → 继续
  if (existsSync(LOCK_PATH)) {
    const lock = JSON.parse(readFileSync(LOCK_PATH, "utf-8"));
    try { process.kill(lock.pid, "SIGTERM"); } catch {}
    unlinkSync(LOCK_PATH);
  }
}
```

## 9. Cross-Session 恢复

### 9.1 问题

Plan Agent session 可能因为以下原因中断：
- 终端窗口关闭
- 网络断开
- Claude Code session 超时
- 用户手动退出

中断时 daemon 仍在运行，Worker 仍在工作。
用户重新打开终端启动新的 Plan Agent session，需要恢复到 M&C 状态。

### 9.2 恢复信息来源

Plan Agent 恢复需要的所有信息都在文件系统中：

| 信息 | 来源 |
|------|------|
| 当前宏阶段 | `.apex/state.json` → `current_stage` (orchestrate:*) |
| 任务队列和状态 | `.apex/tasks.json` |
| 各 Worker 状态 | `.apex/workers/*/status.json` + `result.json` |
| 未处理的 escalation | `.apex/workers/*/escalation.json` |
| daemon 是否在运行 | `.apex/orch.lock` → PID 存活检测 |
| 编排事件历史 | `.apex/log/state.jsonl` → `orchestration.event` 类型 |
| 上一轮的需求和计划 | `docs/orchestrations/{name}-requirements.md` + `{name}-plan.md` |

### 9.3 恢复流程

新 session 启动 `/apex-master` 时，`apex init` 检测到中断的编排：

**Step 1: 检测中断状态**
```bash
apex status --json
# → stage: "orchestrate:monitoring" (不是 idle)
# → tasks: N total, M done, K in_progress
```

**Step 2: 检测 daemon 状态**
```bash
# 检查 .apex/orch.lock
# PID 存活 → daemon 还在跑
# PID 已死 → daemon 也断了
```

**Step 3: 呈现恢复选项**

Call `AskUserQuestion`:
```
检测到中断的编排会话：
  原 session: apex-2026-04-14-abc123
  阶段: Monitoring & Controlling
  任务: 5 total, 3 done, 1 in_progress, 1 open
  Daemon: 运行中 (PID 12345)
  活跃 Worker: T4 (claude, execute 阶段)

选择：
  1. 恢复编排 (Recommended) — 接管 daemon，继续监控
  2. 查看状态 — 先看详情再决定
  3. 重新开始 — 终止所有 Worker，重置状态
```

**Step 4: 恢复操作**

如果用户选择"恢复编排"：

```typescript
// 1. 更新 orch.lock 中的 Plan Agent handle
//    → daemon 后续通知发到新 session 的终端
updateDaemonLock({ plan_agent_handle: newHandle, session_id: newSessionId });

// 2. 读取所有未处理的通知
//    → daemon 在旧 Plan Agent 断开期间可能积累了通知
const pending = readPendingNotifications();
for (const n of pending) {
  presentToUser(n);  // 展示给用户
}

// 3. 读取未处理的 escalation
const escalations = scanUnprocessedEscalations();
for (const e of escalations) {
  presentToUser(e);
}

// 4. 生成状态摘要
//    "恢复完成。3 个任务已完成，T4 正在执行中（claude, execute 阶段），1 个待 spawn。"

// 5. 进入 M&C 循环
apex stage set orchestrate:monitoring  // 新 session 的 stage 事件
```

**如果 daemon 也断了**：
```typescript
// 1. 重启 daemon
await acquireLock(newSessionId, newHandle);
startDaemon();

// 2. daemon 启动时自动扫描 .apex/workers/ 恢复状态
//    → 检测哪些 Worker 还活着
//    → 检测哪些 Worker 已完成但未 merge
//    → 补做遗漏的 merge
//    → 恢复正常 tick 循环

// 3. 同上：读取未处理通知和 escalation
```

### 9.4 daemon 断线期间的数据安全

daemon 断了但 Worker 还在跑时：
- Worker 正常写 status.json / result.json → 文件不丢
- Worker 完成但没有被 merge → daemon 重启后补做
- Worker escalation 没有被处理 → Plan Agent 恢复后读取
- 新 ready 任务没有被 spawn → daemon 重启后 tick 补 spawn

**不会丢数据**，因为所有状态在文件系统。最坏情况是延迟处理。

### 9.5 通知队列

daemon 在 Plan Agent 断开期间积累的通知写到文件：

```
.apex/notifications/
  ├── 001-2026-04-14T21:05:00Z.json   # T1 completed, merged
  ├── 002-2026-04-14T21:12:00Z.json   # T2 escalation
  └── 003-2026-04-14T21:15:00Z.json   # T4 crashed
```

Plan Agent 恢复后按时间序读取所有通知，标记为已处理。

### 9.6 skill/roles/cross-session-exec.md 的关系

现有 `cross-session-exec.md` 是为 Worker Agent 设计的（恢复实现计划的执行）。
Plan Agent 的恢复逻辑不同——它恢复的不是"一个计划的步骤"，而是"一个管理者的上下文"。

需要新建 `skill/roles/master-recovery.md`，专门处理 Plan Agent 的 cross-session 恢复，
而非复用 `cross-session-exec.md`。

## 10. 实施顺序

分四个阶段实施，每个阶段独立可用：

### Phase 1: Plan Agent 阶段模型 + 协议更新

| 步骤 | 文件 | 改动 |
|------|------|------|
| 1 | `skill/roles/master.md` | 重写为新的阶段模型（Initiation/M&C/Closure） |
| 2 | `src/state/state.ts` | `runStructuralGate` 支持 `orchestrate:*` 阶段 |
| 3 | `src/worker/protocol-template.ts` | 新增 directive 检查规则和消息前缀协议 |
| 4 | `src/worker/terminal.ts` | 新增 `sendKey()` 接口方法 + 两个 adapter 实现 |
| 5 | `src/commands/worker.ts` | `resolveAgent` 接入 `worker_agent_rules` |
| 6 | 测试 | `terminal.test.ts` 加 sendKey 测试；`worker.test.ts` 加 agent rules 测试 |

### Phase 2: Daemon 进程

| 步骤 | 文件 | 改动 |
|------|------|------|
| 1 | `src/orchestrator/daemon.ts` | 新建：DaemonState + tick 循环 |
| 2 | `src/orchestrator/integrate.ts` | 新建：autoIntegrate + autoMerge |
| 3 | `src/orchestrator/notify.ts` | 新建：notifyPlanAgent (终端通知 + 文件队列 fallback) |
| 4 | `src/commands/orch.ts` | 新建：`apex orch start/stop/status` 命令 |
| 5 | `src/cli.ts` | 注册 `orch` 子命令 |
| 6 | 测试 | daemon tick 逻辑单元测试；integrate 逻辑测试 |

### Phase 3: Dashboard 适配

| 步骤 | 文件 | 改动 |
|------|------|------|
| 1 | `src/state/event-log.ts` | `materializeState` 识别 `orchestration.event` 类型 |
| 2 | `src/dashboard.ts` | `buildStatePayload` 包含 orchestration 事件 |
| 3 | `frontend/app.js` | orchestrate:* 阶段渲染 + 时间线视图 |
| 4 | `frontend/styles.css` | Plan Agent pipeline 样式区分 |

### Phase 4: 新增 CLI 命令

| 命令 | 功能 |
|------|------|
| `apex orch start` | 启动编排 daemon 进程（含 lock 获取） |
| `apex orch stop` | 停止编排 daemon 进程（释放 lock） |
| `apex orch status` | 显示编排 daemon 状态和监控数据 |
| `apex orchestrate event <action>` | 记录 orchestration 事件 |
| `apex worker interrupt <task-id>` | 打断 Worker (sendKey + send directive) |
| `apex worker directive <task-id> <action> <content>` | 写 directive.json |

### Phase 5: 单例互斥 + Cross-Session 恢复

| 步骤 | 文件 | 改动 |
|------|------|------|
| 1 | `src/commands/orch.ts` | 添加 lock 获取/释放/stale 检测逻辑 |
| 2 | `src/commands/orch.ts` | 添加 `--force` 接管模式 |
| 3 | `src/orchestrator/notify.ts` | 添加通知队列写入（Plan Agent 断线期间） |
| 4 | `src/orchestrator/daemon.ts` | 启动时扫描 `.apex/workers/` 恢复状态 + 补做遗漏 merge |
| 5 | `skill/roles/master.md` | 添加恢复流程：检测中断 → 呈现选项 → 恢复 M&C |
| 6 | `skill/roles/master-recovery.md` | 新建：Plan Agent cross-session 恢复专用协议 |
| 7 | 测试 | lock 互斥测试；恢复流程测试；通知队列测试 |

## 11. 约束

- Plan Agent 的阶段用 `orchestrate:` 前缀，不和 Worker 阶段混淆
- 事件日志格式不变（DomainEvent schema 不变），只增加新的 type
- 全局 state.json 保留（Dashboard 兼容）
- 现有 Worker 通信机制（status.json/result.json）保留，directive/escalation 是增量
- daemon 是可选组件——没有 daemon 时 Plan Agent 可以退化为手动监控（现有行为）
- 速率感知和预算门控保留开关（`worker_rate_limit_enabled`），关闭时 daemon 全速推进

## 12. 文件清单

| 文件 | 操作 | 预估行数 | Phase |
|------|------|---------|-------|
| `skill/roles/master.md` | 重写 | ~300 | 1 |
| `src/worker/terminal.ts` | 修改 | +20 | 1 |
| `src/worker/protocol-template.ts` | 修改 | +40 | 1 |
| `src/worker/interrupt.ts` | 新建 | ~30 | 1 |
| `src/commands/worker.ts` | 修改 | +15 | 1 |
| `src/state/state.ts` | 修改 | +20 | 1 |
| `src/state/event-log.ts` | 修改 | +10 | 1 |
| `src/orchestrator/daemon.ts` | 新建 | ~200 | 2 |
| `src/orchestrator/integrate.ts` | 新建 | ~80 | 2 |
| `src/orchestrator/notify.ts` | 新建 | ~80 | 2+5 |
| `src/commands/orch.ts` | 新建 | ~120 | 2+5 |
| `src/cli.ts` | 修改 | +15 | 4 |
| `frontend/app.js` | 修改 | +60 | 3 |
| `frontend/styles.css` | 修改 | +20 | 3 |
| `skill/roles/master-recovery.md` | 新建 | ~100 | 5 |
| 测试文件 (多个) | 新建/修改 | ~400 | 1-5 |
| **总计** | | **~1,510** |

## 13. 未覆盖（单独出 spec）

以下问题在本 spec 讨论中识别但不在此 spec 范围内，需要单独出 spec：

### Multi-Agent Adaptation Layer

> **注意**：`agentStartCommand` 从 `config.adapters` 读取已在 Section 6.2 覆盖（Phase 1 范围内）。
> `resolveAgent` 接入 `worker_agent_rules` 已在 Section 6.1 覆盖（Phase 1 范围内）。
> 以下为本 spec **未覆盖**的剩余问题：

- codex `--full-auto` 没有注入 `worker-protocol.md`
- gemini 的协议注入靠 shell 展开 `$(cat ...)`，脆弱
- 不同 agent 对中文 prompt 的遵从度未验证
- Worker 通信协议假设所有 agent 都能执行 bash，但不是所有 agent 都能
- 能力检测（spawn 前验证 agent CLI 功能，不只是 `which`）
- 多语言 protocol template（中文/英文根据 agent 类型选择）
- per-agent 协议注入方式统一（`--append-system-prompt-file` vs `-p` vs 无注入）

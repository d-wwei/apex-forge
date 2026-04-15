# Spec: Apex Manager — 独立多 Agent 编排器

> 目标：将 apex-forge 中的编排层提取为独立产品 apex-manager，
> 实现编排层与协议层的解耦。apex-manager 是通用多 Agent 编排器，
> apex-forge 是研发协议，两者独立安装、协作可选。

## 0. 核心理念

**编排层和协议层是两个东西。**

- apex-manager = Kubernetes（编排多个容器）
- apex-forge = 容器镜像（定义每个容器怎么跑）
- Kubernetes 不绑死一种容器镜像，apex-manager 不绑死 apex-forge

**卖点不是"AF 协议"，而是"在一个会话里管理多个并行的全链路 Agent"。**
协议是可选增强，不是前置依赖。

## 1. 产品定义

### 1.1 apex-manager 是什么

```
用户打开 Claude Code → 输入 /apex-manager
  → 当前会话变成 Plan Agent
  → 讨论、分解任务、选择 Agent 类型
  → 在 tmux/cmux 中派生 Worker Agent
  → 每个 Worker 是独立的 claude/codex/gemini/opencode 终端
  → Worker 协议可插拔：
      - 注入 apex-forge → 全链路六阶段研发协议
      - 注入 great-writer → 写作协议
      - 注入 security-audit → 安全审计协议
      - 注入用户自定义 skill → 用户自己的协议
      - 不注入 → 裸 agent，用户在 Worker 窗口里自己指挥
  → Daemon 监控、速率限制、成本追踪、增量 merge
```

### 1.2 不包含什么

| 不包含 | 原因 |
|--------|------|
| 研发协议（TDD、证据分级、门控） | 那是 apex-forge 的事 |
| Dashboard | 各产品各自做（或不做） |
| 事件溯源状态管理 | 简单 JSON 就够，不需要 JSONL + materialize |

### 1.3 产品形态

- 独立 Git 仓库：`github.com/d-wwei/apex-manager`
- 安装为 Claude Code skill：`~/.claude/skills/apex-manager/`
- 同时支持 Codex/Gemini/OpenCode 的 skill 目录
- Runtime：Node.js（daemon 进程），不依赖 Bun
- 调用方式：`/apex-manager`（顶层 skill 命令，和 `/apex-forge` 平级）

## 2. 架构

### 2.1 三层分工

```
人类用户
    │ 对话 / 需求变更 / 审批
    ▼
Plan Agent (当前 AI Session)    ← "将军"：判断 + 决策 + 用户沟通
    │ CLI 命令 + 终端直接通信
    ▼
Daemon (Node.js 进程)           ← "参谋部"：调度 + 监控 + 确定性操作
    │ spawn / kill / merge
    ▼
Worker Agents (独立终端进程)    ← "士兵"：各自执行任务
```

### 2.2 设计原则

| 原则 | 含义 |
|------|------|
| 确定性的用代码，判断的用 AI | daemon 做调度/监控/merge，Plan Agent 做需求理解/异常诊断/计划调整 |
| 各层只做自己的工作 | Plan Agent 不写代码，Worker 不跟用户对话，daemon 不做决策 |
| 文件系统即 IPC | 所有层通过 `.apex-manager/` 目录下的文件通信 |
| 终端是信号通道，文件是内容通道 | 紧急打断用终端 sendKey/send，结构化信息走 JSON 文件 |
| 增量交付 | Worker 完成一个就 merge 一个，不等所有任务完成 |
| 协议可插拔 | Worker 注入哪个 skill 作为协议，由 Plan Agent 决定 |

## 3. Plan Agent 阶段模型

### 3.1 三个宏阶段

```
Initiation → Monitoring and Controlling → Closure
  (线性,有门控)    (事件驱动,持续)           (线性,收尾)
```

### 3.2 Initiation（线性）

```
brainstorm → plan → split → kickoff → [首批 spawn + 启动 daemon]
```

| 步骤 | 做什么 | 门控 |
|------|--------|------|
| brainstorm | 和用户讨论需求、约束、成功标准 | 用户确认需求 |
| plan | 整体技术方案、架构选型、风险评估 | 用户确认方案 |
| split | 拆任务 + 建 DAG + 审查拆分质量 | DAG 无环 + 拆分审查通过 |
| kickoff | 选 agent + 选协议 + 用户终审 | 用户确认分配 + daemon 启动 |

**kickoff 的分配方案示例**：

```
任务分配方案：
  T1: 实现认证 API      → claude + apex-forge     → 无依赖
  T2: 写技术博客         → claude + great-writer   → 无依赖
  T3: 安全审计           → gemini + security-audit → 依赖 T1
  T4: 数据库优化         → codex  + (裸跑)         → 依赖 T1

确认？ [yes / adjust]
```

**每个 Worker 是 agent + protocol 的组合**。Plan Agent 扫描用户的 skill 目录，AI 判断哪些 skill 适合作为 Worker 协议。

### 3.3 Monitoring and Controlling（事件驱动）

Plan Agent 不走线性 pipeline，而是响应事件：

| 事件 | 来源 | Plan Agent 的处理 |
|------|------|-------------------|
| Worker 完成 (pass) | daemon 通知 | daemon 自动 integrate + merge + spawn 下游 |
| Worker 完成 (fail) | daemon 通知 | 诊断失败原因，re-spawn / 新任务 / escalate |
| Worker 崩溃 | daemon 通知 | 读 terminal screen，判断是否 re-spawn |
| Worker 上报问题 | daemon 检测 escalation.json | 和用户讨论后回复 directive |
| 用户新需求 | 用户直接对话 | 增删改任务，daemon 自动 spawn 新 ready 任务 |
| 紧急变更 | Plan Agent 主动 | sendKey(ESC) + send("[PLAN-AGENT] 新指令") |

**退出条件**：所有任务 done + 无 pending + 无活跃 Worker → daemon 通知 Plan Agent 进入 Closure。

### 3.4 Closure（线性）

| 步骤 | 做什么 |
|------|--------|
| final-check | 确认主分支干净、所有 merge 完成、无遗留 worktree/进程 |
| summary | 生成结案报告（任务清单、决策记录、变更历史、成本统计） |

## 4. Daemon 设计

### 4.1 职责划分

**daemon 自动执行（确定性）**：
- Worker 完成 (pass) → 在临时 worktree 做 integrate（merge + test）→ merge 到主分支 → 依赖解锁 → spawn 下游
- 新 ready 任务 → 找空闲 slot → `apex-manager worker spawn`
- Worker 状态更新 → 文件写入

**daemon 上报给 Plan Agent（需要判断）**：
- Worker 完成 (fail/blocked)
- Worker 崩溃（PID/terminal 消失 + 无 result.json）
- Worker 上报 escalation
- 速率/预算告警（如果 enabled）
- M&C 退出条件满足

### 4.2 tick 循环

```
每 10 秒：
  1. 扫描 .apex-manager/workers/*/
     - status.json 更新 → 记录
     - result.json 出现 → 处理完成
     - escalation.json 出现 → 通知 Plan Agent
     - PID/terminal 消失 → 标记崩溃
  2. 自动操作
     - pass → autoIntegrate → autoMerge → spawnUnblockedTasks
  3. 检查退出条件
     - 所有任务 done + 无活跃 Worker → 通知 Plan Agent
```

### 4.3 autoIntegrate

在临时 worktree 中做 merge + test，不污染主分支：

```
1. git worktree add .apex-manager/tmp-integrate-T1 HEAD --detach
2. cd tmp-worktree && git merge --no-ff apex/T1
3. 如果 merge 冲突 → 不 merge，通知 Plan Agent
4. 跑测试（如果项目有测试命令）
5. 如果测试失败 → 不 merge，通知 Plan Agent
6. 清理临时 worktree
```

通过后 autoMerge 在主分支执行真正的 merge。

### 4.4 notifyPlanAgent

```
1. 检查 Plan Agent 终端是否空闲（readScreen 看提示符）
2. 空闲 → 直接 send("[DAEMON] 消息内容")
3. 忙碌 → 写到通知队列文件，Plan Agent 空闲时检查
```

### 4.5 spawnUnblockedTasks

daemon 通过 CLI 子进程 spawn（不直接操作终端 adapter）：

```bash
apex-manager worker spawn T3 --agent claude --protocol apex-forge
```

`apex-manager worker spawn` 内部处理 worktree 创建、协议注入、终端窗口。
daemon 只读 spawn 后写入的 `meta.json` 跟踪 Worker。

### 4.6 启动和关闭

```bash
apex-manager orch start    # Plan Agent 在 kickoff 末尾调用
apex-manager orch stop     # Closure 完成后调用
apex-manager orch status   # 查看 daemon 状态
```

### 4.7 单例互斥

`.apex-manager/orch.lock` 写入 PID + session_id。
启动时检查：PID 存活 → 拒绝（或 `--force` 接管）；PID 已死 → 清除 stale lock。

## 5. 协议注入机制

### 5.1 核心原则

**不需要任何特殊接口。Plan Agent 是 AI，它直接读 SKILL.md 判断。**

### 5.2 发现流程

```
Plan Agent 在 kickoff 阶段：
  1. 扫描 ~/.claude/skills/ 目录
  2. 读取每个 skill 的 SKILL.md 前几行（name + description）
  3. AI 判断哪些 skill 适合作为 Worker 协议
  4. 结合任务特性，为每个 Worker 选择 agent + protocol 组合
  5. 呈现给用户确认
```

### 5.3 注入流程

```
spawn Worker T1（agent: claude, protocol: apex-forge）:
  1. 创建 worktree
  2. 生成 .worker-protocol.md:
     ─────────────────────────
     # Task: T1 — 实现认证 API

     ## 任务描述
     {Plan Agent 提供的任务信息}

     ## 验收标准
     {Plan Agent 提供}

     ## 已完成的前置依赖
     T0: 数据库模型设计 (done)

     ## 工作协议
     {~/.claude/skills/apex-forge/skill/SKILL.md 的内容}

     ## 通信协议
     {status.json / result.json 写入规则}
     {directive.json 检查规则}
     {[PLAN-AGENT] 消息前缀协议}
     ─────────────────────────
  3. claude --append-system-prompt-file .worker-protocol.md
```

**裸跑模式**：不选协议时，.worker-protocol.md 只有任务描述 + 通信协议，没有"工作协议"部分。Worker 作为普通 agent 运行，用户可以在 Worker 终端窗口里直接指挥。

### 5.4 通信协议（协议无关）

无论注入什么 skill 协议，以下通信规则始终注入（因为这是 apex-manager 的编排需要，不是任何 skill 的协议要求）：

**进度更新**：Worker 写 `.apex-manager/workers/T1/status.json`
**最终结果**：Worker 写 `.apex-manager/workers/T1/result.json`
**上报问题**：Worker 写 `.apex-manager/workers/T1/escalation.json`
**接收指令**：Worker 在工作间隙检查 `.apex-manager/workers/T1/directive.json`
**消息前缀**：`[PLAN-AGENT]` = 上级指令，无前缀 = 人类操作

## 6. 通信协议详述

### 6.1 文件通信

#### directive.json（Plan Agent → Worker）

```json
{
  "from": "plan-agent",
  "created_at": "2026-04-15T10:00:00Z",
  "action": "amend | pause | abort | info",
  "content": { "description": "...", "urgency": "normal | high" }
}
```

Worker 读取后重命名为 `directive.{timestamp}.consumed.json`。

#### escalation.json（Worker → Plan Agent）

```json
{
  "task_id": "T1",
  "type": "scope_question | blocker | discovery | conflict | human_intervention",
  "summary": "...",
  "detail": "...",
  "suggestion": "...",
  "created_at": "2026-04-15T10:00:00Z"
}
```

daemon 检测后重命名为 `escalation.{timestamp}.processed.json`。

#### status.json（Worker → daemon）

```json
{
  "task_id": "T1",
  "stage": "working",
  "progress": "3/5 subtasks done",
  "last_activity": "2026-04-15T10:05:00Z",
  "errors": []
}
```

#### result.json（Worker → daemon）

```json
{
  "task_id": "T1",
  "verdict": "pass | fail | blocked | aborted",
  "summary": "...",
  "findings": [],
  "completed_at": "2026-04-15T10:30:00Z",
  "branch": "apex-mgr/T1",
  "commit": "abc123"
}
```

### 6.2 终端通信

#### sendKey — 中断 Worker

```
Plan Agent 打断 Worker T1：
  1. 写 directive.json（结构化指令内容）
  2. sendKey(handle, "Escape")     ← 中断当前工具执行
  3. 等待 Worker 回到提示符
  4. send(handle, "[PLAN-AGENT:INTERRUPT] 检查 directive.json")
```

不同 agent 的中断键不同：

| Agent | 中断键 |
|-------|--------|
| claude | Escape |
| codex | Ctrl+C |
| gemini | Ctrl+C |
| opencode | Ctrl+C |

#### 消息前缀

| 前缀 | 发送方 | 含义 |
|------|--------|------|
| `[PLAN-AGENT]` | Plan Agent → Worker | 上级指令 |
| `[PLAN-AGENT:INTERRUPT]` | Plan Agent → Worker | 紧急中止 |
| `[PLAN-AGENT:RESUME]` | Plan Agent → Worker | 解除暂停 |
| `[DAEMON]` | daemon → Plan Agent | 系统事件通知 |
| 无前缀 | 人类 → Worker | Worker 正常响应，阶段边界上报 |

## 7. 多 Agent 适配

### 7.1 Agent Adapter 接口

每个 agent CLI 有一个标准化 adapter：

```typescript
interface AgentAdapter {
  name: string;                    // "claude" | "codex" | "gemini" | "opencode"
  binary: string;                  // CLI 二进制名
  buildStartCommand(opts: StartOpts): string;
  capabilities: {
    canExecuteBash: boolean;
    canWriteFiles: boolean;
    preferredLanguage: "zh" | "en";
    autoApprovalFlag?: string;     // "--full-auto" | "--yolo" | etc.
  };
  interruptKeys: string[];         // ["Escape"] or ["C-c"]
  skipProxyEnv: boolean;
}
```

### 7.2 内置 Adapter

| Agent | 协议注入方式 | 自动审批 | 中断键 |
|-------|-------------|---------|--------|
| claude | `--append-system-prompt-file` | 无（交互式） | Escape |
| codex | stdin pipe (`cat proto \| codex exec`) | `--full-auto` | C-c |
| gemini | `-p "$(cat proto)"` | `--yolo` | C-c |
| opencode | `-p "$(cat proto)"` | 无 | C-c |

### 7.3 config.yaml 覆盖

```yaml
# .apex-manager/config.yaml
adapters:
  my-agent:
    command: "/usr/local/bin/my-agent"
    args: ["--auto", "--prompt-file"]
```

### 7.4 能力检测

```bash
apex-manager worker check

Agent Status:
  claude     ✓ available   2.1.91
  codex      ✓ available   0.120.0
  gemini     ✓ available   0.37.1
  opencode   ✓ available   1.4.0
```

### 7.5 多语言 Protocol

Worker 协议的通信部分根据 agent 的 `preferredLanguage` 选择中文或英文。
任务描述部分不翻译（保留用户原文）。
JSON 字段名始终英文。

## 8. 数据目录

```
项目根目录/
  └── .apex-manager/                    ← apex-manager 独占
      ├── tasks.json                    ← 简单 JSON 任务列表
      ├── config.yaml                   ← 配置
      ├── orch.lock                     ← daemon 单例锁
      ├── orch.pid                      ← daemon PID
      ├── cost-log.jsonl                ← 成本记录
      ├── rate-limit.json               ← 速率限制
      ├── notifications/                ← daemon → Plan Agent 通知队列
      │   └── 001-{timestamp}.json
      ├── workers/
      │   └── T1/
      │       ├── meta.json
      │       ├── status.json
      │       ├── result.json
      │       ├── directive.json
      │       └── escalation.json
      └── worktrees/
          └── T1/                       ← Git worktree
              └── .worker-protocol.md   ← 注入的协议文件
```

## 9. Cross-Session 恢复

Plan Agent session 断开后重新进入：

```
/apex-manager

检测到中断的编排会话：
  原 session: ...
  任务: 5 total, 3 done, 1 in_progress, 1 open
  Daemon: 运行中 (PID 12345)
  活跃 Worker: T4 (claude, 执行中)

选择：
  1. 恢复编排 — 接管 daemon，继续监控
  2. 查看状态 — 先看详情再决定
  3. 重新开始 — 终止所有 Worker，重置
```

恢复时：
1. 更新 orch.lock 中的 Plan Agent handle
2. 读取未处理的通知和 escalation
3. 生成状态摘要，进入 M&C

## 10. 与 apex-forge 的关系

### 10.1 安装矩阵

| 场景 | 行为 |
|------|------|
| 只装 apex-manager | `/apex-manager` 可用，Worker 裸跑或注入其他 skill |
| 只装 apex-forge | apex-forge 的 install.sh 自动安装 apex-manager companion |
| 先装 apex-manager 后装 apex-forge | apex-forge 检测到 apex-manager 已存在，不重复安装 |
| 两个都装了 | `/apex-manager` 和 `/apex-forge` 各自独立调用 |

### 10.2 apex-forge 作为协议 skill

apex-manager 的 Plan Agent 扫描 skills 目录发现 apex-forge：
- 读 SKILL.md："Unified execution protocol for AI coding agents"
- AI 判断：适合作为编程类任务的 Worker 协议
- 选中后，读取 apex-forge 的 SKILL.md 内容注入给 Worker

Worker 收到后按 AF 六阶段协议工作。apex-manager 不需要理解 AF 协议的细节。

### 10.3 apex-forge 搬出后的清理

apex-forge 删除搬走的代码：
- 删除 `src/worker/`（整个目录搬走）
- 删除 `src/orchestrator/daemon.ts`, `integrate.ts`, `notify.ts`
- 删除 `src/commands/worker.ts`, `src/commands/orch.ts`
- 删除 `skill/roles/master.md`
- 保留 `src/worker/protocol-template.ts` → 改为 AF 的 companion 能力
  （当 apex-manager Worker 选择 AF 协议时，可以动态生成更丰富的 protocol 内容）
- CLI 删除 worker/orch 子命令
- 相关测试删除

## 11. 从 apex-forge 搬移的代码

### 11.1 搬移文件表

| 源 (apex-forge) | 目标 (apex-manager) | 改动 |
|-----------------|---------------------|------|
| `src/worker/terminal.ts` | `src/worker/terminal.ts` | 去掉 Bun API → 纯 Node |
| `src/worker/monitor.ts` | `src/worker/monitor.ts` | 路径 `.apex/` → `.apex-manager/` |
| `src/worker/agent-adapter.ts` | `src/worker/agent-adapter.ts` | 不变 |
| `src/worker/capability-check.ts` | `src/worker/capability-check.ts` | 不变 |
| `src/worker/interrupt.ts` | `src/worker/interrupt.ts` | 不变 |
| `src/worker/cost.ts` | `src/worker/cost.ts` | 路径改 |
| `src/worker/proxy.ts` | `src/worker/proxy.ts` | 路径改 + `Bun.serve()` → `http.createServer()` |
| `src/worker/cross-model.ts` | `src/worker/cross-model.ts` | 路径改 |
| `src/worker/protocol-template.ts` | `src/worker/protocol-template.ts` | 临时搬移，Phase 2 被 protocol-builder.ts 替换后删除 |
| `src/orchestrator/daemon.ts` | `src/daemon/daemon.ts` | 去 Bun + 路径改 + 去 AF 依赖 |
| `src/orchestrator/integrate.ts` | `src/daemon/integrate.ts` | 路径改 + `appendEvent` → `appendJSONL` |
| `src/orchestrator/notify.ts` | `src/daemon/notify.ts` | 不变 |
| `src/commands/worker.ts` | `src/commands/worker.ts` | 路径改 + protocol-template 改为 skill 注入 |
| `src/commands/orch.ts` | `src/commands/orch.ts` | 路径改 |
| `skill/roles/master.md` | `roles/manager.md` | 去 AF 引用 + 加协议发现逻辑 |
| 测试文件 | 对应搬移 | 路径调整 |

### 11.2 AF 内部依赖 — 需要在 AM 中重新创建

搬移的文件依赖以下 AF 内部模块。这些模块不搬移，而是在 AM 中创建等价实现：

| AF 模块 | 使用方 | AM 处理方式 |
|---------|--------|------------|
| `src/utils/json.ts` (readJSON, writeJSON) | monitor, proxy, cross-model, daemon, cmd/worker | 复制到 `src/utils/json.ts`（纯 fs 操作，无 AF 耦合） |
| `src/utils/logger.ts` (appendJSONL) | proxy | 复制到 `src/utils/logger.ts` |
| `src/state/event-log.ts` (appendEvent) | daemon, integrate | 不搬移。AM 不用事件溯源。daemon/integrate 中的 `appendEvent` 调用改为 `appendJSONL` 写入 `.apex-manager/event-log.jsonl`（纯日志，不做 materialize） |
| `src/state/config.ts` (loadConfig) | protocol-template | 新建简化版 `src/utils/config.ts`：只读 `.apex-manager/config.yaml` |
| `src/types/task.ts` (Task, TaskStore) | cross-model, cmd/worker | 复制类型定义到 `src/types/task.ts` |
| `src/types/config.ts` (AdaptersMap) | agent-adapter, protocol-template | 复制类型定义到 `src/types/config.ts` |

### 11.3 Bun API 替换清单

| 文件 | Bun API | Node.js 替换 |
|------|---------|-------------|
| `src/worker/proxy.ts` | `Bun.serve()` (3 处) | `http.createServer()` + 手动路由 |
| 其他文件 | 无 Bun 特有 API | 已使用 Node.js 标准库 |

## 12. 新 repo 目录结构

```
apex-manager/
  ├── SKILL.md                          ← /apex-manager 入口
  ├── package.json                      ← Node.js, 零 native 依赖
  ├── tsconfig.json
  ├── README.md
  ├── install.sh                        ← 安装脚本
  │
  ├── roles/
  │   └── manager.md                    ← Plan Agent 角色定义
  │
  ├── src/
  │   ├── cli.ts                        ← CLI 入口
  │   ├── utils/
  │   │   ├── json.ts                   ← readJSON / writeJSON
  │   │   ├── logger.ts                 ← appendJSONL
  │   │   └── config.ts                 ← loadConfig (.apex-manager/config.yaml)
  │   ├── types/
  │   │   ├── task.ts                   ← Task / TaskStore
  │   │   └── config.ts                 ← AdaptersMap
  │   ├── daemon/
  │   │   ├── daemon.ts                 ← tick 循环
  │   │   ├── integrate.ts              ← 集成验证 + merge
  │   │   └── notify.ts                 ← 通知 Plan Agent
  │   ├── worker/
  │   │   ├── terminal.ts               ← tmux/cmux 适配器
  │   │   ├── monitor.ts                ← Worker 健康检查
  │   │   ├── agent-adapter.ts          ← 多 agent 适配
  │   │   ├── capability-check.ts       ← 能力检测
  │   │   ├── interrupt.ts              ← 中断策略
  │   │   ├── cost.ts                   ← 成本追踪
  │   │   ├── proxy.ts                  ← 速率限制（Node http.createServer）
  │   │   ├── cross-model.ts            ← 跨模型综合
  │   │   └── protocol-builder.ts       ← 组装 .worker-protocol.md (Phase 2 新建)
  │   └── commands/
  │       ├── worker.ts                 ← spawn/kill/list/status/merge/interrupt/check
  │       └── orch.ts                   ← start/stop/status
  │
  └── tests/
      ├── worker/
      └── daemon/
```

## 13. CLI 命令

```bash
# Worker 管理
apex-manager worker spawn <task-id> [--agent claude] [--protocol apex-forge] [--cross-model]
apex-manager worker kill <task-id>
apex-manager worker list
apex-manager worker status <task-id>
apex-manager worker merge <task-id> [--strategy local|squash|pr]
apex-manager worker merge-all [--strategy local|squash|pr]
apex-manager worker synthesize <task-id>
apex-manager worker interrupt <task-id>
apex-manager worker check
apex-manager worker directive <task-id> <action> <content>
apex-manager worker report

# Daemon 管理
apex-manager orch start [--force]
apex-manager orch stop
apex-manager orch status

# 任务管理
apex-manager task create <title> <description> [DEP1 DEP2]
apex-manager task list
apex-manager task status <task-id>
```

## 14. 实施顺序

### Phase 1: 新 repo 搭建 + 代码搬移

| 步骤 | 内容 |
|------|------|
| 1 | 创建 apex-manager repo，初始化 package.json (Node.js)，配置 tsconfig |
| 2 | 创建 AM 自有的 utils/types 模块（见 Section 11.2）：`src/utils/json.ts`, `src/utils/logger.ts`, `src/utils/config.ts`, `src/types/task.ts`, `src/types/config.ts` |
| 3 | 搬移 src/worker/ 全部文件 + protocol-template.ts（临时），去 Bun API（见 Section 11.3），路径 `.apex/` → `.apex-manager/`，import 指向 AM 自有模块 |
| 4 | 搬移 daemon 文件，去 Bun + `appendEvent` → `appendJSONL` + 路径改 + import 指向 AM 自有模块 |
| 5 | 搬移 commands 文件，路径改 + import 指向 AM 自有模块 |
| 6 | 搬移测试文件，调整 import 路径 |
| 7 | 搬移 master.md → manager.md，去 AF 引用 |
| 8 | 写 CLI 入口 (cli.ts)，注册所有子命令 |
| 9 | 写 SKILL.md（/apex-manager 入口定义） |
| 10 | 写 install.sh |
| 11 | `npm test` 全绿 |

### Phase 2: 协议注入重写

| 步骤 | 内容 |
|------|------|
| 1 | 新建 protocol-builder.ts：组装 .worker-protocol.md（任务信息 + skill 内容 + 通信规则） |
| 2 | 修改 worker spawn：`--protocol <skill-name>` 参数 → 找 skill → 读 SKILL.md → 注入 |
| 3 | 支持裸跑模式（无 --protocol → 只有任务描述 + 通信规则） |
| 4 | 写测试 |

### Phase 3: Plan Agent 角色定义

| 步骤 | 内容 |
|------|------|
| 1 | 重写 roles/manager.md：Initiation/M&C/Closure 阶段模型 |
| 2 | 加入协议发现逻辑：扫描 skills 目录，AI 判断 |
| 3 | 加入 kickoff 分配方案格式：agent + protocol 组合 |

### Phase 4: apex-forge 清理

| 步骤 | 内容 |
|------|------|
| 1 | 删除搬走的代码（src/worker/ 大部分、src/orchestrator/daemon 系列、commands/worker&orch） |
| 2 | 保留 protocol-template.ts 作为 AF companion 能力 |
| 3 | CLI 删除 worker/orch 子命令 |
| 4 | 删除相关测试 |
| 5 | install.sh 加入 apex-manager companion 自动安装 |
| 6 | `bun test` 全绿（apex-forge 侧） |

### Phase 5: 集成验证

| 步骤 | 内容 |
|------|------|
| 1 | 只装 apex-manager → `/apex-manager` → Worker 裸跑 |
| 2 | 装 apex-forge（自动装 apex-manager）→ `/apex-manager` → Worker 可选 AF 协议 |
| 3 | `/apex-forge` 单任务 → 正常工作（不受 manager 代码搬走影响） |
| 4 | 多 Worker 编排端到端测试 |

## 15. 约束

- apex-manager 零依赖 apex-forge（不 import 任何 AF 代码）
- daemon 用纯 Node.js，不依赖 Bun
- `.apex-manager/` 目录完全独立于 `.apex/`
- Worker 分支前缀用 `apex-mgr/T{N}`（和 AF 的 `apex/T{N}` 区分）
- 协议发现靠 AI 读 SKILL.md，不需要 skill 作者添加特殊字段
- tasks.json 用简单 JSON，不用事件溯源
- 速率感知和预算门控保留开关，关闭时全速推进
- **禁止递归嵌套**：Worker 不得被注入 apex-manager 自身作为协议。Worker 是执行层，不具备编排能力。如果任务超出单个 Worker 能力范围，Worker 写 `blocked` 状态交回 Plan Agent 重新拆分。enforcement 方式：protocol-builder.ts 组装 .worker-protocol.md 时始终注入一句："你是一个 Worker Agent。你执行分配给你的任务。你不派生子 Worker。如果任务超出你的能力范围，写 blocked 状态说明原因，交回给 Plan Agent 重新拆分。"同时 Plan Agent 角色定义（manager.md）中明确：协议发现时跳过 apex-manager 自身

## 16. 预估

| 组件 | 行数 |
|------|------|
| 搬移代码（改路径 + 去 Bun） | ~1,800（现有代码改造） |
| AM 自有 utils/types（从 AF 提取简化） | ~200 |
| protocol-builder.ts（新） | ~150 |
| SKILL.md + manager.md（新） | ~400 |
| CLI 入口 + install.sh（新） | ~100 |
| 测试改造 + 新测试 | ~500 |
| apex-forge 清理 | -1,500（删除搬走的代码） |
| **apex-manager 仓库总代码** | **~3,200** |

# Plan: Apex-Forge Master Agent (Team Manager Skill)

## Context

Apex-Forge 当前是单 Agent 全链路执行协议。用户在 Claude Code 中输入 `/apex-forge`，协议注入当前会话，Agent 按六阶段（Brainstorm → Plan → Execute → Review → Ship → Compound）走完一个任务。

现在要增加一个 **"团队经理"模式**：在 Claude Code 中输入 `/apex-master`，当前会话变为 Plan Agent。Plan Agent 与用户持续对话、分解任务、派生多个独立的 Apex-Forge Worker Agent 到单独终端窗口并行工作、动态管理任务队列、根据 Worker 完成情况调整后续计划。

**核心区别**：与 cmux-team 的流水线模式（每个 Agent 只做一环）不同，Apex-Forge 的每个 Worker 是**完整的全链路实例**——自己走完六阶段协议，保持完整上下文。Plan Agent 不介入 Worker 的执行过程，只管任务分配和队列调度。

**这个 Plan 不涉及代码实现，只做架构设计和文件规划。** 实际代码将在 Apex-Forge 仓库（`/Users/admin/Documents/AI/agent better work/apex-forge/`）中实现。

---

## 1. Architecture

```
用户 ↔ Plan Agent (当前 Claude Code 会话, /apex-master 激活)
         │
         ├── [持续对话] 讨论目标、分解任务、调整计划
         ├── [任务管理] apex task create/list/block/release
         │
         ├── Worker Agent ×N (各自独立终端窗口, 各自完整 AF 协议)
         │   ├── Worker-1 (tmux/cmux window, worktree: .apex/worktrees/T1)
         │   │   └── 独立 AF 实例: Brainstorm → Plan → Execute → Review → Ship
         │   ├── Worker-2 (tmux/cmux window, worktree: .apex/worktrees/T2)
         │   │   └── 独立 AF 实例: 用户可在此窗口直接交互
         │   └── Worker-3 (tmux/cmux window, worktree: .apex/worktrees/T3)
         │
         └── Monitor SubAgent ×N (Claude Code Agent tool, 后台运行)
             ├── 读 .apex/workers/*/status.json (文件状态)
             ├── 读 tmux/cmux 屏幕内容 (实时进度)
             ├── 检测 Worker 崩溃 (PID + 终端存活检查)
             └── 汇总报告回传给 Plan Agent
```

### 1.1 角色职责

| 角色 | 载体 | 职责 | 禁止 |
|------|------|------|------|
| **Plan Agent** | 当前 Claude Code 会话 | 与用户对话、分解任务、管理队列、派生/终止 Worker、根据结果调整计划 | 写代码、直接修改文件、git 操作 |
| **Worker Agent** | 独立终端窗口 (tmux/cmux) | 在 worktree 中执行完整 AF 协议、写代码、跑测试、提交结果、与用户交互（AF 协议中的审批/确认等环节） | 修改其他 Worker 的文件、修改主项目代码文件 |
| **Monitor SubAgent** | Claude Code Agent tool (后台) | 轮询 Worker 状态、读终端屏幕、检测崩溃、收集结果 | 修改任何文件、与用户直接交互 |

### 1.2 生命周期

```
1. 用户输入 /apex-master → 加载 skill/roles/master.md → 会话变为 Plan Agent
2. 用户描述目标 → Plan Agent 分析代码库、拆分子任务、识别依赖
3. 用户确认任务队列 → Plan Agent 调用 apex task create 创建任务
4. Plan Agent 调用 apex worker spawn T1 T2 T3 → 创建 worktree + 终端窗口 + 启动 Worker
5. Plan Agent 派生 Monitor SubAgent (后台) → 持续监控 Worker 进度
6. [并行] Worker 各自执行 AF 协议 / 用户可切换到 Worker 窗口交互 / Plan Agent 继续与用户对话
7. Monitor 检测到 Worker-1 完成 → 回传结果给 Plan Agent
8. Plan Agent 评估结果 → 调整后续任务队列（新增/修改/取消任务）
9. 所有任务完成 → Plan Agent 汇总报告 → 协调 merge/PR
```

---

## 2. 终端管理层 (TerminalAdapter)

### 2.1 接口定义

```typescript
// src/worker/terminal.ts

interface WindowHandle {
  id: string;         // tmux target 或 cmux surface ID
  name: string;       // 窗口标题 (如 "T1-auth-api")
  adapter: string;    // "cmux" | "tmux"
}

interface TerminalAdapter {
  name(): string;                                              // "cmux" | "tmux"
  available(): boolean;                                        // CLI 是否可用
  createWindow(name: string, command: string): Promise<WindowHandle>;  // 创建窗口并执行命令
  send(handle: WindowHandle, text: string): Promise<void>;     // 向窗口发送文本/命令
  readScreen(handle: WindowHandle, lines?: number): Promise<string>;   // 读取窗口屏幕内容
  close(handle: WindowHandle): Promise<void>;                  // 关闭窗口
  isAlive(handle: WindowHandle): Promise<boolean>;             // 检查窗口是否还存在
  rename(handle: WindowHandle, name: string): Promise<void>;   // 重命名窗口
}
```

### 2.2 双实现

**CmuxAdapter** — 在 cmux 会话内使用：

| 操作 | cmux 命令 | 备注 |
|------|----------|------|
| createWindow | `cmux new-surface [paneId]` + `cmux send <surface> "command"` | paneId 可选，控制窗口位置 |
| send | `cmux send <surface> "text"` | |
| readScreen | `cmux read-screen <surface> --lines N` | 10 秒超时 |
| close | `cmux close-surface <surface>` | 幂等，不抛错 |
| isAlive | `cmux validate-surface <surface>` | 内建 3 次重试 (200/400/800ms) |
| rename | `cmux rename-tab <surface> "name"` | |

**TmuxAdapter** — 在普通终端使用：

| 操作 | tmux 命令 | 备注 |
|------|----------|------|
| createWindow | `tmux new-window -n "name" "command"` | 在当前 session 创建 |
| send | `tmux send-keys -t "target" "text" Enter` | |
| readScreen | `tmux capture-pane -t "target" -p` | 读取整个 pane 内容 |
| close | `tmux kill-window -t "target"` | |
| isAlive | `tmux list-windows` + 检查 target 存在 | 需要自己实现重试 |
| rename | `tmux rename-window -t "target" "name"` | |

### 2.3 自动检测逻辑

```
if (process.env.CMUX_SURFACE exists)
  → 当前在 cmux 会话内 → CmuxAdapter
elif (which cmux succeeds && in tmux session)
  → cmux 可用 → CmuxAdapter
elif (which tmux succeeds)
  → TmuxAdapter
else
  → Error: "apex worker requires tmux or cmux. Install: brew install tmux"
```

---

## 3. 通信机制

### 3.1 文件系统布局

```
项目根/.apex/
├── tasks.json                    ← 共享任务队列 (event sourcing, 并发安全)
├── log/tasks.jsonl               ← 任务事件日志 (append-only)
│
├── workers/                      ← Worker 注册和通信目录
│   ├── T1/
│   │   ├── meta.json             ← Worker 注册信息
│   │   ├── status.json           ← Worker 实时状态 (Worker 写, Plan Agent 读)
│   │   └── result.json           ← Worker 完成结果 (Worker 写, Plan Agent 读)
│   ├── T2/
│   │   └── ...
│   └── T3/
│       └── ...
│
└── worktrees/                    ← Git worktree 工作目录
    ├── T1/                       ← Worker-1 的隔离工作区
    │   ├── .apex/                ← Worker 自己的 AF 状态 (独立于主项目)
    │   │   ├── state.json
    │   │   ├── tasks.json        ← Worker 内部的子任务 (如果 Worker 自己做 Plan 分解)
    │   │   └── worker-protocol.md ← 注入的 AF 协议 + 任务描述
    │   └── (项目源码)
    ├── T2/
    └── T3/
```

### 3.2 meta.json 格式

```json
{
  "task_id": "T1",
  "pid": 12345,
  "window_handle": { "id": "surface:42", "name": "T1-auth-api", "adapter": "cmux" },
  "worktree_path": ".apex/worktrees/T1",
  "branch": "apex/T1",
  "started_at": "2026-04-13T10:00:00Z",
  "adapter": "claude"
}
```

### 3.3 status.json 格式

```json
{
  "task_id": "T1",
  "stage": "execute",
  "progress": "T1.3 of 5 subtasks done",
  "last_activity": "2026-04-13T10:15:00Z",
  "errors": []
}
```

Worker 在 AF 协议的关键节点写入此文件：
- `apex stage set <name>` 时更新 stage
- 每个子任务完成时更新 progress
- 遇到错误时追加 errors

### 3.4 result.json 格式

```json
{
  "task_id": "T1",
  "verdict": "pass",
  "summary": "实现了 JWT 认证 API，包含 /login /register /refresh 三个端点",
  "findings": [],
  "completed_at": "2026-04-13T11:30:00Z",
  "branch": "apex/T1",
  "commit": "a1b2c3d"
}
```

### 3.5 通信流向

```
Plan Agent → Worker:
  1. 任务分配: apex task create → .apex/tasks.json (Worker 启动时读取)
  2. 任务描述: 写入 worktree/.apex/worker-protocol.md (Worker 启动时注入)
  3. 实时指令: TerminalAdapter.send() 向 Worker 终端发送文本
  4. 终止: TerminalAdapter.close() 关闭窗口

Worker → Plan Agent:
  1. 状态更新: 写 .apex/workers/<task-id>/status.json
  2. 完成结果: 写 .apex/workers/<task-id>/result.json
  3. 任务状态: apex task submit/verify 更新 .apex/tasks.json

Monitor → Plan Agent:
  1. 周期汇总: Agent tool 返回值 (每 60 秒一次)
  2. 崩溃告警: 检测到 PID 不存在或终端消失时立即返回
  3. 屏幕快照: TerminalAdapter.readScreen() 的最近 N 行
```

---

## 4. Worker Agent 选择机制

### 4.1 配置：按任务类别设置默认 Agent

用户在 `.apex/config.yaml` 中定义默认映射：

```yaml
# .apex/config.yaml

# 全局默认 (未匹配任何类别时使用)
worker_default_agent: claude

# 按任务类别的默认 Agent
worker_agent_rules:
  - category: code        # 开发、实现、修 bug、重构
    agent: claude
  - category: review      # Code review、安全审计
    agent: claude
  - category: design      # UI 设计、画图、前端视觉
    agent: gemini
  - category: research    # 调研、分析、文档阅读
    agent: gemini
  - category: test        # 测试、QA
    agent: codex
```

**类别判定**：Plan Agent 在分解任务时为每个任务标注 category（基于任务描述的语义判断）。`apex task create` 已有 description 字段，category 作为新字段追加。

### 4.2 Plan Agent 交互流程

Plan Agent 分解完任务后，**派生前**向用户确认 Agent 分配：

```
Plan Agent:
  任务分解完成，共 4 个子任务:

  T1: 设计用户数据模型          → claude (code)
  T2: 实现认证 API             → claude (code)
  T3: 设计登录页 UI            → gemini (design)
  T4: 写前端登录页             → claude (code)

  这是基于你的默认配置。需要调整吗？
  1. 按当前分配执行 (Recommended)
  2. 调整个别任务的 Agent
  3. 全部改用同一个 Agent

用户选 2:
  Plan Agent: 哪个任务要改？
  用户: T3 也用 claude 吧
  Plan Agent: 好的，T3 改为 claude。确认派生？
  用户: 确认
  Plan Agent: → apex worker spawn T1 --agent claude
              → apex worker spawn T3 --agent claude
              → ...
```

### 4.3 Agent 解析优先级

```
1. apex worker spawn --agent <显式指定>        ← 最高：CLI 参数
2. 用户在 Plan Agent 交互中的选择              ← Plan Agent 传给 spawn 的 --agent
3. config.yaml worker_agent_rules[category]   ← 按任务类别匹配
4. config.yaml worker_default_agent           ← 全局默认
5. "claude"                                   ← 硬编码兜底
```

### 4.4 配置类型扩展

```typescript
// src/types/config.ts 新增

interface WorkerAgentRule {
  category: string;   // "code" | "review" | "design" | "research" | "test" | 自定义
  agent: string;      // "claude" | "codex" | "gemini" | 自定义
}

// ApexConfig 新增字段:
worker_default_agent?: string;            // 默认 "claude"
worker_agent_rules?: WorkerAgentRule[];   // 按类别映射
```

### 4.5 Task 类型扩展

```typescript
// src/types/task.ts 新增字段:
export interface Task {
  // ... 现有字段 ...
  category?: string;    // Plan Agent 标注: "code" | "review" | "design" | "research" | "test"
  agent?: string;       // 用户/配置指定的 Agent: "claude" | "codex" | "gemini"
}
```

---

## 5. Worker 启动流程

`apex worker spawn <task-id> [--agent claude|codex|gemini]`

```
1. 读取任务信息
   apex task get <task-id> → 获取 title, description, depends_on, category, agent

2. 解析 Agent 类型
   CLI --agent > task.agent > config.worker_agent_rules[category] > config.worker_default_agent > "claude"

3. 验证 Agent CLI 可用
   which <agent> → 不可用则报错提示安装

4. 创建 git worktree
   git worktree add .apex/worktrees/<task-id> -b apex/<task-id>
   → 失败时回退到纯目录 (mkdir -p)

5. 初始化 worktree
   ├── cd .apex/worktrees/<task-id>
   ├── 检测并运行项目安装 (npm install / bun install / etc.)
   ├── apex init (在 worktree 中初始化 .apex/)
   └── 生成 .apex/worker-protocol.md (任务描述 + AF 协议规则 + 通信协议)

6. 写 Worker 注册信息
   mkdir -p .apex/workers/<task-id>/
   写入 meta.json (worktree_path, branch, agent, started_at)

7. 更新任务状态
   apex task assign <task-id>
   apex task start <task-id>

8. 在新终端窗口启动 Worker
   根据 agent 类型构建启动命令:
     claude → "cd <worktree> && claude --append-system-prompt-file .apex/worker-protocol.md"
     codex  → "cd <worktree> && codex --full-auto"  (prompt 通过 stdin 或文件注入)
     gemini → "cd <worktree> && gemini --yolo -p \"$(cat .apex/worker-protocol.md)\""
   TerminalAdapter.createWindow(name: "<task-id>-<slug>", command: <上面的命令>)

9. 更新 meta.json (补充 PID 和 window_handle)

10. 输出确认
    "Worker T1 spawned in window T1-auth-api (agent: claude, worktree: .apex/worktrees/T1)"
```

---

## 5. Worker 协议文件 (worker-protocol.md)

生成器: `src/worker/protocol-template.ts`

每个 Worker 的 `.apex/worker-protocol.md` 包含以下部分:

```markdown
# Apex-Forge Worker Agent — Task {task_id}

## 你的任务
Title: {title}
Description: {description}
Acceptance Criteria: {criteria}
Dependencies completed: {completed_deps}

## 执行协议
你是一个独立的 Apex-Forge 实例。按照完整的 AF 协议执行:
- Tier 判定: 根据任务复杂度选择 Tier 1/2/3
- Tier 1: Execute → Ship
- Tier 2/3: Brainstorm → Plan → Execute → Review → Ship

## 核心规则 (从 SKILL.md 提取)
- TDD 铁律: 先写测试 → RED → 写代码 → GREEN → 重构
- 证据分级: 声明完成必须提供 E3 级证据
- 验证门控: 任何成功声明前必须运行验证命令并确认输出

## 通信协议
你在独立的 worktree 中工作。需要向主项目报告状态:

### 进度更新 (每完成一个子任务)
echo '{"task_id":"{task_id}","stage":"execute","progress":"...","last_activity":"..."}' > {project_root}/.apex/workers/{task_id}/status.json

### 完成时
echo '{"task_id":"{task_id}","verdict":"pass","summary":"...","branch":"apex/{task_id}","commit":"..."}' > {project_root}/.apex/workers/{task_id}/result.json
cd {project_root} && apex task submit {task_id} "证据描述"
cd {project_root} && apex task verify {task_id} pass

### 遇到阻塞时
cd {project_root} && apex task block {task_id} "阻塞原因"

## 工作边界
- 只修改 worktree 内的文件
- 不要修改主项目的代码文件
- 不要修改其他 Worker 的 worktree
- Git 操作限于当前分支 (apex/{task_id})
```

---

## 6. Monitor SubAgent

Plan Agent 通过 Claude Code 的 `Agent` tool 派生后台监控子 Agent。

### 6.1 Monitor 的 prompt

```
你是一个 Worker 监控 Agent。你的职责是检查所有活跃 Worker 的状态并汇报。

执行以下步骤:
1. 运行 apex worker list 获取所有活跃 Worker
2. 对每个 Worker:
   a. 读取 .apex/workers/<task-id>/status.json (当前阶段和进度)
   b. 读取 .apex/workers/<task-id>/result.json (是否已完成)
   c. 检查 PID 是否存活: kill -0 <PID>
   d. 如果终端 adapter 是 tmux/cmux，读取最近 5 行屏幕内容
3. 汇总报告:
   - 哪些 Worker 在正常工作
   - 哪些 Worker 已完成 (有 result.json)
   - 哪些 Worker 可能崩溃了 (PID 不存在或终端消失)
   - 哪些 Worker 可能卡住了 (last_activity 超过 10 分钟未更新)

只报告事实，不做决策。决策由 Plan Agent 做。
```

### 6.2 Monitor 调度策略

Plan Agent 在以下时机派生 Monitor:
- 派生 Worker 后立即启动第一次监控
- 每隔 60 秒派生一次（或用 CronCreate 定时）
- 用户问"进度怎么样"时手动触发
- Worker 数量发生变化时（新增/终止）

---

## 7. Plan Agent 动态任务管理

### 7.1 Worker 完成后的处理

```
Monitor 报告 Worker-T1 完成 (verdict: pass):
  1. Plan Agent 读取 .apex/workers/T1/result.json
  2. 评估结果是否影响后续任务:
     - T1 的产出是否改变了 T3 的前提条件?
     - T1 发现了新问题需要新增任务?
  3. 如果需要调整:
     - apex task create "新任务" --depends-on T1
     - apex task block T4 "需要等 T7 先完成"
  4. 清理:
     - 关闭 Worker-T1 的终端窗口 (或保留供用户查看)
     - 保留 worktree (供后续 merge)
```

### 7.2 Worker 失败后的处理

```
Monitor 报告 Worker-T2 崩溃/失败:
  1. Plan Agent 读取 .apex/workers/T2/status.json 了解最后状态
  2. 读取 Worker-T2 终端最近 20 行 (TerminalAdapter.readScreen)
  3. 判断:
     a. 可重试 → 关闭旧窗口 → apex worker spawn T2 重新派生
     b. 需要调整任务 → 修改任务描述 → 重新派生
     c. 需要人工介入 → 告知用户，等待指示
  4. 更新任务状态: apex task release T2 (回到 open) 或 apex task block T2 "原因"
```

### 7.3 用户中途调整

```
用户: "T3 不需要做了，改成做 XXX"
Plan Agent:
  1. apex worker kill T3 (终止 Worker + 关闭终端)
  2. apex task block T3 "用户取消"
  3. 清理 worktree: git worktree remove .apex/worktrees/T3 --force && git branch -D apex/T3
  4. apex task create "XXX" --depends-on ... (创建新任务)
  5. apex worker spawn T{new} (派生新 Worker)
```

---

## 8. 文件变更清单

| 操作 | 文件路径 | 说明 | 预估行数 |
|------|---------|------|---------|
| **新建** | `skill/roles/master.md` | Plan Agent 角色定义 (Skill prompt) | ~200 |
| **新建** | `src/worker/terminal.ts` | TerminalAdapter 接口 + CmuxAdapter + TmuxAdapter + 自动检测 | ~250 |
| **新建** | `src/worker/protocol-template.ts` | Worker 协议文件生成器 (读任务信息 → 生成 worker-protocol.md) | ~150 |
| **新建** | `src/worker/monitor.ts` | Worker 状态读取逻辑 (读 meta/status/result.json + PID 检查) | ~100 |
| **新建** | `src/commands/worker.ts` | Worker CLI 命令 (spawn / list / status / kill / report) | ~200 |
| **修改** | `src/cli.ts` | 添加 `worker` 命令路由到 cmdWorker | ~5 |
| **修改** | `skill/SKILL.md` | 在 Command Modes 表中添加 `apex-master` 入口行 | ~3 |

**总计**: ~910 行新代码 + 3 行修改

---

## 9. 实现顺序

```
Phase 1: 基础设施 (能派生 Worker)
  ├── 1. src/worker/terminal.ts        — TerminalAdapter + 双实现 + 检测
  ├── 2. src/worker/protocol-template.ts — Worker 协议文件生成
  └── 3. src/commands/worker.ts         — apex worker spawn/kill 命令

Phase 2: 监控 (能看到 Worker 状态)
  ├── 4. src/worker/monitor.ts          — Worker 状态读取
  └── 5. src/commands/worker.ts 补充     — apex worker list/status/report 命令

Phase 3: 角色协议 (Plan Agent 知道怎么做)
  ├── 6. skill/roles/master.md          — Plan Agent 角色定义
  └── 7. skill/SKILL.md + src/cli.ts    — 注册入口

Phase 4: 验证
  └── 8. 端到端测试流程
```

---

## 10. 验证方案

### 10.1 单元验证

```bash
# 验证 TerminalAdapter 检测
apex worker check-terminal
# 预期: "Terminal adapter: cmux (detected via CMUX_SURFACE)" 或 "tmux"

# 验证 Worker 协议生成
apex task create "测试任务" "简单的健康检查 API"
apex worker spawn T1 --dry-run
# 预期: 打印生成的 worker-protocol.md 内容，不实际启动

# 验证终端窗口创建
apex worker spawn T1
# 预期: 新终端窗口打开，运行 claude，worktree 创建成功
```

### 10.2 端到端验证

```
1. 在 Claude Code 中输入 /apex-master
   → 确认加载 master.md 角色，Plan Agent 响应

2. 告诉 Plan Agent: "给项目加一个 /health 健康检查端点"
   → Plan Agent 分析代码库，创建 1-2 个子任务

3. Plan Agent 派生 Worker
   → 新终端窗口打开，Worker 开始执行 AF 协议
   → .apex/workers/T1/meta.json 写入
   → .apex/workers/T1/status.json 开始更新

4. 切换到 Worker 窗口，确认可以正常交互
   → Worker 按 AF 协议运行，需要用户参与时（Dashboard Gate、Plan 审批、复杂度确认等）用户直接在该窗口操作

5. Worker 完成后
   → .apex/workers/T1/result.json 出现
   → .apex/tasks.json 中 T1 状态变为 done
   → Plan Agent 的 Monitor 检测到完成并汇报

6. Plan Agent 汇总结果，建议 merge
   → 用户确认 → 合并 worktree 分支到主分支

7. 测试中途取消
   → 告诉 Plan Agent "取消 T2"
   → Worker-T2 终端关闭，worktree 清理，任务标记为 blocked
```

### 10.3 异常验证

```
- Worker 崩溃 (手动 kill Worker 的 claude 进程)
  → Monitor 检测到 PID 不存在
  → Plan Agent 收到崩溃报告
  → Plan Agent 决定重新派生或标记 blocked

- 任务依赖链 (T2 depends on T1, T3 depends on T2)
  → T1 完成前 T2 不被派生
  → T1 完成后 Plan Agent 自动派生 T2

- Worker 文件冲突 (两个 Worker 的 worktree 基于同一 commit)
  → merge 时 git 报冲突
  → Plan Agent 创建冲突解决任务
```

---

## 11. 速率限制感知

### 11.1 原理

Anthropic API 响应头包含速率限制信息（`x-ratelimit-*`）。当 5h 利用率接近上限时，继续派生 Worker 会导致所有 Agent 集体撞 429。参考 cmux-team 的做法：利用率 >= 90% 时暂停派生。

### 11.2 实现方式

**本地 API Proxy**（`src/worker/proxy.ts`，~150 行）：

```
Plan Agent 启动时:
  apex worker proxy start → 监听 localhost:<random-port>
  端口写入 .apex/proxy-port

Worker 启动时:
  设置 ANTHROPIC_BASE_URL=http://localhost:<port>
  所有 API 请求经过 proxy

Proxy 职责:
  1. 透明转发请求到 api.anthropic.com
  2. 从响应头提取: x-ratelimit-limit-tokens, x-ratelimit-remaining-tokens 等
  3. 写入 .apex/rate-limit.json:
     { "tokens_remaining": 80000, "tokens_limit": 100000,
       "utilization_5h": 0.85, "throttled": false, "updated_at": "..." }
  4. utilization_5h >= 0.90 → throttled = true
```

**开关控制**：

```yaml
# .apex/config.yaml
worker_rate_limit_enabled: true    # 默认开启; 设为 false 则全速推进不限速
worker_rate_limit_threshold: 0.90  # 利用率阈值 (默认 90%)
```

**Plan Agent 调度集成**：

```
派生 Worker 前:
  if config.worker_rate_limit_enabled == false:
    跳过速率检查，直接派生
  else:
    读 .apex/rate-limit.json
    if throttled == true:
      告知用户 "API 利用率已达 90%，暂停派生新 Worker，预计 {reset_time} 后恢复"
      等待 throttled == false 再继续
```

即使关闭速率限制，proxy 仍然运行并记录数据（供成本追踪使用），只是不再阻断 Worker 派生。

### 11.3 文件变更

| 操作 | 文件路径 | 说明 | 预估行数 |
|------|---------|------|---------|
| **新建** | `src/worker/proxy.ts` | 本地 API proxy（转发 + 速率限制提取） | ~150 |
| **修改** | `src/commands/worker.ts` | spawn 时设置 ANTHROPIC_BASE_URL + proxy 启停命令 | ~30 |
| **修改** | `skill/roles/master.md` | Plan Agent 角色中增加速率限制感知规则 | ~10 |

---

## 12. 成本追踪

### 12.1 原理

每个 Worker 的 API 调用经过本地 proxy（第 11 节），proxy 可以从请求/响应中提取 token 用量和模型信息，实时计算成本。

### 12.2 实现方式

**Proxy 扩展**（在 `src/worker/proxy.ts` 中追加）：

```
每次 API 响应后:
  从响应头/body 提取: input_tokens, output_tokens, model
  根据模型定价计算 cost_usd
  追加到 .apex/cost-log.jsonl:
    { "task_id": "T1", "worker": "claude", "model": "claude-sonnet-4",
      "input_tokens": 5000, "output_tokens": 2000, "cost_usd": 0.023,
      "ts": "2026-04-13T10:15:00Z" }
```

**汇总命令**（`apex worker cost`）：

```
apex worker cost
  T1 (auth-api):     $0.45  (input: 120k, output: 35k, 12 calls)
  T2 (pagination):   $0.28  (input: 80k, output: 20k, 8 calls)
  T3 (frontend):     running... $0.12 so far
  ─────────────────────────────
  Total:             $0.85

apex worker cost --budget 5.00
  Budget: $5.00 | Used: $0.85 | Remaining: $4.15 (17%)
```

**预算控制**（可选，Plan Agent 层面）：

```
# .apex/config.yaml
worker_budget_usd: 10.00    # 单次 /apex-master 会话总预算
worker_budget_warn: 0.80    # 80% 时告警

Plan Agent 行为:
  cost >= budget * warn_threshold → 告知用户 "已用 80% 预算"
  cost >= budget → 停止派生新 Worker，询问用户是否继续
```

### 12.3 文件变更

| 操作 | 文件路径 | 说明 | 预估行数 |
|------|---------|------|---------|
| **修改** | `src/worker/proxy.ts` | 追加 token 提取和成本计算逻辑 | ~60 |
| **新建** | `src/worker/cost.ts` | 成本汇总和预算检查 | ~80 |
| **修改** | `src/commands/worker.ts` | 添加 `apex worker cost` 命令 | ~20 |
| **修改** | `src/types/config.ts` | 添加 worker_default_agent, worker_agent_rules, worker_budget_usd, worker_budget_warn, worker_rate_limit_enabled 字段 | ~20 |
| **修改** | `src/types/task.ts` | Task 接口增加 category 字段 | ~3 |

---

## 13. 跨模型 Worker

### 13.1 原理

对于高风险决策（code review、安全审计），同一任务可以派生多个不同模型的 Worker 并行执行，各自独立产出结果，最后合成裁决。这是 Apex-Forge 已有的 Mode 2 理念，从 orchestrator 层提升到 Master 层。

### 13.2 实现方式

**Plan Agent 触发**：

```
用户: "这个认证模块很关键，review 要严格点"
Plan Agent:
  apex worker spawn T5 --adapter claude --cross-model
  apex worker spawn T5 --adapter codex --cross-model
  apex worker spawn T5 --adapter gemini --cross-model
  → 三个 Worker 在不同窗口独立 review 同一代码
  → 各自写 .apex/workers/T5-claude/result.json, T5-codex/result.json, T5-gemini/result.json
```

**结果合成**（复用已有的 `src/orchestrator/result-collector.ts:synthesizeFindings()`）：

```
apex worker synthesize T5
  → 读取 .apex/workers/T5-*/result.json
  → 汇总 findings, 去重, 按 severity 分级
  → 悲观合并: 任何 blocker → fail; 全 pass → pass; 有分歧 → mixed
  → 写入 .apex/workers/T5/synthesis.json
```

### 13.3 文件变更

| 操作 | 文件路径 | 说明 | 预估行数 |
|------|---------|------|---------|
| **修改** | `src/commands/worker.ts` | spawn 支持 `--cross-model` 标志 + synthesize 子命令 | ~50 |
| **修改** | `src/worker/protocol-template.ts` | 跨模型 Worker 的协议文件模板（标注是独立评审） | ~20 |
| **复用** | `src/orchestrator/result-collector.ts` | 直接 import synthesizeFindings() | 0 (复用) |

---

## 14. Dashboard 集成

### 14.1 原理

Apex-Forge 已有 Dashboard（`src/dashboard.ts`，HTTP + SSE）。需要让 Dashboard 展示 Worker 状态。

### 14.2 实现方式

**新增 API 端点**（在 `src/dashboard.ts` 中追加）：

```
GET /api/workers
  → 读取 .apex/workers/*/meta.json + status.json + result.json
  → 返回所有 Worker 的聚合状态

GET /api/workers/:taskId
  → 返回单个 Worker 的详细信息

GET /api/cost
  → 读取 .apex/cost-log.jsonl
  → 返回成本汇总

GET /api/rate-limit
  → 读取 .apex/rate-limit.json
  → 返回当前速率限制状态
```

**SSE 推送**（已有的 `/api/events` SSE 流中追加）：

```
现有 SSE 流每 2 秒轮询 state/tasks 变化
追加: 同时轮询 .apex/workers/ 目录变化
Worker 状态变化时推送:
  event: worker_update
  data: { "task_id": "T1", "stage": "execute", "progress": "..." }
```

**前端展示**（在已有的 Dashboard 前端 HTML 中追加）：

```
Workers 看板:
  ┌─────────────────────────────────────────┐
  │ Workers                                 │
  ├──────┬──────────┬────────┬─────────────┤
  │ T1   │ execute  │ claude │ 3/5 done    │
  │ T2   │ review   │ codex  │ waiting...  │
  │ T3   │ ✓ done   │ claude │ pass        │
  ├──────┴──────────┴────────┴─────────────┤
  │ Cost: $0.85 / $5.00  │ Rate: 72% (ok) │
  └─────────────────────────────────────────┘
```

### 14.3 文件变更

| 操作 | 文件路径 | 说明 | 预估行数 |
|------|---------|------|---------|
| **修改** | `src/dashboard.ts` | 新增 /api/workers, /api/cost, /api/rate-limit 端点 + SSE worker 事件 | ~120 |

---

## 15. 自动 Merge / PR

### 15.1 原理

Worker 在 worktree 的独立分支上完成工作后，需要将代码合并回主分支。Plan Agent 应该能协调 merge 流程。

### 15.2 实现方式

**`apex worker merge <task-id>` 命令**：

```
apex worker merge T1
  1. 检查 .apex/workers/T1/result.json 存在且 verdict=pass
  2. 检查 worktree 分支上没有未提交的变更
  3. 执行策略:

  --strategy local (默认):
    cd 主项目
    git merge apex/T1 --no-ff -m "Merge T1: {title}"
    清理: git worktree remove .apex/worktrees/T1 && git branch -d apex/T1

  --strategy pr:
    cd .apex/worktrees/T1
    git push -u origin apex/T1
    gh pr create --title "T1: {title}" --body "{summary from result.json}"
    (不清理 worktree，等 PR merge 后再清理)

  --strategy squash:
    cd 主项目
    git merge --squash apex/T1
    git commit -m "T1: {title}"
    清理 worktree + branch
```

**Plan Agent 协调**：

```
所有 Worker 完成后:
  Plan Agent 按依赖顺序 merge:
    apex worker merge T1           # 无依赖，先 merge
    apex worker merge T2           # 依赖 T1，T1 已 merge
    apex worker merge T3 T4       # T3, T4 独立，可以连续 merge
  如果 merge 冲突:
    创建冲突解决任务 → 派生新 Worker 处理
```

**批量 merge**：

```
apex worker merge-all [--strategy local|pr|squash]
  → 按 DAG 拓扑排序，依次 merge 所有 verdict=pass 的 Worker
  → 遇到冲突时停止并报告
```

### 15.3 文件变更

| 操作 | 文件路径 | 说明 | 预估行数 |
|------|---------|------|---------|
| **修改** | `src/commands/worker.ts` | 添加 merge / merge-all 子命令 | ~100 |

---

## 16. 更新后的文件变更总清单

| 操作 | 文件路径 | 说明 | 预估行数 |
|------|---------|------|---------|
| **新建** | `skill/roles/master.md` | Plan Agent 角色定义 (Skill prompt) | ~200 |
| **新建** | `src/worker/terminal.ts` | TerminalAdapter 接口 + CmuxAdapter + TmuxAdapter + 自动检测 | ~250 |
| **新建** | `src/worker/protocol-template.ts` | Worker 协议文件生成器 (含跨模型模板) | ~170 |
| **新建** | `src/worker/monitor.ts` | Worker 状态监控逻辑 (文件 + 终端读屏幕) | ~100 |
| **新建** | `src/worker/proxy.ts` | 本地 API proxy（速率限制提取 + 成本追踪） | ~210 |
| **新建** | `src/worker/cost.ts` | 成本汇总、预算检查 | ~80 |
| **新建** | `src/commands/worker.ts` | Worker CLI (spawn/list/status/kill/cost/merge/merge-all/synthesize) | ~400 |
| **修改** | `src/cli.ts` | 添加 `worker` 命令路由 | ~5 |
| **修改** | `skill/SKILL.md` | 在 Command Modes 表中添加 `apex-master` 入口 | ~3 |
| **修改** | `src/dashboard.ts` | 新增 /api/workers, /api/cost, /api/rate-limit + SSE 事件 | ~120 |
| **修改** | `src/types/config.ts` | 添加 worker_budget_usd 等配置字段 | ~5 |
| **修改** | `skill/roles/master.md` (同上) | 速率限制感知 + 成本控制 + 跨模型 + merge 协调规则 | (含在 200 行内) |
| **复用** | `src/orchestrator/result-collector.ts` | synthesizeFindings() 直接 import | 0 |

**总计**: ~1543 行新代码 + ~133 行修改 ≈ 1676 行

---

## 17. 更新后的实现顺序

```
Phase 1: 基础设施 — 能派生 Worker
  ├── 1. src/worker/terminal.ts          — TerminalAdapter + CmuxAdapter + TmuxAdapter
  ├── 2. src/worker/protocol-template.ts  — Worker 协议文件生成
  └── 3. src/commands/worker.ts (spawn/kill) — 基本派生和终止

Phase 2: 监控 — 能看到 Worker 状态
  ├── 4. src/worker/monitor.ts            — Worker 状态读取
  └── 5. src/commands/worker.ts (list/status/report) — 状态查询命令

Phase 3: 速率限制 + 成本 — 不撞墙、不超预算
  ├── 6. src/worker/proxy.ts              — 本地 API proxy
  ├── 7. src/worker/cost.ts               — 成本汇总和预算
  └── 8. src/commands/worker.ts (cost)    — 成本查询命令

Phase 4: 合并 — Worker 完成后的代码集成
  └── 9. src/commands/worker.ts (merge/merge-all) — 合并命令

Phase 5: 跨模型 — 高风险任务多模型对冲
  └── 10. src/commands/worker.ts (synthesize) + protocol-template 跨模型模板

Phase 6: 角色协议 + 集成 — 全部串联
  ├── 11. skill/roles/master.md           — Plan Agent 完整角色定义
  ├── 12. skill/SKILL.md + src/cli.ts     — 注册入口
  └── 13. src/dashboard.ts                — Dashboard Worker 看板

Phase 7: 端到端验证
  └── 14. 按第 10 节验证方案执行
```

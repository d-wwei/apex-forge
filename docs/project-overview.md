# Apex Forge 项目全景

> 最后更新：2026-04-10
> 版本：0.1.0
> 状态：可用，未完成

---

## 一、这个仓库是什么

Apex Forge 是一个 AI 编程 Agent 的执行协议编排器。

它不写代码，不做设计，不搞调试。它做一件事：**让 AI Agent 按纪律做事**。复杂度路由决定任务需要多少结构，阶段门控防止跳步，TDD 铁律防止跳过测试，证据分级防止瞎猜，验证门防止谎报完成。

领域能力（调试、审查、QA、安全审计、设计指导）全部由独立的 companion skill 提供。AF 在 pipeline 的每个阶段通过 `bindings.yaml` 硬性调用对应的 skill，然后把 skill 的输出映射回 AF 的内部状态。

一句话：**AF 是指挥官，不是士兵。**

---

## 二、设计目标

### 目标 1：执行纪律协议化

AI Agent 最大的问题不是能力不够，是纪律不够。跳过测试、猜测修复、谎报完成、重复犯错。AF 把执行纪律写成协议，强制每个任务经过：

```
复杂度路由 → 阶段门控 → TDD → 证据分级 → 验证门 → 完成状态
```

这不是建议，是硬约束。跳任何一步都会被协议拦截。

### 目标 2：协议与能力分离

协议是稳定的（怎么做事），能力是变化的（做什么事）。把两者绑在一起，每次更新能力都要改协议。分开后：

- AF 核心只关心流程纪律，迭代慢但稳
- Companion skill 只关心领域知识，迭代快但独立
- 用户可以只用 AF 协议不用它的 skill，也可以只用 skill 不走 pipeline

### 目标 3：跨平台跨 Agent

协议是纯 Markdown 指令，任何能读文件、跑 shell 的 AI Agent 都能用。状态管理全部走 `apex` CLI，不依赖任何特定 Agent 的内部 API。已支持：Claude Code、Codex、Gemini CLI、OpenCode、Windsurf、Cursor。

### 目标 4：可视化项目管理

每个项目有自己的 dashboard，展示任务看板、pipeline 阶段、记忆库、遥测数据。多个项目通过 Hub 汇总。数据从 `.apex/` 目录实时读取。

### 目标 5：多 Agent 协调

支持并行 Agent 派发、子 Agent 驱动开发、跨会话执行恢复。任务状态机（open → assigned → in_progress → to_verify → done）支持多 Agent 同时工作互不冲突。共识算法（Raft、BFT、Gossip、CRDT）为未来分布式多 Agent 协调做准备。

---

## 三、当前状态

### 已完成

| 模块 | 状态 | 说明 |
|------|------|------|
| 核心协议 | 完成 | 复杂度路由（3 级）、阶段门控、TDD 铁律、证据分级（E0-E4）、升级阶梯（L0-L4）、验证门（5 步）、完成状态（4 种） |
| Pipeline 阶段 | 完成 | brainstorm → plan → execute → review → ship → compound，6 个阶段文件，各含 Skill Dispatch 段 |
| 外部 Skill 绑定 | 完成 | `bindings.yaml` 结构化映射，版本约束，优先级，并发策略，输出 schema，证据映射 |
| 4 个 companion skill 仓库 | 完成 | systematic-debugging、thorough-code-review、security-audit、browser-qa-testing，全部独立仓库、独立可用 |
| 已有 3 个 skill 对接 | 完成 | tasteful-frontend、design-to-code-runner、product-review |
| 设计审查两层分离 | 完成 | design-baseline（AF 自有客观基线）+ tasteful-frontend（外部主观深度审查） |
| 命令别名向后兼容 | 完成 | 7 个 alias stub，旧命令（/apex-forge investigate 等）自动路由到新 skill |
| Session-start 自动安装 | 完成 | hook 每次启动检查 companion skill，缺失自动后台安装 |
| CLI 工具 | 完成 | 项目初始化、状态查看、任务管理（完整状态机）、记忆管理（置信度评分）、遥测、worktree、恢复 |
| MCP Server | 完成 | 4 个工具模块（task、memory、browse、status），3 种角色（admin、developer、pm） |
| Dashboard 前端 | 完成 | 任务看板、pipeline 可视化、遥测统计、记忆展示、activity stream，多项目 Hub |
| Ops Skill 封装 | 完成 | 8 个 CLI 操作包装为 skill 命令，agent 环境内直接可用 |
| 能力迁移 | 完成 | 从 gstack 迁入 41 个 workflow role（含 checkpoint、design-html、devex-review、health、learn、plan-devex-review）|
| Browse 二进制独立 | 完成 | browser-qa-testing 自有编译二进制（58MB），不依赖 gstack |
| 跨平台安装 | 完成 | install.sh 检测 Claude Code/Codex/Gemini/OpenCode，自动 symlink + companion skill 安装 |
| 共识算法 | 完成 | Raft、BFT、Gossip、CRDT 四种实现，有测试覆盖 |

### 未完成

| 模块 | 状态 | 差距 |
|------|------|------|
| Invocation trace 运行时 | 设计完成，代码未实现 | `bindings.yaml` 定义了 trace 格式和 ship 前校验，但 CLI 和 stage 文件还没有实际写入 `.apex/state.json` 的 `skill_invocations` 字段的代码逻辑 |
| Telemetry 数据采集 | 框架完成，实际采集空 | CLI 有 `telemetry start/end/report`，但 pipeline 运行时不会自动记录 skill 调用。dashboard 遥测面板因此显示 0 |
| Dashboard 实时数据 | 骨架完成，数据稀疏 | Task board 读真实 `.apex/tasks.json`，pipeline 读真实 `state.json`，但 telemetry/activity/memory 区域在没数据时显示空状态 |
| 多 Agent 并行协调 | 有共识算法实现，未集成到 pipeline | Raft/BFT/Gossip/CRDT 都能跑测试，但 pipeline 的并行 Agent 派发还是靠 Markdown 指令，不走共识协议 |
| Orchestrator 自动化 | 有 `src/orchestrator.ts`（271 行），未集成 | 自动从 task queue 拉任务、分配 Agent、跟踪进度的逻辑存在，但 CLI 的 `orchestrate` 命令还不成熟 |
| 端到端测试 | 无 | 有 4 个单元测试文件（506 行），覆盖 CLI/consensus/memory/tasks，但没有 pipeline 端到端测试（brainstorm→ship 全流程） |
| `workflow/roles/` 清理 | 有 6 个重复文件 | investigate.md、code-review.md、qa.md、browse.md、security-audit.md、design-review.md 在 `workflow/roles/` 中有旧副本，和 `skill/aliases/` 指向的外部 skill 功能重复 |
| Skill 版本校验 | 设计完成，代码未实现 | `bindings.yaml` 定义了 `version: ">=1.0.0"` 约束，但运行时没有实际读取 companion skill 的 VERSION 文件做 semver 比较的代码 |
| install.sh update | 有逻辑，未验证 | `install.sh update` 命令的 `git pull --ff-only` 逻辑写了，但依赖 companion skill 仓库实际存在于 GitHub 且有 release tag |

---

## 四、距离设计目标的距离

| 设计目标 | 完成度 | 剩余工作 |
|---------|--------|---------|
| 执行纪律协议化 | 95% | 协议本身完成。缺 invocation trace 运行时写入和 ship 前自动校验 |
| 协议与能力分离 | 100% | 重塑完成。7 个 companion skill 独立仓库，bindings.yaml 映射层就位 |
| 跨平台跨 Agent | 90% | Claude Code/Codex/Gemini/OpenCode 安装就位。实际在非 Claude 平台的端到端验证未做 |
| 可视化项目管理 | 70% | Dashboard 骨架和 Hub 多项目聚合完成。telemetry 和 activity 数据采集未接通，dashboard 在实际使用中大部分面板为空 |
| 多 Agent 协调 | 40% | 共识算法有实现有测试。orchestrator 有代码。但未集成到 pipeline，并行 Agent 派发还是靠 Markdown 指令而非程序化协调 |

**总体评估：核心协议完整可用，工程化层（运行时数据采集、自动化编排、端到端测试）还有缺口。**

---

## 五、仓库结构

```
apex-forge/
│
├── skill/                          # AF 核心（协议层）
│   ├── SKILL.md                    # 核心协议文档（复杂度路由、阶段门控、TDD、证据分级...）
│   ├── bindings.yaml               # 阶段 → 外部 skill 结构化映射
│   ├── install.sh                  # 安装器（AF + 7 个 companion skill）
│   ├── stages/                     # 6 个 pipeline 阶段定义
│   │   ├── brainstorm.md           #   需求探索（WHAT）
│   │   ├── plan.md                 #   实现规划（HOW）
│   │   ├── execute.md              #   TDD 实现（DO）+ Skill Dispatch
│   │   ├── review.md               #   多角色质量门 + Skill Dispatch
│   │   ├── ship.md                 #   交付门（含 invocation trace 校验）
│   │   └── compound.md             #   知识提取
│   ├── roles/                      # 6 个编排/工具角色
│   │   ├── parallel-dispatch.md    #   并行 Agent 派发
│   │   ├── subagent-dev.md         #   子 Agent 驱动开发
│   │   ├── cross-session-exec.md   #   跨会话执行恢复
│   │   ├── scope-lock.md           #   范围锁定
│   │   ├── worktree.md             #   git worktree 管理
│   │   └── skill-author.md         #   创建新 skill
│   ├── aliases/                    # 7 个向后兼容命令别名
│   │   ├── investigate.md          #   → /systematic-debugging
│   │   ├── code-review.md          #   → /thorough-code-review outgoing
│   │   ├── receiving-review.md     #   → /thorough-code-review incoming
│   │   ├── qa.md                   #   → /browser-qa-testing
│   │   ├── browse.md               #   → /browser-qa-testing
│   │   ├── security-audit.md       #   → /security-audit
│   │   └── design-review.md        #   → design-baseline + /tasteful-frontend
│   ├── gates/                      # AF 自有质量门
│   │   └── design-baseline.md      #   客观设计基线（WCAG、布局、可读性）
│   ├── ops/                        # 8 个 CLI 操作的 skill 封装
│   │   ├── init.md                 #   项目初始化
│   │   ├── status.md               #   状态查看
│   │   ├── dashboard.md            #   可视化面板
│   │   ├── tasks.md                #   任务管理
│   │   ├── memory.md               #   记忆管理
│   │   ├── recover.md              #   状态修复
│   │   ├── telemetry.md            #   使用统计
│   │   └── worktree.md             #   worktree 操作
│   └── references/
│       └── platform-setup.md       #   各平台安装指南
│
├── workflow/                       # 迁移能力层
│   ├── PIPELINE.md                 #   pipeline 总览
│   ├── stages/                     #   7 个 PDCA 阶段文件（含 verify）
│   └── roles/                      #   41 个角色文件（从 gstack 迁入的全部能力）
│       ├── office-hours.md         #     结构化头脑风暴
│       ├── plan-ceo-review.md      #     CEO 视角计划评审
│       ├── plan-eng-review.md      #     工程架构评审
│       ├── plan-devex-review.md    #     开发者体验评审
│       ├── plan-design-review.md   #     设计评审
│       ├── autoplan.md             #     自动评审流水线
│       ├── retro.md                #     工程回顾
│       ├── canary.md               #     部署后金丝雀监控
│       ├── benchmark.md            #     性能基线追踪
│       ├── careful.md              #     危险命令警告
│       ├── guard.md                #     完整安全模式
│       ├── freeze.md / unfreeze.md #     目录编辑锁定/解锁
│       ├── checkpoint.md           #     工作断点保存/恢复
│       ├── health.md               #     代码质量仪表盘
│       ├── learn.md                #     项目学习记录管理
│       ├── design-html.md          #     生成生产级 HTML/CSS
│       ├── design-consultation.md  #     设计系统创建
│       ├── design-shotgun.md       #     设计变体探索
│       ├── devex-review.md         #     实际 DX 审计
│       ├── codex-consult.md        #     Codex 第二意见
│       ├── connect-chrome.md       #     启动可控 Chrome
│       ├── document-release.md     #     发布后文档同步
│       ├── land-and-deploy.md      #     合并+部署+验证
│       ├── mobile-test.md          #     移动端测试
│       ├── setup-deploy.md         #     部署配置
│       ├── setup-browser-cookies.md#     浏览器 cookie 导入
│       └── ...                     #     （共 41 个）
│
├── src/                            # TypeScript 实现（8,379 行）
│   ├── cli.ts                      #   CLI 入口（576 行）
│   ├── dashboard.ts                #   Dashboard HTTP 服务（1,122 行）
│   ├── orchestrator.ts             #   任务编排器（271 行）
│   ├── registry.ts                 #   Dashboard 注册表（114 行）
│   ├── converter.ts                #   跨平台 skill 转换（452 行）
│   ├── sandbox.ts                  #   沙箱执行（242 行）
│   ├── tracing.ts                  #   分布式追踪（163 行）
│   ├── design.ts                   #   设计工具（199 行）
│   ├── state/                      #   状态管理
│   │   ├── state.ts                #     全局状态机（175 行）
│   │   ├── tasks.ts                #     任务生命周期（264 行）
│   │   ├── memory.ts               #     事实存储 + 搜索（175 行）
│   │   ├── config.ts               #     配置管理（112 行）
│   │   ├── recovery.ts             #     崩溃恢复
│   │   ├── curate.ts               #     状态策展（126 行）
│   │   └── llm-curate.ts           #     LLM 驱动策展（218 行）
│   ├── types/                      #   类型定义
│   │   └── state.ts                #     StageState + SkillInvocation 类型
│   ├── mcp/                        #   MCP Server
│   │   ├── server.ts               #     服务入口，角色路由（112 行）
│   │   └── tools/                  #     4 个工具模块
│   │       ├── task.ts             #       任务操作（196 行）
│   │       ├── memory.ts           #       记忆操作（137 行）
│   │       ├── browse.ts           #       浏览器代理（269 行）
│   │       └── status.ts           #       状态查询（90 行）
│   ├── commands/                   #   CLI 命令实现
│   │   ├── init.ts / status.ts / task.ts / memory.ts / telemetry.ts / worktree.ts
│   ├── consensus/                  #   共识算法
│   │   ├── raft.ts                 #     Raft（671 行）
│   │   ├── bft.ts                  #     BFT（230 行）
│   │   ├── gossip.ts               #     Gossip（175 行）
│   │   └── crdt.ts                 #     CRDT（202 行）
│   ├── utils/                      #   工具函数
│   └── __tests__/                  #   测试（506 行，4 个文件）
│
├── frontend/                       # Dashboard 前端
│   ├── index.html                  #   主页面（14 KB）
│   ├── app.js                      #   应用逻辑（19 KB）
│   ├── styles.css                  #   样式（42 KB）
│   └── side-panel.html             #   侧边栏面板
│
├── hooks/                          # Session hooks
│   ├── session-start               #   注入执行纪律 + 自动安装 companion skill
│   ├── state-helper                #   状态管理辅助
│   ├── task-helper                 #   任务辅助
│   ├── post-tool-event             #   工具调用后处理
│   ├── pre-commit                  #   提交前校验
│   └── hooks.json                  #   hook 配置
│
├── dist/                           # 编译产物
│   ├── apex-forge                  #   CLI 二进制（61 MB）
│   └── apex-forge-mcp              #   MCP Server 二进制（62 MB）
│
├── docs/                           # 文档
│   ├── usage-guide.md              #   使用指南
│   ├── project-overview.md         #   本文档
│   └── architecture-reshaping-plan.md # 架构重塑方案 v2
│
└── .claude-plugin                  # 技能注册表（60 个 skill）
```

---

## 六、工作原理

### 6.1 协议层：怎么约束 Agent 行为

AF 的核心协议（`skill/SKILL.md`，285 行）定义了 8 个机制。这些机制在每次 Agent 会话中通过 `hooks/session-start` 注入到 Agent 上下文。Agent 读到这些指令后必须遵守。

**复杂度路由器**决定任务需要多少结构：

```
任务能一步完成吗？
  能 → Tier 1（单次通过：执行 → 验证门 → 报告）
  不能 → 跨会话吗？
    是 → Tier 3（波次：分解为多轮，每轮写状态文件）
    否 → Tier 2（轮次：PDCA 循环，最多 5 轮）
```

**阶段门控**防止 Agent 在错误阶段做事。Brainstorm 阶段写代码会被拦截，Execute 阶段做设计决策会被打回 Plan。

**验证门**是最关键的机制。Agent 声称"完成了"之前必须：识别证明命令 → 执行它 → 读完整输出 → 确认通过 → 才能声明完成。跳任何一步等于撒谎。

### 6.2 Pipeline 层：任务怎么流转

一个任务的完整生命周期：

```
用户输入需求
    ↓
brainstorm.md → 需求文档（不写代码）
    ↓ 门控：需求文档存在且 approved
plan.md → 实现计划（文件路径、函数签名、测试方案）
    ↓ 门控：计划文档存在且 approved
execute.md → TDD 实现
    ↓ 遇到 bug？→ 查 bindings.yaml → 调 /systematic-debugging
    ↓ 涉及前端？→ 查 bindings.yaml → 调 /tasteful-frontend
    ↓ 需要 QA？→ 查 bindings.yaml → 调 /browser-qa-testing
    ↓ 门控：所有任务完成，测试全绿
review.md → 多角色审查
    ↓ 代码审查 → 调 /thorough-code-review
    ↓ 安全审计 → 调 /security-audit
    ↓ 设计审查 → 先跑 design-baseline 基线，再跑 /tasteful-frontend 深度审查
    ↓ 门控：无 P0/P1，状态为 DONE
ship.md → 版本号、changelog、commit、push、PR
    ↓ Check 5：校验 invocation trace，确保必需 skill 都被调用过
    ↓
compound.md → 提取可复用知识
```

### 6.3 绑定层：AF 怎么调外部 Skill

`skill/bindings.yaml` 是声明式的阶段→skill 映射。每个绑定包含：

```yaml
- trigger: "触发条件（自然语言描述）"
  skill: skill 名称
  version: ">=1.0.0"          # semver 约束
  priority: 1                  # 数字越小优先级越高
  concurrent: false            # 是否可以和其他 skill 并行
  output_schema:               # skill 输出的预期格式
    status: [RESOLVED, UNRESOLVED, NEEDS_HELP]
  mapping:                     # 输出到 AF 内部状态的翻译规则
    RESOLVED + confirmed: { af_evidence: E3 }
```

Agent 在 execute 或 review 阶段遇到匹配 trigger 的任务时：
1. 读 bindings.yaml 找到对应 skill
2. 按 priority 排序，concurrent: false 的串行执行
3. 加载 skill 并遵循其流程
4. skill 完成后校验输出是否匹配 output_schema
5. 按 mapping 规则翻译为 AF 证据等级或审查结论
6. 记录 invocation trace 到 `.apex/state.json`

### 6.4 状态层：数据怎么持久化

所有运行时状态存储在项目根目录的 `.apex/` 下：

```
.apex/
├── state.json      # 当前阶段、历史、artifacts、skill_invocations
├── tasks.json      # 任务队列（完整状态机）
├── memory.json     # 事实存储（带置信度评分和标签）
└── browse.json     # browse 守护进程连接信息
```

状态通过 `apex` CLI 读写，不直接操作文件。CLI 是编译好的 Bun 二进制（61MB），启动快、依赖少。

任务状态机：

```
open → assigned → in_progress → to_verify → done
                       ↓              ↓
                    blocked      in_progress（verify fail）
```

记忆系统每条事实带 0.0-1.0 的置信度。低于阈值的可以 prune。支持按关键词搜索和标签过滤。`memory inject` 将所有事实输出为 XML，用于新会话的上下文注入。

### 6.5 Dashboard 层：可视化怎么工作

Dashboard 是一个嵌入在 CLI 里的 HTTP 服务。启动后：

1. 根据项目路径 hash 计算端口（同一项目每次相同）
2. 向 `~/.apex-forge/registry.json` 注册自己（名称、路径、端口、PID）
3. 启动 Bun HTTP server，服务 `frontend/` 静态文件
4. 提供 3 个 API：
   - `GET /api/state` — 返回当前项目完整状态（tasks + state + memory + analytics）
   - `GET /api/projects` — 返回所有已注册项目列表（带 task count 和 success rate）
   - `GET /api/events` — SSE 推送，每 2 秒发送一次最新状态
5. 前端通过 SSE 实时更新看板

Hub 是另一个 HTTP 服务，固定在 3456 端口，读 registry.json 聚合所有活跃项目。

### 6.6 MCP 层：怎么和 IDE 集成

MCP Server（`dist/apex-forge-mcp`）暴露 4 组工具给支持 MCP 的 IDE：

| 工具组 | 功能 |
|--------|------|
| task | 创建/分配/验证任务 |
| memory | 添加/搜索/删除事实 |
| browse | 导航/截图/断言（代理到 browse 守护进程） |
| status | 查看项目状态 |

3 种角色控制工具访问范围：admin 全部可用，developer 不能操作 memory，pm 不能操作 browse。

### 6.7 Session Hook：怎么注入到 Agent 会话

`hooks/session-start` 是一个 bash 脚本，在每次 Claude Code/Cursor 会话启动时执行：

1. 检查 companion skill 是否全部安装，缺失的后台运行 `install.sh`
2. 构建核心协议注入内容（复杂度路由、阶段门控、TDD、证据分级、验证门，约 2000 token）
3. 读取 `.apex/state.json` 获取当前阶段和 artifact 信息
4. 读取 `.apex/tasks.json` 检查未验证的任务并生成警告
5. 将所有内容 JSON 转义后输出为 `hookSpecificOutput`，注入到 Agent 上下文

效果：Agent 在每次会话中都自动加载 AF 协议，无需用户手动输入 `/apex-forge`。

---

## 七、数字总览

| 指标 | 数量 |
|------|------|
| 注册 skill 总数 | 60 |
| TypeScript 源文件 | 47 |
| 源代码行数 | 8,379 |
| 测试文件 | 4 |
| 测试代码行数 | 506 |
| Pipeline 阶段 | 6 |
| Workflow role 文件 | 41 |
| Companion skill 仓库 | 7（4 个新建 + 3 个已有） |
| CLI 命令 | 35+ |
| MCP 工具 | 10+ |
| 支持平台 | 6（Claude Code、Codex、Gemini、OpenCode、Windsurf、Cursor） |
| 共识算法 | 4（Raft、BFT、Gossip、CRDT） |
| Dashboard API | 3（state、projects、events） |

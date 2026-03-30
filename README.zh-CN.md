[English](README.md)

# Apex Forge

Apex Forge 是 AI coding agent 的统一执行框架。三层架构，一次安装，43 个 skill。

从 8 个开源项目中提取核心模式，重新组合：
[better-work-skill](https://github.com/d-wwei/better-work-skill) |
[superpowers](https://github.com/obra/superpowers) |
[compound-engineering](https://github.com/EveryInc/compound-engineering-plugin) |
[gstack](https://github.com/garrytan/gstack) |
[symphony](https://github.com/openai/symphony) |
[chorus](https://github.com/Chorus-AIDLC/Chorus) |
[deer-flow](https://github.com/bytedance/deer-flow) |
[ruflo](https://github.com/ruvnet/ruflo)

---

## 为什么需要它

AI coding agent 有三个核心问题：

**1. 不靠谱** — agent 猜而不验证，声称"已完成"但拿不出证据。改了代码不跑测试，修了 bug 不确认复现条件消失。

**2. 不协调** — 多个 agent 无法配合。任务状态在对话中丢失，下一个 session 不知道上一个 session 做到哪了，没有统一的状态机。

**3. 不完整** — 要装 5 个不同工具才能凑齐一个完整工作流。审查用一个，浏览器测试用一个，部署用一个，知识管理用一个。

Apex Forge 把这三件事合进一个框架。

---

## 装完你得到什么

### 3 个编译二进制

| 二进制 | 用途 |
|-------|------|
| `apex-forge` | CLI — 状态管理、任务追踪、记忆系统、遥测 |
| `apex-forge-browse` | 无头浏览器守护进程 — 59 条命令（导航/交互/截图/cookie/检查/录制） |
| `apex-forge-mcp` | MCP 服务器 — 把浏览器、任务、记忆、状态暴露为标准 MCP 工具 |

### 43 个 Skill

覆盖完整开发生命周期：brainstorm → plan → execute → review → ship → 知识沉淀

- 7 个阶段 skill（需求 → 规划 → 执行 → 审查 → 交付 → 沉淀 → 验证）
- 3 个协议 skill（核心执行协议、PDCA 轮次、跨 session 波次）
- 33 个角色 skill（QA、调试、代码审查、安全审计、浏览器、部署、设计……）

### 核心能力

| 能力 | 说明 |
|------|------|
| 任务状态机 | `open → assigned → in_progress → to_verify → done`，支持依赖链和 worktree 隔离 |
| 记忆系统 | 事实存储 + 置信度评分（0.0-1.0）+ 标签 + 来源追踪，自动注入上下文 |
| 18 人格代码审查 | 3 个常驻审查者 + 10 个条件审查者 + 4 个框架特定审查者（Rails/React/Python/Go/Vue）+ 对抗审查者 |
| 59 命令浏览器 | 导航、交互、截图、响应式测试、cookie、控制台、网络、性能、PDF、状态保存 |
| Chrome 扩展侧边栏 | 有头模式 + 远程调试 + 手动接管 + 消息收件箱 |
| Web 仪表盘 | 看板视图 + 活动流 + 实时 SSE 数据推送 |
| 4 个共识协议 | Raft、BFT、Gossip、CRDT — 用于多 agent 分布式协调 |
| 跨平台转换器 | 一键转换到 Cursor / Codex / Factory / Gemini / Windsurf |
| Docker 沙箱 | 不受信代码隔离执行，超时 + 内存限制 + 网络控制 |
| GitHub 集成 | issue 读写、PR 创建、CI 状态检查 |

---

## 运作机制

```
                    +------------------------------------------+
                    |       协议层 (PROTOCOL — 始终激活)         |
                    |  SessionStart hook 自动注入               |
                    |  1% 规则 | 复杂度路由 | TDD 铁律          |
                    |  证据评级 | 升级阶梯 | 验证门禁            |
                    +------------------------------------------+
                                      |
                    +------------------------------------------+
                    |       工作流层 (WORKFLOW — 43 个 skill)    |
                    |  7 阶段: brainstorm → plan → execute →   |
                    |    review → ship → compound → verify      |
                    |  33 角色: QA、调查、代码审查、安全审计、   |
                    |    浏览器、部署、设计……                    |
                    |  3 协议: apex、round、wave                |
                    +------------------------------------------+
                                      |
                    +------------------------------------------+
                    |       编排层 (ORCHESTRATION — 参考规范)    |
                    |  多 agent 架构规范（10 节）               |
                    |  任务状态机 | 角色执行 | 记忆层            |
                    |  10 个可复用编排模式                       |
                    +------------------------------------------+
```

### 安装后自动发生的事

1. **自动注入** — `hooks/session-start` 在每个新 session 触发，将核心执行纪律（复杂度路由、阶段纪律、TDD 铁律、验证门禁、升级阶梯）注入 agent 上下文。不需要手动激活。

2. **状态追踪** — `.apex/state.json` 自动创建，记录当前阶段、session ID、产物路径、阶段历史。session 中断后可续接。

3. **自动链接** — 每个阶段 skill 在运行前检查上游产物。调用 `/apex-plan` 但没有 brainstorm 文档？它会主动提议先跑 `/apex-forge-brainstorm`。

4. **意图路由** — 协议根据用户意图自动映射到阶段。"搭建用户认证"→ Plan + Execute。"修这个 bug"→ Investigate。"审查一下"→ 多人格 Review。

5. **遥测** — 角色 skill 将执行时间和结果写入 `.apex/analytics/usage.jsonl`。

6. **记忆** — 事实带置信度评分和标签，高置信度事实自动注入 session 上下文，过期事实被清理。

7. **任务管理** — 状态机（`open → assigned → in_progress → to_verify → done`），支持依赖链和 worktree 隔离。

---

## 快速开始

```bash
git clone https://github.com/user/apex-forge.git ~/.claude/skills/apex-forge
cd ~/.claude/skills/apex-forge
bun install && bun run build:all
bunx playwright install chromium
./dist/apex-forge init
```

### 其他安装方式

```bash
# 项目级安装
git clone https://github.com/user/apex-forge.git .claude/skills/apex-forge
echo ".claude/skills/apex-forge" >> .gitignore

# Cursor
git clone https://github.com/user/apex-forge.git .cursor-plugin/apex-forge

# Codex / Factory Droid
git clone https://github.com/user/apex-forge.git .agents/skills/apex-forge

# 自动检测并安装
./setup
```

---

## 命令列表（43 条）

### 协议（3）

| 命令 | 说明 |
|------|------|
| `/apex` | 核心执行协议 — 每个 session 自动激活。复杂度路由、阶段纪律、TDD、证据评级、升级阶梯、验证门禁。 |
| `/apex-round` | PDCA 轮次执行，用于 Tier 2 任务。命名轮次类型（clarify、explore、hypothesis、planning、execution、verification、hardening、recovery）。 |
| `/apex-wave` | 波次交付，用于 Tier 3 任务。跨 session 持久状态、假设登记、决策日志、交接协议。 |

### 阶段（7）

| 命令 | 说明 | 上游检查 |
|------|------|----------|
| `/apex-forge-brainstorm` | 需求探索 + 硬门禁 — 设计批准前禁止写代码 | 无 |
| `/apex-plan` | 实施计划：文件路径、任务分解、测试场景 | 检查 brainstorm 产物 |
| `/apex-forge-execute` | TDD 优先实现，复杂任务自动分发子 agent | 检查 plan 产物 |
| `/apex-forge-review` | 多人格质量门禁（安全、正确性、规范合规） | 检查 git diff |
| `/apex-forge-ship` | 测试 → 版本号 → changelog → commit → PR | 检查 review 状态 |
| `/apex-forge-compound` | 知识沉淀到 `docs/solutions/`，自动去重检测 | 检查已交付变更 |
| `/apex-forge-verify` | 5 步证据门禁，可独立使用 | 无 |

### 质量与审查（7）

| 命令 | 说明 |
|------|------|
| `/apex-forge-qa` | 系统化 QA 测试 — 分层深度、浏览器感知验证、bug 修复循环 |
| `/apex-forge-investigate` | 系统化调试 — 不理解根因不动手修 |
| `/apex-code-review` | 多通道代码审查 — 正确性、安全、性能、可维护性 |
| `/apex-design-review` | 视觉 QA — 截图驱动的修复-验证循环 |
| `/apex-security-audit` | CSO 模式 — 基础设施优先的安全审计 |
| `/apex-retro` | 复盘 — 提取教训、模式、改进点 |
| `/apex-office-hours` | 导学 — 结合代码库讲解概念 |

### 计划审查（3）

| 命令 | 说明 |
|------|------|
| `/apex-plan-ceo-review` | CEO/创始人视角 — 评估野心和范围 |
| `/apex-plan-eng-review` | 高级工程经理视角 — 锁定执行架构 |
| `/apex-plan-design-review` | 设计师视角 — 设计维度 0-10 评分 + 改进标注 |

### 创意与设计（3）

| 命令 | 说明 |
|------|------|
| `/apex-design-consultation` | 从零创建设计系统 — 美学方向、token、字体、配色、预览 |
| `/apex-design-shotgun` | 设计变体探索 — 对同一需求生成 3 种视觉方案 |
| `/apex-autoplan` | 自动审查流水线 — 依次跑 CEO、工程、设计审查并自动决策 |

### 运维与部署（5）

| 命令 | 说明 |
|------|------|
| `/apex-canary` | 部署后金丝雀监控 — 截图、错误检测、性能回归检查 |
| `/apex-benchmark` | 性能基线追踪 — 测量、存储、比较、标记回归 |
| `/apex-land-and-deploy` | 合并 PR → 等 CI → 部署 → 金丝雀验证 — 完整交付流水线 |
| `/apex-setup-deploy` | 自动检测并配置部署平台（URL、健康检查、平台参数） |
| `/apex-document-release` | 交付后文档更新 — 同步 README、CHANGELOG、架构文档 |

### 安全防护（4）

| 命令 | 说明 |
|------|------|
| `/apex-guard` | 完整安全模式 — 目录冻结 + 危险命令警告 |
| `/apex-freeze` | 限制编辑操作到指定目录，边界外写入全部拒绝 |
| `/apex-unfreeze` | 解除冻结，恢复全目录编辑 |
| `/apex-careful` | 危险命令警告 — `rm -rf`、`force-push`、`DROP TABLE` 前强制确认 |

### 浏览器与外部（4）

| 命令 | 说明 |
|------|------|
| `/apex-forge-browse` | 浏览器交互 — 导航、阅读、操作、截图 |
| `/apex-connect-chrome` | 启动带远程调试的 Chrome — 自动化 + 手动切换 |
| `/apex-setup-browser-cookies` | 从真实浏览器导入 cookie，用于带认证的无头测试 |
| `/apex-codex-consult` | 通过 Codex CLI 或独立子 agent 获取第二意见 |

### 工作区与编排（7）

| 命令 | 说明 |
|------|------|
| `/apex-worktree` | Git worktree 管理 — 按任务隔离工作区 |
| `/apex-skill-author` | 创建新 skill — 结构、frontmatter、测试 |
| `/apex-compound-refresh` | 刷新过期的解决方案文档 |
| `/apex-mobile-test` | iOS 模拟器 / Android 模拟器测试 |
| `/apex-wave-planner` | 波次级规划 — 系统映射、范围、风险 |
| `/apex-wave-challenger` | 波次计划的对抗性压力测试 |
| `/apex-wave-worker` | 在波次内执行轮次，跨迭代追踪状态 |

---

## 关键概念

### 1% 规则（来自 superpowers）
只要有 1% 的可能性适用，协议就激活。在任何回复之前，在澄清问题之前。通过 SessionStart hook 自动注入。

### 复杂度路由（来自 better-work）
不是每个任务都需要完整仪式：
- **Tier 1（单次通过）**：简单修复，一轮验证。
- **Tier 2（轮次制）**：多步骤，PDCA 轮次 + 命名类型，最多 5 轮。
- **Tier 3（波次制）**：项目级，跨 session，持久状态存在 `.apex/state.json`。

### 硬门禁
两个不可协商的门禁：
1. **Brainstorm 门禁** — 设计存在且用户批准之前，不允许写实现代码。
2. **验证门禁** — 没有本次 session 的新鲜证据，不允许声称成功。

### TDD 铁律（来自 superpowers）
没有失败测试不写生产代码。写测试 → RED（确认正确原因）→ GREEN → 重构。14 条合理化反驳堵死所有借口。

### 证据评级（来自 better-work）
- E0（猜测）、E1（间接）、E2（直接）、E3（多源）、E4（已验证+已复现）
- 行动最低要求：E2。声称成功最低要求：E3。

### 升级阶梯（来自 better-work）
失败自动升级严格度：
- L1（第 2 次失败）：换根本不同的方法。
- L2（第 3 次失败）：提出三个可测试假设。
- L3（第 4 次失败）：七步恢复清单。
- L4（第 5 次失败）：最小复现，交给人类。

### 知识沉淀（来自 compound-engineering）
每个解决的问题写入 `docs/solutions/`。重叠检测防止重复。过期文档自动刷新。时间越久，系统运行成本越低。

---

## 来源

每个模式都可追溯到具体源项目。完整归因见 `docs/PROVENANCE.md`。

| 模式 | 来源 |
|------|------|
| 自动触发、TDD 铁律、验证门禁 | superpowers |
| 复杂度路由、升级阶梯、证据评级 | better-work-skill |
| 阶段纪律、知识沉淀、多人格审查 | compound-engineering |
| 角色技能、完成状态、遥测、意图路由 | gstack |
| 单权威编排器、工作区隔离、WORKFLOW.md | symphony |
| 任务状态机、角色执行、双阶段验收 | chorus |
| LLM 策划记忆、沙箱传播、子 agent 安全 | deer-flow |
| 账本模式、技能注册表、成本感知路由 | ruflo |

8 个源项目各自解决 agent 失败的不同层面：

- **better-work** 防止执行**过程中**质量衰减（升级、证据评级）
- **superpowers** 防止执行**之前**协议被绕过（自动触发、TDD）
- **compound-engineering** 防止执行**之后**知识丢失（知识沉淀）
- **gstack** 提供执行阶段**之间**的角色路由
- **symphony** 解决调度问题（何时何处运行 agent）
- **chorus** 解决信任问题（谁批准什么）
- **deer-flow** 解决记忆问题（跨 session 记什么）
- **ruflo** 解决协调问题（agent 之间如何通信）

没有一个项目能覆盖所有环节。Apex Forge 把它们合成一个统一框架。

---

## 项目结构

```
apex-forge/
  .claude-plugin                    <- 插件清单（注册 skill + hook）
  VERSION                           <- 0.1.0
  LICENSE                           <- MIT
  setup                             <- 自动检测安装脚本
  package.json                      <- bun 构建配置

  src/
    cli.ts                          <- CLI 入口
    browse/                         <- 无头浏览器（59 命令）
    mcp/                            <- MCP 服务器（task/memory/status/browse 工具）
    consensus/                      <- 共识协议（Raft/BFT/Gossip/CRDT）
    dashboard.ts                    <- Web 仪表盘（SSE 实时推送）
    converter.ts                    <- 跨平台转换器
    sandbox.ts                      <- Docker 沙箱执行
    orchestrator.ts                 <- 编排器实现
    integrations/github.ts          <- GitHub issue/PR 集成

  extension/                        <- Chrome 扩展侧边栏
  hooks/
    session-start                   <- 每个 session 自动注入协议
    state-helper                    <- bash 函数：状态、记忆、worktree、遥测、浏览器
    task-helper                     <- 任务状态机

  protocol/                         <- 核心执行纪律（14 节）
  workflow/
    stages/                         <- 7 个阶段 skill
    roles/                          <- 34 个角色 skill
  orchestration/                    <- 多 agent 架构规范 + 10 个编排模式
  platforms/                        <- Cursor / Codex / Factory 适配
  templates/                        <- 子 agent 提示词模板
```

---

## 配置

在项目根目录创建 `.apex/config.yaml`（`./setup` 自动生成）：

```yaml
default_tier: auto          # auto | 1 | 2 | 3
proactive: true             # 自动建议下一阶段
compound_on_resolve: true   # 交付后自动触发知识沉淀
max_concurrent_agents: 3    # 并行子 agent 数量
autonomy: balanced          # high | balanced | controlled
solutions_dir: docs/solutions/
```

---

## 许可证

MIT

---

`v0.1.0` · 43 skill · 59 浏览器命令 · 18 审查人格 · 4 共识协议 · 10 编排模式 · 8 源项目

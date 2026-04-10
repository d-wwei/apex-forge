# Apex Forge 项目全景

> 最后更新：2026-04-10
> 版本：0.1.0

---

## 一、这个仓库是什么

Apex Forge 给 AI 编程 Agent 加了一套做事的规矩。

AI Agent 最大的问题不是不够聪明，是不守纪律。上来就写代码不问需求，不写测试，bug 猜着修，说"做好了"但没验证过。AF 在协议层堵住这些问题。

AF 本身不写代码、不做设计、不搞调试。领域能力由 7 个独立的 companion skill 提供（调试、代码审查、QA、安全审计、前端设计、设计还原、产品评审）。AF 在 pipeline 的每个阶段自动调对应的 skill，调完把结果映射回自己的状态。

一句话：**AF 是指挥官，不是士兵。**

---

## 二、四层结构

```
Skills 层 — 给 Agent 用
  60 个 markdown 文件。协议规则、pipeline 阶段、领域能力、操作命令。
  Agent 读了照着做。这是 AF 的核心工作方式。

CLI 层 — Agent 和人都能用
  apex 命令行工具。读写 .apex/ 目录下的状态数据：
  任务队列、记忆存储、遥测统计、设计资产。
  Agent 通过 shell 调用，人也可以在终端直接用。

Web 层 — 给人用
  Dashboard + Hub。可视化看项目进展：任务看板、pipeline 阶段、
  遥测统计、活动流、记忆库、设计对比。每个项目一个面板，
  多项目通过 Hub（3456 端口）汇总。

MCP 层（可选）— 给 IDE 用
  把 CLI 的功能暴露为 MCP 工具。IDE 里直接调用，不走 shell。
  不配也完全能用。
```

Skills 是 Agent 的界面，Web 是人的界面，CLI 是两者共享的数据层，MCP 是 IDE 的快捷通道。

---

## 三、跑一个真实任务时会发生什么

你说"帮我做一个用户注册功能"。

**没有 AF**：AI 立刻写代码。写完说"做好了"。你一跑发现密码明文存的、邮箱重复没拦住、没有任何测试。AI 猜着修，改一个坏一个。

**有 AF**：

1. **Brainstorm**：不让写代码。先问清楚：邮箱注册还是手机号？密码要求？注册成功跳哪？邮箱已存在显示什么？写成需求文档，你确认了才往下走。

2. **Plan**：还是不让写代码。给出施工图纸：改哪些文件、测试写几个、每个设计决策的理由。你确认了才开始。

3. **Execute**：先写测试再写代码。遇到 bug 自动调调试协议（3 个假设、找根因、写回归测试）。涉及前端自动调设计规范。

4. **Review**：安全审查员查注入和密钥泄露，正确性审查员查边界情况，规范审查员对照计划逐条核对。前端文件走两层设计审查（客观基线 + 主观审美）。还可以自动用 Codex 做独立第二意见。P0 直接打回。

5. **Ship**：验证门通过后才能发布。检查 invocation trace 确保所有必需的 skill 都被调用过。版本号、changelog、commit、PR。

6. **Compound**：提取可复用知识。

---

## 四、设计目标和完成度

| 目标 | 完成度 | 现状 |
|------|--------|------|
| 执行纪律协议化 | 95% | 协议完整。invocation trace 运行时写入和 ship 前校验已接通。缺自动 tracing 埋点 |
| 协议与能力分离 | 100% | 7 个 companion skill 独立仓库，bindings.yaml 映射层就位 |
| 跨平台跨 Agent | 90% | Claude Code/Codex/Gemini/OpenCode 安装就位。实际在非 Claude 平台的端到端验证未做 |
| 可视化项目管理 | 80% | Dashboard + Hub 完成，telemetry/activity/memory 数据采集已接通。缺 tracing 自动埋点 |
| 多 Agent 协调 | 40% | Orchestrator 有实现，共识算法有测试。未接入 pipeline |

**还没跑过一个真实项目的完整 pipeline。这是当前最大的缺口。**

---

## 五、仓库结构

```
apex-forge/
├── skill/                     # AF 核心协议
│   ├── SKILL.md               #   协议文档（复杂度路由、阶段门控、TDD、证据分级...）
│   ├── bindings.yaml          #   阶段 → 外部 skill 映射（版本约束、优先级、输出 schema）
│   ├── install.sh             #   安装器（AF + 7 个 companion skill）
│   ├── stages/                #   6 个 pipeline 阶段（brainstorm/plan/execute/review/ship/compound + verify）
│   ├── roles/                 #   6 个编排角色（并行派发/子 agent/跨会话/范围锁/worktree/skill 创建）
│   ├── aliases/               #   7 个向后兼容命令别名
│   ├── gates/                 #   AF 自有质量门（design-baseline：客观设计检查）
│   └── ops/                   #   8 个 CLI 操作的 skill 封装
├── workflow/                  #   迁移的 41 个能力（从 gstack 全部迁入）
│   └── roles/                 #   head storm/评审/回顾/监控/安全护栏/设计/DX 等
├── src/                       #   TypeScript 实现（8,379 行）
│   ├── cli.ts                 #     CLI 入口
│   ├── dashboard.ts           #     Dashboard HTTP 服务
│   ├── orchestrator.ts        #     任务自动编排（已写未接）
│   ├── state/                 #     状态管理（task/memory/config/recovery）
│   ├── mcp/                   #     MCP Server（4 个工具模块，3 种角色）
│   ├── consensus/             #     4 种共识算法（Raft/BFT/Gossip/CRDT，已写未接）
│   └── __tests__/             #     测试（506 行）
├── frontend/                  #   Dashboard 前端
├── hooks/                     #   Session-start 自动注入 + 事件采集
├── dist/                      #   编译二进制（apex-forge + apex-forge-mcp）
└── docs/                      #   文档
```

7 个 companion skill（独立仓库，硬依赖）：

| Skill | 作用 | 仓库 |
|-------|------|------|
| systematic-debugging | 根因调试 | d-wwei/systematic-debugging |
| thorough-code-review | 代码审查（发起 + 接收反馈） | d-wwei/thorough-code-review |
| security-audit | 安全审计 | d-wwei/security-audit |
| browser-qa-testing | QA + 无头浏览器 | d-wwei/browser-qa-testing |
| tasteful-frontend | 前端设计规范 | d-wwei/tasteful-frontend |
| design-to-code-runner | 设计稿还原代码 | d-wwei/design-to-code-runner |
| product-review | 产品体验评审 | d-wwei/product-review |

---

## 六、工作原理

### 协议层：怎么约束 Agent

`skill/SKILL.md` 定义了 8 个机制。每次会话通过 `hooks/session-start` 自动注入到 Agent 上下文。

- **复杂度路由**：简单任务一步过，中等任务 PDCA 轮次（最多 5 轮），大任务跨会话波次
- **阶段门控**：brainstorm 阶段写代码会被拦截，execute 阶段做设计决策会被打回
- **TDD 铁律**：写测试 → RED → 实现 → GREEN → 重构，无例外
- **证据分级**：猜测(E0) → 间接(E1) → 直接(E2) → 多源确认(E3) → 完全验证(E4)，行动最低 E2，声明完成最低 E3
- **升级阶梯**：第 2 次失败换方法，第 3 次出 3 个假设，第 5 次交给人类
- **验证门**：跑命令 → 读完整输出 → 确认通过 → 才能声明完成
- **多角色审查**：安全/正确性/规范合规 + 按文件类型动态激活专项审查员
- **完成状态**：DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT

### 绑定层：怎么调外部 Skill

`skill/bindings.yaml` 是声明式映射。每个绑定有触发条件、skill 名、版本约束、优先级、并发策略、输出 schema。

Agent 在 execute 或 review 阶段遇到匹配的任务时，查 bindings.yaml → 加载 skill → skill 完成后校验输出 → 映射回 AF 证据等级 → 记录 invocation trace。

设计审查走两层：先 design-baseline（AF 自有客观基线，WCAG 对比度/触控尺寸/响应式），再 tasteful-frontend（外部主观审美）。基线不过直接打回，不进第二层。

### 状态层：数据怎么持久化

`.apex/` 目录下：
- `state.json`：当前阶段、历史、skill 调用追踪
- `tasks.json`：任务队列（open → assigned → in_progress → to_verify → done）
- `memory.json`：事实存储（带 0.0-1.0 置信度）
- `events.jsonl`：工具调用事件流
- `analytics/usage.jsonl`：遥测数据

全部通过 `apex` CLI 读写。

### Dashboard 层：可视化

嵌入 CLI 的 HTTP 服务。端口根据项目路径 hash 自动分配。多项目通过 Hub（3456 端口）汇总。SSE 每 2 秒推送最新状态。

### 已写未接的部分

- **Orchestrator**（271 行）：自动从任务队列拉任务、派 Agent 做、等依赖、重试。代码写完了但没接入 pipeline。
- **共识算法**（Raft 671 行、BFT 230 行、Gossip 175 行、CRDT 202 行）：为多 Agent 同时操作共享数据准备。有测试，但是同一进程内模拟，不是真正的进程间通信。
- **MCP Server**：编译好了但需要手动配置才能用。

---

## 七、数字总览

| 指标 | 数量 |
|------|------|
| 注册 skill | 60 |
| TypeScript 源码 | 8,379 行 |
| 测试代码 | 506 行 |
| Pipeline 阶段 | 7（含 verify） |
| Workflow role 文件 | 41 |
| Companion skill 仓库 | 7 |
| CLI 命令 | 35+ |
| 支持平台 | 6 |
| 共识算法 | 4 |

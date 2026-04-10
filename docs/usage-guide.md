# Apex Forge 使用指南

## 它到底能帮你做什么

你让 AI 帮你做一个功能。没有 AF 的时候，AI 上来就写代码，写完说"做好了"，你一跑发现各种 bug。AI 猜着修，改一个坏一个。下次开新会话，AI 什么都不记得。

AF 做的事情是给 AI 一套做事的规矩。不让它上来就写代码，先把需求问清楚。不让它跳过测试，必须先写测试再写代码。不让它猜着修 bug，必须找到根因。不让它说"做好了"但实际没验证，必须跑命令证明。

AI 的能力完全一样，AF 只是堵住它最常犯的错。

---

## AF 的四层结构

```
Skills 层 — 给 Agent 用
  60+ 个 markdown 文件，Agent 读了照着做
  协议规则、pipeline 阶段、领域能力、操作命令

CLI 层 — Agent 和人都能用
  apex 命令行工具，读写 .apex/ 状态数据
  任务管理、记忆存储、遥测统计、设计资产

Web 层 — 给人用
  Dashboard + Hub，可视化看项目进展
  任务看板、pipeline 阶段、遥测、活动流、设计对比

MCP 层（可选）— 给 IDE 用
  把 CLI 功能暴露为 MCP 工具
  配了可以在 IDE 里直接调用，不配也完全能用
```

Skills 是 Agent 的界面，Web 是人的界面，CLI 是共享的数据层，MCP 是 IDE 的快捷通道。

---

## 安装

```bash
git clone https://github.com/d-wwei/apex-forge
cd apex-forge
bash skill/install.sh
```

自动完成：
- AF 核心链接到 `~/.claude/skills/apex-forge`
- 8 个 companion skill 自动安装
- `apex` CLI 加入 PATH
- 浏览器二进制编译（如果有 bun）

支持 Claude Code、Codex、Gemini CLI、OpenCode。自动检测。

---

## 在项目中启用

```bash
cd /path/to/your-project
apex init       # 创建 .apex/ 目录
apex status     # 查看当前状态
```

---

## 跑完整流程

假设你要做一个用户注册功能。

### 第一步：问清楚需求

```
/apex-forge brainstorm
```

AF 不让 AI 写代码。根据你的请求，它会走两条路：

**路径 A：具体开发任务**（"帮我做个注册功能"）

走 9 步需求清单：搞清楚问题是什么、约束在哪、至少 2 个方案对比、验收标准（"做到什么程度算完"）、风险和依赖。

产出：`docs/brainstorms/{name}-requirements.md`

**路径 B：产品决策**（"我们要不要做这个产品"、"写个 PRD"）

自动调 `/product-prd`，走 PRD 访谈流程：用户是谁、痛点是什么、现有方案差在哪、你的解法、成功指标、MVP 范围。

产出：完整的 PRD 文档

两条路都要你确认了才能往下走。

### 第二步：出施工图纸

```
/apex-forge plan
```

还是不让写代码。AI 给出：改哪些文件（精确路径）、新建哪些文件、测试文件路径、任务分解（T1/T2/T3 每个有描述、文件、依赖）、每个设计决策的理由。

有防膨胀规则：超过 8 个文件逐个辩护，超过 2 个新类质疑是否过度设计。

产出：`docs/plans/{name}-plan.md`，你确认了才能写代码。

### 第三步：写代码（先测试后实现）

```
/apex-forge execute
```

TDD 铁律：写测试 → 确认测试失败（RED）→ 写最少代码让测试通过（GREEN）→ 重构。每个任务都这样。

遇到不同情况时，AF 自动调对应的 skill：

| 情况 | 自动调用 | 干什么 |
|------|---------|--------|
| 遇到 bug | `/systematic-debugging` | Iron Law：不找到根因不修复，至少 3 个假设 |
| 涉及前端 | `/tasteful-frontend` | 设计规范指导 |
| 从设计稿实现 | `/design-to-code-runner` | Figma/截图转代码 |
| 需要浏览器验证 | `/browser-qa-testing` | 无头浏览器 QA |

这些调用由 `bindings.yaml` 配置，不需要你手动触发。

每次调完外部 skill，AF 自动记录一条 invocation trace（调了谁、什么版本、什么结果），后面 ship 的时候要检查。

### 第四步：多角色审查

```
/apex-forge review
```

AI 不说"做好了"。它先以不同角色审查一遍：

**始终在场的 3 个审查员：**
- 安全审查员：密码加密了吗？有注入吗？密钥泄露了吗？
- 正确性审查员：边界情况处理了吗？错误信息对吗？
- 规范合规审查员：计划里的每个验收标准都实现了吗？

**按改动内容自动激活的审查员：**
- 改了 SQL → SQL 安全审查员
- 改了前端文件 → 前端审查员 + 两层设计审查
- 改了 API → API 契约审查员
- 改了依赖 → 依赖审查员

**最后跑对抗性审查员**：专门找漏洞，构造攻击场景。

**设计审查走两层：**
1. 客观基线（WCAG 对比度、触控尺寸、响应式不崩）→ 不过直接打回
2. 主观审美（间距、字体、颜色、动效）→ 由 `/tasteful-frontend` 评判

**独立第二意见：** 审查完自动调 Codex 做交叉验证（如果装了 Codex CLI）。两个不同 AI 的意见冲突时提给你决策。

每个发现带 P0-P3 严重度。P0 直接阻塞发布。

### 第五步：验证 + 发布

```
/apex-forge ship
```

5 项检查必须全过：
1. 测试全绿
2. 所有改动都能追溯到计划
3. 不在 main 分支上
4. 审查状态是 DONE
5. invocation trace 完整（必需的 skill 都被调用过）+ binding 版本校验

然后：版本号 bump → changelog → commit → push → PR。

### 第六步：知识提取

```
/apex-forge compound
```

把这次做的事情提炼成可复用的知识，存到 `docs/solutions/` 下面。分析 3 个维度：问题背景（为什么出现）、解决方案（怎么修的、为什么有效）、有没有已有的知识可以更新。下次遇到类似问题不用从头来。

---

## 单独用某个能力（不走 pipeline）

不想跑完整流程，只想用其中一个能力：

```
/systematic-debugging          # 遇到 bug 时用，强制根因调查
/thorough-code-review          # 审查代码或评估别人的审查反馈
/browser-qa-testing            # QA 测试，带无头浏览器
/security-audit                # 安全审计，5 个域扫描
/product-prd                   # 写 PRD，产品决策
```

旧命令也能用（自动路由到新 skill）：

```
/apex-forge investigate        # → /systematic-debugging
/apex-forge code-review        # → /thorough-code-review outgoing
/apex-forge receiving-review   # → /thorough-code-review incoming
/apex-forge qa                 # → /browser-qa-testing
/apex-forge browse             # → /browser-qa-testing
/apex-forge security-audit     # → /security-audit
/apex-forge design-review      # → design-baseline + /tasteful-frontend
```

`/better-work` 等同于 `/apex-forge`，自动路由到同一协议。

---

## 项目管理命令

在 agent 会话里直接用：

```
/apex-forge-init              # 初始化项目
/apex-forge-status            # 查看状态
/apex-forge-dashboard         # 启动可视化面板
/apex-forge-dashboard hub     # 多项目汇总面板
/apex-forge-tasks             # 任务管理（list/create/next/verify）
/apex-forge-memory            # 记忆管理（add/search/prune）
/apex-forge-recover           # 修复卡住的状态
/apex-forge-telemetry         # 使用统计
```

或者在终端里用 CLI：

```bash
apex status                    # 当前状态
apex task list                 # 任务列表
apex task next                 # 下一个可做的任务
apex task create "标题" "描述"  # 创建任务
apex memory list               # 项目记忆
apex memory add "事实" 0.9 标签 # 添加记忆
apex telemetry report          # 使用统计
apex check-bindings            # 检查 skill 版本
apex trace-skill ...           # 记录 skill 调用追踪
apex design generate "描述"    # 生成 UI 设计图
apex design variants "描述"    # 生成设计变体
apex recover                   # 修复卡住的状态
```

---

## Dashboard

你看到的 Web 面板，所有数据都是真实的，从 `.apex/` 目录读取。

```bash
# 单个项目
cd /path/to/project
nohup apex dashboard > /dev/null 2>&1 &

# 多项目汇总（固定 3456 端口）
nohup apex dashboard hub > /dev/null 2>&1 &
open http://localhost:3456
```

面板包含：

| 区域 | 数据来源 | 说明 |
|------|---------|------|
| Task Orchestration Board | `.apex/tasks.json` | 任务看板（open/assigned/in_progress/to_verify/done） |
| Pipeline Orchestration | `.apex/state.json` | 当前阶段 + 历史 + artifacts |
| System Telemetry | `.apex/analytics/usage.jsonl` | 总运行次数、平均耗时、成功率、skill 排行 |
| Activity Stream | `.apex/events.jsonl` | 实时工具调用活动 |
| Cognitive Memory | `.apex/memory.json` | 项目记忆（带置信度） |
| Design Comparison | `.apex/designs/` | 设计图变体对比（点击可放大） |

多个项目各自启动 dashboard，Hub 自动聚合所有活跃项目。

---

## 8 个 Companion Skill

AF 核心只管流程纪律。具体能力由独立的 skill 提供，`install.sh` 自动安装。

| Skill | 干什么 | 仓库 |
|-------|--------|------|
| systematic-debugging | 根因调试，Iron Law | d-wwei/systematic-debugging |
| thorough-code-review | 代码审查（发起 + 接收反馈） | d-wwei/thorough-code-review |
| security-audit | 安全审计，5 域扫描 | d-wwei/security-audit |
| browser-qa-testing | QA + 无头浏览器 | d-wwei/browser-qa-testing |
| tasteful-frontend | 前端设计规范 | d-wwei/tasteful-frontend |
| design-to-code-runner | 设计稿还原代码 | d-wwei/design-to-code-runner |
| product-review | 产品体验评审 | d-wwei/product-review |
| product-prd | PRD 文档撰写 | d-wwei/Product-Prd-Skill |

每个既可以在 pipeline 内被自动调用，也可以 `/skill-name` 独立使用。

---

## 更新

```bash
# 更新 AF 核心
cd ~/.claude/skills/apex-forge && git pull

# 更新所有 companion skill
bash ~/.claude/skills/apex-forge/install.sh update
```

每次启动新会话时，session-start hook 自动检查并安装缺失的 companion skill。

---

## 核心规矩速查

```
路由器:    简单任务一步过 → 中等任务 PDCA 轮次 → 大任务跨会话波次
阶段:      先问清楚(WHAT) → 再出方案(HOW) → 最后动手(DO)
TDD:       写测试 → 确认失败 → 写代码 → 确认通过 → 重构
证据:      猜测 → 间接证据 → 直接证据 → 多源确认 → 完全验证
升级:      第 2 次失败换方法 → 第 3 次出 3 个假设 → 第 5 次交给人
验证门:    跑命令 → 读完整输出 → 确认通过 → 才能说"完成了"
```

# Apex Forge 使用指南

## 它到底能帮你做什么

你让 AI 帮你做一个功能。没有 AF 的时候，AI 上来就写代码，写完说"做好了"，你一跑发现各种 bug。AI 猜着修，改一个坏一个。下次开新会话，AI 什么都不记得。

AF 做的事情是给 AI 一套做事的规矩。不让它上来就写代码，先把需求问清楚。不让它跳过测试，必须先写测试再写代码。不让它猜着修 bug，必须找到根因。不让它说"做好了"但实际没验证，必须跑命令证明。

AI 的能力完全一样，AF 只是堵住它最常犯的错。

---

## AF 的三层结构

```
Skills 层（主体）
  60 个 markdown 文件，AI Agent 读了照着做
  包括：协议规则、pipeline 阶段、领域能力、操作命令
  这是 AF 的核心工作方式

CLI 层
  apex 命令行工具，处理状态持久化
  任务管理、记忆存储、遥测统计、dashboard
  Agent 通过 shell 调用

MCP 层（可选）
  把 CLI 的功能暴露为 MCP 工具
  配了可以在 IDE 里直接调用，不配也完全能用
```

Skills 和 CLI 是必需的，MCP 是可选的。

---

## 安装

```bash
git clone https://github.com/d-wwei/apex-forge
cd apex-forge
bash skill/install.sh
```

自动完成：
- AF 核心链接到 `~/.claude/skills/apex-forge`
- 7 个 companion skill 自动安装
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

AF 不让 AI 写代码。它先走一个 9 步清单：搞清楚问题是什么、约束在哪、至少 2 个方案对比、验收标准（"做到什么程度算完"）、风险和依赖。

产出：`docs/brainstorms/{name}-requirements.md`，你确认了才能往下走。

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

如果遇到 bug，AF 自动调 `/systematic-debugging`（Iron Law：不找到根因不修复，至少 3 个假设）。
如果涉及前端，自动调 `/tasteful-frontend`（设计规范指导）。
如果需要浏览器验证，自动调 `/browser-qa-testing`（无头浏览器 QA）。

这些调用由 `bindings.yaml` 配置，不需要你手动触发。

### 第四步：多角色审查

```
/apex-forge review
```

AI 不说"做好了"。它先以不同角色审查一遍：

- 安全审查员：密码加密了吗？有注入吗？密钥泄露了吗？
- 正确性审查员：边界情况处理了吗？错误信息对吗？
- 规范合规审查员：计划里的每个验收标准都实现了吗？
- 对抗性审查员：专门找漏洞，构造攻击场景

如果改了前端文件，自动走两层设计审查：
1. 客观基线（WCAG 对比度、触控尺寸、响应式不崩）→ 不过直接打回
2. 主观审美（间距、字体、颜色、动效）→ 由 `/tasteful-frontend` 评判

审查完还可以自动调 Codex 做独立第二意见（如果装了 Codex CLI）。

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
5. 所有必需的 skill 都被调用过（invocation trace 校验 + 版本校验）

然后：版本号 bump → changelog → commit → push → PR。

### 第六步：知识提取

```
/apex-forge compound
```

把这次做的事情提炼成可复用的知识，下次遇到类似问题不用从头来。

---

## 单独用某个能力（不走 pipeline）

不想跑完整流程，只想用其中一个能力：

```
/systematic-debugging          # 遇到 bug 时用，强制根因调查
/thorough-code-review          # 审查代码或评估别人的审查反馈
/browser-qa-testing            # QA 测试，带无头浏览器
/security-audit                # 安全审计，5 个域扫描
```

旧命令也能用：

```
/apex-forge investigate        # → /systematic-debugging
/apex-forge code-review        # → /thorough-code-review
/apex-forge qa                 # → /browser-qa-testing
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
/apex-forge-tasks             # 任务管理
/apex-forge-memory            # 记忆管理
/apex-forge-recover           # 修复卡住的状态
/apex-forge-telemetry         # 使用统计
```

或者在终端里用 CLI：

```bash
apex status                    # 当前状态
apex task list                 # 任务列表
apex task next                 # 下一个可做的任务
apex memory list               # 项目记忆
apex memory add "事实" 0.9 标签 # 添加记忆
apex telemetry report          # 使用统计
apex check-bindings            # 检查 skill 版本
apex recover                   # 修复卡住的状态
```

---

## Dashboard

每个项目一个面板，多个项目通过 Hub 汇总。

```bash
# 单个项目
cd /path/to/project
nohup apex dashboard > /dev/null 2>&1 &

# 多项目汇总（固定 3456 端口）
nohup apex dashboard hub > /dev/null 2>&1 &
open http://localhost:3456
```

面板显示：任务看板、pipeline 阶段、遥测统计、活动流、项目记忆。数据从 `.apex/` 实时读取。

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

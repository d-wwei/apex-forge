# Apex Forge 使用指南

## 1. 安装

```bash
git clone https://github.com/d-wwei/apex-forge
cd apex-forge
bash skill/install.sh
```

安装脚本自动完成：
- AF 核心 symlink 到 `~/.claude/skills/apex-forge`
- 7 个 companion skill 克隆到 `~/.claude/skills/`
- `apex` CLI 加入 PATH
- browser-qa-testing 编译 browse 二进制

支持平台：Claude Code、Codex、Gemini CLI、OpenCode。自动检测已安装的平台。

---

## 2. 在项目中启用

```bash
cd /path/to/your-project
apex init
```

创建 `.apex/` 目录，包含 `state.json`、`tasks.json`、`memory.json`。安全重复执行。

查看状态：

```bash
apex status
```

---

## 3. Pipeline 模式（完整流程）

在 AI Agent 会话中使用 skill 命令：

```
/apex-forge brainstorm    # 需求探索（WHAT）— 不写代码
/apex-forge plan          # 实现规划（HOW）— 文件路径、函数签名、测试方案
/apex-forge execute       # TDD 实现（DO）— 写测试、RED、实现、GREEN
/apex-forge review        # 多角色质量门 — 安全、正确性、规范合规
/apex-forge ship          # 提交推送 — 版本号、changelog、commit、PR
/apex-forge compound      # 知识提取 — 捕获可复用的解决方案
```

别名：`/better-work` 等同于 `/apex-forge`，自动路由到同一协议。

阶段之间有硬门控：brainstorm 阶段不能写代码，execute 阶段不能做设计决策。

---

## 4. 独立 Skill（按需使用，不需要进 pipeline）

### 4 个 Companion Skill（外部仓库，独立可用）

```
/systematic-debugging          # 根因调试（Iron Law：不找到根因不修复）
/thorough-code-review          # 代码审查（outgoing: 你审别人 / incoming: 别人审你）
/browser-qa-testing            # QA 测试 + 无头浏览器（Quick/Standard/Exhaustive 三级）
/security-audit                # 安全审计（5 域扫描，CWE 标签）
```

### 向后兼容别名（旧命令仍然可用）

```
/apex-forge investigate        # → 自动路由到 /systematic-debugging
/apex-forge code-review        # → 自动路由到 /thorough-code-review outgoing
/apex-forge receiving-review   # → 自动路由到 /thorough-code-review incoming
/apex-forge qa                 # → 自动路由到 /browser-qa-testing
/apex-forge browse             # → 自动路由到 /browser-qa-testing
/apex-forge security-audit     # → 自动路由到 /security-audit
/apex-forge design-review      # → 先跑 design-baseline 基线，再跑 /tasteful-frontend
```

这些 skill 既可以在 pipeline 内被自动调用（通过 `bindings.yaml` 派发），也可以独立使用。

---

## 5. Ops 命令（项目管理）

```
/apex-forge-init              # 初始化项目
/apex-forge-status            # 查看当前状态
/apex-forge-dashboard         # 启动可视化面板
/apex-forge-dashboard hub     # 启动多项目汇总面板
/apex-forge-tasks             # 任务管理（list/create/next/verify）
/apex-forge-memory            # 记忆管理（add/search/prune/inject）
/apex-forge-recover           # 修复卡住的状态
/apex-forge-telemetry         # 使用统计
/apex-forge-worktree-ops      # git worktree 管理
```

---

## 6. Dashboard

### 单项目面板

```bash
cd /path/to/project
nohup apex dashboard > /dev/null 2>&1 &
```

端口根据项目路径自动分配（同一项目每次相同）。启动后浏览器打开输出的 URL。

### 多项目 Hub

```bash
nohup apex dashboard hub > /dev/null 2>&1 &
open http://localhost:3456
```

Hub 固定在 3456 端口，自动聚合所有正在运行的项目面板。每个项目的 dashboard 启动时自动注册到 `~/.apex-forge/registry.json`，退出时自动注销。

### 同时查看多个项目

```bash
# 项目 A
cd ~/project-a && nohup apex dashboard > /dev/null 2>&1 &

# 项目 B
cd ~/project-b && nohup apex dashboard > /dev/null 2>&1 &

# 打开 Hub 看全部
nohup apex dashboard hub > /dev/null 2>&1 &
open http://localhost:3456
```

---

## 7. 核心协议速查

```
路由器:    Tier 1 (单次) → Tier 2 (PDCA 轮次) → Tier 3 (跨会话波次)
阶段:      Brainstorm (WHAT) → Plan (HOW) → Execute (DO)
TDD:       写测试 → RED → 实现 → GREEN → 重构
证据:      E0 (猜测) → E1 (间接) → E2 (直接) → E3 (多源) → E4 (验证)
升级:      L0 (正常) → L1 (换方法) → L2 (3 假设) → L3 (检查清单) → L4 (交给人类)
验证门:    识别 → 执行 → 读输出 → 确认 → 声明
状态:      DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
```

---

## 8. 终端 CLI 速查

```bash
# 项目
apex init                              # 初始化
apex status [--json]                   # 查看状态
apex dashboard [--port PORT]           # 启动面板
apex dashboard hub                     # 多项目汇总
apex recover                           # 修复卡住的状态

# 任务
apex task list [--status STATUS]       # 列出任务
apex task create TITLE [DESC] [DEPS]   # 创建任务
apex task next                         # 下一个可做的任务
apex task assign TASK_ID               # 分配
apex task start TASK_ID                # 开始
apex task submit TASK_ID EVIDENCE      # 提交验证
apex task verify TASK_ID [pass|fail]   # 验证通过/失败
apex task block TASK_ID REASON         # 阻塞
apex task get TASK_ID                  # 查看详情

# 记忆
apex memory add FACT CONFIDENCE [TAGS] # 添加事实
apex memory list [--min N]             # 列出（可按置信度筛选）
apex memory search QUERY               # 搜索
apex memory prune                      # 清理低置信度
apex memory inject                     # 输出为上下文注入格式

# 遥测
apex telemetry report                  # 使用统计
apex telemetry start SKILL             # 开始跟踪
apex telemetry end OUTCOME             # 结束跟踪

# Worktree
apex worktree create TASK_ID           # 为任务创建隔离工作区
apex worktree list                     # 列出工作区
apex worktree cleanup TASK_ID          # 清理工作区
```

---

## 9. 更新

```bash
# 更新 AF 核心
cd ~/.claude/skills/apex-forge && git pull

# 更新所有 companion skill
bash ~/.claude/skills/apex-forge/install.sh update
```

Session-start hook 每次启动会话时自动检查并安装缺失的 companion skill。

---

## 10. 架构

```
apex-forge/
├── skill/
│   ├── SKILL.md              # 核心协议
│   ├── bindings.yaml         # 阶段 → 外部 skill 映射
│   ├── install.sh            # 安装器
│   ├── gates/                # AF 内置质量门（design-baseline）
│   ├── stages/               # Pipeline 阶段定义
│   ├── roles/                # 编排 + 工具角色
│   ├── aliases/              # 向后兼容命令别名
│   ├── ops/                  # CLI 操作 skill 封装
│   └── references/           # 平台安装指南
├── workflow/
│   └── roles/                # 迁移的能力（41 个 role 文件）
├── src/                      # CLI + MCP server + 状态管理
├── dist/                     # 编译二进制
├── frontend/                 # Dashboard 前端
└── hooks/                    # Session-start hook
```

7 个 companion skill（硬依赖）：
- `systematic-debugging` — 根因调试
- `thorough-code-review` — 代码审查
- `security-audit` — 安全审计
- `browser-qa-testing` — QA + 浏览器
- `tasteful-frontend` — 前端设计
- `design-to-code-runner` — 设计还原
- `product-review` — 产品评审

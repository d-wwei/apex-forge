# Apex Forge

[English](README.md)

AI coding agent 的统一执行框架。43 个 skill，三层复杂度路由，一次安装。从 8 个开源项目提取核心模式，重新组合。

---

## 为什么需要它

AI coding agent 有三个核心问题：

**不靠谱** -- 猜而不验证，声称"已完成"但拿不出证据。改了代码不跑测试，修了 bug 不确认复现条件消失。

**不协调** -- 多个 agent 无法配合。任务状态在对话中丢失，下一个 session 不知道上一个做到哪了，没有统一的状态机。

**不完整** -- 要装 5 个工具才能凑齐一个完整工作流。审查用一个，浏览器测试用一个，部署用一个，知识管理用一个。

Apex Forge 把这三件事合进一个框架，在协议层强制执行纪律。

---

## 快速开始

```bash
git clone https://github.com/d-wwei/apex-forge.git ~/.claude/skills/apex-forge
cd ~/.claude/skills/apex-forge
bun install && bun run build:all
bunx playwright install chromium
./dist/apex-forge init
```

也可以直接跟 AI 说：`"帮我初始化 apex forge"`

安装后你得到 3 个二进制（`apex-forge`、`apex-forge-browse`、`apex-forge-mcp`）、43 个 skill、一个每次 session 自动注入的执行协议。

初始化后项目里多一个 `.apex/` 目录：

```
.apex/
  state.json      -- 当前阶段和会话状态
  tasks.json      -- 任务列表和状态机
  memory.json     -- 记忆库（跨会话持久化）
  analytics/      -- 使用数据
  screenshots/    -- 浏览器截图
```

已在 `.gitignore` 中，不会提交到仓库。

---

## 使用方式

每个场景给出两种用法：自然语言 + 对应命令。可以混着用。

### 从零开始做一个功能

**跟 AI 说：** `"我想加一个用户认证功能，用 JWT"`

**或者按阶段手动推进：**

```bash
# 1. 需求探索（硬门禁：这个阶段不会写任何代码）
/apex-forge-brainstorm
# -> 产出 docs/brainstorms/auth-requirements.md

# 2. 实现计划（文件路径、函数签名、测试场景、依赖）
/apex-forge-plan
# -> 产出 docs/plans/auth-plan.md

# 3. TDD 执行（先写测试再写代码，复杂任务自动拆分给子 agent）
/apex-forge-execute

# 4. 质量审查（18 个视角：安全、正确性、框架特定）
/apex-forge-review

# 5. 发布（测试 -> 版本号 -> CHANGELOG -> 提交 -> PR）
/apex-forge-ship

# 6. 知识沉淀（写到 docs/solutions/，下次复用）
/apex-forge-compound
```

你不需要记住顺序。每个阶段完成后 AI 会自动建议下一步。直接说也行：

| 你说 | 触发阶段 | 对应命令 |
|------|---------|---------|
| "帮我梳理一下需求" | 需求探索 | `/apex-forge-brainstorm` |
| "出个实现计划" | 计划 | `/apex-forge-plan` |
| "开始写代码" | 执行 | `/apex-forge-execute` |
| "帮我 review 一下" | 审查 | `/apex-forge-review` |
| "可以发布了" | 发布 | `/apex-forge-ship` |
| "存一下这次学到的东西" | 知识沉淀 | `/apex-forge-compound` |

### 修 Bug

**跟 AI 说：** `"登录接口返回 401，但 token 是有效的"`

**或者：** `/apex-forge-investigate`

调查流程固定：复现问题、在代码边界加日志、提出 3 个假设逐个验证、确认根因后才修复、写回归测试。铁律：没有根因不修 bug。

### 代码审查

**跟 AI 说：** `"帮我 review 一下这次改动"`

**或者：** `/apex-forge-code-review`

读取 `git diff`，18 个视角检查。改了 `.tsx` 文件启动 React Reviewer，改了 `.py` 文件启动 Python Reviewer。结论三选一：`SHIP` / `SHIP_WITH_FIXES` / `BLOCK`。

### QA 测试

**跟 AI 说：** `"帮我测一下这个页面"`

**或者：** `/apex-forge-qa`

三个深度：Quick（关键问题）、Standard（+中等）、Exhaustive（全覆盖）。有浏览器就自动打开页面截图、交互、验证。

### 安全审计

**跟 AI 说：** `"帮我做一次安全检查"`

**或者：** `/apex-forge-security-audit`

按顺序检查：密钥泄露、依赖漏洞、CI/CD 安全、OWASP Top 10、认证授权。

### 更多场景速查

| 你说 | 对应命令 | AI 做什么 |
|------|---------|----------|
| "这个计划够不够大胆？" | `/apex-forge-ceo-review` | CEO 视角审查 scope |
| "架构对不对？" | `/apex-forge-eng-review` | 工程审查：数据/API/性能/部署 |
| "设计好看吗？" | `/apex-forge-design-review` | 视觉 QA + 截图对比 |
| "回顾一下这周" | `/apex-forge-retro` | git 统计 + 团队回顾 |
| "打开仪表盘" | `apex-forge dashboard` | Web 看板 + 活动流 + 数据分析 |
| "安全地跑一下这段代码" | `apex-forge sandbox js "..."` | Docker 沙箱执行 |
| "导入 GitHub issues" | `apex-forge issues import` | 导入为 apex 任务 |
| "帮我创建一个新 skill" | `/apex-forge-skill-author` | 引导式 skill 创作 |
| "三种设计方案看看" | `/apex-forge-design-shotgun` | 3 种视觉方向探索 |
| "全面审查一下计划" | `/apex-forge-autoplan` | 自动跑 CEO + 工程 + 设计三轮 |

> 完整 CLI 参考：[使用说明书](docs/USAGE-GUIDE.zh-CN.md)

---

## 任务管理

跟 AI 说 "创建一个任务：实现用户认证"，或者用 CLI：

```bash
# 创建
apex-forge task create "实现用户认证" "JWT 中间件 + 刷新令牌"
apex-forge task create "写认证测试" "集成测试" T1        # T1 是依赖

# 查看
apex-forge task list                        # 全部任务
apex-forge task list --status open          # 只看 open 的
apex-forge task next                        # 下一个可做的（自动跳过有未完成依赖的）
apex-forge task get T1                      # 详情

# 状态流转（强制检查，不允许跳步）
apex-forge task assign T1                   # open -> assigned
apex-forge task start T1                    # assigned -> in_progress
apex-forge task submit T1 "测试全通过"       # in_progress -> to_verify
apex-forge task verify T1 pass              # to_verify -> done
apex-forge task verify T1 fail              # to_verify -> in_progress（重做）
apex-forge task block T1 "等待 API key"     # -> blocked
apex-forge task release T1                  # assigned -> open（放弃认领）
```

---

## 记忆系统

跟 AI 说 "记住：认证用的是 JWT RS256"，或者用 CLI：

```bash
# 写入（置信度 0.0-1.0 + 标签）
apex-forge memory add "认证用 JWT RS256" 0.9 auth jwt
apex-forge memory add "数据库是 PostgreSQL 16" 0.85 db

# 查看
apex-forge memory list                      # 全部
apex-forge memory list --min 0.8            # 只看高置信度
apex-forge memory search "JWT"              # 搜索

# 维护
apex-forge memory curate                    # 自动从 git/tasks/solutions 提取知识
apex-forge memory prune                     # 清理低质量（<0.5）记忆

# 在会话中策展（AI 自己回顾本次会话）
/apex-forge-memory-curate
```

高置信度事实自动注入会话上下文。低置信度条目自动清理。

---

## 浏览器

跟 AI 说 "打开 https://my-app.com 看看"，或者用 CLI：

```bash
# 导航
apex-forge-browse goto https://your-app.com
apex-forge-browse text                      # 读页面文字
apex-forge-browse links                     # 所有链接

# 交互（先 snapshot 看有什么，再用 @e 引用号操作）
apex-forge-browse snapshot -i               # 列出所有可交互元素 -> @e1, @e2, ...
apex-forge-browse click @e3                 # 点击
apex-forge-browse fill @e5 "test@test.com"  # 填写

# 截图
apex-forge-browse screenshot /tmp/page.png
apex-forge-browse responsive /tmp/layout    # 自动截 mobile/tablet/desktop

# 检查
apex-forge-browse console --errors          # JS 错误
apex-forge-browse is visible ".modal"       # 元素是否可见
apex-forge-browse perf                      # 页面加载性能

# Cookie（测试需要登录的页面）
apex-forge-browse cookie-import-browser     # 从真实 Chrome 导入 cookies

# 可见模式（弹出真实 Chrome + 侧边栏看 AI 在干什么）
apex-forge-browse connect
apex-forge-browse disconnect                # 切回无头模式
```

---

## 仪表盘

跟 AI 说 "打开仪表盘"，或者：

```bash
apex-forge dashboard                        # 默认 3456 端口
apex-forge dashboard --port 8080            # 自定义端口
```

5 个面板：任务看板（5 列拖拽式）、管道状态（当前阶段 + 产出物）、活动流（实时 skill 执行记录）、记忆面板（按置信度排序）、数据分析（使用次数、平均耗时、成功率）。

---

## 全部 43 个 Skill

### 协议（3）

| 命令 | 说明 |
|------|------|
| `/apex-forge` | 核心执行协议。复杂度路由、TDD 铁律、证据评级、升级阶梯、验证门禁。每次 session 自动激活。 |
| `/apex-forge-round` | PDCA 轮次执行。命名轮次类型：clarify、explore、hypothesis、planning、execution、verification、hardening、recovery。 |
| `/apex-forge-wave` | 波次交付。跨 session 持久状态、假设登记、决策日志、交接协议。 |

### 阶段（7）

| 命令 | 说明 |
|------|------|
| `/apex-forge-brainstorm` | 需求探索。硬门禁：设计批准前禁止写代码。 |
| `/apex-forge-plan` | 实施计划：文件路径、任务分解、测试场景。检查 brainstorm 产物。 |
| `/apex-forge-execute` | TDD 优先实现。复杂任务自动分发子 agent。检查 plan 产物。 |
| `/apex-forge-review` | 3 人格质量门禁。检查 git diff。 |
| `/apex-forge-ship` | 测试、版本号、changelog、commit、PR。 |
| `/apex-forge-compound` | 知识沉淀到 `docs/solutions/`，自动去重检测。 |
| `/apex-forge-verify` | 5 步证据门禁。独立可用。 |

### 质量与审查（6）

| 命令 | 说明 |
|------|------|
| `/apex-forge-qa` | 系统化 QA 测试，分层深度，浏览器感知验证。 |
| `/apex-forge-investigate` | 根因调查。不理解根因不动手修。 |
| `/apex-forge-code-review` | 多通道代码审查：正确性、安全、性能、可维护性。 |
| `/apex-forge-design-review` | 视觉 QA。截图驱动的修复-验证循环。 |
| `/apex-forge-security-audit` | 基础设施优先的安全审计。 |
| `/apex-forge-retro` | 复盘。提取教训、模式、改进点。 |

### 计划审查（4）

| 命令 | 说明 |
|------|------|
| `/apex-forge-ceo-review` | CEO/创始人视角审查。 |
| `/apex-forge-eng-review` | 工程架构审查。 |
| `/apex-forge-plan-design-review` | 设计视角审查 + 维度评分。 |
| `/apex-forge-autoplan` | 自动跑 CEO、工程、设计三轮审查。 |

### 创意与设计（3）

| 命令 | 说明 |
|------|------|
| `/apex-forge-design-consultation` | 从零创建设计系统：美学方向、token、字体、配色、预览。 |
| `/apex-forge-design-shotgun` | 对同一需求生成 3 种视觉方案。 |
| `/apex-forge-office-hours` | 导学。结合代码库讲解概念。 |

### 运维与部署（5）

| 命令 | 说明 |
|------|------|
| `/apex-forge-canary` | 部署后金丝雀监控。截图、错误检测、性能回归检查。 |
| `/apex-forge-benchmark` | 性能基线追踪。测量、存储、比较、标记回归。 |
| `/apex-forge-land-and-deploy` | 合并 PR、等 CI、部署、金丝雀验证。 |
| `/apex-forge-setup-deploy` | 自动检测并配置部署平台。 |
| `/apex-forge-document-release` | 交付后文档同步。 |

### 安全防护（4）

| 命令 | 说明 |
|------|------|
| `/apex-forge-guard` | 目录冻结 + 危险命令警告。 |
| `/apex-forge-freeze` | 限制编辑到指定目录。边界外写入拒绝。 |
| `/apex-forge-unfreeze` | 解除冻结。 |
| `/apex-forge-careful` | 危险命令前强制确认。 |

### 浏览器（3）

| 命令 | 说明 |
|------|------|
| `/apex-forge-browse` | 浏览器交互：导航、阅读、操作、截图。 |
| `/apex-forge-connect-chrome` | 启动带远程调试的 Chrome。 |
| `/apex-forge-setup-browser-cookies` | 从真实浏览器导入 cookie。 |

### 知识管理（3）

| 命令 | 说明 |
|------|------|
| `/apex-forge-memory-curate` | 记忆策展：回顾、评分、修剪。 |
| `/apex-forge-compound-refresh` | 刷新过期的解决方案文档。 |
| `/apex-forge-skill-author` | 引导式 skill 创作。 |

### 编排（3）

| 命令 | 说明 |
|------|------|
| `/apex-forge-wave-planner` | 波次规划：系统映射、范围、风险。 |
| `/apex-forge-wave-challenger` | 波次计划的对抗性压力测试。 |
| `/apex-forge-wave-worker` | 波次内执行轮次。 |

### 外部集成（2）

| 命令 | 说明 |
|------|------|
| `/apex-forge-codex-consult` | 通过 Codex CLI 或独立子 agent 获取第二意见。 |
| `/apex-forge-mobile-test` | 移动端测试。 |

---

## CLI 参考

常用命令。完整列表见 `apex-forge help`。

```bash
# 项目
apex-forge init                              # 初始化 .apex/
apex-forge status                            # 管道状态、任务、记忆统计
apex-forge recover                           # 修复异常状态

# 任务
apex-forge task create TITLE [DESC] [DEPS]   # 创建任务
apex-forge task list [--status STATUS]        # 列出任务
apex-forge task next                         # 下一个可做的任务
apex-forge task assign|start|submit|verify|block|release ID

# 记忆
apex-forge memory add CONTENT SCORE TAGS     # 存储事实
apex-forge memory list [--min SCORE]         # 列出事实
apex-forge memory search QUERY               # 关键词搜索
apex-forge memory curate                     # 自动提取知识
apex-forge memory prune                      # 清理低质量条目

# 浏览器
apex-forge-browse goto URL                   # 导航
apex-forge-browse snapshot -i                # 列出可交互元素
apex-forge-browse click|fill|screenshot      # 交互
apex-forge-browse connect|disconnect         # 可见/无头模式切换

# 仪表盘
apex-forge dashboard [--port PORT]           # Web 界面

# 编排
apex-forge orchestrate [--dry-run] [--once]  # 多 agent 任务分派

# 其他
apex-forge telemetry report                  # skill 使用统计
apex-forge worktree create|list|cleanup      # git worktree 管理
apex-forge sandbox js|python|bash CODE       # 沙箱执行
apex-forge issues list|import|view           # GitHub issue 同步
apex-forge convert --platform PLATFORM       # 转换到 Cursor/Codex/Gemini/Windsurf/Factory
apex-forge consensus test-all                # 跑全部共识协议测试
```

> 完整 CLI 参考：[使用说明书](docs/USAGE-GUIDE.zh-CN.md)

---

## 核心概念

### 复杂度路由

不是每个任务都需要完整仪式：

| 级别 | 适用场景 | 流程 |
|------|---------|------|
| **Tier 1**（单次通过） | 简单修复 | 直接做、验证、完成 |
| **Tier 2**（轮次制） | 多步骤任务 | PDCA 轮次 + 命名类型，最多 5 轮 |
| **Tier 3**（波次制） | 跨会话项目 | 波次交付，持久状态存在 `.apex/state.json` |

AI 自动判断用哪个级别。可以在配置里用 `default_tier` 覆盖。

### 升级阶梯

失败越多，规则越严：

| 级别 | 触发 | 要求 |
|------|------|------|
| L0 | 正常 | 标准协议 |
| L1 | 第 2 次失败 | 换根本不同的方法 |
| L2 | 第 3 次失败 | 3 个可测试假设 |
| L3 | 第 4 次失败 | 7 点恢复检查清单 |
| L4 | 第 5 次失败 | 最小复现，交给人类 |

### 证据评级

| 级别 | 含义 | 最低要求 |
|------|------|---------|
| E0 | 猜测 | 只能作假设 |
| E1 | 间接证据 | 只能作假设 |
| E2 | 直接证据 | 可以行动 |
| E3 | 多源验证 | 可以声称完成 |
| E4 | 强验证 + 复现 | 最高可信度 |

### 验证门禁

声称"完成"前的 5 步：

1. 确定什么命令能**证明**这个声明
2. **现在**就跑（不是之前的结果）
3. 读**完整**输出
4. 输出确认了声明？**是或否**
5. 只有"是"才能声称完成

跳过任何一步 = 猜测，不是验证。

### TDD 铁律

没有失败测试不写生产代码。写测试、RED（确认正确原因失败）、GREEN、重构。14 条合理化借口预先封堵。

### 知识沉淀

每个解决的问题写入 `docs/solutions/`。重叠检测防止重复。过期文档自动刷新。时间越久，系统运行成本越低。

---

## 安装

前置条件：[Bun](https://bun.sh) 1.3+

### Claude Code（全局安装 -- 推荐）

```bash
git clone https://github.com/d-wwei/apex-forge.git ~/.claude/skills/apex-forge
cd ~/.claude/skills/apex-forge
bun install && bun run build:all
bunx playwright install chromium
```

协议通过 `hooks/session-start` 钩子在每个 session 自动激活。

### Claude Code（项目级安装）

```bash
git clone https://github.com/d-wwei/apex-forge.git .claude/skills/apex-forge
cd .claude/skills/apex-forge
bun install && bun run build:all
echo ".claude/skills/apex-forge" >> .gitignore
```

### Cursor

```bash
git clone https://github.com/d-wwei/apex-forge.git .cursor-plugin/apex-forge
cd .cursor-plugin/apex-forge && bun install && bun run build:all
```

### Codex / Factory

```bash
git clone https://github.com/d-wwei/apex-forge.git .agents/skills/apex-forge
cd .agents/skills/apex-forge && bun install && bun run build:all
```

### Gemini / Windsurf

```bash
git clone https://github.com/d-wwei/apex-forge.git apex-forge
cd apex-forge && bun install && bun run build:all
./dist/apex-forge convert --platform gemini   # 或 --platform windsurf
```

### 自动检测

```bash
./setup    # 检测已安装平台，创建 symlink，写入 .apex/config.yaml
```

---

## 配置

在项目根目录创建 `.apex/config.yaml`（`./setup` 或 `apex-forge init` 自动生成）：

```yaml
default_tier: auto          # auto | 1 | 2 | 3
proactive: true             # 自动建议下一阶段
compound_on_resolve: true   # 交付后自动触发知识沉淀
max_concurrent_agents: 3    # 并行子 agent 数量
autonomy: balanced          # high | balanced | controlled
solutions_dir: docs/solutions/
```

---

## 项目结构

```
apex-forge/
  src/                        TypeScript，编译为 3 个二进制
    cli.ts                    CLI 入口（apex-forge）
    commands/                 任务、记忆、状态、遥测、worktree 处理器
    browse/                   无头浏览器守护进程（apex-forge-browse）
    mcp/                      MCP 服务器 + 角色工具（apex-forge-mcp）
    consensus/                Raft、BFT、Gossip、CRDT 实现
    integrations/             GitHub issue 集成
    dashboard.ts              Web 仪表盘服务器
    orchestrator.ts           多 agent 任务分派器
    sandbox.ts                沙箱执行（JS/Python/Bash）
    converter.ts              跨平台配置导出
    tracing.ts                可观测性 span
    design.ts                 AI 设计生成

  workflow/                   43 个 skill 文件（Markdown + YAML frontmatter）
    stages/                   7 个阶段 skill
    roles/                    34 个角色 skill

  protocol/                   核心执行纪律
    SKILL.md                  自动注入的协议（14 节）
    round-based-execution.md  Tier 2 PDCA 轮次
    wave-based-delivery.md    Tier 3 波次交付

  orchestration/              多 agent 协调
    ARCHITECTURE.md           架构规范（10 节）
    PATTERNS.md               10 个可复用编排模式
    registry-seeds.yaml       115 个 agent 模板

  extension/                  Chrome 侧边栏扩展
    manifest.json             扩展清单
    sidepanel.html/js         侧边栏 UI
    background.js             Service Worker
    content.js/css            Content Script

  hooks/                      Session 和 git 钩子
    session-start             每次 session 自动注入协议
    state-helper              Bash 函数：状态、记忆、worktree、遥测
    task-helper               任务状态机操作

  platforms/                  平台适配清单
    cursor/                   Cursor 插件
    codex/                    Codex agent 配置
    factory/                  Factory droid 配置
```

---

## 来源

每个模式都可追溯到具体源项目。

| 能力 | 来源 | 许可证 |
|------|------|--------|
| 自动触发、TDD 铁律、验证门禁 | [superpowers](https://github.com/obra/superpowers) | MIT |
| 复杂度路由、升级阶梯、证据评级 | [better-work-skill](https://github.com/d-wwei/better-work-skill) | MIT |
| 阶段纪律、知识沉淀、多人格审查 | [compound-engineering](https://github.com/EveryInc/compound-engineering-plugin) | MIT |
| 角色技能、遥测、意图路由 | [gstack](https://github.com/garrytan/gstack) | MIT |
| 单权威编排器、工作区隔离 | [symphony](https://github.com/openai/symphony) | MIT |
| 任务状态机、角色执行、双阶段验收 | [chorus](https://github.com/Chorus-AIDLC/Chorus) | MIT |
| LLM 策划记忆、沙箱传播、子 agent 安全 | [deer-flow](https://github.com/bytedance/deer-flow) | Apache 2.0 |
| 账本模式、技能注册表、成本感知路由 | [ruflo](https://github.com/ruvnet/ruflo) | MIT |

完整归因：[docs/PROVENANCE.md](docs/PROVENANCE.md)

---

## 常见问题

**命令不出现？**
```bash
ls -la ~/.claude/skills/apex-forge          # 检查 symlink
ln -sf /path/to/apex-forge ~/.claude/skills/apex-forge  # 重新链接
```

**浏览器报错？**
```bash
cd ~/.claude/skills/apex-forge && bunx playwright install chromium
```

**仪表盘打不开？**
```bash
apex-forge dashboard --port 3456 && open http://localhost:3456
```

**状态异常？**
```bash
apex-forge recover                          # 自动修复
```

---

## 统计

| 指标 | 数量 |
|------|------|
| 源文件（不含依赖） | 128 |
| 代码行数 | ~28,000 |
| 自动化测试 | 55 |
| Skill 文件 | 43 |
| Agent 模板 | 115 |
| 浏览器命令 | 59 |
| 共识协议 | 4 |

---

## 许可证

MIT -- 见 [LICENSE](LICENSE)。

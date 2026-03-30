# Apex Forge 使用说明书

## 安装确认

安装完成后，在任意项目里打开 Claude Code，输入：

```
/apex-forge
```

如果看到协议加载成功的提示，说明安装正确。

---

## 第一步：初始化项目

> 两种方式任选其一。效果一样。

**跟 AI 说：**
```
帮我初始化 apex forge
```

**或者手动跑：**
```bash
apex-forge init
```

初始化完成后你的项目里会多一个 `.apex/` 目录：
```
.apex/
  state.json      — 当前阶段和会话状态
  tasks.json      — 任务列表和状态机
  memory.json     — 记忆库（跨会话持久化）
  analytics/      — 使用数据
  screenshots/    — 浏览器截图
  ...
```

> 已经在 `.gitignore` 中了，不会提交到代码仓库。

---

## 日常使用

每个场景都给出两种用法：自然语言 + 对应的命令。你可以混着用。

### 场景 1：从零开始做一个功能

**跟 AI 说：** `"我想加一个用户认证功能，用 JWT"`

**或者按阶段手动推进：**

```bash
# 1. 需求探索（硬门禁：这个阶段不会写任何代码）
/apex-forge-brainstorm
# → 产出：docs/brainstorms/auth-requirements.md

# 2. 实现计划（文件路径、函数签名、测试场景、依赖）
/apex-forge-plan
# → 产出：docs/plans/auth-plan.md

# 3. TDD 执行（先写测试再写代码，复杂任务自动拆分给子 agent）
/apex-forge-execute

# 4. 质量审查（18 个视角：安全、正确性、Rails/React/Python 等框架特定）
/apex-forge-review

# 5. 发布（跑测试 → 版本号 → CHANGELOG → 提交 → PR）
/apex-forge-ship

# 6. 知识沉淀（写到 docs/solutions/，下次可以复用）
/apex-forge-compound
```

**你不需要记住顺序。** 每个阶段完成后，AI 会自动建议下一步。直接说也行：

| 你说 | 触发的阶段 | 对应命令 |
|------|----------|---------|
| "帮我梳理一下需求" | 需求探索 | `/apex-forge-brainstorm` |
| "出个实现计划" | 计划 | `/apex-forge-plan` |
| "开始写代码" | 执行 | `/apex-forge-execute` |
| "帮我 review 一下" | 审查 | `/apex-forge-review` |
| "可以发布了" | 发布 | `/apex-forge-ship` |
| "存一下这次学到的东西" | 知识沉淀 | `/apex-forge-compound` |

---

### 场景 2：修 Bug

**跟 AI 说：** `"登录接口返回 401，但 token 是有效的"`

**或者：** `/apex-forge-investigate`

AI 的调查流程：
1. 复现问题
2. 在代码边界加日志，定位问题出在哪
3. 提出 3 个假设，逐个验证
4. 确认根因后才修复
5. 写回归测试

铁律：**没有根因不修 bug。**

---

### 场景 3：代码审查

**跟 AI 说：** `"帮我 review 一下这次改动"`

**或者：** `/apex-forge-code-review`

AI 读取 `git diff`，从 18 个视角检查。如果改了 `.tsx` 文件会启动 React Reviewer，改了 `.py` 文件会启动 Python Reviewer。

结论三选一：`SHIP` / `SHIP_WITH_FIXES` / `BLOCK`

---

### 场景 4：QA 测试

**跟 AI 说：** `"帮我测一下这个页面"`

**或者：** `/apex-forge-qa`

三个深度：Quick（关键问题）、Standard（+中等）、Exhaustive（全覆盖）。有浏览器就自动打开页面截图、交互、验证。

---

### 场景 5：安全审计

**跟 AI 说：** `"帮我做一次安全检查"`

**或者：** `/apex-forge-security-audit`

按顺序检查：密钥泄露 → 依赖漏洞 → CI/CD 安全 → OWASP Top 10 → 认证授权。

---

### 更多场景速查

| 你说 | 对应命令 | AI 做什么 |
|------|---------|----------|
| "这个计划够不够大胆？" | `/apex-forge-ceo-review` | CEO 视角审查 scope |
| "架构对不对？" | `/apex-forge-eng-review` | 工程审查（数据/API/性能/部署） |
| "设计好看吗？" | `/apex-forge-design-review` | 视觉 QA + 截图对比 |
| "回顾一下这周" | `/apex-forge-retro` | git 统计 + 团队分析 |
| "打开仪表盘" | `apex-forge dashboard` | Web 看板 + 活动流 + 数据分析 |
| "安全地跑一下这段代码" | `apex-forge sandbox js "..."` | Docker 沙箱执行 |
| "导入 GitHub issues" | `apex-forge issues import` | 导入为 apex 任务 |
| "帮我创建一个新 skill" | `/apex-forge-skill-author` | 引导式 skill 创作 |
| "三种设计方案看看" | `/apex-forge-design-shotgun` | 3 种视觉方向探索 |
| "全面审查一下计划" | `/apex-forge-autoplan` | 自动跑 CEO + 工程 + 设计三轮 |

---

## 任务管理

> 在 AI 对话中说 "创建一个任务：实现用户认证"，或者用 CLI：

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
apex-forge task assign T1                   # open → assigned
apex-forge task start T1                    # assigned → in_progress
apex-forge task submit T1 "测试全通过"       # in_progress → to_verify
apex-forge task verify T1 pass              # to_verify → done ✓
apex-forge task verify T1 fail              # to_verify → in_progress（重做）
apex-forge task block T1 "等待 API key"     # → blocked
apex-forge task release T1                  # assigned → open（放弃认领）
```

---

## 记忆系统

> 说 "记住：认证用的是 JWT RS256"，或者用 CLI：

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

# 在会话中策展（AI 自己回顾本次会话，不需要 API key）
/apex-forge-memory-curate
```

---

## 浏览器

> 说 "打开 https://my-app.com 看看"，或者用 CLI：

```bash
# 导航
apex-forge-browse goto https://your-app.com
apex-forge-browse text                      # 读页面文字
apex-forge-browse links                     # 所有链接

# 交互（先 snapshot 看有什么，再用 @e 引用号操作）
apex-forge-browse snapshot -i               # 列出所有可交互元素 → @e1, @e2, ...
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

# 管理
apex-forge-browse status                    # 守护进程状态
apex-forge-browse stop                      # 关闭
```

---

## 仪表盘

> 说 "打开仪表盘"，或者：

```bash
apex-forge dashboard                        # 默认 3456 端口
apex-forge dashboard --port 8080            # 自定义端口
```

浏览器自动打开，5 个面板：
- **任务看板** — 5 列拖拽式（Open → Assigned → In Progress → To Verify → Done）
- **管道状态** — 当前在哪个阶段 + 各阶段产出物
- **活动流** — 实时技能执行记录
- **记忆面板** — 按置信度排序的事实列表
- **数据分析** — 技能使用次数、平均耗时、成功率

---

## 编排器（多 agent 并行）

> 说 "把这些任务分给多个 agent 并行做"，或者：

```bash
# 先创建一批任务
apex-forge task create "实现登录页" "React + Tailwind"
apex-forge task create "写 API 接口" "Express + JWT"
apex-forge task create "写测试" "Jest 集成测试" T1 T2

# 预览分派计划（不真正执行）
apex-forge orchestrate --dry-run

# 执行（需要 claude CLI 在 PATH 里）
apex-forge orchestrate --once               # 跑一轮
apex-forge orchestrate                      # 持续运行直到全部完成
```

---

## 状态和恢复

```bash
apex-forge status                           # 查看全局状态
apex-forge status --json                    # JSON 格式（给脚本用）
apex-forge recover                          # 修复异常（清理僵尸进程、释放卡住任务）
```

---

## 其他工具

```bash
# 沙箱（隔离执行代码，有 Docker 用 Docker）
apex-forge sandbox javascript "console.log('hello')"
apex-forge sandbox python "print('hello')"

# GitHub Issues
apex-forge issues list                      # 列出 open issues
apex-forge issues import --label bug        # 导入为任务

# 跨平台转换
apex-forge convert --platform cursor        # Cursor
apex-forge convert --platform codex         # Codex
apex-forge convert --platform antigravity   # Antigravity
apex-forge convert --platform opencode      # OpenCode
apex-forge convert --platform gemini        # Gemini CLI
apex-forge convert --platform windsurf      # Windsurf
apex-forge convert --platform factory       # Factory Droid

# 共识协议（测试/演示）
apex-forge consensus test-all               # Raft + BFT + Gossip + CRDT

# 数据分析
apex-forge telemetry report                 # 技能使用统计

# 追踪
apex-forge trace list                       # 查看 trace 历史
```

---

## 完整 Skill 命令清单（43 个）

在 Claude Code / Cursor / Codex / Antigravity / OpenCode 中输入：

### 核心协议（3）
| 命令 | 作用 |
|------|------|
| `/apex-forge` | 核心执行协议（自动注入，通常不需手动调用） |
| `/apex-forge-round` | PDCA 轮次执行（Tier 2） |
| `/apex-forge-wave` | 波次交付（Tier 3 跨会话） |

### 工作流阶段（7）
| 命令 | 作用 | 上游检查 |
|------|------|----------|
| `/apex-forge-brainstorm` | 需求探索（硬门禁：不写代码） | 无 |
| `/apex-forge-plan` | 实现计划 | brainstorm 产出 |
| `/apex-forge-execute` | TDD 执行 + 子 agent 分派 | plan 产出 |
| `/apex-forge-review` | 18 人格质量审查 | git diff |
| `/apex-forge-ship` | 测试 + 版本 + 提交 + PR | review 状态 |
| `/apex-forge-compound` | 知识沉淀 | 已发布变更 |
| `/apex-forge-verify` | 验证门禁（独立可用） | 无 |

### 质量和审查（6）
| 命令 | 作用 |
|------|------|
| `/apex-forge-qa` | QA 测试 + bug 修复循环 |
| `/apex-forge-investigate` | 根因调查 |
| `/apex-forge-code-review` | Diff 审查 |
| `/apex-forge-design-review` | 视觉 QA |
| `/apex-forge-security-audit` | 安全审计 |
| `/apex-forge-retro` | 工程回顾 |

### 计划审查（4）
| 命令 | 作用 |
|------|------|
| `/apex-forge-ceo-review` | CEO 视角 |
| `/apex-forge-eng-review` | 工程视角 |
| `/apex-forge-plan-design-review` | 设计视角 |
| `/apex-forge-autoplan` | 自动三轮审查 |

### 创意和设计（3）
| 命令 | 作用 |
|------|------|
| `/apex-forge-office-hours` | 想法探索 |
| `/apex-forge-design-consultation` | 设计系统创建 |
| `/apex-forge-design-shotgun` | 3 种方向探索 |

### 运维和部署（5）
| 命令 | 作用 |
|------|------|
| `/apex-forge-canary` | 部署后监控 |
| `/apex-forge-benchmark` | 性能基线 |
| `/apex-forge-land-and-deploy` | 合并 + 部署 + 验证 |
| `/apex-forge-setup-deploy` | 配置部署平台 |
| `/apex-forge-document-release` | 发布后文档同步 |

### 安全（4）
| 命令 | 作用 |
|------|------|
| `/apex-forge-guard` | 全安全模式 |
| `/apex-forge-freeze` | 限制编辑范围 |
| `/apex-forge-unfreeze` | 解除限制 |
| `/apex-forge-careful` | 危险命令警告 |

### 浏览器（3）
| 命令 | 作用 |
|------|------|
| `/apex-forge-browse` | 无头浏览器 |
| `/apex-forge-connect-chrome` | 可见 Chrome + 侧边栏 |
| `/apex-forge-setup-browser-cookies` | 导入 cookies |

### 知识管理（3）
| 命令 | 作用 |
|------|------|
| `/apex-forge-memory-curate` | 记忆策展 |
| `/apex-forge-compound-refresh` | 刷新过时文档 |
| `/apex-forge-skill-author` | 创建新 skill |

### 编排（3）
| 命令 | 作用 |
|------|------|
| `/apex-forge-wave-planner` | 波次规划 |
| `/apex-forge-wave-challenger` | 波次压力测试 |
| `/apex-forge-wave-worker` | 波次执行 |

### 外部集成（2）
| 命令 | 作用 |
|------|------|
| `/apex-forge-codex-consult` | Codex 第二意见 |
| `/apex-forge-mobile-test` | 移动端测试 |

---

## 核心概念

### 复杂度路由

AI 自动判断任务用哪个级别：

| 级别 | 适用场景 | 流程 |
|------|----------|------|
| **Tier 1** | 简单修复 | 直接做 → 验证 → 完成 |
| **Tier 2** | 多步骤任务 | PDCA 轮次（最多 5 轮） |
| **Tier 3** | 跨会话项目 | 波次交付（每波 3-5 轮） |

### 升级阶梯

失败越多，规则越严：

| 级别 | 触发 | 要求 |
|------|------|------|
| L0 | 正常 | 标准协议 |
| L1 | 第 2 次失败 | 换根本不同的方法 |
| L2 | 第 3 次失败 | 3 个不同假设 |
| L3 | 第 4 次失败 | 7 点恢复检查清单 |
| L4 | 第 5 次失败 | 最小复现 + 交给人类 |

### 证据分级

| 级别 | 含义 | 最低要求 |
|------|------|----------|
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

跳过任何一步 = 撒谎，不是验证。

---

## 配置

`.apex/config.yaml`（`apex-forge init` 自动创建，或手动编辑）：

```yaml
default_tier: auto           # auto | 1 | 2 | 3
proactive: true              # 自动建议下一阶段
compound_on_resolve: true    # 解决问题后自动沉淀知识
max_concurrent_agents: 3     # 编排器最大并发数
agent_command: claude         # agent CLI 命令
```

---

## 常见问题

**Q: 命令不出现？**
```bash
ls -la ~/.claude/skills/apex-forge          # 检查 symlink
ln -sf /path/to/apex-forge ~/.claude/skills/apex-forge  # 重新链接
```

**Q: 浏览器报错？**
```bash
cd ~/.claude/skills/apex-forge && bunx playwright install chromium
```

**Q: 仪表盘打不开？**
```bash
apex-forge dashboard --port 3456            # 手动启动
open http://localhost:3456                   # 手动打开
```

**Q: 状态异常？**
```bash
apex-forge recover                          # 自动修复
```

**Q: 查看所有 CLI 命令？**
```bash
apex-forge help
```

**Q: 卸载？**
```bash
rm ~/.claude/skills/apex-forge              # 删 symlink
rm -rf .apex/                               # 删项目状态（可选）
```

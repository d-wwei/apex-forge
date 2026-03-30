# Apex Forge 使用说明书

## 安装确认

安装完成后，在任意项目里打开 Claude Code，输入：

```
/apex-forge
```

如果看到协议加载成功的提示，说明安装正确。

---

## 第一步：初始化项目

在你的项目里打开 Claude Code，直接说：

```
帮我初始化 apex forge
```

AI 会自动执行初始化，创建 `.apex/` 目录、安装 git hook、设置状态文件。你不需要记任何命令。

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

### 场景 1：从零开始做一个功能

打开 Claude Code，直接说你想做什么：

```
"我想加一个用户认证功能，用 JWT"
```

AI 会自动引导你走完整个流程：

1. **需求探索** — AI 问你几个关键问题，梳理清楚需求再动手。这个阶段不会写任何代码。
2. **实现计划** — AI 列出要改哪些文件、写哪些测试、依赖什么。
3. **TDD 执行** — 先写测试，再写实现。复杂任务自动拆给多个子 agent 并行。
4. **质量审查** — 18 个视角自动检查（安全、正确性、框架特定问题等）。
5. **发布** — 跑测试 → 版本号 → 提交 → PR。
6. **知识沉淀** — 把这次学到的东西写进 `docs/solutions/`，下次可以复用。

**你不需要记任何命令。** AI 自动判断该进入哪个阶段，每个阶段完成后自动建议下一步。

如果你想直接跳到某个阶段，也可以说：
- "帮我梳理一下需求" → 需求探索
- "出个实现计划" → 计划阶段
- "开始写代码" → 执行阶段
- "帮我 review 一下" → 审查阶段
- "可以发布了" → 发布阶段

### 场景 2：修 Bug

直接描述问题：

```
"登录接口返回 401，但 token 是有效的"
```

AI 会按调查流程走，不会上来就猜着改：
1. 复现问题
2. 在代码边界加日志，定位到底哪里出了问题
3. 提出 3 个假设，逐个验证
4. 确认根因后才修复
5. 写回归测试

铁律：**没有根因不修 bug。**

### 场景 3：代码审查

```
"帮我 review 一下这次改动"
```

AI 读取 `git diff`，从 18 个视角检查：安全（注入、XSS）、正确性（边界条件）、性能（N+1）、测试覆盖。如果是 React 代码还会检查 hooks 用法，Python 代码会检查 shell 注入。

结论三选一：直接发 / 改完再发 / 打回重做。

### 场景 4：QA 测试

```
"帮我测一下这个页面"
```

AI 自动选择测试深度（Quick/Standard/Exhaustive），有浏览器就打开页面截图、点击、验证状态。

### 场景 5：安全审计

```
"帮我做一次安全检查"
```

按顺序检查：密钥泄露 → 依赖漏洞 → CI/CD 安全 → OWASP Top 10 → 认证授权。

### 更多场景

| 你说 | AI 做什么 |
|------|----------|
| "帮我看看这个计划够不够大胆" | CEO 视角审查 scope |
| "架构对不对？" | 工程审查（数据模型、API、性能、部署） |
| "这个设计好看吗？" | 视觉 QA + 截图对比 |
| "回顾一下这周做了什么" | git 统计 + 团队分析 |
| "打开仪表盘" | Web 看板 + 活动流 + 数据分析 |
| "存一下这次学到的东西" | 记忆策展（不需要 API key） |
| "这段代码安全地跑一下" | Docker 沙箱执行 |
| "把 GitHub issues 导进来" | 导入为 apex 任务 |

---

## CLI 命令（进阶，可选）

> 日常使用不需要记 CLI 命令 — 直接跟 AI 说话就行。
> CLI 适合：脚本自动化、CI 集成、或者你就是喜欢敲命令。

加个别名方便使用：
```bash
echo 'alias af="~/.claude/skills/apex-forge/dist/apex-forge"' >> ~/.zshrc
source ~/.zshrc
```

### 任务管理

```bash
# 创建任务
af task create "实现用户认证" "JWT 中间件 + 刷新令牌"

# 创建有依赖的任务
af task create "写认证测试" "集成测试" T1

# 查看所有任务
af task list

# 任务状态流转（有强制检查，不允许跳步）
af task assign T1          # open → assigned
af task start T1           # assigned → in_progress
af task submit T1 "测试通过" # in_progress → to_verify
af task verify T1 pass      # to_verify → done

# 如果验证失败
af task verify T1 fail      # to_verify → in_progress（重做）

# 如果被阻塞
af task block T1 "等待 API key"  # → blocked

# 查看下一个可做的任务（自动跳过有未完成依赖的）
af task next
```

### 记忆系统

```bash
# 添加事实（0.0-1.0 置信度 + 标签）
af memory add "认证用 JWT RS256" 0.9 auth jwt
af memory add "数据库是 PostgreSQL 16" 0.85 db

# 查看记忆
af memory list
af memory list --min 0.8    # 只看高置信度

# 搜索
af memory search "JWT"

# 自动策展（从 git 历史和完成任务中提取知识）
af memory curate

# 清理低质量记忆
af memory prune
```

**在 Claude Code 会话中策展（不需要 API key）：**

```
/apex-forge-memory-curate
```

AI 会回顾本次会话学到的东西，直接写入记忆系统。

### 浏览器

```bash
# 导航
af-browse goto https://your-app.com
af-browse text                    # 读取页面文字
af-browse screenshot /tmp/s.png   # 截图

# 交互（用 @e 引用号）
af-browse snapshot -i             # 显示所有可交互元素
af-browse click @e3               # 点击第 3 个元素
af-browse fill @e5 "test@test.com" # 填写表单

# 检查
af-browse console --errors        # JS 错误
af-browse is visible ".modal"     # 元素是否可见

# 响应式测试
af-browse responsive /tmp/layout  # 自动截图 mobile/tablet/desktop

# 管理
af-browse status                  # 守护进程状态
af-browse stop                    # 关闭浏览器
```

别名建议：
```bash
echo 'alias af-browse="~/.claude/skills/apex-forge/dist/apex-forge-browse"' >> ~/.zshrc
```

### 仪表盘

```bash
af dashboard                      # 打开 Web 仪表盘（默认 3456 端口）
af dashboard --port 8080          # 自定义端口
```

浏览器会自动打开，显示：
- 任务看板（5 列：Open → Assigned → In Progress → To Verify → Done）
- 管道状态（当前在哪个阶段）
- 活动流（技能执行记录）
- 记忆面板（按置信度排序）
- 数据分析（技能使用次数、耗时、成功率）

### 状态和恢复

```bash
af status                # 查看当前状态（阶段、任务、记忆）
af status --json         # JSON 格式（给其他工具用）
af recover               # 修复异常状态（清理僵尸进程、释放卡住的任务）
```

### 编排器（多 agent 分派）

```bash
# 先创建一批任务
af task create "实现登录页" "React + Tailwind"
af task create "写 API 接口" "Express + JWT"
af task create "写测试" "Jest 集成测试" T1 T2

# 干跑（看看会怎么分派，不真正执行）
af orchestrate --dry-run

# 真正运行（需要 claude CLI 在 PATH 里）
af orchestrate --once    # 跑一轮就停
af orchestrate           # 持续运行直到所有任务完成
```

### 共识协议（测试）

```bash
af consensus test-all    # 跑 Raft + BFT + Gossip + CRDT 全部测试
af consensus test        # 只跑 Raft
af consensus test-bft    # 只跑 BFT
```

### 沙箱

```bash
# 在隔离环境执行代码（有 Docker 用 Docker，没有用 subprocess）
af sandbox javascript "console.log('hello')"
af sandbox python "print('hello')"
af sandbox bash "echo hello"
```

### GitHub Issues 同步

```bash
af issues list                   # 列出仓库的 open issues
af issues import --label apex    # 把带 apex 标签的 issue 导入为任务
```

### 跨平台转换

```bash
af convert --platform cursor     # 转换为 Cursor 格式
af convert --platform codex      # 转换为 Codex 格式
af convert --platform factory    # 转换为 Factory Droid 格式
af convert --platform gemini     # 转换为 Gemini CLI 格式
```

### 数据分析

```bash
af telemetry report              # 查看技能使用统计
af telemetry sync                # 同步到远程（需配置）
```

### 追踪

```bash
af trace list                    # 查看最近的 trace
af trace view TRACE_ID           # 查看某次 trace 的所有 span
```

---

## 完整 Skill 命令清单

在 Claude Code 中输入这些命令：

### 核心协议
| 命令 | 作用 |
|------|------|
| `/apex-forge` | 加载核心执行协议（自动注入，一般不需要手动调用） |
| `/apex-forge-round` | PDCA 轮次执行（Tier 2 任务） |
| `/apex-forge-wave` | 波次交付（Tier 3 跨会话项目） |

### 工作流阶段（按顺序）
| 命令 | 作用 | 上游检查 |
|------|------|----------|
| `/apex-forge-brainstorm` | 需求探索（硬门禁：不写代码） | 无 |
| `/apex-forge-plan` | 实现计划 | 检查 brainstorm 产出 |
| `/apex-forge-execute` | TDD 执行 + 子 agent 分派 | 检查 plan 产出 |
| `/apex-forge-review` | 18 人格质量审查 | 检查 git diff |
| `/apex-forge-ship` | 测试 + 版本 + 提交 + PR | 检查 review 状态 |
| `/apex-forge-compound` | 知识沉淀 | 检查已发布的变更 |
| `/apex-forge-verify` | 验证门禁（独立可用） | 无 |

### 质量和审查
| 命令 | 作用 |
|------|------|
| `/apex-forge-qa` | 系统化 QA 测试 + bug 修复 |
| `/apex-forge-investigate` | 根因调查（铁律：不猜不修） |
| `/apex-forge-code-review` | Diff 审查（安全/正确性/性能） |
| `/apex-forge-design-review` | 视觉 QA（截图驱动的修复循环） |
| `/apex-forge-security-audit` | 安全审计（OWASP + 密钥扫描） |
| `/apex-forge-retro` | 工程回顾（git 统计 + 团队分析） |

### 计划审查
| 命令 | 作用 |
|------|------|
| `/apex-forge-ceo-review` | CEO 视角：scope 够不够大？ |
| `/apex-forge-eng-review` | 工程视角：架构对不对？ |
| `/apex-forge-plan-design-review` | 设计视角：体验好不好？ |
| `/apex-forge-autoplan` | 自动跑 CEO + 工程 + 设计三轮审查 |

### 创意和设计
| 命令 | 作用 |
|------|------|
| `/apex-forge-office-hours` | 想法探索 + 需求分析 |
| `/apex-forge-design-consultation` | 设计系统创建（字体/颜色/间距） |
| `/apex-forge-design-shotgun` | 3 种设计方向探索 |

### 运维和部署
| 命令 | 作用 |
|------|------|
| `/apex-forge-canary` | 部署后金丝雀监控 |
| `/apex-forge-benchmark` | 性能基线追踪 |
| `/apex-forge-land-and-deploy` | 合并 PR + 部署 + 健康检查 |
| `/apex-forge-setup-deploy` | 配置部署平台 |
| `/apex-forge-document-release` | 发布后文档同步 |

### 安全
| 命令 | 作用 |
|------|------|
| `/apex-forge-guard` | 全安全模式（限制目录 + 危险命令警告） |
| `/apex-forge-freeze` | 限制编辑到指定目录 |
| `/apex-forge-unfreeze` | 解除目录限制 |
| `/apex-forge-careful` | 危险命令警告 |

### 浏览器
| 命令 | 作用 |
|------|------|
| `/apex-forge-browse` | 无头浏览器交互 |
| `/apex-forge-connect-chrome` | 启动可见 Chrome + 侧边栏 |
| `/apex-forge-setup-browser-cookies` | 导入真实浏览器 cookies |

### 知识管理
| 命令 | 作用 |
|------|------|
| `/apex-forge-memory-curate` | AI 策展记忆（不需要 API key） |
| `/apex-forge-compound-refresh` | 刷新过时的解决方案文档 |
| `/apex-forge-skill-author` | 创建新的 skill |

### 编排
| 命令 | 作用 |
|------|------|
| `/apex-forge-wave-planner` | 波次计划（系统映射 + 范围） |
| `/apex-forge-wave-challenger` | 波次挑战（压力测试计划） |
| `/apex-forge-wave-worker` | 波次执行（轮次 + 假设追踪） |

### 外部集成
| 命令 | 作用 |
|------|------|
| `/apex-forge-codex-consult` | Codex 第二意见 |
| `/apex-forge-mobile-test` | 移动端测试（iOS/Android） |

---

## 核心概念

### 复杂度路由

不是每个任务都需要完整流程：

| 级别 | 适用场景 | 流程 |
|------|----------|------|
| **Tier 1** | 简单修复，一步搞定 | 直接做 → 验证 → 完成 |
| **Tier 2** | 多步骤任务 | PDCA 轮次（最多 5 轮） |
| **Tier 3** | 跨会话项目 | 波次交付（每波 3-5 轮） |

AI 自动判断用哪个级别。

### 升级阶梯

失败次数越多，规则越严格：

| 级别 | 触发 | 要求 |
|------|------|------|
| L0 | 正常 | 标准协议 |
| L1 | 第 2 次失败 | 必须换一个根本不同的方法 |
| L2 | 第 3 次失败 | 必须提出 3 个不同假设 |
| L3 | 第 4 次失败 | 7 点恢复检查清单 |
| L4 | 第 5 次失败 | 最小复现 + 交给人类 |

### 证据分级

| 级别 | 含义 | 最低要求 |
|------|------|----------|
| E0 | 猜测 | 只能作为假设 |
| E1 | 间接证据 | 只能作为假设 |
| E2 | 直接证据 | 可以作为行动依据 |
| E3 | 多源验证 | 可以声称"完成" |
| E4 | 强验证 + 复现 | 最高可信度 |

### 验证门禁

在声称"完成"之前，必须走 5 步：

1. 确定什么命令能证明这个声明
2. 现在就跑这个命令（不是之前的结果）
3. 读完整输出（不是第一行）
4. 输出是否确认了声明？是或否
5. 只有"是"才能声称完成

**跳过任何一步 = 撒谎，不是验证。**

---

## 配置

在项目根目录创建 `.apex/config.yaml`：

```yaml
# 复杂度路由
default_tier: auto           # auto | 1 | 2 | 3

# 工作流
proactive: true              # 自动建议下一个阶段
compound_on_resolve: true    # 解决问题后自动沉淀知识

# 编排
max_concurrent_agents: 3     # 最大并发 agent 数
agent_command: claude         # agent CLI 命令

# 部署（用 /apex-forge-setup-deploy 自动生成）
# deploy:
#   platform: vercel
#   url: https://your-app.com
#   health_check: /api/health
```

---

## 常见问题

### Q: 安装后 /apex-forge 命令不出现？

确认 symlink 存在：
```bash
ls -la ~/.claude/skills/apex-forge
```

如果不存在：
```bash
ln -sf /path/to/apex-forge ~/.claude/skills/apex-forge
```

### Q: 浏览器命令报错？

确认 Playwright 和 Chromium 已安装：
```bash
cd ~/.claude/skills/apex-forge
bunx playwright install chromium
```

### Q: 仪表盘打不开？

```bash
~/.claude/skills/apex-forge/dist/apex-forge dashboard --port 3456
```

手动打开 http://localhost:3456

### Q: 怎么查看所有命令？

```bash
~/.claude/skills/apex-forge/dist/apex-forge help
```

### Q: 状态异常怎么恢复？

```bash
~/.claude/skills/apex-forge/dist/apex-forge recover
```

### Q: 怎么卸载？

```bash
rm ~/.claude/skills/apex-forge
```

项目里的 `.apex/` 目录手动删除即可。

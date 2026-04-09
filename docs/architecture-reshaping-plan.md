# Apex Forge 架构重塑方案 v2

> 2026-04-09 | Status: Approved Design, Pending Execution
> v2: 结合评审反馈优化（binding 约束、版本管理、浏览器拆分、设计审查分层）

## 定位转变

**之前**：AF = 单体研发框架（协议 + 领域能力全部内置）

**之后**：AF = 研发协议编排器（协议 + pipeline + 硬绑定外部 skills）

AF 的核心价值是**执行纪律**（复杂度路由、阶段门控、TDD、证据分级、验证门），不是领域知识。领域能力由独立 skill 提供，AF 在 pipeline 的每个阶段硬性调用对应的 skill。

## 架构总览

```
┌─ Apex Forge 核心（apex-forge 仓库）──────────────────────────┐
│                                                               │
│  SKILL.md        核心协议（Tier 路由·阶段门控·TDD·证据·验证）  │
│  stages/         brainstorm · plan · execute · review         │
│                  ship · compound                              │
│  orchestration/  parallel · subagent-dev · cross-session      │
│  utils/          scope-lock · worktree · skill-author         │
│  gates/          design-baseline.md（设计基线检查，AF 自有）    │
│  bindings.yaml   阶段 → 外部 skill 结构化映射（版本约束）      │
│  install.sh      安装 AF + 自动安装所有依赖 skill              │
│                                                               │
└───────────────────────┬──────────────────────────────────────┘
                        │
                        │ 硬依赖（install.sh 自动安装，缺一不可）
                        │
     ┌──────────────────┼────────────────────────┐
     ▼                  ▼                        ▼
 新建 4 个仓库     已有 3 个仓库          AF 内置门控
 (含浏览器能力)    (不动)                (design-baseline)
```

## 依赖 Skill 清单

### 需要新建的 4 个独立仓库

| 仓库名 | 定位 | 来源 | 改写量 |
|--------|------|------|--------|
| `d-wwei/systematic-debugging` | 系统化调试 | AF `investigate.md` | 15-20% |
| `d-wwei/thorough-code-review` | 代码审查（发起 + 接收反馈） | AF `code-review.md` + `receiving-review.md` | 5-10% |
| `d-wwei/security-audit` | 安全审计 | AF `security-audit.md` | 0% |
| `d-wwei/browser-qa-testing` | QA 测试 + **内置浏览器自动化** | AF `qa.md` + `browse.md` + `src/browse/` | 50-60% |

### 已有的 3 个独立仓库（不动）

| 仓库名 | 定位 |
|--------|------|
| `d-wwei/tasteful-frontend` | 前端设计规范（深度设计知识） |
| `d-wwei/design-to-code-runner` | 设计稿还原代码 |
| `d-wwei/product-review` | 产品体验评审 |

---

## 拆分详细设计

### 1. systematic-debugging（系统化调试）

**来源**：`skill/roles/investigate.md` (177 行)

**AF 术语 → 通用语言：**
| AF 术语 | 替换为 |
|---------|--------|
| E0-E4 证据分级 | guess / indirect / direct / confirmed / proven |
| L0-L4 升级阶梯 | retry → different approach → 3 hypotheses → checklist → escalate to human |
| DONE/BLOCKED | RESOLVED / UNRESOLVED / NEEDS_HELP |

**保留不变**：Iron Law（不找到根因不修复）、4 阶段流程（Reproduce → Analyze → Hypothesize → Implement）、3-Strike Rule

**输出契约**（供 AF bindings 映射）：
```yaml
output:
  status: enum [RESOLVED, UNRESOLVED, NEEDS_HELP]
  evidence_level: enum [guess, indirect, direct, confirmed, proven]
  root_cause: string
  fix_description: string
```

### 2. thorough-code-review（代码审查）

**来源**：`skill/roles/code-review.md` (142 行) + `skill/roles/receiving-review.md` (161 行)

**合并为两个模式：**
- `/thorough-code-review outgoing` — 发起审查（7 类检查清单、P0-P3 严重度）
- `/thorough-code-review incoming` — 接收反馈（READ → VERIFY → CLASSIFY → ACT）

**AF 术语 → 通用语言：**
| AF 术语 | 替换为 |
|---------|--------|
| SHIP / SHIP_WITH_FIXES / BLOCK | APPROVED / APPROVED_WITH_FIXES / REJECTED |

**保留不变**：7 类检查清单、P0-P3（业界标准）、OWASP 引用、反馈评估流程、Forbidden Responses

**输出契约**：
```yaml
output:
  verdict: enum [APPROVED, APPROVED_WITH_FIXES, REJECTED]
  issues: list
    - severity: enum [P0, P1, P2, P3]
      category: string
      description: string
      autofix: bool
```

### 3. security-audit（安全审计）

**来源**：`skill/roles/security-audit.md` (144 行)

**改写量：0%** — 已经完全是通用语言，CWE 标签是业界标准，直接提取。

**输出契约**：
```yaml
output:
  verdict: enum [PASS, FAIL, CONDITIONAL_PASS]
  findings: list
    - severity: enum [CRITICAL, HIGH, MEDIUM, LOW]
      cwe: string
      description: string
      remediation: string
```

### 4. browser-qa-testing（QA + 内置浏览器自动化）

**来源**：`skill/roles/qa.md` (375 行) + `skill/roles/browse.md` (165 行) + `src/browse/`（全部浏览器源码）

**关键变化**：浏览器自动化能力从 AF 仓库完整迁入，使 browser-qa-testing 成为真正自包含的独立 skill。

**仓库结构：**
```
browser-qa-testing/
├── SKILL.md              # QA 测试协议（Quick/Standard/Exhaustive 三级）
├── browse.md             # 浏览器命令参考文档
├── src/browse/           # 从 AF 迁入的完整浏览器源码
│   ├── cli.ts            # 浏览器 CLI 入口
│   ├── browser-manager.ts # Playwright 浏览器管理
│   ├── commands.ts       # 浏览器命令实现
│   ├── server.ts         # WebSocket 服务
│   ├── cookie-*.ts       # Cookie 导入管理
│   ├── snapshot.ts       # 页面快照
│   └── sidebar-agent.ts  # Sidebar 交互
├── dist/
│   └── browse            # 编译产物（独立二进制）
├── package.json          # playwright 等依赖
└── install.sh            # 编译二进制 + 安装到 PATH
```

**AF 侧变化**：
- **删除** `src/browse/` 全部浏览器源码
- **删除** `dist/apex-forge-browse` 二进制
- AF 的 `install.sh` 安装 `browser-qa-testing` 时，由其自身的 `install.sh` 负责编译和二进制安装
- AF MCP server 中 browse tools 改为调用 `browser-qa-testing` 提供的二进制

**AF 术语 → 通用语言：**
| AF 术语 | 替换为 |
|---------|--------|
| `apex-forge-browse` / `$B` | `browse`（skill 自有二进制） |
| AF Tier 术语 | 保留 Quick/Standard/Exhaustive 分级但不引用 AF Tier 概念 |
| AF artifact 命名 | 通用文件命名 |

**保留不变**：6 阶段测试流模板、命令派发模式、健康分计算、响应式测试

**输出契约**：
```yaml
output:
  health_score: number  # 0-100
  tier: enum [Quick, Standard, Exhaustive]
  test_results: list
    - category: string
      status: enum [PASS, FAIL, SKIP]
      evidence: string  # screenshot path or description
```

---

## 设计审查：两层分离架构

### 问题

如果 tasteful-frontend 既指导设计又做审查，等于自己出题自己判卷。

### 解决方案：AF 内置基线检查 + tasteful-frontend 深度审查

```
设计审查触发（前端文件变更）
       │
       ▼
 ┌─ 第一层：AF 内置基线检查（design-baseline.md）──────────────┐
 │  客观、可量化、业界公认、不依赖任何外部 skill               │
 │  不通过 → 直接 REJECTED，不进第二层                         │
 └──────────────────────┬──────────────────────────────────────┘
                        │ 全部通过
                        ▼
 ┌─ 第二层：加载 /tasteful-frontend 深度审查 ──────────────────┐
 │  主观、有态度、特定设计体系的偏好                            │
 │  不通过 → APPROVED_WITH_FIXES                               │
 └─────────────────────────────────────────────────────────────┘
```

### 第一层：design-baseline.md（AF 内置，不可跳过）

位置：`skill/gates/design-baseline.md`

这些是**客观事实**，不是设计观点。任何设计体系都适用：

| 维度 | 检查项 | 判定标准 | 依据 |
|------|--------|---------|------|
| 无障碍 | 文字对比度 | WCAG AA ≥ 4.5:1（小字）/ ≥ 3:1（大字） | WCAG 2.1 SC 1.4.3 |
| 无障碍 | 可交互元素尺寸 | ≥ 44×44px（触摸）/ ≥ 24×24px（鼠标） | WCAG 2.5.8 |
| 无障碍 | 焦点指示器 | 键盘可达元素必须有可见 focus 样式 | WCAG 2.4.7 |
| 布局 | 内容溢出 | 无裁切、无意外水平滚动条（标准视口） | — |
| 布局 | 响应式断点 | 375 / 768 / 1440 三档不崩溃 | — |
| 可读性 | 正文字号 | ≥ 14px | — |
| 可读性 | 行高 | 1.4–1.8 之间 | WCAG 1.4.12 |
| 一致性 | 同类组件 | 同功能组件外观一致 | — |
| 层级 | 视觉层次 | 能分辨主次（标题 > 正文 > 辅助文字） | — |
| 完整性 | 空状态/错误态 | 列表、表单、加载有兜底展示 | — |

**判定规则**：
- 任一项不通过 → REJECTED（返回 Execute 修复）
- 全部通过 → 进入第二层

### 第二层：tasteful-frontend 深度审查

加载 `/tasteful-frontend`，按其设计体系标准检查：

- 间距是否遵循设计系统网格
- 字体搭配是否符合设计语言
- 颜色使用是否克制、有层次
- 动效是否有意义、时长合理
- 是否复用已有组件而非重造

**判定规则**：
- 存在 P0/P1 → APPROVED_WITH_FIXES（必须修复后才能 ship）
- 仅 P2/P3 → APPROVED_WITH_FIXES（建议修复，不阻塞）
- 全部通过 → APPROVED

### 裁判公正性保证

```
tasteful-frontend 指导设计了一个页面
       │
       ▼
第一层 design-baseline 检查（AF 自有标准）
  → 对比度 3.8:1 → 不通过，REJECTED
  → 此判定独立于 tasteful-frontend，不可覆盖
       │
       ▼（第一层通过后）
第二层 tasteful-frontend 深度检查
  → 间距不在 8px 网格上 → APPROVED_WITH_FIXES
  → 这里 tasteful-frontend 确实是自己判自己
  → 但基线安全已由第一层独立保证
```

---

## AF 核心改造

### 从 AF 删除的文件

| 当前路径 | 处理方式 |
|---------|---------|
| `skill/roles/investigate.md` | 删除，由 `/systematic-debugging` 替代 |
| `skill/roles/code-review.md` | 删除，由 `/thorough-code-review` 替代 |
| `skill/roles/receiving-review.md` | 删除，合并到 `/thorough-code-review` |
| `skill/roles/security-audit.md` | 删除，由 `/security-audit` 替代 |
| `skill/roles/qa.md` | 删除，由 `/browser-qa-testing` 替代 |
| `skill/roles/browse.md` | 删除，合并到 `/browser-qa-testing` |
| `skill/roles/design-review.md` | 删除，基线部分内化为 `gates/design-baseline.md`，深度部分由 `/tasteful-frontend` 承接 |
| `src/browse/` | **整体迁移**到 `browser-qa-testing` 仓库 |
| `dist/apex-forge-browse` | 删除，由 `browser-qa-testing` 自行编译分发 |

### AF 保留的文件

```
skill/
├── SKILL.md                          # 核心协议 + 命令路由 + CLI 参考
├── bindings.yaml                     # 新增：结构化阶段→skill 映射（含版本约束）
├── install.sh                        # 改造：安装 AF + 拉取依赖 skill + 编译浏览器
├── gates/
│   └── design-baseline.md            # 新增：设计基线检查（AF 自有，不依赖外部 skill）
├── stages/
│   ├── brainstorm.md                 # 需求探索（加 skill dispatch 段 + invocation trace）
│   ├── plan.md                       # 实现规划（加 skill dispatch 段 + invocation trace）
│   ├── execute.md                    # TDD 执行（加 skill dispatch 段 + invocation trace）
│   ├── review.md                     # 质量门控（加 skill dispatch 段 + invocation trace）
│   ├── ship.md                       # 打包发布（加 invocation trace 校验）
│   └── compound.md                   # 知识提取
├── roles/
│   ├── parallel-dispatch.md          # 编排：并行 agent 派发
│   ├── subagent-dev.md               # 编排：子 agent 驱动开发
│   ├── cross-session-exec.md         # 编排：跨会话执行
│   ├── scope-lock.md                 # 工具：范围锁定
│   ├── worktree.md                   # 工具：worktree 管理
│   └── skill-author.md              # 元：创建 skill
└── references/
    └── platform-setup.md             # 各平台安装指南
```

---

## 映射层设计

### bindings.yaml — 结构化阶段→Skill 硬绑定

**关键改进**：从 Markdown 表格升级为结构化 YAML，定义版本约束、输出 schema、映射规则。

```yaml
# bindings.yaml — AF 阶段 → 外部 Skill 硬绑定
# 这些 skill 由 install.sh 保证存在。pipeline 阶段必须调用对应 skill。

version: "1.0"

# ─── Execute 阶段绑定 ───────────────────────────────────────

execute:
  - trigger: "遇到 bug、测试失败、异常行为"
    skill: systematic-debugging
    version: ">=1.0.0"
    priority: 1          # 调试阻塞性最高，必须先完成
    concurrent: false
    output_schema:
      status: [RESOLVED, UNRESOLVED, NEEDS_HELP]
      evidence_level: [guess, indirect, direct, confirmed, proven]
    mapping:
      RESOLVED + confirmed: { af_evidence: E3 }
      RESOLVED + proven:    { af_evidence: E4 }
      UNRESOLVED:           { af_action: escalation_ladder }
      NEEDS_HELP:           { af_action: block_and_handoff }

  - trigger: "任务涉及前端界面设计"
    skill: tasteful-frontend
    version: ">=1.0.0"
    priority: 3
    concurrent: true     # 可与其他 skill 并行

  - trigger: "从设计稿/截图实现代码"
    skill: design-to-code-runner
    version: ">=1.0.0"
    priority: 2
    concurrent: false

  - trigger: "需要浏览器验证部署、UI 回归"
    skill: browser-qa-testing
    version: ">=1.0.0"
    priority: 4          # QA 在实现之后
    concurrent: false
    output_schema:
      health_score: number
      test_results: list
    mapping:
      health_score >= 80: { af_evidence: E3 }
      health_score < 80:  { af_action: escalation_ladder }

# ─── Review 阶段绑定 ───────────────────────────────────────

review:
  - trigger: "代码提交前审查"
    skill: thorough-code-review
    mode: outgoing
    version: ">=1.0.0"
    priority: 1
    concurrent: false
    output_schema:
      verdict: [APPROVED, APPROVED_WITH_FIXES, REJECTED]
      issues: list
    mapping:
      APPROVED:            { af_review: pass }
      APPROVED_WITH_FIXES: { af_review: pass_with_fixes }
      REJECTED:            { af_review: fail, af_action: return_to_execute }

  - trigger: "收到外部 review 反馈"
    skill: thorough-code-review
    mode: incoming
    version: ">=1.0.0"
    priority: 1
    concurrent: false

  - trigger: "涉及认证、数据、网络、依赖"
    skill: security-audit
    version: ">=1.0.0"
    priority: 2
    concurrent: true     # 可与代码审查并行
    output_schema:
      verdict: [PASS, FAIL, CONDITIONAL_PASS]
      findings: list
    mapping:
      PASS:             { af_review: pass }
      CONDITIONAL_PASS: { af_review: pass_with_fixes }
      FAIL:             { af_review: fail, af_action: return_to_execute }

  - trigger: "前端视觉质量审查"
    skill: design-review          # AF 内置两层流程
    priority: 3
    concurrent: true
    layers:
      - gate: design-baseline     # 第一层：AF 自有基线（不可跳过）
        verdict_on_fail: REJECTED
      - skill: tasteful-frontend  # 第二层：深度审查（加载外部 skill）
        version: ">=1.0.0"
        verdict_on_fail: APPROVED_WITH_FIXES

  - trigger: "产品体验、UX 评估"
    skill: product-review
    version: ">=1.0.0"
    priority: 4
    concurrent: true
```

### 映射执行规则

1. **阶段文件**（stages/*.md）遇到对应任务类型时，查 bindings.yaml 确定要调用的 skill
2. **优先级和并发**：按 priority 排序执行；`concurrent: true` 的 skill 可以并行调度
3. **冲突解决**：同时触发多个 skill 时，`concurrent: false` 的阻塞性 skill 先执行完毕
4. **输出映射**：外部 skill 输出按 `output_schema` 校验，按 `mapping` 规则翻译为 AF 内部状态
5. **Schema 校验**：如果外部 skill 输出不匹配 `output_schema`，记录 warning 并降级为手动映射
6. **Invocation trace**：每次 skill 调用记录到 `.apex/state.json` 的 `skill_invocations` 字段
7. 外部 skill 完成后，控制权回到 AF pipeline 继续下一步

### Invocation Trace（调用追踪）

每次 skill dispatch 记录到 `.apex/state.json`：

```json
{
  "skill_invocations": [
    {
      "stage": "execute",
      "skill": "systematic-debugging",
      "version": "1.2.0",
      "timestamp": "2026-04-09T14:30:00Z",
      "output_status": "RESOLVED",
      "af_mapping": "E3"
    }
  ]
}
```

**Ship 阶段校验**：在 ship 之前，检查 `skill_invocations` 是否覆盖了 bindings.yaml 中所有 `concurrent: false` 的必需 skill。缺少调用记录 → 阻塞 ship。

### Pipeline 阶段文件改造示例

每个 stages/*.md 增加 **Skill Dispatch** 段：

```markdown
## Skill Dispatch

遇到以下任务类型时，查询 bindings.yaml 确定要调用的外部 skill。

流程：
1. 识别当前任务类型（调试/前端/QA/...）
2. 查 bindings.yaml 获取 skill 名称、优先级、并发策略
3. 加载对应 skill 并遵循其流程
4. skill 完成后，校验输出是否匹配 output_schema
5. 按 mapping 规则翻译为 AF 内部状态（证据等级 / 审查结论）
6. 记录 invocation trace 到 .apex/state.json
7. 继续 AF pipeline 流程

如果 skill 输出不匹配预期 schema，记录 warning 并要求 agent 手动确认映射结果。
```

---

## install.sh 改造

```bash
#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/.." && pwd)"

# 检测 agent 平台的 skill 目录
if [ -d "$HOME/.claude" ]; then
  SKILLS_HOME="$HOME/.claude/skills"
elif [ -d "$HOME/.codex" ]; then
  SKILLS_HOME="$HOME/.codex/skills"
elif [ -d "$HOME/.gemini" ]; then
  SKILLS_HOME="$HOME/.gemini/skills"
else
  SKILLS_HOME="$HOME/.claude/skills"  # 默认
fi

mkdir -p "$SKILLS_HOME"

# ─── 解析命令 ───────────────────────────────────────────────

CMD="${1:-install}"

case "$CMD" in
  install) ;;
  update)
    echo "Updating all companion skills..."
    for dir in "$SKILLS_HOME"/*/; do
      name="$(basename "$dir")"
      [ "$name" = "apex-forge" ] && continue
      if [ -d "$dir/.git" ]; then
        echo "  [update] $name"
        git -C "$dir" pull --ff-only 2>/dev/null || echo "  [warn] $name: pull failed, skipping"
      fi
    done
    echo "Done."
    exit 0
    ;;
  *)
    echo "Usage: install.sh [install|update]"
    exit 1
    ;;
esac

echo "Apex Forge Installer"
echo "===================="

# ─── 1. 安装 AF 核心 ────────────────────────────────────────

ln -sfn "$SKILL_DIR" "$SKILLS_HOME/apex-forge"
echo "[ok] Apex Forge core"

# ─── 2. 安装 CLI 到 PATH ────────────────────────────────────
# ...（现有 PATH 逻辑）

# ─── 3. 安装依赖 skills（硬依赖，缺一不可）────────────────────

# 格式: name|url|tag (tag 为空则取 HEAD)
DEPS=(
  "systematic-debugging|https://github.com/d-wwei/systematic-debugging|v1.0.0"
  "thorough-code-review|https://github.com/d-wwei/thorough-code-review|v1.0.0"
  "security-audit|https://github.com/d-wwei/security-audit|v1.0.0"
  "browser-qa-testing|https://github.com/d-wwei/browser-qa-testing|v1.0.0"
  "tasteful-frontend|https://github.com/d-wwei/tasteful-frontend|"
  "design-to-code-runner|https://github.com/d-wwei/design-to-code-runner|"
  "product-review|https://github.com/d-wwei/product-review|"
)

echo ""
echo "Installing companion skills..."

FAILED=()

for dep in "${DEPS[@]}"; do
  IFS='|' read -r name url tag <<< "$dep"
  target="$SKILLS_HOME/$name"
  if [ -d "$target" ] || [ -L "$target" ]; then
    echo "  [ok] $name"
  else
    echo "  [install] $name"
    if [ -n "$tag" ]; then
      git clone --depth 1 --branch "$tag" "$url" "$target" 2>/dev/null || FAILED+=("$name")
    else
      git clone --depth 1 "$url" "$target" 2>/dev/null || FAILED+=("$name")
    fi
  fi
done

# ─── 4. 编译 browser-qa-testing 二进制（如果有 bun）──────────

BQT_DIR="$SKILLS_HOME/browser-qa-testing"
if [ -d "$BQT_DIR/src" ] && command -v bun &>/dev/null; then
  echo ""
  echo "Building browser binary..."
  (cd "$BQT_DIR" && bun install && bun run build 2>/dev/null) && echo "  [ok] browse binary" || echo "  [warn] browse binary build failed"
fi

# ─── 5. 安装结果 ────────────────────────────────────────────

echo ""
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "WARNING: Failed to install: ${FAILED[*]}"
  echo "These are hard dependencies. AF pipeline will not function correctly."
  echo "Please install manually: git clone <url> $SKILLS_HOME/<name>"
  exit 1
fi

echo "Done. Apex Forge + 7 companion skills installed."
echo ""
echo "Usage:"
echo "  /apex-forge               Activate core protocol"
echo "  /apex-forge execute       TDD-first implementation"
echo "  /systematic-debugging     Standalone debugging"
echo "  /thorough-code-review     Standalone PR review"
echo "  /browser-qa-testing       Standalone QA + browser"
echo ""
echo "Maintenance:"
echo "  install.sh update         Pull latest for all companion skills"
```

---

## .claude-plugin 更新

拆分后需同步更新 `.claude-plugin` 中的 skill 注册：

**删除的条目**（7 个，由外部 skill 各自注册）：
- `apex-forge-investigate`
- `apex-forge-code-review`
- `apex-forge-receiving-review`
- `apex-forge-security-audit`
- `apex-forge-qa`
- `apex-forge-browse`
- `apex-forge-design-review`

**新增的条目**（1 个，AF 内置）：
- `apex-forge-design-baseline` → 指向 `skill/gates/design-baseline.md`

外部 skill 的注册由各自仓库的 `.claude-plugin` 或 SKILL.md frontmatter 处理，AF 不再管理。

---

## 执行顺序

### Phase 0：准备（回滚安全网）

```bash
# 在 AF 仓库打 tag 作为回滚点
cd <apex-forge-repo>
git tag pre-reshaping-v2
git push origin pre-reshaping-v2
```

### Phase 1：创建 4 个新仓库

1. `d-wwei/systematic-debugging` — 改写 investigate.md，去 AF 术语，补输出契约
2. `d-wwei/thorough-code-review` — 合并 code-review + receiving-review，去 AF 术语，补输出契约
3. `d-wwei/security-audit` — 直接提取 security-audit.md，补输出契约
4. `d-wwei/browser-qa-testing` — 改写 qa.md + browse.md，**迁入 src/browse/ 全部源码**，配置独立编译，补输出契约

每个仓库必须包含：
- `SKILL.md`（带 frontmatter）
- `VERSION` 文件（语义化版本号）
- 输出契约（与 AF bindings.yaml 中定义的 output_schema 一致）

### Phase 2：改造 AF 核心

1. 删除 7 个已拆出的 role 文件
2. 删除 `src/browse/` 和 `dist/apex-forge-browse`
3. 新增 `skill/gates/design-baseline.md`
4. 新增 `skill/bindings.yaml`
5. 更新 `SKILL.md` 命令路由表（移除已拆出的命令，指向外部 skill）
6. 更新 6 个 stage 文件（增加 Skill Dispatch 段 + invocation trace 逻辑）
7. 更新 `ship.md`（增加 invocation trace 校验）
8. 改造 `install.sh`（版本 pin + update 命令 + 浏览器编译）
9. 更新 `.claude-plugin`（删除 7 个旧条目，增加 design-baseline）

### Phase 3：验证

#### 3a. 安装验证

```bash
# 模拟从零安装
rm -rf ~/.claude/skills/apex-forge
rm -rf ~/.claude/skills/systematic-debugging
rm -rf ~/.claude/skills/thorough-code-review
rm -rf ~/.claude/skills/security-audit
rm -rf ~/.claude/skills/browser-qa-testing

# 运行安装
bash <apex-forge-repo>/skill/install.sh

# 验证：所有 skill 就位
ls ~/.claude/skills/
# 应看到: apex-forge, systematic-debugging, thorough-code-review,
# security-audit, browser-qa-testing, tasteful-frontend,
# design-to-code-runner, product-review

# 验证：browse 二进制由 browser-qa-testing 提供
which browse
# 应指向 browser-qa-testing 安装的路径

# 验证：AF 不再包含 browse 源码
ls ~/.claude/skills/apex-forge/src/browse/ 2>/dev/null
# 应报错：No such file or directory
```

#### 3b. 绑定验证

```bash
# 验证：bindings.yaml 存在且可解析
cat ~/.claude/skills/apex-forge/skill/bindings.yaml | head -5
# 应看到 version: "1.0"

# 验证：stage 文件引用外部 skill
grep "bindings.yaml" ~/.claude/skills/apex-forge/skill/stages/execute.md
grep "bindings.yaml" ~/.claude/skills/apex-forge/skill/stages/review.md

# 验证：design-baseline gate 存在
cat ~/.claude/skills/apex-forge/skill/gates/design-baseline.md | head -5
```

#### 3c. 端到端 pipeline 验证

```
在 Claude Code 中执行完整 pipeline：

1. /apex-forge brainstorm → 创建一个 toy 项目需求
2. /apex-forge plan → 生成实现计划
3. /apex-forge execute → 实现（触发 TDD）
   → 验证：如果遇到 bug，是否自动调用 /systematic-debugging
   → 验证：.apex/state.json 中是否记录了 skill_invocations
4. /apex-forge review → 审查
   → 验证：是否调用 /thorough-code-review
   → 验证：如果有前端文件，是否先走 design-baseline 再走 tasteful-frontend
5. /apex-forge ship → 验证 invocation trace 校验是否阻塞缺少的必需 skill 调用
```

#### 3d. 独立使用验证

```
在 Claude Code 中：
- /systematic-debugging → 不经过 AF，直接加载调试协议 ✓
- /thorough-code-review → 不经过 AF，直接加载审查协议 ✓
- /browser-qa-testing → 不经过 AF，直接启动 QA + 浏览器 ✓
- /security-audit → 不经过 AF，直接加载审计协议 ✓
```

### Phase 4：迁移指引

为现有 AF 用户提供升级路径：

```bash
# 已有 AF 用户升级
cd ~/.claude/skills/apex-forge
git pull origin main              # 拉取新版 AF 核心
bash skill/install.sh             # 自动安装新增的 companion skills
# 旧的 browse 二进制会被新版覆盖
# 旧的内置 role 文件已删除，由外部 skill 替代
```

---

## 最终结果

安装完成后，用户得到：

**在 AF pipeline 里**（编排模式）：
```
/apex-forge brainstorm → plan → execute → review → ship → compound
                                   ↓          ↓
                        查 bindings.yaml    两层设计审查
                        调用外部 skill      (baseline → tasteful)
                        记录 invocation     invocation trace 校验
                        trace               ship 前检查完整性
```

**独立使用**（单点模式）：
```
/systematic-debugging     随时调试（自包含）
/thorough-code-review     随时审查（自包含）
/security-audit           随时审计（自包含）
/browser-qa-testing       随时 QA + 浏览器（自包含，含编译二进制）
/tasteful-frontend        随时设计指导
/product-review           随时产品评审
```

两种使用方式完全兼容，不冲突。

---

## 与 v1 方案的关键差异

| 维度 | v1 | v2 |
|------|----|----|
| 绑定格式 | Markdown 表格 | 结构化 YAML（含版本、schema、优先级） |
| 运行时约束 | 无（靠 agent 阅读 Markdown） | invocation trace + ship 前校验 |
| 版本管理 | `git clone` HEAD | pin 到 tag + `install.sh update` |
| 浏览器能力 | AF 持有二进制，browser-qa-testing 假独立 | 完整迁入 browser-qa-testing，真正自包含 |
| 设计审查 | 全交给 tasteful-frontend（裁判=运动员） | 两层分离：AF 基线独立判 + tasteful-frontend 深度审 |
| Skill 冲突 | 未定义 | priority + concurrent 策略 |
| 输出契约 | 散文映射规则 | 结构化 output_schema + mapping |
| 安装失败 | 静默继续 | 硬依赖失败则 exit 1 |
| 回滚 | 无 | Phase 0 打 tag |
| 升级 | 无 | `install.sh update` |
| Plugin 注册 | 未提及 | 明确删除/新增条目 |
| 验证 | `ls` + `grep` | 安装 + 绑定 + 端到端 pipeline + 独立使用 四层验证 |

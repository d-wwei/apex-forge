# Phase 1b 执行提示词

直接复制以下内容到新的 Claude Code 会话中执行。

---

## 提示词

```
我在做 Apex Forge 的 Phase 1b 迭代，两项工作。仓库在当前目录。

先读这些文件了解上下文：
1. docs/project-overview.md — 项目全景（三层结构、设计目标）
2. docs/iteration-roadmap.md — 迭代计划
3. skill/stages/brainstorm.md — 当前 brainstorm 阶段（9 步清单）
4. skill/bindings.yaml — stage→skill 映射
5. workflow/roles/office-hours.md — 已迁入的头脑风暴流程
6. frontend/index.html 第 257-340 行 — Design Comparison 页面（硬编码壳子）
7. frontend/app.js — 前端逻辑（注意哪些区域读真实数据，哪些是空壳）
8. src/dashboard.ts 第 120-180 行 — dashboard API 端点
9. src/design.ts — 设计生成/变体/对比功能（已实现，存 .apex/designs/）

然后 fetch 这个仓库的 README 了解 PRD skill 的结构：
https://github.com/d-wwei/Product-Prd-Skill

读完后，按顺序执行以下 2 项任务：

---

### 任务 1：Brainstorm 阶段加 PRD 分支 + 解耦接入

目标：用户说"帮我做个注册功能"走现有的 9 步需求清单；用户说"我们要不要做这个产品"或"写个 PRD"走 PRD 流程。两条路径在 brainstorm 阶段内分流。

#### 1a. 分析和整合

- 读 https://github.com/d-wwei/Product-Prd-Skill 的 SKILL.md（或 README），提取 PRD 的核心结构和流程
- 读 workflow/roles/office-hours.md，提取产品思考的强制问题和设计文档结构
- 对比三者（现有 brainstorm 9 步、PRD skill、office-hours），列出重叠和互补的部分

#### 1b. 创建独立的 PRD skill

像 systematic-debugging、thorough-code-review 一样，PRD 能力应该是独立的 companion skill：
- 创建目录：/Users/admin/Documents/AI/agent better work/product-prd/
- 写 SKILL.md：融合 Product-Prd-Skill 的 PRD 结构 + office-hours 的强制问题
- 写 VERSION（1.0.0）
- 写 README.md（中英文）
- git init + commit
- 用 gh 创建 GitHub 仓库 d-wwei/product-prd 并推送
- symlink 到 ~/.claude/skills/product-prd

#### 1c. 接入 AF 绑定

- 在 skill/bindings.yaml 的 brainstorm 或 execute 段（想清楚放哪个阶段更合理）新增 product-prd 绑定
- trigger: "产品决策、新功能规划、写 PRD、产品需求文档、市场分析"
- 更新 skill/stages/brainstorm.md 加一个分流逻辑：

  ```
  用户请求是什么？
    → 具体开发任务（"做一个XX功能"）→ 现有 9 步清单 → 产出需求确认书
    → 产品决策/新功能规划（"要不要做XX"、"写个PRD"）→ 调 /product-prd → 产出 PRD 文档
  ```

- 在 .claude-plugin 注册 apex-forge-prd 别名指向 product-prd skill
- 在 install.sh 的 DEPS 数组加入 product-prd

#### 1d. 验证

- /product-prd 作为独立 skill 可直接使用
- /apex-forge brainstorm 时能根据用户意图分流到 PRD 路径
- bindings.yaml 中 product-prd 绑定格式正确

---

### 任务 2：Dashboard 接通真实数据 + 全面排查空壳

#### 2a. Design Comparison 接通

- 在 src/dashboard.ts 新增 API 端点 GET /api/designs：
  - 读 .apex/designs/ 目录
  - 返回所有图片文件列表（路径、文件名、创建时间、大小）
  - 如果目录不存在或为空，返回 { designs: [] }

- 在 frontend/app.js 新增 renderDesignComparison() 函数：
  - fetch /api/designs
  - 动态生成 variant-card（替换 index.html 里硬编码的 4 个 Variant）
  - 空状态显示"No designs yet. Run `apex design generate` or `apex design variants` to create designs."
  - 图片用 /api/designs/file?path=xxx 端点返回（需要在 dashboard.ts 加文件服务）

- 在 frontend/index.html 把硬编码的 4 个 variant-card 替换为一个空的 <div id="variant-gallery"></div>

#### 2b. 全面排查其他空壳

逐项检查 dashboard 的每个区域，对照 frontend/app.js 和 src/dashboard.ts：

1. **Task Orchestration Board** — 是否读真实 .apex/tasks.json？（之前确认是的，二次验证）
2. **Pipeline Orchestration** — 是否读真实 .apex/state.json 的 current_stage 和 history？
3. **Pipeline Artifacts** — 空状态是否显示"No artifacts yet"而不是假数据？（之前修过，二次验证）
4. **System Telemetry** — 是否读 .apex/analytics/usage.jsonl？（Phase 1 已接通，二次验证）
5. **Skill Performance Ranking** — 同上
6. **Activity Stream** — 是否读 .apex/events.jsonl？（Phase 1 已接通，二次验证）
7. **Cognitive Memory** — 是否读 .apex/memory.json？
8. **Home 页面的项目卡片** — /api/projects 返回的 description、task_count、success_rate 是否从真实 .apex/ 数据计算？
9. **Sidebar 项目列表** — 同上
10. **Design Comparison** — 2a 处理

对每个区域：
- 如果读的是真实数据 → 标记 OK
- 如果是空壳/假数据/硬编码 → 修复为读真实数据，空状态显示有意义的提示

#### 2c. 验证

- 启动 dashboard: `nohup ./dist/apex-forge dashboard > /dev/null 2>&1 &`
- 用 curl 检查每个 API 端点返回的数据结构
- 确认无假数据残留

---

全部完成后：
1. commit AF 仓库的改动
2. push AF + product-prd 两个仓库
3. 更新 docs/iteration-roadmap.md 标记这两项完成
```

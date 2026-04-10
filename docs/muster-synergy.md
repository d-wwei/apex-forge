# Apex Forge 对 Muster 的参考价值

> Muster：多 Agent 协作编排平台（"数字公司操作系统"）
> Apex Forge：单/多 Agent 执行协议编排器
> 两者关系：AF 提供执行纪律，Muster 提供组织架构。AF 是单兵作战手册，Muster 是军队编制系统。

---

## 一、AF 能直接给 Muster 用的东西

### 1. 执行协议注入 Muster 的 Agent 心跳

Muster 的 Agent 每次心跳执行一个 9 步协议（身份确认 → 收件箱 → 选任务 → checkout → 理解上下文 → 干活 → 更新状态 → 委派）。其中"干活"这一步没有执行纪律约束。

**可以做的事**：把 AF 的 SKILL.md 核心协议注入到 Muster Agent 的 skill 层。每个 Agent 心跳执行任务时自动遵守：
- 复杂度路由（任务简单直接做，复杂的走 PDCA 轮次）
- TDD 铁律（写测试先）
- 验证门（做完必须证明）
- 证据分级（不能猜着报完成）

Muster 已有四层 Skill 注入系统（Platform → Role → Project → Issue）。AF 协议可以作为 Platform 级 skill 全局注入。

**具体路径**：Muster 的 `skill-loader` 服务在 Agent 启动时加载 skill。把 AF 的 `skill/SKILL.md` 核心协议段（约 2000 token）注入为 Platform base skill。

### 2. Companion Skill 复用

Muster 的 186 个角色模板定义了"谁来做"，但没有定义"怎么做具体任务"。AF 的 8 个 companion skill 填了这个空：

| Muster 角色 | AF Companion Skill | 怎么用 |
|------------|-------------------|--------|
| 前端开发者 | /tasteful-frontend + /design-to-code-runner | 注入为 Role 级 skill |
| QA 工程师 | /browser-qa-testing | 注入为 Role 级 skill |
| 安全工程师 | /security-audit | 注入为 Role 级 skill |
| 代码审查者 | /thorough-code-review | 注入为 Role 级 skill |
| 产品经理 | /product-prd + /product-review | 注入为 Role 级 skill |
| 所有开发角色 | /systematic-debugging | 注入为 Platform 级 skill |

Muster 的 skill-library 服务已经支持 CRUD 和版本管理，直接注册 AF 的 companion skill 即可。

### 3. bindings.yaml 映射 Muster 工作流阶段

Muster 有线性工作流引擎（需求 → 设计 → 开发 → 代码审查 → QA → 发布 → 回顾）。AF 的 bindings.yaml 能映射到每个阶段：

```yaml
# Muster workflow stage → AF skill binding
requirements:
  - skill: product-prd        # PM 写 PRD

development:
  - skill: systematic-debugging  # 遇 bug 自动调
  - skill: tasteful-frontend     # 涉及前端自动调

code_review:
  - skill: thorough-code-review  # 代码审查
  - skill: security-audit        # 安全审计
  - skill: codex-consult         # Codex 第二意见

qa:
  - skill: browser-qa-testing    # QA 测试

retro:
  - skill: compound              # 知识提取
```

Muster 的 `advanceWorkflowStage()` 触发阶段转换时，可以同时检查 AF 的 invocation trace，确保必需的 skill 都被调用过。

### 4. Dashboard 数据对接

Muster 有 WebSocket 实时事件流（heartbeat.run.*、activity.logged、agent.status、cost_event）。AF 的 dashboard 可以订阅这些事件，展示：
- 多 Agent 并行执行的实时看板（不只是单 Agent）
- 按 Agent 角色统计的 skill 调用分布
- 跨工作流阶段的 pipeline 进度

AF 的 dashboard 现在是单项目视角。接了 Muster 后变成组织级视角。

---

## 二、AF 还没有但 Muster 需要的东西

### 1. 预算感知

Muster 的核心差异化是精确到分的预算硬控。AF 的协议完全不考虑成本。

**需要做的**：AF 的 execute 阶段加入成本感知。在 bindings.yaml 的 skill dispatch 里加 cost_budget 约束。如果任务剩余预算不足以支撑一次 Codex 调用，自动降级到 Claude Haiku。

这和 AF 的 `agents` 多命令配置天然衔接：

```yaml
agents:
  default: "claude"           # 便宜的做默认工作
  review: "claude-opus"       # 贵的做关键审查
  challenge: "codex"          # 仅预算允许时用
```

### 2. 审批门控

Muster 的工作流有 Approval Gate（人类审批 → 72 小时超时 → 自动升级）。AF 的 pipeline 只有"用户确认"这一层，没有正式的审批流。

**需要做的**：AF 的 review → ship 之间加一个可选的 Approval Gate。在 Muster 里这个门连到 Muster 的审批系统，在独立使用 AF 时 fallback 到简单的用户确认。

### 3. 多 Agent 角色隔离

Muster 的每个 Agent 有独立的 session（per AgentId + TaskKey）。AF 现在的 `.apex/state.json` 是单 Agent 的。

**需要做的**：Phase 3 的 orchestrator 接入时，每个派发出去的 Agent 需要自己的 `.apex/state-{agentId}.json`。AF 的 CRDT 共识算法可以用来合并多个 Agent 的 state。

---

## 三、Muster 能给 AF 的参考

### 1. 四层 Skill 注入模型

Muster 的 Skill 注入分四层（Platform → Role → Project → Issue），解决了"给 Agent 太多指令它会混乱"的问题。

AF 现在是一把梭：session-start hook 注入完整协议（约 2000 token）+ 用户触发时加载 stage/role 文件。没有按场景精准注入。

**可以借鉴**：AF 的 session-start 只注入最核心的规矩（复杂度路由 + 验证门 + TDD，约 500 token）。Stage 文件和 skill 在需要时再加载。减少 Agent 上下文负担。

### 2. Heartbeat 调度模型

Muster 的心跳调度器有 Coalesce（合并重复触发）和 Defer（排队等上一个完成）。AF 的 orchestrator 没有这两个机制，多个任务同时触发会并发冲突。

**可以借鉴**：orchestrator 的 pollCycle 加入 coalesce 和 defer 逻辑。

### 3. 不可变成本账本

Muster 的 `cost_events` 表是 append-only 的，任何改动都有审计日志。AF 的 telemetry 是 JSONL 追加，但没有不可变性保证。

**可以借鉴**：AF 的 `analytics/usage.jsonl` 改为 append-only + checksum，防止篡改。

### 4. 异常处理体系

Muster 有完整的异常处理：Agent 失败 → 指数退避重试（最多 3 次）→ 审批超时 → 预算耗尽暂停。AF 的升级阶梯（L0-L4）是协议层的，没有系统层的异常恢复。

**可以借鉴**：AF 的 `apex recover` 命令扩展为自动异常恢复：检测卡住的任务 → 重试 → 超过阈值 → 通知用户。

---

## 四、整合路线图

| 阶段 | 做什么 | 前提 |
|------|--------|------|
| **现在可以做** | AF 协议作为 Muster Platform 级 skill 注入 | Muster 的 skill-loader 已实现 |
| **现在可以做** | AF 的 8 个 companion skill 注册到 Muster 的 skill-library | Muster 的 skill CRUD API 已实现 |
| **Phase 1 后做** | bindings.yaml 映射 Muster 工作流阶段 | AF pipeline 单 Agent 跑通 |
| **Phase 3 做** | AF orchestrator 接入 Muster 心跳调度 | AF 多 Agent 编排就位 |
| **Phase 3 做** | AF CRDT 合并多 Agent state | AF 共识算法上生产 |
| **Phase 4 做** | AF compound 知识共享 → Muster 组织级知识库 | AF 知识共享机制就位 |

---

## 五、一句话总结

**AF 给 Muster 的每个 Agent 装上执行纪律，Muster 给 AF 提供组织架构和资源管控。** 两者的整合点是 Skill 注入层（AF 协议 → Muster Agent）和 Workflow 映射层（Muster 阶段 → AF bindings）。不需要重写任何一方，只需要在接口层对接。

# Apex Forge 迭代计划

> 创建时间：2026-04-10
> 前提：单 Agent pipeline 先跑通，再接多 Agent 编排

---

## Phase 1：单 Agent Pipeline 跑通（优先）

### 1.1 端到端实测
- 找一个真实小项目，跑完整 pipeline：brainstorm → plan → execute → review → ship
- 记录哪里卡、哪里协议执行不到位、哪里 skill 调不通
- 修复发现的问题，再跑第二个项目验证

### 1.2 接通 invocation trace 运行时
- 状态：bindings.yaml 定义了 trace 格式，`SkillInvocation` 类型已加到 `src/types/state.ts`
- 缺口：pipeline 运行时不会实际写入 `.apex/state.json` 的 `skill_invocations` 字段
- 目标：execute/review 阶段调外部 skill 后自动记录 trace，ship 阶段自动校验完整性

### 1.3 接通 telemetry 数据采集
- 状态：CLI 有 `telemetry start/end/report`，但 pipeline 不会自动记录
- 缺口：dashboard 遥测面板显示 0
- 目标：每次 skill 调用自动写 telemetry，dashboard 显示真实数据

### 1.4 接通 post-tool-event → dashboard Activity Stream
- 状态：`hooks/post-tool-event` 在写 `.apex/events.jsonl`，但无人消费
- 缺口：dashboard Activity Stream 显示空
- 目标：dashboard API 读 events.jsonl，前端展示真实工具调用活动

### 1.5 接通 tracing 自动埋点
- 状态：`apex trace start/end/view` CLI 能用，但需要手动调用
- 缺口：pipeline 内部操作没有自动 trace
- 目标：每个 stage 进入/退出自动创建 span，每次 skill dispatch 自动创建子 span

### 1.6 补齐 skill/stages/verify.md
- 状态：`workflow/stages/verify.md` 存在，`skill/stages/` 缺失
- 目标：同步或决定是否需要独立的 verify stage

### 1.7 Skill 版本校验
- 状态：bindings.yaml 定义了 `version: ">=1.0.0"` 约束
- 缺口：运行时没有读 companion skill 的 VERSION 文件做 semver 比较
- 目标：stage 文件加载外部 skill 前检查版本，不符合约束则警告

---

## Phase 2：MCP + 可观测性完善

### 2.1 MCP Server 自动配置
- 状态：`dist/apex-forge-mcp` 已编译，支持 admin/developer/pm 三种角色
- 缺口：用户必须手动编辑 Claude Code 的 MCP settings 才能用，无自动发现
- 目标：`apex mcp setup` 命令自动写入 `~/.claude/settings.json` 的 MCP 配置

### 2.2 telemetry-sync 自动化
- 状态：`apex telemetry sync` 可手动上传到远程端点
- 缺口：没有自动触发机制
- 目标：session 结束时或 ship 后自动 sync（需配置端点）

### 2.3 清理 workflow/roles/ 重复文件
- 6 个文件（investigate.md、code-review.md、qa.md、browse.md、security-audit.md、design-review.md）和 skill/aliases/ 指向的外部 skill 功能重复
- 决定：删除还是保留作为 fallback

---

## Phase 3：多 Agent 自动编排

### 前提
Phase 1 完成，单 Agent pipeline 稳定可靠。

### 3.1 Orchestrator 接入 pipeline
- 状态：`src/orchestrator.ts`（271 行）已实现，支持并发控制、依赖图、任务模板匹配
- 缺口：execute 阶段不会自动调 orchestrator
- 目标：当 plan 产出的任务 > 3 个且有独立任务时，execute 自动启用 orchestrator 并行派发

### 3.2 共识算法从测试到生产
- 状态：Raft/BFT/Gossip/CRDT 四种实现，都能通过单元测试
- 缺口：测试是同一进程内的模拟，不是进程间通信
- 目标：
  - CRDT 先上：多个 Agent 同时写 memory.json 时自动合并不冲突
  - Gossip 次之：Agent 间传播发现的事实
  - Raft 最后：多 Agent 场景下选 leader 协调任务分配

### 3.3 端到端多 Agent 测试
- 验证：两个 Agent 同时执行不同任务，不互相踩脚
- 验证：依赖图正确等待上游任务完成
- 验证：Agent 失败后自动重分配

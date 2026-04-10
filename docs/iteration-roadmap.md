# Apex Forge 迭代计划

> 最后更新：2026-04-10 (Phase 1c complete)

---

## Phase 1：单 Agent Pipeline 跑通

### 已完成

| 项目 | 状态 |
|------|------|
| 1.2 invocation trace 运行时写入 | 完成。`apex trace-skill` 命令 + `addSkillInvocation()` 函数 |
| 1.3 telemetry 自动采集 | 完成。trace-skill 同时写 `.apex/analytics/usage.jsonl` |
| 1.4 events → dashboard Activity Stream | 完成。dashboard 读 `.apex/events.jsonl` |
| 1.6 verify.md 补齐 | 完成。`skill/stages/verify.md` 存在 |
| 1.7 Skill 版本校验 | 完成。`apex check-bindings` + `src/utils/semver.ts` |
| codex-consult 加入 bindings | 完成。review 阶段 priority 5，concurrent: true |
| agents 多命令支持 | 完成。config 支持 agents 字段（default/review/challenge/consult） |
| **Brainstorm PRD 分支** | 完成。product-prd v2.0 companion skill（融合 PRD 访谈 + office-hours 6 问），brainstorm.md 分流逻辑，bindings.yaml brainstorm 段绑定，.claude-plugin 注册，install.sh 加入第 8 个 companion skill |
| **Dashboard 全面接通** | 完成。Design Comparison 接通 `/api/designs` + `/api/designs/file`，10 个区域全部排查确认读真实 `.apex/` 数据，无假数据残留 |
| **1c 记忆后端插件化** | 完成。`MemoryBackend` 接口 + Agent Recall 混合后端 + 本地 fallback + 启动时自动探测。写操作双写（Agent Recall + local），读操作走 local（即时可用），上下文注入优先 Agent Recall（跨会话/跨平台）。`apex memory backend` 报告当前后端 |

### 待做

**1.1 端到端实测（最高优先级）**

找一个真实小项目，跑完整 pipeline：brainstorm → plan → execute → review → ship。记录哪里卡、哪里协议执行不到位、哪里 skill 调不通。修复后再跑第二个项目验证。

这是当前最有价值的工作。代码层面的接线已经完成，缺的是实战验证。

**1.5 tracing 自动埋点**

等实测后做。先知道哪些操作值得 trace，再决定在哪里加自动埋点。目标：每个 stage 进入/退出自动创建 span，每次 skill dispatch 自动创建子 span。

---

## Phase 2：MCP + 可观测性完善

等 Phase 1 实测完成后开始。

| 项目 | 说明 |
|------|------|
| 2.1 MCP Server 自动配置 | `apex mcp setup` 命令自动写入 Claude Code 的 MCP settings。现在需要手动配 |
| 2.2 telemetry-sync 自动化 | session 结束或 ship 后自动上传遥测数据到远程端点。现在只能手动 `apex telemetry sync` |
| 2.3 清理 workflow/roles/ 重复文件 | 6 个文件和 skill/aliases/ 指向的外部 skill 功能重复，决定删除还是保留 |

---

## Phase 3：多 Agent 自动编排

等 Phase 1 完成，单 Agent pipeline 稳定可靠后开始。

### 3.1 Orchestrator 接入 pipeline

现状：`src/orchestrator.ts`（271 行）已实现。支持并发控制、依赖图、任务模板匹配、日志记录、优雅停机。

接入方式：当 plan 产出的任务 > 3 个且有独立任务时，execute 阶段自动启用 orchestrator。orchestrator 从任务队列拉任务，派 `claude --print` 进程执行，按依赖图调度，多个独立任务并行跑。

`agent_command` 配置支持多种 Agent：

```yaml
# .apex/config.yaml
agents:
  default: "claude"       # 写代码用 Claude
  review: "claude"        # 审查用 Claude
  challenge: "codex"      # 对抗性测试用 Codex
  consult: "codex"        # 第二意见用 Codex
```

### 3.2 共识算法从测试到生产

四种算法已实现且有测试，但都是同一进程内的模拟。上生产需要进程间通信层。

接入顺序：
1. **CRDT 先上**：多个 Agent 同时写 memory.json 时用 ORSet 管理 facts、用 LWWRegister 管理单值，各自写本地副本定期 merge，不冲突
2. **Gossip 次之**：Agent A 调试时发现一个模式，自动传播给 Agent B（在做另一个任务但涉及同一个模块）
3. **Raft 最后**：多个 Orchestrator 实例跑在不同机器上，Raft 选一个 Leader 负责任务分配
4. **BFT 备选**：3 个 Agent 独立审查同一段代码，BFT 投票决定最终结论（容忍 1 个 Agent 给出错误判断）

生产化需要的工程工作：
- 进程间通信（WebSocket/HTTP/Unix socket）
- 序列化/反序列化
- 节点发现（哪些 Agent 在线）
- 故障检测（心跳超时 → 节点离线）

### 3.3 端到端多 Agent 测试

- 两个 Agent 同时执行不同任务，不互相踩脚
- 依赖图正确等待上游任务完成
- Agent 失败后自动重分配
- 不同 Agent（Claude + Codex）交叉审查的结果正确聚合

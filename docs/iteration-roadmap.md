# Apex Forge 迭代计划

> 最后更新：2026-04-10

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
| Brainstorm PRD 分支 | 完成。product-prd v2.0 companion skill，brainstorm.md 分流逻辑 |
| Dashboard 全面接通 | 完成。Design Comparison + 10 个区域全部读真实数据 |
| 记忆后端插件化 | 完成。MemoryBackend 接口 + Agent Recall 后端 + 本地 fallback + 启动时自动探测 |
| Dashboard 询问强制化 | 完成。MANDATORY 指令防止 Agent 跳过 |
| 自动 init + 会话恢复 | 完成。启动时 5 步检查（CLI/init/dashboard/binding health/resume） |

### 待做

**1.1 端到端实测（最高优先级）**

找一个真实小项目，跑完整 pipeline：brainstorm → plan → execute → review → ship。记录哪里卡、哪里协议执行不到位、哪里 skill 调不通。修复后再跑第二个项目验证。

**1.5 tracing 自动埋点**

等实测后做。每个 stage 进入/退出自动创建 span，每次 skill dispatch 自动创建子 span。

---

## Phase 2：MCP + 可观测性完善

| 项目 | 说明 |
|------|------|
| 2.1 MCP Server 自动配置 | `apex mcp setup` 命令自动写入 Claude Code 的 MCP settings |
| 2.2 telemetry-sync 自动化 | session 结束或 ship 后自动上传遥测到远程端点 |
| 2.3 清理 workflow/roles/ 重复文件 | 6 个文件和 skill/aliases/ 功能重复，决定删除还是保留 |
| 2.4 Dashboard 增强 | 基于实测反馈改进面板，补充缺失的可视化维度 |

---

## Phase 3：多 Agent 自动编排

前提：Phase 1 完成，单 Agent pipeline 稳定可靠。

### 3.1 Orchestrator 接入 pipeline

`src/orchestrator.ts`（271 行）已实现。接入方式：plan 产出的独立任务 > 3 个时，execute 自动启用 orchestrator 并行派发。支持多种 Agent（Claude/Codex）按角色分配。

### 3.2 共识算法从测试到生产

四种算法（Raft/BFT/Gossip/CRDT）已实现有测试，但是同一进程内模拟。上生产需要进程间通信层。

接入顺序：CRDT（多 Agent 写 memory 不冲突）→ Gossip（Agent 间传播发现）→ Raft（Leader 选举）→ BFT（输出可靠性投票）。

### 3.3 端到端多 Agent 测试

两个 Agent 同时执行不同任务不踩脚、依赖图正确等待、失败自动重分配、跨 Agent 审查结果聚合。

---

## Phase 4：社区化 + 知识共享

前提：AF 有真实用户在使用。

### 4.1 知识共享机制

每个用户在 compound 阶段提取的知识（bug 修法、架构决策、踩坑经验）现在只存本地。一个人踩的坑所有人都不用再踩。

**核心设计**：

```
用户 A 跑 compound → 提取知识 → 本地 docs/solutions/
                                      ↓ apex memory share
                              脱敏 + 证据分级过滤（E3+ 才允许）
                                      ↓
                              公共知识库（GitHub repo 或 API）
                                      ↓ apex memory pull
用户 B 的 AF 启动时拉取 → 本地知识池增强
```

**关键约束**：
- 隐私：共享的是脱敏后的**模式**（"React + Prisma 项目中 N+1 查询用 eager loading 解决"），不是具体代码
- 质量：只有 E3+（多源确认）的知识才能提交到公共池
- CLI 命令：`apex memory share`（提交）和 `apex memory pull`（拉取）

### 4.2 知识质量保证

| 层级 | 机制 |
|------|------|
| 自动过滤 | 证据等级低于 E3 的不允许提交 |
| 结构校验 | 必须有 context/solution/why it worked/generalized pattern |
| 社区审核 | PR-based：提交到公共 repo，维护者审核合并 |
| 使用反馈 | 其他用户标记"有用/无用"，低分知识自动下沉 |

### 4.3 分发渠道

| 阶段 | 方式 | 适用场景 |
|------|------|---------|
| MVP | 公开 GitHub repo（类似 awesome-xxx），用户 PR 提交，维护者审核 | 早期用户少，手动审核可行 |
| 规模化 | API 服务 + `apex memory pull` 自动同步 | 用户多了，PR 审核不过来 |
| 去中心化 | 基于 Gossip 协议的 P2P 知识传播（复用 Phase 3 的共识算法） | 长期愿景 |

### 4.4 用户增长

| 项目 | 说明 |
|------|------|
| 发布到 npm/brew | `npx apex-forge init` 一键安装 |
| 示范项目 | 用 AF 做一个完整的开源项目，全程录制 pipeline 运行过程 |
| Companion skill 生态 | 允许社区贡献新的 companion skill，AF 的 bindings.yaml 支持用户自定义绑定 |
| 多语言文档 | 中英文 README、使用指南、视频教程 |

---

## Phase 5：平台级能力

长期愿景，不急。

| 项目 | 说明 |
|------|------|
| AF Cloud | 托管版 dashboard，不需要本地跑。用户登录就能看所有项目 |
| 团队协作 | 多人共享一个项目的 .apex/ 状态，任务可以分配给不同的人/Agent |
| 知识图谱 | 跨项目的知识关联：项目 A 的经验自动推荐给做类似事情的项目 B |
| Agent 市场 | 用户可以发布自己训练/调优的 companion skill，其他人一键安装 |
| 审计合规 | 完整的操作审计日志，满足企业安全合规要求 |

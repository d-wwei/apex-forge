# Apex Forge 共识算法文档

> 位置：`src/consensus/`
> 状态：已实现，有测试，未接入 pipeline
> 用途：为 Phase 3 多 Agent 协调做准备

---

## 概述

四种共识算法，解决同一个问题：**多个 Agent 同时操作共享数据时，怎么保持一致。**

| 算法 | 文件 | 行数 | 解决什么 | 计划用在哪 |
|------|------|------|---------|-----------|
| Raft | `raft.ts` | 671 | 选领导，日志复制 | 多 Agent 任务分配的协调者选举 |
| BFT | `bft.ts` | 230 | 容错投票（容忍坏节点） | Agent 输出可靠性投票 |
| Gossip | `gossip.ts` | 175 | 状态传播 | Agent 间同步发现的事实 |
| CRDT | `crdt.ts` | 202 | 无冲突合并 | memory.json 多 Agent 同时写入 |

测试文件：`src/__tests__/consensus.test.ts`（116 行，15 个测试用例）

---

## 1. Raft — 选领导 + 日志复制

**论文来源**：Ongaro & Ousterhout, 2014

**用大白话说**：5 个 Agent 在干活，谁来分配任务？Raft 让它们投票选一个 Leader。Leader 负责接收新任务、分发给 Follower、确认多数完成后才算提交。Leader 挂了，其他人重新投票。

### 核心概念

- **三种角色**：Follower（跟随者）、Candidate（候选人）、Leader（领导者）
- **Term（任期）**：每次选举递增，用来判断谁的信息更新
- **Log（日志）**：所有操作按顺序记录，Leader 负责把日志复制到所有节点

### 选举流程

```
初始：所有节点都是 Follower
       ↓ 选举超时（150-300ms 随机，防止同时发起）
节点变成 Candidate，给自己投一票，向所有 Peer 请求投票
       ↓ 拿到多数票（>50%）
变成 Leader，开始发心跳（每 50ms）
       ↓ 如果发现更高 Term
自动降级为 Follower
```

### 日志复制流程

```
客户端请求 → Leader 追加到本地日志
       ↓ Leader 通过心跳把新日志发给所有 Follower
Follower 追加日志，回复 success
       ↓ 多数 Follower 确认
Leader 提交日志（commit），通知 Follower 也提交
       ↓
所有节点的状态机应用这条日志（apply）
```

### 类型定义

```typescript
type NodeState = "follower" | "candidate" | "leader";

interface RaftNode {
  id: string;
  state: NodeState;
  currentTerm: number;       // 当前任期
  votedFor: string | null;   // 本任期投给了谁
  log: LogEntry[];           // 操作日志
  commitIndex: number;       // 已提交的最高日志索引
  lastApplied: number;       // 已应用的最高日志索引
}

interface LogEntry {
  term: number;              // 写入时的任期
  command: string;           // 操作类型
  data: unknown;             // 操作数据
}
```

### API

```typescript
const raft = new RaftConsensus({
  nodeId: "agent-1",
  peers: ["agent-2", "agent-3"],
  electionTimeoutRange: [150, 300],  // ms
  heartbeatInterval: 50,              // ms
  onBecomeLeader: () => { /* 我当选了 */ },
  onApplyEntry: (entry) => { /* 执行这条日志 */ },
  sendRpc: async (peerId, method, data) => { /* 发消息给 peer */ },
});

raft.start();                        // 启动节点
raft.propose("set", { key: "k1", value: "v1" });  // 提议新操作（仅 Leader 可调用）
raft.stop();                         // 停止节点
```

### RPC 处理（被其他节点调用）

```typescript
// 处理投票请求
raft.handleRequestVote(request: VoteRequest): VoteResponse

// 处理日志追加/心跳
raft.handleAppendEntries(request: AppendEntriesRequest): AppendEntriesResponse
```

### 安全保证

- **选举安全**：每个 Term 最多一个 Leader
- **日志匹配**：两个节点同一索引同一 Term 的日志条目一定相同
- **只提交当前 Term 的日志**：防止已提交的日志被覆盖
- **高 Term 发现立即降级**：防止脑裂

### 测试集群

```typescript
import { runTestCluster } from "./consensus/raft.js";

const result = await runTestCluster(3, 3);
// 3 个节点，提议 3 条日志
// result.leaderId: 选出的 Leader
// result.nodes: 每个节点的状态
// result.appliedEntries: 所有节点应用的日志
```

---

## 2. BFT — 拜占庭容错

**论文来源**：Castro & Liskov, 1999 (PBFT)

**用大白话说**：4 个 Agent 里有 1 个出了 bug 给出错误结果。BFT 让剩下 3 个投票，多数一致的结果胜出。坏结果被丢弃。需要至少 3f+1 个节点才能容忍 f 个坏节点。

### 三阶段协议

```
Phase 1: Pre-Prepare（主节点广播）
  主节点收到请求 → 分配序列号 → 广播给所有副本
       ↓
Phase 2: Prepare（副本交换）
  每个副本确认请求有效 → 互相通知"我准备好了"
  达到 2f+1 个 Prepare 消息 → 进入下一阶段
       ↓
Phase 3: Commit（最终确认）
  每个副本广播 Commit 消息
  达到 2f+1 个 Commit 消息 → 请求被提交
```

### 类型定义

```typescript
interface BftNode {
  id: string;
  isPrimary: boolean;         // 是否是主节点
  view: number;               // 视图编号（主节点轮换时递增）
  sequence: number;           // 序列号
  log: BftEntry[];            // 日志
  prepared: Map<string, Set<string>>;   // digest → 哪些节点已 prepare
  committed: Map<string, Set<string>>;  // digest → 哪些节点已 commit
}

interface BftEntry {
  sequence: number;
  view: number;
  digest: string;             // 数据哈希
  data: unknown;
  phase: "pre-prepare" | "prepare" | "commit" | "reply";
}
```

### API

```typescript
const bft = new BftConsensus(
  ["agent-1", "agent-2", "agent-3", "agent-4"],  // 4 个节点
  1,                                               // 最多容忍 1 个坏节点
  (data) => { /* 数据被提交 */ }
);

// 完整三阶段
bft.propose({ action: "update", key: "k1" });  // 返回 true/false

// 或手动分阶段
const digest = bft.prePrepare(data);   // Phase 1
const prepared = bft.prepare(digest);   // Phase 2
const committed = bft.commit(digest);   // Phase 3

// 主节点轮换
bft.viewChange();  // 返回新主节点 ID
```

### 容错公式

```
总节点数 N >= 3f + 1

f=1: 需要 4 个节点，容忍 1 个坏的
f=2: 需要 7 个节点，容忍 2 个坏的
```

---

## 3. Gossip — 流言传播

**用大白话说**：Agent A 发现了一个事实。怎么让 B、C、D、E 都知道？Gossip 协议让每个 Agent 每轮随机挑几个 Peer 同步最新信息。像八卦一样传播，几轮后所有人都知道了。

### 工作方式

```
Round 1: A 知道 key1=v1
  A 随机选 B, C 同步 → B, C 也知道了
Round 2:
  A 选 D, E 同步
  B 选 C, D 同步
  C 选 A, E 同步
  → 所有人都知道了（收敛）
```

### 类型定义

```typescript
interface GossipEntry {
  value: unknown;
  version: number;     // 版本号，越大越新
  timestamp: number;
  origin: string;      // 最初写入这个 key 的节点
}

interface GossipNode {
  id: string;
  state: Map<string, GossipEntry>;
  peers: string[];
}
```

### API

```typescript
const gossip = new GossipProtocol(
  ["agent-1", "agent-2", "agent-3", "agent-4", "agent-5"],
  2  // fanout: 每轮每个节点联系 2 个 peer
);

// 写入
gossip.set("agent-1", "discovered_bug", "memory leak in auth module");

// 手动跑一轮传播
const updates = gossip.gossipRound();  // 返回本轮更新次数

// 自动传播直到收敛
const stats = gossip.converge(20);     // 最多 20 轮
// stats.rounds: 实际跑了几轮
// stats.converged: 是否全部收敛
// stats.totalUpdates: 总更新次数

// 读取（任何节点都能读，收敛后结果一致）
gossip.get("agent-5", "discovered_bug");  // "memory leak in auth module"

// 检查收敛
gossip.isConverged("discovered_bug");    // true/false
gossip.isFullyConverged();               // 所有 key 都收敛了吗
```

### 合并规则

同一个 key 在两个节点有不同值时，**版本号高的胜出**。

---

## 4. CRDT — 无冲突合并

**用大白话说**：两个 Agent 各自改了数据，互不通信。等它们碰面同步时，CRDT 能自动合并，不需要锁、不需要协调、不会冲突。

三种数据结构：

### 4.1 GCounter（只增计数器）

Agent A 加了 5，Agent B 加了 7。合并后：12。

```typescript
const counterA = new GCounter();
const counterB = new GCounter();

counterA.increment("agent-A", 5);
counterA.increment("agent-A", 3);  // A 总共 +8
counterB.increment("agent-B", 7);  // B 总共 +7

counterA.merge(counterB);
counterA.value();  // 15
```

**原理**：每个节点维护自己的计数。合并时取每个节点的 max。

### 4.2 LWWRegister（最后写入胜出寄存器）

Agent A 在 t=100 写了 "hello"，Agent B 在 t=200 写了 "world"。合并后："world"（时间戳更大的赢）。

```typescript
const regA = new LWWRegister<string>();
const regB = new LWWRegister<string>();

regA.set("agent-A", "hello", 100);
regB.set("agent-B", "world", 200);

regA.merge(regB);
regA.value;  // "world"（t=200 > t=100）
```

**平局处理**：时间戳相同时，节点 ID 字典序大的赢。

### 4.3 ORSet（可观察删除集合）

Agent A 加了 "apple" 和 "banana"，Agent B 加了 "cherry"。合并后 A 删了 "banana"。最终：["apple", "cherry"]。

```typescript
const setA = new ORSet<string>();
const setB = new ORSet<string>();

setA.add("agent-A", "apple");
setA.add("agent-A", "banana");
setB.add("agent-B", "cherry");

setA.merge(setB);          // ["apple", "banana", "cherry"]
setA.remove("banana");     // ["apple", "cherry"]
```

**原理**：每次 add 生成唯一 tag。remove 记录 tag 而不是值。合并时 add 和 remove 的 tag 各自合并，最终只保留"被 add 但未被 remove"的元素。这避免了"并发 add 和 remove 同一元素"时的歧义。

---

## 测试

```bash
bun test src/__tests__/consensus.test.ts
```

15 个测试用例：

| 测试 | 验证什么 |
|------|---------|
| Raft node starts as follower | 初始角色正确 |
| Raft node has correct initial state | Term=0, 非 Leader, 空日志 |
| BFT reaches consensus | 4 节点 1 容错，提议成功 |
| BFT rejects insufficient node count | 节点不够则抛异常 |
| BFT view change rotates primary | 主节点轮换 |
| Gossip converges | 5 节点传播后收敛 |
| Gossip propagates multiple keys | 多 key 都能传到所有节点 |
| GCounter increment + merge | 计数合并正确 |
| GCounter rejects negative | 只增不减 |
| LWWRegister last writer wins | 晚写入的胜出 |
| LWWRegister earlier write no overwrite | 早写入的不会覆盖 |
| ORSet add and remove | 增删正确 |
| ORSet has/size | 查询正确 |

CLI 快速测试：

```bash
apex consensus test          # Raft: 3 节点, 3 条日志
apex consensus test-bft      # BFT: 4 节点, 3 个提议
apex consensus test-gossip   # Gossip: 5 节点, 3 个 key
apex consensus test-crdt     # CRDT: GCounter + LWW + ORSet
apex consensus test-all      # 全部跑一遍
```

---

## 计划接入方式（Phase 3）

| 算法 | 接入目标 | 具体用法 |
|------|---------|---------|
| CRDT（第一个接） | `memory.json` 多 Agent 同时写入 | 用 ORSet 管理 facts 集合，用 LWWRegister 管理单值 fact。Agent 各自写本地副本，定期 merge |
| Gossip（第二个接） | Agent 间传播发现 | Agent A 调试时发现一个模式，Gossip 传给 Agent B（在做另一个任务但涉及同一个模块） |
| Raft（最后接） | Orchestrator Leader 选举 | 多个 Orchestrator 实例跑在不同机器上，Raft 选一个 Leader 负责分配任务 |
| BFT | Agent 输出可靠性投票 | 3 个 Agent 独立审查同一段代码，BFT 投票决定最终结论（容忍 1 个 Agent 给出错误判断） |

### 当前限制

所有算法目前是**同一进程内的模拟**。节点之间通过内存直接调用方法，不是真正的网络通信。

接入生产需要：
1. 进程间通信层（WebSocket/HTTP/Unix socket）
2. 序列化/反序列化（JSON over wire）
3. 节点发现（哪些 Agent 在线）
4. 故障检测（心跳超时 → 节点离线）

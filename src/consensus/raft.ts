/**
 * Raft Consensus Protocol implementation for distributed leader election
 * among multiple agent processes.
 *
 * Based on the Raft paper (Ongaro & Ousterhout, 2014).
 * Supports leader election, log replication, and heartbeats.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NodeState = "follower" | "candidate" | "leader";

export interface RaftNode {
  id: string;
  state: NodeState;
  currentTerm: number;
  votedFor: string | null;
  log: LogEntry[];
  commitIndex: number;
  lastApplied: number;
}

export interface LogEntry {
  term: number;
  command: string;
  data: unknown;
}

export interface VoteRequest {
  term: number;
  candidateId: string;
  lastLogIndex: number;
  lastLogTerm: number;
}

export interface VoteResponse {
  term: number;
  voteGranted: boolean;
}

export interface AppendEntriesRequest {
  term: number;
  leaderId: string;
  prevLogIndex: number;
  prevLogTerm: number;
  entries: LogEntry[];
  leaderCommit: number;
}

export interface AppendEntriesResponse {
  term: number;
  success: boolean;
}

export interface RaftConsensusOptions {
  nodeId: string;
  peers: string[];
  onBecomeLeader?: () => void;
  onApplyEntry?: (entry: LogEntry) => void;
  sendRpc?: (peerId: string, method: string, data: unknown) => Promise<unknown>;
  /** Election timeout range in ms. Default: [150, 300]. */
  electionTimeoutRange?: [number, number];
  /** Heartbeat interval in ms. Default: 50. */
  heartbeatInterval?: number;
}

// ---------------------------------------------------------------------------
// RaftConsensus
// ---------------------------------------------------------------------------

export class RaftConsensus {
  private node: RaftNode;
  private peers: string[];
  private electionTimeout: number;
  private heartbeatInterval: number;
  private electionTimeoutRange: [number, number];
  private electionTimer: Timer | null = null;
  private heartbeatTimer: Timer | null = null;
  private votes: Map<string, boolean> = new Map();

  // Next index to send to each follower (leader state).
  private nextIndex: Map<string, number> = new Map();
  // Highest log index known to be replicated on each follower.
  private matchIndex: Map<string, number> = new Map();

  // Callbacks
  private onBecomeLeader?: () => void;
  private onApplyEntry?: (entry: LogEntry) => void;
  private sendRpc?: (
    peerId: string,
    method: string,
    data: unknown,
  ) => Promise<unknown>;

  constructor(options: RaftConsensusOptions) {
    this.node = {
      id: options.nodeId,
      state: "follower",
      currentTerm: 0,
      votedFor: null,
      log: [],
      commitIndex: -1,
      lastApplied: -1,
    };
    this.peers = options.peers;
    this.electionTimeoutRange = options.electionTimeoutRange ?? [150, 300];
    this.electionTimeout = this.randomElectionTimeout();
    this.heartbeatInterval = options.heartbeatInterval ?? 50;
    this.onBecomeLeader = options.onBecomeLeader;
    this.onApplyEntry = options.onApplyEntry;
    this.sendRpc = options.sendRpc;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Start the node (begins as follower with election timer). */
  start() {
    this.resetElectionTimer();
  }

  /** Stop the node (clears all timers). */
  stop() {
    if (this.electionTimer) clearTimeout(this.electionTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.electionTimer = null;
    this.heartbeatTimer = null;
  }

  // -------------------------------------------------------------------------
  // Election timer
  // -------------------------------------------------------------------------

  private randomElectionTimeout(): number {
    const [min, max] = this.electionTimeoutRange;
    return min + Math.random() * (max - min);
  }

  /** Reset election timer (called on heartbeat receipt or vote grant). */
  private resetElectionTimer() {
    if (this.electionTimer) clearTimeout(this.electionTimer);
    this.electionTimeout = this.randomElectionTimeout();
    this.electionTimer = setTimeout(
      () => this.startElection(),
      this.electionTimeout,
    );
  }

  // -------------------------------------------------------------------------
  // Election
  // -------------------------------------------------------------------------

  /** Transition to candidate and request votes from all peers. */
  private async startElection() {
    this.node.state = "candidate";
    this.node.currentTerm++;
    this.node.votedFor = this.node.id;
    this.votes.clear();
    this.votes.set(this.node.id, true);

    const lastLogIndex = this.node.log.length - 1;
    const lastLogTerm =
      lastLogIndex >= 0 ? this.node.log[lastLogIndex].term : 0;

    const request: VoteRequest = {
      term: this.node.currentTerm,
      candidateId: this.node.id,
      lastLogIndex,
      lastLogTerm,
    };

    // Check if we already have a majority (single-node cluster).
    if (this.hasMajorityVotes()) {
      this.becomeLeader();
      return;
    }

    // Request votes from all peers in parallel.
    const promises = this.peers.map(async (peerId) => {
      try {
        const response = (await this.sendRpc?.(
          peerId,
          "requestVote",
          request,
        )) as VoteResponse;
        if (response) this.handleVoteResponse(peerId, response);
      } catch {
        // Peer unreachable, ignore.
      }
    });

    await Promise.allSettled(promises);

    // If still a candidate after all responses, restart election timer.
    if (this.node.state === "candidate") {
      this.resetElectionTimer();
    }
  }

  private handleVoteResponse(peerId: string, response: VoteResponse) {
    // If we discover a higher term, step down immediately.
    if (response.term > this.node.currentTerm) {
      this.stepDown(response.term);
      return;
    }

    // Ignore stale responses or if we're no longer a candidate.
    if (this.node.state !== "candidate") return;
    if (response.term !== this.node.currentTerm) return;

    if (response.voteGranted) {
      this.votes.set(peerId, true);
      if (this.hasMajorityVotes()) {
        this.becomeLeader();
      }
    }
  }

  private hasMajorityVotes(): boolean {
    const totalNodes = this.peers.length + 1; // peers + self
    const votesNeeded = Math.floor(totalNodes / 2) + 1;
    return this.votes.size >= votesNeeded;
  }

  // -------------------------------------------------------------------------
  // Leader
  // -------------------------------------------------------------------------

  private becomeLeader() {
    this.node.state = "leader";
    if (this.electionTimer) {
      clearTimeout(this.electionTimer);
      this.electionTimer = null;
    }

    // Initialize leader-specific volatile state.
    const nextIdx = this.node.log.length;
    for (const peerId of this.peers) {
      this.nextIndex.set(peerId, nextIdx);
      this.matchIndex.set(peerId, -1);
    }

    // Start sending heartbeats immediately, then on interval.
    this.sendHeartbeats();
    this.heartbeatTimer = setInterval(
      () => this.sendHeartbeats(),
      this.heartbeatInterval,
    );

    this.onBecomeLeader?.();
  }

  private async sendHeartbeats() {
    if (this.node.state !== "leader") return;

    for (const peerId of this.peers) {
      const nextIdx = this.nextIndex.get(peerId) ?? this.node.log.length;
      const prevLogIndex = nextIdx - 1;
      const prevLogTerm =
        prevLogIndex >= 0 ? this.node.log[prevLogIndex].term : 0;

      // Send any new entries the follower hasn't seen yet.
      const entries = this.node.log.slice(nextIdx);

      const request: AppendEntriesRequest = {
        term: this.node.currentTerm,
        leaderId: this.node.id,
        prevLogIndex,
        prevLogTerm,
        entries,
        leaderCommit: this.node.commitIndex,
      };

      // Fire-and-forget; handle response asynchronously.
      this.sendRpc?.(peerId, "appendEntries", request)
        .then((resp) => {
          if (resp) {
            this.handleAppendEntriesResponse(
              peerId,
              resp as AppendEntriesResponse,
              nextIdx,
              entries.length,
            );
          }
        })
        .catch(() => {
          // Peer unreachable; will retry on next heartbeat.
        });
    }
  }

  private handleAppendEntriesResponse(
    peerId: string,
    response: AppendEntriesResponse,
    sentNextIndex: number,
    entriesSent: number,
  ) {
    if (response.term > this.node.currentTerm) {
      this.stepDown(response.term);
      return;
    }

    if (this.node.state !== "leader") return;

    if (response.success) {
      // Update nextIndex and matchIndex for the follower.
      const newMatchIndex = sentNextIndex + entriesSent - 1;
      if (newMatchIndex >= 0) {
        this.nextIndex.set(peerId, newMatchIndex + 1);
        this.matchIndex.set(peerId, newMatchIndex);
      }
      // Try to advance commit index.
      this.advanceCommitIndex();
    } else {
      // Decrement nextIndex and retry on next heartbeat.
      const current = this.nextIndex.get(peerId) ?? 1;
      this.nextIndex.set(peerId, Math.max(0, current - 1));
    }
  }

  /** Advance commitIndex if a majority of matchIndex values have caught up. */
  private advanceCommitIndex() {
    for (let n = this.node.log.length - 1; n > this.node.commitIndex; n--) {
      // Only commit entries from the current term (Raft safety property).
      if (this.node.log[n].term !== this.node.currentTerm) continue;

      // Count replicas (self + followers with matchIndex >= n).
      let replicaCount = 1; // self
      for (const peerId of this.peers) {
        const mi = this.matchIndex.get(peerId) ?? -1;
        if (mi >= n) replicaCount++;
      }

      const totalNodes = this.peers.length + 1;
      if (replicaCount > totalNodes / 2) {
        this.node.commitIndex = n;
        this.applyCommitted();
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step down
  // -------------------------------------------------------------------------

  /** Revert to follower state when a higher term is discovered. */
  private stepDown(term: number) {
    this.node.state = "follower";
    this.node.currentTerm = term;
    this.node.votedFor = null;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.resetElectionTimer();
  }

  // -------------------------------------------------------------------------
  // RPC handlers (called by the transport layer)
  // -------------------------------------------------------------------------

  /** Handle an incoming RequestVote RPC. */
  handleRequestVote(request: VoteRequest): VoteResponse {
    // Step down if the request has a higher term.
    if (request.term > this.node.currentTerm) {
      this.stepDown(request.term);
    }

    // Reject if stale term.
    if (request.term < this.node.currentTerm) {
      return { term: this.node.currentTerm, voteGranted: false };
    }

    // Check whether we can vote for this candidate.
    const canVote =
      this.node.votedFor === null ||
      this.node.votedFor === request.candidateId;

    // Log completeness check: candidate's log must be at least as up-to-date.
    const lastLogIndex = this.node.log.length - 1;
    const lastLogTerm =
      lastLogIndex >= 0 ? this.node.log[lastLogIndex].term : 0;
    const logOk =
      request.lastLogTerm > lastLogTerm ||
      (request.lastLogTerm === lastLogTerm &&
        request.lastLogIndex >= lastLogIndex);

    if (canVote && logOk) {
      this.node.votedFor = request.candidateId;
      this.resetElectionTimer();
      return { term: this.node.currentTerm, voteGranted: true };
    }

    return { term: this.node.currentTerm, voteGranted: false };
  }

  /** Handle an incoming AppendEntries RPC (heartbeat or log replication). */
  handleAppendEntries(
    request: AppendEntriesRequest,
  ): AppendEntriesResponse {
    // Step down if the request has a higher term.
    if (request.term > this.node.currentTerm) {
      this.stepDown(request.term);
    }

    // Reject if stale term.
    if (request.term < this.node.currentTerm) {
      return { term: this.node.currentTerm, success: false };
    }

    // Valid leader heartbeat/append; reset election timer.
    this.resetElectionTimer();
    this.node.state = "follower";

    // Log consistency check: verify prevLogIndex/prevLogTerm.
    if (request.prevLogIndex >= 0) {
      if (request.prevLogIndex >= this.node.log.length) {
        return { term: this.node.currentTerm, success: false };
      }
      if (this.node.log[request.prevLogIndex].term !== request.prevLogTerm) {
        // Conflict: truncate log from the conflicting entry onward.
        this.node.log.splice(request.prevLogIndex);
        return { term: this.node.currentTerm, success: false };
      }
    }

    // Append new entries (handling potential overwrites).
    if (request.entries.length > 0) {
      const insertAt = request.prevLogIndex + 1;
      for (let i = 0; i < request.entries.length; i++) {
        const logIdx = insertAt + i;
        if (logIdx < this.node.log.length) {
          // Overwrite conflicting entries.
          if (this.node.log[logIdx].term !== request.entries[i].term) {
            this.node.log.splice(logIdx);
            this.node.log.push(...request.entries.slice(i));
            break;
          }
        } else {
          // Append remaining entries.
          this.node.log.push(...request.entries.slice(i));
          break;
        }
      }
    }

    // Update commit index.
    if (request.leaderCommit > this.node.commitIndex) {
      this.node.commitIndex = Math.min(
        request.leaderCommit,
        this.node.log.length - 1,
      );
      this.applyCommitted();
    }

    return { term: this.node.currentTerm, success: true };
  }

  // -------------------------------------------------------------------------
  // Log application
  // -------------------------------------------------------------------------

  /** Propose a new entry (leader only). Returns false if not the leader. */
  propose(command: string, data: unknown): boolean {
    if (this.node.state !== "leader") return false;
    this.node.log.push({
      term: this.node.currentTerm,
      command,
      data,
    });
    // Immediately attempt replication via next heartbeat.
    this.sendHeartbeats();
    return true;
  }

  /** Apply all committed but unapplied log entries. */
  private applyCommitted() {
    while (this.node.lastApplied < this.node.commitIndex) {
      this.node.lastApplied++;
      const entry = this.node.log[this.node.lastApplied];
      if (entry) {
        this.onApplyEntry?.(entry);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Public getters
  // -------------------------------------------------------------------------

  get state(): NodeState {
    return this.node.state;
  }

  get term(): number {
    return this.node.currentTerm;
  }

  get isLeader(): boolean {
    return this.node.state === "leader";
  }

  get nodeId(): string {
    return this.node.id;
  }

  get logLength(): number {
    return this.node.log.length;
  }

  get committed(): number {
    return this.node.commitIndex;
  }

  get applied(): number {
    return this.node.lastApplied;
  }

  /** Return a snapshot of the full node state (for debugging/testing). */
  getNodeSnapshot(): Readonly<RaftNode> {
    return { ...this.node, log: [...this.node.log] };
  }
}

// ---------------------------------------------------------------------------
// In-process test cluster (used by `apex consensus test`)
// ---------------------------------------------------------------------------

export interface TestClusterResult {
  leaderId: string | null;
  leaderTerm: number;
  nodes: Array<{
    id: string;
    state: NodeState;
    term: number;
    logLength: number;
    commitIndex: number;
  }>;
  appliedEntries: Array<{ nodeId: string; entry: LogEntry }>;
}

/**
 * Spin up N in-process Raft nodes, elect a leader, propose entries,
 * and return the result. Used for testing/demo purposes.
 */
export async function runTestCluster(
  nodeCount: number = 3,
  entriesToPropose: number = 3,
): Promise<TestClusterResult> {
  const nodeIds = Array.from({ length: nodeCount }, (_, i) => `node-${i + 1}`);
  const nodes = new Map<string, RaftConsensus>();
  const appliedEntries: Array<{ nodeId: string; entry: LogEntry }> = [];
  let leaderId: string | null = null;

  // Build an in-process RPC transport: direct method calls between nodes.
  const sendRpc = async (
    peerId: string,
    method: string,
    data: unknown,
  ): Promise<unknown> => {
    const target = nodes.get(peerId);
    if (!target) return null;

    // Simulate small network delay.
    await new Promise((r) => setTimeout(r, 1 + Math.random() * 5));

    if (method === "requestVote") {
      return target.handleRequestVote(data as VoteRequest);
    }
    if (method === "appendEntries") {
      return target.handleAppendEntries(data as AppendEntriesRequest);
    }
    return null;
  };

  // Create all nodes.
  for (const id of nodeIds) {
    const peers = nodeIds.filter((nid) => nid !== id);
    const node = new RaftConsensus({
      nodeId: id,
      peers,
      electionTimeoutRange: [100, 250],
      heartbeatInterval: 30,
      onBecomeLeader: () => {
        leaderId = id;
      },
      onApplyEntry: (entry) => {
        appliedEntries.push({ nodeId: id, entry });
      },
      sendRpc,
    });
    nodes.set(id, node);
  }

  // Start all nodes.
  for (const node of nodes.values()) {
    node.start();
  }

  // Wait for leader election (max 3 seconds).
  const electionDeadline = Date.now() + 3000;
  while (!leaderId && Date.now() < electionDeadline) {
    await new Promise((r) => setTimeout(r, 50));
  }

  if (!leaderId) {
    // Stop all nodes and return failure.
    for (const node of nodes.values()) node.stop();
    return {
      leaderId: null,
      leaderTerm: 0,
      nodes: nodeIds.map((id) => {
        const n = nodes.get(id)!;
        return {
          id,
          state: n.state,
          term: n.term,
          logLength: n.logLength,
          commitIndex: n.committed,
        };
      }),
      appliedEntries,
    };
  }

  // Propose entries via the leader.
  const leader = nodes.get(leaderId)!;
  for (let i = 1; i <= entriesToPropose; i++) {
    leader.propose("set", { key: `k${i}`, value: `v${i}` });
  }

  // Wait for replication (max 2 seconds).
  const replicationDeadline = Date.now() + 2000;
  while (Date.now() < replicationDeadline) {
    await new Promise((r) => setTimeout(r, 50));
    // Check if all nodes have applied all entries.
    const allApplied = nodeIds.every((id) => {
      const n = nodes.get(id)!;
      return n.applied >= entriesToPropose - 1;
    });
    if (allApplied) break;
  }

  // Collect results.
  const result: TestClusterResult = {
    leaderId,
    leaderTerm: leader.term,
    nodes: nodeIds.map((id) => {
      const n = nodes.get(id)!;
      return {
        id,
        state: n.state,
        term: n.term,
        logLength: n.logLength,
        commitIndex: n.committed,
      };
    }),
    appliedEntries,
  };

  // Stop all nodes.
  for (const node of nodes.values()) {
    node.stop();
  }

  return result;
}

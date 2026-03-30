/**
 * Simplified PBFT (Practical Byzantine Fault Tolerance) implementation.
 *
 * Models the three-phase protocol (pre-prepare, prepare, commit) for a
 * cluster of nodes where up to `f` may be faulty.  Consensus requires
 * at least 3f + 1 total nodes.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BftNode {
  id: string;
  isPrimary: boolean;
  view: number;
  sequence: number;
  log: BftEntry[];
  prepared: Map<string, Set<string>>; // digest -> set of node IDs
  committed: Map<string, Set<string>>;
}

export interface BftEntry {
  sequence: number;
  view: number;
  digest: string;
  data: unknown;
  phase: "pre-prepare" | "prepare" | "commit" | "reply";
}

// ---------------------------------------------------------------------------
// BftConsensus
// ---------------------------------------------------------------------------

export class BftConsensus {
  private nodes: Map<string, BftNode>;
  private f: number; // max faulty nodes
  private onCommit?: (data: unknown) => void;

  constructor(
    nodeIds: string[],
    maxFaulty: number,
    onCommit?: (data: unknown) => void,
  ) {
    if (nodeIds.length < 3 * maxFaulty + 1) {
      throw new Error(
        `Need at least ${3 * maxFaulty + 1} nodes for f=${maxFaulty}, got ${nodeIds.length}`,
      );
    }

    this.f = maxFaulty;
    this.nodes = new Map();
    this.onCommit = onCommit;

    for (const [i, id] of nodeIds.entries()) {
      this.nodes.set(id, {
        id,
        isPrimary: i === 0,
        view: 0,
        sequence: 0,
        log: [],
        prepared: new Map(),
        committed: new Map(),
      });
    }
  }

  // -----------------------------------------------------------------------
  // Phase 1: Pre-Prepare (primary broadcasts)
  // -----------------------------------------------------------------------

  prePrepare(data: unknown): string {
    const primary = [...this.nodes.values()].find((n) => n.isPrimary);
    if (!primary) throw new Error("No primary node");

    const seq = ++primary.sequence;
    const digest = this.hash(data);

    const entry: BftEntry = {
      sequence: seq,
      view: primary.view,
      digest,
      data,
      phase: "pre-prepare",
    };
    primary.log.push(entry);

    // Broadcast to all replicas
    for (const [id, node] of this.nodes) {
      if (id === primary.id) continue;
      node.log.push({ ...entry });
      if (!node.prepared.has(digest)) node.prepared.set(digest, new Set());
      node.prepared.get(digest)!.add(id);
    }

    return digest;
  }

  // -----------------------------------------------------------------------
  // Phase 2: Prepare (replicas exchange)
  // -----------------------------------------------------------------------

  prepare(digest: string): boolean {
    for (const [id, node] of this.nodes) {
      if (!node.prepared.has(digest)) node.prepared.set(digest, new Set());
      // Each node records all other nodes' prepare messages
      for (const [otherId] of this.nodes) {
        if (otherId !== id) node.prepared.get(digest)!.add(otherId);
      }
    }

    // Quorum check: need 2f + 1 prepares (including own)
    const quorum = 2 * this.f + 1;
    return [...this.nodes.values()].every(
      (n) => (n.prepared.get(digest)?.size || 0) >= quorum - 1,
    );
  }

  // -----------------------------------------------------------------------
  // Phase 3: Commit
  // -----------------------------------------------------------------------

  commit(digest: string): boolean {
    for (const [id, node] of this.nodes) {
      if (!node.committed.has(digest)) node.committed.set(digest, new Set());
      for (const [otherId] of this.nodes) {
        node.committed.get(digest)!.add(otherId);
      }
    }

    const quorum = 2 * this.f + 1;
    const allCommitted = [...this.nodes.values()].every(
      (n) => (n.committed.get(digest)?.size || 0) >= quorum,
    );

    if (allCommitted) {
      const entry = [...this.nodes.values()][0].log.find(
        (e) => e.digest === digest,
      );
      if (entry) this.onCommit?.(entry.data);
    }

    return allCommitted;
  }

  // -----------------------------------------------------------------------
  // Full protocol helper
  // -----------------------------------------------------------------------

  propose(data: unknown): boolean {
    const digest = this.prePrepare(data);
    const prepared = this.prepare(digest);
    if (!prepared) return false;
    return this.commit(digest);
  }

  // -----------------------------------------------------------------------
  // View change (simplified)
  // -----------------------------------------------------------------------

  viewChange(): string {
    // Rotate primary to next node
    const nodeList = [...this.nodes.values()];
    const currentPrimary = nodeList.find((n) => n.isPrimary);
    if (currentPrimary) currentPrimary.isPrimary = false;

    const currentIdx = currentPrimary
      ? nodeList.indexOf(currentPrimary)
      : -1;
    const nextIdx = (currentIdx + 1) % nodeList.length;
    nodeList[nextIdx].isPrimary = true;

    for (const node of nodeList) {
      node.view++;
    }

    return nodeList[nextIdx].id;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private hash(data: unknown): string {
    return Bun.hash(JSON.stringify(data)).toString(16);
  }

  get nodeCount(): number {
    return this.nodes.size;
  }

  get maxFaulty(): number {
    return this.f;
  }

  get primaryId(): string | undefined {
    return [...this.nodes.values()].find((n) => n.isPrimary)?.id;
  }

  getNode(id: string): BftNode | undefined {
    return this.nodes.get(id);
  }
}

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

export function runBftTest(nodeCount: number = 4, proposals: number = 3) {
  const f = Math.floor((nodeCount - 1) / 3);
  const ids = Array.from({ length: nodeCount }, (_, i) => `bft-${i + 1}`);
  const committed: unknown[] = [];

  const bft = new BftConsensus(ids, f, (data) => committed.push(data));

  const results: { data: unknown; success: boolean }[] = [];
  for (let i = 0; i < proposals; i++) {
    const data = { op: "set", key: `k${i}`, value: i * 10 };
    const ok = bft.propose(data);
    results.push({ data, success: ok });
  }

  return {
    nodeCount,
    maxFaulty: f,
    primaryId: bft.primaryId,
    proposals: results,
    committed,
  };
}

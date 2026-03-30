/**
 * Gossip Protocol — epidemic-style state dissemination for
 * eventually-consistent data across a cluster of nodes.
 *
 * Each round, every node picks `fanout` random peers and merges state.
 * Convergence is reached when a full round produces zero updates.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GossipEntry {
  value: unknown;
  version: number;
  timestamp: number;
  origin: string; // node that first set this key
}

export interface GossipNode {
  id: string;
  state: Map<string, GossipEntry>;
  peers: string[];
}

export interface GossipStats {
  rounds: number;
  totalUpdates: number;
  converged: boolean;
}

// ---------------------------------------------------------------------------
// GossipProtocol
// ---------------------------------------------------------------------------

export class GossipProtocol {
  private nodes: Map<string, GossipNode> = new Map();
  private fanout: number;

  constructor(nodeIds: string[], fanout: number = 3) {
    this.fanout = fanout;
    for (const id of nodeIds) {
      this.nodes.set(id, {
        id,
        state: new Map(),
        peers: nodeIds.filter((p) => p !== id),
      });
    }
  }

  // -----------------------------------------------------------------------
  // Read / write
  // -----------------------------------------------------------------------

  set(nodeId: string, key: string, value: unknown): void {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error(`Unknown node: ${nodeId}`);

    const existing = node.state.get(key);
    const version = (existing?.version || 0) + 1;
    node.state.set(key, {
      value,
      version,
      timestamp: Date.now(),
      origin: nodeId,
    });
  }

  get(nodeId: string, key: string): unknown | undefined {
    return this.nodes.get(nodeId)?.state.get(key)?.value;
  }

  // -----------------------------------------------------------------------
  // Gossip round
  // -----------------------------------------------------------------------

  gossipRound(): number {
    let updates = 0;

    for (const [, node] of this.nodes) {
      const targets = this.selectPeers(node.peers, this.fanout);

      for (const targetId of targets) {
        const target = this.nodes.get(targetId);
        if (!target) continue;

        // Merge: keep the entry with the higher version
        for (const [key, entry] of node.state) {
          const existing = target.state.get(key);
          if (!existing || existing.version < entry.version) {
            target.state.set(key, { ...entry });
            updates++;
          }
        }
      }
    }

    return updates;
  }

  // -----------------------------------------------------------------------
  // Convergence helpers
  // -----------------------------------------------------------------------

  converge(maxRounds: number = 20): GossipStats {
    let totalUpdates = 0;
    for (let i = 0; i < maxRounds; i++) {
      const updates = this.gossipRound();
      totalUpdates += updates;
      if (updates === 0) {
        return { rounds: i + 1, totalUpdates, converged: true };
      }
    }
    return { rounds: maxRounds, totalUpdates, converged: false };
  }

  isConverged(key: string): boolean {
    const values = [...this.nodes.values()].map((n) => n.state.get(key));
    if (values.some((v) => !v)) return false;
    return values.every((v) => v!.version === values[0]!.version);
  }

  isFullyConverged(): boolean {
    // Collect all known keys
    const allKeys = new Set<string>();
    for (const node of this.nodes.values()) {
      for (const k of node.state.keys()) allKeys.add(k);
    }
    return [...allKeys].every((k) => this.isConverged(k));
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private selectPeers(peers: string[], count: number): string[] {
    const shuffled = [...peers].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, peers.length));
  }

  get nodeCount(): number {
    return this.nodes.size;
  }

  getNodeState(
    nodeId: string,
  ): Map<string, GossipEntry> | undefined {
    return this.nodes.get(nodeId)?.state;
  }
}

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

export function runGossipTest(
  nodeCount: number = 5,
  keyCount: number = 3,
): GossipStats & { nodeCount: number; keys: string[] } {
  const ids = Array.from({ length: nodeCount }, (_, i) => `gossip-${i + 1}`);
  const proto = new GossipProtocol(ids, 2);

  const keys: string[] = [];
  for (let k = 0; k < keyCount; k++) {
    const key = `key-${k}`;
    keys.push(key);
    // Write each key to a different node
    const writer = ids[k % ids.length];
    proto.set(writer, key, `value-${k}`);
  }

  const stats = proto.converge();

  return { ...stats, nodeCount, keys };
}

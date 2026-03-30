import { describe, test, expect } from "bun:test";
import { RaftConsensus } from "../consensus/raft.js";
import { BftConsensus } from "../consensus/bft.js";
import { GossipProtocol } from "../consensus/gossip.js";
import { GCounter, LWWRegister, ORSet } from "../consensus/crdt.js";

describe("Consensus Protocols", () => {
  test("Raft node starts as follower", () => {
    const raft = new RaftConsensus({
      nodeId: "a",
      peers: ["b", "c"],
    });
    expect(raft.state).toBe("follower");
    expect(raft.nodeId).toBe("a");
  });

  test("Raft node has correct initial state", () => {
    const raft = new RaftConsensus({
      nodeId: "x",
      peers: ["y", "z"],
    });
    expect(raft.term).toBe(0);
    expect(raft.isLeader).toBe(false);
    expect(raft.logLength).toBe(0);
    expect(raft.committed).toBe(-1);
  });

  test("BFT reaches consensus", () => {
    const committed: unknown[] = [];
    const bft = new BftConsensus(
      ["a", "b", "c", "d"],
      1,
      (data) => committed.push(data),
    );
    const result = bft.propose({ action: "test" });
    expect(result).toBe(true);
    expect(committed.length).toBe(1);
  });

  test("BFT rejects insufficient node count", () => {
    expect(() => new BftConsensus(["a", "b"], 1)).toThrow();
  });

  test("BFT view change rotates primary", () => {
    const bft = new BftConsensus(["a", "b", "c", "d"], 1);
    expect(bft.primaryId).toBe("a");
    const newPrimary = bft.viewChange();
    expect(newPrimary).toBe("b");
    expect(bft.primaryId).toBe("b");
  });

  test("Gossip converges", () => {
    const gossip = new GossipProtocol(["a", "b", "c", "d", "e"]);
    gossip.set("a", "key1", "value1");
    const stats = gossip.converge();
    expect(stats.converged).toBe(true);
    expect(stats.rounds).toBeLessThan(10);
    expect(gossip.isConverged("key1")).toBe(true);
  });

  test("Gossip propagates multiple keys", () => {
    const gossip = new GossipProtocol(["a", "b", "c", "d", "e"]);
    gossip.set("a", "k1", "v1");
    gossip.set("c", "k2", "v2");
    gossip.converge();
    expect(gossip.isConverged("k1")).toBe(true);
    expect(gossip.isConverged("k2")).toBe(true);
    expect(gossip.get("e", "k1")).toBe("v1");
    expect(gossip.get("b", "k2")).toBe("v2");
  });

  test("CRDT: GCounter", () => {
    const c1 = new GCounter();
    c1.increment("a", 3);
    const c2 = new GCounter();
    c2.increment("b", 5);
    c1.merge(c2);
    expect(c1.value()).toBe(8);
  });

  test("CRDT: GCounter rejects negative increment", () => {
    const c = new GCounter();
    expect(() => c.increment("a", -1)).toThrow();
  });

  test("CRDT: LWWRegister", () => {
    const r1 = new LWWRegister<string>();
    r1.set("a", "first", 100);
    r1.set("b", "second", 200);
    expect(r1.value).toBe("second");
  });

  test("CRDT: LWWRegister earlier write does not overwrite", () => {
    const r = new LWWRegister<string>();
    r.set("a", "later", 200);
    r.set("b", "earlier", 100);
    expect(r.value).toBe("later");
  });

  test("CRDT: ORSet add and remove", () => {
    const s = new ORSet<string>();
    s.add("a", "hello");
    s.add("b", "world");
    s.remove("hello");
    expect(s.values()).toEqual(["world"]);
  });

  test("CRDT: ORSet has/size", () => {
    const s = new ORSet<string>();
    s.add("a", "x");
    s.add("b", "y");
    expect(s.has("x")).toBe(true);
    expect(s.has("z")).toBe(false);
    expect(s.size).toBe(2);
  });
});

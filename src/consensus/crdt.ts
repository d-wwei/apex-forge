/**
 * Conflict-free Replicated Data Types (CRDTs)
 *
 * Three classic CRDTs for distributed agent state synchronisation:
 *   - GCounter  — grow-only counter
 *   - LWWRegister — last-writer-wins register
 *   - ORSet — observed-remove set
 */

// ---------------------------------------------------------------------------
// G-Counter (grow-only counter)
// ---------------------------------------------------------------------------

export class GCounter {
  private counts: Map<string, number> = new Map();

  increment(nodeId: string, amount: number = 1): void {
    if (amount < 0) throw new Error("GCounter only supports positive increments");
    this.counts.set(nodeId, (this.counts.get(nodeId) || 0) + amount);
  }

  value(): number {
    let sum = 0;
    for (const v of this.counts.values()) sum += v;
    return sum;
  }

  merge(other: GCounter): void {
    for (const [id, count] of other.counts) {
      this.counts.set(id, Math.max(this.counts.get(id) || 0, count));
    }
  }

  /** Expose internal state for inspection. */
  toJSON(): Record<string, number> {
    return Object.fromEntries(this.counts);
  }
}

// ---------------------------------------------------------------------------
// LWW-Register (Last-Writer-Wins)
// ---------------------------------------------------------------------------

export class LWWRegister<T> {
  private val: T | null = null;
  private ts: number = 0;
  private nodeId: string = "";

  set(nodeId: string, value: T, timestamp?: number): void {
    const t = timestamp || Date.now();
    // Later timestamp wins; ties broken by node ID lexicographic order
    if (t > this.ts || (t === this.ts && nodeId > this.nodeId)) {
      this.val = value;
      this.ts = t;
      this.nodeId = nodeId;
    }
  }

  get value(): T | null {
    return this.val;
  }

  get timestamp(): number {
    return this.ts;
  }

  get owner(): string {
    return this.nodeId;
  }

  merge(other: LWWRegister<T>): void {
    if (
      other.ts > this.ts ||
      (other.ts === this.ts && other.nodeId > this.nodeId)
    ) {
      this.val = other.val;
      this.ts = other.ts;
      this.nodeId = other.nodeId;
    }
  }

  toJSON(): { value: T | null; timestamp: number; nodeId: string } {
    return { value: this.val, timestamp: this.ts, nodeId: this.nodeId };
  }
}

// ---------------------------------------------------------------------------
// OR-Set (Observed-Remove Set)
// ---------------------------------------------------------------------------

export class ORSet<T> {
  private adds: Map<string, { value: T; tag: string }[]> = new Map();
  private removes: Set<string> = new Set();

  add(nodeId: string, value: T): void {
    const tag = `${nodeId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (!this.adds.has(nodeId)) this.adds.set(nodeId, []);
    this.adds.get(nodeId)!.push({ value, tag });
  }

  remove(value: T): void {
    for (const entries of this.adds.values()) {
      for (const entry of entries) {
        if (this.eq(entry.value, value)) {
          this.removes.add(entry.tag);
        }
      }
    }
  }

  has(value: T): boolean {
    for (const entries of this.adds.values()) {
      for (const entry of entries) {
        if (this.eq(entry.value, value) && !this.removes.has(entry.tag)) {
          return true;
        }
      }
    }
    return false;
  }

  values(): T[] {
    const result: T[] = [];
    const seen = new Set<string>();
    for (const entries of this.adds.values()) {
      for (const entry of entries) {
        const key = JSON.stringify(entry.value);
        if (!this.removes.has(entry.tag) && !seen.has(key)) {
          result.push(entry.value);
          seen.add(key);
        }
      }
    }
    return result;
  }

  get size(): number {
    return this.values().length;
  }

  merge(other: ORSet<T>): void {
    for (const [nodeId, entries] of other.adds) {
      if (!this.adds.has(nodeId)) this.adds.set(nodeId, []);
      const existing = new Set(this.adds.get(nodeId)!.map((e) => e.tag));
      for (const entry of entries) {
        if (!existing.has(entry.tag)) this.adds.get(nodeId)!.push(entry);
      }
    }
    for (const tag of other.removes) {
      this.removes.add(tag);
    }
  }

  private eq(a: T, b: T): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }
}

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

export function runCrdtTest() {
  // --- GCounter ---
  const c1 = new GCounter();
  const c2 = new GCounter();
  c1.increment("node-1", 5);
  c1.increment("node-1", 3);
  c2.increment("node-2", 7);
  c1.merge(c2);
  const counterResult = { c1: c1.value(), expected: 15 };

  // --- LWWRegister ---
  const r1 = new LWWRegister<string>();
  const r2 = new LWWRegister<string>();
  r1.set("node-1", "hello", 100);
  r2.set("node-2", "world", 200);
  r1.merge(r2);
  const registerResult = { value: r1.value, expected: "world" };

  // --- ORSet ---
  const s1 = new ORSet<string>();
  const s2 = new ORSet<string>();
  s1.add("node-1", "apple");
  s1.add("node-1", "banana");
  s2.add("node-2", "cherry");
  s1.merge(s2);
  s1.remove("banana");
  const setResult = {
    values: s1.values().sort(),
    expected: ["apple", "cherry"],
  };

  return {
    gcounter: { ...counterResult, pass: counterResult.c1 === counterResult.expected },
    lwwRegister: { ...registerResult, pass: registerResult.value === registerResult.expected },
    orSet: {
      ...setResult,
      pass: JSON.stringify(setResult.values) === JSON.stringify(setResult.expected),
    },
  };
}

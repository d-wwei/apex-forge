export interface Fact {
  id: string;          // "F1", "F2", ...
  content: string;
  confidence: number;  // 0.0 - 1.0
  tags: string[];
  source: string;
  created_at: string;
}

export interface MemoryStore {
  facts: Fact[];
  next_id: number;
}

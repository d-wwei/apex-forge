import { describe, test, expect, beforeEach } from "bun:test";
import {
  memoryAdd,
  memoryList,
  memorySearch,
  memoryRemove,
  memoryInject,
  memoryPrune,
} from "../state/memory.js";
import { writeJSON } from "../utils/json.js";
import { mkdirSync, rmSync } from "fs";

beforeEach(async () => {
  rmSync(".apex", { recursive: true, force: true });
  mkdirSync(".apex", { recursive: true });
  await writeJSON(".apex/memory.json", { facts: [], next_id: 1 });
});

describe("Memory System", () => {
  test("add fact with confidence", async () => {
    const fact = await memoryAdd("Test fact", 0.9, ["test"]);
    expect(fact.id).toBe("F1");
    expect(fact.confidence).toBe(0.9);
  });

  test("reject invalid confidence (too high)", async () => {
    expect(async () => await memoryAdd("Bad", 1.5)).toThrow();
  });

  test("reject invalid confidence (negative)", async () => {
    expect(async () => await memoryAdd("Bad", -0.1)).toThrow();
  });

  test("search by content", async () => {
    await memoryAdd("JWT uses RS256", 0.9, ["auth"]);
    await memoryAdd("Database is PostgreSQL", 0.8, ["db"]);
    const results = await memorySearch("JWT");
    expect(results.length).toBe(1);
    expect(results[0].content).toContain("JWT");
  });

  test("search by tag", async () => {
    await memoryAdd("Some fact", 0.9, ["auth"]);
    const results = await memorySearch("auth");
    expect(results.length).toBe(1);
  });

  test("prune removes low confidence", async () => {
    await memoryAdd("Strong", 0.9, []);
    await memoryAdd("Weak", 0.3, []);
    const result = await memoryPrune();
    expect(result.removed).toBe(1);
    expect(result.kept).toBe(1);
  });

  test("inject formats correctly", async () => {
    await memoryAdd("Test", 0.9, ["tag1"]);
    const output = await memoryInject();
    expect(output).toContain("<apex-memory>");
    expect(output).toContain("Test");
    expect(output).toContain("tag1");
  });

  test("inject returns empty string when no facts", async () => {
    const output = await memoryInject();
    expect(output).toBe("");
  });

  test("list sorts by confidence descending", async () => {
    await memoryAdd("Low", 0.5, []);
    await memoryAdd("High", 0.95, []);
    await memoryAdd("Mid", 0.7, []);
    const facts = await memoryList();
    expect(facts[0].confidence).toBe(0.95);
    expect(facts[1].confidence).toBe(0.7);
    expect(facts[2].confidence).toBe(0.5);
  });

  test("list with min confidence filter", async () => {
    await memoryAdd("Low", 0.3, []);
    await memoryAdd("High", 0.9, []);
    const facts = await memoryList(0.5);
    expect(facts.length).toBe(1);
    expect(facts[0].content).toBe("High");
  });

  test("remove fact by ID", async () => {
    await memoryAdd("To remove", 0.8, []);
    await memoryRemove("F1");
    const facts = await memoryList();
    expect(facts.length).toBe(0);
  });

  test("remove nonexistent fact throws", async () => {
    expect(async () => await memoryRemove("F999")).toThrow("Fact not found");
  });

  test("search is case-insensitive", async () => {
    await memoryAdd("PostgreSQL is the database", 0.8, []);
    const results = await memorySearch("postgresql");
    expect(results.length).toBe(1);
  });

  test("auto-increment IDs", async () => {
    const f1 = await memoryAdd("First", 0.9, []);
    const f2 = await memoryAdd("Second", 0.8, []);
    expect(f1.id).toBe("F1");
    expect(f2.id).toBe("F2");
  });
});

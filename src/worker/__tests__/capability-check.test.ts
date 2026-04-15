import { describe, test, expect } from "bun:test";
import { checkAgent, checkAllAgents } from "../capability-check.js";

describe("checkAgent", () => {
  test("returns available=true for binary in PATH (using 'ls')", async () => {
    const result = await checkAgent("ls");
    expect(result.available).toBe(true);
  });

  test("returns available=false for nonexistent binary", async () => {
    const result = await checkAgent("nonexistent-binary-xyz-12345");
    expect(result.available).toBe(false);
    expect(result.functional).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]).toContain("not found");
  });

  test("captures version when --version succeeds (using 'git')", async () => {
    const result = await checkAgent("git");
    expect(result.available).toBe(true);
    expect(result.version).toBeTruthy();
    expect(result.version!).toContain("git");
  });

  test("sets functional=true when binary exists", async () => {
    const result = await checkAgent("git");
    expect(result.functional).toBe(true);
  });

  test("issues array is empty when no problems", async () => {
    const result = await checkAgent("git");
    expect(result.issues).toEqual([]);
  });
});

describe("checkAllAgents", () => {
  // checkAllAgents runs 4 agents sequentially; some CLIs (e.g. claude) take
  // ~5 s to respond to --version, so allow enough wall time for the full pass.
  const TIMEOUT_MS = 30_000;

  test("returns entries for all 4 builtin agents", async () => {
    const results = await checkAllAgents();
    expect(Object.keys(results)).toEqual(
      expect.arrayContaining(["claude", "codex", "gemini", "opencode"])
    );
    expect(Object.keys(results)).toHaveLength(4);
  }, TIMEOUT_MS);

  test("each result has correct shape", async () => {
    const results = await checkAllAgents();
    for (const result of Object.values(results)) {
      expect(typeof result.available).toBe("boolean");
      expect(typeof result.functional).toBe("boolean");
      expect(Array.isArray(result.issues)).toBe(true);
    }
  }, TIMEOUT_MS);
});

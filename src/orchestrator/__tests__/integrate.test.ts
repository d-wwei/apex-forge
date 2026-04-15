import { describe, test, expect } from "bun:test";
import { autoIntegrate, autoMerge } from "../integrate.js";

describe("autoIntegrate", () => {
  test("returns IntegrateResult with ok field", async () => {
    const result = await autoIntegrate("nonexistent-task");
    expect(result).toHaveProperty("ok");
    expect(typeof result.ok).toBe("boolean");
    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
  });

  test("IntegrateResult reason is one of expected values", async () => {
    const result = await autoIntegrate("nonexistent-task");
    if (!result.ok && result.reason) {
      expect(["merge_conflict", "test_failure", "merge_race_retry"]).toContain(result.reason);
    }
  });
});

describe("autoMerge", () => {
  test("returns boolean", async () => {
    // autoMerge on a nonexistent branch should return false
    const result = await autoMerge("nonexistent-task");
    expect(typeof result).toBe("boolean");
    expect(result).toBe(false);
  });
});

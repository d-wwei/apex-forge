import { describe, it, expect } from "bun:test";
import {
  generateCrossModelIds,
  mergeVerdicts,
  deduplicateFindings,
} from "../cross-model.js";

describe("generateCrossModelIds", () => {
  it("generates task IDs for each agent", () => {
    const ids = generateCrossModelIds("T5", ["claude", "codex", "gemini"]);
    expect(ids).toEqual(["T5-claude", "T5-codex", "T5-gemini"]);
  });

  it("handles single agent", () => {
    const ids = generateCrossModelIds("T1", ["claude"]);
    expect(ids).toEqual(["T1-claude"]);
  });

  it("preserves task ID with hyphens", () => {
    const ids = generateCrossModelIds("T10-sub", ["codex", "gemini"]);
    expect(ids).toEqual(["T10-sub-codex", "T10-sub-gemini"]);
  });
});

describe("mergeVerdicts", () => {
  it("returns pass when all pass", () => {
    expect(mergeVerdicts({ claude: "pass", codex: "pass", gemini: "pass" })).toBe("pass");
  });

  it("returns fail when any fail (pessimistic)", () => {
    expect(mergeVerdicts({ claude: "pass", codex: "pass", gemini: "fail" })).toBe("fail");
  });

  it("returns fail when all fail", () => {
    expect(mergeVerdicts({ claude: "fail", codex: "fail" })).toBe("fail");
  });

  it("returns mixed when verdicts are mixed without fail", () => {
    expect(mergeVerdicts({ claude: "pass", codex: "mixed" })).toBe("mixed");
  });

  it("returns fail when mix includes fail", () => {
    expect(mergeVerdicts({ claude: "pass", codex: "mixed", gemini: "fail" })).toBe("fail");
  });

  it("handles single agent pass", () => {
    expect(mergeVerdicts({ claude: "pass" })).toBe("pass");
  });

  it("handles single agent fail", () => {
    expect(mergeVerdicts({ claude: "fail" })).toBe("fail");
  });
});

describe("deduplicateFindings", () => {
  it("removes exact duplicate findings", () => {
    const findings = [
      { description: "Missing null check in auth.ts", severity: "blocker" as const },
      { description: "Missing null check in auth.ts", severity: "blocker" as const },
      { description: "Unused import in utils.ts", severity: "note" as const },
    ];
    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(2);
    expect(result[0].description).toBe("Missing null check in auth.ts");
    expect(result[1].description).toBe("Unused import in utils.ts");
  });

  it("treats case-insensitive matches as duplicates", () => {
    const findings = [
      { description: "SQL injection risk", severity: "blocker" as const },
      { description: "sql injection risk", severity: "concern" as const },
    ];
    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(1);
  });

  it("preserves first occurrence on dedup", () => {
    const findings = [
      { description: "Issue A", severity: "blocker" as const, source: "claude" },
      { description: "Issue A", severity: "note" as const, source: "codex" },
    ];
    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("blocker");
    expect(result[0].source).toBe("claude");
  });

  it("returns empty for empty input", () => {
    expect(deduplicateFindings([])).toEqual([]);
  });

  it("keeps all findings when none are duplicates", () => {
    const findings = [
      { description: "Issue A", severity: "blocker" as const },
      { description: "Issue B", severity: "concern" as const },
      { description: "Issue C", severity: "note" as const },
    ];
    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(3);
  });
});

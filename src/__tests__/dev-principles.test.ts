import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PROJECT_ROOT = process.cwd();

function readFile(relativePath: string): string {
  return readFileSync(join(PROJECT_ROOT, relativePath), "utf-8");
}

describe("AC2: ADR directory and template", () => {
  test("docs/decisions/TEMPLATE.md exists", () => {
    expect(existsSync(join(PROJECT_ROOT, "docs/decisions/TEMPLATE.md"))).toBe(
      true,
    );
  });

  test("TEMPLATE.md contains required sections", () => {
    const content = readFile("docs/decisions/TEMPLATE.md");
    expect(content).toContain("## Status");
    expect(content).toContain("## Context");
    expect(content).toContain("## Decision");
    expect(content).toContain("## Rejected Alternatives");
    expect(content).toContain("## Consequences");
  });

  test("at least one example ADR exists", () => {
    const templateExists = existsSync(
      join(PROJECT_ROOT, "docs/decisions/0001-hybrid-changelog-format.md"),
    );
    expect(templateExists).toBe(true);
  });
});

describe("AC3: Biome integration", () => {
  test("biome.json exists", () => {
    expect(existsSync(join(PROJECT_ROOT, "biome.json"))).toBe(true);
  });

  test("package.json includes @biomejs/biome in devDependencies", () => {
    const pkg = JSON.parse(readFile("package.json"));
    expect(pkg.devDependencies?.["@biomejs/biome"]).toBeDefined();
  });

  test("CI workflow includes biome ci step", () => {
    const ci = readFile(".github/workflows/ci.yml");
    expect(ci).toContain("biome ci");
  });
});

describe("AC1: CONTRIBUTING.md new sections", () => {
  const sections = [
    "Dependency Policy",
    "Backward Compatibility",
    "Changelog Format",
    "Architecture Decision Records",
    "Security Principles",
    "Linting",
    "Test Requirement",
  ];

  for (const section of sections) {
    test(`contains "${section}" section`, () => {
      const content = readFile("CONTRIBUTING.md");
      expect(content).toContain(section);
    });
  }
});

describe("AC4: Brainstorm checklist additions", () => {
  test("contains Capability Audit", () => {
    const content = readFile("skill/details/brainstorm-checklist.md");
    expect(content).toContain("Capability Audit");
  });

  test("contains Evidence of Need", () => {
    const content = readFile("skill/details/brainstorm-checklist.md");
    expect(content).toContain("Evidence of Need");
  });

  test("contains Anti-Double-Counting", () => {
    const content = readFile("skill/details/brainstorm-checklist.md");
    expect(content).toContain("Anti-Double-Counting");
  });
});

describe("AC5: Brainstorm exit gate ADR check", () => {
  test("brainstorm.md exit gate references docs/decisions", () => {
    const content = readFile("skill/stages/brainstorm.md");
    expect(content).toContain("docs/decisions");
  });
});

describe("AC6: Ship CHANGELOG hybrid template", () => {
  test("ship.md Step 2 contains Added/Changed categories", () => {
    const content = readFile("skill/stages/ship.md");
    expect(content).toContain("Added");
    expect(content).toContain("Changed");
    expect(content).toContain("Fixed");
  });

  test("ship.md Step 2 mentions narrative header", () => {
    const content = readFile("skill/stages/ship.md");
    // Hybrid format requires narrative block before categories
    expect(content).toMatch(/背景|narrative|叙事/i);
  });
});

describe("AC7: CI backward compatibility test", () => {
  test("ci.yml contains backward compatibility check", () => {
    const ci = readFile(".github/workflows/ci.yml");
    expect(ci).toMatch(/backward.compat|compat.*test|CLI.*smoke/i);
  });
});

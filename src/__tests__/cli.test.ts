import { describe, test, expect, beforeEach } from "bun:test";
import { spawnSync } from "child_process";
import { rmSync, existsSync } from "fs";

const APEX = "./dist/apex-forge";

function run(
  ...args: string[]
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync(APEX, args, {
    encoding: "utf-8",
    cwd: process.cwd(),
    timeout: 15000,
  });
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exitCode: result.status ?? 1,
  };
}

beforeEach(() => {
  rmSync(".apex", { recursive: true, force: true });
});

describe("CLI Integration", () => {
  test("apex init creates directory", () => {
    const r = run("init");
    expect(r.exitCode).toBe(0);
    expect(existsSync(".apex/state.json")).toBe(true);
    expect(existsSync(".apex/tasks.json")).toBe(true);
    expect(existsSync(".apex/memory.json")).toBe(true);
  });

  test("apex version", () => {
    const r = run("version");
    expect(r.stdout).toContain("apex-forge");
  });

  test("apex task lifecycle", () => {
    run("init");
    const create = run("task", "create", "Test", "Desc");
    expect(create.stdout).toContain("T1");

    run("task", "assign", "T1");
    run("task", "start", "T1");

    // Invalid transition should fail
    const bad = run("task", "start", "T1");
    expect(bad.exitCode).toBe(1);

    run("task", "submit", "T1", "evidence");
    const verify = run("task", "verify", "T1", "pass");
    expect(verify.stdout).toContain("done");
  });

  test("apex memory lifecycle", () => {
    run("init");
    run("memory", "add", "Test fact", "0.9", "tag1");

    const list = run("memory", "list");
    expect(list.stdout).toContain("Test fact");

    const search = run("memory", "search", "Test");
    expect(search.stdout).toContain("Test fact");
  });

  test("apex status", () => {
    run("init");
    const s = run("status");
    expect(s.stdout).toContain("apex-forge");
    expect(s.stdout).toContain("idle");
  });

  test("apex consensus test-all", () => {
    run("init");
    const r = run("consensus", "test-all");
    expect(r.stdout).toContain("PASS");
    expect(r.exitCode).toBe(0);
  });

  test("apex help shows usage", () => {
    const r = run("help");
    expect(r.stdout).toContain("Usage:");
    expect(r.stdout).toContain("apex");
    expect(r.exitCode).toBe(0);
  });

  test("unknown command exits 1", () => {
    const r = run("nonexistent-command");
    expect(r.exitCode).toBe(1);
  });

  test("apex task list after init", () => {
    run("init");
    const r = run("task", "list");
    expect(r.exitCode).toBe(0);
  });

  test("apex recover on clean state", () => {
    run("init");
    const r = run("recover");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("No issues found");
  });
});

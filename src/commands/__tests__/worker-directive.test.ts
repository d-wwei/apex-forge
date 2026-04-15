import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { existsSync, mkdirSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("cmdDirective", () => {
  let tmpDir: string;
  let origCwd: string;
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;
  let exitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `apex-directive-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    origCwd = process.cwd();
    process.chdir(tmpDir);

    logSpy = spyOn(console, "log").mockImplementation(() => {});
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
    exitSpy = spyOn(process, "exit").mockImplementation((code?: number) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    process.chdir(origCwd);
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  function makeWorkerDir(taskId: string) {
    mkdirSync(join(tmpDir, ".apex", "workers", taskId), { recursive: true });
  }

  test("writes directive.json with correct structure", async () => {
    makeWorkerDir("T1");
    const { cmdDirective } = await import("../worker.js");
    await cmdDirective(["T1", "amend", "Change API endpoint to /users/import"]);

    const dirPath = join(tmpDir, ".apex", "workers", "T1", "directive.json");
    expect(existsSync(dirPath)).toBe(true);

    const data = JSON.parse(readFileSync(dirPath, "utf-8"));
    expect(data.from).toBe("plan-agent");
    expect(data.action).toBe("amend");
    expect(data.content.description).toBe("Change API endpoint to /users/import");
    expect(data.content.urgency).toBe("normal");
    expect(data.created_at).toBeDefined();
  });

  test("supports --urgent flag", async () => {
    makeWorkerDir("T2");
    const { cmdDirective } = await import("../worker.js");
    await cmdDirective(["T2", "amend", "Stop current work", "--urgent"]);

    const data = JSON.parse(readFileSync(join(tmpDir, ".apex", "workers", "T2", "directive.json"), "utf-8"));
    expect(data.content.urgency).toBe("high");
  });

  test("rejects invalid action", async () => {
    makeWorkerDir("T3");
    const { cmdDirective } = await import("../worker.js");
    await expect(cmdDirective(["T3", "invalid_action", "content"])).rejects.toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("amend"));
  });

  test("rejects missing worker directory", async () => {
    const { cmdDirective } = await import("../worker.js");
    await expect(cmdDirective(["T99", "amend", "content"])).rejects.toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("T99"));
  });

  test("requires all three arguments", async () => {
    const { cmdDirective } = await import("../worker.js");
    await expect(cmdDirective(["T1"])).rejects.toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
  });
});

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("apex orchestrate event", () => {
  let tmpDir: string;
  let origCwd: string;
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;
  let exitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tmpDir = join(
      tmpdir(),
      `apex-orch-event-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tmpDir, { recursive: true });
    origCwd = process.cwd();
    process.chdir(tmpDir);

    // Create .apex/log dir for event-log
    mkdirSync(join(tmpDir, ".apex", "log"), { recursive: true });

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
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test("cmdOrchestrateEvent writes event to state.jsonl", async () => {
    const { cmdOrchestrateEvent } = await import(
      "../commands/orchestrate-event.js"
    );
    await cmdOrchestrateEvent([
      "worker_completed",
      "--task",
      "T1",
      "--detail",
      '{"verdict":"pass"}',
    ]);

    const logPath = join(tmpDir, ".apex", "log", "state.jsonl");
    expect(existsSync(logPath)).toBe(true);

    const lines = readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines.length).toBe(1);

    const event = JSON.parse(lines[0]);
    expect(event.type).toBe("orchestration.event");
    expect(event.payload.action).toBe("worker_completed");
    expect(event.payload.task).toBe("T1");
    expect(event.payload.verdict).toBe("pass");
  });

  test("cmdOrchestrateEvent works without --task and --detail", async () => {
    const { cmdOrchestrateEvent } = await import(
      "../commands/orchestrate-event.js"
    );
    await cmdOrchestrateEvent(["user_request"]);

    const logPath = join(tmpDir, ".apex", "log", "state.jsonl");
    const lines = readFileSync(logPath, "utf-8").trim().split("\n");
    const event = JSON.parse(lines[lines.length - 1]);
    expect(event.payload.action).toBe("user_request");
    expect(event.payload.task).toBeUndefined();
  });

  test("cmdOrchestrateEvent requires action argument", async () => {
    const { cmdOrchestrateEvent } = await import(
      "../commands/orchestrate-event.js"
    );
    await expect(cmdOrchestrateEvent([])).rejects.toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
  });

  test("cmdOrchestrateEvent parses complex --detail JSON", async () => {
    const { cmdOrchestrateEvent } = await import(
      "../commands/orchestrate-event.js"
    );
    const detail = JSON.stringify({ added: ["T5"], cancelled: ["T3"] });
    await cmdOrchestrateEvent(["re_split", "--detail", detail]);

    const logPath = join(tmpDir, ".apex", "log", "state.jsonl");
    const lines = readFileSync(logPath, "utf-8").trim().split("\n");
    const event = JSON.parse(lines[lines.length - 1]);
    expect(event.payload.action).toBe("re_split");
    expect(event.payload.added).toEqual(["T5"]);
    expect(event.payload.cancelled).toEqual(["T3"]);
  });
});

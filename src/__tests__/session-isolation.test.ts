import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdInit } from "../commands/init.js";
import type { DomainEvent } from "../state/event-log.js";
import {
  _resetSessionIdCache,
  appendEvent,
  currentSessionId,
  materializeTasks,
  rebuildAndCache,
  sessionStateCachePath,
} from "../state/event-log.js";
import { getState } from "../state/state.js";
import { taskCreate } from "../state/tasks.js";

describe("session-aware state cache", () => {
  describe("T31: sessionStateCachePath", () => {
    test("returns per-session path with given session ID", () => {
      const path = sessionStateCachePath("my-session-123");
      expect(path).toBe(".apex/state.my-session-123.json");
    });

    test("returns per-session path using currentSessionId when no arg", () => {
      process.env.APEX_SESSION_ID = "test-session-abc";
      _resetSessionIdCache();
      const path = sessionStateCachePath();
      expect(path).toBe(".apex/state.test-session-abc.json");
      delete process.env.APEX_SESSION_ID;
      _resetSessionIdCache();
    });
  });

  describe("T31: _resetSessionIdCache", () => {
    test("clears cached session ID so next call generates fresh", () => {
      // Force a specific session ID
      process.env.APEX_SESSION_ID = "cached-test";
      _resetSessionIdCache();
      const id1 = currentSessionId();
      expect(id1).toBe("cached-test");

      // Clear env and reset cache — should generate a new ID
      delete process.env.APEX_SESSION_ID;
      _resetSessionIdCache();
      const id2 = currentSessionId();
      expect(id2).not.toBe("cached-test");
      expect(id2.startsWith("apex-")).toBe(true);
    });
  });

  describe("T32: currentSessionId isolation", () => {
    let origCwd: string;
    let tmpDir: string;

    beforeEach(() => {
      origCwd = process.cwd();
      tmpDir = mkdtempSync(join(tmpdir(), "apex-sid-test-"));
      mkdirSync(join(tmpDir, ".apex"), { recursive: true });
      process.chdir(tmpDir);
      delete process.env.APEX_SESSION_ID;
      _resetSessionIdCache();
    });

    afterEach(() => {
      process.chdir(origCwd);
      _resetSessionIdCache();
      rmSync(tmpDir, { recursive: true, force: true });
    });

    test("reads session_id from state.json when no env var is set", () => {
      // Write a state.json with a known session_id
      writeFileSync(
        join(tmpDir, ".apex/state.json"),
        JSON.stringify({
          session_id: "project-session-xyz",
          current_stage: "review",
        }),
      );

      const myId = currentSessionId();
      // Should inherit the project's canonical session ID
      expect(myId).toBe("project-session-xyz");
    });

    test("generates fresh ID when state.json has no session_id", () => {
      // Write a state.json without session_id
      writeFileSync(
        join(tmpDir, ".apex/state.json"),
        JSON.stringify({ current_stage: "idle" }),
      );

      const myId = currentSessionId();
      // Should generate a fresh ID
      expect(myId.startsWith("apex-")).toBe(true);
    });

    test("generates fresh ID when no state.json exists", () => {
      // No state.json written — tmpDir/.apex/ is empty
      const myId = currentSessionId();
      expect(myId.startsWith("apex-")).toBe(true);
    });
  });

  describe("T33: rebuildAndCache dual-write", () => {
    let origCwd: string;
    let tmpDir: string;

    beforeEach(() => {
      origCwd = process.cwd();
      tmpDir = mkdtempSync(join(tmpdir(), "apex-dualwrite-"));
      mkdirSync(join(tmpDir, ".apex/log"), { recursive: true });
      process.chdir(tmpDir);
    });

    afterEach(() => {
      process.chdir(origCwd);
      delete process.env.APEX_SESSION_ID;
      _resetSessionIdCache();
      rmSync(tmpDir, { recursive: true, force: true });
    });

    test("two sessions write different stages, each reads own per-session cache", async () => {
      // Session A writes brainstorm
      process.env.APEX_SESSION_ID = "session-a";
      _resetSessionIdCache();
      appendEvent("state", "stage.set", { stage: "brainstorm" });
      await rebuildAndCache("state");

      // Session B writes execute
      process.env.APEX_SESSION_ID = "session-b";
      _resetSessionIdCache();
      appendEvent("state", "stage.set", { stage: "execute" });
      await rebuildAndCache("state");

      // Check per-session caches
      const cacheA = JSON.parse(
        readFileSync(join(tmpDir, ".apex/state.session-a.json"), "utf-8"),
      );
      const cacheB = JSON.parse(
        readFileSync(join(tmpDir, ".apex/state.session-b.json"), "utf-8"),
      );

      expect(cacheA.current_stage).toBe("brainstorm");
      expect(cacheB.current_stage).toBe("execute");

      // Global cache has the last writer's full state (both events)
      const global = JSON.parse(
        readFileSync(join(tmpDir, ".apex/state.json"), "utf-8"),
      );
      expect(global.current_stage).toBe("execute");
    });

    test("AC2: session A artifacts not affected by session B artifacts", async () => {
      // Session B registers a brainstorm artifact
      process.env.APEX_SESSION_ID = "session-b";
      _resetSessionIdCache();
      appendEvent("state", "stage.set", { stage: "brainstorm" });
      appendEvent("state", "artifact.added", {
        stage: "brainstorm",
        path: "docs/b-artifact.md",
      });
      await rebuildAndCache("state");

      // Session A has its own stage but no artifacts
      process.env.APEX_SESSION_ID = "session-a";
      _resetSessionIdCache();
      appendEvent("state", "stage.set", { stage: "plan" });
      await rebuildAndCache("state");

      // Session A's per-session cache should NOT contain B's artifact
      const cacheA = JSON.parse(
        readFileSync(join(tmpDir, ".apex/state.session-a.json"), "utf-8"),
      );
      const brainstormArtifacts = cacheA.artifacts?.brainstorm || [];
      expect(brainstormArtifacts.includes("docs/b-artifact.md")).toBe(false);

      // Session B's per-session cache should contain its artifact
      const cacheB = JSON.parse(
        readFileSync(join(tmpDir, ".apex/state.session-b.json"), "utf-8"),
      );
      expect(cacheB.artifacts?.brainstorm).toEqual(["docs/b-artifact.md"]);
    });
  });

  describe("T34: loadState per-session preference", () => {
    let origCwd: string;
    let tmpDir: string;

    beforeEach(() => {
      origCwd = process.cwd();
      tmpDir = mkdtempSync(join(tmpdir(), "apex-loadstate-"));
      mkdirSync(join(tmpDir, ".apex"), { recursive: true });
      process.chdir(tmpDir);
      process.env.APEX_SESSION_ID = "test-session";
      _resetSessionIdCache();
    });

    afterEach(() => {
      process.chdir(origCwd);
      delete process.env.APEX_SESSION_ID;
      _resetSessionIdCache();
      rmSync(tmpDir, { recursive: true, force: true });
    });

    test("prefers per-session cache over global", async () => {
      // Write global with stage=review
      writeFileSync(
        join(tmpDir, ".apex/state.json"),
        JSON.stringify({
          current_stage: "review",
          last_updated: "2026-01-01T00:00:00Z",
          session_id: "other",
          artifacts: {},
          history: [],
        }),
      );
      // Write per-session with stage=plan
      writeFileSync(
        join(tmpDir, ".apex/state.test-session.json"),
        JSON.stringify({
          current_stage: "plan",
          last_updated: "2026-01-01T00:00:00Z",
          session_id: "test-session",
          artifacts: {},
          history: [],
        }),
      );

      const state = await getState();
      expect(state.current_stage).toBe("plan");
    });

    test("falls back to global when per-session cache does not exist", async () => {
      // Write only global
      writeFileSync(
        join(tmpDir, ".apex/state.json"),
        JSON.stringify({
          current_stage: "review",
          last_updated: "2026-01-01T00:00:00Z",
          session_id: "other",
          artifacts: {},
          history: [],
        }),
      );

      const state = await getState();
      expect(state.current_stage).toBe("review");
    });
  });
});

describe("task ID collision resistance", () => {
  let origCwd: string;
  let tmpDir: string;

  beforeEach(() => {
    origCwd = process.cwd();
    tmpDir = mkdtempSync(join(tmpdir(), "apex-taskid-"));
    mkdirSync(join(tmpDir, ".apex/log"), { recursive: true });
    // Write minimal tasks.json seed
    writeFileSync(
      join(tmpDir, ".apex/tasks.json"),
      JSON.stringify({ tasks: [], next_id: 1 }),
    );
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    delete process.env.APEX_SESSION_ID;
    _resetSessionIdCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("T35: taskCreate derives maxId from event log even with stale cache", async () => {
    process.env.APEX_SESSION_ID = "session-a";
    _resetSessionIdCache();

    // Session A creates T1 normally (writes event + rebuilds cache)
    const t1 = await taskCreate("task-a", "desc-a");
    expect(t1.id).toBe("T1");

    // Simulate stale cache: another session wrote tasks.json with next_id=1
    // (as if the cache was rebuilt without seeing session A's event)
    writeFileSync(
      join(tmpDir, ".apex/tasks.json"),
      JSON.stringify({ tasks: [], next_id: 1 }),
    );

    // Session B creates a task — should scan event log, find T1, and create T2
    process.env.APEX_SESSION_ID = "session-b";
    _resetSessionIdCache();
    const t2 = await taskCreate("task-b", "desc-b");
    expect(t2.id).toBe("T2");
  });

  test("T36: duplicate task ID events annotated with conflict marker", () => {
    // Inject two task.created events with the same ID from different sessions
    const events: DomainEvent[] = [
      {
        ts: "2026-01-01T00:00:00Z",
        session_id: "s1",
        domain: "task",
        type: "task.created",
        payload: {
          id: "T1",
          title: "first",
          description: "from s1",
          depends_on: [],
        },
      },
      {
        ts: "2026-01-01T00:01:00Z",
        session_id: "s2",
        domain: "task",
        type: "task.created",
        payload: {
          id: "T1",
          title: "second",
          description: "from s2",
          depends_on: [],
        },
      },
    ];

    const store = materializeTasks(events);
    // First T1 preserved
    const t1 = store.tasks.find((t) => t.id === "T1");
    expect(t1).toBeDefined();
    expect(t1?.title).toBe("first");
    // Conflict annotated (not silently dropped)
    expect(t1?.description.includes("[conflict:")).toBe(true);
    expect(t1?.description.includes("s2")).toBe(true);
  });
});

describe("stale cache cleanup", () => {
  let origCwd: string;
  let tmpDir: string;

  beforeEach(() => {
    origCwd = process.cwd();
    tmpDir = mkdtempSync(join(tmpdir(), "apex-cleanup-"));
    mkdirSync(join(tmpDir, ".apex/log"), { recursive: true });
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("T37: init deletes per-session cache files older than 7 days", async () => {
    const staleFile = join(tmpDir, ".apex/state.apex-old-session.json");
    const freshFile = join(tmpDir, ".apex/state.apex-recent-session.json");

    writeFileSync(staleFile, "{}");
    writeFileSync(freshFile, "{}");

    // Backdate the stale file to 8 days ago
    const eightDaysAgo = new Date(Date.now() - 8 * 86400000);
    const { utimesSync } = await import("node:fs");
    utimesSync(staleFile, eightDaysAgo, eightDaysAgo);

    await cmdInit();

    expect(existsSync(staleFile)).toBe(false);
    expect(existsSync(freshFile)).toBe(true);
  });
});

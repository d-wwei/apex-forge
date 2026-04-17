import { describe, expect, test } from "bun:test";
import type { DomainEvent } from "../state/event-log.js";
import { materializePerSession } from "../state/event-log.js";

function makeEvent(
  session_id: string,
  type: string,
  payload: Record<string, unknown>,
  ts: string,
): DomainEvent {
  return { ts, session_id, domain: "state", type, payload };
}

describe("materializePerSession", () => {
  test("returns empty array for no events", () => {
    expect(materializePerSession([])).toEqual([]);
  });

  test("single session produces single pipeline", () => {
    const events = [
      makeEvent(
        "s1",
        "stage.set",
        { stage: "brainstorm" },
        "2026-04-14T10:00:00Z",
      ),
      makeEvent("s1", "stage.set", { stage: "plan" }, "2026-04-14T10:05:00Z"),
    ];
    const result = materializePerSession(events);
    expect(result).toHaveLength(1);
    expect(result[0].session_id).toBe("s1");
    expect(result[0].current_stage).toBe("plan");
    expect(result[0].history).toHaveLength(2);
  });

  test("two sessions produce two independent pipelines", () => {
    const events = [
      makeEvent("s1", "stage.set", { stage: "review" }, "2026-04-14T10:00:00Z"),
      makeEvent(
        "s2",
        "stage.set",
        { stage: "compound" },
        "2026-04-14T10:01:00Z",
      ),
    ];
    const result = materializePerSession(events);
    expect(result).toHaveLength(2);
    const s1 = result.find((p) => p.session_id === "s1")!;
    const s2 = result.find((p) => p.session_id === "s2")!;
    expect(s1.current_stage).toBe("review");
    expect(s2.current_stage).toBe("compound");
  });

  test("stale sessions are marked and sorted last", () => {
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
    const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago
    const events = [
      makeEvent("old-session", "stage.set", { stage: "brainstorm" }, old),
      makeEvent("active-session", "stage.set", { stage: "execute" }, recent),
    ];
    const result = materializePerSession(events);
    expect(result[0].session_id).toBe("active-session");
    expect(result[0].stale).toBe(false);
    expect(result[1].session_id).toBe("old-session");
    expect(result[1].stale).toBe(true);
  });

  test("interleaved events from two sessions are correctly separated", () => {
    const events = [
      makeEvent(
        "s1",
        "stage.set",
        { stage: "brainstorm" },
        "2026-04-14T10:00:00Z",
      ),
      makeEvent("s2", "stage.set", { stage: "plan" }, "2026-04-14T10:00:30Z"),
      makeEvent(
        "s1",
        "stage.set",
        { stage: "execute" },
        "2026-04-14T10:01:00Z",
      ),
      makeEvent("s2", "stage.set", { stage: "review" }, "2026-04-14T10:01:30Z"),
    ];
    const result = materializePerSession(events);
    const s1 = result.find((p) => p.session_id === "s1")!;
    const s2 = result.find((p) => p.session_id === "s2")!;
    expect(s1.current_stage).toBe("execute");
    expect(s1.history).toHaveLength(2);
    expect(s2.current_stage).toBe("review");
    expect(s2.history).toHaveLength(2);
  });

  test("artifacts are scoped per session", () => {
    const events = [
      makeEvent("s1", "stage.set", { stage: "plan" }, "2026-04-14T10:00:00Z"),
      makeEvent(
        "s1",
        "artifact.added",
        { stage: "plan", path: "plan.md" },
        "2026-04-14T10:01:00Z",
      ),
      makeEvent("s2", "stage.set", { stage: "plan" }, "2026-04-14T10:00:30Z"),
      makeEvent(
        "s2",
        "artifact.added",
        { stage: "plan", path: "plan-v2.md" },
        "2026-04-14T10:01:30Z",
      ),
    ];
    const result = materializePerSession(events);
    const s1 = result.find((p) => p.session_id === "s1")!;
    const s2 = result.find((p) => p.session_id === "s2")!;
    expect(s1.artifacts.plan).toEqual(["plan.md"]);
    expect(s2.artifacts.plan).toEqual(["plan-v2.md"]);
  });

  test("stage.completed closes the correct history entry per session", () => {
    const events = [
      makeEvent(
        "s1",
        "stage.set",
        { stage: "execute" },
        "2026-04-14T10:00:00Z",
      ),
      makeEvent(
        "s1",
        "stage.completed",
        { stage: "execute" },
        "2026-04-14T10:05:00Z",
      ),
    ];
    const result = materializePerSession(events);
    expect(result[0].history[0].completed).toBe("2026-04-14T10:05:00Z");
  });

  test("session.summary event populates bilingual summary", () => {
    const events = [
      makeEvent(
        "s1",
        "stage.set",
        { stage: "brainstorm" },
        "2026-04-14T10:00:00Z",
      ),
      makeEvent(
        "s1",
        "session.summary",
        { en: "Optimize dashboard", zh: "优化仪表盘" },
        "2026-04-14T10:01:00Z",
      ),
    ];
    const result = materializePerSession(events);
    expect(result[0].summary).toEqual({
      en: "Optimize dashboard",
      zh: "优化仪表盘",
    });
  });

  test("session without summary event has undefined summary", () => {
    const events = [
      makeEvent(
        "s1",
        "stage.set",
        { stage: "execute" },
        "2026-04-14T10:00:00Z",
      ),
    ];
    const result = materializePerSession(events);
    expect(result[0].summary).toBeUndefined();
  });
});

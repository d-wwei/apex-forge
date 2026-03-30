import { existsSync, readFileSync, unlinkSync } from "fs";
import { readJSON, writeJSON } from "../utils/json.js";
import { appendJSONL } from "../utils/logger.js";
import { isoTimestamp } from "../utils/timestamp.js";
import { sync as telemetrySync } from "../telemetry-sync.js";

const SESSION_FILE = ".apex/.telemetry-session";
const ANALYTICS_FILE = ".apex/analytics/usage.jsonl";

interface TelemetrySession {
  skill: string;
  started_at: number;
}

interface UsageRecord {
  skill: string;
  duration_s: number;
  outcome: string;
  ts: string;
}

export async function cmdTelemetry(args: string[]): Promise<void> {
  const verb = args[0];

  switch (verb) {
    case "start": {
      const skill = args[1];
      if (!skill) {
        console.error("Usage: apex telemetry start SKILL_NAME");
        process.exit(1);
      }
      await writeJSON(SESSION_FILE, {
        skill,
        started_at: Date.now(),
      } satisfies TelemetrySession);
      console.log(`Tracking: ${skill}`);
      break;
    }

    case "end": {
      const outcome = args[1] || "unknown";
      const session = await readJSON<TelemetrySession | null>(
        SESSION_FILE,
        null,
      );
      if (!session) {
        console.error("No telemetry session active");
        process.exit(1);
      }
      const duration_s = Math.round(
        (Date.now() - session.started_at) / 1000,
      );
      appendJSONL(ANALYTICS_FILE, {
        skill: session.skill,
        duration_s,
        outcome,
        ts: isoTimestamp(),
      } satisfies UsageRecord);

      // Clean up session file
      try {
        unlinkSync(SESSION_FILE);
      } catch {
        // ignore
      }
      console.log(
        `Logged: ${session.skill} ${outcome} (${duration_s}s)`,
      );
      break;
    }

    case "report": {
      if (!existsSync(ANALYTICS_FILE)) {
        console.log("No telemetry data yet");
        break;
      }

      const lines = readFileSync(ANALYTICS_FILE, "utf-8")
        .trim()
        .split("\n")
        .filter(Boolean);
      const events = lines.map(
        (l) => JSON.parse(l) as UsageRecord,
      );

      if (events.length === 0) {
        console.log("No telemetry data yet");
        break;
      }

      // Aggregate by skill
      const bySkill: Record<
        string,
        {
          count: number;
          totalDuration: number;
          successes: number;
          errors: number;
        }
      > = {};

      for (const e of events) {
        const skill = e.skill || "unknown";
        if (!bySkill[skill])
          bySkill[skill] = {
            count: 0,
            totalDuration: 0,
            successes: 0,
            errors: 0,
          };
        bySkill[skill].count++;
        bySkill[skill].totalDuration += e.duration_s || 0;
        if (e.outcome === "success") bySkill[skill].successes++;
        if (e.outcome === "error") bySkill[skill].errors++;
      }

      console.log("apex-forge telemetry report");
      console.log("=============================");
      console.log(`Total events: ${events.length}`);
      console.log(
        `Period: ${events[0]?.ts || "?"} to ${events[events.length - 1]?.ts || "?"}`,
      );
      console.log("");
      console.log(
        "Skill               Runs  Avg Time  Success Rate",
      );
      console.log(
        "\u2500".repeat(49),
      );

      for (const [skill, data] of Object.entries(bySkill).sort(
        (a, b) => b[1].count - a[1].count,
      )) {
        const avgTime = Math.round(
          data.totalDuration / data.count,
        );
        const successRate =
          data.count > 0
            ? Math.round((data.successes / data.count) * 100)
            : 0;
        console.log(
          `${skill.padEnd(20)} ${String(data.count).padEnd(6)} ${String(avgTime + "s").padEnd(10)} ${successRate}%`,
        );
      }
      break;
    }

    case "sync": {
      await telemetrySync();
      break;
    }

    default:
      console.error(
        `Unknown telemetry command: ${verb || "(none)"}`,
      );
      console.error("Usage: apex telemetry [start|end|report|sync]");
      process.exit(1);
  }
}

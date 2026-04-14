import type { StageState } from "../types/state.js";
import { readJSON, writeJSON } from "../utils/json.js";
import { sessionStateCachePath } from "./event-log.js";
import { existsSync } from "fs";

const STATE_FILE = ".apex/state.json";

const DEFAULT_STATE: StageState = {
  current_stage: "idle",
  last_updated: new Date().toISOString(),
  session_id: "",
  artifacts: {},
  history: [],
};

export async function loadState(): Promise<StageState> {
  // Prefer per-session cache (consistent with state.ts:loadState)
  const sessionPath = sessionStateCachePath();
  if (existsSync(sessionPath)) {
    return readJSON<StageState>(sessionPath, DEFAULT_STATE);
  }
  return readJSON<StageState>(STATE_FILE, DEFAULT_STATE);
}

export async function saveState(state: StageState): Promise<void> {
  await writeJSON(STATE_FILE, state);
}

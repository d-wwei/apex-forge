import type { StageState } from "../types/state.js";
import { readJSON, writeJSON } from "../utils/json.js";

const STATE_FILE = ".apex/state.json";

export async function loadState(): Promise<StageState> {
  return readJSON<StageState>(STATE_FILE, {
    current_stage: "idle",
    last_updated: new Date().toISOString(),
    session_id: "",
    artifacts: {},
    history: [],
  });
}

export async function saveState(state: StageState): Promise<void> {
  await writeJSON(STATE_FILE, state);
}

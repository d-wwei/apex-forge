/** Persisted to .apex/browse.json for client→daemon reconnection. */
export interface DaemonInfo {
  pid: number;
  port: number;
  token: string;
  started_at: string;
}

/** Wire format: client POST /command body. */
export interface CommandRequest {
  command: string;
  args: string[];
}

/** Wire format: every /command response. */
export interface CommandResult {
  ok: boolean;
  data?: string;
  error?: string;
}

/**
 * Ref map entry.  `snapshot` assigns @e1, @e2, ... to accessibility nodes
 * so later commands can reference them by short alias instead of CSS selector.
 */
export interface RefEntry {
  role: string;
  name: string;
  index: number;
  selector: string;
}

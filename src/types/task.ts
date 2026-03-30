export type TaskStatus = "open" | "assigned" | "in_progress" | "to_verify" | "done" | "blocked";

export const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  open: ["assigned", "blocked"],
  assigned: ["in_progress", "open", "blocked"],  // open = release
  in_progress: ["to_verify", "blocked"],
  to_verify: ["done", "in_progress", "blocked"],  // in_progress = verify fail
  done: [],
  blocked: ["open"],  // unblock returns to open
};

export interface Task {
  id: string;          // "T1", "T2", ...
  title: string;
  description: string;
  status: TaskStatus;
  depends_on: string[];
  blocked_by: string[];
  evidence: string[];
  previous_status?: TaskStatus;  // saved when blocked
  block_reason?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface TaskStore {
  tasks: Task[];
  next_id: number;
}

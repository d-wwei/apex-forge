export interface StageHistory {
  stage: string;
  started: string;
  completed?: string;
}

export interface SkillInvocation {
  stage: string;
  skill: string;
  version: string;
  timestamp: string;
  output_status: string;
  af_mapping: string;
}

export interface OrchestrationEvent {
  action: string;
  task?: string;
  timestamp: string;
  detail?: Record<string, unknown>;
}

export interface StageState {
  current_stage: string;
  last_updated: string;
  session_id: string;
  artifacts: Record<string, string[]>;
  history: StageHistory[];
  skill_invocations?: SkillInvocation[];
  orchestration_events?: OrchestrationEvent[];
}

/** Per-session pipeline view used by the dashboard for multi-session display. */
export interface SessionPipeline {
  session_id: string;
  current_stage: string;
  last_updated: string;
  history: StageHistory[];
  artifacts: Record<string, string[]>;
  /** True when session has had no events for > 30 minutes */
  stale: boolean;
  /** Bilingual summary from session.summary event, or fallback from first task title */
  summary?: { en?: string; zh?: string };
  orchestration_events?: OrchestrationEvent[];
}

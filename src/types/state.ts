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

export interface StageState {
  current_stage: string;
  last_updated: string;
  session_id: string;
  artifacts: Record<string, string[]>;
  history: StageHistory[];
  skill_invocations?: SkillInvocation[];
}

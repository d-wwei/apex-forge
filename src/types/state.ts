export interface StageHistory {
  stage: string;
  started: string;
  completed?: string;
}

export interface StageState {
  current_stage: string;
  last_updated: string;
  session_id: string;
  artifacts: Record<string, string[]>;
  history: StageHistory[];
}

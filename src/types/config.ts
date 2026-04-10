export interface AgentMap {
  default?: string;
  review?: string;
  challenge?: string;
  consult?: string;
}

export interface ApexConfig {
  default_tier: "auto" | "1" | "2" | "3";
  proactive: boolean;
  compound_on_resolve: boolean;
  max_concurrent_agents: number;
  autonomy: "high" | "balanced" | "controlled";
  solutions_dir: string;
  polling_interval_ms: number;
  max_retries: number;
  retry_backoff_base_ms: number;
  agent_command: string;
  idle_timeout_ms: number;
  agents?: AgentMap;
}

export const DEFAULT_CONFIG: ApexConfig = {
  default_tier: "auto",
  proactive: true,
  compound_on_resolve: true,
  max_concurrent_agents: 3,
  autonomy: "balanced",
  solutions_dir: "docs/solutions",
  polling_interval_ms: 30000,
  max_retries: 3,
  retry_backoff_base_ms: 10000,
  agent_command: "claude",
  idle_timeout_ms: 1800000,
};

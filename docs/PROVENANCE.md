# Provenance

Every pattern in apex-forge traces to a specific source project. This document records what was taken from where, and why.

## Source Projects

| # | Project | Stars | Author | License | What We Took |
|---|---------|-------|--------|---------|-------------|
| 1 | [better-work-skill](https://github.com/d-wwei/better-work-skill) | - | d-wwei | MIT | Complexity router, escalation ladder, evidence grading, assumption registry |
| 2 | [superpowers](https://github.com/obra/superpowers) | 122K | Jesse Vincent | MIT | Auto-triggering, TDD iron law, verification gate, subagent-driven dev |
| 3 | [compound-engineering](https://github.com/EveryInc/compound-engineering-plugin) | 11K | Every Inc | MIT | Phase discipline, knowledge compounding, multi-persona review |
| 4 | [gstack](https://github.com/garrytan/gstack) | 55K | Garry Tan | MIT | Role-based skills, completion status, telemetry, proactive routing |
| 5 | [symphony](https://github.com/openai/symphony) | 14K | OpenAI | MIT | Single-authority orchestrator, workspace isolation, WORKFLOW.md spec |
| 6 | [chorus](https://github.com/Chorus-AIDLC/Chorus) | 349 | Chorus-AIDLC | MIT | Task state machine, role enforcement, dual-stage acceptance |
| 7 | [deer-flow](https://github.com/bytedance/deer-flow) | 52K | ByteDance | Apache 2.0 | LLM-curated memory, sandbox propagation, debounced async writes |
| 8 | [ruflo](https://github.com/ruvnet/ruflo) | 28K | ruvnet | MIT | Ledger pattern, skills registry, cost-aware routing, topology types |

## Pattern-Level Attribution

### Protocol Layer

| Pattern | Primary Source | Secondary Sources | What Changed |
|---------|---------------|-------------------|-------------|
| Auto-Triggering (1% Rule) | superpowers | - | Unchanged. The red flags table is directly adapted. |
| Complexity Router | better-work-skill | compound-engineering (scope classification) | Merged better-work's 3-tier model with compound's Lightweight/Standard/Deep classification for brainstorm depth |
| Phase Discipline (WHAT/HOW/EXECUTE) | compound-engineering | superpowers (brainstorming gate) | Combined compound's stage separation with superpowers' hard gate enforcement |
| TDD Iron Law | superpowers | - | Unchanged. The 14 rationalization counters are directly adapted. |
| Evidence Grading (E0-E4) | better-work-skill | - | Unchanged. Minimum thresholds per action type preserved. |
| Assumption Registry | better-work-skill | - | Unchanged. Carry-forward classification preserved. |
| Escalation Ladder (L0-L4) | better-work-skill | superpowers (3-fix escape hatch) | Merged better-work's 5-level ladder with superpowers' architecture-questioning rule at L3 |
| Multi-Persona Review | compound-engineering | - | Simplified from compound's full mode system to 3 core personas |
| Verification Gate | superpowers | - | Unchanged. The 5-step gate function is directly adapted. |
| Knowledge Compounding | compound-engineering | - | Unchanged. Parallel sub-agent workflow preserved. |
| Completion Status Protocol | gstack | - | Unchanged. Four terminal statuses preserved. |

### Orchestration Layer

| Pattern | Primary Source | What Changed |
|---------|---------------|-------------|
| Single-Authority Orchestrator | symphony | Generalized from Elixir GenServer to language-agnostic spec |
| Task State Machine | chorus | Simplified from full Prisma schema to portable state definitions |
| WORKFLOW.md Policy File | symphony | Unchanged. YAML front matter + template preserved. |
| Workspace Isolation | symphony | Unchanged. Deterministic naming + resume semantics preserved. |
| Role Enforcement | chorus | Generalized from MCP tool registration to any tool-gating mechanism |
| Memory Layer | deer-flow | Simplified from LangGraph integration to standalone fact store |
| Subagent Safety | deer-flow | Unchanged. Tool allowlist/denylist + sandbox propagation preserved. |
| Ledger Pattern | ruflo | Extracted from claude-flow architecture to standalone pattern |
| Skills Registry | ruflo | Simplified from 134 skills to registry spec + example entries |
| Cost-Aware Routing | ruflo | Simplified from MoE to 3-tier model (booster/fast/capable) |

### Workflow Layer

| Pattern | Primary Source | Secondary Sources |
|---------|---------------|-------------------|
| Session Init Hook | superpowers | gstack (telemetry preamble) |
| Ideate Stage | compound-engineering | - |
| Brainstorm Stage | superpowers (hard gate) | compound-engineering (scope classification) |
| Plan Stage | compound-engineering | gstack (scope challenge rules) |
| Execute Stage | superpowers (subagent-driven) | compound-engineering (dispatch strategy), ruflo (cost routing) |
| Review Stage | compound-engineering (mode system) | superpowers (verification gate) |
| Ship Stage | gstack | - |
| Compound Stage | compound-engineering | - |
| Proactive Routing | gstack | - |

## What Was NOT Taken (and Why)

| Passed On | Source | Reason |
|-----------|--------|--------|
| Raft/BFT consensus | ruflo | Only needed for genuinely distributed agent processes. Single-authority orchestrator is simpler and sufficient. |
| Multi-tenant OIDC | chorus | Product infrastructure, not an orchestration primitive. |
| SSH remote workspaces | symphony | Opt-in extension, not core. |
| Channel integrations (Feishu/Slack) | deer-flow | Deployment concern, not orchestration. |
| Gateway/LangGraph split | deer-flow | Only justified at scale. |
| Q-Learning/RL routing | ruflo | Not actually implemented in source. Cost-aware 3-tier routing achieves 80% of the benefit. |
| 134 agent YAML definitions | ruflo | Significant redundancy. Skills registry spec is sufficient. |
| Elaboration rounds | chorus | Useful but not needed unless requirements management is in scope. Documented as optional pattern. |
| WASM policy engine | ruflo | Described but not implemented in source. |

## Key Synthesis Insight

The 8 source projects address failure at different abstraction levels:

- **better-work** prevents quality decay *during* execution (escalation, evidence grading)
- **superpowers** prevents protocol bypass *before* execution (auto-triggering, TDD)
- **compound-engineering** prevents knowledge decay *after* execution (compounding)
- **gstack** provides the role-based routing *between* execution phases
- **symphony** solves the scheduling problem (when and where to run agents)
- **chorus** solves the trust problem (who approves what)
- **deer-flow** solves the memory problem (what to remember across sessions)
- **ruflo** solves the coordination problem (how agents talk to each other)

No single project closes all loops. Apex-protocol combines them into a unified framework.

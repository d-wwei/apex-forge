# Contributing to apex-forge

## Architecture

apex-forge has three layers:

1. **TypeScript Runtime** (`src/`) -- Compiled binaries for task management, browser automation, MCP server
2. **Skill Files** (`skill/` primary, `workflow/` legacy) -- Markdown instructions for AI agents (pipeline stages, execution protocol, gate definitions)
3. **Infrastructure** (`hooks/`, `extension/`) -- Session hooks, Chrome extension, CI

## Development Setup

Prerequisites: Bun 1.3+

```bash
git clone https://github.com/USER/apex-forge.git
cd apex-forge
bun install
bun run build      # Build apex CLI
bun test           # Run tests
```

## Project Structure

```
src/
  cli.ts                 -- Main CLI entry point
  commands/              -- CLI command handlers
  state/                 -- JSON state management (tasks, memory, config)
  browse/                -- Headless browser daemon
  mcp/                   -- MCP server with role-based tools
  consensus/             -- Raft, BFT, Gossip, CRDT protocols
  integrations/          -- GitHub issue tracker
  dashboard.ts           -- Web dashboard server
  design.ts              -- AI design generation
  sandbox.ts             -- Sandboxed code execution
  tracing.ts             -- Observability spans
  orchestrator.ts        -- Multi-agent task dispatcher
workflow/
  stages/                -- 7 pipeline stage skills
  roles/                 -- 30+ role-based skills
protocol/                -- Core execution discipline
extension/               -- Chrome extension for Side Panel
hooks/                   -- Session-start, pre-commit hooks
```

## Adding a New Skill

1. Create `workflow/roles/my-skill.md` with YAML frontmatter
2. Register in `.claude-plugin`
3. Or use `/apex-skill-author` which guides you through it

## Adding a New CLI Command

1. Add handler in `src/commands/` or inline in `src/cli.ts`
2. Add to the switch statement in `src/cli.ts`
3. Add to help text
4. Add tests in `src/__tests__/`
5. Rebuild: `bun run build`

## Testing

```bash
bun test                    # All tests
bun test --filter tasks     # Just task tests
bun test --filter memory    # Just memory tests
bun test --filter consensus # Just consensus tests
bun test --filter cli       # Integration tests (requires build first)
```

## CI

GitHub Actions runs on every push/PR to `master`:

1. Lint (`bunx biome ci src/`)
2. Type check (`tsc --noEmit`)
3. Build binaries (`bun run build`)
4. Run all unit tests (`bun test`)
5. Run CLI integration smoke tests
6. CLI backward compatibility smoke test

See `.github/workflows/ci.yml`.

## Error Recovery

The `apex recover` command handles crash recovery:

- Cleans stale browse daemon state files
- Removes expired telemetry sessions
- Releases tasks stuck in `assigned`/`in_progress` back to `open`
- Validates JSON state files for corruption

Run it after unexpected crashes or when state seems inconsistent.

## Code Style

- TypeScript strict mode
- No external CLI parser libraries
- Atomic JSON writes (temp file + rename)
- ESM imports with `node:` protocol prefix (e.g., `import { readFileSync } from "node:fs"`)
- Keep tests co-located in `src/__tests__/`

## Test Requirement

Every new feature, bug fix, or behavior change **must** include tests. This is a hard requirement, not a suggestion.

- New CLI commands: integration test in `src/__tests__/cli.test.ts` or dedicated test file
- New state logic: unit test in `src/__tests__/`
- Bug fixes: regression test that fails without the fix, passes with it
- Untested code will not be merged

## Linting

[Biome](https://biomejs.dev/) is the project linter and formatter. Zero warnings is a CI hard gate.

```bash
bunx biome check src/         # Check
bunx biome check --write src/  # Auto-fix
bunx biome ci src/             # CI mode (exit 1 on any error)
```

Configuration: `biome.json`. Uses the `recommended` preset. Three rules are currently disabled pending codebase-wide cleanup (`noExplicitAny`, `noNonNullAssertion`, `noAssignInExpressions`) — do not introduce new violations of these rules in new code.

## Dependency Policy

Prefer zero dependencies. Every new dependency must justify itself:

1. **Why can't built-in capabilities cover this?** (Bun has built-in test runner, bundler, HTTP server, SQLite)
2. **What alternatives were evaluated?** (At minimum: built-in, smaller library, copy-paste the 20 lines you need)
3. **What is the maintenance risk?** (Maintainer activity, breaking change history, transitive dependency count)

Record the justification in an ADR (see below) for non-trivial additions. Single-file solutions are preferred over package dependencies. Static compilation (`bun build --compile`) is preferred over runtime dependency resolution.

## Backward Compatibility

Published CLI command formats and configuration file structures (`package.json` fields, `.apex/` JSON schemas) are **hard constraints** — no breaking changes without:

1. A major version bump (semver)
2. A migration guide in the CHANGELOG
3. An ADR documenting the decision and alternatives considered

"Published" means: any command or format that appears in README, `--help` output, or has been in a release for ≥1 version. Internal/experimental commands (prefixed with `_` or documented as unstable) are exempt.

## Changelog Format

CHANGELOG.md uses a **hybrid format**: narrative header + Keep a Changelog categories.

```markdown
## [X.Y.Z] - YYYY-MM-DD

### {Title} — {one-line summary}

**背景**: {what problem existed, what motivated this change}
**策略**: {high-level approach taken}

### Added
- {new features}

### Changed
- {modifications to existing behavior}

### Fixed
- {bug fixes}
```

Narrative block: max 5 lines. Omit empty categories. Do not retroactively reformat old entries.

## Architecture Decision Records

Significant decisions are recorded in `docs/decisions/NNNN-title.md` using the template at `docs/decisions/TEMPLATE.md`.

**When to write an ADR:**
- Adding or removing a dependency
- Changing a public API or CLI command format
- Choosing between ≥2 viable architectural approaches
- Deciding NOT to do something (record the reasoning)

**ADR sections:** Status, Context, Decision, Rejected Alternatives, Consequences.

ADRs are triggered automatically during the Brainstorm stage exit gate for Standard/Deep scope tasks with multiple approaches evaluated.

## Security Principles

**Layered design**: Security controls are additive — each layer (pre-commit hook, pre-push hook, Ship preflight, CI) operates independently. No single layer is sufficient; no layer assumes another ran.

**Secrets management**:
- Passwords, API keys, and tokens NEVER pass through LLM conversation context
- Secrets NEVER appear in logs, state files, or telemetry
- Use OS Keychain or environment variables for credential storage
- The pre-push hook scans for accidentally committed secrets (AWS keys, GitHub tokens, private keys, PII)

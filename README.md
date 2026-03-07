# agentfiles

CLI tool for managing and distributing skills, rules, hooks, and subagents across Claude Code, Codex CLI, and Factory Droid.

## Structure

```
cli/                             # CLI application (TypeScript + Bun)
  src/cli.ts                     # Entry point & command dispatch
  src/parser.ts                  # Typed yargs parser (CommandIntent)
  src/interactive.ts             # Interactive terminal UX (@clack/prompts)
  src/support-matrix.ts          # Target/category compatibility matrix
  src/sync.ts                    # Core sync logic (rulesync wrapper)
  scripts/build.ts               # Build to standalone binary
  tests/                         # Unit + integration (mock/real) suites
skills/                          # Knowledge bases (installed to all agents)
  codex/SKILL.md                 # GPT integration for code analysis
  pr-title/SKILL.md              # Semantic commit formatting
  ts-bun-review/SKILL.md         # Bun API review
  ts-deno-review/SKILL.md        # Deno API review
  python-standards/SKILL.md      # Python development standards
subagents/                       # Autonomous agents (Claude Code only)
  deep-architect.md              # Feature spec + deep research
  code-quality-checker.md        # Linting and formatting
  realtime-code-reviewer.md      # Git diff code review
rules/                           # Coding conventions
  typescript.md                  # TS-scoped rules
  python.md                      # Python-scoped rules
hooks/                           # Hook scripts (Claude Code only)
```

## Requirements

- [Bun](https://bun.sh) runtime
- [rulesync](https://github.com/dyoshikawa/rulesync) — runs automatically via `npx`

## Usage

```bash
# Interactive mode (default)
af install

# Install everything non-interactively
af install -y

# Install with explicit agent target(s)
af install -y --agent codexcli
af rules -y --target claudecode,factorydroid

# Interactive selection by category
af skills
af rules
af hooks
af subagents

# Install a single item
af skill codex
af rule typescript
af subagent deep-architect

# List available resources
af list
```

### Flags

| Flag | Description |
| --- | --- |
| `-y, --all` | Install everything, skip interactive |
| `-n, --dry-run` | Preview changes without installing |
| `-u, --user` | Install to user-level (`~/`) instead of project |
| `--agent, --target` | Explicit target(s): `claudecode`, `codexcli`, `factorydroid` |
| `-v, --version` | Show version |

### Rules & language detection

Rules are project-scoped by default. `af rules` auto-detects the project language (TypeScript or Python) and installs matching rules. Use `--user` to install globally. Unsupported target/category combinations are handled as warning + omit.

## Where things go

Skills and rules are distributed via rulesync to all three agents:

| Source | Destination (via rulesync) |
| --- | --- |
| `skills/<name>/SKILL.md` | `~/.claude/skills/`, `~/.codex/skills/`, `~/.factorydroid/skills/` |
| `rules/*.md` (project) | `.claude/rules/`, `AGENTS.md`, `.factorydroid/` |
| `rules/*.md` (user) | `~/.claude/rules/`, `~/.codex/AGENTS.md`, `~/.factorydroid/AGENTS.md` |
| `subagents/*.md` | `~/.claude/agents/` (Claude Code only) |
| `hooks/*.sh` | `~/.claude/hooks/` (Claude Code only) |

## Development

```bash
bun dev            # Run CLI in dev mode
bun build          # Compile to dist/af
bun lint           # Lint with oxlint
bun format         # Format with oxfmt
bun test:unit      # Unit tests
bun test:integration:mock   # Integration tests (mocked)
bun test:integration:real   # Integration tests (real dry-run)
```

The build step generates an asset manifest embedding all skill/rule/hook/subagent files, then compiles a standalone binary at `dist/af`.

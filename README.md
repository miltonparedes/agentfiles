# agents

Central hub for skills, agents, rules, and hooks for Claude Code, Codex CLI, and Factory Droid.

## Structure

```
skills/                          # Skills (knowledge, installed to all agents)
  codex/SKILL.md                 # Skill (directory with SKILL.md)
  git-commit-review/SKILL.md     # Skill
subagents/                       # Agents (autonomous, Claude Code only)
  deep-architect.md              # Feature spec + deep research agent
  code-quality-checker.md        # Linting and formatting agent
  realtime-code-reviewer.md      # Git diff code review agent
rules/                           # Project/global rules
  base.md                        # Universal conventions
  typescript.md                  # TS-scoped rules
  python.md                      # Python-scoped rules
hooks/                           # Hook scripts
  README.md                      # Documentation + format
```

**Convention:** `skills/` contains directories with `SKILL.md` (knowledge). `subagents/` contains `.md` files (autonomous agents). The installer routes each type to the correct destination via [rulesync](https://github.com/dyoshikawa/rulesync).

## Requirements

- [bun](https://bun.sh) runtime
- [rulesync](https://github.com/dyoshikawa/rulesync) — runs automatically via `npx`

## Install

```bash
# Everything (global skills + hooks)
bun src/install.ts

# Preview without changes
bun src/install.ts --dry-run

# Project rules (auto-detects language)
bun src/install.ts rules

# User-level rules
bun src/install.ts rules --user

# Individual items
bun src/install.ts skill codex
bun src/install.ts rule typescript

# Hooks only
bun src/install.ts hooks

# List available resources
bun src/install.ts list
```

## Where things go

Skills and rules are distributed via rulesync to all three agents:

| Source | Destination (via rulesync) |
| --- | --- |
| `skills/<name>/SKILL.md` | `~/.claude/skills/`, `~/.codex/skills/`, `~/.factorydroid/skills/` |
| `rules/*.md` (project) | `.claude/rules/`, `AGENTS.md`, `.factorydroid/` |
| `rules/*.md` (user) | `~/.claude/rules/`, `~/.codex/AGENTS.md`, `~/.factorydroid/AGENTS.md` |
| `hooks/*.sh` | `~/.claude/hooks/` (manual, Claude Code only) |

## How it works

The installer is a thin wrapper over rulesync:

1. **Prepare** — creates a temporary `.rulesync/` directory and `rulesync.jsonc` from source files
2. **Generate** — runs `rulesync generate` which handles all agent-specific output paths
3. **Cleanup** — removes `.rulesync/` and `rulesync.jsonc` (these are transient, not committed)

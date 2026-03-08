# agentfiles

A single CLI to sync your custom prompts, coding conventions, and automation scripts to AI coding agents — Claude Code, Codex CLI, and Factory Droid.

Drop your content into `skills/`, `rules/`, `hooks/`, and `subagents/`, then run `af install` to distribute it to all your agents at once.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/miltonparedes/agentfiles/main/install.sh | bash
```

## Usage

```bash
af install          # interactive selection
af install -y       # install everything
af skills           # by category
af skill codex      # single item
af list             # show available
af update           # self-update to latest release
```

| Flag | Description |
| --- | --- |
| `-y, --all` | Install everything, skip interactive |
| `-n, --dry-run` | Preview changes without installing |
| `-u, --user` | Install to user-level (`~/`) instead of project |
| `--agent` | Target(s): `claudecode`, `codexcli`, `factorydroid` |

Rules are project-scoped by default and auto-detect the project language.

## Content

| Directory | What goes in it | Supported agents |
| --- | --- | --- |
| `skills/` | Knowledge bases and capabilities (e.g. code review, formatting) | All |
| `rules/` | Coding conventions per language (`.md`) | All |
| `hooks/` | Shell scripts that run on agent events | Claude Code |
| `subagents/` | Autonomous agent definitions | Claude Code |

## Development

Requires [Bun](https://bun.sh).

```bash
bun dev             # run in dev mode
bun build           # compile to dist/af
bun lint            # lint with oxlint
bun format          # format with oxfmt
bun test:unit       # unit tests
```

## Fork & customize

1. Fork the repo
2. Change `"repository"` in `package.json` to `youruser/yourrepo`
3. Replace the content in `skills/`, `rules/`, `hooks/`, `subagents/` with your own
4. Push — GitHub Actions builds and releases the binary automatically

# Hooks

Hook scripts that execute at specific points during the agent lifecycle. They enable automation, validation, and enforcement of project standards.

Hooks are synced via RuleSync to all supported targets.

## Supported Targets

| Target | Hook directory |
|--------|---------------|
| `claudecode` | `.claude/hooks/` |
| `factorydroid` | `.factory/hooks/` |

## Frontmatter Format

Each hook script must include a frontmatter block in bash comments:

```bash
#!/usr/bin/env bash
# ---
# event: preToolUse
# matcher: Bash
# description: Block dangerous commands
# ---
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `event` | Yes | Hook event in camelCase: `preToolUse`, `postToolUse`, `stop`, `notification`, `subagentStop`, `preCompact` |
| `matcher` | No | Tool filter: `Bash`, `Write`, `Edit`, or empty for all tools |
| `description` | No | Human-readable description |

## Hook Events

| Event | When it fires | Use case |
| --- | --- | --- |
| `preToolUse` | Before a tool executes | Validate/block dangerous commands |
| `postToolUse` | After a tool executes | Log actions, post-process results |
| `notification` | When a notification is sent | Custom notification routing |
| `stop` | When the agent stops | Cleanup, summary generation |
| `subagentStop` | When a subagent stops | Aggregate subagent results |
| `preCompact` | Before context compaction | Preserve important context |

## Hook Script Interface

Hook scripts receive tool context as JSON on stdin and communicate results via stdout:

### PreToolUse hooks

- Exit code `0`: Allow the tool call (stdout is ignored)
- Exit code `2`: Block the tool call (stdout shown as reason)
- Other exit codes: Hook error (tool call proceeds)

### PostToolUse hooks

- Stdout is appended to the tool result as additional context
- Exit code is informational only

## Adding Hooks

Place `.sh` scripts with frontmatter in this directory. The installer copies them to each target's native hooks directory and generates the appropriate configuration.

Hook scripts must be executable (`chmod +x`).

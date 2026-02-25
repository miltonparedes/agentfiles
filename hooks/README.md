# Hooks

Claude Code hooks are custom scripts that execute at specific points during the agent lifecycle. They enable automation, validation, and enforcement of project standards.

## Hook Events

| Event | When it fires | Use case |
| --- | --- | --- |
| `PreToolUse` | Before a tool executes | Validate/block dangerous commands |
| `PostToolUse` | After a tool executes | Log actions, post-process results |
| `Notification` | When a notification is sent | Custom notification routing |
| `Stop` | When the agent stops | Cleanup, summary generation |
| `SubagentStop` | When a subagent stops | Aggregate subagent results |
| `PreCompact` | Before context compaction | Preserve important context |

## Configuration

Hooks are configured in `.claude/settings.json` under the `hooks` key:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/hook-script.sh"
          }
        ]
      }
    ]
  }
}
```

### Matcher

The `matcher` field filters which tool triggers the hook. Examples:
- `"Bash"` - matches Bash tool calls
- `"Write"` - matches file writes
- `"Edit"` - matches file edits
- `""` (empty) - matches all tools

### Hook Types

- `command` - Runs a shell command. Receives tool input as JSON on stdin.

## Hook Script Interface

Hook scripts receive tool context as JSON on stdin and communicate results via stdout:

### PreToolUse hooks

- Exit code `0`: Allow the tool call (stdout is ignored)
- Exit code `2`: Block the tool call (stdout shown as reason)
- Other exit codes: Hook error (tool call proceeds)

### PostToolUse hooks

- Stdout is appended to the tool result as additional context
- Exit code is informational only

## Example: Block rm -rf

```bash
#!/usr/bin/env bash
# hook: block-dangerous-rm.sh
# Blocks recursive force-delete commands

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')

if echo "$command" | grep -qE 'rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive.*--force|-[a-zA-Z]*f[a-zA-Z]*r)'; then
    echo "Blocked: rm -rf commands are not allowed. Use trash or a safer alternative."
    exit 2
fi

exit 0
```

## Adding Hooks to This Repo

Place hook scripts in this directory. The installer copies them to `~/.claude/hooks/`.

Hook scripts must be executable (`chmod +x`).

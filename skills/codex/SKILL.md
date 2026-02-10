---
name: codex
description: This skill should be used when the user asks to "run codex", "ask GPT", "GPT review", "codex review", "codex exec", or needs GPT insights for complex tasks, code analysis, refactoring, automated editing, or code review. Also trigger on "second opinion", "codex resume", or when facing complex problems that benefit from an external AI perspective.
scope: global
---

# Codex Skill Guide

## When to Use Codex

Use Codex proactively for:
- Complex architectural decisions
- Deep code analysis or refactoring
- When stuck after 2+ failed attempts
- Security or performance audits
- Code reviews before commits/PRs
- When user explicitly requests GPT/Codex assistance

## Two Modes of Operation

### 1. `codex exec` - Interactive Tasks
For analysis, refactoring, debugging, or any task requiring file access and reasoning.

### 2. `codex review` - Code Reviews
For reviewing diffs, uncommitted changes, or comparing against branches.

---

## Running `codex exec`

1. Ask the user (via `AskUserQuestion`) which model to run (`gpt-5.2-codex` or `gpt-5.2`) AND which reasoning effort to use (`xhigh`, `high`, `medium`, or `low`) in a **single prompt with two questions**.

2. Select the sandbox mode required for the task; default to `--sandbox read-only` unless edits or network access are necessary.

3. Assemble the command with the appropriate options:
   - `-m, --model <MODEL>`
   - `--config model_reasoning_effort="<xhigh|high|medium|low>"`
   - `--sandbox <read-only|workspace-write|danger-full-access>`
   - `--full-auto`
   - `-C, --cd <DIR>`
   - `--skip-git-repo-check`

4. Always use `--skip-git-repo-check`.

5. **IMPORTANT**: Append `2>/dev/null` to suppress thinking tokens (stderr). Only show stderr if debugging is needed.

6. Run the command, capture output, and summarize the outcome for the user.

7. After completion, inform the user: "You can resume this Codex session at any time by saying 'codex resume'."

### Quick Reference - exec

| Use case | Sandbox mode | Command |
| --- | --- | --- |
| Read-only analysis | `read-only` | `codex exec --skip-git-repo-check -m MODEL --sandbox read-only "prompt" 2>/dev/null` |
| Apply local edits | `workspace-write` | `codex exec --skip-git-repo-check -m MODEL --sandbox workspace-write --full-auto "prompt" 2>/dev/null` |
| Network/broad access | `danger-full-access` | `codex exec --skip-git-repo-check -m MODEL --sandbox danger-full-access --full-auto "prompt" 2>/dev/null` |
| Resume session | Inherited | `echo "prompt" \| codex exec --skip-git-repo-check resume --last 2>/dev/null` |
| Different directory | Match task | `codex exec --skip-git-repo-check -C <DIR> -m MODEL --sandbox read-only "prompt" 2>/dev/null` |

### Resuming Sessions

When continuing a previous session:
```bash
echo "your prompt here" | codex exec --skip-git-repo-check resume --last 2>/dev/null
```
- Don't use configuration flags unless explicitly requested
- All flags go between `exec` and `resume`

---

## Running `codex review`

Use for code review tasks. No need to ask for model/reasoning - review uses sensible defaults.

1. Ask the user (via `AskUserQuestion`) what to review:
   - **Uncommitted changes** - all local modifications
   - **Against a branch** - compare to base branch (e.g., `main`)
   - **Specific commit** - review a commit SHA

2. Optionally ask for custom review focus (security, performance, conventions, etc.)

3. Run the appropriate command and summarize findings.

### Quick Reference - review

| Use case | Command |
| --- | --- |
| Uncommitted changes | `codex review --uncommitted` |
| Against main branch | `codex review --base main` |
| Against specific branch | `codex review --base feature/xyz` |
| Specific commit | `codex review --commit abc123` |
| With custom focus | `codex review --uncommitted "Focus on security"` |
| With title context | `codex review --base main --title "Add user auth"` |

### Configuration Overrides

```bash
# Use specific model
codex review --uncommitted -c model="o3"
```

---

## Decision Guide: exec vs review

| Situation | Use |
| --- | --- |
| "Review my changes" | `codex review --uncommitted` |
| "Review this PR" | `codex review --base main` |
| "Analyze this architecture" | `codex exec` |
| "Help me debug this" | `codex exec` |
| "Refactor this code" | `codex exec` with workspace-write |
| "Is this secure?" | `codex review` for diffs, `codex exec` for deep analysis |

---

## Following Up

- After every command, use `AskUserQuestion` to confirm next steps or collect clarifications
- For `exec`: offer to resume with `codex exec resume --last`
- For `review`: offer to help address specific findings
- Restate the chosen configuration when proposing follow-up actions

## Error Handling

- Stop and report failures on non-zero exit; request direction before retrying
- Before using high-impact flags (`--full-auto`, `--sandbox danger-full-access`), ask user permission via `AskUserQuestion` unless already given
- Summarize warnings or partial results and ask how to adjust

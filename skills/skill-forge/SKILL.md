---
name: skill-forge
description: >
  Create new skills or improve existing ones for Claude Code. Use when the
  user says "forge a skill", "create a skill", "new skill", "skill from",
  "skill based on", "make a skill like", or wants to build, update, or
  improve a skill from any source of inspiration (URLs, files, ideas).
---

# Skill Forge

Build skills for Claude Code. Collaborate with the user on design, create directly in the target directory.

**Target directory:** Always create skills in the `skills/` folder of the `agentfiles` repository. If the current working directory is not inside `agentfiles/`, search for it (e.g. `find ~ -maxdepth 4 -type d -name agentfiles 2>/dev/null | head -1`). NEVER create skills in `~/.claude/skills/`.

## Skill Anatomy

```
skill-name/
├── SKILL.md          (required — frontmatter + instructions)
├── scripts/          (optional — deterministic/reusable code)
├── references/       (optional — docs loaded into context on demand)
└── assets/           (optional — files used in output, not loaded into context)
```

### Frontmatter

Only two fields: `name` and `description`. Nothing else.

The `description` is the **sole trigger mechanism** — Claude reads it to decide when to activate the skill. Pack it with concrete trigger phrases and scenarios. Under 1024 chars, no angle brackets.

### Progressive Disclosure

Context is a shared resource. Skills load in three tiers:

1. **Metadata** (name + description) — always in context (~100 words)
2. **SKILL.md body** — loaded when skill triggers (<5k words)
3. **Bundled resources** — loaded on demand by Claude as needed

Keep SKILL.md under 200 lines. Split to references/ when approaching the limit.

### When to Bundle Resources

| Type | When to include | Example |
|------|----------------|---------|
| Scripts | Same code rewritten repeatedly or determinism required | `scripts/rotate_pdf.py` |
| References | Domain knowledge Claude needs while working | `references/schema.md` |
| Assets | Files used in output (templates, images) | `assets/template.html` |

Most skills need only SKILL.md. Don't create resources speculatively.

## Style

- **Shorter is better.** Tables over prose. Only add what Claude doesn't already know.
- **Imperative voice** throughout the body.
- **No auxiliary files** — no README.md, CHANGELOG.md, INSTALLATION_GUIDE.md.
- **Earn every line.** If Claude would figure it out on its own, cut it.
- Concrete examples > verbose explanations.

## Workflow

### 1. Understand

Ask the user what skill they want. Use `AskUserQuestion` in batches of 2-3:

- What does the skill do? What problem does it solve?
- What would a user say to invoke it? (concrete trigger phrases)
- Any inspiration sources? (URLs, files, existing tools, ideas)

If the user provides inspiration sources (URLs, files, repos, docs), read them and extract: purpose, structure, patterns worth keeping, things to improve.

### 2. Design

Based on the conversation, define:

| Field | Value |
|-------|-------|
| Name | `skill-name` |
| Description | Trigger phrases + when to use |
| Steps/Sections | The body structure |
| Resources | scripts/, references/, assets/ needed (or "none") |

Before creating, scan the target directory for existing skills to **avoid overlap**:

```
Glob pattern="<target-dir>/*/SKILL.md"
```

Present the design summary to the user. Get confirmation before writing.

### 3. Create

**New skill:**
1. Create directory `<target-dir>/<skill-name>/`.
2. Write SKILL.md — frontmatter + body.
3. Add any resources designed in step 2. Nothing extra.

**Existing skill (update):**
Edit files directly. No re-creation.

**Structural patterns for the body:**

For multi-step workflows, use numbered headings:
```markdown
### 1. Step Name
### 2. Step Name
```

For branching logic, guide through decision points:
```markdown
**Creating new?** → Follow "Creation" below
**Editing existing?** → Follow "Editing" below
```

For specific output formats, include a concrete input/output example rather than describing the format in prose.

### 4. Validate

Read the final SKILL.md and verify:

| Check | Criteria |
|-------|----------|
| Triggers | Description has concrete phrases, not vague terms |
| Length | Under 200 lines |
| Clean | No TODOs, no template leftovers |
| Overlap | Doesn't duplicate existing skills in target directory |
| Voice | Imperative throughout |
| Files | Only files the agent actually needs |
| Frontmatter | Only `name` and `description` |
| Description | Under 1024 chars, no angle brackets |

Fix issues found, then present the final skill to the user.

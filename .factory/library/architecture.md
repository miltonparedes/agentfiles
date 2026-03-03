# Architecture

Architectural decisions and implementation conventions for the CLI refactor mission.

**What belongs here:** module boundaries, parser/dispatch design, prompt orchestration, routing rules by scope/agent.
**What does NOT belong here:** temporary task notes or raw logs.

---

- Use typed `yargs` as parser/intent boundary.
- Keep command surface backward-compatible (`install`, families, singulars, list/setup/config).
- Interactive flow uses `@clack/prompts`.
- Installation routing is explicit by scope (`project` default, `--user` explicit) and by agent where applicable.
- Unsupported artifact-target pairs must follow warning+omit policy.
- Keep rulesync staging/cleanup deterministic and isolated.

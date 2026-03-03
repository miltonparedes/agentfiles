# Environment

Environment variables, external dependencies, and setup notes for this mission.

**What belongs here:** runtime requirements, tool dependencies, HOME fixture notes, rulesync dependency behavior.
**What does NOT belong here:** service commands/ports (use `.factory/services.yaml`).

---

- Runtime: Bun + Node-compatible CLI execution.
- No third-party credentials are required for this mission.
- `rulesync` is executed via `npx` in sync flows.
- `oxfmt` may not be available as a direct shell binary in this environment; use `bun run format:check` (preferred) or `npx oxfmt ...` for ad-hoc checks.
- `AF_SKIP_RULESYNC_EXEC=1` skips live `rulesync` execution and is intended for deterministic test runs; do not use it for production validation evidence.
- For integration-real and scope tests, prefer isolated HOME (e.g. `HOME=/tmp/...`) to avoid interference from pre-existing user rulesync state.

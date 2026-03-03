# User Testing

Testing surface and operator guidance for manual validation in this mission.

**What belongs here:** CLI entrypoints, TTY/non-TTY checks, setup steps, known quirks for repeatable user testing.
**What does NOT belong here:** implementation details unrelated to validation.

---

## Surface

- Primary user surface: terminal CLI (`af` / `bun cli/src/cli.ts`).
- No browser/TUI app surface is required.

## Setup

1. Run `.factory/init.sh`.
2. Use dry-run (`-n`) for behavior validation without writes.
3. For user-scope/integration-real checks, use isolated HOME:
   - `HOME=/tmp/af-test-<id> bun cli/src/cli.ts <command> ...`

## Core Manual Checks

- Non-TTY guard vs `-y` bypass.
- Interactive selection and cancellation behavior.
- Scope routing (`project` vs `--user`) path differences.
- Agent filtering and warning+omit on unsupported combinations.

## Known Quirks

- Pre-existing user-level `.rulesync` state can affect global/user runs if HOME is not isolated.
- Prefer explicit HOME fixtures in validation to avoid flaky outcomes.
- If an integration test changes cwd to a fixture, invoke the CLI with an absolute script path (e.g. `/var/home/milton/agentfiles/cli/src/cli.ts`) to avoid `Module not found "cli/src/cli.ts"`.

## Flow Validator Guidance: CLI

- Testing surface is terminal CLI only; do not use browser tools.
- Each flow validator must use only its assigned isolated `HOME` directory namespace.
- Never reuse another validator's temporary directories, logs, or config files.
- Prefer `-n/--dry-run` for install-capable commands to avoid repository mutations.
- For non-TTY checks, pipe empty stdin (`printf '' | ...`) and assert expected exit codes/messages.
- Do not modify production logic or mission files from flow validators; only write the assigned flow report JSON.

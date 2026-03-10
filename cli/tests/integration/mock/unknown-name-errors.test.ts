import { describe, expect, it } from "bun:test";

/**
 * Integration tests (mocked via CLI subprocess) for VAL-CORE-005:
 * Singular commands reject unknown item names deterministically.
 *
 * Each test spawns `bun cli/src/cli.ts` with an unknown name and verifies:
 * - Non-zero exit code
 * - Clear error message on stderr mentioning the unknown name
 * - Available items listed in the error output
 */

const CLI = ["bun", "cli/src/cli.ts"];
const CWD = import.meta.dir + "/../../../..";

interface RunResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

async function runCli(args: string[]): Promise<RunResult> {
  const proc = Bun.spawn([...CLI, ...args], {
    cwd: CWD,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

// ── skill <unknown> (VAL-CORE-005) ────────────────────────────

describe("skill with unknown name", () => {
  it("fails with non-zero exit code", async () => {
    const result = await runCli(["skill", "nonexistent-skill", "-n"]);
    expect(result.exitCode).not.toBe(0);
  });

  it("shows clear error mentioning the unknown name", async () => {
    const result = await runCli(["skill", "nonexistent-skill", "-n"]);
    expect(result.stderr).toContain('Unknown skill: "nonexistent-skill"');
  });

  it("lists available skills in the error message", async () => {
    const result = await runCli(["skill", "nonexistent-skill", "-n"]);
    expect(result.stderr).toContain("Available skills:");
    expect(result.stderr).toContain("codex");
  });
});

// ── rule <unknown> (VAL-CORE-005) ─────────────────────────────

describe("rule with unknown name", () => {
  it("fails with non-zero exit code", async () => {
    const result = await runCli(["rule", "nonexistent-rule", "-n"]);
    expect(result.exitCode).not.toBe(0);
  });

  it("shows clear error mentioning the unknown name", async () => {
    const result = await runCli(["rule", "nonexistent-rule", "-n"]);
    expect(result.stderr).toContain('Unknown rule: "nonexistent-rule"');
  });

  it("lists available rules in the error message", async () => {
    const result = await runCli(["rule", "nonexistent-rule", "-n"]);
    expect(result.stderr).toContain("Available rules:");
    expect(result.stderr).toContain("typescript");
  });
});

// ── subagent <unknown> (VAL-CORE-005) ─────────────────────────

describe("subagent with unknown name", () => {
  it("fails with non-zero exit code", async () => {
    const result = await runCli(["subagent", "nonexistent-subagent", "-n"]);
    expect(result.exitCode).not.toBe(0);
  });

  it("shows clear error mentioning the unknown name", async () => {
    const result = await runCli(["subagent", "nonexistent-subagent", "-n"]);
    expect(result.stderr).toContain('Unknown subagent: "nonexistent-subagent"');
  });

  it("lists available subagents in the error message", async () => {
    const result = await runCli(["subagent", "nonexistent-subagent", "-n"]);
    expect(result.stderr).toContain("Available subagents:");
    expect(result.stderr).toContain("deep-architect");
  });
});

// ── hook <unknown> (VAL-CORE-005) ──────────────────────────────

describe("hook with unknown name", () => {
  it("fails with non-zero exit code", async () => {
    const result = await runCli(["hook", "nonexistent-hook", "-n"]);
    expect(result.exitCode).not.toBe(0);
  });

  it("shows clear error mentioning the unknown name", async () => {
    const result = await runCli(["hook", "nonexistent-hook", "-n"]);
    expect(result.stderr).toContain('Unknown hook: "nonexistent-hook"');
  });

  it("lists available hooks in the error message", async () => {
    const result = await runCli(["hook", "nonexistent-hook", "-n"]);
    expect(result.stderr).toContain("Available hooks:");
    expect(result.stderr).toContain("block-factory-commit");
  });
});

// ── All commands return consistent exit code (VAL-CORE-005) ───

describe("consistent exit codes for unknown names", () => {
  it("all singular commands return exit code 1 for unknown names", async () => {
    const [skill, rule, subagent, hook] = await Promise.all([
      runCli(["skill", "nope", "-n"]),
      runCli(["rule", "nope", "-n"]),
      runCli(["subagent", "nope", "-n"]),
      runCli(["hook", "nope", "-n"]),
    ]);
    expect(skill.exitCode).toBe(1);
    expect(rule.exitCode).toBe(1);
    expect(subagent.exitCode).toBe(1);
    expect(hook.exitCode).toBe(1);
  });
});

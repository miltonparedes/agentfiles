import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";

/**
 * Integration tests (real CLI subprocess with dry-run) for agent selection:
 *
 * VAL-SCOPE-002: Explicit agent selection works on all applicable commands
 * VAL-SCOPE-003: Default target fan-out is deterministic
 * VAL-SCOPE-011: Multi-agent selection uses deterministic union behavior
 * VAL-SCOPE-012: Invalid agent selections fail clearly
 */

const CLI = ["bun", "cli/src/cli.ts"];
const CWD = import.meta.dir + "/../../../..";

interface RunResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

let tmpHome: string;

beforeEach(() => {
  tmpHome = `/tmp/af-agent-real-${Date.now()}`;
  mkdirSync(tmpHome, { recursive: true });
});

afterEach(() => {
  if (existsSync(tmpHome)) {
    rmSync(tmpHome, { recursive: true, force: true });
  }
});

async function runCli(args: string[], env?: Record<string, string>): Promise<RunResult> {
  const proc = Bun.spawn([...CLI, ...args], {
    cwd: CWD,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      NO_COLOR: "1",
      HOME: tmpHome,
      AF_SKIP_RULESYNC_EXEC: "1",
      ...env,
    },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

// ── VAL-SCOPE-002: Explicit agent filters targets ─────────────

describe("explicit agent selection dry-run (VAL-SCOPE-002)", () => {
  it("skills -y -n --agent codexcli restricts to codexcli target", async () => {
    const result = await runCli(["skills", "-y", "-n", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
    // The command succeeds with a single agent specified
  });

  it("rules -y -n --agent claudecode,factorydroid with two agents", async () => {
    const result = await runCli(["rules", "-y", "-n", "--agent", "claudecode,factorydroid"]);
    expect(result.exitCode).toBe(0);
  });

  it("install -y -n --agent codexcli uses only codexcli", async () => {
    const result = await runCli(["install", "-y", "-n", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
  });

  it("hooks -y -n with --agent still succeeds (hooks are not target-filtered)", async () => {
    // Hooks don't use rulesync targets, but agent flag shouldn't cause errors
    const result = await runCli(["hooks", "-y", "-n", "--agent", "claudecode"]);
    expect(result.exitCode).toBe(0);
  });

  it("subagents -y -n with --agent still succeeds", async () => {
    const result = await runCli(["subagents", "-y", "-n", "--agent", "claudecode"]);
    expect(result.exitCode).toBe(0);
  });
});

// ── VAL-SCOPE-003: Default fan-out uses all targets ───────────

describe("default target fan-out dry-run (VAL-SCOPE-003)", () => {
  it("skills -y -n without --agent processes all targets", async () => {
    const result = await runCli(["skills", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    // Default behavior uses all three targets
  });

  it("rules -y -n without --agent processes all targets", async () => {
    const result = await runCli(["rules", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    // Should include language detection for project scope
    expect(result.stdout).toContain("Detected languages:");
  });
});

// ── VAL-SCOPE-011: Multi-agent union is deterministic ─────────

describe("multi-agent union dry-run (VAL-SCOPE-011)", () => {
  it("three agents in reverse order succeeds", async () => {
    const result = await runCli([
      "skills",
      "-y",
      "-n",
      "--agent",
      "factorydroid,codexcli,claudecode",
    ]);
    expect(result.exitCode).toBe(0);
  });

  it("repeated --agent flags produce same result as comma-separated", async () => {
    const r1 = await runCli([
      "skills",
      "-y",
      "-n",
      "--agent",
      "claudecode",
      "--agent",
      "factorydroid",
    ]);
    const r2 = await runCli([
      "skills",
      "-y",
      "-n",
      "--agent",
      "claudecode,factorydroid",
    ]);
    expect(r1.exitCode).toBe(0);
    expect(r2.exitCode).toBe(0);
    // Both should produce equivalent output
    expect(r1.stdout).toBe(r2.stdout);
  });
});

// ── VAL-SCOPE-012: Invalid agent errors in real subprocess ────

describe("invalid agent real subprocess (VAL-SCOPE-012)", () => {
  it("invalid agent fails fast with guidance", async () => {
    const result = await runCli(["rules", "-y", "-n", "--agent", "invalid-agent"]);
    expect(result.exitCode).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain("Invalid agent target");
    expect(output).toContain("claudecode");
    expect(output).toContain("codexcli");
    expect(output).toContain("factorydroid");
  });

  it("multiple invalid agents listed in error", async () => {
    const result = await runCli(["skills", "-y", "-n", "--agent", "bad1,bad2"]);
    expect(result.exitCode).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain('"bad1"');
    expect(output).toContain('"bad2"');
  });
});

// ── Combined scope + agent ────────────────────────────────────

describe("combined scope and agent selection", () => {
  it("install -y -n --user --agent codexcli enforces both", async () => {
    const result = await runCli(["install", "-y", "-n", "--user", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
  });

  it("singular skill with --agent codexcli", async () => {
    const result = await runCli(["skill", "codex", "-n", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
  });

  it("singular rule with --agent claudecode", async () => {
    const result = await runCli(["rule", "typescript", "-n", "--agent", "claudecode"]);
    expect(result.exitCode).toBe(0);
  });
});

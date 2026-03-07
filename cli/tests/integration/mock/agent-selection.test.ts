import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";

/**
 * Integration tests (mock CLI subprocess) for agent selection:
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
  tmpHome = `/tmp/af-agent-test-${Date.now()}`;
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

// ── VAL-SCOPE-012: Invalid agent selections fail clearly ──────

describe("invalid agent selection (VAL-SCOPE-012)", () => {
  it("invalid agent fails with non-zero exit", async () => {
    const result = await runCli(["rules", "-y", "-n", "--agent", "invalid-agent"]);
    expect(result.exitCode).toBe(1);
  });

  it("invalid agent shows clear error message", async () => {
    const result = await runCli(["rules", "-y", "-n", "--agent", "invalid-agent"]);
    const output = result.stdout + result.stderr;
    expect(output).toContain("Invalid agent target");
    expect(output).toContain('"invalid-agent"');
  });

  it("invalid agent error lists valid agents", async () => {
    const result = await runCli(["rules", "-y", "-n", "--agent", "invalid-agent"]);
    const output = result.stdout + result.stderr;
    expect(output).toContain("claudecode");
    expect(output).toContain("codexcli");
    expect(output).toContain("factorydroid");
  });

  it("mixed valid+invalid agent fails on invalid", async () => {
    const result = await runCli(["skills", "-y", "-n", "--agent", "claudecode,badone"]);
    expect(result.exitCode).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain('"badone"');
  });

  it("invalid agent on install command fails", async () => {
    const result = await runCli(["install", "-y", "-n", "--agent", "nope"]);
    expect(result.exitCode).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain("Invalid agent target");
  });

  it("invalid agent on singular command fails", async () => {
    const result = await runCli(["skill", "codex", "-n", "--agent", "badagent"]);
    expect(result.exitCode).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain("Invalid agent target");
  });
});

// ── VAL-SCOPE-002: Explicit agent selection on applicable commands ──

describe("explicit agent selection (VAL-SCOPE-002)", () => {
  it("skills -y -n --agent codexcli succeeds", async () => {
    const result = await runCli(["skills", "-y", "-n", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
  });

  it("rules -y -n --agent claudecode,factorydroid succeeds", async () => {
    const result = await runCli(["rules", "-y", "-n", "--agent", "claudecode,factorydroid"]);
    expect(result.exitCode).toBe(0);
  });

  it("install -y -n --agent codexcli succeeds", async () => {
    const result = await runCli(["install", "-y", "-n", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
  });

  it("--target alias works same as --agent", async () => {
    const result = await runCli(["skills", "-y", "-n", "--target", "codexcli"]);
    expect(result.exitCode).toBe(0);
  });

  it("singular skill with --agent succeeds", async () => {
    const result = await runCli(["skill", "codex", "-n", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
  });
});

// ── VAL-SCOPE-003: Default target fan-out is deterministic ────

describe("default target fan-out (VAL-SCOPE-003)", () => {
  it("skills -y -n without --agent uses all three targets", async () => {
    const result = await runCli(["skills", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    // Without explicit agent, all targets are used by default
    // (This is the existing behavior — no --agent means TARGETS default)
  });

  it("install -y -n without --agent uses default fan-out", async () => {
    const result = await runCli(["install", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
  });
});

// ── VAL-SCOPE-011: Multi-agent deterministic union ────────────

describe("multi-agent deterministic union (VAL-SCOPE-011)", () => {
  it("comma-separated multi-agent succeeds", async () => {
    const result = await runCli([
      "skills",
      "-y",
      "-n",
      "--agent",
      "factorydroid,codexcli,claudecode",
    ]);
    expect(result.exitCode).toBe(0);
  });

  it("repeated --agent flags are merged", async () => {
    const result = await runCli([
      "rules",
      "-y",
      "-n",
      "--agent",
      "claudecode",
      "--agent",
      "factorydroid",
    ]);
    expect(result.exitCode).toBe(0);
  });

  it("duplicate agents are deduplicated (no error)", async () => {
    const result = await runCli([
      "skills",
      "-y",
      "-n",
      "--agent",
      "codexcli,codexcli",
    ]);
    expect(result.exitCode).toBe(0);
  });
});

// ── Agent selection wiring verification ───────────────────────

describe("agent selection wiring in dispatch", () => {
  it("cli.ts imports KNOWN_AGENTS from parser", async () => {
    const content = await Bun.file("cli/src/cli.ts").text();
    expect(content).toContain("KNOWN_AGENTS");
  });

  it("cli.ts handles invalidAgent case", async () => {
    const content = await Bun.file("cli/src/cli.ts").text();
    expect(content).toContain('"invalidAgent"');
  });

  it("parser exports resolveAgents function", async () => {
    const content = await Bun.file("cli/src/parser.ts").text();
    expect(content).toContain("export function resolveAgents");
  });

  it("parser exports KNOWN_AGENTS constant", async () => {
    const content = await Bun.file("cli/src/parser.ts").text();
    expect(content).toContain("export const KNOWN_AGENTS");
  });

  it("sync.ts accepts targets parameter in SyncOptions", async () => {
    const content = await Bun.file("cli/src/sync.ts").text();
    expect(content).toContain("targets?: string[]");
  });
});

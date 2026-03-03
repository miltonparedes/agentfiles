import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";

/**
 * Integration tests (mock CLI subprocess) for unsupported combination policy:
 *
 * VAL-SCOPE-004: Unsupported artifacts by agent are warned and omitted
 * VAL-SCOPE-005: Mixed-support runs keep supported work
 * VAL-SCOPE-013: Fully unsupported selection becomes warning-only no-op
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
  tmpHome = `/tmp/af-unsup-mock-${Date.now()}`;
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

// ── VAL-SCOPE-004: Unsupported artifacts warned and omitted ───

describe("unsupported artifacts warned and omitted (VAL-SCOPE-004)", () => {
  it("hooks -y -n --agent codexcli warns with artifact+target+reason", async () => {
    const result = await runCli(["hooks", "-y", "-n", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipping hooks for codexcli");
    expect(result.stdout).toContain("not supported");
  });

  it("subagents -y -n --agent codexcli warns with artifact+target+reason", async () => {
    const result = await runCli(["subagents", "-y", "-n", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipping subagents for codexcli");
    expect(result.stdout).toContain("not supported");
  });

  it("hooks -y -n --agent factorydroid warns with artifact+target+reason", async () => {
    const result = await runCli(["hooks", "-y", "-n", "--agent", "factorydroid"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipping hooks for factorydroid");
    expect(result.stdout).toContain("not supported");
  });

  it("subagents -y -n --agent factorydroid warns with artifact+target+reason", async () => {
    const result = await runCli(["subagents", "-y", "-n", "--agent", "factorydroid"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipping subagents for factorydroid");
    expect(result.stdout).toContain("not supported");
  });

  it("install -y -n --agent codexcli warns about hooks and subagents", async () => {
    const result = await runCli(["install", "-y", "-n", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipping hooks for codexcli");
    expect(result.stdout).toContain("Skipping subagents for codexcli");
  });
});

// ── VAL-SCOPE-005: Mixed-support runs keep supported work ─────

describe("mixed-support runs keep supported work (VAL-SCOPE-005)", () => {
  it("install -y -n --agent codexcli still processes skills and rules", async () => {
    const result = await runCli(["install", "-y", "-n", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout;
    // Warnings for unsupported
    expect(output).toContain("Skipping hooks for codexcli");
    expect(output).toContain("Skipping subagents for codexcli");
    // But the run still succeeds with supported work — should show completion message
    expect(output).toContain("✅");
  });

  it("install -y -n --agent claudecode processes everything (all supported)", async () => {
    const result = await runCli(["install", "-y", "-n", "--agent", "claudecode"]);
    expect(result.exitCode).toBe(0);
    // No warnings — claudecode supports everything
    expect(result.stdout).not.toContain("Skipping");
    expect(result.stdout).toContain("✅");
  });

  it("install -y -n --agent codexcli,claudecode processes hooks and subagents via claudecode", async () => {
    const result = await runCli(["install", "-y", "-n", "--agent", "codexcli,claudecode"]);
    expect(result.exitCode).toBe(0);
    // With both targets, hooks/subagents are supported via claudecode but not codexcli
    // The warning should appear for codexcli-specific unsupported combos
    // BUT because claudecode IS in the targets, hooks and subagents should still execute
    const output = result.stdout;
    expect(output).toContain("✅");
  });
});

// ── VAL-SCOPE-013: Fully unsupported becomes warning-only no-op ──

describe("fully unsupported selection is warning-only no-op (VAL-SCOPE-013)", () => {
  it("hooks -y -n --agent codexcli is no-op with warning + exit 0", async () => {
    const result = await runCli(["hooks", "-y", "-n", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipping hooks for codexcli");
    expect(result.stdout).toContain("Nothing to install");
  });

  it("subagents -y -n --agent factorydroid is no-op with warning + exit 0", async () => {
    const result = await runCli(["subagents", "-y", "-n", "--agent", "factorydroid"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipping subagents for factorydroid");
    expect(result.stdout).toContain("Nothing to install");
  });

  it("hooks -y -n --agent codexcli,factorydroid both unsupported still exit 0", async () => {
    const result = await runCli(["hooks", "-y", "-n", "--agent", "codexcli,factorydroid"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipping hooks for codexcli");
    expect(result.stdout).toContain("Skipping hooks for factorydroid");
    expect(result.stdout).toContain("Nothing to install");
  });

  it("hooks -y -n --agent claudecode does NOT warn (supported)", async () => {
    const result = await runCli(["hooks", "-y", "-n", "--agent", "claudecode"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Skipping");
    expect(result.stdout).not.toContain("Nothing to install");
  });

  it("subagents -y -n --agent claudecode does NOT warn (supported)", async () => {
    const result = await runCli(["subagents", "-y", "-n", "--agent", "claudecode"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Skipping");
    expect(result.stdout).not.toContain("Nothing to install");
  });

  it("singular subagent with fully unsupported agent is no-op with warning", async () => {
    const result = await runCli([
      "subagent",
      "code-quality-checker",
      "-n",
      "--agent",
      "codexcli",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipping subagents for codexcli");
    expect(result.stdout).toContain("Nothing to install");
  });
});

// ── No-agent flag: no warnings, default behavior ──────────────

describe("no explicit agent flag produces no warnings", () => {
  it("hooks -y -n without --agent has no unsupported warnings", async () => {
    const result = await runCli(["hooks", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Skipping");
  });

  it("subagents -y -n without --agent has no unsupported warnings", async () => {
    const result = await runCli(["subagents", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Skipping");
  });

  it("install -y -n without --agent has no unsupported warnings", async () => {
    const result = await runCli(["install", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Skipping");
  });
});

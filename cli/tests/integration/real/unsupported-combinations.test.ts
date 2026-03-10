import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";

/**
 * Integration tests (real CLI subprocess with dry-run) for unsupported
 * combination policy:
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
  tmpHome = `/tmp/af-unsup-real-${Date.now()}`;
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

// ── VAL-SCOPE-004: Warning with artifact+target+reason ────────

describe("unsupported combination warnings dry-run (VAL-SCOPE-004)", () => {
  it("hooks --agent codexcli emits warning with category, target, and reason", async () => {
    const result = await runCli(["hooks", "-y", "-n", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout;
    // Must include: artifact (hooks), target (codexcli), reason
    expect(output).toContain("hooks");
    expect(output).toContain("codexcli");
    expect(output).toContain("not supported");
  });

  it("subagents --agent factorydroid emits warning with reason", async () => {
    const result = await runCli(["subagents", "-y", "-n", "--agent", "factorydroid"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout;
    expect(output).toContain("subagents");
    expect(output).toContain("factorydroid");
    expect(output).toContain("not supported");
  });
});

// ── VAL-SCOPE-005: Mixed runs process supported, skip unsupported ──

describe("mixed-support dry-run (VAL-SCOPE-005)", () => {
  it("install --agent codexcli skips hooks/subagents but processes skills+rules", async () => {
    const result = await runCli(["install", "-y", "-n", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout;
    // Unsupported categories warned
    expect(output).toContain("Skipping hooks for codexcli");
    expect(output).toContain("Skipping subagents for codexcli");
    // But supported work still happens — completion message present
    expect(output).toContain("✅");
    // No DRY-RUN lines for hooks or subagents
    const dryRunLines = output.split("\n").filter((l) => l.includes("[DRY-RUN]"));
    for (const line of dryRunLines) {
      expect(line).not.toContain("Hook:");
      expect(line).not.toContain("Subagent:");
    }
  });

  it("install --agent claudecode has no warnings (all supported)", async () => {
    const result = await runCli(["install", "-y", "-n", "--agent", "claudecode"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Skipping");
    // DRY-RUN lines for hooks and subagents should appear
    const output = result.stdout;
    const dryRunLines = output.split("\n").filter((l) => l.includes("[DRY-RUN]"));
    const hasHookOrSubagent = dryRunLines.some(
      (l) => l.includes("Hook:") || l.includes("Subagent:"),
    );
    expect(hasHookOrSubagent).toBe(true);
  });
});

// ── VAL-SCOPE-013: Fully unsupported is no-op ─────────────────

describe("fully unsupported no-op dry-run (VAL-SCOPE-013)", () => {
  it("hooks --agent codexcli,factorydroid warns only for codexcli (factorydroid now supported)", async () => {
    const result = await runCli(["hooks", "-y", "-n", "--agent", "codexcli,factorydroid"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout;
    expect(output).toContain("Skipping hooks for codexcli");
    expect(output).not.toContain("Skipping hooks for factorydroid");
    expect(output).not.toContain("Nothing to install");
  });

  it("subagents --agent codexcli emits warning and does nothing", async () => {
    const result = await runCli(["subagents", "-y", "-n", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipping subagents for codexcli");
    expect(result.stdout).toContain("Nothing to install");
  });

  it("singular subagent --agent factorydroid emits warning and does nothing", async () => {
    const result = await runCli([
      "subagent",
      "code-quality-checker",
      "-n",
      "--agent",
      "factorydroid",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipping subagents for factorydroid");
    expect(result.stdout).toContain("Nothing to install");
  });

  it("no file writes occur on fully unsupported run", async () => {
    await runCli(["hooks", "-y", "-n", "--agent", "codexcli"]);
    // No .claude directory should have been created
    expect(existsSync(`${tmpHome}/.claude`)).toBe(false);
  });
});

// ── Cross-reference: combined scope + agent unsupported ───────

describe("combined scope and unsupported combinations", () => {
  it("install -y -n --user --agent codexcli warns hooks/subagents but processes rest", async () => {
    const result = await runCli(["install", "-y", "-n", "--user", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipping hooks for codexcli");
    expect(result.stdout).toContain("Skipping subagents for codexcli");
    expect(result.stdout).toContain("✅");
  });
});

// ── Concrete DRY-RUN markers for target routing evidence ──────

describe("concrete DRY-RUN markers confirm target routing (real)", () => {
  it("install --agent codexcli: no Hook or Subagent DRY-RUN lines", async () => {
    const result = await runCli(["install", "-y", "-n", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
    const lines = result.stdout.split("\n");
    const hookLines = lines.filter((l) => l.includes("[DRY-RUN]") && l.includes("Hook:"));
    const subagentLines = lines.filter((l) => l.includes("[DRY-RUN]") && l.includes("Subagent:"));
    expect(hookLines).toHaveLength(0);
    expect(subagentLines).toHaveLength(0);
    // Warnings confirm the omission
    expect(result.stdout).toContain("Skipping hooks");
    expect(result.stdout).toContain("Skipping subagents");
  });

  it("install --agent claudecode: Subagent DRY-RUN lines present, hooks reached", async () => {
    const result = await runCli(["install", "-y", "-n", "--agent", "claudecode"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout;
    // Subagent DRY-RUN lines should be present
    const subagentLines = output.split("\n").filter((l) => l.includes("[DRY-RUN]") && l.includes("Subagent:"));
    expect(subagentLines.length).toBeGreaterThan(0);
    // Hooks section is reached (info message appears)
    expect(output).toMatch(/Hook|hook/i);
    // No skip warnings
    expect(output).not.toContain("Skipping");
  });

  it("hooks --agent codexcli: zero Hook DRY-RUN lines emitted", async () => {
    const result = await runCli(["hooks", "-y", "-n", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
    const hookLines = result.stdout
      .split("\n")
      .filter((l) => l.includes("[DRY-RUN]") && l.includes("Hook:"));
    expect(hookLines).toHaveLength(0);
  });

  it("subagents --agent factorydroid: zero Subagent DRY-RUN lines emitted", async () => {
    const result = await runCli(["subagents", "-y", "-n", "--agent", "factorydroid"]);
    expect(result.exitCode).toBe(0);
    const subagentLines = result.stdout
      .split("\n")
      .filter((l) => l.includes("[DRY-RUN]") && l.includes("Subagent:"));
    expect(subagentLines).toHaveLength(0);
  });

  it("subagents --agent claudecode: Subagent DRY-RUN lines present", async () => {
    const result = await runCli(["subagents", "-y", "-n", "--agent", "claudecode"]);
    expect(result.exitCode).toBe(0);
    const subagentLines = result.stdout
      .split("\n")
      .filter((l) => l.includes("[DRY-RUN]") && l.includes("Subagent:"));
    expect(subagentLines.length).toBeGreaterThan(0);
  });
});

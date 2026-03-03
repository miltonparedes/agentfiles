import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";

/**
 * Integration tests (real CLI subprocess with dry-run) for singular command
 * scope and applicability enforcement:
 *
 * VAL-SCOPE-010: Singular install commands respect scope and applicability
 * VAL-SCOPE-009: Explicit minimal install path (singular commands as minimal path)
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
  tmpHome = `/tmp/af-singular-appl-${Date.now()}`;
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

// ── VAL-SCOPE-010: Singular commands scope + applicability ────

describe("singular skill scope and agent applicability (VAL-SCOPE-010)", () => {
  it("skill codex -n project scope does not write to user home", async () => {
    const result = await runCli(["skill", "codex", "-n"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    const homeLines = output
      .split("\n")
      .filter((l) => l.includes(tmpHome));
    expect(homeLines.length).toBe(0);
  });

  it("skill codex -n --agent codexcli processes only codexcli target", async () => {
    const result = await runCli(["skill", "codex", "-n", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
    // Skills are supported by codexcli — succeeds cleanly
    const output = result.stdout + result.stderr;
    expect(output).not.toContain("Skipping");
    expect(output).not.toContain("unsupported");
  });

  it("skill codex -n --user --agent factorydroid processes only factorydroid for user scope", async () => {
    const result = await runCli([
      "skill",
      "codex",
      "-n",
      "--user",
      "--agent",
      "factorydroid",
    ]);
    expect(result.exitCode).toBe(0);
    // Skills support factorydroid — no warnings
    expect(result.stdout + result.stderr).not.toContain("Skipping");
  });
});

describe("singular rule scope and agent applicability (VAL-SCOPE-010)", () => {
  it("rule typescript -n processes in project scope", async () => {
    const result = await runCli(["rule", "typescript", "-n"]);
    expect(result.exitCode).toBe(0);
  });

  it("rule typescript -n --user processes in user scope", async () => {
    const result = await runCli(["rule", "typescript", "-n", "--user"]);
    expect(result.exitCode).toBe(0);
  });

  it("rule typescript -n --agent codexcli processes only codexcli target", async () => {
    const result = await runCli(["rule", "typescript", "-n", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
    // Rules are supported by codexcli — no warnings
    expect(result.stdout + result.stderr).not.toContain("Skipping");
  });
});

describe("singular subagent scope and agent applicability (VAL-SCOPE-010)", () => {
  it("subagent code-quality-checker -n project scope writes to CWD", async () => {
    const result = await runCli(["subagent", "code-quality-checker", "-n"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout;
    const dryRunLines = output
      .split("\n")
      .filter((l) => l.includes("[DRY-RUN]") && l.includes("->"));
    // Should NOT reference HOME
    for (const line of dryRunLines) {
      expect(line).not.toContain(tmpHome);
    }
  });

  it("subagent code-quality-checker -n --user writes to user home", async () => {
    const result = await runCli(["subagent", "code-quality-checker", "-n", "--user"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout;
    const dryRunLines = output
      .split("\n")
      .filter((l) => l.includes("[DRY-RUN]") && l.includes("->"));
    for (const line of dryRunLines) {
      const dest = line.split("->")[1] ?? "";
      expect(dest).toContain(tmpHome);
    }
  });

  it("subagent code-quality-checker -n --agent codexcli warns and skips", async () => {
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

  it("subagent code-quality-checker -n --agent claudecode succeeds without warnings", async () => {
    const result = await runCli([
      "subagent",
      "code-quality-checker",
      "-n",
      "--agent",
      "claudecode",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Skipping");
    expect(result.stdout).toContain("[DRY-RUN] Subagent:");
  });

  it("subagent deep-architect -n --agent codexcli warns and is no-op", async () => {
    const result = await runCli([
      "subagent",
      "deep-architect",
      "-n",
      "--agent",
      "codexcli",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipping subagents for codexcli");
    expect(result.stdout).toContain("Nothing to install");
  });

  it("subagent with invalid agent fails fast", async () => {
    const result = await runCli([
      "subagent",
      "code-quality-checker",
      "-n",
      "--agent",
      "invalid",
    ]);
    expect(result.exitCode).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain("Invalid agent target");
  });
});

// ── VAL-SCOPE-009: Singular commands as explicit minimal install path ──

describe("singular commands as minimal install path (VAL-SCOPE-009)", () => {
  it("skill codex -n installs only the skill, not other categories", async () => {
    const result = await runCli(["skill", "codex", "-n"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    // No hook or subagent outputs
    expect(output).not.toContain("[DRY-RUN] Hook:");
    expect(output).not.toContain("[DRY-RUN] Subagent:");
  });

  it("subagent code-quality-checker -n installs only the subagent", async () => {
    const result = await runCli(["subagent", "code-quality-checker", "-n"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout;
    const dryRunLines = output.split("\n").filter((l) => l.includes("[DRY-RUN]"));
    // Only subagent DRY-RUN lines
    for (const line of dryRunLines) {
      expect(line).toContain("Subagent:");
    }
  });

  it("hooks -y -n installs only hooks category", async () => {
    const result = await runCli(["hooks", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout;
    const dryRunLines = output.split("\n").filter((l) => l.includes("[DRY-RUN]"));
    for (const line of dryRunLines) {
      expect(line).toContain("Hook:");
    }
  });
});

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";

/**
 * Dispatch/routing matrix integration tests (mock CLI subprocess).
 *
 * VAL-QUALITY-002: Mocked integration tests validate dispatch/routing matrix.
 *
 * Tests the dispatch decision logic across:
 * - All command families (install, skills, rules, hooks, subagents)
 * - Scope routing (project vs user)
 * - Agent filtering (all, single, multi)
 * - Dry-run vs non-dry-run
 * - Non-interactive (-y) vs interactive-rejected (non-TTY)
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
  tmpHome = `/tmp/af-dispatch-${Date.now()}`;
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

// ── Meta command dispatch ──────────────────────────────────────

describe("meta command dispatch", () => {
  it("-v dispatches to version output", async () => {
    const result = await runCli(["-v"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^af \d+\.\d+\.\d+$/);
  });

  it("--version dispatches identically to -v", async () => {
    const a = await runCli(["-v"]);
    const b = await runCli(["--version"]);
    expect(a.stdout).toBe(b.stdout);
    expect(a.exitCode).toBe(b.exitCode);
  });

  it("--help dispatches to help output with exit 0", async () => {
    const result = await runCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("install");
  });

  it("unknown command dispatches to usage with exit 1", async () => {
    const result = await runCli(["nonexistent"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain("Usage:");
  });

  it("missingName dispatches to usage error with exit 1", async () => {
    for (const cmd of ["skill", "rule", "subagent"]) {
      const result = await runCli([cmd]);
      expect(result.exitCode).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain("Usage:");
      expect(output).toContain(cmd);
    }
  });

  it("invalidAgent dispatches to error with exit 1 listing valid agents", async () => {
    const result = await runCli(["install", "-y", "-n", "--agent", "badval"]);
    expect(result.exitCode).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain("Invalid agent target");
    expect(output).toContain("claudecode");
  });
});

// ── Family command dispatch matrix ─────────────────────────────

describe("family dispatch: -y -n (non-interactive, dry-run)", () => {
  const families = ["install", "skills", "rules", "hooks", "subagents"] as const;

  for (const family of families) {
    it(`${family} -y -n exits 0`, async () => {
      const result = await runCli([family, "-y", "-n"]);
      expect(result.exitCode).toBe(0);
    });
  }

  it("install -y -n produces stdout output (completion message)", async () => {
    const result = await runCli(["install", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("✅");
  });

  it("hooks -y -n produces stdout output (dry-run lines)", async () => {
    const result = await runCli(["hooks", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
  });

  it("subagents -y -n produces stdout output (dry-run lines)", async () => {
    const result = await runCli(["subagents", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
  });
});

describe("family dispatch: scope routing (project vs user)", () => {
  it("install -y -n defaults to project scope", async () => {
    const result = await runCli(["install", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("project");
  });

  it("install -y -n --user uses user scope", async () => {
    const result = await runCli(["install", "-y", "-n", "--user"]);
    expect(result.exitCode).toBe(0);
    // User scope messages
    const output = result.stdout;
    expect(output).toContain("✅");
  });

  it("rules -y -n without --user shows language detection (project scope)", async () => {
    const result = await runCli(["rules", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Detected languages");
  });

  it("rules -y -n --user does NOT show language detection", async () => {
    const result = await runCli(["rules", "-y", "-n", "--user"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Detected languages");
  });
});

describe("family dispatch: agent filter routing", () => {
  it("install -y -n --agent claudecode: no skip warnings (all categories supported)", async () => {
    const result = await runCli(["install", "-y", "-n", "--agent", "claudecode"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Skipping");
  });

  it("install -y -n --agent codexcli: skip warnings for hooks and subagents", async () => {
    const result = await runCli(["install", "-y", "-n", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipping hooks");
    expect(result.stdout).toContain("Skipping subagents");
  });

  it("install -y -n --agent factorydroid: skip warnings for hooks and subagents", async () => {
    const result = await runCli(["install", "-y", "-n", "--agent", "factorydroid"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipping hooks");
    expect(result.stdout).toContain("Skipping subagents");
  });

  it("skills -y -n --agent codexcli: no skip (skills supported for all)", async () => {
    const result = await runCli(["skills", "-y", "-n", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Skipping");
  });
});

// ── Non-TTY guard dispatch ─────────────────────────────────────

describe("non-TTY guard dispatches correctly", () => {
  const interactiveFamilies = ["install", "skills", "rules", "hooks", "subagents"] as const;

  for (const family of interactiveFamilies) {
    it(`${family} without -y in non-TTY fails with guidance`, async () => {
      const result = await runCli([family]);
      expect(result.exitCode).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toContain("non-interactive");
    });
  }

  it("default command (no args) in non-TTY fails with guidance", async () => {
    const result = await runCli([]);
    expect(result.exitCode).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output.toLowerCase()).toContain("non-interactive");
  });

  for (const family of interactiveFamilies) {
    it(`${family} -y -n in non-TTY succeeds (bypasses interactive guard)`, async () => {
      const result = await runCli([family, "-y", "-n"]);
      expect(result.exitCode).toBe(0);
    });
  }
});

// ── Singular command dispatch ──────────────────────────────────

describe("singular command dispatch routing", () => {
  it("skill codex -n routes to skill install with dry-run", async () => {
    const result = await runCli(["skill", "codex", "-n"]);
    expect(result.exitCode).toBe(0);
  });

  it("rule typescript -n routes to rule install with dry-run", async () => {
    const result = await runCli(["rule", "typescript", "-n"]);
    expect(result.exitCode).toBe(0);
  });

  it("subagent deep-architect -n routes to subagent install with dry-run", async () => {
    const result = await runCli(["subagent", "deep-architect", "-n"]);
    expect(result.exitCode).toBe(0);
  });

  it("singular commands do not require -y (always non-interactive)", async () => {
    // Singular commands run without -y in non-TTY
    const result = await runCli(["skill", "codex", "-n"]);
    expect(result.exitCode).toBe(0);
  });
});

// ── Utility command dispatch ───────────────────────────────────

describe("utility command dispatch routing", () => {
  it("list dispatches without needing -y or interactive", async () => {
    const result = await runCli(["list"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
  });

  it("config dispatches without needing -y or interactive", async () => {
    const result = await runCli(["config"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Config file:");
  });

  it("setup dispatches from repo root", async () => {
    const result = await runCli(["setup"]);
    expect(result.exitCode).toBe(0);
  });
});

// ── Combined scope + agent dispatch ────────────────────────────

describe("combined scope and agent dispatch", () => {
  it("install -y -n --user --agent codexcli: user scope + codexcli + warnings", async () => {
    const result = await runCli(["install", "-y", "-n", "--user", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipping hooks");
    expect(result.stdout).toContain("Skipping subagents");
    expect(result.stdout).toContain("✅");
  });

  it("rules -y -n --user --agent claudecode: user scope + claudecode", async () => {
    const result = await runCli(["rules", "-y", "-n", "--user", "--agent", "claudecode"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Detected languages"); // user scope skips detection
    expect(result.stdout).not.toContain("Skipping"); // rules supported for claudecode
  });

  it("hooks -y -n --user --agent claudecode: user scope + claudecode supported", async () => {
    const result = await runCli(["hooks", "-y", "-n", "--user", "--agent", "claudecode"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Skipping");
    expect(result.stdout).not.toContain("Nothing to install");
  });

  it("hooks -y -n --user --agent codexcli: user scope + codexcli → fully unsupported no-op", async () => {
    const result = await runCli(["hooks", "-y", "-n", "--user", "--agent", "codexcli"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipping hooks for codexcli");
    expect(result.stdout).toContain("Nothing to install");
  });
});

// ── Flag equivalence in dispatch ───────────────────────────────

describe("short/long flag equivalence through dispatch", () => {
  it("-y -n equals --all --dry-run in dispatch output", async () => {
    const a = await runCli(["skills", "-y", "-n"]);
    const b = await runCli(["skills", "--all", "--dry-run"]);
    expect(a.exitCode).toBe(b.exitCode);
    expect(a.stdout).toBe(b.stdout);
  });

  it("-u equals --user in dispatch behavior", async () => {
    const a = await runCli(["rules", "-y", "-n", "-u"]);
    const b = await runCli(["rules", "-y", "-n", "--user"]);
    expect(a.exitCode).toBe(b.exitCode);
    expect(a.stdout).toBe(b.stdout);
  });
});

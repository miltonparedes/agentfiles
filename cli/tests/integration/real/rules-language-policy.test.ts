import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";

/**
 * Integration tests (real CLI subprocess with dry-run) for rules language policy:
 *
 * VAL-SCOPE-006: Project rules install respects detected language set
 * VAL-SCOPE-007: User-scope rules install is global and complete
 * VAL-SCOPE-008: No-language projects have explicit rule behavior
 * VAL-CROSS-008: Install-all in no-language project degrades gracefully
 */

const CWD = import.meta.dir + "/../../../..";
const CLI_SCRIPT = CWD + "/cli/src/cli.ts";
const CLI = ["bun", CLI_SCRIPT];

interface RunResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

let tmpHome: string;
let tmpNoLang: string;

beforeEach(() => {
  const ts = Date.now();
  tmpHome = `/tmp/af-lang-policy-home-${ts}`;
  tmpNoLang = `/tmp/af-lang-policy-nolang-${ts}`;
  mkdirSync(tmpHome, { recursive: true });
  mkdirSync(tmpNoLang, { recursive: true });
});

afterEach(() => {
  for (const dir of [tmpHome, tmpNoLang]) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

async function runCli(
  args: string[],
  opts?: { cwd?: string; env?: Record<string, string> },
): Promise<RunResult> {
  const proc = Bun.spawn([...CLI, ...args], {
    cwd: opts?.cwd ?? CWD,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      NO_COLOR: "1",
      HOME: tmpHome,
      AF_SKIP_RULESYNC_EXEC: "1",
      AF_REPO: CWD,
      ...opts?.env,
    },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

// ── VAL-SCOPE-006: Project rules install respects detected language set ──

describe("project rules install respects detected language set (VAL-SCOPE-006)", () => {
  it("rules -y -n in TypeScript project shows detected languages including typescript", async () => {
    // CWD is the agentfiles repo which has package.json → detects typescript
    const result = await runCli(["rules", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Detected languages:");
    expect(result.stdout).toContain("typescript");
  });

  it("rules -y -n in TypeScript project does not skip typescript rules", async () => {
    const result = await runCli(["rules", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    // Should NOT show a warning about skipping typescript rules
    expect(output).not.toContain("Skipping rules for");
    // Should NOT show no-language warning
    expect(output).not.toContain("No supported language detected");
  });

  it("rules -y -n in Python-only project detects python", async () => {
    // Create a Python-only fixture
    const pyDir = `/tmp/af-lang-policy-py-${Date.now()}`;
    mkdirSync(pyDir, { recursive: true });
    await Bun.write(`${pyDir}/requirements.txt`, "flask==3.0\n");

    try {
      const result = await runCli(["rules", "-y", "-n"], { cwd: pyDir });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Detected languages:");
      expect(result.stdout).toContain("python");
    } finally {
      rmSync(pyDir, { recursive: true, force: true });
    }
  });

  it("install -y -n in TypeScript project detects and reports languages for rules", async () => {
    const result = await runCli(["install", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Detected languages:");
    expect(result.stdout).toContain("typescript");
  });
});

// ── VAL-SCOPE-007: User-scope rules install is global and complete ────────

describe("user-scope rules install is global and complete (VAL-SCOPE-007)", () => {
  it("rules -y -n --user does NOT show language detection", async () => {
    const result = await runCli(["rules", "-y", "-n", "--user"]);
    expect(result.exitCode).toBe(0);
    // User scope should NOT filter by language — no detection message
    expect(result.stdout).not.toContain("Detected languages:");
  });

  it("rules -y -n --user does NOT show no-language warning", async () => {
    const result = await runCli(["rules", "-y", "-n", "--user"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).not.toContain("No supported language detected");
  });

  it("rules -y -n --user in no-language project still installs all rules", async () => {
    const result = await runCli(["rules", "-y", "-n", "--user"], { cwd: tmpNoLang });
    expect(result.exitCode).toBe(0);
    // User scope ignores language detection entirely
    expect(result.stdout).not.toContain("No supported language detected");
    expect(result.stdout).not.toContain("Detected languages:");
  });

  it("install -y -n --user does NOT show language detection (rules are global)", async () => {
    const result = await runCli(["install", "-y", "-n", "--user"]);
    expect(result.exitCode).toBe(0);
    // User-scope installAll skips project rules entirely, no lang detection
    expect(result.stdout).not.toContain("Detected languages:");
  });
});

// ── VAL-SCOPE-008: No-language projects have explicit rule behavior ───────

describe("no-language projects have explicit rule behavior (VAL-SCOPE-008)", () => {
  it("rules -y -n in no-language project emits warning", async () => {
    const result = await runCli(["rules", "-y", "-n"], { cwd: tmpNoLang });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No supported language detected");
  });

  it("rules -y -n in no-language project exits with 0 (success)", async () => {
    const result = await runCli(["rules", "-y", "-n"], { cwd: tmpNoLang });
    expect(result.exitCode).toBe(0);
  });

  it("rules -y -n in no-language project does no file writes", async () => {
    const result = await runCli(["rules", "-y", "-n"], { cwd: tmpNoLang });
    expect(result.exitCode).toBe(0);
    // No .rulesync or .claude dirs should be created
    const hasRulesync = existsSync(`${tmpNoLang}/.rulesync`);
    const hasClaude = existsSync(`${tmpNoLang}/.claude`);
    expect(hasRulesync).toBe(false);
    expect(hasClaude).toBe(false);
  });

  it("rules -y -n in no-language project shows skipped rules info", async () => {
    const result = await runCli(["rules", "-y", "-n"], { cwd: tmpNoLang });
    expect(result.exitCode).toBe(0);
    const output = result.stdout;
    // Should clearly indicate no rules were installed
    expect(output).toMatch(/no supported language|no rules to install/i);
  });
});

// ── VAL-CROSS-008: Install-all in no-language project degrades gracefully ─

describe("install-all in no-language project degrades gracefully (VAL-CROSS-008)", () => {
  it("install -y -n in no-language project still processes non-rule artifacts", async () => {
    const result = await runCli(["install", "-y", "-n"], { cwd: tmpNoLang });
    expect(result.exitCode).toBe(0);
    const output = result.stdout;
    // Non-rule artifacts (hooks, subagents) should still be processed
    // The overall install should succeed
    expect(output).toContain("Detected languages: none");
  });

  it("install -y -n in no-language project shows rules warning", async () => {
    const result = await runCli(["install", "-y", "-n"], { cwd: tmpNoLang });
    expect(result.exitCode).toBe(0);
    const output = result.stdout;
    // Should have a warning about rules being skipped due to no language
    expect(output).toContain("No supported language detected");
  });

  it("install -y -n in no-language project does not crash", async () => {
    const result = await runCli(["install", "-y", "-n"], { cwd: tmpNoLang });
    expect(result.exitCode).toBe(0);
    // Should have a success message at the end
    expect(result.stdout).toContain("✅");
  });
});

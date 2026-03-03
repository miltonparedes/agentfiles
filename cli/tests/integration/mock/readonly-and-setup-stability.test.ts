import { describe, expect, it } from "bun:test";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

/**
 * Integration tests for cli-core-readonly-and-setup-stability.
 *
 * Validates:
 * - VAL-CORE-010:  `af list` and `af config` complete exit 0, no file mutations
 * - VAL-CORE-010A: `af setup` persists config, commands work after setup
 *
 * Each test spawns `bun cli/src/cli.ts` as a subprocess.
 */

const CLI = ["bun", "cli/src/cli.ts"];
const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..", "..");

interface RunResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

async function runCli(
  args: string[],
  opts: { env?: Record<string, string>; cwd?: string } = {},
): Promise<RunResult> {
  const proc = Bun.spawn([...CLI, ...args], {
    cwd: opts.cwd ?? REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1", ...opts.env },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

function makeTempHome(): string {
  return mkdtempSync(join(tmpdir(), "af-test-"));
}

// ── VAL-CORE-010: Read-only commands stay successful ──────────

describe("read-only commands (VAL-CORE-010)", () => {
  it("af list exits with code 0", async () => {
    const result = await runCli(["list"]);
    expect(result.exitCode).toBe(0);
  });

  it("af list outputs skills section", async () => {
    const result = await runCli(["list"]);
    expect(result.stdout).toContain("Skills:");
  });

  it("af list outputs rules section", async () => {
    const result = await runCli(["list"]);
    expect(result.stdout).toContain("Rules:");
  });

  it("af list outputs agents section", async () => {
    const result = await runCli(["list"]);
    expect(result.stdout).toContain("Agents");
  });

  it("af list outputs hooks section", async () => {
    const result = await runCli(["list"]);
    expect(result.stdout).toContain("Hooks");
  });

  it("af config exits with code 0", async () => {
    const result = await runCli(["config"]);
    expect(result.exitCode).toBe(0);
  });

  it("af config outputs config file path", async () => {
    const result = await runCli(["config"]);
    expect(result.stdout).toContain("Config file:");
  });

  it("af config outputs resolved path", async () => {
    const result = await runCli(["config"]);
    expect(result.stdout).toContain("Resolved:");
  });

  it("af list does not mutate project files", async () => {
    const proc = Bun.spawn(["git", "status", "--porcelain"], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const beforeStatus = await new Response(proc.stdout).text();
    await proc.exited;

    await runCli(["list"]);

    const proc2 = Bun.spawn(["git", "status", "--porcelain"], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const afterStatus = await new Response(proc2.stdout).text();
    await proc2.exited;

    expect(afterStatus).toBe(beforeStatus);
  });

  it("af config does not mutate project files", async () => {
    const proc = Bun.spawn(["git", "status", "--porcelain"], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const beforeStatus = await new Response(proc.stdout).text();
    await proc.exited;

    await runCli(["config"]);

    const proc2 = Bun.spawn(["git", "status", "--porcelain"], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const afterStatus = await new Response(proc2.stdout).text();
    await proc2.exited;

    expect(afterStatus).toBe(beforeStatus);
  });
});

// ── VAL-CORE-010A: Setup command remains functional ───────────

describe("setup command (VAL-CORE-010A)", () => {
  it("af setup exits with code 0 from repo root", async () => {
    const tmpHome = makeTempHome();
    const result = await runCli(["setup"], { env: { HOME: tmpHome } });
    expect(result.exitCode).toBe(0);
  });

  it("af setup prints saved repo path confirmation", async () => {
    const tmpHome = makeTempHome();
    const result = await runCli(["setup"], { env: { HOME: tmpHome } });
    expect(result.stdout).toContain("Saved repo path:");
  });

  it("af setup persists config.json with repoPath", async () => {
    const tmpHome = makeTempHome();
    await runCli(["setup"], { env: { HOME: tmpHome } });
    const configPath = join(tmpHome, ".agentfiles", "config.json");
    expect(existsSync(configPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(cfg.repoPath).toBe(REPO_ROOT);
  });

  it("af config reads persisted repo path after setup", async () => {
    const tmpHome = makeTempHome();
    await runCli(["setup"], { env: { HOME: tmpHome } });
    const result = await runCli(["config"], { env: { HOME: tmpHome } });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(REPO_ROOT);
    expect(result.stdout).toContain("✓");
  });

  it("af list works after setup", async () => {
    const tmpHome = makeTempHome();
    await runCli(["setup"], { env: { HOME: tmpHome } });
    const result = await runCli(["list"], { env: { HOME: tmpHome } });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skills:");
  });

  it("af setup fails outside agentfiles repo", async () => {
    const tmpHome = makeTempHome();
    const cliPath = join(REPO_ROOT, "cli", "src", "cli.ts");
    const proc = Bun.spawn(["bun", cliPath, "setup"], {
      cwd: tmpHome,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, NO_COLOR: "1", HOME: tmpHome },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).not.toBe(0);
    expect(stdout).toContain("Not an agentfiles repo");
  });

  it("basic commands still work after setup", async () => {
    const tmpHome = makeTempHome();
    await runCli(["setup"], { env: { HOME: tmpHome } });

    // version
    const vResult = await runCli(["-v"], { env: { HOME: tmpHome } });
    expect(vResult.exitCode).toBe(0);
    expect(vResult.stdout).toContain("af ");

    // config
    const cResult = await runCli(["config"], { env: { HOME: tmpHome } });
    expect(cResult.exitCode).toBe(0);

    // list
    const lResult = await runCli(["list"], { env: { HOME: tmpHome } });
    expect(lResult.exitCode).toBe(0);
  });
});

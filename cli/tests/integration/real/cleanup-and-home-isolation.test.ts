import { describe, expect, it, beforeEach, afterEach, setDefaultTimeout } from "bun:test";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Integration tests (real CLI subprocess) for deterministic cleanup
 * and HOME isolation:
 *
 * VAL-CROSS-006: Temporary rulesync artifacts are cleaned and reruns deterministic
 * VAL-CROSS-007: Project scope is isolated from pre-existing user rulesync state
 *
 * Additional coverage:
 * - User-scope (--user) runs succeed even when HOME has pre-existing rulesync state
 * - Cleanup is deterministic across repeated runs
 */

// Real rulesync invocations can take up to 30s
setDefaultTimeout(60_000);

const CLI = ["bun", "cli/src/cli.ts"];
const CWD = import.meta.dir + "/../../../..";

interface RunResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

let tmpHome: string;

beforeEach(() => {
  tmpHome = `/tmp/af-cleanup-test-${Date.now()}`;
  mkdirSync(tmpHome, { recursive: true });
});

afterEach(() => {
  if (existsSync(tmpHome)) {
    rmSync(tmpHome, { recursive: true, force: true });
  }
  // Defensive cleanup of CWD residuals in case a test fails mid-run
  const cwdRulesync = join(CWD, ".rulesync");
  const cwdConfig = join(CWD, "rulesync.jsonc");
  if (existsSync(cwdRulesync)) rmSync(cwdRulesync, { recursive: true, force: true });
  if (existsSync(cwdConfig)) rmSync(cwdConfig, { force: true });
});

async function runCli(
  args: string[],
  env?: Record<string, string>,
): Promise<RunResult> {
  const proc = Bun.spawn([...CLI, ...args], {
    cwd: CWD,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      NO_COLOR: "1",
      HOME: tmpHome,
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

/** Run CLI with AF_SKIP_RULESYNC_EXEC=1 (guard logic only, no real rulesync) */
async function runCliSkipExec(
  args: string[],
  env?: Record<string, string>,
): Promise<RunResult> {
  return runCli(args, { AF_SKIP_RULESYNC_EXEC: "1", ...env });
}

// ── VAL-CROSS-006: Cleanup and deterministic reruns ──────────
// These tests run REAL rulesync to verify cleanup of temporary staging.

describe("temporary rulesync artifacts cleaned after run (VAL-CROSS-006)", () => {
  it("no .rulesync/ or rulesync.jsonc in CWD after real dry-run install", async () => {
    const result = await runCli(["install", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(CWD, ".rulesync"))).toBe(false);
    expect(existsSync(join(CWD, "rulesync.jsonc"))).toBe(false);
  });

  it("no .rulesync/ or rulesync.jsonc in HOME after user-scope real dry-run", async () => {
    const result = await runCli(["skills", "-y", "-n", "--user"]);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(tmpHome, ".rulesync"))).toBe(false);
    expect(existsSync(join(tmpHome, "rulesync.jsonc"))).toBe(false);
  });

  it("repeating install -y -n produces consistent output", async () => {
    const result1 = await runCli(["install", "-y", "-n"]);
    const result2 = await runCli(["install", "-y", "-n"]);
    expect(result1.exitCode).toBe(0);
    expect(result2.exitCode).toBe(0);
    // Both runs should produce the same key content markers
    expect(result1.stdout).toContain("installed to project scope");
    expect(result2.stdout).toContain("installed to project scope");
    // Neither should mention cleanup of residuals (clean run)
    expect(result2.stdout).not.toContain("Cleaning up residual");
  });

  it("repeating skills -y -n --user produces consistent output", async () => {
    const result1 = await runCli(["skills", "-y", "-n", "--user"]);
    const result2 = await runCli(["skills", "-y", "-n", "--user"]);
    expect(result1.exitCode).toBe(0);
    expect(result2.exitCode).toBe(0);
    // Second run should not see residuals
    expect(result2.stdout).not.toContain("Cleaning up residual");
  });
});

// ── VAL-CROSS-007: Project scope isolation from HOME state ───
// These use AF_SKIP_RULESYNC_EXEC since the guard runs before the skip.

describe("project scope isolated from HOME rulesync state (VAL-CROSS-007)", () => {
  it("install -y -n with pre-existing HOME rulesync.jsonc stays project-scoped", async () => {
    // Plant native rulesync state in HOME
    writeFileSync(
      join(tmpHome, "rulesync.jsonc"),
      JSON.stringify({
        $schema: "https://example.com/schema",
        targets: ["custom-target"],
        features: ["custom"],
        global: true,
        delete: false,
      }),
    );
    mkdirSync(join(tmpHome, ".rulesync"), { recursive: true });
    writeFileSync(join(tmpHome, ".rulesync", "native-rule.md"), "# native rule");

    const result = await runCliSkipExec(["install", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    // Project scope DRY-RUN lines should NOT reference tmpHome
    const output = result.stdout + result.stderr;
    const homeDryRuns = output
      .split("\n")
      .filter((l) => l.includes("[DRY-RUN]") && l.includes(tmpHome));
    expect(homeDryRuns.length).toBe(0);
    // The HOME native state must NOT be deleted
    expect(existsSync(join(tmpHome, "rulesync.jsonc"))).toBe(true);
    expect(existsSync(join(tmpHome, ".rulesync", "native-rule.md"))).toBe(true);
  });

  it("rules -y -n with HOME rulesync state does not route through HOME", async () => {
    writeFileSync(
      join(tmpHome, "rulesync.jsonc"),
      '{"targets":["custom"],"features":["custom"]}',
    );

    const result = await runCliSkipExec(["rules", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout;
    // Should detect languages (project scope behavior)
    expect(output).toContain("Detected languages:");
    // No DRY-RUN should reference HOME
    const homeDryRuns = output
      .split("\n")
      .filter((l) => l.includes("[DRY") && l.includes(tmpHome));
    expect(homeDryRuns.length).toBe(0);
  });
});

// ── User-scope with pre-existing HOME rulesync state ─────────
// The guard must NOT block user-scope runs because pre-existing state
// in HOME is expected (the user may have native rulesync configs).

describe("user-scope runs tolerate pre-existing HOME rulesync state", () => {
  it("skills -y -n --user succeeds even with native rulesync.jsonc in HOME", async () => {
    // Plant a native (non-CLI-generated) rulesync.jsonc in HOME
    writeFileSync(
      join(tmpHome, "rulesync.jsonc"),
      JSON.stringify({
        $schema: "https://example.com/schema",
        targets: ["custom-target"],
        features: ["custom"],
        global: true,
        delete: false,
      }),
    );

    const result = await runCliSkipExec(["skills", "-y", "-n", "--user"]);
    expect(result.exitCode).toBe(0);
    // Should complete without "Native rulesync configuration detected" block
    expect(result.stdout).not.toContain("Native rulesync configuration detected");
  });

  it("skills -y -n --user succeeds even with .rulesync/ dir in HOME", async () => {
    mkdirSync(join(tmpHome, ".rulesync", "rules"), { recursive: true });
    writeFileSync(join(tmpHome, ".rulesync", "rules", "native.md"), "# native");

    const result = await runCliSkipExec(["skills", "-y", "-n", "--user"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Native rulesync configuration detected");
  });

  it("install -y -n --user succeeds with pre-existing HOME rulesync state", async () => {
    writeFileSync(
      join(tmpHome, "rulesync.jsonc"),
      JSON.stringify({
        targets: ["my-target"],
        features: ["rules"],
        global: true,
        delete: false,
      }),
    );
    mkdirSync(join(tmpHome, ".rulesync"), { recursive: true });

    const result = await runCliSkipExec(["install", "-y", "-n", "--user"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Native rulesync configuration detected");
  });

  it("user-scope cleanup restores pre-existing native config in HOME", async () => {
    // Plant native rulesync.jsonc in HOME (non-CLI)
    const nativeContent = JSON.stringify({
      targets: ["custom"],
      features: ["rules"],
      global: true,
    });
    writeFileSync(join(tmpHome, "rulesync.jsonc"), nativeContent);
    mkdirSync(join(tmpHome, ".rulesync", "rules"), { recursive: true });
    writeFileSync(join(tmpHome, ".rulesync", "rules", "my-rule.md"), "# Keep me");

    // Run user-scope with real rulesync to verify cleanup
    const result = await runCli(["skills", "-y", "-n", "--user"]);
    expect(result.exitCode).toBe(0);

    // After run, the native rulesync.jsonc should be restored
    expect(existsSync(join(tmpHome, "rulesync.jsonc"))).toBe(true);
    // The native .rulesync/rules content should be restored
    expect(existsSync(join(tmpHome, ".rulesync", "rules", "my-rule.md"))).toBe(true);
  });
});

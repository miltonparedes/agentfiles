import { afterEach, describe, expect, it, setDefaultTimeout } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Guard tests validate cleanup/blocking logic only — skip actual rulesync
// execution (npx calls) via AF_SKIP_RULESYNC_EXEC to avoid 30s+ timeouts.
setDefaultTimeout(15_000);

/**
 * Integration tests for the rulesync guard logic:
 *
 * - CLI-generated residual rulesync.jsonc is auto-cleaned and does not block
 * - Legacy (pre-marker) residuals are also detected and cleaned
 * - Native rulesync configs (non-CLI) still block with a clear message
 * - Residual .rulesync/ staging dir with marker is auto-cleaned
 * - Repeated dry-run invocations are deterministic (no residuals left)
 */

const CLI = ["bun", "cli/src/cli.ts"];
const CWD = import.meta.dir + "/../../../..";

interface RunResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

async function runCli(args: string[], env?: Record<string, string>): Promise<RunResult> {
  const proc = Bun.spawn([...CLI, ...args], {
    cwd: CWD,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1", AF_SKIP_RULESYNC_EXEC: "1", ...env },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

const residualConfig = join(CWD, "rulesync.jsonc");
const residualDir = join(CWD, ".rulesync");

afterEach(() => {
  // Ensure clean state after each test
  if (existsSync(residualConfig)) rmSync(residualConfig, { force: true });
  if (existsSync(residualDir)) rmSync(residualDir, { recursive: true, force: true });
});

// ── Residual detection and cleanup ───────────────────────────

describe("rulesync guard: residual cleanup", () => {
  it("auto-cleans CLI-generated residual with @af-generated marker", async () => {
    writeFileSync(
      residualConfig,
      '// @af-generated — do not edit; will be cleaned up automatically\n{"targets":["claudecode"]}',
    );
    const result = await runCli(["rules", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Cleaning up residual rulesync artifacts");
    expect(existsSync(residualConfig)).toBe(false);
  });

  it("auto-cleans legacy residual (pre-marker) matching CLI structure", async () => {
    // Legacy format: has rulesync schema + "delete": false, but no @af-generated marker
    const legacyConfig = JSON.stringify(
      {
        $schema: "https://raw.githubusercontent.com/dyoshikawa/rulesync/refs/heads/main/config-schema.json",
        targets: ["claudecode", "codexcli", "factorydroid"],
        features: ["rules"],
        global: false,
        delete: false,
      },
      null,
      2,
    );
    writeFileSync(residualConfig, legacyConfig);
    const result = await runCli(["rules", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Cleaning up residual rulesync artifacts");
    expect(existsSync(residualConfig)).toBe(false);
  });

  it("auto-cleans residual .rulesync/ staging dir with .af-staging marker", async () => {
    mkdirSync(residualDir, { recursive: true });
    writeFileSync(join(residualDir, ".af-staging"), "");
    const result = await runCli(["rules", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Cleaning up residual rulesync staging");
    expect(existsSync(residualDir)).toBe(false);
  });
});

// ── Native config protection ─────────────────────────────────

describe("rulesync guard: native config protection", () => {
  it("blocks on native rulesync.jsonc without CLI markers", async () => {
    // A truly native config — different structure, no CLI markers
    writeFileSync(
      residualConfig,
      JSON.stringify({ targets: ["custom-target"], features: ["rules"] }, null, 2),
    );
    const result = await runCli(["rules", "-y", "-n"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Native rulesync configuration detected");
    // Clean up
    rmSync(residualConfig, { force: true });
  });

  it("blocks on .rulesync/ dir without .af-staging marker", async () => {
    // Dir exists but no marker — assume native project
    mkdirSync(residualDir, { recursive: true });
    writeFileSync(join(residualDir, "some-config.yaml"), "native: true");
    // Also need a rulesync.jsonc without marker to trigger the native guard
    // (only dir without config triggers the .af-staging check)
    const result = await runCli(["rules", "-y", "-n"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Native rulesync configuration detected");
    // Clean up
    rmSync(residualDir, { recursive: true, force: true });
  });
});

// ── Native-vs-residual collision (false positive protection) ─

describe("rulesync guard: native-vs-residual collision", () => {
  it("does NOT delete a native untracked config that has schema URL and delete:false", async () => {
    // A valid native config that coincidentally uses the same schema and delete:false
    // but is NOT CLI-generated (no @af-generated marker, no CLI-specific structure)
    const nativeConfig = JSON.stringify(
      {
        $schema:
          "https://raw.githubusercontent.com/dyoshikawa/rulesync/refs/heads/main/config-schema.json",
        targets: ["my-custom-target"],
        delete: false,
        rules: { include: ["src/**"] },
      },
      null,
      2,
    );
    writeFileSync(residualConfig, nativeConfig);
    const result = await runCli(["rules", "-y", "-n"]);
    // Must block — NOT auto-delete
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Native rulesync configuration detected");
    // The file must still exist (not deleted)
    expect(existsSync(residualConfig)).toBe(true);
  });

  it("does NOT delete a native config with schema+delete:false but custom targets", async () => {
    // Native config that happens to match the loose legacy heuristic
    const nativeConfig = JSON.stringify(
      {
        $schema:
          "https://raw.githubusercontent.com/dyoshikawa/rulesync/refs/heads/main/config-schema.json",
        targets: ["vscode-copilot", "jetbrains-ai"],
        delete: false,
      },
      null,
      2,
    );
    writeFileSync(residualConfig, nativeConfig);
    const result = await runCli(["rules", "-y", "-n"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Native rulesync configuration detected");
    expect(existsSync(residualConfig)).toBe(true);
  });

  it("does NOT delete a native config with schema+delete:false and extra fields", async () => {
    // A native config with delete:false and the schema, but also has fields
    // that the CLI never generates (e.g., custom properties)
    const nativeConfig = JSON.stringify(
      {
        $schema:
          "https://raw.githubusercontent.com/dyoshikawa/rulesync/refs/heads/main/config-schema.json",
        targets: ["claudecode"],
        features: ["rules"],
        delete: false,
        customField: "user-specific-value",
        version: "2.0",
      },
      null,
      2,
    );
    writeFileSync(residualConfig, nativeConfig);
    const result = await runCli(["rules", "-y", "-n"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Native rulesync configuration detected");
    expect(existsSync(residualConfig)).toBe(true);
  });

  it("still auto-cleans true legacy CLI residuals with exact CLI structure", async () => {
    // Exact legacy CLI format: schema + known targets + features array + global:false + delete:false
    // and NO extra keys that the CLI never writes
    const legacyCliConfig = JSON.stringify(
      {
        $schema:
          "https://raw.githubusercontent.com/dyoshikawa/rulesync/refs/heads/main/config-schema.json",
        targets: ["claudecode", "codexcli", "factorydroid"],
        features: ["skills", "rules"],
        global: false,
        delete: false,
      },
      null,
      2,
    );
    writeFileSync(residualConfig, legacyCliConfig);
    const result = await runCli(["rules", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Cleaning up residual rulesync artifacts");
    expect(existsSync(residualConfig)).toBe(false);
  });

  it("does NOT delete .rulesync/ dir with native content but no .af-staging", async () => {
    // A .rulesync/ dir that exists from native rulesync usage — no .af-staging marker
    mkdirSync(join(residualDir, "rules"), { recursive: true });
    writeFileSync(join(residualDir, "rules", "my-rule.md"), "# My native rule");
    const result = await runCli(["rules", "-y", "-n"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Native rulesync configuration detected");
    // Dir must still exist
    expect(existsSync(residualDir)).toBe(true);
    expect(existsSync(join(residualDir, "rules", "my-rule.md"))).toBe(true);
  });
});

// ── Deterministic reruns ─────────────────────────────────────

describe("rulesync guard: deterministic reruns", () => {
  it("repeated dry-run leaves no residuals", async () => {
    const result1 = await runCli(["rules", "-y", "-n"]);
    expect(result1.exitCode).toBe(0);
    expect(existsSync(residualConfig)).toBe(false);
    expect(existsSync(residualDir)).toBe(false);

    const result2 = await runCli(["rules", "-y", "-n"]);
    expect(result2.exitCode).toBe(0);
    expect(existsSync(residualConfig)).toBe(false);
    expect(existsSync(residualDir)).toBe(false);
  });

  it("no cleanup message on clean runs", async () => {
    const result = await runCli(["rules", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Cleaning up residual");
  });
});

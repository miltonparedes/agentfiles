import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..", "..");
const CLI_ABS = ["bun", resolve(REPO_ROOT, "cli/src/cli.ts")];

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[]): Promise<RunResult> {
  const proc = Bun.spawn([...CLI_ABS, ...args], {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

describe("af update in dev mode", () => {
  it("exits with code 1 in non-compiled mode", async () => {
    const result = await runCli(["update"]);
    expect(result.exitCode).toBe(1);
  });

  it("suggests git pull in dev mode", async () => {
    const result = await runCli(["update"]);
    expect(result.stdout).toContain("git pull");
  });

  it("warns that self-update requires compiled binary", async () => {
    const result = await runCli(["update"]);
    expect(result.stdout).toContain("compiled binary");
  });
});

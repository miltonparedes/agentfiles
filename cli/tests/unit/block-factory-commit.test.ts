import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const HOOK_SCRIPT = resolve(import.meta.dir, "..", "..", "..", "hooks", "block-factory-commit.sh");
const tempDirs: string[] = [];

function runGit(cwd: string, args: string[]): void {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString() || `git ${args.join(" ")} failed`);
  }
}

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "af-hook-guard-"));
  tempDirs.push(dir);

  runGit(dir, ["init"]);
  runGit(dir, ["config", "user.email", "test@example.com"]);
  runGit(dir, ["config", "user.name", "Test User"]);

  return dir;
}

function runHook(cwd: string, command: string): { exitCode: number; stdout: string } {
  const inputPath = join(cwd, ".hook-input.json");
  writeFileSync(inputPath, JSON.stringify({ tool_input: { command } }));

  const result = Bun.spawnSync(["bash", "-lc", `bash '${HOOK_SCRIPT}' < '${inputPath}'`], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { force: true, recursive: true });
  }
});

describe("block-factory-commit hook", () => {
  it("blocks explicit .factory paths", () => {
    const repo = makeRepo();
    mkdirSync(join(repo, ".factory"), { recursive: true });
    writeFileSync(join(repo, ".factory", "config.json"), "{}\n");

    const result = runHook(repo, "git add .factory");

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain("Do not commit the .factory directory");
  });

  it("blocks git add . when .factory has pending changes", () => {
    const repo = makeRepo();
    mkdirSync(join(repo, ".factory"), { recursive: true });
    writeFileSync(join(repo, ".factory", "config.json"), "{}\n");

    const result = runHook(repo, "git add .");

    expect(result.exitCode).toBe(2);
  });

  it("blocks git commit -a when tracked .factory files changed", () => {
    const repo = makeRepo();
    mkdirSync(join(repo, ".factory"), { recursive: true });
    writeFileSync(join(repo, ".factory", "config.json"), "{}\n");
    writeFileSync(join(repo, "README.md"), "# test\n");
    runGit(repo, ["add", "."]);
    runGit(repo, ["commit", "-m", "initial"]);

    writeFileSync(join(repo, ".factory", "config.json"), '{"changed":true}\n');

    const result = runHook(repo, "git commit -a -m update");

    expect(result.exitCode).toBe(2);
  });

  it("allows broad git add flows when .factory is clean", () => {
    const repo = makeRepo();
    writeFileSync(join(repo, "README.md"), "# test\n");

    const result = runHook(repo, "git add .");

    expect(result.exitCode).toBe(0);
  });
});

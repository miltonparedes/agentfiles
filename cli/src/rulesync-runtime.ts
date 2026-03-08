import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR } from "./config.ts";

const RULESYNC_PACKAGE = Bun.env.AF_RULESYNC_PACKAGE ?? "rulesync";
const RULESYNC_BIN = process.platform === "win32" ? "rulesync.cmd" : "rulesync";
const RUNTIME_DIR = join(CONFIG_DIR, "runtime", "rulesync");
const RUNTIME_BIN = join(RUNTIME_DIR, "node_modules", ".bin", RULESYNC_BIN);

export interface RulesyncRuntimeOptions {
  onStatus?: (message: string) => void;
  silent?: boolean;
}

let bootstrapPromise: Promise<void> | undefined;

function emitStatus(opts: RulesyncRuntimeOptions | undefined, message: string): void {
  if (opts?.onStatus) {
    opts.onStatus(message);
    return;
  }
  if (!opts?.silent) {
    console.log(`ℹ ${message}`);
  }
}

async function runCommand(
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; output: string }> {
  const proc = Bun.spawn(args, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      NO_COLOR: "1",
    },
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return {
    exitCode,
    output: [stdout, stderr].filter(Boolean).join("\n").trim(),
  };
}

async function hasWorkingRuntime(): Promise<boolean> {
  if (!existsSync(RUNTIME_BIN)) return false;
  try {
    const version = await runCommand([RUNTIME_BIN, "--version"], RUNTIME_DIR);
    return version.exitCode === 0;
  } catch {
    return false;
  }
}

async function installRuntime(opts?: RulesyncRuntimeOptions): Promise<void> {
  mkdirSync(RUNTIME_DIR, { recursive: true });

  const pkgPath = join(RUNTIME_DIR, "package.json");
  if (!existsSync(pkgPath)) {
    writeFileSync(pkgPath, '{"name":"af-rulesync-runtime","private":true}\n');
  }

  emitStatus(opts, "Instalando rulesync (primera ejecución)…");

  const install = await runCommand(
    [
      "npm",
      "install",
      "--no-audit",
      "--no-fund",
      "--prefer-offline",
      "--no-progress",
      RULESYNC_PACKAGE,
    ],
    RUNTIME_DIR,
  );

  if (install.exitCode !== 0) {
    const details = install.output ? `\n${install.output}` : "";
    throw new Error(`No se pudo instalar ${RULESYNC_PACKAGE}.${details}`);
  }
}

async function ensureRuntimeInternal(opts?: RulesyncRuntimeOptions): Promise<void> {
  emitStatus(opts, "Preparando rulesync…");

  if (await hasWorkingRuntime()) {
    return;
  }

  await installRuntime(opts);

  if (!(await hasWorkingRuntime())) {
    throw new Error(`rulesync no quedó disponible en runtime local (${RUNTIME_BIN}).`);
  }
}

export function prewarmRulesyncRuntime(opts?: RulesyncRuntimeOptions): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = ensureRuntimeInternal(opts).catch((err) => {
      bootstrapPromise = undefined;
      throw err;
    });
  }
  return bootstrapPromise;
}

export async function ensureRulesyncRuntime(opts?: RulesyncRuntimeOptions): Promise<void> {
  await prewarmRulesyncRuntime(opts);
}

export function getRulesyncBinPath(): string {
  return RUNTIME_BIN;
}

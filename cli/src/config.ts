import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/** existsSync for directories — Bun.file().exists() only works for files */
export function dirExists(path: string): boolean {
  return existsSync(path);
}

export const config = {
  dryRun: false,
  backupEnabled: (Bun.env.BACKUP ?? "1") === "1",
  userLevel: false,
};

declare const __COMPILED__: boolean;
export const IS_COMPILED = typeof __COMPILED__ !== "undefined" && __COMPILED__;

export const SCRIPT_DIR = join(import.meta.dir, "..", ".."); // cli/src -> agentfiles/
export const HOME = homedir();

// ── Persistent config (~/.agentfiles/config.json) ────────────

export const CONFIG_DIR = join(HOME, ".agentfiles");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");

interface AgentfilesConfig {
  repoPath?: string;
}

export function loadConfig(): AgentfilesConfig {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

export function saveConfig(cfg: AgentfilesConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
}

// ── Repo root resolution ─────────────────────────────────────
// 1. AF_REPO env var (override)
// 2. ~/.agentfiles/config.json → repoPath
// 3. SCRIPT_DIR (dev mode fallback)

function resolveRepoRoot(): string {
  if (Bun.env.AF_REPO) return Bun.env.AF_REPO;
  const cfg = loadConfig();
  if (cfg.repoPath && dirExists(cfg.repoPath)) return cfg.repoPath;
  return SCRIPT_DIR;
}

export const REPO_ROOT = resolveRepoRoot();

/** True when we have a valid repo path from config or env (not just SCRIPT_DIR fallback) */
export const HAS_REPO_PATH =
  !!Bun.env.AF_REPO || (!!loadConfig().repoPath && dirExists(loadConfig().repoPath ?? ""));

export const SKILLS_DIR = join(REPO_ROOT, "skills");
export const RULES_DIR = join(REPO_ROOT, "rules");
export const HOOKS_DIR = join(REPO_ROOT, "hooks");
export const SUBAGENTS_DIR = join(REPO_ROOT, "subagents");

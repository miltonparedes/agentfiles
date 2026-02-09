import { existsSync } from "node:fs";
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

export const SCRIPT_DIR = join(import.meta.dir, "..");
export const HOME = homedir();
export const SKILLS_DIR = join(SCRIPT_DIR, "skills");
export const RULES_DIR = join(SCRIPT_DIR, "rules");
export const HOOKS_DIR = join(SCRIPT_DIR, "hooks");

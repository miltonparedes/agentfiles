import { readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  IS_COMPILED,
  SKILLS_DIR,
  RULES_DIR,
  HOOKS_DIR,
  SUBAGENTS_DIR,
  dirExists,
} from "./config.ts";

// Lazy-loaded manifest (only in compiled mode)
let _manifest: typeof import("./generated/manifest.ts") | null = null;

async function manifest() {
  if (!_manifest) {
    _manifest = await import("./generated/manifest.ts");
  }
  return _manifest;
}

// ── Skills ────────────────────────────────────────────────────

export function listSkillDirs(): string[] {
  if (IS_COMPILED) {
    // Defer to manifest — loaded lazily in async callers
    throw new Error("Use listSkillDirsAsync() in compiled mode");
  }
  if (!dirExists(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

export async function listSkillDirsAsync(): Promise<string[]> {
  if (IS_COMPILED) {
    const m = await manifest();
    return Object.keys(m.SKILLS);
  }
  return listSkillDirs();
}

export async function readSkillFile(
  skill: string,
  file: string,
): Promise<string | null> {
  if (IS_COMPILED) {
    const m = await manifest();
    const s = m.SKILLS[skill];
    if (!s) return null;
    return s.files[file] ?? null;
  }
  const path = join(SKILLS_DIR, skill, file);
  const f = Bun.file(path);
  if (!(await f.exists())) return null;
  return f.text();
}

export async function listSkillSubdirs(skill: string): Promise<string[]> {
  if (IS_COMPILED) {
    const m = await manifest();
    const s = m.SKILLS[skill];
    if (!s) return [];
    return Object.keys(s.subdirs);
  }
  const skillDir = join(SKILLS_DIR, skill);
  if (!dirExists(skillDir)) return [];
  return readdirSync(skillDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

export async function readSkillSubdirFile(
  skill: string,
  subdir: string,
  file: string,
): Promise<string | null> {
  if (IS_COMPILED) {
    const m = await manifest();
    const s = m.SKILLS[skill];
    if (!s) return null;
    const sub = s.subdirs[subdir];
    if (!sub) return null;
    return sub[file] ?? null;
  }
  const path = join(SKILLS_DIR, skill, subdir, file);
  const f = Bun.file(path);
  if (!(await f.exists())) return null;
  return f.text();
}

/** Materialize an entire skill directory to disk (for rulesync staging) */
export async function materializeSkillToDir(
  skill: string,
  dest: string,
): Promise<void> {
  if (IS_COMPILED) {
    const m = await manifest();
    const s = m.SKILLS[skill];
    if (!s) return;
    mkdirSync(dest, { recursive: true });
    for (const [file, content] of Object.entries(s.files)) {
      await Bun.write(join(dest, file), content);
    }
    for (const [subdir, files] of Object.entries(s.subdirs)) {
      const subDest = join(dest, subdir);
      mkdirSync(subDest, { recursive: true });
      for (const [file, content] of Object.entries(files)) {
        await Bun.write(join(subDest, file), content);
      }
    }
    return;
  }
  // Dev mode: copy from filesystem
  await copyDirRecursive(join(SKILLS_DIR, skill), dest);
}

// ── Rules ─────────────────────────────────────────────────────

export async function listRuleFiles(): Promise<string[]> {
  if (IS_COMPILED) {
    const m = await manifest();
    return Object.keys(m.RULES);
  }
  if (!dirExists(RULES_DIR)) return [];
  return readdirSync(RULES_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name);
}

export async function readRuleContent(name: string): Promise<string | null> {
  if (IS_COMPILED) {
    const m = await manifest();
    return m.RULES[name] ?? null;
  }
  const f = Bun.file(join(RULES_DIR, name));
  if (!(await f.exists())) return null;
  return f.text();
}

// ── Hooks ─────────────────────────────────────────────────────

export async function listHookFiles(): Promise<string[]> {
  if (IS_COMPILED) {
    const m = await manifest();
    return Object.keys(m.HOOKS);
  }
  if (!dirExists(HOOKS_DIR)) return [];
  return readdirSync(HOOKS_DIR, { withFileTypes: true })
    .filter(
      (e) => e.isFile() && (e.name.endsWith(".sh") || e.name.endsWith(".bash")),
    )
    .map((e) => e.name);
}

export async function readHookContent(name: string): Promise<string | null> {
  if (IS_COMPILED) {
    const m = await manifest();
    return m.HOOKS[name] ?? null;
  }
  const f = Bun.file(join(HOOKS_DIR, name));
  if (!(await f.exists())) return null;
  return f.text();
}

// ── Subagents ─────────────────────────────────────────────────

export async function listSubagentFiles(): Promise<string[]> {
  if (IS_COMPILED) {
    const m = await manifest();
    return Object.keys(m.SUBAGENTS);
  }
  if (!dirExists(SUBAGENTS_DIR)) return [];
  return readdirSync(SUBAGENTS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name);
}

export async function readSubagentContent(
  name: string,
): Promise<string | null> {
  if (IS_COMPILED) {
    const m = await manifest();
    return m.SUBAGENTS[name] ?? null;
  }
  const f = Bun.file(join(SUBAGENTS_DIR, name));
  if (!(await f.exists())) return null;
  return f.text();
}

// ── Helpers ───────────────────────────────────────────────────

async function copyDirRecursive(
  srcDir: string,
  destDir: string,
): Promise<void> {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = join(srcDir, entry.name);
    const destPath = join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await Bun.write(destPath, Bun.file(srcPath));
    }
  }
}

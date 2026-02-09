import { mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { config, HOME } from "./config.ts";

export function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export async function backupFile(dest: string, configName: string) {
  if (!config.backupEnabled || !(await Bun.file(dest).exists())) return;
  const backupPath = join(HOME, ".config-backups", configName, timestamp());
  mkdirSync(backupPath, { recursive: true });
  await Bun.write(join(backupPath, basename(dest)), Bun.file(dest));
  console.log(`  📦 Backup: ${dest} -> ${backupPath}`);
}

export async function extractFrontmatter(filePath: string, key: string): Promise<string> {
  const content = await Bun.file(filePath).text();
  const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match ? match[1].trim() : "";
}

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  content: string;
}

export async function parseFrontmatter(filePath: string): Promise<ParsedFrontmatter> {
  const raw = await Bun.file(filePath).text();
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return { data: {}, content: raw };

  const data: Record<string, unknown> = {};
  let currentKey = "";
  let inList = false;
  const listItems: string[] = [];

  for (const line of fmMatch[1].split("\n")) {
    const listItem = line.match(/^\s+-\s+(.+)$/);
    if (listItem && currentKey) {
      inList = true;
      listItems.push(listItem[1].replace(/^["']|["']$/g, ""));
      continue;
    }

    if (inList && currentKey) {
      data[currentKey] = [...listItems];
      listItems.length = 0;
      inList = false;
    }

    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      const val = kv[2].trim();
      if (val) {
        data[currentKey] = val.replace(/^["']|["']$/g, "");
      }
    }
  }

  if (inList && currentKey) {
    data[currentKey] = [...listItems];
  }

  return { data, content: fmMatch[2] };
}

interface RuleFrontmatterOptions {
  description: string;
  root?: boolean;
  globs?: string[];
  targets?: string[];
}

export function buildRulesyncFrontmatter(opts: RuleFrontmatterOptions): string {
  const lines = ["---"];
  if (opts.root) lines.push("root: true");
  lines.push(`description: ${opts.description}`);
  if (opts.globs) {
    lines.push("globs:");
    for (const g of opts.globs) lines.push(`  - "${g}"`);
  }
  if (opts.targets) {
    lines.push("targets:");
    for (const t of opts.targets) lines.push(`  - ${t}`);
  }
  lines.push("---");
  return lines.join("\n");
}

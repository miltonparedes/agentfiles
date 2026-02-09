import { join } from "node:path";
import { parseFrontmatter } from "./helpers.ts";

export interface SkillMeta {
  name: string;
  scope: "global" | "project";
  langs: string[];
}

export async function getSkillMeta(skillDir: string): Promise<SkillMeta | null> {
  const skillMd = join(skillDir, "SKILL.md");
  if (!(await Bun.file(skillMd).exists())) return null;

  const { data } = await parseFrontmatter(skillMd);
  return {
    name: (data.name as string) || "",
    scope: (data.scope as "global" | "project") || "global",
    langs: Array.isArray(data.langs) ? (data.langs as string[]) : [],
  };
}

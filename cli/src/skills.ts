import { parseFrontmatterFromString } from "./helpers.ts";
import { readSkillFile } from "./assets.ts";

export interface SkillMeta {
  name: string;
  scope: "global" | "project";
  langs: string[];
}

export async function getSkillMeta(skill: string): Promise<SkillMeta | null> {
  const raw = await readSkillFile(skill, "SKILL.md");
  if (!raw) return null;

  const { data } = parseFrontmatterFromString(raw);
  return {
    name: (data.name as string) || "",
    scope: (data.scope as "global" | "project") || "global",
    langs: Array.isArray(data.langs) ? (data.langs as string[]) : [],
  };
}

import { existsSync } from "node:fs";
import { join } from "node:path";

const TS_MARKERS = ["package.json", "tsconfig.json", "bun.lock", "deno.json"];
const PY_MARKERS = ["pyproject.toml", "setup.py", "requirements.txt", "Pipfile"];

export function detectLanguages(dir: string): Set<"typescript" | "python"> {
  const langs = new Set<"typescript" | "python">();
  for (const f of TS_MARKERS) {
    if (existsSync(join(dir, f))) {
      langs.add("typescript");
      break;
    }
  }
  for (const f of PY_MARKERS) {
    if (existsSync(join(dir, f))) {
      langs.add("python");
      break;
    }
  }
  return langs;
}

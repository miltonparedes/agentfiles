import { mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { config, HOME } from "./config.ts";
import { backupFile } from "./helpers.ts";
import { listHookFiles, readHookContent } from "./assets.ts";

export async function installHooks() {
  const hookFiles = await listHookFiles();

  if (hookFiles.length === 0) {
    console.log("  ℹ️  No hook scripts found (add .sh files to hooks/)");
    return;
  }

  for (const fileName of hookFiles) {
    const hooksDest = join(HOME, ".claude", "hooks");

    if (config.dryRun) {
      console.log(`  [DRY-RUN] Hook: ${fileName} -> ${hooksDest}/${fileName}`);
    } else {
      mkdirSync(hooksDest, { recursive: true });
      const destPath = join(hooksDest, fileName);
      await backupFile(destPath, "hooks");
      const content = await readHookContent(fileName);
      if (content) {
        await Bun.write(destPath, content);
        chmodSync(destPath, 0o755);
        console.log(`  ✅ Hook installed: ${fileName}`);
      }
    }
  }
}

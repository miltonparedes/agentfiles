import { existsSync, unlinkSync, chmodSync, renameSync } from "node:fs";
import { VERSION } from "./parser.ts";
import { IS_COMPILED } from "./config.ts";
import { REPO } from "./meta.ts";

const API_BASE = "https://api.github.com/repos";

interface GHRelease {
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
}

export function detectPlatformAsset(): string | null {
  const os = process.platform;
  const arch = process.arch;
  if (os === "linux" && arch === "x64") return "af-linux-x64";
  if (os === "darwin" && arch === "arm64") return "af-darwin-arm64";
  return null;
}

async function fetchLatestRelease(): Promise<GHRelease> {
  const url = `${API_BASE}/${REPO}/releases/latest`;
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<GHRelease>;
}

export function stripV(tag: string): string {
  return tag.startsWith("v") ? tag.slice(1) : tag;
}

export async function update(): Promise<void> {
  if (!IS_COMPILED) {
    console.log("⚠️  Self-update is only available for the compiled binary.");
    console.log("   In dev mode, use git pull instead.");
    process.exit(1);
  }

  const assetName = detectPlatformAsset();
  if (!assetName) {
    console.error(`❌ Unsupported platform: ${process.platform}-${process.arch}`);
    process.exit(1);
  }

  console.log("Checking for updates...");

  let release: GHRelease;
  try {
    release = await fetchLatestRelease();
  } catch (e) {
    console.error(`❌ Failed to check for updates: ${(e as Error).message}`);
    process.exit(1);
  }

  const latest = stripV(release.tag_name);
  const current = stripV(VERSION);

  if (latest === current) {
    console.log(`✅ Already up to date (v${current}).`);
    return;
  }

  const asset = release.assets.find((a) => a.name === assetName);
  if (!asset) {
    console.error(`❌ No binary found for ${assetName} in release ${release.tag_name}.`);
    process.exit(1);
  }

  console.log(`Updating v${current} → v${latest}...`);

  const binPath = process.execPath;
  const tmpPath = `${binPath}.tmp-${Date.now()}`;
  try {
    const res = await fetch(asset.browser_download_url);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    await Bun.write(tmpPath, res);
    chmodSync(tmpPath, 0o755);

    renameSync(tmpPath, binPath);
    chmodSync(binPath, 0o755);

    console.log(`✅ Updated to v${latest}.`);
  } catch (e) {
    console.error(`❌ Update failed: ${(e as Error).message}`);
    process.exit(1);
  } finally {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {}
  }
}

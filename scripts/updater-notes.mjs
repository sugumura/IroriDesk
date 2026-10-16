#!/usr/bin/env node
/**
 * latest.json（自動アップデートの更新情報）の notes を、CHANGELOG のそのバージョンの節だけにする。
 * 既に配布したアプリは notes を文字のまま表示するため、ダウンロードの案内などを含めない
 *
 * 使い方: node scripts/updater-notes.mjs <latest.json のパス>
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/updater-notes.mjs <latest.json>");
  process.exit(2);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
const notes = execFileSync("node", [path.join(root, "scripts/release-notes.mjs"), manifest.version], {
  encoding: "utf8",
}).trim();
manifest.notes = notes;
fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
console.log(`latest.json ${manifest.version}: notes set from CHANGELOG.md (${notes.length} chars)`);

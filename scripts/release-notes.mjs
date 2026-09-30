#!/usr/bin/env node
/**
 * CHANGELOG.md から指定したバージョンの節（見出しを除く）を取り出して出力する。
 * 節が無い・空のときは失敗する（リリース前に CHANGELOG の更新を忘れないため）。
 *
 * 使い方: node scripts/release-notes.mjs 0.3.0
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const version = (process.argv[2] ?? "").replace(/^v/, "");
if (!version) {
  console.error("usage: node scripts/release-notes.mjs <version>");
  process.exit(2);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lines = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8").split("\n");

const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
if (start < 0) {
  console.error(`CHANGELOG.md has no section for ${version} (expected a heading "## [${version}] - YYYY-MM-DD")`);
  process.exit(1);
}
let end = lines.findIndex((l, i) => i > start && (l.startsWith("## [") || /^\[[^\]]+\]: /.test(l)));
if (end < 0) end = lines.length;
// リリースのページでも開けるよう、リポジトリ内への相対リンクを絶対 URL にする
const notes = lines
  .slice(start + 1, end)
  .join("\n")
  .trim()
  .replace(/\]\((?!https?:|#)([^)]+)\)/g, "](https://github.com/sugumura/IroriDesk/blob/main/$1)");
if (!notes) {
  console.error(`The CHANGELOG.md section for ${version} is empty`);
  process.exit(1);
}
console.log(notes);

#!/usr/bin/env node
/**
 * 配布物に含まれるサードパーティのライセンス表記を src-tauri/THIRD_PARTY_LICENSES.txt に書き出す。
 *
 * - npm: Vite でビルドし（ファイルは書き出さない）、バンドルに入ったモジュールのパッケージだけを対象にする
 * - Rust: cargo metadata の依存グラフを、アプリ本体から通常・ビルド依存だけたどる（dev 依存は除く）。
 *   配布先の OS によって依存が変わらないよう、対象の全ターゲットを合わせる
 *
 * 使い方: pnpm notices（リリースビルドの前にも自動で実行される）
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFile = path.join(root, "src-tauri", "THIRD_PARTY_LICENSES.txt");
const RUST_TARGETS = [
  "aarch64-apple-darwin",
  "x86_64-apple-darwin",
  "x86_64-pc-windows-msvc",
  "x86_64-unknown-linux-gnu",
];
const LICENSE_FILE = /^(licen[cs]e|copying|notice)([-._].*)?$/i;

const MIT_TEXT = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

/** ライセンス文を同梱していないパッケージ用。MIT を選べるなら MIT の文、それ以外は SPDX の本文へのリンク */
function fallbackText(license, authors) {
  const holders = authors.length > 0 ? authors.join(", ") : "the package authors";
  if (/\bMIT\b/.test(license ?? "")) return `Copyright (c) ${holders}\n\n${MIT_TEXT}`;
  const ids = (license ?? "").match(/[A-Za-z0-9.+-]+/g)?.filter((id) => !["AND", "OR", "WITH"].includes(id)) ?? [];
  const links = ids.map((id) => `https://spdx.org/licenses/${id}.html`).join("\n");
  return `Copyright (c) ${holders}\n\nThe package does not include a license file. The license text is available at:\n${links}`;
}

/** パッケージのディレクトリにあるライセンス文。二重ライセンスで MIT を選べるなら MIT の文だけにする */
function licenseTexts(dir, license) {
  let files = fs
    .readdirSync(dir)
    .filter((f) => LICENSE_FILE.test(f) && fs.statSync(path.join(dir, f)).isFile())
    .sort();
  if (/\bMIT\b/.test(license ?? "") && /\bOR\b|\//.test(license ?? "")) {
    const mit = files.filter((f) => /mit/i.test(f));
    if (mit.length > 0) files = [...mit, ...files.filter((f) => /^notice/i.test(f))];
  }
  return files.map((f) => fs.readFileSync(path.join(dir, f), "utf8").trim());
}

async function npmPackages() {
  const dirs = new Set();
  await build({
    root,
    logLevel: "warn",
    build: { write: false },
    plugins: [
      {
        name: "collect-packages",
        generateBundle() {
          for (const id of this.getModuleIds()) {
            const m = id.replace(/\\/g, "/").match(/^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)\//);
            if (m) dirs.add(m[1]);
          }
        },
      },
    ],
  });
  return [...dirs].map((dir) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    const license = typeof pkg.license === "string" ? pkg.license : pkg.license?.type;
    const repo = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
    return {
      name: pkg.name,
      version: pkg.version,
      license,
      url: pkg.homepage ?? repo,
      authors: [typeof pkg.author === "string" ? pkg.author : pkg.author?.name].filter(Boolean),
      texts: licenseTexts(dir, license),
    };
  });
}

function rustPackages() {
  const found = new Map();
  for (const target of RUST_TARGETS) {
    const meta = JSON.parse(
      execFileSync(
        "cargo",
        [
          "metadata",
          "--format-version",
          "1",
          "--locked",
          "--manifest-path",
          path.join(root, "src-tauri", "Cargo.toml"),
          "--filter-platform",
          target,
        ],
        { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
      ),
    );
    const byId = new Map(meta.packages.map((p) => [p.id, p]));
    const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
    const rootId = meta.resolve.root;
    const stack = [rootId];
    const seen = new Set(stack);
    while (stack.length > 0) {
      const node = nodes.get(stack.pop());
      for (const dep of node.deps) {
        if (!dep.dep_kinds.some((k) => k.kind !== "dev") || seen.has(dep.pkg)) continue;
        seen.add(dep.pkg);
        stack.push(dep.pkg);
      }
    }
    seen.delete(rootId);
    for (const id of seen) {
      const p = byId.get(id);
      const key = `${p.name}@${p.version}`;
      if (found.has(key)) continue;
      found.set(key, {
        name: p.name,
        version: p.version,
        license: p.license ?? (p.license_file ? `see ${p.license_file}` : undefined),
        url: p.repository ?? p.homepage,
        authors: p.authors ?? [],
        texts: licenseTexts(path.dirname(p.manifest_path), p.license),
      });
    }
  }
  return [...found.values()];
}

function section(title, packages) {
  const sorted = packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  const body = sorted.map((p) => {
    const head = [`${p.name} ${p.version}`, `License: ${p.license ?? "UNKNOWN"}`, p.url && `URL: ${p.url}`];
    const texts = p.texts.length > 0 ? p.texts.join("\n\n") : fallbackText(p.license, p.authors);
    return `${"-".repeat(72)}\n${head.filter(Boolean).join("\n")}\n\n${texts}\n`;
  });
  return `${"=".repeat(72)}\n${title} (${sorted.length})\n${"=".repeat(72)}\n\n${body.join("\n")}`;
}

const npm = await npmPackages();
const rust = rustPackages();
const header = `Irori Desk includes the following third-party software.
The license of each component is listed below.

`;
fs.writeFileSync(outFile, `${header}${section("JavaScript packages", npm)}\n${section("Rust crates", rust)}`);

const missing = [...npm, ...rust].filter((p) => p.texts.length === 0).map((p) => `${p.name} ${p.version}`);
console.log(`${path.relative(root, outFile)}: ${npm.length} npm packages, ${rust.length} crates`);
if (missing.length > 0) console.log(`No license file (added the MIT text or a link): ${missing.join(", ")}`);

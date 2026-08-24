#!/usr/bin/env node
// Release stag -> main sebagai commit SNAPSHOT (bukan fast-forward).
//
// main dimaksudkan murni sebagai artifact deployment production, BUKAN
// development branch: docs/, poc/, PHASE-*.md, dan .env.*.example TIDAK
// ikut — file-file itu tidak pernah dipakai runtime production sama
// sekali (scripts/preview-build.mjs hanya meng-esbuild-bundle
// apps/api/src/index.ts + dependency-nya), dan main sengaja TIDAK
// mempertahankan riwayat audit granular per-goal — stag tetap SATU-
// SATUNYA sumber kebenaran untuk itu (AGENTS.md §6.1, riwayat git =
// audit trail). Konsekuensinya: main dan stag akan selalu diverge
// setelah run pertama script ini — `git push stag:main` fast-forward
// TIDAK BISA lagi dipakai; setiap release berikutnya WAJIB lewat script
// ini lagi, bukan git push manual.
//
// Setiap source file (.ts/.mjs/.cjs/.js, lihat SOURCE_SCRIPT_KINDS) di
// tree hasil MINUS EXCLUDE_PATHS juga di-strip seluruh komentarnya lewat
// TypeScript compiler API sendiri (`ts.createPrinter({removeComments:true})`
// meng-cetak ulang AST yang sudah diparse — AST-based, bukan regex, jadi
// aman terhadap teks mirip komentar di dalam string/template literal, dan
// TIDAK menghapus type annotation seperti transpileModule). esbuild sengaja
// TIDAK dipakai untuk ini — terbukti (diverifikasi manual) esbuild
// `legalComments:"none"` MELEWATKAN JSDoc block yang menempel langsung ke
// class member (kuirk esbuild non-minify, bukan bug script ini), sementara
// printer TypeScript menghapusnya bersih tanpa kuirk itu. Shebang baris
// pertama (`#!/usr/bin/env node`, dipakai script CLI) dipertahankan secara
// eksplisit karena printer TS tidak mengenalinya. Migration .sql sengaja
// TIDAK ikut di-strip (SQL comment-stripping non-AST lebih berisiko salah
// parse, dan payload-nya kecil).
//
// Setiap run menghasilkan SATU commit baru dengan parent = HEAD main
// SAAT INI (linear, tidak pernah mengubah histori main yang sudah ada,
// tidak pernah butuh force-push) — tree commit itu = tree stag terbaru
// MINUS EXCLUDE_PATHS, MINUS komentar source file, di bawah.
//
// Default: DRY RUN (cuma cetak apa yang akan terjadi). Push sungguhan
// WAJIB flag eksplisit --push, karena ini operasi production-affecting.
//
// Usage:
//   node scripts/release-to-main.mjs [--remote=ai-github] [--push]

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";

// `typescript` bukan dependency langsung root — resolve via package.json
// workspace yang punya (pola sama scripts/preview-build.mjs utk @libsql/client).
const ts = createRequire(resolve(import.meta.dirname, "../apps/api/package.json"))("typescript");
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });

const SOURCE_SCRIPT_KINDS = {
  ".ts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".mts": ts.ScriptKind.TS,
  ".cts": ts.ScriptKind.TS,
  ".js": ts.ScriptKind.JS,
  ".jsx": ts.ScriptKind.JSX,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
};

function stripComments(path, source) {
  const shebangMatch = /^#!.*\n/.exec(source);
  const shebang = shebangMatch ? shebangMatch[0] : "";
  const body = shebang ? source.slice(shebang.length) : source;
  const sourceFile = ts.createSourceFile(path, body, ts.ScriptTarget.ESNext, true, SOURCE_SCRIPT_KINDS[extname(path)]);
  return shebang + printer.printFile(sourceFile);
}

const EXCLUDE_PATHS = [
  "docs",
  "poc",
  "PHASE-0-TASKS.md",
  "PHASE-1-TASKS.md",
  "PHASE-2-TASKS.md",
  "PHASE-3-TASKS.md",
  "PHASE-4-TASKS.md",
  "PHASE-5-TASKS.md",
  "PHASE-6-TASKS.md",
  "PHASE-7-TASKS.md",
  ".env.example",
  ".env.development.example",
  ".env.staging.example",
  ".env.production.example",
];

const args = process.argv.slice(2);
const push = args.includes("--push");
const remoteArg = args.find((a) => a.startsWith("--remote="));
const remote = remoteArg ? remoteArg.split("=")[1] : detectRemote();

function detectRemote() {
  const remotes = git(["remote"]).split("\n").filter(Boolean);
  if (remotes.includes("origin")) return "origin";
  if (remotes.length === 1) return remotes[0];
  throw new Error(
    `Tidak bisa deteksi remote otomatis (kandidat: ${remotes.join(", ")}) — jalankan ulang dengan --remote=<nama>`,
  );
}

function git(cmdArgs, env = {}, input) {
  return execFileSync("git", cmdArgs, {
    encoding: "utf8",
    env: { ...process.env, ...env },
    ...(input === undefined ? {} : { input }),
  }).trim();
}

// Tanpa .trim() — dipakai utk isi file (cat-file -p) di mana whitespace/
// newline di ujung SIGNIFIKAN (beda dari output perintah git lain di atas
// yang selalu berupa satu baris SHA/nama).
function gitRaw(cmdArgs, env = {}) {
  return execFileSync("git", cmdArgs, { encoding: "utf8", env: { ...process.env, ...env } });
}

function stripCommentsFromTree(indexEnv) {
  const staged = git(["ls-files", "--stage"], indexEnv)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [meta, path] = line.split("\t");
      const [mode, sha] = meta.split(" ");
      return { mode, sha, path };
    });

  let stripped = 0;
  for (const entry of staged) {
    if (!(extname(entry.path) in SOURCE_SCRIPT_KINDS)) continue;
    const source = gitRaw(["cat-file", "-p", entry.sha]);
    const code = stripComments(entry.path, source);
    const newSha = git(["hash-object", "-w", "--stdin"], {}, code);
    git(["update-index", "--cacheinfo", `${entry.mode},${newSha},${entry.path}`], indexEnv);
    stripped++;
  }
  return stripped;
}

console.log(`[release] remote: ${remote}${push ? "" : " (DRY RUN — tambahkan --push untuk push sungguhan)"}`);

git(["fetch", remote, "stag", "main"]);
const stagSha = git(["rev-parse", `${remote}/stag`]);
const mainSha = git(["rev-parse", `${remote}/main`]);
console.log(`[release] stag@${stagSha.slice(0, 7)} -> main@${mainSha.slice(0, 7)}`);

const tmpIndexDir = mkdtempSync(join(tmpdir(), "release-index-"));
const tmpIndex = join(tmpIndexDir, "index");

let newTree, newCommit;
try {
  const env = { GIT_INDEX_FILE: tmpIndex };
  git(["read-tree", stagSha], env);
  git(["rm", "-r", "--cached", "--ignore-unmatch", "-q", ...EXCLUDE_PATHS], env);

  const stripped = stripCommentsFromTree(env);
  console.log(`[release] komentar di-strip dari ${stripped} source file`);

  newTree = git(["write-tree"], env);
  console.log(`[release] tree baru (stag minus exclude, minus komentar): ${newTree.slice(0, 7)}`);

  const message = `release: snapshot stag@${stagSha.slice(0, 7)} - exclude ${EXCLUDE_PATHS.join(", ")} - strip comments (${stripped} file)`;
  newCommit = git(["commit-tree", newTree, "-p", mainSha, "-m", message]);
  console.log(`[release] commit baru: ${newCommit}`);
} finally {
  rmSync(tmpIndexDir, { recursive: true, force: true });
}

if (!push) {
  console.log(`\n[release] DRY RUN selesai. Untuk push sungguhan: node scripts/release-to-main.mjs --remote=${remote} --push`);
  process.exit(0);
}

git(["push", remote, `${newCommit}:main`]);
console.log(`[release] Pushed ${newCommit.slice(0, 7)} ke ${remote}/main.`);

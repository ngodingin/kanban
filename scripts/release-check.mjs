import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// F.6 Release Checklist (03-ENGINEERING.md) — 6 butir. Sebagian baru bisa
// hijau setelah fase domain/operations terkait dibangun (Phase 1+); di
// Phase 0 kita hanya menghubungkan butir yang SUDAH dapat diverifikasi
// otomatis, dan menandai jujur butir yang masih DEFERRED (bukan mengarang
// implementasi yang belum ada) — sesuai Review-CL-07.

let failed = false;
const results = [];
const record = (id, title, status, detail) => {
  results.push({ id, title, status, detail });
  if (status === "FAIL") failed = true;
};

// 1. Migrasi (Global + fan-out Project DB) berhasil.
// Step `migrate:global`/`migrate:projects` di ci.yml berjalan SEBELUM step
// ini; jika keduanya gagal, job sudah berhenti dan release-check ini tidak
// akan tereksekusi. Sampai di sini = mekanisme migrasi terbukti idempotent
// & tanpa error pada run CI ini (bukti mekanisme; run terhadap staging
// sesungguhnya dilacak terpisah lewat log deployment Vercel/CI stag).
record(1, "Migrasi Global + fan-out Project DB berhasil", "PASS", "mekanisme terverifikasi — step migrate:global/migrate:projects sudah lulus sebelum step ini (job berhenti jika gagal)");

// 2. Smoke test alur inti domain (create Project -> ... -> comment).
record(2, "Smoke test alur inti domain", "DEFERRED", "endpoint domain (Project/Board/Card/dst.) belum ada — mulai Phase 1, lihat PHASE-0-TASKS.md \"Prinsip Phase 0\"");

// 3. Definition of Done (04-DELIVERY C.3) hijau untuk fase yang dirilis.
record(3, "Definition of Done per fase", "DEFERRED", "diverifikasi manual oleh QA/AI-Planning & Review per closure fase (AGENTS.md Gate B) — bukan pemeriksaan otomatis CI generik");

// 4. Backup Global DB terverifikasi & restore pernah diuji (F.1).
record(4, "Backup & restore Global DB teruji", "DEFERRED", "infra backup terjadwal (F.1) belum diimplementasi Phase 0 — operational task fase mendatang");

// 5. Rollback plan: migrasi punya jalur mundur atau strategi forward-fix terdokumentasi.
try {
  const engDoc = await readFile(resolve(import.meta.dirname, "../docs/03-ENGINEERING.md"), "utf8");
  const f3 = engDoc.slice(engDoc.indexOf("## F.3"), engDoc.indexOf("## F.4"));
  const documented = f3.includes("idempotent") && f3.includes("MUST idempotent");
  record(
    5,
    "Rollback/forward-fix migrasi terdokumentasi",
    documented ? "PASS" : "FAIL",
    documented
      ? "03-ENGINEERING F.3 mendokumentasikan strategi forward-fix (migrasi idempotent, tanpa down-migration; drizzle-kit)"
      : "03-ENGINEERING F.3 tidak lagi memuat strategi forward-fix/idempotent — cek amandemen SOT",
  );
} catch (error) {
  record(5, "Rollback/forward-fix migrasi terdokumentasi", "FAIL", `gagal baca docs/03-ENGINEERING.md: ${String(error)}`);
}

// 6. Metrik observability (F.4) aktif untuk endpoint yang dirilis.
record(6, "Observability aktif", "DEFERRED", "structured logging + metrik (F.4) belum diimplementasi — Phase 6 (Hardening) per 01-PRODUCT roadmap");

console.log("=== F.6 Release Checklist ===");
for (const r of results) {
  const icon = r.status === "PASS" ? "✅" : r.status === "FAIL" ? "❌" : "⏸️";
  console.log(`${icon} ${r.id}. [${r.status}] ${r.title} — ${r.detail}`);
}
console.log(
  `\n${results.filter((r) => r.status === "PASS").length} PASS / ${results.filter((r) => r.status === "FAIL").length} FAIL / ${results.filter((r) => r.status === "DEFERRED").length} DEFERRED`,
);
console.log("Catatan: DEFERRED bukan kegagalan — butir tersebut memang belum applicable pada fase ini (bukan gate rilis final).");

if (failed) {
  console.error("\nrelease-check GAGAL: ada butir F.6 yang applicable sekarang tapi tidak lulus.");
  process.exit(1);
}

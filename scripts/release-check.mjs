import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
let failed = false;
const results = [];
const record = (id, title, status, detail) => {
    results.push({ id, title, status, detail });
    if (status === "FAIL")
        failed = true;
};
record(1, "Migrasi Global + fan-out Project DB berhasil", "PASS", "mekanisme terverifikasi — step migrate:global/migrate:projects sudah lulus sebelum step ini (job berhenti jika gagal)");
record(2, "Smoke test alur inti domain", "DEFERRED", "endpoint domain (Project/Board/Card/dst.) belum ada — mulai Phase 1, lihat PHASE-0-TASKS.md \"Prinsip Phase 0\"");
record(3, "Definition of Done per fase", "DEFERRED", "diverifikasi manual oleh QA/AI-Planning & Review per closure fase (AGENTS.md Gate B) — bukan pemeriksaan otomatis CI generik");
record(4, "Backup & restore Global DB teruji", "DEFERRED", "infra backup terjadwal (F.1) belum diimplementasi Phase 0 — operational task fase mendatang");
try {
    const engDoc = await readFile(resolve(import.meta.dirname, "../docs/03-ENGINEERING.md"), "utf8");
    const f3 = engDoc.slice(engDoc.indexOf("## F.3"), engDoc.indexOf("## F.4"));
    const documented = f3.includes("idempotent") && f3.includes("MUST idempotent");
    record(5, "Rollback/forward-fix migrasi terdokumentasi", documented ? "PASS" : "FAIL", documented
        ? "03-ENGINEERING F.3 mendokumentasikan strategi forward-fix (migrasi idempotent, tanpa down-migration; drizzle-kit)"
        : "03-ENGINEERING F.3 tidak lagi memuat strategi forward-fix/idempotent — cek amandemen SOT");
}
catch (error) {
    record(5, "Rollback/forward-fix migrasi terdokumentasi", "FAIL", `gagal baca docs/03-ENGINEERING.md: ${String(error)}`);
}
record(6, "Observability aktif", "DEFERRED", "structured logging + metrik (F.4) belum diimplementasi — Phase 6 (Hardening) per 01-PRODUCT roadmap");
console.log("=== F.6 Release Checklist ===");
for (const r of results) {
    const icon = r.status === "PASS" ? "✅" : r.status === "FAIL" ? "❌" : "⏸️";
    console.log(`${icon} ${r.id}. [${r.status}] ${r.title} — ${r.detail}`);
}
console.log(`\n${results.filter((r) => r.status === "PASS").length} PASS / ${results.filter((r) => r.status === "FAIL").length} FAIL / ${results.filter((r) => r.status === "DEFERRED").length} DEFERRED`);
console.log("Catatan: DEFERRED bukan kegagalan — butir tersebut memang belum applicable pada fase ini (bukan gate rilis final).");
if (failed) {
    console.error("\nrelease-check GAGAL: ada butir F.6 yang applicable sekarang tapi tidak lulus.");
    process.exit(1);
}

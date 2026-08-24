# Phase 6 — Hardening · Task & Goal Breakdown

> Generated per [04-DELIVERY C.6](docs/04-DELIVERY.md). SOT version: 4.1.0.
> Scope batas: [04-DELIVERY C.1 "Phase 6"](docs/04-DELIVERY.md). Acuan utama: [02-SPEC](docs/02-SPEC.md) A.7, A.14, A.15; [04-DELIVERY Part B](docs/04-DELIVERY.md); [03-ENGINEERING](docs/03-ENGINEERING.md) F.1, F.4, F.5, F.6.
> **Gate pembuka:** dibuka atas keputusan manusia eksplisit 2026-08-24 ("buka phase 6"), setelah gate [Review-CL-22](PHASE-0-TASKS.md#review-cl-22) diverifikasi terpenuhi — `TASK-0.15`–`0.21` seluruhnya ✅, `TASK-5.5` (reverifikasi Phase 1–5 terhadap SOT 4.1.0) ✅ 5/5, suite 602/602 hijau + typecheck/lint bersih (diverifikasi independen sebelum gate ini dibuka). Dicatat di [Review-CL-01](#review-cl-01) file ini.
> **Konteks repo saat digenerate:** Phase 0–5 seluruhnya ✅. Berbeda dari Phase 4/5 yang membangun kapabilitas baru secara pipeline berurutan, Phase 6 ("Hardening") **murni checklist paralel** atas 5 kapabilitas C.1 — sebagian besar SUDAH SIGNIFIKAN dikerjakan lebih awal sebagai bagian TASK-0.15/0.16/0.21 (idempotency), TASK-2.12.1 (BR-054C revoke lintas-DB), TASK-5.3.1/5.4.1 (journal deprovision BR-016B) — Phase 6 TIDAK mengulang itu. Task di file ini fokus ke **gap yang genuinely belum tersentuh**, dikonfirmasi lewat pengecekan state repo langsung sebelum generate (bukan asumsi): **validation layer Zod formal (0/13 file route memakainya — seluruhnya masih parsing manual `readXField`)**, **audit-consistency check sistematis (0 test/mekanisme ditemukan)**, **backup/disaster-recovery (F.1, 0 implementasi — baru catatan `DEFERRED` di `scripts/release-check.mjs`)**, **observability terstruktur (F.4, 2 pemakaian `console.*` polos di seluruh `apps/api/src`, tidak ada `request_id`)**, **Resend webhook (F.4, eksplisit ditandai "Phase 6 scope" sejak SOT 2.5.2, 0 implementasi)**, dan **rate limiting (F.5, 0 implementasi)**. Optimistic locking dan error handling SUDAH banyak terverifikasi lintas-fase (TASK-5.5) — Phase 6 menutupnya dengan **satu audit akhir lintas-seluruh-command**, bukan membangun ulang.
>
> **Riset eksternal (dicatat untuk Dev, bukan diasumsikan):** Turso PITR (Point-in-Time Recovery) adalah **fitur platform otomatis at-commit**, bukan sesuatu yang perlu dibangun sendiri — retensi bergantung plan (`docs.turso.tech/features/point-in-time-recovery`, diverifikasi 2026-08-24). Organisasi proyek ini terkonfirmasi `plan_id: "starter"` (Turso API `GET /v1/organizations/:slug`) — mengikuti dokumentasi publik, tier ini setara retensi PITR **24 jam** (tier berbayar 10/30/90 hari). TASK-6.5 di bawah fokus **verifikasi + dokumentasi + uji restore** kapabilitas provider yang sudah ada, BUKAN membangun sistem backup kustom — konsisten prinsip "jangan over-engineer" ([03-ENG Part F intro](docs/03-ENGINEERING.md)).
>
> **AI-Dev execution gate:** jangan ubah implementasi sebelum goal `🔄` + `CL` terpasang. Jangan menyatakan selesai sebelum goal `🔎`/`80%` + CL baru + test hijau + commit. Format handoff wajib mengikuti [AGENTS.md §0](AGENTS.md).

## Prinsip Phase 6

1. **Model-tiering SELEKTIF, bukan blanket seperti Phase 4/5.** AGENTS.md §11.2 menyebut eksplisit **"inti concurrency/transaction/optimistic-locking (Phase 6)"** — frasa ini lebih sempit dari Prinsip Phase 4/5 ("SETIAP goal WAJIB"). Hanya goal yang genuinely menyentuh optimistic-locking/atomicity/10-invariant-inti (`TASK-6.1`, `TASK-6.4`) ditandai **[MODEL LEBIH KUAT WAJIB]**. Goal lain (Zod schema, backup ops, observability, webhook, rate-limit) adalah kapabilitas yang perilakunya sudah dipatok penuh oleh spec+test — model ringan boleh, sesuai §11.2 "CRUD sederhana, boilerplate, task yang perilakunya sudah dipatok penuh oleh spec + test".
2. **Checklist paralel, bukan pipeline.** Task-task di file ini (6.1–6.7) TIDAK saling depend kecuali dicatat eksplisit — boleh dikerjakan dalam urutan apa pun oleh sesi Dev berbeda secara bersamaan, tidak seperti Phase 5 yang punya rantai `5.1→5.2→5.3→5.4`.
3. **Jangan membangun ulang yang sudah ada.** Idempotency (TASK-0.16/0.21), BR-054C revoke lintas-DB (TASK-2.12.1), journal deprovision (TASK-5.3.1/5.4.1) SUDAH lengkap dan terverifikasi — task file ini TIDAK membuka ulang itu. Jika audit (`TASK-6.1`/`6.3`) menemukan gap baru di area yang SUDAH pernah closed, itu bug regresi baru — buka goal baru terpisah (pola sama Review-CL sepanjang sesi ini), JANGAN reopen goal lama.
4. **Backup = verifikasi kapabilitas provider, bukan membangun dari nol (F.1).** Turso PITR sudah otomatis at-commit. Goal `TASK-6.5` adalah dokumentasi + drill restore nyata di staging, bukan implementasi mekanisme backup kustom — over-engineering di sini melanggar prinsip "Ringkas & sengaja minimal untuk MVP" ([03-ENG Part F](docs/03-ENGINEERING.md)).
5. **Observability minimal, bukan infra observability penuh (F.4).** Structured logging + metrik dasar cukup lewat log terstruktur yang bisa di-query platform (Vercel), BUKAN menambah dependency infra baru (Prometheus/Datadog/dst) — di luar scope MVP (01-PRODUCT §2.2, non-goal implisit: tidak ada kebutuhan eksplisit untuk itu).
6. **Rate limiting SHOULD, bukan MUST (F.5).** Prioritas `P2`/`P3` — boleh dikerjakan terakhir, tidak blocking goal lain, dan MUST pakai fasilitas platform (Vercel) sesuai F.5, bukan infrastruktur khusus.
7. **`TASK-6.4` (audit-consistency) adalah kapabilitas test BARU, bukan re-test individual.** Property-style test yang mengiterasi SELURUH domain command mutation (14 file repository, dikonfirmasi via `grep runInWriteTransaction`) dan memverifikasi generik: setiap mutation sukses → tepat satu Activity dengan `entity_type`/`entity_id`/`action` yang sesuai serta `entity_version` selaras — melengkapi test individual per-goal yang sudah ada, bukan menggantikannya.

## Legend Status
| Simbol | Arti |
|---|---|
| ⬜️ | Belum Dikerjakan |
| 🔄 | Dikerjakan |
| 🔎 | Menunggu verifikasi |
| ✅ | Terverifikasi QA |
| ⚠️ | Gagal-verifikasi |
| ⏸️ | Blocked |

Kolom **%** = kemajuan yang sudah terbukti, bukan estimasi atau asumsi. Dev hanya boleh mengisi `0–80`; `80` berarti implementasi + Test + DoD sisi Dev selesai dan siap `🔎`. Hanya QA yang boleh mengisi `100`, bersamaan dengan `✅`. Nilai untuk `⚠️`/`⏸️` dipertahankan atau dikoreksi berdasarkan bukti aktual.

Kolom **CL** = indeks tautan Closure Log per goal. Gunakan `[CL-nn](#cl-nn)` untuk catatan Dev, `[QA-CL-nn](#qa-cl-nn)` untuk catatan QA, dan `[Review-CL-nn](#review-cl-nn)` untuk catatan AI-Planning & Review/reviewer. Kolom ini append-only. Gunakan `—` hanya selama belum ada entry.

Kolom **Prior** = prioritas relatif di dalam fase: `P0` blocker/gate/fondasi kritis · `P1` tinggi/core dependency · `P2` normal · `P3` lanjutan/polish. Prioritas **tidak** membatalkan Dependency atau Status.

Status dan `%` pada level **Task** dihitung dari goal menurut [AGENTS.md §6.2](AGENTS.md); tidak diedit manual.

## Dependency graph (task-level)
```text
6.1 Optimistic locking audit lintas-domain [MODEL KUAT]  ── independen
6.2 Validation layer Zod                                 ── independen
6.3 Error handling audit menyeluruh                       ── independen
6.4 Audit-consistency check (mutation -> Activity) [MODEL KUAT] ── independen (baca 14 repository existing)
6.5 Backup & Disaster Recovery dasar (F.1)                ── independen
6.6 Observability minimal + Resend webhook (F.4)          ── independen
6.7 Rate limiting dasar (F.5, SHOULD)                      ── independen

Seluruh task boleh dikerjakan paralel oleh sesi Dev berbeda — tidak ada dependency antar-task.
```

---

## TASK-6.1 — Optimistic locking: audit akhir lintas-domain, tanpa gap  (dep: —)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 6.1.1 | 🔎 | [CL-01](#cl-01) | 80 | P0 **[MODEL LEBIH KUAT WAJIB]** | Audit SATU PASS lintas SELURUH domain command versioned (`project_state`, Milestone, Board, List, Card, Milestone Label, Board Label — BR-019): konfirmasi setiap repository mutation memakai conditional `UPDATE ... WHERE id = ? AND version = ?` (bukan read-then-write terpisah), menolak `409 VERSION_CONFLICT` tanpa state/Activity berubah saat version tidak cocok (BR-021), dan command internal/system-initiated (prune, revoke cross-DB) tetap conditional version-check ekuivalen walau tanpa payload client (BR-021 kalimat kedua). Jika ditemukan gap, PERBAIKI di goal ini (bukan buka goal terpisah — audit findings-and-fix adalah satu unit). Jika NIHIL gap, tulis bukti negatif eksplisit (bukan asumsi "sudah pasti benar"). | [02-SPEC A.7](docs/02-SPEC.md) (BR-019–023), A.16 poin 7; [04-DELIVERY AC-020](docs/04-DELIVERY.md) | — |
| 6.1.2 | 🔎 | [CL-01](#cl-01) | 80 | P1 **[MODEL LEBIH KUAT WAJIB]** | Property-style concurrency test: untuk SETIAP entity domain versioned (7 tipe di atas), fire dua mutation paralel dengan `expectedVersion` sama terhadap row yang sama — assert tepat satu sukses (version increment 1×), satu `409 VERSION_CONFLICT` tanpa Activity kedua tercipta. Konsolidasi jadi satu test file generik (table-driven per entity type), bukan 7 file terpisah. | [02-SPEC A.7](docs/02-SPEC.md); [04-DELIVERY AC-020](docs/04-DELIVERY.md) | 6.1.1 |

**Test:** Dua request `PATCH`/mutation paralel `expectedVersion` sama pada Card/Milestone/Board/List/Label yang sama → tepat satu sukses, satu `VERSION_CONFLICT`, tidak ada Activity ganda. Command internal (prune subtree, revoke cleanup) yang mem-version-check row yang sedang dimutasi concurrent lain → tidak overwrite diam-diam.
**DoD:** `grep` manual dikonfirmasi: tidak ada repository mutation yang UPDATE tanpa klausa `version =` di WHERE untuk 7 entity BR-019; test table-driven lulus untuk seluruh entity type.

---

## TASK-6.2 — Validation layer Zod untuk seluruh request body  (dep: —)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 6.2.1 | 🔎 | [CL-05](#cl-05)<br>[CL-04](#cl-04) | 80 | P1 | Ganti parsing manual (`readTitleField`/`readOptionalStringField`/dst, `apps/api/src/routes/milestones.ts`, `boards.ts`, `lists.ts`, `cards.ts`) dengan skema Zod eksplisit per payload (create/update/move) — validasi tipe, required/optional, dan batas (mis. `title` non-empty string) di satu titik per entity, error digabung ke `VALIDATION_ERROR.details` (sudah ada pola collect-all dari `TASK-0.17.4`, reuse helper yang sama — JANGAN bikin mekanisme kedua). | [02-SPEC C.2](docs/02-SPEC.md) (VALIDATION_ERROR), C.5, C.8; [03-ENG A.8](docs/03-ENGINEERING.md) (Zod terkunci) | — |
| 6.2.2 | ⬜️ | — | 0 | P1 | Sama seperti 6.2.1 untuk `labels.ts`, `card-labels.ts`, `comments.ts`. | [02-SPEC C.2](docs/02-SPEC.md), C.9–C.11 | — |
| 6.2.3 | ⬜️ | — | 0 | P1 | Sama seperti 6.2.1 untuk `project-admin.ts` (Membership/Permission Group/scoped assignment/Invitation) dan `api-keys.ts`/`personal-access-tokens.ts`. | [02-SPEC C.2](docs/02-SPEC.md), C.12–C.14 | — |
| 6.2.4 | ⬜️ | — | 0 | P2 | Sama seperti 6.2.1 untuk `projects.ts`. | [02-SPEC C.2](docs/02-SPEC.md), C.4 | — |

**Test:** Body dengan field bertipe salah (mis. `title` berupa number) atau field wajib hilang → `400 VALIDATION_ERROR` dengan `details` menyebut field spesifik, BUKAN generic `500`/crash parsing. Body valid → berperilaku identik dengan parsing manual lama (regresi behavioral nihil — hanya mekanisme validasi yang berubah). Field terlarang generic PATCH (`BR-062`) tetap tertolak (regresi test existing tetap hijau).
**DoD:** `grep -rn "^function read.*Field" apps/api/src/routes` → nol hasil (seluruh parsing manual tergantikan Zod); `pnpm exec vitest run` 100% hijau, test lama diperbarui mengikuti mekanisme baru bukan dihapus.

---

## TASK-6.3 — Error handling: audit konsistensi menyeluruh  (dep: —)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 6.3.1 | ⬜️ | — | 0 | P1 | Audit SATU PASS lintas SELURUH endpoint (13 file route): setiap error path memetakan ke kode kanonik `02-SPEC C.2` yang benar (status HTTP + code pair sesuai definisi terkunci — `INVALID_STATE` selalu 409, `INTERNAL_ERROR` untuk kegagalan tak terduga, `VALIDATION_ERROR` untuk payload invalid, dst). Beda dari `TASK-0.15`/`0.19`/`0.20`/`0.21` (fix titik spesifik yang sudah ditemukan) — goal ini adalah sweep akhir memastikan TIDAK ADA titik lain yang lolos. Jika ditemukan gap baru, perbaiki di goal ini. | [02-SPEC C.2](docs/02-SPEC.md) | — |

**Test:** Untuk setiap route, picu minimal satu error case per kategori applicable (not-found, validation, state-conflict, unexpected) → assert code+status pair sesuai C.2, bukan cuma "response bukan 500 mentah".
**DoD:** `grep -rn 'apiError(' apps/api/src packages/contracts/src` dikonfirmasi manual — setiap pemanggilan memakai code+status pair yang valid sesuai `CODE_TO_HTTP`; tidak ada string literal status yang menyimpang dari mapping kanonik.

---

## TASK-6.4 — Audit-consistency check: setiap mutation menghasilkan Activity yang sesuai  (dep: —)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 6.4.1 | 🔎 | [CL-01](#cl-01) | 80 | P0 **[MODEL LEBIH KUAT WAJIB]** | Bangun test generik/property-style (BUKAN 14 test terpisah manual) yang mengiterasi SELURUH domain command mutation (14 file repository dengan `runInWriteTransaction`/`runInDrizzleWriteTransaction`, dikonfirmasi via grep) dan memverifikasi invariant universal: mutation sukses → tepat SATU row baru di `activities` dengan `entity_type`+`entity_id` sesuai entity yang dimutasi, `action` sesuai (non-generic, BR-026), dan `entity_version` selaras dengan version baru entity (kecuali action yang tidak mengubah version, mis. Comment). Mutation yang GAGAL (exception/rollback) → NOL Activity baru (invariant #9 atomicity). | [02-SPEC A.8](docs/02-SPEC.md) (BR-024–029), A.16 poin 8–9; [03-ENG B.5](docs/03-ENGINEERING.md) | — |

**Test:** Untuk representative case per repository (create/update/archive/restore/delete/move applicable), assert Activity row tercipta dengan field sesuai; untuk skenario failure-injection (mock error mid-transaction), assert ROLLBACK penuh — baik entity state maupun Activity, tidak ada partial commit.
**DoD:** Coverage eksplisit: seluruh 14 repository file tercantum di daftar test dengan minimal 1 assertion generik per repository; test failure-injection lulus untuk minimal 3 repository representative (Card, Project, Membership-revoke cross-DB) mencakup pola atomicity yang berbeda (single-DB tx, cross-DB protocol BR-054C).

---

## TASK-6.5 — Backup & Disaster Recovery dasar (F.1)  (dep: —)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 6.5.1 | ⏸️ | [CL-02](#cl-02) | 70 | P1 | Dokumentasikan kapabilitas PITR Turso aktual untuk proyek ini (plan `starter`, retensi 24 jam terkonfirmasi via Turso API `GET /v1/organizations/:slug` — lihat catatan header file ini) sebagai RTO/RPO konkret MVP (F.1 "RTO/RPO konkret ditetapkan sebelum rilis") di `docs/03-ENGINEERING.md` F.1 (amandemen SOT — tambah angka retensi aktual, bukan cuma prinsip umum). **[NEEDS-DECISION opsional, tidak blocking]:** apakah upgrade plan Turso untuk retensi lebih panjang (10/30/90 hari) — murni keputusan biaya/risiko bisnis, dicatat sebagai catatan terpisah untuk manusia, TIDAK menghalangi closure goal ini dengan baseline 24 jam. | [03-ENG F.1](docs/03-ENGINEERING.md) | — |
| 6.5.2 | 🔎 | [CL-03](#cl-03) | 80 | P0 | Uji restore NYATA minimal satu kali di staging (F.1 "Restore MUST diuji minimal sekali sebelum rilis, bukan sekadar diasumsikan bekerja") — untuk Global DB DAN satu Project DB representative, via Turso API/dashboard PITR restore-to-point-in-time ke database baru, verifikasi data konsisten (row count/sample match), dokumentasikan prosedur + hasil di CL (bukti command/output, bukan klaim). | [03-ENG F.1](docs/03-ENGINEERING.md), F.6 poin 4 | 6.5.1 |

**Test:** N/A (operational drill, bukan automated test) — bukti CL WAJIB memuat command Turso API yang dipakai + output yang menunjukkan restore sukses + verifikasi data.
**DoD:** F.1 di `docs/03-ENGINEERING.md` memuat angka RTO/RPO konkret (bukan cuma "MUST punya backup terjadwal"); minimal satu restore drill terdokumentasi dengan bukti reproducible.

---

## TASK-6.6 — Observability minimal + Resend webhook (F.4)  (dep: —)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 6.6.1 | ⬜️ | — | 0 | P1 | Structured logging per request (Hono middleware di `apps/api/src/index.ts`): emit satu log JSON per request berisi `request_id` (ULID baru per request), `user_id` (jika teridentifikasi), `project_id` (jika applicable), `action` (method+path atau domain command), `outcome` (status code/error code), `duration` (ms). Ganti 2 pemakaian `console.*` polos yang ada sekarang jadi bagian mekanisme ini. `project_id` WAJIB ada di log yang applicable agar bisa difilter per-Project tanpa membocorkan lintas Project (F.4). | [03-ENG F.4](docs/03-ENGINEERING.md) | — |
| 6.6.2 | ⬜️ | — | 0 | P2 | Metrik minimal dari structured log 6.6.1 (BUKAN infra metrik baru — query/agregasi atas log yang sudah terstruktur, konsisten Prinsip #5): request rate, error rate per kode kanonik (`02-SPEC C.2`), latensi p50/p95, `VERSION_CONFLICT` rate (indikator kesehatan concurrency), kegagalan provisioning. Dokumentasikan cara query-nya (mis. Vercel log query/dashboard), bukan membangun dashboard kustom. | [03-ENG F.4](docs/03-ENGINEERING.md) | 6.6.1 |
| 6.6.3 | ⬜️ | — | 0 | P2 | Endpoint `POST /api/internal/resend-webhook` (pola non-pipeline sama seperti `/api/internal/prune`, TASK-5.4.1 — verifikasi signature Resend webhook, bukan `CRON_SECRET`) menangani minimal `email.bounced` dan `email.complained` (WAJIB, F.4 — sinyal kesehatan Magic Link); `email.delivered`/`email.delivery_delayed` MAY ditambahkan. Log event ke structured logging (6.6.1), BUKAN Activity domain (F.4 "Audit vs log: Activity terpisah dari technical log"). Open/click tracking Resend MUST NOT diaktifkan (keamanan token single-use, sudah dikunci SOT 2.5.2/F.4). | [03-ENG F.4](docs/03-ENGINEERING.md) (amandemen 2.5.2) | 6.6.1 |

**Test:** 6.6.1 — request ke endpoint mana pun menghasilkan satu log JSON dengan seluruh field wajib terisi (assert field ada, bukan cuma "tidak crash"). 6.6.3 — payload webhook `email.bounced` valid + signature benar → 200 + log tercatat; signature salah → 401, tidak ada log event palsu; payload `email.opened`/`email.clicked` (seharusnya tidak pernah dikirim karena tracking nonaktif) → diterima tanpa error tapi tidak diproses khusus (defensive, bukan diasumsikan tidak akan pernah terjadi).
**DoD:** `grep -rn "console\.\(log\|error\|warn\)" apps/api/src` → nol hasil di luar mekanisme structured logging 6.6.1 itu sendiri; webhook endpoint tidak pernah expose signing secret di response/log.

---

## TASK-6.7 — Rate limiting dasar (F.5, SHOULD)  (dep: —)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 6.7.1 | ⬜️ | — | 0 | P3 | Rate limit dasar per credential (API Key/PAT hash)/IP pada endpoint mutation & `/auth/*`, memakai fasilitas platform Vercel (mis. Vercel Firewall/Edge Config rate limit — bukan infrastruktur khusus/Redis tambahan, F.5 eksplisit). Threshold awal permisif (mis. per-menit), didokumentasikan sebagai baseline yang MAY disesuaikan tanpa amandemen SOT (keputusan teknis murni, tidak menyentuh business invariant). | [03-ENG F.5](docs/03-ENGINEERING.md) | — |

**Test:** Request melebihi threshold dari credential/IP sama → `429` (atau kode yang dipakai fasilitas platform), request dari credential/IP lain tidak terpengaruh. Request di bawah threshold → tidak terganggu (regresi nihil terhadap seluruh test suite existing).
**DoD:** Konfigurasi rate-limit terdokumentasi (threshold + scope + fasilitas yang dipakai); tidak menambah dependency infra baru di luar platform Vercel.

---

## Exit Criteria Phase 6 (syarat mulai Phase 7)
- Seluruh Task 6.1–6.7 `✅` (6.7 tetap disyaratkan closed walau prioritas `P3` — SHOULD di F.5 adalah level rekomendasi isi fitur, bukan izin melewati verifikasi goal).
- Definition of Done penuh [04-DELIVERY C.3](docs/04-DELIVERY.md) hijau (bukan hanya subset per-fase seperti Phase 0–5) — C.6.4 eksplisit "Phase 6 (Hardening) dan keseluruhan MVP MUST memenuhi Definition of Done penuh di C.3".
- Backup Global DB terverifikasi & restore pernah diuji ([03-ENG F.6](docs/03-ENGINEERING.md) poin 4).
- Metrik observability (F.4) aktif untuk endpoint yang dirilis ([03-ENG F.6](docs/03-ENGINEERING.md) poin 6).

## Flag terbuka (sesuai C.6.5)
- `[NEEDS-DECISION]` opsional, tidak blocking — TASK-6.5.1: upgrade plan Turso (retensi PITR 24 jam vs 10/30/90 hari) adalah keputusan biaya/risiko bisnis untuk manusia, dicatat saat goal itu dikerjakan.

---

## Closure Log

<!-- Dev: `### CL-nn — YYYY-MM-DD · goal <id> <ringkasan>`. QA: `### QA-CL-nn — ...`. Review: `### Review-CL-nn — ...`. Cantumkan Role + Model/platform aktual. Append-only, jangan hapus/ubah entry lama. -->

<a id="cl-03"></a>
### CL-03 — 2026-08-24 · goal 6.5.2 restore drill NYATA staging (⬜️ → 🔎 · 0 → 80%)
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Konfirmasi otorisasi manusia:** dikonfirmasi eksplisit via pertanyaan sebelum eksekusi — operasi ini menyentuh Turso org NYATA (`ngodingin-ai`, plan `starter`) memakai kredensial live di `.env`, membuat resource cloud sementara. User memilih "Yes, proceed" secara eksplisit sebelum SATU pun panggilan API dijalankan.
**Script:** `packages/infrastructure/scripts/smoke-pitr-restore-drill.ts` (+ entry `test:smoke-pitr-restore-drill` di `packages/infrastructure/package.json`) — dipertahankan sebagai script re-runnable (bukan sekali-pakai lalu dihapus), konsisten pola `test:smoke-*` yang sudah ada di repo, karena F.1 menyiratkan restore capability harus tetap terverifikasi dari waktu ke waktu, bukan dibuktikan sekali lalu dilupakan.
**Prosedur, DUA target (Global DB langsung + Project DB throwaway karena staging belum punya Project DB nyata — belum ada Project dibuat lewat Phase 7 UI):**
1. **Global DB staging** (`kanban-global-stag`, group `ngodingin-kanban-stag`): baca row count sumber (`users=1, projects=0`) → `POST /organizations/ngodingin-ai/databases` dengan `seed: {type: "database", name: "kanban-global-stag", timestamp: "<30 detik sebelum eksekusi>"}` → database baru `kanban-global-stag-drill-<runId>` siap dalam <10 detik → baca row count hasil restore → **COCOK PERSIS** (`users=1, projects=0`).
2. **Project DB throwaway** (staging tidak punya Project DB nyata, jadi dibuat khusus untuk drill): `kanban-drill-project-<runId>` dibuat, seed 1 baris marker (`drill_probe: {id: "p1", label: "restore-drill-marker"}`), jeda 5 detik untuk memastikan commit ter-capture PITR, lalu restore-to-new-database `kanban-drill-project-restored-<runId>` dari timestamp 2 detik sebelum eksekusi restore → baca isi tabel hasil restore → **COCOK PERSIS** (`[{id: "p1", label: "restore-drill-marker"}]`).
3. **Cleanup:** ketiga database yang dibuat drill ini (`kanban-global-stag-drill-*`, `kanban-drill-project-*`, `kanban-drill-project-restored-*`) DIHAPUS via Turso API setelah verifikasi — diverifikasi ULANG via `GET /organizations/ngodingin-ai/databases` bahwa HANYA 2 database asli (`kanban-global`, `kanban-global-stag`) tersisa, tidak ada resource sisa.
**Output aktual (bukti reproducible, run `node --env-file-if-exists=../../.env scripts/smoke-pitr-restore-drill.ts` dari `packages/infrastructure/`):**
```
=== [1/2] Restore drill: Global DB staging ===
Global DB source counts: { users: 1, projects: 0 }
Restore point-in-time: 2026-08-24T12:34:47Z
kanban-global-stag-drill-1787574915568 siap @ kanban-global-stag-drill-1787574915568-ngodingin-ai.aws-ap-south-1.turso.io
Global DB restored counts: { users: 1, projects: 0 }
PASS: Global DB restore -> row count cocok

=== [2/2] Restore drill: Project DB (throwaway, seed data manual) ===
Project DB source row count: 1
kanban-drill-project-restored-1787574915568 siap @ ...
Project DB restored rows: [{"id":"p1","label":"restore-drill-marker"}]
PASS: Project DB restore -> sample row cocok persis

=== HASIL AKHIR ===
Global DB restore: PASS
Project DB restore: PASS
CLEANUP: kanban-global-stag-drill-1787574915568 dihapus
CLEANUP: kanban-drill-project-1787574915568 dihapus
CLEANUP: kanban-drill-project-restored-1787574915568 dihapus
```
**RTO terukur:** waktu tunggu database restorasi siap (`waitForReady`, dari request `POST .../databases` sampai koneksi `SELECT 1` sukses) — kedua target < 10 detik. Konsisten dipakai untuk draft RTO/RPO di CL-02 (6.5.1).
**Dependency formal 6.5.1 BELUM ✅** (lihat CL-02 — diblokir lane SOT, BUKAN diblokir fakta teknis): dicatat eksplisit di sini karena drill NYATA ini secara fungsional TIDAK bergantung pada apakah angka RTO/RPO SUDAH tertulis di `docs/03-ENGINEERING.md` — fakta yang didokumentasikan (24 jam retensi, <10 detik RTO restore) sudah dibuktikan lewat drill ini sendiri, terlepas dari status penulisan dokumennya. QA/Planning MOHON konfirmasi independen apakah dependency formal ini tetap menahan closure 6.5.2 atau boleh dianggap terpenuhi secara substansi.
**Verifikasi:** operasional (bukan automated test suite) sesuai DoD goal — bukti command+output di atas, reproducible via `pnpm --filter @kanban/infrastructure test:smoke-pitr-restore-drill` (kredensial staging wajib ada di `.env`). `pnpm -r typecheck` bersih (script baru masuk scope `scripts/**/*.ts`); `pnpm exec eslint packages/infrastructure/scripts/smoke-pitr-restore-drill.ts` bersih (full-repo `pnpm lint` saat ini menunjukkan 1 error di `apps/api/src/routes/milestones.ts` — dikonfirmasi TIDAK terkait perubahan goal ini, berasal dari sesi AI-Dev LAIN yang sedang aktif mengerjakan TASK-6.2 di working tree yang sama, CL-04, file tsb TIDAK disentuh/di-commit oleh goal ini).

<a id="cl-02"></a>
### CL-02 — 2026-08-24 · goal 6.5.1 draft amandemen F.1 RTO/RPO — [NEEDS-SPEC-AMENDMENT], TIDAK diterapkan (⬜️ → ⏸️ · 0 → 70%)
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**[NEEDS-SPEC-AMENDMENT] — dikonfirmasi ke manusia sebelum bertindak:** Goal ini secara literal meminta "amandemen SOT" pada `docs/03-ENGINEERING.md` F.1. `04-DELIVERY.md` baris 351 eksplisit: **"Lane Guardrail — Dev Cannot Amend SOT. AI-Dev MUST NOT mengubah file SOT, SPEC_VERSION, atau changelog."** — larangan mutlak, tanpa pengecualian untuk penambahan faktual. Dikonfirmasi ke user via pertanyaan eksplisit sebelum bertindak; user memilih **"Draft the text, don't apply it"** — konsisten disiplin lane yang sudah ditegakkan ketat sepanjang sesi (Phase 0: "AI-Dev is forbidden from modifying SOT... never touched docs/*.md throughout").
**Fakta terverifikasi ULANG secara independen (bukan sekadar mempercayai catatan header file dari sesi lain):** `GET https://api.turso.tech/v1/organizations/ngodingin-ai` (via `turso.ts`-style fetch, kredensial `.env`) → `plan_id: "starter"`, cocok persis catatan header `PHASE-6-TASKS.md`. `GET .../databases` → HANYA 2 database eksis (`kanban-global` produksi, `kanban-global-stag` staging) — TIDAK ADA Project DB sama sekali di kedua environment (Phase 7/UI belum jalan, belum ada Project dibuat via jalur produksi).
**Draft amandemen F.1 (SIAP diterapkan oleh lane AI-Planning & Review atau manusia, BELUM ditulis ke `docs/03-ENGINEERING.md`):**
```markdown
## F.1 Backup & Disaster Recovery
- **Global DB** adalah titik paling kritis (kehilangan = kehilangan pemetaan Project→database, membership, credential). MUST punya backup terjadwal + point-in-time recovery jika provider mendukung.
- **Project DB** — backup per-database mengikuti fasilitas provider Turso. Karena jumlah database besar, backup MUST otomatis per-provisioning, bukan manual; restore tetap wajib diuji sebelum rilis.
- **Prinsip:** kehilangan satu Project DB tidak boleh memengaruhi Project lain (konsisten dengan isolation).
- **RTO/RPO konkret (amandemen — terkonfirmasi via Turso API + drill nyata, TASK-6.5.1/6.5.2, bukan estimasi):** Turso PITR (Point-in-Time Recovery) adalah fitur platform otomatis at-commit — TIDAK ada mekanisme backup kustom terpisah yang dibangun. Organisasi proyek pada plan `starter` (`GET /v1/organizations/:slug`) — retensi PITR **24 jam**:
  - **RPO mendekati nol** — PITR menangkap setiap commit, bukan snapshot berkala; restore dapat memulihkan ke detik manapun dalam 24 jam terakhir.
  - **RTO dalam orde menit** — restore-to-new-database (`POST /v1/organizations/:org/databases` dengan `seed.type=database`) diverifikasi selesai <10 detik per database (diuji langsung, TASK-6.5.2) ditambah waktu operasional (cutover connection string, verifikasi data) — estimasi RTO praktis <15 menit per database.
  - **Batas retensi 24 jam** — insiden yang baru terdeteksi >24 jam setelah kejadian TIDAK dapat di-restore ke titik sebelum insiden via PITR. Upgrade plan (10/30/90 hari) adalah opsi biaya/risiko bisnis terpisah, TIDAK menghalangi baseline MVP ini.
- Restore MUST diuji minimal sekali sebelum rilis (bukan sekadar diasumsikan bekerja) — **dibuktikan TASK-6.5.2**: restore-to-new-database nyata terhadap Global DB staging dan satu Project DB (dibuat khusus untuk drill), row count/sample data cocok persis pasca-restore, seluruh database sementara dibersihkan setelah verifikasi (bukti reproducible di CL-03).
```
**`[NEEDS-DECISION]` terpisah, non-blocking (diwariskan dari teks goal, dikonfirmasi masih relevan):** upgrade plan Turso untuk retensi PITR lebih panjang (10/30/90 hari) adalah keputusan biaya/risiko bisnis murni — TIDAK menghalangi closure baseline 24 jam.
**Kenapa status `⏸️`, bukan `🔎`:** substansi teknis (riset, verifikasi API, draft teks) SELESAI dan SIAP diterapkan — tapi DoD goal literal mengharuskan `docs/03-ENGINEERING.md` F.1 MEMUAT angka ini, yang TIDAK bisa AI-Dev lakukan sendiri. `%` 70 mencerminkan pekerjaan substantif selesai, ditahan dari 80 karena mekanisme closure (commit SOT) belum applicable ke lane ini.
**Verifikasi:** riset API di atas reproducible (`GET /v1/organizations/ngodingin-ai`, `GET /v1/organizations/ngodingin-ai/databases`, kredensial `.env`). Tidak ada perubahan kode/test (goal ini murni dokumentasi + verifikasi fakta).

<a id="cl-04"></a>
### CL-04 — 2026-08-24 · goal 6.2.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** ox-alpha-free (opencode)
**Bukti:** Freshness check dari disk: row `⬜️/0`, dependency `—`; seluruh pola parsing manual di milestones/boards/lists/cards.ts dipetakan (title trim-nonempty, optional string/null, progress int 0–100, expectedVersion int≥1, assignee trim/null, move destinationListId). Zod 4.4.3 terkunci di root/infrastructure — apps/api perlu tambah dep exact-pin.
**Catatan:** Bridge tunggal `parseBody(schema, body)` → PipelineError VALIDATION_ERROR + details collect-all (reuse semantik TASK-0.17.4); pesan error Indonesia dipertahankan identik; loop C.15/BR-017 unknown-field TETAP di tempatnya (pesan spesifik).

<a id="cl-05"></a>
### CL-05 — 2026-08-24 · goal 6.2.1 selesai sisi Dev (⬜️ → 🔄 → 🔎 · 0 → 80%) — Zod schemas core routes
**Role:** AI-Dev · **Model:** ox-alpha-free (opencode)
**Bukti:** `pnpm exec vitest run` → **102 file / 628 test lulus** (seluruh test existing hijau tanpa modifikasi = bukti parity perilaku); `pnpm -r typecheck` Done; lint bersih. Implementasi: `core-schemas.ts` — bridge `parseBody` (ZodError → VALIDATION_ERROR + details collect-all, SATU mekanisme reuse semantik TASK-0.17.4) + skema milestoneCreate/Patch, boardCreate/Patch, listCreate/Patch, cardCreate/Patch, cardMove; pesan validasi Indonesia dipertahankan identik; loop C.15/BR-017 unknown-field tetap dengan rawBody. Test baru `core-schemas-validation.test.ts`: multi-field invalid → details lengkap; payload valid → trim+default parity.
**Catatan:** apps/api tambah dep exact-pin `zod@4.4.3`. Lifecycle endpoints tetap readExpectedVersionField. **Catatan prosedural:** update row/CL tertinggal dari commit kode 3b343ce (pola row Gate A tidak berkaki `<br>` menyebabkan regex Gate B meleset) — dilengkapi pada commit ini sesuai §6.1.

<a id="cl-01"></a><a id="cl-01"></a>
### CL-01 — 2026-08-24 · goals 6.1.1, 6.1.2, 6.4.1 — audit optimistic-locking + concurrency test + audit-consistency mutation→Activity (⬜️×3 → 🔎×3 · 0 → 80%)
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)

**0.6.1.1 — Audit SATU PASS, gap ditemukan dan DIPERBAIKI (bukan bukti negatif murni):** Audit lintas ke-7 repository entity versioned (`project-repository.ts`, `milestone-repository.ts`, `board-repository.ts`, `list-repository.ts`, `card-repository.ts` [2 titik: move+commitMutation], `milestone-label-repository.ts`, `board-label-repository.ts`) plus command system-initiated `card-assignee-cleanup.ts` (BR-021 kalimat kedua). **Konfirmasi positif:** SELURUH mutation memakai conditional `UPDATE ... WHERE id = ? AND version = ?` (bukan read-then-write terpisah), dan seluruh read+check+write terjadi DALAM SATU `runInWriteTransaction`/`client.transaction("write")` (BEGIN IMMEDIATE-equivalent, terdokumentasi eksplisit `03-ENG` baris 202) — yang secara arsitektur men-serialize concurrent writer di level SQLite engine, membuat pre-check aplikasi ini SUDAH BENAR secara fungsional untuk kondisi normal.
**Gap yang ditemukan:** TIDAK SATU PUN dari ke-8 titik ini memverifikasi `rowsAffected` setelah UPDATE bersyarat — pre-check aplikasi + `WHERE version=?` di UPDATE bekerja BENAR hari ini HANYA karena serialisasi BEGIN IMMEDIATE, tapi TIDAK ADA pertahanan kalau asumsi itu pernah dilanggar (refactor masa depan, driver berbeda) — silent phantom-success adalah kelas bug invariant #6 (silent overwrite) yang PALING berbahaya karena tidak muncul sebagai error, hanya data yang diam-diam salah.
**Ditemukan LEBIH SERIUS di `card-assignee-cleanup.ts`:** docstring fungsi `unassignCardInTx` SUDAH MENGKLAIM eksplisit "Guard `AND assignee_user_id = ?` + `AND version = ?` menjamin tidak ada Activity tanpa mutation yang sesuai... skip tanpa efek samping" — TAPI implementasi SEBELUM fix ini TIDAK PERNAH menegakkan klaim tsb (rowsAffected tidak pernah dicek, Activity tetap ditulis + return `true` walau UPDATE ternyata 0-row). Ini bukan hipotetis — dibuktikan via test regresi (`git stash`, lihat bawah).
**Fix:** ditambahkan pemeriksaan `rowsAffected === 0` setelah SETIAP conditional UPDATE (8 titik total) — melempar `XxxVersionConflictError` yang sama (7 repository entity) atau `return false` tanpa INSERT Activity (card-assignee-cleanup.ts, menyamakan implementasi dengan klaim docstring-nya).

**0.6.1.2 — Property-style concurrency test, DEVIASI TERDOKUMENTASI dari teks goal:** Goal literal meminta "dua mutation PARALEL" via `Promise.all` dua koneksi nyata. **Dicoba SUNGGUHAN via spike empiris (5/5 trial konsisten)** sebelum menulis test: dua `Client` terpisah membuka `client.transaction("write")` hampir bersamaan terhadap SATU file SQLite lokal — sisi KEDUA SELALU gagal `TransactionBusyError` (retry habis walau budget 30x/30ms) TANPA PERNAH mencapai baca `version`, apalagi domain version-check. **Ini BUKAN dugaan** — sudah didokumentasikan SEBELUMNYA di codebase ini sendiri (`drizzle-transaction-retry.test.ts` baris 10-15, dari goal 1.12.1 sebelum Phase 6): "2 koneksi lokal sungguhan... libsql embedded lokal menahan write-lock antar-koneksi dalam proses yang sama secara TIDAK REALISTIS... dibuang karena bisa flaky/menyesatkan." Quirk driver LOKAL, terkonfirmasi BUKAN representasi Turso remote (HTTP per-request) produksi.
**Solusi:** `packages/infrastructure/test/optimistic-locking-concurrency.test.ts` (7 test, table-driven per entity, deviasi didokumentasikan penuh di header file) — pola deterministik "pemenang lalu stale-loser": panggilan PERTAMA (repository method sungguhan) mensimulasikan sisi menang race — sukses, version+1, satu Activity; panggilan KEDUA dengan `expectedVersion` SAMA (kini stale, persis kondisi sisi KALAH pada race genuinely-concurrent) — WAJIB reject, TANPA mutasi/Activity tambahan. Menguji kontrak optimistic-locking IDENTIK dengan yang goal minta, hanya urutan eksekusi deterministik alih-alih bergantung race timing yang terbukti tidak reproducible lokal.
**Catatan jujur:** test 6.1.2 (sequential-stale) TIDAK menguji jalur `rowsAffected` yang diperbaiki di 6.1.1 — pre-check aplikasi SUDAH menangkap stale version SEBELUM UPDATE dijalankan pada skenario sequential (readVersion sudah 2 saat call kedua mulai). Bukti untuk fix `rowsAffected` datang dari test TERPISAH (`card-assignee-cleanup.test.ts`, TOCTOU injection) yang secara white-box menyuntik perubahan version PERSIS di antara SELECT dan UPDATE fungsi yang sama — teknik yang diperlukan justru KARENA race genuinely-concurrent tidak reproducible di driver lokal ini.

**0.6.4.1 — Audit-consistency check, kapabilitas test BARU:** `packages/infrastructure/test/audit-consistency-mutation-activity.test.ts` (16 test, 3 bagian):
- **§1 (10 test)** — generic sweep lintas 10 repository yang menulis Activity (7 entity versioned + `card-comment.ts`/`card-label-association.ts`/`card-assignee-cleanup.ts`): mutation sukses → tepat SATU Activity dengan `entity_type`/`entity_id`/`action` sesuai, `entity_version` selaras KECUALI action yang memang tidak mengubah version parent (comment.added/label.added — junction/side-table by design, dikonfirmasi baca kode, bukan asumsi).
- **§2 (3 test)** — coverage eksplisit 4 file YANG TIDAK menulis Activity (`project-admin.ts` — Global DB murni, arsitektur berbeda file/koneksi sama sekali dari Project DB; `prune.ts`/`prune-projects.ts` — job DELETE, korektnes penuh sudah di `prune-descendants.test.ts`; `provisioning/provision.ts` — Activity `project.created` dicover `provision-owner-membership.test.ts`) — total genap 14 file repository sesuai DoD goal.
- **§3 (3 test, failure-injection)** — Card (single-DB tx, `card-repository.ts`) dan Project (single-DB tx, `project-repository.ts`) via UPDATE/INSERT gagal mid-transaksi → rollback penuh, NOL Activity; **Membership-revoke cross-DB (BR-054C)** — cleanup Project DB disuntik gagal → Global DB `revocation_pending_at` TETAP aktif (authorization belum dicabut, BR-054C poin 4 tidak pernah tercapai) SEKALIGUS Project DB nol mutation/Activity partial — membuktikan pola atomicity cross-DB yang BERBEDA dari single-DB tx (2 database, 2 commit terpisah, retry-safe by design) tetap benar saat gagal di tengah.
**Kenapa tidak ada `git stash` proof untuk 6.4.1:** kapabilitas test BARU (Prinsip #7 header file ini), BUKAN bug fix — seluruh 16 test lulus pada percobaan implementasi PERTAMA (setelah 3 bug SAYA sendiri di test — args SQL hilang, FK constraint belum di-seed — diperbaiki), tidak ada gap ditemukan di underlying implementation lewat sweep ini (konsisten dengan 6.1.1 yang SUDAH memperbaiki satu-satunya gap nyata — rowsAffected — sebelum sweep ini berjalan).

**Bukti regresi (`git stash`):**
1. `packages/infrastructure/test/card-assignee-cleanup.test.ts` (test TOCTOU baru, file source `card-assignee-cleanup.ts` di-stash) → 1/1 test baru FAIL (`expected true to be false` — kode lama return `true`+Activity palsu walau UPDATE 0-row), 7 test lain tetap hijau. Fix di-restore, hijau kembali.
2. `optimistic-locking-concurrency.test.ts` — dicoba stash 7 repository source, TERNYATA test TETAP hijau (pre-check aplikasi sudah cukup untuk skenario sequential-stale, TIDAK melewati jalur rowsAffected) — temuan ini SENDIRI yang mengarahkan ke desain test TOCTOU terpisah di atas (poin 1) untuk benar-benar membuktikan fix rowsAffected, bukan cuma pre-check yang sudah ada sebelumnya.

**Verifikasi:** `pnpm exec vitest run` → 101 file/626 test PASS (naik dari 100/610 sebelum sesi Phase 6 dimulai — 16 test baru dari 6.4.1 + 7 dari 6.1.2 + 1 regresi TOCTOU 6.1.1, minus baseline 602); `pnpm -r typecheck` bersih 6/6; `pnpm lint` bersih.
**Catatan:** `%` dipertahankan `80` (maksimal Dev) untuk ketiganya — QA WAJIB memverifikasi independen, termasuk membaca ulang analisis "kenapa BEGIN IMMEDIATE membuat pre-check sudah benar" dan mengonfirmasi teknik TOCTOU-injection benar-benar menguji jalur kode yang diklaim, bukan cuma percaya narasi di CL ini.

<a id="review-cl-01"></a>
### Review-CL-01 — 2026-08-24 · generate PHASE-6-TASKS.md (7 task, 14 goal)

**Role:** AI-Planning & Review · **Model:** Claude Sonnet 5

Gate Phase 6 dibuka atas keputusan manusia eksplisit ("buka phase 6"), setelah gate [Review-CL-22](PHASE-0-TASKS.md#review-cl-22) diverifikasi terpenuhi secara independen sebelumnya di sesi ini (test 602/602, typecheck/lint bersih, TASK-0.15–0.21 dan TASK-5.5 seluruhnya ✅). Dibaca penuh sebelum generate: `02-SPEC` A.7/A.8/A.14/A.15/A.16, Part B (B.3, B.4, B.11–B.14), `04-DELIVERY` C.1 baris Phase 6, C.2 mapping, C.3 DoD, Part B Testing Strategy, C.6 (kontrak generate task) sepenuhnya; `03-ENGINEERING` Part F (F.1–F.6) sepenuhnya.

**State repo dikonfirmasi via grep langsung sebelum menulis goal** (bukan asumsi, sesuai C.6.1): Zod dipakai 0/13 file route (24 fungsi `readXField` manual tersebar); tidak ada mekanisme/test audit-consistency; tidak ada implementasi backup (`docs/03-ENGINEERING.md` F.1 + `scripts/release-check.mjs` baris 32 "DEFERRED"); 2 pemakaian `console.*` polos, 0 `request_id`, 0 rate-limit, 0 Resend webhook.

**Riset eksternal:** kapabilitas PITR Turso (WebSearch, `docs.turso.tech/features/point-in-time-recovery`) dan plan aktual organisasi (`plan_id: "starter"`, Turso API) dicatat di header file — retensi 24 jam adalah fakta observed, bukan pilihan desain, sehingga TASK-6.5.1 bisa langsung dikerjakan tanpa menunggu keputusan tambahan (opsi upgrade plan dicatat terpisah sebagai `[NEEDS-DECISION]` non-blocking).

**Keputusan struktural (C.6.5 poin 3, teknis murni):** model-tiering Phase 6 dibuat SELEKTIF per-goal (hanya `TASK-6.1`/`6.4` ditandai wajib model kuat) alih-alih blanket seperti Prinsip #1 Phase 4/5, mengikuti teks AGENTS.md §11.2 yang secara eksplisit menyebut "**inti** concurrency/transaction/optimistic-locking (Phase 6)" — lebih sempit dari "SETIAP goal" di Phase 4/5. Task-task diatur sebagai checklist paralel (tanpa dependency antar-task) karena scope Phase 6 secara alami adalah 5 kapabilitas independen (C.1), bukan pipeline berurutan seperti Phase 5.

Belum ada implementasi yang dimulai — seluruh goal `⬜️`. Menunggu review manusia atas breakdown ini sebelum AI-Dev mulai bekerja (04-DELIVERY C.6.6), sesuai instruksi AGENTS.md §6 "Tampilkan task list untuk direview sebelum implementasi."

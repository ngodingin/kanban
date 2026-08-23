# Phase 5 — Lifecycle · Task & Goal Breakdown

> Generated per [04-DELIVERY C.6](docs/04-DELIVERY.md). SOT version: 2.11.0.
> Scope batas: [04-DELIVERY C.1 "Phase 5"](docs/04-DELIVERY.md). Acuan utama: [02-SPEC](docs/02-SPEC.md) A.3, A.4, A.14; B.11; C.4–C.8; [03-ENGINEERING](docs/03-ENGINEERING.md) C.6 (Data Retention & Deletion), F.2 (Provisioning).
> **Konteks repo saat digenerate:** Phase 0–4 selesai (semua ✅). **State machine lifecycle penuh (archive/restore/delete) dan ancestor-chain validation (INV-LIFE-001/002) SUDAH DIBANGUN sejak Phase 2/3** — `packages/domain/src/lifecycle/effective-state.ts` (`resolveLifecycleState`/`isEffectivelyOperational`/`evaluateRestore`) dipakai konsisten oleh Milestone/Board/List/Card/MilestoneLabel/BoardLabel repository. **Phase 5 TIDAK membangun ulang mekanisme ini** — sesuai catatan Prinsip Phase 2 #1 ("Phase 5 nanti MENGERASKAN mekanisme ini — retention 30 hari, internal prune — bukan membangunnya dari nol"). Satu-satunya kapabilitas yang GENUINELY belum ada: **retention 30 hari + internal prune** (BR-016, BR-016A, FR-047, 03-ENG C.6) — permanent physical removal subtree entity DELETED setelah 30 hari, bukan endpoint user-triggered.

> **[CROSS-CUTTING, status per 2026-08-23]** 4 temuan P2 didelegasikan sebelum/bersamaan Phase 5 — **3 dari 4 SUDAH SELESAI**, dikonfirmasi independen (bukan cuma laporan) sebelum task ini mulai dikerjakan:
> 1. ✅ **SELESAI** (`39ce17b`) — `turso.ts:67` `databaseExists()` sekarang `error instanceof TursoApiError && error.status === 404` (dikonfirmasi baca kode langsung — bukan string-match lagi). Prasyarat TASK-5.3 **terpenuhi**.
> 2. **BELUM, opsional, TIDAK blocking Phase 5** (Review-CL-11, [PHASE-0-TASKS.md](PHASE-0-TASKS.md)) — `INVALID_STATE` dipakai sebagai fallback 500 generik (`http-mapping.ts`/`routes/projects.ts`) — butuh amandemen SOT kecil (kode kanonik baru `INTERNAL_ERROR`, C.2) sebelum bisa dikerjakan, murni kosmetik-semantik, tidak menghalangi goal Phase 5 manapun.
> 3. ✅ **SELESAI** (`39ce17b`) — `mapUniqueViolation` (`project-admin.ts:288`) sekarang cek `.code === "SQLITE_CONSTRAINT_UNIQUE" || .code === "SQLITE_CONSTRAINT"` di rantai `.cause` (dikonfirmasi baca kode langsung), komentar eksplisit merujuk pelajaran `isBusy()` (CL-65).
> 4. ✅ **SELESAI** (`b1e9bfd`, diverifikasi independen `45f6e66`) — `loadEffectivePermissionInputs` double-fetch (Review-CL-05, [PHASE-4-TASKS.md](PHASE-4-TASKS.md)) — `RealPermissionResolver` sekarang mengoper `inputs` mentahnya lewat `OpenProjectContext.permissionInputs` ke `createEntityPermissionResolver` (`preloadedInputs`, 2 call site, seluruhnya ter-wire), 1× fetch per request bukan 2×. Regression test membuktikan via penghitungan call sungguhan, bukan asersi tidak langsung.
>
> **TASK-5.3 (prune Project-level) tidak lagi punya prasyarat outstanding — unblocked.** Item #2 boleh dikerjakan kapan saja, tidak terkait dependency Phase 5 manapun.
>
> **AI-Dev execution gate:** jangan ubah implementasi sebelum goal `🔄` + `CL` terpasang. Jangan menyatakan selesai sebelum goal `🔎`/`80%` + CL baru + test hijau + commit. Format handoff wajib mengikuti [AGENTS.md §0](AGENTS.md).

## Prinsip Phase 5

1. **[MODEL LEBIH KUAT WAJIB UNTUK SELURUH FASE INI]** — AGENTS.md §11.2 menyebut eksplisit **"Lifecycle/effective ancestor state (Phase 5)"** sebagai kategori penuh invariant-critical, sama seperti Phase 4. **Setiap goal WAJIB model lebih kuat, tanpa pengecualian.** Insiden Phase 4 (Review-CL-03/04/05, [PHASE-4-TASKS.md](PHASE-4-TASKS.md)) — 11 goal dikerjakan model salah, redo penuh, satu deviasi (verifikasi-tanpa-rebuild) baru diterima setelah eskalasi eksplisit ke manusia — MASIH BERLAKU sebagai preseden: pelanggaran tier model TIDAK diterima diam-diam, dan "verifikasi ekstra" bukan pengganti otomatis untuk kualitas konstruksi awal.
2. **Prune adalah SATU-SATUNYA kapabilitas benar-benar baru di fase ini.** Jangan mengulang/membangun ulang ancestor-chain check atau state machine archive/restore/delete — itu SUDAH ada dan sudah diaudit berkali-kali (Review-CL-02 Phase 2, Review-CL-02 Phase 3). Goal Phase 5 murni tentang: (a) menentukan eligibility retention, (b) menghapus fisik subtree tanpa orphan, (c) mekanisme trigger internal (bukan endpoint user).
3. **Physical cascade DIIZINKAN hanya di sini (BR-059/060).** Seluruh kode lain di codebase ini (Phase 1–4) SENGAJA tidak pernah pakai `ON DELETE CASCADE`/DELETE fisik langsung — soft-delete (`deleted_at`) adalah satu-satunya mutasi user-facing. Prune (Phase 5) adalah SATU-SATUNYA tempat physical DELETE diizinkan, dan HANYA untuk entity yang sudah `deleted_at <= now - 30 hari` (BR-016A) — jangan pernah physical-delete entity yang masih ACTIVE/ARCHIVED atau yang `deleted_at`-nya belum 30 hari.
4. **Prune granularitas per-entity, bukan cuma per-Project (BR-016).** Milestone/Board/List/Card/MilestoneLabel/BoardLabel yang DELETED sendiri (Project induk-nya masih ACTIVE/ARCHIVED) TETAP eligible di-prune independen — tidak perlu menunggu Project ikut di-delete. Sebaliknya, Project yang DELETED >= 30 hari men-trigger prune SELURUH isinya sekaligus (deprovision Turso DB, F.2/F.3) — descendant TIDAK perlu dicek `deleted_at`-nya masing-masing dalam kasus ini (subtree ikut terhapus karena parent Project DB-nya sendiri yang dihapus, bukan karena masing-masing baris dicek).
5. **No-orphan adalah DoD non-negotiable (BR-016).** Setiap goal prune WAJIB test eksplisit: setelah prune, TIDAK ADA baris anak (Activity, junction Label, Card di bawah List yang di-prune, dst) yang tersisa merujuk entity yang sudah tidak ada. Urutan hapus WAJIB descendant dulu baru ancestor (leaf-to-root) dalam SATU transaksi, agar tidak ada window di mana FK/reference rusak jika prune gagal di tengah jalan.
6. **Trigger BUKAN endpoint publik (FR-047, C.6 03-ENG).** Keputusan teknis murni (04-DELIVERY C.6.5 poin 3, tidak menyentuh business invariant — SOT sengaja permisif "sistem MAY mengeksekusinya sesuai jadwal internal", BR-016A): endpoint internal `POST /api/internal/prune`, digerbangi header `Authorization: Bearer <CRON_SECRET>` dibandingkan **constant-time** (`crypto.timingSafeEqual` — kasus ini GENUINELY butuh itu, beda dari API Key Phase 4 yang lookup-by-hash-index; di sini bandingkan SECRET MENTAH langsung terhadap env var, persis skenario yang dirancang `timingSafeEqual` untuk dicegah), dipanggil Vercel Cron (`vercel.json` `crons` config, jadwal harian). Dipilih karena idiomatik untuk platform yang sudah dikunci (03-ENG D.1) dan reversibel (ganti mekanisme trigger nanti tidak mengubah logika prune itu sendiri, sudah di balik abstraction terpisah).
7. **Retention 30 hari dihitung dari `deleted_at`, bukan dari waktu prune berjalan pertama kali menemukannya (BR-016A).** `now - deleted_at >= 30 hari` — jika job prune sempat tidak berjalan beberapa hari (Cron gagal, dsb), entity yang SUDAH lewat 30 hari tetap eligible saat job berikutnya jalan (bukan menunggu 30 hari SEJAK job terakhir).
8. **Aktivitas ikut retention entity induk (03-ENG C.6), bukan dipertahankan terpisah selamanya.** Saat entity di-prune, seluruh `activities` yang `entity_type`+`entity_id`-nya merujuk entity itu (dan descendant-nya) WAJIB ikut dihapus dalam transaksi yang sama — TIDAK ADA pengecualian "audit selamanya" di MVP (SOT eksplisit: "kecuali requirement legal/audit khusus", tidak ada requirement seperti itu di 01-PRODUCT §2.2).

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
[cross-cutting, di luar file ini] Fix turso.ts databaseExists() (Review-CL-11) — WAJIB selesai sebelum 5.3

5.1 Retention eligibility utility (domain, pure) ── independen
 ├─ 5.2 Prune descendant-level (Milestone/Board/List/Card/Label, dalam satu Project DB) ◄── 5.1, effective-state.ts (Phase 2)
 │    └─ 5.2.2 No-orphan integrity test (property-style, banyak kombinasi subtree)
 └─ 5.3 Prune Project-level (deprovision Turso DB penuh) ◄── 5.1, turso.ts fix (cross-cutting)
      └─ 5.4 Trigger internal (endpoint + Vercel Cron) ◄── 5.2, 5.3
```

---

## TASK-5.1 — Retention eligibility utility (domain, pure)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 5.1.1 | 🔎 | [CL-02](#cl-02)<br>[CL-01](#cl-01) | 80 | P0 **[MODEL LEBIH KUAT WAJIB]** | `packages/domain/src/lifecycle/retention.ts` — `isPruneEligible(deletedAt: string \| null, now: Date): boolean` (BR-016A: `deletedAt !== null && (now.getTime() - Date.parse(deletedAt)) >= RETENTION_MS`, konstanta `RETENTION_DAYS = 30` di-export eksplisit sebagai named constant — BUKAN angka ajaib inline, agar 1 titik perubahan jika retention berubah). Fungsi 100% murni (terima `now` sebagai parameter, JANGAN panggil `Date.now()`/`new Date()` internal — testable deterministik, pola sama `effective-state.ts`). | [02-SPEC](docs/02-SPEC.md) BR-016A; [03-ENG C.6](docs/03-ENGINEERING.md) | — |

**Test:** `deletedAt = null` → selalu `false` (entity ACTIVE/ARCHIVED tidak pernah eligible). `deletedAt` tepat 30 hari − 1 detik dari `now` → `false` (belum genap, BR-016A "MUST NOT sebelumnya"). `deletedAt` tepat 30 hari dari `now` → `true` (boundary inclusive, "eligible saat `deleted_at <= now - 30 days`"). `deletedAt` 100 hari lalu → `true` (job yang terlambat jalan tetap eligible, Prinsip #7).
**DoD:** Tidak ada I/O, tidak ada default `now = new Date()` di signature (parameter wajib, cegah non-determinisme tersembunyi).

---

## TASK-5.2 — Prune descendant-level (subtree dalam satu Project DB)  (dep: 5.1)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 5.2.1 | 🔎 | [CL-04](#cl-04)<br>[CL-03](#cl-03)<br>[Review-CL-03](#review-cl-03) | 80 | P0 **[MODEL LEBIH KUAT WAJIB]** | `packages/infrastructure/src/database/prune.ts` — `pruneDescendantSubtrees(projectClient): Promise<PruneResult>`, SATU `runInWriteTransaction`: (1) SELECT seluruh id dari `milestones`/`boards`/`lists`/`cards`/`milestone_labels`/`board_labels` WHERE `deleted_at IS NOT NULL` DAN `isPruneEligible` (5.1) true untuk MASING-MASING (independen — Prinsip #4, TIDAK menunggu Project ikut delete); (2) untuk SETIAP entity eligible, hapus fisik SELURUH subtree-nya leaf-to-root DALAM urutan: `card_milestone_labels`/`card_board_labels` (junction, by `label_id` ATAU `card_id` match) → `activities` (by `entity_type`+`entity_id` match, seluruh descendant) → `cards` → `lists` → `boards` → `milestones` → `milestone_labels`/`board_labels`. **Penting:** jika Milestone eligible-prune, SELURUH Board/List/Card di bawahnya ikut terhapus TERLEPAS `deleted_at` masing-masing (subtree Milestone yang di-prune tidak dicek ulang eligibility per descendant — begitu ancestor-nya diputuskan prune, descendant ikut, karena tidak ada cara descendant "selamat" saat ancestornya sudah dihapus fisik). Cegah double-prune: descendant yang SUDAH ikut terhapus lewat ancestor-nya (mis. Card di bawah Milestone yang di-prune) TIDAK diproses lagi sebagai entity independen di iterasi Card level (skip jika parent chain-nya sudah tidak ada, cek via `NOT EXISTS`). | [02-SPEC](docs/02-SPEC.md) BR-016, BR-016A, BR-059, BR-060; [03-ENG C.6](docs/03-ENGINEERING.md) | 5.1 |
| 5.2.2 | 🔎 | [CL-06](#cl-06)<br>[CL-05](#cl-05) | 80 | P0 **[MODEL LEBIH KUAT WAJIB]** | No-orphan integrity test khusus (Prinsip #5) — dipisah goal sendiri karena scope test-nya besar dan krusial: buat fixture multi-level (Milestone dengan Board/List/Card/Label/Activity/Comment lengkap), delete Milestone (`deleted_at` = 31 hari lalu), jalankan prune, VERIFIKASI LANGSUNG via query row-level (bukan cuma cek return value fungsi) bahwa NOL baris tersisa di `boards`/`lists`/`cards`/`milestone_labels`/`card_milestone_labels`/`card_board_labels`/`activities` yang merujuk subtree tsb. | [02-SPEC](docs/02-SPEC.md) BR-016 | 5.2.1 |

**Test:** Milestone `deleted_at` 31 hari lalu, Board/List/Card di bawahnya ACTIVE (local state, non-operational karena ancestor tapi TIDAK sendiri DELETED) → seluruhnya ikut terhapus fisik (subtree cascade). Milestone `deleted_at` 29 hari lalu (belum eligible) → SAMA SEKALI tidak disentuh, subtree tetap utuh. Card yang DELETED independen (Milestone/Board/List induk masih ACTIVE) 31 hari lalu → Card + Activity + Label-nya terhapus, List/Board/Milestone induk TIDAK terpengaruh. Project lain (Project DB terpisah) tidak pernah tersentuh (Project isolation, structural — beda `projectClient`). Kegagalan di tengah proses (simulasi error) → transaksi rollback penuh, TIDAK ada partial-prune (invariant #9 gaya, walau ini bukan Activity-write biasa).
**DoD:** Physical `DELETE FROM` dipakai (bukan `UPDATE ... SET deleted_at`, karena sudah `deleted_at` — ini benar-benar physical removal); satu transaksi mencakup SELURUH subtree satu entity root; test 5.2.2 lulus dengan verifikasi row-level eksplisit di setiap tabel yang relevan.

---

## TASK-5.3 — Prune Project-level (deprovision Turso DB)  (dep: 5.1 — prasyarat turso.ts fix ✅ terpenuhi per `39ce17b`)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 5.3.1 | 🔎 | [CL-08](#cl-08)<br>[CL-07](#cl-07)<br>[Review-CL-03](#review-cl-03) | 80 | P0 **[MODEL LEBIH KUAT WAJIB]** | `pruneEligibleProjects(globalClient, turso): Promise<PruneResult>` — iterasi SELURUH `projects` terdaftar (pola sama `project-list.ts`, TAPI tanpa filter membership — prune adalah operasi sistem-lebar, bukan per-user), untuk masing-masing buka `project_state` di Project DB-nya dan cek `isPruneEligible` (5.1) atas `deletedAt`. Jika eligible: (1) `deleteDatabase` (`turso.ts`, SUDAH diperbaiki cross-cutting — pastikan pakai `.status` numerik bukan string-match sebelum goal ini mulai); (2) hapus row `project_databases` + `projects` (Global DB) DALAM transaksi yang sama dengan langkah (1) secara logis (Turso API call tidak bisa ikut SQL transaction — urutan WAJIB: sukses deprovision Turso DULU, baru hapus row Global DB; jika step 1 gagal, JANGAN lanjut ke step 2, biarkan project tetap terdaftar untuk dicoba prune lagi run berikutnya — lebih aman "tertunda" daripada row Global DB yatim menunjuk DB yang sudah tidak ada). `projectMemberships`/`membershipGroupAssignments`/dst yang merujuk `projectId` ini ikut dihapus (FK cleanup Global DB, physical — BR-059/060 sama berlaku di sini). | [02-SPEC](docs/02-SPEC.md) BR-016, BR-016A; [03-ENG F.2](docs/03-ENGINEERING.md) (provisioning symmetry) | 5.1 |

**Test:** Project `deleted_at` (di `project_state`, Project DB-nya) 31 hari lalu → `deleteDatabase` dipanggil dengan `databaseId` yang benar, row `projects`/`project_databases`/`project_memberships`/assignment terkait terhapus dari Global DB. Project 29 hari lalu → tidak disentuh sama sekali. Simulasi `deleteDatabase` gagal (network/API error) → row Global DB TETAP ADA (tidak orphan-pointing ke DB yang sudah terhapus sebagian), project tetap muncul di run prune berikutnya. Project ARCHIVED (bukan DELETED) → tidak pernah eligible, tidak disentuh berapa lama pun.
**DoD:** Urutan operasi (Turso API dulu, baru Global DB) dijaga ketat, tidak ada kondisi yang bisa menghasilkan row Global DB menunjuk database yang sudah tidak ada.

---

## TASK-5.4 — Trigger internal prune (endpoint + Vercel Cron)  (dep: 5.2, 5.3)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 5.4.1 | 🔎 | [CL-10](#cl-10)<br>[CL-09](#cl-09)<br>[Review-CL-03](#review-cl-03) | 80 | P1 **[MODEL LEBIH KUAT WAJIB]** | `POST /api/internal/prune` (`apps/api/src/routes/internal.ts` baru) — cek header `Authorization: Bearer <secret>` dibandingkan `process.env.CRON_SECRET` via `crypto.timingSafeEqual` (Prinsip #6 — konstanta-waktu genuinely diperlukan di sini, bandingkan secret mentah langsung, BUKAN kasus lookup-hash-via-index seperti API Key Phase 4); tolak `401` jika tidak cocok/header tidak ada — **TIDAK melalui `RequestPipeline`/`OpenProjectContext`** (bukan user-facing, tidak ada identity/membership User yang relevan). Panggil `pruneDescendantSubtrees` (5.2) untuk SETIAP Project DB yang masih terdaftar (iterasi sama seperti 5.3.1) DAN `pruneEligibleProjects` (5.3) — urutan: descendant-level dulu untuk Project yang MASIH ada (biar tidak sia-sia buka Project DB yang sebentar lagi ikut di-deprovision), baru Project-level. Return ringkasan `{prunedEntities: {milestones, boards, lists, cards, labels}, prunedProjects}` untuk observability (log, bukan expose ke user). `vercel.json` ditambah `crons: [{path: "/api/internal/prune", schedule: "0 3 * * *"}]` (harian jam 03:00 UTC — off-peak, technical decision C.6.5 poin 3, mudah diubah). | [02-SPEC](docs/02-SPEC.md) FR-047; [03-ENG C.6](docs/03-ENGINEERING.md) | 5.2, 5.3 |

**Test:** Request tanpa header `Authorization` → `401`, TIDAK memanggil prune sama sekali (assert prune functions tidak ter-invoke, bukan cuma cek response code). Header salah (secret tidak cocok, termasuk yang mirip-mirip untuk uji constant-time genuinely dipakai bukan cuma `===`) → `401`. Header benar → `200` + ringkasan hasil, prune benar-benar berjalan (assert row terhapus, bukan cuma response). Endpoint TIDAK terdaftar di `02-SPEC` Part C (bukan API publik, tidak melanggar C.1 "tidak ada endpoint tanpa kontrak" karena ini eksplisit internal/ops seperti health check — dicatat di 03-ENG bukan 02-SPEC).
**DoD:** `CRON_SECRET` tidak pernah ter-log/muncul di response error; endpoint tidak dapat dipicu tanpa secret walau tahu path-nya; `vercel.json` valid (schema Vercel Cron).

---

## Closure Log

<!-- Dev: `### CL-nn — YYYY-MM-DD · goal <id> <ringkasan>`. QA: `### QA-CL-nn — ...`. Review: `### Review-CL-nn — ...`. Cantumkan Role + Model/platform aktual. Append-only, jangan hapus/ubah entry lama. -->

### Review-CL-02 — 2026-08-23 · koreksi status cross-cutting notice — turso.ts & mapUniqueViolation SUDAH selesai (`39ce17b`), sebelumnya keliru ditandai "belum"

**Role:** AI-Planning & Review · **Model:** Claude Sonnet 5

Saya sempat menyatakan fix `turso.ts` (Review-CL-11) dan `mapUniqueViolation` (Review-CL-19) "belum landing" — keliru, berdasarkan pengecekan yang stale (predates `39ce17b`). Dikoreksi setelah verifikasi independen: `git merge-base --is-ancestor 39ce17b HEAD` dikonfirmasi, DAN kode aktual dibaca langsung — `turso.ts:67` (`error instanceof TursoApiError && error.status === 404`) dan `project-admin.ts:288` (`.code === "SQLITE_CONSTRAINT_UNIQUE" || .code === "SQLITE_CONSTRAINT"`) keduanya sudah benar persis seperti direkomendasikan. Header file (baris 7–13) diperbarui untuk mencerminkan status akurat: 3 dari 4 item cross-cutting selesai, item #2 (`INVALID_STATE`-as-500) tetap optional/non-blocking. **TASK-5.3 dependency dikonfirmasi terpenuhi** — Phase 5 genuinely unblocked untuk mulai dikerjakan.

### Review-CL-01 — 2026-08-23 · generate task list Phase 5 (tanpa perubahan status implementasi)

**Role:** AI-Planning & Review · **Model:** Claude Sonnet 5

Generate `PHASE-5-TASKS.md` (4 task, 6 goal) mengikuti [04-DELIVERY C.6](docs/04-DELIVERY.md), setelah membaca penuh 02-SPEC A.3/A.4/A.14/B.11, 03-ENGINEERING C.6/F.2, dan memeriksa state repo — dikonfirmasi state machine lifecycle + ancestor-chain validation SUDAH lengkap sejak Phase 2/3 (`effective-state.ts`, dipakai 6 entity type), sehingga scope Phase 5 murni retention 30 hari + internal prune (BR-016/016A/FR-047), belum ada kode prune sama sekali di repo.

**Keputusan teknis tanpa eskalasi (C.6.5 poin 3, tidak menyentuh business invariant):** mekanisme trigger prune = endpoint internal `POST /api/internal/prune` digerbangi `CRON_SECRET` (constant-time compare) dipanggil Vercel Cron harian — SOT sengaja permisif soal mekanisme ("MAY mengeksekusinya sesuai jadwal internal", BR-016A), dipilih karena idiomatik platform terkunci (Vercel, 03-ENG D.1) dan reversibel.

**Didelegasikan bersamaan (instruksi manusia eksplisit):** 3 temuan P2 yang menumpuk dari audit-audit sebelumnya (Review-CL-11 turso.ts + INVALID_STATE-as-500 di [PHASE-0-TASKS.md](PHASE-0-TASKS.md); Review-CL-19 mapUniqueViolation di [PHASE-1-TASKS.md](PHASE-1-TASKS.md); Review-CL-05 double-fetch permission di [PHASE-4-TASKS.md](PHASE-4-TASKS.md)) — dicatat sebagai cross-cutting fix WAJIB dikerjakan sebelum/bersamaan goal Phase 5 pertama, BUKAN goal baru (tidak reopen apa pun). Fix `turso.ts` secara khusus WAJIB selesai sebelum TASK-5.3 dimulai karena goal itu memanggil fungsi yang sama.

**Model-tiering:** SELURUH goal ditandai `[MODEL LEBIH KUAT WAJIB]` (Prinsip #1), mengikuti AGENTS.md §11.2 yang menyebut "Lifecycle/effective ancestor state (Phase 5)" eksplisit — preseden insiden Phase 4 (Review-CL-03/04/05) berlaku penuh di sini.

Belum ada implementasi yang dimulai — seluruh goal `⬜️`. Menunggu review manusia atas breakdown ini sebelum AI-Dev mulai bekerja (04-DELIVERY C.6.6).

<a id="cl-10"></a>
### CL-10 — 2026-08-23 · goal 5.4.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — trigger internal + Vercel Cron
**Role:** AI-Dev · **Model:** ox-alpha-free (opencode)
**Bukti:** `pnpm exec vitest run` → **88 file / 528 test lulus**, termasuk 4 baru `internal-prune.test.ts`: tanpa header → 401 DAN pruneAll tidak ter-invoke (spy); secret salah/mirip-mirip/panjang-beda → 401 semua; benar → 200 + ringkasan dengan assert row-level (mapping Global terhapus, deleteDb terpanggil); CRON_SECRET tidak pernah muncul di response. `pnpm -r typecheck` Done; `pnpm lint` bersih; `vercel.json` + `crons` harian 03:00 UTC.
**Catatan:** Route `/internal/prune` non-pipeline; guard length sebelum timingSafeEqual (Review-CL-03 poin 3); orkestrasi `pruneAllRegisteredProjects` di infra — descendant-level dulu untuk seluruh Project DB terdaftar, baru Project-level; kegagalan satu DB tidak menggagalkan lainnya. Koreksi saat verifikasi: prefix route mengikuti konvensi basePath("/api") komposisi (deteksi dobel /api/api oleh test routing Phase 0).

<a id="cl-09"></a>
### CL-09 — 2026-08-23 · goal 5.4.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** ox-alpha-free (opencode)
**Bukti:** Freshness check dari disk: row 5.4.1 `⬜️/0`, dependency `5.2`+`5.3` = keduanya `🔎80`; `vercel.json` ada di root (belum ada `crons`).
**Catatan:** Helper agregat `pruneAllRegisteredProjects` di infra (urutan: descendant-level dulu per Project DB terdaftar, baru Project-level); route tipis non-pipeline dengan guard length sebelum timingSafeEqual (Review-CL-03 poin 3).

<a id="cl-08"></a>
### CL-08 — 2026-08-23 · goal 5.3.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — prune Project-level deprovision
**Role:** AI-Dev · **Model:** ox-alpha-free (opencode)
**Bukti:** `pnpm exec vitest run` → **87 file / 524 test lulus**, termasuk 5 baru `prune-projects.test.ts`: (1) 31 hari → deleteDb dipanggil dengan `projectDatabaseName(pid)` + seluruh row Global bersih (projects/project_databases/memberships/groups/assignments); (2) negatif 29 hari & deleted_at NULL → utuh; (3) mock 404 → tetap lanjut cleanup Global (idempotency Review-CL-03 poin 1); (4) mock 500 → row Global TETAP ADA, prunedProjects 0; (5) isolasi campuran. `pnpm -r typecheck` Done; `pnpm lint` bersih.
**Catatan:** Urutan ketat Turso-dulu-baru-Global; cleanup Global parameterized leaf-to-root dalam SATU transaksi; injeksi `deleteDb`/`openProjectDb`/`now` untuk determinisme (di-balik-abstraksi). Dua iterasi perbaikan test saat verifikasi mandiri: signature `TursoApiError(status, message)` dan kolom `project_databases` tanpa `id`.

<a id="cl-07"></a>
### CL-07 — 2026-08-23 · goal 5.3.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** ox-alpha-free (opencode)
**Bukti:** Freshness check dari disk: row 5.3.1 `⬜️/0`, dependency `5.1` ✅ terpenuhi + prasyarat turso.ts fix ✅ (Review-CL-02). API terverifikasi: `deleteDatabase(env, name)` + `TursoApiError.status` + `projectDatabaseName(projectId)`; Global DB FK-chain: assignments → memberships/groups, group_permissions → permission_groups, invitations, api_keys, project_databases, projects.
**Catatan:** Urutan cleanup Global DB leaf-to-root; Turso DULU baru row Global (gagal non-404 → project dilewati, tetap terdaftar); 404 → lanjut (idempotency, Review-CL-03 poin 1); opts injeksi opener+now untuk test deterministik.

<a id="cl-06"></a>
### CL-06 — 2026-08-23 · goal 5.2.2 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — no-orphan integrity test
**Role:** AI-Dev · **Model:** ox-alpha-free (opencode)
**Bukti:** `pnpm exec vitest run` → **86 file / 519 test lulus**, termasuk 5 baru `prune-no-orphan.test.ts`: matriks 4 bentuk root (Milestone/Board/List/Card, fixture lengkap 6 tabel + junction + 7 Activity incl. Comment) dengan verifikasi row-level eksplisit per id di setiap tabel + survivor set; skenario campuran chain-eligible + Card-independen dalam satu Project saling tidak ganggu (activity non-card survivor tetap ada). `pnpm -r typecheck` Done; `pnpm lint` bersih.
**Catatan:** Placeholder-id pada pasangan pruned/survivor sengaja dipakai agar helper verifikasi generik; setiap kombinasi memverifikasi label milik ancestor selamat bersama ancestor-nya.

<a id="cl-05"></a>
### CL-05 — 2026-08-23 · goal 5.2.2 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** ox-alpha-free (opencode)
**Bukti:** Freshness check dari disk: row 5.2.2 `⬜️/0`, dependency `5.2.1` = `🔎80` (commit b0e1851, suite 514 hijau).
**Catatan:** Property-style: matriks bentuk subtree (root di level Milestone/Board/List/Card + campuran) × verifikasi row-level eksplisit per tabel, termasuk Comment sebagai Activity.

<a id="cl-04"></a>
### CL-04 — 2026-08-23 · goal 5.2.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — prune subtree dalam Project DB
**Role:** AI-Dev · **Model:** ox-alpha-free (opencode)
**Bukti:** `pnpm exec vitest run` → **85 file / 514 test lulus**, termasuk 5 baru `prune-descendants.test.ts`: (1) cascade 31 hari — subtree ACTIVE ikut terhapus fisik, row-level 0 di seluruh tabel; (2) negatif 29 hari — utuh; (3) Card independen — junction hilang, definisi Label milik Milestone TETAP ADA (dipakai bersama), induk utuh; (4) rollback mid-failure via proxy in-tx — tidak ada partial-prune + retry sukses (Prinsip #7); (5) kosong → nol. `pnpm -r typecheck` Done; `pnpm lint` bersih.
**Catatan:** Dua koreksi saat verifikasi mandiri: (a) urutan hapus teks goal menaruh label SETELAH milestones — melanggar FK; mengikuti Review-CL-03 poin 2 (label sebelum parent); (b) ekspektasi awal "Label-nya terhapus" untuk Card independen dikoreksi: hanya junction yang ikut, bukan definisi Label bersama.

<a id="cl-03"></a>
### CL-03 — 2026-08-23 · goal 5.2.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** ox-alpha-free (opencode)
**Bukti:** Freshness check dari disk: row 5.2.1 `⬜️/0`, dependency `5.1` = 5.1.1 `🔎80` (commit d983753, suite 509 hijau). Schema Project DB terverifikasi: 6 tabel entity + 2 junction (`card_milestone_labels`/`card_board_labels`, kolom card_id/label_id/removed_at) + `activities` (entity_type+entity_id) — tanpa ON DELETE CASCADE (panduan Review-CL-03 poin 2).
**Catatan:** Eligibility dihitung JS-side via isPruneEligible (reuse domain murni); set subtree diperluas parent-chain; hapus leaf-to-root SATU transaksi; skip entity yang sudah tercakup ancestor.

<a id="cl-02"></a>
### CL-02 — 2026-08-23 · goal 5.1.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — retention eligibility utility
**Role:** AI-Dev · **Model:** ox-alpha-free (opencode)
**Bukti:** `pnpm exec vitest run` → **84 file / 509 test lulus**, termasuk 7 baru `packages/domain/test/retention.test.ts`: null → false; tepat 30 hari − 1 detik → false; tepat 30 hari → true (boundary inclusive BR-016A); 31 & 100 hari → true (Prinsip #7 job terlambat); baru 1 hari → false; deletedAt invalid → false defensif; deterministik + `RETENTION_DAYS = 30` konstanta publik. `pnpm -r typecheck` Done; `pnpm lint` bersih.
**Catatan:** Fungsi murni tanpa I/O; `now` parameter wajib tanpa default (DoD). Satu iterasi perbaikan test saat Gate B: arah offset helper `daysAgo` awalnya terbalik (kasus −1 detik) — ditemukan sendiri lewat verifikasi mandiri sebelum handoff.

<a id="cl-01"></a>
### CL-01 — 2026-08-23 · goal 5.1.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** ox-alpha-free (opencode)
**Bukti:** Freshness check dari disk: row 5.1.1 `⬜️/—/0`, dependency `—`; seluruh file task dibaca penuh termasuk Prinsip #1–#8 dan panduan Review-CL-03; state repo bersih, Phase 0–4 ✅ tertutup QA. Pola kemurnian fungsi mengikuti `effective-state.ts` (Phase 2).
**Catatan:** Boundary BR-016A inclusive (`deleted_at <= now - 30 hari` → eligible); konstanta `RETENTION_DAYS` diekspor eksplisit; `now` parameter wajib tanpa default.

<a id="review-cl-03"></a>
### Review-CL-03 — 2026-08-23 · audit arsitektur dan kesiapan implementasi Phase 5

**Role:** AI-Planning & Review · **Model:** Gemini 3.1 Pro (Low)

Fase 5 unblocked dan siap dikerjakan oleh AI-Dev. Berdasarkan review SOT dan arsitektur database, berikut adalah catatan panduan implementasi wajib untuk Dev:
1. **Idempotency Deprovisioning Turso (5.3.1)**: Fungsi `deleteDatabase` di `turso.ts` melempar `TursoApiError` (termasuk status 404). Implementasi `pruneEligibleProjects` WAJIB menangkap error 404 (DB sudah hilang) dan tetap melanjutkan ke step penghapusan Global DB agar Project tidak yatim.
2. **Ketiadaan `ON DELETE CASCADE` (5.2.1 & 5.3.1)**: Skema Drizzle pada Global DB dan Project DB tidak dikonfigurasi dengan `.onDelete('cascade')`. Pruning entitas WAJIB menghapus seluruh *child row* secara eksplisit dari bawah ke atas (contoh di Project DB: `activities`, `card_labels`, `cards`, `lists`, `boards`, `milestone_labels`, barulah `milestones`).
3. **Keamanan Cron Endpoint (5.4.1)**: Node.js `crypto.timingSafeEqual(a, b)` akan melempar *exception* jika *length* buffer `a` dan `b` berbeda. Implementasi wajib memvalidasi kesamaan length secara aman (atau langsung return `401`) sebelum memanggil fungsi tersebut untuk mencegah HTTP 500 error.

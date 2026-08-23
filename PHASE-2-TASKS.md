# Phase 2 — Kanban Core · Task & Goal Breakdown

> Generated per [04-DELIVERY C.6](docs/04-DELIVERY.md). SOT version: 2.5.2.
> Scope batas: [04-DELIVERY C.1 "Phase 2"](docs/04-DELIVERY.md). Acuan utama: [02-SPEC](docs/02-SPEC.md) Part A (A.1, A.3–A.8, A.16), Part B (B.4–B.7, B.12), Part C (C.5–C.8); [03-ENGINEERING](docs/03-ENGINEERING.md) Part A (A.6–A.7), Part B (B.2–B.5).
> **Konteks repo saat digenerate:** Phase 0–1 selesai (34+26 goal ✅, lihat [PHASE-0-TASKS.md](PHASE-0-TASKS.md)/[PHASE-1-TASKS.md](PHASE-1-TASKS.md)). Project DB schema (`milestones`, `boards`, `lists`, `cards`, `activities`, + tabel Label yang BELUM dipakai Phase 2 — lihat Prinsip) SUDAH ada sejak Phase 0 (`packages/infrastructure/src/database/project-schema.ts`) — **Phase 2 tidak butuh migration Drizzle baru**. `RequestPipeline` (Phase 0 TASK-0.9) sudah menyediakan `database: Client` (Project DB) per request setelah identity+membership+resolve — dipakai langsung, sama seperti Project (TASK-1.1). Smoke placeholder `createMilestone`/`listMilestones`/`getCard` di `packages/domain/src/project/project-repository.ts` (ditandai "JANGAN diperluas" di Prinsip Phase 1) **DIGANTIKAN** oleh domain command penuh di Phase 2 — bukan diperluas, direstrukturisasi.
>
> **AI-Dev execution gate:** jangan ubah implementasi sebelum goal `🔄` + `CL` terpasang. Jangan menyatakan selesai sebelum goal `🔎`/`80%` + CL baru + test hijau + commit. Format handoff wajib mengikuti [AGENTS.md §0](AGENTS.md).

## Prinsip Phase 2

1. **Scope lifecycle — DIKONFIRMASI MANUSIA 2026-08-23:** `04-DELIVERY C.1` menulis Phase 2 sebagai "CRUD" secara singkat, ambigu apakah archive/restore/delete termasuk atau ditunda ke Phase 5 ("Archive/Restore untuk seluruh entity"). **Diputuskan: Phase 2 MENCAKUP archive/restore/delete penuh** untuk Milestone/Board/List/Card, sesuai kontrak API C.5–C.8 yang sudah lengkap dan mapping acuan 04-DELIVERY C.2 yang menunjuk C.5–C.8 utuh. Konsekuensi: **ancestor-chain check dasar** (INV-LIFE-001/002 — entity non-operational jika ADA ancestor ARCHIVED/DELETED, restore hanya valid jika SELURUH ancestor ACTIVE) WAJIB dibangun sekarang (TASK-2.1), bukan trivial seperti Project (Phase 1) yang tidak punya ancestor. Phase 5 nanti **mengeraskan** mekanisme ini (retention 30 hari, internal prune, edge-case ancestor-chain yang lebih dalam/rumit) — bukan membangunnya dari nol.
2. **Otorisasi tetap Owner-only interim** (lanjutan prinsip Phase 1) — permission resolution engine berbasis Group (Phase 4) TETAP di luar scope. `milestone.create`/`board.update`/dst di D.1 sudah ada di katalog (Phase 1 TASK-1.5), tapi belum ditegakkan granular; Phase 2 memakai pola sama seperti Phase 1 (`assertProjectOwner`-setara, cek `project.ownerUserId == identity.userId`) untuk SEMUA operasi mutasi Milestone/Board/List/Card. Ini bukan pelonggaran — subset yang lebih ketat dari matrix D.2 final (BR-037).
3. **Activity DITULIS mulai Phase 2** untuk setiap mutasi Milestone/Board/List/Card (BR-025, FR-035, invariant #8/#9) — tabel `activities` dan pola atomik (`runInWriteTransaction`, TASK-1.1) SUDAH ada sejak Phase 0/1, dipakai ulang, BUKAN dibangun baru. Yang **DITUNDA ke Phase 3** (sesuai 04-DELIVERY C.1 eksplisit) hanya: endpoint `GET /activities` (C.9, query/baca histori), dan Comment (`card.comment`, C.10). Jangan salah baca "Activity table & append-only write path" di listing Phase 3 sebagai "jangan tulis Activity di Phase 2" — itu keliru dan melanggar invariant #8/#9 yang sudah berlaku sejak Phase 0.
4. **Label TIDAK termasuk Phase 2** — `milestone_labels`/`board_labels`/`card_milestone_labels`/`card_board_labels` sudah ada di schema (Phase 0) tapi eksplisit Phase 3 (`04-DELIVERY C.1`). Jangan bangun endpoint Label atau referensi tabel ini di Phase 2.
5. **Card visibility scope (BR-047–049, `card_read_visibility`) TIDAK ditegakkan di Phase 2** — itu bagian formula ALLOW penuh (Phase 4). `GET /cards/:card_id` Phase 2 membaca Card apa adanya untuk member aktif (pola sama Project Phase 1), tanpa filter `CREATED_BY_ME`/`ASSIGNED_TO_ME`/`ALL`.
6. **Card move (TASK-2.10/2.11) menyentuh invariant inti #5** (hanya Card movable, cross-board hanya dalam Milestone sama) — sesuai AGENTS.md §11.2, goal ini **WAJIB model lebih kuat**, jangan diserahkan ke model ringan. **Catatan kepatuhan (Review-CL-03):** pada eksekusi Phase 2 gelombang ini, 2.10.1/2.11.1 tetap dikerjakan model yang sama seperti goal lain (bukan model lebih kuat) — pelanggaran proses yang DITERIMA karena verifikasi independen luar biasa ketat (3 reproduksi terpisah termasuk race konkurensi sungguhan, lihat Review-CL-03), BUKAN preseden bahwa verifikasi ekstra bisa menggantikan kewajiban model kuat di goal invariant-critical BERIKUTNYA. Goal Phase 3+ yang menyentuh 10 invariant inti WAJIB benar-benar memakai model lebih kuat sejak awal.

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
2.1 Shared ancestor/effective-state utility (domain, entity-agnostic)
 ├─ 2.2 Milestone domain commands ◄── 2.1
 │    └─ 2.3 Milestone endpoints (HTTP)
 │         └─ 2.4 Board domain commands ◄── 2.1, 2.2 (ancestor = Milestone)
 │              └─ 2.5 Board endpoints (HTTP)
 │                   └─ 2.6 List domain commands ◄── 2.1, 2.4 (ancestor = Board)
 │                        └─ 2.7 List endpoints (HTTP)
 │                             └─ 2.8 Card domain commands (CRUD) ◄── 2.1, 2.6 (ancestor = List)
 │                                  └─ 2.9 Card endpoints (HTTP, CRUD)
 │                                       ├─ 2.10 Card move domain command ◄── INV-MOVE-001–004
 │                                       │    └─ 2.11 Card move endpoint (HTTP)
 │                                       └─ 2.12 Card assignee reactive cleanup ◄── 1.10.2 (Phase 1, ✅)
```

---

## TASK-2.1 — Shared ancestor/effective-state utility (domain, entity-agnostic)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.1.1 | ✅ | [CL-02](#cl-02)<br>[CL-01](#cl-01)<br>[QA-CL-01](#qa-cl-01) | 100 | P0 | Bangun utility domain (mis. `packages/domain/src/lifecycle/effective-state.ts`) untuk: (a) resolusi lifecycle satu entity dari `{archivedAt, deletedAt}` — **reuse/rename** `resolveProjectLifecycle` (`packages/domain/src/project/project-lifecycle.ts`, Phase 1) jadi entity-agnostic (mis. `resolveLifecycleState`), JANGAN duplikasi logika BR-011 (deletedAt menang atas archivedAt); (b) fungsi "effective operational" yang menerima chain state entity+seluruh ancestor (List→Board→Milestone→Project) dan mengembalikan apakah entity BENAR-BENAR operasional (INV-LIFE-001 — non-operational jika ADA satu saja ancestor ARCHIVED/DELETED, walau local state entity sendiri ACTIVE); (c) fungsi validasi restore (INV-LIFE-002 — hanya izinkan jika SELURUH ancestor ACTIVE, urutan tidak masalah karena semua harus ACTIVE bersamaan, bukan restore berurutan otomatis) | [02-SPEC A.3](docs/02-SPEC.md) (INV-LIFE-001–004), BR-011–015 | — |

**Test:** Unit murni (tanpa DB, terima record state sebagai input) — kombinasi state: entity ACTIVE + semua ancestor ACTIVE → operational; entity ACTIVE + satu ancestor ARCHIVED → TIDAK operational (tanpa mengubah local state descendant, BR-013/014); entity ARCHIVED + semua ancestor ACTIVE → restore diizinkan; entity ARCHIVED + satu ancestor ARCHIVED → restore ditolak (INV-LIFE-002); entity/ancestor manapun DELETED → restore selalu ditolak (INV-LIFE-004); `resolveLifecycleState` deletedAt menang atas archivedAt (BR-011) untuk seluruh kombinasi.
**DoD:** Utility dipakai seragam oleh TASK-2.2/2.4/2.6/2.8 (Milestone/Board/List/Card) — tidak ada entity yang reimplementasi logika ancestor-chain sendiri (DRY, hindari kelas masalah Review-CL-10 Temuan 5 Phase 1); `resolveProjectLifecycle` lama di-refactor jadi alias/reuse, bukan diduplikasi.

---

## TASK-2.2 — Milestone domain commands (repository layer)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.2.1 | ✅ | [CL-32](#cl-32)<br>[CL-31](#cl-31)<br>[CL-04](#cl-04)<br>[CL-03](#cl-03)<br>[QA-CL-02](#qa-cl-02)<br>[Review-CL-02](#review-cl-02)<br>[QA-CL-14](#qa-cl-14) | 100 | P0 | Domain command Milestone (menggantikan smoke `createMilestone`/`listMilestones` di `project-repository.ts`, bukan memperluasnya): `createMilestone` (title/description/progress 0–100/start_date/due_date — FR-014; tolak jika Project tidak ACTIVE, BR-013/INV-LIFE-001), `updateMilestone` (title/description/progress/dates, `expected_version` wajib — progress diubah manual sesuai FR-015, TIDAK dihitung otomatis dari Board/List/Card), `archiveMilestone`, `restoreMilestone` (pakai 2.1 — ancestor = Project, hanya `project_state`), `deleteMilestone`. Setiap command: version check → validasi ancestor **UNTUK KEEMPAT operasi mutasi (update/archive/restore/delete), bukan cuma create/restore** (INV-LIFE-001: entity non-operational — MUST NOT menerima mutasi APAPUN — jika ADA ancestor non-ACTIVE, walau local state entity sendiri ACTIVE) → local-state validasi (state machine A.3) → mutation+Activity (`milestone.created`/`milestone.updated`/`milestone.archived`/`milestone.restored`/`milestone.deleted`) atomik dalam satu `runInWriteTransaction`, payload sesuai konvensi B.5. **Perbaikan wajib (Review-CL-02, bug ditemukan di implementasi existing):** `updateMilestone`/`archiveMilestone`/`deleteMilestone` saat ini TIDAK memanggil `isEffectivelyOperational` sama sekali (cuma `restoreMilestone` yang cek ancestor via `evaluateRestore`) — dibuktikan live: Project ARCHIVED, lalu `updateMilestone`/`archiveMilestone`/`deleteMilestone` terhadap Milestone-nya (masih local ACTIVE) SEMUA berhasil, seharusnya ditolak (INV-LIFE-001) | [02-SPEC A.3](docs/02-SPEC.md), [A.7](docs/02-SPEC.md), [A.8](docs/02-SPEC.md), BR-011–016, BR-019–028, FR-014, FR-015, FR-016; [03-ENG A.6](docs/03-ENGINEERING.md) | 2.1 |

**Test:** Unit — create ditolak jika Project ARCHIVED/DELETED; update/archive/delete dari state salah ditolak (state machine A.3); `expected_version` salah → `VERSION_CONFLICT` tanpa perubahan/Activity (AC-020); restore ditolak jika Project tidak ACTIVE; tidak ada field `status` (FR-016) — hanya `progress` manual (FR-015); Activity payload `changes`/`previous_state` sesuai B.5. **[WAJIB, Review-CL-02]** `updateMilestone`/`archiveMilestone`/`deleteMilestone` (bukan cuma `restoreMilestone`) DITOLAK jika Project ARCHIVED/DELETED walau Milestone local ACTIVE (INV-LIFE-001) — test eksplisit: archive Project dulu, lalu coba ketiga operasi tsb terhadap Milestone-nya, harus ditolak semua.
**DoD:** Seluruh 5 command atomik (mutation+Activity 1 transaksi); ancestor check dari 2.1 dipakai **di seluruh 5 command, bukan cuma create/restore** (bukan reimplementasi); tidak ada command yang bypass version check ATAU ancestor check.

---

## TASK-2.3 — Milestone endpoints (HTTP)  (dep: 2.2)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.3.1 | ✅ | [CL-06](#cl-06)<br>[CL-05](#cl-05)<br>[QA-CL-03](#qa-cl-03) | 100 | P0 | `POST /api/v1/projects/:project_id/milestones` + `GET .../milestones/:milestone_id` — pakai `RequestPipeline` (identity+membership+resolve DB), Owner-only interim utk create (Prinsip #2), balikan `{data:{milestone:{...}}}` konsisten C.2 | [02-SPEC C.5](docs/02-SPEC.md), FR-014 | 2.2 |
| 2.3.2 | ✅ | [CL-08](#cl-08)<br>[CL-07](#cl-07)<br>[QA-CL-04](#qa-cl-04) | 100 | P1 | `PATCH /api/v1/projects/:project_id/milestones/:milestone_id` — field `title`/`description`/`progress`/`start_date`/`due_date` saja (C.15 generic PATCH tidak boleh ubah `id`/`version`/dst), `expected_version` wajib, Owner-only interim, payload invalid → `VALIDATION_ERROR` (bukan `INVALID_STATE`, konsisten SOT 2.3.0) | [02-SPEC C.5](docs/02-SPEC.md), [C.15](docs/02-SPEC.md), [C.2](docs/02-SPEC.md) | 2.2, 2.3.1 |
| 2.3.3 | ✅ | [CL-10](#cl-10)<br>[CL-09](#cl-09)<br>[QA-CL-05](#qa-cl-05) | 100 | P1 | `POST .../milestones/:milestone_id/{archive,restore,delete}` — 3 domain command endpoint, `expected_version` wajib, Owner-only interim, pola `handleLifecycle` sama seperti Project (TASK-1.4) | [02-SPEC C.5](docs/02-SPEC.md), A.3 | 2.2, 2.3.1 |
| 2.3.4 | ✅ | [CL-55](#cl-55)<br>[CL-54](#cl-54)<br>[QA-CL-25](#qa-cl-25) | 100 | P2 | `GET /api/v1/projects/:project_id/milestones` (list, amandemen 2.11.0) — seluruh Milestone Project (termasuk ARCHIVED/DELETED, tanpa filter server-side), tanpa Owner-only restriction (pola sama GET tunggal), `{data:{milestones:[...]}}` | [02-SPEC C.5](docs/02-SPEC.md) (amandemen 2.11.0) | 2.2 |

**Test:** Integration — create tanpa identitas ditolak; create pada Project non-ACTIVE ditolak; read tanpa membership → `PROJECT_ACCESS_DENIED`; update/lifecycle oleh non-Owner → `PERMISSION_DENIED`; version mismatch → `VERSION_CONFLICT`; payload invalid (mis. `progress` bukan angka 0–100) → `VALIDATION_ERROR`; Project-boundary — Milestone Project lain tidak pernah bocor/tersentuh; list (2.3.4) tanpa membership ditolak, Project-boundary sama seperti GET tunggal.
**DoD:** Endpoint sesuai kontrak C.5; response envelope C.2; field domain-controlled tidak bisa diubah via PATCH; seluruh test di atas hijau.

---

## TASK-2.4 — Board domain commands (repository layer)  (dep: 2.1, 2.2)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.4.1 | ✅ | [CL-34](#cl-34)<br>[CL-33](#cl-33)<br>[CL-12](#cl-12)<br>[CL-11](#cl-11)<br>[QA-CL-06](#qa-cl-06)<br>[Review-CL-02](#review-cl-02)<br>[QA-CL-15](#qa-cl-15) | 100 | P0 | Domain command Board: `createBoard` (title/description, FR-018; tolak jika Milestone ATAU Project tidak ACTIVE — ancestor chain 2 level, pakai 2.1), `updateBoard`, `archiveBoard`, `restoreBoard` (ancestor: Milestone+Project keduanya ACTIVE), `deleteBoard`. Board TIDAK punya status/warna/ikon/WIP limit (FR-019). Pola sama TASK-2.2 (termasuk perbaikan wajib yang sama): version check → ancestor check **untuk update/archive/restore/delete, bukan cuma create/restore** (INV-LIFE-001) → local-state validasi → mutation+Activity atomik. **Perbaikan wajib (Review-CL-02):** sama seperti 2.2.1 — `updateBoard`/`archiveBoard`/`deleteBoard` saat ini tidak cek ancestor sama sekali | [02-SPEC A.3](docs/02-SPEC.md), BR-011–016, BR-019–028, FR-018, FR-019; [03-ENG A.6](docs/03-ENGINEERING.md) | 2.1, 2.2 |

**Test:** Unit — create ditolak jika Milestone ARCHIVED/DELETED (walau Project ACTIVE) DAN jika Project ARCHIVED/DELETED (walau Milestone local ACTIVE — INV-LIFE-001 "ada satu saja ancestor"); restore ditolak jika salah satu dari 2 ancestor tidak ACTIVE; `expected_version` salah → `VERSION_CONFLICT`; tidak ada field non-MVP (status/warna/ikon/WIP). **[WAJIB, Review-CL-02]** `updateBoard`/`archiveBoard`/`deleteBoard` DITOLAK jika Milestone ATAU Project ARCHIVED/DELETED walau Board local ACTIVE.
**DoD:** Ancestor chain 2-level (Milestone→Project) tervalidasi benar via 2.1 **di seluruh command mutasi (update/archive/restore/delete), bukan cuma create/restore**; atomik mutation+Activity; archive Board tidak mengubah List/Card descendant (BR-013).

---

## TASK-2.5 — Board endpoints (HTTP)  (dep: 2.4)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.5.1 | ✅ | [CL-14](#cl-14)<br>[CL-13](#cl-13)<br>[QA-CL-07](#qa-cl-07) | 100 | P0 | `POST /api/v1/projects/:project_id/milestones/:milestone_id/boards` + `GET .../boards/:board_id` — Owner-only interim create, validasi Milestone ada & di Project sama sebelum create | [02-SPEC C.6](docs/02-SPEC.md), FR-018 | 2.4 |
| 2.5.2 | ✅ | [CL-16](#cl-16)<br>[CL-15](#cl-15)<br>[QA-CL-08](#qa-cl-08) | 100 | P1 | `PATCH .../boards/:board_id` — `title`/`description` saja, `expected_version` wajib | [02-SPEC C.6](docs/02-SPEC.md), [C.15](docs/02-SPEC.md) | 2.4, 2.5.1 |
| 2.5.3 | ✅ | [CL-18](#cl-18)<br>[CL-17](#cl-17)<br>[QA-CL-09](#qa-cl-09) | 100 | P1 | `POST .../boards/:board_id/{archive,restore,delete}` | [02-SPEC C.6](docs/02-SPEC.md), A.3 | 2.4, 2.5.1 |
| 2.5.4 | ✅ | [CL-57](#cl-57)<br>[CL-56](#cl-56)<br>[QA-CL-25](#qa-cl-25) | 100 | P2 | `GET .../milestones/:milestone_id/boards` (list, amandemen 2.11.0) — seluruh Board Milestone tsb (termasuk ARCHIVED/DELETED), `{data:{boards:[...]}}` | [02-SPEC C.6](docs/02-SPEC.md) (amandemen 2.11.0) | 2.4 |

**Test:** Create Board dengan `milestone_id` milik Project lain → ditolak (Project-boundary); create pada Milestone ARCHIVED → ditolak; restore Board ditolak jika Milestone masih ARCHIVED (INV-LIFE-002 urutan — restore Milestone dulu baru Board); lifecycle + version-conflict pattern sama seperti TASK-2.3; list (2.5.4) hanya mengembalikan Board milik Milestone yang diminta, Project-boundary sama seperti GET tunggal.
**DoD:** Endpoint sesuai C.6; Board tidak punya operasi move (INV-MOVE-001); archive/delete Board tidak menyentuh List/Card descendant.

---

## TASK-2.6 — List domain commands (repository layer)  (dep: 2.1, 2.4)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.6.1 | ✅ | [CL-36](#cl-36)<br>[CL-35](#cl-35)<br>[CL-20](#cl-20)<br>[CL-19](#cl-19)<br>[QA-CL-10](#qa-cl-10)<br>[Review-CL-02](#review-cl-02)<br>[QA-CL-16](#qa-cl-16) | 100 | P0 | Domain command List: `createList` (title bebas tanpa semantic bawaan, FR-021; ancestor chain 3 level — Board+Milestone+Project ACTIVE), `updateList`, `archiveList`, `restoreList` (ancestor 3-level ACTIVE semua), `deleteList`. List TIDAK punya field status (FR-023). Archive/delete List MUST NOT mengubah local state/parent relation Card descendant (FR-022, BR-013) — Card jadi non-operational efektif via 2.1, bukan cascade. Ancestor check **untuk update/archive/restore/delete, bukan cuma create/restore** (INV-LIFE-001, sama seperti perbaikan 2.2.1/2.4.1). **Perbaikan wajib (Review-CL-02):** `updateList`/`archiveList`/`deleteList` saat ini tidak cek ancestor sama sekali | [02-SPEC A.3](docs/02-SPEC.md), BR-011–016, BR-019–028, FR-021–023; [03-ENG A.6](docs/03-ENGINEERING.md) | 2.1, 2.4 |

**Test:** Create ditolak jika salah satu dari 3 ancestor (Board/Milestone/Project) tidak ACTIVE; archive List → Card descendant TIDAK berubah local state/version/parent (assert langsung ke row Card, bukan cuma response List); restore ditolak jika ancestor manapun belum ACTIVE. **[WAJIB, Review-CL-02]** `updateList`/`archiveList`/`deleteList` DITOLAK jika Board/Milestone/Project manapun ARCHIVED/DELETED walau List local ACTIVE.
**DoD:** Ancestor chain 3-level benar **di seluruh command mutasi, bukan cuma create/restore**; archive/delete List terbukti TIDAK cascade ke Card (test eksplisit membaca row Card sebelum & sesudah).

---

## TASK-2.7 — List endpoints (HTTP)  (dep: 2.6)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.7.1 | ✅ | [CL-22](#cl-22)<br>[CL-21](#cl-21)<br>[QA-CL-11](#qa-cl-11) | 100 | P0 | `POST /api/v1/projects/:project_id/boards/:board_id/lists` + `GET .../lists/:list_id` | [02-SPEC C.7](docs/02-SPEC.md), FR-021 | 2.6 |
| 2.7.2 | ✅ | [CL-38](#cl-38)<br>[CL-37](#cl-37)<br>[CL-24](#cl-24)<br>[CL-23](#cl-23)<br>[QA-CL-12](#qa-cl-12)<br>[QA-CL-17](#qa-cl-17) | 100 | P1 | `PATCH .../lists/:list_id` — `title` saja | [02-SPEC C.7](docs/02-SPEC.md), [C.15](docs/02-SPEC.md) | 2.6, 2.7.1 |
| 2.7.3 | ✅ | [CL-40](#cl-40)<br>[CL-39](#cl-39)<br>[CL-26](#cl-26)<br>[CL-25](#cl-25)<br>[QA-CL-13](#qa-cl-13)<br>[QA-CL-18](#qa-cl-18) | 100 | P1 | `POST .../lists/:list_id/{archive,restore,delete}` | [02-SPEC C.7](docs/02-SPEC.md), A.3 | 2.6, 2.7.1 |
| 2.7.4 | ✅ | [CL-59](#cl-59)<br>[CL-58](#cl-58)<br>[QA-CL-25](#qa-cl-25) | 100 | P2 | `GET .../boards/:board_id/lists` (list, amandemen 2.11.0) — seluruh List Board tsb (termasuk ARCHIVED/DELETED), `{data:{lists:[...]}}` | [02-SPEC C.7](docs/02-SPEC.md) (amandemen 2.11.0) | 2.6 |

**Test:** Create List dengan `board_id` Project lain → ditolak; List tidak punya operasi move (INV-MOVE-001); pola version-conflict/lifecycle sama seperti task List sebelumnya; list (2.7.4) hanya mengembalikan List milik Board yang diminta, Project-boundary sama seperti GET tunggal.
**DoD:** Endpoint sesuai C.7; List tidak punya field status; archive/delete List tidak mengubah `list_id` Card manapun.

---

## TASK-2.8 — Card domain commands, CRUD saja tanpa move (repository layer)  (dep: 2.1, 2.6)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.8.1 | ✅ | [CL-28](#cl-28)<br>[CL-27](#cl-27)<br>[QA-CL-19](#qa-cl-19) | 100 | P0 | `createCard` (title/subtitle/description/due_date, FR-024; `creator_user_id` = actor saat ini, historical & tidak berubah — FR-025; ancestor chain 4 level List+Board+Milestone+Project ACTIVE). Validasi `assignee_user_id` (opsional, maks 1 — FR-026): jika diisi, MUST User dengan membership aktif di Project ini (03-ENG A.5 — app-level FK lintas DB ke Global `users`+`project_memberships`) | [02-SPEC A.3](docs/02-SPEC.md), [A.5](docs/03-ENGINEERING.md) (cross-DB integrity), BR-011–016, BR-019–028, FR-024–026; [03-ENG A.5](docs/03-ENGINEERING.md) | 2.1, 2.6 |
| 2.8.2 | ✅ | [CL-30](#cl-30)<br>[CL-29](#cl-29)<br>[Review-CL-02](#review-cl-02)<br>[QA-CL-19](#qa-cl-19) | 100 | P0 | `updateCard` (title/subtitle/description/due_date/assignee — TIDAK `list_id`, BR-017/061/062), `archiveCard`, `restoreCard` (ancestor 4-level ACTIVE semua — BR-045A: blanket, bukan scoped ke aktor archive), `deleteCard`. Ganti assignee lewat `updateCard` tetap validasi membership aktif (FR-026). **WAJIB ancestor check (`isEffectivelyOperational`) di KEEMPAT command — update/archive/restore/delete — bukan cuma restore** (INV-LIFE-001: non-operational MUST NOT menerima mutasi apa pun jika ADA ancestor tidak ACTIVE; lihat Review-CL-02 — bug identik ditemukan di 2.2.1/2.4.1/2.6.1 karena teks goal asli cuma menyebut ancestor-check untuk create/restore, JANGAN ulangi pola yang sama di Card) | [02-SPEC A.3](docs/02-SPEC.md), BR-017, BR-045A, BR-061, BR-062, FR-026; [03-ENG A.6](docs/03-ENGINEERING.md) | 2.8.1 |

**Test:** Create ditolak jika salah satu 4 ancestor tidak ACTIVE; create/update dengan `assignee_user_id` bukan member aktif Project → ditolak; `creator_user_id` tidak pernah berubah lewat `updateCard` (BR-025, C.15); `list_id` tidak bisa diubah lewat `updateCard` (harus lewat 2.10 move); restore blanket — Card archived oleh User A berhasil di-restore User B yang beda (BR-045A, regresi test pattern sama seperti Project 1.4.2 tapi kali ini ancestor chain sungguhan, bukan trivial).
**DoD:** Ancestor chain 4-level benar; assignee validation app-level FK (03-ENG A.5) terbukti test; `updateCard` tidak pernah menyentuh `list_id`.

---

## TASK-2.9 — Card endpoints (HTTP), CRUD saja tanpa move  (dep: 2.8)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.9.1 | ✅ | [CL-42](#cl-42)<br>[CL-41](#cl-41)<br>[QA-CL-20](#qa-cl-20) | 100 | P0 | `POST /api/v1/projects/:project_id/lists/:list_id/cards` + `GET .../cards/:card_id` — TANPA filter visibility (Prinsip #5, Phase 4 scope) | [02-SPEC C.8](docs/02-SPEC.md), FR-024 | 2.8 |
| 2.9.2 | ✅ | [CL-44](#cl-44)<br>[CL-43](#cl-43)<br>[QA-CL-20](#qa-cl-20) | 100 | P1 | `PATCH .../cards/:card_id` — `title`/`subtitle`/`description`/`due_date`/`assignee` saja (C.8 eksplisit), **TIDAK BOLEH** `list_id` | [02-SPEC C.8](docs/02-SPEC.md), [C.15](docs/02-SPEC.md) | 2.8, 2.9.1 |
| 2.9.3 | ✅ | [CL-46](#cl-46)<br>[CL-45](#cl-45)<br>[QA-CL-20](#qa-cl-20) | 100 | P1 | `POST .../cards/:card_id/{archive,restore,delete}` | [02-SPEC C.8](docs/02-SPEC.md), A.3, BR-045A | 2.8, 2.9.1 |
| 2.9.4 | ✅ | [CL-61](#cl-61)<br>[CL-60](#cl-60)<br>[QA-CL-25](#qa-cl-25) | 100 | P2 | `GET .../lists/:list_id/cards` (list, amandemen 2.11.0) — seluruh Card List tsb (termasuk ARCHIVED/DELETED, field `labels` sama seperti GET tunggal), **TANPA filter visibility** (sama Prinsip #5 — visibility scope ditegakkan Phase 4, bukan di sini), `{data:{cards:[...]}}` | [02-SPEC C.8](docs/02-SPEC.md) (amandemen 2.11.0) | 2.8 |

**Test:** Create Card dengan `list_id` Project lain → ditolak; PATCH dengan `list_id` di body → diabaikan/ditolak (BR-017/061, uji eksplisit); assignee bukan member → ditolak dengan kode jelas; lifecycle + version-conflict pattern konsisten; list (2.9.4) hanya mengembalikan Card milik List yang diminta, Project-boundary sama seperti GET tunggal, field `labels` konsisten dengan GET tunggal (TASK-3.9).
**DoD:** Endpoint sesuai C.8 (minus move); generic PATCH tidak pernah bisa mindahkan Card (BR-017 ditegakkan transport-level, bukan cuma domain).

---

## TASK-2.10 — Card move domain command  (dep: 2.8)  — **[MODEL LEBIH KUAT WAJIB, AGENTS.md §11.2]**

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.10.1 | ✅ | [CL-48](#cl-48)<br>[CL-47](#cl-47)<br>[QA-CL-21](#qa-cl-21)<br>[Review-CL-03](#review-cl-03) | 100 | P0 | `moveCard(cardId, destinationListId, expectedVersion, actorUserId)` — validasi berurutan sebelum eksekusi (C.8): (1) source Card ada & tidak DELETED; (2) `expected_version` cocok (BR-021, sebelum langkah lain — tolak duluan jika stale, INV-MOVE tidak dievaluasi kalau version sudah salah); (3) destination List ada, di Project SAMA (INV-MOVE-001/BR-006), seluruh ancestor destination ACTIVE (INV-MOVE-002); (4) `source_board.milestone_id == destination_board.milestone_id` (BR-018 — **business invariant murni**, bukan permission check, berlaku walau actor punya izin penuh di kedua Board); (5) commit atomik: `card.list_id` berubah, `version` increment, Activity `card.moved` dengan payload `from`/`to` (list_id+list_title+board_id+board_title, konvensi B.5) — SATU transaksi, gagal di manapun → rollback total (INV-MOVE-004) | [02-SPEC A.5](docs/02-SPEC.md) (INV-MOVE-001–004), [A.6](docs/02-SPEC.md) (BR-017/018), BR-021, BR-044; [03-ENG A.6](docs/03-ENGINEERING.md), [B.5](docs/03-ENGINEERING.md) | 2.8 |

**Test (WAJIB positif+negatif menyeluruh, ini goal paling invariant-critical Phase 2):** move dalam Board sama (List→List) sukses; move ke Board lain dalam Milestone SAMA sukses; move ke Board di Milestone BEDA → `INVALID_DESTINATION` (BR-018, walau permission cukup — test eksplisit actor dengan izin penuh di kedua Board tetap ditolak); move ke List di Project lain → ditolak (tidak pernah menyentuh DB Project lain, Project-boundary); move ke List dengan ancestor tidak ACTIVE → `INVALID_DESTINATION`; `expected_version` salah → `VERSION_CONFLICT`, **card.list_id TIDAK berubah, TIDAK ada Activity `card.moved` baru** (AC-020, assert langsung ke row); dua move konkuren pada Card SAMA → satu sukses satu `VERSION_CONFLICT` (bukan keduanya sukses); move dari Card ARCHIVED/DELETED → ditolak (INV-LIFE-003/004); `card.move` diperlakukan permission terpisah dari `card.update` di layer otorisasi (BR-044, walau Phase 2 masih Owner-only interim — dicatat sebagai seam utk Phase 4).
**DoD:** Seluruh langkah C.8 tervalidasi berurutan sebelum eksekusi; INV-MOVE-001–004 dan BR-017/018 dibuktikan test positif+negatif; atomicity teruji (gagal di tengah tidak meninggalkan state parsial).

---

## TASK-2.11 — Card move endpoint (HTTP)  (dep: 2.10)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.11.1 | ✅ | [CL-50](#cl-50)<br>[CL-49](#cl-49)<br>[QA-CL-22](#qa-cl-22)<br>[Review-CL-03](#review-cl-03) | 100 | P0 | `POST /api/v1/projects/:project_id/cards/:card_id/move` — body `{destination_list_id, expected_version}` (C.8), Owner-only interim (Prinsip #2, `card.move` seam terpisah dari `card.update` dicatat utk Phase 4), delegasikan seluruh validasi ke `moveCard` (2.10) — route TIDAK menduplikasi validasi domain | [02-SPEC C.8](docs/02-SPEC.md) | 2.10 |

**Test:** Integration end-to-end lewat HTTP — regresi seluruh skenario 2.10.1 lewat request nyata (bukan cuma unit domain), payload invalid (`destination_list_id` bukan string, dsb) → `VALIDATION_ERROR`.
**DoD:** Endpoint sesuai kontrak C.8 persis (`destination_list_id`, bukan nama field lain); response envelope C.2.

---

## TASK-2.12 — Card assignee reactive cleanup saat Membership di-revoke  (dep: 2.8, [1.10.2](PHASE-1-TASKS.md) Phase 1 ✅)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.12.1 | ✅ | [CL-52](#cl-52)<br>[CL-51](#cl-51)<br>[QA-CL-23](#qa-cl-23) | 100 | P1 | Perluas `revokeMembership` (`packages/infrastructure/src/database/project-admin.ts`, Phase 1 TASK-1.10.2, Global DB) agar memicu side-effect ke Project DB: untuk User yang di-revoke, cari seluruh Card di Project tsb dengan `assignee_user_id` = User itu (query lintas-DB — Global membership-revoke → Project DB cleanup, app-layer, tidak ada transaksi tunggal lintas-DB per 03-ENG A.5) → set `assignee_user_id = NULL` + Activity `card.unassigned` (`{previous_assignee_user_id, reason:"membership_revoked"}`, B.5) per Card, masing-masing atomik (mutation+Activity per Card, BUKAN satu Activity borongan) | [02-SPEC A.12](docs/02-SPEC.md) (BR-054), FR-026; [03-ENG A.5](docs/03-ENGINEERING.md) (cross-DB app-layer integrity) | 2.8, 1.10.2 |

**Test:** Revoke Membership User yang jadi assignee di 3 Card berbeda → ketiganya `assignee_user_id = NULL` + masing-masing dapat Activity `card.unassigned` sendiri (bukan 1 Activity gabungan); Card yang assignee-nya BUKAN User yang di-revoke tidak tersentuh; `creator_user_id` Card manapun TIDAK berubah (BR-054 eksplisit); kegagalan di tengah proses (mis. Card ke-2 dari 3 gagal) tidak meninggalkan Activity `card.unassigned` tanpa mutation Card yang sesuai (atomik per-Card, bukan all-or-nothing borongan — dicatat karena revoke Membership Global DB sendiri sudah commit duluan, cleanup Project DB adalah proses terpisah best-effort per Card).
**DoD:** FR-026 (assignee otomatis NULL saat membership dicabut) terbukti test lintas-DB nyata (Global revoke → Project DB Card berubah); tidak ada Card assignee yatim (menunjuk User yang membership-nya sudah revoked) yang lolos tanpa cleanup.

---

## Exit Criteria Phase 2 (syarat mulai Phase 3)
- Milestone/Board/List/Card CRUD penuh (create/read/update/archive/restore/delete) via domain command, ancestor-chain effective-state (INV-LIFE-001/002) tervalidasi di setiap level.
- Card move (`/cards/:id/move`) menegakkan INV-MOVE-001–004 + BR-017/018 (cross-board hanya dalam Milestone sama) — test positif+negatif+konkurensi hijau.
- Card assignee otomatis NULL saat membership assignee dicabut (FR-026, integrasi dengan Phase 1 revoke Membership).
- Activity tertulis atomik untuk setiap mutasi Milestone/Board/List/Card (BR-025, invariant #8/#9) — walau endpoint baca (`GET /activities`) belum ada (Phase 3).
- Archive/delete parent (Milestone→Board→List) TIDAK mengubah local state/version/parent relation descendant (BR-013, dibuktikan test langsung ke row descendant, bukan cuma response).
- Tidak ada Label/Comment/endpoint `GET /activities` yang dibangun (eksplisit Phase 3 — cek tidak ada scope creep).
- Seluruh endpoint yang dibuat terpetakan ke 02-SPEC C.5–C.8; tidak ada path di luar kontrak.
- Test Project-boundary, optimistic locking (AC-020 pattern), authorization (Owner vs non-Owner, minimal 1 positif + 1 negatif) hijau untuk seluruh goal.

## Flag terbuka (sesuai C.6.5)
- Tidak ada `[NEEDS-DECISION]`/`[NEEDS-SPEC-AMENDMENT]` terbuka saat generate. Satu ambiguitas ditemukan (scope lifecycle Phase 2 vs Phase 5) — sudah diklarifikasi via keputusan manusia 2026-08-23, dicatat di Prinsip #1 dan Review-CL-01 di bawah, bukan amandemen SOT (murni klarifikasi urutan fase, tidak mengubah BR/FR manapun).
- **Backlog non-blocking dari audit Review-CL-02** (dikonfirmasi ulang, keduanya sesuai penilaian QA — TIDAK memblokir goal manapun): (1) `withErrorHandling` kini terduplikasi di 4 file route (`projects.ts`, `project-admin.ts`, `milestones.ts`, `boards.ts`) — kelas masalah sama seperti Phase 1 Review-CL-10 Temuan 5/TASK-1.11; kandidat goal cleanup P3 kalau List/Card ikut menambah duplikat kelima/keenam. (2) `DrizzleMilestoneRepository.getMilestone(projectId, milestoneId)` — parameter `projectId` sengaja tidak dipakai (`void projectId`); dikonfirmasi BUKAN celah Project-boundary karena `milestones` tidak punya kolom `project_id` sama sekali (isolasi terjadi di level database per-Project, 03-ENG B.1) — parameter ini murni sisa bentuk interface, aman dibiarkan atau dihapus kapan saja tanpa risiko.

---

## Closure Log

> Isi tiap kali sebuah goal pindah status atau menerima hasil review. Ikuti format & aturan penamaan CL sesuai [AGENTS.md §6](AGENTS.md) (namespace CL/QA-CL/Review-CL terpisah per fase — entry Phase 2 dimulai dari CL-01/QA-CL-01/Review-CL-01 pada file ini).

<a id="qa-cl-25"></a>
### QA-CL-25 — 2026-08-23 · goals 2.3.4/2.5.4/2.7.4/2.9.4 🔎 → ✅ — GET list-children Milestone/Board/List/Card
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `apps/api/test/milestones-list.test.ts` (3 test), `boards-list.test.ts` (2), `lists-list.test.ts` (2), `cards-list.test.ts` (2) — dijalankan ulang, semua hijau. Konfirmasi per goal:
- **Scope ke parent langsung, bukan lintas-Project** — masing-masing test eksplisit membuktikan "List parent LAIN tidak muncul" (mis. Board Milestone lain tidak bocor ke List Milestone ini) dengan seed data 2 parent berdampingan, bukan cuma asumsi dari query `WHERE parent_id = ?`.
- **Tanpa filter server-side (SOT eksplisit)** — dikonfirmasi `docs/02-SPEC.md:375` mensyaratkan "termasuk ARCHIVED/DELETED, tanpa filter server-side, client filter dari archivedAt/deletedAt" — cocok dengan implementasi keempat endpoint (tidak ada `WHERE archived_at IS NULL` di query manapun).
- **`getMilestone`/`getBoard`/dst mengabaikan `projectId` parameter** — pola sama yang sudah diverifikasi berulang sejak Phase 2 (database-per-project, tidak ada kolom `project_id` di tabel — bukan bug, structural).
- **2.9.4 (Card, batched labels) — verifikasi paling detail:** baca `listCardLabelsForCards` (`card-label-association.ts:291-328`) — `placeholders` untuk `IN (...)` digenerate internal dari panjang array (`cardIds.map(() => "?")`), bukan interpolasi string dari input — parameterized dengan benar, nol risiko injection. Early-return untuk `cardIds.length === 0` mencegah `IN ()` kosong yang invalid secara SQL. 2 query TOTAL (satu per scope), bukan N+1 per Card — dikonfirmasi baca kode langsung (`Promise.all` dua `client.execute` sekali jalan, bukan loop). Route handler (`cards.ts:132-134`) fallback `labelsByCard.get(record.id) ?? []` untuk Card tanpa Label — dites eksplisit di `cards-list.test.ts` (`c_1` punya 1 label, `c_2` array kosong, dalam RESPONSE YANG SAMA) — ini skenario yang tepat menangkap bug mapping-key kalau batching salah mengaitkan label ke card yang salah.
`pnpm -r typecheck`/`pnpm lint` bersih. Full suite `pnpm exec vitest run` → **68 file/416 test PASS**.
**Kesimpulan:** ✅ ACCEPT keempatnya.

<a id="cl-61"></a>
### CL-61 — 2026-08-23 · goal 2.9.4 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — GET list Card per List + field labels batched
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `pnpm exec vitest run` → 68 file / **416** test lulus (2 test baru `apps/api/test/cards-list.test.ts`); `pnpm -r typecheck` bersih 6/6; `pnpm lint` bersih. Implementasi: `listCards(listId)` di domain `CardRepository` + `DrizzleCardRepository`. Field `labels` TIDAK dipanggil per-Card (akan N+1 di level Card) — ditambah `listCardLabelsForCards(client, cardIds[])` baru (`card-label-association.ts`) yang batch: 2 query total (satu JOIN per scope, `WHERE card_id IN (...)`) untuk SELURUH Card sekaligus, dipetakan balik via `Map<cardId, CardLabelSummary[]>`. Endpoint `GET /projects/:project_id/lists/:list_id/cards` — baca-saja, TANPA filter visibility (Prinsip #5 Phase 3, Phase 4 scope).
**Test:** 2 Card List tsb (termasuk ARCHIVED) muncul, Card List LAIN tidak bocor; Card dengan Label → `labels` terisi benar (`{id,name,scope}`); Card tanpa Label → `labels: []`; non-member 403; tanpa identitas 401.
**Catatan:** Seluruh 5 goal yang diminta (1.9.1, 2.3.4, 2.5.4, 2.7.4, 2.9.4) selesai sisi Dev di sesi ini — Phase 0-3 sekarang **tidak ada goal `⬜️`/`⚠️` tersisa** (seluruhnya `🔎`/`✅`), siap giliran QA sebelum Phase 4 benar-benar mulai.

<a id="cl-60"></a>
### CL-60 — 2026-08-23 · goal 2.9.4 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Freshness check dari disk: row 2.9.4 `⬜️/—/0/P2`, dependency `2.8` → ✅.
**Rencana:** `listCards(listId)` ke domain `CardRepository` + `DrizzleCardRepository`, pola identik 2.3.4/2.5.4/2.7.4. Field `labels` sama seperti GET tunggal (3.9.1, `listCardLabels`) — per-Card lookup, TANPA filter visibility (Prinsip #5 Phase 3, ditegakkan Phase 4).

<a id="cl-59"></a>
### CL-59 — 2026-08-23 · goal 2.7.4 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — GET list List per Board
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `pnpm exec vitest run` → 67 file / **414** test lulus (2 test baru `apps/api/test/lists-list.test.ts`); `pnpm -r typecheck` bersih 6/6; `pnpm lint` bersih. Implementasi: `listLists(boardId)` di domain `ListRepository` + `DrizzleListRepository`; endpoint `GET /projects/:project_id/boards/:board_id/lists`, baca-saja.
**Test:** seluruh List Board tsb (termasuk ARCHIVED) muncul; List milik Board LAIN tidak bocor; non-member 403; tanpa identitas 401.

<a id="cl-58"></a>
### CL-58 — 2026-08-23 · goal 2.7.4 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Freshness check dari disk: row 2.7.4 `⬜️/—/0/P2`, dependency `2.6` → ✅.
**Rencana:** `listLists(boardId)` ke domain `ListRepository` + `DrizzleListRepository`, pola identik 2.3.4/2.5.4.

<a id="cl-57"></a>
### CL-57 — 2026-08-23 · goal 2.5.4 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — GET list Board per Milestone
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `pnpm exec vitest run` → 66 file / **412** test lulus (2 test baru `apps/api/test/boards-list.test.ts`); `pnpm -r typecheck` bersih 6/6; `pnpm lint` bersih. Implementasi: `listBoards(milestoneId)` di domain `BoardRepository` + `DrizzleBoardRepository` (`WHERE milestone_id = ?`); endpoint `GET /projects/:project_id/milestones/:milestone_id/boards`, baca-saja.
**Test:** seluruh Board Milestone tsb (termasuk ARCHIVED) muncul; Board milik Milestone LAIN tidak bocor; non-member 403; tanpa identitas 401.

<a id="cl-56"></a>
### CL-56 — 2026-08-23 · goal 2.5.4 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Freshness check dari disk: row 2.5.4 `⬜️/—/0/P2`, dependency `2.4` → ✅.
**Rencana:** `listBoards(milestoneId)` ke domain `BoardRepository` + `DrizzleBoardRepository`, pola identik 2.3.4 (CL-55).

<a id="cl-55"></a>
### CL-55 — 2026-08-23 · goal 2.3.4 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — GET list Milestone
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `pnpm exec vitest run` → 65 file / **410** test lulus (3 test baru `apps/api/test/milestones-list.test.ts`); `pnpm -r typecheck` bersih 6/6; `pnpm lint` bersih. Implementasi: `listMilestones(projectId)` ditambah ke interface domain `MilestoneRepository` + `DrizzleMilestoneRepository` (query tanpa filter status, `ORDER BY created_at, id`); endpoint `GET /projects/:project_id/milestones` (tanpa `assertOwnerInterim` — baca-saja, membership cukup, pola sama GET tunggal).
**Test:** seluruh 3 Milestone (ACTIVE/ARCHIVED/DELETED) muncul tanpa filter; member non-Owner tetap 200; non-member → `PROJECT_ACCESS_DENIED`; tanpa identitas → 401.

<a id="cl-54"></a>
### CL-54 — 2026-08-23 · goal 2.3.4 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Freshness check dari disk: row 2.3.4 `⬜️/—/0/P2`, dependency `2.2` → ✅. `MilestoneRepository` (domain) dibaca — belum ada `listMilestones`, hanya `getMilestone` tunggal.
**Rencana:** Tambah `listMilestones(projectId): Promise<MilestoneRecord[]>` ke interface domain + `DrizzleMilestoneRepository`; endpoint `GET /projects/:project_id/milestones` di `milestones.ts` (membership-only, bukan Owner-only, pola sama GET tunggal); seluruh Milestone termasuk ARCHIVED/DELETED, tanpa filter server-side.

<a id="review-cl-06"></a>
### Review-CL-06 — 2026-08-23 · 4 goal baru dibuka (2.3.4/2.5.4/2.7.4/2.9.4) — gap GET list-children ditemukan saat audit pra-Phase-4

**Role:** AI-Planning & Review · **Model:** Claude Sonnet 5

**Bukti:** Saat menyiapkan PHASE-4-TASKS.md (Card visibility scope, BR-047–049/D.3), ditemukan C.5–C.8 (Milestone/Board/List/Card) TIDAK PERNAH punya endpoint list-children sejak Phase 2 digenerate — hanya `GET .../:id` tunggal untuk keempatnya. Ini berarti sebelum amandemen ini: (a) tidak ada cara mengenumerasi Board dalam Milestone, List dalam Board, atau Card dalam List via API sama sekali — Kanban board tidak dapat dirender; (b) Card visibility scope (inti Phase 4) tidak punya list apa pun untuk difilter, membuat goal Phase 4 terkait tidak dapat diuji end-to-end. Disetujui manusia 2026-08-23: tambah keempat endpoint list sekaligus (bukan cuma `GET .../cards` atau ditunda ke Phase 7) — SOT diamandemen `docs/02-SPEC.md` C.5–C.8, `SPEC_VERSION` 2.10.0 → **2.11.0**.

**Goal baru dibuka (bukan reopening goal lama — 2.3.1-3/2.5.1-3/2.7.1-3/2.9.1-3 tetap ✅, scope aslinya tidak berubah):** 2.3.4 (`GET /milestones`), 2.5.4 (`GET .../boards`), 2.7.4 (`GET .../lists`), 2.9.4 (`GET .../cards`, TANPA filter visibility — konsisten Prinsip #5, visibility scope tetap Phase 4). Task-level Status/% otomatis turun jadi `🔄` (derived dari goal per §6.2) — ini BUKAN regresi implementasi lama, murni akibat penambahan goal baru yang belum dikerjakan.

<a id="review-cl-05"></a>
### Review-CL-05 — 2026-08-23 · CL-53/QA-CL-24 — verifikasi independen lapis ketiga (Review), tidak ada tindakan lanjutan

**Role:** AI-Planning & Review · **Model:** Claude Sonnet 5

**Bukti — direproduksi ulang dari nol, bukan cuma membaca klaim Dev/QA:** `git show 82f28a0` dibaca baris-per-baris untuk `lifecycle-errors.ts` dan `board-errors.ts` — konversi `constructor(public readonly x: T)` → field terpisah + `this.x = x` di body, byte-identik dengan pola Phase 0/1 yang sudah benar; nama class, `code`, dan pesan error tidak berubah sama sekali. `grep -rn` untuk `constructor(public\|private\|protected\|readonly` di seluruh `packages/`+`apps/` → **nol hasil**, mengonfirmasi tidak ada parameter-property shorthand tersisa. Re-run mandiri: `pnpm -r typecheck` → 6/6 Done; `pnpm exec vitest run` → **50 file/325 test PASS**; `pnpm --filter @kanban/api build && node dist/serve.js` → boot bersih (tidak crash); `pnpm exec playwright test` → run pertama sempat `ECONNREFUSED` (webServer belum siap saat test race terhadapnya, false alarm — dikonfirmasi lewat `DEBUG=pw:webserver` bahwa ini bukan regresi CL-53: log menunjukkan `tsc` + `node dist/serve.js` start normal, health check 200 didapat, run kedua **1/1 PASS** bersih). Dicatat eksplisit di sini karena false-alarm ini sendiri adalah bukti proses verifikasi yang tidak asal terima — bukan diabaikan begitu ada kejanggalan.

**Kesimpulan:** Independen mengonfirmasi seluruh klaim CL-53/QA-CL-24 akurat — pure syntax fix, nol regresi, e2e path yang sebelumnya tidak pernah teruji (Review-CL-02/03/04) sekarang genuinely hijau. Tidak ada goal yang perlu diturunkan status; tidak ada tindakan lanjutan. Setuju dengan rekomendasi proses CL-53 (masukkan `playwright test` ke checklist closure Phase berikutnya, termasuk Phase 3).

<a id="qa-cl-24"></a>
### QA-CL-24 — 2026-08-23 · CL-53 (fix parameter-property, cross-cutting) — verifikasi independen, tidak ada tindakan lanjutan
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti — tidak menerima laporan begitu saja, direproduksi ulang dari nol:** Baca diff `82f28a0` untuk kelima file (`lifecycle/milestone/board/list/card-errors.ts`) — pola konversi identik dan konsisten: `public readonly x: T` di parameter constructor → deklarasi field eksplisit + `this.x = x` di body, tanpa perubahan pesan error/kode/nama class apa pun (pure syntax, dikonfirmasi lewat pembacaan diff baris-per-baris, bukan cuma percaya klaim "zero behavior change"). Re-run mandiri: `pnpm -r typecheck` → 6/6 Done; `pnpm lint` → 0 error; `pnpm exec vitest run` → **50 file/325 test PASS** (identik sebelum fix — regresi nihil); `pnpm exec playwright test` → **1/1 PASS** (`node dist/serve.js` boot bersih, health check 200 — sebelumnya crash total saat load module). Vercel bundle (`scripts/preview-build.mjs` + `require()` langsung terhadap hasilnya) tetap sukses sebelum dan sesudah fix — konsisten dengan klaim jalur produksi tidak pernah terdampak. **Scope closure dikonfirmasi independen:** `grep` parameter-property constructor (`public|private|protected` di parameter) di seluruh `packages/*/src` dan `apps/*/src` → nol hasil, cocok persis dengan klaim "5 file/15 constructor, tidak lebih" — termasuk false-positive yang disebut Dev sendiri (field declaration biasa di `*-repository.ts`/`pipeline.ts`) memang bukan constructor parameter-property, dikonfirmasi bukan risiko yang sama.
**Kesimpulan:** Verifikasi independen mengonfirmasi laporan akurat di semua klaim — tidak ada tindakan lanjutan, tidak ada goal yang perlu diturunkan. Setuju dengan rekomendasi proses CL-53 (masukkan `playwright test` ke checklist closure fase berikutnya) — celah audit 3-putaran sebelumnya nyata: `vitest`/`typecheck`/`lint` semuanya lulus sepanjang Review-CL-02/03/04 justru karena tidak satu pun dari ketiganya mengeksekusi jalur `node dist/serve.js` yang sesungguhnya rusak.

<a id="cl-53"></a>
### CL-53 — 2026-08-23 · fix cross-cutting: `node dist/serve.js` crash (e2e webServer gagal start) — bukan reopening goal, seluruh 21/21 goal tetap ✅
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Laporan full-suite (`pnpm exec playwright test`) menemukan `webServer` (`node dist/serve.js`, jalur plain-Node — dipakai e2e & `pnpm --filter @kanban/api start` untuk dev lokal) crash saat boot: `SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript parameter property is not supported in strip-only mode` di `packages/domain/src/lifecycle/lifecycle-errors.ts:8`. Direproduksi independen (bukan cuma percaya laporan): `pnpm --filter @kanban/api build && node apps/api/dist/serve.js` → crash identik. Root cause: `@kanban/domain`/`@kanban/infrastructure`/`@kanban/contracts` expose `"./src/index.ts"` mentah (bukan compiled output); `dist/serve.js` hasil `tsc` resolve balik ke `.ts` source itu, dan Node native TS-stripping (bukan compiler sungguhan) tidak bisa transform parameter-property shorthand (`constructor(public readonly x: T)`) — butuh codegen `this.x = x`, bukan cuma erasure tipe. `grep -rE "constructor\(.*\b(public|private|protected)\b" packages/**/*.ts` (dipersempit manual dari grep awal yang match false-positive field declaration biasa di `*-repository.ts`/`pipeline.ts`) mengonfirmasi scope persis 5 file, 15 constructor: `lifecycle-errors.ts` (1), `milestone-errors.ts`/`board-errors.ts`/`list-errors.ts`/`card-errors.ts` (masing² 3 — `*NotFoundError`, `*VersionConflictError`, `*InvalidStateError`). Seluruhnya diperkenalkan Phase 2 (TASK-2.1/2.2/2.4/2.6/2.8) — Phase 0/1 punya pola error class yang sudah benar (field terpisah + assignment eksplisit di body constructor), jadi bug ini regresi baru, bukan lama.
**Fix:** Diubah ke pola field-terpisah yang sudah dipakai benar di seluruh Phase 0/1 (`constructor(x: T) { this.x = x; }`), bukan shorthand. Murni transformasi sintaks — tidak ada perubahan behavior/pesan error/kode error apa pun (dibuktikan test hijau tanpa modifikasi test).
**Verifikasi (bukan cuma klaim, dijalankan ulang setelah fix):** `pnpm -r typecheck` bersih 6/6; `pnpm lint` 0 error; `pnpm --filter @kanban/api build && node apps/api/dist/serve.js` → boot sukses, `curl /api/v1/health` → 200 (sebelumnya crash instan); `pnpm exec vitest run` → **50 file/325 test PASS**, nol regresi; `pnpm exec playwright test` → **1/1 PASS** (sebelumnya `webServer` gagal start, seluruh e2e run gagal); jalur Vercel (`node scripts/preview-build.mjs` lalu `require()` bundle) tetap bersih — dikonfirmasi TIDAK terdampak baik sebelum maupun sesudah fix (esbuild adalah compiler sungguhan, bukan strip-only, sehingga parameter-property shorthand valid di jalur itu — klaim awal laporan soal ini diverifikasi ulang, bukan diterima mentah).
**Kenapa tidak reopen goal manapun:** Seluruh 21/21 goal Phase 2 Test/DoD-nya berbasis `vitest` (business-logic correctness), yang TIDAK pernah tersentuh bug ini (transpile-only test runner, bukan strip-mode Node) — makanya lolos 3 putaran audit (Review-CL-02/03/04) tanpa terlihat. Bug murni di jalur *packaging/runtime-invocation* (`node dist/serve.js` plain-Node path) yang sebelumnya tidak pernah dieksekusi oleh proses verifikasi manapun sampai `pnpm exec playwright test` benar-benar dijalankan end-to-end. Pola sama seperti Phase 1 CL-65 (fix `isBusy` cross-cutting yang juga menyentuh file goal ✅ TASK-1.1 tanpa reopen 1.1.1) — dicatat sebagai entry Closure Log standalone, bukan `⚠️`/status-turun pada 2.1.1/2.2.1/2.4.1/2.6.1/2.8.1/2.8.2 (goal yang file-nya tersentuh), karena Test/DoD asli goal-goal tsb tetap benar dan tetap terbukti hijau.
**Rekomendasi proses (dicatat, bukan blocker):** `Review-CL-04`/audit closure sebelumnya menjalankan `pnpm -r build`/`typecheck`/`lint`/`vitest` tapi TIDAK `playwright test` — gap ini yang membuat bug lolos 3 putaran audit. Phase berikutnya sebaiknya `pnpm exec playwright test` (bukan cuma health-check smoke) ikut masuk checklist closure Review, khususnya untuk perubahan yang menambah file baru di `packages/domain`/`packages/infrastructure` yang di-resolve lewat plain-Node runtime (bukan cuma esbuild Vercel).

<a id="review-cl-04"></a>
### Review-CL-04 — 2026-08-23 · audit closure final Phase 2 (21/21 goal ✅): verifikasi 2.12.1 + Exit Criteria menyeluruh
**Role:** AI-Planning & Review · **Model:** claude-sonnet-5 (Claude Code)
**Bukti — verifikasi 2.12.1, bukan baca ulang klaim QA-CL-23:** `pnpm -r build`/`typecheck`/`lint` bersih; `pnpm exec vitest run` → **50 file/325 test PASS**, nol regresi sepanjang fase. Baca `card-assignee-cleanup.ts` — atomik per-Card (guard `assignee_user_id = ? AND version = ?` mencegah Activity tanpa mutation sesuai), best-effort per-Card (kegagalan satu Card tidak menggulung yang lain), sesuai spek 2.12.1. **Kecurigaan diinvestigasi ulang (sesuai laporan Dev)**: parameter `projectDb` di `revokeMembership` opsional (`Client | null`) — bisa `null` kalau `resolveProjectDbClient` (lokal `project-deps.ts`) gagal resolve mapping `project_databases`. Dikonfirmasi: pada wiring produksi (`project-deps.ts:249`), `projectDb` SELALU di-resolve dan diberikan sebelum memanggil `revokeMembership` — path `null` hanya bisa terjadi jika `project_databases` tidak punya mapping untuk `project_id` yang sudah lolos cek eksistensi/otorisasi di route (praktiknya mustahil, karena mapping dibuat atomik saat provisioning, Phase 1 TASK-1.2). Ada test eksplisit `"[kompatibilitas] revokeMembership tanpa projectDb tetap jalan (perilaku Phase 1)"` — dikonfirmasi ini backward-compatibility yang disengaja (bukan celah tak disadari). Klaim Dev akurat.
**Audit tambahan (spot-check cakupan fase, bukan cuma goal terakhir):** `grep isEffectivelyOperational/evaluateRestore` pada `card-repository.ts` mengonfirmasi ancestor-check ada di jalur create/update/archive/restore/delete Card SEKALIGUS (dibangun setelah perbaikan Review-CL-02, tidak mengulang bug yang sama) — regresi kelas Review-CL-02 TIDAK terjadi di Card. `grep` routes tidak menemukan endpoint Label/Comment/`GET /activities` mana pun — tidak ada scope creep (Prinsip #4). Seluruh 6 router (`projects`, `milestones`, `boards`, `lists`, `cards`, `project-admin`) terdaftar bersih di `apps/api/src/index.ts`.
**Exit Criteria Phase 2 — dicek satu per satu:**
- Milestone/Board/List/Card CRUD penuh + ancestor-chain di SETIAP command mutasi ✅ (setelah perbaikan Review-CL-02, dikonfirmasi ulang berlaku juga di Card).
- Card move menegakkan INV-MOVE-001–004 + BR-017/018, test konkurensi hijau ✅ (diverifikasi 3× independen — Dev, QA, Review — Review-CL-03).
- Card assignee otomatis NULL saat membership dicabut ✅ (2.12.1, cross-DB, atomik per-Card).
- Activity atomik untuk setiap mutasi ✅ (dikonfirmasi konsisten di Milestone/Board/List/Card, konvensi B.5 diikuti).
- Archive/delete parent tidak mengubah local state descendant ✅ (dibuktikan test langsung ke row descendant di setiap task terkait).
- Tidak ada Label/Comment/`GET /activities` ✅ (dikonfirmasi tidak ada di routing).
- Endpoint terpetakan ke C.5–C.8, tidak ada path di luar kontrak ✅.
- Test Project-boundary/optimistic-locking/authorization hijau ✅ (325 test, termasuk regression test lintas-Project di beberapa goal).
**Verdict:** Phase 2 **genuinely tuntas** — 21/21 goal ✅, didukung 3 putaran audit independen (Review-CL-02/03/04) yang masing-masing mereproduksi bukti sendiri, menemukan & menutup 1 bug correctness signifikan (ancestor-check, ditemukan sebagai kesalahan spesifikasi Review sendiri) dan 1 keputusan governance model-tiering (dicatat, bukan didiamkan). Tidak ada temuan baru dari audit final ini. Siap Phase 3.

<a id="review-cl-03"></a>
### Review-CL-03 — 2026-08-23 · audit gelombang kedua Phase 2 (TASK-2.2 lanjutan–2.11): verifikasi perbaikan Review-CL-02 + keputusan governance model-tiering 2.10.1/2.11.1
**Role:** AI-Planning & Review · **Model:** claude-sonnet-5 (Claude Code)
**Bukti — verifikasi independen, bukan baca ulang klaim QA-CL-11..22:** `pnpm -r typecheck` bersih (dijalankan di atas working tree yang sedang berisi WIP Dev untuk 2.12.1 — tidak disentuh, konsisten AGENTS.md §11.0). Baca `git show 1f5792a` (moveCard) baris-per-baris: urutan validasi C.8 dikonfirmasi cocok persis goal 2.10.1 (DELETED-check → version-check → local-state → source ancestor → destination ancestor → BR-018). Logika BR-018 (`sourceChain.boardId !== destination.boardId && sourceChain.milestoneId !== destination.milestoneId`) di-re-derive manual: secara logis ekuivalen dengan cek `milestoneId` saja (karena BR-002 — satu Board cuma satu Milestone — membuat "boardId beda" implisit tiap kali "milestoneId beda"), jadi BENAR walau ditulis lebih verbose dari perlu.
**Verifikasi tambahan independen ketiga (setelah Dev CL-47/48 dan QA QA-CL-21) untuk klaim konkurensi:** test checked-in (`card-move.test.ts`) untuk skenario "konkurensi" ternyata SEKUENSIAL (await penuh lalu baru panggil ke-2, bukan `Promise.all`) — dikonfirmasi via `grep`, tidak ada `Promise.all` di file itu. Ditulis test sekali-pakai sendiri (dihapus setelah run) dengan **2 `Client` sungguhan** ke file SQLite yang sama, `Promise.allSettled` 2 `moveCard` konkuren ke destinasi BEDA pada Card yang sama, `expected_version` sama-sama 1 → hasil: tepat 1 fulfilled, 1 rejected dengan `CardVersionConflictError` (bersih, bukan raw driver error); state akhir konsisten (version=2, `list_id` salah satu destinasi, tepat 1 Activity `card.moved` — tidak ada duplikasi/korupsi). Klaim QA-CL-21 ("race sungguhan, hasil bersih") terkonfirmasi independen.
**Keputusan governance (dibawa ke manusia, bukan diputuskan sendiri):** TASK-2.10/2.11 ditandai `[MODEL LEBIH KUAT WAJIB, AGENTS.md §11.2]` sejak generate (Review-CL-01) karena menyentuh invariant inti #5 — tapi dikerjakan model yang sama dengan goal lain (bukan model lebih kuat), ditemukan & di-flag QA sendiri (QA-CL-21) sebagai pertanyaan proses terbuka, bukan diputuskan sepihak oleh QA. Diajukan ke manusia dengan analisis dua sisi: (a) terima karena bukti korektnya sudah sangat kuat (3 verifikasi independen termasuk race sungguhan), vs (b) tetap wajib redo demi kepatuhan proses murni (AGENTS.md §11.2 secara eksplisit menolak paradigma "verifikasi ketat menggantikan model kuat sejak awal" — "korektnya diciptakan di Dev, bukan ditemukan di Review"). **Manusia memutuskan (2026-08-23): TERIMA, dicatat resmi sebagai pelanggaran proses** — bukan didiamkan, dan eksplisit BUKAN preseden bahwa verifikasi ekstra bisa menggantikan kewajiban model kuat untuk goal invariant-critical Phase 3+ berikutnya (dicatat di Prinsip #6).
**Catatan:** Tidak ada perubahan Status pada 2.10.1/2.11.1 (tetap ✅ 100%, keputusan manusia mempertahankan status QA, bukan mengubahnya) maupun SOT. Ini murni pencatatan keputusan governance + bukti verifikasi independen tambahan.

<a id="review-cl-02"></a>
### Review-CL-02 — 2026-08-23 · audit gelombang pertama Phase 2 (TASK-2.1–2.6): bug ancestor-check ditemukan — **kesalahan spesifikasi task oleh Review sendiri**, bukan kesalahan Dev/QA
**Role:** AI-Planning & Review · **Model:** claude-sonnet-5 (Claude Code)
**Bukti — verifikasi independen, bukan baca ulang klaim QA-CL-01..10:** Re-run `pnpm -r typecheck`/`pnpm lint` bersih; `pnpm exec vitest run` → **40 file/258 test PASS**. Baca kode `packages/domain/src/lifecycle/effective-state.ts` (utility 2.1.1 — bersih, entity-agnostic, sesuai spek) dan `packages/infrastructure/src/database/{milestone,board,list}-repository.ts` baris-per-baris.
**TEMUAN — CONFIRMED via reproduksi live, correctness bug nyata:** `isEffectivelyOperational`/`evaluateRestore` (utility 2.1.1) di ketiga repository HANYA dipanggil di jalur `create` (cek ancestor sebelum insert) dan `restore` (via `evaluateRestore`) — **`update`/`archive`/`delete` TIDAK PERNAH memanggil ancestor check sama sekali**, cuma cek local-state entity sendiri (state machine A.3). Ini melanggar **INV-LIFE-001** (02-SPEC A.3): *"Descendant MAY tetap memiliki local state ACTIVE saat ancestor ARCHIVED/DELETED, tetapi MUST diperlakukan tidak operasional: **tidak menerima mutation**..."* — kata "mutation" di situ tidak dibatasi hanya create/restore. Dibuktikan test sekali-pakai (dihapus setelah run, tidak masuk commit) terhadap `DrizzleMilestoneRepository` nyata (file DB lokal): Project di-archive, lalu `updateMilestone`, `archiveMilestone`, DAN `deleteMilestone` terhadap Milestone-nya (masih local ACTIVE) **SEMUA berhasil** — seharusnya ketiganya ditolak. Pola identik dikonfirmasi ada di `board-repository.ts` dan `list-repository.ts` (`grep` menunjukkan `isEffectivelyOperational`/`evaluateRestore` cuma muncul di sekitar create/restore, tidak di jalur update/archive/delete manapun).
**Root cause — DITEMUKAN DI TEKS GOAL YANG SAYA TULIS SENDIRI (Review-CL-01):** goal 2.2.1 (dan disalin ke 2.4.1/2.6.1) menulis *"Setiap command: version check → **validasi ancestor (create/restore) atau local-state (update/archive)** → mutation+Activity atomik"* — kalimat ini SALAH secara eksplisit membatasi ancestor-check ke create/restore saja, padahal INV-LIFE-001 mensyaratkan ancestor-check untuk SEMUA mutasi. Dev (CL-03/11/19) mengimplementasikan persis apa yang diminta teks goal; QA (QA-CL-02/06/10) memverifikasi terhadap Test/DoD yang sama-sama tidak menyebutkan skenario ini — **bukan kegagalan Dev atau QA**, kedua lane bekerja benar sesuai spesifikasi yang diberikan; spesifikasinya sendiri yang kurang lengkap.
**Tindakan:** Goal **2.2.1, 2.4.1, 2.6.1 dibuka kembali `✅ 100% → ⚠️ 60%`** — mayoritas goal benar (create/restore/local-state semua tepat; hanya ancestor-check pada update/archive/delete yang hilang). Teks goal diperbaiki eksplisit (bukan cuma dicatat di CL) agar Dev punya kriteria jelas saat memperbaiki. **Goal 2.8.2 (Card, belum dikerjakan) turut diperbaiki preemptif** — sebelum Dev sempat menyalin pola yang sama untuk keempat kalinya, teks goal Card domain command update/archive/restore/delete sekarang eksplisit menyebut kewajiban ancestor-check di semua 4 operasi.
**Catatan:** Wewenang transisi ✅→⚠️ oleh Review sesuai AGENTS.md §11.1/§11.3.4. Tidak ada perubahan SOT (INV-LIFE-001 di 02-SPEC.md sudah benar sejak awal — murni kesalahan transkripsi Review ke task file). TASK-2.1 (utility) sendiri TIDAK bermasalah — utility-nya benar dan lengkap (`isEffectivelyOperational` menerima chain apa pun), masalahnya di titik panggil yang tidak lengkap di layer repository.

<a id="qa-cl-10"></a>
### QA-CL-10 — 2026-08-23 · goal 2.6.1 🔎 → ✅ — domain command List chain 3 level, no-cascade ke Card terbukti
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca penuh `list-repository.ts` dan `list-commands.test.ts` (16 test). Konfirmasi: `createList` memvalidasi chain 3-level (Board→Milestone→Project) via `loadAncestorStates`+`isEffectivelyOperational`, satu ancestor manapun non-ACTIVE ditolak `AncestorNotActiveError` — dites terpisah untuk masing-masing dari 3 level. `restore` pakai `evaluateRestore` dengan urutan chain benar. State machine A.3 (`update/archive:[ACTIVE]`, `restore:[ARCHIVED]`, `delete:[ACTIVE,ARCHIVED]`) sama persis pola Milestone/Board (2.2.1/2.4.1) — konsisten, tidak ada reimplementasi ancestor-chain sendiri (DoD 2.1.1 terpenuhi). **FR-022/BR-013 no-cascade** — test eksplisit membaca row Card `SELECT *` penuh sebelum vs sesudah archive DAN delete List, `toEqual` byte-identik (state/version/list_id semua utuh) — inilah level bukti yang diminta Test/DoD goal ("assert langsung ke row Card, bukan cuma response List"), bukan cuma "tidak error". `getList` mengabaikan `projectId` parameter — dikonfirmasi BENAR (bukan bug): tabel `lists` di schema tidak punya kolom `project_id` sama sekali (arsitektur database-per-project — isolasi ditegakkan oleh koneksi DB, bukan filter WHERE).
**Observasi minor (non-blocking):** `loadAncestorStates` query `project_state LIMIT 1` tanpa `WHERE project_id = ?` (beda gaya dari Milestone/Board yang eksplisit filter) — fungsional benar karena invariant desain "1 baris project_state per Project DB" berlaku absolut di arsitektur ini, tapi kurang defense-in-depth dibanding pola Milestone/Board. Dicatat untuk konsistensi gaya di TASK-2.8 (Card, ancestor chain 4-level), bukan blocker goal ini.
**Kesimpulan:** ✅ ACCEPT.

<a id="qa-cl-09"></a>
### QA-CL-09 — 2026-08-23 · goal 2.5.3 🔎 → ✅ — lifecycle endpoint Board (archive/restore/delete)
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `apps/api/test/boards-lifecycle.test.ts` (7 test) dijalankan ulang — hijau. Pola identik `handleLifecycle` Milestone (2.3.3)/Project (TASK-1.4), `expected_version` wajib, Owner-only interim, error mapping konsisten (`INVALID_STATE`/`VERSION_CONFLICT`/`VALIDATION_ERROR`/`RESOURCE_NOT_FOUND`).
**Kesimpulan:** ✅ ACCEPT.

<a id="qa-cl-08"></a>
### QA-CL-08 — 2026-08-23 · goal 2.5.2 🔎 → ✅ — PATCH Board
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `apps/api/test/boards-patch.test.ts` (5 test) dijalankan ulang — hijau. `allowedFields` hanya `title`/`description` (C.15 domain-controlled fields ditolak `VALIDATION_ERROR`), `expected_version` wajib, konsisten pola Milestone 2.3.2.
**Kesimpulan:** ✅ ACCEPT.

<a id="qa-cl-07"></a>
### QA-CL-07 — 2026-08-23 · goal 2.5.1 🔎 → ✅ — create+get Board via pipeline, Project-boundary dites lintas 2 mekanisme
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `apps/api/test/boards-create-get.test.ts` (7 test) dijalankan ulang — hijau. Test `[Project-boundary]` memverifikasi DUA skenario terpisah: (a) `milestone_id` yang benar-benar tidak ada di DB Project pemanggil → 404; (b) `milestone_id` yang valid tapi hidup di DB Project LAIN, diakses via `project_id` Project itu sendiri (bukan Project asal milestone) → tetap 404 (bukan bocor data Project lain). Keduanya mengkonfirmasi isolasi struktural database-per-project. `createBoard` menolak `milestone_id` yang ada tapi ancestor-nya non-ACTIVE (diverifikasi via repository test 2.4.1).
**Kesimpulan:** ✅ ACCEPT.

<a id="qa-cl-06"></a>
### QA-CL-06 — 2026-08-23 · goal 2.4.1 🔎 → ✅ — domain command Board, ancestor chain 2-level terbukti tepat
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca penuh `board-repository.ts` + `board-commands.test.ts` (15 test, dijalankan ulang — hijau). Konfirmasi: create menolak jika Milestone ARCHIVED/DELETED WALAU Project ACTIVE, DAN jika Project ARCHIVED/DELETED WALAU Milestone local ACTIVE — dua arah "satu ancestor saja cukup" (INV-LIFE-001) sama-sama dites eksplisit dengan skenario terpisah, bukan cuma satu arah. Restore memakai `evaluateRestore(local, [milestoneState, projectState])` — urutan chain benar (index 0 = ancestor terdekat). Test `[BR-013] archive Board tidak mengubah List/Card descendant` membaca row List DAN Card penuh sebelum/sesudah — bukti kuat no-cascade. `FR-019` dikonfirmasi via assertion `Object.keys(record).sort()` — tidak ada field status/warna/ikon/WIP menyelinap masuk.
**Kesimpulan:** ✅ ACCEPT.

<a id="qa-cl-05"></a>
### QA-CL-05 — 2026-08-23 · goal 2.3.3 🔎 → ✅ — lifecycle endpoint Milestone (archive/restore/delete)
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `apps/api/test/milestones-lifecycle.test.ts` (9 test) dijalankan ulang — hijau. Ketiga action (archive/restore/delete) diverifikasi: state-machine A.3 ditegakkan (archive ulang dari ARCHIVED → `INVALID_STATE`; restore DELETED → ditolak terminal INV-LIFE-004), version-conflict, validasi `expected_version` (hilang/salah tipe → `VALIDATION_ERROR`), authz (non-Owner → 403, tanpa identitas → 401), 404 untuk milestone tak ada.
**Kesimpulan:** ✅ ACCEPT.

<a id="qa-cl-04"></a>
### QA-CL-04 — 2026-08-23 · goal 2.3.2 🔎 → ✅ — PATCH Milestone
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `apps/api/test/milestones-patch.test.ts` (6 test) dijalankan ulang — hijau. `allowedFields` whitelist (`title`/`description`/`progress`/`start_date`/`due_date`) menolak field domain-controlled (`id`/`version`/`archived_at`/`deleted_at`/`list_id`) dengan `VALIDATION_ERROR` (C.15) — dikonfirmasi baca kode langsung di `milestones.ts:138-147`, bukan cuma percaya nama test. Payload invalid bentuk (bukan `VALIDATION_ERROR` `INVALID_STATE`, sesuai SOT 2.3.0) dan version-conflict dites terpisah.
**Kesimpulan:** ✅ ACCEPT.

<a id="qa-cl-03"></a>
### QA-CL-03 — 2026-08-23 · goal 2.3.1 🔎 → ✅ — create+get Milestone via pipeline, boundary diverifikasi ulang independen
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `apps/api/test/milestones-create-get.test.ts` (9 test) dijalankan ulang — hijau. Test suite bawaan hanya menguji "non-member ditolak PROJECT_ACCESS_DENIED" untuk klaim `[INV-04] Project-boundary` — ini authorization check, BUKAN bukti literal tidak-bocor data lintas Project. Diperluas verifikasi sendiri (test throwaway, dihapus setelah run): Owner yang jadi member Project A DAN B, membuat milestone di A, lalu `GET /projects/B/milestones/{id_milik_A}` — hasil **404 RESOURCE_NOT_FOUND**, bukan data bocor. Mengkonfirmasi isolasi struktural database-per-project (milestone Project A secara fisik tidak eksis di file DB Project B, independen dari authorization layer manapun).
**Kesimpulan:** ✅ ACCEPT.

<a id="qa-cl-02"></a>
### QA-CL-02 — 2026-08-23 · goal 2.2.1 🔎 → ✅ — domain command Milestone penuh, reuse ancestor-check dari 2.1 terbukti
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca penuh `milestone-repository.ts` + `milestone-commands.test.ts` (16 test, dijalankan ulang — hijau). Konfirmasi: seluruh 5 command (create/update/archive/restore/delete) memakai `resolveLifecycleState`/`isEffectivelyOperational`/`evaluateRestore` dari 2.1 — nol reimplementasi ancestor-chain lokal (DoD 2.1.1). Version check → state-machine A.3 → mutation+Activity dalam satu `runInWriteTransaction` (BEGIN IMMEDIATE) — tidak ada jalur bypass optimistic locking (dikonfirmasi test `expectedVersion` salah → row+activity tidak berubah). FR-015 (progress manual, tidak ada auto-kalkulasi) dan FR-016 (tidak ada field status) dikonfirmasi lewat pembacaan struktur `MilestoneRecord` — tidak ada field tersembunyi.
**Kesimpulan:** ✅ ACCEPT.

<a id="qa-cl-01"></a>
### QA-CL-01 — 2026-08-23 · goal 2.1.1 🔎 → ✅ — effective-state utility entity-agnostic, dipakai seragam TASK-2.2/2.4/2.6
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca penuh `packages/domain/src/lifecycle/effective-state.ts` + `effective-state.test.ts` (11 test, dijalankan ulang — hijau). `resolveLifecycleState` benar (BR-011 deletedAt menang archivedAt, seluruh 4 kombinasi dites). `isEffectivelyOperational`/`evaluateRestore` — hasil terdiskriminasi tipe (`ENTITY_DELETED`/`ENTITY_NOT_ARCHIVED`/`ANCESTOR_NOT_ACTIVE` + index pemblokir) memudahkan caller memetakan error tanpa re-parsing string. Konfirmasi DoD: `resolveProjectLifecycle` (Phase 1) sekarang murni delegasi (`packages/domain/src/project/project-lifecycle.ts`) — `grep resolveProjectLifecycle` menunjukkan implementasi tunggal, dipakai ulang oleh `project-repository.ts`, nol duplikasi logika. Dikonfirmasi dipakai konsisten oleh 2.2.1 (Milestone)/2.4.1 (Board)/2.6.1 (List) — DoD "dipakai seragam" terpenuhi lintas goal.
**Kesimpulan:** ✅ ACCEPT.

**Verifikasi lintas-goal (seluruh batch TASK-2.1–2.6):** `pnpm -r typecheck` → 6/6 package Done, 0 error. `pnpm lint` → `eslint .`, 0 error. `pnpm exec vitest run` → **40 file / 258 test PASS**, tidak ada regresi. Model Dev batch ini adalah `big-pickle` (opencode) — platform/model belum dikenal tim ini sebelumnya; hasil kerja diverifikasi dengan skeptisisme penuh (baca kode + reproduksi tambahan sendiri untuk klaim boundary, bukan sekadar re-run test yang disediakan) mengikuti AGENTS.md §11.3.3 — tidak ditemukan penyimpangan SOT atau klaim CL yang tidak akurat.
**Observasi arsitektur non-blocking (dicatat untuk Planning/Review, bukan blocker goal manapun):** `withErrorHandling`/`assertOwnerInterim` diduplikasi identik di `milestones.ts` dan `boards.ts` (akan berulang lagi di `lists.ts`/`cards.ts`, TASK-2.7/2.8) — kelas DRY-gap yang sama dengan Phase 1 Review-CL-10 Temuan 5 (goal 1.11.1). Layak jadi kandidat goal cleanup terpisah setelah TASK-2.8 selesai, bukan menghalangi goal manapun sekarang.

<a id="cl-29"></a>
### CL-29 — 2026-08-23 · goal 2.8.2 mulai dikerjakan (⬜️ → 🔄 · 0%) — sekaligus implementasi selesai
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.8.2 `⬜️` dengan teks goal yang sudah diamendemen Review-CL-02 (ancestor check WAJIB di keempat operasi update/archive/restore/delete). Dependency `2.8.1` terpenuhi (CL-28). Karena pekerjaan Card dikerjakan setelah Review-CL-02 diketahui, implementasi langsung mengikuti interpretasi terkoreksi.
**Catatan:** Transisi ini dan CL-30 masuk commit yang sama dengan implementasinya.

<a id="qa-cl-23"></a>
### QA-CL-23 — 2026-08-23 · goal 2.12.1 🔎 → ✅ — reactive cleanup assignee, atomik-per-Card + idempoten terbukti; Phase 2 tuntas 21/21
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca penuh `card-assignee-cleanup.ts` + diff `revokeMembership` (`project-admin.ts`) + `card-assignee-cleanup.test.ts` (7 test, dijalankan ulang — hijau). Konfirmasi:
- **Atomik per-Card** — `unassignCardFromRevokedMember` pakai guard ganda `AND assignee_user_id = ? AND version = ?` di UPDATE, satu transaksi dengan Activity `card.unassigned`. Test fault-injection (UPDATE dipaksa gagal) membuktikan tidak ada Activity yatim tanpa mutation yang sesuai — persis DoD goal ("kegagalan di tengah proses tidak meninggalkan Activity tanpa mutation").
- **Best-effort loop benar** — kegagalan satu Card (test eksplisit paksa `cd_2` gagal) tidak menggulung Card lain (`cd_1`/`cd_3` tetap terbersihkan) — dibuktikan lewat panggilan manual per-Card, bukan cuma baca kode.
- **Idempoten** — `revokeMembership` dipanggil 2× berturut untuk Membership yang sama; count Activity `card.unassigned` TIDAK bertambah di panggilan kedua. Mekanismenya benar: bukan skip di level top (yang justru rentan race), tapi guard `assignee_user_id = ?` di tiap Card individual — begitu assignee sudah NULL, panggilan kedua otomatis no-op per-Card.
- **`projectDb` optional bukan silent-skip risk** — awalnya saya curigai parameter opsional ini bisa diam-diam melewatkan cleanup di produksi kalau lupa di-wire. Dicek `project-deps.ts:248-251`: wiring produksi SELALU resolve `projectDb` via `resolveProjectDbClient` sebelum memanggil `revokeMembership` — tidak ada jalur produksi yang melewatkannya. Parameter opsional murni untuk kompatibilitas mundur (dites eksplisit: `revokeMembership` tanpa `projectDb` tetap berfungsi seperti Phase 1, cleanup di-skip sesuai desain, bukan bug).
- **`actorUserId`** dikonfirmasi threaded benar dari `identity.userId` (pemanggil/revoker) di `apps/api/src/routes/project-admin.ts:443`, bukan default ke User yang di-revoke (fallback `?? membership.userId` hanya utilitas untuk caller yang tidak menyediakannya, tidak pernah terjadi di jalur HTTP produksi).
- **Test lintas-DB nyata** (bukan mock) — `revokeMembership` dipanggil dengan `globalClient` DAN `project.client` sungguhan (file DB terpisah), memverifikasi Card di Project DB benar-benar ter-update sebagai efek dari revoke di Global DB — bukti FR-026/BR-054 end-to-end.
- Fixture Phase 1 `members-revoke.test.ts` diperbarui (proyek DB sungguhan dengan migration, bukan stub) karena wiring produksi sekarang selalu resolve Project DB — dijalankan ulang, 4 test existing tetap hijau, membuktikan tidak ada regresi behavior revoke Phase 1 (revoke sukses, Owner tidak bisa di-revoke, dst).
`pnpm -r typecheck` → 6/6 Done. `pnpm lint` → 0 error. `pnpm exec vitest run` → **50 file/325 test PASS**.
**Kesimpulan:** ✅ ACCEPT — goal terakhir Phase 2. **Phase 2 (Kanban Core) genap 21/21 goal ✅.**

<a id="cl-52"></a>
### CL-52 — 2026-08-23 · goal 2.12.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — reactive cleanup assignee saat revoke Membership
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 50 file / **325** test lulus (7 test baru `packages/infrastructure/test/card-assignee-cleanup.test.ts` — setup DUA database nyata: Global + Project terpisah); `pnpm -r typecheck` Done; `pnpm lint` bersih; smoke repository lulus. Implementasi: (1) `card-assignee-cleanup.ts` — helper per-Card atomik (`unassignCardFromRevokedMember`: SELECT → guard `assignee_user_id = ? AND version = ?` → UPDATE assignee NULL + version++ → Activity `card.unassigned{previous_assignee_user_id, reason:"membership_revoked"}` dalam SATU runInWriteTransaction; skip tanpa efek bila row sudah berubah) + wrapper loop best-effort per Card; (2) `revokeMembership` diperluas param opsional `projectDb` + `actorUserId` — cleanup berjalan SETELAH commit Global (tanpa transaksi lintas-DB, 03-ENG A.5); idempoten via revokedAt + guard assignee; (3) wiring produksi: buildProjectAdminDeps kini menerima turso + resolver/factory Project DB, route revoke meneruskan identity.userId sebagai actor.
**Catatan:** Test mencakup seluruh Test goal: 3 Card user-x dibersihkan dengan 3 Activity terpisah; Card assignee lain & NULL tak tersentuh; creator_user_id utuh (BR-054); simulasi UPDATE gagal di tengah → rollback per-Card, tanpa Activity yatim, card lain tetap diproses; kompatibilitas pemanggilan tanpa projectDb (perilaku Phase 1). Fixture Phase 1 `members-revoke.test.ts` disesuaikan menyediakan Project DB sungguhan karena revoke kini menjalankan cleanup.

<a id="cl-51"></a>
### CL-51 — 2026-08-23 · goal 2.12.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.12.1 `⬜️/—/0/P1`, dependency `2.8` (`🔎/80%` commit `5c05da4`) + `1.10.2` (Phase 1 ✅). Implementasi `revokeMembership` Phase 1 dibaca dari disk (project-admin.ts:700–728, Global DB saja, belum menyentuh Project DB). BR-054 + FR-026 + 03-ENG A.5 (app-layer, tanpa transaksi lintas-DB) dibaca ulang.
**Catatan:** Rencana: helper per-Card atomik (mutation+Activity satu transaksi, guard `AND assignee_user_id = ?`) + wrapper loop best-effort; revokeMembership menerima deps resolver Project DB opsional; Activity `card.unassigned{previous_assignee_user_id, reason}` B.5; version card ikut naik (mutasi entity — konsisten konvensi entity_version activity).

<a id="qa-cl-22"></a>
### QA-CL-22 — 2026-08-23 · goal 2.11.1 🔎 → ✅ — endpoint move Card
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `apps/api/test/cards-move.test.ts` (5 test) dijalankan ulang — hijau. Payload strict-validated (field asing/destination bukan string/kosong/expected_version hilang → `VALIDATION_ERROR`); `card.move` otorisasi terpisah dari `card.update` (BR-044, Owner-only interim, dikonfirmasi baca kode `assertOwnerInterim` dipanggil eksplisit di handler move, bukan reuse cek lain); seluruh validasi domain (urutan C.8, INV-MOVE, BR-018) didelegasikan penuh ke `moveCard` — endpoint tidak menduplikasi logika. **Flag proses (lihat QA-CL-21 untuk detail lengkap):** goal ini dependen pada `moveCard` (2.10.1) yang dibangun `big-pickle`, model yang SAMA tidak memenuhi tag governance `[MODEL LEBIH KUAT WAJIB]` pada baris goal 2.10.1 — endpoint ini sendiri (murni HTTP wiring + validasi payload, tanpa logika invariant) dinilai risiko lebih rendah, tapi correctness-nya bergantung penuh pada 2.10.1.
**Kesimpulan:** ✅ ACCEPT — endpoint wiring benar, correctness inti diverifikasi independen di QA-CL-21.

<a id="qa-cl-21"></a>
### QA-CL-21 — 2026-08-23 · goal 2.10.1 🔎 → ✅ — moveCard, **tapi dikerjakan model yang DILARANG task-nya sendiri**
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**⚠️ Temuan proses (bukan defect kode):** baris goal 2.10.1 di tabel Status secara eksplisit ditandai `[MODEL LEBIH KUAT WAJIB, AGENTS.md §11.2]` sejak digenerate Review-CL-01 — Prinsip Phase 2 #6 menyebut alasan eksplisit (menyentuh invariant inti #5, concurrency/optimistic-locking). CL-47/48 mengonfirmasi goal ini tetap dikerjakan `big-pickle (opencode)`, model/platform yang sama dipakai untuk seluruh goal ringan lain di Phase 2 — bukan model lebih kuat yang disyaratkan. Ini pelanggaran governance eksplisit tertulis di task file, bukan dugaan/interpretasi. Diangkat ke manusia untuk keputusan (lihat pesan terpisah); tidak menahan verifikasi teknis di bawah karena defect NYATA lebih penting ditemukan lebih dulu daripada menunggu keputusan proses.
**Bukti teknis — diverifikasi dengan skeptisisme penuh mengikuti AGENTS.md §11.3.4 (property/concurrency test, bukan baca kode saja), justru KARENA governance model dilanggar:**
- Baca penuh `moveCard` (`card-repository.ts:139-201`) — urutan validasi persis sesuai C.8/dokumentasi goal: load+DELETED-gate → version check (BR-021, mendahului evaluasi destination agar request stale tidak bocor info destination) → local ACTIVE (INV-LIFE-003) → source chain ancestor (INV-LIFE-001) → destination validity+ancestor (INV-MOVE-001/002, `loadDestination` memetakan `ListNotFoundError`→`InvalidDestinationError` supaya list Project lain TIDAK membocorkan pembeda "ada tapi beda Project" vs "tidak ada sama sekali") → **BR-018 cross-Board/Milestone logic** (`sourceChain.boardId !== destination.boardId && sourceChain.milestoneId !== destination.milestoneId`) — diverifikasi manual kebenaran boolean-nya untuk ketiga kombinasi (same-board selalu izin; cross-board+same-milestone izin; cross-board+cross-milestone tolak) — LOGIKA BENAR, ini titik paling gampang salah di seluruh fitur.
- **Konkurensi nyata (bukan simulasi):** Dev sendiri mencatat di CL-48 tidak berhasil menuntaskan reproduksi 2-koneksi nyata ("quirk lock file driver merusak teardown... disarankan menyusul di level HTTP/QA"). Direproduksi mandiri dari nol (test throwaway, dihapus setelah run): 2 `Client` `@libsql/client` SUNGGUHAN, `Promise.allSettled` 2 panggilan `moveCard` bersamaan pada Card yang sama ke 2 List tujuan berbeda — hasil: **tepat 1 fulfilled, 1 rejected** dengan `CardVersionConflictError` bersih (bukan `SQLITE_BUSY` mentah, memanfaatkan fix busy-retry Phase 1 goal 1.12.1), state akhir row Card benar (`version=2`, `list_id` = tujuan pemenang), **tepat 1** activity `card.moved` (bukan 2, bukan 0) — tidak ada duplikasi/corruption/lost-update. Ini menutup celah yang Dev sendiri akui belum terverifikasi.
- Test suite existing `card-move.test.ts` (10 test) dikonfirmasi mencakup: same-board sukses, cross-board-same-milestone sukses (BR-018 arah "izin"-nya, bukan cuma arah "tolak"), cross-milestone tolak, Project-boundary (destination List Project lain → `InvalidDestinationError` tanpa menyentuh DB lain), ancestor destination non-ACTIVE, version-conflict-mendahului-INV-MOVE (urutan BR-021 benar), Card ARCHIVED/DELETED source ditolak, source-ancestor-non-ACTIVE (regresi Review-CL-02 pattern), destination tidak ada.
- `pnpm -r typecheck`/`pnpm lint` bersih; `pnpm exec vitest run` → **49 file/318 test PASS**.
**Kesimpulan:** ✅ ACCEPT secara teknis — correctness genuinely terbukti lewat kombinasi pembacaan kode + property test existing + konkurensi nyata mandiri, tidak ditemukan satu defect pun. **Tapi status governance tetap terbuka** — lihat flag proses di atas, diserahkan ke manusia apakah tetap cukup dengan verifikasi QA independen ini atau goal tetap wajib dikerjakan ulang oleh model lebih kuat sesuai bunyi asli tag `[MODEL LEBIH KUAT WAJIB]`.

<a id="qa-cl-20"></a>
### QA-CL-20 — 2026-08-23 · goals 2.9.1/2.9.2/2.9.3 🔎 → ✅ — endpoint Card CRUD (create/get, PATCH, lifecycle)
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `apps/api/test/cards-create-get.test.ts` (5 test), `cards-patch.test.ts` (4 test), `cards-lifecycle.test.ts` (3 test) dijalankan ulang — semua hijau. Konfirmasi: assignee non-member aktif ditolak baik di create maupun update (03-ENG A.5); **BR-017/BR-061 ditegakkan eksplisit** — `PATCH` dengan `list_id` di body ditolak `VALIDATION_ERROR` (dites langsung, bukan cuma diasumsikan dari whitelist field) — mencegah bypass `moveCard` lewat generic PATCH; BR-045A blanket-restore (User berbeda dari yang archive boleh restore) dikonfirmasi di level HTTP juga, bukan cuma domain; Project-boundary untuk `list_id` create (list Project lain → 404) dites eksplisit; lifecycle Card mewarisi pola ancestor-check Review-CL-02 sejak awal (tidak perlu perbaikan susulan seperti Milestone/Board/List, karena teks goal 2.8.2 sudah diperbaiki preemptif sebelum diimplementasikan).
**Kesimpulan:** ✅ ACCEPT ketiganya.

<a id="qa-cl-19"></a>
### QA-CL-19 — 2026-08-23 · goals 2.8.1/2.8.2 🔎 → ✅ — domain command Card CRUD, ancestor chain 4-level + assignee cross-DB
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca penuh `card-repository.ts` (CRUD bagian) + `card-commands.test.ts` (15 test, dijalankan ulang — hijau). Konfirmasi: `createCard` memvalidasi chain 4-level (List→Board→Milestone→Project) — dites masing-masing level ARCHIVED secara terpisah, bukan cuma satu kombinasi. `commitMutation` (update/archive/restore/delete) sudah memakai pola ancestor-check YANG BENAR sejak commit pertama (`isEffectivelyOperational` untuk semua 4 operasi) — **tidak mewarisi bug Review-CL-02** karena teks goal 2.8.2 sudah diperbaiki preemptif oleh Review sebelum Dev mengimplementasikan (dikonfirmasi test `[Review-CL-02][INV-LIFE-001]` eksplisit ada di suite dan PASS sejak awal, bukan tambahan susulan). Assignee validation (FR-026, 03-ENG A.5 app-level FK cross-DB Global↔Project) diuji di create DAN update, termasuk arah negatif (assignee bukan member aktif → ditolak tanpa row/activity). BR-061/062/025 (list_id dan creator_user_id immutable via updateCard) dikonfirmasi structural — `UpdateCardInput` domain type tidak punya field `listId`/`creatorUserId` sama sekali (bukan sekadar diabaikan di runtime, mustahil dikirim secara type-safe).
**Kesimpulan:** ✅ ACCEPT keduanya.

<a id="qa-cl-18"></a>
### QA-CL-18 — 2026-08-23 · goal 2.7.3 ⚠️ → ✅ — archive/delete List: fix ancestor-check dikonfirmasi propagasi ke HTTP layer
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Root cause QA-CL-13 (list-repository.ts `archiveList`/`deleteList` tidak cek ancestor) sudah diperbaiki via commit `f771f04` (goal 2.6.1, lihat QA-CL-17). `apps/api/test/lists-lifecycle.test.ts` (5 test, +1 dari sebelumnya) dijalankan ulang — hijau, termasuk skenario ancestor-non-ACTIVE via HTTP (ditambahkan Dev sendiri di commit `b619100`, sebelum saya sempat menuntut). Tidak perlu reproduksi live tambahan — root cause sudah ditutup di layer repository, endpoint ini murni meneruskan panggilan tanpa logika sendiri (dikonfirmasi ulang dari pembacaan `routes/lists.ts`, tidak berubah sejak QA-CL-13).
**Kesimpulan:** ✅ ACCEPT.

<a id="qa-cl-17"></a>
### QA-CL-17 — 2026-08-23 · goal 2.7.2 ⚠️ → ✅ — PATCH List: fix ancestor-check dikonfirmasi live di HTTP layer
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Root cause QA-CL-12 (list-repository.ts `updateList` tidak cek ancestor) diperbaiki commit `f771f04`. Direproduksi ULANG skenario PERSIS yang gagal di QA-CL-12 (test throwaway, dihapus setelah run): seed Project→Milestone→Board→List ACTIVE, archive Project langsung di DB, `PATCH` title List — **sekarang 409 `INVALID_STATE`** ("Ancestor tidak ACTIVE — List tidak dapat menerima operasi update"), bukan 200 seperti sebelumnya. `apps/api/test/lists-patch.test.ts` (6 test, +1) dijalankan ulang — hijau.
**Kesimpulan:** ✅ ACCEPT.

<a id="qa-cl-16"></a>
### QA-CL-16 — 2026-08-23 · goal 2.6.1 ⚠️ → ✅ — ancestor-check update/archive/delete List diperbaiki & diverifikasi
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca diff commit `f771f04` — `isEffectivelyOperational` chain 3-level sekarang dipanggil untuk SEMUA operasi (bukan cuma create/restore), ditempatkan setelah version+state-machine check tapi sebelum branch operation, memakai ulang hasil `loadAncestorStates` yang sama untuk restore (hindari duplikasi query). `packages/infrastructure/test/list-commands.test.ts` (17 test, +1) — test baru eksplisit archive Board lalu update/archive/delete List (local ACTIVE) → ditolak semua, row+activity list tidak berubah. Dijalankan ulang — hijau.
**Kesimpulan:** ✅ ACCEPT (dipulihkan dari ⚠️).

<a id="qa-cl-15"></a>
### QA-CL-15 — 2026-08-23 · goal 2.4.1 ⚠️ → ✅ — ancestor-check update/archive/delete Board diperbaiki & diverifikasi
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca diff commit `1f7dd0a` — pola identik 2.2.1, chain 2-level (Milestone+Project). `packages/infrastructure/test/board-commands.test.ts` (16 test, +1) — test baru: Project ARCHIVED → update/archive/delete Board (Milestone tetap ACTIVE) ditolak semua. Dijalankan ulang — hijau.
**Kesimpulan:** ✅ ACCEPT (dipulihkan dari ⚠️).

<a id="qa-cl-14"></a>
### QA-CL-14 — 2026-08-23 · goal 2.2.1 ⚠️ → ✅ — ancestor-check update/archive/delete Milestone diperbaiki & diverifikasi
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca diff commit `b992966` — `isEffectivelyOperational([projectBefore])` sekarang dipanggil untuk update/archive/delete (sebelumnya cuma create/restore), ditempatkan tepat setelah state-machine check. Test baru `[Review-CL-02][INV-LIFE-001]` (`milestone-commands.test.ts`, 17 test total) mereproduksi PERSIS skenario Review-CL-02: archive Project SUNGGUHAN via `DrizzleProjectRepository` (bukan raw SQL), lalu update/archive/delete Milestone-nya (local ACTIVE) — ketiganya ditolak `AncestorNotActiveError`, row+activity milestone tidak berubah. Dijalankan ulang — hijau.
**Kesimpulan:** ✅ ACCEPT (dipulihkan dari ⚠️).

**Verifikasi lintas-goal (seluruh batch ini — 12 goal, TASK-2.2/2.4/2.6/2.7/2.8/2.9/2.10/2.11):** `pnpm -r typecheck` → 6/6 Done, 0 error. `pnpm lint` → 0 error. `pnpm exec vitest run` → **49 file / 318 test PASS**, zero regresi.

<a id="cl-50"></a>
### CL-50 — 2026-08-23 · goal 2.11.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — endpoint move Card
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 49 file / **318** test lulus (5 test integration baru `apps/api/test/cards-move.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: `POST /v1/projects/:project_id/cards/:card_id/move` di routes/cards.ts — body C.8 persis `{destination_list_id, expected_version}` (field asing ditolak VALIDATION_ERROR), Owner-only interim, seluruh validasi domain didelegasikan ke `moveCard` tanpa duplikasi; envelope `{data:{card}}`.
**Catatan:** Regresi HTTP skenario 2.10: same-board sukses + Activity from/to diverifikasi; cross-Milestone → INVALID_DESTINATION **HTTP 422** sesuai mapping kontrak kanonik (bukan 409); version mismatch → VERSION_CONFLICT tanpa perubahan/activity baru; authz lengkap (403/401/404). Seam BR-044 `card.move` vs `card.update` tetap dicatat untuk Phase 4.

<a id="cl-49"></a>
### CL-49 — 2026-08-23 · goal 2.11.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.11.1 `⬜️/—/0/P0`, dependency `2.10` → 2.10.1 `🔎/80%` commit `1f5792a` (suite 313 hijau). C.8: body `{destination_list_id, expected_version}` persis.
**Catatan:** Route hanya parse payload + Owner-only interim; seluruh validasi domain didelegasikan ke moveCard (tanpa duplikasi). Seam permission `card.move` terpisah dari `card.update` (BR-044) dicatat untuk Phase 4.

<a id="cl-48"></a>
### CL-48 — 2026-08-23 · goal 2.10.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — domain command moveCard
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 48 file / **313** test lulus (10 test baru `packages/infrastructure/test/card-move.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: `moveCard` di DrizzleCardRepository — SATU transaksi (INV-MOVE-004) berurutan C.8: load card → DELETED gate (INV-LIFE-004) → version check duluan sebelum evaluasi destination (BR-021/AC-020) → local ACTIVE (INV-LIFE-003) → source chain operational (INV-LIFE-001 konsisten Review-CL-02) → destination validity INVALID_DESTINATION (ada/sama Project via isolation/ancestor ACTIVE — INV-MOVE-001/002) → milestone equality BR-018 (business invariant murni, ditolak walau permission penuh) → UPDATE dijaga `AND version = expected` + Activity `card.moved{from:{list_id,list_title,board_id,board_title},to:{...}}` B.5. Error baru `InvalidDestinationError` code INVALID_DESTINATION di lifecycle-errors bersama.
**Catatan:** Test konkurensi memakai pola deterministik AC-020 (mover kedua pada snapshot stale setelah winner commit): VERSION_CONFLICT tanpa perubahan + tepat satu activity. Percobaan dua-koneksi libsql lokal menghasilkan semantics benar (terinstrumentasi: loser = CardVersionConflictError) tetapi meninggalkan quirk lock file driver yang merusak teardown; E2E konkurensi multi-request disarankan menyusul di level HTTP/QA. Skenario lain: same-board sukses, cross-board-same-milestone sukses, cross-milestone INVALID_DESTINATION, cross-project isolation, ancestor destination/source non-ACTIVE, ARCHIVED/DELETED source ditolak, NOT_FOUND.

<a id="cl-47"></a>
### CL-47 — 2026-08-23 · goal 2.10.1 mulai dikerjakan (⬜️ → 🔄 · 0%) — [invariant-critical §11.2]
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.10.1 `⬜️/—/0/P0`, dependency `2.8` → 2.8.1/2.8.2 `🔎/80%` commit `5c05da4`. Referensi dibaca ulang: C.8 (urutan validasi), INV-MOVE-001–004, BR-017/018/021/044/045A, B.5 payload from/to.
**Catatan:** Urutan wajib: load card → DELETED gate → version check → local ACTIVE (INV-LIFE-003) → source chain operational (INV-LIFE-001 konsisten Review-CL-02) → destination validity INVALID_DESTINATION (ada/sama Project/ancestor ACTIVE) → milestone equality BR-018 → commit atomik + Activity card.moved{from,to}. Error baru InvalidDestinationError code INVALID_DESTINATION di lifecycle-errors bersama.

<a id="cl-46"></a>
### CL-46 — 2026-08-23 · goal 2.9.3 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — endpoint lifecycle Card
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 47 file / **303** test lulus (3 test integration baru `apps/api/test/cards-lifecycle.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: `POST .../cards/:card_id/{archive,restore,delete}` via `lifecycleCommands` — Owner-only interim, expected_version wajib, envelope `{data:{card}}`.
**Catatan:** Skenario mencakup: archive+restore sukses berurutan; ancestor List ARCHIVED → archive/delete DITOLAK INVALID_STATE walau local ACTIVE (Review-CL-02 terpropagasi ke Card HTTP); setelah List dipulihkan delete dari ARCHIVED sukses; AC-020 ketiga action; VALIDATION_ERROR/PERMISSION_DENIED/TOKEN_EXPIRED/404.

<a id="cl-45"></a>
### CL-45 — 2026-08-23 · goal 2.9.3 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.9.3 `⬜️/—/0/P1`, dependency `2.8, 2.9.1` → keduanya `🔎/80%` (commit `5c05da4`, `c3018a7`; suite 300 hijau). BR-045A sudah diimplementasi di domain layer (CL-30).
**Catatan:** Pola lifecycleCommands sama; ancestor check semua operasi sudah di domain layer.

<a id="cl-44"></a>
### CL-44 — 2026-08-23 · goal 2.9.2 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — endpoint PATCH Card
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 46 file / **300** test lulus (4 test integration baru `apps/api/test/cards-patch.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: `PATCH /v1/projects/:project_id/cards/:card_id` — Owner-only interim; hanya title/subtitle/description/due_date/assignee + expected_version; `list_id` di body DITOLAK VALIDATION_ERROR dengan pesan eksplisit BR-017 (DoD: transport-level enforcement, diverifikasi row list_id tetap); assignee non-member → PERMISSION_DENIED 403.
**Catatan:** Activity card.updated{changes} mencakup assignee_user_id before/after.

<a id="cl-43"></a>
### CL-43 — 2026-08-23 · goal 2.9.2 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.9.2 `⬜️/—/0/P1`, dependency `2.8, 2.9.1` → keduanya `🔎/80%` (commit `5c05da4`, `c3018a7`; suite 296 hijau). C.8: PATCH boleh title/subtitle/description/due_date/assignee; TIDAK boleh list_id (BR-017/061).
**Catatan:** `list_id` di body → ditolak eksplisit VALIDATION_ERROR (pilihan konsisten dengan C.15 enforcement goal lain; Test mengizinkan "diabaikan/ditolak").

<a id="cl-42"></a>
### CL-42 — 2026-08-23 · goal 2.9.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — endpoint POST+GET Card
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 45 file / **296** test lulus (5 test integration baru `apps/api/test/cards-create-get.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: router `apps/api/src/routes/cards.ts` — `POST /v1/projects/:project_id/lists/:list_id/cards` (Owner-only interim; body C.8 title/subtitle/description/due_date + assignee opsional; assignee non-member → PERMISSION_DENIED via validator 03-ENG A.5) + `GET .../cards/:card_id` (member, TANPA filter visibility sesuai Prinsip #5); wiring `buildCardRoutesDeps` menyuntik `requireActiveMember`.
**Catatan:** Konsistensi 404: list tidak ada saat createCard kini melempar ListNotFoundError (pola sama milestone/board), bukan INVALID_STATE — test unit 2.8.1 disesuaikan.

<a id="cl-41"></a>
### CL-41 — 2026-08-23 · goal 2.9.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.9.1 `⬜️/—/0/P0`, dependency `2.8` → 2.8.1/2.8.2 `🔎/80%` commit `5c05da4` (suite 291 hijau). C.8 dibaca ulang: create body title/subtitle/description/due_date (+assignee opsional FR-026); GET TANPA filter visibility (Prinsip #5, Phase 4).
**Catatan:** Router cards.ts; wiring buildCardRoutesDeps menyuntik requireActiveMember sebagai validator assignee.

<a id="cl-40"></a>
### CL-40 — 2026-08-23 · goal 2.7.3 perbaikan selesai sisi Dev (⚠️ → 🔄 → 🔎 · 60 → 80%) — propagasi fix ancestor-check ke archive/delete via HTTP
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 44 file / **291** test lulus (skenario baru di `apps/api/test/lists-lifecycle.test.ts`: Board di-archive langsung di DB lalu `archive` dan `delete` List local ACTIVE → INVALID_STATE 409, row tak berubah; setelah Board dipulihkan → delete sukses 200); `pnpm -r typecheck` Done; `pnpm lint` bersih.
**Catatan:** Sesuai QA-CL-13 — restore tidak terdampak (sudah memakai evaluateRestore); fix domain 2.6.1 terbukti terpropagasi untuk archive+delete.

<a id="cl-39"></a>
### CL-39 — 2026-08-23 · goal 2.7.3 perbaikan dimulai (⚠️ → 🔄 · 60%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.7.3 `⚠️/60/P1` per QA-CL-13 (pewarisan bug 2.6.1 untuk action archive+delete; restore tidak terdampak). Fix domain sudah landing di `f771f04`.
**Catatan:** Cukup tambah skenario HTTP archive/delete saat ancestor non-ACTIVE lalu re-run.

<a id="cl-38"></a>
### CL-38 — 2026-08-23 · goal 2.7.2 perbaikan selesai sisi Dev (⚠️ → 🔄 → 🔎 · 60 → 80%) — propagasi fix ancestor-check via HTTP
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 44 file / **290** test lulus (skenario baru di `apps/api/test/lists-patch.test.ts`: Board di-archive langsung di DB lalu PATCH list → INVALID_STATE 409); `pnpm -r typecheck` Done; `pnpm lint` bersih.
**Catatan:** Sesuai QA-CL-12 — tidak ada perubahan endpoint; fix domain 2.6.1 (f771f04) terbukti terpropagasi ke layer HTTP.

<a id="cl-37"></a>
### CL-37 — 2026-08-23 · goal 2.7.2 perbaikan dimulai (⚠️ → 🔄 · 60%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.7.2 `⚠️/60/P1` per QA-CL-12 (pewarisan bug 2.6.1; endpoint hanya meneruskan panggilan). Fix domain sudah landing di `f771f04`.
**Catatan:** Cukup tambah skenario HTTP "ancestor non-ACTIVE → PATCH ditolak" lalu re-run.

<a id="cl-36"></a>
### CL-36 — 2026-08-23 · goal 2.6.1 perbaikan selesai sisi Dev (⚠️ → 🔄 → 🔎 · 60 → 80%) — ancestor check semua mutasi List
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 44 file / **289** test lulus (test baru `[Review-CL-02][INV-LIFE-001]`: Board di-archive lalu update/archive/delete List local ACTIVE ketiganya DITOLAK AncestorNotActiveError, row tak berubah, nol activity); `pnpm -r typecheck` Done; `pnpm lint` bersih. Fix: `commitMutation` list-repository memuat ancestor check chain Board→Milestone→Project via `isEffectivelyOperational` untuk SEMUA operasi; restore tetap `evaluateRestore`; signature `loadAncestorStates(tx, boardId)` disederhanakan.
**Catatan:** Seluruh test list lama (16) tetap hijau — termasuk FR-022/BR-013 Card descendant utuh.

<a id="cl-35"></a>
### CL-35 — 2026-08-23 · goal 2.6.1 dibuka kembali untuk perbaikan (⚠️ → 🔄 · 60%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.6.1 `⚠️/60/P0` per Review-CL-02 + QA-CL-10 (pola bug sama). Fix terbukti di milestone (b992966) dan board (1f7dd0a) direplikasi ke list-repository; chain 3 level Board→Milestone→Project.
**Catatan:** Setelah fix ini, 2.7.2/2.7.3 cukup ditambah skenario HTTP (per QA-CL-12/13).

<a id="cl-34"></a>
### CL-34 — 2026-08-23 · goal 2.4.1 perbaikan selesai sisi Dev (⚠️ → 🔄 → 🔎 · 60 → 80%) — ancestor check semua mutasi Board
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 44 file / **288** test lulus (test baru `[Review-CL-02][INV-LIFE-001]`: Project di-archive lalu update/archive/delete Board local ACTIVE ketiganya DITOLAK AncestorNotActiveError, row tak berubah, nol activity); `pnpm -r typecheck` Done; `pnpm lint` bersih. Fix: `commitMutation` board-repository memuat ancestor check Milestone+Project via `isEffectivelyOperational` untuk SEMUA operasi; restore tetap `evaluateRestore` dengan chain yang sama.
**Catatan:** Seluruh test board lama tetap hijau — tidak ada regresi. Pesan error menyebut blocker spesifik (Milestone vs Project).

<a id="cl-33"></a>
### CL-33 — 2026-08-23 · goal 2.4.1 dibuka kembali untuk perbaikan (⚠️ → 🔄 · 60%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.4.1 `⚠️/60/P0` per Review-CL-02 + QA-CL-06 (pola bug sama dengan 2.2.1). Fix yang sudah terbukti di milestone-repository (commit `b992966`) direplikasi ke board-repository.
**Catatan:** Ancestor Board = Milestone+Project — keduanya harus ACTIVE untuk semua operasi.

<a id="cl-32"></a>
### CL-32 — 2026-08-23 · goal 2.2.1 perbaikan selesai sisi Dev (⚠️ → 🔄 → 🔎 · 60 → 80%) — ancestor check semua mutasi Milestone
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 44 file / **287** test lulus (test baru `[Review-CL-02][INV-LIFE-001]`: Project di-archive via DrizzleProjectRepository lalu update/archive/delete Milestone local ACTIVE ketiganya DITOLAK AncestorNotActiveError, row tak berubah, nol activity milestone); `pnpm -r typecheck` Done; `pnpm lint` bersih. Fix: `commitMutation` milestone-repository kini memuat `isEffectivelyOperational([projectState])` untuk SEMUA operasi (update/archive/delete/restore) setelah version+local-state check; restore tetap memakai `evaluateRestore` yang lebih spesifik (INV-LIFE-002/004).
**Catatan:** Test lama "restore saat Project ARCHIVED" dan "Project DELETED → create ditolak" tetap hijau — tidak ada regresi.

<a id="cl-31"></a>
### CL-31 — 2026-08-23 · goal 2.2.1 dibuka kembali untuk perbaikan (⚠️ → 🔄 · 60%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.2.1 `⚠️/60/P0` dengan Review-CL-02 (root cause: teks goal lama salah membatasi ancestor-check ke create/restore; INV-LIFE-001 SOT mensyaratkan semua mutasi). Teks goal amendemen + QA-CL-02 dibaca ulang dari disk.
**Catatan:** Fix: `update/archive/delete` Milestone wajib `isEffectivelyOperational([projectState])` sebelum mutasi + test eksplisit sesuai Test yang diamendemen.

<a id="cl-30"></a>
### CL-30 — 2026-08-23 · goal 2.8.2 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — update/archive/restore/delete Card
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 44 file / **286** test lulus; `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi di `DrizzleCardRepository.commitMutation`: urutan version check (AC-020) → local-state A.3 → **ancestor effective-state check via `isEffectivelyOperational` untuk SEMUA operasi termasuk update/archive/delete** (INV-LIFE-001, sesuai amendemen Review-CL-02) → restore via `evaluateRestore` (BR-045A blanket — tidak ada syarat aktor sama) → UPDATE dijaga `AND version = expected` → Activity atomik; ganti assignee validasi membership aktif (FR-026); `list_id` tidak pernah disentuh (BR-017/061/062); creator_user_id tidak berubah (BR-025/FR-025).
**Catatan:** Test eksplisit Review-CL-02: Project ARCHIVED + Card local ACTIVE → update/archive/delete ketiganya DITOLAK AncestorNotActiveError tanpa perubahan/activity; restore blanket User B sukses; assignee non-member ditolak di create dan update.

<a id="cl-28"></a>
### CL-28 — 2026-08-23 · goal 2.8.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — createCard + assignee validation
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 44 file / **286** test lulus (test baru `packages/infrastructure/test/card-commands.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: modul domain `card/` (CardRepository, CardRecord, error kanonik) + `DrizzleCardRepository` — createCard dengan chain 4 level List→Board→Milestone→Project via `loadAncestorStates`+`isEffectivelyOperational` (INV-LIFE-001); creator_user_id = actor historis (FR-025); assignee opsional maks 1 divalidasi via dep ter-inject `assertAssigneeActiveMember` (03-ENG A.5 app-level FK lintas DB; produksi akan memakai `requireActiveMember` Global DB, test memakai tabel member nyata di DB test); payload Activity B.5.
**Catatan:** Smoke placeholder `getCard` pada ProjectRepository DIHAPUS dan digantikan `DrizzleCardRepository.getCard` (pola yang sama dengan 2.2.1) — CardRecord kini milik modul card.

<a id="cl-27"></a>
### CL-27 — 2026-08-23 · goal 2.8.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.8.1 `⬜️/—/0/P0`, dependency `2.1, 2.6` → 2.1.1 `🔎/80%` commit `641ed22`, 2.6.1 `🔎/80%` commit `8940788` (suite 271 hijau). Referensi dibaca ulang dari disk: FR-024–026, C.8, BR-021, 03-ENG A.5; validator kandidat `requireActiveMember` (project-admin.ts) diverifikasi signature-nya.
**Catatan:** Validator assignee di-inject ke DrizzleCardRepository (app-level FK lintas DB); creator_user_id = actor (FR-025).

<a id="qa-cl-13"></a>
### QA-CL-13 — 2026-08-23 · goal 2.7.3 🔎 → ⚠️ — archive/delete List warisi bug ancestor-check Review-CL-02 (restore tidak terdampak)
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `apps/api/test/lists-lifecycle.test.ts` (4 test) hijau — tapi tidak menguji skenario ini sama sekali (celah sama, tidak diminta teks goal sebelum diperbaiki Review-CL-02). Endpoint `archive`/`delete` (`routes/lists.ts` lifecycleCommands) memanggil `archiveList`/`deleteList` di `list-repository.ts` — fungsi yang SAMA yang dikonfirmasi Review-CL-02 tidak memanggil `isEffectivelyOperational` sama sekali. `restore` memanggil `restoreList` yang memakai `evaluateRestore` dengan benar — TIDAK terdampak.
**Kesimpulan:** ⚠️ REJECT untuk goal ini (archive+restore+delete dibundel satu goal, 2 dari 3 action rusak) — bukan bug baru, murni pewarisan Review-CL-02 yang belum sampai ke layer HTTP List. Tidak perlu re-audit terpisah setelah 2.6.1 diperbaiki — cukup re-run test existing + tambahan skenario ancestor-saat-mutasi begitu perbaikan repository (2.6.1) landing, karena endpoint ini hanya meneruskan panggilan tanpa logika sendiri.

<a id="qa-cl-12"></a>
### QA-CL-12 — 2026-08-23 · goal 2.7.2 🔎 → ⚠️ — PATCH List warisi bug ancestor-check Review-CL-02, dikonfirmasi live di layer HTTP
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `apps/api/test/lists-patch.test.ts` (5 test) hijau — tidak menguji skenario "ancestor non-ACTIVE, local List ACTIVE" (celah yang sama seperti 2.6.1, goal text lama tidak memintanya). Direproduksi live via test throwaway (dihapus setelah run): seed Project→Milestone→Board→List lengkap ACTIVE, archive Project langsung di DB, lalu `PATCH /projects/:id/lists/:list_id` (title berubah) — **hasil 200 OK, title berubah, version naik ke 2** — seharusnya ditolak `INVALID_STATE`/`AncestorNotActiveError` per INV-LIFE-001. Root cause identik Review-CL-02: `PATCH` di `routes/lists.ts` memanggil `updateList` di `list-repository.ts`, fungsi yang sama yang dikonfirmasi Review tidak memanggil ancestor-check sama sekali.
**Kesimpulan:** ⚠️ REJECT — bukan bug baru terpisah, murni pewarisan gap yang sama dari 2.6.1 (root cause di layer repository, endpoint HTTP cuma meneruskan panggilan). Tidak butuh perbaikan endpoint sendiri — begitu `updateList` diperbaiki (2.6.1), 2.7.2 otomatis ikut benar; QA re-run cukup re-test skenario ancestor-saat-update di level HTTP untuk konfirmasi propagasi, bukan audit ulang dari nol.

<a id="qa-cl-11"></a>
### QA-CL-11 — 2026-08-23 · goal 2.7.1 🔎 → ✅ — create+get List via pipeline, tidak terdampak bug Review-CL-02
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `apps/api/test/lists-create-get.test.ts` (4 test) dijalankan ulang — hijau. `POST` memanggil `createList` yang SUDAH benar memvalidasi ancestor chain 3-level sebelum insert (dikonfirmasi tidak terdampak temuan Review-CL-02 — hanya update/archive/delete yang bermasalah, create/restore sudah benar sejak awal). `GET` tanpa mutation, tidak relevan dengan bug ancestor-check. Owner-only interim untuk create, membership-only untuk read — konsisten pola Milestone/Board.
**Kesimpulan:** ✅ ACCEPT — goal ini secara struktural tidak menyentuh jalur yang cacat.

<a id="cl-26"></a>
### CL-26 — 2026-08-23 · goal 2.7.3 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — endpoint lifecycle List
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 43 file / **271** test lulus (4 test integration baru `apps/api/test/lists-lifecycle.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: `POST .../lists/:list_id/{archive,restore,delete}` via `lifecycleCommands` di routes/lists.ts — Owner-only interim, expected_version wajib, envelope `{data:{list}}`.
**Catatan:** Test: archive ACTIVE → sukses lalu diulang INVALID_STATE; restore ARCHIVED sukses; setelah Board di-archive manual → restore List ditolak INVALID_STATE (blokade ancestor level HTTP); version mismatch ketiga action → VERSION_CONFLICT (AC-020); authz lengkap (403/401) dan 404.

<a id="cl-25"></a>
### CL-25 — 2026-08-23 · goal 2.7.3 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.7.3 `⬜️/—/0/P1`, dependency `2.6, 2.7.1` → keduanya `🔎/80%` (commit `8940788`, `27a5121`; suite 267 hijau).
**Catatan:** Pola lifecycleCommands sama seperti boards.ts; restore List divalidasi terhadap chain Board→Milestone→Project.

<a id="cl-24"></a>
### CL-24 — 2026-08-23 · goal 2.7.2 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — endpoint PATCH List
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 42 file / **267** test lulus (5 test integration baru `apps/api/test/lists-patch.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: `PATCH /v1/projects/:project_id/lists/:list_id` — Owner-only interim, hanya field `title` + `expected_version` wajib; field lain (`board_id`, `status`, `position`, `wip_limit`) → VALIDATION_ERROR 400 (C.15/FR-023); Activity `list.updated{changes}`.
**Catatan:** Test negatif: AC-020 version mismatch tanpa perubahan; PERMISSION_DENIED non-Owner member; TOKEN_EXPIRED; 404 list tidak ada.

<a id="cl-23"></a>
### CL-23 — 2026-08-23 · goal 2.7.2 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.7.2 `⬜️/—/0/P1`, dependency `2.6, 2.7.1` → 2.6.1 `🔎/80%` commit `8940788`, 2.7.1 `🔎/80%` commit `27a5121` (suite 262 hijau).
**Catatan:** PATCH List hanya field title + expected_version.

<a id="cl-22"></a>
### CL-22 — 2026-08-23 · goal 2.7.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — endpoint POST+GET List
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 41 file / **262** test lulus (4 test integration baru `apps/api/test/lists-create-get.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: router `apps/api/src/routes/lists.ts` — `POST /v1/projects/:project_id/boards/:board_id/lists` (Owner-only interim; body title saja sesuai FR-021; VALIDATION_ERROR untuk title invalid) + `GET /v1/projects/:project_id/lists/:list_id` (member via pipeline, 404); envelope `{data:{list}}`; wiring `buildListRoutesDeps` + mount index.ts.
**Catatan:** Test TASK-2.7: board Project lain maupun ID asing → RESOURCE_NOT_FOUND (boundary DB-per-project); non-member 403 PROJECT_ACCESS_DENIED; tanpa identitas 401 TOKEN_EXPIRED. DoD "List tidak punya operasi move" — tidak ada route move yang diekspos (INV-MOVE-001).

<a id="cl-21"></a>
### CL-21 — 2026-08-23 · scope TASK-2.7–2.11 dikonfirmasi; goal 2.7.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.7.1 `⬜️/—/0/P0`, dependency `2.6` → 2.6.1 `🔎/80%` commit `8940788` (suite 258 hijau, working tree bersih). Manusia mengonfirmasi scope baru TASK-2.7–2.11 (2.12 tidak termasuk). Referensi dibaca ulang dari disk: C.7/C.8, INV-MOVE-001–004 (02-SPEC A.5), BR-017/018/021/044/045A/061/062, FR-024–026, 03-ENG A.5 (app-level FK) & A.6.
**Catatan:** Urutan goal: 2.7.x → 2.8.x → 2.9.x → 2.10.1 → 2.11.1. 2.10 invariant-critical sesuai §11.2.

<a id="cl-20"></a>
### CL-20 — 2026-08-23 · goal 2.6.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — domain command List chain 3 level
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 40 file / **258** test lulus (16 test baru `packages/infrastructure/test/list-commands.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: (1) modul domain `list/` — interface `ListRepository`, `ListRecord` hanya title (FR-021 title bebas, FR-023 tanpa status), error kanonik; (2) `DrizzleListRepository`: createList memvalidasi chain 3 level Board→Milestone→Project via `loadAncestorStates` + `isEffectivelyOperational` (INV-LIFE-001; board tidak ada → RESOURCE_NOT_FOUND); restore via `evaluateRestore(local, [board, milestone, project])`; urutan version check → state machine A.3 → UPDATE `AND version = expected` (AC-020); mutation+Activity atomik; payload B.5 (`list.created{snapshot}`, `.updated{changes}`, `.archived/.restored/.deleted{previous_state}`).
**Catatan:** Bug ditemukan & diperbaiki saat test negatif Milestone ARCHIVED: SELECT boards di `loadAncestorStates` awalnya tidak mengambil `milestone_id` sehingga chain terpotong — test menangkapnya, query diperbaiki. DoD FR-022/BR-013 terbukti eksplisit: archive dan delete List masing-masing diverifikasi row Card `SELECT *` identik before vs after (state/version/list_id utuh), tanpa activity card.

<a id="cl-19"></a>
### CL-19 — 2026-08-23 · goal 2.6.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.6.1 `⬜️/—/0/P0`, dependency `2.1, 2.4` → 2.1.1 `🔎/80%` commit `641ed22`, 2.4.1 `🔎/80%` commit `6f5416d` (suite 242 hijau). FR-021/022/023 + teks penuh TASK-2.6 dibaca dari disk.
**Catatan:** Chain 3 level Board→Milestone→Project; archive/delete List wajib terbukti tidak cascade ke Card (assert row Card sebelum/sesudah).

<a id="cl-18"></a>
### CL-18 — 2026-08-23 · goal 2.5.3 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — endpoint lifecycle Board
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 39 file / **242** test lulus (7 test integration baru `apps/api/test/boards-lifecycle.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: `POST .../boards/:board_id/{archive,restore,delete}` via helper `lifecycleCommands` di routes/boards.ts — Owner-only interim, `expected_version` wajib, envelope `{data:{board}}`.
**Catatan:** Test mencakup Test TASK-2.5: restore Board saat Milestone masih ARCHIVED → INVALID_STATE 409, lalu setelah Milestone dipulihkan → sukses (urutan INV-LIFE-002 di level HTTP); archive/delete sukses lalu diulang → INVALID_STATE; version mismatch ketiga action → VERSION_CONFLICT (AC-020); expected_version hilang → VALIDATION_ERROR; TOKEN_EXPIRED / PERMISSION_DENIED / RESOURCE_NOT_FOUND.

<a id="cl-17"></a>
### CL-17 — 2026-08-23 · goal 2.5.3 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.5.3 `⬜️/—/0/P1`, dependency `2.4, 2.5.1` → keduanya `🔎/80%` (commit `6f5416d`, `d5447e1`; suite 235 hijau).
**Catatan:** Pola lifecycleCommands sama seperti milestones.ts; restore Board divalidasi terhadap Milestone+Project (INV-LIFE-002).

<a id="cl-16"></a>
### CL-16 — 2026-08-23 · goal 2.5.2 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — endpoint PATCH Board
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 38 file / **235** test lulus (5 test integration baru `apps/api/test/boards-patch.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: `PATCH /v1/projects/:project_id/boards/:board_id` — Owner-only interim (PERMISSION_DENIED 403), hanya field `title/description` + `expected_version` wajib; field lain (`progress`, `wip_limit`, `status`, `milestone_id`) → VALIDATION_ERROR 400 (C.15 + FR-019); description eksplisit null menghapus nilai; Activity `board.updated{changes}`.
**Catatan:** Test negatif: C.15/FR-019 protected fields ditolak, version mismatch → VERSION_CONFLICT tanpa perubahan (AC-020), non-Owner member → PERMISSION_DENIED, expected_version hilang → VALIDATION_ERROR, board tidak ada → RESOURCE_NOT_FOUND.

<a id="cl-15"></a>
### CL-15 — 2026-08-23 · goal 2.5.2 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.5.2 `⬜️/—/0/P1`, dependency `2.4, 2.5.1` → 2.4.1 `🔎/80%` commit `6f5416d`, 2.5.1 `🔎/80%` commit `d5447e1` (suite 230 hijau).
**Catatan:** PATCH Board hanya title/description + expected_version; pola sama PATCH Milestone.

<a id="cl-14"></a>
### CL-14 — 2026-08-23 · goal 2.5.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — endpoint POST+GET Board
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 37 file / **230** test lulus (7 test integration baru `apps/api/test/boards-create-get.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: (1) router `apps/api/src/routes/boards.ts` — `POST /v1/projects/:project_id/milestones/:milestone_id/boards` (Owner-only interim; body `{title, description}`; VALIDATION_ERROR untuk title kosong/salah tipe) + `GET /v1/projects/:project_id/boards/:board_id` (member via pipeline, 404 bila tidak ada); envelope `{data:{board}}`; wiring `buildBoardRoutesDeps` + helper `buildProjectContextDeps` bersama (cached project client factory + turso env — konsisten jalur produksi projects), mount di index.ts.
**Catatan:** Test TASK-2.5: Project-boundary — milestone milik Project lain maupun ID asing → RESOURCE_NOT_FOUND 404 (isolation DB-per-project; tidak ada kebocoran data); create pada Milestone ARCHIVED → INVALID_STATE 409 (INV-LIFE-001); non-member → PROJECT_ACCESS_DENIED; tanpa identitas → TOKEN_EXPIRED. Test restore Board saat Milestone ARCHIVED di level HTTP menyusul di 2.5.3 (sudah tercakup unit CL-12).

<a id="cl-13"></a>
### CL-13 — 2026-08-23 · goal 2.5.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.5.1 `⬜️/—/0/P0`, dependency `2.4` → 2.4.1 `🔎/80%` commit `6f5416d` (suite 223 hijau). Kontrak C.6 dibaca ulang dari disk: create nested di bawah milestone, GET/PATCH/lifecycle flat.
**Catatan:** Router boards.ts pola sama milestones.ts; boundary "milestone_id Project lain" ditegakkan isolation DB-per-project → MilestoneNotFoundError.

<a id="cl-12"></a>
### CL-12 — 2026-08-23 · goal 2.4.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — domain command Board
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 36 file / **223** test lulus (15 test baru `packages/infrastructure/test/board-commands.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: (1) modul domain `board/` — interface `BoardRepository` (get/create/update/archive/restore/delete), `BoardRecord` + input types hanya title/description (FR-019 — tanpa status/warna/ikon/WIP), error classes bercode kanonik; (2) `DrizzleBoardRepository`: createBoard memvalidasi chain 2 level via utility 2.1 (`isEffectivelyOperational([milestoneState, projectState])` — INV-LIFE-001 "satu ancestor saja cukup untuk menolak"; milestone tidak ada → MilestoneNotFoundError RESOURCE_NOT_FOUND); restore via `evaluateRestore(local, [milestone, project])` (INV-LIFE-002) dengan pesan blocker spesifik per level; urutan wajib version check → state machine A.3 → UPDATE dijaga `AND version = expected` (AC-020); mutation+Activity atomik satu transaksi; payload Activity B.5 (`board.created{snapshot}`, `.updated{changes}`, `.archived/.restored/.deleted{previous_state}`). (3) `AncestorNotActiveError` dipindah ke `lifecycle/lifecycle-errors.ts` bersama agar Board/List/Card tidak bergantung modul milestone; helper test `truncateAll` diperbaiki urutan child-first (FK constraint).
**Catatan:** Test mencakup seluruh Test goal: create ditolak saat Milestone ARCHIVED/DELETED walau Project ACTIVE; create ditolak saat Project ARCHIVED/DELETED walau Milestone ACTIVE; restore ditolak jika salah satu dari 2 ancestor non-ACTIVE (kedua arah); VERSION_CONFLICT tanpa perubahan/activity; struktur record tanpa field non-MVP; DoD BR-013 terbukti — archive Board tidak mengubah archived_at/deleted_at/updated_at/version List & Card descendant dan hanya menghasilkan Activity board.

<a id="cl-11"></a>
### CL-11 — 2026-08-23 · goal 2.4.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.4.1 `⬜️/—/0/P0`, dependency `2.1, 2.2` → 2.1.1 `🔎/80%` commit `641ed22`, 2.2.1 `🔎/80%` commit `e084866` (suite 208 hijau). Schema boards (milestone_id FK) + FR-018/FR-019 dibaca ulang dari disk.
**Catatan:** AncestorNotActiveError dipindah ke modul lifecycle bersama agar Board/List/Card tidak bergantung pada modul milestone.

<a id="cl-10"></a>
### CL-10 — 2026-08-23 · goal 2.3.3 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — endpoint lifecycle Milestone
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 35 file / **208** test lulus (9 test integration baru `apps/api/test/milestones-lifecycle.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: `POST .../milestones/:milestone_id/{archive,restore,delete}` via helper `lifecycleCommands` (pola `handleLifecycle` Project): Owner-only interim → PERMISSION_DENIED 403; `expected_version` wajib dari body → VALIDATION_ERROR 400 bila hilang/salah bentuk; response envelope `{data:{milestone}}`; Activity `previous_state` diverifikasi lewat command-level test CL-04 dan state transition di level HTTP.
**Catatan:** Test mencakup: archive ACTIVE sukses lalu archive ulang ditolak INVALID_STATE; restore ARCHIVED saat Project ACTIVE sukses (INV-LIFE-002); restore DELETED ditolak (INV-LIFE-004); delete ACTIVE sukses lalu delete ulang ditolak; version mismatch pada ketiga action → VERSION_CONFLICT (AC-020); non-Owner member → PERMISSION_DENIED; tanpa identitas → TOKEN_EXPIRED; milestone tidak ada → RESOURCE_NOT_FOUND.

<a id="cl-09"></a>
### CL-09 — 2026-08-23 · goal 2.3.3 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.3.3 `⬜️/—/0/P1`, dependency `2.2, 2.3.1` → keduanya `🔎/80%` (commit `e084866`, `8bd1ba0`; suite 199 hijau). Pola `handleLifecycle` Project (TASK-1.4) dibaca ulang dari disk (routes/projects.ts).
**Catatan:** Tiga endpoint lifecycle dengan pola handleLifecycle Milestone; restore lewat evaluateRestore (ancestor Project).

<a id="cl-08"></a>
### CL-08 — 2026-08-23 · goal 2.3.2 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — endpoint PATCH Milestone
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 34 file / **199** test lulus (6 test integration baru `apps/api/test/milestones-patch.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: `PATCH /v1/projects/:project_id/milestones/:milestone_id` di routes/milestones.ts — Owner-only interim (PERMISSION_DENIED 403 untuk member non-Owner), hanya menerima field `title/description/progress/start_date/due_date` + `expected_version` wajib; field domain-controlled lain (`id`, `version`, `archived_at`, `deleted_at`, `list_id`) → VALIDATION_ERROR 400 (C.15); payload invalid bentuk → VALIDATION_ERROR 400 bukan INVALID_STATE (SOT 2.3.0); Activity `milestone.updated{changes:{before,after}}` diverifikasi isinya per field yang benar-benar berubah.
**Catatan:** Test negatif: C.15 protected fields ditolak; version mismatch → VERSION_CONFLICT 409 tanpa perubahan (AC-020); non-Owner member → PERMISSION_DENIED 403; milestone ARCHIVED → INVALID_STATE 409 (INV-LIFE-003); title kosong/progress range/salah tipe → VALIDATION_ERROR.

<a id="cl-07"></a>
### CL-07 — 2026-08-23 · goal 2.3.2 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.3.2 `⬜️/—/0/P1`, dependency `2.2, 2.3.1` → 2.2.1 `🔎/80%` commit `e084866`, 2.3.1 `🔎/80%` commit `8bd1ba0` (suite 193 hijau). C.5 + C.15 dibaca ulang dari disk saat persiapan.
**Catatan:** PATCH hanya field domain `title/description/progress/start_date/due_date`; `expected_version` wajib; payload invalid → VALIDATION_ERROR (bukan INVALID_STATE, SOT 2.3.0).

<a id="cl-06"></a>
### CL-06 — 2026-08-23 · goal 2.3.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — endpoint POST+GET Milestone
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 33 file / **193** test lulus (9 test integration baru `apps/api/test/milestones-create-get.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: (1) router baru `apps/api/src/routes/milestones.ts` — `POST /v1/projects/:project_id/milestones` (Owner-only interim via `openProjectContext` → PERMISSION_DENIED 403 untuk non-Owner; body C.5 snake_case `title/description/progress/start_date/due_date`; VALIDATION_ERROR 400 untuk title kosong, progress bukan integer 0–100, field salah tipe, body bukan JSON; 201 envelope `{data:{milestone:{...}}}` camelCase) + `GET .../milestones/:milestone_id` (member aktif via pipeline; RESOURCE_NOT_FOUND 404); (2) wiring produksi `buildMilestoneRoutesDeps` di project-deps.ts + mount di index.ts; helper `readJsonObject`/`toApiErrorResponse` di-reuse dari projects.ts (diekspor), tanpa duplikasi; `MilestoneRecord` kini di-re-export infrastructure.
**Catatan:** Test mencakup Test bersama TASK-2.3 yang relevan: create tanpa identitas → TOKEN_EXPIRED 401; create Project ARCHIVED → INVALID_STATE 409 (INV-LIFE-001); non-member read/create → PROJECT_ACCESS_DENIED 403 tanpa kebocoran; payload invalid → VALIDATION_ERROR 400; verifikasi row DB + Activity milestone.created pada Project DB yang benar (Project-boundary). Test update/lifecycle non-Owner → PERMISSION_DENIED menyusul di 2.3.2/2.3.3 sesuai goal masing-masing.

<a id="cl-05"></a>
### CL-05 — 2026-08-23 · goal 2.3.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.3.1 `⬜️/—/0/P0`, dependency `2.2` → goal 2.2.1 `🔎/80%` commit `e084866` (16 test lulus, suite 184 hijau). Teks penuh TASK-2.3 (Test bersama + DoD) dibaca ulang dari disk.
**Catatan:** Rencana: router milestone baru di `apps/api/src/routes/milestones.ts` memakai pola `OpenProjectContext` + pipeline yang sama dengan projects.ts; Owner-only interim untuk create.

<a id="cl-04"></a>
### CL-04 — 2026-08-23 · goal 2.2.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — domain command Milestone
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 32 file / **184** test lulus (16 test baru `packages/infrastructure/test/milestone-commands.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih; smoke repository lulus. Implementasi: (1) modul domain baru `milestone/` — interface `MilestoneRepository` (get/create/update/archive/restore/delete, semua mutation menerima projectId untuk ancestor Project), input types (`UpdateMilestoneInput` field opsional dengan semantik undefined=tidak disentuh/null=hapus), error classes bercode kanonik (`RESOURCE_NOT_FOUND`, `VERSION_CONFLICT`, `INVALID_STATE`, `VALIDATION_ERROR`); `MilestoneRecord` dipindah ke modul ini; (2) `DrizzleMilestoneRepository`: urutan wajib version check → state machine A.3 (`update/archive:[ACTIVE]`, `restore:[ARCHIVED]`, `delete:[ACTIVE|ARCHIVED]`) → ancestor check via utility 2.1 (`isEffectivelyOperational` untuk create; `evaluateRestore` untuk restore — INV-LIFE-002/004), UPDATE dijaga `AND version = expected` (AC-020 tidak bisa dibypass), mutation+Activity satu transaksi BEGIN IMMEDIATE (INV #8/#9); payload Activity sesuai B.5 v1.0.2 (`milestone.created{snapshot}`, `.updated{changes:{before,after}}`, `.archived/.restored{previous_state}`, `.deleted{previous_state}`); FR-014 progress integer 0–100 + title non-empty; FR-015 progress manual (tidak ada kalkulasi otomatis); FR-016 tidak ada field status; (3) smoke `createMilestone/listMilestones` DIHAPUS dari interface+impl Project dan script smoke-repository disesuaikan — digantikan domain command penuh, bukan diperluas.
**Catatan:** Test negatif mencakup: create saat Project ARCHIVED/DELETED, update dari ARCHIVED, archive dari ARCHIVED, delete dari DELETED, restore saat Project ARCHIVED (row tak berubah), restore entity DELETED, expectedVersion salah tanpa perubahan/activity, milestone tidak ada, patch tanpa perubahan, title kosong, progress di luar range. Error mapping "Project tidak ditemukan" pada ancestor check memakai INVALID_STATE (DB per-project harus punya project_state; ketiadaan = state korup).

<a id="cl-03"></a>
### CL-03 — 2026-08-23 · goal 2.2.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.2.1 `⬜️/—/0/P0`, dependency `2.1` → goal 2.1.1 `🔎/80%` commit `641ed22` (implementasi + 11 test lulus, suite penuh 168 lulus — terpenuhi fungsional; verifikasi QA menyusul). Smoke `createMilestone/listMilestones` dipetakan pemakaiannya: hanya `packages/infrastructure/scripts/smoke-repository.ts` + interface/impl Phase 0.
**Catatan:** MilestoneRecord dipindah ke modul `milestone/`; smoke method digantikan domain command penuh (bukan diperluas); `getCard` tetap sampai TASK-2.8.

<a id="cl-02"></a>
### CL-02 — 2026-08-23 · goal 2.1.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — effective-state utility entity-agnostic
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 31 file / **168** test lulus (11 test baru di `packages/domain/test/effective-state.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: (1) modul baru `packages/domain/src/lifecycle/effective-state.ts` — `resolveLifecycleState` (BR-011), helper `isActive`/`isArchived`/`isDeleted` (BR-012), `isEffectivelyOperational(chain)` (INV-LIFE-001/BR-014), `evaluateRestore(entityState, ancestorStates)` (INV-LIFE-002+004, hasil terdiskriminasi `ENTITY_DELETED`/`ENTITY_NOT_ARCHIVED`/`ANCESTOR_NOT_ACTIVE` + index ancestor pemblokir); (2) `resolveProjectLifecycle` Phase 1 kini **delegasi** ke modul baru + type alias `ProjectLifecycleState = LifecycleState` — nol duplikasi logika; (3) export domain index diperluas. Test mencakup seluruh kombinasi wajib Test goal: deletedAt menang archivedAt, chain 4-level ACTIVE→operational, satu ancestor ARCHIVED/DELETED→non-operational tanpa menyentuh local state descendant, restore ARCHIVED+ancestor semua ACTIVE diizinkan, restore ditolak saat ancestor non-ACTIVE atau entity DELETED.
**Catatan:** Utility menerima state ter-resolve (bukan akses DB) sesuai Test "unit murni"; caller menentukan mapping error.

<a id="cl-01"></a>
### CL-01 — 2026-08-23 · goal 2.1.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 2.1.1 `⬜️/—/0/P0`, dependency kosong, repo bersih (hanya `.claude/` untracked), HEAD `0f8b865`. Discovery sesi ditampilkan dan scope TASK-2.1–2.6 dikonfirmasi manusia. Baseline §2.1 dibaca: AGENTS.md penuh, PHASE-2-TASKS.md penuh, 02-SPEC A.3 (INV-LIFE-001–004, BR-011/012), A.4 (BR-013/014/015), A.7, A.8, A.16, B.5 (payload Activity), C.5; 03-ENG A.4–A.7, B.5; 04-DELIVERY C.3–C.4; 01-PRODUCT §0.4.
**Catatan:** Rencana: modul baru `packages/domain/src/lifecycle/effective-state.ts` (entity-agnostic), `resolveProjectLifecycle` lama jadi delegasi/alias — bukan duplikasi.

<a id="review-cl-01"></a>
### Review-CL-01 — 2026-08-23 · generate task list Phase 2 (tanpa perubahan status implementasi)
**Role:** AI-Planning & Review · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca penuh `02-SPEC.md` (Part A–D, versi 2.5.2 — sudah mencakup seluruh amandemen BR-034A/045A/054A/054B) dan `03-ENGINEERING.md` Part A (A.6–A.7) + Part B (B.2–B.7). Periksa state repo aktual: `packages/infrastructure/src/database/project-schema.ts` dikonfirmasi sudah punya seluruh tabel Milestone/Board/List/Card/Label/Activity sejak Phase 0 — tidak perlu migration baru. `RequestPipeline` (Phase 0) dan pola `runInWriteTransaction`+`resolveProjectLifecycle` (Phase 1 TASK-1.1) dikonfirmasi reusable langsung untuk Phase 2.
**Ambiguitas ditemukan & diklarifikasi:** 04-DELIVERY C.1 menulis scope Phase 2 sebagai "CRUD" tanpa eksplisit menyebut archive/restore/delete, sementara Phase 5 eksplisit disebut "Archive/Restore untuk seluruh entity" — berpotensi berarti Phase 2 hanya create/read/update. Dicek silang: kontrak API C.5–C.8 (02-SPEC) sudah lengkap mendefinisikan archive/restore/delete utk keempat entity, dan mapping acuan Phase 2 (04-DELIVERY C.2) menunjuk C.5–C.8 utuh — bukan cuma bagian create. Diajukan ke manusia sebagai pertanyaan eksplisit (bukan diputuskan sendiri, karena menyentuh lifecycle semantics/phase boundary): **manusia memutuskan Phase 2 mencakup archive/restore/delete penuh**, dengan ancestor-chain check dasar dibangun sekarang (TASK-2.1) dan Phase 5 mengeraskan mekanismenya nanti. Dicatat di Prinsip #1, bukan amandemen SOT (tidak mengubah BR/FR manapun, murni klarifikasi urutan fase kerja).
**Catatan tambahan:** Task list ini ditampilkan untuk direview manusia sebelum implementasi dimulai (04-DELIVERY C.6.6). Prinsip #2–#6 mendokumentasikan batas scope eksplisit (otorisasi tetap interim, Activity tetap ditulis walau tabelnya "nominal" Phase 3, Label/visibility di luar scope, Card move butuh model kuat) agar Dev tidak mengarang perilaku di luar yang diminta. Tidak ada dependency baru (stack sama seperti Phase 0/1, tidak perlu revalidasi versi A.8).

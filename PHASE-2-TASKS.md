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
6. **Card move (TASK-2.10/2.11) menyentuh invariant inti #5** (hanya Card movable, cross-board hanya dalam Milestone sama) — sesuai AGENTS.md §11.2, goal ini **WAJIB model lebih kuat**, jangan diserahkan ke model ringan.

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
| 2.1.1 | 🔎 | [CL-02](#cl-02)<br>[CL-01](#cl-01) | 80 | P0 | Bangun utility domain (mis. `packages/domain/src/lifecycle/effective-state.ts`) untuk: (a) resolusi lifecycle satu entity dari `{archivedAt, deletedAt}` — **reuse/rename** `resolveProjectLifecycle` (`packages/domain/src/project/project-lifecycle.ts`, Phase 1) jadi entity-agnostic (mis. `resolveLifecycleState`), JANGAN duplikasi logika BR-011 (deletedAt menang atas archivedAt); (b) fungsi "effective operational" yang menerima chain state entity+seluruh ancestor (List→Board→Milestone→Project) dan mengembalikan apakah entity BENAR-BENAR operasional (INV-LIFE-001 — non-operational jika ADA satu saja ancestor ARCHIVED/DELETED, walau local state entity sendiri ACTIVE); (c) fungsi validasi restore (INV-LIFE-002 — hanya izinkan jika SELURUH ancestor ACTIVE, urutan tidak masalah karena semua harus ACTIVE bersamaan, bukan restore berurutan otomatis) | [02-SPEC A.3](docs/02-SPEC.md) (INV-LIFE-001–004), BR-011–015 | — |

**Test:** Unit murni (tanpa DB, terima record state sebagai input) — kombinasi state: entity ACTIVE + semua ancestor ACTIVE → operational; entity ACTIVE + satu ancestor ARCHIVED → TIDAK operational (tanpa mengubah local state descendant, BR-013/014); entity ARCHIVED + semua ancestor ACTIVE → restore diizinkan; entity ARCHIVED + satu ancestor ARCHIVED → restore ditolak (INV-LIFE-002); entity/ancestor manapun DELETED → restore selalu ditolak (INV-LIFE-004); `resolveLifecycleState` deletedAt menang atas archivedAt (BR-011) untuk seluruh kombinasi.
**DoD:** Utility dipakai seragam oleh TASK-2.2/2.4/2.6/2.8 (Milestone/Board/List/Card) — tidak ada entity yang reimplementasi logika ancestor-chain sendiri (DRY, hindari kelas masalah Review-CL-10 Temuan 5 Phase 1); `resolveProjectLifecycle` lama di-refactor jadi alias/reuse, bukan diduplikasi.

---

## TASK-2.2 — Milestone domain commands (repository layer)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.2.1 | 🔎 | [CL-04](#cl-04)<br>[CL-03](#cl-03) | 80 | P0 | Domain command Milestone (menggantikan smoke `createMilestone`/`listMilestones` di `project-repository.ts`, bukan memperluasnya): `createMilestone` (title/description/progress 0–100/start_date/due_date — FR-014; tolak jika Project tidak ACTIVE, BR-013/INV-LIFE-001), `updateMilestone` (title/description/progress/dates, `expected_version` wajib — progress diubah manual sesuai FR-015, TIDAK dihitung otomatis dari Board/List/Card), `archiveMilestone`, `restoreMilestone` (pakai 2.1 — ancestor = Project, hanya `project_state`), `deleteMilestone`. Setiap command: version check → validasi ancestor (create/restore) atau local-state (update/archive) → mutation+Activity (`milestone.created`/`milestone.updated`/`milestone.archived`/`milestone.restored`/`milestone.deleted`) atomik dalam satu `runInWriteTransaction`, payload sesuai konvensi B.5 | [02-SPEC A.3](docs/02-SPEC.md), [A.7](docs/02-SPEC.md), [A.8](docs/02-SPEC.md), BR-011–016, BR-019–028, FR-014, FR-015, FR-016; [03-ENG A.6](docs/03-ENGINEERING.md) | 2.1 |

**Test:** Unit — create ditolak jika Project ARCHIVED/DELETED; update/archive/delete dari state salah ditolak (state machine A.3); `expected_version` salah → `VERSION_CONFLICT` tanpa perubahan/Activity (AC-020); restore ditolak jika Project tidak ACTIVE; tidak ada field `status` (FR-016) — hanya `progress` manual (FR-015); Activity payload `changes`/`previous_state` sesuai B.5.
**DoD:** Seluruh 5 command atomik (mutation+Activity 1 transaksi); ancestor check dari 2.1 dipakai (bukan reimplementasi); tidak ada command yang bypass version check.

---

## TASK-2.3 — Milestone endpoints (HTTP)  (dep: 2.2)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.3.1 | ⬜️ | — | 0 | P0 | `POST /api/v1/projects/:project_id/milestones` + `GET .../milestones/:milestone_id` — pakai `RequestPipeline` (identity+membership+resolve DB), Owner-only interim utk create (Prinsip #2), balikan `{data:{milestone:{...}}}` konsisten C.2 | [02-SPEC C.5](docs/02-SPEC.md), FR-014 | 2.2 |
| 2.3.2 | ⬜️ | — | 0 | P1 | `PATCH /api/v1/projects/:project_id/milestones/:milestone_id` — field `title`/`description`/`progress`/`start_date`/`due_date` saja (C.15 generic PATCH tidak boleh ubah `id`/`version`/dst), `expected_version` wajib, Owner-only interim, payload invalid → `VALIDATION_ERROR` (bukan `INVALID_STATE`, konsisten SOT 2.3.0) | [02-SPEC C.5](docs/02-SPEC.md), [C.15](docs/02-SPEC.md), [C.2](docs/02-SPEC.md) | 2.2, 2.3.1 |
| 2.3.3 | ⬜️ | — | 0 | P1 | `POST .../milestones/:milestone_id/{archive,restore,delete}` — 3 domain command endpoint, `expected_version` wajib, Owner-only interim, pola `handleLifecycle` sama seperti Project (TASK-1.4) | [02-SPEC C.5](docs/02-SPEC.md), A.3 | 2.2, 2.3.1 |

**Test:** Integration — create tanpa identitas ditolak; create pada Project non-ACTIVE ditolak; read tanpa membership → `PROJECT_ACCESS_DENIED`; update/lifecycle oleh non-Owner → `PERMISSION_DENIED`; version mismatch → `VERSION_CONFLICT`; payload invalid (mis. `progress` bukan angka 0–100) → `VALIDATION_ERROR`; Project-boundary — Milestone Project lain tidak pernah bocor/tersentuh.
**DoD:** Endpoint sesuai kontrak C.5; response envelope C.2; field domain-controlled tidak bisa diubah via PATCH; seluruh test di atas hijau.

---

## TASK-2.4 — Board domain commands (repository layer)  (dep: 2.1, 2.2)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.4.1 | ⬜️ | — | 0 | P0 | Domain command Board: `createBoard` (title/description, FR-018; tolak jika Milestone ATAU Project tidak ACTIVE — ancestor chain 2 level, pakai 2.1), `updateBoard`, `archiveBoard`, `restoreBoard` (ancestor: Milestone+Project keduanya ACTIVE), `deleteBoard`. Board TIDAK punya status/warna/ikon/WIP limit (FR-019). Pola sama TASK-2.2: version check → ancestor/state validasi → mutation+Activity atomik | [02-SPEC A.3](docs/02-SPEC.md), BR-011–016, BR-019–028, FR-018, FR-019; [03-ENG A.6](docs/03-ENGINEERING.md) | 2.1, 2.2 |

**Test:** Unit — create ditolak jika Milestone ARCHIVED/DELETED (walau Project ACTIVE) DAN jika Project ARCHIVED/DELETED (walau Milestone local ACTIVE — INV-LIFE-001 "ada satu saja ancestor"); restore ditolak jika salah satu dari 2 ancestor tidak ACTIVE; `expected_version` salah → `VERSION_CONFLICT`; tidak ada field non-MVP (status/warna/ikon/WIP).
**DoD:** Ancestor chain 2-level (Milestone→Project) tervalidasi benar via 2.1; atomik mutation+Activity; archive Board tidak mengubah List/Card descendant (BR-013).

---

## TASK-2.5 — Board endpoints (HTTP)  (dep: 2.4)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.5.1 | ⬜️ | — | 0 | P0 | `POST /api/v1/projects/:project_id/milestones/:milestone_id/boards` + `GET .../boards/:board_id` — Owner-only interim create, validasi Milestone ada & di Project sama sebelum create | [02-SPEC C.6](docs/02-SPEC.md), FR-018 | 2.4 |
| 2.5.2 | ⬜️ | — | 0 | P1 | `PATCH .../boards/:board_id` — `title`/`description` saja, `expected_version` wajib | [02-SPEC C.6](docs/02-SPEC.md), [C.15](docs/02-SPEC.md) | 2.4, 2.5.1 |
| 2.5.3 | ⬜️ | — | 0 | P1 | `POST .../boards/:board_id/{archive,restore,delete}` | [02-SPEC C.6](docs/02-SPEC.md), A.3 | 2.4, 2.5.1 |

**Test:** Create Board dengan `milestone_id` milik Project lain → ditolak (Project-boundary); create pada Milestone ARCHIVED → ditolak; restore Board ditolak jika Milestone masih ARCHIVED (INV-LIFE-002 urutan — restore Milestone dulu baru Board); lifecycle + version-conflict pattern sama seperti TASK-2.3.
**DoD:** Endpoint sesuai C.6; Board tidak punya operasi move (INV-MOVE-001); archive/delete Board tidak menyentuh List/Card descendant.

---

## TASK-2.6 — List domain commands (repository layer)  (dep: 2.1, 2.4)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.6.1 | ⬜️ | — | 0 | P0 | Domain command List: `createList` (title bebas tanpa semantic bawaan, FR-021; ancestor chain 3 level — Board+Milestone+Project ACTIVE), `updateList`, `archiveList`, `restoreList` (ancestor 3-level ACTIVE semua), `deleteList`. List TIDAK punya field status (FR-023). Archive/delete List MUST NOT mengubah local state/parent relation Card descendant (FR-022, BR-013) — Card jadi non-operational efektif via 2.1, bukan cascade | [02-SPEC A.3](docs/02-SPEC.md), BR-011–016, BR-019–028, FR-021–023; [03-ENG A.6](docs/03-ENGINEERING.md) | 2.1, 2.4 |

**Test:** Create ditolak jika salah satu dari 3 ancestor (Board/Milestone/Project) tidak ACTIVE; archive List → Card descendant TIDAK berubah local state/version/parent (assert langsung ke row Card, bukan cuma response List); restore ditolak jika ancestor manapun belum ACTIVE.
**DoD:** Ancestor chain 3-level benar; archive/delete List terbukti TIDAK cascade ke Card (test eksplisit membaca row Card sebelum & sesudah).

---

## TASK-2.7 — List endpoints (HTTP)  (dep: 2.6)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.7.1 | ⬜️ | — | 0 | P0 | `POST /api/v1/projects/:project_id/boards/:board_id/lists` + `GET .../lists/:list_id` | [02-SPEC C.7](docs/02-SPEC.md), FR-021 | 2.6 |
| 2.7.2 | ⬜️ | — | 0 | P1 | `PATCH .../lists/:list_id` — `title` saja | [02-SPEC C.7](docs/02-SPEC.md), [C.15](docs/02-SPEC.md) | 2.6, 2.7.1 |
| 2.7.3 | ⬜️ | — | 0 | P1 | `POST .../lists/:list_id/{archive,restore,delete}` | [02-SPEC C.7](docs/02-SPEC.md), A.3 | 2.6, 2.7.1 |

**Test:** Create List dengan `board_id` Project lain → ditolak; List tidak punya operasi move (INV-MOVE-001); pola version-conflict/lifecycle sama seperti task List sebelumnya.
**DoD:** Endpoint sesuai C.7; List tidak punya field status; archive/delete List tidak mengubah `list_id` Card manapun.

---

## TASK-2.8 — Card domain commands, CRUD saja tanpa move (repository layer)  (dep: 2.1, 2.6)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.8.1 | ⬜️ | — | 0 | P0 | `createCard` (title/subtitle/description/due_date, FR-024; `creator_user_id` = actor saat ini, historical & tidak berubah — FR-025; ancestor chain 4 level List+Board+Milestone+Project ACTIVE). Validasi `assignee_user_id` (opsional, maks 1 — FR-026): jika diisi, MUST User dengan membership aktif di Project ini (03-ENG A.5 — app-level FK lintas DB ke Global `users`+`project_memberships`) | [02-SPEC A.3](docs/02-SPEC.md), [A.5](docs/03-ENGINEERING.md) (cross-DB integrity), BR-011–016, BR-019–028, FR-024–026; [03-ENG A.5](docs/03-ENGINEERING.md) | 2.1, 2.6 |
| 2.8.2 | ⬜️ | — | 0 | P0 | `updateCard` (title/subtitle/description/due_date/assignee — TIDAK `list_id`, BR-017/061/062), `archiveCard`, `restoreCard` (ancestor 4-level ACTIVE semua — BR-045A: blanket, bukan scoped ke aktor archive), `deleteCard`. Ganti assignee lewat `updateCard` tetap validasi membership aktif (FR-026) | [02-SPEC A.3](docs/02-SPEC.md), BR-017, BR-045A, BR-061, BR-062, FR-026; [03-ENG A.6](docs/03-ENGINEERING.md) | 2.8.1 |

**Test:** Create ditolak jika salah satu 4 ancestor tidak ACTIVE; create/update dengan `assignee_user_id` bukan member aktif Project → ditolak; `creator_user_id` tidak pernah berubah lewat `updateCard` (BR-025, C.15); `list_id` tidak bisa diubah lewat `updateCard` (harus lewat 2.10 move); restore blanket — Card archived oleh User A berhasil di-restore User B yang beda (BR-045A, regresi test pattern sama seperti Project 1.4.2 tapi kali ini ancestor chain sungguhan, bukan trivial).
**DoD:** Ancestor chain 4-level benar; assignee validation app-level FK (03-ENG A.5) terbukti test; `updateCard` tidak pernah menyentuh `list_id`.

---

## TASK-2.9 — Card endpoints (HTTP), CRUD saja tanpa move  (dep: 2.8)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.9.1 | ⬜️ | — | 0 | P0 | `POST /api/v1/projects/:project_id/lists/:list_id/cards` + `GET .../cards/:card_id` — TANPA filter visibility (Prinsip #5, Phase 4 scope) | [02-SPEC C.8](docs/02-SPEC.md), FR-024 | 2.8 |
| 2.9.2 | ⬜️ | — | 0 | P1 | `PATCH .../cards/:card_id` — `title`/`subtitle`/`description`/`due_date`/`assignee` saja (C.8 eksplisit), **TIDAK BOLEH** `list_id` | [02-SPEC C.8](docs/02-SPEC.md), [C.15](docs/02-SPEC.md) | 2.8, 2.9.1 |
| 2.9.3 | ⬜️ | — | 0 | P1 | `POST .../cards/:card_id/{archive,restore,delete}` | [02-SPEC C.8](docs/02-SPEC.md), A.3, BR-045A | 2.8, 2.9.1 |

**Test:** Create Card dengan `list_id` Project lain → ditolak; PATCH dengan `list_id` di body → diabaikan/ditolak (BR-017/061, uji eksplisit); assignee bukan member → ditolak dengan kode jelas; lifecycle + version-conflict pattern konsisten.
**DoD:** Endpoint sesuai C.8 (minus move); generic PATCH tidak pernah bisa mindahkan Card (BR-017 ditegakkan transport-level, bukan cuma domain).

---

## TASK-2.10 — Card move domain command  (dep: 2.8)  — **[MODEL LEBIH KUAT WAJIB, AGENTS.md §11.2]**

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.10.1 | ⬜️ | — | 0 | P0 | `moveCard(cardId, destinationListId, expectedVersion, actorUserId)` — validasi berurutan sebelum eksekusi (C.8): (1) source Card ada & tidak DELETED; (2) `expected_version` cocok (BR-021, sebelum langkah lain — tolak duluan jika stale, INV-MOVE tidak dievaluasi kalau version sudah salah); (3) destination List ada, di Project SAMA (INV-MOVE-001/BR-006), seluruh ancestor destination ACTIVE (INV-MOVE-002); (4) `source_board.milestone_id == destination_board.milestone_id` (BR-018 — **business invariant murni**, bukan permission check, berlaku walau actor punya izin penuh di kedua Board); (5) commit atomik: `card.list_id` berubah, `version` increment, Activity `card.moved` dengan payload `from`/`to` (list_id+list_title+board_id+board_title, konvensi B.5) — SATU transaksi, gagal di manapun → rollback total (INV-MOVE-004) | [02-SPEC A.5](docs/02-SPEC.md) (INV-MOVE-001–004), [A.6](docs/02-SPEC.md) (BR-017/018), BR-021, BR-044; [03-ENG A.6](docs/03-ENGINEERING.md), [B.5](docs/03-ENGINEERING.md) | 2.8 |

**Test (WAJIB positif+negatif menyeluruh, ini goal paling invariant-critical Phase 2):** move dalam Board sama (List→List) sukses; move ke Board lain dalam Milestone SAMA sukses; move ke Board di Milestone BEDA → `INVALID_DESTINATION` (BR-018, walau permission cukup — test eksplisit actor dengan izin penuh di kedua Board tetap ditolak); move ke List di Project lain → ditolak (tidak pernah menyentuh DB Project lain, Project-boundary); move ke List dengan ancestor tidak ACTIVE → `INVALID_DESTINATION`; `expected_version` salah → `VERSION_CONFLICT`, **card.list_id TIDAK berubah, TIDAK ada Activity `card.moved` baru** (AC-020, assert langsung ke row); dua move konkuren pada Card SAMA → satu sukses satu `VERSION_CONFLICT` (bukan keduanya sukses); move dari Card ARCHIVED/DELETED → ditolak (INV-LIFE-003/004); `card.move` diperlakukan permission terpisah dari `card.update` di layer otorisasi (BR-044, walau Phase 2 masih Owner-only interim — dicatat sebagai seam utk Phase 4).
**DoD:** Seluruh langkah C.8 tervalidasi berurutan sebelum eksekusi; INV-MOVE-001–004 dan BR-017/018 dibuktikan test positif+negatif; atomicity teruji (gagal di tengah tidak meninggalkan state parsial).

---

## TASK-2.11 — Card move endpoint (HTTP)  (dep: 2.10)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.11.1 | ⬜️ | — | 0 | P0 | `POST /api/v1/projects/:project_id/cards/:card_id/move` — body `{destination_list_id, expected_version}` (C.8), Owner-only interim (Prinsip #2, `card.move` seam terpisah dari `card.update` dicatat utk Phase 4), delegasikan seluruh validasi ke `moveCard` (2.10) — route TIDAK menduplikasi validasi domain | [02-SPEC C.8](docs/02-SPEC.md) | 2.10 |

**Test:** Integration end-to-end lewat HTTP — regresi seluruh skenario 2.10.1 lewat request nyata (bukan cuma unit domain), payload invalid (`destination_list_id` bukan string, dsb) → `VALIDATION_ERROR`.
**DoD:** Endpoint sesuai kontrak C.8 persis (`destination_list_id`, bukan nama field lain); response envelope C.2.

---

## TASK-2.12 — Card assignee reactive cleanup saat Membership di-revoke  (dep: 2.8, [1.10.2](PHASE-1-TASKS.md) Phase 1 ✅)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 2.12.1 | ⬜️ | — | 0 | P1 | Perluas `revokeMembership` (`packages/infrastructure/src/database/project-admin.ts`, Phase 1 TASK-1.10.2, Global DB) agar memicu side-effect ke Project DB: untuk User yang di-revoke, cari seluruh Card di Project tsb dengan `assignee_user_id` = User itu (query lintas-DB — Global membership-revoke → Project DB cleanup, app-layer, tidak ada transaksi tunggal lintas-DB per 03-ENG A.5) → set `assignee_user_id = NULL` + Activity `card.unassigned` (`{previous_assignee_user_id, reason:"membership_revoked"}`, B.5) per Card, masing-masing atomik (mutation+Activity per Card, BUKAN satu Activity borongan) | [02-SPEC A.12](docs/02-SPEC.md) (BR-054), FR-026; [03-ENG A.5](docs/03-ENGINEERING.md) (cross-DB app-layer integrity) | 2.8, 1.10.2 |

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

---

## Closure Log

> Isi tiap kali sebuah goal pindah status atau menerima hasil review. Ikuti format & aturan penamaan CL sesuai [AGENTS.md §6](AGENTS.md) (namespace CL/QA-CL/Review-CL terpisah per fase — entry Phase 2 dimulai dari CL-01/QA-CL-01/Review-CL-01 pada file ini).

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

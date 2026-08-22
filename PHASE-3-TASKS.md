# Phase 3 — Labels & Activity · Task & Goal Breakdown

> Generated per [04-DELIVERY C.6](docs/04-DELIVERY.md). SOT version: 2.8.1.
> Scope batas: [04-DELIVERY C.1 "Phase 3"](docs/04-DELIVERY.md). Acuan utama: [02-SPEC](docs/02-SPEC.md) A.8, A.9; B.8–B.10; C.8 (field `labels`), C.9–C.11; D.1–D.2 (permission Label); [03-ENGINEERING](docs/03-ENGINEERING.md) B.3–B.5.
> **Konteks repo saat digenerate:** Phase 0–2 selesai (34+26+21 goal ✅). Schema Project DB (`milestone_labels`, `board_labels`, `card_milestone_labels`, `card_board_labels`, `activities`) SUDAH ada sejak Phase 0 (`packages/infrastructure/src/database/project-schema.ts`) — **Phase 3 hanya butuh SATU migration kecil** (perluasan CHECK constraint `activities_entity_type_check`, TASK-3.2), bukan tabel baru. Belum ada kode Label/Activity-query/Comment sama sekali di `packages/domain`, `packages/infrastructure/src/database`, atau `apps/api/src/routes` — seluruh Phase 3 murni penambahan (tidak ada existing implementation yang diganti, berbeda dari Phase 2 yang menggantikan smoke placeholder Phase 1).
>
> **SOT diamandemen sebelum task ini digenerate (persiapan Phase 3, disetujui manusia 2026-08-22/23):** 2.5.2→2.6.0 (kontrak C.11 Label diperluas jadi lifecycle penuh + D.1 12 permission key baru), 2.6.1 (konsistensi penamaan Activity action Comment → dot notation, `comment.added`/`comment.edited`), 2.7.0 (D.2 baseline matrix baris Label: Manager full lifecycle, Contributor tidak dapat grant eksplisit), 2.7.1 (koreksi leftover underscore di 04-DELIVERY C.1), 2.8.0 (Label dapat Activity sendiri — BR-025/FR-035 + enum `entity_type`), 2.8.1 (response Card dapat field `labels`). Lihat Changelog [01-PRODUCT.md](docs/01-PRODUCT.md) untuk rasional detail tiap keputusan.
>
> **AI-Dev execution gate:** jangan ubah implementasi sebelum goal `🔄` + `CL` terpasang. Jangan menyatakan selesai sebelum goal `🔎`/`80%` + CL baru + test hijau + commit. Format handoff wajib mengikuti [AGENTS.md §0](AGENTS.md).

## Prinsip Phase 3

1. **Label CRUD mengikuti pola domain-command Milestone/Board persis** (bukan generic PATCH untuk lifecycle, C.15) — ancestor-chain check dari `packages/domain/src/lifecycle/effective-state.ts` (Phase 2, TASK-2.1) DIPAKAI ULANG, bukan diimplementasikan ulang. Milestone Label ancestor chain = `[milestoneState, projectState]` (2 level, pola sama Board — TASK-2.4). Board Label ancestor chain = `[boardState, milestoneState, projectState]` (3 level, pola sama List — TASK-2.6). **Wajib** cek ancestor di SEMUA operasi mutasi (create/update/archive/restore/delete), bukan cuma create/restore — pelajaran dari bug Review-CL-02 Phase 2 (task tersebut sudah dikoreksi, jangan ulangi kesalahan yang sama di Label).
2. **Otorisasi tetap Owner-only interim** (lanjutan Prinsip Phase 1/2) — permission resolution engine berbasis Group (Phase 4) TETAP di luar scope. Katalog 12 permission key `milestone_label.*`/`board_label.*` (D.1, TASK-3.1) dan baseline matrix Manager (D.2) SUDAH dikunci SOT, tapi **penegakan granular per-Group menunggu Phase 4** — Phase 3 tetap pakai `assertOwnerInterim`-setara untuk semua mutasi Label/Comment, sama seperti Milestone/Board/List/Card di Phase 2.
3. **Pengecualian: `card.comment.update` ownership check (BR-034A/D.4) WAJIB ditegakkan sekarang**, terpisah dari interim Owner-only model — bukan menunggu Phase 4. Ini bukan kontradiksi: BR-034A adalah **business invariant kepemilikan** (bukan grant Permission Group), berlaku di atas lapisan otorisasi apa pun (interim atau final). Konsekuensi praktis saat ini (Owner adalah satu-satunya aktor yang lolos `assertOwnerInterim`): comment hanya pernah ditulis oleh Owner, sehingga cek ownership trivially selalu benar hari ini — tapi kode WAJIB tetap membandingkan `activity.actor_user_id == current_user_id` secara eksplisit (bukan diasumsikan/dilewati), agar korek saat Phase 4 membuka comment ke aktor lain.
4. **Card-Label assign/remove menumpang otorisasi `card.update`** (keputusan C.11 terkunci sejak 2.6.0) — TIDAK ada permission key tersendiri untuk assign/remove ke Card. `milestone_label.*`/`board_label.*` hanya menggerbangi CRUD definisi Label itu sendiri (create/update/archive/restore/delete/list Label), bukan assign/remove ke Card.
5. **Auto-orphan Board Label saat Card pindah Board (03-ENG B.4 rationale, FR-033) WAJIB dibangun di Phase 3**, bukan ditunda — memodifikasi `moveCard` (`packages/infrastructure/src/database/card-repository.ts`, goal 2.10.1 Phase 2, sudah ✅) untuk men-set `removed_at` + Activity `label.removed` pada seluruh `card_board_labels` aktif milik Card saat `destination_board_id != source_board_id`. Milestone Label TIDAK ikut orphan (invariant #5/BR-018 menjamin Milestone tetap sama pada move lintas-Board yang valid). **[MODEL LEBIH KUAT WAJIB]** — goal ini memodifikasi transaksi domain command yang sudah invariant-critical (Card move, AGENTS.md §11.2), menyentuh invariant #5 dan #9 (atomicity mutation+Activity) sekaligus.
6. **`GET /activities` (C.9) TIDAK memakai pagination** — kontrak API saat ini tidak menyebut `limit`/`offset`/cursor apa pun; jangan menambah parameter yang tidak ada di kontrak (hindari scope creep). Jika volume Activity jadi masalah performa, itu Phase 6 (Hardening) punya slot `F.7 Performance Gate` untuk itu — bukan didahulukan diam-diam di sini.
7. **Keputusan teknis murni (04-DELIVERY C.6.5 poin 3, tidak menyentuh business invariant, didokumentasikan di sini agar mudah diganti):** `:activity_id` pada `PATCH .../comments/:activity_id` (C.10) SELALU merujuk id Activity `comment.added` ORIGINAL (identitas comment yang stabil) — mengedit comment yang sudah pernah diedit sebelumnya tetap memakai `:activity_id` yang sama (bukan id `comment.edited` hasil edit sebelumnya). Payload `comment.edited` (B.5) WAJIB menyertakan `comment_activity_id` (merujuk id `comment.added` original) selain `{before, after}`, agar histori penuh satu comment dapat direkonstruksi (`filter activities WHERE entity_id=card_id AND (id = comment_activity_id OR data->>'comment_activity_id' = comment_activity_id) ORDER BY created_at`) tanpa query N+1 yang rapuh.
8. **`card.comment`/`card.comment.update` SUDAH ada di katalog permission sejak Phase 1** (`packages/infrastructure/src/database/permission-catalog.ts` baris 41–42) — TASK-3.1 (seed Label) TIDAK perlu menyentuh dua key ini, hanya menambah 12 key Label baru.

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
3.1 Permission catalog extension (Label keys)         ─┐ independen, gate Label authorization
3.2 Activities schema migration (entity_type +2 label) ─┤ independen, gate Label Activity write
                                                         │
3.3 Milestone Label domain commands ◄── 2.1, 3.2        │
     └─ 3.4 Milestone Label endpoints (HTTP) ◄── 3.1     │
          └─ 3.5 Board Label domain commands ◄── 2.1, 3.2, 3.3 (ancestor = Board+Milestone+Project)
               └─ 3.6 Board Label endpoints (HTTP) ◄── 3.1
                    ├─ 3.7 Card-Label association domain commands ◄── 3.3, 3.5, 2.8 (Card, Phase 2)
                    │    └─ 3.8 Card-Label endpoints (HTTP)
                    │         └─ 3.9 Card GET response embeds `labels` ◄── 2.9.1 (Phase 2, Card read)
                    └─ [MODEL LEBIH KUAT WAJIB] 3.7.2 moveCard auto-orphan Board Label ◄── 2.10.1 (Phase 2 ✅)

3.10 GET /activities (generic + 4 convenience routes) ── independen, hanya butuh `activities` table (Phase 0)

3.11 Comment create ◄── 2.9 (Card, Phase 2)
     └─ 3.12 Comment edit ◄── 3.11, BR-034A ownership check
```

---

## TASK-3.1 — Permission catalog extension (Label)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.1.1 | 🔎 | [CL-02](#cl-02)<br>[CL-01](#cl-01) | 80 | P0 | Tambah 12 entry ke `PERMISSION_CATALOG` (`packages/infrastructure/src/database/permission-catalog.ts`): `milestone_label.{read,create,update,archive,delete,restore}` dan `board_label.{read,create,update,archive,delete,restore}`, deskripsi Bahasa Indonesia mengikuti pola persis entry `milestone.*`/`board.*` yang sudah ada. Update `baselineGroupPermissionKeys` case `"Manager"`: tambah `...RESOURCE_FULL_KEYS("milestone_label")` dan `...RESOURCE_FULL_KEYS("board_label")` (D.2 baris Label — Manager full lifecycle). **Jangan ubah** case `"Contributor"` (D.2: tidak dapat grant eksplisit, sudah tercakup `card.update` untuk assign/remove ke Card). Co-Owner (`permissionCatalogKeys()`, semua key) dan Viewer (filter `.read`) otomatis ikut tanpa perubahan kode. | [02-SPEC D.1](docs/02-SPEC.md), [D.2](docs/02-SPEC.md) | — |

**Test:** Unit — `seedPermissionCatalog` idempotent (jalan 2x, `permissions.key` tidak duplikat, constraint UNIQUE sejak 2.2.2 tetap terjaga); `baselineGroupPermissionKeys("Manager")` mengandung seluruh 12 key baru; `baselineGroupPermissionKeys("Contributor")` TIDAK mengandung satu pun key `milestone_label.*`/`board_label.*`; `baselineGroupPermissionKeys("Co-Owner")` dan `Viewer` otomatis mengandung key baru tanpa perubahan eksplisit ke case-nya.
**DoD:** `permissionCatalogKeys()` mengembalikan 39 key total (27 lama + 12 baru); Project baru yang di-provision setelah goal ini menghasilkan baseline Manager group dengan Label lifecycle penuh, dibuktikan test provisioning end-to-end.

---

## TASK-3.2 — Activities schema migration (entity_type Label)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.2.1 | 🔎 | [CL-04](#cl-04)<br>[CL-03](#cl-03) | 80 | P0 | Perluas `activityEntityType` (`packages/infrastructure/src/database/project-schema.ts`) dari `["project","milestone","board","list","card"]` menjadi menambah `"milestone_label"`, `"board_label"` — otomatis mengubah CHECK constraint `activities_entity_type_check` yang di-generate Drizzle dari array tsb. Generate migration Drizzle baru (`drizzle-kit generate`, ikuti pola migration Project DB existing sejak Phase 0/1) — **bukan tabel baru**, hanya perluasan CHECK constraint pada tabel `activities` yang sudah ada. | [02-SPEC BR-025](docs/02-SPEC.md), [FR-035](docs/02-SPEC.md); [03-ENG B.3](docs/03-ENGINEERING.md) | — |

**Test:** Integration — INSERT ke `activities` dengan `entity_type='milestone_label'` dan `'board_label'` BERHASIL (tidak lagi kena CHECK violation); `entity_type` selain 7 value yang diizinkan tetap DITOLAK database (regresi negatif, pastikan constraint tidak jadi longgar total).
**DoD:** Migration diterapkan bersih di Turso project DB baru maupun existing (idempotent/forward-only, tidak ada data existing yang perlu di-backfill karena belum ada row Label Activity sebelum goal ini); `pnpm -r build`/typecheck hijau.

---

## TASK-3.3 — Milestone Label domain commands (repository layer)  (dep: 2.1, 3.2)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.3.1 | 🔎 | [CL-06](#cl-06)<br>[CL-05](#cl-05) | 80 | P0 | Domain command Milestone Label baru — `packages/domain/src/label/milestone-label-errors.ts` (interface + error class: `MilestoneLabelNotFoundError`, `MilestoneLabelValidationError`, `MilestoneLabelVersionConflictError`, `MilestoneLabelInvalidStateError`, pola sama `milestone-errors.ts`), `packages/infrastructure/src/database/milestone-label-repository.ts` (implementasi Drizzle): `listMilestoneLabels` (exclude `deleted_at IS NOT NULL` kecuali diminta eksplisit, pola sama `GET /permission-groups` C.12), `createMilestoneLabel` (name wajib non-kosong; ancestor chain `[milestoneState, projectState]` via `isEffectivelyOperational` — TOLAK jika Milestone ATAU Project non-ACTIVE, INV-LIFE-001), `updateMilestoneLabel` (`name`, `expected_version` wajib), `archiveMilestoneLabel`, `restoreMilestoneLabel` (`evaluateRestore` — SELURUH ancestor harus ACTIVE, INV-LIFE-002), `deleteMilestoneLabel`. **WAJIB cek ancestor di SEMUA 4 operasi mutasi (update/archive/restore/delete), bukan cuma create/restore** (Prinsip #1 — pelajaran Review-CL-02 Phase 2, jangan ulangi). Setiap command atomik dalam `runInWriteTransaction`: version check → ancestor check → local-state check (state machine A.3, sama `LIFECYCLE_ALLOWED_FROM` Milestone) → mutation + Activity `milestone_label.created`/`.updated`/`.archived`/`.restored`/`.deleted` (entity_type=`milestone_label`, TASK-3.2) satu transaksi. | [02-SPEC C.11](docs/02-SPEC.md), BR-025 (amandemen 2.8.0), FR-031, FR-034; [03-ENG B.3–B.5](docs/03-ENGINEERING.md) | 2.1 (Phase 2), 3.2 |

**Test:** Unit — create ditolak jika Milestone ATAU Project ARCHIVED/DELETED; update/archive/delete dari state salah ditolak; `expected_version` salah → `VERSION_CONFLICT` tanpa perubahan/Activity; restore ditolak jika salah satu ancestor tidak ACTIVE; **[WAJIB]** archive Milestone dulu → coba `updateMilestoneLabel`/`archiveMilestoneLabel`/`deleteMilestoneLabel` terhadap Label-nya (masih local ACTIVE) → harus ditolak SEMUA (INV-LIFE-001, regresi eksplisit terhadap bug class Review-CL-02); Activity `milestone_label.*` tertulis dengan `entity_type='milestone_label'` (bukan `'milestone'`).
**DoD:** Seluruh 6 command (list+5 mutasi) atomik; ancestor check dipakai di seluruh 4 operasi mutasi; reuse `effective-state.ts` (TASK-2.1), tidak reimplementasi ancestor logic.

---

## TASK-3.4 — Milestone Label endpoints (HTTP)  (dep: 3.1, 3.3)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.4.1 | ⬜️ | — | 0 | P0 | `GET /api/v1/projects/:project_id/milestones/:milestone_id/labels` + `POST .../labels` — pakai `RequestPipeline`, Owner-only interim untuk create (Prinsip #2), balikan `{data:{labels:[...]}}`/`{data:{label:{...}}}` konsisten C.2. | [02-SPEC C.11](docs/02-SPEC.md) | 3.3 |
| 3.4.2 | ⬜️ | — | 0 | P1 | `PATCH .../labels/:label_id` — field `name` saja (C.15), `expected_version` wajib, Owner-only interim, payload invalid → `VALIDATION_ERROR`. | [02-SPEC C.11](docs/02-SPEC.md), C.15, C.2 | 3.3, 3.4.1 |
| 3.4.3 | ⬜️ | — | 0 | P1 | `POST .../labels/:label_id/{archive,restore,delete}` — 3 domain command endpoint, `expected_version` wajib, Owner-only interim, pola `handleLifecycle` sama Milestone (TASK-2.3). | [02-SPEC C.11](docs/02-SPEC.md), A.3 | 3.3, 3.4.1 |

**Test:** Integration — create tanpa identitas ditolak; create pada Milestone/Project non-ACTIVE ditolak; read tanpa membership → `PROJECT_ACCESS_DENIED`; mutasi oleh non-Owner → `PERMISSION_DENIED`; version mismatch → `VERSION_CONFLICT`; Project-boundary — Label Project lain tidak pernah bocor/tersentuh.
**DoD:** Endpoint sesuai kontrak C.11 (6 route Milestone Label); response envelope C.2; field domain-controlled tidak bisa diubah via PATCH; seluruh test hijau.

---

## TASK-3.5 — Board Label domain commands (repository layer)  (dep: 2.1, 3.2, 3.3)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.5.1 | ⬜️ | — | 0 | P0 | Domain command Board Label — `packages/domain/src/label/board-label-errors.ts`, `packages/infrastructure/src/database/board-label-repository.ts`, struktur IDENTIK TASK-3.3 tapi ancestor chain 3 level `[boardState, milestoneState, projectState]` (pola sama List — TASK-2.6). Activity `board_label.created`/`.updated`/`.archived`/`.restored`/`.deleted` (entity_type=`board_label`). **WAJIB cek ancestor di SEMUA 4 operasi mutasi**, sama seperti 3.3.1. | [02-SPEC C.11](docs/02-SPEC.md), BR-025, FR-031, FR-034; [03-ENG B.3–B.5](docs/03-ENGINEERING.md) | 2.1 (Phase 2), 3.2, 3.3 |

**Test:** Sama pola 3.3.1 tapi chain 3-level: create/update/archive/restore/delete ditolak jika SALAH SATU dari {Board, Milestone, Project} non-ACTIVE; **[WAJIB]** archive Board (bukan Milestone) dulu → keempat operasi mutasi Board Label-nya ditolak; archive Milestone (bukan Board langsung) → Board Label-nya (local ACTIVE, ancestor Board juga ACTIVE tapi Milestone non-ACTIVE) tetap ditolak (transitive ancestor, bukan cuma immediate parent).
**DoD:** Sama TASK-3.3 DoD, chain 3-level teruji eksplisit (bukan cuma 2-level seperti Milestone Label).

---

## TASK-3.6 — Board Label endpoints (HTTP)  (dep: 3.1, 3.5)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.6.1 | ⬜️ | — | 0 | P0 | `GET .../boards/:board_id/labels` + `POST .../labels` — pola identik 3.4.1. | [02-SPEC C.11](docs/02-SPEC.md) | 3.5 |
| 3.6.2 | ⬜️ | — | 0 | P1 | `PATCH .../labels/:label_id` — pola identik 3.4.2. | [02-SPEC C.11](docs/02-SPEC.md), C.15, C.2 | 3.5, 3.6.1 |
| 3.6.3 | ⬜️ | — | 0 | P1 | `POST .../labels/:label_id/{archive,restore,delete}` — pola identik 3.4.3. | [02-SPEC C.11](docs/02-SPEC.md), A.3 | 3.5, 3.6.1 |

**Test:** Sama pola TASK-3.4, ancestor 3-level.
**DoD:** Endpoint sesuai kontrak C.11 (6 route Board Label); response envelope C.2; seluruh test hijau.

---

## TASK-3.7 — Card-Label association (assign/remove + auto-orphan on move)  (dep: 3.3, 3.5, 2.8/2.10 Phase 2)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.7.1 | ⬜️ | — | 0 | P0 | `packages/infrastructure/src/database/card-label-association.ts`: `assignLabelToCard(cardId, labelId, actorUserId)` — cari `labelId` di `milestone_labels` DAN `board_labels` (server menentukan scope, C.11) → tolak jika tidak ditemukan di keduanya; tolak jika Label ARCHIVED/DELETED (FR-034); tolak jika scope tidak cocok posisi Card SAAT INI (`milestone_label.milestone_id == card.currentMilestoneId`; `board_label.board_id == card.currentBoardId`, dihitung dari `card.list_id → list.board_id → board.milestone_id`); tolak jika Card sendiri non-operational (ancestor chain penuh List→Board→Milestone→Project + local state, sama seperti `card.update`, Prinsip #4). INSERT baris baru `card_milestone_labels`/`card_board_labels` (`created_at=now`, `removed_at=NULL`) — JANGAN update baris lama yang sudah `removed_at` (histori, FR-033), partial-unique-index (`..._active_unique WHERE removed_at IS NULL`) mencegah duplikat aktif. Activity `label.added` pada `entity_type='card'` (payload `{label_id, label_scope, label_name}`, B.5). `removeLabelFromCard(cardId, labelId, actorUserId)` — set `removed_at=now` pada baris aktif; Activity `label.removed` (`entity_type='card'`, sama payload). | [02-SPEC C.11](docs/02-SPEC.md), FR-032, FR-033, FR-034; [03-ENG B.4–B.5](docs/03-ENGINEERING.md) | 3.3, 3.5, 2.8 (Card, Phase 2) |
| 3.7.2 | ⬜️ | — | 0 | P0 **[MODEL LEBIH KUAT WAJIB]** | Modifikasi `moveCard` (`packages/infrastructure/src/database/card-repository.ts`, goal 2.10.1 Phase 2 ✅) — dalam TRANSAKSI YANG SAMA dengan mutasi move, jika `destinationBoard.id != sourceBoard.id`: SELECT seluruh baris `card_board_labels` aktif (`removed_at IS NULL`) milik Card ini → UPDATE `removed_at=now` pada semuanya → INSERT Activity `label.removed` per baris (payload sama 3.7.1, `entity_version` = versi Card setelah move). `card_milestone_labels` TIDAK disentuh (Milestone tetap sama pada move valid, invariant #5/BR-018). Auto-orphan HARUS atomik dengan move itu sendiri — kegagalan orphan tidak boleh membuat move ter-commit sebagian (invariant #9). | [03-ENG B.4](docs/03-ENGINEERING.md) (rationale Board Label orphan), FR-033; [02-SPEC A.16](docs/02-SPEC.md) invariant #5, #9 | 3.7.1, 2.10.1 (Phase 2 ✅) |

**Test:** Unit — assign label milik Milestone lain (bukan Milestone Card saat ini) ditolak; assign Board Label milik Board lain ditolak; assign Label ARCHIVED/DELETED ditolak (FR-034); assign pada Card non-operational (ancestor non-ACTIVE) ditolak; assign ulang label yang PERNAH di-remove BERHASIL (baris baru, bukan re-use baris lama — histori utuh, FR-033); remove pada asosiasi yang sudah `removed_at` (tidak aktif) TIDAK error tapi no-op/idempotent (dokumentasikan perilaku eksplisit); **[WAJIB, 3.7.2]** move Card lintas-Board (Board Label ada sebelumnya) → seluruh Board Label ter-orphan (`removed_at` terisi) + Activity `label.removed` tercatat, dalam Activity list yang SAMA dengan `card.moved`; Milestone Label Card yang sama TIDAK ter-orphan oleh move yang sama; move Card DALAM Board yang sama (List→List, bukan Board berbeda) TIDAK meng-orphan Board Label apa pun (guard `destinationBoard.id != sourceBoard.id` harus presisi).
**DoD:** `card_milestone_labels`/`card_board_labels` tidak pernah UPDATE baris `removed_at` yang sudah terisi (append/insert-baru untuk assign ulang, bukan reuse); auto-orphan dan move commit dalam satu `runInWriteTransaction` yang sama (bukan dua transaksi terpisah — cegah partial state).

---

## TASK-3.8 — Card-Label endpoints (HTTP)  (dep: 3.7)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.8.1 | ⬜️ | — | 0 | P1 | `POST /api/v1/projects/:project_id/cards/:card_id/labels` (assign, body `{label_id}`) + `POST .../labels/:label_id/remove` — otorisasi menumpang `card.update` (Owner-only interim, Prinsip #4, BUKAN permission Label tersendiri). | [02-SPEC C.11](docs/02-SPEC.md) | 3.7 |

**Test:** Integration — assign/remove oleh non-Owner → `PERMISSION_DENIED` (sama `card.update`); assign label lintas-Project (Project lain) ditolak sebagai `RESOURCE_NOT_FOUND` (bukan bocor cross-project); assign/remove pada Card ARCHIVED/DELETED ditolak.
**DoD:** 2 endpoint sesuai kontrak C.11; response envelope C.2.

---

## TASK-3.9 — Card GET response embeds `labels`  (dep: 3.7, 2.9.1 Phase 2)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.9.1 | ⬜️ | — | 0 | P1 | `getCard` (`packages/infrastructure/src/database/card-repository.ts`, goal 2.9.1 Phase 2 ✅) — tambah JOIN `card_milestone_labels`/`card_board_labels` (filter `removed_at IS NULL`) ke `milestone_labels`/`board_labels`, kembalikan field `labels: [{id, name, scope: "milestone"|"board"}]` di payload response (C.8, amandemen 2.8.1). | [02-SPEC C.8](docs/02-SPEC.md) (field `labels`) | 3.7, 2.9.1 (Phase 2 ✅) |

**Test:** Card tanpa Label apa pun → `labels: []` (bukan `null`/`undefined`); Card dengan campuran Milestone Label + Board Label → keduanya muncul dengan `scope` benar; Label yang sudah di-`remove` TIDAK muncul; Label yang di-orphan otomatis oleh move (3.7.2) TIDAK muncul setelah move.
**DoD:** `GET /cards/:card_id` selalu menyertakan `labels` (array, boleh kosong); tidak menambah N+1 query berlebihan (satu JOIN per scope, bukan query per Label).

---

## TASK-3.10 — GET /activities (generic + convenience routes)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.10.1 | ⬜️ | — | 0 | P1 | `packages/infrastructure/src/database/activity-query.ts` (`listActivities(client, filters)` — filter opsional `entity_type`, `entity_id`, `actor` (=`actor_user_id`), `action`, `from`/`to` (rentang `created_at`), tanpa pagination — Prinsip #6) + `apps/api/src/routes/activities.ts` (router baru): `GET /projects/:project_id/activities` (generic, seluruh filter query param) dan 4 convenience route (`.../cards/:card_id/activities`, `.../milestones/:milestone_id/activities`, `.../boards/:board_id/activities`, `.../lists/:list_id/activities` — masing-masing hardcode `entity_type`+`entity_id` dari path param, filter lain tetap optional via query). Baca-saja, TIDAK ada Owner-only restriction (pola sama GET Milestone/Board/List/Card — cukup valid membership). | [02-SPEC C.9](docs/02-SPEC.md), BR-024, FR-035–038 | — |

**Test:** Integration — GET tanpa identitas ditolak; GET tanpa membership → `PROJECT_ACCESS_DENIED`; filter `entity_type`+`entity_id` mengembalikan HANYA Activity entity tsb; convenience route mengembalikan subset identik dengan generic route + filter manual yang sesuai; Project-boundary — Activity Project lain tidak pernah muncul (isolasi struktural per-Project-DB, tapi tetap tes eksplisit tidak ada query yang salah resolve Client); tidak ada endpoint `PUT`/`PATCH`/`DELETE` pada `/activities` (BR-024, invariant #8).
**DoD:** 5 route sesuai kontrak C.9; response `{data:{activities:[...]}}` C.2; hanya read, tidak ada mutasi apa pun via router ini.

---

## TASK-3.11 — Comment create

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.11.1 | ⬜️ | — | 0 | P1 | `packages/infrastructure/src/database/card-comment.ts`: `addComment(cardId, body, actorUserId)` — validasi `body` non-kosong string; validasi state Card **saat request diproses** (BR-034, bukan snapshot UI) — Card DELETED/ARCHIVED ditolak (BR-033), TERMASUK ancestor non-operational (Card local ACTIVE tapi ancestor non-ACTIVE — konsisten INV-LIFE-001, comment adalah mutasi Card); INSERT Activity `comment.added` (`entity_type='card'`, payload `{body}`, B.5) — `entity_version` = versi Card TERKINI (comment tidak menaikkan `version` Card, hanya mencatat versi saat itu, karena Comment bukan field Card). Endpoint `POST /api/v1/projects/:project_id/cards/:card_id/comments` — otorisasi Owner-only interim (Prinsip #2, permission `card.comment` sudah ada di katalog sejak Phase 1). | [02-SPEC C.10](docs/02-SPEC.md), A.9 (BR-030,033,034), FR-039, FR-042 | 2.9 (Card, Phase 2) |

**Test:** Comment pada Card ACTIVE (ancestor semua ACTIVE) berhasil; Comment pada Card ARCHIVED ditolak (BR-033); Comment pada Card DELETED ditolak; Comment pada Card local-ACTIVE tapi ancestor ARCHIVED ditolak (INV-LIFE-001, race-condition BR-034: validasi state SAAT request, bukan saat UI dibuka); `body` kosong/bukan string → `VALIDATION_ERROR`; Activity `comment.added` immutable (tidak ada endpoint UPDATE/DELETE untuk action ini sendiri, hanya `comment.edited` baru — TASK-3.12).
**DoD:** Endpoint sesuai kontrak C.10; Comment selalu tercatat sebagai Activity Card (BR-030); tidak ada tabel Comment terpisah (03-ENG B.3).

---

## TASK-3.12 — Comment edit  (dep: 3.11)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.12.1 | ⬜️ | — | 0 | P1 | `editComment(cardId, commentActivityId, newBody, actorUserId)` (`card-comment.ts`) — load Activity `commentActivityId`, WAJIB `action IN ('comment.added','comment.edited')` DAN `entity_id = cardId` (cegah edit Activity entity lain); **BR-034A ownership check WAJIB eksplisit**: `activity.actor_user_id == actorUserId` (bandingkan langsung, JANGAN diasumsikan/skip walau interim model Owner-only membuatnya trivially true hari ini — Prinsip #3); validasi state Card sama seperti 3.11.1 (BR-033/034, D.4 `card.is_effectively_active`); jika `commentActivityId` merujuk `comment.edited` (bukan `comment.added` original), WAJIB tetap tersedia field `comment_activity_id` di payload lama untuk menemukan original — cari original via `data->>'comment_activity_id'` jika ada, else pakai id itu sendiri (dia sendiri original); INSERT Activity BARU `comment.edited` (payload `{before, after, comment_activity_id: <id original>}`, Prinsip #7) — Activity lama (`comment.added` atau `comment.edited` sebelumnya) TIDAK diubah sama sekali (BR-032, immutability). Endpoint `PATCH /api/v1/projects/:project_id/cards/:card_id/comments/:activity_id`. | [02-SPEC C.10](docs/02-SPEC.md), BR-031, BR-032, BR-034A; [D.4](docs/02-SPEC.md) formula `can_comment_update`; FR-040 | 3.11 |

**Test:** Edit comment milik sendiri berhasil; edit comment milik user lain ditolak (`PERMISSION_DENIED`, BR-034A — **termasuk simulasi Owner mencoba edit comment bukan miliknya sendiri**, walau di interim model ini belum reachable karena hanya Owner yang bisa comment — tulis test sebagai dokumentasi invariant untuk Phase 4); edit comment pada Card yang sudah ARCHIVED/DELETED sejak comment dibuat ditolak (D.4 `card.is_effectively_active`); edit comment yang SUDAH pernah diedit sebelumnya (edit kedua/ketiga) tetap memakai `:activity_id` original yang sama, bukan id edit terakhir; Activity `comment.added`/`comment.edited` LAMA tidak berubah setelah edit baru (assert row lama byte-identik sebelum/sesudah); `activity_id` yang merujuk Activity bukan `comment.*`/bukan milik Card ini → `RESOURCE_NOT_FOUND` atau `VALIDATION_ERROR` (bukan edit Activity sembarangan).
**DoD:** Endpoint sesuai kontrak C.10; comment lama tidak pernah termodifikasi (BR-031/032); ownership check eksplisit dan diuji, bukan tersirat dari interim Owner-only model.

---

## Closure Log

<!-- Dev: `### CL-nn — YYYY-MM-DD · goal <id> <ringkasan>`. QA: `### QA-CL-nn — ...`. Review: `### Review-CL-nn — ...`. Cantumkan Role + Model/platform aktual. Append-only, jangan hapus/ubah entry lama. -->

<a id="cl-06"></a>
### CL-06 — 2026-08-23 · goal 3.3.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — Milestone Label domain commands
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 52 file / **341** test lulus (8 test baru `milestone-label-commands.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: modul domain `label/` (error class bercode kanonik + interface `MilestoneLabelRepository`/`BoardLabelRepository`, record & input types) + `DrizzleMilestoneLabelRepository` (list/create/update/archive/restore/delete). Urutan wajib per Prinsip #1: version check → **ancestor check `isEffectivelyOperational([milestoneState, projectState])` di SEMUA operasi mutasi** → local-state A.3 → restore via `evaluateRestore` → UPDATE dijaga `AND version = expected` → Activity atomik dengan entity_type='milestone_label' (bukan 'milestone'), payload B.5.
**Catatan:** Test WAJIB regresi Review-CL-02 hijau: archive Milestone dulu → update/archive/delete Label local-ACTIVE ditolak semua AncestorNotActiveError tanpa activity Label. List default exclude deleted, includeDeleted opsional (C.11/C.12).

<a id="cl-05"></a>
### CL-05 — 2026-08-23 · goal 3.3.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 3.3.1 `⬜️/—/0/P0`, dependency `2.1 ✅, 3.2 ✅` (CL-04 commit 70614e9). C.11 + FR-031/034 dibaca dari disk; schema `milestone_labels` (milestone_id FK, name, timestamps, version) diverifikasi; pola command = milestone-repository.ts dengan ancestor check semua operasi.
**Catatan:** Ancestor chain `[milestoneState, projectState]`; Activity entity_type=`milestone_label` (migration 0001 aktif).

<a id="cl-04"></a>
### CL-04 — 2026-08-23 · goal 3.2.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — migration entity_type +2 Label
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 51 file / **333** test lulus (3 test baru `activity-entity-type.test.ts`: INSERT milestone_label/board_label diterima; value di luar 7 tetap ditolak CHECK; data existing terbawa + index activities_entity_idx direkreasi); `pnpm -r typecheck` Done; `pnpm -r build` Done; `pnpm lint` bersih. Implementasi: `activityEntityType` += "milestone_label","board_label"; migration hand-written `0001_activity_entity_type_label.sql` (table-recreate activities, pola drizzle) + meta `_journal.json` idx 1 + `0001_snapshot.json` (check value baru).
**Catatan:** drizzle-kit generate tidak mendeteksi perubahan CHECK constraint SQLite (keterbatasan diff) — migration ditulis manual mengikuti format journal/snapshot. Perbaikan tambahan: CHECK pada tabel `__new_activities` tidak boleh memakai kualifikasi `"activities"."entity_type"` (referensi lintas-tabel invalid saat create) — dipakai bentuk kolom saja, fungsi identik setelah RENAME.

<a id="cl-03"></a>
### CL-03 — 2026-08-23 · goal 3.2.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 3.2.1 `⬜️/—/0/P0`, dependency kosong. Pola migration diverifikasi: `drizzle.config.project.ts` → `drizzle/migrations-project` (0000_project_schema_v1 + meta), `applyProjectMigrations` memakai folder tsb; `activityEntityType` 5 value di project-schema.ts:161.
**Catatan:** Rencana: perluas array +2 value, `db:generate:project`, verifikasi SQL migration yang dihasilkan, test integrasi CHECK constraint.

<a id="cl-02"></a>
### CL-02 — 2026-08-23 · goal 3.1.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — 12 permission key Label
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 50 file / **330** test lulus (5 test baru/updated di `permission-catalog.test.ts`: katalog 52 key dengan 12 Label berdeskripsi; Manager memuat 12 key; Contributor nol key Label; Co-Owner penuh + Viewer hanya .read otomatis; end-to-end provisioning Project baru → group_permissions Manager memuat Label lifecycle penuh & Contributor bebas Label); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: PERMISSION_CATALOG += 6×`milestone_label.*` + 6×`board_label.*` (deskripsi pola milestone.*/board.*); baselineGroupPermissionKeys("Manager") += RESOURCE_FULL_KEYS kedua resource; case Contributor/Co-Owner/Viewer tidak disentuh (otomatis).
**Catatan:** Koreksi angka DoD: teks goal menulis "39 total (27 lama + 12)" — katalog aktual sebelum goal ini berisi **40** key (test Phase 1 menyatakan 40), sehingga total yang benar = **52**. Tidak ada perbedaan perilaku; murni aritmetika teks task vs state repo. Seed idempotent tetap terjaga (ON CONFLICT DO NOTHING).

<a id="cl-01"></a>
### CL-01 — 2026-08-23 · scope TASK-3.1–3.5 dikonfirmasi; goal 3.1.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Discovery dari disk: Phase 2 tutup 21/21 ✅ (QA-CL-23, Review-CL-04; fix CL-53 re-verified QA-CL-24), SOT 2.8.1, HEAD f5d3b1d working tree bersih. Manusia mengonfirmasi scope TASK-3.1–3.5 (7 goal). Baseline dibaca: AGENTS.md penuh (re-read atas permintaan), PHASE-3-TASKS.md penuh, 02-SPEC D.1/D.2; kode existing diverifikasi: `permission-catalog.ts` (27 key, RESOURCE_FULL_KEYS, baselineGroupPermissionKeys), `activityEntityType` 5 value di project-schema.ts.
**Catatan:** Rencana 3.1.1: tambah 12 key Label setelah blok card.* (urut D.1), Manager += RESOURCE_FULL_KEYS untuk kedua resource label, Contributor/Co-Owner/Viewer tanpa perubahan eksplisit.

### Review-CL-01 — 2026-08-23 · generate task list Phase 3 (tanpa perubahan status implementasi)

**Role:** AI-Planning & Review · **Model:** Claude Sonnet 5

Generate `PHASE-3-TASKS.md` (12 task, 18 goal) mengikuti [04-DELIVERY C.6](docs/04-DELIVERY.md), sebelumnya membaca penuh 02-SPEC (Part A.8–A.16, B.7–B.14, C.8–C.11, D.1–D.4), 03-ENGINEERING (B.3–B.5), dan memeriksa state repo aktual (`packages/domain/src`, `packages/infrastructure/src/database`, `apps/api/src/routes`) — dikonfirmasi belum ada kode Label/Activity-query/Comment sama sekali, hanya schema (Phase 0). Sebelum generate, ditemukan 6 gap SOT yang membutuhkan keputusan manusia (bukan diputuskan diam-diam, sesuai C.6.5 poin 4 — seluruhnya menyentuh API semantics/business invariant/authorization):

1. **C.11 Label** hanya 3 endpoint (create Milestone Label, create Board Label, assign ke Card) — tidak ada GET list, tidak ada lifecycle (archive/restore/delete/PATCH), tidak ada endpoint remove manual dari Card. Disetujui manusia 2026-08-22: tambahkan penuh (GET list + lifecycle lengkap untuk Milestone Label & Board Label + endpoint remove manual) → SOT 2.5.2→2.6.0.
2. **Penamaan Activity action Comment tidak konsisten** — dot notation (`comment.added`/`comment.edited`, BR-032/FR-040/03-ENG B.5) vs underscore (`comment_added`/`comment_edited`, BR-034A/C.10/04-DELIVERY C.1). Disetujui manusia 2026-08-23: kunci ke dot notation (mayoritas + konsisten seluruh action lain) → SOT 2.6.0→2.6.1→2.7.1 (2 putaran karena satu occurrence di 04-DELIVERY C.1 awalnya terlewat).
3. **D.2 baseline matrix tidak punya baris Label** setelah D.1 dapat 12 key baru — Manager (daftar eksplisit di kode) butuh keputusan, Co-Owner/Viewer resolve otomatis. Disetujui manusia 2026-08-23: Manager full lifecycle (pola sama Milestone/Board/List), Contributor tidak dapat grant eksplisit (assign/remove Card sudah cukup lewat `card.update`) → SOT 2.6.1→2.7.0.
4. **Label lifecycle tidak punya Activity sendiri** — BR-025/FR-035 cuma sebut 5 entity (bukan Label), `activities.entity_type` CHECK constraint di kode cuma izinkan 5 value — kontradiksi dengan pola domain-command Milestone/Board/List yang SEMUANYA menulis Activity atomik per mutasi (invariant #9), yang barusan diberikan ke Label di gap #1. Disetujui manusia 2026-08-23: Label dapat Activity sendiri, tambah ke BR-025/FR-035 + enum `entity_type` (migration didelegasikan ke Dev) → SOT 2.7.1→2.8.0.
5. **C.8 Card response tidak punya field untuk membaca kembali Label yang di-assign** — FR-032 mensyaratkan Card bisa punya banyak Label, tapi tidak ada cara client melihatnya via API sama sekali. Disetujui manusia 2026-08-23: embed `labels` array di response Card (bukan endpoint terpisah) → SOT 2.8.0→2.8.1.
6. (Bukan gap SOT — keputusan teknis murni per C.6.5 poin 3, didokumentasikan di Prinsip #7 task ini tanpa eskalasi SOT): skema `:activity_id` pada PATCH edit comment merujuk id `comment.added` original secara konsisten, payload `comment.edited` menyimpan `comment_activity_id` untuk rekonstruksi histori.

SOT final untuk generate ini: **2.8.1**. Task-2.10.1 (Card move, Phase 2 ✅) diidentifikasi perlu modifikasi tambahan (goal baru 3.7.2, auto-orphan Board Label) — bukan dibuka kembali (2.10.1 tetap ✅ untuk scope aslinya), melainkan goal BARU yang membangun DI ATAS-nya, ditandai `[MODEL LEBIH KUAT WAJIB]` karena menyentuh transaksi invariant-critical yang sama.

Belum ada implementasi yang dimulai — seluruh goal `⬜️`. Menunggu review manusia atas breakdown ini sebelum AI-Dev mulai bekerja (04-DELIVERY C.6.6).

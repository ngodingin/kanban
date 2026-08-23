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
| 3.1.1 | ✅ | [CL-02](#cl-02)<br>[CL-01](#cl-01)<br>[QA-CL-02](#qa-cl-02) | 100 | P0 | Tambah 12 entry ke `PERMISSION_CATALOG` (`packages/infrastructure/src/database/permission-catalog.ts`): `milestone_label.{read,create,update,archive,delete,restore}` dan `board_label.{read,create,update,archive,delete,restore}`, deskripsi Bahasa Indonesia mengikuti pola persis entry `milestone.*`/`board.*` yang sudah ada. Update `baselineGroupPermissionKeys` case `"Manager"`: tambah `...RESOURCE_FULL_KEYS("milestone_label")` dan `...RESOURCE_FULL_KEYS("board_label")` (D.2 baris Label — Manager full lifecycle). **Jangan ubah** case `"Contributor"` (D.2: tidak dapat grant eksplisit, sudah tercakup `card.update` untuk assign/remove ke Card). Co-Owner (`permissionCatalogKeys()`, semua key) dan Viewer (filter `.read`) otomatis ikut tanpa perubahan kode. | [02-SPEC D.1](docs/02-SPEC.md), [D.2](docs/02-SPEC.md) | — |

**Test:** Unit — `seedPermissionCatalog` idempotent (jalan 2x, `permissions.key` tidak duplikat, constraint UNIQUE sejak 2.2.2 tetap terjaga); `baselineGroupPermissionKeys("Manager")` mengandung seluruh 12 key baru; `baselineGroupPermissionKeys("Contributor")` TIDAK mengandung satu pun key `milestone_label.*`/`board_label.*`; `baselineGroupPermissionKeys("Co-Owner")` dan `Viewer` otomatis mengandung key baru tanpa perubahan eksplisit ke case-nya.
**DoD:** `permissionCatalogKeys()` mengembalikan 39 key total (27 lama + 12 baru); Project baru yang di-provision setelah goal ini menghasilkan baseline Manager group dengan Label lifecycle penuh, dibuktikan test provisioning end-to-end.

---

## TASK-3.2 — Activities schema migration (entity_type Label)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.2.1 | ✅ | [CL-04](#cl-04)<br>[CL-03](#cl-03)<br>[QA-CL-02](#qa-cl-02) | 100 | P0 | Perluas `activityEntityType` (`packages/infrastructure/src/database/project-schema.ts`) dari `["project","milestone","board","list","card"]` menjadi menambah `"milestone_label"`, `"board_label"` — otomatis mengubah CHECK constraint `activities_entity_type_check` yang di-generate Drizzle dari array tsb. Generate migration Drizzle baru (`drizzle-kit generate`, ikuti pola migration Project DB existing sejak Phase 0/1) — **bukan tabel baru**, hanya perluasan CHECK constraint pada tabel `activities` yang sudah ada. | [02-SPEC BR-025](docs/02-SPEC.md), [FR-035](docs/02-SPEC.md); [03-ENG B.3](docs/03-ENGINEERING.md) | — |

**Test:** Integration — INSERT ke `activities` dengan `entity_type='milestone_label'` dan `'board_label'` BERHASIL (tidak lagi kena CHECK violation); `entity_type` selain 7 value yang diizinkan tetap DITOLAK database (regresi negatif, pastikan constraint tidak jadi longgar total).
**DoD:** Migration diterapkan bersih di Turso project DB baru maupun existing (idempotent/forward-only, tidak ada data existing yang perlu di-backfill karena belum ada row Label Activity sebelum goal ini); `pnpm -r build`/typecheck hijau.

---

## TASK-3.3 — Milestone Label domain commands (repository layer)  (dep: 2.1, 3.2)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.3.1 | ✅ | [CL-06](#cl-06)<br>[CL-05](#cl-05)<br>[QA-CL-01](#qa-cl-01) | 100 | P0 | Domain command Milestone Label baru — `packages/domain/src/label/milestone-label-errors.ts` (interface + error class: `MilestoneLabelNotFoundError`, `MilestoneLabelValidationError`, `MilestoneLabelVersionConflictError`, `MilestoneLabelInvalidStateError`, pola sama `milestone-errors.ts`), `packages/infrastructure/src/database/milestone-label-repository.ts` (implementasi Drizzle): `listMilestoneLabels` (exclude `deleted_at IS NOT NULL` kecuali diminta eksplisit, pola sama `GET /permission-groups` C.12), `createMilestoneLabel` (name wajib non-kosong; ancestor chain `[milestoneState, projectState]` via `isEffectivelyOperational` — TOLAK jika Milestone ATAU Project non-ACTIVE, INV-LIFE-001), `updateMilestoneLabel` (`name`, `expected_version` wajib), `archiveMilestoneLabel`, `restoreMilestoneLabel` (`evaluateRestore` — SELURUH ancestor harus ACTIVE, INV-LIFE-002), `deleteMilestoneLabel`. **WAJIB cek ancestor di SEMUA 4 operasi mutasi (update/archive/restore/delete), bukan cuma create/restore** (Prinsip #1 — pelajaran Review-CL-02 Phase 2, jangan ulangi). Setiap command atomik dalam `runInWriteTransaction`: version check → ancestor check → local-state check (state machine A.3, sama `LIFECYCLE_ALLOWED_FROM` Milestone) → mutation + Activity `milestone_label.created`/`.updated`/`.archived`/`.restored`/`.deleted` (entity_type=`milestone_label`, TASK-3.2) satu transaksi. | [02-SPEC C.11](docs/02-SPEC.md), BR-025 (amandemen 2.8.0), FR-031, FR-034; [03-ENG B.3–B.5](docs/03-ENGINEERING.md) | 2.1 (Phase 2), 3.2 |

**Test:** Unit — create ditolak jika Milestone ATAU Project ARCHIVED/DELETED; update/archive/delete dari state salah ditolak; `expected_version` salah → `VERSION_CONFLICT` tanpa perubahan/Activity; restore ditolak jika salah satu ancestor tidak ACTIVE; **[WAJIB]** archive Milestone dulu → coba `updateMilestoneLabel`/`archiveMilestoneLabel`/`deleteMilestoneLabel` terhadap Label-nya (masih local ACTIVE) → harus ditolak SEMUA (INV-LIFE-001, regresi eksplisit terhadap bug class Review-CL-02); Activity `milestone_label.*` tertulis dengan `entity_type='milestone_label'` (bukan `'milestone'`).
**DoD:** Seluruh 6 command (list+5 mutasi) atomik; ancestor check dipakai di seluruh 4 operasi mutasi; reuse `effective-state.ts` (TASK-2.1), tidak reimplementasi ancestor logic.

---

## TASK-3.4 — Milestone Label endpoints (HTTP)  (dep: 3.1, 3.3)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.4.1 | ✅ | [CL-08](#cl-08)<br>[CL-07](#cl-07)<br>[QA-CL-01](#qa-cl-01) | 100 | P0 | `GET /api/v1/projects/:project_id/milestones/:milestone_id/labels` + `POST .../labels` — pakai `RequestPipeline`, Owner-only interim untuk create (Prinsip #2), balikan `{data:{labels:[...]}}`/`{data:{label:{...}}}` konsisten C.2. | [02-SPEC C.11](docs/02-SPEC.md) | 3.3 |
| 3.4.2 | ✅ | [CL-10](#cl-10)<br>[CL-09](#cl-09)<br>[QA-CL-01](#qa-cl-01) | 100 | P1 | `PATCH .../labels/:label_id` — field `name` saja (C.15), `expected_version` wajib, Owner-only interim, payload invalid → `VALIDATION_ERROR`. | [02-SPEC C.11](docs/02-SPEC.md), C.15, C.2 | 3.3, 3.4.1 |
| 3.4.3 | ✅ | [CL-12](#cl-12)<br>[CL-11](#cl-11)<br>[QA-CL-01](#qa-cl-01) | 100 | P1 | `POST .../labels/:label_id/{archive,restore,delete}` — 3 domain command endpoint, `expected_version` wajib, Owner-only interim, pola `handleLifecycle` sama Milestone (TASK-2.3). | [02-SPEC C.11](docs/02-SPEC.md), A.3 | 3.3, 3.4.1 |

**Test:** Integration — create tanpa identitas ditolak; create pada Milestone/Project non-ACTIVE ditolak; read tanpa membership → `PROJECT_ACCESS_DENIED`; mutasi oleh non-Owner → `PERMISSION_DENIED`; version mismatch → `VERSION_CONFLICT`; Project-boundary — Label Project lain tidak pernah bocor/tersentuh.
**DoD:** Endpoint sesuai kontrak C.11 (6 route Milestone Label); response envelope C.2; field domain-controlled tidak bisa diubah via PATCH; seluruh test hijau.

---

## TASK-3.5 — Board Label domain commands (repository layer)  (dep: 2.1, 3.2, 3.3)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.5.1 | ✅ | [CL-20](#cl-20)<br>[CL-13](#cl-13)<br>[QA-CL-03](#qa-cl-03) | 100 | P0 | Domain command Board Label — `packages/domain/src/label/board-label-errors.ts`, `packages/infrastructure/src/database/board-label-repository.ts`, struktur IDENTIK TASK-3.3 tapi ancestor chain 3 level `[boardState, milestoneState, projectState]` (pola sama List — TASK-2.6). Activity `board_label.created`/`.updated`/`.archived`/`.restored`/`.deleted` (entity_type=`board_label`). **WAJIB cek ancestor di SEMUA 4 operasi mutasi**, sama seperti 3.3.1. | [02-SPEC C.11](docs/02-SPEC.md), BR-025, FR-031, FR-034; [03-ENG B.3–B.5](docs/03-ENGINEERING.md) | 2.1 (Phase 2), 3.2, 3.3 |

**Test:** Sama pola 3.3.1 tapi chain 3-level: create/update/archive/restore/delete ditolak jika SALAH SATU dari {Board, Milestone, Project} non-ACTIVE; **[WAJIB]** archive Board (bukan Milestone) dulu → keempat operasi mutasi Board Label-nya ditolak; archive Milestone (bukan Board langsung) → Board Label-nya (local ACTIVE, ancestor Board juga ACTIVE tapi Milestone non-ACTIVE) tetap ditolak (transitive ancestor, bukan cuma immediate parent).
**DoD:** Sama TASK-3.3 DoD, chain 3-level teruji eksplisit (bukan cuma 2-level seperti Milestone Label).

---

## TASK-3.6 — Board Label endpoints (HTTP)  (dep: 3.1, 3.5)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.6.1 | ✅ | [CL-22](#cl-22)<br>[CL-21](#cl-21)<br>[QA-CL-03](#qa-cl-03) | 100 | P0 | `GET .../boards/:board_id/labels` + `POST .../labels` — pola identik 3.4.1. | [02-SPEC C.11](docs/02-SPEC.md) | 3.5 |
| 3.6.2 | ✅ | [CL-22](#cl-22)<br>[QA-CL-03](#qa-cl-03) | 100 | P1 | `PATCH .../labels/:label_id` — pola identik 3.4.2. | [02-SPEC C.11](docs/02-SPEC.md), C.15, C.2 | 3.5, 3.6.1 |
| 3.6.3 | ✅ | [CL-22](#cl-22)<br>[QA-CL-03](#qa-cl-03) | 100 | P1 | `POST .../labels/:label_id/{archive,restore,delete}` — pola identik 3.4.3. | [02-SPEC C.11](docs/02-SPEC.md), A.3 | 3.5, 3.6.1 |

**Test:** Sama pola TASK-3.4, ancestor 3-level.
**DoD:** Endpoint sesuai kontrak C.11 (6 route Board Label); response envelope C.2; seluruh test hijau.

---

## TASK-3.7 — Card-Label association (assign/remove + auto-orphan on move)  (dep: 3.3, 3.5, 2.8/2.10 Phase 2)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.7.1 | ✅ | [CL-24](#cl-24)<br>[CL-23](#cl-23)<br>[QA-CL-05](#qa-cl-05) | 100 | P0 | `packages/infrastructure/src/database/card-label-association.ts`: `assignLabelToCard(cardId, labelId, actorUserId)` — cari `labelId` di `milestone_labels` DAN `board_labels` (server menentukan scope, C.11) → tolak jika tidak ditemukan di keduanya; tolak jika Label ARCHIVED/DELETED (FR-034); tolak jika scope tidak cocok posisi Card SAAT INI (`milestone_label.milestone_id == card.currentMilestoneId`; `board_label.board_id == card.currentBoardId`, dihitung dari `card.list_id → list.board_id → board.milestone_id`); tolak jika Card sendiri non-operational (ancestor chain penuh List→Board→Milestone→Project + local state, sama seperti `card.update`, Prinsip #4). INSERT baris baru `card_milestone_labels`/`card_board_labels` (`created_at=now`, `removed_at=NULL`) — JANGAN update baris lama yang sudah `removed_at` (histori, FR-033), partial-unique-index (`..._active_unique WHERE removed_at IS NULL`) mencegah duplikat aktif. Activity `label.added` pada `entity_type='card'` (payload `{label_id, label_scope, label_name}`, B.5). `removeLabelFromCard(cardId, labelId, actorUserId)` — set `removed_at=now` pada baris aktif; Activity `label.removed` (`entity_type='card'`, sama payload). | [02-SPEC C.11](docs/02-SPEC.md), FR-032, FR-033, FR-034; [03-ENG B.4–B.5](docs/03-ENGINEERING.md) | 3.3, 3.5, 2.8 (Card, Phase 2) |
| 3.7.2 | ✅ | [CL-26](#cl-26)<br>[CL-25](#cl-25)<br>[QA-CL-04](#qa-cl-04) | 100 | P0 **[MODEL LEBIH KUAT WAJIB]** | Modifikasi `moveCard` (`packages/infrastructure/src/database/card-repository.ts`, goal 2.10.1 Phase 2 ✅) — dalam TRANSAKSI YANG SAMA dengan mutasi move, jika `destinationBoard.id != sourceBoard.id`: SELECT seluruh baris `card_board_labels` aktif (`removed_at IS NULL`) milik Card ini → UPDATE `removed_at=now` pada semuanya → INSERT Activity `label.removed` per baris (payload sama 3.7.1, `entity_version` = versi Card setelah move). `card_milestone_labels` TIDAK disentuh (Milestone tetap sama pada move valid, invariant #5/BR-018). Auto-orphan HARUS atomik dengan move itu sendiri — kegagalan orphan tidak boleh membuat move ter-commit sebagian (invariant #9). | [03-ENG B.4](docs/03-ENGINEERING.md) (rationale Board Label orphan), FR-033; [02-SPEC A.16](docs/02-SPEC.md) invariant #5, #9 | 3.7.1, 2.10.1 (Phase 2 ✅) |

**Test:** Unit — assign label milik Milestone lain (bukan Milestone Card saat ini) ditolak; assign Board Label milik Board lain ditolak; assign Label ARCHIVED/DELETED ditolak (FR-034); assign pada Card non-operational (ancestor non-ACTIVE) ditolak; assign ulang label yang PERNAH di-remove BERHASIL (baris baru, bukan re-use baris lama — histori utuh, FR-033); remove pada asosiasi yang sudah `removed_at` (tidak aktif) TIDAK error tapi no-op/idempotent (dokumentasikan perilaku eksplisit); **[WAJIB, 3.7.2]** move Card lintas-Board (Board Label ada sebelumnya) → seluruh Board Label ter-orphan (`removed_at` terisi) + Activity `label.removed` tercatat, dalam Activity list yang SAMA dengan `card.moved`; Milestone Label Card yang sama TIDAK ter-orphan oleh move yang sama; move Card DALAM Board yang sama (List→List, bukan Board berbeda) TIDAK meng-orphan Board Label apa pun (guard `destinationBoard.id != sourceBoard.id` harus presisi).
**DoD:** `card_milestone_labels`/`card_board_labels` tidak pernah UPDATE baris `removed_at` yang sudah terisi (append/insert-baru untuk assign ulang, bukan reuse); auto-orphan dan move commit dalam satu `runInWriteTransaction` yang sama (bukan dua transaksi terpisah — cegah partial state).

---

## TASK-3.8 — Card-Label endpoints (HTTP)  (dep: 3.7)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.8.1 | ✅ | [CL-28](#cl-28)<br>[CL-27](#cl-27)<br>[QA-CL-05](#qa-cl-05) | 100 | P1 | `POST /api/v1/projects/:project_id/cards/:card_id/labels` (assign, body `{label_id}`) + `POST .../labels/:label_id/remove` — otorisasi menumpang `card.update` (Owner-only interim, Prinsip #4, BUKAN permission Label tersendiri). | [02-SPEC C.11](docs/02-SPEC.md) | 3.7 |

**Test:** Integration — assign/remove oleh non-Owner → `PERMISSION_DENIED` (sama `card.update`); assign label lintas-Project (Project lain) ditolak sebagai `RESOURCE_NOT_FOUND` (bukan bocor cross-project); assign/remove pada Card ARCHIVED/DELETED ditolak.
**DoD:** 2 endpoint sesuai kontrak C.11; response envelope C.2.

---

## TASK-3.9 — Card GET response embeds `labels`  (dep: 3.7, 2.9.1 Phase 2)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.9.1 | ✅ | [CL-30](#cl-30)<br>[CL-29](#cl-29)<br>[QA-CL-05](#qa-cl-05) | 100 | P1 | `getCard` (`packages/infrastructure/src/database/card-repository.ts`, goal 2.9.1 Phase 2 ✅) — tambah JOIN `card_milestone_labels`/`card_board_labels` (filter `removed_at IS NULL`) ke `milestone_labels`/`board_labels`, kembalikan field `labels: [{id, name, scope: "milestone"|"board"}]` di payload response (C.8, amandemen 2.8.1). | [02-SPEC C.8](docs/02-SPEC.md) (field `labels`) | 3.7, 2.9.1 (Phase 2 ✅) |

**Test:** Card tanpa Label apa pun → `labels: []` (bukan `null`/`undefined`); Card dengan campuran Milestone Label + Board Label → keduanya muncul dengan `scope` benar; Label yang sudah di-`remove` TIDAK muncul; Label yang di-orphan otomatis oleh move (3.7.2) TIDAK muncul setelah move.
**DoD:** `GET /cards/:card_id` selalu menyertakan `labels` (array, boleh kosong); tidak menambah N+1 query berlebihan (satu JOIN per scope, bukan query per Label).

---

## TASK-3.10 — GET /activities (generic + convenience routes)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.10.1 | ✅ | [CL-15](#cl-15)<br>[CL-14](#cl-14)<br>[QA-CL-06](#qa-cl-06) | 100 | P1 | `packages/infrastructure/src/database/activity-query.ts` (`listActivities(client, filters)` — filter opsional `entity_type`, `entity_id`, `actor` (=`actor_user_id`), `action`, `from`/`to` (rentang `created_at`), tanpa pagination — Prinsip #6) + `apps/api/src/routes/activities.ts` (router baru): `GET /projects/:project_id/activities` (generic, seluruh filter query param) dan 4 convenience route (`.../cards/:card_id/activities`, `.../milestones/:milestone_id/activities`, `.../boards/:board_id/activities`, `.../lists/:list_id/activities` — masing-masing hardcode `entity_type`+`entity_id` dari path param, filter lain tetap optional via query). Baca-saja, TIDAK ada Owner-only restriction (pola sama GET Milestone/Board/List/Card — cukup valid membership). | [02-SPEC C.9](docs/02-SPEC.md), BR-024, FR-035–038 | — |

**Test:** Integration — GET tanpa identitas ditolak; GET tanpa membership → `PROJECT_ACCESS_DENIED`; filter `entity_type`+`entity_id` mengembalikan HANYA Activity entity tsb; convenience route mengembalikan subset identik dengan generic route + filter manual yang sesuai; Project-boundary — Activity Project lain tidak pernah muncul (isolasi struktural per-Project-DB, tapi tetap tes eksplisit tidak ada query yang salah resolve Client); tidak ada endpoint `PUT`/`PATCH`/`DELETE` pada `/activities` (BR-024, invariant #8).
**DoD:** 5 route sesuai kontrak C.9; response `{data:{activities:[...]}}` C.2; hanya read, tidak ada mutasi apa pun via router ini.

---

## TASK-3.11 — Comment create

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.11.1 | ✅ | [CL-17](#cl-17)<br>[CL-16](#cl-16)<br>[QA-CL-07](#qa-cl-07) | 100 | P1 | `packages/infrastructure/src/database/card-comment.ts`: `addComment(cardId, body, actorUserId)` — validasi `body` non-kosong string; validasi state Card **saat request diproses** (BR-034, bukan snapshot UI) — Card DELETED/ARCHIVED ditolak (BR-033), TERMASUK ancestor non-operational (Card local ACTIVE tapi ancestor non-ACTIVE — konsisten INV-LIFE-001, comment adalah mutasi Card); INSERT Activity `comment.added` (`entity_type='card'`, payload `{body}`, B.5) — `entity_version` = versi Card TERKINI (comment tidak menaikkan `version` Card, hanya mencatat versi saat itu, karena Comment bukan field Card). Endpoint `POST /api/v1/projects/:project_id/cards/:card_id/comments` — otorisasi Owner-only interim (Prinsip #2, permission `card.comment` sudah ada di katalog sejak Phase 1). | [02-SPEC C.10](docs/02-SPEC.md), A.9 (BR-030,033,034), FR-039, FR-042 | 2.9 (Card, Phase 2) |

**Test:** Comment pada Card ACTIVE (ancestor semua ACTIVE) berhasil; Comment pada Card ARCHIVED ditolak (BR-033); Comment pada Card DELETED ditolak; Comment pada Card local-ACTIVE tapi ancestor ARCHIVED ditolak (INV-LIFE-001, race-condition BR-034: validasi state SAAT request, bukan saat UI dibuka); `body` kosong/bukan string → `VALIDATION_ERROR`; Activity `comment.added` immutable (tidak ada endpoint UPDATE/DELETE untuk action ini sendiri, hanya `comment.edited` baru — TASK-3.12).
**DoD:** Endpoint sesuai kontrak C.10; Comment selalu tercatat sebagai Activity Card (BR-030); tidak ada tabel Comment terpisah (03-ENG B.3).

---

## TASK-3.12 — Comment edit  (dep: 3.11)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 3.12.1 | ✅ | [CL-19](#cl-19)<br>[CL-18](#cl-18)<br>[QA-CL-08](#qa-cl-08) | 100 | P1 | `editComment(cardId, commentActivityId, newBody, actorUserId)` (`card-comment.ts`) — load Activity `commentActivityId`, WAJIB `action IN ('comment.added','comment.edited')` DAN `entity_id = cardId` (cegah edit Activity entity lain); **BR-034A ownership check WAJIB eksplisit**: `activity.actor_user_id == actorUserId` (bandingkan langsung, JANGAN diasumsikan/skip walau interim model Owner-only membuatnya trivially true hari ini — Prinsip #3); validasi state Card sama seperti 3.11.1 (BR-033/034, D.4 `card.is_effectively_active`); jika `commentActivityId` merujuk `comment.edited` (bukan `comment.added` original), WAJIB tetap tersedia field `comment_activity_id` di payload lama untuk menemukan original — cari original via `data->>'comment_activity_id'` jika ada, else pakai id itu sendiri (dia sendiri original); INSERT Activity BARU `comment.edited` (payload `{before, after, comment_activity_id: <id original>}`, Prinsip #7) — Activity lama (`comment.added` atau `comment.edited` sebelumnya) TIDAK diubah sama sekali (BR-032, immutability). Endpoint `PATCH /api/v1/projects/:project_id/cards/:card_id/comments/:activity_id`. | [02-SPEC C.10](docs/02-SPEC.md), BR-031, BR-032, BR-034A; [D.4](docs/02-SPEC.md) formula `can_comment_update`; FR-040 | 3.11 |

**Test:** Edit comment milik sendiri berhasil; edit comment milik user lain ditolak (`PERMISSION_DENIED`, BR-034A — **termasuk simulasi Owner mencoba edit comment bukan miliknya sendiri**, walau di interim model ini belum reachable karena hanya Owner yang bisa comment — tulis test sebagai dokumentasi invariant untuk Phase 4); edit comment pada Card yang sudah ARCHIVED/DELETED sejak comment dibuat ditolak (D.4 `card.is_effectively_active`); edit comment yang SUDAH pernah diedit sebelumnya (edit kedua/ketiga) tetap memakai `:activity_id` original yang sama, bukan id edit terakhir; Activity `comment.added`/`comment.edited` LAMA tidak berubah setelah edit baru (assert row lama byte-identik sebelum/sesudah); `activity_id` yang merujuk Activity bukan `comment.*`/bukan milik Card ini → `RESOURCE_NOT_FOUND` atau `VALIDATION_ERROR` (bukan edit Activity sembarangan).
**DoD:** Endpoint sesuai kontrak C.10; comment lama tidak pernah termodifikasi (BR-031/032); ownership check eksplisit dan diuji, bukan tersirat dari interim Owner-only model.

---

## Closure Log

<!-- Dev: `### CL-nn — YYYY-MM-DD · goal <id> <ringkasan>`. QA: `### QA-CL-nn — ...`. Review: `### Review-CL-nn — ...`. Cantumkan Role + Model/platform aktual. Append-only, jangan hapus/ubah entry lama. -->

<a id="cl-31"></a>
### CL-31 — 2026-08-23 · fix regresi CL-53 di `label-errors.ts` (Review-CL-03 P0 blocker) — bukan reopening goal, seluruh 17/17 goal tetap ✅
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Diambil sebagai P0 blocker eksplisit dari Review-CL-03 (di bawah) sebelum menyentuh Phase 4. Direproduksi ulang independen (bukan percaya laporan): `pnpm --filter @kanban/api build && node apps/api/dist/serve.js` → crash identik `SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]` di `label-errors.ts:6`, persis seperti dilaporkan. Grep konfirmasi scope persis 3 constructor (`LabelNotFoundError`, `LabelVersionConflictError`, `LabelInvalidStateError`) — `LabelValidationError` tidak terpengaruh (constructor string biasa, bukan parameter-property).
**Fix:** Pola identik CL-53 (Phase 2) — diubah ke field-eksplisit (`readonly x: T; constructor(x: T) { this.x = x; }`), bukan shorthand. Murni transformasi sintaks, tidak ada perubahan behavior/pesan error.
**Verifikasi ulang (bukan klaim):** `pnpm -r typecheck` bersih 6/6; `pnpm --filter @kanban/api build && node apps/api/dist/serve.js` → boot sukses, `curl /api/v1/health` → 200 (sebelumnya crash instan); `pnpm exec vitest run` → **64 file/407 test PASS**, nol regresi; `pnpm exec playwright test` → **1/1 PASS** (sebelumnya webServer gagal start). `pnpm lint` bersih.
**Kenapa tidak reopen goal:** Sama alasan CL-53 asli — Test/DoD 17/17 goal Phase 3 berbasis `vitest` (business-logic correctness), tidak pernah tersentuh bug packaging/runtime-invocation ini. Dicatat standalone, bukan mengubah Status/CL goal 3.3.1/3.5.1/3.7.1/3.7.2/3.9.1 manapun (tetap ✅).
**Rekomendasi proses ditindaklanjuti:** Sesuai saran Review-CL-03, `pnpm exec playwright test` sudah dijalankan sebagai bagian verifikasi fix ini — direkomendasikan tetap masuk checklist closure Phase 4 ke depan (di luar kendali Dev untuk menjamin sesi lain mengikutinya, tapi dicatat di sini sebagai bukti sudah dijalankan minimal sekali di titik regresi ini).


<a id="review-cl-03"></a>
### Review-CL-03 — 2026-08-23 · [CRITICAL] regresi CL-53 (parameter-property) di `label-errors.ts` — ditemukan saat audit pra-Phase-4

**Role:** AI-Planning & Review · **Model:** Claude Sonnet 5

**Bukti:** Saat melakukan review menyeluruh (SOT compliance/SOLID/code review/no-hardcode) atas seluruh fase closed sebelum generate PHASE-4-TASKS.md, `perl` multi-line scan untuk pola `constructor(\n  public|private|protected readonly ...)` menemukan `packages/domain/src/label/label-errors.ts` — ketiga class-nya (`LabelNotFoundError`, `LabelVersionConflictError`, `LabelInvalidStateError`) memakai TS constructor parameter-property shorthand, PERSIS pola yang menyebabkan `node dist/serve.js` crash dan sudah diperbaiki di 5 file lain lewat CL-53 (Phase 2, commit `82f28a0`, 2026-08-23 04:50). Grep single-line saya sendiri di Review-CL-05 (Phase 2) melewatkan file ini karena pola grep tidak menangani signature constructor multi-baris — false negative pada verifikasi sebelumnya, bukan file ini belum ada saat itu.

**Timeline dikonfirmasi via `git log`:** `label-errors.ts` dibuat commit `9528895` (goal 3.3.1, Milestone Label domain commands) pada **2026-08-23 05:52:26** — SEKITAR 1 JAM SETELAH CL-53 (`82f28a0`, 04:50:18) landed di repo yang sama, dengan CL-53 sendiri secara eksplisit mendokumentasikan pola ini sebagai penyebab crash dan merekomendasikan `playwright test` masuk checklist closure fase berikutnya (Phase 3).

**Direproduksi live:** `pnpm --filter @kanban/api build && node apps/api/dist/serve.js` → crash identik: `SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]` persis di `label-errors.ts:6`. Blast radius: SELURUH server gagal boot via plain-Node (bukan cuma endpoint Label) karena ini kegagalan module-load-time, bukan runtime — mempengaruhi `pnpm --filter @kanban/api start` (dev lokal) dan seluruh suite `playwright test` (e2e), identik dengan dampak CL-53 asli.

**Kenapa lolos seluruh audit Phase 3:** QA-CL-01..08 dan Review-CL-02 (audit closure final Phase 3, saya sendiri) TIDAK satu pun menjalankan `playwright test`/boot `node dist/serve.js` — persis gap proses yang direkomendasikan CL-53 untuk dicegah di fase berikutnya, tapi rekomendasi itu tidak diikuti. **Saya mengakui ini sebagai kelalaian saya sendiri di Review-CL-02**, bukan cuma Dev/QA — audit closure final seharusnya menjalankan checklist itu.

**Tindak lanjut:** BUKAN reopening goal 3.3.1/3.5.1/3.7.1/3.7.2/3.9.1 (Test/DoD asli berbasis vitest tetap benar dan tetap hijau, sama seperti alasan CL-53 tidak reopen goal Phase 2) — ini adalah fix cross-cutting berikutnya, pola identik CL-53: ubah ketiga constructor `label-errors.ts` dari parameter-property shorthand ke field-eksplisit (`constructor(x: T) { this.x = x; }`). **AI-Planning & Review DILARANG mengubah kode** (§3) — fix ini didelegasikan ke AI-Dev sesi berikutnya, prioritas **P0** (memblokir `pnpm start`/e2e untuk SELURUH API, bukan cuma Label). Rekomendasi eksplisit: masukkan `playwright test`/`node dist/serve.js` boot check ke **setiap** closure Task/Phase berikutnya, bukan cuma dicatat sebagai rekomendasi yang mudah terlewat lagi — pertimbangkan menambah ke `pnpm -r build` script atau CI gate alih-alih bergantung pada disiplin manual audit.

**Temuan tambahan (SOLID/DRY, severity sedang, bukan bug):** `assertOwnerInterim` (fungsi identik byte-per-byte — cek `ctx.ownerUserId !== ctx.userId` → `PERMISSION_DENIED`) diduplikasi **7 kali** di `apps/api/src/routes/{milestones,boards,lists,comments,labels,card-labels,cards}.ts`, bukan satu helper bersama seperti `readJsonObject`/`readExpectedVersionField` yang sudah benar disentralisasi di `routes/projects.ts` dan diimpor lintas file. Bukan bug (seluruh 7 salinan identik, tidak ada divergensi) tapi liability maintenance nyata: Phase 4 (permission resolution engine sungguhan) HARUS mengganti seluruh 7 call site ini secara seragam untuk berhenti jadi Owner-only interim — satu titik perubahan akan jauh lebih aman daripada 7. Rekomendasi: pindahkan ke `routes/projects.ts` (atau modul helper baru) sebagai bagian goal awal Phase 4, bukan tugas Phase 3 (tidak reopen goal apa pun, murni observasi untuk perencanaan Phase 4).

<a id="review-cl-02"></a>
### Review-CL-02 — 2026-08-23 · audit closure final Phase 3 (17/17 goal ✅)

**Role:** AI-Planning & Review · **Model:** Claude Sonnet 5

**Bukti — reproduksi independen, tidak menerima laporan QA/Dev begitu saja:** `pnpm -r typecheck` → 6/6 bersih; `pnpm lint` → 0 error; `pnpm exec vitest run` → **64 file / 407 test PASS**, cocok persis klaim QA-CL-01..08. Baca kode langsung (bukan cuma test hijau) untuk 3 titik paling berisiko:
1. **3.7.2 (`[MODEL LEBIH KUAT WAJIB]`, `moveCard` auto-orphan Board Label, `card-repository.ts:139-234`)** — dikonfirmasi guard `sourceChain.boardId !== destination.boardId` (baris 199) memang komplemen logis persis dari cek BR-018 yang sudah lolos di atasnya (baris 166: `boardId !== ... && milestoneId !== ...` → tolak) — begitu baris 199 tercapai, kombinasi board-beda-tapi-milestone-sama sudah dijamin oleh kegagalan kondisi tolak tsb, jadi orphan HANYA jalan pada kasus yang valid (cross-Board dalam Milestone sama), tidak pernah pada cross-Milestone (yang sudah ditolak lebih dulu) maupun same-Board (List→List). Auto-orphan + `card.moved` + `label.removed` seluruhnya dalam SATU `runInWriteTransaction` (baris 140) — atomicity invariant #9 terjaga. `card_milestone_labels` genuinely tidak disentuh baris manapun di fungsi ini. Model yang mengerjakan (CL-25/CL-26, dicek) memang `claude-sonnet-5` — tidak ada pengulangan insiden governance Phase 2 (Review-CL-03).
2. **3.12.1 (edit comment, rantai edit — `card-comment.ts:154-239`)** — ditelusuri manual 3 skenario (edit pertama; edit kedua via `:activity_id` original; jalur toleran via `:activity_id` = id `comment.edited`) baris-per-baris, independen dari trace QA-CL-08 (dilakukan sebelum membaca QA-CL-08, baru dicocokkan sesudahnya) — hasil identik: resolusi `originalId` benar untuk kedua jenis entry point, query rantai `ORDER BY created_at DESC, id DESC LIMIT 1` benar mengambil edit TERAKHIR (bukan row yang direferensikan langsung) sebagai sumber teks "before". Bug yang diklaim Dev temukan-sendiri (CL-19) genuinely nyata dan genuinely diperbaiki dengan benar — bukan false-alarm atau overclaim.
3. **3.7.1 (`card-label-association.ts`)** — `junctionTable(scope)` (baris 148-150) mengembalikan string hardcode dari `LabelScope` (`"milestone"`/`"board"`, union type tertutup, diisi HANYA oleh `resolveLabel()` internal, tidak pernah dari input client) sebelum diinterpolasi ke SQL (`INSERT INTO ${table}`/`UPDATE ${table}`/`SELECT ... FROM ${table}`) — dikonfirmasi bukan risiko injeksi (nilai variabel bukan dari request body/query param, `labelId`/`cardId` tetap lewat parameter binding `?`). Pola insert-only untuk assign (baris 175, tidak pernah UPDATE baris `removed_at` lama) dikonfirmasi didukung `uniqueIndex(...).where(removed_at IS NULL)` sungguhan di schema (`project-schema.ts:136-138`, sudah ada sejak Phase 0) — bukan cuma disiplin aplikasi, ada constraint DB nyata yang mencegah duplikat asosiasi aktif.
4. **CL-20 (model handoff 3.5.1)** — dikonfirmasi genuinely didokumentasikan (bukan dikarang QA): CL-13 (`big-pickle`, opencode) meninggalkan tree tidak compile, CL-20 (`claude-sonnet-5`) mengambil alih dan memperbaiki root cause (mismatch signature interface vs implementasi) dengan penjelasan yang akurat dan dapat direproduksi.

**Kesimpulan:** Independen mengonfirmasi seluruh klaim QA-CL-01..08 akurat di titik-titik yang diperiksa. Tidak ada goal yang perlu diturunkan status. Phase 3 (Labels & Activity) genuinely 17/17 ✅ — SOT-compliant terhadap seluruh 6 amandemen persiapan (2.6.0→2.8.1) yang dikunci sebelum task ini digenerate.

<a id="qa-cl-08"></a>
### QA-CL-08 — 2026-08-23 · goal 3.12.1 🔎 → ✅ — PATCH edit comment, rantai edit-kedua diverifikasi manual baris-per-baris
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Karena CL-19 melaporkan menemukan-dan-memperbaiki bug sendiri sebelum commit (resolusi teks "before" pada edit kedua), saya TIDAK menerima klaim itu begitu saja — menelusuri logika `editComment` (`card-comment.ts:154-239`) baris-per-baris dengan 3 skenario konkret secara manual (dilakukan dengan pena-dan-kertas terhadap kode, bukan cuma jalankan test):
1. Edit pertama (`:activity_id`=original A, action `comment.added`): `originalId=A`; query rantai `WHERE id=A OR comment_activity_id=A` cuma cocok row A saat ini → `currentBody = data.body` (teks asli). Baru B disisipkan dengan `comment_activity_id=A`. Benar.
2. Edit KEDUA lewat `:activity_id=A` (client selalu kirim original per Prinsip #7): `originalId=A` lagi (row A masih `comment.added`); query rantai sekarang cocok row A DAN row B (`comment_activity_id=A`) → `ORDER BY created_at DESC LIMIT 1` memilih row B (paling baru) → `currentBody = latestData.after` (teks HASIL edit pertama, BUKAN teks asli). Ini persis textbook fix yang benar — kalau bug lama masih ada, `currentBody` akan salah ambil `data.body` dari row A (teks asli usang).
3. Jalur toleran `:activity_id`=B (id comment.edited, bukan original): `action=comment.edited` → `originalId = data.comment_activity_id = A` (resolve balik ke original) → query rantai SAMA seperti kasus 2 → hasil identik. Konsisten independen dari entry point mana pun di rantai.
Ketiga penelusuran manual cocok PERSIS dengan hasil test `comments-edit.test.ts` (7 test, dijalankan ulang — hijau) — termasuk test eksplisit "edit KEDUA... tetap resolve comment_activity_id original" dan "toleran... tetap resolve ke original yang benar". BR-034A (ownership) dikonfirmasi sebagai perbandingan eksplisit `activity_row.actor_user_id !== actorUserId` — bukan tersirat dari model interim Owner-only, benar-benar ditegakkan sekarang walau baru bisa diuji lewat SQL injection langsung (dua comment-author asli belum bisa direproduksi di model otorisasi interim, didokumentasikan jujur di CL-19 sebagai keterbatasan test, bukan disembunyikan).
**Kesimpulan:** ✅ ACCEPT — bug fix Dev genuinely benar, diverifikasi independen sampai level logika, bukan sekadar re-run test yang disediakan.

<a id="qa-cl-07"></a>
### QA-CL-07 — 2026-08-23 · goal 3.11.1 🔎 → ✅ — POST comment sebagai Activity Card
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `apps/api/test/comments-create.test.ts` (5 test) dijalankan ulang — hijau. Konfirmasi: Comment BUKAN tabel terpisah (03-ENG B.3), murni Activity `comment.added` — tidak ada migrasi tabel baru dibutuhkan (dikonfirmasi tidak ada perubahan skema di luar 3.2.1). `entity_version` pada Activity comment mencatat versi Card SAAT itu (informasional, comment sendiri tidak mengubah `version` Card — dikonfirmasi tidak ada UPDATE ke tabel `cards` di `addComment`). State Card divalidasi SAAT request (bukan snapshot UI) via `assertCardEffectivelyActive` — reuse pola ancestor-check yang sama seperti `card-label-association.ts` (3.7.1), tidak reimplementasi.
**Kesimpulan:** ✅ ACCEPT.

<a id="qa-cl-06"></a>
### QA-CL-06 — 2026-08-23 · goal 3.10.1 🔎 → ✅ — GET /activities generic + 4 convenience route, read-only ditegakkan
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `apps/api/test/activities-list.test.ts` (6 test) dijalankan ulang — hijau. Baca `routes/activities.ts` — dikonfirmasi TIDAK ada method selain GET terdaftar di router ini sama sekali (BR-024/invariant #8, bukan cuma diasumsikan dari nama "read-only" — dicek langsung tidak ada `.post/.patch/.delete` apa pun). Membership-only (bukan Owner-only) untuk baca — konsisten C.9 dan pola GET Milestone/Board/List/Card. 4 convenience route (`/cards/:id/activities` dst.) dikonfirmasi murni shortcut filter `entity_type+entity_id` — test eksplisit membandingkan hasil convenience route identik dengan generic+filter manual, bukan implementasi paralel yang bisa divergen.
**Kesimpulan:** ✅ ACCEPT.

<a id="qa-cl-05"></a>
### QA-CL-05 — 2026-08-23 · goals 3.7.1/3.8.1/3.9.1 🔎 → ✅ — assign/remove Label ke Card + endpoint HTTP + embed GET
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca penuh `card-label-association.ts` + `card-label-association.test.ts` (8 test) + `apps/api/test/card-labels.test.ts` (6 test) + `cards-get-labels.test.ts` (2 test) — semua dijalankan ulang, hijau. Konfirmasi:
- **Server-determined scope** — `resolveLabel` cek `milestone_labels` dulu baru `board_labels`, DAN memvalidasi label tsb milik Milestone/Board **posisi Card SAAT INI** (bukan cuma "label itu exist") — assign Label dari Milestone/Board lain (walau exist secara global) ditolak `INVALID_STATE`. Dites eksplisit untuk kedua scope.
- **History preservation (FR-033)** — re-assign setelah remove membuat baris BARU (`INSERT`, bukan `UPDATE` baris `removed_at` lama); dikonfirmasi ada partial UNIQUE index `WHERE removed_at IS NULL` di schema yang menjamin ini di level DB juga (defense-in-depth, bukan cuma disiplin aplikasi) — assign duplikat aktif ditolak `INVALID_STATE` bersih, dikonfirmasi TIDAK bocor sebagai raw UNIQUE constraint error (test eksplisit "tanpa kena raw UNIQUE constraint").
- **String interpolation nama tabel** (`` `${table}` `` di `junctionTable()`) — dicek BUKAN risiko SQL injection: `table` hanya berasal dari `LabelScope` closed-enum internal (`"milestone"`→`"card_milestone_labels"` / `"board"`→`"card_board_labels"`), tidak pernah dari input client langsung.
- **3.9.1 embed** — field `labels` di `GET /cards/:card_id` opsional di `cardPayload`; call site create/update/lifecycle Card (Phase 2 ✅) TIDAK memanggil dengan `labels`, dikonfirmasi shape response-nya byte-identik sebelum/sesudah (regresi `cards-create-get.test.ts`/`cards-patch.test.ts`/`cards-lifecycle.test.ts` tetap hijau tanpa modifikasi). 2 query paralel (`Promise.all`, 1 JOIN per scope) bukan N+1.
`pnpm -r typecheck`/`pnpm lint` bersih.
**Kesimpulan:** ✅ ACCEPT ketiganya.

<a id="qa-cl-04"></a>
### QA-CL-04 — 2026-08-23 · goal 3.7.2 🔎 → ✅ — auto-orphan Board Label saat move lintas-Board, verifikasi maksimal (invariant-critical, moveCard dimodifikasi)
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Governance check (positif kali ini):** goal ditandai `[MODEL LEBIH KUAT WAJIB]` — dikonfirmasi dikerjakan `claude-sonnet-5` (CL-25/26), BUKAN model ringan yang dipakai goal lain di fase ini. Sesuai AGENTS.md §11.2, tidak berulang seperti insiden 2.10.1 Phase 2.
**Bukti — baca penuh blok baru di `moveCard` (`card-repository.ts:189-225`):** ditambahkan SETELAH UPDATE+Activity `card.moved`, dalam `runInWriteTransaction` yang SAMA (bukan transaksi baru — kegagalan orphan membatalkan seluruh move, invariant #9). Guard `sourceChain.boardId !== destination.boardId` — dikonfirmasi PERSIS kondisi yang benar: karena BR-018 check (baris di atasnya) sudah menolak kombinasi "beda Board DAN beda Milestone" lebih dulu (`InvalidDestinationError`), titik ini HANYA tercapai untuk 2 kasus valid: sama-Board (guard `false`, tidak orphan — benar) atau beda-Board-sama-Milestone (guard `true`, orphan Board Label — benar, karena Board Label terikat ke Board tsb, sedangkan Milestone tidak berubah jadi `card_milestone_labels` sengaja TIDAK disentuh sama sekali, dikonfirmasi tidak ada query apa pun ke tabel itu di blok baru). SELECT hanya label AKTIF (`removed_at IS NULL`) via JOIN (ambil nama sekalian, hindari N+1), `entity_version` Activity `label.removed` = `nextVersion` (versi Card SETELAH move, konsisten `card.moved` di baris sebelumnya, bukan versi lama).
**Bukti — test terpisah dari regresi Phase 2 (disiplin baik):** `card-move-label-orphan.test.ts` (4 test, file BARU terpisah dari `card-move.test.ts`/`cards-move.test.ts` goal 2.10.1 ✅) — dijalankan ulang, hijau. Regresi Phase 2 (`card-move.test.ts` 10 test, `cards-move.test.ts` 5 test) dijalankan ulang TANPA modifikasi — tetap hijau, membuktikan `moveCard` yang dimodifikasi tidak mengubah perilaku Phase 2 manapun. Test baru mencakup 4 kasus tepat: cross-board dengan Board Label → orphan+Activity; Milestone Label pada Card yang sama TIDAK ikut ter-orphan (assert row `removed_at` tetap NULL + hanya 1 Activity `label.removed` bukan 2); same-board move → nol orphan nol Activity (guard presisi, bukan over-trigger); Card tanpa Board Label sama sekali → sukses tanpa error (loop kosong).
**Kesimpulan:** ✅ ACCEPT — correctness genuinely terbukti dan governance model-tiering dipatuhi, tidak ada temuan.

<a id="qa-cl-03"></a>
### QA-CL-03 — 2026-08-23 · goals 3.5.1/3.6.1/3.6.2/3.6.3 🔎 → ✅ — Board Label domain command + endpoint HTTP
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `board-label-commands.test.ts` (7 test) + `apps/api/test/board-labels.test.ts` (8 test) dijalankan ulang — hijau. Pola ancestor-chain 3-level (Board→Milestone→Project) konsisten Review-CL-02 sejak awal implementasi (test `[transitive] archive Milestone SAJA → mutasi Board Label tetap DITOLAK` eksplisit ada, tidak perlu perbaikan susulan). **Catatan proses dicek dari CL-20:** goal ini sempat diambil-alih dari sesi `big-pickle` yang meninggalkan working tree TIDAK compile (mismatch signature `(projectId, input)` vs `(input)` 1-arg di 4 method mutasi) — dikonfirmasi baca commit CL-20 bahwa perbaikan dilakukan tepat (parameter `projectId` ditambahkan konsisten pola Milestone Label, TERMASUK memperbaiki satu bug test dynamic-dispatch yang akan salah collect argumen di runtime walau lolos type-erasure `as never`) dan diverifikasi ulang independen sebelum commit (bukan cuma lanjut dari state rusak). `pnpm -r typecheck`/`pnpm lint` bersih untuk state akhir.
**Kesimpulan:** ✅ ACCEPT keempatnya.

<a id="qa-cl-02"></a>
### QA-CL-02 — 2026-08-23 · goals 3.1.1/3.2.1 🔎 → ✅ — permission catalog Label + migrasi entity_type
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `permission-catalog.test.ts` (Label bagian, 5 test) + `activity-entity-type.test.ts` (3 test) dijalankan ulang — hijau. Migrasi (`0001_activity_entity_type_label.sql`) pakai pola table-rebuild standar SQLite untuk ubah CHECK constraint (SELECT-INSERT ke tabel baru → DROP lama → RENAME) — dikonfirmasi data existing terbawa utuh (test `[DoD] data existing terbawa utuh saat table-recreate` eksplisit ada) dan `project-schema.ts`'s `check()` constraint cocok persis dengan SQL migrasi (7 value: `project, milestone, board, list, card, milestone_label, board_label`). D.2 baseline matrix: Manager dapat 12 key Label penuh, Contributor nol (assign/remove Label numpang `card.update`, bukan permission Label tersendiri — dikonfirmasi konsisten desain 3.7.1), Co-Owner/Viewer otomatis mengikuti pola existing tanpa perubahan case eksplisit.
**Kesimpulan:** ✅ ACCEPT keduanya.

<a id="qa-cl-01"></a>
### QA-CL-01 — 2026-08-23 · goals 3.3.1/3.4.1/3.4.2/3.4.3 🔎 → ✅ — Milestone Label domain command + endpoint HTTP
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `apps/api/test/milestone-labels-create-get.test.ts` (4 test) + `milestone-labels-patch.test.ts` (4 test) + `milestone-labels-lifecycle.test.ts` (4 test) dijalankan ulang — hijau. Pola CRUD+lifecycle 2-level (Milestone→Project) identik struktur Milestone/Board (Phase 2), ancestor-check ditegakkan sejak awal untuk update/archive/delete (bukan cuma create/restore) — tidak mewarisi celah Review-CL-02 karena dibangun setelah fix itu ada. Owner-only interim untuk mutation, membership-only untuk GET.
**Kesimpulan:** ✅ ACCEPT keempatnya.

**Verifikasi lintas-goal (seluruh batch — 17 goal, Phase 3 penuh):** `pnpm -r typecheck` → 6/6 Done, 0 error. `pnpm lint` → 0 error. `pnpm exec vitest run` → **64 file / 407 test PASS**, zero regresi terhadap Phase 0/1/2. Model-tiering: goal invariant-critical (3.7.2) dikerjakan model kuat sesuai tag governance — tidak ada pengulangan insiden Phase 2 (2.10.1).

<a id="cl-30"></a>
### CL-30 — 2026-08-23 · goal 3.9.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — GET /cards/:card_id embed field labels
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `pnpm exec vitest run` → 64 file / **407** test lulus (2 test baru `apps/api/test/cards-get-labels.test.ts`, file terpisah dari `cards-create-get.test.ts` goal 2.9.1 Phase 2 ✅ — regresi diverifikasi ulang hijau 5 test tanpa modifikasi); `pnpm -r typecheck` bersih 6/6; `pnpm lint` bersih. Implementasi: `listCardLabels(client, cardId)` baru (`card-label-association.ts`) — 2 query paralel (`Promise.all`, satu JOIN per scope: `card_milestone_labels`→`milestone_labels`, `card_board_labels`→`board_labels`, filter `removed_at IS NULL`), bukan N+1 per Label. `cardPayload` (`cards.ts`) diberi parameter `labels?: CardLabelSummary[]` opsional — kalau `undefined`, field `labels` absen dari output (JSON.stringify tidak menyertakan key `undefined`), sehingga call site create/update/lifecycle (yang TIDAK dipanggil dengan `labels`) shape response-nya tidak berubah sama sekali. Hanya handler `GET /cards/:card_id` yang memanggil `listCardLabels` lalu meneruskan ke `cardPayload(record, labels)`.
**Test:** Card tanpa Label → `labels: []` (bukan `null`/`undefined`, assert `toEqual([])` eksplisit); Card dengan campuran Milestone+Board Label → keduanya muncul dengan `scope` benar (`toContainEqual` dua kali) DAN Label yang sudah di-`remove` (baris `removed_at` terisi) TIDAK muncul (assert `find(...)` `toBeUndefined`).
**Catatan:** Seluruh 7 goal yang diminta (3.6.1, 3.6.2, 3.6.3, 3.7.1, 3.7.2, 3.8.1, 3.9.1) selesai sisi Dev di sesi ini. Sisa Phase 3 di luar scope yang diminta: TASK-3.10 (✅ 3.10.1 selesai sesi sebelumnya), TASK-3.11/3.12 (✅ selesai sesi sebelumnya) — jadi seluruh Phase 3 kini `🔎`/`✅`, tidak ada goal `⬜️` tersisa.

<a id="cl-29"></a>
### CL-29 — 2026-08-23 · goal 3.9.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Freshness check dari disk: row 3.9.1 `⬜️/—/0/P1`, dependency `3.7(🔎/80%), 2.9.1(Phase 2 ✅)` terpenuhi. `GET /cards/:card_id` route (`apps/api/src/routes/cards.ts:117-135`) dibaca ulang.
**Keputusan implementasi (didokumentasikan agar mudah diganti, C.6.5 poin 3 — bukan menyimpang dari goal):** field `labels` ditambahkan lewat fungsi query BARU `listCardLabels` (`card-label-association.ts`, file yang sama dengan 3.7.1) yang dipanggil dari route GET, BUKAN memodifikasi signature `getCard`/`CardRecord` (`card-repository.ts`/domain, Phase 2 ✅) — menghindari blast radius ke seluruh call site `getCard` lain (create/update/lifecycle responses, yang TIDAK diminta punya `labels` per teks goal/DoD "GET /cards/:card_id selalu menyertakan labels", bukan seluruh response Card). Tetap 1 JOIN per scope (2 query total), tidak N+1 per Label, sesuai DoD.

<a id="cl-28"></a>
### CL-28 — 2026-08-23 · goal 3.8.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — endpoint assign/remove Label ke Card
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `pnpm exec vitest run` → 63 file / **405** test lulus (6 test baru `apps/api/test/card-labels.test.ts`); `pnpm -r typecheck` bersih 6/6; `pnpm lint` bersih. Router baru `apps/api/src/routes/card-labels.ts`: `POST /cards/:card_id/labels` (body `{label_id}`, 201) + `POST .../labels/:label_id/remove` (200) — keduanya `assertOwnerInterim` (menumpang `card.update`, Prinsip #4, BUKAN permission Label tersendiri). Delegasi penuh ke `assignLabelToCard`/`removeLabelFromCard` (3.7.1) — route tidak menduplikasi validasi domain. Wiring `buildCardLabelRoutesDeps` + mount `index.ts`.
**Test:** assign sukses → 201 + envelope `data.association`; assign pada Card tidak ada di Project → `RESOURCE_NOT_FOUND` (bukan bocor lintas-Project); non-Owner 403, tanpa identitas 401, payload invalid 400; remove sukses → 200 + `removed_at` terisi (assert row langsung); remove pada Card ARCHIVED → `INVALID_STATE` (delegasi domain layer 3.7.1 bekerja lewat HTTP); non-Owner remove 403.
**Catatan:** TASK-3.8 selesai. Sisa Phase 3 (dari scope yang diminta): TASK-3.9 (Card GET embed `labels`).

<a id="cl-27"></a>
### CL-27 — 2026-08-23 · goal 3.8.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Freshness check dari disk: row 3.8.1 `⬜️/—/0/P1`, dependency `3.7` → 3.7.1/3.7.2 `🔎/80%` (CL-24/CL-26). `assignLabelToCard`/`removeLabelFromCard` (`card-label-association.ts`) siap dipakai langsung.
**Rencana:** Router baru `apps/api/src/routes/card-labels.ts` — `POST /cards/:card_id/labels` (body `{label_id}`) + `POST .../labels/:label_id/remove`, otorisasi `assertOwnerInterim` (menumpang `card.update`, Prinsip #4 — BUKAN permission Label tersendiri).

<a id="cl-26"></a>
### CL-26 — 2026-08-23 · goal 3.7.2 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — auto-orphan Board Label saat moveCard lintas-Board [MODEL LEBIH KUAT WAJIB]
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `pnpm exec vitest run` → 62 file / **399** test lulus (4 test baru `packages/infrastructure/test/card-move-label-orphan.test.ts`, file TERPISAH dari `card-move.test.ts`/`cards-move.test.ts` goal 2.10.1 Phase 2 ✅ — regresi Phase 2 diverifikasi ulang hijau 10+5 test tanpa modifikasi); `pnpm -r typecheck` bersih 6/6; `pnpm lint` bersih. Implementasi: blok orphan ditambahkan LANGSUNG di dalam `moveCard` (`card-repository.ts`), SETELAH UPDATE+Activity `card.moved`, dalam `runInWriteTransaction` yang SAMA (bukan transaksi baru — invariant #9). Guard `sourceChain.boardId !== destination.boardId` (persis kondisi goal "destinationBoard.id != sourceBoard.id" — subset dari kasus valid BR-018 "beda Board, Milestone sama", karena kasus "beda Board DAN beda Milestone" sudah ditolak lebih dulu sebagai `InvalidDestinationError`). SELECT `card_board_labels` aktif JOIN `board_labels` (ambil nama sekalian, hindari N+1) → UPDATE `removed_at=now` per baris → INSERT Activity `label.removed` per baris (`entity_version` = `nextVersion`, versi Card SETELAH move — konsisten `card.moved`). `card_milestone_labels` TIDAK disentuh sama sekali (tidak ada query/UPDATE apa pun ke tabel itu di blok baru).
**Test:** move lintas-Board dengan Board Label existing → `removed_at` terisi + Activity `label.removed` muncul BERSAMA `card.moved` dalam Activity list yang sama (query tunggal `WHERE entity_id=?`), `entity_version` cocok versi Card baru; Milestone Label Card yang sama TIDAK ter-orphan (row `removed_at` tetap NULL, hanya 1 Activity `label.removed` bukan 2); move List→List DALAM Board sama → nol orphan, nol Activity `label.removed` (guard presisi, regresi eksplisit terhadap kemungkinan over-trigger); Card tanpa Board Label sama sekali → move tetap sukses tanpa error (loop kosong, bukan exception).
**Catatan:** TASK-3.8 (Card-Label endpoints HTTP) dan TASK-3.9 (Card GET embed labels) sudah unblocked sejak 3.7.1; 3.7.2 melengkapi TASK-3.7 penuh secara atomik.

<a id="cl-25"></a>
### CL-25 — 2026-08-23 · goal 3.7.2 mulai dikerjakan (⬜️ → 🔄 · 0%) — [MODEL LEBIH KUAT WAJIB]
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Freshness check dari disk: row 3.7.2 `⬜️/—/0/P0 [MODEL LEBIH KUAT WAJIB]`, dependency `3.7.1(🔎/80%, CL-24), 2.10.1(Phase 2 ✅)` terpenuhi. Sesi ini berjalan di Claude Sonnet 5 — memenuhi syarat AGENTS.md §11.2 untuk goal invariant-critical (menyentuh transaksi `moveCard`, invariant #5/#9). `moveCard` (`card-repository.ts:139-201`) dibaca ulang penuh: guard cross-board sudah ada implisit dari BR-018 check (`sourceChain.boardId !== destination.boardId && sourceChain.milestoneId !== destination.milestoneId` → reject) — kondisi orphan (`destinationBoard.id != sourceBoard.id`) persis subset dari kasus valid "beda Board, Milestone sama".
**Rencana:** Tambah blok orphan SETELAH UPDATE+Activity `card.moved` (transaksi sama, `runInWriteTransaction` existing — TIDAK transaksi baru): `if (sourceChain.boardId !== destination.boardId)` → SELECT `card_board_labels` aktif JOIN `board_labels` (ambil `label_id`+`name`) → UPDATE `removed_at=now` per baris → INSERT Activity `label.removed` per baris (`entity_version` = versi Card SETELAH move, payload sama 3.7.1). `card_milestone_labels` tidak disentuh sama sekali.

<a id="cl-24"></a>
### CL-24 — 2026-08-23 · goal 3.7.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — assign/remove Label ke Card
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `pnpm exec vitest run` → 61 file / **395** test lulus (9 test baru `packages/infrastructure/test/card-label-association.test.ts`); `pnpm -r typecheck` bersih 6/6; `pnpm lint` bersih. Implementasi `packages/infrastructure/src/database/card-label-association.ts`: `assignLabelToCard`/`removeLabelFromCard` dalam `runInWriteTransaction`. Loader `loadCardPosition` lokal (List→Board→Milestone→Project, id+state, pola sama `card-comment.ts`) — TIDAK memodifikasi `card-repository.ts` privat Phase 2 ✅. `resolveLabel` cek `milestone_labels` lalu `board_labels` (server tentukan scope, C.11): tolak jika tidak ditemukan di keduanya (`RESOURCE_NOT_FOUND`), ARCHIVED/DELETED (FR-034), atau scope tidak cocok posisi Card SAAT INI (milestone_id/board_id mismatch). Assign: pre-check baris aktif sebelum INSERT (hindari raw UNIQUE constraint bocor ke caller) → INSERT baris BARU (`removed_at=NULL`, FR-033 histori) → Activity `label.added`. Remove: `UPDATE removed_at` pada baris aktif → Activity `label.removed`. `entity_version` Activity = versi Card TERKINI (asosiasi Label bukan field Card, sama pola Comment 3.11).
**Bug self-caught sebelum commit:** implementasi awal memakai `crypto.randomUUID()` untuk id Activity — melanggar A.13 (ULID wajib). Ditemukan saat review sendiri sebelum test ditulis, diperbaiki ke `ulid()` (paket `ulid`, konsisten seluruh Activity lain di codebase) sebelum sempat ter-test/commit.
**Test:** assign Milestone Label & Board Label yang scope-nya cocok posisi Card → sukses + Activity benar; Label milik Milestone/Board LAIN → ditolak (scope mismatch, dites eksplisit dua arah); Label ARCHIVED → ditolak; Card non-operational (ancestor Board ARCHIVED) → `AncestorNotActiveError`; Card local ARCHIVED → `CardInvalidStateError`; Card/Label tidak ada → `CardNotFoundError`/`RESOURCE_NOT_FOUND`; assign ulang label yang MASIH aktif → `INVALID_STATE` bersih (bukan raw UNIQUE constraint); **[FR-033]** remove lalu assign ulang → baris BARU (2 row: 1 `removed_at` terisi + 1 `NULL`), urutan Activity `label.added`→`label.removed`→`label.added` benar; remove tanpa asosiasi aktif → `RESOURCE_NOT_FOUND`.
**Catatan:** TASK-3.8 (Card-Label endpoints HTTP) sekarang unblocked.

<a id="cl-23"></a>
### CL-23 — 2026-08-23 · goal 3.7.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Freshness check dari disk: row 3.7.1 `⬜️/—/0/P0`, dependency `3.3(✅), 3.5(🔎/80%, CL-20), 2.8(✅)` semua terpenuhi sisi Dev. Skema `card_milestone_labels`/`card_board_labels` diverifikasi (`project-schema.ts`): tanpa PK `id` sendiri, `(card_id, label_id)` + partial-unique-index `WHERE removed_at IS NULL`.
**Rencana:** `packages/infrastructure/src/database/card-label-association.ts` — `assignLabelToCard`/`removeLabelFromCard`. Loader posisi Card (list_id→board_id→milestone_id + ancestor states) ditulis lokal (pola sama `card-comment.ts`, bukan modifikasi `card-repository.ts` privat Phase 2 ✅). Lookup Label di `milestone_labels` DAN `board_labels` (server tentukan scope); tolak ARCHIVED/DELETED, scope mismatch, Card non-operational, dan re-assign saat masih ada baris aktif (pre-check sebelum kena UNIQUE constraint mentah).

<a id="cl-22"></a>
### CL-22 — 2026-08-23 · goal 3.6.1/3.6.2/3.6.3 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — Board Label endpoints HTTP (6 route)
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `pnpm exec vitest run` → 60 file / **386** test lulus (8 test baru `apps/api/test/board-labels.test.ts`); `pnpm -r typecheck` bersih 6/6 package; `pnpm lint` bersih. Implementasi ditambahkan ke file yang sama dengan Milestone Label (`apps/api/src/routes/labels.ts`, pola identik 3.4.1–3.4.3): `BoardLabelRoutesDeps` + `createBoardLabelsRouter` — `GET`/`POST .../boards/:board_id/labels`, `PATCH .../labels/:label_id`, `POST .../labels/:label_id/{archive,restore,delete}`. Wiring `buildBoardLabelRoutesDeps` (`project-deps.ts`) + mount `apps/api/src/index.ts`. Export `BoardLabelRecord` ditambah ke `packages/infrastructure/src/index.ts` (sebelumnya cuma class repository yang di-export, tipe record belum).
**Test (3 goal dalam 1 file, ditag jelas):** [3.6.1] create → 201 + Activity `board_label.created`; create pada Board ARCHIVED → `INVALID_STATE`; non-member 403, tanpa identitas 401, payload invalid 400; GET oleh member non-Owner tetap 200 (baca-saja bukan Owner-only). [3.6.2] update name → 200; field asing ditolak `VALIDATION_ERROR`; non-Owner 403; `expected_version` salah → `VERSION_CONFLICT` tanpa perubahan. [3.6.3] archive→ulang `INVALID_STATE`; **restore ditolak saat Milestone di-archive (bukan Board langsung)** — regresi transitive-ancestor pola sama 3.5.1; version mismatch → `VERSION_CONFLICT`; non-Owner 403; tidak ada → `RESOURCE_NOT_FOUND`.
**Catatan:** TASK-3.7 (Card-Label association) sekarang unblocked (dependency 3.5+3.3 terpenuhi Dev-side; 3.6 tidak jadi dependency langsung 3.7 tapi melengkapi kontrak C.11 Board Label sebelum Card-Label assign/remove).

<a id="cl-21"></a>
### CL-21 — 2026-08-23 · goal 3.6.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Freshness check dari disk: row 3.6.1 `⬜️/—/0/P0`, dependency `3.5` → `🔎/80%` (CL-20, commit e7374e7). Pola `apps/api/src/routes/labels.ts` (Milestone Label, 3.4.1) dibaca ulang untuk direplikasi persis ke Board Label di file yang sama.
**Catatan insidental:** ditemukan bug kecil di `lifecycleCommands` (`labels.ts`, goal 3.4.3) — memanggil `repository.archiveMilestoneLabel("project", input)` dkk. dengan literal string `"project"`, bukan variabel `projectId` sungguhan yang tersedia di scope handler. Tidak berefek runtime (param `projectId` di implementasi memang unused hari ini), tapi salah ketik nyata yang akan salah kalau param itu suatu saat dipakai. Diperbaiki (`command` sekarang menerima `projectId` dan meneruskannya) karena file yang sama sedang saya sentuh untuk Board Label — bukan reopening 3.4.3 (masih `🔎`, belum di-QA, DoD/Test-nya tidak berubah).
**Rencana:** Tambah `BoardLabelRoutesDeps` + `createBoardLabelsRouter` di file yang sama (`labels.ts`), reuse helper `withErrorHandling`/`assertOwnerInterim`, pola identik 3.4.1.

<a id="cl-20"></a>
### CL-20 — 2026-08-23 · goal 3.5.1 diambil alih & selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — Board Label domain commands, chain 3-level
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Mengambil alih dari CL-13 (`big-pickle`, opencode) atas instruksi eksplisit manusia — sesi sebelumnya sempat men-stage scaffolding (`board-label-repository.ts`, `board-label-commands.test.ts`, update interface `label-repository.ts`) tapi belum commit, dan working tree ada dalam keadaan **tidak compile** (`pnpm -r typecheck` gagal 4 error) saat freshness check saya. Root cause: interface domain `BoardLabelRepository` (di `label-repository.ts`) sudah direfactor ke signature `(projectId, input)` untuk 4 method mutasi (`updateBoardLabel`/`archiveBoardLabel`/`restoreBoardLabel`/`deleteBoardLabel` — parent di-resolve dari row Label, bukan diteruskan `boardId`, konsisten pola Milestone Label CL-06/CL-12), tapi implementasi Drizzle (`board-label-repository.ts`) masih signature lama `(input)` 1-arg — mismatch murni belum-selesai-refactor, bukan bug desain.
**Perbaikan:** Ditambahkan parameter `projectId: string` (unused, `void projectId`, pola identik `milestone-label-repository.ts`) ke 4 method mutasi implementasi. Test file `board-label-commands.test.ts` (juga WIP, ditulis untuk signature lama) diperbaiki: 8 call-site ditambah argumen `PROJECT` pertama; satu blok dynamic-dispatch (`(repo as never as Record<...>)[...](input)`, test "[transitive] archive Milestone SAJA") diperbaiki jadi `method.call(repo, PROJECT, input)` — bentuk lama akan salah collect argumen di runtime (`input` jatuh ke slot `projectId`, `input` sungguhan jadi `undefined`) walau lolos type-erasure `as never`.
**Verifikasi (independen, bukan percaya klaim CL-13):** `pnpm -r typecheck` → 6/6 package bersih (sebelumnya gagal 4 error, semua di file ini). `pnpm exec vitest run` → **59 file / 378 test PASS** (termasuk 7 test `board-label-commands.test.ts`, 0 regresi lain). `pnpm lint` bersih.
**Test (ditulis sesi sebelumnya, isinya sudah lengkap sesuai DoD — saya verifikasi ulang, bukan menulis baru):** create ditolak jika Board/Milestone/Project non-ACTIVE; **[WAJIB]** archive Board → keempat operasi mutasi Board Label ditolak (regresi Review-CL-02); **[transitive]** archive Milestone saja (Board tetap ACTIVE) → mutasi tetap ditolak (ancestor chain transitif, bukan cuma immediate parent); `expected_version` salah → `VERSION_CONFLICT` tanpa efek; restore sukses saat chain ACTIVE, ditolak saat Milestone ARCHIVED; name kosong → `LabelValidationError`; list default exclude deleted; delete dari ARCHIVED sukses; Label tidak ada → `LabelNotFoundError`.
**Catatan:** TASK-3.6 (Board Label endpoints HTTP) sekarang unblocked (dependency 3.5 terpenuhi sisi Dev). Tidak ada `board-label-errors.ts` terpisah dibuat — sesi sebelumnya memilih reuse `Label*Error` generik (`label-errors.ts`) yang sudah dipakai bersama Milestone Label sejak CL-06, bukan class per-scope terpisah seperti disebut teks goal asli; ini konsisten DRY (Prinsip #1) dan tidak mengubah perilaku, jadi tidak saya koreksi paksa ke nama file yang disebut goal.

<a id="cl-19"></a>
### CL-19 — 2026-08-23 · goal 3.12.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — PATCH edit comment
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `pnpm exec vitest run` → 59 file / **378** test lulus (7 test baru `apps/api/test/comments-edit.test.ts`); `pnpm -r typecheck` bersih untuk file goal ini; `pnpm lint` bersih. Implementasi: `editComment` (`card-comment.ts`) — load Activity `:activity_id`, wajib `entity_id=cardId` + `action IN (comment.added, comment.edited)` else `RESOURCE_NOT_FOUND`; **BR-034A eksplisit** `activity.actor_user_id == actorUserId` else `PERMISSION_DENIED`; resolusi `originalId` (dirinya sendiri jika `comment.added`, atau `data.comment_activity_id` jika `comment.edited`); state Card sama seperti 3.11.1. Endpoint `PATCH /cards/:card_id/comments/:activity_id`, Owner-only interim + BR-034A berlapis (Prinsip #3).
**Bug ditemukan & diperbaiki sebelum commit (self-caught via test, bukan lolos ke QA):** implementasi awal mengambil teks "before" langsung dari row yang dirujuk `:activity_id` — salah untuk edit KEDUA dst., karena kontrak (Prinsip #7) mengharuskan client SELALU kirim `:activity_id` = original, sehingga row yang dirujuk SELALU `comment.added` (teks pertama), bukan state terkini setelah edit sebelumnya. Diperbaiki: query terpisah `... WHERE entity_id=? AND (id=? OR json_extract(data,'$.comment_activity_id')=?) ORDER BY created_at DESC, id DESC LIMIT 1` untuk menemukan Activity TERAKHIR di rantai edit (baik itu `comment.added` kalau belum pernah diedit, atau `comment.edited` terbaru) sebagai sumber teks "before" — bukan row yang direferensikan `:activity_id` secara langsung.
**Test:** edit pertama → `comment.edited` baru, `comment.added` lama byte-identik (assert row langsung); edit KEDUA lewat `:activity_id` original yang sama → `before` = teks edit pertama (bukan teks original), `commentActivityId` tetap original; jalur toleran `:activity_id` = id `comment.edited` (bukan original) → tetap resolve `commentActivityId` original + `before` state terkini yang benar; BR-034A: edit comment milik user lain → `PERMISSION_DENIED` (disisipkan langsung via SQL karena interim model belum bisa reproduksi 2 comment-author asli — didokumentasikan sebagai invariant utk Phase 4, sesuai instruksi goal); target bukan comment/bukan milik Card → `RESOURCE_NOT_FOUND`; Card ARCHIVED → `INVALID_STATE`; non-Owner member 403; tanpa identitas 401; body kosong `VALIDATION_ERROR`.
**Catatan:** TASK-3.11/3.12 (Comment) selesai sisi Dev — seluruh Phase 3 tersisa (3.5–3.9, Board Label+Card-Label) masih dikerjakan sesi lain (WIP `board-label-repository.ts`, TASK-3.5).

<a id="cl-18"></a>
### CL-18 — 2026-08-23 · goal 3.12.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Freshness check dari disk: row 3.12.1 `⬜️/—/0/P1`, dependency `3.11` → `🔎/80%` (CL-17, commit d2e919b, suite 371 hijau). `addComment` (`card-comment.ts`) dibaca ulang — `commentActivityId` = `id` Activity untuk `comment.added` (originalnya sendiri), siap dipakai `editComment` untuk resolusi original.
**Rencana:** `editComment(cardId, commentActivityId, newBody, actorUserId)` — load Activity, wajib `action IN ('comment.added','comment.edited')` + `entity_id = cardId`; **BR-034A ownership eksplisit** `activity.actor_user_id == actorUserId` (dibandingkan langsung, bukan diasumsikan trivial dari interim Owner-only — Prinsip #3, WAJIB ada test simulasi Owner edit comment bukan miliknya walau belum reachable hari ini); validasi state Card sama 3.11.1; resolusi original via `data.comment_activity_id` kalau ada, else id itu sendiri; INSERT Activity BARU `comment.edited` (`{before, after, comment_activity_id}`), Activity lama TIDAK disentuh (BR-032). Endpoint `PATCH /cards/:card_id/comments/:activity_id`.

<a id="cl-17"></a>
### CL-17 — 2026-08-23 · goal 3.11.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — POST comment sebagai Activity Card
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `pnpm exec vitest run` → 58 file / **371** test lulus (5 test baru `apps/api/test/comments-create.test.ts`); `pnpm -r typecheck` bersih untuk file goal ini (sisa error `board-label-repository.ts` pre-existing, WIP goal 3.5.1 sesi lain); `pnpm lint` bersih. Implementasi: `packages/infrastructure/src/database/card-comment.ts` — `addComment` di dalam `runInWriteTransaction` (busy-safe): load Card + ancestor chain 4-level (List→Board→Milestone→Project, loader lokal — TIDAK memodifikasi `card-repository.ts` privat punya goal 2.8/2.9 Phase 2 ✅), tolak jika local state bukan ACTIVE (BR-033) atau ada ancestor non-operational (INV-LIFE-001/BR-034), validasi body non-kosong, INSERT Activity `comment.added` dengan `entity_version` = versi Card TERKINI TANPA mengubah row Card (Comment bukan field Card). Endpoint `POST /cards/:card_id/comments` (`apps/api/src/routes/comments.ts`) — Owner-only interim, wiring `buildCommentRoutesDeps` + mount `index.ts`.
**Test:** comment pada Card ACTIVE → 201, Activity tercatat dengan `entity_version` benar, version Card TIDAK naik (assert row langsung); Card ARCHIVED/DELETED → `INVALID_STATE` 409; Card local-ACTIVE tapi ancestor Milestone ARCHIVED → `INVALID_STATE` 409 (regresi INV-LIFE-001 pola sama Review-CL-02 Phase 2); body kosong → `VALIDATION_ERROR` 400; non-Owner MEMBER (bukan non-member) → `PERMISSION_DENIED` 403 (insert `project_memberships` eksplisit agar user-b benar-benar member, bukan ketiban `PROJECT_ACCESS_DENIED` dari pipeline duluan); tanpa identitas 401; Card tidak ada → `RESOURCE_NOT_FOUND` 404.
**Catatan:** `commentActivityId` di response = `id` Activity itu sendiri untuk `comment.added` (dia originalnya sendiri) — konvensi ini dipakai TASK-3.12 (edit) untuk selalu merujuk balik ke Activity original (Prinsip #7).

<a id="cl-16"></a>
### CL-16 — 2026-08-23 · goal 3.11.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Freshness check dari disk: row 3.11.1 `⬜️/—/0/P1`, dependency `2.9 (Phase 2)` → ✅ (Phase 2 tutup 21/21). `card-repository.ts` diverifikasi: `loadListContext`/`loadCardForUpdate` privat (tidak diexport) — akan ditulis loader ancestor-chain sendiri di `card-comment.ts` (query sama, tanpa modifikasi `card-repository.ts` milik goal 2.8/2.9 Phase 2 ✅). `activities` table & `runInWriteTransaction` reuse langsung.
**Rencana:** `packages/infrastructure/src/database/card-comment.ts`: `addComment(cardId, body, actorUserId)` — validasi Card ada, state lokal ACTIVE (BR-033), ancestor chain 4-level operational (INV-LIFE-001, List→Board→Milestone→Project), body non-kosong; INSERT Activity `comment.added` (entity_type='card', entity_version=versi Card TERKINI, Card TIDAK di-mutasi/version tidak naik). Endpoint `POST /cards/:card_id/comments`, Owner-only interim.

<a id="cl-15"></a>
### CL-15 — 2026-08-23 · goal 3.10.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — GET /activities generic + 4 convenience route
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `pnpm exec vitest run` → 57 file / **366** test lulus (6 test baru `apps/api/test/activities-list.test.ts`); `pnpm -r typecheck` — bersih untuk seluruh file yang disentuh goal ini (sisa error di `board-label-repository.ts` pre-existing dari WIP goal 3.5.1 sesi lain, tidak terkait); `pnpm lint` bersih. Implementasi: `packages/infrastructure/src/database/activity-query.ts` (`listActivities` — 6 filter opsional, tanpa pagination sesuai Prinsip #6, `ORDER BY created_at ASC, id ASC` deterministik); `apps/api/src/routes/activities.ts` (1 route generic + 4 convenience `cards`/`milestones`/`boards`/`lists`, hardcode `entity_type`+`entity_id` dari path param, filter lain tetap query-optional); wiring `buildActivityRoutesDeps` (`project-deps.ts`) + mount `apps/api/src/index.ts`. Membership aktif cukup (bukan Owner-only, sesuai spec baca-saja).
**Test:** generic tanpa filter → seluruh 5 Activity Project terurut created_at ASC; filter entity_type+entity_id → subset tepat; filter actor/action/from-to masing-masing diverifikasi; 4 convenience route → subset identik dengan entity_type yang benar; tanpa identitas 401; non-member 403 `PROJECT_ACCESS_DENIED`; Activity Project lain (`act_other`, Project B) tidak pernah muncul di response Project A (isolasi struktural per-Project-DB); PUT/PATCH/DELETE/POST ke `/activities` → 404 (router hanya daftar GET, BR-024/invariant #8).
**Catatan:** File `PHASE-3-TASKS.md` di-commit bersamaan dengan hunk CL-13/baris 3.5.1 milik sesi lain (`big-pickle`, working tree bersama, belum sempat commit sendiri saat freshness check saya) — bukan kerja saya, tidak diklaim; kontennya sudah self-attributed benar (Role/Model di dalam entry itu sendiri), konsisten pola yang sudah diobservasi Review-CL-14 Phase 2.

<a id="cl-14"></a>
### CL-14 — 2026-08-23 · goal 3.10.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Freshness check dari disk: row 3.10.1 `⬜️/—/0/P1`, dependency `—` (independen, hanya butuh tabel `activities` Phase 0). Baseline dibaca: pola router GET-list existing (`milestones.ts`, `labels.ts`), `buildProjectContextDeps`/`RequestPipeline` untuk membership check tanpa Owner-restriction (pola sama GET Milestone/Board/List/Card). Skema `activities` diverifikasi (`project-schema.ts`): `entity_type`, `entity_id`, `entity_version`, `actor_user_id`, `action`, `data` (json), `created_at`; CHECK constraint 7 value (setelah perbaikan drift kecil hari ini — lihat catatan).
**Catatan:** Insidental — ditemukan `project-schema.ts:186` CHECK constraint literal masih 5 value lama padahal `activityEntityType` array & migration nyata (`0001_activity_entity_type_label.sql`, goal 3.2.1) sudah 7. Diperbaiki (literal disamakan ke 7 value) karena relevan langsung dengan goal ini (activity-query akan baca tabel ini) dan berisiko membingungkan `drizzle-kit generate` berikutnya; diverifikasi `drizzle-kit generate` → "No schema changes, nothing to migrate" (DB nyata sudah benar, murni sinkronisasi source TS). Bukan bagian scope 3.2.1 yang dibuka kembali (3.2.1 masih `🔎`, belum di-QA — ini pure syntax-sync, bukan perubahan perilaku).
**Rencana:** `packages/infrastructure/src/database/activity-query.ts` (`listActivities`, filter opsional tanpa pagination) + `apps/api/src/routes/activities.ts` (1 generic + 4 convenience route, read-only, member aktif cukup tanpa Owner-only).

<a id="cl-13"></a>
### CL-13 — 2026-08-23 · goal 3.5.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 3.5.1 `⬜️/—/0/P0`, dependency `2.1 ✅, 3.2 ✅, 3.3 ✅(🔎)` (commit 70614e9, 9528895; suite 353 hijau). Schema board_labels diverifikasi.
**Catatan:** Struktur identik 3.3.1; chain 3-level [boardState, milestoneState, projectState]; Activity entity_type='board_label'; test transitive ancestor (archive Milestone saja → Board Label tetap ditolak).

<a id="cl-12"></a>
### CL-12 — 2026-08-23 · goal 3.4.3 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — endpoint lifecycle Milestone Label
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 55 file / **353** test lulus (4 test integration baru `apps/api/test/milestone-labels-lifecycle.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: `POST .../milestones/:milestone_id/labels/:label_id/{archive,restore,delete}` via `lifecycleCommands` — Owner-only interim, expected_version wajib, envelope `{data:{label}}`. Refactor kecil: signature mutasi Label tidak lagi menerima milestoneId (parent di-resolve dari row — sumber kebenaran), interface domain disesuaikan.
**Catatan:** Test: archive sukses lalu ulang INVALID_STATE; restore sukses; Milestone di-archive → restore Label ditolak INVALID_STATE; AC-020 ketiga action; authz 403/401; 404.

<a id="cl-11"></a>
### CL-11 — 2026-08-23 · goal 3.4.3 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 3.4.3 `⬜️/—/0/P1`, dependency `3.3, 3.4.1` → keduanya `🔎/80%` (commit 9528895, 55a5f68; suite 349 hijau).
**Catatan:** Pola lifecycleCommands sama Milestone (TASK-2.3); ancestor check sudah di domain layer.

<a id="cl-10"></a>
### CL-10 — 2026-08-23 · goal 3.4.2 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — endpoint PATCH Milestone Label
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 54 file / **349** test lulus (4 test integration baru `apps/api/test/milestone-labels-patch.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: `PATCH /v1/projects/:p/milestones/:m/labels/:label_id` — Owner-only interim; hanya field `name` + expected_version; field lain → VALIDATION_ERROR (C.15); Activity `milestone_label.updated{changes:{name:{before,after}}}` diverifikasi.
**Catatan:** Test negatif: AC-020 tanpa perubahan; PERMISSION_DENIED non-Owner member; RESOURCE_NOT_FOUND.

<a id="cl-09"></a>
### CL-09 — 2026-08-23 · goal 3.4.2 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 3.4.2 `⬜️/—/0/P1`, dependency `3.3, 3.4.1` → keduanya `🔎/80%` (commit 9528895, 55a5f68; suite 345 hijau).
**Catatan:** PATCH hanya field `name` + expected_version; pola sama PATCH List.

<a id="cl-08"></a>
### CL-08 — 2026-08-23 · goal 3.4.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — endpoint GET list + POST Milestone Label
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 53 file / **345** test lulus (4 test integration baru `apps/api/test/milestone-labels-create-get.test.ts`); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: router `apps/api/src/routes/labels.ts` — `GET /v1/projects/:p/milestones/:m/labels` (member via pipeline, default exclude deleted) + `POST .../labels` (Owner-only interim; body hanya `name`; field asing ditolak; VALIDATION_ERROR untuk name invalid); envelope `{data:{label}}`/`{data:{labels:[...]}}`; wiring `buildMilestoneLabelRoutesDeps` + mount index.ts.
**Catatan:** Test: create pada Milestone ARCHIVED → INVALID_STATE 409; non-member 403 PROJECT_ACCESS_DENIED; milestone tidak ada → INVALID_STATE 409 (chain DELETED); Activity entity_type='milestone_label' diverifikasi.

<a id="cl-07"></a>
### CL-07 — 2026-08-23 · goal 3.4.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 3.4.1 `⬜️/—/0/P0`, dependency `3.3` → 3.3.1 `🔎/80%` commit 9528895 (suite 341 hijau). C.11 route Label terbaca.
**Catatan:** Router labels.ts (nanti ditambah Board Label di TASK-3.6); wiring buildMilestoneLabelRoutesDeps.

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

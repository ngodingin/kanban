# Phase 1 — Project · Task & Goal Breakdown

> Generated per [04-DELIVERY C.6](docs/04-DELIVERY.md). SOT version: 2.4.0 (lihat Closure Log Review-CL-02/05/06/07/08/09 untuk riwayat amandemen sejak generate).
> Scope batas: [04-DELIVERY C.1 "Phase 1"](docs/04-DELIVERY.md). Acuan utama: [02-SPEC](docs/02-SPEC.md) Part A (A.1–A.3, A.7, A.8, A.10, A.12, A.15, A.16), Part B (B.1–B.3), Part C (C.4, C.12, C.13), Part D; [03-ENGINEERING](docs/03-ENGINEERING.md) Part A (A.4–A.7), Part B (B.1–B.3).
> **Konteks repo saat digenerate:** Phase 0 selesai (34/34 goal ✅, lihat [PHASE-0-TASKS.md](PHASE-0-TASKS.md)). Skeleton `apps/api`, `packages/{domain,infrastructure,contracts,shared}` sudah ada dan dipakai sebagai baseline path di bawah — lihat referensi file konkret per goal. Global DB schema (0.4) dan Project DB schema (0.5) SUDAH memuat seluruh tabel yang dibutuhkan Phase 1 (`project_memberships`, `permissions`, `permission_groups`, `group_permissions`, `membership_group_assignments`, `membership_permission_assignments`, `invitations`, `invitation_group_assignments`, `project_state`, `activities`); **Phase 1 tidak butuh migration Drizzle baru**, hanya query/domain-command/endpoint layer + (mungkin) data seed idempotent.
>
> **AI-Dev execution gate:** jangan ubah implementasi sebelum goal `🔄` + `CL` terpasang. Jangan menyatakan selesai sebelum goal `🔎`/`80%` + CL baru + test hijau + commit. Format handoff wajib mengikuti [AGENTS.md §0](AGENTS.md).

## Prinsip Phase 1
Bangun **Project sebagai unit domain lengkap**: CRUD + lifecycle + Membership + Invitation + Permission Group dasar. **Permission *resolution engine* (formula ALLOW penuh, 02-SPEC A.10/D.4) TETAP di luar scope — itu Phase 4** ([04-DELIVERY C.1](docs/04-DELIVERY.md)). Konsekuensi eksplisit untuk Phase 1 (bukan business rule baru, melainkan urutan fase yang sudah dikunci di C.1):

- Operasi yang di D.2 hanya diizinkan Owner/Co-Owner (update Project, manage members, manage Permission Group, manage API Key) **sementara hanya menegakkan Owner bypass (BR-037)** — cek `project.ownerUserId == identity.userId`. Grant Co-Owner via Permission Group **disimpan** (data model Phase 1) tetapi **belum ditegakkan** sebagai otorisasi sampai Phase 4 permission resolution engine ada. `permission.resolve` seam tetap `EmptyPermissionResolver` (0.9.4) — TIDAK diisi di Phase 1.
- Ini bukan pelonggaran invariant: BR-037 sendiri sudah menyatakan Owner MAY bypass grant check, jadi Owner-only gate untuk operasi Owner/Co-Owner adalah subset yang valid dan aman (lebih ketat, bukan lebih longgar) dari matrix D.2 akhir.
- Card/Milestone/Board/List **tidak** termasuk Phase 1 (Phase 2 — Kanban Core). `createMilestone`/`listMilestones` di `packages/domain/src/project/project-repository.ts` adalah smoke placeholder Phase 0 — JANGAN diperluas di Phase 1.

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
1.1 Project domain commands (repo layer)
 ├─ 1.2 Owner Membership pada provisioning
 │    └─ 1.3 Project CRUD endpoints (create/list/read/update)
 │         └─ 1.4 Project lifecycle endpoints (archive/restore/delete)
 └─ 1.4 (juga pakai 1.1 langsung untuk command archive/restore/delete)
1.5 Permission catalog seed (D.1)
 └─ 1.6 Baseline Permission Group seed saat create Project ◄── 1.2, 1.5
      └─ 1.7 Permission Group CRUD endpoints ◄── 1.5, 1.6
           └─ 1.8 Scoped Group/direct Permission assignment endpoints ◄── 1.6, 1.7
1.9 Invitation create + accept ◄── 1.7 (butuh group_id valid), 1.2 (butuh Owner Membership utk invited_by)
1.10 Membership read/revoke ◄── 1.2
```

---

## TASK-1.1 — Project lifecycle domain commands (repository layer)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 1.1.1 | ✅ | [CL-01](#cl-01)<br>[CL-02](#cl-02)<br>[QA-CL-01](#qa-cl-01) | 100 | P0 | Perluas `ProjectRepository` (`packages/domain/src/project/project-repository.ts`) dan `DrizzleProjectRepository` (`packages/infrastructure/src/database/project-repository.ts`) dengan command `updateProjectName`, `archiveProject`, `restoreProject`, `deleteProject` — tiap command menerima `expectedVersion`, memvalidasi state saat ini (BR-011/012, INV-LIFE-003/004), menolak dengan konflik jika version tidak cocok (tanpa perubahan state/Activity), dan menulis mutation `project_state` + Activity (`project.updated`/`project.archived`/`project.restored`/`project.deleted`) atomik dalam satu `runInWriteTransaction` (`packages/infrastructure/src/database/transaction.ts`) pada Project DB yang sama | [02-SPEC A.3](docs/02-SPEC.md), [A.7](docs/02-SPEC.md), [A.8](docs/02-SPEC.md), BR-011–013, BR-019–028; [03-ENG A.6](docs/03-ENGINEERING.md) | — |

**Test:** Unit — update/archive/restore/delete commit version+timestamp+Activity benar; `expected_version` salah → `VERSION_CONFLICT`, tidak ada perubahan state, tidak ada Activity baru (AC-020 pattern); restore ditolak jika current state DELETED (INV-LIFE-004); archive ditolak jika current state DELETED; delete dari ARCHIVED diizinkan (state machine A.3).
**DoD:** Seluruh 4 command atomik (mutation+Activity 1 transaksi Project DB); tidak ada command yang bypass version check; Activity payload ikut konvensi B.5 (`changes`/`previous_state`).

---

## TASK-1.2 — Owner Membership otomatis pada provisioning  (dep: 1.1 tidak wajib, independen)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 1.2.1 | ✅ | [CL-03](#cl-03)<br>[CL-04](#cl-04)<br>[QA-CL-02](#qa-cl-02) | 100 | P0 | Tambahkan insert `project_memberships` (Owner = `creatorUserId`) ke dalam transaksi Global DB yang sama dengan `registerProject`/`recordProjectDatabaseMapping` di `provisionProjectWithMapping` (`packages/infrastructure/src/provisioning/provision.ts`), sehingga setiap Project baru selalu punya tepat satu Membership aktif untuk Owner sejak commit pertama | [02-SPEC B.1](docs/02-SPEC.md) FR-001, FR-002; [03-ENG B.2](docs/03-ENGINEERING.md) | — |

**Test:** Integration — create Project → tepat 1 row `project_memberships` untuk `creatorUserId`, `revoked_at IS NULL`; simulasi kegagalan di tengah transaksi Global → tidak ada Project/mapping/membership yatim (rollback compensation existing di `provision.ts` tetap berlaku, diperluas untuk membership).
**DoD:** FR-002 ("setiap Project punya tepat satu Owner") terbukti via test; tidak ada regresi pada rollback path 0.6.3.

---

## TASK-1.3 — Project CRUD endpoints (HTTP)  (dep: 1.1, 1.2)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 1.3.1 | 🔎 | [CL-46](#cl-46)<br> [CL-45](#cl-45)<br>[CL-06](#cl-06)<br>[CL-05](#cl-05)<br>[QA-CL-03](#qa-cl-03)<br>[Review-CL-08](#review-cl-08) | 80 | P0 | `POST /api/v1/projects` — resolve identity (tanpa `RequestPipeline` project-step karena Project belum ada), generate `project_id` ULID, panggil `provisionProjectWithMapping` (1.2), balikan `{ data }` sesuai C.2/C.4. Baca `Idempotency-Key` (`extractIdempotencyKey`, `packages/contracts/src/http-mapping.ts`) — minimal: request tanpa header tetap jalan normal; request dengan header yang sama diproses ulang (dedupe store persisten dicatat sebagai catatan terbuka, bukan blocker Phase 1) | [02-SPEC C.4](docs/02-SPEC.md), FR-001; [C.3](docs/02-SPEC.md) | 1.1, 1.2 |
| 1.3.2 | ✅ | [CL-24](#cl-24)<br>[CL-23](#cl-23)<br>[CL-08](#cl-08)<br>[CL-07](#cl-07)<br>[QA-CL-04](#qa-cl-04)<br>[QA-CL-12](#qa-cl-12) | 100 | P1 | `GET /api/v1/projects` — list seluruh Project yang membership User masih aktif (`project_memberships` Global DB), untuk masing-masing baca status ringkas dari `project_state` Project DB (bukan transaksi lintas-DB, sesuai [03-ENG A.4](docs/03-ENGINEERING.md)) | [02-SPEC C.4](docs/02-SPEC.md) | 1.2 |
| 1.3.3 | ✅ | [CL-24](#cl-24)<br>[CL-23](#cl-23)<br>[CL-10](#cl-10)<br>[CL-09](#cl-09)<br>[QA-CL-05](#qa-cl-05)<br>[QA-CL-12](#qa-cl-12) | 100 | P0 | `GET /api/v1/projects/:project_id` — pakai `RequestPipeline` (`packages/infrastructure/src/pipeline/pipeline.ts`, hasil 0.9) untuk identity+membership+resolve DB, baca `project_state` via `ProjectRepository.getProjectState` | [02-SPEC C.4](docs/02-SPEC.md) | 1.1 |
| 1.3.4 | 🔎 | [CL-46](#cl-46)<br> [CL-45](#cl-45)<br>[CL-24](#cl-24)<br>[CL-23](#cl-23)<br>[CL-12](#cl-12)<br>[CL-11](#cl-11)<br>[QA-CL-06](#qa-cl-06)<br>[QA-CL-12](#qa-cl-12)<br>[Review-CL-08](#review-cl-08) | 80 | P1 | `PATCH /api/v1/projects/:project_id` — hanya field `name` (Generic PATCH tetap dilarang mengubah `id/project_id/creator_user_id/created_at/version/archived_at/deleted_at`, [02-SPEC C.15](docs/02-SPEC.md)), wajib `expected_version`, otorisasi Owner-only interim (lihat "Prinsip Phase 1") sebelum panggil `updateProjectName` (1.1) | [02-SPEC C.4](docs/02-SPEC.md), [C.15](docs/02-SPEC.md), BR-035, BR-037 | 1.1, 1.3.3 |
| 1.3.5 | 🔄 | [CL-45](#cl-45)<br>[Review-CL-09](#review-cl-09) | 0 | P3 | `GET /api/v1/projects` — tambah query param opsional `status` (comma-separated, subset `ACTIVE,ARCHIVED,DELETED`) untuk membatasi hasil `listProjectSummaries`; tanpa param, perilaku tetap seperti sekarang (kembalikan semua status) — murni penambahan, bukan pengubahan default | [02-SPEC C.4](docs/02-SPEC.md) (amandemen 2.4.0) | 1.3.2 |

**Test:** Integration — create tanpa identitas ditolak; create menghasilkan `project_state` ACTIVE + Activity `project.created` + Owner Membership (regresi 1.2) via endpoint; list hanya mengembalikan Project dengan membership aktif User (tidak bocor Project lain — Project-boundary check); read Project tanpa membership → `PROJECT_ACCESS_DENIED`; update oleh non-Owner → `PERMISSION_DENIED`; update dengan `expected_version` salah → `VERSION_CONFLICT`; update field terlarang (mis. `version` di body) diabaikan/ditolak; (1.3.5) `?status=ARCHIVED` hanya mengembalikan Project ARCHIVED milik User, tanpa param mengembalikan semua status (regresi 1.3.2), `?status=` dengan value di luar enum ditolak.
**DoD:** Endpoint sesuai kontrak C.4; response envelope C.2; tidak ada endpoint yang mengizinkan perubahan field domain-controlled via PATCH; seluruh test di atas hijau.

---

## TASK-1.4 — Project lifecycle endpoints (domain command)  (dep: 1.1, 1.3.3)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 1.4.1 | 🔎 | [CL-46](#cl-46)<br> [CL-45](#cl-45)<br>[CL-24](#cl-24)<br>[CL-23](#cl-23)<br>[CL-14](#cl-14)<br>[CL-13](#cl-13)<br>[QA-CL-07](#qa-cl-07)<br>[QA-CL-12](#qa-cl-12)<br>[Review-CL-08](#review-cl-08) | 80 | P0 | `POST /api/v1/projects/:project_id/archive` — otorisasi Owner-only interim, `expected_version` wajib, panggil `archiveProject` (1.1) | [02-SPEC C.4](docs/02-SPEC.md), A.3 | 1.1, 1.3.3 |
| 1.4.2 | 🔎 | [CL-46](#cl-46)<br> [CL-45](#cl-45)<br>[CL-24](#cl-24)<br>[CL-23](#cl-23)<br>[CL-16](#cl-16)<br>[CL-15](#cl-15)<br>[QA-CL-08](#qa-cl-08)<br>[QA-CL-12](#qa-cl-12)<br>[Review-CL-08](#review-cl-08) | 80 | P0 | `POST /api/v1/projects/:project_id/restore` — hanya valid dari ARCHIVED (Project tidak punya ancestor lain sehingga INV-LIFE-002 trivially satisfied di level Project), otorisasi Owner-only interim, panggil `restoreProject` (1.1) | [02-SPEC C.4](docs/02-SPEC.md), INV-LIFE-002 | 1.1, 1.3.3 |
| 1.4.3 | 🔎 | [CL-46](#cl-46)<br> [CL-45](#cl-45)<br>[CL-24](#cl-24)<br>[CL-23](#cl-23)<br>[CL-18](#cl-18)<br>[CL-17](#cl-17)<br>[QA-CL-09](#qa-cl-09)<br>[QA-CL-12](#qa-cl-12)<br>[Review-CL-08](#review-cl-08) | 80 | P0 | `POST /api/v1/projects/:project_id/delete` — terminal, tidak dapat direstore setelahnya, otorisasi Owner-only interim, panggil `deleteProject` (1.1) | [02-SPEC C.4](docs/02-SPEC.md), INV-LIFE-004 | 1.1, 1.3.3 |

**Test:** Integration per operasi — happy path mengubah `project_state` + Activity sesuai; non-Owner ditolak `PERMISSION_DENIED`; version mismatch → `VERSION_CONFLICT` tanpa perubahan; restore dari DELETED ditolak; archive/restore/delete pada Project lain (beda Project boundary) tidak pernah menyentuh Project DB yang salah.
**DoD:** Ketiga command diekspos sebagai domain command eksplisit (bukan generic PATCH, BR-061); lifecycle state machine A.3 dipatuhi; test lifecycle + Project-boundary hijau.

---

## TASK-1.5 — Permission catalog seed (D.1)  (dep: — , independen dari 1.1–1.4)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 1.5.1 | ✅ | [CL-20](#cl-20)<br>[CL-19](#cl-19)<br>[QA-CL-10](#qa-cl-10) | 100 | P0 | Seed idempotent tabel `permissions` (Global DB) dengan seluruh key kanonik D.1 (`project.read`, `project.update`, `milestone.*`, `board.*`, `list.*`, `card.*`, `member.*`, `permission_group.*`, `api_key.*`) — data statis, BUKAN migration schema baru. Jalankan sebagai bagian `migrate-global` (`packages/infrastructure/scripts/migrate-global.ts`) atau modul seed terpisah `packages/infrastructure/src/database/permission-catalog.ts`, idempotent (upsert by `key`) | [02-SPEC D.1](docs/02-SPEC.md) | — |
| 1.5.2 | 🔎 | [CL-48](#cl-48)<br>[CL-45](#cl-45)<br>[Review-CL-07](#review-cl-07) | 80 | P3 | Tambah `uniqueIndex` pada `permissions.key` (`packages/infrastructure/src/database/global-schema.ts`) + migration Drizzle baru (`drizzle-kit generate`); ubah `seedPermissionCatalog` (`permission-catalog.ts`) memakai `INSERT ... ON CONFLICT(key) DO NOTHING` (atau setara) alih-alih lookup-by-key manual, karena constraint DB sekarang menjamin keunikan | [03-ENG B.2](docs/03-ENGINEERING.md) (amandemen 2.2.2) | 1.5.1 |

**Test:** Unit/integration — run seed dua kali berturut-turut menghasilkan jumlah row sama (idempotent, tidak duplikat); setiap key D.1 ada tepat satu row; insert manual key duplikat langsung ke tabel (bypass service) ditolak oleh DB (`UNIQUE constraint failed`) untuk goal 1.5.2; migration baru diterapkan bersih di atas Global DB existing (idempotent, tidak error terhadap data yang sudah ada — 40 key existing tidak ada duplikat, dikonfirmasi QA-CL-10).
**DoD:** Katalog permission lengkap sesuai D.1; re-run migrate-global tidak menghasilkan duplikat atau error constraint; untuk 1.5.2, keunikan `key` ditegakkan DB-level bukan cuma aplikasi.

---

## TASK-1.6 — Baseline Permission Group seed saat create Project  (dep: 1.2, 1.5)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 1.6.1 | 🔎 | [CL-47](#cl-47)<br>[CL-45](#cl-45)<br>[CL-22](#cl-22)<br>[CL-21](#cl-21)<br>[QA-CL-11](#qa-cl-11)<br>[Review-CL-04](#review-cl-04) | 80 | P1 | Saat `provisionProjectWithMapping` (1.2) commit, seed 4 baseline Permission Group **Co-Owner, Manager, Contributor, Viewer** (BUKAN Owner — Owner adalah ownership property BR-035, bukan Group) beserta `group_permissions` default sesuai matrix D.2, dalam transaksi Global DB yang sama. Baseline HARUS berupa data (row `permission_groups`+`group_permissions`), bukan `if role == ...` hard-coded (BR-039) | [02-SPEC D.2](docs/02-SPEC.md), BR-035, BR-036, BR-039 | 1.2, 1.5 |

**Test:** Integration — create Project → tepat 4 `permission_groups` baru dengan nama baseline; `group_permissions` Co-Owner mencakup seluruh operasi Owner-level kecuali ownership itu sendiri, Manager mencakup Milestone/Board/List CRUD + Card, Contributor mencakup Card create/update/move/archive/delete/comment tanpa Manage Members/Permission Groups, Viewer hanya `*.read`; verifikasi tidak ada baseline group bernama "Owner".
**DoD:** Baseline groups tersedia setiap Project baru sesuai D.2; konfigurasi disimpan sebagai data yang dapat diubah lewat 1.7 (bukan hard-coded).

---

## TASK-1.7 — Permission Group CRUD endpoints  (dep: 1.5, 1.6)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 1.7.1 | 🔎 | [CL-46](#cl-46)<br> [CL-45](#cl-45)<br>[CL-26](#cl-26)<br>[CL-25](#cl-25)<br>[Review-CL-08](#review-cl-08)<br>[QA-CL-13](#qa-cl-13) | 80 | P1 | `GET /api/v1/projects/:project_id/permission-groups` — list Group Project-scoped (exclude yang `deleted_at` bukan NULL kecuali diminta eksplisit) | [02-SPEC C.12](docs/02-SPEC.md), FR-009 | 1.6 |
| 1.7.2 | 🔎 | [CL-46](#cl-46)<br> [CL-45](#cl-45)<br>[CL-28](#cl-28)<br>[CL-27](#cl-27)<br>[Review-CL-08](#review-cl-08)<br>[QA-CL-13](#qa-cl-13) | 80 | P1 | `POST /api/v1/projects/:project_id/permission-groups` — create custom Group + assign permission set (referensi ke `permissions.id` katalog 1.5), otorisasi Owner-only interim | [02-SPEC C.12](docs/02-SPEC.md), FR-010, FR-011 | 1.5, 1.6 |
| 1.7.3 | 🔎 | [CL-46](#cl-46)<br> [CL-45](#cl-45)<br>[CL-30](#cl-30)<br>[CL-29](#cl-29)<br>[Review-CL-08](#review-cl-08)<br>[QA-CL-13](#qa-cl-13) | 80 | P1 | `PATCH /api/v1/projects/:project_id/permission-groups/:group_id` — ubah nama/description/permission assignment; perubahan permission langsung berlaku ke semua Membership ber-assignment (BR-040, live reference — tidak ada snapshot untuk di-invalidate), otorisasi Owner-only interim | [02-SPEC C.12](docs/02-SPEC.md), BR-040 | 1.7.1 |
| 1.7.4 | 🔎 | [CL-46](#cl-46)<br> [CL-45](#cl-45)<br>[CL-32](#cl-32)<br>[CL-31](#cl-31)<br>[Review-CL-02](#review-cl-02)<br>[Review-CL-08](#review-cl-08)<br>[QA-CL-13](#qa-cl-13) | 80 | P2 | `POST /api/v1/projects/:project_id/permission-groups/:group_id/delete` — soft-delete (set `permission_groups.deleted_at`); Membership dengan assignment ke Group ini kehilangan permission yang di-grant Group tsb tanpa menghapus riwayat `membership_group_assignments` (BR-041); otorisasi Owner-only interim | [02-SPEC C.12](docs/02-SPEC.md) (amandemen 2.1.0), BR-041, D.1 `permission_group.delete` | 1.7.1 |

**Test (1.7.1–1.7.4):** create custom Group + assign `card.read` tanpa `card_read_visibility` eksplisit → default `CREATED_BY_ME` (BR-048); assign visibility ke permission selain `card.read` ditolak (app-level invariant B.2); update Group oleh non-Owner → `PERMISSION_DENIED`; list tidak bocor lintas Project; delete Group tidak menghapus row `membership_group_assignments` (hanya `permission_groups.deleted_at` ter-set).
**DoD:** CRUD+delete Group sesuai C.12 (2.1.0); Group Project-scoped (BR-039); soft-delete tidak menghapus riwayat assignment.

---

## TASK-1.8 — Scoped Group/direct Permission assignment endpoints  (dep: 1.6, 1.7)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 1.8.1 | 🔎 | [CL-46](#cl-46)<br> [CL-45](#cl-45)<br>[CL-34](#cl-34)<br>[CL-33](#cl-33)<br>[Review-CL-08](#review-cl-08)<br>[QA-CL-13](#qa-cl-13) | 80 | P1 | `POST /api/v1/projects/:project_id/members/:membership_id/group-assignments` + `.../revoke` — assign scoped Group ke Membership pada tepat satu `scope_type`/`scope_id` (BR-042); scope_id divalidasi ada & berada di Project sama (BR-042B: untuk Phase 1 validasi terbatas pada `scope_type="project"`, karena Milestone/Board/List/Card belum ada — validasi scope non-project ditandai catatan untuk direvisit Phase 2/3 saat resource-nya ada); revoke mempertahankan riwayat (`revoked_at`, bukan delete) | [02-SPEC C.12](docs/02-SPEC.md), BR-042, BR-042B | 1.6, 1.7.1 |
| 1.8.2 | 🔎 | [CL-46](#cl-46)<br> [CL-45](#cl-45)<br>[CL-36](#cl-36)<br>[CL-35](#cl-35)<br>[Review-CL-08](#review-cl-08)<br>[QA-CL-13](#qa-cl-13) | 80 | P1 | `POST /api/v1/projects/:project_id/members/:membership_id/permission-assignments` + `.../revoke` — sama seperti 1.8.1 tapi direct Permission (bukan Group), termasuk `card_read_visibility` khusus `card.read` (default `CREATED_BY_ME` jika tidak diberikan, BR-048) | [02-SPEC C.12](docs/02-SPEC.md), BR-042A, BR-047, BR-048 | 1.6, 1.7.1 |

**Test:** Assignment ke Membership beda Project ditolak; assignment ganda aktif pada `(membership, group/permission, scope_type, scope_id)` yang sama ditolak (UNIQUE constraint aktif — `membership_group_assignments_active_unique`/`membership_permission_assignments_active_unique`); revoke tidak menghapus row, hanya set `revoked_at`; `card_read_visibility` di-set NULL utk permission selain `card.read`.
**DoD:** Assignment additive (BR-038), riwayat utuh setelah revoke; Project-boundary check pada `membership_id` dan `scope_id` project-level.

---

## TASK-1.9 — Invitation flow (create + accept)  (dep: 1.2, 1.7)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 1.9.1 | 🔎 | [CL-46](#cl-46)<br> [CL-45](#cl-45)<br>[CL-38](#cl-38)<br>[CL-37](#cl-37)<br>[QA-CL-13](#qa-cl-13) | 80 | P0 | `POST /api/v1/projects/:project_id/invitations` — wajib minimal satu `assignments` (group_id + scope), simpan reference ke Group (bukan snapshot, BR-052), `expires_at`, otorisasi Owner-only interim (Manage Members) | [02-SPEC C.13](docs/02-SPEC.md), BR-050, BR-051, BR-052, FR-005, FR-006 | 1.2, 1.7.1 |
| 1.9.2 | 🔎 | [CL-46](#cl-46)<br> [CL-45](#cl-45)<br>[CL-40](#cl-40)<br>[CL-39](#cl-39)<br>[QA-CL-13](#qa-cl-13) | 80 | P0 | `POST /api/v1/invitations/:invitation_id/accept` — validasi belum expired/accepted/revoked (`INVITATION_EXPIRED`/`INVITATION_ALREADY_USED`), lalu atomik: create `project_memberships` + seluruh `membership_group_assignments` dari `invitation_group_assignments`, set `accepted_at` — dalam satu transaksi Global DB | [02-SPEC C.13](docs/02-SPEC.md), FR-007 | 1.9.1 |

**Test:** Invitation expired → `INVITATION_EXPIRED`; accept dua kali → `INVITATION_ALREADY_USED`; accept sukses menghasilkan tepat 1 Membership baru + assignment sesuai `invitation_group_assignments` tanpa assignment kedua kali (idempotent terhadap retry); accept oleh email berbeda dari `invitations.email` ditolak.
**DoD:** Alur invitation sesuai FR-005–007; tidak ada join bebas (BR-050); Membership+assignment ter-commit atomik.

---

## TASK-1.10 — Membership read/revoke  (dep: 1.2)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 1.10.1 | 🔎 | [CL-46](#cl-46)<br> [CL-45](#cl-45)<br>[CL-42](#cl-42)<br>[CL-41](#cl-41)<br>[Review-CL-02](#review-cl-02)<br>[Review-CL-09](#review-cl-09)<br>[QA-CL-13](#qa-cl-13) | 80 | P2 | `GET /api/v1/projects/:project_id/members` — list Membership Project (`member.read`); query param opsional `status` (comma-separated, subset `active,revoked`) membatasi hasil, tanpa param kembalikan keduanya | [02-SPEC C.12](docs/02-SPEC.md) (amandemen 2.1.0, 2.4.0), FR-008 | 1.2 |
| 1.10.2 | 🔎 | [CL-46](#cl-46)<br> [CL-45](#cl-45)<br>[CL-44](#cl-44)<br>[CL-43](#cl-43)<br>[Review-CL-02](#review-cl-02)<br>[QA-CL-13](#qa-cl-13) | 80 | P2 | `POST /api/v1/projects/:project_id/members/:membership_id/revoke` (`member.remove`) — set `project_memberships.revoked_at`, TIDAK menghapus data historis (`creator_user_id`/`activity.actor_user_id` tetap utuh, BR-053); tidak mencabut `membership_group_assignments`/`membership_permission_assignments` satu-per-satu — assignment tetap ada sebagai riwayat, non-applicable begitu Membership induk revoked; Owner Membership MUST NOT dapat di-revoke (Project selalu punya tepat satu Owner, FR-002) | [02-SPEC C.12](docs/02-SPEC.md) (amandemen 2.1.0), BR-053, FR-002, FR-008 | 1.2, 1.10.1 |

**Test:** List tidak bocor lintas Project; revoke Membership non-Owner sukses set `revoked_at` tanpa hapus row assignment; revoke Membership yang sudah revoked → idempotent atau ditolak (INVALID_STATE — bebas dipilih Dev asal konsisten, dicatat di CL); percobaan revoke Owner Membership ditolak.
**DoD:** FR-008 (revoke tanpa hapus riwayat) terbukti test; Owner Membership tidak pernah bisa di-revoke sendiri (menjaga FR-002).

---

## Exit Criteria Phase 1 (syarat mulai Phase 2)
- Project CRUD penuh (create/read/update/archive/restore/delete) via domain command, bukan generic PATCH untuk field terkontrol.
- Setiap Project baru punya tepat satu Owner Membership sejak commit provisioning (FR-002).
- Permission catalog D.1 ter-seed; 4 baseline Permission Group (Co-Owner/Manager/Contributor/Viewer) ter-seed otomatis per Project baru sesuai D.2, dapat di-CRUD + soft-delete.
- Scoped Group/direct Permission assignment dapat dibuat & di-revoke dengan riwayat utuh.
- Invitation create→accept menghasilkan Membership + assignment otomatis tanpa join bebas.
- Seluruh endpoint yang dibuat terpetakan ke 02-SPEC Part C; tidak ada path yang diciptakan di luar kontrak.
- Test Project-boundary, optimistic locking (AC-020 pattern), dan authorization (Owner vs non-Owner, minimal 1 positif + 1 negatif) hijau untuk seluruh goal.

## Flag terbuka (sesuai C.6.5)
- ~~`[NEEDS-SPEC-AMENDMENT]` C.12 — endpoint delete/archive Permission Group tidak terdefinisi~~ → **DISELESAIKAN 2026-08-21 (manusia):** `POST /permission-groups/:group_id/delete` ditambahkan ke 02-SPEC C.12; SOT dinaikkan ke 2.1.0 melalui Review-CL-02. Goal 1.7.4 dibuka dari draft blocked.
- ~~`[NEEDS-SPEC-AMENDMENT]` C.4/C.12 — endpoint list & revoke Membership tidak terdefinisi~~ → **DISELESAIKAN 2026-08-21 (manusia):** `GET /members` dan `POST /members/:membership_id/revoke` ditambahkan ke 02-SPEC C.12; SOT dinaikkan ke 2.1.0 melalui Review-CL-02. Goal 1.10.1/1.10.2 dibuka dari draft blocked.
- ~~`[NEEDS-DECISION]` D.4 — formula otorisasi `card.comment.update` tidak ada (Review-CL-03 poin 1, sebagian)~~ → **DISELESAIKAN 2026-08-22 (manusia):** `card.comment.update` MUST scoped ke komentar milik actor sendiri, berlaku mutlak termasuk Owner (business invariant, bukan grant Group). Ditambahkan **BR-034A** + formula `can_comment_update` di D.4; SOT dinaikkan ke 2.2.0 melalui Review-CL-05. **Catatan:** ini menyelesaikan pertanyaan "apa yang dilakukan permission ini", TAPI **belum menyelesaikan** pertanyaan "siapa dapat permission ini secara default di D.2" (tetap backlog, lihat item di bawah).
- ~~`[NEEDS-DECISION]` A.10 — apakah `card.restore` scoped ke aktor yang meng-archive (Review-CL-03 poin 1, sebagian)~~ → **DISELESAIKAN 2026-08-22 (manusia):** `card.restore` MUST blanket (Card manapun yang ARCHIVED dalam scope permission, bukan hanya oleh aktor yang sama) — menegaskan BR-045, ditambahkan **BR-045A**; SOT dinaikkan ke 2.2.1 melalui Review-CL-06. Sama seperti di atas: ini cuma mengunci arti permission-nya, bukan menjawab siapa dapat by default.
- **Sisa terbuka dari Review-CL-03 poin 1** (setelah 2 sub-poin di atas diselesaikan): siapa dapat `card.restore`/`card.comment.update` secara default di baseline Permission Group, dan siapa dapat `member.read`/`permission_group.read`/`api_key.read` secara default untuk role selain Co-Owner — **sengaja TIDAK mendesak diisi**: manusia menilai Permission Group cuma paket default yang bisa diubah Owner kapan saja setelah TASK-1.7/1.8 CRUD tersedia (Owner bebas assign permission apapun ke siapa pun, langsung atau via Group) — bukan capability yang hilang dari sistem, cuma soal apa isi paket bawaannya.
- ~~Review-CL-03 poin 2 — `permissions.key` tidak punya unique index~~ → **DISELESAIKAN 2026-08-22 (manusia setuju rekomendasi Review):** anotasi UNIQUE ditambahkan ke 03-ENG B.2; SOT dinaikkan ke 2.2.2 melalui Review-CL-07. Implementasi (migration + schema + `ON CONFLICT`) jadi goal baru **1.5.2** (⬜️, Dev).
- ~~Review-CL-03 poin 3 — kode error payload invalid (`INVALID_STATE` vs `VALIDATION_ERROR`)~~ → **DISELESAIKAN 2026-08-22 (manusia memilih "benerin sekarang"):** kode kanonik baru `VALIDATION_ERROR` (400) ditambahkan ke 02-SPEC C.2; SOT dinaikkan ke 2.3.0 melalui Review-CL-08. Goal 1.3.1/1.3.4/1.4.1/1.4.2/1.4.3 dibuka kembali ✅→⚠️; goal 1.7.1–1.7.4/1.8.1–1.8.2 (masih 🔎) ditandai untuk disesuaikan sebelum QA meluluskan.
- ~~Review-CL-04 poin 3 — filter `GET /projects` di C.4 tidak terdefinisi~~ → **DISELESAIKAN 2026-08-22 (manusia setuju rekomendasi Review):** query param `status` (comma-separated) didefinisikan untuk C.4 (`GET /projects`) dan C.12 (`GET /members`, gap serupa ditemukan sekaligus); SOT dinaikkan ke 2.4.0 melalui Review-CL-09. Goal baru **1.3.5** dibuka (⬜️); goal **1.10.1** (belum diimplementasikan) diperbarui deskripsinya langsung.
- **Backlog Phase 1 tersisa:** tidak ada lagi item dari Review-CL-03/04 yang belum diputuskan — seluruh 6 temuan sudah diputuskan manusia (2 langsung diamandemen saat generate, 4 diangkat menyusul). Sisa murni implementasi goal yang sudah dibuka (1.5.2, 1.3.5, dan penyesuaian VALIDATION_ERROR di 1.3.1/1.3.4/1.4.1–1.4.3/1.7.1–1.7.4/1.8.1–1.8.2).

---

## Closure Log

> Isi tiap kali sebuah goal pindah status atau menerima hasil review. Ikuti format & aturan penamaan CL sesuai [AGENTS.md §6](AGENTS.md) dan [PHASE-0-TASKS.md](PHASE-0-TASKS.md) (namespace CL/QA-CL/Review-CL terpisah per fase — entry Phase 1 dimulai dari CL-01/QA-CL-01/Review-CL-01 pada file ini).

<a id="cl-48"></a>
### CL-48 — 2026-08-22 · goal 1.5.2 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — unique index permissions.key + seed ON CONFLICT
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 28 file / **146** test lulus; `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi sesuai Review-CL-07: (1) `global-schema.ts` menambah `uniqueIndex("permissions_key_unique").on(t.key)` pada tabel `permissions`; (2) migration Drizzle baru `drizzle/migrations/0002_permissions_key_unique.sql` di-generate via `drizzle-kit generate` (+snapshot/journal meta); (3) `seedPermissionCatalog` kini memakai `INSERT ... ON CONFLICT(key) DO NOTHING` dan menghitung `inserted` dari `rowsAffected` — lookup-by-key manual dihapus. Test baru di `permission-catalog.test.ts` describe `unique index permissions.key — goal 1.5.2`: negatif INSERT key duplikat ditolak DB-level (bukan hanya aplikasi) dan rowsAffected seed ulang = 0 tanpa id baru.
**Catatan implementasi:** Perbaikan kecil tipe (`as const` untuk literal `"CREATED_BY_ME"` pada ternary provision.ts) ikut dalam commit ini karena ditemukan saat typecheck.

<a id="cl-47"></a>
### CL-47 — 2026-08-22 · goal 1.6.1 selesai sisi Dev (🔄 → 🔎 · 60 → 80%) — baseline card.read visibility diperbaiki
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 28 file / 144 test lulus (termasuk `baseline-groups.test.ts` 5/5). Temuan Review-CL-04 Temuan 1 dieksekusi: `provision.ts` (`registerProjectWithOwnerMembership`) kini mengisi `cardReadVisibility: "CREATED_BY_ME"` untuk baris dengan `permission.key === "card.read"`, tetap `null` untuk key lain — sesuai 03-ENG B.2 + BR-047/BR-048. Test `[BR-039][BR-036][BR-047][BR-048]` ditulis ulang: meng-assert SEMUA baris group_permissions Project baseline (baris card.read → CREATED_BY_ME, non-card.read → NULL), menggantikan assertion lama yang salah menyatakan Viewer NULL.
**Catatan implementasi:** Perubahan satu baris di provisioning seed; tidak ada perubahan skema atau API.

<a id="cl-46"></a>
### CL-46 — 2026-08-22 · goals 1.3.1, 1.3.4, 1.4.1–1.4.3, 1.7.1–1.7.4, 1.8.1–1.8.2, 1.9.1–1.9.2, 1.10.1–1.10.2 selesai sisi Dev (🔄 → 🔎 · 80/80%) — migrasi VALIDATION_ERROR
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 28 file / 144 test lulus; `pnpm -r typecheck` Done; `pnpm lint` bersih. Satu perbaikan mekanis menutup seluruh 15 goal ini (rekomendasi eksplisit Review-CL-08/QA-CL-13): (1) `packages/contracts/src/error-codes.ts` menambah `VALIDATION_ERROR` (+test kontrak kini assert tepat 13 kode kanonik); (2) `http-mapping.ts` `CODE_TO_HTTP.VALIDATION_ERROR = 400`; (3) `apps/api/src/routes/projects.ts` helper `readJsonObject`/`readProjectNameField`/`readExpectedVersionField` → VALIDATION_ERROR 400; (4) `apps/api/src/routes/project-admin.ts` seluruh 29 pemakaian route-level → VALIDATION_ERROR 400; (5) infrastruktur selektif sesuai tabel klasifikasi CL-45: permission_id tidak dikenal & visibility invalid/non-card.read (create/update Group + direct assignment), email invalid, BR-051 assignments kosong, expires_at bukan ISO → VALIDATION_ERROR 400.
**Catatan implementasi:** Yang tetap INVALID_STATE 409 (payload valid, konflik state/kapasitas): scope belum didukung Phase 1 & scope_id ≠ project_id (BR-042B), duplikat assignment aktif (UNIQUE), membership revoked menerima assignment, invitation revoked, pemanggil sudah/pernah member pada accept, revoke Owner Membership (FR-002), expires_at masa lalu. Fallback 500 (`routes/projects.ts`) tidak diubah. Test diupdate hanya pada assertion kode/status untuk kasus payload — tidak ada perilaku domain lain yang berubah.

<a id="cl-45"></a>
### CL-45 — 2026-08-22 · transisi massal: 16 goal ⚠️ → 🔄 + 1.3.5 & 1.5.2 ⬜️ → 🔄 (scope dikonfirmasi manusia)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk sebelum transisi: HEAD `6065013`, `git status` bersih; dibaca ulang seluruh row ⚠️ beserta QA-CL-13, Review-CL-08 (VALIDATION_ERROR), Review-CL-04 Temuan 1 (1.6.1), Review-CL-07 (1.5.2), Review-CL-09 (1.3.5). Scope dari manusia: "1.3.5, 1.5.2 dan semua goal dengan status Gagal-verifikasi".
**Catatan keputusan teknis — klasifikasi migrasi kode error (berlaku untuk semua goal terdampak):** `VALIDATION_ERROR` 400 untuk validasi yang dapat dievaluasi dari payload/query saja terhadap data statis: body bukan objek JSON; field wajib hilang/kosong/salah tipe; nilai di luar set kanonik (permission_id tidak dikenal pada payload Group create/update, visibility di luar enum / pada non-card.read sesuai klasifikasi QA-CL-13, email format invalid, expires_at bukan ISO, query param status tidak dikenal); duplikat entri dalam payload set. Tetap `INVALID_STATE` 409 (payload valid bentuknya, konflik dengan state/kapasitas saat ini): scope_type belum didukung Phase 1, scope_id ≠ project_id (BR-042B), duplikat assignment aktif (UNIQUE), membership revoked menerima assignment, invitation revoked, pemanggil sudah/pernah member pada accept, revoke Owner Membership (FR-002), expires_at masa lalu. Kode kanonik lain tidak berubah (RESOURCE_NOT_FOUND/INVITATION_EXPIRED/INVITATION_ALREADY_USED).

<a id="qa-cl-13"></a>
### QA-CL-13 — 2026-08-22 · goals 1.7.1, 1.7.2, 1.7.3, 1.7.4, 1.8.1, 1.8.2, 1.9.1, 1.9.2, 1.10.1, 1.10.2 🔎 → ⚠️ — domain logic solid, tapi non-compliant SOT 2.3.0 (VALIDATION_ERROR)
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti — domain logic diverifikasi baik (bukan cuma baca ulang klaim CL):** Baca penuh `packages/infrastructure/src/database/project-admin.ts` (709 baris, seluruh fungsi) + `apps/api/src/routes/project-admin.ts` (472 baris) + wiring `apps/api/src/project-deps.ts`. Dicocokkan ke SOT baris-per-baris:
- **1.7.1-1.7.4 (Permission Group CRUD):** `listPermissionGroups` exclude soft-deleted default (`?include_deleted=true` eksplisit membuka); `createPermissionGroup`/`updatePermissionGroup` **benar** mengisi `cardReadVisibility: "CREATED_BY_ME"` untuk `card.read` tanpa visibility eksplisit (BR-048) — TIDAK punya bug yang sama dengan 1.6.1 (Review-CL-04), validasi permission_id dikenal + visibility hanya untuk card.read; `deletePermissionGroup` soft-delete murni (`deleted_at`), `membership_group_assignments` tidak disentuh (BR-041); `updatePermissionGroup` replace-set penuh dalam transaksi (BR-040 live-reference, tidak ada snapshot untuk di-invalidate).
- **1.8.1-1.8.2 (scoped assignment):** `createGroupAssignment`/`createPermissionAssignment` menolak scope_type≠"project" & scope_id≠project_id (BR-042B Phase 1 boundary); menolak assignment ke membership revoked; UNIQUE violation di-map ke 409 bersih (bukan error DB mentah); `revoke*` idempotent, mempertahankan riwayat (set `revoked_at`, tidak delete).
- **1.9.1-1.9.2 (Invitation):** `createInvitation` validasi email, minimal 1 assignment (BR-051), default expiry 7 hari (BR-052) saat tidak diberikan, tiap assignment group divalidasi ada+aktif+milik Project yang sama (BR-042B); Group disimpan sebagai **reference** (`groupId` di `invitation_group_assignments`, bukan snapshot permission — BR-050/BR-052). `acceptInvitation`: revoked→`INVALID_STATE`, sudah accepted→**`INVITATION_ALREADY_USED`** (kode kanonik benar), expired→**`INVITATION_EXPIRED`** (kode kanonik benar), user yang sudah/pernah jadi member ditolak; membership+seluruh group assignment+`accepted_at` atomik satu transaksi (FR-007).
- **1.10.1-1.10.2 (Membership read/revoke):** `listProjectMembers` filter `status` (active/revoked, comma-separated) sesuai Review-CL-09; default tanpa param = keduanya. `revokeMembership` **menolak revoke Owner** (FR-002, dicek sebelum mutasi) dan idempotent (revoke ulang tidak menimpa timestamp pertama); tidak menyentuh `membership_group_assignments`/`membership_permission_assignments` (riwayat utuh, BR-053).
- Seluruh 10 goal ini beroperasi **murni di Global DB** (permission_groups/group_permissions/invitations/project_memberships dst.) — TIDAK melalui `ProjectClientFactory`/`resolveProjectDbClient`, sehingga tidak terpapar kelas bug QA-CL-04 (routing per-Project DB) sama sekali; boundary Project ditegakkan via `WHERE project_id = ?` eksplisit di setiap query (dikonfirmasi test `[INV-04]` lintas-Project di `group-assignments.test.ts`/`members-revoke.test.ts`).
- Re-run penuh `pnpm exec vitest run`: **28 file/144 test PASS**; `pnpm -r typecheck`/`pnpm lint` bersih. Spot-check penamaan test: pola `[BR-xxx]`/`[FR-xxx]`/`[INV-04]`/`[C.xx]` konsisten dipakai (53 test test di 10 file untuk goal-goal ini), positif+negatif+boundary Project+authorization lengkap per goal.
**Alasan ⚠️ (satu temuan sama untuk seluruh 10 goal, bukan 10 temuan terpisah):** Review-CL-08 menaikkan SOT ke 2.3.0 menambah kode kanonik `VALIDATION_ERROR` (400) untuk payload/transport tidak valid, memisahkan dari `INVALID_STATE` (409, konflik state domain) — dan eksplisit menandai goal 1.7.1-1.7.4/1.8.1-1.8.2 "ditandai untuk disesuaikan sebelum QA meluluskan". Dicek langsung: `packages/contracts/src/error-codes.ts` **belum memuat `VALIDATION_ERROR` sama sekali** (masih 12 kode lama); `grep -c INVALID_STATE apps/api/src/routes/project-admin.ts` = 30 pemakaian, seluruhnya untuk validasi payload/transport (body bukan objek, field salah tipe/kosong, permission_id tidak dikenal, dll.) — persis kategori yang menurut Review-CL-08 harus jadi `VALIDATION_ERROR`. Ini juga berlaku untuk 1.9.1/1.9.2/1.10.1/1.10.2 yang dibuat **setelah** SOT 2.3.0 ada tapi tetap memakai pola lama (belum ditandai eksplisit di Review-CL manapun karena goal ini belum ada saat Review-CL-08 ditulis, tapi gap-nya identik).
**Catatan:** Ini BUKAN 10 bug domain-logic terpisah — satu migrasi mekanis (tambah `VALIDATION_ERROR` ke `error-codes.ts`+`http-mapping.ts`, ganti `INVALID_STATE`→`VALIDATION_ERROR` di kedua route helper untuk kasus payload/transport, update test yang meng-assert kode lama) menutup seluruh 10 goal sekaligus — persis rekomendasi Review-CL-08 sendiri. Begitu itu selesai, saya perkirakan re-verifikasi akan cepat karena domain logic-nya sudah terbukti benar di sini. Tidak ada perubahan SOT oleh QA.

<a id="review-cl-09"></a>
### Review-CL-09 — 2026-08-22 · amandemen 02-SPEC (2.3.0 → 2.4.0): definisikan filter `status` untuk `GET /projects` & `GET /members`; goal 1.3.5 dibuka, 1.10.1 diperbarui
**Role:** AI-Planning & Review · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Backlog terakhir dari Review-CL-04 poin 3 diangkat: C.4 menyebut `GET /projects` "termasuk ARCHIVED/DELETED sesuai filter" tanpa pernah mendefinisikan bentuk filter (nama param, nilai). Sambil mengerjakan ini, ditemukan **gap kedua yang identik** — kalimat "sesuai filter" yang saya tulis sendiri di C.12 untuk `GET /members` (Review-CL-02) punya masalah yang sama persis, belum sempat terdeteksi sebelumnya. Rekomendasi diajukan (query param `status`, comma-separated, opsional, default = semua) untuk keduanya sekaligus; manusia setuju tanpa perubahan (2026-08-22).
**Perubahan SOT:** `docs/02-SPEC.md` C.4 — `GET /projects` mendapat query param `status` (subset `ACTIVE,ARCHIVED,DELETED`). C.12 — `GET /members` mendapat query param `status` (subset `active,revoked`). Keduanya: tanpa param, perilaku MUST tetap kembalikan semua (non-breaking). `docs/01-PRODUCT.md` §0.4: `SPEC_VERSION` 2.3.0 → **2.4.0** (minor — kapabilitas opsional baru) + changelog.
**Dampak goal:**
- **Goal baru 1.3.5** dibuka di TASK-1.3 (⬜️, dep 1.3.2 yang sudah ✅ — murni penambahan, BUKAN retroaktif seperti VALIDATION_ERROR di Review-CL-08, karena goal 1.3.2 lama tidak pernah diminta punya filter, jadi tidak perlu dibuka ulang).
- **Goal 1.10.1** (belum diimplementasikan, masih ⬜️) diperbarui deskripsinya langsung menyertakan filter — tidak perlu goal terpisah karena belum ada implementasi yang perlu "dibatalkan".
**Catatan:** Dengan ini, seluruh 6 temuan dari Review-CL-03 (3 item) dan Review-CL-04 (3 item) sudah mendapat keputusan eksplisit manusia — tidak ada lagi backlog SOT yang menunggu keputusan di Phase 1. Sisa pekerjaan murni implementasi (goal yang sudah dibuka: 1.3.5, 1.5.2, serta penyesuaian VALIDATION_ERROR pada 1.3.1/1.3.4/1.4.1–1.4.3/1.7.1–1.7.4/1.8.1–1.8.2 dari Review-CL-08) — bukan lagi soal SOT yang belum jelas.

<a id="review-cl-08"></a>
### Review-CL-08 — 2026-08-22 · amandemen 02-SPEC (2.2.2 → 2.3.0): `VALIDATION_ERROR`; 5 goal ✅→⚠️, 6 goal 🔎 ditandai
**Role:** AI-Planning & Review · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Backlog Review-CL-03 poin 3 diangkat kembali. Manusia memilih **opsi "benerin sekarang"** dari 2 alternatif yang diajukan (alternatif lain: tunda ke Phase 6/Hardening sesuai 04-DELIVERY C.1). Freshness check sebelum eksekusi: `git log --oneline -10` menunjukkan sesi Dev lain sudah commit TASK-1.7 (1.7.1–1.7.4) dan TASK-1.8 (1.8.1–1.8.2) sejak Review-CL-07 — di-baca ulang penuh dari disk sebelum lanjut (bukan dari memory sesi). `grep -n "INVALID_STATE" apps/api/src/routes/project-admin.ts` mengonfirmasi pola yang sama (payload validation → `INVALID_STATE` 409) dipakai **20+ kali** di endpoint Permission Group/assignment (TASK-1.7/1.8), bukan cuma di `routes/projects.ts` (TASK-1.3/1.4) seperti dugaan awal — cakupan dampak diperluas dari 2 goal (dugaan awal Review-CL-03) menjadi **11 goal**.
**Perubahan SOT:** `docs/02-SPEC.md` C.2 menambah kode kanonik **`VALIDATION_ERROR`** (HTTP 400) + kalimat pembeda eksplisit dari `INVALID_STATE` (409, khusus konflik state domain). `docs/01-PRODUCT.md` §0.4: `SPEC_VERSION` 2.2.2 → **2.3.0** (minor — kode baru, tidak mengubah kode existing) + changelog.
**Dampak ke goal (bukan Review yang implementasi — ini catatan untuk Dev/QA):**
- **Dibuka kembali ✅→⚠️/80%** (sudah closed di bawah aturan lama, SOT berubah setelahnya — bukan bug baru): **1.3.1, 1.3.4, 1.4.1, 1.4.2, 1.4.3** (`apps/api/src/routes/projects.ts`, helper `readJsonObject`/`readProjectNameField`/`readExpectedVersionField`).
- **Ditandai untuk disesuaikan sebelum QA meluluskan** (masih `🔎`, belum closed, tidak perlu transisi status): **1.7.1, 1.7.2, 1.7.3, 1.7.4, 1.8.1, 1.8.2** (`apps/api/src/routes/project-admin.ts`) — QA sebaiknya menolak ke `⚠️` jika verifikasi dilakukan sebelum helper ini diperbaiki mengikuti SOT 2.3.0.
- **Tindak lanjut Dev** (satu titik, mekanis — bukan 11 perbaikan terpisah): ganti kode `INVALID_STATE`→`VALIDATION_ERROR` di seluruh pemanggilan `PipelineError` yang menandai *payload/transport tidak valid* (bukan konflik state) pada kedua file helper tsb; tambah `VALIDATION_ERROR` ke `packages/contracts/src/error-codes.ts` (`ERROR_CODES` array + test yang meng-assert "tepat 12 kode") dan `http-mapping.ts` (`CODE_TO_HTTP.VALIDATION_ERROR = 400`); update seluruh test yang men-assert `INVALID_STATE` untuk payload invalid.
**Catatan:** Ini keputusan API-contract (menambah kode error kanonik) yang sudah lewat keputusan manusia eksplisit, bukan Review memutuskan sendiri. Prior tetap tinggi (P0/P1 seperti semula) karena ini bukan fitur baru, hanya penyesuaian kode error pada goal yang sudah/hampir closed.

<a id="review-cl-07"></a>
### Review-CL-07 — 2026-08-22 · amandemen 03-ENG (2.2.1 → 2.2.2): `permissions.key` UNIQUE; goal 1.5.2 dibuka untuk Dev
**Role:** AI-Planning & Review · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Backlog dari Review-CL-03 poin 2 (`permissions.key` tidak punya unique index, ditemukan QA-CL-10) diangkat kembali. Ini keputusan teknis murni (AGENTS.md §10 poin 3 — tidak menyentuh business invariant/authorization/lifecycle/API semantics, mudah diganti karena di balik abstraction service seed), sehingga sah diputuskan Review sendiri; manusia mengonfirmasi setuju (2026-08-22) setelah penjelasan risiko race condition pada seeding paralel.
**Perubahan SOT:** `docs/03-ENGINEERING.md` B.2 — anotasi `permissions.key` menjadi `key(e.g. "card.move", UNIQUE)`. `docs/01-PRODUCT.md` §0.4: `SPEC_VERSION` 2.2.1 → **2.2.2** (patch) + changelog.
**Tindak lanjut (implementasi, bukan tugas Review):** Goal baru **1.5.2** dibuka di TASK-1.5 (⬜️, dep 1.5.1) untuk Dev: tambah `uniqueIndex` di `global-schema.ts` + migration Drizzle baru, ubah `seedPermissionCatalog` memakai `ON CONFLICT DO NOTHING` alih-alih lookup-by-key manual. Prior `P3` (bukan blocker fase, murni hardening) — tidak menghalangi TASK-1.7–1.10.
**Catatan:** Data yang sudah ada (40 key, semua environment) sudah dikonfirmasi unik oleh QA-CL-10 sebelumnya, jadi migration baru diharapkan bersih tanpa konflik data existing.

<a id="review-cl-06"></a>
### Review-CL-06 — 2026-08-22 · amandemen 02-SPEC (2.2.0 → 2.2.1): BR-045A `card.restore` tidak scoped ke aktor archive
**Role:** AI-Planning & Review · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Manusia mengangkat skenario nyata: kalau `card.restore` dibatasi/dianggap "harus orang yang sama dengan yang archive", User A archive → User B restore → User A gak ngecek Activity, archive lagi → User B restore lagi, bisa berulang tanpa disadari sebagai aksi manusia (dikira aplikasi bermasalah). Diklarifikasi bersama: ini BUKAN bug konkurensi (setiap mutation pakai `expected_version` yang selalu fresh, bukan basi — konsisten prinsip "last **valid** write wins" 01-PRODUCT §1.5) — akar masalahnya cuma dua aktor gak saling cek Activity log sebelum bertindak, itu masalah koordinasi tim, bukan cacat sistem. Manusia juga menegaskan tidak mau ada pembatasan siapa BOLEH diberi `card.restore` (Owner selalu bebas assign permission apapun ke siapapun, langsung atau via Group) — pertanyaannya murni soal **scope permission itu sendiri**: apakah `card.restore` cuma berlaku ke Card yang di-archive oleh aktor yang sama, atau ke Card manapun yang ARCHIVED.
**Analisis & keputusan:** BR-045 sudah menyatakan Creator/Assignee bukan permission grant — prinsip yang sama diterapkan ke seluruh command lifecycle Card (bukan cuma create/update), sehingga `card.restore` MUST blanket (berlaku ke Card manapun yang ARCHIVED dalam scope permission-nya), TIDAK scoped ke "siapa yang archive". Alasan tambahan yang menegaskan ini (bukan cuma konsistensi pola): kalau discoped ke aktor yang sama, Card bisa **terjebak permanen ARCHIVED** kalau si pengarsip kehilangan membership atau tidak available — bertentangan dengan maksud state ARCHIVED yang harus reversible oleh tim. Disetujui manusia (2026-08-22).
**Perubahan SOT:** `docs/02-SPEC.md` A.10 menambah **BR-045A** (penegasan BR-045, bukan aturan baru). `docs/01-PRODUCT.md` §0.4: `SPEC_VERSION` 2.2.0 → **2.2.1** (patch — klarifikasi, tidak mengubah semantik domain yang sudah berlaku) + changelog.
**Catatan:** Berbeda dengan BR-034A (`card.comment.update`, Review-CL-05) yang justru discoped ke aktor sendiri (konten personal) — `card.restore` (state transition resource bersama) sengaja TIDAK discoped, demi mencegah Card terjebak permanen. Tidak ada goal Phase 1 yang terdampak langsung (restore Project di 1.4.2 sudah benar — Project cuma satu per DB, tidak ada ambiguitas aktor; command Card sendiri baru Phase 2/5). Backlog "siapa dapat card.restore secara default di D.2" (Review-CL-03 poin 1) tetap terbuka — ini hanya mengunci arti permission-nya, bukan menjawab default assignment-nya.

<a id="review-cl-05"></a>
### Review-CL-05 — 2026-08-22 · amandemen 02-SPEC (2.1.0 → 2.2.0): BR-034A `card.comment.update` scoped ke komentar sendiri
**Role:** AI-Planning & Review · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Diskusi lanjutan dari Review-CL-03/04 poin "D.2 belum menyebut siapa dapat `card.comment.update`". Manusia mengangkat pertanyaan tajam: sebelum diputuskan siapa dapat permission ini, harus jelas dulu **apa yang permission ini benar-benar izinkan** — edit komentar siapa saja, atau cuma komentar sendiri? Dicek D.4: formula `can_comment` (buat komentar) ada, tapi tidak ada formula setara untuk edit komentar — konfirmasi gap nyata, bukan sekadar terlewat baca. Manusia memutuskan (2026-08-22): `card.comment.update` MUST scoped ke `activity.actor_user_id == current_user_id`, dan **berlaku mutlak termasuk Owner** (bukan permission-grant yang bisa dibypass BR-037, melainkan business invariant kepemilikan — dipilih untuk konsistensi dengan BR-031 yang juga melarang siapa pun menghapus comment tanpa pengecualian).
**Perubahan SOT:** `docs/02-SPEC.md` A.9 menambah **BR-034A**; D.4 menambah formula `can_comment_update = has(card.comment.update) AND activity.actor_user_id == current_user_id AND card.is_effectively_active`. `docs/01-PRODUCT.md` §0.4: `SPEC_VERSION` 2.1.0 → **2.2.0** (minor — mengunci authorization semantics yang sebelumnya undefined, tidak breaking karena endpoint comment belum dibangun/Phase 3) + changelog.
**Catatan:** Ini TIDAK menyelesaikan pertanyaan asal (Review-CL-03 poin 1 — siapa dapat `card.restore`/`card.comment.update`/dst di D.2 default) — itu tetap backlog terbuka, sengaja ditunda (lihat "Flag terbuka"). Amandemen ini hanya mengunci *semantik* permission-nya sebelum di-assign ke grup manapun, supaya keputusan D.2 berikutnya tidak dibuat di atas asumsi yang belum jelas. Tidak ada goal Phase 1 yang terdampak langsung (endpoint comment = Phase 3); dicatat sekarang karena baseline group seeding (1.6.1) adalah tempat pertama isu ini muncul.

<a id="review-cl-04"></a>
### Review-CL-04 — 2026-08-22 · audit independen TASK-1.1–1.6 (kesesuaian SOT + code review + SOLID) — 1.6.1 ✅ → ⚠️, review SOT (C.4)
**Role:** AI-Planning & Review · **Model:** claude-sonnet-5 (Claude Code)
**Bukti — verifikasi (bukan cuma baca ulang klaim CL/QA-CL):** Baca penuh kode yang mengimplementasikan TASK-1.1–1.6: `packages/domain/src/project/{project-lifecycle,project-repository}.ts`, `packages/infrastructure/src/database/{project-repository,project-client,project-list,global-reads,permission-catalog}.ts`, `packages/infrastructure/src/provisioning/provision.ts`, `apps/api/src/{index,project-deps}.ts`, `apps/api/src/routes/projects.ts` — dicocokkan baris-per-baris ke 02-SPEC (A.3/A.7/A.8/A.10/A.15/A.16, BR-011–013/019–028/035–048, C.4/C.12/C.15/D.1/D.2) dan 03-ENG (A.4–A.7, B.2/B.3/B.5). Re-run `pnpm -r typecheck` (bersih), `pnpm lint` (bersih), `pnpm exec vitest run` (**18 file/91 test PASS**, cocok klaim QA-CL-12). Menulis + menjalankan test sekali-pakai (dihapus setelah run, tidak masuk commit) yang memanggil `registerProjectWithOwnerMembership` langsung terhadap file-DB nyata dan query `group_permissions.card_read_visibility` untuk `card.read` di keempat baseline group — **hasil live: `null` untuk Co-Owner, Manager, Contributor, DAN Viewer**, mengonfirmasi temuan kode di bawah secara langsung terhadap database sungguhan, bukan cuma pembacaan statis.
**TEMUAN 1 — CONFIRMED, correctness bug (bukan gap SOT, kode menyimpang dari SOT yang sudah eksplisit):** `registerProjectWithOwnerMembership` (`provision.ts` baris ~151–157) menulis SETIAP baris `group_permissions` — termasuk untuk `permission.key = "card.read"` — dengan `cardReadVisibility: null` secara seragam. Ini melanggar app-level invariant yang dituliskan **eksplisit dua kali** di 03-ENG B.2 (baik untuk `group_permissions` maupun `membership_permission_assignments`): *"visibility MUST NULL kecuali permission.key = 'card.read'; service mengisi CREATED_BY_ME jika card.read dibuat tanpa visibility eksplisit"* — serta BR-047/BR-048 (02-SPEC A.11) yang menetapkan default `CREATED_BY_ME` saat `card.read` diberikan tanpa visibility eksplisit. Baris `card.read` pada baseline seed TIDAK diberi visibility eksplisit apa pun → seharusnya diisi `CREATED_BY_ME` oleh service saat insert, bukan dibiarkan `null`. Test `packages/infrastructure/test/baseline-groups.test.ts:131-134` justru meng-assert `null` sebagai hasil yang benar — test ditulis mengikuti perilaku kode yang salah, bukan spec, sehingga suite hijau tidak membuktikan kesesuaian SOT di titik ini (persis skenario yang wajib ditangkap Review menurut AGENTS.md §11.3.4, bukan cuma dibaca dari CL). **Dampak:** begitu Phase 4 membaca `group_permissions.card_read_visibility` sebagai bagian formula ALLOW, keempat baseline group akan punya grant `card.read` dengan visibility `NULL` alih-alih `CREATED_BY_ME` — kalau resolver Phase 4 tidak secara eksplisit menerjemahkan `NULL→CREATED_BY_ME` (yang mana SOT tidak pernah menyebutkan resolver yang melakukan itu; SOT bilang **service** yang mengisi saat **dibuat**), maka access akan salah dievaluasi. **Tindakan:** goal **1.6.1 dikembalikan dari ✅ 100% → ⚠️ 60%** (mayoritas goal benar — 4 group + M/B/L/Card assignment lain sudah tepat; hanya baris `card.read` yang salah) untuk Dev memperbaiki: isi `cardReadVisibility: "CREATED_BY_ME"` saat key adalah `card.read` pada `registerProjectWithOwnerMembership`, lalu update assertion test terkait dan re-verifikasi QA. Wewenang transisi ✅→⚠️ oleh Review sesuai AGENTS.md §11.1/§11.3.4 ("boleh meminta status turun ke ⚠️").
**TEMUAN 2 — code quality/SOLID (tidak memblokir status, dicatat sebagai rekomendasi cleanup):**
- **DRY violation:** logika prioritas lifecycle (`deletedAt` menang atas `archivedAt`, BR-011) diduplikasi persis di dua tempat — `resolveProjectLifecycle` (`packages/domain/src/project/project-lifecycle.ts`) dan `deriveProjectStatus` (`packages/infrastructure/src/database/project-list.ts`), tipe union `"ACTIVE"|"ARCHIVED"|"DELETED"` juga didefinisikan dua kali (`ProjectLifecycleState` vs `ProjectStatus`). Rekomendasi: `project-list.ts` memakai `resolveProjectLifecycle` dari domain langsung, hapus duplikasi.
- **DRY violation minor:** keenam route handler di `apps/api/src/routes/projects.ts` mengulang blok `try { ... } catch (error) { const mapped = toApiErrorResponse(error); return c.json(mapped.body, ...) }` identik. Rekomendasi: ekstrak wrapper (mis. `withErrorHandling(handler)`) agar boilerplate tidak tersebar 6×.
- **Inkonsistensi response shape (bukan pelanggaran SOT — C.4 tidak mengunci nama field — tapi mengurangi konsistensi API):** `POST /projects` mengembalikan `{data:{id,name,status,version}}` (flat, field `status` derived), sedangkan `GET/PATCH/archive/restore/delete` mengembalikan `{data:{project:{id,name,createdAt,updatedAt,archivedAt,deletedAt,version}}}` (nested di key `project`, timestamp lifecycle mentah bukan `status`). Resource yang sama direpresentasikan beda bentuk oleh endpoint berbeda. Rekomendasi: satukan bentuk respons Project di seluruh endpoint C.4 (mis. selalu nested `{project:{...}}` dengan field yang sama).
- Sisi positif yang dikonfirmasi solid: `DrizzleProjectRepository.commitMutation` (strategy-pattern via callback `buildNext`) adalah desain OCP yang baik — command lifecycle baru bisa ditambah tanpa mengubah method inti; boundary domain/infrastruktur (`ProjectRepository` interface di `packages/domain`, implementasi Drizzle di `packages/infrastructure`) sudah benar DIP (03-ENG A.7/A.12); urutan version-check → business-invariant-check → mutation+Activity dalam satu `runInWriteTransaction` konsisten A.6; urutan authorization-sebelum-validasi-body di route layer sudah benar (fix QA-CL-06 terverifikasi masih berlaku, dikonfirmasi baca ulang `handleLifecycle`+route PATCH).
**TEMUAN 3 — review SOT (`02-SPEC.md` C.4), gap baru (belum ada di Review-CL-03):** C.4 menyatakan *"`GET /projects` mengembalikan seluruh Project yang masih tercatat dapat diakses User, termasuk ARCHIVED/DELETED **sesuai filter**"* — tetapi tidak pernah mendefinisikan bentuk filter tersebut (nama query param, nilai yang diterima). Implementasi `listProjectSummaries` saat ini tidak menerima filter apa pun (selalu mengembalikan seluruh Project bermembership aktif tanpa memandang status) — secara teknis konsisten dengan "termasuk ARCHIVED/DELETED" tapi TIDAK mengimplementasikan kapabilitas "sesuai filter" karena filter itu sendiri tidak pernah dispesifikasikan di C.4. Tidak mendesak (tidak ada goal yang butuh filter ini di Phase 1) — dicatat sebagai backlog SOT, bukan blocker.
**Catatan:** Tidak ada perubahan `SPEC_VERSION`/`docs/02-SPEC.md`/`docs/03-ENGINEERING.md` pada entry ini — Temuan 1 adalah perbaikan kode terhadap SOT yang sudah ada (bukan amandemen), Temuan 2 adalah rekomendasi kualitas kode (tidak menyentuh SOT), Temuan 3 dicatat sebagai backlog SOT untuk diputuskan terpisah (belum mendesak). TASK-1.1–1.5 (10 goal) dikonfirmasi valid sesuai SOT tanpa temuan baru; hanya 1.6.1 yang direvisi.

<a id="review-cl-03"></a>
### Review-CL-03 — 2026-08-22 · 3 catatan QA ditinjau, disimpan sebagai backlog (tanpa amandemen SOT, tanpa perubahan status goal)
**Role:** AI-Planning & Review · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Tinjau 3 catatan non-blocking dari QA-CL-10/QA-CL-11/QA-CL-03+CL-06 (lihat entry masing-masing untuk detail lengkap). Rekomendasi disiapkan dan dikonfirmasi ke manusia (2026-08-22): manusia memilih **catat sebagai backlog dulu, jangan diamandemen/diimplementasikan sekarang** untuk ketiganya. Tidak ada perubahan pada `docs/02-SPEC.md`, `docs/03-ENGINEERING.md`, atau `SPEC_VERSION` dalam sesi ini; tidak ada Status/CL goal yang diubah.
**Detail temuan + rekomendasi (untuk diputuskan di sesi Planning berikutnya):**
1. **D.2 (Permission Reference matrix) punya 4 kotak yang tidak terisi** (ditemukan QA-CL-11): baris Card tidak menyebut siapa boleh `card.restore`/`card.comment.update`; tidak ada baris yang menyebut siapa boleh `member.read`/`permission_group.read`/`api_key.read` untuk role selain Co-Owner. Ini menyentuh authorization semantics (D.2 adalah default baseline matrix normatif), jadi butuh keputusan manusia sebelum diamandemen — BUKAN diputuskan sendiri oleh Review meski datanya "configurable, bukan hard-coded" (BR-039), karena mengubah *nilai default* tetap mengubah perilaku otorisasi out-of-the-box. Rekomendasi Review (belum disetujui, masih opsi): `card.restore`→sama dengan `card.archive/delete` (Owner/Co-Owner/Manager/Contributor, mengikuti pola M/B/L yang membundel Restore dengan Archive/Delete); `card.comment.update`→sama dengan `card.comment`; `member.read`+`permission_group.read`→seluruh role (setara "View Project"); `api_key.read`→Owner/Co-Owner saja (setara "Manage API Keys", metadata credential tetap sensitif).
2. **`permissions.key` (Global DB) tidak punya unique index** (ditemukan QA-CL-10, `packages/infrastructure/src/database/global-schema.ts`): idempotency seed katalog D.1 saat ini ditegakkan di level aplikasi (lookup-by-key sebelum insert), aman untuk pola pemakaian sekuensial saat ini (`migrate-global.ts` dijalankan satu proses per deploy) tapi rawan race condition kalau kelak dijalankan paralel. Ini murni penguatan constraint (data yang ada sudah dijamin unik oleh test QA-CL-10 — 40 key, tidak ada duplikat), TIDAK mengubah perilaku domain yang teramati — masuk kategori "keputusan teknis murni" (AGENTS.md §10 poin 3) yang sebetulnya boleh diputuskan Review sendiri. Namun karena manusia memilih "catat dulu" untuk sesi ini, ditunda juga bersama 2 item lain alih-alih dieksekusi sepihak.
3. **Tidak ada kode error kanonik C.2 untuk "payload transport tidak valid"** (ditemukan CL-06/QA-CL-03): saat ini `POST /projects` dan `PATCH /projects/:project_id` memetakan payload invalid (mis. `name` kosong/bukan string) ke `INVALID_STATE` (409) — kode yang secara semantik dimaksudkan untuk konflik state domain, bukan kesalahan format input. Rekomendasi Review: tambah kode baru (mis. `VALIDATION_ERROR`, HTTP 400) ke C.2. Konsekuensi bila dieksekusi: goal 1.3.1 dan 1.3.4 (sudah ✅) perlu disentuh ulang + re-verifikasi QA. Alternatif yang juga valid: tunda ke Phase 6 (04-DELIVERY C.1 sudah eksplisit menaruh "Error handling konsisten (02-SPEC C.2)" di scope Phase 6/Hardening) — tidak mengganggu goal yang sudah closed.
**Catatan:** Ketiga item ini TIDAK memblokir TASK-1.7–1.10 (tidak ada dependency langsung) dan TIDAK mengubah kesimpulan bahwa TASK-1.1–1.6 valid/closed. Direkomendasikan diangkat kembali sebagai keputusan eksplisit sebelum Phase 1 dinyatakan tuntas (masuk subset review Exit Criteria), atau sebelum Phase 4 (untuk item 1, karena permission resolution engine akan membaca D.2 sebagai default) / Phase 6 (untuk item 3).

<a id="qa-cl-12"></a>
### QA-CL-12 — 2026-08-22 · goals 1.3.2, 1.3.3, 1.3.4, 1.4.1, 1.4.2, 1.4.3 🔎 → ✅ — root cause QA-CL-04 ditutup
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca `packages/infrastructure/src/database/project-client.ts` (baru): `resolveProjectDbClient(databaseId, turso)` benar-benar memakai `databaseId` — `file:` passthrough eksplisit untuk lokal, selain itu `getDatabase(turso, databaseId)` (hostname) + `mintDatabaseToken(turso, databaseId)` (JWT per-DB), pola identik `provision.ts`/`migrate-projects.ts` yang sudah terbukti benar (QA-CL-46/QA-CL-30 Phase 0). `createCachedProjectDbClientFactory` cache `Promise<Client>` per `databaseId` dengan eviction saat gagal (retry-able). Interface `ProjectClientFactory.create` diperluas `Client | Promise<Client>` (kompatibel mundur) di `pipeline/database-step.ts`; `ResolveDatabaseStep.run()` sekarang `await` hasilnya. `apps/api/src/index.ts` dikonfirmasi TIDAK lagi mengimpor `createDevProjectClientFromEnv` — wiring produksi sekarang `buildProjectRoutesDeps({..., turso: readTursoEnvFromProcess()})` (`apps/api/src/project-deps.ts`, baru, diekstrak khusus supaya bisa dites tanpa Vercel/network). `grep -rn "createDevProjectClientFromEnv\|TURSO_DB_URL\|TURSO_DB_TOKEN"` di seluruh `apps/api/src`+`packages/infrastructure/src` → kosong total.
**Verifikasi independen (bukan cuma baca ulang klaim CL-24):** re-run `apps/api/test/project-routing.test.ts` — regression test yang memanggil **`buildProjectRoutesDeps` yang sama persis dipakai `index.ts`** dengan **2 Project DB file: nyata terpisah** (bukan mock): 7/7 PASS — pairing nama-per-id benar saat list membaca 2 DB berbeda untuk satu user (membership lintas-ownership), mutasi Project A tidak mengubah file DB Project B dan sebaliknya (cross-project leakage terbukti TIDAK terjadi, invariant #4/BR-007/A.4), unknown project → 404, GET detail via router+deps produksi lengkap membaca DB yang benar, non-owner body-invalid → 403 (bukan 409 — konfirmasi fix urutan authorization QA-CL-06), tanpa identitas → 401. Re-run penuh `pnpm exec vitest run`: 18 file/91 test PASS. `pnpm -r typecheck`/`pnpm lint` bersih. Baca `routes/projects.ts`: `handleLifecycle` dan route `PATCH` sekarang memanggil `openProjectContext`+owner-check SEBELUM `readExpectedVersionField`/`readProjectNameField` (body) — urutan authorization-first (Implementation Rule 3) sudah benar, dikonfirmasi via test `[QA-CL-06][Rule-3]`.
**Catatan:** Mekanisme resolusi remote (`getDatabase`+`mintDatabaseToken`) sendiri adalah kode yang sama dan sudah diverifikasi live terhadap Turso nyata sebelumnya (0.6.1/0.12.2/QA-CL-46) — tidak diulang live di sini karena bukan kode baru, yang baru murni pemakaian argumen `databaseId` yang sekarang benar (dibuktikan test file: 2-DB di atas, kelas bug yang sama persis tidak peduli local/remote karena root cause-nya di level argumen fungsi, bukan transport). Tidak ada perubahan SOT.

<a id="cl-23"></a>
### CL-23 — 2026-08-22 · goals 1.3.2–1.4.3 mulai diperbaiki (⚠️ → 🔄)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: HEAD `b419f80` (QA), working tree bersih; keenam goal tercatat `⚠️/60` dengan QA-CL-04..09. Root cause tunggal dikonfirmasi baca ulang kode: wiring produksi `apps/api/src/index.ts` baris 84 & 91 memakai `{ create: () => createDevProjectClientFromEnv() }` yang mengabaikan argumen `databaseId` dari `ResolveDatabaseStep`/`listProjectSummaries`.
**Catatan:** Fix satu titik sesuai rekomendasi QA-CL-04: factory produksi resolve per-`databaseId` dengan pola `migrate-projects.ts` (`file:` passthrough eksplisit → `getDatabase` hostname + `mintDatabaseToken` JWT per-DB; cache Promise per databaseId agar tidak 2x API call per request). Sekalian dikerjakan dalam perbaikan yang sama: (a) reorder validasi body setelah authorization di PATCH & handleLifecycle (temuan minor QA-CL-06, Implementation Rule 3); (b) regression test yang melewati **wiring produksi** dengan ≥2 Project DB berbeda untuk membuktikan tidak ada cross-project leakage (invariant #4 / BR-007 / A.4); `createDevProjectClientFromEnv` dihapus karena hanya dipakai wiring lama dan env `TURSO_DB_URL`/`TURSO_DB_TOKEN` sudah tidak official.

<a id="cl-24"></a>
### CL-24 — 2026-08-22 · goals 1.3.2–1.4.3 selesai sisi Dev (🔄 → 🔎 · 80%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 18 file / 91 test lulus, termasuk regression baru `apps/api/test/project-routing.test.ts` (7 test) yang melewati **wiring produksi** via `buildProjectRoutesDeps` dengan ≥2 Project DB berbeda: pairing nama per databaseId pada list (member lintas-ownership membaca 2 DB), mutasi via `openProjectContext` hanya menyentuh DB milik Project tsb (tidak ada leakage), projectId tak dikenal → RESOURCE_NOT_FOUND 404, GET detail/PATCH lewat router+deps produksi benar tujuan, non-owner body-invalid → 403 PERMISSION_DENIED (bukan 409 — bukti reorder authorization-first QA-CL-06), tanpa identitas → 401. `pnpm -r typecheck` Done seluruh package; `pnpm lint` bersih.
**Catatan implementasi:** Root cause diperbaiki satu titik: factory produksi kini resolve per-`databaseId` (`resolveProjectDbClient`: `file:` passthrough eksplisit → `getDatabase` hostname + `mintDatabaseToken` JWT per-DB; pola `migrate-projects.ts`) dengan cache Promise per databaseId + evict saat gagal (`createCachedProjectDbClientFactory`). `ProjectClientFactory.create` menerima `Client | Promise<Client>`; `createDevProjectClientFromEnv` dihapus beserta satu-satunya pemakainya. Perakitan deps produksi diekstrak ke `apps/api/src/project-deps.ts` (dipakai index.ts & test). Validasi body PATCH/handleLifecycle dipindah setelah authorization check (temuan minor QA-CL-06). `.env.example` diberi catatan bahwa TURSO_DB_URL/TOKEN hanya untuk skrip POC lama. Catatan terbuka untuk QA: verifikasi live ≥2 database Turso sungguhan tetap disarankan lewat smoke pattern yang ada — jalur `file:` di test ini menguji branch passthrough yang sama dengan factory produksi, sedangkan branch Turso API sudah terverifikasi live oleh smoke provisioning/migrate sebelumnya.

<a id="cl-25"></a>
### CL-25 — 2026-08-22 · goals 1.7.1–1.10.2 mulai dikerjakan sesuai scope (⬜️ → 🔄)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: HEAD `452dd0c`, working tree bersih; scope dikonfirmasi manusia untuk TASK-1.7–1.10 penuh (goal-per-goal sesuai dependency: 1.7.1 → 1.7.2 → 1.7.3 → 1.7.4 → 1.8.1 → 1.8.2 → 1.9.1 → 1.9.2 → 1.10.1 → 1.10.2). Dibaca ulang dari disk: 02-SPEC C.12/C.13, FR-005–011, BR-038–059, D.1–D.4, schema Global DB (global-schema.ts: permission_groups/group_permissions/membership_*_assignments/invitations/invitation_group_assignments), pola transaksi provision.ts, katalog D.1 (id ULID, lookup by key).
**Catatan keputusan teknis interim (dicatat sejak awal, konsisten untuk seluruh scope):** authorization matrix Phase 1 mengikuti pola existing — mutasi Group/assignment/invitation/revoke = Owner-only; read (groups/members) = member aktif (setara View Project, member.read belum terisi D.2 — backlog Review-CL-03 item 1). Scope assignment Phase 1 wajib `scope_type="project"` dengan `scope_id=project_id` (BR-042B catatan revisit Phase 2/3). Revoke yang sudah revoked → idempotent (state dikembalikan apa adanya); revoke Owner Membership → INVALID_STATE 409 (invariant FR-002, bukan persoalan izin pemanggil). Entry ini mencakup transisi awal; tiap goal akan punya CL penyelesaian + commit masing-masing.

<a id="cl-44"></a>
### CL-44 — 2026-08-22 · goal 1.10.2 selesai sisi Dev (🔄 → 🔎 · 80%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 28 file / 144 test lulus, termasuk `apps/api/test/members-revoke.test.ts` 4/4: revoke member → revoked_at ter-set, row membership & assignment group tetap utuh (BR-053, assignment non-applicable via induk); re-revoke idempotent timestamp sama; Owner Membership → 409 INVALID_STATE dan Project tetap punya Owner aktif (FR-002); membership Project lain → 404; caller non-Owner → 403 PERMISSION_DENIED. `pnpm -r typecheck` Done; `pnpm lint` bersih.
**Catatan implementasi:** Seluruh scope Task 1.7–1.9 + 1.10 kini 🔎 80% sisi Dev. AC-020 optimistic locking tidak berlaku pada plane Global DB (tanpa kolom version) — konsisten dengan schema SOT saat ini.

<a id="cl-43"></a>
### CL-43 — 2026-08-22 · goal 1.10.2 mulai dikerjakan (⬜️ → 🔄)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: HEAD `52e45f6` (1.10.1 🔎), working tree bersih, row 1.10.2 `⬜️/0`; dependency 1.2 ✅ + 1.10.1 🔎 80% sisi Dev. Dibaca ulang: C.12 amandemen 2.1.0 (`POST /members/:membership_id/revoke`), BR-053 (data historis utuh), FR-002 (tepat satu Owner).
**Catatan keputusan teknis:** Otorisasi mutasi interim = Owner-only (assertProjectOwner sebelum apa pun). Revoke set `revoked_at` saja — assignment TIDAK disentuh (BR-053). Revoke pada membership yang sudah revoked → idempotent (kembalikan state). Revoke Owner Membership → INVALID_STATE 409. Membership lintas-Project/tak dikenal → RESOURCE_NOT_FOUND.

<a id="cl-42"></a>
### CL-42 — 2026-08-22 · goal 1.10.1 selesai sisi Dev (🔄 → 🔎 · 80%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 27 file / 140 test lulus, termasuk `apps/api/test/members-list.test.ts` 4/4: tanpa `status` mengembalikan keduanya (3 aktif + 1 revoked) dengan email/name ter-join; `?status=active` hanya 3 aktif, `?status=revoked` hanya 1 revoked, `?status=active,revoked` keduanya; nilai tak dikenal → 409 INVALID_STATE; membership revoked ditolak 403 (member.read hanya aktif), member Project A tidak dapat list Project B (403), daftar Project B tidak berisi member A (boundary). `pnpm -r typecheck` Done; `pnpm lint` bersih.
**Catatan implementasi:** Deps interface kini mengekspos `requireActiveMember` eksplisit selain `assertProjectOwner` agar pola authorization-first seragam di semua route.

<a id="cl-41"></a>
### CL-41 — 2026-08-22 · goal 1.10.1 mulai dikerjakan (⬜️ → 🔄)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: HEAD `8c390e5` (TASK-1.9 lengkap sisi Dev), working tree bersih, row 1.10.1 `⬜️/0`; dependency 1.2 ✅ (QA). Dibaca ulang: C.12 amandemen 2.1.0 (GET members), FR-008, matriks otorisasi interim CL-25 (read = active member).
**Catatan keputusan teknis:** Sesuai teks task terkini (amandemen 2.4.0): query param opsional `status` comma-separated subset `active,revoked` membatasi hasil; **tanpa parameter mengembalikan keduanya** (aktif + revoked). Nilai `status` di luar `active,revoked` → INVALID_STATE 409. Otorisasi `requireActiveMember` (member.read). Join users untuk email/name.

<a id="cl-40"></a>
### CL-40 — 2026-08-22 · goal 1.9.2 selesai sisi Dev (🔄 → 🔎 · 80%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 26 file / 136 test lulus, termasuk `apps/api/test/invitations-accept.test.ts` 5/5: accept → membership aktif + group assignment ter-copy + accepted_at ter-set dalam satu transaksi; accept kedua kali → 409 INVITATION_ALREADY_USED; expired → 409 INVITATION_EXPIRED tanpa efek samping membership; revoked → 409 INVALID_STATE; unknown id → 404; pemanggil yang sudah member aktif Project → 409 tanpa duplikasi membership Owner. `pnpm -r typecheck` Done; `pnpm lint` bersih.
**Catatan implementasi:** Perbaikan selama iterasi murni di kode test (arg SQL kurang, setup expiry lampau). Accept tidak memeriksa kecocokan email pemanggil — sesuai teks task, dicatat di CL-39 sebagai potensi [NEEDS-SPEC-AMENDMENT].

<a id="cl-39"></a>
### CL-39 — 2026-08-22 · goal 1.9.2 mulai dikerjakan (⬜️ → 🔄)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: HEAD `2a066e2` (1.9.1 🔎), working tree bersih, row 1.9.2 `⬜️/0`; dependency 1.9.1 🔎 80% sisi Dev (CL-38). Dibaca ulang: C.13 accept endpoint, schema `project_memberships` (unique keras project+user) + `invitation_group_assignments`.
**Catatan keputusan teknis:** Accept memvalidasi state invitation saja sesuai teks task: expired → `INVITATION_EXPIRED` 409; accepted sebelumnya → `INVITATION_ALREADY_USED` 409; revoked → `INVALID_STATE` 409. Tidak ada pengecekan kecocokan email pemanggil di Phase 1 (handle ULID = capability) — dicatat sebagai potensi `[NEEDS-SPEC-AMENDMENT]` bila SOT ingin email-match. Pemanggil harus terautentikasi. User yang masih member aktif Project tsb atau pernah menjadi member (unique keras project+user) → `INVALID_STATE` 409. Seluruh operasi (membership + assignments + accepted_at) dalam satu db.transaction.

<a id="cl-38"></a>
### CL-38 — 2026-08-22 · goal 1.9.1 selesai sisi Dev (🔄 → 🔎 · 80%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 25 file / 131 test lulus, termasuk `apps/api/test/invitations-create.test.ts` 5/5: create 2 assignment → 201 PENDING + default expiry tepat 7 hari (BR-052) + 2 row reference tersimpan (BR-050); tanpa/kosong assignments → 409 (BR-051); group lintas-Project/soft-deleted/tak dikenal → 404 DAN tidak ada invitation sisa (atomicity db.transaction); email invalid/expires_at lampau/bukan-ISO/scope milestone/scope_id salah → 409; non-Owner → 403. `pnpm -r typecheck` Done; `pnpm lint` bersih.
**Catatan implementasi:** Scope absen pada item assignment di-default ke project/project_id di route; validasi boundary tetap di infra. AC-020 optimistic locking tidak berlaku — Global DB tanpa kolom version.

<a id="cl-37"></a>
### CL-37 — 2026-08-22 · goal 1.9.1 mulai dikerjakan (⬜️ → 🔄)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: HEAD `86db5b0` (TASK-1.8 lengkap sisi Dev), working tree bersih, row 1.9.1 `⬜️/0`; dependency 1.6 ✅ + 1.7.1 🔎 80% sisi Dev. Dibaca ulang: C.12 endpoint invitations, BR-050 (Group by reference), BR-051 (≥1 assignment), BR-052 (default expiry 7 hari), schema `invitations` + `invitation_group_assignments` (tanpa kolom token — id ULID menjadi handle unik).
**Catatan keputusan teknis:** Body `{email, assignments[], expires_at?}`; assignment item `{group_id, scope_type?, scope_id?}` — scope absen berarti project/project_id (Phase 1). Insert invitation + group refs dalam satu db.transaction (Implementation Rule 8). expires_at harus ISO valid dan > sekarang. Status PENDING diturunkan dari accepted_at/revoked_at NULL.

<a id="cl-36"></a>
### CL-36 — 2026-08-22 · goal 1.8.2 selesai sisi Dev (🔄 → 🔎 · 80%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 24 file / 126 test lulus, termasuk `apps/api/test/permission-assignments.test.ts` 7/7: card.read tanpa visibility → default CREATED_BY_ME (BR-048); card.read + ALL eksplisit tersimpan; visibility pada board.read/list.read → 409 INVALID_STATE (B.2); duplikat aktif → 409 UNIQUE; scope_type non-project / scope_id salah / permission tak dikenal (404) / membership lintas-Project (404) ditolak; revoke idempotent dengan riwayat utuh + re-assign bebas; non-Owner → 403. `pnpm -r typecheck` Done; `pnpm lint` bersih.
**Catatan implementasi:** Validasi nilai visibility diekstrak ke `parseCardReadVisibility` (nilai di luar enum → INVALID_STATE, bukan dikonversi diam-diam). TASK-1.8 lengkap sisi Dev: 1.8.1–1.8.2 🔎 80%.

<a id="cl-35"></a>
### CL-35 — 2026-08-22 · goal 1.8.2 mulai dikerjakan (⬜️ → 🔄)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: HEAD `82f90f8` (1.8.1 🔎), working tree bersih, row 1.8.2 `⬜️/0`; dependency 1.6 ✅ + 1.7.1 🔎 80% sisi Dev. Dibaca ulang: C.12 direct permission assignment endpoint, schema `membership_permission_assignments` (kolom card_read_visibility nullable; partial unique aktif; scope check).
**Catatan keputusan teknis:** Pola identik 1.8.1: Phase 1 scope_type='project' & scope_id=project_id wajib; visibility hanya boleh pada permission key `card.read` — selain itu INVALID_STATE; tanpa field visibility → default CREATED_BY_ME (BR-048); duplikat aktif → 409 via UNIQUE dipetakan; revoke idempotent; membership revoked → INVALID_STATE.

<a id="cl-34"></a>
### CL-34 — 2026-08-22 · goal 1.8.1 selesai sisi Dev (🔄 → 🔎 · 80%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 23 file / 119 test lulus, termasuk `apps/api/test/group-assignments.test.ts` 7/7: assign project-scope → 201 + row tercatat; duplikat aktif → 409 INVALID_STATE (UNIQUE partial index dipetakan via rantai `cause` Drizzle); membership Project lain via path Project ini → 404; scope_type non-project & scope_id ≠ project_id → 409 (BR-042B Phase 1); group lintas-Project/soft-deleted → 404; revoke set revoked_at, row tetap, re-revoke idempotent timestamp sama, re-assign setelah revoke sukses; non-Owner assign/revoke → 403. `pnpm -r typecheck` Done; `pnpm lint` bersih.
**Catatan implementasi:** Perbaikan selama iterasi: impor tabel `membershipGroupAssignments` yang tertinggal (500 saat insert) dan pemeriksaan UNIQUE melalui `error.cause` Drizzle. AC-020 optimistic locking tidak berlaku — tabel Global DB tanpa kolom version.

<a id="cl-33"></a>
### CL-33 — 2026-08-22 · goal 1.8.1 mulai dikerjakan (⬜️ → 🔄)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: HEAD `aad94da` (TASK-1.7 lengkap sisi Dev), working tree bersih, row 1.8.1 `⬜️/0`; dependency 1.6 ✅ (QA-CL-11) + 1.7.1 🔎 80% sisi Dev (CL-26). Dibaca ulang: C.12 scoped Group assignment endpoint, BR-042 (tepat satu scope), BR-042B (validasi resource dalam Project sama), schema `membership_group_assignments` (partial unique index aktif).
**Catatan keputusan teknis:** Phase 1: `scope_type` wajib `"project"` dan `scope_id` wajib == project_id (selain itu INVALID_STATE 409 — revisit Phase 2/3 per BR-042B); membership lintas-Project / group lintas-Project / group soft-deleted → RESOURCE_NOT_FOUND; membership yang sudah revoked → INVALID_STATE; duplikat assignment aktif ditolak via UNIQUE partial index dipetakan INVALID_STATE 409; revoke idempotent (row tetap, revoked_at pertama dipertahankan).

<a id="cl-32"></a>
### CL-32 — 2026-08-22 · goal 1.7.4 selesai sisi Dev (🔄 → 🔎 · 80%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 22 file / 112 test lulus, termasuk `apps/api/test/permission-groups-delete.test.ts` 5/5: soft-delete 200 + deleted_at ter-set + hilang dari default list & tampil via include_deleted; `membership_group_assignments` aktif tetap 1 row (BR-041 riwayat utuh); non-Owner → 403 dan group tidak jadi terhapus; re-delete → 404 RESOURCE_NOT_FOUND; group milik Project lain via path Project ini → 404 dan tetap utuh; unknown id → 404. `pnpm -r typecheck` Done; `pnpm lint` bersih.
**Catatan implementasi:** `deletePermissionGroup` hanya set deleted_at+updated_at — tidak menyentuh assignment (BR-041). TASK-1.7 lengkap sisi Dev: 1.7.1–1.7.4 🔎 80%.

<a id="cl-31"></a>
### CL-31 — 2026-08-22 · goal 1.7.4 mulai dikerjakan (⬜️ → 🔄)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: HEAD `744a6b1` (1.7.3 🔎), working tree bersih, row 1.7.4 `⬜️/0`; dependency 1.7.1 🔎 80% sisi Dev (CL-26). Dibaca ulang: C.12 amandemen 2.1.0 (`POST /permission-groups/:group_id/delete` soft-delete), BR-041 (member kehilangan permission tanpa hapus riwayat assignment), D.1 key `permission_group.delete`.
**Catatan keputusan teknis:** Delete pada group yang sudah soft-deleted / milik Project lain / tidak ada → RESOURCE_NOT_FOUND 404 (konsisten PATCH 1.7.3). Tidak ada body; authorization-first tetap berlaku.

<a id="cl-30"></a>
### CL-30 — 2026-08-22 · goal 1.7.3 selesai sisi Dev (🔄 → 🔎 · 80%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 21 file / 107 test lulus, termasuk `apps/api/test/permission-groups-update.test.ts` 6/6: rename+description 200 tanpa menyentuh permissions; REPLACE permission set (3 key) terbaca langsung via join sementara `membership_group_assignments` aktif tetap tepat 1 row sebelum/sesudah (BR-040 live reference, AC-020 tidak berlaku — operasi Global DB tanpa version column); non-Owner body-invalid → 403 (authorization first); group milik Project lain via path Project ini → 404 dan state Project B utuh (boundary); soft-deleted → 404; permission tak dikenal/duplikat/field asing/tanpa field → 409. `pnpm -r typecheck` Done; `pnpm lint` bersih.
**Catatan implementasi:** `updatePermissionGroup` transaksional (delete+insert group_permissions + touch updated_at dalam satu db.transaction). PATCH menolak field di luar name/description/permissions (semangat C.15). Optimistic locking belum berlaku pada tabel Global DB authorization plane (tanpa kolom version) — konsisten dengan schema SOT saat ini.

<a id="cl-29"></a>
### CL-29 — 2026-08-22 · goal 1.7.3 mulai dikerjakan (⬜️ → 🔄)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: HEAD `e7255c0` (1.7.2 🔎), working tree bersih, row 1.7.3 `⬜️/0`; dependency 1.7.1 🔎 80% sisi Dev (CL-26) — pola sama dengan CL-21 (dependency Dev-side cukup untuk memulai). Dibaca ulang: C.12 PATCH endpoint, BR-040 (live reference — tidak ada snapshot), C.15 (field terkontrol tidak lewat generic PATCH).
**Catatan keputusan teknis:** Body PATCH menerima `name`/`description`/`permissions` (minimal satu field); `permissions` jika ada berarti REPLACE set penuh (bukan merge) dalam transaksi + `updated_at`. Group yang sudah soft-deleted diperlakukan sebagai tidak ada → RESOURCE_NOT_FOUND; group_id milik Project lain via path Project ini → RESOURCE_NOT_FOUND (boundary, invariant #4).

<a id="cl-28"></a>
### CL-28 — 2026-08-22 · goal 1.7.2 selesai sisi Dev (🔄 → 🔎 · 80%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 20 file / 101 test lulus, termasuk `apps/api/test/permission-groups-create.test.ts` 6/6: create 201 + persisten (list berisi group baru), card.read tanpa visibility → CREATED_BY_ME (BR-048), visibility eksplisit ASSIGNED_TO_ME tersimpan, visibility pada non-card.read → 409 INVALID_STATE (invariant C.12/B.2), non-Owner body-invalid tetap 403 PERMISSION_DENIED (authorization first), permission_id tak dikenal & nama kosong → 409, boundary Project (group tidak bocor ke Project lain). `pnpm -r typecheck` Done; `pnpm lint` bersih.
**Catatan implementasi:** `createPermissionGroup` di infra: validasi referensi katalog (permissions.id) + visibility rule, insert group+group_permissions atomik dalam satu transaksi. Route menegakkan Owner-only via deps.assertProjectOwner SEBELUM parse body. permissions kosong diperbolehkan (group tanpa grant).

<a id="cl-27"></a>
### CL-27 — 2026-08-22 · goal 1.7.2 mulai dikerjakan (⬜️ → 🔄)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: HEAD `8f59c4e` (1.7.1 🔎), dependency 1.5 ✅ (QA-CL-10) + 1.6 ✅ (QA-CL-11). Dibaca ulang: C.12 create endpoint, FR-010/011, BR-039, aturan `card_read_visibility` (C.12: hanya card.read, default CREATED_BY_ME — dirujuk Test sebagai invariant B.2), katalog D.1 (permissions.id ULID, lookup by key).
**Catatan:** Payload permissions memakai `permission_id` merujuk row katalog (bentuk sesuai contoh C.12); id tidak dikenal dipetakan INVALID_STATE 409 (konsisten pemetaan payload existing, backlog Review-CL-03 item 3 tetap terbuka).

<a id="cl-26"></a>
### CL-26 — 2026-08-22 · goal 1.7.1 selesai sisi Dev (🔄 → 🔎 · 80%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 19 file / 95 test lulus, termasuk `apps/api/test/permission-groups-list.test.ts` 4/4: list berisi baseline (Co-Owner/Manager/Contributor) + custom group dengan permissions ter-join (card.read+ALL), soft-deleted exclude default & muncul via include_deleted=true, boundary lintas Project (grup A tidak bocor ke B), non-member → 403 / project tak dikenal → RESOURCE_NOT_FOUND / tanpa identitas → resolve null. Wiring produksi termounting di index.ts (`createProjectAdminRouter`) + named export PATCH Vercel. `pnpm -r typecheck` Done; `pnpm lint` bersih.
**Catatan implementasi:** Modul infra baru `project-admin.ts` (Global DB plane): requireActiveMember/assertProjectOwner/listPermissionGroups. Router admin baru `routes/project-admin.ts` + builder `buildProjectAdminDeps` (pola QA-CL-04: wiring produksi selalu testable). Query param eksplisit: `?include_deleted=true`. Read = member aktif sesuai CL-25.

<a id="qa-cl-11"></a>
### QA-CL-11 — 2026-08-22 · goal 1.6.1 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Cocokkan `baselineGroupPermissionKeys()` langsung ke tabel matrix D.2 baris per baris: Co-Owner = seluruh 40 key (setiap baris matrix ✓ untuk Co-Owner sama dengan Owner) — benar. Manager = `project.read` + M/B/L penuh (Read+CRUD+Restore, matrix ✓ semua) + 7 Card ops (Read/Create/Update/Move/Archive/Delete/Comment, matrix ✓) — TIDAK dapat `project.update`/`member.*`/`permission_group.*`/`api_key.*` (matrix "—" utk Manager di baris-baris itu) — benar. Contributor = `project.read` + M/B/L read-only (matrix "—" utk CRUD) + 7 Card ops sama seperti Manager (matrix ✓ Contributor di baris Card) — benar. Viewer = seluruh key `*.read` (8 key) — cocok literal Test task-level goal ini sendiri ("Viewer hanya `*.read`"). Re-run `packages/infrastructure/test/baseline-groups.test.ts`: 5/5 PASS termasuk rollback atomik (INV-09, wrapper injeksi kegagalan pada `group_permissions`) dan cek eksplisit "tidak ada kolom `role`" (BR-039). Re-run penuh `pnpm exec vitest run`: 17 file/84 test PASS; `pnpm -r typecheck`/`pnpm lint` bersih. Re-run live `test:smoke-provision`/`test:smoke-rollback` (Turso nyata): tidak ada regresi dari transaksi yang lebih berat (seed katalog + 4 group + group_permissions sekaligus).
**Catatan (non-blocking, untuk AI-Planning & Review):** D.2 sendiri **tidak mendefinisikan** siapa yang dapat `card.restore`/`card.comment.update` (baris Card matrix hanya menyebut 6 dari 9 key `card.*`) maupun `member.read`/`permission_group.read`/`api_key.read` untuk grup selain Co-Owner (baris "Manage X" tidak eksplisit memisahkan read vs write). Dev mengimplementasikan literal apa yang tertulis di matrix (CL-22) dan secara jujur mendokumentasikan gap-nya, bukan mengarang — ini konsisten §10 karena baseline group eksplisit "Konfigurable, Bukan Hard-coded" (D.2) dan mudah diubah via amandemen data, bukan kode. Direkomendasikan AI-Planning & Review melengkapi D.2 agar 9 key `card.*` dan 3 key `*.read` (member/pg/api_key) tercakup eksplisit. Tidak ada perubahan SOT oleh QA.

<a id="qa-cl-10"></a>
### QA-CL-10 — 2026-08-22 · goal 1.5.1 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Hitung manual seluruh key D.1 dari `docs/02-SPEC.md` §D.1 (project 2 + milestone 6 + board 6 + list 6 + card 9 + member 4 + permission_group 4 + api_key 3 = 40) — cocok persis `PERMISSION_CATALOG` di `permission-catalog.ts` satu-per-satu (nama key & jumlah). Re-run `packages/infrastructure/test/permission-catalog.test.ts`: 3/3 PASS termasuk idempotency (re-run 2× berturut-turut, `inserted:0`, tidak ada duplikat via `GROUP BY key HAVING n>1`).
**Catatan (non-blocking):** `seedPermissionCatalog` idempotent via lookup-by-key (read-then-insert), bukan `ON CONFLICT`, karena `permissions.key` tidak punya unique index di schema (batas eksplisit goal: "BUKAN migration baru"). Ini aman untuk pola pemakaian saat ini (`migrate-global.ts` dijalankan sekuensial per deploy, tidak concurrent), tapi rawan race condition bila suatu saat dijalankan paralel — dicatat sebagai kandidat amandemen (tambah unique index) untuk AI-Planning & Review, bukan blocker goal ini. Tidak ada perubahan SOT oleh QA.

<a id="qa-cl-09"></a>
### QA-CL-09 — 2026-08-22 · goal 1.4.3 🔎 → ⚠️
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Sama root cause dengan QA-CL-04 — lihat detail lengkap di sana. `POST /projects/:project_id/delete` memakai `handleLifecycle` → `deps.openProjectContext` → wiring produksi `apps/api/src/index.ts` `{ create: () => createDevProjectClientFromEnv() }`. Delete pada Project manapun akan dieksekusi terhadap DB `TURSO_DB_URL` statis, bukan DB Project yang diminta — melanggar langsung Test task-level 1.4 sendiri: *"archive/restore/delete pada Project lain (beda Project boundary) tidak pernah menyentuh Project DB yang salah."* Logic route (owner-only 403, expected_version wajib, dispatch ke `deleteProject`) sudah benar dan diverifikasi via test dengan DI terpisah (`apps/api/test/projects-delete.test.ts`, tidak lewat wiring produksi).
**Catatan:** Fix identik QA-CL-04. Tidak ada perubahan SOT.

<a id="qa-cl-08"></a>
### QA-CL-08 — 2026-08-22 · goal 1.4.2 🔎 → ⚠️
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Sama root cause dengan QA-CL-04. `POST /projects/:project_id/restore` via `handleLifecycle` → `openProjectContext` → factory produksi yang mengabaikan `databaseId`. Restore pada Project manapun akan menyentuh DB `TURSO_DB_URL` statis, bukan DB Project yang diminta.
**Catatan:** Fix identik QA-CL-04. Tidak ada perubahan SOT.

<a id="qa-cl-07"></a>
### QA-CL-07 — 2026-08-22 · goal 1.4.1 🔎 → ⚠️
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Sama root cause dengan QA-CL-04. `POST /projects/:project_id/archive` via `handleLifecycle` → `openProjectContext` → factory produksi yang mengabaikan `databaseId`. Archive pada Project manapun akan menyentuh DB `TURSO_DB_URL` statis, bukan DB Project yang diminta.
**Catatan:** Fix identik QA-CL-04. Tidak ada perubahan SOT.

<a id="qa-cl-06"></a>
### QA-CL-06 — 2026-08-22 · goal 1.3.4 🔎 → ⚠️
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Sama root cause dengan QA-CL-04. `PATCH /projects/:project_id` juga memanggil `deps.openProjectContext` (`routes/projects.ts` baris 193) sebelum `updateProjectName` — kena wiring produksi yang sama, PATCH pada Project manapun akan menulis ke DB `TURSO_DB_URL` statis. **Temuan tambahan (minor, non-blocking):** di route PATCH maupun `handleLifecycle` (dipakai 1.4.1–1.4.3), body (`name`/`expected_version`) divalidasi **sebelum** `openProjectContext` (identity+membership+authorization) dipanggil — urutan terbalik dari AGENTS.md §5 Implementation Rule 3 ("Authorization first. Cek otorisasi sebelum mutation"). Dampak saat ini kecil (tidak membocorkan keberadaan Project/membership, cuma pesan validasi generic `INVALID_STATE`), tapi sebaiknya diperbaiki sekalian: validasi body dipindah setelah authorization check.
**Catatan:** Fix utama identik QA-CL-04; fix minor urutan validasi vs authorization direkomendasikan sekalian dalam perbaikan yang sama. Tidak ada perubahan SOT.

<a id="qa-cl-05"></a>
### QA-CL-05 — 2026-08-22 · goal 1.3.3 🔎 → ⚠️
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Sama root cause dengan QA-CL-04 (lihat detail lengkap di sana) — `GET /projects/:project_id` memakai `deps.openProjectContext` yang di-wire ke factory produksi yang sama. Route/pipeline logic (identity → membership → resolve DB → `getProjectState`) sendiri sudah benar dan cocok CL-10; masalahnya murni di titik akuisisi client Project DB di `index.ts`.
**Catatan:** Fix identik QA-CL-04 — begitu factory produksi diperbaiki untuk resolve per `databaseId`, 1.3.3 seharusnya lolos tanpa perubahan logic lain. Tidak ada perubahan SOT.

<a id="qa-cl-04"></a>
### QA-CL-04 — 2026-08-22 · goal 1.3.2 🔎 → ⚠️ — root cause: Project DB routing rusak di wiring produksi
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** **Temuan invariant-critical (BR-007/A.4, invariant inti #4).** `apps/api/src/index.ts` (handler produksi, di-export sebagai `GET`/`POST` Vercel) mewiring `ProjectClientFactory` untuk `listProjects` (baris 84) dan `openProjectContext` (baris 91) sebagai `{ create: () => createDevProjectClientFromEnv() }` — fungsi arrow **tanpa parameter**, sehingga argumen `databaseId` yang dikirim `ResolveDatabaseStep`/`listProjectSummaries` (`this.clientFactory.create(mapping.databaseId)`, `clientFactory.create(mapping.databaseId)` — dikonfirmasi baca `pipeline/database-step.ts` & `database/project-list.ts`) **selalu diabaikan**. `createDevProjectClientFromEnv()` (`database/factory.ts`) selalu connect ke satu koneksi statis dari env `TURSO_DB_URL`/`TURSO_DB_TOKEN` — env var yang sama yang sejak sesi infra sebelumnya (2026-08-21) sudah tidak official dipakai untuk apa pun (POC lama, `default` group yang sudah dihapus). Akibat konkret: begitu ada **lebih dari satu** Project nyata (hasil `POST /projects` yang masing-masing memang mem-provision Turso DB terpisah, terverifikasi benar di QA-CL-03), `GET /projects` (list), `GET /projects/:id` (detail), `PATCH`, dan `archive/restore/delete` — SEMUANYA akan connect ke DB yang salah untuk Project manapun kecuali (kebetulan) yang cocok dengan `TURSO_DB_URL` saat itu. Ini pelanggaran langsung Test task-level 1.3 sendiri: *"list hanya mengembalikan Project dengan membership aktif User (tidak bocor Project lain — Project-boundary check)"* — cek ini tidak mungkin lulus dengan wiring saat ini begitu >1 Project nyata ada.
**Catatan:** CL-08 mencatat ini sebagai "catatan teknis, bukan perubahan kontrak" dan CL-10 menyebutnya "penamaan field" — QA menilai ini **bukan** keputusan teknis murni yang aman ditunda (AGENTS.md §10): ini gap fungsional pada mekanisme isolasi Project (invariant #4), bukan sekadar detail implementasi reversibel. Test suite lolos karena `ProjectRoutesDeps` (khususnya `openProjectContext`/`listProjects`) di-inject dengan test double di setiap file test (`apps/api/test/*.test.ts`) — production wiring `index.ts` tidak pernah dilewati test manapun sejauh ini, jadi bug ini tidak akan pernah tertangkap oleh test yang ada. **Rekomendasi perbaikan konkret:** ganti `ProjectClientFactory` produksi agar benar-benar memakai `databaseId` — resolve hostname via `getDatabase(turso, databaseId)` + mint JWT per-DB via `mintDatabaseToken(turso, databaseId)` (pola identik yang sudah benar di `provision.ts`/`migrate-projects.ts`), bukan koneksi statis dari env. `createDevProjectClientFromEnv` boleh dipertahankan sebagai fallback eksplisit hanya utk mode lokal/`file:` (dicek prefiks, pola sama `migrate-projects.ts`), bukan default diam-diam di produksi. Setelah fix, **re-verifikasi dengan ≥2 Project DB berbeda sungguhan** (bukan cuma 1) untuk membuktikan tidak ada cross-project leakage — ini persis kelas bug yang butuh reproduksi live, bukan cuma pembacaan kode (AGENTS.md §11.3.4). Tidak ada perubahan SOT.

<a id="qa-cl-03"></a>
### QA-CL-03 — 2026-08-22 · goal 1.3.1 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca `routes/projects.ts` `POST /v1/projects` + `index.ts` wiring: `createProject` memanggil `provisionProjectWithMapping` (1.2, sudah ✅) langsung — TIDAK melalui `createDevProjectClientFromEnv`/`openProjectContext` yang bermasalah (QA-CL-04), karena create belum butuh resolve DB existing. Re-run `pnpm exec vitest run apps/api/test/projects-create.test.ts`: 5/5 PASS (positif end-to-end registry READY+Owner Membership+project_state ACTIVE+Activity; negatif tanpa identitas 401, payload invalid ×5 → 409 INVALID_STATE tanpa provisioning terpanggil, provisioning gagal → 500).
**Catatan:** Kode INVALID_STATE untuk payload invalid (bukan kode khusus "BAD_REQUEST" yang memang tidak ada di 12 kode kanonik C.2) sudah benar ditandai Dev sebagai kandidat `[NEEDS-SPEC-AMENDMENT]` ringan untuk AI-Planning & Review — tidak menghalangi ✅ goal ini karena bukan pelanggaran SOT, hanya observasi cakupan kode error. Idempotency-Key dibaca tapi tanpa dedupe store — sesuai batas eksplisit goal (dicatat, bukan blocker). Tidak ada perubahan SOT oleh QA.

<a id="qa-cl-02"></a>
### QA-CL-02 — 2026-08-22 · goal 1.2.1 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca `provision.ts`: `registerProjectWithOwnerMembership` insert `projects`+`project_databases`+`project_memberships` (Owner, `revokedAt:null`) dalam satu `db.transaction` — atomik. Re-run `pnpm exec vitest run packages/infrastructure/test/provision-owner-membership.test.ts`: 4/4 PASS termasuk uji rollback mid-tx via client wrapper injeksi kegagalan (tidak ada Project/mapping/membership yatim) dan FK owner tak dikenal ditolak (dikonfirmasi `@libsql/client` default `PRAGMA foreign_keys=1` — FK riil ditegakkan, bukan simulasi). Re-run live `test:smoke-rollback` (Turso nyata, pasca ekstensi asersi membership Dev): 10/10 PASS termasuk 3 asersi baru "tidak ada membership yatim" skenario A/B/C. Re-run `test:smoke-provision`/`test:smoke-global-mapping` live: tidak ada regresi.
**Catatan:** Tidak ada perubahan SOT.

<a id="qa-cl-01"></a>
### QA-CL-01 — 2026-08-22 · goal 1.1.1 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca `project-lifecycle.ts`: `resolveProjectLifecycle` cek `deletedAt` sebelum `archivedAt` (BR-011 priority) benar. Baca `DrizzleProjectRepository.commitMutation`: version check SEBELUM validasi transisi state (urutan A.6), `LIFECYCLE_ALLOWED_FROM` cocok state machine A.3 persis (update/archive dari ACTIVE saja — INV-LIFE-003; restore dari ARCHIVED saja; delete dari ACTIVE/ARCHIVED, DELETED terminal — INV-LIFE-004), seluruh mutation+Activity dalam satu `runInWriteTransaction` (invariant #6/#8/#9). Re-run `pnpm exec vitest run packages/infrastructure/test/project-lifecycle-commands.test.ts`: 19/19 PASS — termasuk `it.each` optimistic-locking utk keempat command yang eksplisit assert `after toEqual(before)` DAN `activityCount() toBe(0)` pada version conflict (AC-020, bukan cuma expect-throw). Re-run `pnpm exec vitest run` penuh: 76/76 PASS (15 file); `pnpm -r typecheck`/`pnpm lint` bersih seluruh workspace.
**Catatan:** Test pakai `createTestProjectDb()` (DB lokal nyata via `runInWriteTransaction`, bukan mock) — atomicity teruji sungguhan, bukan diasumsikan. Tidak ada perubahan SOT.

<a id="cl-22"></a>
### CL-22 — 2026-08-22 · goal 1.6.1 selesai sisi Dev (🔄 → 🔎 · 80%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm vitest run` → 17 file / 84 test lulus, termasuk `packages/infrastructure/test/baseline-groups.test.ts` 5/5: tepat 4 group baseline project-scoped tanpa group "Owner"; set `group_permissions` per grup persis sama dengan `baselineGroupPermissionKeys()` (Co-Owner=40 semua; Manager=project.read + M/B/L penuh + card.read/create/update/move/archive/delete/comment tanpa card.restore/project.update/member.invite/api_key.create; Contributor=read + 6 card-op; Viewer=hanya *.read); visibility NULL mengikuti default D.3 (CREATED_BY_ME); rollback atomik INV-09 (kegagalan insert group_permissions menyisakan nol row yatim); provisioning kedua tidak menduplikasi katalog. Fixture test 1.2.1 disesuaikan (tabel group_permissions+permission_groups masuk cleanup afterEach). Lint bersih, typecheck lulus.
**Catatan keputusan literal-matrix (data, bukan hard-code):** Manager TIDAK mendapat card.restore & card.comment.update (matrix Card hanya menulis Create/Update/Move/Archive/Delete/Comment) dan TIDAK mendapat member/pg/api_key .read (matrix tidak mencantumkan); Viewer mendapat seluruh *.read termasuk api_key.read sesuai bullet Test goal. Jika Planning ingin pola paralel M/B/L (card.restore untuk Manager+) itu perubahan data baseline via amandemen — mudah diubah karena murni konfigurasi.

<a id="cl-21"></a>
### CL-21 — 2026-08-22 · goal 1.6.1 mulai dikerjakan (⬜️ → 🔄)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 1.6.1 `⬜️/0`, dependency 1.2 ✅ sisi Dev (CL-04) + 1.5 🔎 80% sisi Dev (CL-20); HEAD `e3933f9`, working tree bersih. Dibaca ulang: D.2 matrix, BR-035/BR-036/BR-039, schema `permission_groups`+`group_permissions` (unique group_id+permission_id; visibility enum).
**Catatan:** Baseline group disisipkan DI DALAM transaksi `registerProjectWithOwnerMembership` yang sama (atomik dengan registry). Mapping matrix D.2 → set key per grup didokumentasikan eksplisit di modul sebagai data; keputusan literal-matrix dicatat di CL-22.

<a id="cl-20"></a>
### CL-20 — 2026-08-22 · goal 1.5.1 selesai sisi Dev (🔄 → 🔎 · 80%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm vitest run` → 16 file / 79 test lulus, termasuk `packages/infrastructure/test/permission-catalog.test.ts` 3/3: katalog 40 key D.1 tanpa duplikat + deskripsi; seed pertama mengisi tepat satu row per key (set key = set row DB); re-run dua kali idempotent (inserted=0, COUNT tetap 40, GROUP BY key HAVING n>1 kosong). Lint bersih, typecheck lulus.
**Catatan:** Idempotency via lookup-by-key karena schema `permissions` tidak punya unique index pada `key` (batas "bukan migration baru"); jika Planning ingin unique index, itu amandemen terpisah. Seed dipanggil dari `scripts/migrate-global.ts`.

<a id="cl-19"></a>
### CL-19 — 2026-08-22 · goal 1.5.1 mulai dikerjakan (⬜️ → 🔄)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 1.5.1 `⬜️/0`, dependency —; HEAD `aa4da72`, working tree bersih. Dibaca ulang: 02-SPEC D.1 (40 key kanonik), schema `permissions` Global DB (id PK, key notNull, TANPA unique index pada key → idempotency ditegakkan di level aplikasi via lookup-by-key, bukan ON CONFLICT).
**Catatan:** Modul seed terpisah `packages/infrastructure/src/database/permission-catalog.ts` + dipanggil dari `scripts/migrate-global.ts` setelah migrasi. Tanpa migration schema baru sesuai batas goal.

<a id="cl-18"></a>
### CL-18 — 2026-08-22 · goal 1.4.3 selesai sisi Dev (🔄 → 🔎 · 80%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm vitest run` → 15 file / 76 test lulus, termasuk `apps/api/test/projects-delete.test.ts` 4/4: positif A.3 delete dari ACTIVE + deleted_at terisi + Activity project.deleted; negatif INV-LIFE-004 restore setelah DELETED → INVALID_STATE (terminal); negatif AC-020 stale version → VERSION_CONFLICT tanpa perubahan; negatif authz/auth/delete-ulang. Lint bersih, typecheck lulus.
**Catatan:** Delete bersifat soft (deleted_at) — penghapusan fisik DB Turso bukan bagian MVP (§2.2 non-MVP). Seluruh goal TASK-1.3 dan TASK-1.4 kini 🔎 80% menunggu verifikasi QA.

<a id="cl-17"></a>
### CL-17 — 2026-08-22 · goal 1.4.3 mulai dikerjakan (⬜️ → 🔄)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 1.4.3 `⬜️/0`, dependency 1.1 ✅ sisi Dev (CL-02) + 1.3.3 ✅ sisi Dev (CL-10); HEAD `890d03d`, working tree bersih.
**Catatan:** Delete terminal (INV-LIFE-004): setelah DELETED, restore ditolak domain; delete dari ACTIVE maupun ARCHIVED diizinkan (A.3). Fisik DB Turso tidak dihapus pada MVP — soft-delete via deleted_at sesuai implementasi 1.1.

<a id="cl-16"></a>
### CL-16 — 2026-08-22 · goal 1.4.2 selesai sisi Dev (🔄 → 🔎 · 80%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm vitest run` → 14 file / 72 test lulus, termasuk `apps/api/test/projects-restore.test.ts` 4/4: negatif restore dari ACTIVE → INVALID_STATE (INV-LIFE-002); positif restore ARCHIVED→ACTIVE + archived_at kembali null + Activity project.restored previous_state ARCHIVED (B.5); negatif AC-020 stale version → VERSION_CONFLICT; negatif authz/auth/payload. Lint bersih, typecheck lulus.
**Catatan:** Endpoint memakai helper `handleLifecycle`; aturan transisi ditolakkan oleh domain command, bukan duplikasi di transport.

<a id="cl-15"></a>
### CL-15 — 2026-08-22 · goal 1.4.2 mulai dikerjakan (⬜️ → 🔄)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 1.4.2 `⬜️/0`, dependency 1.1 ✅ sisi Dev (CL-02) + 1.3.3 ✅ sisi Dev (CL-10); HEAD `36ff9ea`, working tree bersih.
**Catatan:** Memakai helper `handleLifecycle` dari 1.4.1; restore hanya valid dari ARCHIVED ditolakkan oleh domain (INVALID_STATE) — endpoint tinggal meneruskan.

<a id="cl-14"></a>
### CL-14 — 2026-08-22 · goal 1.4.1 selesai sisi Dev (🔄 → 🔎 · 80%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm vitest run` → 13 file / 68 test lulus, termasuk `apps/api/test/projects-archive.test.ts` 5/5: positif A.3 archive ACTIVE→ARCHIVED + Activity project.archived berisi previous_state (B.5); negatif authz non-owner → PERMISSION_DENIED; negatif AC-020 stale version → VERSION_CONFLICT tanpa perubahan state; negatif A.3 archive ARCHIVED → INVALID_STATE; negatif payload/auth. Lint bersih, typecheck lulus.
**Catatan:** Helper bersama `handleLifecycle` di route layer (validasi body, Owner-only interim, eksekusi command domain) — dipakai ulang restore/delete pada 1.4.2/1.4.3.

<a id="cl-13"></a>
### CL-13 — 2026-08-22 · goal 1.4.1 mulai dikerjakan (⬜️ → 🔄)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 1.4.1 `⬜️/0`, dependency 1.1 ✅ sisi Dev (CL-02) + 1.3.3 ✅ sisi Dev (CL-10); HEAD `3e0f59e`, working tree bersih.
**Catatan:** Tiga endpoint lifecycle (archive/restore/delete) berpola identik: POST + body `{expected_version}` + Owner-only interim → command domain. Dikerjakan berurutan per goal dengan commit terpisah; helper `runLifecycleCommand` dibagikan di route layer.

<a id="cl-12"></a>
### CL-12 — 2026-08-22 · goal 1.3.4 selesai sisi Dev (🔄 → 🔎 · 80%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm vitest run` → 12 file / 63 test lulus, termasuk `apps/api/test/projects-patch.test.ts` 5/5: positif BR-035 owner rename → version+1 + Activity project.updated; negatif authz member non-owner → PERMISSION_DENIED 403; negatif optimistic locking AC-020/INV-07 stale expected_version → VERSION_CONFLICT 409 dan state tidak berubah; negatif payload C.15/C.2 ×4 → INVALID_STATE; negatif tanpa identitas → TOKEN_EXPIRED. Lint bersih, typecheck lulus.
**Catatan:** Otorisasi interim: bandingkan `ctx.project.ownerUserId` vs `identity.userId` sebelum mutation — Phase 4 wajib ganti dengan permission resolver sungguhan (catatan eksplisit di kode route). PATCH hanya menerima `name` + `expected_version`; field lain diabaikan/ditolak via validator ketat.

<a id="cl-11"></a>
### CL-11 — 2026-08-22 · goal 1.3.4 mulai dikerjakan (⬜️ → 🔄)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 1.3.4 `⬜️/0`, dependency 1.1 ✅ sisi Dev (CL-02) + 1.3.3 ✅ sisi Dev (CL-10); HEAD `8602664`, working tree bersih.
**Catatan:** Otorisasi Owner-only interim dievaluasi dari `projects.owner_user_id` (registry Global, sudah termuat di ctx pipeline) — Phase 1 belum punya role engine; catatan eksplisit agar Phase 4 mengganti dengan permission sungguhan. Body: `{name, expected_version}`; VERSION_CONFLICT/INVALID_STATE diteruskan apa adanya dari domain.

<a id="cl-10"></a>
### CL-10 — 2026-08-22 · goal 1.3.3 selesai sisi Dev (🔄 → 🔎 · 80%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm vitest run` → 11 file / 58 test lulus, termasuk `apps/api/test/projects-detail.test.ts` 4/4: positif member baca detail via RequestPipeline asli + `getProjectState`, negatif non-member → PROJECT_ACCESS_DENIED 403 tanpa data terungkap, negatif registry tak dikenal → RESOURCE_NOT_FOUND 404, negatif tanpa identitas → TOKEN_EXPIRED 401. `pnpm lint` bersih; `pnpm typecheck` lulus.
**Catatan:** Route GET `/v1/projects/:project_id` memakai `openProjectContext(request, projectId)` yang di-wire ke `RequestPipeline` penuh (identity → project+membership → resolve DB). Response `{data:{project:{id,name,createdAt,updatedAt,archivedAt,deletedAt,version}}}` — penamaan field camelCase konsisten kodebase; C.4 tidak mengunci nama field detail.

<a id="cl-09"></a>
### CL-09 — 2026-08-22 · goal 1.3.3 mulai dikerjakan (⬜️ → 🔄)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 1.3.3 `⬜️/0`, dependency 1.1 ✅ sisi Dev (CL-02); HEAD `0df3743`, working tree bersih. Goal memandu memakai `RequestPipeline` penuh (identity+membership+resolve DB) lalu `getProjectState`.
**Catatan:** Deps route diperluas dengan `openProjectContext(request, projectId)` yang membungkus RequestPipeline; wiring dev menyusun pipeline dari komponen Phase 0. Response `{data:{project:{...state}}}`; project tanpa `project_state` → RESOURCE_NOT_FOUND 404.

<a id="cl-08"></a>
### CL-08 — 2026-08-22 · goal 1.3.2 selesai sisi Dev (🔄 → 🔎 · 80%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm vitest run` → 10 file / 54 test lulus, termasuk `apps/api/test/projects-list.test.ts` 3/3: positif list 2 project user-a dengan status ringkas benar (ACTIVE + ARCHIVED via command archive asli), negatif boundary INV-04 (project user-b tidak bocor; membership revoked di-exclude, diverifikasi ulang langsung ke `deps.listProjects`), negatif auth 401 TOKEN_EXPIRED. `pnpm lint` bersih; `pnpm typecheck` lulus.
**Catatan:** Implementasi: `listActiveMemberships` di `global-reads.ts`; orkestrasi `listProjectSummaries` di `packages/infrastructure/src/database/project-list.ts` (membership Global → resolve mapping → baca `project_state` per Project DB, tanpa transaksi lintas-DB sesuai A.4; state hilang → RESOURCE_NOT_FOUND). Wiring dev: factory Project DB memakai `createDevProjectClientFromEnv` (TURSO_DB_URL/TURSO_DB_TOKEN) — akuisisi kredensial per-database (mint token) menyusul saat dibutuhkan deployment; catatan teknis, bukan perubahan kontrak.

<a id="cl-07"></a>
### CL-07 — 2026-08-22 · goal 1.3.2 mulai dikerjakan (⬜️ → 🔄)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 1.3.2 `⬜️/0`, dependency 1.2 ✅ sisi Dev (CL-04); HEAD `9020380`, working tree bersih. Reference C.4 + 03-ENG A.4 dibaca ulang: list = Global DB (membership aktif) lalu baca ringkas per Project DB tanpa transaksi lintas-DB.
**Catatan:** Query membership aktif baru (`listActiveMemberships`) akan ditambahkan di `global-reads.ts`; baca ringkas per-Project DB berurutan tanpa transaksi lintas-DB. Kegagalan baca satu Project DB menggagalkan request (500 INVALID_STATE) — tidak ada bentuk response "partial" di C.4, jadi tidak diarang.

<a id="cl-06"></a>
### CL-06 — 2026-08-22 · goal 1.3.1 selesai sisi Dev (🔄 → 🔎 · 80%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm vitest run` → 9 file / 51 test lulus, termasuk `apps/api/test/projects-create.test.ts` 5/5 (positif: create end-to-end registry READY + Owner Membership + project_state ACTIVE + Activity project.created; negatif: tanpa identitas → 401 TOKEN_EXPIRED, payload invalid ×5 → 409 INVALID_STATE tanpa provisioning, provisioning gagal → 500 envelope). `pnpm lint` bersih; `pnpm typecheck` lulus semua paket.
**Catatan:** Implementasi: `apps/api/src/routes/projects.ts` (router injectable: resolveIdentity/newProjectId/createProject), wiring lazy di `apps/api/src/index.ts` via `provisionProjectWithMapping` (owner = creator sesuai keputusan 1.2.1), `newProjectId()` ULID diekspor dari infrastructure, vitest include diperluas ke `apps/*/test`. Keputusan teknis tercatat: (a) response 201 `{data:{id,name,status:"ACTIVE",version:1}}` — status ACTIVE konstanta karena create baru; (b) validasi transport name non-string/kosong/>255 memakai kode kanonik INVALID_STATE 409 (tidak ada kode BAD_REQUEST di C.2 — kandidat catatan untuk Planning); (c) Idempotency-Key dibaca tapi belum ada dedupe store (sesuai batas goal); (d) runtime Project DB client factory menyusul saat endpoint per-Project (1.3.2–1.4.3) — POST create tidak butuh.

<a id="cl-05"></a>
### CL-05 — 2026-08-22 · goal 1.3.1 mulai dikerjakan (⬜️ → 🔄)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 1.3.1 `⬜️/0`, dependency 1.1 ✅ sisi Dev (CL-02) + 1.2 ✅ sisi Dev (CL-04); HEAD `a4945ae`. Kode transport dibaca: `apps/api/src/index.ts` (Hono basePath `/api`, pola lazy `ensure()`), pipeline steps, `contracts/http-mapping.ts` (`extractIdempotencyKey`, `toErrorResponse`, `CODE_TO_HTTP`), 02-SPEC C.2/C.3/C.4.
**Catatan:** Rencana: route factory injectable di `apps/api/src/routes/projects.ts` agar test integration offline memakai file DB + fake provisioner; vitest include diperluas ke `apps/*/test/**/*.test.ts` (keputusan teknis). Idempotency minimal sesuai goal: header dibaca; tanpa dedupe store (catatan terbuka).

<a id="cl-04"></a>
### CL-04 — 2026-08-22 · goal 1.2.1 selesai sisi Dev (🔄 → 🔎 · 80%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run packages/infrastructure/test/provision-owner-membership.test.ts` → 4/4 lulus; `pnpm exec vitest run` → 46/46 lulus (8 file); `pnpm lint` bersih; `pnpm typecheck` bersih. Implementasi: transaksi Global DB `provisionProjectWithMapping` diekstrak ke `registerProjectWithOwnerMembership` dan diperluas insert `project_memberships` (Owner, `revoked_at NULL`) atomik dengan `projects`+`project_databases`. Test: FR-002 (tepat 1 membership aktif Owner), rollback mid-tx via wrapper client (tidak ada Project/mapping/membership yatim), duplikat projectId ditolak tanpa membership ekstra, FK owner tidak dikenal ditolak tanpa row yatim. `smoke-rollback.ts` diperluas asersi orphan-membership utk skenario A/C/B.
**Catatan:** Keputusan teknis tercatat di CL-03: membership Owner memakai `ownerUserId` agar konsisten registry FR-002 (`creatorUserId == ownerUserId` pada seluruh call site). Full-path provisioning tetap diverifikasi smoke script env-gated (`test:smoke-rollback`) karena butuh kredensial Turso nyata.

<a id="cl-03"></a>
### CL-03 — 2026-08-22 · goal 1.2.1 mulai dikerjakan (⬜️ → 🔄)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 1.2.1 `⬜️/0`, dependency `—`; HEAD `e5c27e0` (goal 1.1.1 selesai sisi Dev). Reference dibaca: 02-SPEC B.1 FR-001/FR-002, 03-ENG B.2 (schema Global DB, `project_memberships` UNIQUE(project_id,user_id)); kode `provision.ts`, `turso.ts`, `global-store.ts`, smoke script terkait dibaca.
**Catatan:** Rencana: insert membership Owner dalam transaksi Global yang sama dengan projects+project_databases; test vitest offline via helper registrasi + wrapper client untuk injeksi kegagalan mid-tx; asersi orphan-membership ditambahkan ke smoke-rollback. Keputusan teknis: membership Owner memakai `ownerUserId` (konsisten registry `projects.owner_user_id`, FR-002) — di seluruh call site existing `creatorUserId == ownerUserId`.

<a id="cl-02"></a>
### CL-02 — 2026-08-22 · goal 1.1.1 selesai sisi Dev (🔄 → 🔎 · 80%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run packages/infrastructure/test/project-lifecycle-commands.test.ts` → 19/19 lulus; `pnpm exec vitest run` → 42/42 lulus (7 file, tanpa regresi); `pnpm lint` bersih; `pnpm typecheck` bersih seluruh workspace. Implementasi: `packages/domain/src/project/project-lifecycle.ts` (helper `resolveProjectLifecycle` BR-011/012 + error `RESOURCE_NOT_FOUND`/`VERSION_CONFLICT`/`INVALID_STATE`), interface `ProjectRepository` + implementasi `DrizzleProjectRepository` untuk `updateProjectName`/`archiveProject`/`restoreProject`/`deleteProject` — tiap command: load state dalam tx, version check (BR-021) sebelum validasi transisi (urutan A.6), mutation+Activity atomik via `runInWriteTransaction`, payload B.5 (`changes.name` utk updated, `previous_state` utk archived/restored/deleted). Test mencakup positif & negatif: AC-020 (version conflict tanpa side-effect utk keempat command), BR-022 stale writer, INV-LIFE-003 (update pada ARCHIVED), INV-LIFE-004 (archive/restore/delete pada DELETED ditolak), A.3 (delete dari ARCHIVED diizinkan), RESOURCE_NOT_FOUND.
**Catatan:** Atomicity mutation+Activity terjamin struktural via satu `runInWriteTransaction` per command + rollback test existing (`transaction.test.ts`). DoD terpenuhi; siap QA.

<a id="cl-01"></a>
### CL-01 — 2026-08-22 · goal 1.1.1 mulai dikerjakan (⬜️ → 🔄)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Discovery dari disk: row 1.1.1 terbaca `⬜️/0`, dependency `—`; `git status` clean di branch `stag`, HEAD `9ebcd02`. Baseline SOT 2.1.0 dibaca: AGENTS.md penuh, PHASE-1-TASKS.md penuh, 01-PRODUCT §0+§2.2, 02-SPEC A.3/A.7/A.8/A.16 + BR-011–013 + BR-019–028, 03-ENG A.4–A.7 + B.5, 04-DELIVERY C.3–C.4; kode existing `packages/domain/src/project/project-repository.ts`, `packages/infrastructure/src/database/{project-repository,transaction}.ts`, dan helper test dibaca.
**Catatan:** Scope dikonfirmasi manusia untuk sesi ini: TASK-1.1 → TASK-1.4 berurutan goal-per-goal.

<a id="review-cl-02"></a>
### Review-CL-02 — 2026-08-21 · amandemen 02-SPEC C.12 (2.0.8 → 2.1.0), buka goal 1.7.4/1.10.1/1.10.2
**Role:** AI-Planning & Review · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Review-CL-01 menemukan 2 gap kontrak API (delete Permission Group; list/revoke Membership) saat generate task Phase 1. Direkomendasikan ke manusia dengan path konkret; manusia menyetujui kedua rekomendasi tanpa perubahan (2026-08-21). Amandemen diterapkan: `docs/02-SPEC.md` C.12 menambah `GET /projects/:project_id/members`, `POST /projects/:project_id/members/:membership_id/revoke`, `POST /projects/:project_id/permission-groups/:group_id/delete` + prosa efek masing-masing (soft-delete Group / revoke Membership tanpa hapus riwayat). `docs/01-PRODUCT.md` §0.4: `SPEC_VERSION` 2.0.8 → **2.1.0** (minor — penambahan kapabilitas backward-compatible) + entry changelog 2.1.0. Goal 1.7.4 (⏸️→⬜️) dan 1.10.1/1.10.2 (baru, ⬜️) dibuka di file task ini pada commit yang sama dengan amandemen SOT.
**Catatan:** Tidak ada perubahan pada business invariant (§4 AGENTS.md), formula otorisasi (A.10), atau lifecycle. Penambahan murni menutup gap "kapabilitas tersirat BR/D.1 tanpa path HTTP", konsisten dengan pola domain-command (`POST .../delete`) yang sudah dipakai di seluruh Part C lainnya.

<a id="review-cl-01"></a>
### Review-CL-01 — 2026-08-21 · generate task list Phase 1 (tanpa perubahan status implementasi)
**Role:** AI-Planning & Review · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca penuh `02-SPEC.md` (Part A seluruhnya, Part B seluruhnya, Part C seluruhnya, Part D) dan `03-ENGINEERING.md` Part A (A.1–A.14) + Part B (B.1–B.7) + Part E. Periksa state repo aktual: `packages/domain/src/project/project-repository.ts`, `packages/infrastructure/src/{database,provisioning,pipeline,auth}/*.ts`, `packages/contracts/src/*.ts`, `apps/api/src/index.ts` — dikonfirmasi schema Global/Project DB (0.4/0.5) sudah lengkap untuk seluruh tabel Phase 1, tidak perlu migration baru. Ditemukan 2 gap kontrak API (delete Permission Group, list/revoke Membership) yang ditandai `[NEEDS-SPEC-AMENDMENT]` alih-alih diimplementasikan diam-diam, sesuai C.6.3/C.6.5.
**Catatan:** Task list ini ditampilkan untuk direview manusia sebelum implementasi dimulai (04-DELIVERY C.6.6). Tidak ada perubahan SOT dalam sesi ini. Prinsip interim authorization Phase 1 (Owner-only bypass, permission engine tetap seam kosong sampai Phase 4) dicatat eksplisit di header file agar Dev tidak mengarang enforcement Group-based sebelum waktunya.

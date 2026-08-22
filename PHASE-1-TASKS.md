# Phase 1 — Project · Task & Goal Breakdown

> Generated per [04-DELIVERY C.6](docs/04-DELIVERY.md). SOT version: 2.1.0.
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
| 1.1.1 | 🔎 | [CL-01](#cl-01)<br>[CL-02](#cl-02) | 80 | P0 | Perluas `ProjectRepository` (`packages/domain/src/project/project-repository.ts`) dan `DrizzleProjectRepository` (`packages/infrastructure/src/database/project-repository.ts`) dengan command `updateProjectName`, `archiveProject`, `restoreProject`, `deleteProject` — tiap command menerima `expectedVersion`, memvalidasi state saat ini (BR-011/012, INV-LIFE-003/004), menolak dengan konflik jika version tidak cocok (tanpa perubahan state/Activity), dan menulis mutation `project_state` + Activity (`project.updated`/`project.archived`/`project.restored`/`project.deleted`) atomik dalam satu `runInWriteTransaction` (`packages/infrastructure/src/database/transaction.ts`) pada Project DB yang sama | [02-SPEC A.3](docs/02-SPEC.md), [A.7](docs/02-SPEC.md), [A.8](docs/02-SPEC.md), BR-011–013, BR-019–028; [03-ENG A.6](docs/03-ENGINEERING.md) | — |

**Test:** Unit — update/archive/restore/delete commit version+timestamp+Activity benar; `expected_version` salah → `VERSION_CONFLICT`, tidak ada perubahan state, tidak ada Activity baru (AC-020 pattern); restore ditolak jika current state DELETED (INV-LIFE-004); archive ditolak jika current state DELETED; delete dari ARCHIVED diizinkan (state machine A.3).
**DoD:** Seluruh 4 command atomik (mutation+Activity 1 transaksi Project DB); tidak ada command yang bypass version check; Activity payload ikut konvensi B.5 (`changes`/`previous_state`).

---

## TASK-1.2 — Owner Membership otomatis pada provisioning  (dep: 1.1 tidak wajib, independen)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 1.2.1 | 🔎 | [CL-03](#cl-03)<br>[CL-04](#cl-04) | 80 | P0 | Tambahkan insert `project_memberships` (Owner = `creatorUserId`) ke dalam transaksi Global DB yang sama dengan `registerProject`/`recordProjectDatabaseMapping` di `provisionProjectWithMapping` (`packages/infrastructure/src/provisioning/provision.ts`), sehingga setiap Project baru selalu punya tepat satu Membership aktif untuk Owner sejak commit pertama | [02-SPEC B.1](docs/02-SPEC.md) FR-001, FR-002; [03-ENG B.2](docs/03-ENGINEERING.md) | — |

**Test:** Integration — create Project → tepat 1 row `project_memberships` untuk `creatorUserId`, `revoked_at IS NULL`; simulasi kegagalan di tengah transaksi Global → tidak ada Project/mapping/membership yatim (rollback compensation existing di `provision.ts` tetap berlaku, diperluas untuk membership).
**DoD:** FR-002 ("setiap Project punya tepat satu Owner") terbukti via test; tidak ada regresi pada rollback path 0.6.3.

---

## TASK-1.3 — Project CRUD endpoints (HTTP)  (dep: 1.1, 1.2)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 1.3.1 | 🔎 | [CL-06](#cl-06)<br>[CL-05](#cl-05) | 80 | P0 | `POST /api/v1/projects` — resolve identity (tanpa `RequestPipeline` project-step karena Project belum ada), generate `project_id` ULID, panggil `provisionProjectWithMapping` (1.2), balikan `{ data }` sesuai C.2/C.4. Baca `Idempotency-Key` (`extractIdempotencyKey`, `packages/contracts/src/http-mapping.ts`) — minimal: request tanpa header tetap jalan normal; request dengan header yang sama diproses ulang (dedupe store persisten dicatat sebagai catatan terbuka, bukan blocker Phase 1) | [02-SPEC C.4](docs/02-SPEC.md), FR-001; [C.3](docs/02-SPEC.md) | 1.1, 1.2 |
| 1.3.2 | 🔎 | [CL-08](#cl-08)<br>[CL-07](#cl-07) | 80 | P1 | `GET /api/v1/projects` — list seluruh Project yang membership User masih aktif (`project_memberships` Global DB), untuk masing-masing baca status ringkas dari `project_state` Project DB (bukan transaksi lintas-DB, sesuai [03-ENG A.4](docs/03-ENGINEERING.md)) | [02-SPEC C.4](docs/02-SPEC.md) | 1.2 |
| 1.3.3 | 🔎 | [CL-10](#cl-10)<br>[CL-09](#cl-09) | 80 | P0 | `GET /api/v1/projects/:project_id` — pakai `RequestPipeline` (`packages/infrastructure/src/pipeline/pipeline.ts`, hasil 0.9) untuk identity+membership+resolve DB, baca `project_state` via `ProjectRepository.getProjectState` | [02-SPEC C.4](docs/02-SPEC.md) | 1.1 |
| 1.3.4 | 🔎 | [CL-12](#cl-12)<br>[CL-11](#cl-11) | 80 | P1 | `PATCH /api/v1/projects/:project_id` — hanya field `name` (Generic PATCH tetap dilarang mengubah `id/project_id/creator_user_id/created_at/version/archived_at/deleted_at`, [02-SPEC C.15](docs/02-SPEC.md)), wajib `expected_version`, otorisasi Owner-only interim (lihat "Prinsip Phase 1") sebelum panggil `updateProjectName` (1.1) | [02-SPEC C.4](docs/02-SPEC.md), [C.15](docs/02-SPEC.md), BR-035, BR-037 | 1.1, 1.3.3 |

**Test:** Integration — create tanpa identitas ditolak; create menghasilkan `project_state` ACTIVE + Activity `project.created` + Owner Membership (regresi 1.2) via endpoint; list hanya mengembalikan Project dengan membership aktif User (tidak bocor Project lain — Project-boundary check); read Project tanpa membership → `PROJECT_ACCESS_DENIED`; update oleh non-Owner → `PERMISSION_DENIED`; update dengan `expected_version` salah → `VERSION_CONFLICT`; update field terlarang (mis. `version` di body) diabaikan/ditolak.
**DoD:** Endpoint sesuai kontrak C.4; response envelope C.2; tidak ada endpoint yang mengizinkan perubahan field domain-controlled via PATCH; seluruh test di atas hijau.

---

## TASK-1.4 — Project lifecycle endpoints (domain command)  (dep: 1.1, 1.3.3)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 1.4.1 | 🔎 | [CL-14](#cl-14)<br>[CL-13](#cl-13) | 80 | P0 | `POST /api/v1/projects/:project_id/archive` — otorisasi Owner-only interim, `expected_version` wajib, panggil `archiveProject` (1.1) | [02-SPEC C.4](docs/02-SPEC.md), A.3 | 1.1, 1.3.3 |
| 1.4.2 | 🔎 | [CL-16](#cl-16)<br>[CL-15](#cl-15) | 80 | P0 | `POST /api/v1/projects/:project_id/restore` — hanya valid dari ARCHIVED (Project tidak punya ancestor lain sehingga INV-LIFE-002 trivially satisfied di level Project), otorisasi Owner-only interim, panggil `restoreProject` (1.1) | [02-SPEC C.4](docs/02-SPEC.md), INV-LIFE-002 | 1.1, 1.3.3 |
| 1.4.3 | 🔎 | [CL-18](#cl-18)<br>[CL-17](#cl-17) | 80 | P0 | `POST /api/v1/projects/:project_id/delete` — terminal, tidak dapat direstore setelahnya, otorisasi Owner-only interim, panggil `deleteProject` (1.1) | [02-SPEC C.4](docs/02-SPEC.md), INV-LIFE-004 | 1.1, 1.3.3 |

**Test:** Integration per operasi — happy path mengubah `project_state` + Activity sesuai; non-Owner ditolak `PERMISSION_DENIED`; version mismatch → `VERSION_CONFLICT` tanpa perubahan; restore dari DELETED ditolak; archive/restore/delete pada Project lain (beda Project boundary) tidak pernah menyentuh Project DB yang salah.
**DoD:** Ketiga command diekspos sebagai domain command eksplisit (bukan generic PATCH, BR-061); lifecycle state machine A.3 dipatuhi; test lifecycle + Project-boundary hijau.

---

## TASK-1.5 — Permission catalog seed (D.1)  (dep: — , independen dari 1.1–1.4)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 1.5.1 | 🔎 | [CL-20](#cl-20)<br>[CL-19](#cl-19) | 80 | P0 | Seed idempotent tabel `permissions` (Global DB) dengan seluruh key kanonik D.1 (`project.read`, `project.update`, `milestone.*`, `board.*`, `list.*`, `card.*`, `member.*`, `permission_group.*`, `api_key.*`) — data statis, BUKAN migration schema baru. Jalankan sebagai bagian `migrate-global` (`packages/infrastructure/scripts/migrate-global.ts`) atau modul seed terpisah `packages/infrastructure/src/database/permission-catalog.ts`, idempotent (upsert by `key`) | [02-SPEC D.1](docs/02-SPEC.md) | — |

**Test:** Unit/integration — run seed dua kali berturut-turut menghasilkan jumlah row sama (idempotent, tidak duplikat); setiap key D.1 ada tepat satu row.
**DoD:** Katalog permission lengkap sesuai D.1; re-run migrate-global tidak menghasilkan duplikat atau error constraint.

---

## TASK-1.6 — Baseline Permission Group seed saat create Project  (dep: 1.2, 1.5)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 1.6.1 | ⬜️ | — | 0 | P1 | Saat `provisionProjectWithMapping` (1.2) commit, seed 4 baseline Permission Group **Co-Owner, Manager, Contributor, Viewer** (BUKAN Owner — Owner adalah ownership property BR-035, bukan Group) beserta `group_permissions` default sesuai matrix D.2, dalam transaksi Global DB yang sama. Baseline HARUS berupa data (row `permission_groups`+`group_permissions`), bukan `if role == ...` hard-coded (BR-039) | [02-SPEC D.2](docs/02-SPEC.md), BR-035, BR-036, BR-039 | 1.2, 1.5 |

**Test:** Integration — create Project → tepat 4 `permission_groups` baru dengan nama baseline; `group_permissions` Co-Owner mencakup seluruh operasi Owner-level kecuali ownership itu sendiri, Manager mencakup Milestone/Board/List CRUD + Card, Contributor mencakup Card create/update/move/archive/delete/comment tanpa Manage Members/Permission Groups, Viewer hanya `*.read`; verifikasi tidak ada baseline group bernama "Owner".
**DoD:** Baseline groups tersedia setiap Project baru sesuai D.2; konfigurasi disimpan sebagai data yang dapat diubah lewat 1.7 (bukan hard-coded).

---

## TASK-1.7 — Permission Group CRUD endpoints  (dep: 1.5, 1.6)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 1.7.1 | ⬜️ | — | 0 | P1 | `GET /api/v1/projects/:project_id/permission-groups` — list Group Project-scoped (exclude yang `deleted_at` bukan NULL kecuali diminta eksplisit) | [02-SPEC C.12](docs/02-SPEC.md), FR-009 | 1.6 |
| 1.7.2 | ⬜️ | — | 0 | P1 | `POST /api/v1/projects/:project_id/permission-groups` — create custom Group + assign permission set (referensi ke `permissions.id` katalog 1.5), otorisasi Owner-only interim | [02-SPEC C.12](docs/02-SPEC.md), FR-010, FR-011 | 1.5, 1.6 |
| 1.7.3 | ⬜️ | — | 0 | P1 | `PATCH /api/v1/projects/:project_id/permission-groups/:group_id` — ubah nama/description/permission assignment; perubahan permission langsung berlaku ke semua Membership ber-assignment (BR-040, live reference — tidak ada snapshot untuk di-invalidate), otorisasi Owner-only interim | [02-SPEC C.12](docs/02-SPEC.md), BR-040 | 1.7.1 |
| 1.7.4 | ⬜️ | [Review-CL-02](#review-cl-02) | 0 | P2 | `POST /api/v1/projects/:project_id/permission-groups/:group_id/delete` — soft-delete (set `permission_groups.deleted_at`); Membership dengan assignment ke Group ini kehilangan permission yang di-grant Group tsb tanpa menghapus riwayat `membership_group_assignments` (BR-041); otorisasi Owner-only interim | [02-SPEC C.12](docs/02-SPEC.md) (amandemen 2.1.0), BR-041, D.1 `permission_group.delete` | 1.7.1 |

**Test (1.7.1–1.7.4):** create custom Group + assign `card.read` tanpa `card_read_visibility` eksplisit → default `CREATED_BY_ME` (BR-048); assign visibility ke permission selain `card.read` ditolak (app-level invariant B.2); update Group oleh non-Owner → `PERMISSION_DENIED`; list tidak bocor lintas Project; delete Group tidak menghapus row `membership_group_assignments` (hanya `permission_groups.deleted_at` ter-set).
**DoD:** CRUD+delete Group sesuai C.12 (2.1.0); Group Project-scoped (BR-039); soft-delete tidak menghapus riwayat assignment.

---

## TASK-1.8 — Scoped Group/direct Permission assignment endpoints  (dep: 1.6, 1.7)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 1.8.1 | ⬜️ | — | 0 | P1 | `POST /api/v1/projects/:project_id/members/:membership_id/group-assignments` + `.../revoke` — assign scoped Group ke Membership pada tepat satu `scope_type`/`scope_id` (BR-042); scope_id divalidasi ada & berada di Project sama (BR-042B: untuk Phase 1 validasi terbatas pada `scope_type="project"`, karena Milestone/Board/List/Card belum ada — validasi scope non-project ditandai catatan untuk direvisit Phase 2/3 saat resource-nya ada); revoke mempertahankan riwayat (`revoked_at`, bukan delete) | [02-SPEC C.12](docs/02-SPEC.md), BR-042, BR-042B | 1.6, 1.7.1 |
| 1.8.2 | ⬜️ | — | 0 | P1 | `POST /api/v1/projects/:project_id/members/:membership_id/permission-assignments` + `.../revoke` — sama seperti 1.8.1 tapi direct Permission (bukan Group), termasuk `card_read_visibility` khusus `card.read` (default `CREATED_BY_ME` jika tidak diberikan, BR-048) | [02-SPEC C.12](docs/02-SPEC.md), BR-042A, BR-047, BR-048 | 1.6, 1.7.1 |

**Test:** Assignment ke Membership beda Project ditolak; assignment ganda aktif pada `(membership, group/permission, scope_type, scope_id)` yang sama ditolak (UNIQUE constraint aktif — `membership_group_assignments_active_unique`/`membership_permission_assignments_active_unique`); revoke tidak menghapus row, hanya set `revoked_at`; `card_read_visibility` di-set NULL utk permission selain `card.read`.
**DoD:** Assignment additive (BR-038), riwayat utuh setelah revoke; Project-boundary check pada `membership_id` dan `scope_id` project-level.

---

## TASK-1.9 — Invitation flow (create + accept)  (dep: 1.2, 1.7)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 1.9.1 | ⬜️ | — | 0 | P0 | `POST /api/v1/projects/:project_id/invitations` — wajib minimal satu `assignments` (group_id + scope), simpan reference ke Group (bukan snapshot, BR-052), `expires_at`, otorisasi Owner-only interim (Manage Members) | [02-SPEC C.13](docs/02-SPEC.md), BR-050, BR-051, BR-052, FR-005, FR-006 | 1.2, 1.7.1 |
| 1.9.2 | ⬜️ | — | 0 | P0 | `POST /api/v1/invitations/:invitation_id/accept` — validasi belum expired/accepted/revoked (`INVITATION_EXPIRED`/`INVITATION_ALREADY_USED`), lalu atomik: create `project_memberships` + seluruh `membership_group_assignments` dari `invitation_group_assignments`, set `accepted_at` — dalam satu transaksi Global DB | [02-SPEC C.13](docs/02-SPEC.md), FR-007 | 1.9.1 |

**Test:** Invitation expired → `INVITATION_EXPIRED`; accept dua kali → `INVITATION_ALREADY_USED`; accept sukses menghasilkan tepat 1 Membership baru + assignment sesuai `invitation_group_assignments` tanpa assignment kedua kali (idempotent terhadap retry); accept oleh email berbeda dari `invitations.email` ditolak.
**DoD:** Alur invitation sesuai FR-005–007; tidak ada join bebas (BR-050); Membership+assignment ter-commit atomik.

---

## TASK-1.10 — Membership read/revoke  (dep: 1.2)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 1.10.1 | ⬜️ | [Review-CL-02](#review-cl-02) | 0 | P2 | `GET /api/v1/projects/:project_id/members` — list seluruh Membership Project (`member.read`), termasuk yang `revoked_at` bukan NULL sesuai filter | [02-SPEC C.12](docs/02-SPEC.md) (amandemen 2.1.0), FR-008 | 1.2 |
| 1.10.2 | ⬜️ | [Review-CL-02](#review-cl-02) | 0 | P2 | `POST /api/v1/projects/:project_id/members/:membership_id/revoke` (`member.remove`) — set `project_memberships.revoked_at`, TIDAK menghapus data historis (`creator_user_id`/`activity.actor_user_id` tetap utuh, BR-053); tidak mencabut `membership_group_assignments`/`membership_permission_assignments` satu-per-satu — assignment tetap ada sebagai riwayat, non-applicable begitu Membership induk revoked; Owner Membership MUST NOT dapat di-revoke (Project selalu punya tepat satu Owner, FR-002) | [02-SPEC C.12](docs/02-SPEC.md) (amandemen 2.1.0), BR-053, FR-002, FR-008 | 1.2, 1.10.1 |

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

---

## Closure Log

> Isi tiap kali sebuah goal pindah status atau menerima hasil review. Ikuti format & aturan penamaan CL sesuai [AGENTS.md §6](AGENTS.md) dan [PHASE-0-TASKS.md](PHASE-0-TASKS.md) (namespace CL/QA-CL/Review-CL terpisah per fase — entry Phase 1 dimulai dari CL-01/QA-CL-01/Review-CL-01 pada file ini).

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

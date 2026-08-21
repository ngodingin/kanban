# Phase 0 — Foundation · Task & Goal Breakdown

> Generated per [04-DELIVERY C.6](docs/04-DELIVERY.md). SOT version: 2.0.7.
> Scope batas: [04-DELIVERY C.1 "Phase 0"](docs/04-DELIVERY.md). Acuan utama: [03-ENGINEERING Part A/B/D](docs/03-ENGINEERING.md) + [02-SPEC C.2](docs/02-SPEC.md).
> **Konteks:** belum ada repo — Phase 0 adalah bootstrapping. Path file adalah *usulan* sesuai [03-ENGINEERING A.7](docs/03-ENGINEERING.md); sesuaikan saat implementasi. File ini working list, **terpisah dari SOT**.
>
> **AI-Dev execution gate:** jangan ubah implementasi sebelum goal `🔄` + `CL` terpasang. Jangan menyatakan selesai sebelum goal `🔎`/`80%` + CL baru + test hijau + commit. Format handoff wajib mengikuti [AGENTS.md §0](AGENTS.md).

## Prinsip Phase 0
Membangun **plumbing**, bukan domain endpoint. Endpoint domain (Project CRUD dst.) mulai Phase 1. Authorization *resolution* hanya disiapkan sebagai **seam kosong**; implementasi penuh di Phase 4.

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

Kolom **CL** = indeks tautan Closure Log per goal. Gunakan `[CL-nn](#cl-nn)` untuk catatan Dev, `[QA-CL-nn](#qa-cl-nn)` untuk catatan QA, dan `[Review-CL-nn](#review-cl-nn)` untuk catatan AI-Planning & Review/reviewer. Kolom ini append-only: link lama tidak boleh diganti/dihapus/diurutkan ulang; append link baru pada baris baru memakai `<br>`. Gunakan `—` hanya selama belum ada entry.

Kolom **Prior** = prioritas relatif di dalam fase: `P0` blocker/gate/fondasi kritis · `P1` tinggi/core dependency · `P2` normal · `P3` lanjutan/polish. Prioritas **tidak** membatalkan Dependency atau Status; goal tetap hanya boleh dikerjakan setelah dependency-nya terpenuhi.

Status dan `%` pada level **Task** tidak disimpan atau diedit manual. Keduanya dihitung dari seluruh goal menurut [AGENTS.md §6.2](AGENTS.md): Task `%` = rata-rata semua goal dibulatkan ke bawah; Task Status mengikuti kondisi goal. Task tidak memiliki CL terpisah—buktinya adalah agregasi CL seluruh goal.

## Dependency graph (task-level)
```text
0.1 scaffolding
 ├─ 0.2 POC Turso [GATING]
 ├─ 0.3 db connection & resolver
 │    ├─ 0.4 Global DB schema
 │    ├─ 0.5 Project DB schema
 │    └─ 0.6 provisioning ◄── 0.2 (sync/async) + 0.4 + 0.5
 ├─ 0.7 API response/error convention
 ├─ 0.8 Better Auth identity
 │    └─ 0.9 request pipeline ◄── 0.3 + 0.8
 ├─ 0.10 repository/tx boundary ◄── 0.3
 ├─ 0.11 testing harness ◄── 0.4/0.5
 └─ 0.12 CI & migration pipeline ◄── 0.4/0.5/0.11
```

---

## TASK-0.1 — Inisialisasi project & struktur folder

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.1.1 | ✅ | [CL-01](#cl-01)<br>[QA-CL-01](#qa-cl-01) | 100 | P0 | Verifikasi baseline masih latest compatible LTS/stable sesuai A.8, lalu inisialisasi Git dan bootstrap pnpm workspace + Node.js 24 LTS + Hono 4 + TypeScript 6 memakai exact pin (build & typecheck jalan) | [03-ENG A.8](docs/03-ENGINEERING.md) | — |
| 0.1.2 | ✅ | [CL-09](#cl-09)<br>[QA-CL-02](#qa-cl-02)<br>[CL-46](#cl-46)<br>[QA-CL-09](#qa-cl-09) | 100 | P1 | Buat skeleton A.7: `apps/api` serta `packages/domain`, `infrastructure`, `contracts`, `shared`; `apps/web` tetap placeholder sampai Phase 7 | [03-ENG A.7](docs/03-ENGINEERING.md) | 0.1.1 |
| 0.1.3 | ✅ | [CL-05](#cl-05)<br>[QA-CL-03](#qa-cl-03) | 100 | P0 | Pasang exact pin A.8 untuk libSQL/Turso SDK, Zod, ULID, Drizzle + drizzle-kit, ESLint + typescript-eslint, dan Prettier; commit `pnpm-lock.yaml` | [03-ENG A.8](docs/03-ENGINEERING.md), [A.12](docs/03-ENGINEERING.md) | 0.1.1 |
| 0.1.4 | ⚠️ | [CL-10](#cl-10)<br>[QA-CL-04](#qa-cl-04)<br>[Review-CL-05](#review-cl-05) | 70 | P1 | `.env.example` + loader config untuk canonical origin per environment, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `AUTH_RESEND_KEY`, dan sender `noreply@kanban.ngodingin.xyz` (tanpa secret nyata) | [03-ENG D.7](docs/03-ENGINEERING.md), [A.14](docs/03-ENGINEERING.md) | 0.1.1 |
| 0.1.5 | 🔎 | [Review-CL-03](#review-cl-03)<br>[CL-48](#cl-48) | 80 | P1 | Tambah `compose.devenv.yml`: Docker Compose Node 24.18.0 + Corepack pnpm 11.22.0 untuk menjalankan `pnpm install --frozen-lockfile`, build, typecheck, lint, dan smoke test tanpa runtime host | [03-ENG A.8](docs/03-ENGINEERING.md), [04-DEL B.5](docs/04-DELIVERY.md) | — |

**Test:** `git rev-parse --is-inside-work-tree` sukses; catatan verifikasi LTS/stable tersedia; tidak ada direct dependency prerelease; clean `pnpm install --frozen-lockfile`; verifikasi `engines`/`packageManager`/exact direct pins; Hono smoke route + build + typecheck + lint hijau.
**DoD:** Git aktif; semua goal ✅; struktur folder cocok A.7; latest compatible LTS/stable sudah diverifikasi dan versi exact sesuai A.8; `pnpm-lock.yaml` ter-commit; `.env.example` lengkap; tidak ada secret ter-commit.

---

## TASK-0.2 — POC gate Turso  `[GATING]`

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.2.1 | ✅ | [CL-01](#cl-01)<br>[CL-02](#cl-02)<br>[CL-03](#cl-03)<br>[QA-CL-05](#qa-cl-05) | 100 | P0 | Ukur cold start + latensi query sederhana dari fungsi serverless Vercel | [03-ENG A.11](docs/03-ENGINEERING.md) | 0.1.1 |
| 0.2.2 | ✅ | [CL-06](#cl-06)<br>[QA-CL-06](#qa-cl-06) | 100 | P0 | Ukur waktu provisioning DB baru via Turso API | [03-ENG A.11](docs/03-ENGINEERING.md), [F.2](docs/03-ENGINEERING.md) | 0.1.1 |
| 0.2.3 | ✅ | [CL-04](#cl-04)<br>[QA-CL-07](#qa-cl-07) | 100 | P0 | Uji concurrent write + perilaku `BEGIN IMMEDIATE` | [03-ENG A.6](docs/03-ENGINEERING.md), [A.11](docs/03-ENGINEERING.md) | 0.1.1 |
| 0.2.4 | ✅ | [CL-07](#cl-07)<br>[QA-CL-08](#qa-cl-08) | 100 | P0 | Proyeksi biaya + keputusan GO/NO-GO + sinkron vs async | [03-ENG A.11](docs/03-ENGINEERING.md), [F.2](docs/03-ENGINEERING.md) | 0.2.1, 0.2.2, 0.2.3 |

**Test:** Hasil tiap pengukuran terdokumentasi di `poc/RESULTS.md` terhadap ambang yang ditetapkan saat POC.
**DoD:** Keputusan tercatat: Turso GO/NO-GO **dan** provisioning sync/async. Jika NO-GO → tandai `[NEEDS-DECISION]` fallback (libSQL self-host / D1) per A.11. **Task ini gating untuk 0.6.**

---

## TASK-0.3 — DB connection factory & Project Database Resolver

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.3.1 | ✅ | [CL-08](#cl-08)<br>[QA-CL-10](#qa-cl-10) | 100 | P0 | Factory koneksi libSQL/Drizzle (pisah Global client vs Project client dinamis) | [03-ENG A.4](docs/03-ENGINEERING.md), [A.5](docs/03-ENGINEERING.md) | 0.1.3 |
| 0.3.2 | ✅ | [CL-11](#cl-11)<br>[QA-CL-11](#qa-cl-11) | 100 | P0 | Resolver `project_id → database` via tabel `project_databases` (Global) | [03-ENG A.4](docs/03-ENGINEERING.md), [B.1](docs/03-ENGINEERING.md) | 0.3.1 |
| 0.3.3 | ✅ | [CL-12](#cl-12)<br>[QA-CL-12](#qa-cl-12) | 100 | P0 | Guard: `project_id` tak dikenal tidak pernah jatuh ke DB Project lain | [BR-007](docs/02-SPEC.md), [BR-009](docs/02-SPEC.md) | 0.3.2 |

**Test:** Unit — resolver kembalikan koneksi benar untuk `project_id` valid; `project_id` tak dikenal ditolak aman (tidak akses DB lain).
**DoD:** Resolver di balik interface; tidak ada koneksi Project DB hard-coded; fondasi isolation (BR-007/BR-009) terbukti via test.

---

## TASK-0.4 — Global DB schema + migration

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.4.1 | ✅ | [CL-13](#cl-13)<br>[QA-CL-16](#qa-cl-16) | 100 | P0 | Definisi 16 tabel Global DB (Drizzle), termasuk Better Auth core tables (`auth_sessions`, `auth_accounts`, `auth_verifications`) dan scoped Group/direct Permission assignments | [03-ENG B.2](docs/03-ENGINEERING.md), [A.13](docs/03-ENGINEERING.md) | 0.3.1 |
| 0.4.2 | ✅ | [CL-14](#cl-14)<br>[Review-CL-02](#review-cl-02)<br>[Review-CL-04](#review-cl-04)<br>[CL-41](#cl-41)<br>[CL-42](#cl-42)<br>[CL-43](#cl-43)<br>[QA-CL-17](#qa-cl-17) | 100 | P0 | Constraints membership/group/direct assignment scope, Better Auth mapping, uniqueness, hash credential, dan hashed Magic Link identifier | [03-ENG B.2](docs/03-ENGINEERING.md) | 0.4.1 |
| 0.4.3 | ✅ | [CL-15](#cl-15)<br>[QA-CL-18](#qa-cl-18) | 100 | P1 | Migration up idempotent (drizzle-kit) | [03-ENG A.12](docs/03-ENGINEERING.md), [F.3](docs/03-ENGINEERING.md) | 0.4.1 |

**Test:** Migration up idempotent; Better Auth generated-schema contract cocok dengan custom mapping B.2; constraint UNIQUE teruji; scoped assignment tidak dapat menghubungkan Membership/Group beda Project; credential dan Magic Link token tidak disimpan raw.
**DoD:** Semua tabel B.2 hadir; ULID dipakai; `users.email` normalized/unique; **tidak ada** `UNIQUE(name/title)` domain; migrasi bersih & idempotent.

---

## TASK-0.5 — Project DB schema + migration template

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.5.1 | ✅ | [CL-16](#cl-16)<br>[QA-CL-13](#qa-cl-13) | 100 | P0 | Definisi 10 tabel Project DB, termasuk `project_state` otoritatif, dengan `version` + `archived_at`/`deleted_at` | [03-ENG B.3](docs/03-ENGINEERING.md), [A.13](docs/03-ENGINEERING.md) | 0.3.1 |
| 0.5.2 | ✅ | [CL-17](#cl-17)<br>[QA-CL-14](#qa-cl-14) | 100 | P1 | Junction label dengan `removed_at`; `activities` polymorphic + `data` JSON | [03-ENG B.3](docs/03-ENGINEERING.md), [B.5](docs/03-ENGINEERING.md) | 0.5.1 |
| 0.5.3 | 🔎 | [CL-18](#cl-18)<br>[QA-CL-15](#qa-cl-15)<br>[CL-51](#cl-51) | 80 | P1 | Migration template dapat diterapkan terprogram (fan-out) | [03-ENG F.3](docs/03-ENGINEERING.md) | 0.5.1 |

**Test:** Migrasi diterapkan ke Project DB test; `project_state` tepat satu dan memiliki `version` + timestamp lifecycle; junction punya `removed_at`.
**DoD:** Schema sesuai B.3; `project_state` menjadi sumber lifecycle Project; migrasi Project applicable terprogram (fondasi fan-out F.3).

---

## TASK-0.6 — Mekanisme provisioning Project DB  (dep: 0.2, 0.4, 0.5)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.6.1 | ✅ | [CL-19](#cl-19)<br>[Review-CL-02](#review-cl-02)<br>[Review-CL-04](#review-cl-04)<br>[CL-44](#cl-44)<br>[QA-CL-30](#qa-cl-30) | 100 | P0 | Buat Project DB baru + apply migrasi Project schema + seed `project_state` ACTIVE dan Activity `project.created` atomik | [03-ENG F.2](docs/03-ENGINEERING.md) | 0.5.3 |
| 0.6.2 | ✅ | [CL-20](#cl-20)<br>[QA-CL-31](#qa-cl-31) | 100 | P0 | Catat mapping hasil provisioning di `project_databases` (Global) | [03-ENG A.4](docs/03-ENGINEERING.md), [B.1](docs/03-ENGINEERING.md) | 0.4.1, 0.6.1 |
| 0.6.3 | ✅ | [CL-22](#cl-22)<br>[Review-CL-02](#review-cl-02)<br>[Review-CL-04](#review-cl-04)<br>[CL-45](#cl-45)<br>[QA-CL-32](#qa-cl-32) | 100 | P0 | Rollback saat gagal (tidak ada DB/mapping yatim) | [03-ENG F.2](docs/03-ENGINEERING.md) | 0.6.2 |
| 0.6.4 | ✅ | [CL-23](#cl-23)<br>[QA-CL-33](#qa-cl-33) | 100 | P0 | Terapkan strategi sinkron/async sesuai keputusan 0.2.4 | [03-ENG F.2](docs/03-ENGINEERING.md) | 0.2.4 |

**Test:** Integration — provisioning menghasilkan Project DB + `project_state` ACTIVE + Activity `project.created` atomik + mapping tercatat; simulasi kegagalan → tidak ada DB/mapping yatim.
**DoD:** Panggilan provisioning menghasilkan Project DB siap pakai, satu `project_state` ACTIVE, Activity `project.created`, + mapping; kegagalan bersih; strategi sesuai 0.2. Endpoint `POST /projects` penuh = Phase 1 (di sini hanya mekanisme + seam).

---

## TASK-0.7 — API response & error convention

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.7.1 | ✅ | [CL-37](#cl-37)<br>[QA-CL-34](#qa-cl-34) | 100 | P1 | Bentuk sukses `{data}` & error `{error:{code,message}}` | [02-SPEC C.2](docs/02-SPEC.md) | 0.1.2 |
| 0.7.2 | ✅ | [CL-38](#cl-38)<br>[QA-CL-35](#qa-cl-35) | 100 | P1 | Enum error code kanonik (12 code) | [02-SPEC C.2](docs/02-SPEC.md) | 0.7.1 |
| 0.7.3 | ✅ | [CL-39](#cl-39)<br>[QA-CL-36](#qa-cl-36) | 100 | P2 | Helper mapping error domain → HTTP + seam `Idempotency-Key` | [02-SPEC C.2](docs/02-SPEC.md), [C.3](docs/02-SPEC.md) | 0.7.2 |

**Test:** Unit — helper menghasilkan bentuk response benar; tiap error code kanonik terpetakan ke HTTP status.
**DoD:** Handler mendatang dapat memakai helper konsisten; seluruh error code C.2 tersedia.

---

## TASK-0.8 — Better Auth setup & identity resolution

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.8.1 | ✅ | [CL-28](#cl-28)<br>[QA-CL-26](#qa-cl-26) | 100 | P1 | Setup exact-pinned Better Auth + Drizzle adapter, custom table/field mapping B.2, dan custom ULID `generateId` → seluruh auth state berada di Global DB | [03-ENG A.8](docs/03-ENGINEERING.md), [A.14](docs/03-ENGINEERING.md) | 0.4.1 |
| 0.8.2 | ✅ | [CL-29](#cl-29)<br>[QA-CL-27](#qa-cl-27) | 100 | P1 | Database-backed opaque session + secure HTTP-only cookie + sign-out/revocation dasar; cookie cache/stateless mode tetap nonaktif | [03-ENG A.14](docs/03-ENGINEERING.md) | 0.8.1 |
| 0.8.3 | ✅ | [CL-31](#cl-31)<br>[QA-CL-28](#qa-cl-28) | 100 | P0 | `resolveIdentity(request) → User` (satu titik resolusi identitas) | [03-ENG A.14](docs/03-ENGINEERING.md), [C.1](docs/03-ENGINEERING.md) | 0.8.2, 0.8.4 |
| 0.8.4 | ⚠️ | [CL-30](#cl-30)<br>[QA-CL-29](#qa-cl-29)<br>[Review-CL-05](#review-cl-05) | 70 | P1 | Pasang Better Auth handler `/api/auth/*` + Magic Link plugin: `sendMagicLink()` ke Resend API, `storeToken: "hashed"`, callback, konsumsi atomik single-use/expiring, dan antarmuka uji minimal | [03-ENG A.14](docs/03-ENGINEERING.md) | 0.1.4, 0.8.1 |

**Test:** Integration — handler auth terpasang sebelum catch-all; password/social auth tidak tersedia; request Magic Link tidak membocorkan keberadaan email; sender tepat; staging link hanya memakai `https://kanban-ngodingin.vercel.app`, production link hanya memakai `https://kanban.ngodingin.xyz`; database tidak menyimpan raw verification token; token expired/used/invalid ditolak; dua konsumsi konkuren hanya satu yang sukses; link valid menghasilkan session; sign-out/revoke membuat session tidak valid.
**DoD:** Identitas web session melalui Better Auth Magic Link dan satu `resolveIdentity()`; User otoritatif di Global DB; ID auth memakai ULID; verification hashed/single-use/expiring; session database-backed dan revocable; transport email memakai `sendMagicLink()` + Resend SDK/API; secret/alamat pengirim hanya dari environment; UI final ditunda ke Phase 7.

---

## TASK-0.9 — Request pipeline: identity → project resolution → isolation  (dep: 0.3, 0.8)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.9.1 | ✅ | [CL-32](#cl-32)<br>[QA-CL-21](#qa-cl-21) | 100 | P0 | Resolve identity (session; seam untuk PAT/API Key di Phase 4) | [03-ENG C.1](docs/03-ENGINEERING.md) | 0.8.3 |
| 0.9.2 | ✅ | [CL-33](#cl-33)<br>[QA-CL-22](#qa-cl-22) | 100 | P0 | Load Project dari `:project_id` + verify membership exists | [BR-007](docs/02-SPEC.md), [BR-009](docs/02-SPEC.md) | 0.3.2, 0.9.1 |
| 0.9.3 | ✅ | [CL-34](#cl-34)<br>[QA-CL-23](#qa-cl-23) | 100 | P0 | Resolve Project DB **setelah** verifikasi membership | [03-ENG A.4](docs/03-ENGINEERING.md) | 0.9.2 |
| 0.9.4 | ✅ | [CL-35](#cl-35)<br>[QA-CL-24](#qa-cl-24) | 100 | P0 | Permission resolution = seam kosong (diisi Phase 4) | [03-ENG C.1](docs/03-ENGINEERING.md) | 0.9.1 |
| 0.9.5 | ✅ | [CL-36](#cl-36)<br>[QA-CL-25](#qa-cl-25) | 100 | P0 | Semua akses resource WAJIB lewat pipeline (tidak ada bypass) | [BR-008](docs/02-SPEC.md), [AC-001](docs/04-DELIVERY.md) | 0.9.3 |

**Test:** Integration — request tanpa identitas → ditolak; ke Project tanpa membership → `PROJECT_ACCESS_DENIED`; menyebut `project_id` Project lain → tidak pernah mengakses DB Project lain.
**DoD:** Tidak ada jalur akses resource yang melewati pipeline; `project_id` diverifikasi terhadap membership **sebelum** resolve Project DB; fondasi AC-001/AC-030 terpasang.

---

## TASK-0.10 — Repository/data-access boundary + transaction helper  (dep: 0.3)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.10.1 | ✅ | [CL-24](#cl-24)<br>[QA-CL-19](#qa-cl-19) | 100 | P0 | Pola repository — domain logic tidak import Drizzle langsung | [03-ENG A.7](docs/03-ENGINEERING.md), [A.12](docs/03-ENGINEERING.md) | 0.3.1 |
| 0.10.2 | ✅ | [CL-25](#cl-25)<br>[QA-CL-20](#qa-cl-20) | 100 | P0 | Transaction helper `BEGIN IMMEDIATE` (mutation + activity atomic) | [03-ENG A.6](docs/03-ENGINEERING.md) | 0.3.1 |

**Test:** Unit — transaction helper commit menyimpan; rollback membatalkan (uji mutation + dummy activity atomic).
**DoD:** Boundary jelas; domain tidak bergantung API Drizzle langsung; tx helper tersedia (fondasi A.6 / atomic Card move INV-MOVE-004).

---

## TASK-0.11 — Testing harness  (dep: 0.4, 0.5)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.11.1 | ✅ | [CL-26](#cl-26)<br>[QA-CL-37](#qa-cl-37) | 100 | P0 | Setup Vitest 4.x exact pin untuk unit + integration | [03-ENG A.8](docs/03-ENGINEERING.md), [04-DEL B.2](docs/04-DELIVERY.md), [B.5](docs/04-DELIVERY.md) | 0.1.3 |
| 0.11.2 | ✅ | [CL-27](#cl-27)<br>[QA-CL-38](#qa-cl-38) | 100 | P0 | DB test terisolasi per suite + rollback antar test | [04-DEL B.5](docs/04-DELIVERY.md) | 0.4.3, 0.5.3 |
| 0.11.3 | ✅ | [CL-40](#cl-40)<br>[QA-CL-39](#qa-cl-39) | 100 | P1 | Konvensi penamaan test mereferensikan ID rule (BR/AC) | [04-DEL B.6](docs/04-DELIVERY.md) | 0.11.1 |
| 0.11.4 | ✅ | [CL-47](#cl-47)<br>[QA-CL-40](#qa-cl-40) | 100 | P2 | Setup Playwright 1.62.x exact pin + production-like webServer untuk E2E smoke | [03-ENG A.8](docs/03-ENGINEERING.md), [04-DEL B.5](docs/04-DELIVERY.md) | 0.1.1 |

**Test:** (meta) contoh Vitest unit+integration dan Playwright E2E smoke lulus lokal.
**DoD:** `test` dan `test:e2e` jalan; integration test punya DB terisolasi & bersih antar test; pola penamaan ber-ID siap.

---

## TASK-0.12 — CI & migration pipeline dasar  (dep: 0.4, 0.5, 0.11)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.12.1 | 🔎 | [CL-52](#cl-52) | 80 | P1 | CI: typecheck + test otomatis per push/PR | [03-ENG F.6](docs/03-ENGINEERING.md) | 0.11.1 |
| 0.12.2 | ⬜️ | — | 0 | P1 | Migrasi Global + seam fan-out Project DB saat deploy | [03-ENG F.3](docs/03-ENGINEERING.md) | 0.4.3, 0.5.3 |
| 0.12.3 | ⬜️ | — | 0 | P1 | Env terpisah dev/staging/prod; staging dan production memakai canonical origin serta secret Resend terpisah | [03-ENG D.7](docs/03-ENGINEERING.md) | 0.1.4 |
| 0.12.4 | ⬜️ | — | 0 | P0 | Preview deployment satu origin: Hono `/api/*` + static test shell; buktikan SPA fallback tidak menangkap API dan auth cookie/callback same-origin | [03-ENG D.1](docs/03-ENGINEERING.md), [D.5](docs/03-ENGINEERING.md), [A.14](docs/03-ENGINEERING.md) | 0.8.4, 0.12.1 |
| 0.12.5 | ⬜️ | — | 0 | P2 | Hubungkan release checklist F.6 sebagai langkah CI | [03-ENG F.6](docs/03-ENGINEERING.md) | 0.12.1 |

**Test:** CI hijau di branch; migrasi Global jalan di staging; seam fan-out Project terpanggil (walau 0 Project); preview `/api/*` mengembalikan response API, route web mengembalikan HTML, unknown `/api/*` tidak pernah mengembalikan `index.html`, dan Magic Link callback mempertahankan session cookie pada origin yang sama.
**DoD:** CI menjalankan build+typecheck+lint+test+migrasi; env terpisah; satu-origin Hono/static routing terbukti; langkah release checklist F.6 terhubung.

---

## Exit Criteria Phase 0 (syarat mulai Phase 1)
- Repo terstruktur sesuai A.7; build/typecheck/test/CI hijau.
- Keputusan POC (0.2) tercatat: Turso GO/NO-GO + provisioning sync/async.
- Global DB & Project DB schema termigrasi; provisioning Project DB baru berfungsi + rollback aman.
- Pipeline request menegakkan: identity wajib, membership diverifikasi, Project DB di-resolve setelah verifikasi, tanpa kebocoran lintas Project.
- Identity web session (Better Auth Magic Link) berfungsi; user otoritatif di Global DB.
- Transaction helper + repository boundary siap dipakai domain command.

## Flag terbuka (sesuai C.6.5)
- ~~`[NEEDS-DECISION]` 0.2.4 — provisioning sinkron vs async~~ → **DIPUTUSKAN 2026-08-18 (manusia): Turso GO + provisioning SINKRON** (tercatat CL-07).
- Catatan untuk AI-Planning & Review: A.11 "Locked pending POC gate" kini terbukti lulus — pertimbangkan amandemen SOT menghapus status pending.
- ~~`[NEEDS-SPEC-AMENDMENT]` D.7 — canonical origin staging~~ → **DISELESAIKAN 2026-08-21 (manusia):** staging memakai `https://kanban-ngodingin.vercel.app`; SOT dinaikkan ke 2.0.7 melalui Review-CL-05. Implementasi loader/Magic Link dikembalikan ke Dev melalui 0.1.4 dan 0.8.4 ⚠️.

---

## Closure Log

> Isi tiap kali sebuah goal pindah status atau menerima hasil review. Setiap entry wajib mencantumkan Role dan nama Model aktual; jika model tidak diekspos, tulis nama platform yang menjalankan agent (mis. `GitHub Copilot` atau `Codex`) dan jangan menebak model. Tambah entry baru di atas (terbaru dulu), gunakan namespace sesuai lane, lalu **append** link entry ke baris baru dalam kolom **CL** tanpa mengubah link lama. Setiap perubahan Status wajib masuk commit; awal `→ 🔄` boleh menunggu commit pertama. Commit diverifikasi lewat history Git file ini, bukan dengan menulis hash commit yang sama ke entry. Setiap entry `⚠️`/`⏸️` wajib mencantumkan alasan.

<a id="review-cl-05"></a>
### Review-CL-05 — 2026-08-21 · amandemen D.7; 0.1.4 dan 0.8.4 ✅ 100% → ⚠️ 70%
**Role:** AI-Planning & Review · **Model:** Codex
**Bukti:** Keputusan manusia di CL-21 menetapkan staging `https://kanban-ngodingin.vercel.app`; Vercel project/deployment telah diverifikasi di CL-21 dan CL-49. Impact scan menemukan SOT D.7, `packages/infrastructure/src/config/env.ts`, `.env.example`, `scripts/smoke-config.ts`, dan `scripts/smoke-magic-link.ts` masih menunjuk `https://stag-kanban.ngodingin.xyz`. Amandemen SOT 2.0.7 mengganti canonical staging origin dan memperbarui Test 0.8.4; README tidak lagi menampilkan baris staging sesuai keputusan manusia sesi ini.
**Catatan:** Status 0.1.4 dan 0.8.4 diturunkan karena implementasi/test yang sebelumnya terverifikasi kini tidak cocok dengan SOT 2.0.7. Handoff AI-Dev: ubah loader, `.env.example`, smoke config, dan smoke Magic Link ke origin baru; jalankan test positif/negatif terkait; lalu serahkan kembali ke QA. Closure Log lama tidak diubah. Amandemen ini tidak mengubah production origin maupun sender Magic Link.

<a id="qa-cl-33"></a>
### QA-CL-33 — 2026-08-21 · 0.6.4 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca `provisionProjectWithMapping`: provisioning berjalan sinkron dalam satu call (tanpa state perantara `PROVISIONING` terekspos ke caller), `provisioningState: "READY"` langsung ditulis — konsisten keputusan manusia 0.2.4 (QA-CL-08). `project_databases` tetap satu-satunya sumber resolusi (dipakai 0.3.2's resolver, sudah ✅).
**Catatan:** Tidak ada perubahan SOT.

<a id="qa-cl-32"></a>
### QA-CL-32 — 2026-08-21 · 0.6.3 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Re-run `test:smoke-rollback` live (Turso nyata, membuat & menghapus DB sungguhan): 7/7 PASS — skenario A (token invalid, gagal di awal → tidak ada DB yatim, registry rollback), C (name conflict, gagal di tengah → hanya DB hasil invocation ini yang dihapus, DB existing tidak disentuh), B (mapping gagal setelah DB dibuat → DB dihapus, registry+mapping existing tidak tersentuh, tidak ada mapping yatim). Baca `provision.ts`: flag `created` hanya `true` setelah `createDatabase()` sukses; catch outer `provisionProjectWithMapping` hanya menghapus `result.databaseName` (yang pasti hasil invocation sukses ini, bukan DB lain) — kompensasi tidak pernah menyentuh resource di luar operasi ini.
**Catatan:** Perbaikan Review-CL-02/04 (CL-44/45) terverifikasi ulang secara independen, bukan sekadar membaca ulang klaim Dev. Tidak ada perubahan SOT.

<a id="qa-cl-31"></a>
### QA-CL-31 — 2026-08-21 · 0.6.2 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Re-run `test:smoke-global-mapping` live: 3/3 PASS — mapping tercatat di `project_databases` dan terbaca ulang; mapping duplikat untuk `project_id` sama ditolak (satu Project = satu database, A.4).
**Catatan:** Tidak ada perubahan SOT.

<a id="qa-cl-36"></a>
### QA-CL-36 — 2026-08-21 · 0.7.3 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Re-run `pnpm vitest run packages/contracts`: 3 file/14 test PASS. Baca `http-mapping.ts`: `CODE_TO_HTTP` memetakan seluruh 12 kode ke status HTTP masuk akal (403/404/409/410/422/401 sesuai semantik); `toErrorResponse` default aman ke 500 `INVALID_STATE` untuk kode tak dikenal (tidak bocor detail internal); `extractIdempotencyKey` trim + null untuk kosong/blank, konstanta header `Idempotency-Key` sesuai C.3.
**Catatan:** **Temuan non-blocking:** `packages/contracts/src/http-mapping.ts` punya perubahan **belum di-commit** di working tree (signature `extractIdempotencyKey(headers: Headers)` → `headers: { get(name): string|null }`) — sudah ada sejak awal sesi ini, tidak tertaut ke CL manapun, dan secara fungsional netral (tipe struktural yang kompatibel dengan `Headers`, tidak mengubah perilaku, semua test tetap hijau menyertakannya). Direkomendasikan Dev meng-commit atau membuang perubahan ini eksplisit alih-alih dibiarkan mengambang. Status per kode HTTP adalah keputusan teknis Dev (CL-39, C.2 tidak menetapkan status) — konsisten dan mudah diganti. Tidak ada perubahan SOT.

<a id="qa-cl-35"></a>
### QA-CL-35 — 2026-08-21 · 0.7.2 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca `error-codes.ts` dan bandingkan terhadap [02-SPEC C.2](docs/02-SPEC.md): tepat 12 kode kanonik, cocok persis (set & isi). `isErrorCode` type guard mempersempit ke union tertutup.
**Catatan:** Tidak ada perubahan SOT.

<a id="qa-cl-40"></a>
### QA-CL-40 — 2026-08-21 · 0.11.4 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Re-run `pnpm test:e2e`: `webServer` menjalankan `tsc build` real + `node dist/serve.js` real (bukan mock), health-check gate lulus, 1 test `e2e/health.spec.ts` PASS terhadap server production-like nyata. `@playwright/test@1.62.1` + `@hono/node-server@2.1.1` exact pin dikonfirmasi di `package.json`.
**Catatan:** Scope sengaja terbatas ke health-check (prinsip Phase 0 "plumbing bukan domain endpoint") — skenario E2E domain menunggu `apps/web` (Phase 7). Tidak ada perubahan SOT.

<a id="qa-cl-39"></a>
### QA-CL-39 — 2026-08-21 · 0.11.3 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca seluruh 6 file test: mayoritas nama test memakai format `ID-rule: deskripsi` sesuai konvensi B.6 (`AC-001/BR-007`, `INV-9/INV-MOVE-004`, `C.2`) — `db-isolation.test.ts`, `transaction.test.ts`, ketiga file `contracts/test/*` konsisten. B.6 memakai kata "SHOULD" (bukan MUST) sehingga test unit murni tanpa BR spesifik (mis. `project-db-name.test.ts`) yang tidak berlabel ID tetap dapat diterima.
**Catatan:** Tidak ada perubahan SOT.

<a id="qa-cl-38"></a>
### QA-CL-38 — 2026-08-21 · 0.11.2 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca `db-isolation.test.ts`: DB file terpisah per suite (10 tabel), `beforeEach` truncate memastikan test berikutnya mulai bersih (dibuktikan test eksplisit "test lain dimulai bersih"), suite kedua punya DB kosong sendiri (state tidak bocor lintas suite). Re-run `pnpm test`: seluruh assertion isolasi PASS.
**Catatan:** Mekanisme aktual adalah **truncate per test**, bukan literal SQL transaction rollback yang disebut B.5 — deviasi teknis yang sudah didokumentasikan jujur oleh Dev (CL-27), secara fungsional mencapai jaminan isolasi yang sama (state tidak bocor antar test/suite). Tidak ada perubahan SOT.

<a id="qa-cl-37"></a>
### QA-CL-37 — 2026-08-21 · 0.11.1 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `vitest@4.1.10` exact pin dikonfirmasi di `package.json` root (tanpa `^`). Re-run `pnpm test`: 6 file/23 test PASS mencakup unit + integration.
**Catatan:** Tidak ada perubahan SOT.

<a id="qa-cl-34"></a>
### QA-CL-34 — 2026-08-21 · 0.7.1 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca `api-response.ts`: `ok(data) → {data}`, `apiError(code,message) → {error:{code,message}}` — cocok persis bentuk C.2.
**Catatan:** Tidak ada perubahan SOT.

<a id="qa-cl-30"></a>
### QA-CL-30 — 2026-08-21 · 0.6.1 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Re-run `test:smoke-provision` live (Turso nyata — DB dibuat & dihapus sungguhan): 4/4 PASS — `project_state` tepat satu ACTIVE (`version=1`, `archived_at`/`deleted_at` NULL); Activity `project.created` tunggal dengan `entity_version=1`, payload `data.snapshot.name` sesuai B.5; Activity id memakai ULID (A.13); tx duplikat gagal tanpa meninggalkan activity yatim. Baca `provision.ts`: `project_state`+`activities` di-seed dalam satu `db.transaction` (atomik, F.2/INV #9).
**Catatan:** Dependency 0.5.3 saat ini `⚠️` (QA-CL-15) karena assertion count migration Global yang stale di script lain — tidak memengaruhi fungsi `applyProjectMigrations` yang dipakai di sini (terbukti 10 tabel Project terpasang benar via `test:smoke-provision`). Tidak ada perubahan SOT.

<a id="qa-cl-29"></a>
### QA-CL-29 — 2026-08-21 · 0.8.4 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Re-run `test:smoke-magic-link` live (Global DB Turso nyata): 21/21 PASS — termasuk yang paling invariant-sensitive: `enumeration-status`/`enumeration-body` (email dikenal vs tak dikenal → respons 200/`{status:true}` identik, tidak membocorkan keberadaan akun, sesuai A.14 "Keamanan minimum"), `token-hashed`/`token-raw-not-stored` (identifier = SHA-256 base64url, token mentah tidak pernah tersimpan), `verify-reuse`/`verify-expired`/`verify-invalid` (single-use+expiry), dan **`verify-concurrent` — dua konsumsi konkuren menghasilkan tepat satu sukses**, dijalankan ulang secara langsung oleh QA (bukan dipercaya dari klaim Dev). Baca `auth.ts`: `emailAndPassword.enabled:false`, tidak ada social provider terdaftar, `magicLink({storeToken:"hashed", expiresIn:300})`, `baseUrl`/callback origin berasal dari config eksplisit (bukan membaca `Request.Host`).
**Catatan:** Konsumsi atomik single-use adalah perilaku internal plugin Better Auth (bukan kode custom repo) — diverifikasi lewat perilaku end-to-end (race test), bukan audit kode library. Tidak ada perubahan SOT.

<a id="qa-cl-28"></a>
### QA-CL-28 — 2026-08-21 · 0.8.3 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Re-run `test:smoke-resolve-identity` live: 8/8 PASS — session valid ter-resolve; anonim/cookie invalid/expired → null; hasil `resolveIdentity()` identik dengan `auth.api.getSession()` langsung (satu titik resolusi, C.1).
**Catatan:** Fondasi langsung `ResolveIdentityStep` yang sudah diverifikasi di TASK-0.9 (QA-CL-21). Tidak ada perubahan SOT.

<a id="qa-cl-27"></a>
### QA-CL-27 — 2026-08-21 · 0.8.2 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Re-run `test:smoke-session` live: 16/16 PASS — session database-backed di `auth_sessions`; cookie HttpOnly+SameSite=Lax+Path=/, Secure hanya di origin https (dev http tidak dipaksa Secure); cookie cache/stateless nonaktif (`useCookieCache` falsy, sesuai A.14 "MUST tetap nonaktif"); signature tamper → null; revoke → row terhapus dari `auth_sessions` + `getSession` null.
**Catatan:** Tidak ada perubahan SOT.

<a id="qa-cl-26"></a>
### QA-CL-26 — 2026-08-21 · 0.8.1 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Re-run `test:smoke-auth` live: 3/3 PASS — `generateId` ULID custom; kolom snake_case sesuai B.2; email duplikat ditolak UNIQUE. Baca `auth.ts`: field mapping lengkap per model (user/session/account/verification) ke kolom snake_case B.2, `advanced.database.generateId: () => ulid().toLowerCase()` — seluruh auth state di Global DB (drizzleAdapter ke `config.globalClient`), tidak ada identity store kedua.
**Catatan:** Tidak ada perubahan SOT.

<a id="qa-cl-25"></a>
### QA-CL-25 — 2026-08-21 · 0.9.5 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca `pipeline.ts`: `RequestPipeline.run()` adalah satu urutan tetap identity → project/membership → database → permission, tidak ada cabang lain untuk keluar lebih awal ke resource. Re-run `test:smoke-pipeline` penuh: 11/11 PASS termasuk `pipe-cross-project-no-db` yang secara eksplisit membuktikan resolver DB Project B **tidak pernah dipanggil** untuk user A yang bukan anggota (spy pada resolver) — DoD "tidak ada bypass" terbukti langsung, bukan cuma diklaim.
**Catatan:** Fase 0 belum ada domain endpoint (prinsip "plumbing bukan domain endpoint") sehingga belum ada handler nyata yang bisa diperiksa memakai/tidak memakai pipeline ini — kepatuhan handler Phase 1+ terhadap "satu-satunya entry" perlu diverifikasi ulang saat endpoint domain pertama dibuat. Tidak ada perubahan SOT.

<a id="qa-cl-24"></a>
### QA-CL-24 — 2026-08-21 · 0.9.4 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca `permission-step.ts`: `EmptyPermissionResolver` selalu mengembalikan `{permission: null}`, kontrak `PermissionResolver.resolve(PermissionContext)` sudah membawa identity+project+membership (data yang dibutuhkan Phase 4 A.10 tanpa akses DB tambahan). `pipe-permission-seam` PASS di re-run.
**Catatan:** Seam kosong sesuai prinsip Phase 0. Tidak ada perubahan SOT.

<a id="qa-cl-23"></a>
### QA-CL-23 — 2026-08-21 · 0.9.3 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca `pipeline.ts` baris 38-46: `databaseStep.run()` (line 44) dipanggil setelah `projectStep.run()` (line 40) yang melempar `PROJECT_ACCESS_DENIED` bila membership tidak ada — urutan kode membuktikan resolve DB **hanya** terjadi pasca-verifikasi membership (A.4), bukan cuma urutan asersi test. `pipe-db`/`pipe-cross-project-no-db` PASS di re-run.
**Catatan:** Tidak ada perubahan SOT.

<a id="qa-cl-22"></a>
### QA-CL-22 — 2026-08-21 · 0.9.2 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca `global-reads.ts` `getMembership()`: filter `projectId` **AND** `userId` **AND** `revokedAt IS NULL` — cross-project dan revoked membership tidak bisa lolos (BR-009). Re-run `test:smoke-pipeline`: `pipe-project-membership`/`pipe-no-membership`/`pipe-cross-project`/`pipe-unknown-project`/`pipe-revoked-membership` 5/5 PASS.
**Catatan:** **Observasi non-blocking (bukan pelanggaran SOT eksplisit):** `LoadProjectStep` mengembalikan `RESOURCE_NOT_FOUND` 404 untuk project yang benar-benar tidak ada, tapi `PROJECT_ACCESS_DENIED` 403 untuk project yang ada tapi User bukan anggota — kombinasi ini membuat kode HTTP membocorkan **keberadaan** `project_id` ke User yang tidak berwenang (403 = "ada tapi bukan milikmu", 404 = "tidak ada"), berpotensi jadi enumeration side-channel di boundary isolasi Project (BR-007/C.4). CL-33 sendiri sudah mencatat ini sebagai "keputusan teknis Dev, mudah diubah" tanpa keputusan manusia eksplisit — tidak ada BR yang secara literal mewajibkan respons seragam, jadi QA tidak menahan goal ini, tapi direkomendasikan AI-Planning & Review menimbang apakah ini perlu `[NEEDS-DECISION]` sebelum Phase 4 (authorization penuh) dibangun di atasnya. Tidak ada perubahan SOT oleh QA.

<a id="qa-cl-21"></a>
### QA-CL-21 — 2026-08-21 · 0.9.1 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Re-run `test:smoke-pipeline` penuh (live Global DB + Better Auth session nyata): 11/11 PASS termasuk `pipe-identity`/`pipe-anonymous`/`pipe-invalid-cookie`. Baca `identity-step.ts`: `ResolveIdentityStep` adalah langkah pertama pipeline, melempar `TOKEN_EXPIRED` 401 bila resolver mengembalikan null — keputusan kode kanonik ini sudah tercatat sebagai **keputusan manusia** (CL-32), bukan asumsi Dev.
**Catatan:** Tidak ada perubahan SOT.

<a id="qa-cl-20"></a>
### QA-CL-20 — 2026-08-21 · 0.10.2 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Re-run `test:smoke-transaction`: 3/3 PASS (commit simpan mutation+activity bersama; rollback saat throw; atomik — mutation dibatalkan saat activity gagal, INV #9). **Gap ditemukan & ditutup:** CL-25 sendiri mencatat "perilaku busy retry terbukti di POC 0.2.3, bukan di helper ini" — smoke-transaction.ts memakai `file:` lokal, tidak pernah memicu `SQLITE_BUSY` nyata, dan `isBusy()` di `transaction.ts` (cek `String(error.cause ?? error).includes("SQLITE_BUSY")`) memakai mekanisme deteksi **berbeda** dari POC 0.2.3 (`e.code === "SQLITE_BUSY"`) — potensi false-negative tidak pernah diuji. QA menulis skrip sementara (dihapus setelah run, tidak di-commit) yang memanggil `runInWriteTransaction` langsung (bukan transaksi manual seperti POC) dengan 20 worker konkuren terhadap Turso remote nyata, increment counter shared row: **2× run, 20/20 sukses, 0 lost update, 0 `TransactionBusyError` (retry habis), 0 unhandled-busy-error (isBusy() gagal deteksi)** — retry logic helper produksi ini terbukti benar-benar menangani `SQLITE_BUSY` remote nyata, bukan cuma diasumsikan dari POC yang beda kode.
**Catatan:** Ini menutup gap concurrency-sensitive yang secara jujur diakui Dev di CL-25 (AGENTS §11.3.4 — bug interleaving tidak terlihat dari pembacaan kode). Rekomendasi non-blocking: tambahkan test serupa (retry-under-contention) permanen ke `smoke-transaction.ts` atau suite terpisah agar tidak bergantung pada verifikasi manual QA di masa depan. Tidak ada perubahan SOT, tidak ada file baru yang di-commit.

<a id="qa-cl-19"></a>
### QA-CL-19 — 2026-08-21 · 0.10.1 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Re-run `test:smoke-repository`: 5/5 PASS. Baca `packages/domain/src/project/project-repository.ts` (interface + record type polos) dan `grep drizzle packages/domain/src` → kosong (tidak ada import Drizzle di domain). `packages/infrastructure/src/database/project-repository.ts` (`DrizzleProjectRepository`) mengimplementasikan interface tsb, drizzle hanya dipakai di sisi infrastructure.
**Catatan:** Boundary A.7/A.12 bersih. Tidak ada perubahan SOT.

<a id="qa-cl-18"></a>
### QA-CL-18 — 2026-08-21 · 0.4.3 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Re-run `pnpm --filter @kanban/infrastructure test:smoke-migration`: PASS — apply 2x (sebelum & sesudah insert data) tidak mengubah journal/struktur/data. Script sudah tidak hard-code jumlah migration (dibaca dinamis dari `readdirSync`, perbaikan CL-43) — tidak rapuh seperti temuan QA-CL-15 di `smoke-migrate-programmatic.ts`.
**Catatan:** Idempotency migration Global terbukti live. Tidak ada perubahan SOT.

<a id="qa-cl-17"></a>
### QA-CL-17 — 2026-08-21 · 0.4.2 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Re-run `pnpm --filter @kanban/infrastructure test:smoke-global-constraints`: 15/15 PASS — UNIQUE users.email/membership/group_permissions; partial UNIQUE assignment aktif (WHERE `revoked_at IS NULL`) termasuk re-add setelah revoke; ketiga tabel scoped (`membership_group_assignments`, `membership_permission_assignments`, `invitation_group_assignments`) menerima `scope_type` `list`/`card` dan menolak nilai di luar enum (CHECK) — perbaikan Review-CL-02/04 (CL-41/42/43) terbukti utuh, bukan cuma diklaim; credential tersimpan hash-only (`key_hash`/`token_hash`), `auth_verifications.identifier` = wadah hash (magicLink `storeToken:"hashed"`); mapping kolom Better Auth core lengkap snake_case B.2. `grep uniqueIndex` di `global-schema.ts`/`project-schema.ts`: tidak ada UNIQUE pada kolom `name`/`title` domain manapun (DoD "tidak ada UNIQUE(name/title) domain" terpenuhi).
**Catatan:** Perbaikan Review-CL-02/04 (CHECK scope_type list/card, rollback compensate-only-created, ULID activity id) sudah tervalidasi silang di sini melalui hasil constraint test — sejalan dengan verifikasi live 0.6.1 (QA belum menyentuh 0.6.x, dicatat sebagai konsistensi lintas goal). Tidak ada perubahan SOT.

<a id="qa-cl-16"></a>
### QA-CL-16 — 2026-08-21 · 0.4.1 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca `global-schema.ts` dan bandingkan terhadap [03-ENG B.2](docs/03-ENGINEERING.md): 16 tabel cocok (termasuk Better Auth core `auth_sessions`/`auth_accounts`/`auth_verifications` snake_case B.2, scoped Group/direct Permission assignments). Re-run `pnpm --filter @kanban/infrastructure test:smoke-global-schema`: 3/3 PASS (16 tabel di DDL & DB; 8 UNIQUE index inti ada). ID kolom TEXT (ULID diisi app layer sesuai A.13) — dikonfirmasi silang: `provision.ts`/`auth.ts` memanggil `ulid()` untuk id Activity/user (A.13).
**Catatan:** Tidak ada perubahan SOT.

<a id="qa-cl-15"></a>
### QA-CL-15 — 2026-08-21 · 0.5.3 🔎 → ⚠️
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Re-run `pnpm --filter @kanban/infrastructure test:smoke-migrate-programmatic`: 3 assertion khusus Project **PASS** (`applyProjectMigrations` terprogram 10 tabel; junction punya `removed_at`; apply ulang idempotent) — DoD fan-out Project terbukti. Tapi assertion Global di script yang sama **FAIL**: `journal global != 1`. Root cause dibaca di `scripts/smoke-migrate-programmatic.ts` baris 20: hard-code `COUNT(*) FROM __drizzle_migrations !== 1`; sejak commit `ee31ae5`/`bf42e17` (perbaikan 0.4.2, di luar scope 0.5.x) migration Global bertambah jadi 2 file (`0000_global_schema_v1.sql` + `0001_scope_type_list_card.sql`, incremental — bukan regen ulang). `applyGlobalMigrations` (`migrate.ts`) sendiri hanya memanggil `drizzle-orm` migrator apa adanya terhadap folder migrations — tidak ada bug fungsional, murni assertion count yang stale.
**Catatan:** Bukan regresi fungsional 0.5.3, tapi bukti CL-18 sebagai satu kesatuan command tidak reproducible (exit 1) — sesuai §11.3.3(a) dikembalikan ke Dev. Perbaikan disarankan: assertion global journal jangan hard-code angka absolut (ganti ke `>= 1` atau assert nama migration spesifik ter-apply), supaya tidak rapuh tiap kali ada migration Global baru (0.4.x, 0.12.2, dst.). Tidak ada perubahan SOT.

<a id="qa-cl-14"></a>
### QA-CL-14 — 2026-08-21 · 0.5.2 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Re-run `pnpm --filter @kanban/infrastructure test:smoke-project-behavior`: 6/6 PASS — partial UNIQUE menolak duplikat label aktif; re-add setelah `removed_at` diterima (riwayat junction append-only, tidak ada delete fisik); `activities` polymorphic + `data` JSON round-trip untuk `card.moved` sesuai bentuk baku B.5 (`from`/`to` dengan `list_id`/`list_title`/`board_id`/`board_title`); `entity_type` di luar enum ditolak CHECK; query polymorphic entity_type+entity_id berfungsi.
**Catatan:** Bentuk payload `card.moved` yang diuji cocok persis dengan tabel B.5. Tidak ada perubahan SOT.

<a id="qa-cl-13"></a>
### QA-CL-13 — 2026-08-21 · 0.5.1 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Baca `project-schema.ts` dan bandingkan field-by-field terhadap [03-ENG B.3](docs/03-ENGINEERING.md): 10 tabel cocok persis (nama tabel, kolom, referensi, tanpa `project_id` di tabel child — isolasi via DB per B.1). Re-run `pnpm --filter @kanban/infrastructure test:smoke-project-schema`: 4/4 PASS (10 tabel B.3; `project_state` otoritatif + `version`/lifecycle timestamp di seluruh entity; junction punya `removed_at`; migration idempotent).
**Catatan:** `activities.entity_type` CHECK eksplisit (drizzle sqlite tidak auto-emit CHECK untuk enum) — temuan CL-17 yang konsisten dan sudah diterapkan di sini. Tidak ada perubahan SOT.

<a id="qa-cl-12"></a>
### QA-CL-12 — 2026-08-21 · 0.3.3 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Re-run `pnpm --filter @kanban/infrastructure test:smoke-guard`: 3/3 PASS (positif resolve dikenal; negatif `resolveOrThrow` project tak dikenal → `ProjectDatabaseNotFoundError`; negatif guard tidak menyentuh Project DB lain). Baca `resolveOrThrow` (`project-resolver.ts`): melempar `ProjectDatabaseNotFoundError` saat mapping `null`, tidak pernah fallback ke mapping lain — BR-007/BR-009 (hard isolation boundary) terpenuhi di titik resolusi.
**Catatan:** Fondasi langsung untuk pipeline 0.9.3 (resolve DB setelah verifikasi membership). Tidak ada perubahan SOT.

<a id="qa-cl-11"></a>
### QA-CL-11 — 2026-08-21 · 0.3.2 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Re-run `pnpm --filter @kanban/infrastructure test:smoke-resolver`: 3/3 PASS (resolve project_id dikenal → mapping benar; project_id tak dikenal → `null`; project_id kosong → `null`, tidak pernah menyentuh DB lain). Baca `SqliteProjectDatabaseResolver` (`project-resolver.ts`): query terparameterisasi (`?` bind, bukan interpolasi string) ke `project_databases`, resolver di balik interface `ProjectDatabaseResolver`.
**Catatan:** Tidak ada koneksi Project DB hard-coded; DoD task terpenuhi. Tidak ada perubahan SOT.

<a id="qa-cl-10"></a>
### QA-CL-10 — 2026-08-21 · 0.3.1 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Re-run `pnpm --filter @kanban/infrastructure test:smoke` (dengan `.env` nyata, pasca fix CL-46): 5/5 PASS (3 negatif: env tidak lengkap/url non-libsql/token kosong → throw; 2 positif: `createGlobalClient`/`createProjectClient` → `SELECT 1` ok terhadap Turso remote nyata). Baca `factory.ts`: `createGlobalClient`/`createProjectClient` terpisah sesuai A.4 (Global vs Project client), tidak ada URL/token hard-coded — parameter eksplisit atau `process.env` via `parseGlobalDbEnv`.
**Catatan:** Evidence CL-08 kini reproducible penuh setelah regresi `GLOBAL_DB_TOKEN` (lihat QA-CL-02/QA-CL-09) diperbaiki di `factory.ts`. Tidak ada perubahan SOT.

<a id="qa-cl-09"></a>
### QA-CL-09 — 2026-08-21 · 0.1.2 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Re-run `pnpm --filter @kanban/infrastructure test:smoke` dengan `.env` nyata: 5/5 PASS termasuk `negatif: GLOBAL_DB_TOKEN hilang -> throw` yang sebelumnya FAIL di QA-CL-02. Diff `factory.ts` dikonfirmasi: `GLOBAL_DB_TOKEN` kembali `z.string().min(1)` (CL-46). Struktur folder A.7 sudah terverifikasi sebelumnya di QA-CL-02, tidak berubah.
**Catatan:** Regresi commit `cc8c3e7` untuk goal ini selesai ditutup oleh sesi Dev paralel (`b147962`). Tidak ada perubahan SOT.

<a id="qa-cl-08"></a>
### QA-CL-08 — 2026-08-21 · 0.2.4 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `poc/RESULTS.md` §"Cost projection & GO/NO-GO" mengagregasi keempat item gate A.11 dengan verdict eksplisit (1 conditional/⚠️ region-mismatch, 2/3/4 ✅). Keputusan manusia tercatat di **CL-07**: "Turso GO + provisioning SINKRON" (2026-08-18) — memenuhi DoD task ("Keputusan tercatat: GO/NO-GO dan sinkron/async"). Dev secara benar tidak mengamandemen SOT A.11 sendiri, hanya mencatat rekomendasi amandemen untuk AI-Planning & Review (governance §3 dipatuhi).
**Catatan:** Task `[GATING]` untuk 0.6 kini terbuka — 0.6.1/0.6.4 dapat mengacu ke keputusan GO+sinkron ini. Rekomendasi ke AI-Planning & Review (hapus "pending POC gate" dari A.11) belum dieksekusi — bukan blocker QA, catat sebagai follow-up governance. Tidak ada perubahan SOT oleh QA.

<a id="qa-cl-07"></a>
### QA-CL-07 — 2026-08-21 · 0.2.3 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Re-run langsung `poc/measure/scripts/concurrency.ts` terhadap Turso `poc-latency` nyata (20 worker): naive → final 2/20 (lost 18); `transaction("write")` + retry → final 20/20 (lost 0, busy 0); optimistic locking (version check) → final 20/20 (lost 0, 174 konflik terdeteksi). Hasil konsisten secara kualitatif dengan CL-04 (lost update masif tanpa tx; nol lost update dengan tx write-mode maupun optimistic locking) — variasi jumlah lost/konflik antar run adalah perilaku race-condition yang diharapkan, bukan penyimpangan.
**Catatan:** Ini bukti paling invariant-critical di TASK-0.2 (INV #6/#7 — mutation konkuren wajib validasi state + optimistic concurrency). Reproduksi ulang berhasil dan menguatkan kesimpulan CL-04: `"immediate"` tidak didukung driver 0.17.4 HTTP, `"write"` adalah padanan `BEGIN IMMEDIATE`; `PRAGMA busy_timeout` dilarang protokol hrana → retry application-level wajib untuk 0.6/Phase 6. Tidak ada perubahan SOT.

<a id="qa-cl-06"></a>
### QA-CL-06 — 2026-08-21 · 0.2.2 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `poc/results-provisioning.jsonl` diperiksa langsung: 5 baris raw (2 percobaan awal `readyMs:-1` tidak dihitung di tabel ringkasan, 3 run lengkap cocok persis dengan tabel `poc/RESULTS.md` §0.2.2 — create 1305.2/710.5/713.8 ms, token 606.8/599.5/499.0 ms, ready 2470.2/2044.7/2114.8 ms, firstQuery 245.0/295.8/293.6 ms); seluruh 5 baris `"deleted":true` (cleanup terbukti, tidak ada DB orphan).
**Catatan:** Tidak re-trigger provisioning nyata (create/delete DB tambahan) untuk QA ini — raw data + summary sudah konsisten dan re-provisioning menambah resource cloud tanpa menambah keyakinan berarti. Temuan CL-06 (org API token ≠ kredensial libsql; JWT per-DB wajib) relevan untuk 0.6/0.8 — dicatat, bukan blocker di sini. Tidak ada perubahan SOT.

<a id="qa-cl-05"></a>
### QA-CL-05 — 2026-08-21 · 0.2.1 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Re-run `poc/measure/scripts/measure.ts warm` (n=10) terhadap deployment Vercel production nyata (`$POC_URL/api/measure`): total p50 465.49 ms / dbMs p50 190.86 ms — konsisten dengan CL-03 (total p50 459.90 ms / dbMs p50 189.90 ms). Cold start tidak diukur ulang (butuh idle ≥10 menit di luar sesi QA ini); dua sampel cold CL-03 (2474/2383 ms, body `dbMs` terverifikasi) dianggap kredibel karena profil warm tereproduksi persis dan konsisten dengan overhead boot yang dijelaskan.
**Catatan:** `.env` lokal `POC_URL` saat ini hanya domain dasar (bukan `.../api/measure`); `poc/measure/scripts/measure.ts` mengharapkan `POC_URL` = URL endpoint penuh. QA menambahkan suffix manual saat re-run. Rekomendasi kecil ke Dev: perbarui `.env`/`.env.example` POC agar `POC_URL` sudah menunjuk endpoint penuh, supaya langkah "Reproduksi" §5 RESULTS.md tidak ambigu — bukan blocker (bukti asli tetap reproducible). Tidak ada perubahan SOT.

<a id="qa-cl-04"></a>
### QA-CL-04 — 2026-08-21 · 0.1.4 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-config`: 4/4 negatif PASS (secret <32, resend kosong, dev+origin produksi, staging+BETTER_AUTH_URL salah) + 5/5 positif PASS (preview override, production, staging, development default sender, template dev/staging/prod dengan origin kanonik unik + secret Resend terpisah). `.env.example` diperiksa manual: berisi `GLOBAL_DB_URL/TOKEN`, `BETTER_AUTH_SECRET/URL`, `AUTH_RESEND_KEY`, `MAIL_FROM`, semua placeholder tanpa secret nyata. `git grep` untuk pola secret di file ter-tracked (`.env*.example` dikecualikan) tidak menemukan hasil.
**Catatan:** Bukti CL-10 reproducible; jumlah kasus positif smoke-config sudah bertambah dari 3 menjadi 5 dibanding CL-10 (penambahan test `AUTH_ALLOW_NON_CANONICAL` dari pekerjaan 0.12.3 yang belum tercermin di Status/CL 0.12.x — lihat catatan silang di QA-CL-02) — tidak menurunkan cakupan negatif/positif asli, jadi tidak menghalangi ✅. Tidak ada perubahan SOT.

<a id="qa-cl-03"></a>
### QA-CL-03 — 2026-08-21 · 0.1.3 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `grep` seluruh `package.json` workspace untuk dependency inti: `hono@4.13.2`, `typescript@6.0.2`, `@libsql/client@0.17.4`, `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`, `zod@4.4.3`, `ulid@3.0.2` — semua exact pin tanpa `^`/`~`/prerelease tag. `git ls-files pnpm-lock.yaml` mengonfirmasi lockfile ter-commit. `pnpm -r build`, `pnpm -r typecheck`, `pnpm lint` seluruhnya exit 0 (dijalankan ulang bersama 0.1.1/0.1.2/0.1.4).
**Catatan:** ESLint/Prettier versi sesuai catatan CL-05 (`@eslint/js` 10.0.1, tidak ada 10.8.1 di registry) — konsisten, bukan penyimpangan. Tidak ada perubahan SOT.

<a id="qa-cl-02"></a>
### QA-CL-02 — 2026-08-21 · 0.1.2 🔎 → ⚠️
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Struktur folder A.7 terverifikasi cocok (`apps/api`, `apps/web` placeholder, `packages/{domain,contracts,shared,infrastructure}`); `pnpm -r build`/`typecheck`/`lint` hijau. Namun bukti yang dikutip CL-09 (`pnpm --filter @kanban/infrastructure test:smoke`) **tidak reproducible**: dijalankan ulang dengan `.env` lokal (TURSO_DB_URL/TOKEN terisi) → kasus `negatif: GLOBAL_DB_TOKEN hilang -> throw` **FAIL** (seharusnya throw, tidak throw). Root cause: `packages/infrastructure/src/database/factory.ts` — `GlobalDbEnvSchema.GLOBAL_DB_TOKEN` diubah dari `z.string().min(1)` menjadi `z.string().default("")` pada commit `cc8c3e7` (2026-08-20, pekerjaan 0.12.x), sehingga `parseGlobalDbEnv`/`createGlobalClient` tidak lagi menolak token kosong — regresi validasi fail-fast untuk credential Global DB.
**Catatan:** `[NEEDS-DECISION]` tidak diperlukan (ini murni bug implementasi, bukan ambiguitas spesifikasi) — kembalikan ke Dev untuk revert `GLOBAL_DB_TOKEN` ke required (`.min(1)`) dan re-run `test:smoke`. **Temuan silang di luar scope 0.1.2 (dicatat, bukan diubah statusnya di sini):** commit `cc8c3e7` mengklaim di pesan commit bahwa goal 0.12.1–0.12.5 pindah ke "review (80%)", tetapi `PHASE-0-TASKS.md` tidak ikut diubah pada commit tsb — goal 0.12.1–0.12.5 di disk saat ini masih `⬜️`/0%/CL `—`, melanggar §6.1 AGENTS.md (perubahan Status/%/CL wajib satu commit dengan implementasi). Direkomendasikan AI-Dev membuka `0.12.x → 🔄` dengan CL yang benar sebelum melanjutkan; regresi `factory.ts` di atas juga perlu diperbaiki sebagai bagian dari itu karena file yang sama disentuh di commit tersebut. Tidak ada perubahan SOT.

<a id="qa-cl-01"></a>
### QA-CL-01 — 2026-08-21 · 0.1.1 🔎 → ✅
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `git rev-parse --is-inside-work-tree` = true; `node -v` = v24.19.0 (memenuhi `engines` `>=24.18.0 <25`); `pnpm -v` = 11.22.0 (cocok `packageManager`). `pnpm install --frozen-lockfile` clean ("Already up to date"). `pnpm -r build` dan `pnpm -r typecheck` seluruh 7 workspace project exit 0; `pnpm lint` (`eslint .`) exit 0. Smoke Hono: `createApiApp().app.request('/api/v1/health')` → `200 {"data":{"status":"ok","env":"unknown"}}`. `git ls-files pnpm-lock.yaml` konfirmasi lockfile ter-commit; `git grep` pola secret di file ter-tracked (kecuali `*.example`) tidak menemukan hasil; `.env` asli tidak ter-track (`.gitignore` baris 4–6, 18, 20).
**Catatan:** Semua bukti CL-01 reproducible ulang. `env:"unknown"` pada health response adalah perilaku yang disengaja (index.ts baris 31-37: config gagal dimuat di environment minimal → health tetap hidup, bukan bug). Tidak ada perubahan SOT.

<a id="review-cl-04"></a>
### Review-CL-04 — 2026-08-18 · architecture/SOT review 0.4.2, 0.6.1, 0.6.3
**Role:** AI-Planning & Review · **Model:** Codex
**Bukti:** Review langsung terhadap 03-ENGINEERING A.13, B.2, F.2 dan implementasi `global-schema.ts`, migration Global, `provision.ts`, serta `smoke-rollback.ts`. (1) B.2 mensyaratkan scope `project|milestone|board|list|card` untuk `membership_group_assignments`, `membership_permission_assignments`, **dan** `invitation_group_assignments`; ketiga CHECK constraint/migration masih menolak `list/card`, walau type TypeScript sudah memuat keduanya. (2) F.2 mengizinkan kompensasi hanya atas DB hasil invocation yang gagal; `provisionProjectDatabase()` selalu memanggil `deleteDatabase(databaseName)` dalam `catch`, dan test C saat ini malah mengharapkan DB yang sudah ada ikut dihapus. (3) A.13 mewajibkan ULID bagi semua primary key; Activity `project.created` memakai ID deterministik non-ULID.
**Catatan:** Handoff Dev: perluas ketiga CHECK + migration snapshot/DDL dan test insert positif List/Card serta negatif enum invalid; lacak flag/hasil `createDatabase` dan hanya kompensasikan DB yang berhasil dibuat invocation tersebut, sementara test name-conflict wajib membuktikan DB existing tetap ada; buat `activities.id` memakai ULID (prefix opsional). Handoff QA: verifikasi migration fresh dan idempotent, seluruh tiga tabel menerima List/Card, existing DB tidak terhapus pada conflict, serta ID Activity lolos validator ULID dan transaksi tetap atomik. Tidak ada perubahan SOT dan tidak ada implementasi di lane ini.

<a id="review-cl-03"></a>
### Review-CL-03 — 2026-08-18 · 0.1.5 ⬜️ → ⚠️
**Role:** AI-Planning & Review · **Model:** Codex
**Bukti:** `compose.devenv.yml` mematok `node:24.18.0-bookworm-slim`, Corepack pnpm 11.22.0, `pnpm install --frozen-lockfile`, build, typecheck, lint, dan `test:smoke-config`; `docker compose -f compose.devenv.yml config` sukses. Tetapi image belum tersedia lokal dan pull dari Docker Hub terhenti, sehingga runtime pipeline belum dapat dibuktikan. Image lokal Node 24.16.0 tidak memenuhi `package.json#engines` `>=24.18.0 <25`.
**Catatan:** Goal Compose adalah alat verifikasi bootstrap sehingga tidak bergantung pada 0.1.1. Jangan mengganti ke Node 24.16.0 atau melonggarkan `engines`; Dev melanjutkan setelah image 24.18.0 tersedia.

<a id="review-cl-02"></a>
### Review-CL-02 — 2026-08-18 · 0.4.2, 0.6.1, 0.6.3 🔎 → ⚠️
**Role:** AI-Planning & Review · **Model:** Codex
**Bukti:** Pada kode `stag`, `global-schema.ts` dan migration masih membatasi `scope_type` ke `project/milestone/board`, padahal `scopedScopeType` serta 03-ENGINEERING B.2/BR-042 juga mensyaratkan `list/card`; `provisionProjectDatabase()` tetap menghapus database dalam catch meski `createDatabase()` gagal sebelum membuatnya; dan Activity `project.created` masih memakai ID deterministik `act_${projectId}_created`, bukan ULID.
**Catatan:** Dev perlu memperluas CHECK/migration + test positif/negatif List/Card; hanya menghapus DB yang dibuat invocation gagal dan mengubah test konflik nama agar membuktikan DB existing tidak terhapus; gunakan ULID untuk activity provisioning. Tidak ada perubahan SOT.

```
<a id="cl-01"></a>
### CL-01 — YYYY-MM-DD · <ID goal> <status baru>
**Role:** AI-Dev · **Model:** <nama/identifier model aktual; jika tidak diekspos, nama platform>
**Bukti:** <output command / log / screenshot yang bisa diverifikasi ulang>
**Catatan:** <penyimpangan dari Scope asli, atau alasan gagal jika ⚠️>

<a id="qa-cl-01"></a>
### QA-CL-01 — YYYY-MM-DD · <ID goal> <status baru>
**Role:** AI-QA · **Model:** <nama/identifier model aktual; jika tidak diekspos, nama platform>
**Bukti:** <hasil verifikasi ulang yang reproducible>
**Catatan:** <hasil QA, atau alasan gagal jika ⚠️>

<a id="review-cl-01"></a>
### Review-CL-01 — YYYY-MM-DD · <ID goal> <hasil review>
**Role:** AI-Planning & Review · **Model:** <nama/identifier model aktual; jika tidak diekspos, nama platform>
**Bukti:** <file/rule/test yang diperiksa>
**Catatan:** <temuan architecture drift/konsistensi, atau "tidak ada temuan">
```

<a id="cl-41"></a>
### CL-41 — 2026-08-21 · 0.4.2 ⚠️ → 🔄
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** (mulai) Membaca ulang Review-CL-02/04 + 03-ENGINEERING B.2 + `global-schema.ts`. Konfirmasi temuan: `membership_group_assignments_scope_check`, `membership_permission_assignments_scope_check`, `invitation_group_assignments_scope_check` (global-schema.ts baris 178/204/243) dan migration `0000_global_schema_v1.sql` masih membatasi `scope_type` ke `('project','milestone','board')`, padahal `scopedScopeType` TS union sudah `project|milestone|board|list|card`.
**Catatan:** Lanjut: perluas ketiga CHECK constraint (schema + migration) ke 5 nilai, regenerate migration (pre-deploy, aman diregenerasi total sesuai preseden CL-17), tambah test positif List/Card + negatif enum invalid di `smoke-global-constraints.ts`. Tidak ada perubahan SOT.

<a id="cl-42"></a>
### CL-42 — 2026-08-21 · 0.4.2 🔄 → 🔎
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Perbaikan Review-CL-02/04 diterapkan: `global-schema.ts` — 3 CHECK constraint (`membership_group_assignments_scope_check`, `membership_permission_assignments_scope_check`, `invitation_group_assignments_scope_check`) diperluas dari `('project','milestone','board')` ke `('project','milestone','board','list','card')`, sesuai `scopedScopeType` TS union & B.2/BR-042. Migration `0000_global_schema_v1.sql` diregenerasi total via `drizzle-kit generate` (preseden CL-17, pre-deploy tanpa data produksi) — DDL terbukti (`grep scope_check`) memuat 5 nilai di ketiga constraint. `scripts/smoke-global-constraints.ts` diperluas: 3 insert positif (list/card) + 3 insert negatif (enum invalid → CHECK violation) untuk ketiga tabel. `pnpm --filter @kanban/infrastructure test:smoke-global-constraints` — 15 assertion PASS (termasuk 6 baru). `pnpm --filter @kanban/infrastructure test:smoke-global-schema` + `test:smoke-migration` tetap PASS (16 tabel, idempotent) — tidak ada regresi dari regenerasi migration. `pnpm -r typecheck` exit 0; `pnpm lint` exit 0; `pnpm test` (vitest) 6 file/23 test PASS.
**Catatan:** Mapping Better Auth, uniqueness, dan hash credential (bagian lain goal ini) sudah terbukti sebelumnya di CL-14/QA — tidak disentuh ulang di sini karena di luar temuan Review-CL-02/04. Tidak ada perubahan SOT. Siap 🔎 untuk QA (verifikasi independen migration + constraint + test).

<a id="cl-45"></a>
### CL-45 — 2026-08-21 · 0.6.3 ⚠️ → 🔎
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Sama dengan CL-44 (satu commit `bf42e17`, satu run smoke-rollback) — dianalisis terpisah karena atribusi Review-CL-02/04 finding (2) meliputi baik fungsi (`provisionProjectDatabase`, milik 0.6.1) maupun perilaku rollback keseluruhan yang diuji `smoke-rollback.ts` skenario A/B/C (milik goal ini, evidence asli CL-22). Diverifikasi tidak ada bug tambahan di `provisionProjectWithMapping` (dipakai 0.6.2/0.6.3): catch outer-nya hanya memanggil `deleteDatabase(result.databaseName)` — `result` hanya terisi setelah `provisionProjectDatabase` sukses, sehingga DB yang dihapus pasti hasil invocation ini sendiri (bukan DB existing/name-conflict, yang ditangani di level dalam per CL-44). Registry `projects`+`project_databases` di-rollback otomatis via `db.transaction` (bukan manual delete) — atomik sesuai F.2. **Live run** (`pnpm --filter @kanban/infrastructure test:smoke-rollback`, Turso group `ngodingin-kanban`): PASS A (apiToken invalid → tidak ada DB yatim, registry rollback), PASS C (name conflict → kompensasi hanya DB hasil invocation gagal, DB existing tidak disentuh, registry rollback), PASS B (mapping duplikat gagal → DB dihapus, registry+mapping eksisting tidak tersentuh, tidak ada mapping yatim). `pnpm -r typecheck`/`pnpm lint`/`pnpm test` hijau (lihat CL-44).
**Catatan:** Tidak ada perubahan kode tambahan khusus 0.6.3 di luar yang sudah tercakup CL-44 — DoD task ("simulasi kegagalan → tidak ada DB/mapping yatim") terbukti oleh skenario A/B/C yang sama. Tidak ada perubahan SOT. Siap 🔎 untuk QA.

<a id="cl-51"></a>
### CL-51 — 2026-08-21 · 0.5.3 ⚠️ → 🔎
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** QA-CL-15 mendiagnosis `scripts/smoke-migrate-programmatic.ts` baris 20 hard-code `journal global !== 1` — rapuh sejak migration Global bertambah jadi 2 file (CL-42/CL-43, incremental, di luar scope 0.5.x). Diperbaiki (pola sama dengan fix `smoke-migration.ts` di CL-43): baca jumlah file `.sql` aktual di `drizzle/migrations` dan `drizzle/migrations-project` via `readdirSync`, assertion journal Global maupun Project (termasuk cek idempotent baris 37 yang punya kerapuhan sama, sekalian diperbaiki preventif) dibandingkan ke jumlah file nyata, bukan angka hard-code. `pnpm --filter @kanban/infrastructure test:smoke-migrate-programmatic`: 4/4 PASS — `applyGlobalMigrations terprogram (journal 2)`, `applyProjectMigrations terprogram (10 tabel)`, `junction punya removed_at`, `apply ulang idempotent`. `pnpm -r typecheck` exit 0; `pnpm lint` exit 0; `pnpm test` (vitest) tetap PASS.
**Catatan:** Bukan bug fungsional (dikonfirmasi QA-CL-15 dan diverifikasi ulang di sini) — murni assertion count yang tidak tahan terhadap penambahan migration Global di masa depan (mis. 0.12.2). Fix sekarang generik untuk migration Global maupun Project. Tidak ada perubahan SOT. Siap 🔎 untuk QA.

<a id="cl-50"></a>
### CL-50 — 2026-08-21 · Insiden — `.github/workflows/ci.yml` gagal di GitHub Actions (bukan transisi goal)
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** User melaporkan run GitHub Actions gagal: `pnpm/action-setup@v4` error "Multiple versions of pnpm specified: version 11 di config Action vs pnpm@11.22.0 di package.json#packageManager". Root cause: `.github/workflows/ci.yml` (committed `cc8c3e7`, bagian anomali TASK-0.12 yang sama) memakai `with: version: 11` di step `pnpm/action-setup@v4`, bentrok dengan `packageManager: pnpm@11.22.0` yang sudah eksplisit di `package.json` root. Diperbaiki: hapus input `version` (action otomatis membaca `packageManager`). Ditemukan bug kedua saat simulasi lokal seluruh step CI: step "Migration smoke"/"Migration fan-out smoke" memakai `GLOBAL_DB_TOKEN: ""` — sebelum perbaikan regresi 0.1.2 (CL-46) ini kebetulan lolos karena `GLOBAL_DB_TOKEN` sempat menerima string kosong (`z.string().default("")`); setelah 0.1.2 dikembalikan ke `.min(1)` (perilaku benar sesuai spek), token kosong ditolak fail-fast → CI migration step akan mulai gagal begitu berjalan. Diperbaiki: `GLOBAL_DB_TOKEN: ""` → `GLOBAL_DB_TOKEN: ci-local-placeholder` (dikonfirmasi aman: token diabaikan `@libsql/client` untuk URL `file:`, hanya relevan untuk `libsql://` remote). **Simulasi penuh lokal** seluruh urutan step `ci.yml` (install --frozen-lockfile → typecheck → lint → test → build → migrate:global → migrate:projects) dengan env persis seperti workflow: **seluruhnya sukses** ("ALL GREEN"), termasuk `migrate:global` 1 DB termigrasi dan `migrate:projects` 0/0 (tidak ada Project DB terdaftar, konsisten).
**Catatan:** Sama seperti CL-49, ini perbaikan bug konkret di file yang **sudah** ter-commit sebagai bagian anomali TASK-0.12 — bukan klaim goal 0.12.1 selesai. Verifikasi run GitHub Actions hijau yang sesungguhnya perlu dicek user pasca-push (tidak ada akses `gh`/API GitHub dari sesi ini untuk memverifikasi otomatis). Anomali TASK-0.12 secara keseluruhan (status ⬜️/0%/CL "—" vs kode yang sudah ada; keputusan `apps/api/build.mjs`+`vercel.json` uncommitted) masih belum diselesaikan. Tidak ada perubahan SOT.

<a id="cl-52"></a>
### CL-52 — 2026-08-21 · 0.12.1 ⬜️ → 🔄 → 🔎 (satu sesi, Gate A lalu Gate B)
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `.github/workflows/ci.yml` (kode sudah ada sejak `cc8c3e7`, tapi Status/%/CL goal ini tidak pernah dibuka — anomali yang dicatat QA-CL-02) menjalankan `pnpm install --frozen-lockfile` → `typecheck` → `lint` → `test` → `build` → migration smoke, trigger `on: push: branches:[main, stag]` + `pull_request:` (seluruh PR) — memenuhi scope goal "CI: typecheck + test otomatis per push/PR". **Verifikasi lewat GitHub Actions API sungguhan** (`curl api.github.com/repos/ngodingin/kanban/actions/runs?branch=stag`), bukan cuma simulasi lokal: histori run `ci.yml` di branch `stag` sejak diperkenalkan **selalu `failure`** (`cc8c3e7`, `68c2692`, `40d8fb8`) — dua bug nyata (pnpm version conflict + `GLOBAL_DB_TOKEN` kosong, lihat CL-50) baru diperbaiki di komit ini. Setelah fix: `fce3406` → **success** ([run 32488241550](https://github.com/ngodingin/kanban/actions/runs/32488241550)), `d0f4796` → **success** ([run 32491613908](https://github.com/ngodingin/kanban/actions/runs/32491613908)) — dua run hijau berturut-turut, reproducible, memenuhi Test task "CI hijau di branch".
**Catatan:** Dibuka `⬜️ → 🔄 → 🔎` dalam satu sesi (Gate A lalu Gate B, §6.1 AGENTS.md) karena kode+fix+bukti run hijau semuanya sudah terverifikasi Dev sebelum entry ini dibuat — bukan klaim atas pekerjaan sesi lain yang belum diverifikasi ulang (root cause bug CI ditemukan & diperbaiki independen di sesi ini, CL-50). Scope goal ini sengaja sempit (CI dasar); migrasi staging (0.12.2), env terpisah (0.12.3), satu-origin deployment (0.12.4), dan release checklist (0.12.5) **masih ⬜️/belum dikerjakan** — bukan bagian klaim ini. `apps/api/build.mjs`+`apps/api/vercel.json` (implementasi kedua uncommitted untuk 0.12.4) masih belum diputuskan, di luar scope 0.12.1. Tidak ada perubahan SOT. Siap 🔎 untuk QA.

<a id="cl-49"></a>
### CL-49 — 2026-08-21 · Insiden — deploy staging `stag` gagal setelah push (bukan transisi goal)
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Setelah push commit CL-41..CL-48 ke `ar-github/stag` (68c2692), build Vercel gagal: `Error: Cannot find module '/vercel/path0/apps/api/scripts/preview-build.mjs'`. Investigasi: project Vercel `kanban` (`prj_aGheoc3NB4BJhWgfPG6sR3E0snM8`) punya setting dashboard **Root Directory = `apps/api`** (peninggalan sesi 0.12.x sebelumnya, bukan disebabkan commit sesi ini — `.vercel/project.json` lokal sudah menunjukkan nilai ini sebelum push). Ini tidak cocok dengan implementasi 0.12.4 yang ter-commit di root (`vercel.json` `buildCommand: node scripts/preview-build.mjs` + `scripts/preview-build.mjs`, keduanya dari `cc8c3e7`, didesain untuk Root Directory = repo root) **maupun** dengan implementasi kedua yang masih uncommitted di `apps/api/` (`vercel.json` `buildCommand: node build.mjs` + `build.mjs` — anomali yang sudah di-flag sebelumnya, ditinggalkan tidak tersentuh). Kombinasi Root Directory=apps/api + buildCommand dari file root menghasilkan path yang tidak ada di manapun. **Perbaikan (dikonfirmasi manusia sebelum eksekusi):** `vercel project update kanban --auto-detect root-directory` → Root Directory `apps/api` → `.` (auto/repo root), cocok dengan implementasi yang sudah ter-commit di root. Verifikasi: `vercel redeploy` atas deployment yang gagal → **Ready in 24s** (sebelumnya Error dalam 9s); `vercel ls kanban` mengonfirmasi status `● Ready`.
**Catatan:** Ini perbaikan **konfigurasi Vercel project (infra, bukan kode/SOT)**, dieksekusi via `flatpak-spawn --host` + Vercel CLI setelah konfirmasi eksplisit manusia (opsi "Ubah Root Directory ke repo root"). **Anomali TASK-0.12 (0.12.1–0.12.5 ⬜️/0%/CL "—") BELUM diselesaikan** — perbaikan ini hanya menghentikan pendarahan (staging bisa deploy lagi), bukan mengklaim goal 0.12.4 selesai: `apps/api/build.mjs` + `apps/api/vercel.json` (implementasi kedua, uncommitted) masih ada di working tree dan sekarang jelas tidak dipakai/tidak konsisten dengan Root Directory baru — perlu keputusan eksplisit (hapus, atau jadikan basis dan pindah Root Directory kembali) sebelum 0.12.4 boleh diklaim `🔄`/`🔎`. Test DoD 0.12.4 penuh (SPA fallback tidak menangkap API, auth cookie/callback same-origin) belum diverifikasi di sini — hanya build sukses + health route dicek (redirect 302 ke Vercel SSO adalah Deployment Protection standar, bukan bug). Tidak ada perubahan SOT.

<a id="cl-48"></a>
### CL-48 — 2026-08-21 · 0.1.5 ⚠️ → 🔎
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Blocker Review-CL-03 ("image belum tersedia lokal, pull terhenti") ternyata bukan masalah ketersediaan image — dengan akses Docker/Podman host (`flatpak-spawn --host`, Podman 5.8.4 rootful via alias `docker`), `docker pull node:24.18.0-bookworm-slim` sukses bersih. Root cause sebenarnya baru ditemukan sesi ini: **SELinux enforcing** (`getenforce` = Enforcing) di host Fedora menolak bind-mount `./:/workspace` tanpa label SELinux — reproduksi: `docker run --rm -v $(pwd):/workspace node:24.18.0-bookworm-slim cat /workspace/package.json` → `Permission denied`; dengan `:Z` → berhasil baca. Diperbaiki: `compose.devenv.yml` volume `./:/workspace` → `./:/workspace:z` (label shared, bukan `:Z` privat, agar tidak mengunci eksklusif bila kelak ada service lain). **Full run** `docker compose -f compose.devenv.yml up --abort-on-container-exit --exit-code-from checks` → **exit 0**: `pnpm install --frozen-lockfile` bersih (297 entries, lockfile policy pass), `pnpm -r build` 7/7 workspace Done, `pnpm -r typecheck` 7/7 Done, `eslint .` bersih, `pnpm --filter @kanban/infrastructure test:smoke-config` 9/9 assertion PASS (4 negatif + 5 positif). `docker compose down` cleanup sukses; `git status` setelah run menunjukkan repo bersih (hanya `compose.devenv.yml` yang berubah, tidak ada file lain tersentuh proses container).
**Catatan:** Node lokal image tetap `24.18.0` (tidak dilonggarkan) sesuai arahan Review-CL-03 "Jangan mengganti ke Node 24.16.0 atau melonggarkan engines". Verifikasi dilakukan via akses host (`flatpak-spawn --host`) karena sandbox kerja utama tidak punya container runtime — bukti tetap reproducible oleh siapa pun yang punya Docker/Podman + SELinux di host yang sama. Tidak ada perubahan SOT. Siap 🔎 untuk QA.

<a id="cl-47"></a>
### CL-47 — 2026-08-21 · 0.11.4 ⬜️ → 🔄 → 🔎 (satu sesi, Gate A lalu Gate B)
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** `@playwright/test@1.62.1` exact pin ditambah devDependency root (04-DEL B.5/03-ENG A.8); `@hono/node-server@2.1.1` exact pin ditambah dependency `apps/api` (keputusan teknis Dev — versi latest stable kompatibel `hono@^4`/Node `>=20`, dicatat & mudah diganti sesuai §10). `apps/api/src/serve.ts` (baru): server Node HTTP membungkus `createApiApp().app` via `@hono/node-server` `serve()`, port `PORT ?? 3100` — dipakai khusus lokal/E2E, terpisah dari default export `handle()` Vercel yang sudah ada. `apps/api/package.json` script `start: node dist/serve.js` (menjalankan hasil `tsc build`, bukan source langsung — memenuhi "build production-like" B.5). `playwright.config.ts` (root, baru): `webServer` menjalankan `pnpm --filter @kanban/api build && pnpm --filter @kanban/api start`, health-check `GET /api/v1/health` sebelum test jalan. `e2e/health.spec.ts` (baru): 1 test smoke `GET /api/v1/health` → 200 `{data:{status:"ok"}}`. `pnpm exec playwright install chromium` sukses; `pnpm test:e2e` → **1 passed** (build tsc real + server real + request real, bukan mock). Re-run kedua kali (idempotent, tidak ada state tersisa) tetap PASS. `pnpm -r typecheck` exit 0 (7 workspace project); `pnpm lint` exit 0; `pnpm test` (vitest) 6 file/23 test tetap PASS (tidak ada regresi). `.gitignore` ditambah `test-results/`+`playwright-report/` (artefak Playwright).
**Catatan:** Scope smoke E2E sengaja terbatas ke health-check API — Phase 0 prinsip "plumbing bukan domain endpoint" ([PHASE-0-TASKS.md](PHASE-0-TASKS.md) §"Prinsip Phase 0"); skenario E2E domain (invite→accept→board→card, UX Flows Part A) baru relevan setelah `apps/web` ada (Phase 7) dan endpoint domain ada (Phase 1+). `e2e/` diletakkan di root (bukan di dalam `apps/api` atau `apps/web`) karena akan lintas-app mulai Phase 7 — keputusan teknis Dev, mudah dipindah. Transisi `⬜️ → 🔄` (Gate A) lalu `🔄 → 🔎` 80% (Gate B) dalam satu sesi, masuk commit pertama sesuai §6.1 AGENTS.md. Tidak ada perubahan SOT. Siap 🔎 untuk QA.

<a id="cl-46"></a>
### CL-46 — 2026-08-21 · 0.1.2 ⚠️ → 🔎
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Root cause QA-CL-02 dikonfirmasi & diperbaiki: `packages/infrastructure/src/database/factory.ts` — `GlobalDbEnvSchema.GLOBAL_DB_TOKEN` dikembalikan dari `z.string().default("")` (regresi commit `cc8c3e7`) menjadi `z.string().min(1)`. `node --env-file-if-exists=../../.env scripts/smoke.ts` (setara `test:smoke`, dijalankan manual karena script package.json belum memuat `--env-file-if-exists` seperti script live lain — di luar scope perbaikan ini): 5/5 PASS, termasuk `negatif: GLOBAL_DB_TOKEN hilang -> throw` yang sebelumnya FAIL di QA-CL-02. `pnpm --filter @kanban/infrastructure test:smoke-config` tetap PASS (tidak ada regresi struktur A.7). `pnpm -r typecheck` exit 0; `pnpm lint` exit 0; `pnpm test` (vitest) 6 file/23 test PASS.
**Catatan:** Struktur folder A.7 (skeleton apps/api, apps/web placeholder, packages/domain/infrastructure/contracts/shared) sudah terverifikasi cocok di QA-CL-02 — tidak disentuh ulang, hanya regresi validasi env yang diperbaiki. Tidak ada perubahan SOT. Siap 🔎 untuk QA.

<a id="cl-44"></a>
### CL-44 — 2026-08-21 · 0.6.1 ⚠️ → 🔎
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** Dua temuan sisa Review-CL-02/04 diperbaiki di `src/provisioning/provision.ts`: (1) `provisionProjectDatabase()` kini melacak flag `created` yang hanya `true` setelah `createDatabase()` berhasil; blok `catch` cuma memanggil `deleteDatabase()` bila `created===true` — kegagalan sebelum DB benar-benar dibuat (mis. name conflict) tidak lagi menghapus DB existing yang bukan hasil invocation ini. (2) `activities.id` untuk `project.created` diganti dari ID deterministik `act_${projectId}_created` menjadi `ulid()` (A.13). `scripts/smoke-rollback.ts` test C diperbaiki: sebelumnya (salah) mengharapkan DB existing (name-conflict) ikut terhapus; sekarang membuktikan DB existing **tidak** disentuh kompensasi (assert `databaseExists` tetap true), cleanup manual tetap menghapusnya di akhir skrip. `scripts/smoke-provision.ts` ditambah assertion `isValidUlid(activity.id)`. **Live run** (`pnpm --filter @kanban/infrastructure test:smoke-rollback`, Turso group `ngodingin-kanban`): PASS A (tidak ada DB yatim + registry rollback), PASS C (kompensasi hanya DB hasil invocation gagal — DB existing tidak disentuh), PASS B (DB dihapus saat mapping gagal, registry+mapping eksisting tidak tersentuh). **Live run** `test:smoke-provision`: PASS project_state ACTIVE, PASS Activity project.created tunggal, **PASS Activity id memakai ULID (A.13)**, PASS seed atomik. `test:smoke-global-mapping` tetap PASS (regresi check). `pnpm -r typecheck` exit 0; `pnpm lint` exit 0; `pnpm test` (vitest) 6 file/23 test PASS.
**Catatan:** Ditemukan saat mengerjakan ini: migration strategy koreksi di CL-43 (squash 0000 bentrok dengan Global DB Turso live) sudah diperbaiki lebih dulu sebelum smoke-rollback (yang menyentuh Global DB live) dijalankan — urutan kerja: fix migration dulu, baru verifikasi 0.6.1 di live DB. Tidak ada perubahan SOT. Siap 🔎 untuk QA.

<a id="cl-43"></a>
### CL-43 — 2026-08-21 · 0.4.2 koreksi strategi migrasi (tetap 🔎 80%, bukan transisi status)
**Role:** AI-Dev · **Model:** claude-sonnet-5 (Claude Code)
**Bukti:** CL-42 meregenerasi migration `0000_global_schema_v1.sql` secara total (squash), mengikuti preseden CL-17 ("pre-deploy, belum ada data produksi"). Saat menjalankan `test:smoke-rollback` (live) untuk 0.6.1, ditemukan asumsi itu sudah usang: Global DB Turso `kanban-global` sudah live sejak CL-20 (0.6.2) dan menyimpan journal migrasi dengan hash migration lama — migration 0000 hasil squash (hash baru) gagal diterapkan (`SQL_INPUT_ERROR: table api_keys already exists`) karena drizzle migrator mencoba re-apply migration yang dianggap baru. Diperbaiki: `0000_global_schema_v1.sql` + `meta/0000_snapshot.json` + `meta/_journal.json` dikembalikan ke isi commit sebelumnya (`git show HEAD~1:...`, identik pre-fix), lalu `drizzle-kit generate` dijalankan ulang menghasilkan migration **incremental** `0001_scope_type_list_card.sql` (DROP+recreate 3 tabel dengan CHECK diperluas, pola standar SQLite ALTER-CHECK via drizzle-kit) — kompatibel dengan DB yang sudah menjalankan 0000 lama. `scripts/smoke-migration.ts` sebelumnya hardcode `journal harus 1` (asumsi satu file migration); diubah membaca jumlah file `.sql` aktual (`readdirSync`) agar tidak rapuh terhadap penambahan migration. Re-run setelah perbaikan: `test:smoke-global-schema`, `test:smoke-migration`, `test:smoke-global-constraints` (lokal, file: DB) PASS; `test:smoke-rollback`, `test:smoke-global-mapping`, `test:smoke-provision` (live Turso, Global DB nyata) PASS — migration 0001 diterapkan bersih di atas 0000 lama tanpa error.
**Catatan:** Pelajaran: preseden "pre-deploy, aman diregenerasi total" (CL-17) tidak berlaku lagi begitu Global DB pertama kali diprovision live (sejak CL-20) — regenerasi migration selanjutnya WAJIB incremental, bukan squash, kecuali ada keputusan eksplisit untuk reset Global DB live (belum ada). Tidak ada perubahan SOT. Tidak ada perubahan pada isi CHECK constraint final (tetap 5 nilai) — hanya mekanisme migration file yang dikoreksi.

<a id="cl-32"></a>
### CL-32 — 2026-08-18 · 0.9.1 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-pipeline` (live Global DB + Project DB file lokal): `pipe-identity` PASS — session valid → identitas; `pipe-anonymous` PASS — tanpa cookie → PipelineError TOKEN_EXPIRED 401; `pipe-invalid-cookie` PASS — cookie invalid → TOKEN_EXPIRED 401. typecheck 0 error; `pnpm lint` exit 0.
**Catatan:** `ResolveIdentityStep` (src/pipeline/identity-step.ts) = langkah pertama pipeline; seam PAT/API Key Phase 4 = tambah cabang di `IdentityResolver` (0.8.3), bukan jalur baru. **Keputusan manusia (2026-08-18):** credential hilang/tidak valid ditolak dengan kode kanonik `TOKEN_EXPIRED` + HTTP 401 (12 kode C.2 tidak punya kode unauthenticated; opsinya tercatat di sesi — pilih TOKEN_EXPIRED, catat untuk amandemen bila AI-Planning ingin menambah kode). Tidak ada perubahan SOT.

<a id="cl-33"></a>
### CL-33 — 2026-08-18 · 0.9.2 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-pipeline`: `pipe-project-membership` PASS — project + membership valid dimuat; `pipe-no-membership` PASS — user B ke Project A → PROJECT_ACCESS_DENIED 403; `pipe-cross-project` PASS — user A ke Project B → PROJECT_ACCESS_DENIED 403 (BR-009); `pipe-unknown-project` PASS — RESOURCE_NOT_FOUND 404; `pipe-revoked-membership` PASS — membership revoked → PROJECT_ACCESS_DENIED 403. typecheck 0; lint 0.
**Catatan:** `LoadProjectStep` (src/pipeline/project-step.ts) membaca Global DB via `getProject`/`getMembership` (src/database/global-reads.ts; membership aktif = `revoked_at IS NULL`, konsisten partial UNIQUE B.2). Verifikasi membership terjadi SEBELUM resolve DB (A.4). Keputusan teknis Dev: project tidak dikenal → RESOURCE_NOT_FOUND (bukan PROJECT_ACCESS_DENIED — hindari leak keberadaan project? sebaliknya: 404 menandakan tidak ada; dicatat sebagai pilihan, mudah diubah). Tidak ada perubahan SOT.

<a id="cl-34"></a>
### CL-34 — 2026-08-18 · 0.9.3 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-pipeline`: `pipe-db` PASS — DB Project ter-resolve (spy resolver tercatat) hanya setelah membership lolos dan siap query (SELECT 1); `pipe-cross-project-no-db` PASS — untuk user A yang bukan anggota B, resolver TIDAK pernah dipanggil untuk project B. typecheck 0; lint 0.
**Catatan:** `ResolveDatabaseStep` (src/pipeline/database-step.ts): `resolveOrThrow` (0.3.2) + `ProjectClientFactory` seam — prod akan memakai factory Turso (token JWT per-DB dari hostname, 0.6.1); test memakai factory file:. Mapping hilang → RESOURCE_NOT_FOUND 404 (keputusan teknis Dev: Project terdaftar tapi DB belum siap = tidak tersedia). Tidak ada perubahan SOT.

<a id="cl-35"></a>
### CL-35 — 2026-08-18 · 0.9.4 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-pipeline`: `pipe-permission-seam` PASS — konteks pipeline memuat `permission: null` dari `EmptyPermissionResolver`. typecheck 0; lint 0.
**Catatan:** `PermissionResolver` interface + `EmptyPermissionResolver` (src/pipeline/permission-step.ts): kontrak `resolve(PermissionContext) → PermissionResolution`, diisi Phase 4 (A.10 formula ALLOW). Context membawa identity + project + membership — semua data yang dibutuhkan permission engine, tanpa akses DB. Tidak ada perubahan SOT.

<a id="cl-37"></a>
### CL-37 — 2026-08-18 · 0.7.1 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm test` (vitest): `packages/contracts/test/api-response.test.ts` 4 asersi PASS — `ok()` → `{data}`, payload passthrough (null/array/scalar), `apiError()` → `{error:{code,message}}`, envelope error TIDAK mengandung field `data`. typecheck 0; lint 0.
**Catatan:** Helpers hidup di `@kanban/contracts` (paket kontrak API; exports → src sesuai pola domain). 0.7.1–0.7.3 dikerjakan sebagai satu unit kontrak dengan test terpisah per goal. Tidak ada perubahan SOT.

<a id="cl-38"></a>
### CL-38 — 2026-08-18 · 0.7.2 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm test` (vitest): `packages/contracts/test/error-codes.test.ts` 4 asersi PASS — tepat 12 kode kanonik C.2 (list penuh), isErrorCode menerima semua kode, menolak unknown/undefined/empty, tipe union tertutup. typecheck 0; lint 0.
**Catatan:** `ERROR_CODES` (as const) + `ErrorCode` + `isErrorCode` di `packages/contracts/src/error-codes.ts`. Tidak ada perubahan SOT.

<a id="cl-39"></a>
### CL-39 — 2026-08-18 · 0.7.3 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm test` (vitest): `packages/contracts/test/http-mapping.test.ts` 7 asersi PASS — semua kode → status 4xx/5xx; mapping khusus (TOKEN_EXPIRED/REVOKED 401, ACCESS/PERMISSION_DENIED 403, NOT_FOUND 404, VERSION_CONFLICT 409); `httpStatus` eksplisit override (dipakai PipelineError); kode tidak dikenal → 500 INVALID_STATE tanpa bocor; `extractIdempotencyKey` ada/tidak ada/blank. typecheck 0; lint 0.
**Catatan:** `CODE_TO_HTTP` + `toErrorResponse` + `IDEMPOTENCY_HEADER`/`extractIdempotencyKey` + interface `IdempotencyStore` (implementasi penyimpanan Phase 1 — seam, sesuai non-MVP no-idempotency infra). Status per kode adalah keputusan teknis Dev (C.2 tidak menetapkan status; mudah diganti, catat untuk AI-Planning bila ingin di-SOT-kan). `toErrorResponse` menerima bentuk PipelineError (0.9.5) — jembatan ke error handler Hono Phase 1. Tidak ada perubahan SOT.

<a id="cl-40"></a>
### CL-40 — 2026-08-18 · 0.11.3 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm test` (vitest) 6 file / 23 test PASS. Nama test kini mereferensikan ID rule: `db-isolation.test.ts` → `AC-001/BR-007` (Project isolation, 4 asersi); `transaction.test.ts` → `INV-9/INV-MOVE-004` (atomic mutation+activity); file baru contracts test → `C.2`/`04-DEL B.5` (tiap describe). typecheck 0; lint 0.
**Catatan:** 04-DEL B.6: tiap Business Rule SHOULD punya minimal satu test mereferensikan ID di nama/deskripsi — konvensi siap dipakai seluruh test Phase 1–7 (nama test baru wajib ber-format `ID-rule: deskripsi`). Tidak ada perubahan SOT.

<a id="cl-36"></a>
### CL-36 — 2026-08-18 · 0.9.5 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-pipeline`: seluruh 11 asersi PASS — termasuk `pipe-cross-project-no-db` (DB project lain tidak pernah di-resolve/diakses, BR-008/AC-001) dan setiap jalur negatif ditolak di langkah pipeline yang benar (identity → project/membership → db → permission). typecheck 0; lint 0.
**Catatan:** `RequestPipeline.run(request, projectId) → ProjectRequestContext` (src/pipeline/pipeline.ts) = SATU-SATUNYA entry akses resource: identity (0.9.1) → project+membership (0.9.2) → DB (0.9.3) → permission (0.9.4). Tidak ada jalur bypass; handler Phase 1 wajib memakai pipeline ini. TASK-0.9 tuntas (catatan: 5 goal dikerjakan sebagai satu unit pipeline dengan satu smoke — asersi terpisah per goal agar QA tetap verifikabel per goal; keputusan teknis Dev). Tidak ada perubahan SOT.

<a id="cl-31"></a>
### CL-31 — 2026-08-18 · 0.8.3 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-resolve-identity` (live Global DB Turso): 8 asersi PASS — request session valid → `ResolvedIdentity {type:"session", userId, email, emailVerified, image}`; tanpa cookie → null; cookie invalid → null; session expired → null; hasil resolver identik dengan `auth.api.getSession` (satu titik resolusi, C.1). typecheck 0 error; `pnpm lint` exit 0.
**Catatan:** `BetterAuthIdentityResolver` (src/auth/resolve-identity.ts): interface `IdentityResolver` + discriminated union `ResolvedIdentity` (seam PAT/API Key Phase 4 = tambah member baru di sini, bukan jalur baru). `Auth = ReturnType<typeof createAuth>` diekspor dari auth.ts. Temuan: parameter property TS (`constructor(private ...)`) kembali ditolak Node strip-only (pola 0.10.1) → field eksplisit. TASK-0.8 tuntas (0.8.1–0.8.4 semua 🔎). Tidak ada perubahan SOT.

<a id="cl-30"></a>
### CL-30 — 2026-08-18 · 0.8.4 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-magic-link` (live Global DB Turso): 21 asersi PASS — request link 200 `{status:true}` identik untuk email dikenal vs tak dikenal (no enumeration); `sendMagicLink()` menerima `{email, url, token}` (stub injectable); link memakai canonical origin per env (staging `stag-kanban.ngodingin.xyz`, production `kanban.ngodingin.xyz`); token tersimpan `storeToken:"hashed"` (identifier SHA-256 base64url 43 char, token mentah tidak pernah ada di DB); verify valid → session baru + Set-Cookie `__Secure-kanban.session_token` HttpOnly+Secure; negatif: reuse (single-use), token invalid, expired → redirect `error=INVALID_TOKEN`; **dua konsumsi konkuren → tepat satu sukses** (konsumsi atomik); sign-in/email → 400 (emailAndPassword disabled); sign-in/google → 404. smoke-session & smoke-auth tetap PASS; typecheck 0 error; `pnpm lint` exit 0.
**Catatan:** Plugin `magicLink` dari `better-auth/plugins/magic-link` (expiresIn 300 s; `allowedAttempts` deprecated — konsumsi atomik bawaan plugin, DUAL delete-by-id dalam transaksi adapter). Cookie session di origin https memakai prefix `__Secure-` (BA internal, isProduction = baseURL https) — sesuai secure cookie A.14. Transport email: `resend@6.20.0` exact pin di infrastructure; `defaultSendMagicLink` membaca `AUTH_RESEND_KEY` + `MAIL_FROM` via `loadAppConfig` (0.1.4), sender `noreply@kanban.ngodingin.xyz`; stub di smoke membuktikan kontrak tanpa mengirim email nyata (kirim nyata = Phase 1 handler + secret Vercel). Rate limit plugin 5/60s (F.5 seam). Tidak ada perubahan SOT.

<a id="cl-29"></a>
### CL-29 — 2026-08-18 · 0.8.2 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-session` (live Global DB Turso): 16 asersi PASS — session tersimpan di `auth_sessions` (database-backed); cookie `kanban.session_token` HttpOnly + SameSite=Lax + Path=/ + Secure pada origin https (kanban.ngodingin.xyz), non-Secure hanya di dev http; getSession valid untuk cookie **signed**; negatif: signature tampered, token tak dikenal, session expired → null; revoke (deleteSession) → row hilang + getSession null; `useCookieCache` nonaktif. smoke-auth tetap PASS; typecheck 0 error; `pnpm lint` exit 0.
**Catatan:** Temuan Better Auth 1.6.30: (1) cookie session **signed** (`token.signature`, HMAC-SHA256 base64) — cookie mentah tidak diterima getSession; (2) `cookiePrefix` berada di `advanced.cookiePrefix` (bukan top-level); (3) `internalAdapter.createSession(userId, dontRememberMe, override, overrideAll)` — override hanya diterapkan jika `overrideAll=true` (dipakai membuat session expired untuk test); (4) getSession membaca cookie via `getSignedCookie` → tamper-proof. `advanced.generateId` + mapping B.2 sudah terbukti di 0.8.1. SOT tidak berubah. Branch kerja: `stag`.

<a id="cl-28"></a>
### CL-28 — 2026-08-18 · 0.8.1 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-auth` (live Global DB Turso `kanban-global`): createUser via `auth.$context.internalAdapter` → id ULID lowercase custom generateId (`advanced.database.generateId`, bukan `advanced.generateId` — key 1.6.30) PASS; kolom snake_case sesuai mapping B.2 (email_verified, created_at, dll.) PASS; negatif email duplikat → UNIQUE users_email ditolak PASS; cleanup data uji; typecheck 0 error; `pnpm lint` exit 0.
**Catatan:** better-auth@1.6.30 exact pin di `packages/infrastructure` (A.14). `createAuth` (src/auth/auth.ts): drizzleAdapter sqlite + schema keyed MODEL NAME (`users`, `auth_sessions`, `auth_accounts`, `auth_verifications`) — adapter me-resolve `schema[modelName]` dan memerlukan properti tabel = nama kolom DB → properti TS tabel auth di global-schema.ts di-rename ke snake_case (prop == db name) sesuai B.2; mapping field BA→DB lengkap di config (user/session/account/verification, termasuk created_at/updated_at). Email/password disabled (magic link 0.8.4); cookiePrefix "kanban". Temuan API 1.6.30: option id berada di `advanced.database.generateId` (bukan `advanced.generateId`); `ulid` tidak mengekspor `ULID_REGEX` (pakai `isValid`). smoke-global-mapping disesuaikan (prop snake_case). SOT tidak berubah. Branch kerja: `stag` (keputusan manusia; push stag = deploy staging Vercel).

<a id="cl-27"></a>
### CL-27 — 2026-08-18 · 0.11.2 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm test` → 3 files / 9 tests PASS: `db-isolation.test.ts` membuktikan DB file terpisah per suite (10 tabel), `truncateAll()` per test (data test sebelumnya tidak bocor ke test berikut — rollback antar test B.5), dan suite kedua punya DB kosong sendiri; typecheck 0 error; `pnpm lint` exit 0.
**Catatan:** Helper `test/helpers/db.ts` (`createTestProjectDb` + `truncateAll` + `cleanup`) dipakai integration test. Path migrasi kini berbasis `import.meta.dirname` (0.11.1) sehingga helper jalan dari root Vitest. Tidak ada perubahan SOT.

<a id="cl-26"></a>
### CL-26 — 2026-08-18 · 0.11.1 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm test` → Vitest 4.1.10 (exact pin, root devDep): 2 test files / 5 tests PASS (unit `projectDatabaseName`; integration `runInWriteTransaction` commit/rollback/atomic INV #9); seluruh smoke (migrate-programmatic, repository, transaction, project-schema) tetap PASS setelah perubahan; typecheck 0 error; `pnpm lint` exit 0.
**Catatan:** `vitest.config.ts` (root, include `packages/*/test/**/*.test.ts`, env node); scripts root `test`/`test:watch`. Temuan: `applyGlobalMigrations`/`applyProjectMigrations` sebelumnya resolve path relative CWD → gagal saat Vitest (cwd=root) → kini `import.meta.dirname` (path-invariant). Tidak ada perubahan SOT.

<a id="cl-25"></a>
### CL-25 — 2026-08-18 · 0.10.2 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-transaction`: commit simpan mutation+activity; rollback saat fn throw; negatif activity invalid → seluruh tx dibatalkan (tidak ada mutation yatim, INV #9); typecheck 0 error; `pnpm lint` exit 0.
**Catatan:** `runInWriteTransaction` (src/database/transaction.ts): `client.transaction("write")` (= `BEGIN IMMEDIATE`, setara hasil POC 0.2.3) + retry SQLITE_BUSY (3×, 50 ms) → `TransactionBusyError`. Fondasi A.6 / atomic Card move (INV-MOVE-004). Perilaku busy retry terbukti di POC 0.2.3 (20/20 tanpa lost update), bukan di helper ini. TASK-0.10 tuntas. Tidak ada perubahan SOT.

<a id="cl-24"></a>
### CL-24 — 2026-08-18 · 0.10.1 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-repository`: interface `ProjectRepository` di `packages/domain/src/project/project-repository.ts` (tanpa import Drizzle — type-check terpisah), impl `DrizzleProjectRepository` di infrastructure (drizzle); getProjectState/createMilestone/listMilestones/getCard (undefined utk tak ada) hijau; data mentah DB cocok; typecheck 0 error (root + domain); `pnpm lint` exit 0.
**Catatan:** Boundary A.7: domain hanya definisi interface + record type polos (records, bukan row Drizzle); implementasi persisten di infrastructure. `@kanban/domain` dipublish via `exports` → `./src/index.ts` (Node type-stripping langsung baca TS). Temuan: parameter property TS (`constructor(private ...)`) TIDAK didukung strip-only mode Node 24 → deklarasi field eksplisit; re-export type lint circular → `export type {...} from`. Tidak ada perubahan SOT.

<a id="cl-23"></a>
### CL-23 — 2026-08-18 · 0.6.4 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-rollback` (live Turso) — urutan final sinkron F.2: provision DB → registrasi+mapping Global dalam SATU transaksi → kegagalan mapping → DB dihapus, registry eksisting tak tersentuh, tanpa mapping yatim; A/C (gagal awal & tengah) tetap hijau; `test:smoke-provision` + `test:smoke-global-mapping` tetap PASS; typecheck 0 error; `pnpm lint` exit 0. Latensi sinkron: provisioning ~2.1 s (bukti 0.2.2) → jalur sinkron layak (keputusan 0.2.4).
**Catatan:** Strategi **sinkron** diterapkan: `provisionProjectWithMapping` (src/provisioning/provision.ts) menunggu provisioning selesai sebelum respons; tidak ada state perantara `PROVISIONING` yang terekspos (registrasi muncul saat DB sudah siap — tidak ada Project tanpa database, F.2). `project_databases` = satu-satunya sumber resolusi (A.4). `provisioning_state` di projects tetap ada untuk masa depan async. TASK-0.6 tuntas. Tidak ada perubahan SOT.

<a id="cl-22"></a>
### CL-22 — 2026-08-18 · 0.6.3 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-rollback` (live Turso): A — apiToken invalid → tidak ada DB yatim + registry projects di-rollback; C — DB pre-created lalu provision gagal (name conflict) → DB yang gagal dihapus + registry di-rollback; B — register duplikat → tidak ada DB baru + mapping eksisting tidak tersentuh; cleanup penuh; typecheck 0 error; `pnpm lint` exit 0.
**Catatan:** `provisionProjectWithMapping` (src/provisioning/provision.ts) = orchestrasi register → provision → mapping dengan rollback berlapis; `deleteProjectRegistry`/`deleteProjectDatabaseMapping` di global-store. Temuan: drizzle 0.45 `where` callback TIDAK didukung di delete (dibind sebagai param) → wajib `eq()`; error drizzle libsql membungkus driver di `.cause`; Turso menerima expiration token sembarang (tidak ada validasi format). Token provisioning tetap "1y" (opsi `tokenExpiration` hanya untuk kebutuhan khusus). Tidak ada perubahan SOT.

<a id="cl-21"></a>
### CL-21 — 2026-08-18 · Catatan Keputusan Manusia — Domain deployment (bukan transisi status)
**Role:** AI-Dev (mencatat keputusan manusia) · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Keputusan manusia:** Production → `https://kanban.ngodingin.xyz` (cocok SOT D.7); **Staging → `https://kanban-ngodingin.vercel.app`** (Vercel project `kanban`, divergen dari SOT D.7 `https://stag-kanban.ngodingin.xyz`). Project Vercel `kanban` diverifikasi (`vercel project ls` → `kanban-ngodingin.vercel.app`, Node 24.x).
**Dampak `[NEEDS-SPEC-AMENDMENT]`:** 03-ENGINEERING D.7 origin staging perlu diubah → `https://kanban-ngodingin.vercel.app` oleh AI-Planning & Review (wajib bump SPEC_VERSION + changelog). Loader env 0.1.4 TIDAK diubah di sesi ini (SOT menang); setelah amandemen, loader menyesuaikan. Preview Vercel = origin staging.

<a id="cl-20"></a>
### CL-20 — 2026-08-18 · 0.6.2 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-global-mapping` (live, Global DB nyata `kanban-global` di Turso group `ngodingin-kanban`): applyGlobalMigrations → 16 tabel; registerProject + recordProjectDatabaseMapping → mapping terbaca ulang; negatif mapping duplikat ditolak (`MappingAlreadyExistsError`); cleanup data uji; typecheck 0 error; `pnpm lint` exit 0.
**Catatan:** Global DB dibuat pertama kali (`GLOBAL_DB_URL`/`GLOBAL_DB_TOKEN` di .env, token JWT per-DB 1y; `.env.example` diperbarui TURSO_ORG/TURSO_GROUP/GLOBAL_DB_*). Temuan: error drizzle libsql membungkus driver di `.cause` (deteksi UNIQUE via cause). `registerProject` + `recordProjectDatabaseMapping` di src/database/global-store.ts. Orchestrasi atomik create Project + provision + mapping = Phase 1 (di sini primitif + seam). Tidak ada perubahan SOT.

<a id="cl-19"></a>
### CL-19 — 2026-08-18 · 0.6.1 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-provision` (live, Turso group `ngodingin-kanban`, org `ngodingin-ai`): Project DB `proj-projsmoke*` dibuat → migrasi 10 tabel terpasang → seed atomik: `project_state` tepat satu ACTIVE (version=1, archived_at/deleted_at NULL) + Activity `project.created` tunggal (entity_version=1, data B.5 snapshot.name); negatif: tx duplikat gagal & tidak meninggalkan activity yatim (F.2). DB uji dihapus (cleanup). typecheck 0 error; `pnpm lint` exit 0.
**Catatan:** Temuan API: `@libsql/client` 0.17.4 `transaction(mode)` object-style (callback arg diabaikan → wajib drizzle `db.transaction` + `.run()`); nama DB Turso hanya lowercase/angka/dash (prefix `proj-`). `provisionProjectDatabase` (src/provisioning/provision.ts) gagal → `ProjectProvisioningError` + cleanup delete DB. Penerapan mapping ke Global = 0.6.2. Tidak ada perubahan SOT.

<a id="cl-18"></a>
### CL-18 — 2026-08-18 · 0.5.3 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-migrate-programmatic`: `applyGlobalMigrations` + `applyProjectMigrations` (src/database/migrate.ts) menerapkan ke DB baru terprogram (journal global 1, 10 tabel project terpasang, junction punya `removed_at`), apply ulang idempotent; typecheck 0 error; `pnpm lint` exit 0.
**Catatan:** Fungsi ini fondasi fan-out F.3 — dipakai 0.6.1 (provisioning seed atomik) & 0.12.2 (deploy). Penerapan di DB Turso nyata terjadi di 0.6.1/0.12.2. Tidak ada perubahan SOT.

<a id="cl-17"></a>
### CL-17 — 2026-08-18 · 0.5.2 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-project-behavior`: negatif duplikat junction aktif → partial UNIQUE; positif re-add setelah `removed_at` (riwayat append-only 2 baris); positif activities polymorphic + `data` JSON round-trip (B.5 `card.moved`); negatif `entity_type` di luar enum → CHECK ditolak; query polymorphic entity+id berfungsi; seluruh smoke global (16 tabel + constraints) tetap PASS; typecheck 0 error; lint exit 0.
**Catatan:** Temuan: enum drizzle sqlite TIDAK emit CHECK di DDL → ditambahkan `check()` eksplisit (6 di Global: provisioning_state, scope_type ×3, card_read_visibility ×2; 1 di Project: entity_type), migration 0000 regenerated ulang dari awal (pre-deploy, belum ada data produksi). Isolasi Project tidak diuji di level ini (0.10.1/0.12.1). Tidak ada perubahan SOT.

<a id="cl-16"></a>
### CL-16 — 2026-08-18 · 0.5.1 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `drizzle-kit generate --config drizzle.config.project.ts` sukses; `pnpm --filter @kanban/infrastructure test:smoke-project-schema`: 10 tabel B.3 ada di DDL + DB (apply migration), `project_state` punya `project_id` anchor, semua entity punya `version` + `archived_at`/`deleted_at`, junction punya `removed_at`, migration idempotent; typecheck 0 error; lint exit 0.
**Catatan:** `project-schema.ts` + `drizzle.config.project.ts` + `drizzle/migrations-project/0000_project_schema_v1.sql`. Tidak ada `project_id` di tabel child (isolasi via DB, B.1); `cards.creator_user_id`/`assignee_user_id` tanpa FK (app-level FK A.5); `activities.data` JSON (drizzle json mode). Tidak ada perubahan SOT.

<a id="cl-15"></a>
### CL-15 — 2026-08-18 · 0.4.3 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-migration`: apply 1x → journal 1 entry, 16 tabel; apply ulang → journal tetap 1 (idempotent); apply ulang sesudah insert data → no-op, data utuh; typecheck 0 error; lint exit 0.
**Catatan:** `migrate()` drizzle = journal `__drizzle_migrations` (version tracking F.3). Penerapan ke Global DB nyata (Turso) + fan-out Project DB adalah 0.12.2/0.5.3. Tidak ada perubahan SOT.

<a id="cl-14"></a>
### CL-14 — 2026-08-18 · 0.4.2 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-global-constraints` (libsql lokal, migration 0000 ter-apply): negatif — duplikat users.email / membership (project_id,user_id) / group_permissions / assignment aktif → constraint violation; positif — assignment yang sama boleh dibuat ulang setelah `revoked_at` (partial UNIQUE WHERE revoked_at IS NULL); asersi — scope_type+revoked_at ada, credential hanya `key_hash`/`token_hash` (tanpa kolom raw), `auth_verifications.identifier` wadah hash, kolom Better Auth core lengkap snake_case (B.2); typecheck 0 error; lint exit 0.
**Catatan:** Perbaikan smoke: `permission_groups.updated_at` NOT NULL. Mapping adapter Better Auth (fieldMapping) diimplementasikan di 0.8.1; schema sudah siap kontrak. Tidak ada perubahan SOT.

<a id="cl-13"></a>
### CL-13 — 2026-08-18 · 0.4.1 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `drizzle-kit generate` sukses dari `global-schema.ts` (16 tabel sesuai B.2); `pnpm --filter @kanban/infrastructure test:smoke-global-schema`: DDL memuat tepat 16 tabel, migrasi ter-apply ke libsql lokal → 16 tabel ada, 8 UNIQUE index inti ada (users_email, auth_sessions_token, auth_accounts_provider_account, auth_verifications_identifier, project_memberships_project_user, group_permissions_group_permission, 2× scoped partial WHERE revoked_at IS NULL); typecheck 0 error; lint exit 0.
**Catatan:** `packages/infrastructure/src/database/global-schema.ts` + `drizzle.config.ts` + `drizzle/migrations/0000_global_schema_v1.sql`; id TEXT (ULID A.13, diisi app layer), timestamp TEXT ISO UTC kecuali `auth_*` expires_at integer timestamp (kontrak Better Auth default), enum: provisioning_state, scope_type, card_read_visibility. drizzle-orm 0.45.2 + drizzle-kit 0.31.10 exact di paket infrastructure. Tidak ada perubahan SOT.

<a id="cl-12"></a>
### CL-12 — 2026-08-18 · 0.3.3 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-guard`: positif — resolveOrThrow project dikenal → mapping; negatif — project tak dikenal → `ProjectDatabaseNotFoundError` (bukan mapping salah/fallback); negatif — DB Project lain terbukti tidak tersentuh/berubah; typecheck 0 error; lint exit 0.
**Catatan:** `resolveOrThrow` (BR-007/BR-009): satu-satunya jalur resolusi DB Project; mapping null MUST throw, tidak pernah return fallback. Fondasi pipeline 0.9.3 (resolve DB setelah verifikasi membership). Tidak ada perubahan SOT.

<a id="cl-11"></a>
### CL-11 — 2026-08-18 · 0.3.2 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-resolver` (libsql lokal file:, tabel fixture `project_databases` sesuai B.1): positif — resolve project_id dikenal → mapping persis; negatif — project_id tak dikenal → `null` (tidak akses DB lain) & kosong → `null`; typecheck 0 error; lint exit 0.
**Catatan:** `ProjectDatabaseResolver` interface + `SqliteProjectDatabaseResolver` di `packages/infrastructure/src/database/project-resolver.ts` (A.4: mapping adalah satu-satunya sumber resolusi). DDL fixture `(project_id TEXT PRIMARY KEY, database_id TEXT NOT NULL, created_at TEXT NOT NULL)` harus sinkron dengan schema Drizzle 0.4.1 (B.1). Tidak ada perubahan SOT.

<a id="cl-10"></a>
### CL-10 — 2026-08-18 · 0.1.4 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke-config`: 4 negatif (secret <32 / resend kosong / dev+origin produksi / staging+BETTER_AUTH_URL salah → throw) + 3 positif (prod=kanban.ngodingin.xyz via VERCEL_ENV=production, staging=stag-kanban.ngodingin.xyz via preview, dev localhost + MAIL_FROM default); typecheck 0 error; lint exit 0. `.env.example` dilengkapi `GLOBAL_DB_URL`/`GLOBAL_DB_TOKEN`/`BETTER_AUTH_SECRET`/`BETTER_AUTH_URL`/`AUTH_RESEND_KEY`/`MAIL_FROM` — tanpa secret nyata.
**Catatan:** Loader `packages/infrastructure/src/config/env.ts` (zod 4): deteksi env dari `VERCEL_ENV` (production/preview) fallback `NODE_ENV`; enforces canonical origin per env sesuai D.7 (staging MUST NOT memakai origin produksi, dst.) — fondasi guard test 0.8.4. Tidak ada perubahan SOT.

<a id="cl-09"></a>
### CL-09 — 2026-08-18 · 0.1.2 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** Struktur A.7 terverifikasi: `apps/api` (ada) + `apps/web` (placeholder package.json + README Phase 7) + `packages/domain`, `contracts`, `shared` (package/tsconfig/src placeholder) + `infrastructure/src/database/` (di-rename dari `src/db/` sesuai A.7, smoke tetap hijau). `pnpm -r build` & `pnpm -r typecheck` 0 error; `pnpm lint` exit 0; `pnpm --filter @kanban/infrastructure test:smoke` lulus.
**Catatan:** `tsconfig.base.json` ditambah `allowImportingTsExtensions` + `rewriteRelativeImportExtensions` (import `.ts` untuk node native type-stripping, tsc menulis ulang `.js` saat emit). `apps/web` tanpa deps Vite/React sesuai A.8 (UI Phase 7). Tidak ada perubahan SOT.

<a id="cl-08"></a>
### CL-08 — 2026-08-18 · 0.3.1 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm --filter @kanban/infrastructure test:smoke`: 3 negatif (env tidak lengkap / url non-libsql / token kosong → throw) + 2 positif (Global & Project client → `SELECT 1` ok, Turso remote nyata); typecheck 0 error; `pnpm lint` exit 0.
**Catatan:** Factory di `packages/infrastructure/src/db/factory.ts` (paket baru, dep: @libsql/client 0.17.4 + zod 4.4.3 exact): `createGlobalClient`/`parseGlobalDbEnv` (env `GLOBAL_DB_URL`/`GLOBAL_DB_TOKEN`) dan `createProjectClient({url, authToken})` — pemisahan Global vs Project per A.4; boundary infrastruktur berdiri (0.1.2 melengkapi sisa skeleton). Nama env `GLOBAL_DB_*` keputusan teknis Dev (belum di-SOT), mudah diganti. Node native type-stripping: import antar-TS wajib ekstensi `.ts`; `tsconfig.base.json` baru (types: node) — apps/api tidak tersentuh. Tidak ada perubahan SOT.

<a id="cl-07"></a>
### CL-07 — 2026-08-18 · 0.2.4 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `poc/RESULTS.md` §0.2.4: proyeksi biaya (Free $0/100 DB → Developer $4.99/bln unlimited) + assessment 4 gate A.11 (latensi conditional-fail region mismatch, provisioning ✅ sinkron, concurrency ✅, biaya ✅).
**Catatan:** Keputusan manusia (2026-08-18): **Turso GO + provisioning SINKRON**. Implikasi: 0.6.4 = sinkron dalam `POST /projects`; mitigasi co-location region DB↔fungsi saat deploy; org API token ≠ kredensial libsql (wajib JWT per-DB). Rekomendasi amandemen SOT A.11 (hapus "pending POC gate") diserahkan ke AI-Planning & Review. Goal `🔎` 80% siap verifikasi QA.

<a id="cl-06"></a>
### CL-06 — 2026-08-18 · 0.2.2 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm measure:provisioning` n=3 (org `ngodingin-ai`, group `default` aws-ap-south-1): ready (create→query pertama OK) 2470/2045/2115 ms, create 1305/711/714 ms, token 607/600/499 ms, first query 245/296/294 ms; DB uji di-delete tiap run (HTTP 200). Hasil di `poc/RESULTS.md` §0.2.2 + `poc/results-provisioning.jsonl`. Typecheck 0 error.
**Catatan:** Temuan: (1) org API token → 401 untuk koneksi libsql, wajib JWT per-DB via `POST /v1/databases/{name}/auth/tokens`; (2) respons create pakai field kapital `Hostname`; (3) readiness tidak ada di status instance API v1 → polling `SELECT 1`; (4) provisioning ≲3 s → sinkron layak per F.2 (keputusan final 0.2.4). Tidak ada perubahan SOT.

<a id="cl-05"></a>
### CL-05 — 2026-08-18 · 0.1.3 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm install` done; `pnpm lint` exit 0; `pnpm build`/`pnpm typecheck` (apps/api + poc/measure) Done; `pnpm list --depth 0` menunjukkan exact pin tanpa prerelease: `@libsql/client` 0.17.4, `drizzle-orm` 0.45.2, `zod` 4.4.3, `ulid` 3.0.2 (deps); `drizzle-kit` 0.31.10, `eslint` 10.8.1, `@eslint/js` 10.0.1, `typescript-eslint` 8.67.0, `prettier` 3.9.6 (devDeps); `pnpm-lock.yaml` ter-commit.
**Catatan:** pnpm 11.22 memindahkan settings dari field `pnpm` di package.json ke `pnpm-workspace.yaml` (`allowBuilds.esbuild: true` — pnpm auto-tulis placeholder saat build script di-ignore). ESLint 10 flat config `eslint.config.mjs` (@eslint/js 10.0.1 = versi 10.x terakhir; tidak ada 10.8.1). Dep runtime dipasang di root (packages/ belum ada — skeleton 0.1.2; akan dipindah ke paket pemiliknya saat goal terkait). Tidak ada perubahan SOT.

<a id="cl-04"></a>
### CL-04 — 2026-08-18 · 0.2.3 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `pnpm measure:concurrency` (20 worker, 1 baris counter, Turso remote HTTP): naive → final 1 / lost 19; `transaction("write")`+retry → final 20 / lost 0; optimistic locking → final 20 / lost 0 / 177 konflik terdeteksi; tercatat di `poc/RESULTS.md` §0.2.3 + `poc/results-concurrency.jsonl`. Typecheck 0 error.
**Catatan:** Temuan penerapan A.6: (1) `"immediate"` tidak didukung `@libsql/client` 0.17.4 HTTP — setaranya `transaction("write")` (write lock saat BEGIN); (2) SQLITE_BUSY di bawah kontensi + `PRAGMA busy_timeout` dilarang protokol hrana → transaksi produksi wajib retry loop pada SQLITE_BUSY; (3) tanpa tx terbukti lost update masif (INV #6/#7). Tidak ada perubahan SOT.

<a id="cl-03"></a>
### CL-03 — 2026-08-18 · 0.2.1 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** Pengukuran riil tercatat di `poc/RESULTS.md`: cold start setelah idle ≥10 menit = 2.47 s & 2.38 s (body JSON `dbMs` terverifikasi); warm n=12: total p50 459.90 ms / p95 669.59 ms, `dbMs` p50 189.90 ms (query `SELECT 1`); deploy Vercel production `ng-odingin/ngodingin-kanban-poc` (fungsi `api/[[...route]].ts`, Hono 4.13.2 + @libsql/client 0.17.4); Turso DB `poc-latency` (aws-ap-south-1).
**Catatan:** (1) Dominan latensi = region mismatch (DB Mumbai vs fungsi iad1) → rekomendasi co-location di 0.2.4; (2) cold start melewati ambang 1.5 s (2.4 s) dan warm total melewati 300 ms (670 ms) — assessment & keputusan GO/NO-GO final di 0.2.4; (3) temuan routing: static fallback `index.html` sesekali melayani `/api/measure` saat transisi scale-to-zero/boot — pola catch-all + pemisahan static/API direkomendasikan untuk produksi; (4) Turso free plan tidak mengizinkan replikasi group ke AWS region (hanya region non-AWS) — perlu plan/group berbayar untuk co-location; (5) usaha tambahan: diagnose deployment Vercel (builds/routes config vs auto-detect, project settings via API) — di luar scope goal, tidak mengubah SOT.

<a id="cl-02"></a>
### CL-02 — 2026-08-17 · 0.2.1 🔄
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** Harness `poc/measure/` dibuat: fungsi serverless Vercel `api/measure.ts` (Hono + `@libsql/client` exact pin `0.17.4`, query `SELECT 1`, `build`/`typecheck` hijau) + skrip pengukuran `scripts/measure.ts` (mode `warm`: p50/p95/p99 dari 60 request sekuensial; mode `cold`: single shot) + `poc/RESULTS.md` berisi metodologi dan ambang POC yang ditetapkan (warm p95 ≤ 300 ms, cold start p95 ≤ 1.5 s).
**Catatan:** Blocker: pengukuran riil memerlukan akun Turso (token + DB) dan Vercel (deploy + URL) yang belum tersedia di environment — menunggu credential/akses dari manusia sebelum menjalankan pengukuran. `%` 20 = harness + metodologi + ambang terbukti ada, hasil pengukuran belum ada. Bukan transisi ⏸️ (Dev tidak membuka ⏸️); goal tetap 🔄 menunggu input manusia.

<a id="cl-01"></a>
### CL-01 — 2026-08-17 · 0.1.1 🔄 → 🔎
**Role:** AI-Dev · **Model:** deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)
**Bukti:** `git rev-parse --is-inside-work-tree` = true (repo `main`, commit 643e094); Node v24.19.0 (memenuhi `>=24.18.0 <25`); `npm view` konfirmasi versi exact baseline A.8 (hono 4.13.2, typescript 6.0.2, pnpm 11.22.0) tersedia di registry; `pnpm install --frozen-lockfile` clean; `pnpm build` + `pnpm typecheck` exit 0; smoke `app.request('/health')` → 200 `{"ok":true}`.
**Catatan:** Transisi `⬜️ → 🔄` (Gate A) lalu `🔄 → 🔎` 80% dalam satu sesi Dev; masuk commit pertama. Repo sudah terinisialisasi Git — tidak perlu init ulang. Versi baseline A.8.2 diperiksa 2026-08-17 (tanggal baseline) dan sesuai; tidak ada direct dependency prerelease. `docs/design/` dibiarkan untracked (di luar scope goal).

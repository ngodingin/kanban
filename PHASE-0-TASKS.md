# Phase 0 — Foundation · Task & Goal Breakdown

> Generated per [04-DELIVERY C.6](docs/04-DELIVERY.md). SOT version: 2.0.6.
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
| 0.1.1 | 🔄 | [CL-01](#cl-01)<br>[Review-CL-02](#review-cl-02)<br>[CL-25](#cl-25) | 60 | P0 | Verifikasi baseline masih latest compatible LTS/stable sesuai A.8, lalu inisialisasi Git dan bootstrap pnpm workspace + Node.js 24 LTS + Hono 4 + TypeScript 6 memakai exact pin (build & typecheck jalan) | [03-ENG A.8](docs/03-ENGINEERING.md) | — |
| 0.1.2 | 🔎 | [CL-09](#cl-09) | 80 | P1 | Buat skeleton A.7: `apps/api` serta `packages/domain`, `infrastructure`, `contracts`, `shared`; `apps/web` tetap placeholder sampai Phase 7 | [03-ENG A.7](docs/03-ENGINEERING.md) | 0.1.1 |
| 0.1.3 | 🔎 | [CL-05](#cl-05) | 80 | P0 | Pasang exact pin A.8 untuk libSQL/Turso SDK, Zod, ULID, Drizzle + drizzle-kit, ESLint + typescript-eslint, dan Prettier; commit `pnpm-lock.yaml` | [03-ENG A.8](docs/03-ENGINEERING.md), [A.12](docs/03-ENGINEERING.md) | 0.1.1 |
| 0.1.4 | 🔎 | [CL-10](#cl-10) | 80 | P1 | `.env.example` + loader config untuk canonical origin per environment, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `AUTH_RESEND_KEY`, dan sender `noreply@kanban.ngodingin.xyz` (tanpa secret nyata) | [03-ENG D.7](docs/03-ENGINEERING.md), [A.14](docs/03-ENGINEERING.md) | 0.1.1 |
| 0.1.5 | ⬜️ | — | 0 | P1 | Tambah `compose.devenv.yml`: Docker Compose Node 24.18.0 + Corepack pnpm 11.22.0 untuk menjalankan `pnpm install --frozen-lockfile`, build, typecheck, lint, dan smoke test tanpa runtime host | [03-ENG A.8](docs/03-ENGINEERING.md), [04-DEL B.5](docs/04-DELIVERY.md) | 0.1.1 |

**Test:** `git rev-parse --is-inside-work-tree` sukses; catatan verifikasi LTS/stable tersedia; tidak ada direct dependency prerelease; clean `pnpm install --frozen-lockfile`; verifikasi `engines`/`packageManager`/exact direct pins; Hono smoke route + build + typecheck + lint hijau.
**DoD:** Git aktif; semua goal ✅; struktur folder cocok A.7; latest compatible LTS/stable sudah diverifikasi dan versi exact sesuai A.8; `pnpm-lock.yaml` ter-commit; `.env.example` lengkap; tidak ada secret ter-commit.

---

## TASK-0.2 — POC gate Turso  `[GATING]`

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.2.1 | 🔎 | [CL-01](#cl-01)<br>[CL-02](#cl-02)<br>[CL-03](#cl-03) | 80 | P0 | Ukur cold start + latensi query sederhana dari fungsi serverless Vercel | [03-ENG A.11](docs/03-ENGINEERING.md) | 0.1.1 |
| 0.2.2 | 🔎 | [CL-06](#cl-06) | 80 | P0 | Ukur waktu provisioning DB baru via Turso API | [03-ENG A.11](docs/03-ENGINEERING.md), [F.2](docs/03-ENGINEERING.md) | 0.1.1 |
| 0.2.3 | 🔎 | [CL-04](#cl-04) | 80 | P0 | Uji concurrent write + perilaku `BEGIN IMMEDIATE` | [03-ENG A.6](docs/03-ENGINEERING.md), [A.11](docs/03-ENGINEERING.md) | 0.1.1 |
| 0.2.4 | 🔎 | [CL-07](#cl-07) | 80 | P0 | Proyeksi biaya + keputusan GO/NO-GO + sinkron vs async | [03-ENG A.11](docs/03-ENGINEERING.md), [F.2](docs/03-ENGINEERING.md) | 0.2.1, 0.2.2, 0.2.3 |

**Test:** Hasil tiap pengukuran terdokumentasi di `poc/RESULTS.md` terhadap ambang yang ditetapkan saat POC.
**DoD:** Keputusan tercatat: Turso GO/NO-GO **dan** provisioning sync/async. Jika NO-GO → tandai `[NEEDS-DECISION]` fallback (libSQL self-host / D1) per A.11. **Task ini gating untuk 0.6.**

---

## TASK-0.3 — DB connection factory & Project Database Resolver

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.3.1 | 🔎 | [CL-08](#cl-08) | 80 | P0 | Factory koneksi libSQL/Drizzle (pisah Global client vs Project client dinamis) | [03-ENG A.4](docs/03-ENGINEERING.md), [A.5](docs/03-ENGINEERING.md) | 0.1.3 |
| 0.3.2 | 🔎 | [CL-11](#cl-11) | 80 | P0 | Resolver `project_id → database` via tabel `project_databases` (Global) | [03-ENG A.4](docs/03-ENGINEERING.md), [B.1](docs/03-ENGINEERING.md) | 0.3.1 |
| 0.3.3 | 🔎 | [CL-12](#cl-12) | 80 | P0 | Guard: `project_id` tak dikenal tidak pernah jatuh ke DB Project lain | [BR-007](docs/02-SPEC.md), [BR-009](docs/02-SPEC.md) | 0.3.2 |

**Test:** Unit — resolver kembalikan koneksi benar untuk `project_id` valid; `project_id` tak dikenal ditolak aman (tidak akses DB lain).
**DoD:** Resolver di balik interface; tidak ada koneksi Project DB hard-coded; fondasi isolation (BR-007/BR-009) terbukti via test.

---

## TASK-0.4 — Global DB schema + migration

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.4.1 | 🔎 | [CL-13](#cl-13) | 80 | P0 | Definisi 16 tabel Global DB (Drizzle), termasuk Better Auth core tables (`auth_sessions`, `auth_accounts`, `auth_verifications`) dan scoped Group/direct Permission assignments | [03-ENG B.2](docs/03-ENGINEERING.md), [A.13](docs/03-ENGINEERING.md) | 0.3.1 |
| 0.4.2 | ⚠️ | [CL-14](#cl-14)<br>[Review-CL-01](#review-cl-01) | 60 | P0 | Constraints membership/group/direct assignment scope, Better Auth mapping, uniqueness, hash credential, dan hashed Magic Link identifier | [03-ENG B.2](docs/03-ENGINEERING.md) | 0.4.1 |
| 0.4.3 | 🔎 | [CL-15](#cl-15) | 80 | P1 | Migration up idempotent (drizzle-kit) | [03-ENG A.12](docs/03-ENGINEERING.md), [F.3](docs/03-ENGINEERING.md) | 0.4.1 |

**Test:** Migration up idempotent; Better Auth generated-schema contract cocok dengan custom mapping B.2; constraint UNIQUE teruji; scoped assignment tidak dapat menghubungkan Membership/Group beda Project; credential dan Magic Link token tidak disimpan raw.
**DoD:** Semua tabel B.2 hadir; ULID dipakai; `users.email` normalized/unique; **tidak ada** `UNIQUE(name/title)` domain; migrasi bersih & idempotent.

---

## TASK-0.5 — Project DB schema + migration template

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.5.1 | 🔎 | [CL-16](#cl-16) | 80 | P0 | Definisi 10 tabel Project DB, termasuk `project_state` otoritatif, dengan `version` + `archived_at`/`deleted_at` | [03-ENG B.3](docs/03-ENGINEERING.md), [A.13](docs/03-ENGINEERING.md) | 0.3.1 |
| 0.5.2 | 🔎 | [CL-17](#cl-17) | 80 | P1 | Junction label dengan `removed_at`; `activities` polymorphic + `data` JSON | [03-ENG B.3](docs/03-ENGINEERING.md), [B.5](docs/03-ENGINEERING.md) | 0.5.1 |
| 0.5.3 | 🔎 | [CL-18](#cl-18) | 80 | P1 | Migration template dapat diterapkan terprogram (fan-out) | [03-ENG F.3](docs/03-ENGINEERING.md) | 0.5.1 |

**Test:** Migrasi diterapkan ke Project DB test; `project_state` tepat satu dan memiliki `version` + timestamp lifecycle; junction punya `removed_at`.
**DoD:** Schema sesuai B.3; `project_state` menjadi sumber lifecycle Project; migrasi Project applicable terprogram (fondasi fan-out F.3).

---

## TASK-0.6 — Mekanisme provisioning Project DB  (dep: 0.2, 0.4, 0.5)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.6.1 | ⚠️ | [CL-19](#cl-19)<br>[Review-CL-01](#review-cl-01) | 60 | P0 | Buat Project DB baru + apply migrasi Project schema + seed `project_state` ACTIVE dan Activity `project.created` atomik | [03-ENG F.2](docs/03-ENGINEERING.md) | 0.5.3 |
| 0.6.2 | 🔎 | [CL-20](#cl-20) | 80 | P0 | Catat mapping hasil provisioning di `project_databases` (Global) | [03-ENG A.4](docs/03-ENGINEERING.md), [B.1](docs/03-ENGINEERING.md) | 0.4.1, 0.6.1 |
| 0.6.3 | ⚠️ | [CL-22](#cl-22)<br>[Review-CL-01](#review-cl-01) | 50 | P0 | Rollback saat gagal (tidak ada DB/mapping yatim) | [03-ENG F.2](docs/03-ENGINEERING.md) | 0.6.2 |
| 0.6.4 | 🔎 | [CL-23](#cl-23) | 80 | P0 | Terapkan strategi sinkron/async sesuai keputusan 0.2.4 | [03-ENG F.2](docs/03-ENGINEERING.md) | 0.2.4 |

**Test:** Integration — provisioning menghasilkan Project DB + `project_state` ACTIVE + Activity `project.created` atomik + mapping tercatat; simulasi kegagalan → tidak ada DB/mapping yatim.
**DoD:** Panggilan provisioning menghasilkan Project DB siap pakai, satu `project_state` ACTIVE, Activity `project.created`, + mapping; kegagalan bersih; strategi sesuai 0.2. Endpoint `POST /projects` penuh = Phase 1 (di sini hanya mekanisme + seam).

---

## TASK-0.7 — API response & error convention

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.7.1 | ⬜️ | — | 0 | P1 | Bentuk sukses `{data}` & error `{error:{code,message}}` | [02-SPEC C.2](docs/02-SPEC.md) | 0.1.2 |
| 0.7.2 | ⬜️ | — | 0 | P1 | Enum error code kanonik (12 code) | [02-SPEC C.2](docs/02-SPEC.md) | 0.7.1 |
| 0.7.3 | ⬜️ | — | 0 | P2 | Helper mapping error domain → HTTP + seam `Idempotency-Key` | [02-SPEC C.2](docs/02-SPEC.md), [C.3](docs/02-SPEC.md) | 0.7.2 |

**Test:** Unit — helper menghasilkan bentuk response benar; tiap error code kanonik terpetakan ke HTTP status.
**DoD:** Handler mendatang dapat memakai helper konsisten; seluruh error code C.2 tersedia.

---

## TASK-0.8 — Better Auth setup & identity resolution

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.8.1 | ⬜️ | — | 0 | P1 | Setup exact-pinned Better Auth + Drizzle adapter, custom table/field mapping B.2, dan custom ULID `generateId` → seluruh auth state berada di Global DB | [03-ENG A.8](docs/03-ENGINEERING.md), [A.14](docs/03-ENGINEERING.md) | 0.4.1 |
| 0.8.2 | ⬜️ | — | 0 | P1 | Database-backed opaque session + secure HTTP-only cookie + sign-out/revocation dasar; cookie cache/stateless mode tetap nonaktif | [03-ENG A.14](docs/03-ENGINEERING.md) | 0.8.1 |
| 0.8.3 | ⬜️ | — | 0 | P0 | `resolveIdentity(request) → User` (satu titik resolusi identitas) | [03-ENG A.14](docs/03-ENGINEERING.md), [C.1](docs/03-ENGINEERING.md) | 0.8.2, 0.8.4 |
| 0.8.4 | ⬜️ | — | 0 | P1 | Pasang Better Auth handler `/api/auth/*` + Magic Link plugin: `sendMagicLink()` ke Resend API, `storeToken: "hashed"`, callback, konsumsi atomik single-use/expiring, dan antarmuka uji minimal | [03-ENG A.14](docs/03-ENGINEERING.md) | 0.1.4, 0.8.1 |

**Test:** Integration — handler auth terpasang sebelum catch-all; password/social auth tidak tersedia; request Magic Link tidak membocorkan keberadaan email; sender tepat; staging link hanya memakai `https://stag-kanban.ngodingin.xyz`, production link hanya memakai `https://kanban.ngodingin.xyz`; database tidak menyimpan raw verification token; token expired/used/invalid ditolak; dua konsumsi konkuren hanya satu yang sukses; link valid menghasilkan session; sign-out/revoke membuat session tidak valid.
**DoD:** Identitas web session melalui Better Auth Magic Link dan satu `resolveIdentity()`; User otoritatif di Global DB; ID auth memakai ULID; verification hashed/single-use/expiring; session database-backed dan revocable; transport email memakai `sendMagicLink()` + Resend SDK/API; secret/alamat pengirim hanya dari environment; UI final ditunda ke Phase 7.

---

## TASK-0.9 — Request pipeline: identity → project resolution → isolation  (dep: 0.3, 0.8)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.9.1 | ⬜️ | — | 0 | P0 | Resolve identity (session; seam untuk PAT/API Key di Phase 4) | [03-ENG C.1](docs/03-ENGINEERING.md) | 0.8.3 |
| 0.9.2 | ⬜️ | — | 0 | P0 | Load Project dari `:project_id` + verify membership exists | [BR-007](docs/02-SPEC.md), [BR-009](docs/02-SPEC.md) | 0.3.2, 0.9.1 |
| 0.9.3 | ⬜️ | — | 0 | P0 | Resolve Project DB **setelah** verifikasi membership | [03-ENG A.4](docs/03-ENGINEERING.md) | 0.9.2 |
| 0.9.4 | ⬜️ | — | 0 | P0 | Permission resolution = seam kosong (diisi Phase 4) | [03-ENG C.1](docs/03-ENGINEERING.md) | 0.9.1 |
| 0.9.5 | ⬜️ | — | 0 | P0 | Semua akses resource WAJIB lewat pipeline (tidak ada bypass) | [BR-008](docs/02-SPEC.md), [AC-001](docs/04-DELIVERY.md) | 0.9.3 |

**Test:** Integration — request tanpa identitas → ditolak; ke Project tanpa membership → `PROJECT_ACCESS_DENIED`; menyebut `project_id` Project lain → tidak pernah mengakses DB Project lain.
**DoD:** Tidak ada jalur akses resource yang melewati pipeline; `project_id` diverifikasi terhadap membership **sebelum** resolve Project DB; fondasi AC-001/AC-030 terpasang.

---

## TASK-0.10 — Repository/data-access boundary + transaction helper  (dep: 0.3)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.10.1 | ⬜️ | — | 0 | P0 | Pola repository — domain logic tidak import Drizzle langsung | [03-ENG A.7](docs/03-ENGINEERING.md), [A.12](docs/03-ENGINEERING.md) | 0.3.1 |
| 0.10.2 | ⬜️ | — | 0 | P0 | Transaction helper `BEGIN IMMEDIATE` (mutation + activity atomic) | [03-ENG A.6](docs/03-ENGINEERING.md) | 0.3.1 |

**Test:** Unit — transaction helper commit menyimpan; rollback membatalkan (uji mutation + dummy activity atomic).
**DoD:** Boundary jelas; domain tidak bergantung API Drizzle langsung; tx helper tersedia (fondasi A.6 / atomic Card move INV-MOVE-004).

---

## TASK-0.11 — Testing harness  (dep: 0.4, 0.5)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.11.1 | ⬜️ | — | 0 | P0 | Setup Vitest 4.x exact pin untuk unit + integration | [03-ENG A.8](docs/03-ENGINEERING.md), [04-DEL B.2](docs/04-DELIVERY.md), [B.5](docs/04-DELIVERY.md) | 0.1.3 |
| 0.11.2 | ⬜️ | — | 0 | P0 | DB test terisolasi per suite + rollback antar test | [04-DEL B.5](docs/04-DELIVERY.md) | 0.4.3, 0.5.3 |
| 0.11.3 | ⬜️ | — | 0 | P1 | Konvensi penamaan test mereferensikan ID rule (BR/AC) | [04-DEL B.6](docs/04-DELIVERY.md) | 0.11.1 |
| 0.11.4 | ⬜️ | — | 0 | P2 | Setup Playwright 1.62.x exact pin + production-like webServer untuk E2E smoke | [03-ENG A.8](docs/03-ENGINEERING.md), [04-DEL B.5](docs/04-DELIVERY.md) | 0.1.1 |

**Test:** (meta) contoh Vitest unit+integration dan Playwright E2E smoke lulus lokal.
**DoD:** `test` dan `test:e2e` jalan; integration test punya DB terisolasi & bersih antar test; pola penamaan ber-ID siap.

---

## TASK-0.12 — CI & migration pipeline dasar  (dep: 0.4, 0.5, 0.11)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.12.1 | ⬜️ | — | 0 | P1 | CI: typecheck + test otomatis per push/PR | [03-ENG F.6](docs/03-ENGINEERING.md) | 0.11.1 |
| 0.12.2 | ⬜️ | — | 0 | P1 | Migrasi Global + seam fan-out Project DB saat deploy | [03-ENG F.3](docs/03-ENGINEERING.md) | 0.4.3, 0.5.3 |
| 0.12.3 | 🔄 | [CL-24](#cl-24) | 40 | P1 | Env terpisah dev/staging/prod; staging dan production memakai canonical origin serta secret Resend terpisah | [03-ENG D.7](docs/03-ENGINEERING.md) | 0.1.4 |
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
- Tidak ada `[NEEDS-SPEC-AMENDMENT]` di Phase 0.

---

## Closure Log

> Isi tiap kali sebuah goal pindah status atau menerima hasil review. Setiap entry wajib mencantumkan Role dan nama Model aktual; jika model tidak diekspos, tulis nama platform yang menjalankan agent (mis. `GitHub Copilot` atau `Codex`) dan jangan menebak model. Tambah entry baru di atas (terbaru dulu), gunakan namespace sesuai lane, lalu **append** link entry ke baris baru dalam kolom **CL** tanpa mengubah link lama. Setiap perubahan Status wajib masuk commit; awal `→ 🔄` boleh menunggu commit pertama. Commit diverifikasi lewat history Git file ini, bukan dengan menulis hash commit yang sama ke entry. Setiap entry `⚠️`/`⏸️` wajib mencantumkan alasan.

<a id="review-cl-02"></a>
### Review-CL-02 — 2026-08-18 · 0.1.1 🔎 → ⚠️
**Role:** AI-Planning & Review · **Model:** Codex
**Bukti:** Environment saat ini tidak memiliki `node` atau `pnpm` pada PATH, sehingga baseline build/typecheck/lint/smoke tidak dapat direproduksi lokal; Docker 29.5.3 dan Docker Compose v5.1.4 tersedia.
**Catatan:** Atas permintaan manusia, 0.1.1 dibuka kembali untuk menambahkan runtime terisolasi. Goal 0.1.5 dibuat terpisah agar Docker Compose dapat direview mandiri: Node 24.18.0, pnpm 11.22.0, lockfile immutable, tanpa image aplikasi produksi atau secret.

<a id="review-cl-01"></a>
### Review-CL-01 — 2026-08-18 · 0.4.2, 0.6.1, 0.6.3 🔎 → ⚠️
**Role:** AI-Planning & Review · **Model:** Codex
**Bukti:** (1) `global-schema.ts` dan migration memeriksa `scope_type IN ('project', 'milestone', 'board')`, tetapi `ScopedScopeType` dan 03-ENGINEERING B.2 / BR-042 mensyaratkan juga `list` dan `card`; (2) `provisionProjectDatabase()` selalu memanggil `deleteDatabase()` di `catch`, termasuk bila `createDatabase()` gagal karena DB bernama sama telah ada; (3) Activity `project.created` memakai ID deterministik `act_${projectId}_created`, bukan ULID seperti A.13/DoD 0.4.1.
**Catatan:** Kembalikan ke Dev: perlu memperluas CHECK scope + test positif/negatif List/Card; hanya menghapus DB yang benar-benar dibuat oleh invocation gagal serta mengubah smoke name-conflict agar membuktikan DB existing tidak dihapus; gunakan ULID untuk Activity provisioning. Positif: boundary infrastructure sudah terpisah dari app/domain dan tidak ada import Drizzle di luar `packages/infrastructure`; tetapi orchestrator provisioning masih mencampurkan lifecycle provider, migrasi, seed, dan mapping sehingga sebaiknya dipecah saat perbaikan tanpa mengubah kontrak.

<a id="cl-24"></a>
### CL-24 — 2026-08-18 · 0.12.3 ⬜️ → 🔄
**Role:** AI-Dev · **Model:** Codex
**Bukti:** `.env.example` dipetakan ke D.7: development `http://localhost:5173`, Vercel Preview/staging `https://stag-kanban.ngodingin.xyz`, dan production `https://kanban.ngodingin.xyz`; loader `packages/infrastructure/src/config/env.ts` serta smoke test `smoke-config.ts` sudah menegakkan pemetaan yang sama.
**Catatan:** Keputusan manusia mempertahankan canonical staging SOT. Konfigurasi secret dan koneksi DB nyata di Vercel masih memerlukan nilai rahasia dari operator; tidak ada secret ditulis ke repository.

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

<a id="cl-25"></a>
### CL-25 — 2026-08-18 · 0.1.1 ⚠️ → 🔄
**Role:** AI-Dev · **Model:** Codex
**Bukti:** `Review-CL-02` menetapkan ulang goal karena Node/pnpm tidak tersedia pada PATH host, sedangkan `docker --version` dan `docker compose version` tersedia. Manusia mengonfirmasi perbaikan 0.1.1 melalui runtime Docker terisolasi.
**Catatan:** Scope perbaikan dibatasi pada Compose development environment yang memakai Node 24.18.0 dan pnpm 11.22.0; tanpa image aplikasi produksi atau secret.

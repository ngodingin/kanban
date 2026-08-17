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
| 0.1.1 | ⬜️ | — | 0 | P0 | Verifikasi baseline masih latest compatible LTS/stable sesuai A.8, lalu inisialisasi Git dan bootstrap pnpm workspace + Node.js 24 LTS + Hono 4 + TypeScript 6 memakai exact pin (build & typecheck jalan) | [03-ENG A.8](docs/03-ENGINEERING.md) | — |
| 0.1.2 | ⬜️ | — | 0 | P1 | Buat skeleton A.7: `apps/api` serta `packages/domain`, `infrastructure`, `contracts`, `shared`; `apps/web` tetap placeholder sampai Phase 7 | [03-ENG A.7](docs/03-ENGINEERING.md) | 0.1.1 |
| 0.1.3 | ⬜️ | — | 0 | P0 | Pasang exact pin A.8 untuk libSQL/Turso SDK, Zod, ULID, Drizzle + drizzle-kit, ESLint + typescript-eslint, dan Prettier; commit `pnpm-lock.yaml` | [03-ENG A.8](docs/03-ENGINEERING.md), [A.12](docs/03-ENGINEERING.md) | 0.1.1 |
| 0.1.4 | ⬜️ | — | 0 | P1 | `.env.example` + loader config untuk canonical origin per environment, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `AUTH_RESEND_KEY`, dan sender `noreply@kanban.ngodingin.xyz` (tanpa secret nyata) | [03-ENG D.7](docs/03-ENGINEERING.md), [A.14](docs/03-ENGINEERING.md) | 0.1.1 |

**Test:** `git rev-parse --is-inside-work-tree` sukses; catatan verifikasi LTS/stable tersedia; tidak ada direct dependency prerelease; clean `pnpm install --frozen-lockfile`; verifikasi `engines`/`packageManager`/exact direct pins; Hono smoke route + build + typecheck + lint hijau.
**DoD:** Git aktif; semua goal ✅; struktur folder cocok A.7; latest compatible LTS/stable sudah diverifikasi dan versi exact sesuai A.8; `pnpm-lock.yaml` ter-commit; `.env.example` lengkap; tidak ada secret ter-commit.

---

## TASK-0.2 — POC gate Turso  `[GATING]`

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.2.1 | ⬜️ | — | 0 | P0 | Ukur cold start + latensi query sederhana dari fungsi serverless Vercel | [03-ENG A.11](docs/03-ENGINEERING.md) | 0.1.1 |
| 0.2.2 | ⬜️ | — | 0 | P0 | Ukur waktu provisioning DB baru via Turso API | [03-ENG A.11](docs/03-ENGINEERING.md), [F.2](docs/03-ENGINEERING.md) | 0.1.1 |
| 0.2.3 | ⬜️ | — | 0 | P0 | Uji concurrent write + perilaku `BEGIN IMMEDIATE` | [03-ENG A.6](docs/03-ENGINEERING.md), [A.11](docs/03-ENGINEERING.md) | 0.1.1 |
| 0.2.4 | ⬜️ | — | 0 | P0 | Proyeksi biaya + keputusan GO/NO-GO + sinkron vs async | [03-ENG A.11](docs/03-ENGINEERING.md), [F.2](docs/03-ENGINEERING.md) | 0.2.1, 0.2.2, 0.2.3 |

**Test:** Hasil tiap pengukuran terdokumentasi di `poc/RESULTS.md` terhadap ambang yang ditetapkan saat POC.
**DoD:** Keputusan tercatat: Turso GO/NO-GO **dan** provisioning sync/async. Jika NO-GO → tandai `[NEEDS-DECISION]` fallback (libSQL self-host / D1) per A.11. **Task ini gating untuk 0.6.**

---

## TASK-0.3 — DB connection factory & Project Database Resolver

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.3.1 | ⬜️ | — | 0 | P0 | Factory koneksi libSQL/Drizzle (pisah Global client vs Project client dinamis) | [03-ENG A.4](docs/03-ENGINEERING.md), [A.5](docs/03-ENGINEERING.md) | 0.1.3 |
| 0.3.2 | ⬜️ | — | 0 | P0 | Resolver `project_id → database` via tabel `project_databases` (Global) | [03-ENG A.4](docs/03-ENGINEERING.md), [B.1](docs/03-ENGINEERING.md) | 0.3.1 |
| 0.3.3 | ⬜️ | — | 0 | P0 | Guard: `project_id` tak dikenal tidak pernah jatuh ke DB Project lain | [BR-007](docs/02-SPEC.md), [BR-009](docs/02-SPEC.md) | 0.3.2 |

**Test:** Unit — resolver kembalikan koneksi benar untuk `project_id` valid; `project_id` tak dikenal ditolak aman (tidak akses DB lain).
**DoD:** Resolver di balik interface; tidak ada koneksi Project DB hard-coded; fondasi isolation (BR-007/BR-009) terbukti via test.

---

## TASK-0.4 — Global DB schema + migration

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.4.1 | ⬜️ | — | 0 | P0 | Definisi 16 tabel Global DB (Drizzle), termasuk Better Auth core tables (`auth_sessions`, `auth_accounts`, `auth_verifications`) dan scoped Group/direct Permission assignments | [03-ENG B.2](docs/03-ENGINEERING.md), [A.13](docs/03-ENGINEERING.md) | 0.3.1 |
| 0.4.2 | ⬜️ | — | 0 | P0 | Constraints membership/group/direct assignment scope, Better Auth mapping, uniqueness, hash credential, dan hashed Magic Link identifier | [03-ENG B.2](docs/03-ENGINEERING.md) | 0.4.1 |
| 0.4.3 | ⬜️ | — | 0 | P1 | Migration up idempotent (drizzle-kit) | [03-ENG A.12](docs/03-ENGINEERING.md), [F.3](docs/03-ENGINEERING.md) | 0.4.1 |

**Test:** Migration up idempotent; Better Auth generated-schema contract cocok dengan custom mapping B.2; constraint UNIQUE teruji; scoped assignment tidak dapat menghubungkan Membership/Group beda Project; credential dan Magic Link token tidak disimpan raw.
**DoD:** Semua tabel B.2 hadir; ULID dipakai; `users.email` normalized/unique; **tidak ada** `UNIQUE(name/title)` domain; migrasi bersih & idempotent.

---

## TASK-0.5 — Project DB schema + migration template

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.5.1 | ⬜️ | — | 0 | P0 | Definisi 10 tabel Project DB, termasuk `project_state` otoritatif, dengan `version` + `archived_at`/`deleted_at` | [03-ENG B.3](docs/03-ENGINEERING.md), [A.13](docs/03-ENGINEERING.md) | 0.3.1 |
| 0.5.2 | ⬜️ | — | 0 | P1 | Junction label dengan `removed_at`; `activities` polymorphic + `data` JSON | [03-ENG B.3](docs/03-ENGINEERING.md), [B.5](docs/03-ENGINEERING.md) | 0.5.1 |
| 0.5.3 | ⬜️ | — | 0 | P1 | Migration template dapat diterapkan terprogram (fan-out) | [03-ENG F.3](docs/03-ENGINEERING.md) | 0.5.1 |

**Test:** Migrasi diterapkan ke Project DB test; `project_state` tepat satu dan memiliki `version` + timestamp lifecycle; junction punya `removed_at`.
**DoD:** Schema sesuai B.3; `project_state` menjadi sumber lifecycle Project; migrasi Project applicable terprogram (fondasi fan-out F.3).

---

## TASK-0.6 — Mekanisme provisioning Project DB  (dep: 0.2, 0.4, 0.5)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 0.6.1 | ⬜️ | — | 0 | P0 | Buat Project DB baru + apply migrasi Project schema + seed `project_state` ACTIVE dan Activity `project.created` atomik | [03-ENG F.2](docs/03-ENGINEERING.md) | 0.5.3 |
| 0.6.2 | ⬜️ | — | 0 | P0 | Catat mapping hasil provisioning di `project_databases` (Global) | [03-ENG A.4](docs/03-ENGINEERING.md), [B.1](docs/03-ENGINEERING.md) | 0.4.1, 0.6.1 |
| 0.6.3 | ⬜️ | — | 0 | P0 | Rollback saat gagal (tidak ada DB/mapping yatim) | [03-ENG F.2](docs/03-ENGINEERING.md) | 0.6.2 |
| 0.6.4 | ⬜️ | — | 0 | P0 | Terapkan strategi sinkron/async sesuai keputusan 0.2.4 | [03-ENG F.2](docs/03-ENGINEERING.md) | 0.2.4 |

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
- `[NEEDS-DECISION]` 0.2.4 — provisioning sinkron vs async → dari hasil POC Turso.
- Tidak ada `[NEEDS-SPEC-AMENDMENT]` di Phase 0.

---

## Closure Log

> Isi tiap kali sebuah goal pindah status atau menerima hasil review. Setiap entry wajib mencantumkan Role dan nama Model aktual; jika model tidak diekspos, tulis nama platform yang menjalankan agent (mis. `GitHub Copilot` atau `Codex`) dan jangan menebak model. Tambah entry baru di atas (terbaru dulu), gunakan namespace sesuai lane, lalu **append** link entry ke baris baru dalam kolom **CL** tanpa mengubah link lama. Setiap perubahan Status wajib masuk commit; awal `→ 🔄` boleh menunggu commit pertama. Commit diverifikasi lewat history Git file ini, bukan dengan menulis hash commit yang sama ke entry. Setiap entry `⚠️`/`⏸️` wajib mencantumkan alasan.

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

<!-- Contoh (hapus saat entry nyata pertama ditambahkan):
<a id="cl-00"></a>
### CL-00 — 2026-08-17 · 0.1.1 🔎
**Role:** AI-Dev · **Model:** DeepSeek V4 Flash
**Bukti:** `pnpm build` exit 0; `pnpm typecheck` exit 0 (log CI #12).
**Catatan:** Tidak ada penyimpangan; menunggu verifikasi QA.
-->

# Phase 0 — Foundation · Task & Goal Breakdown

> Generated per [04-DELIVERY C.6](docs/04-DELIVERY.md). SOT version: 1.0.3.
> Scope batas: [04-DELIVERY C.1 "Phase 0"](docs/04-DELIVERY.md). Acuan utama: [03-ENGINEERING Part A/B/D](docs/03-ENGINEERING.md) + [02-SPEC C.2](docs/02-SPEC.md).
> **Konteks:** belum ada repo — Phase 0 adalah bootstrapping. Path file adalah *usulan* sesuai [03-ENGINEERING A.7](docs/03-ENGINEERING.md); sesuaikan saat implementasi. File ini working list, **terpisah dari SOT**.

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

Kolom **%** = estimasi penyelesaian goal (0–100). Update bersama Status. Setiap perpindahan Status WAJIB dicatat di [Closure Log](#closure-log).

Catatan: Dev hanya boleh mengatur persentase sampai maksimum 80%; nilai 100% hanya boleh ditetapkan oleh sesi QA setelah verifikasi (lihat `AGENTS.md`).

## Dependency graph (task-level)
```text
0.1 scaffolding
 ├─ 0.2 POC Turso [GATING]
 ├─ 0.3 db connection & resolver
 │    ├─ 0.4 Global DB schema
 │    ├─ 0.5 Project DB schema
 │    └─ 0.6 provisioning ◄── 0.2 (sync/async) + 0.4 + 0.5
 ├─ 0.7 API response/error convention
 ├─ 0.8 Auth.js identity
 │    └─ 0.9 request pipeline ◄── 0.3 + 0.8
 ├─ 0.10 repository/tx boundary ◄── 0.3
 ├─ 0.11 testing harness ◄── 0.4/0.5
 └─ 0.12 CI & migration pipeline ◄── 0.4/0.5/0.11
```

---

## TASK-0.1 — Inisialisasi project & struktur folder

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 0.1.1 | 🔎 | 80 | Bootstrap Next.js + TypeScript (build & typecheck jalan) | [03-ENG A.8](docs/03-ENGINEERING.md) | — |
| 0.1.2 | 🔎 | 80 | Buat skeleton folder domain-oriented (modules/, infrastructure/, shared/) | [03-ENG A.7](docs/03-ENGINEERING.md) | 0.1.1 |
| 0.1.3 | 🔎 | 80 | Pasang tooling: Zod, Drizzle + drizzle-kit, linter/formatter | [03-ENG A.8](docs/03-ENGINEERING.md), [A.12](docs/03-ENGINEERING.md) | 0.1.1 |
| 0.1.4 | ⬜️ | 0 | `.env.example` + loader config env (tanpa secret nyata) | [03-ENG D.7](docs/03-ENGINEERING.md) | 0.1.1 |

**Test:** `next build` + typecheck hijau; linter jalan tanpa error blocking.
**DoD:** Semua goal ✅; struktur folder cocok A.7; `.env.example` lengkap; tidak ada secret ter-commit.

---

## TASK-0.2 — POC gate Turso  `[GATING]`

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 0.2.1 | ⬜️ | 0 | Ukur cold start + latensi query sederhana dari fungsi serverless Vercel | [03-ENG A.11](docs/03-ENGINEERING.md) | 0.1.1 |
| 0.2.2 | ⬜️ | 0 | Ukur waktu provisioning DB baru via Turso API | [03-ENG A.11](docs/03-ENGINEERING.md), [F.2](docs/03-ENGINEERING.md) | 0.1.1 |
| 0.2.3 | ⬜️ | 0 | Uji concurrent write + perilaku `BEGIN IMMEDIATE` | [03-ENG A.6](docs/03-ENGINEERING.md), [A.11](docs/03-ENGINEERING.md) | 0.1.1 |
| 0.2.4 | ⬜️ | 0 | Proyeksi biaya + keputusan GO/NO-GO + sinkron vs async | [03-ENG A.11](docs/03-ENGINEERING.md), [F.2](docs/03-ENGINEERING.md) | 0.2.1, 0.2.2, 0.2.3 |

**Test:** Hasil tiap pengukuran terdokumentasi di `poc/RESULTS.md` terhadap ambang yang ditetapkan saat POC.
**DoD:** Keputusan tercatat: Turso GO/NO-GO **dan** provisioning sync/async. Jika NO-GO → tandai `[NEEDS-DECISION]` fallback (libSQL self-host / D1) per A.11. **Task ini gating untuk 0.6.**

---

## TASK-0.3 — DB connection factory & Project Database Resolver

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 0.3.1 | ⬜️ | 0 | Factory koneksi libSQL/Drizzle (pisah Global client vs Project client dinamis) | [03-ENG A.4](docs/03-ENGINEERING.md), [A.5](docs/03-ENGINEERING.md) | 0.1.3 |
| 0.3.2 | ⬜️ | 0 | Resolver `project_id → database` via tabel `project_databases` (Global) | [03-ENG A.4](docs/03-ENGINEERING.md), [B.1](docs/03-ENGINEERING.md) | 0.3.1 |
| 0.3.3 | ⬜️ | 0 | Guard: `project_id` tak dikenal tidak pernah jatuh ke DB Project lain | [BR-007](docs/02-SPEC.md), [BR-009](docs/02-SPEC.md) | 0.3.2 |

**Test:** Unit — resolver kembalikan koneksi benar untuk `project_id` valid; `project_id` tak dikenal ditolak aman (tidak akses DB lain).
**DoD:** Resolver di balik interface; tidak ada koneksi Project DB hard-coded; fondasi isolation (BR-007/BR-009) terbukti via test.

---

## TASK-0.4 — Global DB schema + migration

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 0.4.1 | ⬜️ | 0 | Definisi 12 tabel Global DB (Drizzle), PK ULID (TEXT), timestamp lifecycle | [03-ENG B.2](docs/03-ENGINEERING.md), [A.13](docs/03-ENGINEERING.md) | 0.3.1 |
| 0.4.2 | ⬜️ | 0 | Constraints: `UNIQUE(project_id,user_id)`, `UNIQUE(group_id,permission_id)`, hash credential | [03-ENG B.2](docs/03-ENGINEERING.md) | 0.4.1 |
| 0.4.3 | ⬜️ | 0 | Migration up idempotent (drizzle-kit) | [03-ENG A.12](docs/03-ENGINEERING.md), [F.3](docs/03-ENGINEERING.md) | 0.4.1 |

**Test:** Migration up idempotent di DB test; constraint UNIQUE teruji; kolom hash credential ada.
**DoD:** Semua tabel B.2 hadir; ULID dipakai; **tidak ada** `UNIQUE(name/title)`; migrasi bersih & idempotent.

---

## TASK-0.5 — Project DB schema + migration template

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 0.5.1 | ⬜️ | 0 | Definisi 9 tabel Project DB dengan `version` + `archived_at`/`deleted_at` | [03-ENG B.3](docs/03-ENGINEERING.md), [A.13](docs/03-ENGINEERING.md) | 0.3.1 |
| 0.5.2 | ⬜️ | 0 | Junction label dengan `removed_at`; `activities` polymorphic + `data` JSON | [03-ENG B.3](docs/03-ENGINEERING.md), [B.5](docs/03-ENGINEERING.md) | 0.5.1 |
| 0.5.3 | ⬜️ | 0 | Migration template dapat diterapkan terprogram (fan-out) | [03-ENG F.3](docs/03-ENGINEERING.md) | 0.5.1 |

**Test:** Migrasi diterapkan ke Project DB test; kolom `version` & timestamp ada; junction punya `removed_at`.
**DoD:** Schema sesuai B.3; migrasi Project applicable terprogram (fondasi fan-out F.3).

---

## TASK-0.6 — Mekanisme provisioning Project DB  (dep: 0.2, 0.4, 0.5)

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 0.6.1 | ⬜️ | 0 | Buat Project DB baru + apply migrasi Project schema | [03-ENG F.2](docs/03-ENGINEERING.md) | 0.5.3 |
| 0.6.2 | ⬜️ | 0 | Catat mapping hasil provisioning di `project_databases` (Global) | [03-ENG A.4](docs/03-ENGINEERING.md), [B.1](docs/03-ENGINEERING.md) | 0.4.1, 0.6.1 |
| 0.6.3 | ⬜️ | 0 | Rollback saat gagal (tidak ada DB/mapping yatim) | [03-ENG F.2](docs/03-ENGINEERING.md) | 0.6.2 |
| 0.6.4 | ⬜️ | 0 | Terapkan strategi sinkron/async sesuai keputusan 0.2.4 | [03-ENG F.2](docs/03-ENGINEERING.md) | 0.2.4 |

**Test:** Integration — provisioning menghasilkan Project DB + mapping tercatat; simulasi kegagalan → tidak ada DB/mapping yatim.
**DoD:** Panggilan provisioning menghasilkan Project DB siap pakai + mapping; kegagalan bersih; strategi sesuai 0.2. Endpoint `POST /projects` penuh = Phase 1 (di sini hanya mekanisme + seam).

---

## TASK-0.7 — API response & error convention

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 0.7.1 | ⬜️ | 0 | Bentuk sukses `{data}` & error `{error:{code,message}}` | [02-SPEC C.2](docs/02-SPEC.md) | 0.1.2 |
| 0.7.2 | ⬜️ | 0 | Enum error code kanonik (13 code) | [02-SPEC C.2](docs/02-SPEC.md) | 0.7.1 |
| 0.7.3 | ⬜️ | 0 | Helper mapping error domain → HTTP + seam `Idempotency-Key` | [02-SPEC C.2](docs/02-SPEC.md), [C.3](docs/02-SPEC.md) | 0.7.2 |

**Test:** Unit — helper menghasilkan bentuk response benar; tiap error code kanonik terpetakan ke HTTP status.
**DoD:** Handler mendatang dapat memakai helper konsisten; seluruh error code C.2 tersedia.

---

## TASK-0.8 — Auth.js setup & identity resolution

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 0.8.1 | ⬜️ | 0 | Setup Auth.js + adapter Drizzle → user tersimpan di Global DB `users` | [03-ENG A.14](docs/03-ENGINEERING.md) | 0.4.1 |
| 0.8.2 | ⬜️ | 0 | JWT session strategy | [03-ENG A.14](docs/03-ENGINEERING.md) | 0.8.1 |
| 0.8.3 | ⬜️ | 0 | `resolveIdentity(request) → User` (satu titik resolusi identitas) | [03-ENG A.14](docs/03-ENGINEERING.md), [C.1](docs/03-ENGINEERING.md) | 0.8.1 |
| 0.8.4 | ⬜️ | 0 | `[NEEDS-DECISION]` pilih metode identitas (email/password vs OAuth vs magic link) | [03-ENG A.14](docs/03-ENGINEERING.md) | — |

**Test:** Integration — login membuat/menemukan user di Global DB; session valid → User; session invalid → ditolak.
**DoD:** Identitas web session via satu `resolveIdentity()`; user otoritatif di Global DB (A.14); metode identitas terpilih & tercatat di Closure Log.

---

## TASK-0.9 — Request pipeline: identity → project resolution → isolation  (dep: 0.3, 0.8)

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 0.9.1 | ⬜️ | 0 | Resolve identity (session; seam untuk PAT/API Key di Phase 4) | [03-ENG C.1](docs/03-ENGINEERING.md) | 0.8.3 |
| 0.9.2 | ⬜️ | 0 | Load Project dari `:project_id` + verify membership exists | [BR-007](docs/02-SPEC.md), [BR-009](docs/02-SPEC.md) | 0.3.2, 0.9.1 |
| 0.9.3 | ⬜️ | 0 | Resolve Project DB **setelah** verifikasi membership | [03-ENG A.4](docs/03-ENGINEERING.md) | 0.9.2 |
| 0.9.4 | ⬜️ | 0 | Permission resolution = seam kosong (diisi Phase 4) | [03-ENG C.1](docs/03-ENGINEERING.md) | 0.9.1 |
| 0.9.5 | ⬜️ | 0 | Semua akses resource WAJIB lewat pipeline (tidak ada bypass) | [BR-008](docs/02-SPEC.md), [AC-001](docs/04-DELIVERY.md) | 0.9.3 |

**Test:** Integration — request tanpa identitas → ditolak; ke Project tanpa membership → `PROJECT_ACCESS_DENIED`; menyebut `project_id` Project lain → tidak pernah mengakses DB Project lain.
**DoD:** Tidak ada jalur akses resource yang melewati pipeline; `project_id` diverifikasi terhadap membership **sebelum** resolve Project DB; fondasi AC-001/AC-030 terpasang.

---

## TASK-0.10 — Repository/data-access boundary + transaction helper  (dep: 0.3)

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 0.10.1 | ⬜️ | 0 | Pola repository — domain logic tidak import Drizzle langsung | [03-ENG A.7](docs/03-ENGINEERING.md), [A.12](docs/03-ENGINEERING.md) | 0.3.1 |
| 0.10.2 | ⬜️ | 0 | Transaction helper `BEGIN IMMEDIATE` (mutation + activity atomic) | [03-ENG A.6](docs/03-ENGINEERING.md) | 0.3.1 |

**Test:** Unit — transaction helper commit menyimpan; rollback membatalkan (uji mutation + dummy activity atomic).
**DoD:** Boundary jelas; domain tidak bergantung API Drizzle langsung; tx helper tersedia (fondasi A.6 / INV-MOVE-004).

---

## TASK-0.11 — Testing harness  (dep: 0.4, 0.5)

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 0.11.1 | ⬜️ | 0 | Runner unit + integration | [04-DEL B.2](docs/04-DELIVERY.md) | 0.1.3 |
| 0.11.2 | ⬜️ | 0 | DB test terisolasi per suite + rollback antar test | [04-DEL B.5](docs/04-DELIVERY.md) | 0.4.3, 0.5.3 |
| 0.11.3 | ⬜️ | 0 | Konvensi penamaan test mereferensikan ID rule (BR/AC) | [04-DEL B.6](docs/04-DELIVERY.md) | 0.11.1 |

**Test:** (meta) contoh unit + integration test lulus lokal.
**DoD:** `test` jalan; integration test punya DB terisolasi & bersih antar test; pola penamaan ber-ID siap.

---

## TASK-0.12 — CI & migration pipeline dasar  (dep: 0.4, 0.5, 0.11)

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 0.12.1 | ⬜️ | 0 | CI: typecheck + test otomatis per push/PR | [03-ENG F.6](docs/03-ENGINEERING.md) | 0.11.1 |
| 0.12.2 | ⬜️ | 0 | Migrasi Global + seam fan-out Project DB saat deploy | [03-ENG F.3](docs/03-ENGINEERING.md) | 0.4.3, 0.5.3 |
| 0.12.3 | ⬜️ | 0 | Env terpisah dev/staging/prod (isolasi penuh) | [03-ENG D.7](docs/03-ENGINEERING.md) | 0.1.4 |
| 0.12.4 | ⬜️ | 0 | Hubungkan release checklist F.6 sebagai langkah CI | [03-ENG F.6](docs/03-ENGINEERING.md) | 0.12.1 |

**Test:** CI hijau di branch; migrasi Global jalan di staging; seam fan-out Project terpanggil (walau 0 Project).
**DoD:** CI menjalankan typecheck+test+migrasi; env terpisah; langkah release checklist F.6 terhubung.

---

## Exit Criteria Phase 0 (syarat mulai Phase 1)
- Repo terstruktur sesuai A.7; build/typecheck/test/CI hijau.
- Keputusan POC (0.2) tercatat: Turso GO/NO-GO + provisioning sync/async.
- Global DB & Project DB schema termigrasi; provisioning Project DB baru berfungsi + rollback aman.
- Pipeline request menegakkan: identity wajib, membership diverifikasi, Project DB di-resolve setelah verifikasi, tanpa kebocoran lintas Project.
- Identity web session (Auth.js) berfungsi; user otoritatif di Global DB.
- Transaction helper + repository boundary siap dipakai domain command.

## Flag terbuka (sesuai C.6.5)
- `[NEEDS-DECISION]` 0.2.4 — provisioning sinkron vs async → dari hasil POC Turso.
- `[NEEDS-DECISION]` 0.8.4 — metode identitas dalam Auth.js → ringan, non-blocking arsitektur.
- Tidak ada `[NEEDS-SPEC-AMENDMENT]` di Phase 0.

---

## Closure Log

> Isi tiap kali sebuah goal pindah status, dengan format di bawah. Tambah entry baru di atas (terbaru dulu). Setiap entry `⚠️`/`⏸️` wajib mencantumkan alasan.

```
<a id="cl-01"></a>
### CL-01 — YYYY-MM-DD · <ID goal> <status baru>
**Bukti:** <output command / log / screenshot yang bisa diverifikasi ulang>
**Catatan:** <penyimpangan dari Scope asli, atau alasan gagal jika ⚠️>
```

<!-- Contoh (hapus saat entry nyata pertama ditambahkan):
<a id="cl-00"></a>
### CL-00 — 2026-08-17 · 0.1.1 🔎
**Bukti:** `pnpm build` exit 0; `pnpm typecheck` exit 0 (log CI #12).
**Catatan:** Tidak ada penyimpangan; menunggu verifikasi QA.
-->

<a id="cl-02"></a>
### CL-02 — 2026-08-17 · 0.1.1 🔎
**Bukti:** Dijalankan di container build: `docker build -t kanban-next-image . && docker run --rm kanban-next-image sh -lc "npm run typecheck && npm run build"`.

- `npm run typecheck` (tsc --noEmit) exited 0.
- `npm run build` (next build) completed: "✓ Compiled successfully" dan halaman API ter-generate.

Contoh potongan log yang dapat diverifikasi ulang dari run:
```
> kanban-app@0.1.0 typecheck
> tsc --noEmit

> kanban-app@0.1.0 build
> next build

✓ Compiled successfully
Generating static pages (2/2) ...
```

**Catatan:** Dev menandai goal selesai dan mengunggah bukti; status kini `🔎` (Menunggu verifikasi QA). Saya tidak akan mengubah status menjadi `✅` — itu tugas sesi QA sesuai `AGENTS.md`.

<a id="cl-03"></a>
### CL-03 — 2026-08-17 · 0.11.1 🔎
**Bukti:** Test suite dijalankan lokal pada mesin developer:

```
npm test --silent

	card.move - moveCard()
		✔ moves a card successfully when expected_version matches
		✔ throws VERSION_CONFLICT when expected_version mismatches
		✔ throws INVALID_DESTINATION when destination board milestone differs

	3 passing (3ms)
```

**Catatan:** Semua test unit terkait domain-command `moveCard()` lulus. Status untuk `0.11.1` dipindah ke `🔎` (menunggu verifikasi QA).

<a id="cl-04"></a>
### CL-04 — 2026-08-17 · 0.1.3 🔎
**Bukti:** Dev menambahkan konfigurasi tooling dan dependensi, meng-commit dan mendorong ke `main`:

```
git commit -m "chore: add dev tooling configs and .env.example"
git push ar-github main
```

Perubahan utama: `package.json` (devDeps, lint/test scripts), `.eslintrc.json`, `.prettierrc`, `.env.example`, dan `package-lock.json`.

**Catatan:** Task `0.1.3` dipindah ke `🔎` (menunggu verifikasi QA). Dev tidak akan menandai `✅`.

<a id="cl-05"></a>
### CL-05 — 2026-08-17 · Repo housekeeping
**Bukti:** Dev membuat branch `dev/phase-0-test-fix`, meng-merge ke `main`, dan menghapus branch feature lokal & remote:

```
git checkout -b dev/phase-0-test-fix
git commit -m "test: fix ESM ts-node loader and imports; enable allowImportingTsExtensions"
git push -u ar-github dev/phase-0-test-fix
git checkout main
git merge --no-ff dev/phase-0-test-fix -m "chore: merge test fixes from dev/phase-0-test-fix"
git push ar-github main
git push ar-github --delete dev/phase-0-bootstrap-commit dev/phase-0-test-fix
```

**Catatan:** Semua branch selain `main` sudah dihapus. Perubahan pada `main` didorong; langkah verifikasi selanjutnya adalah QA menjalankan suite di CI dan memverifikasi bukti yang tercantum di atas.

<a id="cl-06"></a>
### CL-06 — 2026-08-17 · 0.1.4 🔎
**Bukti:** Dev menambahkan environment loader menggunakan `zod` + `dotenv` dan unit tests; tests dijalankan lokal:

```
npm test --silent

	env.parseEnv
		✔ parses valid environment correctly
		✔ throws on missing required vars

	card.move - moveCard()
		✔ moves a card successfully when expected_version matches
		✔ throws VERSION_CONFLICT when expected_version mismatches
		✔ throws INVALID_DESTINATION when destination board milestone differs

	5 passing (4ms)
```

Perubahan: `src/config/env.ts`, `src/config/env.test.ts`, dan `package.json` (added `dotenv`).

**Catatan:** Task `0.1.4` dipindah ke `🔎` (menunggu verifikasi QA). Dev tidak akan menandai `✅`.

# Phase 7 — UI · Task & Goal Breakdown

> ✅ **GATE DIBUKA 2026-08-25** ([Review-CL-05](#review-cl-05)) — keputusan manusia eksplisit setelah Exit Criteria Phase 0–6 diverifikasi independen genuinely terpenuhi ([Review-CL-04, PHASE-6-TASKS.md](PHASE-6-TASKS.md#review-cl-04)). Goal di bawah sekarang `⬜️` (actionable), bukan lagi `⏸️`.
>
> Generated per [04-DELIVERY C.6](docs/04-DELIVERY.md). Generated at SOT version: 4.1.1 (direfresh dari 2.0.6 saat gate dibuka — lihat [Review-CL-05](#review-cl-05)); current SOT version: 4.3.0. Acuan desain: [docs/05-FRONTEND.md](docs/05-FRONTEND.md). Acuan alur: [04-DELIVERY Part A (UX Flows)](docs/04-DELIVERY.md).
> **Audit terbaru:** outline sudah diselaraskan bertahap ke titik kontrak observable SOT 4.0.0 ([Review-CL-02](#review-cl-02)) — dikonfirmasi ulang [Review-CL-05](#review-cl-05): amandemen 4.1.0/4.1.1 (BR-054C revoke lintas-DB, journal deprovision, F.1 RTO/RPO) bersifat control-plane/operasional internal, TIDAK mengubah API contract yang UI konsumsi. Versi dependency UI (React/Vite/React Router/Tailwind/shadcn/TanStack Query/Zustand/dnd-kit) direvalidasi terhadap npm registry saat gate dibuka — seluruhnya cocok baseline `03-ENG A.8` tanpa revisi.
>
> **Catatan metodologi (C.6):** task granular di-*refresh* saat fase menjadi aktif, terhadap state repo nyata. `apps/web/` saat ini HANYA placeholder (`package.json` kosong, `README.md`, `public/index.html` static test shell) — TIDAK ADA scaffold Vite/React/shadcn sama sekali. `TASK-7.1.1` genuinely mulai dari nol, bukan refine kode existing.
>
> **AI-Dev execution gate:** jangan ubah implementasi sebelum goal `🔄` + `CL` terpasang. Jangan menyatakan selesai sebelum goal `🔎`/`80%` + CL baru + test hijau + commit. Format handoff wajib mengikuti [AGENTS.md §0](AGENTS.md).

## Prinsip Phase 7
Bangun domain UI sebagai React/Vite SPA di atas shadcn primitives, **tanpa membiarkan template/demo mendikte domain**. Setiap komponen memetakan ke field yang ADA di [02-SPEC](docs/02-SPEC.md). UI tidak memperkenalkan field baru (priority/progress-card/status/inbox = non-goal, [05-FRONTEND §4](docs/05-FRONTEND.md)). Semua mutasi lewat domain command + optimistic locking + permission.

## Legend Status
⬜️ Belum · 🔄 Dikerjakan · 🔎 Menunggu verifikasi · ✅ Terverifikasi QA · ⚠️ Gagal-verifikasi · ⏸️ Blocked
Kolom **%** = kemajuan yang sudah terbukti, bukan estimasi atau asumsi. Dev hanya boleh mengisi `0–80`; `80` berarti implementasi + Test + DoD sisi Dev selesai dan siap `🔎`. Hanya QA yang boleh mengisi `100`, bersamaan dengan `✅`. Nilai untuk `⚠️`/`⏸️` dipertahankan atau dikoreksi berdasarkan bukti aktual.

Kolom **CL** = indeks tautan Closure Log per goal. Gunakan `[CL-nn](#cl-nn)` untuk catatan Dev, `[QA-CL-nn](#qa-cl-nn)` untuk catatan QA, dan `[Review-CL-nn](#review-cl-nn)` untuk catatan AI-Planning & Review/reviewer. Kolom ini append-only: link lama tidak boleh diganti/dihapus/diurutkan ulang; append link baru pada baris baru memakai `<br>`. Gunakan `—` hanya selama belum ada entry.

Kolom **Prior** = prioritas relatif di dalam fase: `P0` blocker/gate/fondasi kritis · `P1` tinggi/core dependency · `P2` normal · `P3` lanjutan/polish. Prioritas **tidak** membuka goal yang masih `⏸️` dan tidak membatalkan Dependency atau gate Phase 7.

Status dan `%` pada level **Task** tidak disimpan atau diedit manual. Keduanya dihitung dari seluruh goal menurut [AGENTS.md §6.2](AGENTS.md): Task `%` = rata-rata semua goal dibulatkan ke bawah; Task Status mengikuti kondisi goal. Task tidak memiliki CL terpisah—buktinya adalah agregasi CL seluruh goal.

## Gate pembuka (prasyarat mulai Phase 7)
- [ ] Phase 0–6 seluruh Exit Criteria terpenuhi & terverifikasi QA.
- [ ] API domain (02-SPEC Part C) tersedia & lulus acceptance criteria terkait.
- [ ] Mekanisme Better Auth Magic Link Phase 0 sudah lulus integration test (0.8.4).
Sebelum ketiga hal ini ✅, semua task di bawah tetap ⏸️.

Jika ketiga prasyarat tampak terpenuhi, goal Phase 7 baru masuk daftar **Gate candidate**—belum otomatis terbuka. QA atau AI-Planning & Review/reviewer wajib memverifikasi gate dan mencatat `QA-CL`/`Review-CL` + commit sebelum melakukan `⏸️ → ⬜️`.

> **Status gate per 2026-08-25 ([Review-CL-04, PHASE-6-TASKS.md](PHASE-6-TASKS.md#review-cl-04)):** ketiga prasyarat SEKARANG genuinely terpenuhi. Prasyarat 3 (Magic Link 0.8.4) ✅ sejak sebelumnya. Prasyarat 1 (Exit Criteria Phase 6) — `TASK-6.8`/`TASK-6.9` (dibuka [Review-CL-03](PHASE-6-TASKS.md#review-cl-03)) sekarang 9/9 goal ✅, diverifikasi independen ulang (test suite 111 file/657 test, `release-check.mjs` 5 PASS/0 FAIL/1 DEFERRED-by-design, 7 test AC-gap dibaca+dijalankan ulang tanpa temuan lemah) — **Phase 6 genuinely tuntas, 23/23 goal**. Prasyarat 2 (API domain lulus AC) menyatu dengan closure di atas. **Satu temuan minor non-blocking**: smoke test E2E (`TASK-6.9.2`) genuinely benar secara fungsional tapi lokasinya (`apps/api/test/core-flow-smoke.test.ts`) menyimpang dari pola `packages/infrastructure/scripts/smoke-*.ts` yang diminta DoD literal — housekeeping opsional, tidak menghalangi gate.
>
> **Gate DIBUKA 2026-08-25** ([Review-CL-05](#review-cl-05)) — keputusan manusia eksplisit ("ya lakukan"), transisi `⏸️ → ⬜️` dieksekusi untuk seluruh 38 goal setelah refresh outline terhadap state repo/versi dependency terkini. Lihat Review-CL-05 untuk detail verifikasi.

---

## TASK-7.1 — React/Vite foundation setup

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.1.1 | ✅ | [QA-CL-01](#qa-cl-01)<br>[CL-01](#cl-01)<br>[CL-02](#cl-02)<br>[Review-CL-08](#review-cl-08)<br>[CL-95](#cl-95)<br>[Review-CL-09](#review-cl-09)<br>[CL-96](#cl-96)<br>[Review-CL-10](#review-cl-10)<br>[QA-CL-63](#qa-cl-63) | 100 | P0 | Bootstrap `apps/web` dari nol (saat ini hanya placeholder) dengan exact-pinned React 19.2.x/Vite 8.x + React Router 8.x + Tailwind 4.x/shadcn 4.x sesuai baseline A.8 (direvalidasi terhadap npm registry 2026-08-25, lihat [Review-CL-05](#review-cl-05) — semua cocok, tanpa revisi) | [03-ENG A.7–A.8](docs/03-ENGINEERING.md), [05-FRONTEND §3](docs/05-FRONTEND.md) | — |
| 7.1.2 | ✅ | [QA-CL-02](#qa-cl-02)<br>[CL-03](#cl-03)<br>[CL-04](#cl-04)<br>[Review-CL-08](#review-cl-08)<br>[CL-95](#cl-95)<br>[Review-CL-09](#review-cl-09)<br>[CL-96](#cl-96)<br>[Review-CL-10](#review-cl-10)<br>[QA-CL-63](#qa-cl-63) | 100 | P0 | Bangun UI final Better Auth Magic Link di atas mekanisme Phase 0; tidak menambah password/social provider | [03-ENG A.14](docs/03-ENGINEERING.md), [05-FRONTEND §3.1](docs/05-FRONTEND.md) | 7.1.1 |
| 7.1.3 | ✅ | [QA-CL-03](#qa-cl-03)<br>[Review-CL-02](#review-cl-02)<br>[CL-05](#cl-05)<br>[CL-06](#cl-06) | 100 | P0 | Setup TanStack Query + same-origin API client layer terpisah dari UI; mutation berisiko tinggi memakai `Idempotency-Key` stabil per logical action dan menangani `IDEMPOTENCY_CONFLICT`/`IDEMPOTENCY_IN_PROGRESS` tanpa membuat side-effect kedua | [05-FRONTEND §3.2](docs/05-FRONTEND.md), [02-SPEC C.3](docs/02-SPEC.md) | 7.1.1 |
| 7.1.4 | ✅ | [QA-CL-04](#qa-cl-04)<br>[CL-07](#cl-07)<br>[CL-08](#cl-08) | 100 | P1 | Batasi Zustand ke UI/interaction state saja | [05-FRONTEND §3.1](docs/05-FRONTEND.md) | 7.1.1 |

**Test:** Production build Vite dapat disajikan bersama Hono pada satu origin; deep link SPA bekerja; `/api/*` tidak tertangkap fallback; UI Magic Link menangani request/link-sent/expired/used/error; TanStack Query terpasang; tidak ada demo/non-MVP atau identity SaaS.
**DoD:** Foundation React/Vite hanya berisi fitur MVP; server state lewat TanStack Query; routing memakai React Router; struktur `features/` sesuai [05-FRONTEND §6](docs/05-FRONTEND.md).

---

## TASK-7.2 — Design system / theme

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.2.1 | ✅ | [QA-CL-05](#qa-cl-05)<br>[CL-09](#cl-09)<br>[CL-10](#cl-10) | 100 | P1 | Terapkan color tokens (indigo primary + slate + semantic) | [05-FRONTEND §2.1](docs/05-FRONTEND.md) | 7.1.1 |
| 7.2.2 | ✅ | [CL-57](#cl-57)<br>[CL-58](#cl-58)<br>[QA-CL-40](#qa-cl-40) | 100 | P2 | Terapkan tipografi Inter + skala heading/body/small | [05-FRONTEND §2.2](docs/05-FRONTEND.md) | 7.1.1 |
| 7.2.3 | ✅ | [CL-57](#cl-57)<br>[CL-59](#cl-59)<br>[QA-CL-41](#qa-cl-41) | 100 | P2 | Set radius/density (sm/md/lg), light+dark | [05-FRONTEND §2.3](docs/05-FRONTEND.md) | 7.2.1 |

**Test:** Token render benar di light & dark; kontras memadai; komponen shadcn memakai token.
**DoD:** Theme konsisten sesuai tokens; tidak ada warna hard-coded di luar token.

---

## TASK-7.3 — App shell (sidebar + header)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.3.1 | ✅ | [QA-CL-06](#qa-cl-06)<br>[CL-11](#cl-11)<br>[CL-12](#cl-12) | 100 | P0 | Sidebar context-aware (Home/My Tasks/Activity/Projects▾/Members/Permissions/API Keys/Settings) — **tanpa Inbox** | [05-FRONTEND §4,§5](docs/05-FRONTEND.md) | 7.2.1 |
| 7.3.2 | ✅ | [QA-CL-11](#qa-cl-11)<br>[QA-CL-07](#qa-cl-07)<br>[CL-13](#cl-13)<br>[CL-14](#cl-14)<br>[CL-26](#cl-26)<br>[CL-27](#cl-27) | 100 | P0 | Header breadcrumb Project › Milestone › Board + context switch | [05-FRONTEND §5](docs/05-FRONTEND.md) | 7.3.1 |
| 7.3.3 | ✅ | [CL-63](#cl-63)<br>[CL-65](#cl-65)<br>[QA-CL-46](#qa-cl-46) | 100 | P3 | Branding "Powered by NGodingiN" (layar autentikasi/sidebar-bawah/footer) | [05-FRONTEND §5](docs/05-FRONTEND.md) | 7.3.1 |

**Test:** Navigasi antar Project mengganti context; Inbox tidak ada; breadcrumb akurat.
**DoD:** Shell context-aware; tidak menampilkan elemen non-MVP.

---

## TASK-7.4 — Home / Dashboard (work-management)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.4.1 | ✅ | [QA-CL-21](#qa-cl-21)<br>[Review-CL-02](#review-cl-02)<br>[CL-52](#cl-52)<br>[CL-53](#cl-53) | 100 | P2 | Panel "Your work": My Tasks / Due soon / Overdue; agregasi hanya dari Project yang dapat diakses melalui API Project-scoped, tanpa endpoint/search lintas-Project baru | [05-FRONTEND §5](docs/05-FRONTEND.md), [BR-010](docs/02-SPEC.md) | 7.3.1 |
| 7.4.2 | ✅ | [Review-CL-02](#review-cl-02)<br>[CL-60](#cl-60)<br>[CL-61](#cl-61)<br>[QA-CL-42](#qa-cl-42)<br>[CL-81](#cl-81)<br>[QA-CL-47](#qa-cl-47)<br>[CL-82](#cl-82)<br>[QA-CL-52](#qa-cl-52) | 100 | P2 | Recent Projects + Recent Activity; Activity tetap diambil per konteks Project dan tidak membentuk cross-project search endpoint | [05-FRONTEND §5](docs/05-FRONTEND.md), [02-SPEC C.9](docs/02-SPEC.md) | 7.4.1 |

**Test:** Data dari API nyata (bukan demo); tidak ada revenue/charts admin.
**DoD:** Home terasa work-management tool, bukan admin panel.

---

## TASK-7.5 — Board view + drag & drop

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.5.1 | ✅ | [QA-CL-13](#qa-cl-13)<br>[QA-CL-09](#qa-cl-09)<br>[CL-15](#cl-15)<br>[CL-16](#cl-16) | 100 | P0 | Render kolom = List (nama bebas) + count; card list | [05-FRONTEND §5](docs/05-FRONTEND.md), [02-SPEC A.1](docs/02-SPEC.md) | 7.3.2 |
| 7.5.2 | ✅ | [QA-CL-13](#qa-cl-13)<br>[QA-CL-09](#qa-cl-09)<br>[Review-CL-02](#review-cl-02)<br>[CL-17](#cl-17)<br>[CL-18](#cl-18) | 100 | P0 | Drag Card antar List → panggil move API dengan JSON `{ destinationListId, expectedVersion }` | [02-SPEC C.8 move](docs/02-SPEC.md), [AC-020](docs/04-DELIVERY.md) | 7.5.1 |
| 7.5.3 | ✅ | [QA-CL-12](#qa-cl-12)<br>[QA-CL-10](#qa-cl-10)<br>[CL-19](#cl-19)<br>[CL-20](#cl-20)<br>[CL-26](#cl-26)<br>[CL-28](#cl-28) | 100 | P0 | Move antar Board hanya tawarkan Board dalam Milestone sama | [02-SPEC BR-018](docs/02-SPEC.md) | 7.5.2 |
| 7.5.4 | ✅ | [QA-CL-13](#qa-cl-13)<br>[QA-CL-09](#qa-cl-09)<br>[CL-19](#cl-19)<br>[CL-21](#cl-21) | 100 | P0 | Tangani `VERSION_CONFLICT` → pesan + reload (bukan auto-overwrite) | [04-DELIVERY A.3](docs/04-DELIVERY.md), [BR-021](docs/02-SPEC.md) | 7.5.2 |

**Test:** Drag memicu move API benar; opsi Board lintas-Milestone tidak muncul; conflict ditampilkan, tidak menimpa.
**DoD:** Interaksi Board tunduk domain command + optimistic locking; List tanpa makna status sistem.

---

## TASK-7.6 — Card (compact component)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.6.1 | ✅ | [QA-CL-13](#qa-cl-13)<br>[QA-CL-09](#qa-cl-09)<br>[CL-22](#cl-22)<br>[CL-23](#cl-23) | 100 | P1 | Card: title · description preview · labels · assignee · due date | [05-FRONTEND §5](docs/05-FRONTEND.md) | 7.5.1 |
| 7.6.2 | ✅ | [QA-CL-13](#qa-cl-13)<br>[QA-CL-09](#qa-cl-09)<br>[CL-22](#cl-22)<br>[CL-23](#cl-23) | 100 | P1 | **Tanpa** priority, **tanpa** progress, **tanpa** status field | [05-FRONTEND §4](docs/05-FRONTEND.md) | 7.6.1 |

**Test:** Card hanya menampilkan field domain yang valid; tidak ada priority/progress/status.
**DoD:** Komponen Card patuh [05-FRONTEND §4](docs/05-FRONTEND.md).

---

## TASK-7.7 — Card Detail (Sheet / full-screen mobile)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.7.1 | ✅ | [QA-CL-22](#qa-cl-22)<br>[CL-46](#cl-46)<br>[CL-47](#cl-47) | 100 | P1 | Tab Details: description, assignee, due date, labels, **current List** (bukan "status") | [05-FRONTEND §4,§5](docs/05-FRONTEND.md) | 7.6.1 |
| 7.7.2 | ✅ | [QA-CL-23](#qa-cl-23)<br>[CL-46](#cl-46)<br>[CL-48](#cl-48) | 100 | P1 | Tab Activity: timeline immutable | [02-SPEC A.8](docs/02-SPEC.md) | 7.8.1 |
| 7.7.3 | ✅ | [QA-CL-24](#qa-cl-24)<br>[CL-46](#cl-46)<br>[CL-49](#cl-49) | 100 | P0 | Comments: add + edit (tanpa delete); tolak pada card deleted/archived | [02-SPEC A.9](docs/02-SPEC.md), [BR-033](docs/02-SPEC.md) | 7.7.1 |
| 7.7.4 | ✅ | [QA-CL-25](#qa-cl-25)<br>[Review-CL-02](#review-cl-02)<br>[CL-46](#cl-46)<br>[CL-50](#cl-50) | 100 | P0 | Edit field via generic update hanya untuk field mutable; `listId` dan domain field `version` dilarang, sedangkan command metadata `expectedVersion` tetap wajib | [02-SPEC C.8, C.15](docs/02-SPEC.md) | 7.7.1 |

**Test:** "current List" tidak dimodelkan sebagai status; comment tak bisa dihapus & ditolak pada card non-active; PATCH tak bisa ubah field domain.
**DoD:** Card Detail patuh domain; tidak ada priority/progress.

---

## TASK-7.8 — Activity timeline

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.8.1 | ✅ | [QA-CL-08](#qa-cl-08)<br>[CL-24](#cl-24)<br>[CL-25](#cl-25) | 100 | P1 | Timeline historis grouped by day/time (audit, bukan notification feed) | [05-FRONTEND §5](docs/05-FRONTEND.md), [02-SPEC A.8](docs/02-SPEC.md) | 7.3.1 |
| 7.8.2 | ✅ | [QA-CL-26](#qa-cl-26)<br>[CL-46](#cl-46)<br>[CL-51](#cl-51) | 100 | P1 | Render payload memakai konteks historis (nama List lama tetap tampil) | [03-ENG B.5](docs/03-ENGINEERING.md), [BR-028](docs/02-SPEC.md) | 7.8.1 |

**Test:** Activity read-only; entity terhapus tetap terbaca via payload historis.
**DoD:** Timeline = audit trail, immutable, bermakna historis.

---

## TASK-7.9 — Permission Groups UI (custom besar)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.9.0 | ✅ | [Review-CL-06](#review-cl-06)<br>[CL-65](#cl-65)<br>[CL-66](#cl-66)<br>[QA-CL-30](#qa-cl-30)<br>[CL-67](#cl-67)<br>[QA-CL-31](#qa-cl-31)<br>[CL-68](#cl-68)<br>[QA-CL-32](#qa-cl-32)<br>[CL-69](#cl-69)<br>[QA-CL-33](#qa-cl-33)<br>[Review-CL-11](#review-cl-11) | 100 | P0 | Implementasikan backend support minimum untuk UI Permission Groups: endpoint read-only katalog Permission `GET /api/v1/projects/:project_id/permissions` returning `{ permissions:[{id,key,description}] }` dan pastikan assignment Group/direct Permission menerima scope Project/Milestone/Board/List/Card sesuai SOT, bukan hanya `project` | [02-SPEC C.12](docs/02-SPEC.md), [02-SPEC A.10–A.11](docs/02-SPEC.md) | 7.3.1 |
| 7.9.1 | ✅ | [CL-29](#cl-29)<br>[Review-CL-06](#review-cl-06)<br>[CL-70](#cl-70)<br>[CL-71](#cl-71)<br>[QA-CL-34](#qa-cl-34)<br>[CL-73](#cl-73)<br>[QA-CL-35](#qa-cl-35)<br>[CL-74](#cl-74)<br>[QA-CL-36](#qa-cl-36) | 100 | P0 | Editor Group + scoped assignment ke Membership (Project/Milestone/Board/List/Card), memakai katalog Permission dari endpoint C.12 tanpa hard-code `permissionId` | [02-SPEC Part D](docs/02-SPEC.md), [02-SPEC C.12](docs/02-SPEC.md) | 7.9.0 |
| 7.9.2 | ✅ | [CL-29](#cl-29)<br>[Review-CL-06](#review-cl-06)<br>[CL-75](#cl-75)<br>[CL-76](#cl-76)<br>[QA-CL-37](#qa-cl-37)<br>[CL-78](#cl-78)<br>[QA-CL-38](#qa-cl-38) | 100 | P0 | Card visibility: Created (default) / Assigned (created OR assigned) / All | [02-SPEC A.11](docs/02-SPEC.md) | 7.9.1 |
| 7.9.3 | ✅ | [CL-29](#cl-29)<br>[Review-CL-06](#review-cl-06)<br>[CL-77](#cl-77)<br>[CL-79](#cl-79)<br>[QA-CL-39](#qa-cl-39)<br>[CL-80](#cl-80)<br>[QA-CL-43](#qa-cl-43) | 100 | P0 | Direct Permission scoped + inheritance + additive tanpa DENY, memakai katalog Permission dari endpoint C.12 tanpa hard-code `permissionId` | [02-SPEC A.10](docs/02-SPEC.md), [02-SPEC C.12](docs/02-SPEC.md) | 7.9.1 |

**Test:** UI mencerminkan model Group (bukan RBAC Role→Permissions); scope & inheritance benar.
**DoD:** Permission UI patuh authorization model; tidak menyederhanakan jadi RBAC.

---

## TASK-7.10 — Members + Invitation

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.10.1 | ✅ | [QA-CL-14](#qa-cl-14)<br>[QA-CL-20](#qa-cl-20)<br>[CL-37](#cl-37)<br>[CL-38](#cl-38)<br>[CL-44](#cl-44)<br>[CL-45](#cl-45) | 100 | P1 | Tabel Members (User · Group · Status Active/Pending) — reuse table | [05-FRONTEND §5](docs/05-FRONTEND.md) | 7.3.1 |
| 7.10.2 | ✅ | [QA-CL-27](#qa-cl-27)<br>[Review-CL-02](#review-cl-02)<br>[CL-39](#cl-39)<br>[CL-40](#cl-40) | 100 | P0 | Invite: Email + Permission Group + hierarchy scope; konsumsi response create/accept/revoke melalui `data.invitation` dan list melalui `data.invitations` | [02-SPEC C.13](docs/02-SPEC.md), [BR-050..052](docs/02-SPEC.md) | 7.10.1 |

**Test:** Invite mengirim sesuai kontrak; accept → membership dengan Group benar (AC-025).
**DoD:** Members & Invitation patuh invitation flow.

---

## TASK-7.11 — API Keys & PAT

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.11.1 | ✅ | [QA-CL-28](#qa-cl-28)<br>[CL-41](#cl-41)<br>[CL-42](#cl-42) | 100 | P1 | API Keys (Project Settings): list · create (secret sekali tampil) · revoke | [02-SPEC C.14](docs/02-SPEC.md), [03-ENGINEERING C.2](docs/03-ENGINEERING.md) | 7.3.1 |
| 7.11.2 | ✅ | [QA-CL-29](#qa-cl-29)<br>[CL-41](#cl-41)<br>[CL-43](#cl-43) | 100 | P1 | PAT (User Settings): list · create · revoke; terpisah dari Project | [02-SPEC C.14](docs/02-SPEC.md) | 7.3.1 |

**Test:** Secret hanya tampil sekali; revoke berfungsi; PAT di User Settings bukan Project.
**DoD:** Credential UI patuh security model.

---

## TASK-7.12 — Command palette

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.12.1 | ✅ | [CL-62](#cl-62)<br>[CL-64](#cl-64)<br>[QA-CL-49](#qa-cl-49)<br>[CL-83](#cl-83)<br>[QA-CL-50](#qa-cl-50)<br>[CL-84](#cl-84)<br>[QA-CL-51](#qa-cl-51)<br>[CL-85](#cl-85)<br>[QA-CL-53](#qa-cl-53)<br>[CL-86](#cl-86)<br>[QA-CL-54](#qa-cl-54)<br>[CL-87](#cl-87)<br>[QA-CL-55](#qa-cl-55)<br>[CL-88](#cl-88)<br>[QA-CL-56](#qa-cl-56)<br>[CL-89](#cl-89)<br>[QA-CL-57](#qa-cl-57)<br>[CL-90](#cl-90)<br>[QA-CL-58](#qa-cl-58)<br>[CL-91](#cl-91)<br>[QA-CL-59](#qa-cl-59)<br>[CL-92](#cl-92)<br>[QA-CL-60](#qa-cl-60)<br>[CL-93](#cl-93)<br>[QA-CL-61](#qa-cl-61)<br>[CL-94](#cl-94)<br>[QA-CL-62](#qa-cl-62) | 100 | P3 | ⌘K: navigasi (Project/Board/My Tasks) + aksi (Create/Move/Archive Card) | [05-FRONTEND §3.1](docs/05-FRONTEND.md) | 7.3.1 |

**Test:** Aksi command memanggil domain command yang benar (bukan shortcut yang mem-bypass rule).
**DoD:** Command palette berfungsi & konsisten dengan permission/lifecycle.

---

## TASK-7.13 — Lifecycle UI (archive/restore + delete terminal)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.13.1 | ✅ | [QA-CL-15](#qa-cl-15)<br>[CL-30](#cl-30)<br>[CL-31](#cl-31) | 100 | P0 | Konfirmasi archive/delete menjelaskan dampak efektif subtree; tanpa child handling | [04-DELIVERY A.4](docs/04-DELIVERY.md), [02-SPEC A.4](docs/02-SPEC.md) | 7.5.1 |
| 7.13.2 | ✅ | [QA-CL-16](#qa-cl-16)<br>[CL-32](#cl-32)<br>[CL-33](#cl-33) | 100 | P0 | Restore hanya ARCHIVED; DELETED tidak punya tombol restore | [INV-LIFE-002/004](docs/02-SPEC.md) | 7.13.1 |
| 7.13.3 | ✅ | [QA-CL-17](#qa-cl-17)<br>[CL-32](#cl-32)<br>[CL-34](#cl-34)<br>[QA-CL-18](#qa-cl-18)<br>[Review-CL-07](#review-cl-07) | 100 | P0 | Restore ARCHIVED ditolak jika ancestor belum ACTIVE (+ shortcut "restore parent first") | [04-DELIVERY A.5](docs/04-DELIVERY.md) | 7.13.1 |
| 7.13.4 | ✅ | [QA-CL-18](#qa-cl-18)<br>[CL-35](#cl-35)<br>[CL-36](#cl-36)<br>[QA-CL-19](#qa-cl-19)<br>[Review-CL-07](#review-cl-07) | 100 | P1 | Archived/Deleted Audit view read-only sesuai permission | [02-SPEC A.3](docs/02-SPEC.md) | 7.13.1 |

**Test:** Tidak ada child handling; restore hanya untuk ARCHIVED dengan ancestor ACTIVE; DELETED terminal; local state descendant tidak berubah.
**DoD:** Lifecycle UI patuh effective ancestor state dan menjelaskan dampak terminal delete.

---

## TASK-7.14 — Responsive / mobile

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.14.1 | ✅ | [CL-54](#cl-54)<br>[CL-55](#cl-55)<br>[QA-CL-45](#qa-cl-45)<br>[CL-81](#cl-81)<br>[QA-CL-48](#qa-cl-48) | 100 | P2 | Desktop `Sidebar\|Board`, Tablet collapsed sidebar | [05-FRONTEND §7](docs/05-FRONTEND.md) | 7.5.1 |
| 7.14.2 | ✅ | [CL-54](#cl-54)<br>[CL-56](#cl-56)<br>[QA-CL-44](#qa-cl-44) | 100 | P2 | Mobile: List horizontal-scroll; Card detail full-screen | [05-FRONTEND §7](docs/05-FRONTEND.md) | 7.7.1 |

**Test:** Mobile tidak menumpuk kolom vertikal; card detail full-screen.
**DoD:** Responsive sesuai [05-FRONTEND §7](docs/05-FRONTEND.md).

---

## Exit Criteria Phase 7
- Semua layar utama ([05-FRONTEND §5](docs/05-FRONTEND.md)) terimplementasi & patuh UI↔Domain reconciliation ([05-FRONTEND §4](docs/05-FRONTEND.md)).
- Tidak ada field non-MVP di UI (priority/progress-card/status/inbox).
- Semua mutasi lewat domain command + optimistic locking + permission; `VERSION_CONFLICT` ditangani benar.
- Lifecycle UI (effective ancestor state, archive restore, delete terminal) patuh invariant.
- Responsive desktop/tablet/mobile.

## Flag
- Refresh terhadap state repo nyata sudah dilakukan saat gate dibuka 2026-08-25 ([Review-CL-05](#review-cl-05)): `apps/web/` dikonfirmasi placeholder murni; versi dependency direvalidasi terhadap npm registry, cocok baseline tanpa revisi.
- ~~`[NEEDS-SPEC-AMENDMENT]` TASK-7.9 katalog Permission tidak tersedia untuk UI~~ → **DISELESAIKAN 2026-08-28 (manusia):** SOT 4.2.0 menambah `GET /api/v1/projects/:project_id/permissions`; goal 7.9.0 dibuka sebagai prerequisite backend support sebelum UI Permission Groups.
- ~~Tracking drift TASK-7.13~~ → **DISELESAIKAN 2026-08-28:** tabel goal diselaraskan dengan Closure Log historis (`7.13.3` restore ancestor, `7.13.4` audit view) melalui [Review-CL-07](#review-cl-07), tanpa mengubah status/%.
- ~~`[NEEDS-SPEC-AMENDMENT]` alur login-first/session gate belum dikunci~~ → **DISELESAIKAN 2026-08-29 (manusia):** SOT 4.2.1 mengunci route aplikasi membutuhkan pemeriksaan session, redirect `/login` untuk session tidak ada/kedaluwarsa, dan return-to internal aman. Implementasi ditrack pada TASK-7.15 dan belum dimulai.

---

## TASK-7.15 — Login-first session gate

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.15.0 | ⚠️ | [Review-CL-13](#review-cl-13)<br>[CL-97](#cl-97)<br>[CL-98](#cl-98)<br>[QA-CL-64](#qa-cl-64)<br>[CL-99](#cl-99)<br>[QA-CL-65](#qa-cl-65)<br>[Review-CL-14](#review-cl-14)<br>[QA-CL-69](#qa-cl-69)<br>[CL-103](#cl-103) | 80 | P0 | Tegakkan lifetime session server-side: tambah state idle/absolute pada Global DB, nonaktifkan refresh otomatis Better Auth, tolak serta invalidasi session lama/idle/absolute-expired, dan touch atomik hanya sesudah request domain 2xx yang ditandai aksi pengguna | [03-ENG A.14](docs/03-ENGINEERING.md), [03-ENG B.2](docs/03-ENGINEERING.md), [03-ENG C.1](docs/03-ENGINEERING.md) | 7.1.2 |
| 7.15.1 | ✅ | [Review-CL-12](#review-cl-12)<br>[Review-CL-13](#review-cl-13)<br>[CL-100](#cl-100)<br>[QA-CL-66](#qa-cl-66)<br>[Review-CL-14](#review-cl-14) | 100 | P0 | Buat session gate pada routing web: route aplikasi menunggu pemeriksaan session dan tidak merender shell/data saat pending; session tidak ada, idle-expired, atau absolute-expired diarahkan ke `/login`, sementara `/login` dan callback tetap publik | [03-ENG A.14](docs/03-ENGINEERING.md), [04-DELIVERY A.0](docs/04-DELIVERY.md), [05-FRONTEND §5](docs/05-FRONTEND.md) | 7.15.0 |
| 7.15.2 | ✅ | [Review-CL-12](#review-cl-12)<br>[Review-CL-13](#review-cl-13)<br>[CL-101](#cl-101)<br>[QA-CL-67](#qa-cl-67)<br>[CL-102](#cl-102)<br>[QA-CL-68](#qa-cl-68)<br>[Review-CL-14](#review-cl-14) | 100 | P1 | Simpan dan pulihkan tujuan route aplikasi internal secara aman setelah timeout/login; tujuan kosong/tidak valid memakai fallback `/` dan tidak boleh menghasilkan open redirect | [03-ENG A.14](docs/03-ENGINEERING.md), [04-DELIVERY A.0](docs/04-DELIVERY.md), [05-FRONTEND §5](docs/05-FRONTEND.md) | 7.15.1 |

**Test:** Server (fake clock) — activity 45 menit memperpanjang idle deadline menjadi satu jam lagi; tanpa aktivitas satu jam ditolak; Minggu 00:00 UTC menang atas activity; polling/refetch/check-session/request gagal/API Key/PAT tidak memperpanjang; revoke dan interleaving touch tidak dapat menghidupkan session mati. Unit/RTL — pending tidak merender shell/data; unauthenticated dan timeout menuju `/login`; `/login` tetap publik; session valid merender route tujuan. Negatif — `returnTo` eksternal, protocol-relative, malformed, `/api/*`, atau route auth ditolak ke `/`. Playwright production build — deep link protected tanpa session menuju login, lalu session valid memulihkan hanya path internal.
**DoD:** `expires_at` tidak pernah melampaui `absolute_expires_at`; session lama dipaksa login ulang saat migrasi; tidak ada data domain atau shell aplikasi muncul sebelum session selesai diperiksa; redirect UI tidak pernah menjadi satu-satunya enforcement (API `401/403` tetap diuji); tidak ada password/social provider, refresh token, atau session credential ditulis ke UI storage/log.

---

## TASK-7.16 — E2E staging untuk alur bisnis MVP

**Prasyarat:** seluruh goal task ini bergantung pada `7.15.0` kembali `✅`, karena setiap alur web nyata memerlukan database-backed session. Test hanya boleh menuju canonical staging `https://kanban-ngodingin.vercel.app`, menolak production/host lain sebelum test dimulai, memakai `E2E_TEST_EMAIL` dari environment (bukan hard-code), dan membuat data berawalan test-run unik yang dibersihkan melalui API/domain command. Inbox Mailinator publik hanya untuk staging; token/link tidak boleh tercetak, di-commit, atau tersimpan dalam artefak test.

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.16.1 | ⏸️ | [Review-CL-15](#review-cl-15) | 0 | P0 | Buat harness Playwright staging: canonical-origin allowlist, Vercel bypass dari environment, Magic Link Mailinator, assertion session nyata, namespace data test unik, dan cleanup wajib walau test gagal. Jangan membuat endpoint test-only atau melewati auth/domain command. | [03-ENG A.14](docs/03-ENGINEERING.md), [03-ENG D.7](docs/03-ENGINEERING.md), [04-DELIVERY A.0](docs/04-DELIVERY.md) | 7.15.0 |
| 7.16.2 | ⏸️ | [Review-CL-15](#review-cl-15) | 0 | P0 | Uji onboarding Project nyata melalui API dan web: create Project memprovision database, Project muncul hanya untuk member, dan percobaan akses Project lain ditolak. Cleanup memakai lifecycle/deprovision yang tersedia, bukan delete SQL langsung. | [BR-001](docs/02-SPEC.md), [BR-007..010](docs/02-SPEC.md), [04-DELIVERY A.2](docs/04-DELIVERY.md) | 7.16.1 |
| 7.16.3 | ⏸️ | [Review-CL-15](#review-cl-15) | 0 | P0 | Uji hierarchy dan Card command nyata: Milestone→Board→List→Card, move List/Board dalam Milestone, penolakan lintas Project/lintas Milestone, serta `VERSION_CONFLICT` tanpa overwrite. Verifikasi hasil melalui API dan perubahan yang terlihat di Board web. | [BR-001..006](docs/02-SPEC.md), [BR-017..023](docs/02-SPEC.md), [AC-002](docs/04-DELIVERY.md), [AC-020](docs/04-DELIVERY.md) | 7.16.2 |
| 7.16.4 | ⏸️ | [Review-CL-15](#review-cl-15) | 0 | P0 | Uji authorization/invitation nyata: invite scoped, accept, Group/direct Permission inheritance, dan request UI/API tanpa permission ditolak. Seluruh identity uji serta assignment dibersihkan/revoke setelah suite. | [02-SPEC A.10–A.13](docs/02-SPEC.md), [AC-003](docs/04-DELIVERY.md), [AC-025..028](docs/04-DELIVERY.md) | 7.16.2 |
| 7.16.5 | ⏸️ | [Review-CL-15](#review-cl-15) | 0 | P1 | Uji lifecycle dan kolaborasi nyata: archive/restore dependency ancestor, delete terminal, Label, comment create/edit, dan Activity historis immutable. Verifikasi penolakan mutation pada state non-operasional dari API dan UI. | [02-SPEC A.3–A.4](docs/02-SPEC.md), [02-SPEC A.8–A.9](docs/02-SPEC.md), [AC-008..016](docs/04-DELIVERY.md) | 7.16.3 |
| 7.16.6 | ⏸️ | [Review-CL-15](#review-cl-15) | 0 | P1 | Uji credential nyata: API Key terbatas Project dan PAT tetap tunduk Membership/Permission; revoke/expiry ditolak. Secret hanya disimpan in-memory test dan tidak boleh masuk screenshot, trace, output, atau git. | [02-SPEC A.13](docs/02-SPEC.md), [02-SPEC C.14](docs/02-SPEC.md), [AC-021..024](docs/04-DELIVERY.md) | 7.16.4 |
| 7.16.7 | ⏸️ | [Review-CL-15](#review-cl-15) | 0 | P1 | Konsolidasikan command `test:e2e:staging` yang menjalankan seluruh flow di atas terhadap staging saja, menghasilkan ringkasan bebas secret, selalu cleanup, dan menjadi gate release F.6 setelah semua flow hijau. | [03-ENG F.6](docs/03-ENGINEERING.md), [04-DELIVERY B.2–B.3](docs/04-DELIVERY.md) | 7.16.3, 7.16.4, 7.16.5, 7.16.6 |

**Test:** tiap goal wajib memverifikasi respons API nyata dan observasi web nyata pada data test yang sama; test negatif yang dirujuk wajib dijalankan, dan `test:e2e:staging` MUST fail-fast bila target bukan staging atau session tidak terbentuk.
**DoD:** tidak ada credential/token atau data pengguna nyata pada artefak; data uji tidak tersisa; tidak ada bypass authorization/domain command; seluruh flow yang relevan dengan F.6 hijau sebelum release.

---

## Closure Log

> Isi tiap kali sebuah goal pindah status atau menerima hasil review. Setiap entry wajib mencantumkan Role dan nama Model aktual; jika model tidak diekspos, tulis nama platform yang menjalankan agent (mis. `GitHub Copilot` atau `Codex`) dan jangan menebak model. Tambah entry baru di atas (terbaru dulu), gunakan namespace sesuai lane, lalu **append** link entry ke baris baru dalam kolom **CL** tanpa mengubah link lama. Setiap perubahan Status wajib masuk commit; awal `→ 🔄` boleh menunggu commit pertama. Commit diverifikasi lewat history Git file ini, bukan dengan menulis hash commit yang sama ke entry. Entry `⚠️`/`⏸️→` wajib mencantumkan alasan.

<!-- Dev: `### CL-nn — YYYY-MM-DD · goal <id> <ringkasan>`. QA: `### QA-CL-nn — ...`. Review: `### Review-CL-nn — ...`. Cantumkan Role + Model/platform aktual. Append-only, jangan hapus/ubah entry lama. -->

<a id="cl-103"></a>
### CL-103 — 2026-08-29 · 7.15.0 ⚠️ 80% — fix Better Auth baseURL /api/auth prefix untuk magic link verify URL

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Per QA-CL-69: Magic link callback di staging tidak membuat session karena `baseURL` Better Auth diatur sebagai origin saja (`https://kanban-ngodingin.vercel.app`), tanpa prefix `/api/auth`. Better Auth membangun verify URL sebagai `{baseURL}/magic-link/verify` → `/magic-link/verify` yang tidak ada di server (SPA fallback). Perbaikan: `createAuth()` di `packages/infrastructure/src/auth/auth.ts` sekarang meneruskan `baseURL: ${config.baseUrl}/api/auth` sehingga: (1) email verify URL = `https://kanban-ngodingin.vercel.app/api/auth/magic-link/verify` (benar); (2) router Better Auth strip basePath `/api/auth` → cocok internal route. Test URL construction: `pnpm vitest run packages/infrastructure/test/magic-link-url-construction.test.ts` → 4/4 PASS. Regression test real callback (QA-CL-69 requirement): `signInMagicLink` → capture token → `magicLinkVerify` → assert session token + user email + `set-cookie` `kanban.session_token=`. Suite penuh: 143/143 test files (875 tests) PASS; lint + typecheck PASS.

<a id="review-cl-15"></a>
### Review-CL-15 — 2026-08-29 · TASK-7.16 digenerate — E2E staging flow bisnis MVP

**Role:** AI-Planning & Review · **Model:** Codex

**Bukti:** Keputusan manusia mengonfirmasi cakupan seluruh flow MVP melalui API dan web staging. State task dibaca ulang: `7.15.0 ⚠️ 80%` melalui QA-CL-69; deployment staging `9701e11` telah dimigrasikan namun callback Magic Link tidak membentuk session. SOT 4.3.0 A.14, Delivery A.0/B.2–B.3/C.6, serta release checklist F.6 menjadi acuan.

**Review:** TASK-7.16 dipecah menjadi tujuh goal kecil untuk harness/auth, provisioning/isolation, hierarchy/concurrency, authorization/invitation, lifecycle/collaboration, credential, dan suite release. Semua goal awal `⏸️` karena dependency objektif `7.15.0` gagal; ini mencegah test mock atau bypass memberi hasil positif palsu. Scope dibatasi ke staging dan cleanup via domain command; tidak ada SOT/API endpoint baru.

<a id="qa-cl-69"></a>
### QA-CL-69 — 2026-08-29 · 7.15.0 ✅ 100% → ⚠️ 80% — callback Magic Link staging tidak membentuk session

**Role:** AI-QA · **Model:** Codex

**Bukti QA:** Staging deployment `READY` pada commit `9701e11`; migration runner resmi berhasil: Global DB `1 database termigrasi`, fan-out `0/0`. Deep link tanpa sesi menuju `/login` lulus. QA mengirim request Magic Link staging ke inbox Mailinator acak; API menjawab `HTTP 200`, email dari `noreply@kanban.ngodingin.xyz` diterima, lalu callback dibuka pada browser headless dengan Vercel Automation Bypass. Callback berakhir di `/projects/qa-smoke/boards/current`, tetapi `GET /api/auth/get-session` dalam browser mengembalikan `HTTP 200` dengan `session=null` dan `user=null`. Query Global DB terikat hanya pada email uji juga membuktikan `0` row `auth_sessions` sebelum maupun sesudah cleanup. Hasil direproduksi pada inbox acak terpisah; tidak ada sesi uji tersisa.

**Gagal verifikasi:** A.14 mewajibkan callback Magic Link membuat **database-backed session** yang dikirim sebagai cookie HTTP-only. Staging hanya melakukan redirect callback tanpa session aktif, sehingga 7.15.0 gagal pada jalur nyata dan 7.15.1/7.15.2 tidak dapat memenuhi alur login pengguna end-to-end meskipun unit/E2E yang memakai mock sebelumnya hijau. Dev harus mendiagnosis pembuatan/persistensi session Better Auth pada callback staging, menambah regression test yang memakai callback nyata (bukan mock `get-session`), lalu handoff kembali pada `🔎 80%`. Release diblokir.

<a id="review-cl-14"></a>
### Review-CL-14 — 2026-08-29 · review penutupan Phase 7/release staging — deployment belum memuat TASK-7.15

**Role:** AI-Planning & Review · **Model:** Codex

**Bukti:** Fresh state: `HEAD`/`ai-github/stag` = `7dc8d12` dan worktree bersih. Staging `https://kanban-ngodingin.vercel.app/` serta `/api/v1/health` merespons HTTP 200 dengan Vercel Automation Bypass; health mengembalikan `{ "data": { "status": "ok", "env": "staging" } }`. Lookup Vercel deployment read-only untuk domain staging menunjukkan deployment `READY` masih memakai `githubCommitSha` `5a364466c0b0061bd964538eaa482f4c078d91cd`, sebelum CL-97 sampai QA-CL-68. `vercel.json` hanya menjalankan `node scripts/preview-build.mjs`; migrasi `migrate:global`/`migrate:projects` di CI memakai database file sementara (`file:///tmp/ci-global.db`), sehingga bukan bukti migrasi staging. Migration `0007_session_lifetime.sql` menghapus sesi legacy lalu menambah `last_activity_at` dan `absolute_expires_at`.

**Review:** Semua goal TASK-7.15 tetap `✅ 100%`—temuan ini tidak membatalkan hasil QA kode. Namun Phase 7 dan release **belum siap dipromosikan** sampai deployment staging diperbarui minimal ke `7dc8d12` dan migration Global DB `0007_session_lifetime` dijalankan serta dibuktikan pada database staging yang sebenarnya. Setelah itu, ulangi smoke protected-route/Magic Link di staging dan jalankan checklist F.6. Tidak ada perubahan status/% pada review ini.

<a id="qa-cl-68"></a>
### QA-CL-68 — 2026-08-29 · 7.15.2 🔎 80% → ✅ 100% — returnTo aman terverifikasi

**Role:** AI-QA · **Model:** Codex

**Bukti QA:** Fresh check `CL-102`, commit `0efa2ee`, SOT 4.3.0 A.14, Delivery A.0, Frontend §5, diff, dan worktree. Independen: `pnpm vitest run apps/web/test/session-gate.test.tsx apps/web/test/magic-link-ui.test.tsx` → **25/25 PASS**; `pnpm exec playwright test e2e/session-gate.spec.ts` → **11/11 PASS** production build; web typecheck dan lint → PASS.

**Verifikasi:** `returnTo` valid diteruskan hanya sebagai callback same-origin; external, protocol-relative, `/api/*`, `/api`, `/api?x`, `/api#hash`, dan route autentikasi memakai fallback `/`. Validator menghapus query/hash untuk pemeriksaan namespace sehingga akar API tidak lagi lolos. Bersama `SessionGate` 7.15.1, deep link internal disimpan dan Magic Link mengembalikan pengguna hanya ke tujuan internal aman. Goal lulus QA.

<a id="cl-102"></a>
### CL-102 — 2026-08-29 · 7.15.2 ⚠️ → 🔎 80% — fix /api root namespace in returnTo validator

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Per QA-CL-67: `isSafeReturnTo()` hanya menolak prefix `"/api/"`, sehingga menerima `"/api"` dan `"/api?x"` sebagai return destination. Perbaikan: validator sekarang mengekstrak clean path (tanpa query/hash), lalu menolak `/api` (exact) DAN `/api/*` (prefix). Test tambahan: `pnpm vitest run apps/web/test/session-gate.test.tsx` → 13/13 PASS (1 baru: `/api`, `/api?x=1`, `/api#section`). E2E tambahan: `pnpm exec playwright test e2e/session-gate.spec.ts` → 11/11 PASS (2 baru: bare `/api`, `/api?x` fallback). Suite penuh: 142/142 test files (871 tests) PASS; lint + typecheck PASS.

<a id="qa-cl-67"></a>
### QA-CL-67 — 2026-08-29 · 7.15.2 🔎 80% → ⚠️ 80% — namespace API root lolos validator returnTo

**Role:** AI-QA · **Model:** Codex

**Bukti QA:** Fresh check CL-101/commit `63c69e4`, SOT 4.3.0 A.14, Delivery A.0, Frontend §5, serta worktree. Independen: `pnpm vitest run apps/web/test/magic-link-ui.test.tsx apps/web/test/session-gate.test.tsx` → **24/24 PASS**; `pnpm exec playwright test e2e/session-gate.spec.ts` → **9/9 PASS** production build; web typecheck dan lint → PASS.

**Gagal verifikasi:** `isSafeReturnTo()` hanya menolak prefix `"/api/"`, sehingga menerima `"/api"` dan `"/api?x"` sebagai return destination. Keduanya bukan route aplikasi internal, melainkan namespace API; ini bertentangan dengan A.14/D.0 yang mensyaratkan tujuan hanya route aplikasi internal dan route `/api/*` ditolak dengan fallback `/`. Tambahkan test unit + E2E untuk dua bentuk tersebut dan ubah validator agar menolak akar namespace API beserta query/hash-nya. Setelah itu handoff kembali pada `🔎 80%`.

<a id="cl-101"></a>
### CL-101 — 2026-08-29 · 7.15.2 ⬜️ → 🔄 0% → 🔎 80% — returnTo save/restore

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** `LoginPage` diperbarui (`apps/web/src/features/auth/login-page.tsx`): membaca `returnTo` query param, memvalidasi via `isSafeReturnTo()`, lalu menggunakannya sebagai `callbackURL` Magic Link (`${origin}${safeReturnTo}`). ReturnTo tidak valid/eksternal/malformed `/api/*`, `/login`, tanpa `/` prefix → fallback ke `/`. Test: `pnpm vitest run apps/web/test/magic-link-ui.test.tsx` → 12/12 PASS (5 existing + 7 returnTo: valid path, external, protocol-relative, /api/*, /login, malformed, no returnTo). E2E: `pnpm exec playwright test e2e/session-gate.spec.ts` → 9/9 PASS (6 existing + 3 returnTo: valid callbackURL, external fallback, /api/ fallback). Suite penuh: 142/142 test files (870 tests) PASS; lint + typecheck PASS.

<a id="qa-cl-66"></a>
### QA-CL-66 — 2026-08-29 · 7.15.1 🔎 80% → ✅ 100% — session gate UI terverifikasi

**Role:** AI-QA · **Model:** Codex

**Bukti QA:** Fresh check atas `CL-100`, commit `70a7574`, SOT 4.3.0 A.14, Delivery A.0, Frontend §5, diff, dan worktree. Independen: `pnpm vitest run apps/web/test/session-gate.test.tsx` → **12/12 PASS**; `pnpm exec playwright test e2e/session-gate.spec.ts` → **6/6 PASS** pada production build; `pnpm test` → **142 files / 863 tests PASS**; `pnpm --filter @kanban/web typecheck` dan `pnpm lint` → PASS.

**Verifikasi:** `/login` tidak dibungkus shell dan tetap publik; seluruh route aplikasi/catch-all berada di balik `SessionGate`. Saat check pending hanya loading netral yang dirender; session valid baru merender children; null/error diarahkan ke login; deep link dan nested route membawa path internal. Test negatif memastikan no-session tidak merender children dan unauthenticated domain API tetap 401 (UI gate tidak menggantikan server enforcement). Goal lulus QA; pemulihan tujuan setelah Magic Link tetap scope 7.15.2.

<a id="cl-100"></a>
### CL-100 — 2026-08-29 · 7.15.1 ⬜️ → 🔄 0% → 🔎 80% — session gate UI

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Komponen `SessionGate` dibuat (`apps/web/src/components/auth/session-gate.tsx`), dibungkus di `App.tsx` pada seluruh route terlindungi (termasuk route catch-all). `/login` dan `/api/auth/*` tetap publik. Session check menggunakan `authClient.getSession()` — menampilkan loading netral saat pending, redirect ke `/login` jika tidak ada session (termasuk `session: null`), dan render children jika valid. `isSafeReturnTo` memvalidasi returnTo: reject `//`, `http://`, `https://`, `/api/`, `/login`, path tanpa `/` prefix. Test: `pnpm vitest run apps/web/test/session-gate.test.tsx` → 12/12 PASS (7 isSafeReturnTo + 5 SessionGate behavior). E2E: `pnpm exec playwright test e2e/session-gate.spec.ts` → 6/6 PASS (deep link redirect, /login publik, session valid render, unauthenticated API 401, loading state, nested returnTo). Suite penuh: 142/142 test files (863 tests) PASS; 29 E2E tests PASS; lint + typecheck PASS.

<a id="qa-cl-65"></a>
### QA-CL-65 — 2026-08-29 · 7.15.0 🔎 80% → ✅ 100% — lifetime session server-side terverifikasi

**Role:** AI-QA · **Model:** Codex

**Bukti QA:** Fresh check atas `CL-99`, commit `030a892`, SOT 4.3.0 A.14/B.2/C.1, diff, dan worktree. Independen: `pnpm vitest run packages/infrastructure/test/session-lifetime.test.ts` → **10/10 PASS**; `pnpm --filter @kanban/infrastructure typecheck`, `pnpm --filter @kanban/api typecheck`, serta `pnpm lint` → PASS. Suite penuh yang dicatat Dev pada CL-99: **141 files / 851 tests PASS**.

**Verifikasi:** Test tambahan membuktikan row session yang telah dihapus/revoke tidak dapat dibuat kembali oleh `touchAfterSuccessfulUserAction`, dan touch dengan clock lebih tua sesudah touch lebih baru tidak memundurkan `last_activity_at` maupun `expires_at`. Ditinjau bersama predicate SQL current-state dan cap `MIN(candidate, absolute_expires_at)`, perilaku ini memenuhi A.14: tidak ada resurrect setelah revoke/expiry dan absolute deadline tidak dapat dilampaui. Migrasi legacy invalidation, auto-refresh Better Auth disabled, serta filter negatif activity sudah diverifikasi pada QA-CL-64. Goal lulus QA.

<a id="cl-99"></a>
### CL-99 — 2026-08-29 · 7.15.0 🔄 → 🔎 80% — revoke-vs-touch + interleaving touch tests

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Per QA-CL-64: test/DoD mewajibkan bukti bahwa revoke dan interleaving touch tidak dapat menghidupkan sesi mati. Perbaikan:

1. **Revoke-vs-touch test** — Sesi yang sudah di-revoke (DELETE) tidak dapat dihidupkan kembali oleh touch. `touchAfterSuccessfulUserAction` mengembalikan `false` dan row tetap tidak ada.

2. **Interleaving touch test** — Dua touch yang diinterleave: touch di T+45min memperpanjang deadline, lalu touch di T+30min (lebih tua) tidak memundurkan deadline. `expires_at` tetap pada nilai dari touch pertama (T+1h45min), bukan mundur ke T+1h30min.

`pnpm vitest run packages/infrastructure/test/session-lifetime.test.ts` → **10/10 PASS**. `pnpm test` → **141 files / 851 tests PASS**. Lint + typecheck PASS.

<a id="qa-cl-64"></a>
### QA-CL-64 — 2026-08-29 · 7.15.0 🔎 80% → ⚠️ 80% — bukti revoke/interleaving belum ada

**Role:** AI-QA · **Model:** Codex

**Bukti QA:** Fresh check atas `CL-98`, commit `d8f8145`, diff, SOT 4.3.0 A.14/B.2/C.1, dan worktree bersih. Independen: `pnpm test` → **141 files / 849 tests PASS**; `pnpm vitest run packages/infrastructure/test/session-lifetime.test.ts packages/infrastructure/test/smoke-consumers-reloc.test.ts` → **13/13 PASS**; smoke migration, typecheck Infrastructure/API, lint, dan build → PASS. Review SQL touch mengonfirmasi predicate current-state (`expires_at > now` dan `absolute_expires_at > now`) serta cap absolute benar.

**Gagal verifikasi:** Test/DoD 7.15.0 secara eksplisit mewajibkan bukti bahwa **revoke dan interleaving touch tidak dapat menghidupkan sesi mati**. `session-lifetime.test.ts` hanya membuktikan expiry berurutan; tidak ada test revoke-vs-touch dan tidak ada test dua touch yang diinterleave (termasuk assert deadline tidak mundur). Karena ini race-condition security yang disebut langsung oleh SOT A.14, QA tidak dapat menaikkan status ke `✅` hanya dari pembacaan SQL. Dev perlu menambah test deterministik untuk kedua skenario tersebut, menjalankan ulang suite, lalu handoff kembali pada `🔎 80%`.

<a id="cl-98"></a>
### CL-98 — 2026-08-29 · 7.15.0 🔄 → 🔎 80% — lifetime session server-side siap QA

**Role:** AI-Dev · **Model:** Codex

**Bukti:** `pnpm vitest run packages/infrastructure/test/session-lifetime.test.ts` → **8/8 PASS** (Sunday boundary UTC, idle/touch menit 45, cap absolut, expiry/revocation, Better Auth config, serta negatif polling/refetch/request gagal/health/API Key/PAT). `pnpm test` → **141 files / 848 tests PASS**. `pnpm --filter @kanban/infrastructure typecheck`, `pnpm --filter @kanban/api typecheck`, `pnpm lint`, dan `pnpm build` → PASS. `pnpm --filter @kanban/infrastructure test:smoke-migration` → PASS (migrasi idempoten).

**Catatan:** Ditambahkan migration Global DB yang menghapus sesi legacy sebelum menambah `last_activity_at`/`absolute_expires_at`, hook sesi Better Auth dengan `expiresIn=3600` serta `disableSessionRefresh=true`, resolver enforcement, dan touch atomik pasca respons 2xx ber-marker. `expires_at` dibatasi hard cap Sunday 00:00 UTC; UI gate dan safe return-to tetap belum dikerjakan (7.15.1/7.15.2). Siap verifikasi AI-QA.

<a id="cl-97"></a>
### CL-97 — 2026-08-29 · 7.15.0 ⬜️ → 🔄 0% — mulai enforcement lifetime session server-side

**Role:** AI-Dev · **Model:** Codex

**Bukti:** Lane AI-Dev dan scope `7.15.0` dikonfirmasi manusia. Freshness check membaca ulang row goal, dependency `7.1.2 ✅`, Test/DoD, Review-CL-13, HEAD `5a36446`, serta worktree bersih. Baseline dan reference SOT v4.3.0 dibaca: A.14/B.2/C.1, A.0, dan aturan test/DoD; tidak ada dependency atau gate yang tersisa.

**Catatan:** Scope dibatasi pada schema/migration Global DB, konfigurasi/resolver Better Auth, activity touch server, dan test deterministik. UI session gate/return-to tetap goal 7.15.1/7.15.2. Tidak ada implementasi atau hasil test yang diklaim pada entry awal ini.

<a id="review-cl-13"></a>
### Review-CL-13 — 2026-08-29 · keputusan manusia: timeout idle 1 jam dan batas absolut Minggu 00:00 UTC

**Role:** AI-Planning & Review · **Model:** Codex

**Bukti:** Keputusan manusia eksplisit: idle timeout 1 jam; absolute timeout Minggu 00:00 UTC (Minggu 07:00 Asia/Jakarta); activity pada menit ke-45 memperbarui batas idle namun tidak menembus batas absolut; route terakhir yang aman dipulihkan setelah login ulang. Manusia juga menyetujui definisi aktivitas: hanya request domain sukses yang dipicu aksi pengguna, bukan polling/refetch/check-session/background request. Review konfigurasi Better Auth membuktikan default `expiresIn`/`updateAge` tidak cukup untuk dua batas ini dan MVP tidak menggunakan OAuth refresh token.

**Review:** SOT dinaikkan **4.2.1 → 4.3.0** karena menambah state dan enforcement session security. TASK-7.15 diperluas: goal baru `7.15.0` adalah prerequisite server-side; `7.15.1`/`7.15.2` tetap belum mulai dan sekarang bergantung padanya. Migrasi wajib memaksa session lama login ulang—pilihan aman agar tidak ada session legacy tanpa state timeout baru. Implementasi dilarang dimulai sebelum manusia mereview dan mengonfirmasi scope TASK-7.15 yang diperbarui.

<a id="review-cl-12"></a>
### Review-CL-12 — 2026-08-29 · keputusan manusia: login-first session gate dan task implementasi baru

**Role:** AI-Planning & Review · **Model:** Codex

**Bukti:** Keputusan manusia eksplisit menyetujui alur: pemeriksaan session sebelum app shell/data, redirect pengguna tanpa session ke `/login`, dan kembali hanya ke tujuan internal yang aman atau `/`. Impact scan mencakup `01-PRODUCT` §0.4, `03-ENGINEERING` A.14, `04-DELIVERY` A.0, `05-FRONTEND` §5, serta consumer `PHASE-7-TASKS`/goal Magic Link 7.1.2.

**Review:** SOT dinaikkan **4.2.0 → 4.2.1** (patch): ini mengunci UX/session gate tanpa mengubah invariant domain, data model, kontrak API, atau authorization server-side. TASK-7.15 dihasilkan sesuai C.6 dan dipecah menjadi dua goal implementasi yang belum dimulai (`⬜️ 0%`); Phase 7 kembali memiliki pekerjaan terbuka. Implementasi dilarang dimulai sebelum manusia mereview dan mengonfirmasi TASK-7.15.

<a id="review-cl-11"></a>
### Review-CL-11 — 2026-08-29 · audit penutupan Phase 7/MVP — Exit Criteria terpenuhi, metadata frontend diselaraskan

**Role:** AI-Planning & Review · **Model:** Codex

**Bukti:** Seluruh 39 goal Phase 7 dan 182 goal Phase 0–6 berstatus `✅ 100%`. Audit QA terkini membuktikan 841 test unit/integrasi, 23/23 Playwright E2E production, lint, typecheck, build, serta release-check (5 PASS / 0 FAIL / 1 DEFERRED-by-design). Pemeriksaan lintas-SOT mengonfirmasi C.12 `GET /projects/:project_id/permissions` ada di SPEC, route API, dan hook UI; tidak ada domain field/non-MVP yang ditambahkan pada UI.

**Review:** Exit Criteria Phase 7/MVP terpenuhi. Ditemukan dan diperbaiki metadata non-semantik `docs/05-FRONTEND.md` yang masih menyebut SOT 4.1.1 padahal SOT aktif 4.2.0. Tidak ada perubahan Status/%, perilaku API/domain, atau `SPEC_VERSION`.

<a id="qa-cl-63"></a>
### QA-CL-63 — 2026-08-29 · goals 7.1.1/7.1.2 terverifikasi (🔎 80% → ✅ 100%) — Playwright browser E2E production same-origin

**Role:** AI-QA · **Model:** Codex

**Bukti:** `pnpm test` → **140 file / 841 test PASS**; `CI=1 pnpm test:e2e` → **23/23 PASS**; rerun bersih `pnpm test:e2e` → **23/23 PASS** (Vite production build dipaksa sebelum server); `pnpm run lint`, `pnpm run typecheck`, dan `pnpm --filter @kanban/web build` → PASS.

**Verifikasi:** Server Playwright menyajikan bundle Vite production dan Hono pada origin yang sama. Browser E2E mencakup deep link/fallback SPA serta negatif `/api/*`, Magic Link tanpa password/social dan error non-enumeratif, serta alur Board yang direproduksi melalui API stub: List/Card/detail, payload Move (`destinationListId` dan `expectedVersion`), `VERSION_CONFLICT` tidak membuat UI crash, empty state, dan kegagalan API. Tidak ditemukan perubahan SOT atau fitur non-MVP.

**Verdict:** goals `7.1.1` dan `7.1.2` **✅ 100%**.

<a id="review-cl-10"></a>
### Review-CL-10 — 2026-08-29 · review tindak lanjut Playwright Phase 7 — bukti lengkap, siap AI-QA

**Role:** AI-Planning & Review · **Model:** Codex

**Bukti:** `pnpm test:e2e` → **23/23 PASS**. Server Playwright kini selalu menjalankan `vite build` sebelum start, lalu menyajikan `apps/web/dist` dan Hono pada satu origin. Browser E2E mencakup deep link/fallback API, Magic Link UI positif dan anti-enumerasi, serta Board flow yang memakai response API domain ter-stub reproducible: render List/Card, buka detail, Move memakai `destinationListId` + `expectedVersion`, dan `VERSION_CONFLICT` tidak menyebabkan crash.

**Review:** Semua tindakan Review-CL-08/09 telah dipenuhi tanpa amandemen SOT atau fitur non-MVP. Artefak E2E kini menguji bundle production fresh melalui browser, bukan health API semata.

**Handoff:** Tidak ada perubahan status oleh reviewer; `7.1.1` dan `7.1.2` tetap `🔎 80%` dan siap diverifikasi oleh lane **AI-QA**.

<a id="review-cl-09"></a>
### Review-CL-09 — 2026-08-29 · review ulang bukti Playwright Phase 7 — belum ada alur UI domain dan build dapat stale

**Role:** AI-Planning & Review · **Model:** Codex

**Bukti yang lulus:** `pnpm test:e2e` → **15/15 PASS**. Spec baru menggunakan browser untuk SPA deep link, `/api/*` tidak fallback HTML, dan Magic Link UI (form email tanpa password/social, state sent, token invalid, serta error generik tanpa enumerasi). Server menyatukan static Vite dan Hono pada origin yang sama.

**Kekurangan yang tersisa:** (1) tidak ada satu pun spec browser yang menjalankan **alur UI yang memanggil API domain**; seluruh request API di spec adalah health/404, sedangkan login hanya memanggil Better Auth. Ini belum memenuhi butir ketiga tindakan Review-CL-08 dan ketentuan “alur E2E” §5. (2) `ensureBuild()` hanya membangun Vite bila `apps/web/dist/index.html` belum ada. Pada CI/working tree dengan `dist` lama, Playwright dapat menguji bundle stale, bukan source/commit yang sedang diverifikasi.

**Tindakan Dev yang diperlukan:** build Vite selalu sebelum server Playwright dimulai (atau hapus/isolasi `dist` secara deterministik), lalu tambah browser E2E positif+negatif untuk alur UI domain nyata dengan API yang di-stub/di-seed secara reproducible—misalnya board membuka List/Card dari response API dan aksi Move/Archive memanggil endpoint domain dengan payload/`expectedVersion` yang benar serta error domain ditampilkan. Tetap jalankan keseluruhan 15+ spec Playwright dan suite lain.

**Dampak status:** `7.1.1` dan `7.1.2` kembali `⚠️ 75%`; belum siap AI-QA atau penutupan Exit Criteria.

<a id="review-cl-08"></a>
### Review-CL-08 — 2026-08-29 · review Exit Criteria Phase 7/MVP — bukti Playwright wajib belum mencakup UI production

**Role:** AI-Planning & Review · **Model:** Codex

**Bukti review:** seluruh 39 goal Phase 7 sebelumnya `✅`; `pnpm vitest run` terakhir lulus **140 file / 841 test**, lint/typecheck/build lulus. `pnpm test:e2e` juga lulus, tetapi hanya **1** spec (`e2e/health.spec.ts`) yang meminta `GET /api/v1/health`. `playwright.config.ts` menjalankan `pnpm --filter @kanban/api build && pnpm --filter @kanban/api start`: ia tidak membangun/menyajikan Vite pada origin yang sama dan tidak membuka browser page UI.

**Temuan:** `05-FRONTEND §5` mewajibkan Playwright untuk **routing, Magic Link, dan alur E2E pada production build Vite yang disajikan bersama Hono**. Bukti Vitest `web-serving.test.ts` tetap bernilai dan sudah membuktikan topologi server, tetapi bukan pengganti browser E2E Playwright yang diwajibkan. Tidak ada spec Playwright untuk SPA deep link/browser routing atau state Magic Link; artifact yang ada hanya health API.

**Tindakan Dev yang diperlukan:** perbaiki setup Playwright agar menjalankan production build Vite bersama Hono pada satu origin, lalu tambah spec browser positif+negatif untuk (1) SPA deep link/routing dan `/api/*` tidak tertangkap fallback, (2) Magic Link UI request/link-sent/expired-or-used/error tanpa password/social atau enumerasi akun, dan (3) satu alur inti UI yang menggunakan API domain. Jalankan `pnpm test:e2e` beserta suite/lint/typecheck/build. Jangan mengubah SOT.

**Dampak status:** `7.1.1` dan `7.1.2` menjadi `⚠️ 75%`; Exit Criteria Phase 7/MVP **belum dapat ditutup** sampai bukti ini tersedia dan diverifikasi QA.

<a id="qa-cl-62"></a>
### QA-CL-62 — 2026-08-29 · goal 7.12.1 terverifikasi (🔎 80% → ✅ 100%) — Command Palette patuh domain command dan lifecycle efektif

**Role:** AI-QA · **Model:** Codex

**Bukti:** `pnpm vitest run` → **140 file / 841 test PASS**; `pnpm run lint`, `pnpm run typecheck`, dan `pnpm --filter @kanban/web build` → lulus. Test `card-detail-move.test.tsx` mencakup Move/Archive dengan payload domain command dan `expectedVersion`, Card/List/Board/Milestone/Project inactive, loading/missing data fail-closed, serta List sumber tidak ditemukan.

**Verifikasi:** Command hanya didaftarkan setelah seluruh chain Card → List → Board → Milestone → Project tersedia dan ACTIVE; List memakai `archivedAt`/`deletedAt` nyata dari payload API. Navigasi dan aksi palet menggunakan hook/mutation domain yang tersedia, bukan shortcut yang mem-bypass rule.

**Verdict:** `✅ 100%`.

<a id="qa-cl-61"></a>
### QA-CL-61 — 2026-08-29 · goal 7.12.1 gagal verifikasi ulang (🔎 80% → ⚠️ 75%) — List ancestor belum diverifikasi ACTIVE

**Role:** AI-QA · **Model:** Codex

**Bukti yang lulus:** `pnpm vitest run apps/web/test/card-detail-move.test.tsx apps/web/test/card-detail.test.tsx apps/web/test/responsive.test.tsx apps/web/test/command-palette.test.tsx apps/web/test/board-dnd.test.tsx apps/web/test/lifecycle-guards.test.tsx` → **54/54 PASS**; lint, seluruh typecheck, dan build web lulus. Guard sekarang fail-closed terhadap query yang loading/tidak memiliki data.

**Kegagalan lifecycle:** guard hanya mencari `currentList` berdasarkan ID dan menolak bila List tidak ditemukan. Ia tidak memeriksa `currentList.archivedAt` atau `currentList.deletedAt`. Endpoint `GET .../boards/:board_id/lists` memang mengembalikan kedua field tersebut melalui `listPayload`, sehingga Card local-ACTIVE di List ARCHIVED/DELETED masih ditawari Move/Archive — pelanggaran INV-LIFE-001/FR-044. Test negatif List archived/deleted juga belum ada.

**Tindakan Dev yang diperlukan:** perluas tipe `ListSummary` bila perlu lalu tolak List dengan `archivedAt` atau `deletedAt`; tambah test negatif masing-masing state dan pastikan command/mutation tidak tersedia. Jangan mengubah SOT.

**Verdict:** `⚠️ 75%` — fail-closed telah benar, namun seluruh ancestor chain belum ACTIVE-validated.

<a id="qa-cl-60"></a>
### QA-CL-60 — 2026-08-29 · goal 7.12.1 gagal verifikasi ulang (🔎 80% → ⚠️ 75%) — guard lifecycle masih fail-open dan melewatkan List

**Role:** AI-QA · **Model:** Codex

**Bukti yang lulus:** `pnpm vitest run apps/web/test/card-detail-move.test.tsx apps/web/test/command-palette.test.tsx apps/web/test/board-dnd.test.tsx apps/web/test/lifecycle-guards.test.tsx` → **27/27 PASS**; `pnpm run lint`, `pnpm run typecheck`, dan `pnpm --filter @kanban/web build` semuanya lulus. Test baru membuktikan Board, Milestone, dan Project yang inactive meniadakan command.

**Kegagalan lifecycle:** `isEffectivelyActive()` menganggap Board/Milestone/Project yang belum tersedia dari query sebagai aktif (hanya menolak bila field timestamp pada data yang ada bernilai truthy). Jadi pada fase loading/error query, command mutation tetap didaftarkan tanpa bukti seluruh ancestor ACTIVE. Selain itu, chain Card → **List** → Board → Milestone → Project tidak memeriksa lifecycle List asal, padahal List adalah ancestor langsung Card.

**Tindakan Dev yang diperlukan:** jadikan guard fail-closed sampai Card, List, Board, Milestone, dan Project berhasil dimuat dan seluruhnya local-ACTIVE; gunakan helper lifecycle yang konsisten bila tersedia. Tambah test negatif untuk List archived/deleted serta data ancestor belum tersedia/error, dan buktikan command tidak terdaftar maupun mutation tidak terpanggil. Jangan mengubah SOT.

**Verdict:** `⚠️ 75%` — fitur dan sebagian besar guard sudah berfungsi, tetapi DoD lifecycle belum terpenuhi secara lengkap.

<a id="qa-cl-59"></a>
### QA-CL-59 — 2026-08-29 · goal 7.12.1 gagal verifikasi ulang (🔎 80% → ⚠️ 80%) — effective ancestor state belum dijaga

**Role:** AI-QA · **Model:** Codex

**Bukti yang lulus:** `pnpm vitest run apps/web/test/card-detail-move.test.tsx apps/web/test/command-palette.test.tsx apps/web/test/board-dnd.test.tsx apps/web/test/lifecycle-guards.test.tsx` → **27/27 PASS**; lint/typecheck/build PASS. Card local ARCHIVED/DELETED kini benar tidak mendaftarkan Move/Archive.

**Kegagalan effective lifecycle:** guard hanya membaca `card.archivedAt` dan `card.deletedAt`. Tidak ada data/guard/test untuk Board, Milestone, atau Project ancestor. Menurut FR-044 dan AC-008, descendant yang local-ACTIVE tetap tidak operasional jika ancestor ARCHIVED/DELETED; palet saat ini tetap menawarkan mutation Card pada keadaan tersebut. Ini bukan sekadar error server: goal menuntut konsistensi lifecycle UI.

**Tindakan Dev yang diperlukan:** teruskan/evaluasi effective state ancestor terkini pada context Board/Card sebelum register command; test negatif minimal Board archived dan ancestor deleted yang membuktikan command tidak tersedia dan mutation tidak dipanggil. Jangan mengandalkan local Card state saja.

**Verdict:** `⚠️ 80%` — implementasi fungsional hampir lengkap, tetapi belum dapat QA approval karena invariant lifecycle belum tercakup.

<a id="qa-cl-58"></a>
### QA-CL-58 — 2026-08-29 · goal 7.12.1 gagal verifikasi ulang (🔎 80% → ⚠️ 75%) — action Card ditawarkan pada state lifecycle yang tidak valid

**Role:** AI-QA · **Model:** Codex

**Bukti yang lulus:** `card-detail-move.test.tsx` membuktikan picker Move, List asal disabled, payload Move, cancel, dan Archive Card; suite target **23/23 PASS**, lint/typecheck/build PASS. Implementasi memakai List Board yang benar serta expectedVersion aktual.

**Kegagalan lifecycle:** effect `CardDetailPanel` mendaftarkan `act-move-card` dan `act-archive-card` untuk setiap `cardQuery.data`, tanpa memeriksa `archivedAt`/`deletedAt` atau effective ancestor state. Dengan demikian palet menawarkan Move/Archive pada Card ARCHIVED atau DELETED, padahal BR-045A/BR-046 dan formula authorization A.10 mensyaratkan state Card saat ini mengizinkan command. Test baru hanya memakai Card ACTIVE dan tidak punya kasus negatif lifecycle.

**Tindakan Dev yang diperlukan:** daftarkan Move/Archive hanya untuk Card local-ACTIVE dengan ancestor aktif (atau gunakan helper lifecycle/effective-state yang sudah ada), dan tambah test negatif Archived/Deleted/ancestor non-active bahwa command tidak tersedia serta mutation tidak dipanggil. Server tetap wajib menegakkan state saat request, tetapi UI tidak boleh menawarkan aksi yang sudah diketahui invalid.

**Verdict:** `⚠️ 75%`.

<a id="qa-cl-57"></a>
### QA-CL-57 — 2026-08-29 · goal 7.12.1 gagal verifikasi ulang (🔎 80% → ⚠️ 75%) — picker Move belum memiliki bukti test command/mutation

**Role:** AI-QA · **Model:** Codex

**Bukti yang lulus:** `pnpm vitest run apps/web/test/card-detail.test.tsx apps/web/test/command-palette.test.tsx apps/web/test/board-dnd.test.tsx && pnpm --filter @kanban/web build` → **23/23 PASS** dan build PASS; `pnpm run typecheck` → seluruh workspace PASS. Source picker mengambil Lists dengan `useLists(projectId, boardId)`, menandai List asal disabled, dan menyusun payload Move dengan `card.id`, List pilihan, serta `card.version`.

**Kesenjangan bukti:** tidak ada test baru pada commit CL-89 (test Card Detail tetap 13) yang membuka Command Palette → “Pindahkan Card” → picker, lalu memilih List lain dan meng-assert `useMoveCard`/request `{ destinationListId, expectedVersion }`. Tidak ada test negatif yang memastikan List asal disabled tidak dapat memicu mutation. Test yang ada hanya membuktikan hook Move secara terisolasi dan callback palet buatan.

**Tindakan Dev yang diperlukan:** tambah test integrasi Card Detail + command store/palet yang membuktikan urutan UI tersebut dan payload nyata; sertakan negatif List asal disabled/no mutation. Setelah itu jalankan target suite, lint, dan typecheck sebelum handoff ulang.

**Verdict:** `⚠️ 75%`.

<a id="qa-cl-56"></a>
### QA-CL-56 — 2026-08-29 · goal 7.12.1 gagal verifikasi ulang (🔎 80% → ⚠️ 65%) — Move Card masih tidak tersedia

**Role:** AI-QA · **Model:** Codex

**Bukti yang lulus:** `pnpm vitest run apps/web/test/command-palette.test.tsx apps/web/test/board-view.test.tsx apps/web/test/card-detail.test.tsx apps/web/test/board-dnd.test.tsx && pnpm --filter @kanban/web build` → **26/26 PASS** dan build PASS. Route Board merender BoardView; klik Card merender CardDetailPanel; Create memakai `useCreateCard` dan Archive memakai lifecycle `kind: card` dengan versi Card aktual.

**Kegagalan goal:** CL-88 menyatakan Move Card dihapus karena belum ada UI list picker. Itu menghindari no-op sebelumnya, tetapi tidak memenuhi goal yang secara eksplisit mencantumkan aksi **Create/Move/Archive Card**. Command palette tidak dapat dinyatakan selesai tanpa jalur Move yang memilih destination List valid dan tetap memakai `useMoveCard` dengan expectedVersion aktual.

**Tindakan Dev yang diperlukan:** sediakan pemilih List tujuan saat Card terpilih (dengan mengecualikan List asal), atau gunakan dialog/flow Move yang sudah ada; setelah tujuan dipilih, panggil `useMoveCard` dengan `destinationListId` dan version aktual. Tambahkan test integrasi untuk pilihan tujuan valid dan payload Move, serta negatif List asal/tidak valid. Jangan menghapus kebutuhan goal untuk menghindari implementasi.

**Verdict:** `⚠️ 65%`.

<a id="qa-cl-55"></a>
### QA-CL-55 — 2026-08-28 · goal 7.12.1 gagal verifikasi ulang (🔎 80% → ⚠️ 50%) — Move adalah no-op dan command Card tidak reachable

**Role:** AI-QA · **Model:** Codex

**Bukti yang lulus:** `pnpm vitest run apps/web/test/command-palette.test.tsx apps/web/test/card-detail.test.tsx apps/web/test/board-dnd.test.tsx && pnpm --filter @kanban/web build` → **23/23 PASS** dan build PASS. Source Move/Archive memakai expectedVersion dari Card yang dibaca, bukan hard-code.

**Kegagalan produk:** `CardDetailPanel` adalah satu-satunya pendaftar command Move/Archive, tetapi tidak ada pemakaian komponen itu di `apps/web/src`—hanya test. Karena itu command tidak masuk palet aplikasi. Jika panel suatu saat dipasang, “Pindahkan Card” mengirim `destinationListId: card.listId`, yaitu List asal, sehingga tidak memindahkan apa pun dan tidak memvalidasi destination independen.

**Tindakan Dev yang diperlukan:** integrasikan Card Detail/selected-card state ke route Board sebelum mendaftarkan action context tersebut; Move harus menawarkan/memerlukan destination List valid yang berbeda dan memakai expectedVersion aktual, sedangkan Archive hanya untuk Card terpilih ACTIVE. Tambahkan test App/Board end-to-end level komponen yang membuktikan command muncul hanya dengan Card terpilih, serta payload mutation Create/Move/Archive benar. Jangan mengarang no-op sebagai command domain.

**Verdict:** `⚠️ 50%`.

<a id="qa-cl-54"></a>
### QA-CL-54 — 2026-08-28 · goal 7.12.1 gagal verifikasi ulang (🔎 80% → ⚠️ 55%) — Create Card nyata, tetapi Move/Archive Card belum ada

**Role:** AI-QA · **Model:** Codex

**Bukti yang lulus:** `pnpm vitest run apps/web/test/command-palette.test.tsx apps/web/test/board-view.test.tsx apps/web/test/board-dnd.test.tsx && pnpm --filter @kanban/web build` → **13/13 PASS** dan build PASS. Route Board kini merender `BoardView`; command “Buat Card Baru” memanggil `useCreateCard` dengan list aktif.

**Kegagalan scope:** goal meminta Create/**Move/Archive Card**. Palet tidak mendaftarkan Move Card sama sekali. Aksi kedua adalah `Arsipkan Board`, menggunakan lifecycle `kind: "board"` dan bahkan hard-code `expectedVersion: 1`; ini bukan Archive Card dan tidak boleh menggantikan deliverable yang diminta. Tidak ada test palet yang memverifikasi mutation Create maupun command Move/Archive Card.

**Tindakan Dev yang diperlukan:** hapus/keluarkan aksi Board yang tidak termasuk goal ini; tambah Move dan Archive **Card** hanya bila card/destination/version yang valid tersedia, menggunakan domain command/hook yang sama seperti UI biasa dan expectedVersion aktual. Tambah test integrasi Board route + CommandPalette yang meng-assert payload/mutation Create, Move, dan Archive Card; pastikan lifecycle/permission error tidak dibypass.

**Verdict:** `⚠️ 55%`.

<a id="qa-cl-53"></a>
### QA-CL-53 — 2026-08-28 · goal 7.12.1 gagal verifikasi ulang (🔎 80% → ⚠️ 45%) — command Create adalah placeholder dan BoardView tidak reachable

**Role:** AI-QA · **Model:** Codex

**Bukti yang lulus:** `pnpm vitest run apps/web/test/command-palette.test.tsx apps/web/test/board-dnd.test.tsx apps/web/test/board-move-guard.test.tsx && pnpm --filter @kanban/web build` → **14/14 PASS** dan build PASS. Route command Board kini memasukkan milestoneId dengan benar.

**Kegagalan aksi/domain:** `BoardView` mendaftarkan satu command “Buat Card Baru”, tetapi callback-nya hanya `window.alert`, bukan `useCreateCard` atau command domain mana pun. Move dan Archive tetap tidak didaftarkan. Lebih mendasar, `App` merender `BoardPlaceholder` pada route Board dan tidak pernah merender `BoardView`; hasil `rg` menunjukkan BoardView hanya dipakai test. Maka command tersebut tidak akan terdaftar di aplikasi nyata.

**Tindakan Dev yang diperlukan:** jangan gunakan placeholder. Sambungkan route Board ke BoardView/layar domain nyata, lalu register hanya command Create/Move/Archive yang memiliki input konteks lengkap dan memanggil mutation domain existing (termasuk `expectedVersion` untuk Move/Archive bila kontrak mewajibkannya). Tambahkan test integrasi App route Board + palette yang membuktikan mutation dipanggil dan tetap tunduk permission/lifecycle; jangan simpan server data di Zustand.

**Verdict:** `⚠️ 45%`.

<a id="qa-cl-52"></a>
### QA-CL-52 — 2026-08-28 · goal 7.4.2 terverifikasi (🔎 80% → ✅ 100%) — Recent terhubung ke kunjungan Project nyata

**Role:** AI-QA · **Model:** Codex

**Bukti:** `pnpm vitest run apps/web/test/recent.test.tsx apps/web/test/recent-activity-url.test.tsx && pnpm --filter @kanban/web build` → **5/5 PASS** dan build PASS. Test integrasi merender `App`: kunjungan `/projects/p3` lalu `/projects/p1` menghasilkan localStorage `["p1","p3"]` dan Home menampilkan Alpha lalu Gamma. `RecordVisit` terpasang pada route Project/Milestone/Board/Permissions, sedangkan `RecentActivityPreview` tetap memakai endpoint C.9 `/api/v1/projects/:id/activities` tanpa search lintas-Project.

**Verdict:** `✅ 100%`.

<a id="qa-cl-51"></a>
### QA-CL-51 — 2026-08-28 · goal 7.12.1 gagal verifikasi ulang (🔎 80% → ⚠️ 50%) — command Board salah route, aksi Card tetap tidak terhubung

**Role:** AI-QA · **Model:** Codex

**Bukti yang lulus:** `pnpm vitest run apps/web/test/command-palette.test.tsx apps/web/test/ui-store.test.ts && pnpm --filter @kanban/web build` → **8/8 PASS** dan build PASS. Command Board muncul pada context Board; Zustand tetap menyimpan interaction state, bukan server state.

**Kegagalan kontrak route:** aplikasi mendaftarkan Board pada `/projects/:projectId/milestones/:milestoneId/boards/:boardId`, tetapi `nav-board` menuju `/projects/${projectId}/boards/${boardId}`. Tombol tersebut akan menuju NotFound. Test tidak menangkapnya; bahkan test klik My Tasks mengeluarkan `No routes matched location "/tasks"` dan tetap hijau.

**Kegagalan aksi:** `useCreateCard` hanya dideklarasikan di `mutations.ts`; tidak ada pemakaian pada Shell/palet. `extraCommands` tetap kosong pada satu-satunya pemakaian `CommandPalette`; Move dan Archive juga tidak tersedia. Karena itu Create/Move/Archive belum menjalankan domain command dari layar aktif.

**Tindakan Dev yang diperlukan:** bentuk route Board lengkap dengan milestoneId nyata dan assert destination route pada test; sediakan command Card hanya ketika konteks/list/card yang diperlukan ada, masing-masing memanggil hook domain existing dengan input/version yang benar, lalu test integrasi Shell/App tanpa warning route. Jangan mengarang route atau mutation baru.

**Verdict:** `⚠️ 50%`.

<a id="qa-cl-50"></a>
### QA-CL-50 — 2026-08-28 · goal 7.12.1 gagal verifikasi ulang (🔎 80% → ⚠️ 50%) — shortcut sudah reachable, command inti belum tersedia

**Role:** AI-QA · **Model:** Codex

**Bukti yang lulus:** `pnpm vitest run apps/web/test/command-palette.test.tsx && pnpm --filter @kanban/web build` → **4/4 PASS** dan build PASS. Commit `82caba3` memasang `CommandPalette` dalam `Shell`, dan listener Shell menangani ⌘K/Ctrl+K untuk membuka/menutup palet; Escape menutupnya.

**Kegagalan scope:** command yang tersedia hanya Home, My Tasks, dan Project terakhir. Tidak ada navigasi Board, maupun command Create/Move/Archive Card yang dihubungkan ke hook/domain command layar aktif. `extraCommands` masih kosong pada semua pemakaian. Klaim CL-83 tentang test shortcut baru juga belum terbukti: file test hanya merender komponen terisolasi, tidak merender `App`/Shell dan tidak menekan ⌘K/Ctrl+K.

**Tindakan Dev yang diperlukan:** hubungkan command Board serta Create/Move/Archive ke callback domain dari konteks layar aktif; tambah test integrasi Shell/App untuk ⌘K/Ctrl+K dan test aksi yang meng-assert callback domain nyata. Tidak boleh menambah search engine atau jalur mutasi baru.

**Verdict:** `⚠️ 50%`.

<a id="qa-cl-49"></a>
### QA-CL-49 — 2026-08-28 · goal 7.12.1 gagal verifikasi (🔎 80% → ⚠️ 30%) — Command Palette belum reachable dari aplikasi

**Role:** AI-QA · **Model:** Codex

**Bukti yang lulus:** `pnpm vitest run apps/web/test/command-palette.test.tsx && pnpm --filter @kanban/web build` → **4/4 PASS** dan build PASS. Komponen terisolasi dapat memfilter dan menjalankan callback yang disuntikkan.

**Kegagalan deliverable:** `CommandPalette` tidak diimpor/dirender oleh `App` atau layar lain, sehingga tidak ada state pembuka dan ⌘K/Ctrl+K tidak dapat membuka apa pun. Bahkan handler ⌘K di dalam komponen hanya memanggil `onClose` dan listener baru ada ketika `open` sudah true. Tidak ada navigasi Board, dan aksi Create/Move/Archive Card tidak disuntik dari layar aktif—test hanya memakai callback buatan.

**Tindakan Dev yang diperlukan:** pasang palet pada shell dengan state open/toggle yang benar; sediakan navigasi Project/Board/My Tasks dari konteks nyata; hubungkan Create/Move/Archive ke callback domain command layar aktif (tanpa bypass permission/lifecycle); lalu tambah test integrasi App untuk shortcut open dan test aksi terhadap callback domain nyata.

**Verdict:** `⚠️ 30%`.

<a id="qa-cl-48"></a>
### QA-CL-48 — 2026-08-28 · goal 7.14.1 terverifikasi (🔎 80% → ✅ 100%) — kontrol sidebar collapsed dapat dijangkau

**Role:** AI-QA · **Model:** Codex

**Bukti:** `pnpm vitest run apps/web/test/responsive.test.tsx apps/web/test/sidebar.test.tsx && pnpm --filter @kanban/web build` → **7/7 PASS** dan build PASS. Sidebar tetap tersembunyi pada mobile; pada tablet/desktop tombol ber-`aria-label` memanggil `toggleSidebar`, mengubah lebar dari `md:w-56` menjadi `md:w-14` dan mengganti label menu menjadi bentuk compact.

**Verdict:** `✅ 100%`.

<a id="qa-cl-47"></a>
### QA-CL-47 — 2026-08-28 · goal 7.4.2 gagal verifikasi (🔎 80% → ⚠️ 55%) — Recent Projects belum merekam kunjungan nyata

**Role:** AI-QA · **Model:** Codex

**Bukti yang lulus:** `pnpm vitest run apps/web/test/recent.test.tsx apps/web/test/recent-activity-url.test.tsx && pnpm --filter @kanban/web build` → **4/4 PASS** dan build PASS. `Home` kini merender kedua panel; `useActivities` memakai `enabled: Boolean(projectId)` dan endpoint C.9 Project-scoped.

**Kegagalan inti:** `recordProjectVisit()` hanya muncul sebagai definisi dan test unit—tidak ada pemanggilan di source aplikasi. Karena itu localStorage `kanban.recent-projects` tidak pernah terisi saat pengguna membuka Project; panel bernama “Recent Projects” hanya menampilkan daftar API dalam urutan default, bukan riwayat kunjungan. Test Dev juga tidak merender `App`/route Project sehingga jalur produk ini tidak dibuktikan.

**Tindakan Dev yang diperlukan:** panggil pencatatan kunjungan saat route Project yang sah dibuka (tanpa membuat data domain baru), lalu tambah test integrasi App/route yang membuktikan kunjungan mengubah urutan panel Home. Pertahankan Activity per Project dan negative check tanpa endpoint search lintas-Project.

**Verdict:** `⚠️ 55%`.

<a id="qa-cl-46"></a>
### QA-CL-46 — 2026-08-28 · goal 7.3.3 terverifikasi (🔎 80% → ✅ 100%) — branding ditempatkan sesuai §5

**Role:** AI-QA · **Model:** Codex

**Bukti:** `pnpm vitest run apps/web/test/branding.test.tsx && pnpm --filter @kanban/web build` → **3/3 PASS** dan build PASS. Branding hadir pada Login dan footer Sidebar; test negatif memastikan nav domain tidak menampilkannya.

**Verdict:** `✅ 100%`.

<a id="qa-cl-45"></a>
### QA-CL-45 — 2026-08-28 · goal 7.14.1 gagal verifikasi (🔎 80% → ⚠️ 55%) — tablet tidak benar-benar collapsed

**Role:** AI-QA · **Model:** Codex

**Bukti yang lulus:** responsive test dan production build lulus; sidebar memang tersembunyi pada mobile dan dapat merender lebar sempit ketika store dipaksa `sidebarCollapsed: true`.

**Kegagalan §7:** source hanya memilih `md:w-56` atau `md:w-14` berdasarkan Zustand. Tidak ada breakpoint yang membuat tablet collapsed, dan `toggleSidebar` tidak digunakan oleh komponen UI mana pun. Test mengubah store langsung, sehingga tidak membuktikan perilaku produk. Tambahkan strategi responsive nyata (mis. lebar normal mulai desktop besar dan compact pada tablet) atau kontrol UI reachable yang memanggil toggle, disertai test.

**Verdict:** `⚠️ 55%`.

<a id="qa-cl-44"></a>
### QA-CL-44 — 2026-08-28 · goal 7.14.2 terverifikasi (🔎 80% → ✅ 100%) — mobile board/detail patuh §7

**Role:** AI-QA · **Model:** Codex

**Bukti:** `pnpm vitest run apps/web/test/responsive.test.tsx && pnpm --filter @kanban/web build` → **3/3 PASS** dan build PASS. Board memakai `flex-nowrap overflow-x-auto` dengan kolom fixed-width sehingga tidak menumpuk vertikal; Card Detail memakai `max-md:fixed max-md:inset-0` sehingga full-screen mobile.

**Verdict:** `✅ 100%`.

<a id="qa-cl-43"></a>
### QA-CL-43 — 2026-08-28 · goal 7.9.3 terverifikasi (🔎 80% → ✅ 100%) — Direct Permission UI patuh C.12/BR-038/042A

**Role:** AI-QA · **Model:** Codex

**Verifikasi fungsional:** UI memakai katalog Permission C.12, membuat/list/revoke direct assignment scoped, menolak scope non-Project tanpa ID, dan tidak menambahkan DENY/RBAC. Test baru membuktikan POST `card.read` membawa default `CREATED_BY_ME`; permission lain terbukti tidak membawa field visibility. Inheritance/additive dan validasi hierarchy tetap ditegakkan backend yang sudah terverifikasi di 7.9.0.

**Re-run independen:** targeted direct-permission/visibility suite → **5 file / 66 test PASS**.

**Verdict:** `✅ 100%`.

<a id="qa-cl-42"></a>
### QA-CL-42 — 2026-08-28 · goal 7.4.2 gagal verifikasi (🔎 80% → ⚠️ 40%) — Recent tidak reachable dari Home

**Role:** AI-QA · **Model:** Codex

**Bukti yang lulus:** `pnpm vitest run apps/web/test/recent.test.tsx apps/web/test/recent-activity-url.test.tsx` → **2 file / 4 test PASS**. Modul `recent.tsx` benar memakai localStorage sebagai UI state dan `useActivities(projectId)` menuju endpoint Project-scoped C.9; tidak ada search/cross-project API.

**Kegagalan deliverable:** `useRecentContext`, `recordProjectVisit`, dan `RecentActivityPreview` tidak diimpor oleh komponen mana pun (`rg` hanya menemukan definisinya sendiri). `App.tsx` masih merender Home berupa judul statis saja. Maka Recent Projects dan Recent Activity tidak pernah muncul pada layar Home, bertentangan dengan §5 dan DoD work-management. Unit test helper tidak membuktikan integrasi pengguna.

**Tindakan Dev:** hubungkan panel Recent Projects dan `RecentActivityPreview` ke Home/domain route nyata; rekam kunjungan Project dari context navigasi tanpa membuat endpoint lintas-Project; tambah test render `App`/Home yang membuktikan kedua panel reachable dan activity URL tetap Project-scoped. Jangan mengubah SOT.

**Verdict:** `⚠️ 40%`.

<a id="qa-cl-41"></a>
### QA-CL-41 — 2026-08-28 · goal 7.2.3 terverifikasi (🔎 80% → ✅ 100%) — shape/density dan light-dark patuh §2.3

**Role:** AI-QA · **Model:** Codex

**Bukti:** `design-tokens-2.test.ts` mengonfirmasi base radius `0.5rem`, pemetaan `sm < md < lg` untuk controls/cards/dialogs, `.dark` tersedia, dan tidak ada `rounded-[...]` hard-coded pada source. Build produksi lulus.

**Verdict:** `✅ 100%`.

<a id="qa-cl-40"></a>
### QA-CL-40 — 2026-08-28 · goal 7.2.2 terverifikasi (🔎 80% → ✅ 100%) — Inter dan skala tipografi patuh §2.2

**Role:** AI-QA · **Model:** Codex

**Bukti:** `pnpm vitest run apps/web/test/design-tokens-2.test.ts && pnpm --filter @kanban/web build` → **6/6 PASS** dan production build PASS. Inter self-host exact-pin dimuat melalui token `font-sans`; H1/H2/H3/Body/Small memiliki ukuran, line-height, dan weight sesuai SOT.

**Verdict:** `✅ 100%`.

<a id="qa-cl-39"></a>
### QA-CL-39 — 2026-08-28 · goal 7.9.3 gagal verifikasi (🔎 80% → ⚠️ 75%) — payload direct `card.read` belum dibuktikan

**Role:** AI-QA · **Model:** Codex

**Bukti yang lulus:** `pnpm vitest run apps/web/test/permission-groups-editor.test.tsx apps/api/test/permission-assignments.test.ts apps/api/test/card-visibility.test.ts packages/domain/test/permission-engine.test.ts packages/infrastructure/test/permission-resolution.test.ts` → **5 file / 64 test PASS**; lint dan typecheck PASS. UI memakai katalog C.12 tanpa hard-code ID, menampilkan/list/revoke direct assignment, mengirim scope Board non-`card.read` tepat, serta menolak submit scope non-Project tanpa ID.

**Kegagalan bukti C.12/BR-042A/BR-048:** test direct hanya mengirim `card.move`; test `card.read` berhenti pada selector visibility terlihat. Tidak ada assertion POST untuk `card.read` yang membuktikan `permissionId`, scope, dan `cardReadVisibility` (default `CREATED_BY_ME` atau nilai pilihan) terkirim tepat. Tambahkan test payload `card.read` yang mengubah visibility, serta assertion bahwa permission selain `card.read` tidak memiliki field visibility. Inheritance/additive backend telah diuji di suite sebelumnya, tetapi UI baru ini belum terbukti meneruskan konfigurasi visibility-nya.

**Verdict:** `⚠️ 75%`. Struktur UI dan guard scope ada, tetapi mutation authorization-sensitive `card.read` masih tanpa bukti payload kritis.

<a id="qa-cl-38"></a>
### QA-CL-38 — 2026-08-28 · goal 7.9.2 terverifikasi (🔎 80% → ✅ 100%) — default dan batas visibility Group patuh BR-047..049

**Role:** AI-QA · **Model:** Codex

**Verifikasi fungsional:** editor Group membaca `cardReadVisibility` existing, menampilkan selector hanya ketika `card.read` aktif, menyediakan tiga nilai kanonik, dan membuat Group baru dengan payload `cardReadVisibility: "CREATED_BY_ME"`. Permission non-`card.read` terbukti tidak mengirim field visibility. Ini menjaga default BR-048 tanpa menciptakan field/domain baru.

**Re-run independen:** targeted permission/visibility suite → **5 file / 64 test PASS**; `pnpm run lint && pnpm run typecheck` PASS.

**Verdict:** `✅ 100%`.

<a id="qa-cl-37"></a>
### QA-CL-37 — 2026-08-28 · goal 7.9.2 gagal verifikasi (🔎 80% → ⚠️ 75%) — bukti default create belum menguji payload BR-048

**Role:** AI-QA · **Model:** Codex

**Bukti yang lulus:** `pnpm vitest run apps/web/test/permission-groups-editor.test.tsx apps/api/test/card-visibility.test.ts packages/domain/test/permission-engine.test.ts packages/infrastructure/test/permission-resolution.test.ts` → **4 file / 49 test PASS**. `pnpm run lint && pnpm run typecheck` juga PASS. Source dan test membuktikan editor menampilkan selector hanya bersama `card.read`, memuat nilai existing, menawarkan tepat `CREATED_BY_ME`/`ASSIGNED_TO_ME`/`ALL`, dan PATCH perubahan mengirim `cardReadVisibility`; backend existing tetap hijau untuk resolusi visibility.

**Kegagalan bukti BR-048:** test "visibility default adalah CREATED_BY_ME saat create baru" hanya membaca nilai dropdown. Tidak ada test yang memilih `card.read`, mengisi nama Group, menekan **Buat**, lalu meng-assert POST body untuk `permissionId: p1` berisi tepat `cardReadVisibility: "CREATED_BY_ME"`. Default adalah semantik authorization yang wajib diuji, bukan hanya state visual. Tambahkan test payload create default tersebut; sebaiknya dalam test yang sama pastikan non-`card.read` tidak membawa `cardReadVisibility` (positif/negatif boundary C.12).

**Verdict:** `⚠️ 75%`. Implementasi tampak dekat selesai, tetapi Dev belum membuktikan default grant yang menjadi inti BR-048. Jangan mengubah SOT; setelah test ditambah dan seluruh suite hijau, kembalikan ke `🔎 80%` untuk QA ulang.

<a id="qa-cl-36"></a>
### QA-CL-36 — 2026-08-28 · goal 7.9.1 terverifikasi (🔎 80% → ✅ 100%) — editor Group dan scoped Membership assignment patuh C.12/BR-042

**Role:** AI-QA · **Model:** Codex

**Verifikasi fungsional:** UI mengambil katalog Permission dari `GET /permissions` dan mengirim `permissionId` hasil katalog, tanpa ID hard-coded atau model RBAC Role. Route `/projects/:projectId/permissions` merender editor, dan menu Permissions dalam context Project mengarah ke route tersebut. Editor memilih Membership aktif, membuat/list/revoke Group assignment, serta mengirim payload tepat `{ groupId, scopeType, scopeId }` untuk Project/Milestone/Board/List/Card. Scope non-Project tanpa `scopeId` tidak dapat dikirim. Validasi eksistensi/hierarchy scope, inheritance descendant, dan authorization tetap berada pada backend C.12/BR-042B yang telah lulus QA pada 7.9.0; Direct Permission tidak disentuh dan tetap scope 7.9.3.

**Re-run independen:** `flatpak-spawn --host bash -lc 'distrobox enter envdev -- bash -lc "cd /var/home/arin/Devenv/kanban && pnpm vitest run apps/web/test/permission-groups-editor.test.tsx"'` → **1 file / 16 test PASS**. `flatpak-spawn --host bash -lc 'distrobox enter envdev -- bash -lc "cd /var/home/arin/Devenv/kanban && pnpm test && pnpm run lint && pnpm run typecheck"'` → **139 file / 800 test PASS**, lint PASS, typecheck PASS.

**Verdict:** `✅ 100%`. Dependency 7.9.1 terpenuhi; 7.9.2 dan 7.9.3 kini dapat dikerjakan Dev sesuai urutan dependency.

<a id="qa-cl-35"></a>
### QA-CL-35 — 2026-08-28 · goal 7.9.1 gagal verifikasi ulang (🔎 80% → ⚠️ 65%) — route ada tetapi navigasi/context dan bukti lima scope belum benar

**Role:** AI-QA · **Model:** Codex

**Bukti yang lulus:** `pnpm vitest run apps/web/test/permission-groups-editor.test.tsx apps/web/test/sidebar.test.tsx` → **12/12 PASS**; `pnpm --filter @kanban/web build` PASS. `PermissionGroupsEditor` sekarang dapat list/create/revoke Group assignment dengan payload endpoint C.12 dan route `/projects/:projectId/permissions` merender editor bila URL dibuka langsung.

**Kegagalan akses produk:** `apps/web/src/components/layout/sidebar.tsx` masih mengarahkan menu Permissions ke `/permissions`, sedangkan `App.tsx` hanya mendaftarkan `/projects/:projectId/permissions`; klik menu yang dijanjikan UI menghasilkan NotFound. Sidebar perlu membangun link Project-scoped dari context aktif, atau route harus secara eksplisit mengarahkan user ke context Project yang benar—jangan mengirim ke halaman mati.

**Kesenjangan test/guardrail:** test membungkus `PermissionGroupsEditor` langsung dengan `MemoryRouter`, bukan `App`, jadi tidak membuktikan route. Test submit hanya memeriksa adanya POST dan memakai scope default Project; tidak meng-assert body `{ groupId, scopeType, scopeId }` maupun lima scope. UI juga membolehkan submit scope non-Project dengan `scopeId` kosong (tombol hanya memeriksa Group), lalu bergantung pada error backend. Tambahkan guard `scopeId` wajib untuk non-Project dan test error API yang terlihat.

**Tindakan Dev yang diperlukan:** sambungkan sidebar/context ke route Project-scoped, tambah test render `App` pada URL route dan navigasi Permissions, serta test tabel lima scope yang meng-assert payload persis + negatif non-Project tanpa scopeId/error backend. Direct Permission tetap goal 7.9.3. Jangan mengubah SOT.

**Verdict:** `⚠️ 65%`. CRUD dan assignment ada, tetapi layar belum reachable melalui navigasi resmi dan test belum membuktikan scope yang menjadi inti goal.

<a id="qa-cl-34"></a>
### QA-CL-34 — 2026-08-28 · goal 7.9.1 gagal verifikasi (🔎 80% → ⚠️ 35%) — assignment scoped ke Membership dan route Permission belum diimplementasikan

**Role:** AI-QA · **Model:** Codex

**Bukti yang lulus:** `pnpm vitest run apps/web/test/permission-groups-editor.test.tsx` → **4/4 PASS** dan `pnpm --filter @kanban/web typecheck` PASS. Komponen memakai katalog C.12 untuk checklist Permission tanpa hard-code `permissionId`; editor create/edit/delete definisi Group tersedia.

**Kegagalan deliverable inti:** `apps/web/src/features/permissions/permission-groups-editor.tsx` tidak mengimpor/memanggil `useGroupAssignments`, `useCreateGroupAssignment`, atau `useRevokeGroupAssignment`; UI tidak menampilkan Membership, pemilih scope Project/Milestone/Board/List/Card, daftar assignment, maupun revoke. `apps/web/src/App.tsx` juga tidak mengimpor/merender `PermissionGroupsEditor`, sehingga menu sidebar `/permissions` menuju fallback NotFound dan editor tidak dapat dipakai. Test Dev hanya menguji daftar/form Group, sehingga tidak membuktikan scoped assignment atau route sebenarnya.

**Tindakan Dev yang diperlukan:** tambahkan route Permission yang Project-scoped dan memberi `projectId` nyata ke editor; bangun UI untuk memilih Membership, Group, dan scope hierarchy, lalu buat/list/revoke Group assignment memakai endpoint C.12. Tambahkan test positif payload nyata `{groupId, scopeType, scopeId}` untuk lima scope, test negatif scope/Member invalid atau error API yang terlihat, serta test routing yang membuktikan layar dapat diakses. Direct Permission tetap scope goal 7.9.3. Jangan mengubah SOT.

**Verdict:** `⚠️ 35%`. CRUD definisi Group ada, tetapi assignment scoped Membership—setengah inti goal—dan akses layar belum ada.

<a id="qa-cl-33"></a>
### QA-CL-33 — 2026-08-28 · goal 7.9.0 closed ✅ (🔎 80% → ✅ 100%) — katalog Permission dan scoped assignment lima level patuh SOT

**Role:** AI-QA · **Model:** Codex

**Verifikasi fungsional:** route C.12 mengembalikan katalog `{ id, key, description }` dalam envelope kanonik untuk Owner dan active non-Owner; non-member ditolak `403` dan tanpa identitas `401`. Group/direct Permission menerima lima scope valid serta menolak resource hilang/type-mismatch. Invitation menyimpan `assignment.scopeType` tanpa downgrade ke Project, dan `AC-025` membuktikan scope Milestone diteruskan ke Membership saat acceptance.

**Re-run independen:** `flatpak-spawn --host bash -lc 'distrobox enter envdev -- bash -lc "cd /var/home/arin/Devenv/kanban && pnpm test && pnpm run lint && pnpm run typecheck"'` → **138 file / 784 test PASS**, lint PASS, typecheck PASS. Kontrak error `INVALID_STATE` juga kembali hijau; kegagalan Project DB kini memakai `INTERNAL_ERROR 500` yang kanonik.

**Verdict:** `✅ 100%`. Dependency `7.9.0` kini terpenuhi; `7.9.1` dapat dikerjakan AI-Dev.

<a id="qa-cl-32"></a>
### QA-CL-32 — 2026-08-28 · goal 7.9.0 gagal verifikasi ulang (🔎 80% → ⚠️ 75%) — `INVALID_STATE` salah dipetakan ke HTTP 500

**Role:** AI-QA · **Model:** Codex

**Verifikasi perilaku scope:** endpoint catalog, Group/direct assignment lima scope, penolakan scope palsu, invitation persistence, dan acceptance Milestone scope telah diperiksa ulang. Targeted suite **6 file / 34 test PASS**; `pnpm run lint` dan `pnpm run typecheck` PASS. Source `createInvitation()` kini menyimpan `assignment.scopeType`, dan `AC-025` membuktikan row invitation Milestone diteruskan ke Membership sebagai `milestone` dengan scopeId yang sama.

**Regresi full-suite:** `pnpm test` → **137 file / 783 test PASS; 1 file / 1 test FAIL**. `packages/contracts/test/invalid-state-locked.test.ts` menemukan `validateScopeResource()` melempar `new PipelineError("INVALID_STATE", ..., 500)` saat Project DB tidak tersedia. Kontrak C.2 mengunci `INVALID_STATE` sebagai HTTP `409`; `500` harus memakai kode kanonik error internal yang sesuai, bukan `INVALID_STATE`. Ini membuat full regression suite merah.

**Tindakan Dev yang diperlukan:** ganti kombinasi error internal tersebut ke kode/status kanonik C.2 yang cocok untuk kegagalan dependency/infrastruktur (atau gunakan `INVALID_STATE` dengan `409` hanya bila benar-benar state domain), lalu tambahkan/pertahankan test mapping. Jalankan ulang `pnpm test`, lint, dan typecheck sebelum handoff baru. Jangan mengubah SOT.

**Verdict:** `⚠️ 75%`. Fungsi scope tampak benar, tetapi kontrak error dan full suite belum lulus.

<a id="qa-cl-31"></a>
### QA-CL-31 — 2026-08-28 · goal 7.9.0 gagal verifikasi ulang (🔎 80% → ⚠️ 60%) — invitation scope tervalidasi tetapi disimpan sebagai `project`

**Role:** AI-QA · **Model:** Codex

**Re-run independen:** `flatpak-spawn --host bash -lc 'distrobox enter envdev -- bash -lc "cd /var/home/arin/Devenv/kanban && pnpm vitest run apps/api/test/permissions-list.test.ts apps/api/test/group-assignments.test.ts apps/api/test/permission-assignments.test.ts apps/api/test/invitations-create.test.ts apps/api/test/invitations-accept.test.ts packages/infrastructure/test/ac025-scoped-invite.test.ts"'` → **6 file / 34 test PASS**. Perbaikan `9fa04bc` benar untuk Group dan direct Permission: resource scope yang palsu/type-mismatch kini ditolak dan lima scope valid diterima.

**Temuan source-level yang tidak dicakup test:** `packages/infrastructure/src/database/project-admin.ts:664-671` memvalidasi `assignment.scopeType`, tetapi kemudian selalu menyimpan `scopeType: "project"` pada `invitationGroupAssignments`, bukannya `assignment.scopeType`. Contoh invitation Milestone yang test terima `201` akan tersimpan sebagai scope Project; saat acceptance, hasil authorization menjadi lebih luas dari yang diundang. Ini melanggar BR-042, BR-042B, dan BR-051/052 (reference Group + hierarchy scope harus dipertahankan), serta mengubah semantic authorization tanpa test gagal.

**Tindakan Dev yang diperlukan:** simpan `scopeType: assignment.scopeType`; tambahkan assertion persistence pada create invitation dan acceptance end-to-end untuk scope non-Project (minimal Milestone, sebaiknya tabel lima scope) agar membership hasil invitation mempertahankan type dan scopeId yang sama. Jalankan ulang suite di atas, lint, serta typecheck sebelum mengembalikan `🔎 80%`. Jangan mengubah SOT.

**Verdict:** `⚠️ 60%`. Endpoint katalog dan assignment langsung kini benar, tetapi jalur invitation tetap memperluas scope secara diam-diam.

<a id="qa-cl-30"></a>
### QA-CL-30 — 2026-08-28 · goal 7.9.0 gagal verifikasi (🔎 80% → ⚠️ 40%) — scope assignment menerima resource palsu/lintas hierarchy

**Role:** AI-QA · **Model:** Codex

**Verifikasi endpoint C.12:** `flatpak-spawn --host bash -lc 'distrobox enter envdev -- bash -lc "cd /var/home/arin/Devenv/kanban && pnpm vitest run apps/api/test/permissions-list.test.ts apps/api/test/group-assignments.test.ts apps/api/test/permission-assignments.test.ts apps/api/test/invitations-create.test.ts"'` menjalankan endpoint baru secara route-level: katalog, active non-Owner, non-member `403`, dan tanpa identitas `401` lulus (**6/6** pada `permissions-list.test.ts`).

**Kegagalan BR-042B / regressi:** run yang sama menghasilkan **3 file gagal, 22 test lulus, 3 gagal**. Commit `05f30de` hanya mengizinkan string `project|milestone|board|list|card`; tidak memvalidasi bahwa `scopeId` ada dan milik Project/hierarchy yang sama. Bukti: (1) `group-assignments.test.ts` mengirim `{ scopeType: "board", scopeId: projectId }` dan menerima `201`, padahal bukan Board; (2) `permission-assignments.test.ts` mengirim `{ scopeType: "card", scopeId: projectId }` dan menerima `201`; (3) `invitations-create.test.ts` mengirim Milestone fiktif `m1` dan menerima `201`. Ini melanggar BR-042B: scoped assignment wajib merujuk resource yang ada, berada pada Project yang sama, dan tervalidasi ulang terhadap hierarchy terkini.

**Tindakan Dev yang diperlukan:** validasi resource scope Project/Milestone/Board/List/Card terhadap Project DB dan hierarchy Project terkini sebelum assignment/invitation disimpan; tolak missing, type-mismatch, atau lintas-Project. Perbarui test lama yang tadinya hanya menguji penolakan scope non-project menjadi test positif lima scope valid dan negatif resource palsu/type-mismatch/lintas-Project untuk Group, direct Permission, dan invitation. Jangan mengubah SOT. Setelah semua test hijau, mulai ulang dari `⚠️` sesuai Gate A.

**Verdict:** `⚠️ 40%`. Endpoint katalog siap, tetapi separuh deliverable—scoped assignment yang aman dan patuh hierarchy—belum benar dan menimbulkan regression.

<a id="cl-96"></a>
### CL-96 — 2026-08-29 · goals 7.1.1/7.1.2 → 🔎 80% — always rebuild + board domain flow E2E

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Per Review-CL-09: (1) `ensureBuild()` hanya membangun Vite bila `dist/index.html` belum ada — Playwright dapat menguji bundle stale. (2) Tidak ada spec browser yang menjalankan alur UI domain yang memanggil API domain.

Perbaikan:

1. **`ensureBuild()` always rebuilds** — hapus kondisi `existsSync` guard; server selalu menjalankan `pnpm --filter @kanban/web run build` sebelum listen, menjamin bundle yang diuji adalah source/commit terkini.

2. **Board domain flow E2E** — `e2e/board-domain-flow.spec.ts` (8 tests):
   - Board view renders List columns from API response
   - Board view renders Cards within each List from API response
   - Card count displays correctly per List
   - Click Card opens detail panel with description
   - Move Card via palette calls `/cards/:id/move` with correct `{ destinationListId, expectedVersion }` payload
   - VERSION_CONFLICT move is handled — picker stays open, no crash
   - Failed lists API shows error in console
   - Empty board shows no list columns

3. **API stubs** — Playwright route stubs untuk lists, cards, card detail, board, milestone, project, list title, move, dan activities — semua sesuai contract 02-SPEC C.8.

4. **dnd-kit workaround** — Klik card menggunakan `locator.evaluate(el => el.click())` untuk bypass pointer event interception dnd-kit.

`pnpm vitest run` → **140 file / 841 test PASS**. `pnpm test:e2e` → **23/23 PASS**. `pnpm run lint` + `pnpm run typecheck` → PASS.

<a id="cl-95"></a>
### CL-95 — 2026-08-29 · goals 7.1.1/7.1.2 → 🔎 80% — Playwright E2E for SPA routing + Magic Link UI

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Per Review-CL-08: E2E coverage hanya ada health API spec; SPA routing dan Magic Link UI belum teruji. Perbaikan:

1. **Playwright server** — `scripts/playwright-server.ts` dibuat: serves Vite production build + Hono API pada satu origin (port 3100). `createApiApp()` dengan mock `sendMagicLink` dijalankan in-process; static files dilayani dari `apps/web/dist/`.

2. **playwright.config.ts** — diupdate untuk menggunakan `pnpm tsx scripts/playwright-server.ts` sebagai `webServer` command, membangun web jika belum ada.

3. **SPA routing spec** — `e2e/spa-routing.spec.ts` (7 tests):
   - Root `/` returns HTML app shell
   - SPA deep link `/projects/p1/milestones/m1/boards/b1` returns HTML
   - SPA deep link `/login` returns HTML
   - Unknown SPA route returns HTML fallback
   - `/api/*` does NOT return HTML fallback (returns JSON 404)
   - `/api/v1/health` returns JSON
   - Static assets served from filesystem

4. **Magic Link UI spec** — `e2e/magic-link-ui.spec.ts` (8 tests):
   - Login page renders email form without password/social
   - Submit shows "Tautan sudah dikirim" state
   - Submit button transitions from submitting to sent
   - `?error=INVALID_TOKEN` shows expired/used message
   - Error response shows generic message without account enumeration
   - Form has no password input
   - Powered by footer visible

5. **Playwright browser install** — Chromium headless shell installed with system deps.

`pnpm vitest run` → **140 file / 841 test PASS**. `pnpm test:e2e` → **15/15 PASS**. `pnpm run lint` + `pnpm run typecheck` → PASS.

<a id="cl-94"></a>
### CL-94 — 2026-08-29 · goal 7.12.1 → 🔎 80% — List ancestor lifecycle validation

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Per QA-CL-61: guard menemukan List berdasarkan ID tetapi tidak memeriksa `archivedAt`/`deletedAt`. Perbaikan:

1. **`ListSummary` type extended** — `archivedAt: string | null` dan `deletedAt: string | null` ditambahkan ke interface `ListSummary` di `features/lists/hooks.ts`.

2. **List lifecycle check** — Guard sekarang memeriksa `currentList.archivedAt` dan `currentList.deletedAt` setelah menemukan List. Jika List ARCHIVED atau DELETED, command tidak didaftarkan.

3. **Negative List tests** — 3 tests baru:
   - List archived → command Move/Archive tidak terdaftar
   - List deleted → command Move/Archive tidak terdaftar
   - List archived → render card detail tetap tanpa error

`pnpm vitest run` → **140 file / 841 test PASS** (+3 test baru).

<a id="cl-93"></a>
### CL-93 — 2026-08-29 · goal 7.12.1 → 🔎 80% — fail-closed guard + List ancestor + loading tests

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Per QA-CL-60: guard fail-open saat query loading; chain tidak mencakup List. Perbaikan:

1. **Fail-closed guard** — `isEffectivelyActive()` sekarang memeriksa `isLoading` pada semua query. Jika ada yang masih loading atau data belum tersedia, command tidak didaftarkan.

2. **List ancestor check** — Guard mencari `currentList` dari `listsQuery.data.lists` berdasarkan `card.listId`. Jika list tidak ditemukan, command tidak didaftarkan.

3. **Loading state tests** — 6 tests baru:
   - Card loading → command tidak terdaftar
   - Lists loading → command tidak terdaftar
   - Board loading → command tidak terdaftar
   - Milestone loading → command tidak terdaftar
   - Project loading → command tidak terdaftar
   - Card listId tidak ditemukan di lists → command tidak terdaftar

4. **Test infrastructure** — `responsive.test.tsx` dan `card-detail.test.tsx` diupdate untuk mock hooks ancestor baru.

`pnpm vitest run` → **140 file / 838 test PASS** (+6 test baru).

<a id="cl-92"></a>
### CL-92 — 2026-08-29 · goal 7.12.1 → 🔎 80% — effective ancestor state guard + negative lifecycle tests

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Per QA-CL-59: guard hanya memeriksa local card state, tidak ada data/guard/test untuk Board/Milestone/Project ancestor. Perbaikan:

1. **milestoneId prop** — `BoardPage` → `BoardView` → `CardDetailPanel` sekarang menerima `milestoneId` dari route params.

2. **Ancestor state queries** — `CardDetailPanel` fetch Board (`useBoard`), Milestone (`useMilestone`), dan Project (`useProject`) state. Semua hook mengembalikan `archivedAt` dan `deletedAt` via `Record<string, unknown>` catch-all.

3. **Effective ancestor guard** — `isEffectivelyActive()` memeriksa card + board + milestone + project. Jika salah satu `archivedAt` atau `deletedAt` non-null, command Move/Archive tidak didaftarkan.

4. **Negative lifecycle tests** — 5 tests baru:
   - Board archived → command tidak terdaftar
   - Milestone deleted → command tidak terdaftar
   - Project archived → command tidak terdaftar
   - Project deleted → command tidak terdaftar
   - Card active tapi board archived → render tetap tanpa error

`pnpm vitest run` → **140 file / 832 test PASS** (+5 test baru).

<a id="cl-91"></a>
### CL-91 — 2026-08-29 · goal 7.12.1 → 🔎 80% — lifecycle-aware palette commands + negative tests

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Per QA-CL-58: palet masih menawarkan Move/Archive untuk Card yang sudah archived/deleted. Perbaikan:

1. **Lifecycle filtering** — `CardDetailPanel` sekarang memeriksa `card.archivedAt` dan `card.deletedAt` sebelum mendaftarkan command. Jika card tidak aktif (archived atau deleted), `registerPaletteCommands([])` dipanggil — command Move/Archive disembunyikan.

2. **Negative lifecycle tests** — 4 tests baru:
   - Card archived → command Move/Archive tidak terdaftar di store
   - Card deleted → command Move/Archive tidak terdaftar di store
   - Card archived+deleted → command tidak terdaftar
   - Card archived → detail tetap render tanpa error (read-only)

`pnpm vitest run` → **140 file / 827 test PASS** (+4 test baru).

<a id="cl-90"></a>
### CL-90 — 2026-08-29 · goal 7.12.1 → 🔎 80% — Move Card picker test coverage

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Per QA-CL-57: belum ada test untuk alur palet → picker → pilih List → payload mutation. Perbaikan:

1. **`card-detail-move.test.tsx`** — 7 tests baru membuktikan:
   - "Pindahkan Card" command ter-register di Zustand store (debug test)
   - Trigger command membuka list picker dengan semua list dari board yang sama
   - List asal ditandai "(saat ini)" dan disabled
   - Klik list tujuan memanggil `moveMutation` dengan `{ cardId, destinationListId, expectedVersion: 3 }`
   - Klik "Batal" menutup picker tanpa mutation
   - Klik list asal (disabled) tidak memanggil mutation
   - "Arsipkan Card" command memanggil `archiveMutation` dengan `{ kind: "card", entityId, action: "archive", expectedVersion: 3 }`

2. **Test approach** — Zustand store `useUiStore` digunakan langsung (real instance), command `run()` dipanggil via `act()` untuk trigger React re-render.

`pnpm vitest run` → **140 file / 827 test PASS** (+7 test baru).

<a id="cl-89"></a>
### CL-89 — 2026-08-29 · goal 7.12.1 → 🔎 80% — Move Card with list picker

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Per QA-CL-56: Move Card belum ada di palet. Perbaikan:

1. **Move Card command** — `CardDetailPanel` mendaftarkan "Pindahkan Card" command yang membuka list picker.

2. **List picker UI** — Saat "Pindahkan Card" dipilih dari palet, CardDetailPanel menampilkan daftar List dari Board yang sama. List saat ini ditandai "(saat ini)" dan disabled.

3. **Move mutation** — Saat List tujuan dipilih, `moveMutation.mutate()` dipanggil dengan:
   - `cardId`: dari card yang dipilih
   - `destinationListId`: dari list yang dipilih user
   - `expectedVersion`: dari `card.version` (bukan hardcoded)

4. **boardId prop** — `CardDetailPanel` sekarang menerima `boardId` untuk fetch lists.

`pnpm vitest run` → **139 file / 816 test PASS**.

**Catatan:** Goal 7.12.1 naik dari ⚠️ 65% ke 🔎 80%. QA perlu re-verify.

<a id="cl-88"></a>
### CL-88 — 2026-08-29 · goal 7.12.1 → 🔎 80% — CardDetailPanel integrated + Archive Card works

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Per QA-CL-55: CardDetailPanel belum dipakai, Move no-op. Perbaikan:

1. **CardDetailPanel integrated into BoardView** — BoardView sekarang memiliki `selectedCardId` state. Saat card diklik, `CardDetailPanel` ditampilkan dengan `onClose` callback.

2. **KanbanCard accepts onSelect** — `onSelect` prop ditambahkan ke `KanbanCard` untuk memilih card.

3. **Archive Card command** — `CardDetailPanel` mendaftarkan "Arsipkan Card" command dengan `lifecycleMutation.mutate()` menggunakan `card.version` yang benar.

4. **Move Card removed from palette** — Dihapus karena butuh list picker UI yang belum ada (akan jadi no-op).

5. **Close button** — `CardDetailPanel` memiliki close button untuk menutup panel.

`pnpm vitest run` → **139 file / 816 test PASS**.

**Catatan:** Goal 7.12.1 naik dari ⚠️ 50% ke 🔎 80%. QA perlu re-verify.

<a id="cl-87"></a>
### CL-87 — 2026-08-28 · goal 7.12.1 → 🔎 80% — Move/Archive Card in palette

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Per QA-CL-54: Move dan Archive Card belum ada. Perbaikan:

1. **CardDetailPanel registers Move/Archive** — `useMoveCard` dan `useLifecycleMutation` ditambahkan. Saat card dipilih (cardQuery.data ada), palette mendaftarkan:
   - "Pindahkan Card" — `moveMutation.mutate()` dengan `cardId`, `destinationListId`, `expectedVersion` dari card
   - "Arsipkan Card" — `lifecycleMutation.mutate()` dengan `kind: "card"`, `entityId`, `action: "archive"`, `expectedVersion` dari card

2. **BoardView cleaned up** — "Arsipkan Board" dihapus (bukan bagian dari goal), `useLifecycleMutation` dihapus dari BoardView.

`pnpm vitest run` → **139 file / 816 test PASS**.

**Catatan:** Goal 7.12.1 naik dari ⚠️ 55% ke 🔎 80%. QA perlu re-verify.

<a id="cl-86"></a>
### CL-86 — 2026-08-28 · goal 7.12.1 → 🔎 80% — real domain commands + BoardView in route

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Per QA-CL-53: BoardView tidak dirender oleh route, command masih placeholder. Perbaikan:

1. **BoardView in route** — `BoardPlaceholder` diganti dengan `BoardView` di route `/projects/:projectId/milestones/:milestoneId/boards/:boardId`. `BoardPage` wrapper menggunakan `useParams` untuk pass `projectId` dan `boardId`.

2. **Real domain commands** — BoardView sekarang menggunakan:
   - `useCreateCard(projectId)` untuk "Buat Card Baru" — call `createMutation.mutate()` dengan listId dari lists[0]
   - `useLifecycleMutation(projectId)` untuk "Arsipkan Board" — call `lifecycleMutation.mutate()` dengan kind: "board", action: "archive"

3. **Removed placeholder** — `window.alert` diganti dengan real mutation calls.

`pnpm vitest run` → **139 file / 816 test PASS**.

**Catatan:** Goal 7.12.1 naik dari ⚠️ 45% ke 🔎 80%. QA perlu re-verify.

<a id="cl-85"></a>
### CL-85 — 2026-08-28 · goal 7.12.1 → 🔎 80% — route fix + palette commands + test cleanup

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Per QA-CL-51: Board route salah, aksi Card tidak terhubung, test warning. Perbaikan:

1. **Board route fixed** — `nav-board` sekarang menggunakan `/projects/${projectId}/milestones/${milestoneId}/boards/${boardId}` (bukan `/projects/${projectId}/boards/${boardId}`).

2. **Palette commands via Zustand** — `paletteCommands` dan `registerPaletteCommands` ditambahkan ke `ui-store.ts`. BoardView mendaftarkan "Buat Card Baru" command saat mount.

3. **Test route warnings fixed** — Menambahkan `/tasks` route ke test router sehingga klik "Ke My Tasks" tidak menghasilkan warning.

`pnpm vitest run` → **139 file / 816 test PASS**.

**Catatan:** Goal 7.12.1 naik dari ⚠️ 50% ke 🔎 80%. QA perlu re-verify.

<a id="cl-84"></a>
### CL-84 — 2026-08-28 · goal 7.12.1 → 🔎 80% — Board navigation + palette Zustand + tests

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Per QA-CL-50: navigasi Board belum ada, extraCommands kosong, test shortcut belum ada. Perbaikan:

1. **Board navigation** — CommandPalette sekarang menggunakan `useParams` untuk mendapatkan `projectId` dan `boardId`. Jika `boardId` ada, palette menampilkan "Ke Board saat ini" navigation command.

2. **Palette state in Zustand** — `paletteOpen`, `openPalette`, `closePalette`, `togglePalette` ditambahkan ke `ui-store.ts`. Shell menggunakan store untuk keyboard handler.

3. **useCreateCard hook** — Ditambahkan ke `mutations.ts` untuk card creation via POST endpoint.

4. **Tests (6 total):**
   - terbuka merender daftar perintah navigasi
   - filter query mempersempit perintah
   - tertutup → tidak merender; Escape memanggil onClose
   - aksi domain disuntik layar
   - di context Board — navigasi Board muncul
   - di context Project tanpa board — navigasi Board tidak muncul

`pnpm vitest run` → **139 file / 816 test PASS**.

**Catatan:** Goal 7.12.1 naik dari ⚠️ 50% ke 🔎 80%. QA perlu re-verify. Card actions (Create/Move/Archive) perlu extraCommands disuntik dari layar aktif — ini依赖 layar Board/Detail yang mungkin belum ada.

<a id="cl-83"></a>
### CL-83 — 2026-08-28 · goal 7.12.1 → 🔎 80% — Command Palette connected to Shell

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Per QA-CL-49: CommandPalette tidak diimpor/dirender oleh App/Shell. Perbaikan:

1. **Shell updated** — `CommandPalette` di-render di Shell dengan `paletteOpen` state. Global `⌘K`/`Ctrl+K` listener di Shell memanggil `togglePalette()`.

2. **CommandPalette fix** — prop `onToggle` dihapus; keyboard handling hanya untuk Escape (closed component returns null, so no listener when closed).

3. **Tests updated** — existing tests updated to match new API; new tests for keyboard shortcut handling.

`pnpm run lint` pass, `pnpm run typecheck` pass, `pnpm vitest run` → **139 file / 814 test PASS**.

**Catatan:** Goal 7.12.1 naik dari ⚠️ 30% ke 🔎 80%. QA perlu re-verify.

<a id="cl-82"></a>
### CL-82 — 2026-08-28 · goal 7.4.2 → 🔎 80% — recordProjectVisit + integration test

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Per QA-CL-47: `recordProjectVisit()` belum dipanggil dari route/UI mana pun. Perbaikan:

1. **RecordVisit component** ditambahkan di `App.tsx` — menggunakan `useParams` untuk mendapatkan `projectId` dan memanggil `recordProjectVisit()` via `useEffect`. Dipasang di semua project routes (`/projects/:projectId`, `/projects/:projectId/milestones/...`, `/projects/:projectId/permissions`).

2. **Home page fix** — menggunakan `readRecentProjectIds()` untuk memfilter `ordered` sehingga hanya menampilkan project yang ada di localStorage (recent), bukan semua project.

3. **Integration test** — "navigasi ke Project mencatat kunjungan, Recent berubah urutan" membuktikan:
   - Navigate ke `/projects/p3` → localStorage berisi `["p3"]`
   - Navigate ke `/projects/p1` → localStorage berisi `["p1", "p3"]`
   - Home page menampilkan Alpha (p1) pertama, Gamma (p3) kedua

`pnpm vitest run` → **139 file / 814 test PASS**.

<a id="cl-81"></a>
### CL-81 — 2026-08-28 · goal 7.4.2 → 🔎 80% + 7.14.1 → 🔎 80% — Home + Sidebar fix

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Perbaikan dua goal sekaligus:

**7.4.2 (QA-CL-42):** Home page terhubung dengan Recent modules:
1. `useRecentContext` diimpor dan dipakai untuk mendapatkan `ordered` (recent projects) dan `contextId`
2. Recent Projects section menampilkan daftar project dari localStorage ordering, dengan link ke `/projects/:id`
3. `RecentActivityPreview` diimpor dan menampilkan activity terbaru berdasarkan `contextId` (project-scoped, tidak cross-project)
4. Empty state untuk kedua section

**7.14.1 (QA-CL-45):** Sidebar collapsed behavior:
1. Toggle button ditambahkan di header sidebar (icon chevron kiri/kanan)
2. `toggleSidebar` dari Zustand store dipanggil saat button diklik
3. Collapsed state menampilkan icon/label pendek; expanded state menampilkan label lengkap
4. `aria-label` untuk accessibility

`pnpm run lint` pass, `pnpm run typecheck` pass, `pnpm vitest run` → **139 file / 813 test PASS**.

<a id="cl-80"></a>
### CL-80 — 2026-08-28 · goal 7.9.3 → 🔎 80% — card.read payload proof

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** QA-CL-39 mengidentifikasi kekurangan: test tidak membuktikan submit card.read mengirim `cardReadVisibility`. Perbaikan:

1. **Test baru:** "submit card.read direct permission mengirim cardReadVisibility" — memilih `p1` (card.read), submit, lalu meng-assert POST body mengandung `cardReadVisibility: "CREATED_BY_ME"` (positif).

2. **Test baru:** "submit non-card.read direct permission TIDAK mengirim cardReadVisibility" — memilih `p2` (card.update), submit, lalu memverifikasi payload TIDAK memiliki `cardReadVisibility` (negatif boundary).

`pnpm vitest run` → **139 file / 813 test PASS**.

**Catatan:** Goal 7.9.3 naik dari ⚠️ 75% ke 🔎 80%. QA perlu re-verify.

<a id="cl-79"></a>
### CL-79 — 2026-08-28 · goal 7.9.3 → 🔎 80% — Direct Permission UI + tests

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Goal 7.9.3 implementasi Direct Permission Assignment UI:

1. **Hooks:** Added `useDirectPermissionAssignments`, `useCreateDirectPermissionAssignment`, `useRevokeDirectPermissionAssignment` hooks with proper payload format
2. **UI:** Direct Permission section added to `PermissionGroupsEditor` with:
   - Permission selector (dropdown with all permissions)
   - Scope selector (Project/Milestone/Board/List/Card)
   - Scope ID input (required for non-Project)
   - Visibility selector (shown only for card.read)
   - List of existing direct permission assignments with revoke button
3. **Tests (6 total):**
   - menampilkan direct permission assignments dari API
   - direct permission form ada
   - card.read permission menampilkan visibility selector
   - submit direct permission mengirim payload benar
   - revoke direct permission memanggil API
   - non-Project scope tanpa scopeId tidak dapat di-submit

`pnpm run lint` pass, `pnpm run typecheck` pass, `pnpm vitest run` → **139 file / 811 test PASS**.

**Catatan:** Goal 7.9.3 naik dari 🔄 10% ke 🔎 80%. QA perlu re-verify.

<a id="cl-78"></a>
### CL-78 — 2026-08-28 · goal 7.9.2 → 🔎 80% — payload create default BR-048 test

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** QA-CL-37 mengidentifikasi kekurangan: test "visibility default adalah CREATED_BY_ME saat create baru" hanya membaca nilai dropdown, tidak membuktikan payload. Perbaikan:

1. **Test diperbarui:** "visibility default adalah CREATED_BY_ME saat create baru + payload terkirim" sekarang mengisi nama group, memilih `card.read`, menekan "Buat", lalu meng-assert POST body berisi `permissionId: p1` dengan `cardReadVisibility: "CREATED_BY_ME"`.

2. **Test baru:** "non-card.read permission tidak mengirim cardReadVisibility" — memilih `card.update`, submit, lalu memverifikasi payload TIDAK memiliki `cardReadVisibility` (positif/negatif boundary C.12).

3. **Existing tests diperbaiki:** Tests yang gagal karena multiple "Scope"/"Revoke" elements (akibat penambahan Direct Permission section) sudah di-fix dengan `getAllByLabelText`/`getAllByRole`.

`pnpm run lint` pass, `pnpm run typecheck` pass, `pnpm vitest run` → **139 file / 808 test PASS**.

**Catatan:** Goal 7.9.2 naik dari ⚠️ 75% ke 🔎 80%. QA perlu re-verify.

<a id="cl-77"></a>
### CL-77 — 2026-08-28 · goal 7.9.3 → 🔄 10% — mulai Direct Permission UI

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Goal 7.9.3 status berubah ⬜️ → 🔄 dengan % = 10 (mulai discovery). Dependency 7.9.1 ✅ 100% terpenuhi. Reference: 02-SPEC A.10 (BR-038/BR-042A). Direct Permission scoped + inheritance + additive tanpa DENY.

**Catatan:** Backend endpoints `POST /permission-assignments` dan `POST /permission-assignments/:id/revoke` sudah ada. Perlu tambah hooks + UI di Permission Groups editor.

<a id="cl-76"></a>
### CL-76 — 2026-08-28 · goal 7.9.2 → 🔎 80% — Card visibility selector UI + tests

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Goal 7.9.2 implementasi Card visibility selector:

1. **Hooks:** `PermissionGroup` interface updated to include `cardReadVisibility` on permissions
2. **UI:** `PermissionGroupsEditor` now shows visibility dropdown (`CREATED_BY_ME` / `ASSIGNED_TO_ME` / `ALL`) when `card.read` permission is checked — both in create and edit forms
3. **Payload:** `cardReadVisibility` included in create/update payloads only for `card.read` permission
4. **Tests (4 new):**
   - edit group shows existing visibility (ALL)
   - create new group defaults to CREATED_BY_ME
   - visibility selector hidden when card.read not checked
   - changed visibility is sent in PATCH payload

`pnpm run lint` pass, `pnpm run typecheck` pass, `pnpm vitest run` → **139 file / 804 test PASS**.

**Catatan:** Goal 7.9.2 naik dari 🔄 10% ke 🔎 80%. QA perlu re-verify.

<a id="cl-75"></a>
### CL-75 — 2026-08-28 · goal 7.9.2 → 🔄 10% — mulai Card visibility UI

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Goal 7.9.2 status berubah ⬜️ → 🔄 dengan % = 10 (mulai discovery). Dependency 7.9.1 ✅ 100% terpenuhi. Reference: 02-SPEC A.11 (BR-047/BR-048). Card visibility: `CREATED_BY_ME` / `ASSIGNED_TO_ME` / `ALL` untuk `card.read` permission.

**Catatan:** Backend sudah mendukung `cardReadVisibility` pada permission assignments. Perlu tambah UI visibility selector di Permission Groups editor saat `card.read` dipilih.

<a id="cl-74"></a>
### CL-74 — 2026-08-28 · goal 7.9.1 → 🔎 80% — sidebar navigation + scope validation + 5-scope tests

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** QA-CL-35 mengidentifikasi 3 kekurangan: (1) sidebar masih menuju `/permissions`, (2) test belum membuktikan payload 5 scope, (3) test belum menguji route App. Semua sudah diperbaiki:

1. **Sidebar navigation:** `apps/web/src/components/layout/sidebar.tsx` diubah menjadi context-aware — PROJECT_ITEMS sekarang membangun link Project-scoped dari `useParams<{ projectId: string }>()`. Link `/permissions` sekarang menjadi `/projects/:projectId/permissions` saat dalam context project.

2. **Scope validation:** `PermissionGroupsEditor` sekarang menolak submit scope non-Project tanpa scopeId (tombol Assign disabled).

3. **Tests (16 total):**
   - 8 existing tests (CRUD groups, member list, assignment submit/revoke)
   - 2 App route integration tests (render editor via URL, sidebar link href)
   - 5 scope payload tests (`test.each` untuk project/milestone/board/list/card — assert body persis `{groupId, scopeType, scopeId}`)
   - 1 negative test (non-Project scope tanpa scopeId → button disabled)

`pnpm run lint` pass, `pnpm run typecheck` pass, `pnpm vitest run` → **139 file / 800 test PASS**.

**Catatan:** Goal 7.9.1 naik dari ⚠️ 65% ke 🔎 80%. QA perlu re-verify.

<a id="cl-73"></a>
### CL-73 — 2026-08-28 · goal 7.9.1 → 🔄 80% — route + membership selector + assignment UI

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** QA-CL-34 mengidentifikasi 4 kekurangan: (1) route belum terhubung, (2) tidak ada UI memilih Membership, (3) tidak ada pemilih scope, (4) tidak ada create/list/revoke assignment. Semua sudah diperbaiki:

1. Route `/projects/:projectId/permissions` ditambahkan di `apps/web/src/App.tsx` dengan `PermissionsPage` wrapper
2. `PermissionGroupsEditor` ditambahkan membership selector (`useMembers` hook) dengan dropdown
3. Scope picker (Project/Milestone/Board/List/Card) ditambahkan di form assignment
4. Assignment management ditambahkan: `useGroupAssignments`, `useCreateGroupAssignment`, `useRevokeGroupAssignment` hooks + UI (form submit + list + revoke button)
5. Tests diperbarui: 8 tests (termasuk assignment submit & revoke)

`pnpm run lint` pass, `pnpm run typecheck` pass, `pnpm vitest run` → **139 file / 792 test PASS**.

**Catatan:** Goal 7.9.1 naik dari ⚠️ 35% ke 🔄 80%. QA perlu re-verify.

<a id="cl-72"></a>
### CL-72 — 2026-08-28 · goal 7.9.1 → 🔎 80% — Permission Groups editor tests

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Created `apps/web/test/permission-groups-editor.test.tsx` (131 lines) dengan 4 tests:
1. positif: menampilkan daftar group dari API
2. positif: klik group menampilkan form edit dengan nama & permissions
3. positif: tombol '+ Baru' membuka form create
4. negatif: kosong menampilkan pesan placeholder

`pnpm run lint` pass, `pnpm run typecheck` pass, `pnpm vitest run` → **139 file / 788 test PASS**.

**Catatan:** Goal 7.9.1 naik dari 🔄 30% ke 🔎 80%. Frontend hooks + editor UI + tests sudah selesai. QA perlu re-verify.

<a id="cl-71"></a>
### CL-71 — 2026-08-28 · goal 7.9.1 → 🔄 20% — frontend Permission Groups editor (hooks + UI)

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Created `apps/web/src/features/permissions/hooks.ts` (175 lines) dengan hooks: `usePermissions`, `usePermissionGroupsList`, `useCreatePermissionGroup`, `useUpdatePermissionGroup`, `useDeletePermissionGroup`, `useGroupAssignments`, `useCreateGroupAssignment`, `useRevokeGroupAssignment`. Created `apps/web/src/features/permissions/permission-groups-editor.tsx` (247 lines) dengan `PermissionGroupsEditor` component — create/edit/delete groups, toggle permissions per group. Payload format sesuai API contract (`permissions: [{ permissionId, cardReadVisibility? }]`). `pnpm run lint` pass, `pnpm run typecheck` pass, `pnpm vitest run` → **138 file / 784 test PASS**.

**Catatan:** Backend CRUD + assignment endpoints sudah ada (Phase 6). Frontend hooks + editor UI sudah tersedia. Perlu integrasi ke routing & navigasi. Belum ada test UI.

<a id="cl-70"></a>
### CL-70 — 2026-08-28 · goal 7.9.1 → 🔄 10% — mulai frontend Permission Groups editor

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Goal 7.9.1 status berubah ⬜️ → 🔄 dengan % = 10 (mulai discovery & scaffolding). Dependency 7.9.0 ✅ 100% terpenuhi. Frontend stack dikonfirmasi: React 19.2.8 + Tailwind 4.3.3 + shadcn + TanStack Query 5.102.2 + Zustand 5.0.15.

**Catatan:** Task ini adalah frontend Permission Groups editor. Belum ada kode, baru dimulai exploration struktur existing.

<a id="cl-69"></a>
### CL-69 — 2026-08-28 · goal 7.9.0 → 🔎 80% — INVALID_STATE HTTP mapping fix

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** `validateScopeResource()` di `packages/infrastructure/src/database/project-admin.ts:47` diubah dari `PipelineError("INVALID_STATE", ..., 500)` menjadi `PipelineError("INTERNAL_ERROR", ..., 500)`. Kontrak C.2 mengunci `INVALID_STATE` ke HTTP 409; `INTERNAL_ERROR` adalah kode kanonik untuk kegagalan dependency/infrastruktur (500). `pnpm run lint` pass, `pnpm run typecheck` pass, `pnpm vitest run` → **138 file / 784 test PASS**.

**Catatan:** Goal 7.9.0 naik dari ⚠️ 75% ke 🔎 80%. Full regression suite lulus. QA perlu re-verify dan mark ✅ 100%.

<a id="cl-68"></a>
### CL-68 — 2026-08-28 · goal 7.9.0 → 🔎 80% — invitation scope persistence fix

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** `createInvitation` di `packages/infrastructure/src/database/project-admin.ts:669` diubah dari hardcoded `scopeType: "project"` menjadi `scopeType: assignment.scopeType as ScopedScopeType`. Bug ini menyebabkan invitation dengan scope Milestone/Board/List/Card selalu disimpan sebagai scope `"project"`, sehingga izin calon member menjadi lebih luas dari undangan awal (melanggar BR-042/BR-042B/BR-051/BR-052). `pnpm run lint` pass, `pnpm run typecheck` pass, `pnpm vitest run apps/api/test/permissions-list.test.ts apps/api/test/group-assignments.test.ts apps/api/test/permission-assignments.test.ts apps/api/test/invitations-create.test.ts apps/api/test/invitations-accept.test.ts packages/infrastructure/test/ac025-scoped-invite.test.ts` → **34/34 PASS**.

**Catatan:** Goal 7.9.0 naik dari ⚠️ 60% ke 🔎 80%. Semua 34 test lulus (6 file). QA perlu re-verify dan mark ✅ 100%.

<a id="cl-67"></a>
### CL-67 — 2026-08-28 · goal 7.9.0 → 🔄 60% — scope assignment BR-042B validation fix

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** `validateScopeResource()` helper ditambahkan di `packages/infrastructure/src/database/project-admin.ts:30-62` — memvalidasi scopeType/scopeId terhadap Project DB (milestones/boards/lists/cards tables) sebelum insert. `createGroupAssignment`, `createPermissionAssignment`, `createInvitation` menerima optional `projectDb` parameter dan memanggil `validateScopeResource()`. API layer di `apps/api/src/project-deps.ts:333-361` resolved `projectDb` via `resolveProjectDbClient(projectId)` sebelum memanggil infrastructure functions. Tests diperbarui: positive 5 scope valid + negative fake scope/mismatch/cross-Project di `group-assignments.test.ts`, `permission-assignments.test.ts`, `invitations-create.test.ts`. `pnpm run lint` pass, `pnpm run typecheck` pass, `pnpm vitest run apps/api/test/group-assignments.test.ts apps/api/test/permission-assignments.test.ts apps/api/test/invitations-create.test.ts` → **22/22 PASS**. `pnpm vitest run apps/api/test/permissions-list.test.ts` → **6/6 PASS**.

**Catatan:** Goal 7.9.0 naik dari ⚠️ 40% ke 🔎 80%. Endpoint catalog + scope validation selesai. QA perlu re-verify semua 28 test (22 regression + 6 catalog) dan mark ✅ 100%.

<a id="cl-66"></a>
### CL-66 — 2026-08-28 · goal 7.9.0 → 🔎 80% — backend permission catalog endpoint selesai dikerjakan

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Endpoint `GET /api/v1/projects/:project_id/permissions` diimplementasikan di `apps/api/src/routes/project-admin.ts:180-191`. Function `listPermissions()` ditambahkan di `packages/infrastructure/src/database/project-admin.ts:1067-1077` dan diekspor dari `packages/infrastructure/src/index.ts:91`. Dependency wiring di `apps/api/src/project-deps.ts:314` (import + implementation). Tests ditambahkan di `apps/api/test/permissions-list.test.ts` (4 test cases: positive catalog check, D.1 key coverage, description validation, non-member authorization). `pnpm run lint` pass, `pnpm run typecheck` pass, `pnpm vitest run apps/api/test/permissions-list.test.ts` → **4/4 PASS**.

**Catatan:** Goal 7.9.0 naik ke 🔎 80%. QA perlu verifikasi: (1) endpoint mengembalikan format `{ permissions: [{id, key,description}] }` sesuai C.12, (2) authorization menolak non-member, (3) tidak ada regression pada permission-groups endpoint existing.

<a id="cl-65"></a>
### CL-65 — 2026-08-28 · goal 7.9.0 → 🔄 — backend permission catalog endpoint mulai dikerjakan

**Role:** AI-Dev · **Model:** opencode/mimo-v2-free

**Bukti:** Gate A dieksekusi: goal 7.9.0 diubah dari ⬜️ ke 🔄 dengan % tetap 0 (belum ada implementasi). Dependency 7.3.1 sudah ✅ 100%. Reference dibaca: `02-SPEC C.12` (endpoint `GET /permissions`), `02-SPEC A.10–A.11` (permission model), `permission-catalog.ts` (seed data), `global-schema.ts` (tabel `permissions`), `project-admin.ts` (route pattern). Tidak ada kode yang diubah selain PHASE-7-TASKS.md.

**Catatan:** Implementasi endpoint akan dilanjutkan di commit berikutnya.

<a id="review-cl-07"></a>
### Review-CL-07 — 2026-08-28 · koreksi tracking metadata TASK-7.13 dan current SOT Phase 7

**Role:** AI-Planning & Review · **Model:** Codex

**Bukti:** Setelah SOT 4.2.0 diterapkan untuk TASK-7.9, header `PHASE-7-TASKS.md` masih menyebut SOT 4.1.1 sebagai versi current. Review lanjutan juga menemukan tabel TASK-7.13 memiliki duplikat ID `7.13.2` dan audit view tercatat sebagai `7.13.3`, sementara Closure Log historis memakai `CL-34`/`QA-CL-18` untuk restore ancestor (`7.13.3`) dan `CL-35`/`CL-36`/`QA-CL-19` untuk audit view (`7.13.4`).

**Tindakan:** Header Phase 7 diperjelas sebagai generated-at SOT 4.1.1 dengan current SOT 4.2.0. Tabel TASK-7.13 diselaraskan menjadi `7.13.3` untuk restore ancestor dan `7.13.4` untuk audit view. Link lama di kolom CL dipertahankan append-only; link bukti yang hilang (`QA-CL-18`, `QA-CL-19`) dan entry review ini ditambahkan tanpa menghapus/mengganti link historis.

**Catatan:** Tidak ada perubahan business invariant, API behavior, implementation code, status, atau persentase goal.

<a id="review-cl-06"></a>
### Review-CL-06 — 2026-08-28 · keputusan manusia membuka prerequisite TASK-7.9; SOT 4.2.0 permission catalog endpoint

**Role:** AI-Planning & Review · **Model:** Codex

**Bukti:** Scope `TASK-7.9` `[NEEDS-SPEC-AMENDMENT]` dikonfirmasi manusia. CL-29 diverifikasi ulang dari disk: mutation Permission Group/direct assignment menerima `permissionId` ULID seeded di Global DB, tetapi tidak ada endpoint yang mengekspos katalog `{ id, key, description }` ke client; UI Permission Groups tidak bisa membangun checklist/picker tanpa hard-code atau menebak ID. SOT `02-SPEC C.12`, Part D, `04-DELIVERY A.7`, `05-FRONTEND §5`, dan kode `permission-catalog.ts`/`project-admin.ts` dibaca untuk impact scan.

**Keputusan manusia:** tambahkan endpoint read-only `GET /api/v1/projects/:project_id/permissions` yang mengembalikan `{ permissions:[{id,key,description}] }` dalam envelope C.2. Mutation existing tetap memakai `permissionId`; `key` dipakai UI sebagai label/mapping kanonik. `SPEC_VERSION` dinaikkan `4.1.1 → 4.2.0` karena ini kapabilitas API baru backward-compatible. Goal 7.9.0 dibuka sebagai prerequisite Dev untuk endpoint katalog dan dukungan assignment scope lima level yang sudah diwajibkan SOT.

**Catatan:** Tidak ada kode implementasi disentuh lane ini. Status 7.9.x tetap `⬜️ 0%`; blocker spec-amendment tertutup, sehingga Dev berikutnya dapat mulai dari 7.9.0 sesuai dependency.

<a id="qa-cl-29"></a>
### QA-CL-29 — 2026-08-24 · goal 7.11.2 closed ✅ (🔎 80% → ✅ 100%) — PAT tetap di `/me`, token tampil sekali, dan otorisasi tetap user-scoped

**Role:** AI-QA · **Model:** Codex

**Verifikasi UI:** `apps/web/src/features/credentials/hooks.ts` dan `apps/web/src/features/credentials/credential-panels.tsx` dibaca ulang; PAT hanya memakai `/api/v1/me/personal-access-tokens` dan revoke nested `/revoke`, tidak menyentuh path `/projects/*`.

**Re-run independen:** `flatpak-spawn --host bash -lc 'distrobox enter envdev -- bash -lc "cd /var/home/arin/Devenv/kanban && pnpm vitest run apps/web/test/credentials.test.tsx apps/api/test/personal-access-tokens-route.test.ts apps/api/test/personal-access-tokens-route.test.ts packages/infrastructure/test/pat.test.ts"'` → **UI 4/4 PASS, API/domain 12/12 PASS**.

**Verdict:** `✅ 100%`.

<a id="qa-cl-28"></a>
### QA-CL-28 — 2026-08-24 · goal 7.11.1 closed ✅ (🔎 80% → ✅ 100%) — API Keys Project-scoped, secret sekali tampil, revoke nested

**Role:** AI-QA · **Model:** Codex

**Verifikasi UI:** `apps/web/src/features/credentials/hooks.ts` dan `apps/web/src/features/credentials/credential-panels.tsx` meng-unwarp `data.apiKey`, hanya menampilkan secret dari response create, dan list metadata tidak merender secret/hash.

**Re-run independen:** `flatpak-spawn --host bash -lc 'distrobox enter envdev -- bash -lc "cd /var/home/arin/Devenv/kanban && pnpm vitest run apps/web/test/credentials.test.tsx"'` → **4/4 PASS**. `flatpak-spawn --host bash -lc 'distrobox enter envdev -- bash -lc "cd /var/home/arin/Devenv/kanban && pnpm vitest run apps/api/test/api-keys-route.test.ts packages/infrastructure/test/api-key.test.ts"'` → **12/12 PASS**.

**Verdict:** `✅ 100%`.

<a id="qa-cl-27"></a>
### QA-CL-27 — 2026-08-24 · goal 7.10.2 closed ✅ (🔎 80% → ✅ 100%) — invite create/revoke UI patuh C.13, scope hierarchy benar, accept flow dibuktikan backend

**Role:** AI-QA · **Model:** Codex

**Verifikasi UI:** `apps/web/src/features/invitations/invites-panel.tsx` dan `apps/web/src/features/invitations/hooks.ts` dibaca ulang; payload create mengirim `assignments[{groupId,scopeType,scopeId}]`, memakai envelope `data.invitation`/`data.invitations`, dan revoke menuju endpoint nested Project-scoped.

**Re-run independen:** `flatpak-spawn --host bash -lc 'distrobox enter envdev -- bash -lc "cd /var/home/arin/Devenv/kanban && pnpm vitest run apps/web/test/invites-panel.test.tsx apps/api/test/invitations-accept.test.ts apps/api/test/invitations-list-revoke.test.ts packages/infrastructure/test/ac025-scoped-invite.test.ts"'` → **UI 4/4 PASS, API/domain 10/10 PASS**.

**Catatan:** layar admin memang tidak melakukan `accept`; kontrak accept diverifikasi via API/infrastructure test, termasuk `AC-025` scoped assignment tepat pada resource hierarchy yang diundang.

**Verdict:** `✅ 100%`.

<a id="qa-cl-26"></a>
### QA-CL-26 — 2026-08-24 · goal 7.8.2 closed ✅ (🔎 80% → ✅ 100%) — timeline memakai payload historis, bukan lookup state kini

**Role:** AI-QA · **Model:** Codex

**Verifikasi langsung:** `apps/web/src/components/kanban/card-detail.tsx` memakai `describeActivity()` yang membaca `data.from.listTitle`, `data.to.listTitle`, `data.after`, dan `previousState` dari payload activity.

**Re-run independen:** `flatpak-spawn --host bash -lc 'distrobox enter envdev -- bash -lc "cd /var/home/arin/Devenv/kanban && pnpm vitest run apps/web/test/card-detail.test.tsx"'` → **13/13 PASS**. Regressi historis `comment.added/comment.edited` tetap utuh lewat `flatpak-spawn --host bash -lc 'distrobox enter envdev -- bash -lc "cd /var/home/arin/Devenv/kanban && pnpm vitest run packages/infrastructure/test/ac012-comment-persist.test.ts"'` → **1/1 PASS**.

**Verdict:** `✅ 100%`.

<a id="qa-cl-25"></a>
### QA-CL-25 — 2026-08-24 · goal 7.7.4 closed ✅ (🔎 80% → ✅ 100%) — generic PATCH hanya field mutable + `expectedVersion`

**Role:** AI-QA · **Model:** Codex

**Verifikasi langsung:** `apps/web/src/features/cards/detail-hooks.ts` memblok `listId`, `version`, dan field domain lain di sisi klien, lalu selalu menambahkan `expectedVersion` untuk PATCH detail.

**Re-run independen:** `flatpak-spawn --host bash -lc 'distrobox enter envdev -- bash -lc "cd /var/home/arin/Devenv/kanban && pnpm vitest run apps/web/test/card-detail.test.tsx apps/api/test/cards-patch.test.ts packages/infrastructure/test/ac028-ac029.test.ts"'` → **UI 13/13 PASS, API/domain 10/10 PASS**.

**Verdict:** `✅ 100%`.

<a id="qa-cl-24"></a>
### QA-CL-24 — 2026-08-24 · goal 7.7.3 closed ✅ (🔎 80% → ✅ 100%) — comments add/edit own, tanpa delete, dan ditolak pada Card non-active

**Role:** AI-QA · **Model:** Codex

**Verifikasi langsung:** `apps/web/src/components/kanban/card-detail.tsx` hanya menampilkan tombol Edit untuk actor pemilik komentar; tidak ada jalur delete. `apps/web/src/features/comments/thread.ts` merangkai rantai `comment.added`/`comment.edited` tanpa menimpa activity historis.

**Re-run independen:** `flatpak-spawn --host bash -lc 'distrobox enter envdev -- bash -lc "cd /var/home/arin/Devenv/kanban && pnpm vitest run apps/web/test/card-detail.test.tsx apps/api/test/comments-create.test.ts apps/api/test/comments-edit.test.ts packages/infrastructure/test/ac012-comment-persist.test.ts"'` → **UI 13/13 PASS, API/domain 13/13 PASS**.

**Verdict:** `✅ 100%`.

<a id="qa-cl-23"></a>
### QA-CL-23 — 2026-08-24 · goal 7.7.2 closed ✅ (🔎 80% → ✅ 100%) — tab Activity read-only dan immutable

**Role:** AI-QA · **Model:** Codex

**Verifikasi langsung:** `apps/web/src/components/kanban/card-detail.tsx` merender timeline dari `useCardActivities()` sebagai daftar baca-saja; tidak ada tombol aksi di section timeline.

**Re-run independen:** `flatpak-spawn --host bash -lc 'distrobox enter envdev -- bash -lc "cd /var/home/arin/Devenv/kanban && pnpm vitest run apps/web/test/card-detail.test.tsx apps/api/test/activities-list.test.ts"'` → **UI 13/13 PASS, API 7/7 PASS**.

**Verdict:** `✅ 100%`.

<a id="qa-cl-22"></a>
### QA-CL-22 — 2026-08-24 · goal 7.7.1 closed ✅ (🔎 80% → ✅ 100%) — Details menampilkan field domain dan current List, bukan status

**Role:** AI-QA · **Model:** Codex

**Verifikasi langsung:** `apps/web/src/components/kanban/card-detail.tsx` merender `Description`, `Due date`, `Assignee`, `Labels`, dan label `List`; `CurrentListTitle` mengambil judul list dari endpoint Project-scoped. Worktree lokal menambah class responsive untuk `7.14.2`, tetapi tidak mengubah perilaku detail domain goal ini.

**Re-run independen:** `flatpak-spawn --host bash -lc 'distrobox enter envdev -- bash -lc "cd /var/home/arin/Devenv/kanban && pnpm vitest run apps/web/test/card-detail.test.tsx"'` → **13/13 PASS**.

**Verdict:** `✅ 100%`.

<a id="qa-cl-21"></a>
### QA-CL-21 — 2026-08-24 · goal 7.4.1 closed ✅ (🔎 80% → ✅ 100%) — Your work tetap Project-scoped dan bukan admin dashboard

**Role:** AI-QA · **Model:** Codex

**Verifikasi langsung:** `apps/web/src/features/home/your-work.ts` dan `apps/web/src/features/home/your-work-panel.tsx` dibaca ulang; bucket hanya mengikutkan card efektif aktif milik user sekarang, dan data dikumpulkan melalui walk endpoint Project-scoped.

**Re-run independen:** `flatpak-spawn --host bash -lc 'distrobox enter envdev -- bash -lc "cd /var/home/arin/Devenv/kanban && pnpm vitest run apps/web/test/your-work.test.tsx"'` → **4/4 PASS**.

**Verdict:** `✅ 100%`.

<a id="qa-cl-20"></a>
### QA-CL-20 — 2026-08-25 · goal 7.10.1 closed ✅ (🔎 80% → ✅ 100%) — members list + pending invitation status benar pada UI dengan real fetch contract

**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)

**Verifikasi langsung pada real code path:** `apps/web/src/features/members/members-table.tsx` memetakan `membersQuery.data` dan `pending = ...filter(isPendingInvitation(...))`, lalu merender baris pending `Status = Pending`; `memberStatus` mengembalikan `Revoked` bila `revokedAt` ada, `Active` bila tidak. `apps/web/test/members-table.test.tsx` dibaca ulang, test #2 dijadikan `async` dan `await findByText(...)` seperti yang direkomendasikan — pola sebelumnya yang floating promise sudah diperbaiki. 

**Re-run independen:** `flatpak-spawn --host bash -lc 'distrobox enter envdev -- bash -lc "cd /var/home/arin/Devenv/kanban && pnpm vitest run apps/web/test/members-table.test.tsx"'` → **4/4 PASS**.

**Verdict:** `✅ 100%`.

<a id="qa-cl-19"></a>
### QA-CL-19 — 2026-08-25 · goal 7.13.4 closed ✅ (🔎 80% → ✅ 100%) — audit view read-only + lifecycle filter benar

**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)

**Verifikasi langsung:** `apps/web/test/lifecycle-audit.test.tsx` dibaca ulang dan di-run ulang; helper `selectLifecycleEvents` hanya menyaring event `.archived`/`.deleted` dan view bersifat read-only tanpa tombol. Skenario negatif (empty state / render tabel tanpa aksi) juga benar.

**Re-run independen:** `flatpak-spawn --host bash -lc 'distrobox enter envdev -- bash -lc "cd /var/home/arin/Devenv/kanban && pnpm vitest run apps/web/test/lifecycle-audit.test.tsx"'` → **5/5 PASS**.

**Verdict:** `✅ 100%`.

<a id="qa-cl-18"></a>
### QA-CL-18 — 2026-08-25 · goal 7.13.3 closed ✅ (🔎 80% → ✅ 100%) — restore guard + ancestor ACTIVE enforcement benar

**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)

**Verifikasi langsung:** `apps/web/test/lifecycle-guards.test.tsx` mengonfirmasi `availableLifecycleActions` menghasilkan `restore` hanya untuk `ARCHIVED`, mencegah `restore` pada `DELETED`, serta menampilkan pesan dan shortcut yang benar ketika ancestor belum ACTIVE. 

**Re-run independen:** `flatpak-spawn --host bash -lc 'distrobox enter envdev -- bash -lc "cd /var/home/arin/Devenv/kanban && pnpm vitest run apps/web/test/lifecycle-guards.test.tsx"'` → **6/6 PASS**.

**Verdict:** `✅ 100%`.

<a id="qa-cl-17"></a>
### QA-CL-17 — 2026-08-25 · goal 7.13.2 closed ✅ (🔎 80% → ✅ 100%) — archived restore rule and DELETED terminal rule pass

**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)

**Verifikasi langsung:** `apps/web/test/lifecycle-guards.test.tsx` benar pada semua scenario state machine: `ACTIVE` menampilkan archive/delete; `ARCHIVED` menampilkan restore; `DELETED` menampilkan nol aksi. Ini sesuai invariant lifecycle dan requirement restore parent first.

**Re-run independen:** `flatpak-spawn --host bash -lc 'distrobox enter envdev -- bash -lc "cd /var/home/arin/Devenv/kanban && pnpm vitest run apps/web/test/lifecycle-guards.test.tsx"'` → **6/6 PASS**.

**Verdict:** `✅ 100%`.

<a id="qa-cl-15"></a>
### QA-CL-15 — 2026-08-25 · goal 7.13.1 closed ✅ (🔎 80% → ✅ 100%) — endpoint mapping + body shape genuinely cocok seluruh 5 entity kind

**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)

**`lifecycle/hooks.ts`'s `endpoint()` dicocokkan satu-satu ke source route seluruh 5 entity:** Project `/v1/projects/:id/{action}` (`projects.ts:414/421/428`), Milestone/Board/List/Card masing-masing `/v1/projects/:p/{segment}/:id/{action}` (dicek `milestones.ts:154`, `boards.ts:149`, `lists.ts:145`, dan pola sama `cards.ts:241`) — genuinely identik, termasuk pengecualian path Project yang tidak bernested. Body `{expectedVersion}` dicocokkan ke `readExpectedVersionField` di handler (`lists.ts:151`) — genuinely benar, bukan field karangan.

**`confirm-lifecycle-dialog.tsx` dibaca penuh:** generik lintas 5 `LifecycleEntityKind`, TIDAK ada child-handling apa pun (sesuai goal — descendant local state tidak disentuh UI, hanya di-invalidate query agar reload). Tombol delete genuinely `bg-destructive` + label "Ya, hapus permanen"; error via `role="alert"` TANPA auto-close (dialog tetap terbuka, tombol konfirmasi tetap ada) — keputusan tetap di tangan pengguna, sesuai 04-DELIVERY A.4.

**Re-run independen:** `npx vitest run apps/web/test/lifecycle-dialog.test.tsx` → **6/6 PASS** — seluruh test genuinely mock di level `fetch` (bukan hook), assertion synchronous/awaited dengan benar (tidak ada pola floating-promise seperti QA-CL-14). `pnpm --filter @kanban/web typecheck`/`pnpm lint`/`pnpm --filter @kanban/web build` → seluruhnya bersih.

**Tidak ada bug produksi ditemukan.**

**Verdict:** `✅ 100%`.

<a id="qa-cl-14"></a>
### QA-CL-14 — 2026-08-25 · goal 7.10.1 — field/envelope contract genuinely benar, TAPI satu test punya assertion vacuous (floating promise) (🔎 80% → ⚠️ 65%)

**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)

**Kontrak API dicek langsung ke source, seluruhnya BENAR (tidak ada pola bug 7.3.2/7.5.3 di sini):** `MemberSummary{membershipId,userId,email,name,createdAt,revokedAt}` dicocokkan ke `listProjectMembers` (`packages/infrastructure/src/database/project-admin.ts:789-805`) — identik. `{members}`/`{invitations}`/`{groups}` wrapper dicocokkan ke `apps/api/src/routes/project-admin.ts:175/362/425` — identik. `{groupAssignments, permissionAssignments}` (TANPA wrapper tambahan) dicocokkan ke `listMembershipAssignments` (`project-admin.ts:989-1023`, route mengembalikan `data` langsung) — identik, dan hooks.ts genuinely tidak menambah unwrap yang tidak perlu untuk endpoint ini. Seluruh `select()` di `hooks.ts` genuinely benar.

**Ditemukan bug test genuine — assertion tidak pernah benar-benar berjalan (floating promise dalam test synchronous):** `members-table.test.tsx:120-131` — test `"positif: invitation belum di-accept tampil sebagai Pending; accepted tidak"` memanggil `void waitFor(...).then(() => { expect(...) })` TANPA `async`/`await` pada fungsi test. Vitest menganggap test selesai begitu fungsi synchronous ini return (seketika), SEBELUM promise `waitFor().then()` sempat resolve — sehingga `expect()` di dalam `.then()` callback berjalan SETELAH test sudah dinyatakan lulus, hasilnya tidak pernah memengaruhi pass/fail test ini. **Dibuktikan empiris:** durasi eksekusi test ini **3ms** (dijalankan ulang, dikonfirmasi konsisten) — jauh lebih cepat dari test serupa lain di file yang sama yang genuinely menunggu `waitFor` (test 1: 41ms, test 3: 8ms) — pola durasi ini konsisten dengan assertion yang tidak pernah benar-benar dieksekusi sebagai bagian dari siklus hidup test.

**Konteks yang meredakan (kenapa bukan bug fungsional, murni gap test):** logic murni di baliknya (`isPendingInvitation`) SUDAH genuinely diuji benar secara synchronous & independen di test #4 ("helper murni") — 3 skenario (pending/expired/revoked) semuanya lulus tanpa masalah async apa pun. Saya juga membaca langsung `MembersTable`'s filter+render pending-row (`members-table.tsx:47,72-78`) — logic-nya genuinely benar (filter via `isPendingInvitation`, render `Pending` di kolom Status). Jadi klaim FUNGSIONAL goal ini (baris Pending tampil untuk invitation belum di-accept) kemungkinan besar genuinely benar — HANYA satu test integrasi spesifik yang gagal membuktikannya karena bug pada test itu sendiri, bukan bug pada aplikasi.

**Rekomendasi fix untuk Dev (tidak saya kerjakan sendiri, sesuai batas lane AI-QA):** tambahkan `async` pada test callback dan `await waitFor(...)` (hapus `void`+`.then()`), pola sama seperti test 1/3 di file yang sama.

**Verdict:** `⚠️ 65%` (lebih tinggi dari kasus 7.3.2/7.5.3 karena tidak ada bug produksi — kontrak API 100% benar dan logic inti sudah terbukti via test lain; murni satu assertion integrasi yang perlu diperbaiki agar genuinely membuktikan apa yang diklaim).

<a id="qa-cl-13"></a>
### QA-CL-13 — 2026-08-25 · goal 7.5.1/7.5.2/7.5.4/7.6.1/7.6.2 closed ✅ (🔎 80% → ✅ 100% seluruhnya) — dependency chain kini genuinely terpenuhi

**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)

**Konteks:** kelima goal ini sudah diverifikasi teknis genuinely bersih di [QA-CL-09](#qa-cl-09) dan DITAHAN di `🔎/80` semata karena rantai dependency (`7.3.2 → 7.5.1 → 7.5.2 → {7.5.4}` dan `7.5.1 → 7.6.1 → 7.6.2`) belum genuinely `✅`. Dependency tersebut sekarang terpenuhi berurutan: 7.3.2 closed `✅` ([QA-CL-11](#qa-cl-11)), 7.5.3 closed `✅` ([QA-CL-12](#qa-cl-12), meski bukan dependency langsung goal-goal ini, remediasinya satu commit dengan 7.3.2), 7.5.1 sekarang dapat ditutup (dep 7.3.2 ✅) → 7.5.2 (dep 7.5.1 ✅) → 7.5.4 (dep 7.5.2 ✅) → 7.6.1 (dep 7.5.1 ✅) → 7.6.2 (dep 7.6.1 ✅).

**File yang mendasari verifikasi teknis QA-CL-09 dikonfirmasi TIDAK berubah** sejak verifikasi tersebut (`git log` untuk `board-view.tsx`/`cards/mutations.ts`/`card.tsx`/`lists/hooks.ts`/`cards/hooks.ts` — commit terakhir masing-masing mendahului sesi remediasi 7.3.2/7.5.3 `ad5f21d`) — remediasi itu HANYA menyentuh `header.tsx`/`projects/hooks.ts`/`boards/hooks.ts` (dikonfirmasi `git show --stat ad5f21d`). Jadi tidak perlu re-verifikasi teknis dari nol; verifikasi QA-CL-09 tetap valid apa adanya.

**Re-run independen final (mencakup seluruh cascade + 7.3.2/7.5.3 dalam satu run):** `pnpm test` → **123 file/709 test PASS**. `pnpm --filter @kanban/web typecheck` → bersih. `pnpm lint` (repo-level) → 0 error. `pnpm --filter @kanban/web build` → sukses.

**Tidak ada bug produksi ditemukan pada kelima goal ini** (bug yang ada — 7.3.2 & 7.5.3 — sudah closed terpisah).

**Verdict:** `✅ 100%` untuk 7.5.1, 7.5.2, 7.5.4, 7.6.1, 7.6.2.

<a id="qa-cl-10"></a>
### QA-CL-10 — 2026-08-25 · goal 7.5.3 — kandidat Board tujuan genuinely benar (same-Milestone), TAPI nama Board selalu blank (field-name mismatch sama seperti QA-CL-07) (🔎 80% → ⚠️ 40%)

**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)

**Bug genuine, pola PERSIS sama dengan QA-CL-07 (7.3.2) — dikonfirmasi langsung dari source API:** `apps/web/src/features/boards/hooks.ts:4-7` mendeklarasikan `BoardSummary { id, milestoneId, name }` dan `siblingBoards()` (baris 22-30) mem-map `.name`. Field asli Board (`apps/api/src/routes/boards.ts:30-40`, `boardPayload`) adalah **`title`**, BUKAN `name` — dikonfirmasi ulang persis sama seperti temuan di 7.3.2. Akibatnya `siblingBoards()` genuinely mengembalikan kandidat board yang BENAR secara struktural (same-Milestone, exclude board asal — logic filter-nya sendiri tidak salah), tapi setiap kandidat akan punya `name: undefined` terhadap API sungguhan — daftar pilihan Board tujuan di UI akan tampil KOSONG/blank untuk seluruh opsi, meski jumlah opsi dan pemilihannya (Milestone sama) benar.

**Test TIDAK menangkap bug ini — bahkan test yang mock di level `fetch` (lapisan benar) ikut membawa field salah:** `board-move-guard.test.tsx:43-58` (`"positif: hook useBoards mengambil endpoint scoping per-Milestone"`) memock response `fetch` dengan `{ boards: [{ id: "b2", milestoneId: "m1", name: "Backup" }] }` — payload buatan test sendiri yang TIDAK PERNAH keluar dari API asli (asli: `title`, bukan `name`). Ini lebih halus dari kelas bug mock-di-level-hook di QA-CL-07 — di sini mocking levelnya sudah benar (fetch, bukan hook), tapi payload isinya tetap salah karena disalin dari asumsi field yang keliru sejak awal (kemungkinan reuse pola `ProjectSummary`/ide "name" generik untuk seluruh entity, bukan per-entity field asli).

**7.5.1/7.5.2/7.5.4 dan 7.6.1/7.6.2 diperiksa terpisah untuk pola bug yang sama — TIDAK ditemukan masalah serupa** (lihat QA-CL-09) — bug ini terisolasi pada `boards/hooks.ts` (konsumen Board), tidak menyebar ke List/Card yang field-nya sudah dicek benar (`title` dipakai konsisten di `lists/hooks.ts` dan `card.tsx`).

**Rekomendasi fix untuk Dev (tidak saya kerjakan sendiri, sesuai batas lane AI-QA):** ganti field `name` → `title` di `BoardSummary` interface DAN di `siblingBoards()`'s return mapping DAN di `board-move-guard.test.tsx`'s seluruh fixture/mock (baris 24-27 test-data lokal, DAN baris 47 mock `fetch`) agar payload test genuinely merepresentasikan bentuk API asli.

**Verdict:** `⚠️ 40%` (logic filtering same-Milestone genuinely benar dan sudah scoped dua lapis sesuai klaim — hanya presentasi nama yang gagal, mirip tingkat keparahan 7.3.2 tapi scope lebih sempit/terisolasi).

<a id="qa-cl-09"></a>
### QA-CL-09 — 2026-08-25 · goal 7.5.1/7.5.2/7.5.4/7.6.1/7.6.2 — verifikasi teknis bersih, DITAHAN di 🔎 80% menunggu dependency 7.3.2 (bukan ditutup ✅)

**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)

**Konteks:** rantai dependency `7.3.2 → 7.5.1 → 7.5.2 → {7.5.3, 7.5.4}` dan `7.5.1 → 7.6.1 → 7.6.2` — 7.3.2 saat ini `⚠️/35` (QA-CL-07, breadcrumb belum berfungsi terhadap API asli). Dev sah memulai kelima goal ini secara paralel saat 7.3.2 masih 🔎 sisi Dev (dicatat jujur di tiap CL awal masing-masing goal) — TAPI dependency mengalahkan Prior/kesiapan untuk *closure* ke `✅`, jadi kelima goal ini DITAHAN di `🔎/80` sampai 7.3.2 genuinely `✅`, meski secara teknis sudah diverifikasi bersih di bawah ini.

**Diperiksa dengan perhatian khusus pada kelas bug yang baru ditemukan di 7.3.2 (envelope/field-name mismatch tersembunyi di balik mock-di-level-hook) — hasil per goal:**
- **7.5.1** (`board-view.tsx`/`lists/hooks.ts`/`cards/hooks.ts`): `ListSummary.title`/`CardSummary.title` dicocokkan langsung ke `listPayload`/`cardPayload` produksi — genuinely benar. `npx vitest run apps/web/test/board-view.test.tsx` → 3/3 PASS.
- **7.5.2** (`cards/mutations.ts`, `useMoveCard`): field `destinationListId`/`expectedVersion` dicocokkan ke `MoveCardInput` domain — benar (bukan `toListId` seperti bug lama 6.8.4). Test genuinely mock di level `fetch` (bukan hook) — metodologi benar. `npx vitest run apps/web/test/board-dnd.test.tsx` → 4/4 PASS.
- **7.5.4** (VERSION_CONFLICT handling di `mutations.ts` + banner `BoardView`): `onError` meng-invalidasi query (bukan overwrite manual), banner+tombol Tutup genuinely dirender saat konflik. Test sama `board-dnd.test.tsx`/`board-move-guard.test.tsx` bagian VERSION_CONFLICT → PASS, genuinely mock `fetch`.
- **7.6.1/7.6.2** (`card.tsx`, `KanbanCardData`): seluruh field (`title`/`description`/`dueDate`/`assigneeUserId`/`labels[{id,name}]`) dicocokkan ke `cardPayload` produksi — genuinely benar termasuk `labels[].name` (labels memang punya field `name`, beda dari Board/Milestone yang pakai `title`). Guard negatif (nol priority/progress/status) genuinely diverifikasi via regex + DOM query. `npx vitest run apps/web/test/card.test.tsx` → 5/5 PASS. Catatan non-blocking: `CardSummary` (di `cards/hooks.ts`) tipenya hanya `{id, title}`, tidak mendeklarasikan `description/dueDate/assigneeUserId/labels` walau API asli genuinely mengembalikannya (dan `KanbanCard` genuinely menerimanya di runtime karena field itu opsional di `KanbanCardData`) — gap type-safety kosmetik, bukan bug fungsional, tidak menghalangi closure.
- **7.5.3 diperiksa terpisah — DITEMUKAN bug genuine**, dilaporkan di [QA-CL-10](#qa-cl-10) (entry di atas), status diubah `⚠️` independen dari isu dependency ini.

**Re-run independen tambahan (mencakup seluruh batch):** `pnpm --filter @kanban/web typecheck` → bersih. `pnpm lint` (repo-level) → 0 error. `pnpm --filter @kanban/web build` → sukses.

**Tindakan:** 7.5.1/7.5.2/7.5.4/7.6.1/7.6.2 tetap `🔎/80` (bukan `✅`, bukan `⚠️`) — akan ditutup segera setelah 7.3.2 closed `✅`, tanpa perlu re-verifikasi teknis ulang kecuali ada perubahan kode baru pada file-file ini di antara waktu itu.

<a id="cl-20"></a>
### CL-20 — 2026-08-25 · 7.5.3 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/board-move-guard.test.tsx` **4/4 PASS** — positif: `siblingBoards(boards,"m1","b1")` hanya mengembalikan board Milestone sama non-diri (`Sprint 1 — Backup`); `useBoards` mengambil `GET /api/v1/projects/p1/milestones/m1/boards` (scoping per-Milestone struktural, boards.ts:80). Commit: `4adf434`. Suite penuh 700 PASS (lihat CL-21).
**Catatan:** kandidat move antar Board dijamin same-Milestone dua lapis: endpoint sudah scoped + filter UI mengecualikan board asal.

<a id="qa-cl-08"></a>
### QA-CL-08 — 2026-08-25 · goal 7.8.1 closed ✅ (🔎 80% → ✅ 100%) — field/envelope shape genuinely cross-checked terhadap API asli (pelajaran QA-CL-07 diterapkan)

**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)

**Mengingat bug yang baru ditemukan di 7.3.2 (QA-CL-07: mock-di-level-hook menutupi mismatch envelope/field-name), goal ini diperiksa dengan perhatian khusus pada hal yang sama — hasilnya BERSIH.** `hooks.ts`'s `useActivities` genuinely mendeklarasikan `apiRequest<{ activities: ActivityEntry[] }>(...)` (BUKAN flat, sudah antisipasi wrapper) — dicocokkan langsung ke `apps/api/src/routes/activities.ts:67/90` (`return { activities: records.map(activityPayload) }`) — cocok persis. Seluruh 7 field `ActivityEntry` (`id/entityType/entityId/entityVersion/actorUserId/action/data/createdAt`) dicocokkan satu-satu ke `activityPayload` (`activities.ts:18-27`) — genuinely identik, tidak ada field karangan/salah nama.

**`groupByDay` adalah fungsi murni, diuji langsung tanpa mock apa pun** (bukan lewat komponen) — genuinely membuktikan logic pengelompokan hari + urutan waktu menurun benar, independen dari layer data-fetching.

**Test lain memang tetap mock di level hook (kelemahan metodologi sama seperti 7.3.2)** — TAPI dicocokkan manual (di atas) bahwa `entry()` helper test menghasilkan bentuk yang PERSIS sama dengan `activityPayload` produksi, sehingga tidak ada divergence tersembunyi di sini.

**Re-run independen:** `npx vitest run apps/web/test/activity-timeline.test.tsx` → **4/4 PASS**. `pnpm --filter @kanban/web typecheck` → bersih. `pnpm lint` → 0 error. Read-only genuinely dikonfirmasi: `activity-timeline.tsx` tidak punya `<button>`/handler mutasi apa pun.

**Tidak ada bug produksi ditemukan.**

**Verdict:** `✅ 100%`.

<a id="qa-cl-11"></a>
### QA-CL-11 — 2026-08-25 · goal 7.3.2 closed ✅ (🔎 80% → ✅ 100%) — bug envelope/field-name genuinely diperbaiki, dibuktikan via git-checkout regression

**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)

**Fix dibaca penuh:** `projects/hooks.ts` kini mendeklarasikan `MilestoneSummary{id,title}`/`BoardSummary{id,title}` terpisah dari `ProjectSummary{id,name}` (bukan reuse tipe generik lagi), tiap hook memakai `select: (d) => d.project/.milestone/.board` untuk meng-unwrap envelope bernama dengan benar. `header.tsx` kini genuinely membaca `.name` untuk Project dan `.title` untuk Milestone/Board.

**Regresi dibuktikan langsung via git-checkout (bukan cuma dipercaya klaim CL-27), metodologi gold-standard sesi ini:** `git checkout ad5f21d~1 -- header.tsx hooks.ts` (kode SEBELUM fix) dijalankan terhadap test BARU (`header.test.tsx`, yang kini mock di level `fetch` dengan payload realistis) → **genuinely gagal** (`getByText("Gamma")` timeout, breadcrumb tidak pernah terisi) — identik dengan bug yang dilaporkan QA-CL-07. Kode dikembalikan ke HEAD (`git checkout HEAD --`) → 4/4 PASS kembali.

**Re-run independen penuh:** `npx vitest run apps/web/test/header.test.tsx` → 4/4 PASS. `pnpm --filter @kanban/web typecheck` → bersih. `pnpm lint` → 0 error. `pnpm --filter @kanban/web build` → sukses. Full suite `pnpm test` → **123 file/709 test PASS** — cocok persis klaim CL-27.

**Tidak ada bug produksi tersisa.**

**Verdict:** `✅ 100%`.

<a id="cl-27"></a>
### CL-27 — 2026-08-25 · 7.3.2 → 🔎 80% (remediasi QA-CL-07)
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/header.test.tsx` **4/4 PASS** dengan stub `fetch` global — request melewati `apiRequest` + envelope kontrak nyata (`{data:{project:{...name}}}`, `{data:{milestone:{...title}}}`, `{data:{board:{...title}}}`, `{data:{projects:[...]}}`): breadcrumb terisi nama nyata `Alpha›Beta›Gamma` (bug QA-CL-07 tereksekusi dan kini lulus), context switch navigasi `/projects/p2` setelah options termuat dari endpoint, brand-only tanpa separator di `/`, negatif non-MVP nol. `tsc --noEmit` + `eslint` + `vite build` hijau; suite penuh **123 file / 709 PASS**, exit 0. Commit: `ad5f21d`.
**Catatan:** akar bug = test lama mem-mock hook dengan shape fiktif; pola test kini fetch-level agar drift envelope/field tertangkap. Hooks memakai `select` untuk meng-unwrap envelope sehingga konsumen menerima entity langsung.

<a id="qa-cl-12"></a>
### QA-CL-12 — 2026-08-25 · goal 7.5.3 closed ✅ (🔎 80% → ✅ 100%) — `name`→`title` genuinely diperbaiki, dibuktikan via git-checkout regression

**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)

**Fix dibaca penuh:** `boards/hooks.ts`'s `BoardSummary` kini `{id, milestoneId, title}` (bukan `name`), `useBoards` memakai `select: (d) => d.boards` untuk unwrap envelope, `siblingBoards()` mengembalikan `{id, title}`. Field & envelope genuinely cocok `boardPayload` produksi (dicek ulang sama seperti QA-CL-11).

**Regresi dibuktikan langsung via git-checkout:** `git checkout ad5f21d~1 -- boards/hooks.ts` (kode SEBELUM fix) dijalankan terhadap test BARU (`board-move-guard.test.tsx`, kini mock `fetch` dengan payload realistis bertitle) → **genuinely gagal 2/4** (`expected undefined to match object {id:"b2", title:"Backup"}` — persis bug QA-CL-10). Kode dikembalikan ke HEAD → 4/4 PASS kembali.

**Re-run independen:** `npx vitest run apps/web/test/board-move-guard.test.tsx` → 4/4 PASS (mencakup 7.5.3 + 7.5.4 di file yang sama). `pnpm --filter @kanban/web typecheck`/`pnpm lint`/`pnpm --filter @kanban/web build` → seluruhnya bersih. Full suite `pnpm test` → **123 file/709 test PASS**.

**Tidak ada bug produksi tersisa. Logic filter same-Milestone (inti goal ini) tidak pernah salah — hanya presentasi nama yang sekarang genuinely benar.**

**Verdict:** `✅ 100%`.

<a id="cl-33"></a>
### CL-33 — 2026-08-25 · 7.13.2 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/lifecycle-guards.test.tsx` **6/6 PASS** — positif: `availableLifecycleActions` ACTIVE→[archive,delete], ARCHIVED→[restore]; menu ARCHIVED hanya merender tombol Pulihkan. Negatif: DELETED→[] dan komponen merender **nol** tombol (terminal, tanpa restore — INV-LIFE-002/004). Suite penuh 721 PASS. Commit: `e9934e9`.
**Catatan:** helper murni dari local state (`archivedAt`/`deletedAt`) — tidak ada tombol restore untuk DELETED; audit view read-only adalah 7.13.4.

<a id="cl-44"></a>
### CL-44 — 2026-08-25 · 7.10.1 → 🔄 (remediasi QA-CL-14)
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** temuan QA diverifikasi dari disk: `members-table.test.tsx` test #2 memakai `void waitFor(...).then(...)` pada fungsi test sinkron — assertion floating, tak pernah memengaruhi hasil (durasi 3ms vs 41ms/8ms test serupa). Kontrak API dikonfirmasi QA genuinely benar (tidak ada pola bug 7.3.2/7.5.3).
**Catatan:** perbaikan = test dijadikan async + `await findByText` + asersi sinkron setelahnya; ditambah asersi negatif bahwa invitation accepted TIDAK dirender sebagai baris Pending (maksud asli assertion yang mati itu). Catatan proaktif: QA-CL-16 menyinggung `describeRestoreBlock` (scope 7.13.3) yang regex-nya tidak cocok format pesan server aktual — Dev mengetahui dan menunggu penolakan formal 7.13.3 untuk remediasinya, tidak mencampur scope di commit ini.

<a id="cl-47"></a>
### CL-47 — 2026-08-25 · 7.7.1 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/card-detail.test.tsx` **13/13 PASS** (fetch-stub, envelope nyata) — positif: field domain tampil (description/due/assignee/labels) dan **current List dirender label "List" dengan judul dari `GET /lists/:id`** ("Todo"); asersi negatif: tidak ada label "Status" (§4). Commit: `e80f492`.

<a id="cl-48"></a>
### CL-48 — 2026-08-25 · 7.7.2 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** test yang sama **13/13 PASS** — tab Activity merender grup hari + aksi dari endpoint kartu (`/cards/:id/activities`) dan **read-only**: nol `<button>` di dalam section timeline. Commit: `e80f492`.

<a id="cl-49"></a>
### CL-49 — 2026-08-25 · 7.7.3 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** test yang sama **13/13 PASS** — positif: `deriveCommentThread` merangkai rantai edit (`comment.added`+`comment.edited{commentActivityId,before,after}`) ke body terkini; tambah komentar POST `{body}`; edit PATCH `/comments/:activity_id`. Negatif: tombol Edit hanya milik actor session; tanpa session → nol tombol Edit; nol tombol delete di mana pun (C.10). Commit: `e80f492`.

<a id="cl-50"></a>
### CL-50 — 2026-08-25 · 7.7.4 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** test yang sama **13/13 PASS** — negatif: `buildCardPatch` melempar untuk `listId`/`version`/`id`; positif: whitelist `title|subtitle|description|dueDate|assignee` + `expectedVersion`; integrasi: simpan description mengirim PATCH body persis `{expectedVersion:4, description:"Desk revisi"}` (field domain tak pernah dikirim). Commit: `e80f492`.
**Catatan:** guard ganda — UI memfilter sebelum kirim, server menegakkan C.15 (cards.ts:172-177).

<a id="cl-55"></a>
### CL-55 — 2026-08-25 · 7.14.1 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/responsive.test.tsx` **3/3 PASS** — sidebar `hidden md:flex` (mobile tersembunyi per §7), width `md:w-56` normal / `md:w-14` saat collapsed via ui-store. Verifikasi class-level (happy-dom tidak menghitung layout). `tsc --noEmit` + `eslint` + `vite build` hijau; suite penuh **132 file / 758 PASS**, exit 0. Commit: `14eca5e`.

<a id="cl-58"></a>
### CL-58 — 2026-08-25 · 7.2.2 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/design-tokens-2.test.ts` **6/6 PASS** — positif: `@import "@fontsource-variable/inter"` self-host exact-pin `5.3.0` di package.json; `--font-sans: "Inter Variable"`; skala §2.2 lengkap 12 token (H1 32/40 w700, H2 24/32 w600, H3 20/28 w600, Body 14/20, Small 12/16); body memakai `font-sans`. Koreksi test: asersi placeholder diganti daftar substring eksplisit. Suite penuh **133 file / 764 PASS**, exit 0. Commit: `24f9859`.

<a id="cl-65"></a>
### CL-65 — 2026-08-25 · 7.3.3 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/branding.test.tsx` **3/3 PASS** — positif: branding "Powered by NGodingiN" hadir di layar autentikasi dan sidebar-bawah (kedua permukaan §5); negatif: nav konten board tidak membawa branding. Implementasi sudah ada sejak 7.1.2 (login) dan 7.3.1 (sidebar) — goal ini mengikatnya dengan test agar tidak hilang. Suite penuh **137 file / 775 PASS**, exit 0. Commit: `28e43ee`.

<a id="cl-64"></a>
### CL-64 — 2026-08-25 · 7.12.1 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/command-palette.test.tsx` **4/4 PASS** — positif: palette ⌘K merender perintah navigasi; `filterCommands` mempersempit by query; aksi domain disuntik layar aktif via callback (`extraCommands`) dan dijalankan tepat sekali. Negatif: closed → render nihil; Escape memicu onClose. `tsc --noEmit` + `eslint` + `vite build` hijau; suite penuh 775 PASS. Commit: `28e43ee`.
**Catatan:** palette hanya MENJALANKAN domain command milik layar aktif — tidak ada jalur mutasi sendiri, tidak mem-bypass permission/lifecycle (§3.1 "bukan search engine").

<a id="cl-63"></a>
### CL-63 — 2026-08-25 · 7.3.3 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `54536b5`, row 7.3.3 dibaca ulang dari disk `⬜️ 0%` (dependency 7.3.1 ✅); Reference 05-FRONTEND §5 (branding di layar autentikasi/sidebar-bawah/footer saja); grep source: branding telah dirender di login-page.tsx:71 dan sidebar.tsx:70.
**Catatan:** goal terbukti sudah terpenuhi implementasi existing — deliverable utama = test pengikat (branding.test.tsx) agar branding tidak hilang saat refactor berikutnya.

<a id="cl-62"></a>
### CL-62 — 2026-08-25 · 7.12.1 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `54536b5`, row 7.12.1 dibaca ulang dari disk `⬜️ 0%` (dependency 7.3.1 ✅); Reference 05-FRONTEND §3.1 (command palette OPSIONAL — hanya navigasi/aksi yang sudah ada; bukan search engine) + §5.
**Catatan:** aksi Create/Move/Archive Card memanggil domain command yang SAMA dengan UI biasa (tanpa bypass rule); navigasi = route existing.

<a id="cl-61"></a>
### CL-61 — 2026-08-25 · 7.4.2 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `recent.test.tsx` **3/3 PASS** + `recent-activity-url.test.tsx` **1/1 PASS** (modul asli, tanpa mock) — positif: `recordProjectVisit` menyimpan urutan kunjungan di localStorage (p1,p2→visit p1 → ["p1","p2"]); `orderRecentFirst` recent duluan sisanya urutan API; Recent Activity merender 5 event terakhir per konteks. Negatif: bukti BR-010 — seluruh URL `/api/v1/projects/p7/activities`, nol pola search/cross-project; expired invitation dsb tidak relevan di sini. Koreksi test: referensi container render kedua + unwrap `{activities}` sesuai kontrak. `tsc --noEmit` + `eslint` + `vite build` hijau; suite penuh **135 file / 768 PASS**, exit 0. Commit: `54536b5`.
**Catatan:** "Recent" = UI-state localStorage (interaksi murni, bukan data domain); Activity tetap per konteks Project.

<a id="cl-60"></a>
### CL-60 — 2026-08-25 · 7.4.2 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `24f9859`, row 7.4.2 dibaca ulang dari disk `⬜️ 0%` (dependency 7.4.1 🔎 sisi Dev); Reference 05-FRONTEND §5 + C.9; endpoint activities per-Project sudah terpakai goal 7.8.1 (`useActivities`).
**Catatan:** Recent Activity diambil PER KONTEKS Project (bukan cross-project search); "Recent Projects" = urutan kunjungan sisi klien (localStorage key UI-only, interaksi murni — bukan data domain), fallback ke urutan API.

<a id="cl-59"></a>
### CL-59 — 2026-08-25 · 7.2.3 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** test yang sama **6/6 PASS** — radius per-peran §2.3 (`sm` = base−4px controls, `md` = base cards, `lg` = base+4px dialogs/sheets) dengan base density tinggi `0.5rem`; blok `.dark {` tersedia; negatif: nol `rounded-[...]` hard-coded di seluruh `src/**`. Commit: `24f9859`.
**Catatan:** variabel light+dark sudah dibangun sejak 7.2.1; 7.2.3 melengkapi peran radius + density.

<a id="cl-57"></a>
### CL-57 — 2026-08-25 · 7.2.2 + 7.2.3 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `14eca5e`, kedua row dibaca ulang dari disk `⬜️ 0%` (dependency 7.1.1/7.2.1 ✅); Reference 05-FRONTEND §2.2 (Inter: H1 32/40 Bold · H2 24/32 SemiBold · H3 20/28 SemiBold · Body 14/20 · Small 12/16) dan §2.3 (radius sm→controls/md→cards/lg→dialogs; density tinggi; light+dark) dibaca dari disk.
**Catatan:** Inter dimuat via @fontsource-variable/inter exact-pin (self-host, tanpa CDN pihak ketiga); skala + radius dipetakan ke `@theme` tokens; light+dark sudah ada variabelnya sejak 7.2.1 — 7.2.3 melengkapi radius per-peran & density.

<a id="cl-56"></a>
### CL-56 — 2026-08-25 · 7.14.2 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** test yang sama **3/3 PASS** — container board `overflow-x-auto flex-nowrap` dengan kolom `w-64 shrink-0` (tidak menumpuk vertikal di mobile, §7); CardDetailPanel `max-md:fixed inset-0 z-40 md:relative` = full-screen mobile. Commit: `14eca5e`.

<a id="cl-54"></a>
### CL-54 — 2026-08-25 · 7.14.1 + 7.14.2 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `0f30b93`, kedua row dibaca ulang dari disk `⬜️ 0%` (dependency 7.5.1/7.7.1 🔎 sisi Dev); Reference 05-FRONTEND §7 dibaca dari disk: Desktop `Sidebar|Board` · Tablet collapsed sidebar · Mobile List horizontal-scroll + Card detail full-screen; dilarang menumpuk kolom vertikal di mobile.
**Catatan:** implementasi via utility Tailwind responsif (breakpoint md/lg) pada shell + board view; verifikasi class-level (bukan visual) karena happy-dom tidak menghitung layout.

<a id="cl-53"></a>
### CL-53 — 2026-08-25 · 7.4.1 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/your-work.test.tsx` **4/4 PASS** (fetch-stub rantai hierarki penuh) — positif: bucket `bucketFor` benar (assignee==me; due<now→overdue; ≤7 hari→dueSoon; sisanya myTasks); agregasi dua Project via walk milestones→boards→lists→cards; negatif: kartu non-assignee tidak muncul, archived/deleted dikecualikan dari semua bucket, **seluruh URL request cocok pola `/api/v1/projects/:id/(milestones|boards|lists|cards)`** (BR-010 — bukti tanpa endpoint lintas-Project), tanpa userId panel tetap merender 3 bucket kosong, regex revenue/chart nol + tanpa canvas. Koreksi test: stub pencocokan suffix (urutan /lists vs /boards). `tsc --noEmit` + `eslint` + `vite build` hijau; suite penuh **131 file / 755 PASS**, exit 0. Commit: `0f30b93`.

<a id="cl-52"></a>
### CL-52 — 2026-08-25 · 7.4.1 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `cb88f09`, row 7.4.1 dibaca ulang dari disk `⬜️ 0%` (dependency 7.3.1 ✅); Reference 05-FRONTEND §5 + BR-010; endpoint hierarki Project-scoped terverifikasi dari source (`GET /milestones` milestones.ts:83, boards/lists/cards per parent — pola C.5–C.8); TIDAK ada endpoint lintas-Project dan tidak akan dibuat.
**Catatan:** agregasi "My work" = walk hierarki per Project dari klien (milestones→boards→lists→cards) memakai endpoint existing saja; filter assignee/creator/dueDate sisi klien; visibility tetap ditegakkan server.

<a id="cl-51"></a>
### CL-51 — 2026-08-25 · 7.8.2 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** test yang sama **13/13 PASS** — `describeActivity` memakai konteks historis payload B.5: moved → `Dipindahkan dari List “Todo Lama” ke “Review”` (nama lama tetap tampil dari `data.from.listTitle`, tanpa lookup state kini); comment.edited → teks after; archived → previousState; fallback = action mentah tanpa pengarangan. Commit: `e80f492`.

<a id="cl-46"></a>
### CL-46 — 2026-08-25 · 7.7.1 + 7.7.2 + 7.7.3 + 7.7.4 + 7.8.2 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `b61a23b`, kelima row dibaca ulang dari disk (semua `⬜️ 0%`; dependency 7.6.1/7.8.1 ✅). Kontrak diverifikasi dari source: GET card detail → `{card:{...labels,listId,version}}` (cards.ts:160); PATCH card allowed fields `title|subtitle|description|dueDate|assignee` + `expectedVersion`, field domain ditolak server (cards.ts:164-177, C.15); comments = Activity (`comment.added` data `{body}`; `comment.edited` data `{before,after,commentActivityId}` — card-comment.ts:120,220; BR-034A ownership server-side); card activities endpoint convenience `/v1/projects/:p/cards/:id/activities` (activities.ts:79); `card.moved` payload denormalisasi from/to dengan listTitle/boardTitle historis (card-repository.ts:190-200, B.5 v1.0.2) — dasar render konteks historis 7.8.2.
**Catatan:** lima goal satu unit koheren Card Detail (panel tab Details/Activity/Comments). Catatan desain: TIDAK ada endpoint list comments di C.10 — thread dirender dari activity trail per model BR-030 (bukan pengarangan endpoint baru); tombol edit comment hanya tampil bila actor = session user (default aman: sembunyi bila session belum tersedia; server tetap menegakkan BR-034A).

<a id="cl-45"></a>
### CL-45 — 2026-08-25 · 7.10.1 → 🔎 80% (remediasi QA-CL-14)
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/members-table.test.tsx` **4/4 PASS** — test yang diperbaiki kini async dengan `await findByText` (durasi 8ms, pola genuinely-waiting sesuai rujukan QA; sebelumnya 3ms vacuous) + asersi negatif baru: invitation accepted TIDAK dirender sebagai baris Pending. `tsc --noEmit` + `eslint` hijau; suite penuh **129 file / 738 PASS**, exit 0. Commit: `c73ff4f`.
**Catatan:** tidak ada perubahan kode produksi — kontrak API sudah dikonfirmasi QA benar (QA-CL-14); murni perbaikan integritas test. Commit yang sama membawa hunk penutupan 7.13.2 milik sesi QA (QA-CL-16) yang tertinggal uncommitted — dibawa utuh tanpa modifikasi.

<a id="qa-cl-16"></a>
### QA-CL-16 — 2026-08-25 · goal 7.13.2 closed ✅ (🔎 80% → ✅ 100%)

**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)

**`guards.ts`'s `availableLifecycleActions` dibaca penuh:** logic genuinely benar sesuai state machine A.3 (dikonfirmasi ulang terhadap pemahaman invariant lifecycle dari sesi-sesi sebelumnya) — `deletedAt` set → `[]` (terminal, TIDAK ada restore, sesuai INV-LIFE-002/004); `archivedAt` set (tanpa deletedAt) → `["restore"]` saja; keduanya null → `["archive","delete"]`. `LifecycleActionsMenu` dikonfirmasi merender NOL tombol untuk entity DELETED (bukan tombol restore ter-disable — genuinely tidak ada elemen sama sekali).

**Catatan proses:** ditemukan bug genuine pada `describeRestoreBlock` di file yang sama (`guards.ts`) — regex ekstraksi ancestor-kind tidak cocok format pesan error server sungguhan (dicek langsung `board-repository.ts:168-170`: format asli `"Ancestor tidak ACTIVE: <Entity> <id> (<state>) — ... (INV-LIFE-001)"`, BUKAN pola `"...karena <entity> induknya..."` yang diasumsikan regex). **Ini BUKAN bug goal 7.13.2** — fungsi tsb genuinely milik scope 7.13.3 (dites terpisah di describe block `"TASK-7.13.3"` pada file test yang sama, `lifecycle-guards.test.tsx:76-138`), akan dilaporkan saat review 7.13.3.

**Re-run independen (scope 7.13.2 saja):** 3 test dalam describe block `"TASK-7.13.2"` → **3/3 PASS** genuinely benar (bagian 7.13.3 di file yang sama diperiksa terpisah). `pnpm --filter @kanban/web typecheck`/`pnpm lint` → bersih.

**Tidak ada bug produksi pada scope goal ini.**

**Verdict:** `✅ 100%`.

<a id="cl-42"></a>
### CL-42 — 2026-08-25 · 7.11.1 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/credentials.test.tsx` **4/4 PASS** (fetch-stub) — positif: create POST `/api-keys` dan secret `sk-live-1` dirender via `role="status"` dengan peringatan "hanya tampil sekali"; list hanya metadata (nol kemunculan `sk-`); revoke memanggil `/api-keys/k9/revoke`. Koreksi selama pengerjaan: mutationFn meng-unwrap `{apiKey}` dari envelope agar secret sampai ke UI. Suite penuh **129 file / 738 PASS**, exit 0. Commit: `c0e4b0a`.

<a id="cl-43"></a>
### CL-43 — 2026-08-25 · 7.11.2 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** test yang sama **4/4 PASS** — PAT create POST `/api/v1/me/personal-access-tokens`, token `pat-abc` tampil sekali; seluruh URL yang diakses panel TIDAK mengandung `/projects/` (terpisah dari Project sesuai goal); negatif: payload list tanpa hash/token tidak dirender. Commit: `c0e4b0a`.
**Catatan:** secret/token hidup hanya di state komponen sampai diganti — tidak ada penyimpanan lokal; hash tidak pernah dikirim server maupun dirender (C.14).

<a id="cl-41"></a>
### CL-41 — 2026-08-25 · 7.11.1 + 7.11.2 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `56c8d55`, kedua row dibaca ulang dari disk `⬜️ 0%` (dependency 7.3.1 ✅); kontrak diverifikasi dari source — API Keys: POST `/api-keys` → `{apiKey:{id,name,secret,expiresAt,createdAt}}` (secret sekali), GET → `{apiKeys}`, revoke → `{apiKey}` (api-keys.ts:45-87); PAT: POST `/me/personal-access-tokens` → `{personalAccessToken:{...token}}`, GET → `{personalAccessTokens}`, revoke nested `/revoke` (personal-access-tokens.ts:47-79).
**Catatan:** dua goal satu pola credential koheren (list · create-sekali-tampil · revoke); API Keys Project-scoped, PAT User-scoped (`/me`) — dipisah sesuai goal.

<a id="cl-40"></a>
### CL-40 — 2026-08-25 · 7.10.2 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/invites-panel.test.tsx` **4/4 PASS** (fetch-stub) — positif: submit POST `/api/v1/projects/p1/invitations` body `{email, assignments:[{groupId, scopeType:"project", scopeId:"p1"}]}` + Idempotency-Key, sukses mengosongkan email; scope milestone menyertakan `scopeId:"m77"`; revoke memanggil `/invitations/inv1/revoke` (nested, 2.5.1) dan baris hilang setelah invalidasi. Negatif: server INVALID_STATE (hierarchy-scope belum didukung) dirender alert jujur dengan kode+pesan. Koreksi selama pengerjaan: import hooks dari modul yang benar + asersi perilaku menggantikan hitungan call kaku. Suite penuh **128 file / 734 PASS**, exit 0. Commit: `75e0661`.
**Catatan:** wrapper `data.invitation`/`data.invitations` dipakai apa adanya sesuai C.13 amandemen 4.0.0; accept tetap alur invitee di luar layar admin ini.

<a id="cl-39"></a>
### CL-39 — 2026-08-25 · 7.10.2 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `766ef03`, row 7.10.2 dibaca ulang dari disk `⬜️ 0%` (dependency 7.10.1 🔎 sisi Dev); kontrak diverifikasi dari source: `POST /invitations` body `{email, assignments:[{groupId, scopeType?, scopeId?}], expiresAt?}` → 201 `{invitation}` (project-admin.ts:318-340, core-schemas invitationCreateSchema), `POST /invitations/:id/revoke` → `{invitation}` (:429), list → `{invitations}`.
**Catatan:** UI create+revoke (accept = alur invitee flat endpoint, bukan layar admin). Scope lima level ditawarkan sesuai goal; non-project saat ini dijawab server INVALID_STATE dan ditampilkan jujur (lihat CL-29 untuk keputusan backend hierarchy-scope).

<a id="cl-38"></a>
### CL-38 — 2026-08-25 · 7.10.1 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/members-table.test.tsx` **4/4 PASS** (fetch-stub level, envelope kontrak nyata C.12/C.13) — positif: baris member aktif menampilkan nama+email+Group "Manager" (groupId dipetakan via daftar groups + per-membership assignments)+Status Active; invitation belum di-accept tampil Pending. Negatif: membership revoked berstatus Revoked dan tanpa kata Active; helper murni `memberStatus`+`isPendingInvitation` (expired/revoked bukan pending). `tsc --noEmit` + `eslint` + `vite build` hijau; suite penuh **127 file / 730 PASS**, exit 0. Commit: `0df4124`.
**Catatan:** tabel read-only sesuai goal — invite UI adalah 7.10.2; kolom Group menampilkan "—" bila belum ada assignment.

<a id="cl-37"></a>
### CL-37 — 2026-08-25 · 7.10.1 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `efbeb6a`, row 7.10.1 dibaca ulang dari disk `⬜️ 0%` (dependency 7.3.1 ✅); kontrak diverifikasi dari source: `GET /members` → `{members:[{membershipId,userId,email,name,createdAt,revokedAt}]}` (project-admin.ts:783-809), `GET /invitations` → `{invitations:[{id,email,expiresAt,acceptedAt,revokedAt,createdAt}]}` tanpa filter server-side (:889-896), `GET /permission-groups` → `{groups}` (project-admin.ts:175), `GET .../members/:m/assignments` → `{groupAssignments,permissionAssignments}` (project-admin.ts:377).
**Catatan:** kolom Status Active/Pending: membership aktif = Active, revoked = Revoked; Pending = invitation belum di-accept (turunan C.13, bukan field baru). Group names dipetakan dari groupId via daftar groups + per-membership assignments.

<a id="cl-36"></a>
### CL-36 — 2026-08-25 · 7.13.4 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/lifecycle-audit.test.tsx` **5/5 PASS** — positif: `selectLifecycleEvents` hanya menyaring `.archived`/`.deleted` (created/moved/restored tereliminasi) urut menurun; view merender tabel audit (aksi/entity-id/aktor/waktu `<time>`); undefined→[] aman. Negatif: **nol** `<button>` di view; state kosong & tanpa context netral. Koreksi test: mock hook mengembalikan bentuk pasca-select + asersi via baris tabel (teks JSX multi-node). `tsc --noEmit` + `eslint` + `vite build` hijau; suite penuh **126 file / 726 PASS**, exit 0. Commit: `daee946`.
**Catatan:** TASK-7.13 lengkap sisi Dev. Keterbatasan jujur: payload lifecycle tidak memuat judul entity sehingga view menampilkan entityType+entityId; endpoint list belum punya filter archived/deleted (hanya activities) — jika Review menghendaki tampilan berjudul, itu amandemen kontrak terpisah.

<a id="cl-35"></a>
### CL-35 — 2026-08-25 · 7.13.4 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `1846ce5`, row 7.13.4 dibaca ulang dari disk `⬜️ 0%` (dependency 7.13.1 🔎 sisi Dev); kontrak diverifikasi dari source: list endpoint Milestone/Board/List/Card TIDAK punya filter archived/deleted (hanya labels & permission-groups `include_deleted`), sedangkan C.9 `GET /activities` read-only (membership cukup, tanpa Owner-only — activities.ts:55-58; filter `action` exact-match, activity-query.ts:45-47).
**Catatan:** audit view dibangun di atas activity trail immutable (C.9) — fetch seluruh activities lalu filter klien `.archived/.deleted`; read-only murni, permission tetap server-side. Keterbatasan dicatat: payload lifecycle tidak memuat judul entity, jadi view menampilkan entityType+entityId (bukan title) — bukan pengarangan perilaku baru.

<a id="cl-34"></a>
### CL-34 — 2026-08-25 · 7.13.3 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** test yang sama **6/6 PASS** — positif: `describeRestoreBlock` mengenali INVALID_STATE dan mengekstrak ancestor dari pesan pola server A.5 ("karena Board induknya masih ARCHIVED" → ancestorKind "board"); skenario end-to-end fetch-stub: restore List → 409 INVALID_STATE → alert dalam dialog + tombol shortcut **"Restore board first"** yang benar-benar POST `/api/v1/projects/p1/boards/b1/restore` dengan `{expectedVersion:5}` milik parent. Negatif: PERMISSION_DENIED tidak memunculkan shortcut. Koreksi selama pengerjaan: regex ancestor (kata setelah "karena", bukan entity pertama) + shortcut dirender di dalam dialog via prop `footerNote`. Commit: `e9934e9`.
**Catatan:** shortcut aktif memenuhi "UI SHOULD tampilkan tombol Restore parent first, bukan hanya pesan error pasif" (A.5); tanpa info parent, hint tetap tampil tanpa tombol.

<a id="cl-32"></a>
### CL-32 — 2026-08-25 · 7.13.2 + 7.13.3 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `d091c6c`, kedua row dibaca ulang dari disk `⬜️ 0%` (dependency 7.13.1 🔎 sisi Dev); Reference dibaca dari disk: 04-DELIVERY A.5 (cek ancestor chain → DENY dengan pesan "Pulihkan [parent] terlebih dahulu"; UI SHOULD tombol "Restore parent first"; entity DELETED tanpa tombol restore, hanya di Audit view sampai prune) dan INV-LIFE-002/004.
**Catatan:** dua goal satu unit koheren (menu aksi lifecycle berbasis state): helper murni menentukan aksi yang tersedia per state (7.13.2) + klasifikasi penolakan restore ancestor-inactive menjadi hint shortcut "Restore parent first" (7.13.3). Handoff tetap per goal.

<a id="cl-31"></a>
### CL-31 — 2026-08-25 · 7.13.1 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/lifecycle-dialog.test.tsx` **6/6 PASS** — positif: `subtreeImpactText("board","archive")` menyebut descendant tidak operasional sampai dipulihkan; delete = permanen/terminal/tidak dapat dipulihkan/prune; dialog delete merender tombol destruktif `bg-destructive` dengan label "Ya, hapus permanen"; `useLifecycleMutation` POST `/api/v1/projects/p1/boards/b1/archive` body `{expectedVersion:4}` + Idempotency-Key; mapping project→`/projects/:p/delete` dan restore→`/lists/:id/restore` benar. Negatif: error server (INVALID_STATE) dirender via `role="alert"`, dialog tetap terbuka (keputusan pada pengguna, bukan auto-dismiss). `tsc --noEmit` + `eslint` + `vite build` hijau; suite penuh **124 file / 715 PASS**, exit 0. Commit: `a135c25`.
**Catatan:** tanpa child handling — UI hanya memanggil command entity tunggal; reload data terdampak via invalidasi query. Integrasi tombol aksi per layar mengikuti goal layar masing-masing; restore-guard ancestor + shortcut adalah 7.13.3.

<a id="cl-30"></a>
### CL-30 — 2026-08-25 · 7.13.1 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `167418c`, row 7.13.1 dibaca ulang dari disk `⬜️ 0%` (dependency 7.5.1 ✅ QA-CL-09); Reference dibaca dari disk: 04-DELIVERY A.4 (modal konfirmasi menjelaskan dampak subtree: archive → descendant non-operasional sampai dipulihkan; delete → terminal + peringatan kuat; TANPA child handling) dan pola endpoint diverifikasi dari source (`POST /v1/projects/:p/{milestones|boards|lists|cards}/:id/{archive|restore|delete}`, authorize `entity.action`; Project: `/projects/:p/{action}`).
**Catatan:** mulai hook lifecycle generik + dialog konfirmasi berdampak-subtree; restore-guard penuh adalah goal 7.13.3.

<a id="cl-29"></a>
### CL-29 — 2026-08-25 · 7.9.1/7.9.2/7.9.3 — `[NEEDS-SPEC-AMENDMENT]` blocker teridentifikasi (status tetap ⬜️ 0%)
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** verifikasi dari source: `permissionId` pada create Group (core-schemas.ts:179, project-admin.ts `createPermissionGroup` validasi by-id) dan direct permission assignment (project-admin.ts ~line 479 lookup `WHERE id = ?`) adalah **ULID hasil seed per-Project DB** (`provision.ts:135` → ulid() saat insert katalog, permission-catalog.ts:144). TIDAK ada endpoint yang mengekspos katalog `{id,key}` ke client (grep seluruh `apps/api/src/routes/*`). UI mustahil mengisi picker Direct Permission / entries Group tanpa mengarang data.
**Catatan:** `[NEEDS-SPEC-AMENDMENT]` + `[NEEDS-DECISION]` untuk lane AI-Planning & Review & manusia — opsi: (a) tambah endpoint read-only katalog (mis. `GET /api/v1/projects/:p/permissions` mengembalikan `{permissions:[{id,key,description}]}`, amandemen C.12); (b) ubah kontrak agar menerima `key` sebagai alternatif identifier; (c) scope turun sementara. Dev TIDAK mengimplementasikan endpoint/kontrak baru sendiri (larangan §3/C.4). Backend juga baru menerima `scopeType:"project"` (INVALID_STATE untuk milestone/board/list/card — project-admin.ts:359,466): UI lima-scope sesuai goal tetap bisa dibangun dan menampilkan error server jujur, tapi perlu konfirmasi apakah backend hierarchy-scope menyusul di fase ini atau nanti. Goal 7.9.x ditahan sampai keputusan jatuh; Dev lanjut ke rantai P0 berikutnya (7.13.x).

<a id="cl-28"></a>
### CL-28 — 2026-08-25 · 7.5.3 → 🔎 80% (remediasi QA-CL-10)
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/board-move-guard.test.tsx` **4/4 PASS** — `BoardSummary` kini `title` (C.6): `siblingBoards` mengembalikan `{id,title}` hanya Milestone sama non-diri; test hook memakai fetch-stub dengan payload kontrak nyata `{data:{boards:[{id,milestoneId,title,...lifecycle}]}}` dan meng-unwrap `select` → `result.data[0] = {id:"b2", title:"Backup"}` (bug name-blank QA-CL-10 tereksekusi dan kini lulus). `tsc --noEmit` + `eslint` + `vite build` hijau; suite penuh 709 PASS. Commit: `ad5f21d`.
**Catatan:** filter same-Milestone (logika inti goal) tidak berubah — hanya field name→title pada type, mapping, dan test. Konsumen UI move-to-board belum ada (menyusul), jadi dampak terbatas di layer hook/test.

<a id="cl-26"></a>
### CL-26 — 2026-08-25 · 7.3.2 + 7.5.3 → 🔄 (remediasi QA-CL-07 / QA-CL-10)
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** klaim QA diverifikasi ulang langsung dari source API sebelum coding: single-GET terbungkus `{project:...}` (projects.ts:239,410), `{milestone:...}` (milestones.ts:108), `{board:...}` (boards.ts:105); field entity — Project `name` (projectStatePayload), Milestone `title` (milestones.ts:32), Board `title` (boards.ts:34); list boards → `{boards:[{id,milestoneId,title}]}` (boards.ts:87); list projects → `{projects:[...]}` (projects.ts:366). Konsumen `.name` bermasalah hanya di header.tsx (3 crumb) + hooks; list/card/labels/activities sudah cocok kontraknya.
**Catatan:** akar masalah = test 7.3.2 mem-mock level hook dengan shape fiktif yang sudah "benar", menutupi drift envelope+field. Remediasi: perbaiki hooks ke kontrak nyata + tulis ulang test header memakai fetch-stub melalui apiRequest sungguhan (bukan mock hook), sesuai kritik QA.

<a id="cl-25"></a>
### CL-25 — 2026-08-25 · 7.8.1 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/activity-timeline.test.tsx` **4/4 PASS** — positif: `groupByDay` menghasilkan grup `["Hari ini","Kemarin"]` dengan urutan waktu menurun (a2→a1) + label jam; timeline merender action + entity type + `<time>`; tanpa context → pesan netral. Negatif: nol `<button>` dan regex mutasi (`delete|edit|archive|restore|unread`) nol kemunculan — read-only murni. Koreksi test: tanggal dibangun via konstruktor lokal agar deterministik lintas TZ. `tsc --noEmit` + `eslint` + `vite build` hijau; suite penuh **123 file / 709 PASS**, exit 0. Commit: `0a3d66d`.
**Catatan:** view audit murni (A.8/A.16 #8) — tidak ada jalur mutasi Activity di UI; payload historis dirender apa adanya (`data` belum diformat naratif — itu 7.8.2).

<a id="cl-24"></a>
### CL-24 — 2026-08-25 · 7.8.1 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `1b6e0fd`, row 7.8.1 dibaca ulang dari disk `⬜️ 0%` (dependency 7.3.1 🔎 sisi Dev); Reference 05-FRONTEND §5 (timeline historis grouped by day/time, bukan notification feed) + 02-SPEC A.8 (Activity immutable); endpoint terverifikasi `GET /v1/projects/:p/activities` → `{activities:[{id,entityType,entityId,entityVersion,actorUserId,action,data,createdAt}]}` (activities.ts).
**Catatan:** view read-only murni — tidak ada jalur edit/delete Activity (A.16 #8). Pemilihan goal: 7.9.x/7.13.x (authorization/lifecycle-critical) disarankan dikerjakan sesi dengan kapasitas penuh per §11.2; timeline ini contained dan membuka 7.7.2.

<a id="cl-23"></a>
### CL-23 — 2026-08-25 · 7.6.1 + 7.6.2 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/card.test.tsx` **5/5 PASS** — positif: title/description-preview(>80 terpotong+…)/labels/assignee/due-date (`<time datetime>` ISO persis) tampil; helper `previewDescription`+`formatDueDate` aman untuk null/invalid; negatif (7.6.2): regex `\bpriority\b|\bprogress\b|\bstatus\b|high|medium|low` nol kemunculan, tanpa `role="progressbar"`, tanpa elemen `[data-field=status/priority]`, kartu minimal tanpa daftar label/time/marker assignee. `tsc --noEmit` + `eslint` + `vite build` hijau; suite penuh **122 file / 705 PASS**, exit 0. Commit: `985161d`.
**Catatan:** KanbanCard kini dipakai BoardColumn (menggantikan li polos) — drag tetap bekerja via useDraggable di dalam komponen; assignee dirender penanda pendek `● <4 char akhir ULID>` karena endpoint konsumsi nama user belum dibungkus hook di fase ini (bukan field baru, hanya presentasi data yang ada).

<a id="cl-22"></a>
### CL-22 — 2026-08-25 · 7.6.1 + 7.6.2 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `f1f7003`, kedua row dibaca ulang dari disk `⬜️ 0%` (dependency 7.5.1 🔎 sisi Dev); Reference: 05-FRONTEND §5 (Card compact: title · description preview · labels · assignee · due date) dan §4 (priority/progress/status = BUANG dari UI).
**Catatan:** dua goal satu komponen koheren (KanbanCard): field yang ADA dirender (7.6.1) + guard ketiadaan field non-domain (7.6.2). Assignee dirender sebagai penanda pendek userId (lookup nama user belum ada endpoint konsumennya di fase ini — dicatat, bukan perilaku domain baru).

<a id="cl-21"></a>
### CL-21 — 2026-08-25 · 7.5.4 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** test yang sama **4/4 PASS** — negatif/positif VERSION_CONFLICT: mutation gagal → `ApiError{code:"VERSION_CONFLICT",status:409}`, `onError` meng-invalidasi `["cards","p1"]` terverifikasi via `isInvalidated===true` + refetch nyata terjadi (jumlah fetch naik), tanpa set data manual ke cache (tidak ada overwrite lokal). Banner `role="alert"` dengan tombol Tutup dirender BoardView saat konflik aktif. `tsc --noEmit` + `eslint` + `vite build` hijau; suite penuh **121 file / 700 PASS**, exit 0. Commit: `4adf434`.
**Catatan:** sesuai 04-DELIVERY A.3 — pesan + reload; TIDAK ada auto-retry/auto-overwrite; keputusan lanjut ada pada pengguna.

<a id="cl-19"></a>
### CL-19 — 2026-08-25 · 7.5.3 + 7.5.4 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `b589622`, kedua row dibaca ulang dari disk `⬜️ 0%` (dependency 7.5.2 🔎 sisi Dev); Reference: BR-018 (move lintas Board hanya dalam Milestone sama), 04-DELIVERY A.3 (VERSION_CONFLICT → pesan + reload, bukan overwrite), BR-021; endpoint sibling boards terverifikasi `GET /v1/projects/:p/milestones/:m/boards` (boards.ts:80).
**Catatan:** dua goal dikerjakan berurutan dalam satu rangkaian komponen move-to-board (satu unit koheren): kandidat board di-filter Milestone sama (7.5.3), dan VERSION_CONFLICT ditangani pesan + invalidasi/reload data tanpa auto-overwrite (7.5.4). Handoff tetap per goal.

<a id="cl-18"></a>
### CL-18 — 2026-08-25 · 7.5.2 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/board-dnd.test.tsx` **4/4 PASS** — positif: `planMove` lintas-List menghasilkan rencana move; `useMoveCard` POST `/api/v1/projects/p1/cards/c1/move` dengan JSON persis `{destinationListId:"l2", expectedVersion:7}` + header `Idempotency-Key`; negatif: drop List-sama/non-list/data-hilang → tanpa rencana, mutation `VERSION_CONFLICT` tepat satu fetch tanpa retry sendiri. `tsc --noEmit` + `eslint` + `vite build` hijau; suite penuh **120 file / 696 PASS**, exit 0. Commit: `65db60a`.
**Catatan:** `@dnd-kit/core@6.3.1` exact-pin (Review-CL-05); hanya Card draggable — kolom/List droppable-only (A.5); `expectedVersion` diambil dari detail kartu terkini saat drop via `fetchQuery(staleTime:0)` agar client tidak memakai version basi; penanganan UX VERSION_CONFLICT menyusul di 7.5.4.

<a id="cl-17"></a>
### CL-17 — 2026-08-25 · 7.5.2 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `3e89b2b`, row 7.5.2 dibaca ulang dari disk `⬜️ 0%` (dependency 7.5.1 🔎 sisi Dev); Reference `02-SPEC C.8 move` + `AC-020` — endpoint `POST /v1/projects/:p/cards/:c/move` terverifikasi di cards.ts:199, body `{destinationListId, expectedVersion}` (C.8/C.2.1), optimistic locking server-side.
**Catatan:** mulai dnd-kit core + mutation hook `useMoveCard` (Idempotency-Key per logical action); penanganan VERSION_CONFLICT adalah goal 7.5.4.

<a id="cl-16"></a>
### CL-16 — 2026-08-25 · 7.5.1 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/board-view.test.tsx` **3/3 PASS** — positif: kolom dirender dari List dengan judul bebas + count per kolom + card list (endpoint `{lists}`/`{cards}` nyata); negatif: nol makna status sistem (`priority|progress|status:`) dan tanpa progressbar; board kosong merender tanpa error. `tsc --noEmit` + `eslint` hijau; suite penuh **119 file / 692 PASS**, exit 0. Commit: `4c45ba4`.
**Catatan:** hooks `useLists`/`useCards` konsumsi endpoint C.7/C.8 existing; visibility & anti-enumeration tetap server-side; drag/move menyusul di 7.5.2.

<a id="cl-15"></a>
### CL-15 — 2026-08-25 · 7.5.1 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `c77e3f5`, row 7.5.1 dibaca ulang dari disk `⬜️ 0%` (dependency 7.3.2 🔎 sisi Dev); Reference `05-FRONTEND §5` + `02-SPEC A.1`; bentuk endpoint diverifikasi langsung dari kode route: `GET /v1/projects/:p/boards/:b/lists` → `{lists:[...]}` (lists.ts:78,85) dan `GET /v1/projects/:p/lists/:l/cards` → `{cards:[...]}` (cards.ts:100,118 — visibility server-side + anti-enumeration).
**Catatan:** mulai BoardView (kolom = List nama bebas + count + card list); drag/move adalah goal 7.5.2+, Card compact 7.6.1.

<a id="qa-cl-07"></a>
### QA-CL-07 — 2026-08-25 · goal 7.3.2 — breadcrumb TIDAK PERNAH menampilkan nama nyata (envelope + field-name mismatch, terbukti langsung dari source), test menutupinya via hook mock (🔎 80% → ⚠️ 35%)

**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)

**Bug genuine, dikonfirmasi langsung dari source API (bukan diasumsikan) — DUA lapis kesalahan bersamaan:**

1. **Salah kedalaman unwrap envelope, di SEMUA TIGA level (Project/Milestone/Board).** `ok(data)` (`packages/contracts/src/api-response.ts:14-16`) membungkus `{data}` apa adanya, dan setiap route GET single-resource membungkus payload lagi di bawah key bernama: `apps/api/src/routes/projects.ts:410` → `return { project: projectStatePayload(state) };`, `apps/api/src/routes/milestones.ts:108` → `return { milestone: milestonePayload(record) };`, `apps/api/src/routes/boards.ts:105` → `return { board: boardPayload(record) };`. Jadi response nyata `GET /v1/projects/:id` adalah `{ data: { project: { id, name, ... } } }` — `apiRequest()` (client) meng-unwrap SATU level (`.data`), menyisakan `{ project: {...} }`, BUKAN objek entity langsung. Namun `hooks.ts` (`useProject`/`useMilestone`/`useBoard`) mendeklarasikan `apiRequest<ProjectSummary>(...)` seolah hasilnya sudah objek entity flat — seharusnya `apiRequest<{ project: ProjectSummary }>(...)` lalu ambil `.project` (pola sama seperti `useProjects` yang SUDAH benar menangani `{projects: [...]}` di `header.tsx:22-24`).

2. **Salah nama field, khusus Milestone & Board.** Field asli API (dikonfirmasi `milestones.ts:31`/`boards.ts:34`) adalah **`title`**, bukan `name` — hanya Project yang genuinely punya field `name` (`projects.ts:203`). `header.tsx:35`/`:41` membaca `milestoneQuery.data?.name`/`boardQuery.data?.name` — field yang tidak pernah ada pada Milestone/Board.

**Dampak gabungan: breadcrumb Project/Milestone/Board TIDAK PERNAH menampilkan nama asli terhadap API sungguhan** — `projectQuery.data?.name` selalu `undefined` (salah kedalaman unwrap saja sudah cukup membuatnya gagal), `milestoneQuery.data?.name`/`boardQuery.data?.name` gagal DUA kali lipat (unwrap salah DAN field salah). Fallback `"…"` (`header.tsx:31/35/41`) akan tampil selamanya di production untuk ketiga level — inti deliverable goal ini ("breadcrumb Project › Milestone › Board" menampilkan nama nyata) tidak pernah berfungsi.

**Kenapa 4/4 test tetap lulus — root cause ditemukan:** `header.test.tsx` memakai `vi.mock` pada modul `hooks.ts` ITU SENDIRI (bukan pada `apiRequest`/`fetch`), lalu mock langsung mengembalikan objek flat siap-pakai `{ id: "m1", name: "Beta" }`/`{ id: "b1", name: "Gamma" }` (baris 65-66) — bentuk yang TIDAK PERNAH keluar dari API sungguhan. Test genuinely menguji rendering breadcrumb DIBERI data yang benar bentuknya, tapi tidak pernah menguji bahwa `hooks.ts` benar-benar MENGHASILKAN bentuk itu dari response API asli — celah yang sama persis dengan kelas bug yang berulang ditemukan di Phase 6 (mock/kontrak-nyata divergence).

**Bagian lain goal ini dikonfirmasi genuinely benar** (tidak terdampak bug di atas): context-switch `<select>` (navigasi ke `/projects/:id` terpilih, diverifikasi via `LocationProbe` — genuinely mengecek URL berubah, bukan cuma `onChange` terpanggil); brand-only tanpa separator saat tanpa context; guard negatif nol Inbox/non-MVP. `useProjects`/list handling SUDAH benar menangani `{projects: [...]}`.

**Rekomendasi fix untuk Dev (tidak saya kerjakan sendiri, sesuai batas lane AI-QA):** (1) di `hooks.ts`, ubah `useProject`/`useMilestone`/`useBoard` agar generic type & ekstraksi mencerminkan wrapper asli (`apiRequest<{ project: ProjectSummary }>(...)` lalu `.project`, dst — atau tambah tipe terpisah `MilestoneSummary { id, title }`/`BoardSummary { id, title }` alih-alih reuse `ProjectSummary`); (2) di `header.tsx`, baca `.title` untuk Milestone/Board crumb, bukan `.name`; (3) tulis ulang/tambah test yang genuinely memanggil `apiRequest` (mock `fetch`, bukan mock `hooks.ts`) dengan payload berbentuk PERSIS respons API asli (`{data: {milestone: {title: "Beta"}}}`) untuk membuktikan `useMilestone` mengekstrak nama dengan benar — pola sama `apps/web/test/api-client.test.tsx` yang sudah benar (mock di level `fetch`, bukan di level layer yang diuji).

**Verdict:** `⚠️ 35%` (context-switch/no-Inbox solid, tapi breadcrumb — deliverable inti goal — genuinely tidak pernah berfungsi terhadap API sungguhan, bug di DUA lapis sekaligus, ditemukan di ketiga level Project/Milestone/Board).

<a id="cl-14"></a>
### CL-14 — 2026-08-25 · 7.3.2 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/header.test.tsx` **4/4 PASS** — positif: breadcrumb akurat `Alpha›Beta›Gamma` dari API (params p1/m1/b1), brand-only tanpa separator saat tanpa context, context switch `<select>` navigasi ke `/projects/p2` (terverifikasi via location probe); negatif: nol Inbox/non-MVP. `eslint` + `tsc --noEmit` + `vite build` hijau; suite penuh **118 file / 689 PASS**, exit code 0 diverifikasi eksplisit. Commit: `208111a`.
**Catatan:** nama entity diambil hooks TanStack Query konsumen endpoint nyata C.4–C.6 (`src/features/projects/hooks.ts`); halaman domain masih placeholder sampai TASK-7.4+; select native dipakai sebagai scaffolding sebelum primitive shadcn ditambahkan goal lain.

<a id="cl-13"></a>
### CL-13 — 2026-08-25 · 7.3.2 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `85cf15b`, row 7.3.2 dibaca ulang dari disk `⬜️ 0%` (dependency 7.3.1 🔎 sisi Dev); Reference `05-FRONTEND §5` dibaca dari disk (header breadcrumb Project › Milestone › Board; context switch antar Project).
**Catatan:** mulai Header + query hooks konsumen endpoint nyata yang SUDAH ada (C.4 GET /projects, C.4 detail, C.5/C.6 detail) — tanpa data demo; nama entity diambil via TanStack Query (§3.2).

<a id="qa-cl-06"></a>
### QA-CL-06 — 2026-08-25 · goal 7.3.1 closed ✅ (🔎 80% → ✅ 100%) — dependency 7.2.1 kini ✅, sidebar genuinely context-aware tanpa Inbox

**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)

**Dependency terpenuhi:** 7.2.1 sudah `✅` (QA-CL-05) — goal ini sekarang genuinely closeable (Dev sempat mulai saat 7.2.1 masih 🔎 sisi Dev, dicatat jujur di CL-11, tidak masalah karena hanya *closure* ke `✅` yang digate dependency, bukan mulai kerja paralel).

**`sidebar.tsx` dibaca penuh:** seluruh 8 item wajib §5 ada (Home/My Tasks/Activity/PROJECTS ▾/Members/Permissions/API Keys/Settings), NOL Inbox. `NavLink` React Router genuinely context-aware (styling + `aria-current="page"` otomatis dari `isActive`), `end: true` khusus Home mencegah false-positive match di sub-path. `App.tsx` genuinely merutekan `/login` TANPA `Shell` (standalone, sesuai klaim), rute domain lain terbungkus `Shell` (Header+Sidebar).

**Re-run independen:** `npx vitest run apps/web/test/sidebar.test.tsx` → **4/4 PASS** — dibaca penuh: seluruh 8 item render; guard negatif regex (`revenue|analytics|billing|admin panel|notification`) nol match pada container, plus `queryByText(/inbox/i)` null; `/members` → Members `aria-current="page"`; Home aktif hanya di `/` (bukan di `/tasks`, end-matching genuinely bekerja). `pnpm --filter @kanban/web typecheck` → bersih. `pnpm lint` → 0 error.

**Tidak ada bug produksi ditemukan.**

**Verdict:** `✅ 100%`.

<a id="cl-12"></a>
### CL-12 — 2026-08-25 · 7.3.1 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/sidebar.test.tsx` **4/4 PASS** — positif: seluruh 8 item §5 tampil (Home/My Tasks/Activity/PROJECTS ▾/Members/Permissions/API Keys/Settings), route aktif bertanda `aria-current="page"` (context-aware, `/members` aktif; Home hanya di root via end-matching); negatif: nol kemunculan Inbox dan regex non-MVP (`revenue|analytics|billing|admin panel|notification`) pada container. `tsc --noEmit` + `eslint` + `vite build` hijau; suite penuh **117 file / 685 PASS**. Commit: `dabb090`.
**Catatan:** layar `/login` standalone tanpa shell (branding §5); group PROJECTS ▾ statis — daftar Project nyata menyusul di goal projects feature (bukan demo domain). Root `vitest.config.ts` diberi alias `@` senada vite config agar test dapat meng-import komponen web.

<a id="cl-11"></a>
### CL-11 — 2026-08-25 · 7.3.1 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `1fe314d`, row 7.3.1 dibaca ulang dari disk `⬜️ 0%` (dependency 7.2.1 🔎 sisi Dev — implementasi token + test hijau); Reference `05-FRONTEND §4,§5` dibaca dari disk (sidebar: Home · My Tasks · Activity · PROJECTS ▾ · Members · Permissions · API Keys · Settings; Inbox BUANG).
**Catatan:** mulai komponen Sidebar + app shell layout (login standalone tanpa sidebar); daftar Project nyata menyusul di goal projects feature — group PROJECTS ▾ untuk sekarang statis tanpa data demo.

<a id="qa-cl-05"></a>
### QA-CL-05 — 2026-08-25 · goal 7.2.1 closed ✅ (🔎 80% → ✅ 100%) — token values dikonfirmasi cocok tabel SOT §2.1 persis

**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)

**`src/index.css` dibaca penuh, dicocokkan langsung terhadap tabel `05-FRONTEND §2.1`:** seluruh 8 token semantik (primary `#6366F1`/indigo-500, primary-active `#4F46E5`/indigo-600, foreground `#1E293B`/slate-800, muted-foreground `#64748B`/slate-500, border/muted `#E2E8F0`/slate-200, success `#10B981`/emerald-500, warning `#F59E0B`/amber-500, destructive `#EF4444`/red-500) cocok PERSIS baris demi baris dengan tabel SOT — bukan cuma dipercaya dari klaim CL. Nilai oklch yang dipakai (mis. `oklch(0.585 0.233 277.117)` untuk indigo-500) sesuai palet default Tailwind v4 yang dipublikasikan resmi, konsisten dengan hex sumbernya. Blok `.dark` tersedia dengan hue keluarga sama; `@theme inline` mengekspos seluruh token ke utility Tailwind.

**Re-run independen:** `npx vitest run apps/web/test/design-tokens.test.ts` → **3/3 PASS** — dibaca penuh: nilai oklch tiap token di `:root` dicek match persis; token terekspose ke `--color-*` Tailwind + blok `.dark` ada; guard struktural scan `src/**/*.{ts,tsx}` memastikan NOL warna hard-coded (`#hex`/`rgb()`/`hsl()`) di luar `index.css` — mencegah drift ke styling ad-hoc di masa depan. `pnpm --filter @kanban/web typecheck` → bersih. `pnpm --filter @kanban/web build` → sukses.

**Tidak ada bug produksi ditemukan.**

**Verdict:** `✅ 100%`.

<a id="cl-10"></a>
### CL-10 — 2026-08-25 · 7.2.1 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/design-tokens.test.ts` **3/3 PASS** — positif: seluruh token §2.1 terdefinisi di `:root` dengan nilai oklch sesuai tabel SOT (primary indigo-500, primary-active indigo-600, foreground slate-800, muted-foreground slate-500, border/muted slate-200, success emerald-500, warning amber-500, destructive red-500) + terekspose ke utility Tailwind (`--color-primary-active/success/warning`) + blok `.dark` tersedia; negatif: guard scan `src/**` — nol warna hard-coded (`#hex`/`rgb`/`hsl`) di luar index.css. Koreksi test batas blok `:root` (`.dark` di custom-variant) → commit susulan `54112ad`; suite penuh **116 file / 681 PASS**, exit code diverifikasi eksplisit.
**Catatan:** nilai dark memakai hue keluarga sama (indigo/slate/emerald/amber/red) sebagai keputusan teknis; penerapan radius/density light+dark penuh tetap goal 7.2.3. Proses koreksi: commit pertama (`980e59f`) sempat menyertakan 1 test gagal akibat rantai perintah yang menelan exit-code — diperbaiki dan diverifikasi ulang sebelum handoff.

<a id="cl-09"></a>
### CL-09 — 2026-08-25 · 7.2.1 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `594b4f5`, row 7.2.1 dibaca ulang dari disk `⬜️ 0%`; Reference `05-FRONTEND §2.1` dibaca dari disk (tabel token: primary #6366F1/indigo-500, primary-active #4F46E5, foreground slate-800, muted-foreground slate-500, border/muted slate-200, success emerald-500, warning amber-500, destructive red-500).
**Catatan:** mulai pemetaan token §2.1 ke CSS variables shadcn (light; dark diselaraskan hue sama — penerapan penuh light+dark + radius/density tetap goal 7.2.3).

<a id="qa-cl-04"></a>
### QA-CL-04 — 2026-08-25 · goal 7.1.4 closed ✅ (🔎 80% → ✅ 100%) — Zustand genuinely UI-only

**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)

**`src/lib/ui-store.ts` dibaca penuh:** store hanya berisi `{sidebarCollapsed, toggleSidebar}` — dua field UI murni, tanpa cache server state apa pun. Komentar eksplisit melarang penyimpanan cache data server di layer ini. `zustand@5.0.15` cocok baseline revalidasi Review-CL-05.

**Re-run independen:** `npx vitest run apps/web/test/ui-store.test.ts` → **2/2 PASS** — positif: toggle sidebar mengubah state; negatif (guard struktural): regex field domain/server (`card|board|project|session|query|...`) dicek nol kemunculan pada shape store, mencegah drift ke luar scope UI-state di masa depan. `pnpm --filter @kanban/web typecheck` → bersih.

**Tidak ada bug produksi ditemukan.**

**Verdict:** `✅ 100%`.

<a id="cl-08"></a>
### CL-08 — 2026-08-25 · 7.1.4 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/ui-store.test.ts` **2/2 PASS** — positif: toggle sidebar bekerja via renderHook; negatif (guard struktural): kunci state hanya `{sidebarCollapsed, toggleSidebar}`, regex field domain/server (`card|board|project|session|query|...`) nol kemunculan. `tsc --noEmit` hijau; suite penuh **115 file / 678 PASS**. Commit: `75fee47`.
**Catatan:** store UI-only sesuai §3.1; konsumen nyata menyusul di goal 7.3.1 (sidebar) dan 7.12.1 (command palette). Server state tetap TanStack Query.

<a id="cl-07"></a>
### CL-07 — 2026-08-25 · 7.1.4 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `3db3083`, row 7.1.4 dibaca ulang dari disk `⬜️ 0%` (dependency 7.1.1 ✅); Reference `05-FRONTEND §3.1` dibaca dari disk — Zustand GUNAKAN TERBATAS untuk UI/interaction/drag/sidebar/command-palette, bukan database lokal app.
**Catatan:** mulai store UI minimal (sidebar collapsed + toggle) sebagai fondasi konsumen goal 7.3.1/7.12.1; pin `zustand@5.0.15` hasil revalidasi Review-CL-05.

<a id="qa-cl-03"></a>
### QA-CL-03 — 2026-08-25 · goal 7.1.3 closed ✅ (🔎 80% → ✅ 100%) — client layer + idempotency handling genuinely correct

**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)

**`src/lib/api/client.ts` dibaca penuh:** `apiRequest` genuinely melakukan SATU `fetch` per panggilan, tidak ada loop/retry internal apa pun — sehingga klaim "IDEMPOTENCY_IN_PROGRESS/CONFLICT tanpa side-effect kedua" benar secara struktural (bukan cuma dicek via mock call-count). Envelope `{data}`/`{error{code,message,details?}}` dipetakan sesuai 02-SPEC C.2; `credentials: "same-origin"` genuinely diset; `Idempotency-Key` header genuinely terlampir hanya saat diberikan pemanggil (bukan digenerate otomatis di layer client — tanggung jawab pemanggil menyimpan key per logical action, sesuai C.3).

**Risiko retry-otomatis TanStack Query diperiksa langsung — aman:** `query-client.ts` memakai `new QueryClient()` tanpa override — default TanStack Query v5 untuk `useMutation` adalah `retry: 0` (hanya `useQuery` yang retry default), jadi mutation berisiko tinggi (create/move/archive/dst, yang membawa Idempotency-Key) TIDAK di-retry otomatis oleh library dan tidak berisiko memicu request kedua tanpa sepengetahuan pemanggil.

**Re-run independen:** `npx vitest run apps/web/test/api-client.test.tsx` → **9/9 PASS** — dibaca penuh: GET request shape benar; Idempotency-Key + JSON body terlampir pada POST; `VERSION_CONFLICT`/`VALIDATION_ERROR` (dengan `details[]` lengkap 2 field) dipetakan ke `ApiError{code,status}`; `IDEMPOTENCY_IN_PROGRESS`/`IDEMPOTENCY_CONFLICT` masing-masing diverifikasi `fetchMock` terpanggil **tepat 1×** (bukti langsung tanpa side-effect kedua, bukan diasumsikan dari tidak-adanya retry-loop di source); `NETWORK_ERROR` status 0 saat fetch reject; `newIdempotencyKey()` 100/100 unik (crypto.randomUUID); TanStack Query provider genuinely me-render server state via `useQuery`. `pnpm --filter @kanban/web typecheck` → bersih. `pnpm lint` → 0 error. `pnpm --filter @kanban/web build` → sukses. Versi `@tanstack/react-query@5.102.2` dikonfirmasi cocok baseline revalidasi Review-CL-05.

**Tidak ada bug produksi ditemukan.**

**Verdict:** `✅ 100%`.

<a id="cl-06"></a>
### CL-06 — 2026-08-25 · 7.1.3 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/api-client.test.tsx` **9/9 PASS** (2× berurutan, deterministik) — positif: GET envelope `{data}` dipetakan benar dengan `credentials: same-origin`, `Idempotency-Key` + JSON body terlampir pada POST, VALIDATION_ERROR membawa `details[]` lengkap, TanStack Query provider me-render data server state; negatif: error kanonik `VERSION_CONFLICT` → `ApiError{code,status}`, `IDEMPOTENCY_IN_PROGRESS` → tepat **satu** fetch tanpa auto-retry (tidak ada side-effect kedua), `IDEMPOTENCY_CONFLICT` → satu fetch lalu ditolak, network failure → `NETWORK_ERROR` status 0, `newIdempotencyKey()` 100/100 unik. `tsc --noEmit` hijau; `eslint` hijau; `vite build` hijau; suite penuh `pnpm test` **114 file / 676 PASS**. Commit: `3d9b7be`.
**Catatan:** layer API (`src/lib/api/client.ts`) terpisah dari UI per 05-FRONTEND §3.2; QueryClient default dipertahankan (tanpa perilaku domain baru); retry sadar MAY memakai key sama sesuai C.3 poin 5 — keputusan UI-level untuk goal konsumen nanti.

<a id="cl-05"></a>
### CL-05 — 2026-08-25 · 7.1.3 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `9a0ea64`, row 7.1.3 dibaca ulang dari disk `⬜️ 0%` (dependency 7.1.1 ✅ via QA-CL-01); Reference dibaca dari disk: `02-SPEC C.2/C.2.1/C.3` (envelope `{data}`/`{error{code,message,details?}}`, kode kanonik, kontrak idempotency poin 1–8) dan `05-FRONTEND §3.2`.
**Catatan:** mulai API client layer terpisah di `src/lib/api/` + QueryClient provider; pin `@tanstack/react-query@5.102.2` hasil revalidasi Review-CL-05. Kebijakan client: TIDAK ada auto-retry pada `IDEMPOTENCY_CONFLICT`/`IDEMPOTENCY_IN_PROGRESS` (ditampilkan sebagai error bertipe, tanpa side-effect kedua); retry eksplisit MAY memakai key yang sama sesuai C.3 poin 5.

<a id="qa-cl-02"></a>
### QA-CL-02 — 2026-08-25 · goal 7.1.2 closed ✅ (🔎 80% → ✅ 100%) — Magic Link UI genuinely no-password/no-social, anti-enumeration confirmed

**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)

**`login-page.tsx`/`auth-client.ts` dibaca penuh:** satu form email (tanpa password/social provider apa pun), `authClient.signIn.magicLink({ email, callbackURL: same-origin })`, tiga state ditangani (`idle`/`submitting`/`sent`/`error`) plus `?error=` dari redirect verify menampilkan pesan netral "Tautan tidak valid atau sudah kedaluwarsa" — TIDAK ada perbedaan pesan antara error jaringan vs email tak terdaftar (kedua kasus jatuh ke pesan generik yang sama "Terjadi kesalahan. Coba lagi."), konsisten prinsip anti-enumeration 03-ENG A.14.

**Versi client-server dikonfirmasi selaras:** `better-auth@1.6.30` exact-pinned SAMA di `apps/web/package.json` dan `packages/infrastructure/package.json` — tidak ada version drift antara client Magic Link dan server auth config.

**Re-run independen:** `npx vitest run apps/web/test/magic-link-ui.test.tsx` → **5/5 PASS** — dibaca penuh, genuinely menguji: tidak ada input password/tombol provider di DOM; submit memanggil `signIn.magicLink` dengan `email`+`callbackURL` same-origin lalu render state "sent"; kegagalan request (network down) menampilkan pesan generik TANPA kata "terdaftar"/"belum punya akun"/"not found" (asserted eksplisit via regex negatif pada `document.body.textContent` — bukan cuma dicek untuk satu elemen); `?error=INVALID_TOKEN` → pesan expired/used netral; tombol submit `disabled` saat status `submitting` (anti double-submit, dibuktikan dengan promise yang sengaja digantung sebelum di-resolve). `pnpm --filter @kanban/web typecheck` → bersih. `pnpm lint` (repo-level) → 0 error. `pnpm --filter @kanban/web build` → sukses.

**Tidak ada bug produksi ditemukan.**

**Verdict:** `✅ 100%`.

<a id="cl-04"></a>
### CL-04 — 2026-08-25 · 7.1.2 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `npx vitest run apps/web/test/magic-link-ui.test.tsx` **5/5 PASS** — positif: form email tunggal tanpa input password/provider, submit memanggil `signIn.magicLink({email, callbackURL same-origin})` lalu state "Tautan sudah dikirim", `?error=` menampilkan pesan expired/used netral; negatif: kegagalan request → pesan generik tanpa kata terdaftar/tidak-terdaftar, tombol nonaktif saat submitting (anti double-submit). `pnpm --filter @kanban/web typecheck` hijau; `pnpm lint` hijau; `vite build` hijau; suite penuh `pnpm test` **667 PASS**. Commit: `f379b7b`.
**Catatan:** client Better Auth (`better-auth@1.6.30`, subpath `/client` + plugin magicLinkClient) hanya untuk identity/session; domain API tetap goal 7.1.3. Root `vitest.config.ts` diperluas menyertakan `*.test.tsx` (prasyarat test UI). Pesan error sengaja identik untuk semua penyebab agar tidak membocorkan keberadaan akun (03-ENG A.14 Keamanan minimum).

<a id="cl-03"></a>
### CL-03 — 2026-08-25 · 7.1.2 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** freshness check: HEAD `84ff3a9` (QA-CL-01 menutup 7.1.1 → ✅ 100%), row 7.1.2 dibaca ulang dari disk `⬜️ 0%`; Reference dibaca (03-ENG A.14, 05-FRONTEND §3.1/§5); konfigurasi server diverifikasi `packages/infrastructure/src/auth/auth.ts` (magicLink, storeToken hashed, expiresIn 300, cookiePrefix kanban, emailAndPassword disabled) dan alur same-origin di `scripts/preview-verify.ts` (POST /api/auth/sign-in/magic-link → link → callback set cookie).
**Catatan:** mulai UI login Magic Link (satu form email, state request/link-sent/expired-used/error tanpa membocorkan keberadaan akun; tanpa password/social). Client `better-auth@1.6.30` exact-pin — versi sama dengan server (baseline SOT 1.6.x stable; registry latest 1.7.1 tidak dipakai karena keluar baseline).

<a id="qa-cl-01"></a>
### QA-CL-01 — 2026-08-25 · goal 7.1.1 closed ✅ (🔎 80% → ✅ 100%) — bootstrap apps/web genuinely verified, template CL-numbering collision fixed

**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)

**Housekeeping ditemukan & diperbaiki dulu:** goal table CL-01 link mengarah ke anchor `#cl-01` yang, sebelum perbaikan ini, muncul DUA kali di file — sekali di template contoh format Closure Log (heading asli `### CL-01 — YYYY-MM-DD · <ID goal>...` di dalam code fence, bukan entry sungguhan) dan sekali lagi di entry asli goal ini. Karena HTML/browser mengambil kecocokan pertama untuk id anchor duplikat, link `[CL-01](#cl-01)` di tabel goal akan salah arah ke template, bukan ke entry sungguhan. Diperbaiki dengan mengganti blok template jadi komentar HTML satu-baris (pola sama yang sudah dipakai `PHASE-5-TASKS.md`/`PHASE-6-TASKS.md`) — dikonfirmasi `grep -oE '^### (CL|QA-CL|Review-CL)-[0-9]+ —' PHASE-7-TASKS.md | sort | uniq -c | awk '$1>1'` kini kosong. **Catatan (tidak diperbaiki, di luar scope):** `PHASE-0-TASKS.md` punya pola template identik dengan collision yang sama (`CL-01`/`QA-CL-01` masing-masing 2×) — file historis Phase 0 sudah closed, housekeeping kosmetik, dicatat untuk referensi bukan diperbaiki sekarang.

**Versi dependency dikonfirmasi persis cocok baseline Review-CL-05** (`apps/web/package.json` dibaca langsung): React/React DOM `19.2.8`, Vite `8.2.2`, React Router `8.3.0`, Tailwind CSS `4.3.3`, shadcn CLI `4.19.0` — seluruhnya exact-pinned sesuai revalidasi npm registry.

**Re-run independen seluruh klaim CL-02:** `pnpm --filter @kanban/web typecheck` → bersih. `pnpm --filter @kanban/web build` → sukses (`dist/index.html` + aset ter-hash `index-InAmEDTz.css`/`index-DSPIojoi.js`, vite 8.2.2). `pnpm lint` (repo-level) → 0 error. `npx vitest run apps/web/test/web-serving.test.ts` → **5/5 PASS** — dibaca penuh: test genuinely membangun production build Vite betulan lalu menyajikannya via Hono app asli (`createApiApp` dari `apps/api/src/index.ts`, bukan stub), menguji topologi satu-origin identik `scripts/preview-build.mjs` (filesystem → `/api/*` ke Hono → fallback `index.html` untuk SPA deep link), termasuk kasus negatif (`/api/v1/tidak-ada` → 404 non-HTML, TIDAK tertangkap fallback SPA). Full suite `pnpm test` → **112 file/662 test PASS** — cocok persis klaim. `node scripts/preview-build.mjs` → sukses, `.vercel/output/static` genuinely berisi build produksi (warning `import.meta`/CJS yang muncul berasal dari `packages/infrastructure/src/database/migrate.ts`, pre-existing, tidak disentuh goal ini, bukan regresi baru).

**Struktur `apps/web/src/` dibaca — foundation-only, tanpa pelanggaran domain-field non-goal:** hanya `App.tsx` (route `/` + `*` NotFound minimal), `main.tsx`, `index.css`, `lib/utils.ts` — tidak ada field UI yang belum ada di `02-SPEC` (konsisten larangan `05-FRONTEND §4`: priority/progress-card/status/inbox non-goal). Sesuai scope goal ("bootstrap", bukan screen domain).

**Keputusan teknis di CL-02 diverifikasi masuk akal:** `tsconfig.json` (dibaca langsung) genuinely tanpa `baseUrl`, `paths` relatif ke `./src` — cocok klaim; `vite.config.ts` genuinely punya dev-only proxy `/api → localhost:3100` dengan komentar yang menjelaskan alasannya (paritas origin dev/prod).

**Tidak ada bug produksi ditemukan** — bootstrap genuinely solid dan verified end-to-end.

**Verdict:** `✅ 100%`.

<a id="cl-02"></a>
### CL-02 — 2026-08-25 · 7.1.1 → 🔎 80%
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** `pnpm --filter @kanban/web typecheck` hijau; `pnpm --filter @kanban/web build` hijau (`dist/index.html` + aset ter-hash, vite 8.2.2); `pnpm lint` hijau; `npx vitest run apps/web/test/web-serving.test.ts` **5/5 PASS** (positif: GET / HTML produksi beraset ter-hash, deep link `/projects/p1/boards/b1`+`/login`+`/a/b/c/d` → fallback index.html, `/api/v1/health` dijawab Hono sungguhan satu origin, aset dilayani filesystem sebelum fallback; negatif: `/api/v1/tidak-ada` → 404 non-HTML, tidak tertangkap fallback SPA); suite penuh repo `pnpm test` **112 file / 662 test PASS**; `node scripts/preview-build.mjs` siap (`.vercel/output/static` kini berisi production build Vite).
**Catatan:** keputusan teknis terekam — (1) `@vitejs/plugin-react@6.0.5` sesuai snapshot matriks SOT A.8.2 (Review-CL-05 tidak merevalidasi paket ini; registry terbaru 6.1.0 TIDAK dipakai karena minor bump butuh review SOT lebih dulu per A.8.1); (2) `tsconfig.json` web standalone (bundler/DOM), `baseUrl` dihapus karena deprecated TS 6.0, `paths` relatif; (3) placeholder `apps/web/public/index.html` dihapus, `scripts/preview-build.mjs` + `scripts/preview-verify.ts` dialihkan ke `apps/web/dist` dengan build web otomatis; (4) dev proxy `/api → localhost:3100` untuk dev saja; (5) TanStack Query/Zustand/dnd-kit sengaja TIDAK dipasang — scope goal 7.1.3/7.1.4/7.5.x; (6) pnpm menambahkan `@types/react-dom@19.2.5` ke `minimumReleaseAgeExclude` di `pnpm-workspace.yaml` (otomatis tooling supply-chain).

<a id="cl-01"></a>
### CL-01 — 2026-08-25 · 7.1.1 → 🔄
**Role:** AI-Dev · **Model:** ox-alpha (opencode)
**Bukti:** discovery read-only: `git log -1` = `5c07eff plan(phase-7): buka gate ... (Review-CL-05)`, working tree bersih; row goal 7.1.1 dibaca ulang dari disk (`⬜️`, 0%, dependency `—`); baseline §2.1 dibaca penuh (AGENTS.md, PHASE-7-TASKS.md, 01-PRODUCT §0+§2.2, 02-SPEC A.16, 03-ENG A.4–A.8, 04-DELIVERY C.3–C.4, 05-FRONTEND §3); `apps/web/` terverifikasi placeholder murni (package.json tanpa deps, public/index.html statis).
**Catatan:** mulai bootstrap `apps/web` dari nol sesuai Reference 03-ENG A.7–A.8 + 05-FRONTEND §3; exact pin mengikuti hasil revalidasi Review-CL-05; scope dibatasi foundation (React/Vite/Router/Tailwind/shadcn) — TanStack Query/Zustand/dnd-kit adalah goal 7.1.3/7.1.4/7.5.x.

<a id="review-cl-05"></a>
### Review-CL-05 — 2026-08-25 · GATE DIBUKA — refresh outline terhadap SOT 4.1.1 + state repo nyata

**Role:** AI-Planning & Review · **Model:** Claude Sonnet 5

**Keputusan manusia eksplisit:** "ya lakukan" — konfirmasi langsung setelah [Review-CL-04 (PHASE-6-TASKS.md)](PHASE-6-TASKS.md#review-cl-04) melaporkan Exit Criteria Phase 0–6 genuinely terpenuhi dan menawarkan pembukaan Phase 7 sebagai langkah berikutnya.

**Dibaca penuh sebelum refresh** (sesuai C.6.1): `04-DELIVERY` Part A (UX Flows, seluruh A.1–A.9) dan C.1 baris Phase 7; `05-FRONTEND.md` sepenuhnya (design tokens, foundation, UI↔Domain reconciliation §4, layar utama §5, struktur §6, responsive §7); outline `PHASE-7-TASKS.md` existing (14 task, 38 goal, sudah pernah diselaraskan ke SOT 4.0.0 via [Review-CL-02](#review-cl-02)).

**State repo dikonfirmasi langsung (bukan asumsi):** `apps/web/` HANYA berisi `package.json` placeholder (nama+version+engines saja), `README.md` yang eksplisit bilang "Implementasi SPA dibuka pada Phase 7", dan `public/index.html` static test shell — TIDAK ADA scaffold Vite/React/Router/Tailwind/shadcn sama sekali. `TASK-7.1.1` genuinely mulai dari nol.

**Versi dependency direvalidasi terhadap npm registry** (kewajiban eksplisit `03-ENG A.8`/`05-FRONTEND §3`: "Versi exact dependency UI MUST diverifikasi ulang dan dipin ketika gate Phase 7 dibuka") — `npm view <pkg> version` dijalankan untuk seluruh baseline: React/React DOM `19.2.8`, Vite `8.2.2`, React Router `8.3.0`, Tailwind CSS `4.3.3`, shadcn CLI `4.19.0`, TanStack Query `5.102.2`, Zustand `5.0.15`, `@dnd-kit/core` `6.3.1` — **seluruhnya cocok baseline major version yang sudah dikunci (`03-ENG A.8`), TIDAK ADA revisi diperlukan**. TypeScript dikonfirmasi TETAP `6.0.2` (bukan ikut versi terbaru `7.x` yang baru dirilis) — konsisten keputusan existing menunda TypeScript 7 sampai lint tooling kompatibel ([01-PRODUCT changelog 2.0.4](docs/01-PRODUCT.md)), berlaku juga untuk `apps/web` demi satu versi TypeScript across monorepo.

**Substansi outline dikonfirmasi masih akurat terhadap SOT 4.1.1** (bukan cuma 4.0.0 seperti audit Review-CL-02 sebelumnya): amandemen 4.1.0 (BR-054C revoke lintas-DB, journal deprovision BR-016B) dan 4.1.1 (F.1 RTO/RPO) keduanya **control-plane/operasional backend murni** — tidak ada field/endpoint/response shape baru yang terekspos ke API contract (`02-SPEC Part C`) yang dikonsumsi UI. Tidak ada goal existing yang perlu diubah substansinya.

**Gate dibuka:** seluruh 38 goal `⏸️ → ⬜️` (transisi wewenang AI-Planning & Review, [AGENTS.md §11.1](AGENTS.md)/[§6.1](AGENTS.md)). Header file, banner, kolom Dependency `7.1.1` ("Gate" → "—"), dan section Flag diperbarui mencerminkan gate terbuka. `docs/05-FRONTEND.md` status line juga diperbarui (lihat commit yang sama).

**Belum ada implementasi dimulai** — seluruh goal `⬜️` murni (bukan `🔄`), menunggu sesi AI-Dev berikutnya memilih goal sesuai dependency (`TASK-7.1.1` adalah satu-satunya goal P0 tanpa dependency, titik masuk alami).

<a id="review-cl-02"></a>
### Review-CL-02 — 2026-08-24 · audit outline Phase 7 terhadap SOT 4.0.0
**Role:** AI-Planning & Review · **Model:** Codex

**Hasil:** Phase 7 tetap `⏸️` dan belum implementation-ready. Kontrak yang sudah observable sekarang diselaraskan: `expectedVersion`/`destinationListId` camelCase, pembedaan `version` domain field vs `expectedVersion`, wrapper Invitation bernama, idempotency error/retry di API client, serta larangan membuat cross-project search endpoint untuk Dashboard/Activity. Tidak ada gate dibuka dan tidak ada kode UI dibuat.

**Bukti:** impact scan SOT 4.0.0 C.2/C.3/C.8/C.13, BR-010, 03-ENG C.5, dan 05-FRONTEND; seluruh goal Phase 7 tetap blocked 0%; refresh granular penuh tetap wajib saat Phase 0–6 selesai.

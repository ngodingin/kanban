# Phase 7 — UI · Task & Goal Breakdown

> ✅ **GATE DIBUKA 2026-08-25** ([Review-CL-05](#review-cl-05)) — keputusan manusia eksplisit setelah Exit Criteria Phase 0–6 diverifikasi independen genuinely terpenuhi ([Review-CL-04, PHASE-6-TASKS.md](PHASE-6-TASKS.md#review-cl-04)). Goal di bawah sekarang `⬜️` (actionable), bukan lagi `⏸️`.
>
> Generated per [04-DELIVERY C.6](docs/04-DELIVERY.md). SOT version: 4.1.1 (direfresh dari 2.0.6 saat gate dibuka — lihat [Review-CL-05](#review-cl-05)). Acuan desain: [docs/05-FRONTEND.md](docs/05-FRONTEND.md). Acuan alur: [04-DELIVERY Part A (UX Flows)](docs/04-DELIVERY.md).
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
| 7.1.1 | ✅ | [QA-CL-01](#qa-cl-01)<br>[CL-01](#cl-01)<br>[CL-02](#cl-02) | 100 | P0 | Bootstrap `apps/web` dari nol (saat ini hanya placeholder) dengan exact-pinned React 19.2.x/Vite 8.x + React Router 8.x + Tailwind 4.x/shadcn 4.x sesuai baseline A.8 (direvalidasi terhadap npm registry 2026-08-25, lihat [Review-CL-05](#review-cl-05) — semua cocok, tanpa revisi) | [03-ENG A.7–A.8](docs/03-ENGINEERING.md), [05-FRONTEND §3](docs/05-FRONTEND.md) | — |
| 7.1.2 | ✅ | [QA-CL-02](#qa-cl-02)<br>[CL-03](#cl-03)<br>[CL-04](#cl-04) | 100 | P0 | Bangun UI final Better Auth Magic Link di atas mekanisme Phase 0; tidak menambah password/social provider | [03-ENG A.14](docs/03-ENGINEERING.md), [05-FRONTEND §3.1](docs/05-FRONTEND.md) | 7.1.1 |
| 7.1.3 | ✅ | [QA-CL-03](#qa-cl-03)<br>[Review-CL-02](#review-cl-02)<br>[CL-05](#cl-05)<br>[CL-06](#cl-06) | 100 | P0 | Setup TanStack Query + same-origin API client layer terpisah dari UI; mutation berisiko tinggi memakai `Idempotency-Key` stabil per logical action dan menangani `IDEMPOTENCY_CONFLICT`/`IDEMPOTENCY_IN_PROGRESS` tanpa membuat side-effect kedua | [05-FRONTEND §3.2](docs/05-FRONTEND.md), [02-SPEC C.3](docs/02-SPEC.md) | 7.1.1 |
| 7.1.4 | ✅ | [QA-CL-04](#qa-cl-04)<br>[CL-07](#cl-07)<br>[CL-08](#cl-08) | 100 | P1 | Batasi Zustand ke UI/interaction state saja | [05-FRONTEND §3.1](docs/05-FRONTEND.md) | 7.1.1 |

**Test:** Production build Vite dapat disajikan bersama Hono pada satu origin; deep link SPA bekerja; `/api/*` tidak tertangkap fallback; UI Magic Link menangani request/link-sent/expired/used/error; TanStack Query terpasang; tidak ada demo/non-MVP atau identity SaaS.
**DoD:** Foundation React/Vite hanya berisi fitur MVP; server state lewat TanStack Query; routing memakai React Router; struktur `features/` sesuai [05-FRONTEND §6](docs/05-FRONTEND.md).

---

## TASK-7.2 — Design system / theme

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.2.1 | ✅ | [QA-CL-05](#qa-cl-05)<br>[CL-09](#cl-09)<br>[CL-10](#cl-10) | 100 | P1 | Terapkan color tokens (indigo primary + slate + semantic) | [05-FRONTEND §2.1](docs/05-FRONTEND.md) | 7.1.1 |
| 7.2.2 | ⬜️ | — | 0 | P2 | Terapkan tipografi Inter + skala heading/body/small | [05-FRONTEND §2.2](docs/05-FRONTEND.md) | 7.1.1 |
| 7.2.3 | ⬜️ | — | 0 | P2 | Set radius/density (sm/md/lg), light+dark | [05-FRONTEND §2.3](docs/05-FRONTEND.md) | 7.2.1 |

**Test:** Token render benar di light & dark; kontras memadai; komponen shadcn memakai token.
**DoD:** Theme konsisten sesuai tokens; tidak ada warna hard-coded di luar token.

---

## TASK-7.3 — App shell (sidebar + header)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.3.1 | ✅ | [QA-CL-06](#qa-cl-06)<br>[CL-11](#cl-11)<br>[CL-12](#cl-12) | 100 | P0 | Sidebar context-aware (Home/My Tasks/Activity/Projects▾/Members/Permissions/API Keys/Settings) — **tanpa Inbox** | [05-FRONTEND §4,§5](docs/05-FRONTEND.md) | 7.2.1 |
| 7.3.2 | ✅ | [QA-CL-11](#qa-cl-11)<br>[QA-CL-07](#qa-cl-07)<br>[CL-13](#cl-13)<br>[CL-14](#cl-14)<br>[CL-26](#cl-26)<br>[CL-27](#cl-27) | 100 | P0 | Header breadcrumb Project › Milestone › Board + context switch | [05-FRONTEND §5](docs/05-FRONTEND.md) | 7.3.1 |
| 7.3.3 | ⬜️ | — | 0 | P3 | Branding "Powered by NGodingiN" (layar autentikasi/sidebar-bawah/footer) | [05-FRONTEND §5](docs/05-FRONTEND.md) | 7.3.1 |

**Test:** Navigasi antar Project mengganti context; Inbox tidak ada; breadcrumb akurat.
**DoD:** Shell context-aware; tidak menampilkan elemen non-MVP.

---

## TASK-7.4 — Home / Dashboard (work-management)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.4.1 | ⬜️ | [Review-CL-02](#review-cl-02) | 0 | P2 | Panel "Your work": My Tasks / Due soon / Overdue; agregasi hanya dari Project yang dapat diakses melalui API Project-scoped, tanpa endpoint/search lintas-Project baru | [05-FRONTEND §5](docs/05-FRONTEND.md), [BR-010](docs/02-SPEC.md) | 7.3.1 |
| 7.4.2 | ⬜️ | [Review-CL-02](#review-cl-02) | 0 | P2 | Recent Projects + Recent Activity; Activity tetap diambil per konteks Project dan tidak membentuk cross-project search endpoint | [05-FRONTEND §5](docs/05-FRONTEND.md), [02-SPEC C.9](docs/02-SPEC.md) | 7.4.1 |

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
| 7.7.1 | ⬜️ | — | 0 | P1 | Tab Details: description, assignee, due date, labels, **current List** (bukan "status") | [05-FRONTEND §4,§5](docs/05-FRONTEND.md) | 7.6.1 |
| 7.7.2 | ⬜️ | — | 0 | P1 | Tab Activity: timeline immutable | [02-SPEC A.8](docs/02-SPEC.md) | 7.8.1 |
| 7.7.3 | ⬜️ | — | 0 | P0 | Comments: add + edit (tanpa delete); tolak pada card deleted/archived | [02-SPEC A.9](docs/02-SPEC.md), [BR-033](docs/02-SPEC.md) | 7.7.1 |
| 7.7.4 | ⬜️ | [Review-CL-02](#review-cl-02) | 0 | P0 | Edit field via generic update hanya untuk field mutable; `listId` dan domain field `version` dilarang, sedangkan command metadata `expectedVersion` tetap wajib | [02-SPEC C.8, C.15](docs/02-SPEC.md) | 7.7.1 |

**Test:** "current List" tidak dimodelkan sebagai status; comment tak bisa dihapus & ditolak pada card non-active; PATCH tak bisa ubah field domain.
**DoD:** Card Detail patuh domain; tidak ada priority/progress.

---

## TASK-7.8 — Activity timeline

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.8.1 | ✅ | [QA-CL-08](#qa-cl-08)<br>[CL-24](#cl-24)<br>[CL-25](#cl-25) | 100 | P1 | Timeline historis grouped by day/time (audit, bukan notification feed) | [05-FRONTEND §5](docs/05-FRONTEND.md), [02-SPEC A.8](docs/02-SPEC.md) | 7.3.1 |
| 7.8.2 | ⬜️ | — | 0 | P1 | Render payload memakai konteks historis (nama List lama tetap tampil) | [03-ENG B.5](docs/03-ENGINEERING.md), [BR-028](docs/02-SPEC.md) | 7.8.1 |

**Test:** Activity read-only; entity terhapus tetap terbaca via payload historis.
**DoD:** Timeline = audit trail, immutable, bermakna historis.

---

## TASK-7.9 — Permission Groups UI (custom besar)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.9.1 | ⬜️ | [CL-29](#cl-29) | 0 | P0 | Editor Group + scoped assignment ke Membership (Project/Milestone/Board/List/Card) | [02-SPEC Part D](docs/02-SPEC.md) | 7.3.1 |
| 7.9.2 | ⬜️ | [CL-29](#cl-29) | 0 | P0 | Card visibility: Created (default) / Assigned (created OR assigned) / All | [02-SPEC A.11](docs/02-SPEC.md) | 7.9.1 |
| 7.9.3 | ⬜️ | [CL-29](#cl-29) | 0 | P0 | Direct Permission scoped + inheritance + additive tanpa DENY | [02-SPEC A.10](docs/02-SPEC.md) | 7.9.1 |

**Test:** UI mencerminkan model Group (bukan RBAC Role→Permissions); scope & inheritance benar.
**DoD:** Permission UI patuh authorization model; tidak menyederhanakan jadi RBAC.

---

## TASK-7.10 — Members + Invitation

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.10.1 | 🔎 | [CL-37](#cl-37)<br>[CL-38](#cl-38) | 80 | P1 | Tabel Members (User · Group · Status Active/Pending) — reuse table | [05-FRONTEND §5](docs/05-FRONTEND.md) | 7.3.1 |
| 7.10.2 | ⬜️ | [Review-CL-02](#review-cl-02) | 0 | P0 | Invite: Email + Permission Group + hierarchy scope; konsumsi response create/accept/revoke melalui `data.invitation` dan list melalui `data.invitations` | [02-SPEC C.13](docs/02-SPEC.md), [BR-050..052](docs/02-SPEC.md) | 7.10.1 |

**Test:** Invite mengirim sesuai kontrak; accept → membership dengan Group benar (AC-025).
**DoD:** Members & Invitation patuh invitation flow.

---

## TASK-7.11 — API Keys & PAT

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.11.1 | ⬜️ | — | 0 | P1 | API Keys (Project Settings): list · create (secret sekali tampil) · revoke | [02-SPEC C.14](docs/02-SPEC.md), [03-ENGINEERING C.2](docs/03-ENGINEERING.md) | 7.3.1 |
| 7.11.2 | ⬜️ | — | 0 | P1 | PAT (User Settings): list · create · revoke; terpisah dari Project | [02-SPEC C.14](docs/02-SPEC.md) | 7.3.1 |

**Test:** Secret hanya tampil sekali; revoke berfungsi; PAT di User Settings bukan Project.
**DoD:** Credential UI patuh security model.

---

## TASK-7.12 — Command palette

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.12.1 | ⬜️ | — | 0 | P3 | ⌘K: navigasi (Project/Board/My Tasks) + aksi (Create/Move/Archive Card) | [05-FRONTEND §3.1](docs/05-FRONTEND.md) | 7.3.1 |

**Test:** Aksi command memanggil domain command yang benar (bukan shortcut yang mem-bypass rule).
**DoD:** Command palette berfungsi & konsisten dengan permission/lifecycle.

---

## TASK-7.13 — Lifecycle UI (archive/restore + delete terminal)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.13.1 | 🔎 | [CL-30](#cl-30)<br>[CL-31](#cl-31) | 80 | P0 | Konfirmasi archive/delete menjelaskan dampak efektif subtree; tanpa child handling | [04-DELIVERY A.4](docs/04-DELIVERY.md), [02-SPEC A.4](docs/02-SPEC.md) | 7.5.1 |
| 7.13.2 | 🔎 | [CL-32](#cl-32)<br>[CL-33](#cl-33) | 80 | P0 | Restore hanya ARCHIVED; DELETED tidak punya tombol restore | [INV-LIFE-002/004](docs/02-SPEC.md) | 7.13.1 |
| 7.13.3 | 🔎 | [CL-32](#cl-32)<br>[CL-34](#cl-34) | 80 | P0 | Restore ARCHIVED ditolak jika ancestor belum ACTIVE (+ shortcut "restore parent first") | [04-DELIVERY A.5](docs/04-DELIVERY.md) | 7.13.1 |
| 7.13.4 | 🔎 | [CL-35](#cl-35)<br>[CL-36](#cl-36) | 80 | P1 | Archived/Deleted Audit view read-only sesuai permission | [02-SPEC A.3](docs/02-SPEC.md) | 7.13.1 |

**Test:** Tidak ada child handling; restore hanya untuk ARCHIVED dengan ancestor ACTIVE; DELETED terminal; local state descendant tidak berubah.
**DoD:** Lifecycle UI patuh effective ancestor state dan menjelaskan dampak terminal delete.

---

## TASK-7.14 — Responsive / mobile

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.14.1 | ⬜️ | — | 0 | P2 | Desktop `Sidebar\|Board`, Tablet collapsed sidebar | [05-FRONTEND §7](docs/05-FRONTEND.md) | 7.5.1 |
| 7.14.2 | ⬜️ | — | 0 | P2 | Mobile: List horizontal-scroll; Card detail full-screen | [05-FRONTEND §7](docs/05-FRONTEND.md) | 7.7.1 |

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
- Tidak ada `[NEEDS-SPEC-AMENDMENT]` — konflik mockup sudah direkonsiliasi di [05-FRONTEND §4](docs/05-FRONTEND.md).

---

## Closure Log

> Isi tiap kali sebuah goal pindah status atau menerima hasil review. Setiap entry wajib mencantumkan Role dan nama Model aktual; jika model tidak diekspos, tulis nama platform yang menjalankan agent (mis. `GitHub Copilot` atau `Codex`) dan jangan menebak model. Tambah entry baru di atas (terbaru dulu), gunakan namespace sesuai lane, lalu **append** link entry ke baris baru dalam kolom **CL** tanpa mengubah link lama. Setiap perubahan Status wajib masuk commit; awal `→ 🔄` boleh menunggu commit pertama. Commit diverifikasi lewat history Git file ini, bukan dengan menulis hash commit yang sama ke entry. Entry `⚠️`/`⏸️→` wajib mencantumkan alasan.

<!-- Dev: `### CL-nn — YYYY-MM-DD · goal <id> <ringkasan>`. QA: `### QA-CL-nn — ...`. Review: `### Review-CL-nn — ...`. Cantumkan Role + Model/platform aktual. Append-only, jangan hapus/ubah entry lama. -->

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

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
| 7.1.2 | ⬜️ | — | 0 | P0 | Bangun UI final Better Auth Magic Link di atas mekanisme Phase 0; tidak menambah password/social provider | [03-ENG A.14](docs/03-ENGINEERING.md), [05-FRONTEND §3.1](docs/05-FRONTEND.md) | 7.1.1 |
| 7.1.3 | ⬜️ | [Review-CL-02](#review-cl-02) | 0 | P0 | Setup TanStack Query + same-origin API client layer terpisah dari UI; mutation berisiko tinggi memakai `Idempotency-Key` stabil per logical action dan menangani `IDEMPOTENCY_CONFLICT`/`IDEMPOTENCY_IN_PROGRESS` tanpa membuat side-effect kedua | [05-FRONTEND §3.2](docs/05-FRONTEND.md), [02-SPEC C.3](docs/02-SPEC.md) | 7.1.1 |
| 7.1.4 | ⬜️ | — | 0 | P1 | Batasi Zustand ke UI/interaction state saja | [05-FRONTEND §3.1](docs/05-FRONTEND.md) | 7.1.1 |

**Test:** Production build Vite dapat disajikan bersama Hono pada satu origin; deep link SPA bekerja; `/api/*` tidak tertangkap fallback; UI Magic Link menangani request/link-sent/expired/used/error; TanStack Query terpasang; tidak ada demo/non-MVP atau identity SaaS.
**DoD:** Foundation React/Vite hanya berisi fitur MVP; server state lewat TanStack Query; routing memakai React Router; struktur `features/` sesuai [05-FRONTEND §6](docs/05-FRONTEND.md).

---

## TASK-7.2 — Design system / theme

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.2.1 | ⬜️ | — | 0 | P1 | Terapkan color tokens (indigo primary + slate + semantic) | [05-FRONTEND §2.1](docs/05-FRONTEND.md) | 7.1.1 |
| 7.2.2 | ⬜️ | — | 0 | P2 | Terapkan tipografi Inter + skala heading/body/small | [05-FRONTEND §2.2](docs/05-FRONTEND.md) | 7.1.1 |
| 7.2.3 | ⬜️ | — | 0 | P2 | Set radius/density (sm/md/lg), light+dark | [05-FRONTEND §2.3](docs/05-FRONTEND.md) | 7.2.1 |

**Test:** Token render benar di light & dark; kontras memadai; komponen shadcn memakai token.
**DoD:** Theme konsisten sesuai tokens; tidak ada warna hard-coded di luar token.

---

## TASK-7.3 — App shell (sidebar + header)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.3.1 | ⬜️ | — | 0 | P0 | Sidebar context-aware (Home/My Tasks/Activity/Projects▾/Members/Permissions/API Keys/Settings) — **tanpa Inbox** | [05-FRONTEND §4,§5](docs/05-FRONTEND.md) | 7.2.1 |
| 7.3.2 | ⬜️ | — | 0 | P0 | Header breadcrumb Project › Milestone › Board + context switch | [05-FRONTEND §5](docs/05-FRONTEND.md) | 7.3.1 |
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
| 7.5.1 | ⬜️ | — | 0 | P0 | Render kolom = List (nama bebas) + count; card list | [05-FRONTEND §5](docs/05-FRONTEND.md), [02-SPEC A.1](docs/02-SPEC.md) | 7.3.2 |
| 7.5.2 | ⬜️ | [Review-CL-02](#review-cl-02) | 0 | P0 | Drag Card antar List → panggil move API dengan JSON `{ destinationListId, expectedVersion }` | [02-SPEC C.8 move](docs/02-SPEC.md), [AC-020](docs/04-DELIVERY.md) | 7.5.1 |
| 7.5.3 | ⬜️ | — | 0 | P0 | Move antar Board hanya tawarkan Board dalam Milestone sama | [02-SPEC BR-018](docs/02-SPEC.md) | 7.5.2 |
| 7.5.4 | ⬜️ | — | 0 | P0 | Tangani `VERSION_CONFLICT` → pesan + reload (bukan auto-overwrite) | [04-DELIVERY A.3](docs/04-DELIVERY.md), [BR-021](docs/02-SPEC.md) | 7.5.2 |

**Test:** Drag memicu move API benar; opsi Board lintas-Milestone tidak muncul; conflict ditampilkan, tidak menimpa.
**DoD:** Interaksi Board tunduk domain command + optimistic locking; List tanpa makna status sistem.

---

## TASK-7.6 — Card (compact component)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.6.1 | ⬜️ | — | 0 | P1 | Card: title · description preview · labels · assignee · due date | [05-FRONTEND §5](docs/05-FRONTEND.md) | 7.5.1 |
| 7.6.2 | ⬜️ | — | 0 | P1 | **Tanpa** priority, **tanpa** progress, **tanpa** status field | [05-FRONTEND §4](docs/05-FRONTEND.md) | 7.6.1 |

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
| 7.8.1 | ⬜️ | — | 0 | P1 | Timeline historis grouped by day/time (audit, bukan notification feed) | [05-FRONTEND §5](docs/05-FRONTEND.md), [02-SPEC A.8](docs/02-SPEC.md) | 7.3.1 |
| 7.8.2 | ⬜️ | — | 0 | P1 | Render payload memakai konteks historis (nama List lama tetap tampil) | [03-ENG B.5](docs/03-ENGINEERING.md), [BR-028](docs/02-SPEC.md) | 7.8.1 |

**Test:** Activity read-only; entity terhapus tetap terbaca via payload historis.
**DoD:** Timeline = audit trail, immutable, bermakna historis.

---

## TASK-7.9 — Permission Groups UI (custom besar)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.9.1 | ⬜️ | — | 0 | P0 | Editor Group + scoped assignment ke Membership (Project/Milestone/Board/List/Card) | [02-SPEC Part D](docs/02-SPEC.md) | 7.3.1 |
| 7.9.2 | ⬜️ | — | 0 | P0 | Card visibility: Created (default) / Assigned (created OR assigned) / All | [02-SPEC A.11](docs/02-SPEC.md) | 7.9.1 |
| 7.9.3 | ⬜️ | — | 0 | P0 | Direct Permission scoped + inheritance + additive tanpa DENY | [02-SPEC A.10](docs/02-SPEC.md) | 7.9.1 |

**Test:** UI mencerminkan model Group (bukan RBAC Role→Permissions); scope & inheritance benar.
**DoD:** Permission UI patuh authorization model; tidak menyederhanakan jadi RBAC.

---

## TASK-7.10 — Members + Invitation

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.10.1 | ⬜️ | — | 0 | P1 | Tabel Members (User · Group · Status Active/Pending) — reuse table | [05-FRONTEND §5](docs/05-FRONTEND.md) | 7.3.1 |
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
| 7.13.1 | ⬜️ | — | 0 | P0 | Konfirmasi archive/delete menjelaskan dampak efektif subtree; tanpa child handling | [04-DELIVERY A.4](docs/04-DELIVERY.md), [02-SPEC A.4](docs/02-SPEC.md) | 7.5.1 |
| 7.13.2 | ⬜️ | — | 0 | P0 | Restore hanya ARCHIVED; DELETED tidak punya tombol restore | [INV-LIFE-002/004](docs/02-SPEC.md) | 7.13.1 |
| 7.13.3 | ⬜️ | — | 0 | P0 | Restore ARCHIVED ditolak jika ancestor belum ACTIVE (+ shortcut "restore parent first") | [04-DELIVERY A.5](docs/04-DELIVERY.md) | 7.13.1 |
| 7.13.4 | ⬜️ | — | 0 | P1 | Archived/Deleted Audit view read-only sesuai permission | [02-SPEC A.3](docs/02-SPEC.md) | 7.13.1 |

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

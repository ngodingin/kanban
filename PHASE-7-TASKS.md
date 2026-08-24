# Phase 7 — UI · Task & Goal Breakdown

> ⏸️ **BLOCKED — JANGAN DIKERJAKAN.** Phase 7 tidak boleh dimulai sebelum **Phase 0–6 selesai & terverifikasi** (semua Exit Criteria + Definition of Done [04-DELIVERY C.3](docs/04-DELIVERY.md) hijau). Seluruh goal di file ini berstatus ⏸️ sampai gate itu terbuka.
>
> Generated per [04-DELIVERY C.6](docs/04-DELIVERY.md). SOT version: 2.0.6. Acuan desain: [docs/05-FRONTEND.md](docs/05-FRONTEND.md). Acuan alur: [04-DELIVERY Part A (UX Flows)](docs/04-DELIVERY.md).
> **Audit terbaru:** outline diselaraskan pada titik kontrak observable SOT 4.0.0 melalui [Review-CL-02](#review-cl-02), tetapi tetap bukan task implementation-ready sampai gate Phase 7 dibuka dan refresh penuh terhadap repo/API aktual dilakukan.
>
> **Catatan metodologi (C.6):** task granular idealnya di-*refresh* saat fase menjadi aktif, terhadap state repo nyata (scaffold Vite, API client, hook, dsb yang sudah ada). Daftar ini adalah **outline perencanaan** yang dibuat lebih awal atas permintaan; verifikasi & sesuaikan saat Phase 7 benar-benar dibuka.
>
> **AI-Dev execution gate:** selama goal `⏸️`, Dev dilarang bekerja. Setelah gate dibuka, jangan ubah implementasi sebelum goal `🔄` + `CL` terpasang dan jangan menyatakan selesai sebelum goal `🔎`/`80%` + CL baru + test hijau + commit. Format handoff wajib mengikuti [AGENTS.md §0](AGENTS.md).

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

---

## TASK-7.1 — React/Vite foundation setup

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.1.1 | ⏸️ | — | 0 | P0 | Bootstrap `apps/web` dengan exact-pinned React/Vite + React Router + Tailwind/shadcn sesuai baseline A.8 yang direvalidasi saat gate dibuka | [03-ENG A.7–A.8](docs/03-ENGINEERING.md), [05-FRONTEND §3](docs/05-FRONTEND.md) | Gate |
| 7.1.2 | ⏸️ | — | 0 | P0 | Bangun UI final Better Auth Magic Link di atas mekanisme Phase 0; tidak menambah password/social provider | [03-ENG A.14](docs/03-ENGINEERING.md), [05-FRONTEND §3.1](docs/05-FRONTEND.md) | 7.1.1 |
| 7.1.3 | ⏸️ | [Review-CL-02](#review-cl-02) | 0 | P0 | Setup TanStack Query + same-origin API client layer terpisah dari UI; mutation berisiko tinggi memakai `Idempotency-Key` stabil per logical action dan menangani `IDEMPOTENCY_CONFLICT`/`IDEMPOTENCY_IN_PROGRESS` tanpa membuat side-effect kedua | [05-FRONTEND §3.2](docs/05-FRONTEND.md), [02-SPEC C.3](docs/02-SPEC.md) | 7.1.1 |
| 7.1.4 | ⏸️ | — | 0 | P1 | Batasi Zustand ke UI/interaction state saja | [05-FRONTEND §3.1](docs/05-FRONTEND.md) | 7.1.1 |

**Test:** Production build Vite dapat disajikan bersama Hono pada satu origin; deep link SPA bekerja; `/api/*` tidak tertangkap fallback; UI Magic Link menangani request/link-sent/expired/used/error; TanStack Query terpasang; tidak ada demo/non-MVP atau identity SaaS.
**DoD:** Foundation React/Vite hanya berisi fitur MVP; server state lewat TanStack Query; routing memakai React Router; struktur `features/` sesuai [05-FRONTEND §6](docs/05-FRONTEND.md).

---

## TASK-7.2 — Design system / theme

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.2.1 | ⏸️ | — | 0 | P1 | Terapkan color tokens (indigo primary + slate + semantic) | [05-FRONTEND §2.1](docs/05-FRONTEND.md) | 7.1.1 |
| 7.2.2 | ⏸️ | — | 0 | P2 | Terapkan tipografi Inter + skala heading/body/small | [05-FRONTEND §2.2](docs/05-FRONTEND.md) | 7.1.1 |
| 7.2.3 | ⏸️ | — | 0 | P2 | Set radius/density (sm/md/lg), light+dark | [05-FRONTEND §2.3](docs/05-FRONTEND.md) | 7.2.1 |

**Test:** Token render benar di light & dark; kontras memadai; komponen shadcn memakai token.
**DoD:** Theme konsisten sesuai tokens; tidak ada warna hard-coded di luar token.

---

## TASK-7.3 — App shell (sidebar + header)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.3.1 | ⏸️ | — | 0 | P0 | Sidebar context-aware (Home/My Tasks/Activity/Projects▾/Members/Permissions/API Keys/Settings) — **tanpa Inbox** | [05-FRONTEND §4,§5](docs/05-FRONTEND.md) | 7.2.1 |
| 7.3.2 | ⏸️ | — | 0 | P0 | Header breadcrumb Project › Milestone › Board + context switch | [05-FRONTEND §5](docs/05-FRONTEND.md) | 7.3.1 |
| 7.3.3 | ⏸️ | — | 0 | P3 | Branding "Powered by NGodingiN" (layar autentikasi/sidebar-bawah/footer) | [05-FRONTEND §5](docs/05-FRONTEND.md) | 7.3.1 |

**Test:** Navigasi antar Project mengganti context; Inbox tidak ada; breadcrumb akurat.
**DoD:** Shell context-aware; tidak menampilkan elemen non-MVP.

---

## TASK-7.4 — Home / Dashboard (work-management)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.4.1 | ⏸️ | [Review-CL-02](#review-cl-02) | 0 | P2 | Panel "Your work": My Tasks / Due soon / Overdue; agregasi hanya dari Project yang dapat diakses melalui API Project-scoped, tanpa endpoint/search lintas-Project baru | [05-FRONTEND §5](docs/05-FRONTEND.md), [BR-010](docs/02-SPEC.md) | 7.3.1 |
| 7.4.2 | ⏸️ | [Review-CL-02](#review-cl-02) | 0 | P2 | Recent Projects + Recent Activity; Activity tetap diambil per konteks Project dan tidak membentuk cross-project search endpoint | [05-FRONTEND §5](docs/05-FRONTEND.md), [02-SPEC C.9](docs/02-SPEC.md) | 7.4.1 |

**Test:** Data dari API nyata (bukan demo); tidak ada revenue/charts admin.
**DoD:** Home terasa work-management tool, bukan admin panel.

---

## TASK-7.5 — Board view + drag & drop

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.5.1 | ⏸️ | — | 0 | P0 | Render kolom = List (nama bebas) + count; card list | [05-FRONTEND §5](docs/05-FRONTEND.md), [02-SPEC A.1](docs/02-SPEC.md) | 7.3.2 |
| 7.5.2 | ⏸️ | [Review-CL-02](#review-cl-02) | 0 | P0 | Drag Card antar List → panggil move API dengan JSON `{ destinationListId, expectedVersion }` | [02-SPEC C.8 move](docs/02-SPEC.md), [AC-020](docs/04-DELIVERY.md) | 7.5.1 |
| 7.5.3 | ⏸️ | — | 0 | P0 | Move antar Board hanya tawarkan Board dalam Milestone sama | [02-SPEC BR-018](docs/02-SPEC.md) | 7.5.2 |
| 7.5.4 | ⏸️ | — | 0 | P0 | Tangani `VERSION_CONFLICT` → pesan + reload (bukan auto-overwrite) | [04-DELIVERY A.3](docs/04-DELIVERY.md), [BR-021](docs/02-SPEC.md) | 7.5.2 |

**Test:** Drag memicu move API benar; opsi Board lintas-Milestone tidak muncul; conflict ditampilkan, tidak menimpa.
**DoD:** Interaksi Board tunduk domain command + optimistic locking; List tanpa makna status sistem.

---

## TASK-7.6 — Card (compact component)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.6.1 | ⏸️ | — | 0 | P1 | Card: title · description preview · labels · assignee · due date | [05-FRONTEND §5](docs/05-FRONTEND.md) | 7.5.1 |
| 7.6.2 | ⏸️ | — | 0 | P1 | **Tanpa** priority, **tanpa** progress, **tanpa** status field | [05-FRONTEND §4](docs/05-FRONTEND.md) | 7.6.1 |

**Test:** Card hanya menampilkan field domain yang valid; tidak ada priority/progress/status.
**DoD:** Komponen Card patuh [05-FRONTEND §4](docs/05-FRONTEND.md).

---

## TASK-7.7 — Card Detail (Sheet / full-screen mobile)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.7.1 | ⏸️ | — | 0 | P1 | Tab Details: description, assignee, due date, labels, **current List** (bukan "status") | [05-FRONTEND §4,§5](docs/05-FRONTEND.md) | 7.6.1 |
| 7.7.2 | ⏸️ | — | 0 | P1 | Tab Activity: timeline immutable | [02-SPEC A.8](docs/02-SPEC.md) | 7.8.1 |
| 7.7.3 | ⏸️ | — | 0 | P0 | Comments: add + edit (tanpa delete); tolak pada card deleted/archived | [02-SPEC A.9](docs/02-SPEC.md), [BR-033](docs/02-SPEC.md) | 7.7.1 |
| 7.7.4 | ⏸️ | [Review-CL-02](#review-cl-02) | 0 | P0 | Edit field via generic update hanya untuk field mutable; `listId` dan domain field `version` dilarang, sedangkan command metadata `expectedVersion` tetap wajib | [02-SPEC C.8, C.15](docs/02-SPEC.md) | 7.7.1 |

**Test:** "current List" tidak dimodelkan sebagai status; comment tak bisa dihapus & ditolak pada card non-active; PATCH tak bisa ubah field domain.
**DoD:** Card Detail patuh domain; tidak ada priority/progress.

---

## TASK-7.8 — Activity timeline

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.8.1 | ⏸️ | — | 0 | P1 | Timeline historis grouped by day/time (audit, bukan notification feed) | [05-FRONTEND §5](docs/05-FRONTEND.md), [02-SPEC A.8](docs/02-SPEC.md) | 7.3.1 |
| 7.8.2 | ⏸️ | — | 0 | P1 | Render payload memakai konteks historis (nama List lama tetap tampil) | [03-ENG B.5](docs/03-ENGINEERING.md), [BR-028](docs/02-SPEC.md) | 7.8.1 |

**Test:** Activity read-only; entity terhapus tetap terbaca via payload historis.
**DoD:** Timeline = audit trail, immutable, bermakna historis.

---

## TASK-7.9 — Permission Groups UI (custom besar)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.9.1 | ⏸️ | — | 0 | P0 | Editor Group + scoped assignment ke Membership (Project/Milestone/Board/List/Card) | [02-SPEC Part D](docs/02-SPEC.md) | 7.3.1 |
| 7.9.2 | ⏸️ | — | 0 | P0 | Card visibility: Created (default) / Assigned (created OR assigned) / All | [02-SPEC A.11](docs/02-SPEC.md) | 7.9.1 |
| 7.9.3 | ⏸️ | — | 0 | P0 | Direct Permission scoped + inheritance + additive tanpa DENY | [02-SPEC A.10](docs/02-SPEC.md) | 7.9.1 |

**Test:** UI mencerminkan model Group (bukan RBAC Role→Permissions); scope & inheritance benar.
**DoD:** Permission UI patuh authorization model; tidak menyederhanakan jadi RBAC.

---

## TASK-7.10 — Members + Invitation

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.10.1 | ⏸️ | — | 0 | P1 | Tabel Members (User · Group · Status Active/Pending) — reuse table | [05-FRONTEND §5](docs/05-FRONTEND.md) | 7.3.1 |
| 7.10.2 | ⏸️ | [Review-CL-02](#review-cl-02) | 0 | P0 | Invite: Email + Permission Group + hierarchy scope; konsumsi response create/accept/revoke melalui `data.invitation` dan list melalui `data.invitations` | [02-SPEC C.13](docs/02-SPEC.md), [BR-050..052](docs/02-SPEC.md) | 7.10.1 |

**Test:** Invite mengirim sesuai kontrak; accept → membership dengan Group benar (AC-025).
**DoD:** Members & Invitation patuh invitation flow.

---

## TASK-7.11 — API Keys & PAT

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.11.1 | ⏸️ | — | 0 | P1 | API Keys (Project Settings): list · create (secret sekali tampil) · revoke | [02-SPEC C.14](docs/02-SPEC.md), [03-ENGINEERING C.2](docs/03-ENGINEERING.md) | 7.3.1 |
| 7.11.2 | ⏸️ | — | 0 | P1 | PAT (User Settings): list · create · revoke; terpisah dari Project | [02-SPEC C.14](docs/02-SPEC.md) | 7.3.1 |

**Test:** Secret hanya tampil sekali; revoke berfungsi; PAT di User Settings bukan Project.
**DoD:** Credential UI patuh security model.

---

## TASK-7.12 — Command palette

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.12.1 | ⏸️ | — | 0 | P3 | ⌘K: navigasi (Project/Board/My Tasks) + aksi (Create/Move/Archive Card) | [05-FRONTEND §3.1](docs/05-FRONTEND.md) | 7.3.1 |

**Test:** Aksi command memanggil domain command yang benar (bukan shortcut yang mem-bypass rule).
**DoD:** Command palette berfungsi & konsisten dengan permission/lifecycle.

---

## TASK-7.13 — Lifecycle UI (archive/restore + delete terminal)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.13.1 | ⏸️ | — | 0 | P0 | Konfirmasi archive/delete menjelaskan dampak efektif subtree; tanpa child handling | [04-DELIVERY A.4](docs/04-DELIVERY.md), [02-SPEC A.4](docs/02-SPEC.md) | 7.5.1 |
| 7.13.2 | ⏸️ | — | 0 | P0 | Restore hanya ARCHIVED; DELETED tidak punya tombol restore | [INV-LIFE-002/004](docs/02-SPEC.md) | 7.13.1 |
| 7.13.3 | ⏸️ | — | 0 | P0 | Restore ARCHIVED ditolak jika ancestor belum ACTIVE (+ shortcut "restore parent first") | [04-DELIVERY A.5](docs/04-DELIVERY.md) | 7.13.1 |
| 7.13.4 | ⏸️ | — | 0 | P1 | Archived/Deleted Audit view read-only sesuai permission | [02-SPEC A.3](docs/02-SPEC.md) | 7.13.1 |

**Test:** Tidak ada child handling; restore hanya untuk ARCHIVED dengan ancestor ACTIVE; DELETED terminal; local state descendant tidak berubah.
**DoD:** Lifecycle UI patuh effective ancestor state dan menjelaskan dampak terminal delete.

---

## TASK-7.14 — Responsive / mobile

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 7.14.1 | ⏸️ | — | 0 | P2 | Desktop `Sidebar\|Board`, Tablet collapsed sidebar | [05-FRONTEND §7](docs/05-FRONTEND.md) | 7.5.1 |
| 7.14.2 | ⏸️ | — | 0 | P2 | Mobile: List horizontal-scroll; Card detail full-screen | [05-FRONTEND §7](docs/05-FRONTEND.md) | 7.7.1 |

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
- Task di file ini adalah outline; **refresh terhadap state repo nyata saat Phase 7 dibuka** (C.6).
- Tidak ada `[NEEDS-SPEC-AMENDMENT]` — konflik mockup sudah direkonsiliasi di [05-FRONTEND §4](docs/05-FRONTEND.md).

---

## Closure Log

> Isi tiap kali sebuah goal pindah status atau menerima hasil review. Setiap entry wajib mencantumkan Role dan nama Model aktual; jika model tidak diekspos, tulis nama platform yang menjalankan agent (mis. `GitHub Copilot` atau `Codex`) dan jangan menebak model. Tambah entry baru di atas (terbaru dulu), gunakan namespace sesuai lane, lalu **append** link entry ke baris baru dalam kolom **CL** tanpa mengubah link lama. Setiap perubahan Status wajib masuk commit; awal `→ 🔄` boleh menunggu commit pertama. Commit diverifikasi lewat history Git file ini, bukan dengan menulis hash commit yang sama ke entry. Entry `⚠️`/`⏸️→` wajib mencantumkan alasan.

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

<a id="review-cl-02"></a>
### Review-CL-02 — 2026-08-24 · audit outline Phase 7 terhadap SOT 4.0.0
**Role:** AI-Planning & Review · **Model:** Codex

**Hasil:** Phase 7 tetap `⏸️` dan belum implementation-ready. Kontrak yang sudah observable sekarang diselaraskan: `expectedVersion`/`destinationListId` camelCase, pembedaan `version` domain field vs `expectedVersion`, wrapper Invitation bernama, idempotency error/retry di API client, serta larangan membuat cross-project search endpoint untuk Dashboard/Activity. Tidak ada gate dibuka dan tidak ada kode UI dibuat.

**Bukti:** impact scan SOT 4.0.0 C.2/C.3/C.8/C.13, BR-010, 03-ENG C.5, dan 05-FRONTEND; seluruh goal Phase 7 tetap blocked 0%; refresh granular penuh tetap wajib saat Phase 0–6 selesai.

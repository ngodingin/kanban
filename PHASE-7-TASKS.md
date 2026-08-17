# Phase 7 — UI · Task & Goal Breakdown

> ⏸️ **BLOCKED — JANGAN DIKERJAKAN.** Phase 7 tidak boleh dimulai sebelum **Phase 0–6 selesai & terverifikasi** (semua Exit Criteria + Definition of Done [04-DELIVERY C.3](docs/04-DELIVERY.md) hijau). Seluruh goal di file ini berstatus ⏸️ sampai gate itu terbuka.
>
> Generated per [04-DELIVERY C.6](docs/04-DELIVERY.md). SOT version: 1.0.4. Acuan desain: [docs/05-FRONTEND.md](docs/05-FRONTEND.md). Acuan alur: [04-DELIVERY Part A (UX Flows)](docs/04-DELIVERY.md).
>
> **Catatan metodologi (C.6):** task granular idealnya di-*refresh* saat fase menjadi aktif, terhadap state repo nyata (foundation template, hook, dsb yang sudah ada). Daftar ini adalah **outline perencanaan** yang dibuat lebih awal atas permintaan; verifikasi & sesuaikan saat Phase 7 benar-benar dibuka.

## Prinsip Phase 7
Bangun domain UI di atas foundation template (Kiranism), **tanpa membiarkan template mendikte domain**. Setiap komponen memetakan ke field yang ADA di [02-SPEC](docs/02-SPEC.md). UI tidak memperkenalkan field baru (priority/progress-card/status/inbox = non-goal, [05-FRONTEND §4](docs/05-FRONTEND.md)). Semua mutasi lewat domain command + optimistic locking + permission.

## Legend Status
⬜️ Belum · 🔄 Dikerjakan · 🔎 Menunggu verifikasi · ✅ Terverifikasi QA · ⚠️ Gagal-verifikasi · ⏸️ Blocked
Kolom **%** = estimasi penyelesaian goal. Setiap perpindahan Status WAJIB dicatat di [Closure Log](#closure-log).

## Gate pembuka (prasyarat mulai Phase 7)
- [ ] Phase 0–6 seluruh Exit Criteria terpenuhi & terverifikasi QA.
- [ ] API domain (02-SPEC Part C) tersedia & lulus acceptance criteria terkait.
- [ ] Metode identitas Auth.js sudah final (0.8.4).
Sebelum ketiga hal ini ✅, semua task di bawah tetap ⏸️.

---

## TASK-7.1 — Foundation setup & cleanup

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 7.1.1 | ⏸️ | 0 | Fork Kiranism starter; jalankan cleanup script (buang demo non-MVP) | [05-FRONTEND §3.1](docs/05-FRONTEND.md) | Gate |
| 7.1.2 | ⏸️ | 0 | **Buang Clerk**; wire Auth.js (model User/Membership sendiri) | [03-ENG A.14](docs/03-ENGINEERING.md), [05-FRONTEND §3.1](docs/05-FRONTEND.md) | 7.1.1 |
| 7.1.3 | ⏸️ | 0 | Setup React Query + API client layer terpisah dari UI | [05-FRONTEND §3.2](docs/05-FRONTEND.md) | 7.1.1 |
| 7.1.4 | ⏸️ | 0 | Batasi Zustand ke UI/interaction state saja | [05-FRONTEND §3.1](docs/05-FRONTEND.md) | 7.1.1 |

**Test:** App boot tanpa Clerk; login via Auth.js berfungsi; React Query terpasang; demo non-MVP hilang.
**DoD:** Foundation bersih dari fitur non-MVP & Clerk; server state lewat React Query; struktur `features/` sesuai [05-FRONTEND §6](docs/05-FRONTEND.md).

---

## TASK-7.2 — Design system / theme

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 7.2.1 | ⏸️ | 0 | Terapkan color tokens (indigo primary + slate + semantic) | [05-FRONTEND §2.1](docs/05-FRONTEND.md) | 7.1.1 |
| 7.2.2 | ⏸️ | 0 | Terapkan tipografi Inter + skala heading/body/small | [05-FRONTEND §2.2](docs/05-FRONTEND.md) | 7.1.1 |
| 7.2.3 | ⏸️ | 0 | Set radius/density (sm/md/lg), light+dark | [05-FRONTEND §2.3](docs/05-FRONTEND.md) | 7.2.1 |

**Test:** Token render benar di light & dark; kontras memadai; komponen shadcn memakai token.
**DoD:** Theme konsisten sesuai tokens; tidak ada warna hard-coded di luar token.

---

## TASK-7.3 — App shell (sidebar + header)

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 7.3.1 | ⏸️ | 0 | Sidebar context-aware (Home/My Tasks/Activity/Projects▾/Members/Permissions/API Keys/Settings) — **tanpa Inbox** | [05-FRONTEND §4,§5](docs/05-FRONTEND.md) | 7.2.1 |
| 7.3.2 | ⏸️ | 0 | Header breadcrumb Project › Milestone › Board + context switch | [05-FRONTEND §5](docs/05-FRONTEND.md) | 7.3.1 |
| 7.3.3 | ⏸️ | 0 | Branding "Powered by NGodingiN" (login/register/sidebar-bawah/footer) | [05-FRONTEND §5](docs/05-FRONTEND.md) | 7.3.1 |

**Test:** Navigasi antar Project mengganti context; Inbox tidak ada; breadcrumb akurat.
**DoD:** Shell context-aware; tidak menampilkan elemen non-MVP.

---

## TASK-7.4 — Home / Dashboard (work-management)

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 7.4.1 | ⏸️ | 0 | Panel "Your work": My Tasks / Due soon / Overdue | [05-FRONTEND §5](docs/05-FRONTEND.md) | 7.3.1 |
| 7.4.2 | ⏸️ | 0 | Recent Projects + Recent Activity | [05-FRONTEND §5](docs/05-FRONTEND.md) | 7.4.1 |

**Test:** Data dari API nyata (bukan demo); tidak ada revenue/charts admin.
**DoD:** Home terasa work-management tool, bukan admin panel.

---

## TASK-7.5 — Board view + drag & drop

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 7.5.1 | ⏸️ | 0 | Render kolom = List (nama bebas) + count; card list | [05-FRONTEND §5](docs/05-FRONTEND.md), [02-SPEC A.1](docs/02-SPEC.md) | 7.3.2 |
| 7.5.2 | ⏸️ | 0 | Drag Card antar List → panggil move API (`expected_version`) | [02-SPEC C.8 move](docs/02-SPEC.md), [AC-020](docs/04-DELIVERY.md) | 7.5.1 |
| 7.5.3 | ⏸️ | 0 | Move antar Board hanya tawarkan Board dalam Milestone sama | [02-SPEC BR-018](docs/02-SPEC.md) | 7.5.2 |
| 7.5.4 | ⏸️ | 0 | Tangani `VERSION_CONFLICT` → pesan + reload (bukan auto-overwrite) | [04-DELIVERY A.3](docs/04-DELIVERY.md), [BR-021](docs/02-SPEC.md) | 7.5.2 |

**Test:** Drag memicu move API benar; opsi Board lintas-Milestone tidak muncul; conflict ditampilkan, tidak menimpa.
**DoD:** Interaksi Board tunduk domain command + optimistic locking; List tanpa makna status sistem.

---

## TASK-7.6 — Card (compact component)

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 7.6.1 | ⏸️ | 0 | Card: title · description preview · labels · assignee · due date | [05-FRONTEND §5](docs/05-FRONTEND.md) | 7.5.1 |
| 7.6.2 | ⏸️ | 0 | **Tanpa** priority, **tanpa** progress, **tanpa** status field | [05-FRONTEND §4](docs/05-FRONTEND.md) | 7.6.1 |

**Test:** Card hanya menampilkan field domain yang valid; tidak ada priority/progress/status.
**DoD:** Komponen Card patuh [05-FRONTEND §4](docs/05-FRONTEND.md).

---

## TASK-7.7 — Card Detail (Sheet / full-screen mobile)

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 7.7.1 | ⏸️ | 0 | Tab Details: description, assignee, due date, labels, **current List** (bukan "status") | [05-FRONTEND §4,§5](docs/05-FRONTEND.md) | 7.6.1 |
| 7.7.2 | ⏸️ | 0 | Tab Activity: timeline immutable | [02-SPEC A.8](docs/02-SPEC.md) | 7.8.1 |
| 7.7.3 | ⏸️ | 0 | Comments: add + edit (tanpa delete); tolak pada card deleted/archived | [02-SPEC A.9](docs/02-SPEC.md), [BR-033](docs/02-SPEC.md) | 7.7.1 |
| 7.7.4 | ⏸️ | 0 | Edit field via generic update (hanya field mutable, bukan list_id/version) | [02-SPEC C.8, C.15](docs/02-SPEC.md) | 7.7.1 |

**Test:** "current List" tidak dimodelkan sebagai status; comment tak bisa dihapus & ditolak pada card non-active; PATCH tak bisa ubah field domain.
**DoD:** Card Detail patuh domain; tidak ada priority/progress.

---

## TASK-7.8 — Activity timeline

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 7.8.1 | ⏸️ | 0 | Timeline historis grouped by day/time (audit, bukan notification feed) | [05-FRONTEND §5](docs/05-FRONTEND.md), [02-SPEC A.8](docs/02-SPEC.md) | 7.3.1 |
| 7.8.2 | ⏸️ | 0 | Render payload memakai konteks historis (nama List lama tetap tampil) | [03-ENG B.5](docs/03-ENGINEERING.md), [BR-028](docs/02-SPEC.md) | 7.8.1 |

**Test:** Activity read-only; entity terhapus tetap terbaca via payload historis.
**DoD:** Timeline = audit trail, immutable, bermakna historis.

---

## TASK-7.9 — Permission Groups UI (custom besar)

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 7.9.1 | ⏸️ | 0 | Editor Permission × Resource (Project/Milestone/Board/List/Card) | [02-SPEC Part D](docs/02-SPEC.md) | 7.3.1 |
| 7.9.2 | ⏸️ | 0 | Card visibility scope (All / Created by me / Assigned to me) | [02-SPEC A.11](docs/02-SPEC.md) | 7.9.1 |
| 7.9.3 | ⏸️ | 0 | Tampilkan inheritance; additive (tanpa DENY) | [02-SPEC A.10](docs/02-SPEC.md) | 7.9.1 |

**Test:** UI mencerminkan model Group (bukan RBAC Role→Permissions); scope & inheritance benar.
**DoD:** Permission UI patuh authorization model; tidak menyederhanakan jadi RBAC.

---

## TASK-7.10 — Members + Invitation

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 7.10.1 | ⏸️ | 0 | Tabel Members (User · Group · Status Active/Pending) — reuse table | [05-FRONTEND §5](docs/05-FRONTEND.md) | 7.3.1 |
| 7.10.2 | ⏸️ | 0 | Invite: Email + Permission Group (minimal; Group tentukan akses) | [02-SPEC C.13](docs/02-SPEC.md), [BR-050..052](docs/02-SPEC.md) | 7.10.1 |

**Test:** Invite mengirim sesuai kontrak; accept → membership dengan Group benar (AC-025).
**DoD:** Members & Invitation patuh invitation flow.

---

## TASK-7.11 — API Keys & PAT

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 7.11.1 | ⏸️ | 0 | API Keys (Project Settings): list · create (secret sekali tampil) · revoke | [02-SPEC C.14](docs/02-SPEC.md), [09/Sec C.2](docs/03-ENGINEERING.md) | 7.3.1 |
| 7.11.2 | ⏸️ | 0 | PAT (User Settings): list · create · revoke; terpisah dari Project | [02-SPEC C.14](docs/02-SPEC.md) | 7.3.1 |

**Test:** Secret hanya tampil sekali; revoke berfungsi; PAT di User Settings bukan Project.
**DoD:** Credential UI patuh security model.

---

## TASK-7.12 — Command palette

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 7.12.1 | ⏸️ | 0 | ⌘K: navigasi (Project/Board/My Tasks) + aksi (Create/Move/Archive Card) | [05-FRONTEND §3.1](docs/05-FRONTEND.md) | 7.3.1 |

**Test:** Aksi command memanggil domain command yang benar (bukan shortcut yang mem-bypass rule).
**DoD:** Command palette berfungsi & konsisten dengan permission/lifecycle.

---

## TASK-7.13 — Lifecycle UI (archive/delete/restore + child handling)

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 7.13.1 | ⏸️ | 0 | Modal child-handling (archive/delete/move) untuk parent | [04-DELIVERY A.4](docs/04-DELIVERY.md), [02-SPEC A.4](docs/02-SPEC.md) | 7.5.1 |
| 7.13.2 | ⏸️ | 0 | Move destination hanya ACTIVE & (untuk List) Milestone sama; Project tanpa move | [INV-MOVE-002](docs/02-SPEC.md), [BR-015](docs/02-SPEC.md) | 7.13.1 |
| 7.13.3 | ⏸️ | 0 | Restore: tolak jika ancestor belum ACTIVE (+ shortcut "restore parent first") | [04-DELIVERY A.5](docs/04-DELIVERY.md), [INV-LIFE-002](docs/02-SPEC.md) | 7.13.1 |
| 7.13.4 | ⏸️ | 0 | Archived/Deleted view (read-only sesuai permission) | [02-SPEC A.3](docs/02-SPEC.md) | 7.13.1 |

**Test:** Opsi move tidak muncul untuk Project & Card; restore ditolak saat ancestor non-active; destroy child selalu konfirmasi eksplisit.
**DoD:** Lifecycle UI patuh child-handling & ancestor-chain rules; tidak ada silent data loss.

---

## TASK-7.14 — Responsive / mobile

| ID | Status | % | Goal Description | Reference | Dependency |
|---|:--:|:--:|---|---|---|
| 7.14.1 | ⏸️ | 0 | Desktop `Sidebar|Board`, Tablet collapsed sidebar | [05-FRONTEND §7](docs/05-FRONTEND.md) | 7.5.1 |
| 7.14.2 | ⏸️ | 0 | Mobile: List horizontal-scroll; Card detail full-screen | [05-FRONTEND §7](docs/05-FRONTEND.md) | 7.7.1 |

**Test:** Mobile tidak menumpuk kolom vertikal; card detail full-screen.
**DoD:** Responsive sesuai [05-FRONTEND §7](docs/05-FRONTEND.md).

---

## Exit Criteria Phase 7
- Semua layar utama ([05-FRONTEND §5](docs/05-FRONTEND.md)) terimplementasi & patuh UI↔Domain reconciliation ([05-FRONTEND §4](docs/05-FRONTEND.md)).
- Tidak ada field non-MVP di UI (priority/progress-card/status/inbox).
- Semua mutasi lewat domain command + optimistic locking + permission; `VERSION_CONFLICT` ditangani benar.
- Lifecycle UI (child handling, restore dependency) patuh invariant.
- Responsive desktop/tablet/mobile.

## Flag
- Task di file ini adalah outline; **refresh terhadap state repo nyata saat Phase 7 dibuka** (C.6).
- Tidak ada `[NEEDS-SPEC-AMENDMENT]` — konflik mockup sudah direkonsiliasi di [05-FRONTEND §4](docs/05-FRONTEND.md).

---

## Closure Log

> Isi tiap kali sebuah goal pindah status. Tambah entry terbaru di atas. Entry `⚠️`/`⏸️→` wajib mencantumkan alasan.

```
<a id="cl-01"></a>
### CL-01 — YYYY-MM-DD · <ID goal> <status baru>
**Bukti:** <output command / log / screenshot yang bisa diverifikasi ulang>
**Catatan:** <penyimpangan dari Scope asli, atau alasan gagal jika ⚠️>
```

<!-- Entry pertama akan muncul saat Gate pembuka terpenuhi & Phase 7 dibuka. -->

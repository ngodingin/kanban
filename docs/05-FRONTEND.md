# 05 — FRONTEND (Design System · Template Foundation · UI↔Domain Mapping)

> Status: **Content ready — IMPLEMENTASI BLOCKED.** Pekerjaan frontend (PHASE-7-TASKS.md) TIDAK dimulai sebelum Phase 0–6 selesai & terverifikasi.
> Related: 01-PRODUCT.md, 02-SPEC.md, 03-ENGINEERING.md, 04-DELIVERY.md (Part A UX Flows)
> SOT version: 1.0.4

---

## 1. Prinsip

- **SOT menang atas template & mockup.** Template hanya UI/UX foundation + engineering patterns. Tidak boleh ada keputusan visual yang mengubah Project isolation, Permission Group, Card visibility, lifecycle, Activity, atau aturan domain lain.
- **UI tidak boleh memperkenalkan field domain baru.** Kalau mockup menampilkan sesuatu yang tidak ada di 02-SPEC, itu dibuang dari UI — bukan ditambahkan ke domain (kecuali lewat amandemen SOT sadar).
- **Visual personality:** clean, compact, modern, developer-oriented, low visual noise, high information density. Bukan consumer app yang terlalu rounded/colorful.

---

## 2. Design Tokens

### 2.1 Warna (neutral-first)
Palette dari mockup nyaris 1:1 dengan Tailwind slate + indigo → shadcn default dengan primary indigo sudah sangat dekat.

| Token semantik | Hex | Padanan Tailwind | Penggunaan |
|---|---|---|---|
| primary | `#6366F1` | indigo-500 | aksi utama, selected state |
| primary-active | `#4F46E5` | indigo-600 | hover/active primary |
| foreground | `#1E293B` | slate-800 | teks utama |
| muted-foreground | `#64748B` | slate-500 | metadata, teks sekunder |
| border / muted | `#E2E8F0` | slate-200 | garis, background muted |
| success | `#10B981` | emerald-500 | status positif (mis. progress selesai) |
| warning | `#F59E0B` | amber-500 | peringatan, due mendekat |
| destructive | `#EF4444` | red-500 | delete, error, conflict |

Warna dipakai untuk **status/semantic**, bukan dekorasi. Jangan beri setiap List warna mencolok.

### 2.2 Typografi — Inter
| Level | Size/Line | Weight |
|---|---|---|
| Heading 1 | 32/40 | Bold |
| Heading 2 | 24/32 | Semi Bold |
| Heading 3 | 20/28 | Semi Bold |
| Body | 14/20 | Regular |
| Small | 12/16 | Regular |

Metadata dibuat lebih subtle (muted-foreground + Small).

### 2.3 Shape & density
Radius: `sm` → controls · `md` → cards · `lg` → dialogs/sheets. Tidak terlalu rounded. Density tinggi (kanban butuh banyak info per layar).

---

## 3. Template Foundation

**Foundation:** Kiranism `next-shadcn-dashboard-starter` (Next.js 16, React 19, TypeScript, Tailwind v4, shadcn/ui, feature-based, React Query, Zustand, forms, tables, command palette, kanban drag-and-drop bawaan).

Alasan: struktur teknis paling dekat dengan kebutuhan; bukan untuk ditiru visualnya. Pertahankan ~80% infrastructure/UI foundation, hanya ~20–30% demo/domain screens (di-rework).

### 3.1 Keep / Customize / Remove

| Area template | Keputusan |
|---|---|
| UI primitives (shadcn/ui) | **KEEP** — jangan diutak-atik banyak; hanya set spacing/typography/radius/colors/density |
| App shell (sidebar+header+content) | **KEEP** |
| Sidebar / Header | **CUSTOM** — context-aware (Project navigation) |
| Drag & drop | **KEEP + CUSTOM** — untuk Card/List movement |
| Tables | **KEEP** — Members / API Keys / Groups |
| Forms / Dialog / Sheet | **KEEP + CUSTOM** |
| Command palette (kbar) | **KEEP** |
| Theme system | **KEEP + ADAPT** (tokens §2) |
| React Query | **KEEP** — semua server state |
| Zustand | **KEEP TERBATAS** — UI/interaction/drag/sidebar/command-palette saja; **bukan** database lokal seluruh app |
| Kanban demo | **REWORK** → Board/List/Card domain |
| Dashboard demo | **REWORK** → work-management Home |
| Users demo | **REWORK** → Project Members |
| Roles demo | **REWORK BESAR** → Permission Groups (bukan RBAC sederhana) |
| **Clerk (auth)** | **BUANG** — kita pakai Auth.js + model User/Membership/Permission sendiri (03-ENG A.14). Clerk Organization ≠ Kanban Project |
| Billing / CRM / Finance / E-commerce / Analytics / Chat / Invoice / Calendar / Academy / Logistics / Blog / demo API / demo org/roles/users | **BUANG** — jalankan cleanup script |

### 3.2 Data flow
```text
UI → Feature hook → React Query → API client → Kanban backend
```
Contoh hooks: `useBoard`, `useCards(listId)`, `useCreateCard`, `useMoveCard`, `useArchiveCard`, `useRestoreCard`. API layer terpisah dari UI; backend tetap mengikuti 02-SPEC Part C.

---

## 4. UI ↔ Domain Reconciliation (WAJIB dipatuhi)

Hasil rekonsiliasi mockup terhadap SOT. **UI MUST mengikuti kolom "Resolusi", bukan mockup.**

| Elemen mockup | Status domain | Resolusi | Ref |
|---|---|---|---|
| **Priority: High** pada card | Tidak ada di domain | **BUANG dari UI.** Card tidak punya priority. Non-goal. | [01-PRODUCT §2.2](01-PRODUCT.md) |
| **Progress bar** pada card | Card progress dihapus (v1.0.4) | **BUANG dari UI.** Progress hanya untuk **Milestone** (0–100 manual). | [01-PRODUCT §2.1](01-PRODUCT.md) |
| **"Status: In Progress"** di card detail | Card tidak punya status | **Display-only = nama List saat ini** (turunan `list_id`). JANGAN buat field/aksi `card.status`. Ganti label jadi "List". | [02-SPEC A.3](02-SPEC.md), [01-PRODUCT §2.2](01-PRODUCT.md) |
| **Inbox (badge 3)** di sidebar | Notification = non-goal | **BUANG dari sidebar MVP.** Cukup Home / My Tasks / Activity. | [01-PRODUCT §2.2](01-PRODUCT.md) |
| Milestone progress | Ada (Milestone) | **KEEP** — progress bar hanya di level Milestone. | [02-SPEC FR-014](02-SPEC.md) |
| Single assignee | Ada | **KEEP** — satu avatar; multiple assignee non-goal. | [02-SPEC A.6](02-SPEC.md) |
| Labels (backend/auth/…) | Ada (Board/Milestone Label) | **KEEP** | [02-SPEC A.11 Labels](02-SPEC.md) |
| Activity timeline | Ada (immutable) | **KEEP** — sebagai audit timeline, bukan notification feed. | [02-SPEC A.8](02-SPEC.md) |

---

## 5. Layar Utama (ringkas — detail di PHASE-7-TASKS.md)

- **App shell:** sidebar (Home · My Tasks · Activity · PROJECTS ▾ · Members · Permissions · API Keys · Settings) + header (breadcrumb Project › Milestone › Board). Branding "Kanban — Powered by NGodingiN" di login/register/sidebar-bawah/footer saja.
- **Home/Dashboard:** work-management style ("Your work": My Tasks / Due soon / Overdue · Recent Projects · Recent Activity). BUKAN admin panel (revenue/charts).
- **Board:** kolom = List (nama bebas), header kolom tampilkan count. Card compact. Drag & drop → panggil move API (bukan ubah state lokal saja). "Review"/"Done" hanyalah nama List, tanpa makna sistem.
- **Card (compact):** title · description preview · labels · assignee · due date. TANPA priority, TANPA progress, TANPA status field.
- **Card Detail (Sheet besar desktop / full-screen mobile):** Details (description, assignee, due date, labels, **current List** — bukan "status") + Activity timeline + Comments. TANPA priority/progress.
- **Permission Groups (custom besar):** Permission × Resource × Scope × Inheritance + Card visibility (All / Created by me / Assigned to me). BUKAN RBAC "Role → Permissions".
- **Members:** tabel (User · Group · Status Active/Pending) + Invite. Reuse table foundation.
- **Invitation:** minimal — Email + Permission Group (+ Card access bila perlu). Group menentukan akses.
- **Activity:** timeline historis (grouped by day/time), bukan notification feed.
- **API Keys (Project Settings):** tabel + create (secret sekali tampil) + revoke.
- **PAT (User Settings):** tabel + create + revoke. Terpisah dari Project.
- **Lifecycle UI:** archive/delete/restore + **modal child-handling** (archive/delete/move; move destination hanya ACTIVE & Milestone sama; Project tanpa move). Tangani `VERSION_CONFLICT` dengan pesan + reload (jangan auto-overwrite). Ref UX: [04-DELIVERY Part A](04-DELIVERY.md).

---

## 6. Struktur Frontend

```text
features/
├── auth/  dashboard/  projects/  milestones/  boards/  lists/  cards/
├── activity/  comments/  members/  permissions/  invitations/
├── api-keys/  personal-access-tokens/  settings/
components/
├── ui/  layout/  kanban/  dialogs/  navigation/
```

---

## 7. Responsive
- Desktop: `Sidebar | Board`. Tablet: `collapsed sidebar | Board`. Mobile: header + project context, List horizontal-scroll (`← Todo | In Progress | Done →`), Card detail full-screen.
- Jangan tumpuk kolom vertikal di mobile (terlalu panjang).

---

## 8. Governance Frontend
- Setiap komponen yang menampilkan data domain MUST memetakan ke field yang ADA di 02-SPEC. Menemukan kebutuhan field baru → `[NEEDS-SPEC-AMENDMENT]`, berhenti, jangan tambah diam-diam.
- Drag & drop, quick-edit, dsb tetap lewat domain command API (move/archive/…), tunduk optimistic locking (`expected_version`) & permission — UI tidak boleh mem-bypass business rule.
- **Implementasi frontend BLOCKED sampai Phase 0–6 selesai & terverifikasi** (lihat PHASE-7-TASKS.md).

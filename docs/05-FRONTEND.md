# 05 — FRONTEND (Design System · React/Vite Foundation · UI↔Domain Mapping)

> Status: **Gate dibuka 2026-08-25.** Pekerjaan frontend ([PHASE-7-TASKS.md](../PHASE-7-TASKS.md)) sekarang actionable — lihat Review-CL-05 di file itu.
> Related: 01-PRODUCT.md, 02-SPEC.md, 03-ENGINEERING.md, 04-DELIVERY.md (Part A UX Flows)
> SOT version: 4.2.0

---

## 1. Prinsip

- **SOT menang atas scaffold & mockup.** Scaffold/tooling hanya UI/UX foundation + engineering patterns. Tidak boleh ada keputusan visual yang mengubah Project isolation, Permission Group, Card visibility, lifecycle, Activity, atau aturan domain lain.
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

## 3. Frontend Foundation

**Foundation:** React **19.2.x** + Vite **8.x** SPA dengan React Router **8.x**, TypeScript **6.0.x**, Tailwind CSS **4.x**, shadcn **4.x**, TanStack Query **5.x**, Zustand **5.x**, dan dnd-kit core **6.x**; lihat [03-ENGINEERING A.8](03-ENGINEERING.md). Gunakan scaffold resmi Vite dan shadcn primitives; tidak ada starter dashboard pihak ketiga yang menjadi sumber domain atau arsitektur.

Versi exact dependency UI MUST diverifikasi ulang dan dipin ketika gate Phase 7 dibuka. Phase 0 tidak boleh memasang dependency UI hanya untuk mengejar baseline ini.

Alasan: Kanban adalah aplikasi interaktif setelah login dan tidak membutuhkan SSR/SEO sebagai kebutuhan MVP. SPA menjaga web sebagai client murni terhadap public API Hono, sementara shadcn menyediakan primitives tanpa membawa demo domain, auth vendor, atau asumsi dashboard yang harus dibersihkan.

### 3.1 Gunakan / Bangun / Jangan Tambahkan

| Area | Keputusan |
|---|---|
| UI primitives (shadcn/ui) | **GUNAKAN** — adapt spacing/typography/radius/colors/density melalui tokens |
| App shell, Sidebar, Header | **BANGUN** — context-aware terhadap Project/Milestone/Board |
| Drag & drop | **BANGUN dengan dnd-kit** — hanya Card movement; List tidak dapat dipindahkan pada MVP |
| Tables | **BANGUN dari shadcn primitives** — Members / API Keys / Groups |
| Forms / Dialog / Sheet | **BANGUN dari shadcn primitives** |
| Command palette | **OPSIONAL dalam MVP UI** — hanya navigasi/aksi yang sudah ada; bukan search engine |
| Theme system | **BANGUN** dari tokens §2 |
| TanStack Query | **GUNAKAN** — semua server state |
| Zustand | **GUNAKAN TERBATAS** — UI/interaction/drag/sidebar/command-palette saja; **bukan** database lokal seluruh app |
| Better Auth client | **GUNAKAN** hanya untuk identity/session/Magic Link; authorization tetap melalui API domain |
| Clerk/identity SaaS, role template, billing/CRM/analytics/chat/invoice/calendar/demo domain | **JANGAN TAMBAHKAN** |

### 3.2 Data flow
```text
UI → Feature hook → TanStack Query → same-origin API client → Hono API → domain
```
Contoh hooks: `useBoard`, `useCards(listId)`, `useCreateCard`, `useMoveCard`, `useArchiveCard`, `useRestoreCard`. API layer terpisah dari UI; backend tetap mengikuti 02-SPEC Part C.

---

## 4. UI ↔ Domain Reconciliation (WAJIB dipatuhi)

Hasil rekonsiliasi mockup terhadap SOT. **UI MUST mengikuti kolom "Resolusi", bukan mockup.**

| Elemen mockup | Status domain | Resolusi | Ref |
|---|---|---|---|
| **Priority: High** pada card | Tidak ada di domain | **BUANG dari UI.** Card tidak punya priority. Non-goal. | [01-PRODUCT §2.2](01-PRODUCT.md) |
| **Progress bar** pada card | Card progress dihapus (v1.0.4) | **BUANG dari UI.** Progress hanya untuk **Milestone** (0–100 manual). | [01-PRODUCT §2.1](01-PRODUCT.md) |
| **"Status: In Progress"** di card detail | Card tidak punya status | **Display-only = nama List saat ini** (turunan `listId` pada JSON response; `list_id` hanya nama kolom database). JANGAN buat field/aksi `card.status`. Ganti label jadi "List". | [02-SPEC A.3](02-SPEC.md), [01-PRODUCT §2.2](01-PRODUCT.md) |
| **Inbox (badge 3)** di sidebar | Notification = non-goal | **BUANG dari sidebar MVP.** Cukup Home / My Tasks / Activity. | [01-PRODUCT §2.2](01-PRODUCT.md) |
| Milestone progress | Ada (Milestone) | **KEEP** — progress bar hanya di level Milestone. | [02-SPEC FR-014](02-SPEC.md) |
| Single assignee | Ada | **KEEP** — satu avatar; multiple assignee non-goal. | [02-SPEC A.12](02-SPEC.md), [02-SPEC FR-026](02-SPEC.md) |
| Labels (backend/auth/…) | Ada (Board/Milestone Label) | **KEEP** | [02-SPEC B.8/C.11](02-SPEC.md) |
| Activity timeline | Ada (immutable) | **KEEP** — sebagai audit timeline, bukan notification feed. | [02-SPEC A.8](02-SPEC.md) |

---

## 5. Layar Utama (ringkas — detail di PHASE-7-TASKS.md)

- **Authentication:** satu form email untuk meminta Magic Link. UI final menangani state request, link terkirim, expired/used link, dan error tanpa membocorkan keberadaan akun. Tidak ada form password atau halaman register terpisah pada MVP.
- **App shell:** sidebar (Home · My Tasks · Activity · PROJECTS ▾ · Members · Permissions · API Keys · Settings) + header (breadcrumb Project › Milestone › Board). Branding "Kanban — Powered by NGodingiN" di layar autentikasi/sidebar-bawah/footer saja.
- **Home/Dashboard:** work-management style ("Your work": My Tasks / Due soon / Overdue · Recent Projects · Recent Activity). BUKAN admin panel (revenue/charts).
- **Board:** kolom = List (nama bebas), header kolom tampilkan count. Card compact. Drag & drop Card → panggil Card move API (bukan ubah state lokal saja). List tetap pada Board asal dan tidak dapat di-drag untuk dipindahkan. "Review"/"Done" hanyalah nama List, tanpa makna sistem.
- **Card (compact):** title · description preview · labels · assignee · due date. TANPA priority, TANPA progress, TANPA status field.
- **Card Detail (Sheet besar desktop / full-screen mobile):** Details (description, assignee, due date, labels, **current List** — bukan "status") + Activity timeline + Comments. TANPA priority/progress.
- **Permission Groups (custom besar):** definisi Group + scoped assignment ke Membership + direct Permission + inheritance. Card visibility: Created by me (default) / Assigned to me (created OR assigned) / All. BUKAN RBAC "Role → Permissions".
- **Members:** tabel (User · Group · Status Active/Pending) + Invite. Reuse table foundation.
- **Invitation:** Email + Permission Group + hierarchy scope wajib. Accept membuat Membership dan scoped Group assignment.
- **Activity:** timeline historis (grouped by day/time), bukan notification feed.
- **API Keys (Project Settings):** tabel + create (secret sekali tampil) + revoke.
- **PAT (User Settings):** tabel + create + revoke. Terpisah dari Project.
- **Lifecycle UI:** archive/delete/restore tanpa child handling. Archive restorable; delete terminal. Parent transition tidak mengubah local state descendant tetapi menonaktifkan subtree secara efektif. Tangani `VERSION_CONFLICT` dengan pesan + reload. Ref UX: [04-DELIVERY Part A](04-DELIVERY.md).

Testing frontend: Vitest + React Testing Library untuk React component/hook; Playwright untuk routing, Magic Link, dan alur E2E pada production build Vite yang disajikan bersama Hono.

---

## 6. Struktur Frontend

```text
apps/web/src/
├── features/
│   ├── auth/  dashboard/  projects/  milestones/  boards/  lists/  cards/
│   ├── activity/  comments/  members/  permissions/  invitations/
│   └── api-keys/  personal-access-tokens/  settings/
├── components/
│   └── ui/  layout/  kanban/  dialogs/  navigation/
├── routes/
└── lib/api/
```

---

## 7. Responsive
- Desktop: `Sidebar | Board`. Tablet: `collapsed sidebar | Board`. Mobile: header + project context, List horizontal-scroll (`← Todo | In Progress | Done →`), Card detail full-screen.
- Jangan tumpuk kolom vertikal di mobile (terlalu panjang).

---

## 8. Governance Frontend
- Setiap komponen yang menampilkan data domain MUST memetakan ke field yang ADA di 02-SPEC. Menemukan kebutuhan field baru → `[NEEDS-SPEC-AMENDMENT]`, berhenti, jangan tambah diam-diam.
- Drag & drop Card, quick-edit, dan aksi lifecycle tetap lewat domain command API, tunduk optimistic locking (`expectedVersion`) & permission — UI tidak boleh mem-bypass business rule.
- **Implementasi frontend actionable sejak gate dibuka 2026-08-25** (lihat [PHASE-7-TASKS.md](../PHASE-7-TASKS.md)).

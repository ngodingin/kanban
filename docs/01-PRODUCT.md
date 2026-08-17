# 01 — PRODUCT

> Project codename: **NGodingin Kanban**
> Type: Project Management / Kanban Platform (API-based, multi-tenant via Project isolation)
> Status: MVP Baseline — Source of Truth (SOT)
> Version: 1.0.0

---

# PART 0 — Documentation Index & Governance

## 0.1 Struktur SOT

Dokumentasi ini adalah **Source of Truth (SOT)** untuk pengembangan MVP NGodingin Kanban. Terdiri dari 4 file:

| File | Isi | Untuk siapa |
|---|---|---|
| **01-PRODUCT.md** (dokumen ini) | Index, governance, vision, PRD, user stories | PM, stakeholder, semua orang |
| **02-SPEC.md** | Functional requirements, business rules/invariants, API contract | **Wajib** dibaca AI coding agent & developer |
| **03-ENGINEERING.md** | Architecture, database design, security, deployment | Developer, DevOps |
| **04-DELIVERY.md** | UX flows, testing strategy, task breakdown | Developer, QA, PM |
| **05-FRONTEND.md** | Design tokens, template foundation, UI↔domain mapping (implementasi *blocked* sampai Phase 0–6 selesai) | Frontend developer |

Urutan baca yang direkomendasikan: **01 → 02 → 03 → 04**.

AI coding agent yang mengerjakan implementasi **wajib** membaca minimal `02-SPEC.md` dan `03-ENGINEERING.md` secara penuh sebelum menulis kode apa pun.

## 0.2 Otoritas Dokumen

Jika kode, UI, atau asumsi developer/AI agent bertentangan dengan dokumen ini, **dokumen ini yang menang**, sampai dokumen diperbarui secara sadar melalui proses amandemen.

Konflik spesifikasi MUST diselesaikan dengan urutan:

```text
1. Identifikasi aturan yang bermasalah/konflik
2. Tentukan perilaku yang seharusnya
3. Amandemen dokumen terkait (terutama 02-SPEC.md)
4. Update test yang terpengaruh
5. Baru ubah implementasi
```

AI coding agent **MUST NOT** menyelesaikan konflik spesifikasi dengan memilih perilakunya sendiri secara diam-diam.

## 0.3 Status Kematangan

| Area | Status |
|---|---|
| Domain & Business Invariants | Locked for MVP |
| Database Schema | Draft v1 (nama tabel/kolom dapat berubah, semantik terkunci) |
| API Contract | Locked untuk struktur; detail response boleh berkembang |
| Authorization Model | Locked for MVP |
| Deployment topology | Sebagian dikunci (v1.0.1) — provider database pending POC gate |
| Stack keputusan (ID, ORM, DB provider) | Locked v1.0.1 — lihat 03-ENGINEERING A.8, A.11–A.13 |
| Authentication (web session) | Locked v1.0.3 — Auth.js, user di Global DB (A.14) |
| Payload `activities.data` | Locked v1.0.2 — konvensi B.5 |

## 0.4 Versioning

```text
SPEC_VERSION = 1.0.4
```

- Perubahan pada business invariant, authorization semantics, lifecycle, API behavior, atau data model semantics → wajib update versi.
- `1.0.x` (patch) — klarifikasi/keputusan implementasi tanpa mengubah semantik domain.
- `1.x.0` (minor) — penambahan kapabilitas backward-compatible.
- `x.0.0` (major) — perubahan domain/API yang breaking.

### Changelog
- **1.0.4** — Rekonsiliasi UI mockup ↔ domain. **Card progress dihapus** dari scope MVP (progress hanya milik Milestone) — memperbaiki inkonsistensi PRD. **Card priority** & **Inbox/notification** ditegaskan sebagai non-goal (muncul di mockup, tidak masuk domain). Menambah dokumen frontend **docs/05-FRONTEND.md** (design tokens + template mapping + rekonsiliasi UI). Task UI ada di **PHASE-7-TASKS.md** — *blocked* sampai Phase 0–6 selesai & terverifikasi. Tidak ada perubahan pada business invariant/authorization/lifecycle/API.
- **1.0.3** — Mengunci **Authentication**: Auth.js (NextAuth) untuk web session dengan user tetap di Global DB (03-ENGINEERING A.14); API Key/PAT tidak berubah. Menutup blocker Phase 0 terakhir. Sisa open decision tinggal non-blocker (indexing detail, retention policy, pemilihan provider identitas di dalam Auth.js).
- **1.0.2** — Mengunci konvensi baku **`activities.data`** (03-ENGINEERING B.5). Menambah **sequence diagram child handling** (03-ENGINEERING A.6.1) untuk area paling rawan bug.
- **1.0.1** — Mengunci 3 keputusan implementasi: Format ID → **ULID** (03-ENGINEERING A.13), ORM → **Drizzle** (A.12), Database provider → **Turso/libSQL pending POC gate** (A.11). Menambah **Part F — Operations** di 03-ENGINEERING. Menambah diagram mermaid: ERD Global & Project DB (03-ENGINEERING B.6) dan state machine lifecycle (02-SPEC A.3).
- **1.0.0** — Baseline SOT awal (konsolidasi dari planning session).

---

# PART 1 — Product Vision

## 1.1 Ringkasan

NGodingin Kanban adalah aplikasi **project management / Kanban sederhana, dinamis, dan API-based**.

Prinsip inti:

> **Simple by default, flexible by design.**

Aplikasi tidak memaksakan workflow tertentu kepada penggunanya. Tidak ada asumsi bahwa List bernama "Done" berarti pekerjaan selesai secara sistem — makna workflow sepenuhnya ditentukan user.

## 1.2 Masalah yang Diselesaikan

Banyak tool Kanban memaksakan: semantic tetap pada kolom (Todo/In Progress/Done), status otomatis yang tidak selalu cocok, role system kaku (admin/member/guest), dan workflow engine berat untuk tim kecil.

NGodingin Kanban dirancang agar: struktur board/list sepenuhnya ditentukan user; permission dapat dikustomisasi per Project tanpa role hard-coded; setiap perubahan tercatat sebagai riwayat yang tidak bisa diubah; data setiap Project terisolasi penuh.

## 1.3 Target Pengguna

- Tim kecil-menengah yang butuh Kanban tanpa setup rumit.
- Tim yang butuh permission granular tanpa role system kaku.
- Developer/organisasi yang mengintegrasikan via API (API Key per Project, PAT per User).
- Tim yang mementingkan audit trail lengkap dan tak dapat dimanipulasi.

## 1.4 Struktur Domain Utama

```text
User
 │
 ├── Project A
 │    └── Milestone
 │         └── Kanban Board
 │              └── List
 │                   └── Card
 ├── Project B
 └── Project C
```

Hierarchy: `Project 1───N Milestone 1───N Board 1───N List 1───N Card`. Setiap level entity memiliki Activity (riwayat) sendiri.

## 1.5 Empat Prinsip Fundamental

1. **Project Isolation** — Project adalah hard isolation boundary. Tidak ada cross-project resource movement, tidak ada cross-project search di MVP.
2. **Dynamic Workflow** — List bukan Status. Tidak ada konsep universal "Done". Progress Milestone manual, tidak dihitung otomatis dari Card/List.
3. **Historical Integrity** — Activity append-only & immutable. Sistem tidak pernah menimpa riwayat — setiap perubahan jadi entry baru.
4. **Valid State Transition** — Setiap mutation tervalidasi terhadap current state sebelum commit. **"Last valid write wins"**, bukan sekadar "last write wins".

## 1.6 Definisi Kesuksesan MVP (Kualitatif)

- Tim dapat membuat Project, mengundang anggota, dan mulai bekerja tanpa konfigurasi rumit.
- Permission dapat diatur granular tanpa developer menambah role baru di kode.
- Setiap tindakan penting tercatat lengkap & dapat ditelusuri via Activity.
- Tidak ada race condition yang menyebabkan data korup atau silent overwrite.
- Sistem tetap sederhana dikembangkan lanjut oleh AI coding agent tanpa ambiguitas aturan bisnis.

---

# PART 2 — Product Requirements (PRD)

## 2.1 Scope MVP (26 Kapabilitas)

1. User authentication
2. Project
3. Project membership
4. Owner
5. Permission Group
6. Co-Owner sebagai Permission Group
7. Permission inheritance
8. Milestone
9. Board
10. List
11. Card
12. Card assignment
13. Card target/due date
14. Labels (Milestone Label & Board Label)
15. Archive
16. Delete
17. Restore
18. Parent-child handling (archive/delete/move children)
19. Card movement (antar List / antar Board dalam Milestone sama)
20. Activity (audit trail)
21. Comment
22. API Key
23. Personal Access Token (PAT)
24. Invitation
25. Optimistic locking (concurrency)
26. Pull/refresh synchronization

> Catatan (v1.0.4): **Card progress dihapus dari scope** — progress hanya milik Milestone (manual 0–100). Card tidak memiliki field progress. Lihat changelog § 0.4.

## 2.2 Non-Goals (Eksplisit di Luar MVP)

Cross-project entity transfer · Milestone Status · List Status · **Card progress/status** · **Card priority** · Real-time synchronization (WebSocket/SSE) · Notification infrastructure (termasuk Inbox) · DENY-based authorization / policy engine kompleks · Field-level permission / ABAC arbitrer · Search engine khusus / cross-project search · Complex workflow automation · Background job framework (kecuali kebutuhan internal minimal) · Mandatory external event bus · Multiple assignee per Card · Manual Card ordering · Physical delete langsung oleh user (delete = logical, retention dulu) · Penghapusan comment · Board settings lanjutan (warna, ikon, WIP limit).

> Fitur ini **boleh** ditambahkan lewat revisi spesifikasi, tetapi **tidak boleh** diam-diam masuk MVP oleh implementasi/AI agent.

## 2.3 Aktor / Peran

| Aktor | Deskripsi |
|---|---|
| **Owner** | Pemilik Project. Ownership property, bukan role. Selalu punya kontrol penuh. |
| **Co-Owner** | Permission Group dengan kapabilitas sangat luas, tetap tunduk pada permission group-nya (bukan Owner kedua). |
| **Manager** | Mengelola struktur (Milestone/Board/List) dan Card. |
| **Contributor** | Mengerjakan Card (create/update/move/comment) sesuai scope visibility. |
| **Viewer** | Hanya melihat data. |
| **API Key holder** | Akses ke satu Project via credential Project-scoped. |
| **PAT holder** | Akses ke beberapa Project sesuai membership, via credential User-scoped. |

Manager/Contributor/Viewer adalah *baseline group*, bukan hard-coded role — Project dapat mengonfigurasi permission masing-masing.

## 2.4 Ringkasan Perilaku Fitur

- **Project** — Root & isolation boundary. Satu Owner. Lifecycle Active/Archived/Deleted. Tanpa "Move children".
- **Milestone** — `progress` manual (0–100), `start_date`, `due_date`. Tanpa status.
- **Board** — Container sederhana di bawah Milestone. Tanpa status/warna/ikon/WIP limit di MVP.
- **List** — Container Card, tanpa semantic/status bawaan. Tidak dapat dihapus selama masih punya Card.
- **Card** — Entity utama. Title, subtitle, description, due date, satu creator (historical), maks satu assignee (operational, dapat null), label, activity. Leaf entity — tanpa child handling.
- **Card Movement** — Antar List, dan antar Board **hanya jika** Board tujuan berada dalam Milestone sama. Tidak boleh lintas Project.
- **Label** — Dua scope: Milestone Label & Board Label. Asosiasi Label-Card punya riwayat (`created_at`/`removed_at`), tidak dihapus fisik.
- **Activity & Comment** — Setiap entity punya Activity append-only immutable. Comment bagian dari Activity Card — dapat dibuat & diedit, tidak dapat dihapus.
- **Lifecycle** — Semua entity utama: ACTIVE → ARCHIVED/DELETED → (restore) → ACTIVE, dengan aturan ancestor-chain.
- **Permission & Membership** — Berbasis Permission Group (bukan role hard-coded), additive (tanpa DENY), diwariskan sepanjang hierarchy, dengan scope Card (all/created_by_me/assigned_to_me).
- **Invitation** — Membership hanya via invitation yang sudah menentukan Permission Group sejak awal.
- **Credential** — API Key (Project-scoped) & PAT (User-scoped), keduanya punya expiration & revocation, disimpan sebagai hash.
- **Concurrency** — Optimistic locking berbasis `version` per entity. Prinsip: last **valid** write wins.

## 2.5 Batasan Teknis yang Memengaruhi Produk

- MVP tidak menyediakan realtime — client pakai pull/refresh.
- Tidak ada cross-project search — pencarian dibatasi konteks satu Project.
- Engine libSQL (SQLite-compatible), provider **Turso** (database-per-project) — dikunci v1.0.1 pending POC gate. ORM **Drizzle**, ID **ULID**. Detail & rationale di `03-ENGINEERING.md` A.8, A.11–A.13.

---

# PART 3 — User Stories

Format: "Sebagai [peran], saya ingin [aksi], sehingga [manfaat]."

## 3.1 Project & Membership

- **US-001** Sebagai user, saya ingin membuat Project baru, sehingga punya ruang kerja terisolasi untuk tim saya.
- **US-002** Sebagai Owner, saya ingin mengundang anggota dengan Permission Group tertentu, sehingga akses mereka langsung sesuai sejak bergabung.
- **US-003** Sebagai user yang diundang, saya ingin accept invitation, sehingga menjadi anggota aktif Project.
- **US-004** Sebagai Owner/Co-Owner, saya ingin mencabut membership seseorang, sehingga mereka tak lagi punya akses meski data historis mereka tetap tersimpan.
- **US-005** Sebagai Owner, saya ingin status Owner saya tidak hilang meski Permission Group saya diubah, sehingga tak pernah kehilangan kontrol Project sendiri.

## 3.2 Permission Group

- **US-006** Sebagai Co-Owner, saya ingin membuat Permission Group baru & menentukan permission-nya, sehingga bisa menyesuaikan akses sesuai struktur tim.
- **US-007** Sebagai Co-Owner, saya ingin menambah permission ke Group yang ada, sehingga semua anggota Group otomatis dapat kemampuan baru tanpa diubah satu-satu.
- **US-008** Sebagai Co-Owner, saya ingin menetapkan Permission Group pada level Project/Milestone/Board/List/Card, sehingga bisa memberi akses granular tanpa assignment individual per Card.

## 3.3 Milestone / Board / List

- **US-009** Sebagai Manager, saya ingin membuat Milestone dengan target tanggal & progress manual, sehingga bisa melacak pekerjaan besar tanpa status otomatis.
- **US-010** Sebagai Manager, saya ingin membuat Board di dalam Milestone, sehingga tim punya papan kerja terpisah per area.
- **US-011** Sebagai Contributor, saya ingin membuat List dengan nama bebas (mis. "Survey", "Vendor", "Material"), sehingga bisa merepresentasikan alur kerja apa pun.
- **US-012** Sebagai Manager, saya ingin menghapus List, tetapi sistem menolak jika masih ada Card, sehingga tidak kehilangan Card tak sengaja.

## 3.4 Card

- **US-013** Sebagai Contributor, saya ingin membuat Card di dalam List, sehingga bisa mencatat unit pekerjaan.
- **US-014** Sebagai Contributor, saya ingin menetapkan assignee pada Card, sehingga jelas penanggung jawabnya.
- **US-015** Sebagai Contributor, saya ingin memindahkan Card antar List dalam Board sama, sehingga bisa merepresentasikan progres sesuai definisi tim.
- **US-016** Sebagai Contributor, saya ingin memindahkan Card ke Board lain **selama masih dalam Milestone sama**, sehingga bisa reorganisasi lintas Board tanpa melanggar batas Milestone.
- **US-017** Sebagai user, saya ingin sistem menolak permintaan pindah Card jika Card sudah dipindahkan orang lain lebih dulu, sehingga tidak menimpa perubahan orang lain (concurrency safety).
- **US-018** Sebagai user, saya ingin tetap melihat creator sebuah Card walau membership pembuatnya sudah dicabut, sehingga riwayat historis akurat.

## 3.5 Label

- **US-019** Sebagai Manager, saya ingin membuat Label pada level Milestone agar bisa dipakai semua Board di dalamnya.
- **US-020** Sebagai Contributor, saya ingin membuat Label pada level Board untuk kategori spesifik Board tersebut saja.
- **US-021** Sebagai user, saya ingin tetap melihat Label lama pada riwayat Card meski Label sudah orphaned, sehingga histori tidak hilang.

## 3.6 Activity & Comment

- **US-022** Sebagai user, saya ingin melihat riwayat lengkap perubahan Card (dibuat, dipindahkan, di-assign, dsb), sehingga paham konteks historisnya.
- **US-023** Sebagai Contributor, saya ingin menambahkan comment ke Card, sehingga bisa berdiskusi dalam konteks pekerjaan tersebut.
- **US-024** Sebagai Contributor, saya ingin mengedit comment saya, dan sistem tetap menyimpan versi sebelumnya, sehingga transparansi terjaga.
- **US-025** Sebagai user, saya ingin sistem menolak comment baru pada Card yang sudah dihapus, sehingga data final tak dapat diubah lagi.

## 3.7 Lifecycle

- **US-026** Sebagai Manager, saya ingin mengarsipkan Board beserta isinya, sehingga data tersimpan tapi tidak lagi aktif.
- **US-027** Sebagai Manager, saya ingin memilih strategi child handling (archive/delete/move) saat menghapus Board, sehingga punya kendali penuh atas nasib List & Card.
- **US-028** Sebagai Manager, saya ingin memindahkan List dari Board yang akan dihapus ke Board lain, sehingga pekerjaan berjalan tidak ikut hilang.
- **US-029** Sebagai user, saya ingin sistem menolak restore List jika Board induknya masih Archived, sehingga hierarchy state konsisten.

## 3.8 Credential / API Access

- **US-030** Sebagai Co-Owner, saya ingin membuat API Key khusus Project saya, sehingga sistem eksternal bisa mengakses tanpa akun personal.
- **US-031** Sebagai user, saya ingin membuat Personal Access Token, sehingga bisa mengakses beberapa Project via API dengan satu credential.
- **US-032** Sebagai Co-Owner, saya ingin mencabut API Key yang bocor, sehingga akses tidak sah segera terhenti.

## 3.9 Visibility Card

- **US-033** Sebagai Contributor dengan scope `assigned_to_me`, saya hanya ingin melihat Card yang di-assign ke saya, sehingga tampilan tak penuh Card yang bukan tanggung jawab saya.
- **US-034** Sebagai Manager dengan scope `all`, saya ingin melihat seluruh Card dalam Board yang saya kelola, sehingga punya visibilitas penuh untuk mengelola tim.

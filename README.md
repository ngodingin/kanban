# NGodingin Kanban

Project management dan Kanban yang sederhana, fleksibel, API-first, serta terisolasi per Project.

> **Simple by default, flexible by design.**
>
> List tidak memiliki arti status bawaan. Setiap tim menentukan sendiri bentuk workflow-nya.

| Informasi | Nilai |
|---|---|
| **Status proyek** | Pra-implementasi — belum ada aplikasi yang dapat dijalankan |
| **Source of Truth** | `SPEC_VERSION 2.0.6` |
| **Fase aktif** | Phase 0 — Foundation |
| **Gate aktif** | POC Turso sebelum provider dan strategi provisioning dikunci permanen |
| **UI** | Phase 7, blocked sampai Phase 0–6 selesai dan terverifikasi |

## Tentang proyek

NGodingin Kanban dirancang untuk tim kecil hingga menengah yang membutuhkan struktur kerja fleksibel tanpa role hard-coded, workflow engine berat, atau semantic kolom yang dipaksakan sistem.

MVP mencakup:

- Project, membership, invitation, dan ownership;
- Permission Group serta direct Permission yang scoped dan diwariskan sepanjang hierarchy;
- Milestone, Board, List, Card, assignment, due date, dan Label;
- pemindahan Card antar-List atau antar-Board dalam Milestone yang sama;
- archive, restore, delete terminal, dan effective lifecycle melalui ancestor;
- Activity immutable, Comment, API Key, dan Personal Access Token;
- optimistic locking, validasi current state, dan isolasi lintas-Project.

Daftar lengkap 26 kapabilitas MVP dan non-goals tersedia di [Product Requirements](docs/01-PRODUCT.md).

## Domain model

```text
Project
└── Milestone
    └── Board
        └── List
            └── Card
```

Setiap Card tepat berada dalam satu List, setiap List dalam satu Board, dan setiap Board dalam satu Milestone. Resource tidak boleh melintasi batas Project.

Prinsip utamanya:

1. **Project isolation** — Project adalah hard security dan data boundary.
2. **Dynamic workflow** — List bukan Status; tidak ada konsep universal “Done”.
3. **Historical integrity** — Activity bersifat immutable dan append-only.
4. **Valid state transition** — setiap mutation memeriksa state saat ini dan memakai optimistic concurrency.
5. **Permission, bukan role** — akses berasal dari Permission Group dan direct Permission yang scoped, additive, dan tanpa DENY.
6. **Explicit lifecycle** — archive dapat dipulihkan; delete terminal hingga proses internal prune.

Invariant lengkap dan normatif terdapat di [02-SPEC.md](docs/02-SPEC.md).

## Arsitektur

```text
Client
  │
  ▼
Hono HTTP API
  │
  ├── Authentication & Identity
  ├── Membership & Permission Resolution
  └── Project Database Resolver
          │
          ├── Project A Database
          ├── Project B Database
          └── Project N Database

Global Database
  └── User, Project registry, Membership, Permission,
      Better Auth session/verification, Invitation,
      Credential, dan database mapping
```

Global DB berfungsi sebagai control plane dan registry akses. State transaksional Project—termasuk hierarchy, lifecycle, dan Activity—disimpan di Project DB. Mutation entity dan Activity terkait harus commit secara atomik dalam database yang sama.

Detail boundary dan rationale arsitektur tersedia di [03-ENGINEERING.md](docs/03-ENGINEERING.md).

## Stack teknologi

| Area | Teknologi | Baseline versi | Status |
|---|---|---:|---|
| Runtime / package manager | Node.js / pnpm | 24.x LTS / 11.x | Terkunci |
| API | Hono | 4.x stable | Terkunci |
| Web SPA | React / Vite | 19.2.x / 8.x | Phase 7; baseline terkunci |
| Language | TypeScript | 6.0.x | Terkunci; TS 7 menunggu kompatibilitas lint tooling |
| Database engine/provider | libSQL / Turso, database-per-project | Managed / POC | Default; menunggu POC gate |
| Database SDK | `@libsql/client` / `@tursodatabase/api` | 0.17.x / 2.0.x | Terkunci |
| ORM dan migration | Drizzle ORM / drizzle-kit | 0.45.x / 0.31.x | Terkunci |
| Validation / identifier | Zod / ULID | 4.x / 3.x | Terkunci |
| Web authentication | Better Auth / Resend | 1.6.x stable / 6.x | Terkunci; Magic Link + database-backed session |
| Unit/integration test | Vitest | 4.x | Terkunci |
| End-to-end test | Playwright | 1.62.x | Terkunci |
| Lint / format | ESLint / Prettier | 10.x / 3.x | Terkunci |
| Deployment target | Vercel | Managed | Direkomendasikan |

Versi exact awal dan kebijakan upgrade tersedia di [03-ENGINEERING.md §A.8](docs/03-ENGINEERING.md). Pemilihan selalu mengutamakan LTS terbaru yang terbukti kompatibel, atau stable terbaru jika teknologinya tidak memiliki LTS. Dependency langsung kemudian dipin exact dan lockfile pnpm wajib masuk repository agar clean install menghasilkan dependency graph yang sama.

## Status implementasi

Repository ini masih berada pada tahap dokumentasi dan persiapan. Belum ada `package.json`, source application, migration, atau perintah development yang valid. Jangan mengarang langkah instalasi sebelum goal bootstrap Phase 0 selesai.

Roadmap v1.0:

| Phase | Scope | Status |
|---:|---|---|
| 0 | Foundation Hono, database, Better Auth, request pipeline, test harness, CI | **Aktif** |
| 1 | Project, membership, invitation, baseline Permission Group | Menunggu Phase 0 |
| 2 | Milestone, Board, List, Card, dan Card movement | Menunggu Phase 1 |
| 3 | Label, Activity, dan Comment | Menunggu Phase 2 |
| 4 | Authorization, API Key, dan PAT | Menunggu Phase 3 |
| 5 | Lifecycle, retention, dan internal prune | Menunggu Phase 4 |
| 6 | Concurrency, validation, audit consistency, backup/recovery | Menunggu Phase 5 |
| 7 | Web UI | **Blocked** sampai Phase 0–6 terverifikasi |

## Dokumentasi proyek

Mulai dari [01-PRODUCT.md](docs/01-PRODUCT.md), lalu lanjutkan ke dokumen yang sesuai dengan kebutuhan:

1. [02-SPEC.md](docs/02-SPEC.md) untuk business rules, API contract, lifecycle, dan authorization;
2. [03-ENGINEERING.md](docs/03-ENGINEERING.md) untuk arsitektur, database, security, deployment, dan operations;
3. [04-DELIVERY.md](docs/04-DELIVERY.md) untuk UX flows, acceptance criteria, testing, dan roadmap;
4. [05-FRONTEND.md](docs/05-FRONTEND.md) untuk design system dan UI-to-domain mapping.

## Berkontribusi

Proyek masih berada pada tahap pra-implementasi. Sebelum mengajukan perubahan:

1. baca dokumen produk dan bagian SOT yang relevan;
2. pastikan perubahan tidak bertentangan dengan business rules, invariant, atau non-goals MVP;
3. ajukan perubahan spesifikasi terlebih dahulu jika perilaku yang dibutuhkan belum didefinisikan;
4. sertakan test positif dan negatif untuk implementasi yang mengubah perilaku;
5. jangan pernah memasukkan secret, credential, atau database lokal ke repository.

Perintah instalasi, development, dan testing akan ditambahkan setelah bootstrap Phase 0 selesai. Sampai saat itu, dokumentasi dalam repository ini adalah referensi utama proyek.

## Peta repository

```text
.
├── README.md             # Gerbang masuk publik
└── docs/
    ├── 01-PRODUCT.md     # Vision, governance, PRD, user stories
    ├── 02-SPEC.md        # Business rules, API, authorization
    ├── 03-ENGINEERING.md # Architecture, DB, security, operations
    ├── 04-DELIVERY.md    # UX, testing, roadmap, DoD
    └── 05-FRONTEND.md    # Design system dan UI mapping
```

## Canonical environment

Alamat berikut adalah keputusan konfigurasi; keberadaan deployment tidak boleh diasumsikan sebelum fase deployment selesai.

| Environment | Canonical origin |
|---|---|
| Production | `https://kanban.ngodingin.xyz` |
| Staging | `https://stag-kanban.ngodingin.xyz` |
| Magic Link sender | `noreply@kanban.ngodingin.xyz` |

## Source of Truth dan kontribusi

Dokumen dalam `docs/` adalah Source of Truth. Jika kode, UI, atau asumsi implementasi bertentangan dengan SOT, SOT yang berlaku sampai diamandemen secara sadar.

Perubahan pada business invariant, authorization, lifecycle, API behavior, atau data-model semantics harus:

1. disetujui oleh maintainer;
2. diamandemen pada dokumen terkait;
3. menaikkan `SPEC_VERSION` dan changelog;
4. memperbarui test yang terdampak;
5. baru diikuti perubahan implementasi.

Jika ditemukan konflik atau ambiguitas, buka pembahasan spesifikasi dan selesaikan keputusan tersebut sebelum mengubah implementasi.

## Non-goals MVP

Beberapa hal yang sengaja tidak dikerjakan pada MVP: realtime/WebSocket, notification infrastructure, cross-project search, DENY/ABAC policy engine, workflow automation, multiple assignee, Card priority/progress/status, pemindahan Milestone/Board/List, manual Card ordering, physical delete langsung oleh user, dan microservices.

Daftar normatif tersedia di [01-PRODUCT.md §2.2](docs/01-PRODUCT.md).

## Lisensi

Proyek ini dilisensikan di bawah [GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`). Jika Anda menjalankan versi modifikasi melalui jaringan, pengguna layanan tersebut harus memperoleh kesempatan untuk mengakses source code versi yang digunakan sesuai ketentuan lisensi.

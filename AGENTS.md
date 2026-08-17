# AGENTS.md — Operating Manual for AI Coding Agents

> Baca file ini **sepenuhnya** sebelum melakukan apa pun di repo ini.
> Ini adalah manual operasi untuk agent (dan kontributor manusia yang bekerja seperti agent).
> Aturan detail ada di SOT (`docs/`). File ini adalah entry point + aturan main yang tidak boleh dilanggar.

---

## 1. Apa proyek ini
**NGodingin Kanban** — platform project management / Kanban sederhana, dinamis, API-based, dengan isolasi per-Project (multi-tenant via database-per-project). Hierarki: `Project → Milestone → Board → List → Card`.

Status: **pra-implementasi**. Dokumentasi (SOT) sudah matang di versi 1.0.3. Kode belum ada — Phase 0 adalah bootstrapping.

Filosofi produk: **Simple by default, flexible by design.** Lihat [docs/01-PRODUCT.md](docs/01-PRODUCT.md).

---

## 2. Source of Truth (WAJIB dibaca sebelum menulis kode)

| Dokumen | Isi |
|---|---|
| [docs/01-PRODUCT.md](docs/01-PRODUCT.md) | Index, governance, vision, PRD, user stories |
| [docs/02-SPEC.md](docs/02-SPEC.md) | **Business rules (BR), functional req (FR), API contract, authorization** — kontrak utama |
| [docs/03-ENGINEERING.md](docs/03-ENGINEERING.md) | Architecture, database, security, deployment, operations |
| [docs/04-DELIVERY.md](docs/04-DELIVERY.md) | UX flows, testing (AC), task breakdown, aturan agent |

**Minimal wajib dibaca penuh sebelum coding:** `docs/02-SPEC.md` dan `docs/03-ENGINEERING.md`.

---

## 3. Governance — SOT menang atas kode

- Jika kode, UI, atau asumsimu bertentangan dengan SOT, **SOT yang menang**.
- Konflik/ambiguitas spesifikasi diselesaikan dengan urutan:
  1. Identifikasi aturan yang bermasalah.
  2. Tentukan perilaku yang seharusnya.
  3. Amandemen dokumen SOT terkait.
  4. Update test yang terpengaruh.
  5. Baru ubah implementasi.
- **DILARANG** menyelesaikan konflik spesifikasi dengan memilih perilaku sendiri secara diam-diam.
- Setiap perubahan SOT yang menyentuh business invariant / authorization / lifecycle / API / data-model semantics WAJIB menaikkan `SPEC_VERSION` + entry changelog ([docs/01-PRODUCT.md](docs/01-PRODUCT.md) § 0.4).

---

## 4. Sepuluh invariant inti — TIDAK BOLEH dilanggar

Kode yang melanggar salah satu ini dianggap **salah walaupun "berfungsi"**. Detail: [docs/02-SPEC.md](docs/02-SPEC.md) A.16.

1. Setiap Card milik tepat satu List.
2. Setiap List milik tepat satu Board.
3. Setiap Board milik tepat satu Milestone.
4. Resource TIDAK boleh melintasi batas Project.
5. Card boleh pindah Board hanya di dalam Milestone yang sama.
6. Mutation WAJIB memvalidasi current state sebelum commit.
7. Mutation konkuren WAJIB pakai optimistic concurrency (version check).
8. Activity WAJIB immutable & append-only.
9. Mutation entity dan Activity-nya WAJIB commit atomik.
10. Authorization dievaluasi terhadap hierarchy terkini entity, per operasi.

---

## 5. Implementation Rules (ringkas dari [docs/04-DELIVERY.md](docs/04-DELIVERY.md) C.4)

1. **Jangan mengarang perilaku domain.** Tidak dispesifikasi → jangan bikin aturan bisnis baru diam-diam.
2. **Domain commands.** Pakai operasi eksplisit untuk move/archive/restore/delete — bukan generic field update.
3. **Authorization first.** Cek otorisasi sebelum mutation.
4. **Validate destination.** Operasi move validasi destination independen (ada, Project sama, ACTIVE, permission).
5. **Preserve Activity.** Perubahan state bermakna WAJIB menghasilkan Activity.
6. **Activity immutable.** Tidak ada jalur update/delete Activity historis.
7. **No cross-project leakage.** Repository/service selalu menegakkan Project boundary di setiap query.
8. **Transactional domain commands.** Operasi multi-entity WAJIB atomik.
9. **Optimistic locking.** Modifikasi konkuren tidak boleh saling menimpa diam-diam.
10. **Jangan tambah fitur non-MVP** (lihat § 9).

---

## 6. Cara kerja: task-driven, per fase

Pekerjaan diorganisasi per **fase** (Phase 0–7, lihat [docs/04-DELIVERY.md](docs/04-DELIVERY.md) C.1). File task granular ada di **root repo**, satu file per fase:

- Fase aktif sekarang: **[PHASE-0-TASKS.md](PHASE-0-TASKS.md)**.

Aturan mengerjakan task:
- Kerjakan **goal per goal** sesuai dependency. Jangan lompat fase.
- Setiap goal punya **Reference** ke SOT — baca reference itu sebelum mengerjakan.
- Update kolom **Status** + **%** di tabel goal setiap ada perubahan.
- Setiap perpindahan Status WAJIB dicatat di **Closure Log** di bagian bawah file task, dengan bukti yang dapat diverifikasi ulang (output command/log/test).
- Task selesai = **Test** lulus + **DoD** terpenuhi. Fase selesai = semua task + Exit Criteria + subset AC relevan hijau.

Legend status: ⬜️ Belum · 🔄 Dikerjakan · 🔎 Menunggu verifikasi · ✅ Terverifikasi QA · ⚠️ Gagal-verifikasi · ⏸️ Blocked.

**Generate task fase berikutnya** mengikuti panduan [docs/04-DELIVERY.md](docs/04-DELIVERY.md) C.6 (format wajib per goal, guardrails, cek state repo dulu). Tampilkan task list untuk direview sebelum implementasi.

---

## 7. Stack & konvensi (terkunci)

| Aspek | Keputusan | Ref |
|---|---|---|
| Frontend/API | Next.js + TypeScript, Route Handlers | [03-ENG A.8](docs/03-ENGINEERING.md) |
| DB engine/provider | libSQL / **Turso** (database-per-project), pending POC gate | [03-ENG A.11](docs/03-ENGINEERING.md) |
| ORM | **Drizzle** + drizzle-kit | [03-ENG A.12](docs/03-ENGINEERING.md) |
| ID | **ULID** (TEXT) | [03-ENG A.13](docs/03-ENGINEERING.md) |
| Auth (web session) | **Auth.js**, user di Global DB | [03-ENG A.14](docs/03-ENGINEERING.md) |
| Validation | Zod | [03-ENG A.8](docs/03-ENGINEERING.md) |
| Struktur kode | Domain-oriented modular monolith | [03-ENG A.7](docs/03-ENGINEERING.md) |

Konvensi wajib:
- Persistence **di balik repository/data-access boundary** — domain logic tidak import Drizzle langsung.
- Mutation + Activity dalam satu transaksi (`BEGIN IMMEDIATE`) — [03-ENG A.6](docs/03-ENGINEERING.md).
- Generic `PATCH` **dilarang** mengubah field domain (`id`, `project_id`, `creator_user_id`, `created_at`, `version`, `archived_at`, `deleted_at`, `list_id`) — [02-SPEC C.15](docs/02-SPEC.md).
- Bentuk response & error code kanonik — [02-SPEC C.2](docs/02-SPEC.md).
- Payload `activities.data` mengikuti konvensi baku — [03-ENG B.5](docs/03-ENGINEERING.md).

---

## 8. Testing (wajib)

- Setiap invariant WAJIB punya test **positif + negatif** (bukan hanya happy path).
- Nama test mereferensikan ID rule (`BR-xxx` / `AC-xxx`) — [04-DELIVERY B.6](docs/04-DELIVERY.md).
- Task yang menyentuh **mutation** → wajib test optimistic locking (pola `AC-020`).
- Task yang menyentuh **operasi terproteksi** → wajib authz test (min. 1 positif + 1 negatif).
- Task yang menyentuh **query resource** → wajib verifikasi Project boundary (tidak bocor lintas Project).
- Acceptance criteria lengkap: [04-DELIVERY B.4](docs/04-DELIVERY.md). Definition of Done: [04-DELIVERY C.3](docs/04-DELIVERY.md).

---

## 9. Jangan dikerjakan (non-MVP)

Tidak boleh ditambahkan kecuali diminta lewat revisi SOT: realtime/WebSocket · notification infra · DENY-based authorization / policy engine · field-level permission / ABAC · search engine / cross-project search · workflow automation · background job framework · event bus · multiple assignee · manual Card ordering · physical delete oleh user · penghapusan comment · Board settings lanjutan (warna/ikon/WIP limit) · microservices. Daftar penuh: [docs/01-PRODUCT.md](docs/01-PRODUCT.md) § 2.2.

---

## 10. Protokol keputusan & berhenti

Saat menemui ambiguitas atau open decision ([03-ENG Part E](docs/03-ENGINEERING.md)):
- **Boleh putuskan sendiri** hanya untuk keputusan teknis murni yang tidak menyentuh business invariant (mis. pemilihan library test), asalkan dicatat eksplisit & mudah diganti (di balik abstraction).
- **WAJIB berhenti & minta keputusan manusia** untuk apa pun yang menyentuh business invariant / authorization / lifecycle / API semantics.
- Tandai temuan dengan `[NEEDS-DECISION]` (butuh pilihan) atau `[NEEDS-SPEC-AMENDMENT]` (butuh ubah SOT), jelaskan opsi + rekomendasi, jangan implementasi diam-diam.

---

## 11. Roles & Handoff Protocol (multi-agent)

Proyek ini dikerjakan oleh beberapa sesi AI dengan peran berbeda. Handoff dilacak lewat kolom **Status** + **Closure Log** di file task (mis. [PHASE-0-TASKS.md](PHASE-0-TASKS.md)).

### 11.1 Lane per peran

| Peran | Tanggung jawab | Boleh menaikkan status ke |
|---|---|---|
| **Dev** | Implementasi goal + tulis & loloskan test (positif **dan** negatif) | `🔄` → `🔎` |
| **QA** | Verifikasi bukti reproducible, jalankan suite, cek kepatuhan SOT | `🔎` → `✅` atau `⚠️` |
| **Review** | Architecture drift, "benar tapi melanggar maksud", konsistensi lintas-modul | catatan review; boleh minta `⚠️` |

Manusia memegang keputusan pada semua `[NEEDS-DECISION]` / `[NEEDS-SPEC-AMENDMENT]` (§10) dan pembukaan gate antar-fase.

### 11.2 Tiering kapabilitas berdasarkan risiko (WAJIB)

Korektnya diciptakan di Dev, bukan ditemukan di Review. Pilih kekuatan model Dev **berdasarkan risiko task, bukan seragam**:

- **Model ringan** boleh untuk: scaffolding, CRUD sederhana, UI, boilerplate — task yang perilakunya sudah dipatok penuh oleh spec + test.
- **Model lebih kuat WAJIB untuk task invariant-critical:** **Authorization (Phase 4)**, **Lifecycle & child-handling (Phase 5)**, dan inti **concurrency/transaction/optimistic-locking (Phase 6)** — beserta goal manapun di fase lain yang menyentuh 10 invariant inti (§4). Ini kelas "salah walaupun berfungsi"; jangan diserahkan ke model ringan.

### 11.3 Aturan handoff (tidak boleh dilanggar)

1. **Dev → 🔎 hanya jika test hijau.** Dev TIDAK menaikkan status ke `🔎` sebelum: test positif **dan** negatif untuk goal itu lulus (mutation → optimistic-locking test; operasi terproteksi → authz test min. 1+/1−; query → Project-boundary check). Test negatif adalah gerbang Dev, bukan pekerjaan QA (§8).
2. **Bukti wajib di Closure Log.** Setiap perpindahan status mencantumkan **Bukti** yang bisa diverifikasi ulang (output command / log / nama test). Tanpa bukti reproducible, QA menolak ke `⚠️`.
3. **QA memverifikasi, bukan sekadar membaca.** QA menjalankan ulang suite + memeriksa: (a) bukti reproducible, (b) test mereferensikan ID rule (`BR`/`AC`), (c) **Dev tidak mengarang perilaku di luar SOT**, (d) tidak ada pelanggaran invariant di kondisi tepi. Jika ragu/gagal → `⚠️` dengan alasan di Closure Log, balik ke Dev.
4. **Review melengkapi test, bukan menggantikannya.** Untuk bagian invariant-critical, kebenaran ditegakkan oleh **property/concurrency test**, bukan pembacaan kode — bug concurrency/authorization sering hanya muncul pada interleaving tertentu yang tak terlihat saat me-review. Review fokus pada architecture drift & maksud, dan boleh meminta status turun ke `⚠️`.
5. **Scope context per goal.** Beri sesi Dev hanya section SOT yang relevan lewat kolom **Reference** goal — jangan andalkan seluruh SOT muat di context, terutama untuk model ringan.
6. **Ambiguitas → berhenti (§10).** Model ringan paling sering gagal di titik ambiguitas; menemui hal yang menyentuh invariant/authorization/lifecycle/API → JANGAN tebak, tandai `[NEEDS-DECISION]`/`[NEEDS-SPEC-AMENDMENT]` dan serahkan ke manusia.
7. **Granularitas goal disesuaikan untuk model ringan.** Goal dipecah cukup kecil agar dapat dikerjakan model ringan tanpa ambiguitas: **satu goal = satu Reference, satu Test, satu DoD, satu unit review**. Jika sebuah goal menuntut banyak keputusan sekaligus atau menyentuh >~3–5 file, pecah lebih lanjut. Scope sempit adalah mitigasi utama untuk model lemah — ia mempersempit ruang salah, memuat context, dan membuat verifikasi jadi biner (lihat [04-DELIVERY C.6](docs/04-DELIVERY.md)).

### 11.4 Alur status ringkas
```text
⬜️ → 🔄 (Dev mulai)
     → 🔎 (Dev: test hijau + bukti)   ← WAJIB test negatif lulus
        → ✅ (QA: bukti reproducible + patuh SOT)
        → ⚠️ (QA/Review: gagal → balik ke Dev, alasan di Closure Log)
⏸️  = blocked (mis. Phase 7 sebelum Phase 0–6 ✅)
```

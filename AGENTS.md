# AGENTS.md — Operating Manual for AI Coding Agents

> Baca file ini **sepenuhnya** sebelum melakukan apa pun di repo ini.
> Ini adalah manual operasi untuk agent (dan kontributor manusia yang bekerja seperti agent).
> Aturan detail ada di SOT (`docs/`). File ini adalah entry point + aturan main yang tidak boleh dilanggar.

---

## 0. EXECUTION GATES — BACA SEBELUM TOOL/CODING

Bagian ini adalah stop gate, bukan saran. Jika satu syarat belum terpenuhi, agent MUST berhenti sebelum melakukan langkah berikutnya.

### Gate A — sebelum AI-Dev menyentuh implementasi

AI-Dev MUST NOT menjalankan tool yang mengubah implementasi, membuat file kode, atau mengedit kode sebelum semuanya terpenuhi:

- [ ] Lane **AI-Dev** sudah dikonfirmasi manusia/orchestrator.
- [ ] Discovery terbaru dari disk sudah ditampilkan dan goal/Task sudah dikonfirmasi.
- [ ] State goal dibaca ulang langsung dari file task; dependency terbukti terpenuhi dan goal bukan `⏸️`/`🔎`.
- [ ] Goal `⬜️`/`⚠️` sudah diubah menjadi `🔄` dengan `%` yang jujur.
- [ ] Entry `CL-nn` berisi Role, Model/platform, Bukti, dan Catatan sudah dibuat.
- [ ] Link CL baru sudah di-append pada kolom CL tanpa mengganti link lama.

Perubahan awal `→ 🔄` tidak memerlukan commit terpisah sebelum coding, tetapi Status/%/CL tersebut wajib masuk commit pertama (§6.1).

### Gate B — sebelum AI-Dev mengatakan "selesai"

AI-Dev MUST NOT menyatakan pekerjaan selesai, mengirim handoff final, atau berhenti hanya dengan ringkasan implementasi sebelum semuanya terpenuhi:

- [ ] Test positif dan negatif yang diwajibkan goal sudah dijalankan dan lulus.
- [ ] Test/DoD serta state repo dan goal sudah diperiksa ulang dari disk.
- [ ] Goal sudah diubah menjadi `🔎` dan tepat `80%`.
- [ ] Entry `CL-nn` baru dengan Role, Model/platform, bukti test, dan catatan sudah dibuat.
- [ ] Link CL baru sudah di-append pada kolom CL.
- [ ] Implementasi + Status + % + CL sudah masuk commit yang dapat diverifikasi.

Jika salah satu syarat gagal, Dev harus mengatakan **belum selesai** dan menjelaskan blocker/pekerjaan tersisa. Handoff final AI-Dev wajib memuat format minimum berikut:

```text
Goal: <ID>
Status: <status> · <persentase>
CL: <link CL yang dibuat>
Commit: <hash/subject commit yang sudah ada>
Tests: <command + hasil>
Result: <siap QA | belum selesai + alasan>
```

Jawaban seperti "sudah selesai" tanpa keenam informasi tersebut adalah handoff tidak valid.

---

## 1. Apa proyek ini
**NGodingin Kanban** — platform project management / Kanban sederhana, dinamis, API-based, dengan isolasi per-Project (multi-tenant via database-per-project). Hierarki: `Project → Milestone → Board → List → Card`.

Status: **pra-implementasi**. Dokumentasi (SOT) sudah matang di versi 2.0.6. Kode belum ada — Phase 0 adalah bootstrapping.

Filosofi produk: **Simple by default, flexible by design.** Lihat [docs/01-PRODUCT.md](docs/01-PRODUCT.md).

---

## 2. Source of Truth & cakupan baca per lane

| Dokumen | Isi |
|---|---|
| [docs/01-PRODUCT.md](docs/01-PRODUCT.md) | Index, governance, vision, PRD, user stories |
| [docs/02-SPEC.md](docs/02-SPEC.md) | **Business rules (BR), functional req (FR), API contract, authorization** — kontrak utama |
| [docs/03-ENGINEERING.md](docs/03-ENGINEERING.md) | Architecture, database, security, deployment, operations |
| [docs/04-DELIVERY.md](docs/04-DELIVERY.md) | UX flows, testing (AC), task breakdown, aturan agent |

### 2.1 Baseline tetap AI-Dev

Setelah lane dan goal dikonfirmasi, AI-Dev MUST membaca baseline berikut langsung dari disk sebelum menulis kode:

1. `AGENTS.md` sepenuhnya.
2. File `PHASE-*-TASKS.md` fase aktif sepenuhnya, termasuk dependency, Test, DoD, Exit Criteria, kolom CL, dan Closure Log.
3. [docs/01-PRODUCT.md](docs/01-PRODUCT.md) §0 (governance/versioning) dan §2.2 (non-MVP).
4. [docs/02-SPEC.md](docs/02-SPEC.md) A.16 (invariant inti).
5. [docs/03-ENGINEERING.md](docs/03-ENGINEERING.md) A.4–A.7 (database routing/isolation, transaksi, dan boundary arsitektur).
6. [docs/04-DELIVERY.md](docs/04-DELIVERY.md) C.3–C.4 (Definition of Done dan implementation rules).

Setelah baseline, AI-Dev MUST fokus membaca **Reference, Test, dan DoD goal yang dikonfirmasi** beserta rule yang disebut langsung di sana. Dev tidak wajib memuat seluruh `02-SPEC.md` dan `03-ENGINEERING.md` untuk setiap goal. Jika Reference goal mengarah ke rule lain, rule lanjutan itu ikut wajib dibaca. Jika muncul dampak di luar scope atau ambiguitas domain, berhenti sesuai §10; jangan memperluas perilaku diam-diam.

### 2.2 Perluasan wajib AI-QA

Reference goal adalah **titik awal, bukan batas verifikasi QA**. AI-QA MUST membaca baseline AI-Dev, lalu memperluas pemeriksaan ke:

1. seluruh Reference, Test, DoD, dependency goal, `CL` Dev, serta file/diff yang benar-benar berubah;
2. semua BR/FR/INV/AC dan cross-reference yang langsung terkait dengan perilaku yang diuji;
3. section SOT tetangga yang dapat mengubah hasil pada kondisi tepi;
4. test positif, negatif, Project-boundary, authorization, lifecycle, transaction/activity, dan concurrency yang relevan menurut jenis perubahan;
5. kontrak atau modul lain yang menjadi caller, destination, ancestor, descendant, atau penyimpan data dari perubahan tersebut.

QA MUST terus memperluas cakupan sampai tidak ada dependency atau dampak relevan yang belum diperiksa. QA tidak boleh meluluskan goal hanya karena implementasi cocok dengan satu Reference yang dicantumkan Dev.

### 2.3 Cakupan AI-Planning & Review

AI-Planning & Review membaca seluruh section SOT yang terdampak beserta cross-reference dan dokumen konsumennya. Untuk amandemen invariant/authorization/lifecycle/API/data-model, lakukan impact scan lintas-SOT dan ikuti versioning §3.

---

## 3. Governance — SOT menang atas kode

- Jika kode, UI, atau asumsimu bertentangan dengan SOT, **SOT yang menang**.
- **AI-Dev DILARANG mengubah SOT**, termasuk seluruh `docs/*.md`, `SPEC_VERSION`, dan changelog SOT, walaupun hanya untuk membetulkan typo atau menyesuaikan implementasi. Dev hanya boleh mencatat `[NEEDS-DECISION]`/`[NEEDS-SPEC-AMENDMENT]` di task/`CL`, lalu berhenti pada bagian yang terdampak. Amandemen SOT dilakukan oleh AI-Planning & Review setelah keputusan manusia; QA hanya melaporkan temuan kecuali lane-nya diubah secara eksplisit.
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
5. Hanya Card yang dapat dipindahkan; lintas Board hanya di dalam Milestone yang sama.
6. Mutation WAJIB memvalidasi current state sebelum commit.
7. Mutation konkuren WAJIB pakai optimistic concurrency (version check).
8. Activity WAJIB immutable & append-only.
9. Mutation entity dan Activity-nya WAJIB commit atomik.
10. Authorization dievaluasi terhadap hierarchy terkini entity, per operasi.

---

## 5. Implementation Rules (ringkas dari [docs/04-DELIVERY.md](docs/04-DELIVERY.md) C.4)

1. **Jangan mengarang perilaku domain.** Tidak dispesifikasi → jangan bikin aturan bisnis baru diam-diam.
2. **Domain commands.** Pakai operasi eksplisit untuk Card move serta archive/restore/delete — bukan generic field update. Milestone/Board/List tidak dapat dipindahkan pada MVP.
3. **Authorization first.** Cek otorisasi sebelum mutation.
4. **Validate destination.** Operasi move Card validasi destination independen (ada, Project sama, seluruh ancestor ACTIVE, permission).
5. **Preserve Activity.** Perubahan state bermakna WAJIB menghasilkan Activity; lifecycle parent tidak membuat Activity descendant karena local state descendant tidak berubah.
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
- Sebelum mengubah task/goal, baca ulang kondisi terbarunya langsung dari disk sesuai §6.1; memory atau ringkasan sesi bukan sumber status.
- Update kolom **Status** + **CL** + **%** di tabel goal setiap ada perubahan. Nilai `%` berbasis bukti yang sudah ada, bukan asumsi, lama bekerja, atau rencana.
- AI-Dev hanya boleh memberi nilai `0–80%`. `80%` berarti implementasi, Test, dan DoD sisi Dev sudah terbukti selesai dan goal siap `🔎`; hanya QA yang boleh menetapkan `100%`, bersamaan dengan status `✅`.
- Gunakan kolom **Prior** untuk mengurutkan goal yang sama-sama actionable: `P0` blocker/gate/fondasi kritis · `P1` tinggi/core dependency · `P2` normal · `P3` lanjutan/polish. **Dependency dan Status selalu mengalahkan Prior**; `P0` yang blocked tidak boleh mendahului goal yang membuka dependency-nya.
- Setiap perpindahan Status WAJIB dicatat di **Closure Log** di bagian bawah file task, dengan `Role`, `Model`, dan bukti yang dapat diverifikasi ulang (output command/log/test), lalu entry-nya WAJIB ditautkan dari kolom **CL** goal terkait. Namespace entry: `CL-nn` untuk Dev, `QA-CL-nn` untuk QA, dan `Review-CL-nn` untuk AI-Planning & Review/reviewer. `Role` harus sama dengan lane sesi. Isi `Model` dengan nama/identifier model aktual jika diekspos; jika tidak, isi dengan nama platform yang menjalankan agent (contoh: `GitHub Copilot` atau `Codex`). Jangan menebak nama model. Review yang tidak mengubah Status tetap WAJIB membuat `Review-CL` dan menautkannya.
- Kolom **CL bersifat append-only**: jangan mengganti, menghapus, atau menyusun ulang link lama. Tambahkan link baru di baris baru dalam cell yang sama menggunakan `<br>`. Closure Log lama juga tidak diedit; koreksi dibuat sebagai entry baru.
- Status dan `%` Task tidak diedit manual; keduanya dihitung dari goal sesuai §6.2. Task selesai = seluruh goal `✅` + **Test** lulus + **DoD** terpenuhi. Fase selesai = semua task + Exit Criteria + subset AC relevan hijau.

Legend status: ⬜️ Belum · 🔄 Dikerjakan · 🔎 Menunggu verifikasi · ✅ Terverifikasi QA · ⚠️ Gagal-verifikasi · ⏸️ Blocked.

**Generate task fase berikutnya** mengikuti panduan [docs/04-DELIVERY.md](docs/04-DELIVERY.md) C.6 (format wajib per goal, guardrails, cek state repo dulu). Tampilkan task list untuk direview sebelum implementasi.

### 6.1 Freshness, status, CL, dan commit

Sebelum **setiap** perubahan Status, CL, atau %, agent MUST:

1. buka ulang file task langsung dari disk dan baca row goal, dependency, Test, DoD, serta seluruh link CL terbarunya;
2. baca entry Closure Log yang ditautkan dan entry terbaru untuk goal tersebut;
3. periksa state repository aktual (`git status`, diff yang relevan, dan commit terakhir jika Git tersedia);
4. batalkan asumsi dari memory jika berbeda dengan state disk, lalu hitung ulang status/% yang jujur dari bukti aktual.

Aturan transisi:

- Sebelum mulai mengerjakan goal `⬜️` atau melanjutkan perbaikan goal `⚠️`, Dev MUST mengubahnya menjadi `🔄`, mempertahankan/menetapkan `%` yang jujur, membuat `CL`, dan append link CL tersebut. Jika goal sudah `🔄`, jangan membuat transisi palsu; lanjutkan berdasarkan CL terbaru.
- Transisi awal ke `🔄` tidak membutuhkan **commit terpisah sebelum pekerjaan dimulai**. Namun perubahan Status + % + CL itu MUST masuk paling lambat ke commit pertama Dev dan tidak boleh hilang atau ditunda melewati transisi berikutnya.
- Setiap perubahan Status selain pengecualian waktu commit awal di atas MUST membuat CL sesuai lane dan langsung di-commit. Commit yang sama MUST memuat perubahan Status, %, entry Closure Log, dan link baru di kolom CL.
- Kepatuhan commit diverifikasi melalui history Git (`git log/show/blame` pada file task). Jangan menulis hash commit ke dalam entry yang berada di commit yang sama karena hash tersebut bersifat self-referential.
- Jika Git belum tersedia, hanya bootstrap pertama yang boleh memakai pengecualian `→ 🔄`; goal bootstrap itu MUST menginisialisasi Git dan memasukkan tracking awal ke commit pertama. Untuk goal lain, ketiadaan Git adalah blocker.
- Hanya AI-QA atau AI-Planning & Review/reviewer yang boleh membuka status `⏸️`, melalui transisi tercatat `⏸️ → ⬜️` setelah alasan block/gate diperiksa ulang. Jika gate membutuhkan keputusan manusia, keputusan itu tetap wajib ada. Dev tidak boleh mengubah atau mengerjakan goal `⏸️`.
- Goal `⏸️` disebut **Gate candidate** hanya jika seluruh dependency/gate objektif terlihat sudah terpenuhi dan keputusan manusia yang diwajibkan sudah tercatat. Statusnya tetap `⏸️` sampai QA/reviewer memverifikasi, membuat `QA-CL`/`Review-CL`, append link CL, dan commit transisi `⏸️ → ⬜️`. Goal blocked yang belum memenuhi syarat tetap masuk daftar **Blocked**, bukan Gate candidate.

### 6.2 Status dan persentase Task diturunkan dari goal

Task tidak memiliki Status, %, atau CL terpisah yang dapat diedit. Agent menghitung ringkasan Task dari seluruh goal di bawah heading Task setiap kali membuat snapshot:

- **Task %** = `floor(jumlah % seluruh goal / jumlah goal)`. Semua goal berbobot sama karena goal wajib dipecah kecil. Pembulatan selalu ke bawah agar progress tidak dilebihkan.
- **Task Status** ditentukan dengan urutan berikut:
  1. ada goal `⚠️` → Task `⚠️`;
  2. seluruh goal `✅` → Task `✅`;
  3. seluruh goal hanya `🔎`/`✅` dan sedikitnya satu `🔎` → Task `🔎`;
  4. seluruh goal yang belum `✅` berstatus `⏸️` → Task `⏸️`;
  5. ada goal `🔄`, atau ada goal dengan `% > 0`/status `🔎`/`✅` sementara goal lain belum selesai → Task `🔄`;
  6. selain itu → Task `⬜️`.
- **Task CL** tidak dibuat. Bukti Task adalah agregasi seluruh CL goal-nya.
- Karena ringkasan Task bersifat derived, perubahan hasil perhitungannya bukan transisi tersendiri dan tidak memerlukan CL/commit tambahan di luar perubahan goal penyebabnya.

---

## 7. Stack & konvensi (terkunci)

| Aspek | Keputusan | Ref |
|---|---|---|
| Runtime/tooling | Latest compatible LTS: Node.js **24.x LTS** + pnpm **11.x**; dependency direct exact-pin + committed lockfile | [03-ENG A.8](docs/03-ENGINEERING.md) |
| API | Hono **4.x** + TypeScript **6.0.x**; domain API `/api/v1/*` | [03-ENG A.7–A.8](docs/03-ENGINEERING.md) |
| Web SPA | React **19.2.x** + Vite **8.x**; implementasi Phase 7 | [03-ENG A.8](docs/03-ENGINEERING.md), [05-FRONTEND](docs/05-FRONTEND.md) |
| DB engine/provider | libSQL / **Turso** (database-per-project), pending POC gate | [03-ENG A.11](docs/03-ENGINEERING.md) |
| DB SDK / ORM | `@libsql/client` **0.17.x**, `@tursodatabase/api` **2.0.x**, Drizzle **0.45.x**, drizzle-kit **0.31.x** | [03-ENG A.8–A.12](docs/03-ENGINEERING.md) |
| ID | **ULID** (TEXT) | [03-ENG A.13](docs/03-ENGINEERING.md) |
| Auth (web session) | Better Auth **1.6.x stable** + Resend **6.x**; database-backed session, user di Global DB | [03-ENG A.8, A.14](docs/03-ENGINEERING.md) |
| Validation | Zod **4.x** | [03-ENG A.8](docs/03-ENGINEERING.md) |
| Testing | Vitest **4.x** + Playwright **1.62.x** | [03-ENG A.8](docs/03-ENGINEERING.md), [04-DELIVERY B.5](docs/04-DELIVERY.md) |
| Struktur kode | Domain-oriented modular monolith | [03-ENG A.7](docs/03-ENGINEERING.md) |

Konvensi wajib:
- Saat memilih atau menambah dependency: latest compatible LTS MUST diprioritaskan; jika tidak ada kanal LTS, pakai latest compatible stable. Prerelease dilarang kecuali keputusan manusia + amandemen SOT. Setelah dipilih, direct dependency tetap exact-pin sesuai A.8.
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

Tidak boleh ditambahkan kecuali diminta lewat revisi SOT: pemindahan Milestone/Board/List · child handling/cascade lifecycle oleh user · realtime/WebSocket · notification infra · DENY-based authorization / policy engine · field-level permission / ABAC · search engine / cross-project search · workflow automation · background job framework · event bus · multiple assignee · manual Card ordering · physical delete oleh user · penghapusan comment · Board settings lanjutan (warna/ikon/WIP limit) · microservices. Daftar penuh: [docs/01-PRODUCT.md](docs/01-PRODUCT.md) § 2.2.

---

## 10. Protokol keputusan & berhenti

Saat menemui ambiguitas atau open decision ([03-ENG Part E](docs/03-ENGINEERING.md)):
- **Boleh putuskan sendiri** hanya untuk keputusan teknis murni yang tidak menyentuh business invariant (mis. pemilihan library test), asalkan dicatat eksplisit & mudah diganti (di balik abstraction).
- **WAJIB berhenti & minta keputusan manusia** untuk apa pun yang menyentuh business invariant / authorization / lifecycle / API semantics.
- Tandai temuan dengan `[NEEDS-DECISION]` (butuh pilihan) atau `[NEEDS-SPEC-AMENDMENT]` (butuh ubah SOT), jelaskan opsi + rekomendasi, jangan implementasi diam-diam.

---

## 11. Roles & Handoff Protocol (multi-agent)

Proyek ini dikerjakan oleh beberapa sesi AI dengan peran berbeda. Handoff dilacak lewat kolom **Status** + **CL** dan entry **Closure Log** di file task (mis. [PHASE-0-TASKS.md](PHASE-0-TASKS.md)).

### 11.0 Penentuan lane saat sesi dimulai

- Setelah membaca `AGENTS.md`, tindakan pertama agent pada **setiap sesi baru** adalah meminta konfirmasi eksplisit: **"Sesi ini AI-Planning & Review, AI-Dev, atau AI-QA?"**
- Kewajiban meminta konfirmasi tetap berlaku walaupun jenis pekerjaan terlihat jelas atau prompt awal tampak mengarah ke salah satu lane. Agent MAY menyebut lane yang menurutnya sesuai, tetapi MUST menunggu jawaban manusia/orchestrator.
- Sebelum lane dikonfirmasi, agent MUST NOT memilih goal, mengubah Status/Closure Log, mengedit file, menjalankan implementasi/test verifikasi, atau mengambil keputusan repo. Agent hanya boleh membaca `AGENTS.md` untuk mengetahui protokol ini.
- Jawaban eksplisit manusia/orchestrator menetapkan lane sesi: **AI-Planning & Review**, **AI-Dev**, atau **AI-QA**. Lane berlaku sampai sesi berakhir atau sampai manusia/orchestrator secara eksplisit mengonfirmasi pergantian lane.
- Jika request mencampur beberapa lane, agent MUST meminta manusia/orchestrator memilih lane yang dikerjakan lebih dulu.
- Satu sesi/agent MUST NOT bertindak sebagai Dev sekaligus QA untuk goal yang sama. Dev tidak boleh menaikkan hasil kerjanya sendiri ke `✅`; verifikasi `🔎 → ✅/⚠️` harus dilakukan sesi QA terpisah.
- Pergantian lane dalam sesi berjalan hanya boleh terjadi setelah konfirmasi eksplisit manusia/orchestrator dan MUST dicatat di Closure Log goal terkait.

### 11.0.1 Discovery setelah lane dikonfirmasi

Setelah lane dikonfirmasi, agent MUST melakukan discovery read-only sebelum memilih atau mengerjakan goal:

1. Scan filesystem/repo untuk menemukan `AGENTS.md`, seluruh `PHASE-*-TASKS.md` yang benar-benar ada, dan dokumen SOT terkini. Jangan mengandalkan memory, ringkasan sesi lama, daftar file IDE, atau asumsi bahwa status sebelumnya masih berlaku.
2. Baca ulang file task fase aktif langsung dari disk, termasuk tabel goal, dependency, Exit Criteria, dan Closure Log terbaru.
3. Periksa state repo aktual (minimal file yang ada/berubah dan bukti terakhir yang relevan) tanpa mengubah apa pun.
4. Hitung ulang Status/% Task menurut §6.2, lalu bentuk snapshot status terkini dan tampilkan kepada manusia sebelum bekerja. Snapshot minimal berisi: lane sesi, versi SOT, fase aktif, Task + Status/% derived, ID goal, Status, CL, %, Prior, dependency, bukti/Closure Log terakhir, serta alasan urutan prioritas. Untuk pekerjaan AI-Planning & Review di luar task implementasi, tampilkan scope dokumen/keputusan sebagai pengganti ID goal.
5. Pisahkan goal menjadi tiga daftar: **Actionable**, **Gate candidate**, dan **Blocked**. Goal implementasi hanya actionable jika dependency-nya terpenuhi dan lane sesi berwenang menangani status tersebut. Gate candidate tetap bukan goal implementasi; QA/reviewer hanya boleh memverifikasi pembukaan gate setelah scope itu dikonfirmasi manusia.

Urutan prioritas kandidat MUST deterministik:

- **AI-Dev:** `⚠️` yang perlu diperbaiki → `🔄` yang perlu dilanjutkan/handoff → `⬜️` unblocked. Di status yang sama: `Prior` (`P0` → `P3`) → goal `[GATING]` → goal yang membuka dependency terbanyak → ID numerik terkecil.
- **AI-QA:** Gate candidate yang membuka dependency/fase terbanyak → goal `🔎`, lalu urutkan menurut `Prior` (`P0` → `P3`) → `[GATING]` → invariant/security-critical → Closure Log tertua yang belum diverifikasi → ID numerik terkecil. QA tidak membuka Gate candidate sampai scope itu dikonfirmasi.
- **AI-Planning & Review:** scope planning/review yang diminta eksplisit → Gate candidate yang seluruh syaratnya tampak terpenuhi → `[NEEDS-SPEC-AMENDMENT]`/`[NEEDS-DECISION]` → perubahan invariant/security/architecture-critical terbaru → goal `🔎` lainnya. Untuk task implementation gunakan `Prior` (`P0` → `P3`), bukti/Closure Log terbaru, lalu ID numerik terkecil; untuk pekerjaan dokumen gunakan urutan keputusan yang dikonfirmasi manusia.

Format ringkas yang ditampilkan:

```text
Lane: <AI-Planning & Review|AI-Dev|AI-QA> · SOT: <version> · Fase aktif: <phase>

Urutan | Task | Task St/% | Goal | Goal St | CL | Goal % | Prior | Dependency | Bukti terakhir | Alasan
1      | ...  | ...       | ...  | ...     | ...| ...    | ...   | ...        | ...            | ...

Gate candidate: <goal + bukti prasyarat, atau "tidak ada">
Blocked: <goal + blocker yang belum terpenuhi, atau "tidak ada">
Rekomendasi: <satu goal teratas + alasan>
```

Setelah menampilkan snapshot, agent MUST meminta konfirmasi scope/task/goal yang akan dikerjakan. Konfirmasi MAY memilih satu scope planning/review, satu goal, atau satu Task; jika satu Task dipilih, agent tetap mengerjakannya goal-per-goal sesuai dependency dan handoff. Sebelum manusia/orchestrator mengonfirmasi scope/ID goal/Task, agent MUST NOT mengubah file, menjalankan implementasi/test verifikasi, mengubah Status/CL/%, atau menulis Closure Log.

Discovery sesi tidak menggantikan freshness check §6.1. Agent MUST memeriksa ulang state tepat sebelum setiap update task/goal, meskipun snapshot baru saja dibuat.

### 11.1 Lane per peran

| Peran | Tanggung jawab | Boleh menaikkan status ke |
|---|---|---|
| **AI-Planning & Review** | Governance/amandemen SOT, persiapan project, generate/revisi task, review architecture & konsistensi; tidak mengimplementasikan kode dan tidak memberi approval QA | catatan/amandemen dokumen; `⏸️ → ⬜️`; boleh meminta `⚠️`; tidak boleh `🔎 → ✅` |
| **Dev** | Implementasi goal + tulis & loloskan test (positif **dan** negatif); tidak boleh mengubah SOT atau membuka `⏸️` | `⬜️/⚠️ → 🔄` lalu `🔄 → 🔎`; `%` maksimal 80 |
| **QA** | Verifikasi bukti reproducible, jalankan suite, cek kepatuhan SOT | `⏸️ → ⬜️`; `🔎 → ✅` atau `⚠️`; hanya QA boleh menetapkan 100%/✅ |

Manusia memegang keputusan pada semua `[NEEDS-DECISION]` / `[NEEDS-SPEC-AMENDMENT]` (§10) dan pembukaan gate antar-fase.

### 11.2 Tiering kapabilitas berdasarkan risiko (WAJIB)

Korektnya diciptakan di Dev, bukan ditemukan di Review. Pilih kekuatan model Dev **berdasarkan risiko task, bukan seragam**:

- **Model ringan** boleh untuk: scaffolding, CRUD sederhana, UI, boilerplate — task yang perilakunya sudah dipatok penuh oleh spec + test.
- **Model lebih kuat WAJIB untuk task invariant-critical:** **Authorization (Phase 4)**, **Lifecycle/effective ancestor state (Phase 5)**, dan inti **concurrency/transaction/optimistic-locking (Phase 6)** — beserta goal manapun di fase lain yang menyentuh 10 invariant inti (§4). Ini kelas "salah walaupun berfungsi"; jangan diserahkan ke model ringan.

### 11.3 Aturan handoff (tidak boleh dilanggar)

1. **Dev mulai di 🔄 dan menyerahkan pada 80%.** Sebelum bekerja Dev melakukan `⬜️/⚠️ → 🔄` sesuai §6.1. Dev TIDAK menaikkan status ke `🔎` atau `%` ke 80 sebelum test positif **dan** negatif untuk goal itu lulus (mutation → optimistic-locking test; operasi terproteksi → authz test min. 1+/1−; query → Project-boundary check). Test negatif adalah gerbang Dev, bukan pekerjaan QA (§8).
2. **Metadata dan bukti wajib di Closure Log dan kolom CL.** Setiap entry mencantumkan `Role`, `Model`, dan **Bukti** yang bisa diverifikasi ulang (output command / log / nama test). Dev menulis `CL-nn`, QA menulis `QA-CL-nn`, dan AI-Planning & Review/reviewer menulis `Review-CL-nn`; setiap entry langsung ditautkan dari kolom **CL** goal. Role harus cocok dengan lane. Gunakan nama model aktual jika tersedia; jika tidak diekspos, gunakan nama platform—jangan mengarang model. Tanpa metadata, bukti, atau link reproducible, QA menolak ke `⚠️`.
3. **QA memverifikasi, bukan sekadar membaca.** QA menjalankan ulang suite + memeriksa: (a) bukti reproducible, (b) test mereferensikan ID rule (`BR`/`AC`), (c) **Dev tidak mengarang perilaku di luar SOT**, (d) tidak ada pelanggaran invariant di kondisi tepi. QA mencatat hasilnya dalam `QA-CL`; jika ragu/gagal → `⚠️` dengan alasan di `QA-CL`, lalu balik ke Dev.
4. **AI-Planning & Review melengkapi test, bukan menggantikannya.** Untuk bagian invariant-critical, kebenaran ditegakkan oleh **property/concurrency test**, bukan pembacaan kode — bug concurrency/authorization sering hanya muncul pada interleaving tertentu yang tak terlihat saat me-review. Lane ini fokus pada architecture drift & maksud, mencatat hasil dalam `Review-CL`, dan boleh meminta status turun ke `⚠️`.
5. **Scope context berbeda per lane (§2).** Dev membaca baseline tetap lalu fokus pada Reference/Test/DoD goal. QA memakai Reference sebagai titik awal dan MUST memperluas verifikasi ke rule, dependency, perubahan aktual, kondisi tepi, serta kontrak lintas-modul yang relevan. Jangan membatasi QA pada context yang diberikan Dev.
6. **Ambiguitas → berhenti (§10).** Model ringan paling sering gagal di titik ambiguitas; menemui hal yang menyentuh invariant/authorization/lifecycle/API → JANGAN tebak, tandai `[NEEDS-DECISION]`/`[NEEDS-SPEC-AMENDMENT]` dan serahkan ke manusia.
7. **Granularitas goal disesuaikan untuk model ringan.** Goal dipecah cukup kecil agar dapat dikerjakan model ringan tanpa ambiguitas: **satu goal = satu Reference, satu Test, satu DoD, satu unit review**. Jika sebuah goal menuntut banyak keputusan sekaligus atau menyentuh >~3–5 file, pecah lebih lanjut. Scope sempit adalah mitigasi utama untuk model lemah — ia mempersempit ruang salah, memuat context, dan membuat verifikasi jadi biner (lihat [04-DELIVERY C.6](docs/04-DELIVERY.md)).

### 11.4 Alur status ringkas
```text
⬜️ → 🔄 (Dev mulai + CL; commit boleh ikut commit pertama)
     → 🔎 80% (Dev: test hijau + bukti + CL + commit)
        → ✅ 100% (QA: bukti reproducible + patuh SOT + QA-CL + commit)
        → ⚠️ (QA/AI-Planning & Review: gagal → balik ke Dev, alasan di Closure Log)
⏸️ → ⬜️ hanya QA/AI-Planning & Review setelah gate valid + CL + commit
```

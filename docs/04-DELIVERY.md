# 04 — DELIVERY (UX Flows · Testing · Task Breakdown)

> Status: Structure locked; detail dapat disesuaikan tim
> Related: 02-SPEC.md (normative), 03-ENGINEERING.md

---

# PART A — UX Flows

Fokus: alur pengguna utama yang mencerminkan aturan domain, bukan wireframe visual.

## A.1 Onboarding & Invitation

```text
Owner/Co-Owner buat Invitation (email + Permission Group)
        ▼
Email/notif terkirim → calon anggota buka link
        ▼
   ┌────┴────┐
   ▼         ▼
 Accept     Expired/Revoked → "Invitation sudah tidak berlaku"
   │
   ▼
Membership dibuat dengan Permission Group sesuai invitation
   ▼
User masuk Project, langsung punya akses (tanpa assignment kedua kali)
```
**Catatan:** User TIDAK BISA join tanpa invitation — tidak ada "request to join"/"join via link publik" di MVP.

## A.2 Membuat Struktur (Milestone → Board → List → Card)

```text
Project [+ New Milestone] → Milestone (title, due date, progress=0)
        [+ New Board]      → Board di dalam Milestone
        [+ New List]       → List dengan nama bebas (user tentukan sendiri)
        [+ New Card]       → Card di dalam List
```
**Catatan:** UI TIDAK menyarankan nama List baku ("Todo/In Progress/Done") sebagai default wajib — cukup contoh/template opsional, karena sistem tidak memaksakan semantic List.

## A.3 Card Movement

**Drag antar List (Board sama):**
```text
Drag Card List A → List B
        ▼
POST /cards/:id/move { destination_list_id, expected_version }
        ▼
   ┌────┴────┐
   ▼         ▼
 Sukses    409 VERSION_CONFLICT → "Card sudah diubah orang lain.
 (UI final) Muat ulang untuk versi terbaru." (bukan retry menimpa)
```

**Pindah ke Board lain:**
```text
"Move to another Board" → UI hanya tampilkan Board dalam Milestone SAMA
        ▼
Pilih Board + List tujuan → POST /cards/:id/move
        ▼
Sukses / INVALID_DESTINATION (server-side validation tetap jalan)
```

## A.4 Archive / Delete (Parent Entity)

```text
Klik "Delete" pada Board
        ▼
Board punya child?
   ┌────┴────┐
   ▼ Tidak    ▼ Ya
 Delete       Modal Child Handling:
 langsung      ○ Archive semua isi
               ○ Delete semua isi
               ○ Pindahkan (move) ke Board lain
                  └── dropdown Board tujuan (hanya ACTIVE dalam Milestone sama)
        ▼
Konfirmasi → Transaksi backend (ATOMIC):
  validasi destination (jika move) → validasi permission destination (jika move)
  → eksekusi child handling → eksekusi delete/archive Board
  → catat Activity untuk Board + setiap child
        ▼
Sukses / Gagal (permission/invalid destination) → rollback penuh + error spesifik
```
**Catatan penting:** Opsi "Pindahkan" **tidak muncul** untuk Project (cross-project dilarang). Untuk Card, modal ini **tidak pernah muncul** — cukup konfirmasi delete biasa (leaf entity).

## A.5 Restore

```text
Buka "Archived"/"Deleted" view → klik "Restore" pada List
        ▼
Cek ancestor chain: Board (parent) statusnya apa?
   ┌────┴─────┐
   ▼ ACTIVE    ▼ ARCHIVED/DELETED
 Restore      DENY — "List tidak dapat dipulihkan karena Board induknya masih
 berhasil     [archived/deleted]. Pulihkan Board terlebih dahulu."
```
**Catatan:** UI SHOULD tampilkan tombol "Restore parent first" sebagai shortcut, bukan hanya pesan error pasif.

## A.6 Comment (dengan Race Condition Handling)

```text
Buka Card, ketik comment → "Send" → POST /cards/:id/comments { body }
        ▼
Server cek: Card masih ACTIVE?
   ┌────┴────┐
   ▼ Ya       ▼ Tidak (baru saja dihapus/diarsipkan user lain)
 Comment     Ditolak: "Card sudah dihapus/diarsipkan,
 tersimpan   comment tidak dapat ditambahkan." → sarankan reload
```

## A.7 Permission Group Management

```text
Co-Owner buka "Permission Groups" → pilih/buat Group
        ▼
Toggle permission (card.read, card.update, card.move, ...)
        ▼
Set scope visibility untuk card.read: ALL / CREATED_BY_ME / ASSIGNED_TO_ME
        ▼
Simpan → LANGSUNG berlaku ke semua member Group (tanpa re-invite/re-assign)
```

## A.8 Card Visibility di List View

```text
Buka Board → resolve effective scope User untuk card.read
   ┌────┼────┐
   ▼    ▼    ▼
  ALL  CREATED  ASSIGNED
       BY_ME    TO_ME
  semua  hanya    hanya
  Card   Card     Card yang
         buatan   di-assign
         sendiri  ke User ini
```
**Catatan:** Sebaiknya ada indikator ("Menampilkan Card yang di-assign ke Anda") agar user tidak bingung — transparansi scope penting untuk trust.

## A.9 Prinsip UX Umum
- **Tidak ada silent data loss.** Operasi destruktif berdampak child SELALU tampilkan pilihan eksplisit sebelum eksekusi.
- **Konflik ditampilkan, tidak disembunyikan.** `VERSION_CONFLICT` tidak pernah di-resolve otomatis dengan menimpa — user diberi tahu & diminta refresh.
- **Riwayat selalu dapat ditelusuri.** Entity archived/deleted tetap dapat dibuka Activity-nya sesuai izin.
- **UI tidak berasumsi tentang makna List.** Tidak ada visual/logic khusus untuk List bernama tertentu (mis. "Done").

---

# PART B — Testing Strategy

## B.1 Filosofi
Testing = **kontrak yang dapat diverifikasi otomatis** terhadap 02-SPEC Part A. Jika implementasi melanggar invariant, kode dianggap salah **walaupun "berfungsi"**. Test suite MUST mencerminkan invariant, bukan hanya happy path.

## B.2 Piramida Test
```text
  E2E     — sedikit, alur kritis lintas modul (dari UX Flows Part A)
Integration — sedang, per domain command (move, delete+child handling, dsb)
   Unit   — banyak, per invariant, permission resolution, lifecycle helper
```
- **Unit:** fungsi murni (permission resolution, lifecycle state helper, scope ordering, version check).
- **Integration:** satu domain command end-to-end terhadap database test (mis. `POST /cards/:id/move` berbagai skenario state).
- **E2E:** alur multi-langkah realistis (invite → accept → create board → create card → move → archive → restore).

## B.3 Area Wajib Diuji (Non-Negotiable)
1. Project isolation — tidak ada kebocoran lintas Project.
2. Hierarchy integrity — tiap entity anak punya tepat satu parent valid.
3. Permission per Group — tiap baseline group diuji terhadap seluruh operasi di matrix.
4. Permission inheritance — grant level Milestone berlaku ke descendant.
5. Card visibility scope — ALL/CREATED_BY_ME/ASSIGNED_TO_ME + union multiple grants.
6. Lifecycle transitions — ACTIVE/ARCHIVED/DELETED + ancestor-chain requirement.
7. Parent-child handling — archive/delete/move children, termasuk atomicity & rollback.
8. Cross-project isolation — reject eksplisit tiap upaya cross-project.
9. Activity immutability — tidak ada jalur update/delete Activity.
10. Comment rules — tidak bisa dihapus; ditolak pada Card deleted/archived; edit → Activity baru tanpa ubah lama.
11. Optimistic concurrency — version conflict terdeteksi & ditolak; tidak ada silent overwrite.
12. Transaction rollback — kegagalan parsial tidak meninggalkan state sebagian.
13. API Key scope — tidak bisa lintas Project.
14. PAT authorization — tunduk membership & permission real-time, bukan snapshot.
15. Invitation flow — Group ter-assign benar saat accept.
16. Restore dependency — restore ditolak jika ancestor belum ACTIVE.

(Identik dengan Definition of Done di Part C.3.)

## B.4 Acceptance Criteria (Given/When/Then)
ID `AC-xxx` MUST dipakai sebagai referensi nama test agar tertelusur balik ke rule.

- **AC-001 Project Isolation** — Given akses Project A & B; When operasi di A; Then data B MUST NOT accessible implisit.
- **AC-002 Cross-Project Move** — Given Card milik Project A; When minta pindah ke List di B; Then API MUST menolak.
- **AC-003 Permission Inheritance** — Given Manager Group di Milestone A; When akses Board di bawahnya; Then permission warisan MUST diperhitungkan.
- **AC-004 Permission Granularity** — Given `card.read` scope `assigned_to_me`; When Card di-assign ke User lain; Then MUST NOT terlihat via permission itu.
- **AC-005 Multiple Groups** — Given A→`assigned_to_me`, B→`all`; Then effective scope MUST `all`.
- **AC-006 Creator Does Not Grant Access** — Given creator tanpa `card.read` berlaku; Then MUST NOT otomatis akses.
- **AC-007 Assignee Does Not Grant Access** — sama AC-006 untuk assignee.
- **AC-008 Archive Child Integrity** — Given Board archived; Then child List/Card MUST NOT tetap ACTIVE.
- **AC-009 Restore Dependency** — Given Board archived; When restore List langsung; Then MUST gagal.
- **AC-010 Delete Card** — Given Card ACTIVE; When user berwenang hapus; Then Card=DELETED + Activity `card.deleted`.
- **AC-011 Comment After Delete** — Given Card DELETED; When coba comment; Then MUST ditolak.
- **AC-012 Historical Comment** — Given Card punya comment lalu dihapus; Then comment historis tetap tersedia sesuai akses.
- **AC-013 Comment Immutability** — Given Comment A diedit; Then Activity historis A tak berubah; Activity baru `comment.edited` ditambahkan.
- **AC-014 Activity Immutability** — Given Activity ada; Then tidak ada jalur mutasi normal mengubah/menghapusnya.
- **AC-015 Parent Delete with Archive** — Given Board punya List & Card; When delete `strategy=archive`; Then Board=DELETED, List/Card=ARCHIVED + Activity masing-masing.
- **AC-016 Parent Delete with Delete** — sama AC-015, `strategy=delete` → descendant DELETED atomic.
- **AC-017 Parent Delete with Move** — Given Board A & B; When delete A + move List ke B; Then sukses hanya jika: B ACTIVE, Project sama, destination valid, punya permission destination, punya permission delete source.
- **AC-018 Invalid Destination** — Given Board B ARCHIVED; When move List ke B; Then MUST menolak.
- **AC-019 Transaction Rollback** — Given operasi parent modif banyak descendant; When salah satu gagal; Then tidak ada partial state ter-commit.
- **AC-020 Optimistic Locking** — Given Card.version=10; dua client `expected_version=10`; pertama sukses → version=11; kedua MUST `VERSION_CONFLICT`.
- **AC-021 API Key Scope** — Given API Key Project A; When dipakai ke B; Then MUST ditolak.
- **AC-022 PAT Scope** — Given PAT User A; When akses Project B; Then akses tetap bergantung membership & permission B.
- **AC-023 Expired Credential** — Given `expiration < now`; Then autentikasi MUST gagal.
- **AC-024 Revoked Credential** — Given `revoked = true`; Then autentikasi MUST gagal.
- **AC-025 Invitation** — Given invitation assign Contributor; When diterima; Then membership MUST punya Group tersebut.
- **AC-026 Membership Revocation** — Given punya membership; When dicabut; Then request berikutnya MUST gagal otorisasi; Activity historis tetap utuh.
- **AC-027 Owner** — Given User Owner; Then MUST tetap pegang ownership penuh walau Permission Group diubah.
- **AC-028 Co-Owner** — Given anggota Co-Owner Group; Then dapat permission dari Group tapi TIDAK jadi Owner.
- **AC-029 Generic PATCH Protection** — Given Card ada; When `PATCH` dengan `deleted_at`/`list_id`; Then MUST menolak/mengabaikan field terproteksi.
- **AC-030 Project Move Prohibition** — Given Project A & B; When upaya pindah descendant A ke B; Then MUST menolak.

## B.5 Strategi Test per Layer

| Layer | Fokus | Pendekatan (disarankan, belum final) |
|---|---|---|
| Domain/Unit | Permission resolution, lifecycle helper, scope ordering, version comparator | Unit framework sesuai stack (mis. Vitest/Jest) |
| Integration | Domain command end-to-end terhadap database test terisolasi | Database test terpisah per suite; transaksi di-rollback setelah test |
| Concurrency | Dua request paralel pada entity sama | Test yang fire dua mutation dengan `expected_version` sama |
| Authorization matrix | Group × Operation × Resource | Table-driven test dari matrix di 02-SPEC Part D |
| E2E | Alur multi-langkah realistis | Skenario dari UX Flows Part A |

## B.6 Aturan Test Tambahan untuk AI Coding Agent
- Setiap Business Rule (`BR-xxx`) SHOULD punya minimal satu test yang mereferensikan ID rule di nama/deskripsi.
- Test MUST NOT hanya jalur sukses — setiap invariant WAJIB punya negative test yang membuktikan pelanggaran ditolak.
- Perubahan pada 02-SPEC MUST diikuti pembaruan test terkait sebelum implementasi diubah.

---

# PART C — Task Breakdown

## C.1 Fase Pengembangan MVP

```text
Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7
Foundation Project Kanban Label& Author- Life- Harden- UI
                          Activity ization cycle ing
```

**Phase 0 — Foundation**
- Setup Auth (identity provider — open decision di 03-ENGINEERING)
- Setup Global DB (schema 03-ENGINEERING B.2)
- Project DB provisioning (awal, boleh manual/sinkron dulu)
- Project isolation di layer request (resolusi `project_id → database`)
- API infrastructure dasar (routing, response convention, error codes — 02-SPEC C.2)

**Phase 1 — Project**
- Project CRUD (create/read/update, archive/restore/delete)
- Membership model
- Invitation flow (create, accept)
- Owner assignment otomatis saat create Project
- Permission Group dasar (CRUD, baseline groups)

**Phase 2 — Kanban Core**
- Milestone (CRUD, progress manual)
- Board (CRUD)
- List (CRUD, guard "tidak bisa dihapus jika masih ada Card")
- Card (CRUD)
- Card movement (`/cards/:id/move` + validasi same-Milestone untuk cross-board)

**Phase 3 — Labels & Activity**
- Milestone Label & Board Label (CRUD)
- Card-Label association dengan lifecycle (`created_at`/`removed_at`)
- Activity table & append-only write path
- Comment (create, edit — sebagai Activity `comment_added`/`comment_edited`)
- Historical context pada Activity payload (BR-028)

**Phase 4 — Authorization**
- Permission resolution engine (formula ALLOW 02-SPEC A.10)
- Permission inheritance sepanjang hierarchy
- Card visibility scope + union multiple grants
- API Key (create, revoke, resolve saat autentikasi)
- PAT (create, revoke, resolve saat autentikasi)

**Phase 5 — Lifecycle**
- Archive/Delete/Restore untuk seluruh entity
- Child handling (archive/delete/move) untuk parent entity
- Ancestor-chain validation untuk restore (INV-LIFE-002)
- Retention policy dasar (logical delete dulu; physical purge menyusul)

**Phase 6 — Hardening**
- Optimistic locking penuh di semua domain command
- Validation layer (Zod atau setara) untuk seluruh request body
- Error handling konsisten (02-SPEC C.2)
- Audit consistency check (tiap mutation menghasilkan Activity sesuai)
- Backup/recovery dasar Global DB & Project DB

**Phase 7 — UI** (setelah domain/API stabil)
- Dashboard Project · Milestone view · Board view (drag & drop) · Card detail (Activity, Comment, Label) · Archived/Deleted view · Permission management UI

**Realtime tidak masuk MVP** (01-PRODUCT § 2.2).

## C.2 Pemetaan Fase ke Acuan

| Phase | Acuan utama |
|---|---|
| 0 | 03-ENGINEERING Part A, B, D |
| 1 | 02-SPEC A.2, A.12; C.4, C.13 |
| 2 | 02-SPEC A.1, A.6; C.5–C.8 |
| 3 | 02-SPEC A.4, A.8, A.9, A.11; C.9–C.11 |
| 4 | 02-SPEC A.10, A.11, A.13; 03-ENGINEERING Part C |
| 5 | 02-SPEC A.3, A.4, A.5; C.4–C.8 |
| 6 | 02-SPEC A.7, A.14, A.15; 04-DELIVERY Part B |
| 7 | 04-DELIVERY Part A · docs/05-FRONTEND.md · PHASE-7-TASKS.md (blocked s/d Phase 0–6 verified) |

## C.3 Definition of Done (MVP)

Implementasi domain compliant **hanya jika** seluruh berikut terpenuhi:
- Seluruh invariant di 02-SPEC Part A tercakup automated test.
- Test otorisasi mencakup setiap Permission Group baseline.
- Test permission inheritance ada.
- Test Card visibility scope ada.
- Test lifecycle (archive/delete/restore + ancestor chain) ada.
- Test parent-child handling (archive/delete/move) ada.
- Test cross-project isolation ada.
- Test Activity immutability ada.
- Terbukti test: comment tidak dapat dihapus.
- Terbukti test: Card deleted tidak dapat terima comment baru.
- Test optimistic concurrency ada.
- Test transaction rollback ada.
- Test API Key scope ada.
- Test PAT authorization ada.
- Test invitation flow ada.
- Test restore dependency ada.

(Identik dengan Part B.3 — keduanya harus tetap sinkron.)

## C.4 Implementation Rules for AI Coding Agents

**Rule 1 — Do Not Invent Domain Behavior.** Jika perilaku tidak dispesifikasi, MUST NOT diam-diam menciptakan business rule baru yang mengubah invariant.
**Rule 2 — Domain Commands.** MUST pakai operasi domain eksplisit untuk move/archive/restore/delete — bukan generic field update.
**Rule 3 — Authorization First.** Setiap operasi terproteksi MUST cek otorisasi sebelum mutation.
**Rule 4 — Validate Destination.** Operasi move MUST validasi destination independen (existence, Project sama, ACTIVE, permission).
**Rule 5 — Preserve Activity.** Perubahan state destruktif/bermakna MUST menghasilkan Activity.
**Rule 6 — Activity Is Immutable.** MUST NOT sediakan jalur update terhadap Activity historis.
**Rule 7 — No Cross-Project Leakage.** Repository/service MUST selalu menegakkan Project boundary di setiap query.
**Rule 8 — Transactional Domain Commands.** Operasi memengaruhi banyak entity MUST transactional.
**Rule 9 — Optimistic Locking.** Modifikasi konkuren MUST NOT saling menimpa diam-diam.
**Rule 10 — Do Not Add Non-MVP Features.** MUST NOT menambah realtime, microservices tak perlu, authorization engine kompleks (DENY/ABAC), event bus, atau workflow state tambahan — kecuali diminta eksplisit lewat revisi spesifikasi.

## C.5 Prioritas Jika Waktu Terbatas

**TIDAK BOLEH dipangkas** (integritas data & keamanan dasar):
1. Project isolation
2. Hierarchy invariant (Card→List→Board→Milestone→Project)
3. Optimistic locking
4. Activity immutability
5. Authorization formula dasar (membership + permission check)

**Boleh ditunda** ke iterasi berikutnya (dengan catatan technical debt eksplisit):
- Card visibility scope granular (sementara default `ALL` untuk semua)
- Label lifecycle (`removed_at`) — sementara delete fisik dengan catatan risiko hilang histori
- Move children saat parent delete (sementara hanya archive/delete, tanpa move)

**Tidak boleh ditunda** (risiko keamanan langsung):
API Key/PAT scope enforcement · credential hashing · generic PATCH field protection.

## C.6 Task Generation Guide untuk Code AI

Task granular **tidak ditulis statis** di dokumen ini — task cepat basi karena bergantung pada keputusan implementasi yang masih open (format ID, ORM, dll) dan pada kode nyata yang belum ada. Sebagai gantinya, task di-generate **on-demand per fase** oleh code AI, menggunakan phase-level scope di C.1 sebagai batas. Bagian ini adalah **kontrak cara generate task** agar hasilnya konsisten dengan SOT setiap kali.

### C.6.1 Kapan Generate Task
- Generate task hanya untuk **satu Phase yang sedang aktif** (dari C.1). MUST NOT lompat/mendahului fase berikutnya.
- Sebelum generate, code AI MUST membaca: seluruh **02-SPEC**, **03-ENGINEERING** Part A & B, dan baris Phase terkait di C.1 + pemetaan acuannya di C.2.
- Sebelum generate, code AI MUST memeriksa state repo aktual (file/module yang sudah ada) agar task merujuk artefak nyata, bukan asumsi.

### C.6.2 Format Wajib Tiap Task
Setiap task yang di-generate MUST memuat enam elemen berikut:

```text
[ ] TASK-<phase>.<n> — <judul imperatif singkat>
    Rule refs   : <BR-xxx / FR-xxx / INV-xxx yang relevan>
    Files       : <file yang dibuat/diubah, path konkret>
    Deskripsi   : <apa yang dikerjakan, 1-3 kalimat>
    Test        : <AC-xxx dan/atau unit test yang harus lulus>
    Done when   : <kriteria selesai yang dapat diverifikasi>
```

Aturan tambahan:
- **Satu task = satu unit yang bisa di-review terpisah.** Jika sebuah task menyentuh >~5 file atau menggabungkan beberapa concern (mis. schema + endpoint + auth sekaligus), pecah lebih lanjut.
- **Pecah task menjadi goal kecil (WAJIB).** Task di-breakdown jadi goal-goal kecil dalam tabel (ID · Status · % · Goal · Reference · Dependency), dengan prinsip **satu goal = satu Reference, satu Test, satu DoD, satu unit review**. Alasan: implementasi dikerjakan sesi Dev yang bisa memakai **model ringan** ([AGENTS.md](../AGENTS.md) §11.2); scope goal yang sempit adalah mitigasi utama untuk model lemah — mempersempit ruang salah, memuat context (cukup kirim section Reference goal, bukan seluruh SOT), dan membuat verifikasi jadi biner (hijau/tidak). Jika sebuah goal menuntut banyak keputusan sekaligus atau menyentuh >~3–5 file, pecah lagi.
- Task MUST diurutkan sesuai dependency (mis. migration sebelum repository sebelum endpoint sebelum test integrasi).
- Setiap task yang menyentuh **mutation** MUST menyertakan test optimistic locking (`AC-020` pattern) di elemen Test.
- Setiap task yang menyentuh **operasi terproteksi** MUST menyertakan authorization test (minimal satu positive + satu negative) di elemen Test.
- Setiap task yang menyentuh **query resource** MUST menyertakan verifikasi Project boundary (tidak ada kebocoran lintas Project) di Done-when.

### C.6.3 Guardrails Saat Generate & Mengerjakan
Code AI MUST tetap tunduk pada **C.4 Implementation Rules** saat memecah maupun mengerjakan task. Secara khusus saat generate task:
- MUST NOT membuat task yang memperkenalkan fitur non-MVP (lihat 01-PRODUCT § 2.2) — jika sebuah kebutuhan terasa perlu tapi di luar scope, buat task terpisah bertanda `[NEEDS-SPEC-AMENDMENT]` dan berhenti, jangan implementasi diam-diam (lihat C.6.5).
- MUST NOT membuat task yang melanggar salah satu dari 10 invariant inti (02-SPEC A.16). Jika phase scope tampak menuntut pelanggaran, itu sinyal task salah pecah — tinjau ulang.
- MUST memetakan setiap endpoint yang dibuat ke definisinya di 02-SPEC Part C. Tidak boleh ada endpoint yang tidak tercantum di kontrak API tanpa amandemen.

### C.6.4 Definition of Done per Task vs per Phase
- **Per task:** elemen "Done when" pada task terpenuhi + seluruh test yang tercantum lulus.
- **Per phase:** seluruh task fase selesai **dan** subset acceptance criteria relevan (C.2 mapping) hijau. Sebuah Phase MUST NOT ditandai selesai jika ada AC relevan yang belum tercakup test.
- Phase 6 (Hardening) dan keseluruhan MVP MUST memenuhi **Definition of Done** penuh di C.3.

### C.6.5 Penanganan Ambiguitas / Open Decision
Jika saat generate/mengerjakan task code AI menemukan hal yang belum diputuskan (lihat open decisions di 03-ENGINEERING Part E) atau kontradiksi dalam SOT:
1. MUST NOT memilih perilaku sendiri secara diam-diam.
2. Buat task/catatan bertanda `[NEEDS-DECISION]` atau `[NEEDS-SPEC-AMENDMENT]` yang menjelaskan pilihan yang ada + rekomendasi.
3. Untuk open decision teknis murni yang tidak menyentuh business invariant (mis. pemilihan library test), code AI MAY memutuskan sendiri asalkan dicatat eksplisit di task dan mudah diganti (di balik abstraction), sesuai 03-ENGINEERING A.8.
4. Untuk apa pun yang menyentuh business invariant / authorization / lifecycle / API semantics → WAJIB berhenti dan minta keputusan manusia sebelum lanjut (governance 01-PRODUCT § 0.2).

### C.6.6 Contoh Prompt untuk Memulai Sebuah Phase
Gunakan pola berikut saat menugaskan code AI:

```text
Baca 02-SPEC dan 03-ENGINEERING (Part A & B) sepenuhnya, lalu 04-DELIVERY C.1 baris "Phase 2".
Periksa struktur repo saat ini.
Generate task list untuk Phase 2 mengikuti format & aturan di 04-DELIVERY C.6.
Jangan mengerjakan fase lain. Jangan menambah fitur di luar 01-PRODUCT § 2.2.
Tandai setiap ambiguitas dengan [NEEDS-DECISION]/[NEEDS-SPEC-AMENDMENT] dan berhenti pada hal yang menyentuh business invariant.
Tampilkan task list dulu untuk saya review sebelum mulai implementasi.
```

### C.6.7 Contoh Hasil Task yang Benar (ilustrasi, bukan task final)
```text
[ ] TASK-2.3 — Endpoint create Card
    Rule refs   : FR-024, BR-004, BR-005, C.8 (02-SPEC)
    Files       : src/app/api/.../cards/route.ts, src/modules/card/card.service.ts,
                  src/modules/card/card.schema.ts (Zod)
    Deskripsi   : Implement POST /projects/:project_id/lists/:list_id/cards.
                  Validasi List ada & ACTIVE, set creator dari identitas request,
                  assignee opsional (validasi membership jika ada).
    Test        : happy path create; reject jika List archived/deleted (INV-LIFE-003/004);
                  reject assignee non-member; Activity card.created tercipta (BR-025).
    Done when   : Endpoint sesuai kontrak C.8; Card selalu punya tepat satu List;
                  query tidak bocor lintas Project; semua test di atas lulus.
```

Task granular seperti di atas **di-generate saat fase dikerjakan**, bukan disimpan statis di SOT — sehingga selalu selaras dengan kode nyata dan keputusan yang sudah diambil sampai titik itu.

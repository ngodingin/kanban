# 02 — SPEC (Functional Requirements · Business Rules · API Contract)

> Status: **Locked for MVP** — Normative. This is the primary contract for implementation.
> Terminology MUST/MUST NOT/SHOULD/MAY follows RFC 2119.
> Related: 01-PRODUCT.md, 03-ENGINEERING.md, 04-DELIVERY.md

---

# PART A — Business Rules & Domain Invariants

This is the most important part for implementation correctness. If code violates any invariant here, it is wrong **even if it "works"**.

## A.1 Hierarchy Invariants

- **BR-001** Setiap Milestone MUST memiliki tepat satu Project.
- **BR-002** Setiap Board MUST memiliki tepat satu Milestone.
- **BR-003** Setiap List MUST memiliki tepat satu Board.
- **BR-004** Setiap Card MUST memiliki tepat satu List.
- **BR-005** Card MUST NOT berdiri tanpa List.
- **BR-006** Entity MUST NOT berpindah antar-Project dalam kondisi apa pun.

## A.2 Project Isolation

- **BR-007** Project adalah **hard isolation boundary** untuk: data, hierarchy, membership, permission, permission group, API Key, Activity, Label, dan authorization context.
- **BR-008** Tidak ada API yang mengizinkan `move child from Project A to Project B`.
- **BR-009** Membership & permission di Project A MUST NOT otomatis berlaku di Project B, meski User sama menjadi anggota keduanya.
- **BR-010** Tidak ada requirement cross-project search di MVP.

## A.3 Entity Lifecycle

State kanonik:

```text
ACTIVE:    archived_at = NULL, deleted_at = NULL
ARCHIVED:  archived_at != NULL, deleted_at = NULL
DELETED:   deleted_at != NULL   (mengalahkan archived_at dalam determinasi state)
```

State machine (berlaku untuk Project, Milestone, Board, List, Card):

```mermaid
stateDiagram-v2
    [*] --> ACTIVE : create
    ACTIVE --> ARCHIVED : archive
    ACTIVE --> DELETED : delete
    ARCHIVED --> DELETED : delete
    ARCHIVED --> ACTIVE : restore*
    note right of ARCHIVED
        Read-only. Restore hanya jika seluruh
        ancestor ACTIVE (INV-LIFE-002).
    end note
    note right of DELETED
        Terminal bagi user hingga internal prune.
        Tidak dapat di-restore (INV-LIFE-004).
    end note
    note left of ACTIVE
        Operasional hanya jika SELURUH ancestor
        chain juga ACTIVE (INV-LIFE-001).
    end note
```

- **BR-011** `deleted_at` MUST diprioritaskan saat menentukan state entity.
- **BR-012** Implementasi SHOULD menyediakan helper eksplisit (`IsActive()`, `IsArchived()`, `IsDeleted()`) dan MUST NOT menyebarkan logika interpretasi lifecycle ke banyak tempat berbeda.

### INV-LIFE-001 — Effective Ancestor Requirement
Entity hanya operasional jika local state-nya ACTIVE **dan** seluruh ancestor chain ACTIVE. Descendant MAY tetap memiliki local state ACTIVE saat ancestor ARCHIVED/DELETED, tetapi MUST diperlakukan tidak operasional: tidak menerima mutation dan tidak muncul pada query aktif.

### INV-LIFE-002 — Restore Dependency
Entity ARCHIVED MAY di-restore **hanya jika** seluruh ancestor chain-nya ACTIVE, berurutan dari ancestor teratas. Entity DELETED tidak dapat di-restore.
```text
Board=ARCHIVED, List=ARCHIVED → restore List langsung: DENY
Urutan benar: restore Board, lalu restore List
```

### INV-LIFE-003 — Archived Resource Mutation
Entity ARCHIVED MUST NOT menerima update, move, atau comment. Operasi valid: read/audit, restore (tunduk INV-LIFE-002), atau delete.

### INV-LIFE-004 — Deleted Resource Mutation
Entity DELETED MUST NOT menerima mutation apa pun, termasuk restore. Entity MAY dibaca melalui Deleted/Audit view sesuai permission sampai internal prune menghapusnya permanen.

## A.4 Parent Lifecycle Effect

- **BR-013** Archive/delete parent MUST hanya mengubah lifecycle timestamp, `version`, dan Activity parent tersebut. Local state, `version`, dan parent relation seluruh descendant MUST tetap.
- **BR-014** Descendant dengan ancestor ARCHIVED/DELETED MUST menjadi tidak operasional secara efektif sesuai INV-LIFE-001, tanpa cascade lifecycle.
- **BR-015** Restore parent ARCHIVED MUST membuat descendant kembali operasional sesuai local state masing-masing; descendant yang local state-nya ARCHIVED/DELETED tetap non-ACTIVE.
- **BR-016** Internal prune pada entity DELETED MUST menghapus seluruh subtree secara fisik sebagai satu unit agar tidak menghasilkan orphan. Prune bukan operasi user.
- **BR-016A** Entity DELETED MUST disimpan minimal 30 hari penuh sejak `deleted_at` dan MUST NOT di-prune sebelum `deleted_at <= now - 30 days`. Setelah batas tersebut entity menjadi eligible untuk prune; sistem MAY mengeksekusinya kemudian sesuai jadwal internal.

## A.5 Move Invariants

- **INV-MOVE-001 — Card Only & Same Project.** Hanya Card yang dapat dipindahkan pada MVP dan MUST tetap dalam Project sama. Milestone, Board, dan List MUST NOT memiliki operasi move.
- **INV-MOVE-002 — Valid Destination.** Destination List MUST ada, berada di Project sama, memiliki seluruh ancestor ACTIVE, dan menjadi parent valid untuk Card.
- **INV-MOVE-003 — Destination Authorization.** Actor MUST punya permission cukup untuk menulis ke destination. **Permission menghapus source TIDAK otomatis memberi permission menulis destination.**
- **INV-MOVE-004 — Atomicity.** Perubahan `card.list_id`, increment `version`, penyesuaian asosiasi Label yang terdampak, dan Activity `card.moved` MUST commit atomik atau seluruhnya rollback.

## A.6 Card Movement (Spesifik)

- **BR-017** Card MUST berpindah List via domain operation khusus (`/cards/:id/move`), MUST NOT via `PATCH card.list_id`.
- **BR-018** Card MAY berpindah Board hanya jika `source_board.milestone_id == target_board.milestone_id`. Ini **business invariant**, bukan sekadar permission check — berlaku walau User punya permission penuh di kedua Board.

## A.7 Concurrency (Optimistic Locking)

- **BR-019** Setiap entity mutable MUST memiliki `version`.
- **BR-020** Concurrency MUST dievaluasi **per-entity**, bukan per-Project/global — mutation Card A tidak boleh menyebabkan konflik pada Card B.
- **BR-021** Mutation membawa `expected_version`; jika `current_version != expected_version` → `409 VERSION_CONFLICT`, tanpa perubahan state, tanpa Activity domain untuk request yang ditolak.
- **BR-022** Prinsip: **"Last valid write wins"**, bukan "last write wins".
- **BR-023** MVP pakai **entity-level locking**, bukan field-level — dua mutation pada field berbeda di entity sama tetap saling konflik jika version sama.

## A.8 Activity (Audit Trail)

- **BR-024** Activity MUST immutable & append-only — tidak ada UPDATE/DELETE.
- **BR-025** Setiap entity (Project, Milestone, Board, List, Card, Milestone Label, Board Label) MUST memiliki Activity sendiri. Untuk Project, state otoritatif (`name`, lifecycle, dan `version`) dan Activity-nya MUST berada di Project DB yang sama, serta MUST dimutasi dalam satu transaksi Project DB.
- **BR-026** Activity MUST mencatat action spesifik (mis. `card.moved`, bukan generic `entity.status_changed`).
- **BR-027** Operasi lifecycle parent MUST hanya menghasilkan Activity parent. Descendant tidak mendapat Activity lifecycle karena local state-nya tidak berubah.
- **BR-028** Activity payload MUST menyimpan cukup konteks historis agar tetap bermakna walau entity yang direferensikan (mis. nama List lama) sudah dihapus.
- **BR-029** `actor_user_id` pada Activity MUST tetap valid historis walau membership actor dicabut — MUST NOT jadi NULL.

## A.9 Comment

- **BR-030** Comment adalah bagian dari Activity Card.
- **BR-031** Comment MAY dibuat & diedit, MUST NOT dihapus.
- **BR-032** Edit comment MUST menghasilkan Activity baru (`comment.edited`) tanpa mengubah Activity `comment.added` lama.
- **BR-033** Comment baru MUST ditolak pada Card berstatus DELETED atau ARCHIVED.
- **BR-034** Race condition (Card dihapus tepat saat User lain menambah comment) MUST dicegah dengan validasi state Card **saat request diproses**, bukan berdasarkan state saat UI dibuka.
- **BR-034A** `card.comment.update` MUST hanya mengizinkan actor mengedit Activity `comment.added`/`comment.edited` miliknya sendiri (`activity.actor_user_id == current_user_id`). Ini adalah **business invariant kepemilikan komentar**, bukan sekadar grant Permission Group — berlaku mutlak termasuk Owner (Owner tetap tunduk business invariant walau bypass grant Group/direct Permission per BR-037). Konsisten dengan BR-031 (comment tidak dapat dihapus siapa pun): mutasi terhadap komentar sengaja dibatasi ketat.

## A.10 Permission & Authorization

### Formula Otorisasi Resmi
```text
ALLOW(operation) =
    valid membership
    AND permission granted
    AND scope matches
    AND entity state permits operation
    AND business invariant permits operation
    AND optimistic-lock version valid
```
Semua kondisi harus TRUE. Tidak ada komponen yang boleh dilewati hanya karena komponen lain terpenuhi.

- **BR-035** Owner adalah **ownership property** (`Project.owner_user_id`), bukan Permission Group. Owner MUST NOT kehilangan ownership akibat perubahan Permission Group apa pun.
- **BR-036** Co-Owner MUST diimplementasikan sebagai Permission Group biasa, bukan ownership kedua. Co-Owner MUST NOT otomatis bypass permission check.
- **BR-037** Owner MAY bypass pemeriksaan grant dari Permission Group/direct Permission untuk operasi dalam Project miliknya, tetapi tetap tunduk lifecycle, business invariant (mis. tidak bisa cross-project move), dan concurrency validation.
- **BR-038** Permission bersifat **additive** — MVP MUST NOT mengimplementasikan DENY. Effective permission = union seluruh scoped Permission Group assignment dan scoped direct Permission assignment yang berlaku bagi Membership.
- **BR-039** Permission Group MUST Project-scoped, bukan global, dan MUST bukan hard-coded role (`if role == "manager"` dilarang).
- **BR-040** Perubahan isi Permission Group (tambah/kurangi permission atau visibility `card.read`) MUST langsung berlaku ke semua Membership yang memiliki assignment Group tersebut — tidak ada snapshot permission per assignment.
- **BR-041** Soft-delete Permission Group MUST menyebabkan seluruh member kehilangan permission dari group tersebut, tanpa menghapus riwayat assignment.
- **BR-042** Permission Group MUST diberikan kepada Membership melalui scoped assignment pada tepat satu level Project/Milestone/Board/List/Card dan diwariskan ke descendant scope tersebut. Group yang sama MAY diberikan kepada Membership berbeda pada scope berbeda.
- **BR-042A** Membership MAY menerima direct Permission pada tepat satu hierarchy scope. Direct Permission menambah effective permission tanpa mengubah Permission Group dan tanpa mencabut grant lain.
- **BR-042B** Setiap scoped assignment MUST merujuk resource yang ada, berada dalam Project Membership/Group yang sama, dan divalidasi ulang terhadap hierarchy terkini saat authorization.
- **BR-043** Otorisasi MUST dievaluasi **per-operasi** — `card.read` MUST NOT diasumsikan memberi `card.update`, `card.move`, `card.delete`, dsb.
- **BR-044** `card.move` adalah permission tersendiri, terpisah dari `card.update` — karena Move adalah state transition yang lebih consequential.
- **BR-045** Creator & Assignee pada Card **bukan permission grant**. Menjadi creator/assignee TIDAK otomatis memberi hak update/delete — hak tetap berasal dari scoped Group/direct Permission.
- **BR-045A** Domain command Card (`archive`/`restore`/`delete`/`update`/`move`) MUST dievaluasi murni dari grant permission + state Card saat ini, BUKAN dari riwayat siapa aktor sebelumnya. `card.restore` berlaku untuk Card manapun yang berstatus ARCHIVED terlepas dari siapa yang meng-archive-nya — bukan hanya oleh aktor yang sama. Ini menegaskan BR-045 (bukan aturan baru) dan mencegah Card terjebak permanen ARCHIVED apabila actor yang meng-archive kehilangan membership atau tidak tersedia.
- **BR-046** Lifecycle entity selalu menang atas permission: walau User punya `card.delete`, jika Card DELETED, seluruh operasi mutasi tetap DENY.

## A.11 Card Visibility Scope

- **BR-047** Card memiliki dimensi visibility tambahan: `ALL`, `CREATED_BY_ME`, `ASSIGNED_TO_ME`.
  - `ALL` — semua Card dalam applicable authorization scope.
  - `CREATED_BY_ME` — Card dengan `creator_user_id == current_user_id`.
  - `ASSIGNED_TO_ME` — Card dengan `creator_user_id == current_user_id` **atau** `assignee_user_id == current_user_id`.
- **BR-048** Urutan keluasan: `CREATED_BY_ME < ASSIGNED_TO_ME < ALL`. Default saat `card.read` dibuat tanpa visibility eksplisit adalah `CREATED_BY_ME`. Jika beberapa grant berlaku pada entity yang sama, visibility terluas menang.
- **BR-049** Visibility MUST dihitung hanya dari grant yang applicable terhadap hierarchy terkini Card. Berpindah ke child hierarchy lain tidak memperluas visibility kecuali ada scoped grant lain yang memang berlaku di sana.

## A.12 Invitation & Membership

- **BR-050** Membership Project MUST melalui invitation — tidak ada join bebas.
- **BR-051** Invitation MUST menentukan minimal satu Permission Group beserta hierarchy scope assignment-nya sejak dibuat.
- **BR-052** Invitation SHOULD menyimpan **reference** ke Permission Group dan scope resource, bukan snapshot definisi permission — jika Group berubah sebelum/sesudah acceptance, Membership mendapat definisi Group yang berlaku saat itu.
- **BR-052A** Invitation MAY menentukan `expires_at` eksplisit (harus di masa depan); jika tidak diberikan, sistem MUST men-default ke **3 hari** dari waktu pembuatan.
- **BR-053** Pencabutan membership MUST mencabut otorisasi berjalan, MUST NOT menghapus data historis (`creator_user_id`, `activity.actor_user_id` tetap utuh).
- **BR-054** Jika Assignee kehilangan membership, sistem MUST men-set `assignee_user_id = NULL` & mencatat Activity `card.unassigned`. `creator_user_id` MUST NOT berubah.
- **BR-054A** Accept Invitation MUST menolak jika email User yang menerima (ternormalisasi, konsisten `users.email`) tidak sama dengan `invitations.email` — mencegah privilege escalation lewat `invitation_id` yang bocor/diteruskan (invitation_id bukan token rahasia, dikirim ke pembuat undangan untuk diteruskan lewat email eksternal). Penolakan MUST NOT membocorkan alasan spesifik (mis. pakai kode generik, bukan pesan "email tidak cocok").
- **BR-054B** Accept Invitation oleh User yang sebelumnya memiliki Membership ter-revoke pada Project yang sama MUST mengaktifkan ulang (reactivate) row Membership existing (set `revoked_at = NULL`) alih-alih ditolak permanen — `project_memberships` MUST tepat satu row per `(project_id, user_id)` selamanya (constraint schema, 03-ENG B.2), sehingga rejoin tidak dapat berupa row baru. Scoped Group assignment dari invitation MUST ditambahkan sebagai assignment baru; assignment lama yang sudah revoked (dari keanggotaan sebelumnya) TETAP revoked (riwayat utuh, BR-053) — TIDAK otomatis diaktifkan kembali.

## A.13 Credential (API Key & PAT)

- **BR-055** API Key adalah credential **Project-scoped** — bukan model otorisasi baru. Alur tetap: `API Key → User → Project Membership → Permission`.
- **BR-056** PAT adalah credential **User-scoped**, dapat dipakai lintas Project sesuai membership User, MUST tidak memberi permission tambahan di luar yang dimiliki User.
- **BR-057** Credential secret MUST disimpan sebagai hash, tidak pernah plaintext; raw secret hanya ditampilkan sekali saat pembuatan.
- **BR-058** Credential expired atau revoked MUST ditolak saat autentikasi.

## A.14 Database Cascade

- **BR-059** Logical deletion MUST NOT memakai `ON DELETE CASCADE`; hanya parent yang berubah. Physical cascade hanya MAY dipakai oleh internal prune setelah otorisasi/lifecycle/retention ditangani domain layer.
- **BR-060** Database cascade MAY dipakai hanya jika tidak melanggar semantik domain di atas.

## A.15 API Design Constraint

- **BR-061** Business transition (Card move serta archive/restore/delete) MUST NOT diimplementasikan sebagai arbitrary field update via generic PATCH.
- **BR-062** Generic PATCH MUST NOT mengizinkan perubahan field yang dikendalikan domain: `id`, `projectId`, `creatorUserId`, `createdAt`, `version`, `archivedAt`, `deletedAt`, serta relasi hierarki (mis. `listId`).

## A.16 Sepuluh Invariant Inti (Jantung Aplikasi)

1. Every Card MUST belong to exactly one List.
2. Every List MUST belong to exactly one Board.
3. Every Board MUST belong to exactly one Milestone.
4. Resources MUST NOT cross Project boundaries.
5. Only Card is movable; it MAY move between Boards only inside the same Milestone.
6. Mutations MUST validate current state before committing.
7. Concurrent mutations MUST use optimistic concurrency/version checking.
8. Activity MUST be immutable and append-only.
9. Entity mutation and its Activity MUST commit atomically.
10. Authorization MUST be evaluated against the entity's current hierarchy, per operation.

---

# PART B — Functional Requirements

Requirement fungsional per modul. Setiap FR dapat ditelusuri ke BR/INV terkait di Part A.

## B.1 Project
- **FR-001** Sistem MUST mengizinkan User membuat Project baru; pembuat otomatis jadi Owner. Provisioning MUST membuat record `project_state` awal di Project DB sebagai state domain Project yang otoritatif.
- **FR-002** Sistem MUST memastikan setiap Project punya tepat satu Owner.
- **FR-003** Sistem MUST NOT menyediakan operasi pemindahan resource antar-Project.
- **FR-004** Sistem MUST mendukung lifecycle Project: ARCHIVED dapat di-restore, DELETED terminal hingga prune; transition Project tidak mengubah local state descendant.

## B.2 Membership & Invitation
- **FR-005** Sistem MUST mensyaratkan invitation untuk join Project (tidak ada join bebas).
- **FR-006** Invitation MUST menentukan Permission Group assignment beserta hierarchy scope sejak dibuat.
- **FR-007** Setelah invitation diterima, sistem MUST otomatis membuat Membership dengan scoped Permission Group assignment sesuai invitation.
- **FR-008** Sistem MUST mengizinkan revoke membership; efeknya pencabutan otorisasi, bukan penghapusan data historis.

## B.3 Permission Group
- **FR-009** Permission Group MUST Project-scoped (bukan global).
- **FR-010** Sistem MUST mendukung baseline groups (Co-Owner, Manager, Contributor, Viewer) yang permission-nya dapat dikonfigurasi, bukan hard-coded.
- **FR-011** Sistem MUST menghitung effective permission sebagai union seluruh grant berlaku (additive, tanpa DENY).
- **FR-012** Perubahan permission pada Group MUST langsung berlaku ke seluruh member (live reference, bukan snapshot).
- **FR-013** Sistem MUST mendukung assignment `Membership + Permission Group + scope` pada level Project/Milestone/Board/List/Card, dengan pewarisan ke descendant.
- **FR-013A** Sistem MUST mendukung scoped direct Permission pada Membership; effective permission adalah union Group dan direct grant tanpa DENY.

## B.4 Milestone
- **FR-014** Sistem MUST mengizinkan pembuatan Milestone (title, description, progress 0–100, start_date, due_date).
- **FR-015** Sistem MUST NOT menghitung progress Milestone otomatis dari Card/List.
- **FR-016** Sistem MUST NOT menyediakan field status pada Milestone di MVP.
- **FR-017** Milestone MUST mendukung Milestone Label yang dapat dipakai semua Board di dalamnya.

## B.5 Board
- **FR-018** Sistem MUST mengizinkan pembuatan Board di bawah Milestone.
- **FR-019** Board MUST NOT punya status, warna, ikon, atau WIP limit di MVP.
- **FR-020** Board MUST mendukung Board Label yang hanya berlaku pada Board tersebut.

## B.6 List
- **FR-021** Sistem MUST mengizinkan pembuatan List (title bebas tanpa semantic bawaan).
- **FR-022** Sistem MUST mengizinkan archive/delete List tanpa mengubah local state atau parent relation Card di dalamnya; Card menjadi tidak operasional secara efektif.
- **FR-023** List MUST NOT punya field status di MVP.

## B.7 Card
- **FR-024** Sistem MUST mengizinkan pembuatan Card (title, subtitle, description, due_date).
- **FR-025** Sistem MUST mencatat creator sebagai historical reference yang tidak berubah walau membership dicabut.
- **FR-026** Sistem MUST mendukung maks satu assignee; assignee MUST jadi NULL otomatis jika membership assignee dicabut.
- **FR-027** Sistem MUST mengizinkan Card pindah List via domain operation khusus (move), bukan update field biasa.
- **FR-028** Sistem MUST mengizinkan Card pindah Board hanya jika Board sumber & tujuan dalam Milestone sama.
- **FR-029** Sistem MUST NOT mengizinkan Card pindah lintas Project.
- **FR-030** Sistem MUST menolak move Card jika `expected_version` tidak sesuai versi terkini.

## B.8 Label
- **FR-031** Sistem MUST mendukung dua scope Label: Milestone Label & Board Label.
- **FR-032** Card MUST dapat punya banyak Label dari kedua scope tanpa batas di MVP.
- **FR-033** Sistem MUST mempertahankan riwayat asosiasi Label-Card (created_at/removed_at) alih-alih hapus baris fisik saat orphaned.
- **FR-034** Sistem MUST NOT mengizinkan Label orphaned dipakai sebagai Label aktif baru.

## B.9 Activity
- **FR-035** Sistem MUST mencatat Activity untuk setiap perubahan signifikan pada Project, Milestone, Board, List, Card, Milestone Label, Board Label.
- **FR-036** Activity MUST append-only & immutable — tidak ada endpoint UPDATE/DELETE.
- **FR-037** Activity MUST menyimpan cukup konteks historis (mis. nama List sebelumnya) agar tetap bermakna walau entity terkait dihapus.
- **FR-038** Operasi lifecycle parent MUST hanya menghasilkan Activity parent; tidak ada Activity descendant tanpa perubahan local state descendant.

## B.10 Comment
- **FR-039** Sistem MUST mengizinkan penambahan comment pada Card sebagai bagian Activity Card.
- **FR-040** Sistem MUST mengizinkan edit comment, dengan Activity baru (`comment.edited`) tanpa mengubah Activity lama.
- **FR-041** Sistem MUST NOT menyediakan penghapusan comment.
- **FR-042** Sistem MUST menolak comment baru pada Card berstatus Deleted atau Archived.

## B.11 Lifecycle
- **FR-043** Sistem MUST mendukung state Active/Archived/Deleted untuk Project, Milestone, Board, List, Card; hanya ARCHIVED yang dapat di-restore.
- **FR-044** Sistem MUST memperlakukan entity local-ACTIVE sebagai tidak operasional jika ada ancestor Archived/Deleted.
- **FR-045** Sistem MUST menolak restore entity ARCHIVED apabila ancestor belum sepenuhnya Active dan MUST selalu menolak restore entity DELETED.
- **FR-046** Archive/delete parent MUST tidak mengubah local state descendant dan MUST tidak meminta child handling.
- **FR-047** Internal prune entity DELETED MUST menghapus seluruh subtree secara permanen tanpa orphan, hanya setelah retention 30 hari terpenuhi; prune bukan endpoint user MVP.

## B.12 Concurrency
- **FR-048** Setiap entity mutable MUST punya `version` yang increment atomically pada tiap mutation.
- **FR-049** Mutation SHOULD menyertakan `expected_version`; sistem MUST menolak dengan `VERSION_CONFLICT` jika tidak sesuai.
- **FR-050** Concurrency check MUST per-entity (bukan per-Project/global).

## B.13 Credential
- **FR-051** Sistem MUST mendukung API Key per Project, dengan expiration & revocation.
- **FR-052** Sistem MUST mendukung PAT pada level User, dapat dipakai lintas Project sesuai membership.
- **FR-053** Sistem MUST menyimpan credential secret sebagai hash, tidak pernah plaintext.
- **FR-054** Sistem MUST menolak autentikasi dengan credential revoked/expired.

## B.14 API & Sinkronisasi
- **FR-055** API MUST membedakan CRUD biasa dari domain command (Card move serta archive/restore/delete) untuk operasi dengan business meaning.
- **FR-056** Generic update (PATCH) MUST NOT mengizinkan perubahan field yang dikendalikan domain.
- **FR-057** MVP MUST beroperasi tanpa realtime; client pakai pull/refresh.

---

# PART C — API Contract

## C.1 Prinsip Dasar

API MUST membedakan:
```text
CRUD-like              Domain commands
├── create              ├── move
├── update (terbatas)   ├── archive
└── read                ├── restore
                         └── delete
```
Operasi dengan **business meaning** MUST diekspresikan sebagai domain command eksplisit, bukan generic field update. Base path kanonik: `/api/v1`. Semua resource Project di bawah `project_id`. **Tidak ada** endpoint cross-project.

```text
POST /resource/:id/delete      ✓ direkomendasikan
DELETE /resource/:id           ✗ dihindari untuk entity dengan lifecycle kompleks
```

## C.2 Response Convention

Success: `{ "data": {} }`

Error:
```json
{ "error": { "code": "VERSION_CONFLICT", "message": "The card has been modified by another request." } }
```

Error codes kanonik minimum:
```text
PROJECT_ACCESS_DENIED · PERMISSION_DENIED · RESOURCE_NOT_FOUND · RESOURCE_ARCHIVED
RESOURCE_DELETED · INVALID_STATE · INVALID_DESTINATION · VALIDATION_ERROR
VERSION_CONFLICT · TOKEN_EXPIRED · TOKEN_REVOKED · INVITATION_EXPIRED · INVITATION_ALREADY_USED
INTERNAL_ERROR
```
`VALIDATION_ERROR` (HTTP 400) MUST dipakai untuk payload/transport request yang tidak valid secara bentuk (field wajib hilang, tipe salah, body bukan JSON object) — kesalahan di sisi pengirim sebelum sistem sempat mengevaluasi state domain apa pun. `INVALID_STATE` (HTTP 409) tetap khusus untuk payload yang valid bentuknya tetapi tidak dapat diproses karena konflik state domain saat ini. `INTERNAL_ERROR` (HTTP 500) MUST dipakai KHUSUS untuk kegagalan tak terduga/infrastruktur (mis. config tidak lengkap, exception tak tertangani, dependency eksternal gagal) — MUST NOT dipakai untuk apa pun yang punya kode kanonik lain yang lebih spesifik yang applicable. Ketiga kode ini TIDAK boleh saling menggantikan — `INVALID_STATE` MUST NOT dipasangkan dengan HTTP 500 atau dipakai untuk kegagalan yang bukan konflik state domain; kasus semacam itu WAJIB `INTERNAL_ERROR`.

`VALIDATION_ERROR` MUST mengumpulkan SELURUH field yang gagal validasi dalam satu response (bukan fail-fast berhenti di field pertama), via `details` array: `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [{ "field": "title", "reason": "wajib string non-kosong" }] } }`. `details` opsional untuk kode error lain (tidak applicable di luar validasi bentuk payload).

### C.2.1 Konvensi Struktur Data (WAJIB, amandemen 3.0.0)

**Field JSON (request body DAN response body) MUST `camelCase`** — SATU konvensi konsisten di seluruh permukaan API, tanpa kecuali. Ini BERBEDA dari nama kolom database (`03-ENG` Part B, `snake_case` — konvensi SQL internal) — jangan tertukar: field JSON API != nama kolom database, walau implementasi MAY memetakan keduanya 1:1 tanpa transformasi eksplisit selama field JSON yang terekspos ke client tetap `camelCase`. Contoh: kolom `start_date` (database) diekspos sebagai field `startDate` (API); kolom `deleted_at` diekspos sebagai `deletedAt`.

Query parameter (`?status=...&entity_type=...`) MAY tetap `snake_case`/lowercase — konvensi URL berbeda dari konvensi JSON body, TIDAK terpengaruh aturan ini.

**Field lifecycle universal** — setiap entity dengan lifecycle (Project, Milestone, Board, List, Card, Milestone Label, Board Label) response-nya MUST menyertakan minimal: `id` (string, ULID), `createdAt` (string, ISO 8601), `updatedAt` (string, ISO 8601), `archivedAt` (string ISO 8601 atau `null`), `deletedAt` (string ISO 8601 atau `null`), `version` (integer). Field domain-spesifik (title, description, dst) ditambahkan di atas field universal ini, tidak menggantikannya.

**Mutation command yang butuh `expected_version`** (`PATCH`, archive/restore/delete/move) MUST menerima field `expectedVersion` (integer) — bukan `expected_version`.

## C.3 Idempotency

Untuk mutation yang berpotensi diulang akibat network retry, gunakan `Idempotency-Key: <client-generated-key>`, terutama untuk `POST` yang membuat resource atau menjalankan domain command berisiko (create, move, archive, delete).

## C.4 Project
```http
GET    /api/v1/projects
POST   /api/v1/projects
GET    /api/v1/projects/:project_id
PATCH  /api/v1/projects/:project_id
POST   /api/v1/projects/:project_id/archive
POST   /api/v1/projects/:project_id/restore
POST   /api/v1/projects/:project_id/delete
```
`GET /projects` mengembalikan seluruh Project yang masih tercatat dapat diakses User; setelah prune Project tidak lagi tersedia. Query param opsional `status` (comma-separated, subset dari `ACTIVE,ARCHIVED,DELETED`) MAY membatasi hasil; tanpa param ini, response MUST mencakup seluruh status (ACTIVE, ARCHIVED, DELETED). `POST /projects` membuat registry, Owner Membership, Project DB, `project_state`, dan Activity `project.created` melalui provisioning F.2.
`GET`/`PATCH` Project membaca/memutasi state domain pada `project_state` di Project DB; Global DB hanya dipakai untuk registry, owner, membership, dan resolusi database.
Archive/restore/delete membawa version:
```json
{ "expectedVersion": 4 }
```
Restore hanya valid dari ARCHIVED; DELETED selalu menolak.

## C.5 Milestone
```http
GET    /api/v1/projects/:project_id/milestones
POST   /api/v1/projects/:project_id/milestones
GET    /api/v1/projects/:project_id/milestones/:milestone_id
PATCH  /api/v1/projects/:project_id/milestones/:milestone_id
POST   /api/v1/projects/:project_id/milestones/:milestone_id/archive
POST   /api/v1/projects/:project_id/milestones/:milestone_id/restore
POST   /api/v1/projects/:project_id/milestones/:milestone_id/delete
```
Create:
```json
{ "title": "MVP", "description": "...", "progress": 0, "startDate": "2026-08-17", "dueDate": "2026-09-30" }
```
Update (`PATCH`) dan seluruh domain command wajib membawa `expectedVersion`. Archive/delete Milestone hanya mengubah Milestone; Board/List/Card descendant mempertahankan local state.

`GET /milestones` (list, tanpa Owner-only restriction — pola sama GET Milestone tunggal) mengembalikan seluruh Milestone Project (termasuk ARCHIVED/DELETED, tanpa filter server-side — client filter dari `archivedAt`/`deletedAt` seperti pola `GET /invitations`).

## C.6 Board
```http
GET    /api/v1/projects/:project_id/milestones/:milestone_id/boards
POST   /api/v1/projects/:project_id/milestones/:milestone_id/boards
GET    /api/v1/projects/:project_id/boards/:board_id
PATCH  /api/v1/projects/:project_id/boards/:board_id
POST   /api/v1/projects/:project_id/boards/:board_id/archive
POST   /api/v1/projects/:project_id/boards/:board_id/restore
POST   /api/v1/projects/:project_id/boards/:board_id/delete
```
Archive/delete Board hanya mengubah Board; List/Card descendant mempertahankan local state. Board tidak memiliki operasi move.

`GET /boards` (list under Milestone, pola sama GET Milestone list) mengembalikan seluruh Board Milestone tsb (termasuk ARCHIVED/DELETED).

## C.7 List
```http
GET    /api/v1/projects/:project_id/boards/:board_id/lists
POST   /api/v1/projects/:project_id/boards/:board_id/lists
GET    /api/v1/projects/:project_id/lists/:list_id
PATCH  /api/v1/projects/:project_id/lists/:list_id
POST   /api/v1/projects/:project_id/lists/:list_id/archive
POST   /api/v1/projects/:project_id/lists/:list_id/restore
POST   /api/v1/projects/:project_id/lists/:list_id/delete
```
List tidak memiliki operasi move. Archive/delete List hanya mengubah List; Card descendant mempertahankan local state dan `list_id`.

`GET /lists` (list under Board, pola sama GET Milestone/Board list) mengembalikan seluruh List Board tsb (termasuk ARCHIVED/DELETED).

## C.8 Card
```http
GET    /api/v1/projects/:project_id/lists/:list_id/cards
POST   /api/v1/projects/:project_id/lists/:list_id/cards
GET    /api/v1/projects/:project_id/cards/:card_id
PATCH  /api/v1/projects/:project_id/cards/:card_id
POST   /api/v1/projects/:project_id/cards/:card_id/move
POST   /api/v1/projects/:project_id/cards/:card_id/archive
POST   /api/v1/projects/:project_id/cards/:card_id/restore
POST   /api/v1/projects/:project_id/cards/:card_id/delete
```
`PATCH` boleh mengubah: `title`, `subtitle`, `description`, `dueDate`, `assignee`. **Tidak boleh** mengubah `listId`.

`GET`/response Card MUST menyertakan field `labels` (array `{id, name, scope: "milestone"|"board"}`), diturunkan dari asosiasi aktif (`removed_at IS NULL`) di `card_milestone_labels`/`card_board_labels` (C.11) — tanpa ini, hasil assign/remove Label (C.11) tidak dapat dibaca kembali oleh client.

`GET /cards` (list under List) mengembalikan seluruh Card List tsb (termasuk ARCHIVED/DELETED, field `labels` sama seperti GET tunggal). Card visibility scope (`ALL`/`CREATED_BY_ME`/`ASSIGNED_TO_ME`, A.11/D.3) MUST diterapkan pada endpoint ini DAN pada `GET /cards/:card_id` — keduanya adalah `card.read`. Sampai permission resolution engine (Phase 4) berjalan, kedua endpoint MAY mengembalikan Card apa adanya untuk member aktif tanpa filter visibility (pola interim yang sama seperti Phase 2, lihat Prinsip Phase 2 #5) — filter visibility WAJIB ditegakkan begitu Phase 4 closed, bukan opsional selamanya.

Move: `{ "destinationListId": "list_456", "expectedVersion": 12 }`

Server MUST memvalidasi: source Card, source List, destination List, kesamaan Project, destination ACTIVE, otorisasi, version, dan business invariant (`source_board.milestone_id == target_board.milestone_id`) sebelum eksekusi.

Restore Card hanya valid dari ARCHIVED dan jika seluruh ancestor ACTIVE. Card DELETED tidak dapat di-restore.

## C.9 Activity
```http
GET /api/v1/projects/:project_id/activities?entity_type=card&entity_id=c1&actor=&action=&from=&to=
GET /api/v1/projects/:project_id/cards/:card_id/activities
GET /api/v1/projects/:project_id/milestones/:milestone_id/activities
GET /api/v1/projects/:project_id/boards/:board_id/activities
GET /api/v1/projects/:project_id/lists/:list_id/activities
```
Activity tidak memiliki `PUT`/`PATCH`/`DELETE` dalam bentuk apa pun.

## C.10 Comment
```http
POST   /api/v1/projects/:project_id/cards/:card_id/comments
PATCH  /api/v1/projects/:project_id/cards/:card_id/comments/:activity_id
```
Add: `{ "body": "Sudah saya cek." }` → Activity `comment.added`. Edit **tidak mengubah** Activity lama — menghasilkan Activity baru `comment.edited`. Tidak ada `DELETE`.

## C.11 Label
```http
GET    /api/v1/projects/:project_id/milestones/:milestone_id/labels
POST   /api/v1/projects/:project_id/milestones/:milestone_id/labels
PATCH  /api/v1/projects/:project_id/milestones/:milestone_id/labels/:label_id
POST   /api/v1/projects/:project_id/milestones/:milestone_id/labels/:label_id/archive
POST   /api/v1/projects/:project_id/milestones/:milestone_id/labels/:label_id/restore
POST   /api/v1/projects/:project_id/milestones/:milestone_id/labels/:label_id/delete
GET    /api/v1/projects/:project_id/boards/:board_id/labels
POST   /api/v1/projects/:project_id/boards/:board_id/labels
PATCH  /api/v1/projects/:project_id/boards/:board_id/labels/:label_id
POST   /api/v1/projects/:project_id/boards/:board_id/labels/:label_id/archive
POST   /api/v1/projects/:project_id/boards/:board_id/labels/:label_id/restore
POST   /api/v1/projects/:project_id/boards/:board_id/labels/:label_id/delete
POST   /api/v1/projects/:project_id/cards/:card_id/labels              # Assign ke Card
POST   /api/v1/projects/:project_id/cards/:card_id/labels/:label_id/remove
```
Milestone Label dan Board Label MUST memiliki lifecycle penuh (archive/restore/delete, `archived_at`/`deleted_at`/`version` — schema 03-ENG B.3) mengikuti pola domain-command yang sama seperti Milestone/Board/List (bukan generic PATCH untuk business transition, C.15). `GET .../labels` mengembalikan Label aktif (exclude soft-deleted kecuali diminta eksplisit, pola sama C.12 Permission Group). Label yang ARCHIVED/DELETED MUST NOT dapat di-assign ke Card baru (konsisten FR-034 — label non-aktif tidak boleh dipakai sebagai asosiasi baru).

Assign ke Card: `{ "labelId": "label_123" }`. Server menentukan scope Label & memvalidasi keabsahannya terhadap posisi Card saat ini. `POST .../labels/:label_id/remove` men-set `removed_at` pada baris junction (`card_milestone_labels`/`card_board_labels`) — melengkapi FR-033 (riwayat asosiasi dipertahankan, bukan hapus fisik) dengan jalur pelepasan manual eksplisit, di luar orphaning otomatis saat Card pindah Board. Otorisasi assign/remove Label ke Card MENUMPANG `card.update` (bukan permission Label tersendiri — berbeda dari `card.comment`, karena label bukan konten dengan aturan integritas append-only khusus seperti Comment, murni atribut Card biasa).

## C.12 Permission & Membership
```http
GET    /api/v1/projects/:project_id/members
POST   /api/v1/projects/:project_id/members/:membership_id/revoke
GET    /api/v1/projects/:project_id/permission-groups
POST   /api/v1/projects/:project_id/permission-groups
PATCH  /api/v1/projects/:project_id/permission-groups/:group_id
POST   /api/v1/projects/:project_id/permission-groups/:group_id/delete
GET    /api/v1/projects/:project_id/members/:membership_id/assignments
POST   /api/v1/projects/:project_id/members/:membership_id/group-assignments
POST   /api/v1/projects/:project_id/members/:membership_id/group-assignments/:assignment_id/revoke
POST   /api/v1/projects/:project_id/members/:membership_id/permission-assignments
POST   /api/v1/projects/:project_id/members/:membership_id/permission-assignments/:assignment_id/revoke
```
`GET /members` mengembalikan seluruh Membership Project — dipakai antara lain untuk menemukan `membership_id` sebelum membuat scoped assignment. Query param opsional `status` (comma-separated, subset dari `active,revoked`) MAY membatasi hasil; tanpa param ini, response MUST mencakup keduanya (aktif dan revoked). `POST /members/:membership_id/revoke` mencabut otorisasi berjalan (`project_memberships.revoked_at`) tanpa menghapus data historis (BR-053) — `creator_user_id`/`activity.actor_user_id` yang merujuk User tersebut tetap utuh; tidak menghapus/revoke `membership_group_assignments`/`membership_permission_assignments` secara individual (assignment tetap ada sebagai riwayat, tetapi non-applicable begitu Membership induk revoked).

`POST /permission-groups/:group_id/delete` adalah soft-delete (`permission_groups.deleted_at`, BR-041): Membership yang punya assignment ke Group tersebut kehilangan permission yang di-grant Group itu, tanpa menghapus riwayat `membership_group_assignments`.

Scoped Group assignment:
```json
{ "groupId": "group_123", "scopeType": "milestone", "scopeId": "milestone_app_x" }
```
Scoped direct Permission assignment:
```json
{ "permissionId": "perm_card_read", "scopeType": "milestone", "scopeId": "milestone_app_x", "cardReadVisibility": "ALL" }
```
`cardReadVisibility` hanya berlaku untuk `card.read`; jika tidak diberikan default `CREATED_BY_ME`. Assignment bersifat additive dan revoke mempertahankan riwayat.

`GET .../members/:membership_id/assignments` mengembalikan seluruh scoped Group assignment DAN scoped direct Permission assignment milik Membership tsb (aktif dan revoked, tanpa filter server-side — pola sama `GET /invitations`), sebagai satu response `{ groupAssignments: [...], permissionAssignments: [...] }`. Tanpa endpoint ini tidak ada cara membaca kembali apa yang sudah di-grant ke sebuah Membership — `GET /members` sendiri hanya mengembalikan metadata Membership (`membershipId`, `userId`, `email`, `name`, `createdAt`, `revokedAt`), bukan assignment-nya.

## C.13 Invitation
```http
GET  /api/v1/projects/:project_id/invitations
POST /api/v1/projects/:project_id/invitations
POST /api/v1/invitations/:invitation_id/accept
POST /api/v1/projects/:project_id/invitations/:invitation_id/revoke
```
Create:
```json
{ "email": "eko@example.com", "assignments": [
  { "groupId": "contributor", "scopeType": "milestone", "scopeId": "milestone_app_x" }
] }
```
Setelah accept: `Invitation → Membership → scoped Permission Group assignments` otomatis, tanpa assignment kedua kali. Accept MUST menegakkan BR-054A (email match) dan BR-054B (reactivate Membership ter-revoke, bukan row baru).

`GET /invitations` mengembalikan seluruh Invitation Project (termasuk yang sudah accepted/revoked/expired) untuk keperluan manajemen Owner — tidak ada endpoint terpisah untuk "pending only", client MAY filter dari `accepted_at`/`revoked_at`/`expires_at` pada response. `POST /invitations/:invitation_id/revoke` (nested di bawah `:project_id`, simetris dengan create/list — hanya `accept` yang flat karena dipanggil invitee tanpa konteks project) men-set `invitations.revoked_at`; invitation yang sudah accepted MUST NOT dapat di-revoke (`INVALID_STATE`).

## C.14 API Key & PAT
```http
GET  /api/v1/projects/:project_id/api-keys
POST /api/v1/projects/:project_id/api-keys
POST /api/v1/projects/:project_id/api-keys/:key_id/revoke
GET  /api/v1/me/personal-access-tokens
POST /api/v1/me/personal-access-tokens
POST /api/v1/me/personal-access-tokens/:token_id/revoke
```
Response secret hanya diberikan sekali saat creation. Tidak ada update secret — hanya revoke + create baru.

`GET .../api-keys` dan `GET .../personal-access-tokens` mengembalikan metadata saja (`id`, `name`, `expiresAt`, `revokedAt`, `createdAt`, `lastUsedAt`) — **MUST NOT** pernah menyertakan `key_hash`/`token_hash` (C.2 Credential Types, secret hanya tampil sekali saat create). Tanpa endpoint ini, User yang lupa detail key yang pernah dibuat tidak punya cara menemukannya untuk di-revoke.

## C.15 Generic PATCH — Batasan Wajib

Generic `PATCH` MUST NOT menerima field yang merepresentasikan business transition atau field yang dikendalikan domain: `id`, `projectId`, `creatorUserId`, `createdAt`, `version`, `archivedAt`, `deletedAt`, `listId` (atau relasi hierarki lain). Field ini hanya berubah lewat domain command yang menjalankan validasi permission, state, & business invariant.

## C.16 Rekap Prinsip API

> Tidak boleh ada API endpoint yang memungkinkan client secara langsung mengubah field yang merepresentasikan business transition.

Ini aturan paling penting dari kontrak API dan acuan utama saat AI coding agent membuat HTTP handler Hono baru.

---

# PART D — Permission Reference (Authorization Matrix)

## D.1 Permission Naming
Format kanonik: `<resource>.<action>`.
```text
project.read · project.update
milestone.read · milestone.create · milestone.update · milestone.archive · milestone.delete · milestone.restore
board.read · board.create · board.update · board.archive · board.delete · board.restore
list.read · list.create · list.update · list.archive · list.delete · list.restore
card.read · card.create · card.update · card.move · card.archive · card.delete · card.restore · card.comment · card.comment.update
milestone_label.read · milestone_label.create · milestone_label.update · milestone_label.archive · milestone_label.delete · milestone_label.restore
board_label.read · board_label.create · board_label.update · board_label.archive · board_label.delete · board_label.restore
member.read · member.invite · member.update · member.remove
permission_group.read · permission_group.create · permission_group.update · permission_group.delete
api_key.read · api_key.create · api_key.revoke
```

## D.2 Baseline Group Matrix (Konfigurable, Bukan Hard-coded)

Project-level:
| Operation | Owner | Co-Owner | Manager | Contributor | Viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| View Project | ✓ | ✓ | ✓ | ✓ | ✓ |
| Update Project | ✓ | ✓ | — | — | — |
| Manage Members | ✓ | ✓ | — | — | — |
| Manage Permission Groups | ✓ | ✓ | — | — | — |
| Manage API Keys | ✓ | ✓ | — | — | — |

Milestone / Board / List (pola sama):
| Operation | Owner | Co-Owner | Manager | Contributor | Viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| Read | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create/Update/Archive/Delete/Restore | ✓ | ✓ | ✓ | — | — |

Milestone Label / Board Label (pola sama dengan Milestone/Board/List — definisi Label dikelola Manager+, bukan Contributor; assign/remove Label ke Card sendiri menumpang `card.update`, sudah tercakup baris Card di bawah):
| Operation | Owner | Co-Owner | Manager | Contributor | Viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| Read | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create/Update/Archive/Delete/Restore | ✓ | ✓ | ✓ | — | — |

Card:
| Operation | Owner | Co-Owner | Manager | Contributor | Viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| Read | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create/Update/Move/Archive/Delete/Comment | ✓ | ✓ | ✓ | ✓ | — |

Catatan: matrix ini adalah konfigurasi **default** baseline group. Nilai sebenarnya disimpan sebagai data (Permission Group → Permissions), bukan hard-coded `if role == ...`.

## D.3 Card Read Scope (dua dimensi terpisah)

Model otorisasi Card memisahkan dua hal:
```text
WHERE permission applies   (Membership + Group/direct Permission + hierarchy scope)
        +
WHICH cards are visible    (scope: ALL / CREATED_BY_ME / ASSIGNED_TO_ME)
```
Keduanya disimpan & dievaluasi terpisah. Contoh: `Eko + Contributor Group assigned at Milestone X` menentukan *di mana* permission berlaku; `card.read.visibility = ASSIGNED_TO_ME` menentukan Card yang dibuat Eko atau di-assign kepada Eko. Default visibility adalah `CREATED_BY_ME`.

## D.4 Aturan Resolusi (ringkas)
```text
resolve_permission(user, project, entity, action):
  1. Verify membership
  2. Resolve Project DB
  3. Load entity & current hierarchy (Project → Milestone → Board → List → Card)
  4. Load applicable scoped Group + direct Permission assignments
  5. Collect permissions (union, additive)
  6. Resolve card visibility if applicable (MAX: CREATED_BY_ME < ASSIGNED_TO_ME < ALL)
  7. Apply local + ancestor lifecycle restrictions (lifecycle wins)
  8. Return allow/deny
```
Owner: bypass Group/direct restriction (dalam Project sendiri), tetap tunduk business invariant + lifecycle + concurrency. Co-Owner: tidak bypass. Comment: `can_comment = can_read_card AND has(card.comment) AND card.is_effectively_active`. Edit comment: `can_comment_update = has(card.comment.update) AND activity.actor_user_id == current_user_id AND card.is_effectively_active` — kepemilikan komentar (BR-034A) adalah business invariant, berlaku untuk seluruh actor termasuk Owner (bukan grant Group/direct yang di-bypass Owner).

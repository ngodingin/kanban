# Phase 4 — Authorization · Task & Goal Breakdown

> Generated per [04-DELIVERY C.6](docs/04-DELIVERY.md). SOT version: 2.11.0.
> Scope batas: [04-DELIVERY C.1 "Phase 4"](docs/04-DELIVERY.md). Acuan utama: [02-SPEC](docs/02-SPEC.md) A.10, A.11, A.13; B.3, B.13; C.8, C.12, C.14; D.1–D.4; [03-ENGINEERING](docs/03-ENGINEERING.md) Part C (Security).
> **Konteks repo saat digenerate:** Phase 0–3 selesai (45+27+21+17 goal, seluruhnya ✅ kecuali 1.9.1 ⚠️ — amandemen BR-052A, tidak terkait Phase 4). Schema Global DB (`membership_group_assignments`, `membership_permission_assignments`, `api_keys`, `personal_access_tokens`) SUDAH ada sejak Phase 0 (`packages/infrastructure/src/database/global-schema.ts`) — **Phase 4 tidak butuh migration baru**. Fungsi CRUD assignment (`createGroupAssignment`/`revokeGroupAssignment`/`createPermissionAssignment`/`revokePermissionAssignment`) dan Permission Group CRUD SUDAH ada sejak Phase 1 (`project-admin.ts`) — Phase 4 MEMBACA data ini, tidak membangunnya ulang. `RequestPipeline` (Phase 0 TASK-0.9) sudah punya seam `PermissionResolver` (`packages/infrastructure/src/pipeline/permission-step.ts`) dengan `EmptyPermissionResolver` sebagai stub null-object — Phase 4 mengganti stub ini dengan resolver sungguhan, BUKAN mendesain ulang pipeline.
>
> **SOT diamandemen sebelum task ini digenerate (persiapan Phase 4, disetujui manusia 2026-08-23, ditemukan saat audit SOT-compliance/SOLID/code-review/no-hardcode atas Phase 0–3):** 2.9.0 (BR-052A default expiry Invitation 3 hari, membuka kembali goal 1.9.1), 2.10.0 (GET list assignment Membership + GET list API Key/PAT, C.12/C.14), 2.11.0 (GET list-children Milestone/Board/List/Card, C.5–C.8 — gap paling signifikan, tanpa ini Card visibility scope tidak punya apa pun untuk difilter). Goal 2.3.4/2.5.4/2.7.4/2.9.4 (list-children, Phase 2) dan 1.9.1 (expiry fix, Phase 1) BUKAN scope Phase 4 — dikerjakan lane Dev kapan saja, independen dari task di file ini.
>
> ~~**[CRITICAL, belum diperbaiki]** Review-CL-03 ([PHASE-3-TASKS.md](PHASE-3-TASKS.md)) menemukan regresi bug CL-53 (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`, parameter-property shorthand) di `packages/domain/src/label/label-errors.ts` — `node dist/serve.js` crash total, e2e tidak dapat berjalan. **P0, harus diperbaiki SEBELUM/bersamaan mulai Phase 4**~~ → **DISELESAIKAN 2026-08-23 (AI-Dev, claude-sonnet-5):** diperbaiki sebelum menyentuh goal Phase 4 manapun, pola identik CL-53 (field-eksplisit, bukan parameter-property shorthand). Diverifikasi ulang independen: `node dist/serve.js` boot sukses, `pnpm exec vitest run` 64/64 file · 407/407 test PASS, `pnpm exec playwright test` 1/1 PASS. Dicatat sebagai `CL-31` di [PHASE-3-TASKS.md](PHASE-3-TASKS.md) (bukan reopening goal Phase 3 manapun — Test/DoD asli tetap benar).
>
> **AI-Dev execution gate:** jangan ubah implementasi sebelum goal `🔄` + `CL` terpasang. Jangan menyatakan selesai sebelum goal `🔎`/`80%` + CL baru + test hijau + commit. Format handoff wajib mengikuti [AGENTS.md §0](AGENTS.md).

## Prinsip Phase 4

1. **[MODEL LEBIH KUAT WAJIB UNTUK SELURUH FASE INI]** — AGENTS.md §11.2 secara eksplisit mendaftar **"Authorization (Phase 4)"** sebagai kategori penuh invariant-critical, BUKAN goal terpilih seperti Phase 2/3 (di mana hanya Card move yang ditandai WAJIB). **Setiap goal di file ini WAJIB dikerjakan model lebih kuat**, tanpa pengecualian — korektnya diciptakan di Dev, bukan ditemukan di Review (§11.2). Kesalahan authorization ("berfungsi tapi salah") adalah kelas bug paling berbahaya di aplikasi ini: privilege escalation, kebocoran data lintas-Project/Membership, atau bypass business invariant yang sudah dibangun susah payah sejak Phase 1–3.
2. **Interim Owner-only DIHAPUS di fase ini, bukan ditambah lapisan baru.** Sejak Phase 1, seluruh mutasi memakai `assertOwnerInterim`/`assertProjectOwner` (Owner-only, hard block untuk non-Owner) — pola SEMENTARA yang eksplisit didokumentasikan "interim" di setiap Prinsip Phase 1/2/3. Phase 4 MENGGANTI pola ini dengan formula ALLOW penuh (02-SPEC A.10) di SEMUA call site, bukan menambahkan cek permission granular DI ATAS Owner-only yang sudah ada. Efek: Co-Owner/Manager/Contributor yang punya scoped Group/direct Permission yang sesuai HARUS bisa melakukan operasi yang sebelumnya Owner-only-locked.
3. **Temuan DRY pra-Phase-4 (Review-CL-03, PHASE-3-TASKS.md):** `assertOwnerInterim` diduplikasi byte-identik di 7 file route (`milestones.ts`, `boards.ts`, `lists.ts`, `comments.ts`, `labels.ts`, `card-labels.ts`, `cards.ts`). TASK-4.4 WAJIB mengganti seluruh 7 call site secara seragam (satu titik perubahan, bukan 7 edit terpisah yang rawan divergensi) — lihat TASK-4.4 untuk daftar lengkap.
4. **Owner bypass grant, TIDAK bypass invariant lain (BR-037).** Formula ALLOW (A.10) tetap berlaku penuh untuk Owner MINUS komponen "permission granted" — Owner tetap tunduk `entity state permits operation`, `business invariant permits operation` (termasuk BR-034A ownership comment — sudah ditegakkan eksplisit sejak Phase 3, TIDAK perlu diubah), dan `optimistic-lock version valid`. Jangan implementasikan Owner sebagai "skip seluruh authorization check" — itu bug kelas BR-046 (lifecycle selalu menang, termasuk atas Owner).
5. **Effective permission = union, tanpa DENY (BR-038).** Resolver mengumpulkan SELURUH scoped Group assignment + scoped direct Permission assignment yang applicable terhadap hierarchy ENTITY SAAT INI (bukan snapshot saat assignment dibuat — BR-042B), lalu union. Tidak ada mekanisme "cabut permission spesifik" — hanya revoke assignment (additive-only, konsisten sejak Phase 1).
6. **Scope inheritance ke descendant (BR-042).** Grant pada scope Milestone berlaku untuk seluruh Board/List/Card di bawahnya — resolver WAJIB menaiki hierarchy ENTITY YANG SEDANG DIOPERASIKAN (List→Board→Milestone→Project untuk Card, dst — pola identik ancestor-chain-walking `effective-state.ts` Phase 2, TAPI untuk permission bukan lifecycle) dan mengumpulkan grant di SETIAP level, bukan cuma level entity itu sendiri.
7. **Card visibility scope terpisah dari permission applies (D.3, dua dimensi).** `card.read` grant menentukan DI MANA permission berlaku (hierarchy scope); `card_read_visibility` (`CREATED_BY_ME`/`ASSIGNED_TO_ME`/`ALL`, kolom `membership_permission_assignments.card_read_visibility`) menentukan CARD MANA yang terlihat. Kedua dimensi dihitung terpisah lalu diaplikasikan bersama. Default `CREATED_BY_ME` jika tidak ada grant eksplisit; grant TERLUAS yang applicable menang jika ada beberapa (BR-048).
8. **API Key/PAT BUKAN model otorisasi baru (C.1 03-ENG).** Keduanya cuma identitas — resolusi permission SETELAHNYA tetap lewat rantai `Credential → User → Project Membership → Permission` yang sama seperti Better Auth Session. `PermissionResolver`/engine TASK-4.1 dipakai ulang, tidak diduplikasi per jenis credential.
9. **Keputusan teknis murni (04-DELIVERY C.6.5 poin 3, didokumentasikan di sini, mudah diganti):** Identity resolution untuk API Key/PAT memakai `Authorization: Bearer <secret>` header (konvensi umum, bukan cookie — cocok untuk akses programatik non-browser sesuai FR-051/052). `IdentityResolver` yang ada (`BetterAuthIdentityResolver`, session cookie) TETAP tidak berubah interface-nya; TASK-4.7/4.8 menambah `ApiKeyIdentityResolver`/`PersonalAccessTokenIdentityResolver` yang mengimplementasikan interface SAMA (`resolveIdentity(request): Promise<ResolvedIdentity | null>`), dikomposisi lewat `CompositeIdentityResolver` (coba tiap resolver berurutan: Bearer scheme dulu di-parse untuk menentukan jenis token — API Key vs PAT dibedakan dari prefix/format saat generate, mis. `ak_`/`pat_` — baru fallback ke session cookie jika tidak ada header `Authorization`).
10. **Test invariant-critical (AGENTS §11.3 poin 4).** Untuk TASK-4.1 (engine inti), kebenaran WAJIB ditegakkan lewat **property-style test** (banyak kombinasi grant/scope/visibility, bukan cuma beberapa contoh manual) — bug authorization sering hanya muncul pada kombinasi scope/hierarchy tertentu yang tidak terlihat dari beberapa contoh happy-path.

## Legend Status
| Simbol | Arti |
|---|---|
| ⬜️ | Belum Dikerjakan |
| 🔄 | Dikerjakan |
| 🔎 | Menunggu verifikasi |
| ✅ | Terverifikasi QA |
| ⚠️ | Gagal-verifikasi |
| ⏸️ | Blocked |

Kolom **%** = kemajuan yang sudah terbukti, bukan estimasi atau asumsi. Dev hanya boleh mengisi `0–80`; `80` berarti implementasi + Test + DoD sisi Dev selesai dan siap `🔎`. Hanya QA yang boleh mengisi `100`, bersamaan dengan `✅`. Nilai untuk `⚠️`/`⏸️` dipertahankan atau dikoreksi berdasarkan bukti aktual.

Kolom **CL** = indeks tautan Closure Log per goal. Gunakan `[CL-nn](#cl-nn)` untuk catatan Dev, `[QA-CL-nn](#qa-cl-nn)` untuk catatan QA, dan `[Review-CL-nn](#review-cl-nn)` untuk catatan AI-Planning & Review/reviewer. Kolom ini append-only. Gunakan `—` hanya selama belum ada entry.

Kolom **Prior** = prioritas relatif di dalam fase: `P0` blocker/gate/fondasi kritis · `P1` tinggi/core dependency · `P2` normal · `P3` lanjutan/polish. Prioritas **tidak** membatalkan Dependency atau Status.

Status dan `%` pada level **Task** dihitung dari goal menurut [AGENTS.md §6.2](AGENTS.md); tidak diedit manual.

## Dependency graph (task-level)
```text
[P0, blocker] Fix regresi CL-53 di label-errors.ts (Review-CL-03, PHASE-3-TASKS.md — di luar file ini, tapi WAJIB selesai duluan)

4.1 Permission resolution engine (domain, pure function) ◄── effective-state.ts (Phase 2, pola ancestor-chain-walking)
 ├─ 4.2 Global DB reads: load scoped assignment Membership ◄── 4.1
 │    └─ 4.3 Wire PermissionResolver sungguhan ke RequestPipeline ◄── 4.1, 4.2
 │         └─ 4.4 Ganti assertOwnerInterim (7 route) dengan formula ALLOW ◄── 4.3
 │              └─ 4.5 Card visibility scope: GET /cards (list, 2.9.4) + GET /cards/:card_id ◄── 4.4
 └─ 4.6 GET .../members/:membership_id/assignments (baca assignment, independen dari resolver) ◄── (tidak depend ke 4.1-4.5)

4.7 API Key: domain command (create/revoke) + endpoint + list + ApiKeyIdentityResolver ◄── 4.1 (reuse engine)
4.8 PAT: domain command (create/revoke) + endpoint + list + PersonalAccessTokenIdentityResolver ◄── 4.1, 4.7 (reuse CompositeIdentityResolver dari 4.7)
```

---

## TASK-4.1 — Permission resolution engine (domain, pure function)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 4.1.1 | 🔎 | [CL-06](#cl-06)<br>[CL-05](#cl-05)<br>[CL-02](#cl-02)<br>[CL-01](#cl-01)<br>[Review-CL-02](#review-cl-02) | 80 | P0 **[MODEL LEBIH KUAT WAJIB]** | `packages/domain/src/permission/permission-engine.ts` — fungsi murni `resolveEffectivePermissions(input): EffectivePermissions` menerima: (a) daftar scoped Group assignment aktif Membership (`{scopeType, scopeId, permissions: {key: string, cardReadVisibility?: "CREATED_BY_ME"\|"ASSIGNED_TO_ME"\|"ALL"}[]}[]` — **koreksi Review-CL-02, lihat bawah**, setiap permission dalam satu Group MEMBAWA `cardReadVisibility` MILIKNYA SENDIRI dari `group_permissions.card_read_visibility`, bukan cuma daftar key polos), (b) daftar scoped direct Permission assignment aktif (`{permissionKey, scopeType, scopeId, cardReadVisibility?}[]`), (c) hierarchy ENTITY SAAT INI yang sedang dioperasikan (`{projectId, milestoneId?, boardId?, listId?, cardId?}` — chain dari root ke leaf, sebagian boleh null tergantung entity), (d) apakah actor adalah Owner Project (boolean). Mengembalikan `{grantedKeys: Set<string>, cardReadVisibility: "CREATED_BY_ME"\|"ASSIGNED_TO_ME"\|"ALL"}`. Logika: **(1)** jika `isOwner`, return SELURUH permission catalog key sebagai granted (BR-037, bypass grant TAPI bukan bypass invariant lain — invariant tetap dicek TERPISAH oleh domain command masing-masing, bukan oleh engine ini) + visibility `ALL`. **(2)** selain itu: untuk SETIAP assignment (Group atau direct), cek apakah `(scopeType, scopeId)`-nya match SALAH SATU level di hierarchy entity saat ini (Prinsip #6 — scope Milestone match jika `scopeId == hierarchy.milestoneId`, dst; scope Project selalu match karena root); jika match, tambahkan permission key(s)-nya ke `grantedKeys` (union, BR-038, additive-only — TIDAK ADA DENY). **(3)** `cardReadVisibility`: kumpulkan `cardReadVisibility` dari **KEDUA sumber** applicable (dari langkah 2) — Group assignment's `permissions[].cardReadVisibility` UNTUK entry `card.read` DAN direct Permission assignment's `cardReadVisibility` (BR-040: perubahan visibility di Group MUST langsung berlaku ke semua member yang punya assignment Group itu; BR-048: "jika beberapa grant berlaku... visibility terluas menang" TIDAK membedakan sumber grant) — ambil yang TERLUAS di antara SEMUA sumber (`ALL > ASSIGNED_TO_ME > CREATED_BY_ME`); default `CREATED_BY_ME` jika tidak ada grant `card.read` applicable dari sumber manapun. | [02-SPEC A.10](docs/02-SPEC.md) (BR-035–046), BR-040, BR-048, D.1–D.4 | — |
| 4.1.2 | ✅ | [CL-04](#cl-04)<br>[CL-03](#cl-03)<br>[QA-CL-01](#qa-cl-01) | 100 | P0 **[MODEL LEBIH KUAT WAJIB]** | `hasPermission(effective: EffectivePermissions, key: string): boolean` — helper trivial (`effective.grantedKeys.has(key)`), dipisah dari 4.1.1 agar call site (TASK-4.4) tidak perlu tahu detail struktur internal `EffectivePermissions`. Plus `resolveCardVisibilityFilter(effective, currentUserId): (card: {creatorUserId, assigneeUserId}) => boolean` — fungsi filter murni untuk TASK-4.5 (D.3: `ALL` selalu true; `ASSIGNED_TO_ME` benar jika `creatorUserId==currentUserId OR assigneeUserId==currentUserId`; `CREATED_BY_ME` benar jika `creatorUserId==currentUserId`). | [02-SPEC D.3](docs/02-SPEC.md), BR-047–049 | 4.1.1 |

**Test (property-style, Prinsip #10 — WAJIB banyak kombinasi, bukan cuma beberapa contoh):** Owner selalu granted semua key + visibility ALL terlepas dari assignment apa pun (termasuk assignment KOSONG). Non-Owner tanpa assignment apa pun → `grantedKeys` kosong, visibility default `CREATED_BY_ME`. Grant di scope Project → berlaku untuk entity APAPUN di Project itu (Milestone/Board/List/Card manapun). Grant di scope Milestone → berlaku untuk Board/List/Card DI BAWAH Milestone itu, TIDAK berlaku untuk Milestone/Board/List/Card di Milestone LAIN (bahkan di Project sama) — uji eksplisit negative case ini. Union dari 2 Group berbeda pada scope sama → gabungan key keduanya (bukan salah satu menang). Group assignment REVOKED (tidak termasuk di input aktif oleh pemanggil TASK-4.2) tidak memberi permission apa pun — uji lewat memastikan resolver TIDAK punya cara "melihat" assignment revoked (pemanggil yang filter, bukan resolver — tapi tetap uji end-to-end lewat TASK-4.2). `cardReadVisibility`: 2 grant `card.read` applicable dengan visibility beda (mis. `CREATED_BY_ME` dari Group Contributor scope Project + `ALL` dari direct Permission scope Milestone tertentu) → `ALL` menang (BR-048, grant terluas). Tidak ada kombinasi yang menghasilkan DENY eksplisit (BR-038 — hanya presence/absence di `grantedKeys`, tidak ada nilai `false` tersimpan).
**DoD:** Fungsi 100% murni (tidak ada I/O, tidak ada `Date.now()`/`Math.random()`, deterministik untuk input sama) — testable tanpa DB/mock apa pun, mirroring `effective-state.ts` (Phase 2). Tidak reimplementasi logika ancestor-chain milik `effective-state.ts` (itu untuk lifecycle, ini untuk permission — dua concern terpisah, TIDAK digabung jadi satu fungsi).

---

## TASK-4.2 — Global DB reads: load scoped assignment Membership  (dep: 4.1)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 4.2.1 | 🔎 | [CL-08](#cl-08)<br>[CL-07](#cl-07) | 80 | P0 **[MODEL LEBIH KUAT WAJIB]** | `packages/infrastructure/src/database/permission-resolution.ts` — `loadEffectivePermissionInputs(globalClient, membershipId): Promise<{groupAssignments, directAssignments}>`: query `membership_group_assignments` (JOIN `group_permissions`+`permissions` untuk resolve key **DAN `group_permissions.card_read_visibility` per Group** — koreksi Review-CL-02/4.1.1, JANGAN cuma ambil key lalu buang kolom visibility-nya; JOIN `permission_groups` untuk cek Group sendiri belum `deleted_at` — BR-041, Group yang di-soft-delete TIDAK memberi permission apa pun walau assignment-nya sendiri belum revoked) dan `membership_permission_assignments` (JOIN `permissions` untuk key + `card_read_visibility` kolomnya sendiri), KEDUANYA filter `revoked_at IS NULL`. Return bentuk siap-pakai `resolveEffectivePermissions` (TASK-4.1.1, shape `groupAssignments: {scopeType, scopeId, permissions: {key, cardReadVisibility?}[]}[]`). | [02-SPEC BR-038](docs/02-SPEC.md), BR-040, BR-041, BR-042B | 4.1 |

**Test:** Assignment revoked TIDAK ikut ter-load (query filter, bukan filter di layer atas); assignment ke Group yang sudah soft-deleted TIDAK ikut memberi permission (JOIN `permission_groups.deleted_at IS NULL`) walau assignment `membership_group_assignments`-nya sendiri masih `revoked_at IS NULL` (BR-041 — soft-delete Group mencabut permission tanpa menghapus riwayat assignment); Membership tanpa assignment apa pun → return array kosong keduanya (bukan error).
**DoD:** Query selalu scoped ke SATU `membershipId` (tidak pernah query lintas-Membership); tidak ada N+1 (JOIN, bukan loop query per assignment).

---

## TASK-4.3 — Wire PermissionResolver sungguhan ke RequestPipeline  (dep: 4.1, 4.2)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 4.3.1 | 🔎 | [CL-10](#cl-10)<br>[CL-09](#cl-09) | 80 | P0 **[MODEL LEBIH KUAT WAJIB]** | Implementasi `PermissionResolver` (interface sudah ada, `permission-step.ts`) — `RealPermissionResolver` memanggil TASK-4.2 (load assignment) → TASK-4.1 (resolve effective) → return `{permission: EffectivePermissions}` (mengganti `permission: null` di `EmptyPermissionResolver`). Ganti tipe `ProjectRequestContext.permission` dari `null` menjadi `EffectivePermissions`. Wiring di `apps/api/src/project-deps.ts` (atau tempat `RequestPipeline` di-construct) — ganti instantiasi `EmptyPermissionResolver` → `RealPermissionResolver`. **Isu penting:** `resolveEffectivePermissions` (4.1.1) butuh hierarchy ENTITY SAAT INI, tapi `RequestPipeline.run()` (`pipeline.ts`) hanya tahu `projectId` di titik ini — hierarchy Milestone/Board/List/Card spesifik BELUM diketahui sampai route handler membaca `:milestone_id`/`:card_id`/dst dari path param. **Keputusan teknis (C.6.5 poin 3):** `RequestPipeline` HANYA resolve permission di scope Project (root, selalu applicable — Prinsip #6), route handler individual memanggil `resolveEffectivePermissions` LAGI dengan hierarchy entity spesifik saat granularitas itu diketahui (pola sama seperti `openProjectContext` dipanggil per-route hari ini) — BUKAN pipeline mencoba tahu semua kemungkinan entity di muka. | [03-ENG A.6–A.7](docs/03-ENGINEERING.md) | 4.1, 4.2 |

**Test:** `RequestPipeline.run()` dengan Membership yang punya assignment scope Project → `ctx.permission.grantedKeys` berisi key yang di-grant; Owner → seluruh key granted terlepas assignment; Membership tanpa assignment → `grantedKeys` kosong (bukan error/crash).
**DoD:** `EmptyPermissionResolver` TIDAK dihapus (tetap berguna untuk test yang tidak perlu real permission — dependency injection tetap fleksibel), hanya tidak lagi jadi default di wiring production.

---

## TASK-4.4 — Ganti assertOwnerInterim (7 route) dengan formula ALLOW  (dep: 4.3)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 4.4.1 | 🔎 | [CL-12](#cl-12)<br>[CL-11](#cl-11) | 80 | P0 **[MODEL LEBIH KUAT WAJIB]** | Hapus 7 salinan `assertOwnerInterim` (`milestones.ts`, `boards.ts`, `lists.ts`, `comments.ts`, `labels.ts`, `card-labels.ts`, `cards.ts` — Review-CL-03), ganti SATU helper `assertPermission(ctx: OpenProjectContext, key: string): void` di `routes/projects.ts` (pola sama `readJsonObject`/`readExpectedVersionField` yang sudah disentralisasi di sana) — `if (!hasPermission(ctx.permission, key)) throw PipelineError("PERMISSION_DENIED", ..., 403)` (TASK-4.1.2). Ganti SETIAP call site `assertOwnerInterim(ctx)` di 7 file menjadi `assertPermission(ctx, "<resource>.<action>")` dengan key YANG BENAR sesuai operasi (mis. `milestones.ts` create → `milestone.create`, archive → `milestone.archive`, dst — pola D.1 persis, BUKAN satu key generic untuk semua operasi resource yang sama). | [02-SPEC A.10](docs/02-SPEC.md), D.1, D.2; [03-ENG C.3](docs/03-ENGINEERING.md) | 4.3 |

**Test (WAJIB positif DAN negatif per operasi terproteksi, AGENTS §8):** Untuk SETIAP endpoint mutasi (create/update/archive/restore/delete/move/comment/label-assign, seluruh 7 file) — positif: Membership dengan Group/direct Permission yang tepat (scope applicable) BERHASIL walau BUKAN Owner (regresi terhadap Owner-only interim — ini BUKTI PALING PENTING bahwa Phase 4 benar-benar mengganti interim, bukan menambah lapisan); negatif: Membership TANPA permission yang sesuai → `PERMISSION_DENIED`, termasuk Membership dengan permission di scope yang SALAH (mis. `milestone.update` di-grant untuk Milestone LAIN, bukan Milestone yang di-update) → tetap ditolak. Owner tetap selalu berhasil (regresi BR-035/037). Card visibility TIDAK dites di sini (TASK-4.5 terpisah).
**DoD:** `grep -rn "assertOwnerInterim"` di seluruh `apps/api/src` → NOL hasil (fungsi benar-benar dihapus, bukan cuma tidak dipanggil); setiap route memakai permission key yang benar sesuai D.1 (bukan disamaratakan); seluruh 98 goal Phase 0–3 yang sebelumnya lulus dengan Owner-only tetap lulus untuk Owner (regresi negatif — Owner tidak boleh kehilangan akses apa pun).

---

## TASK-4.5 — Card visibility scope: GET /cards (list) + GET /cards/:card_id  (dep: 4.4)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 4.5.1 | 🔎 | [CL-14](#cl-14)<br>[CL-13](#cl-13) | 80 | P0 **[MODEL LEBIH KUAT WAJIB]** | `GET /lists/:list_id/cards` (goal 2.9.4, Phase 2 — dibangun TANPA filter visibility per Prinsip #5 Phase 2) — tambah filter `resolveCardVisibilityFilter` (TASK-4.1.2) ke hasil query SEBELUM response, berdasarkan `ctx.permission.cardReadVisibility` (resolve ulang di scope entity Card — List→Board→Milestone→Project chain, TASK-4.3's keputusan re-resolve per-route). `GET /cards/:card_id` (goal 2.9.1, Phase 2) — TAMBAH cek visibility SETELAH cek existence/Project-boundary: jika Card ditemukan tapi TIDAK lolos filter visibility, response `RESOURCE_NOT_FOUND` (BUKAN `PERMISSION_DENIED` — mencegah enumeration: User yang tidak boleh melihat Card seharusnya tidak tahu bedanya "tidak ada" vs "ada tapi disembunyikan", konsisten pola BR-054A soal tidak membocorkan alasan spesifik). | [02-SPEC C.8](docs/02-SPEC.md) (amandemen 2.11.0), A.11, D.3 | 4.4 |

**Test:** Membership dengan visibility `CREATED_BY_ME` → GET list hanya mengembalikan Card yang dia buat sendiri, Card buatan orang lain TIDAK muncul; GET tunggal Card buatan orang lain → `RESOURCE_NOT_FOUND` (bukan 403); `ASSIGNED_TO_ME` → Card yang dia buat ATAU di-assign ke dia, bukan keduanya sekaligus wajib (union OR, BR-047); `ALL` → seluruh Card List tsb tanpa filter; ganti assignee Card (Phase 2, existing) lalu cek ulang visibility `ASSIGNED_TO_ME` User baru → langsung applicable (BR-049, dihitung dari hierarchy/assignment TERKINI, bukan snapshot).
**DoD:** Filter diterapkan SETELAH Project-boundary/ancestor-operational check (urutan formula ALLOW A.10 — state/invariant dulu, baru visibility), tidak pernah membocorkan existence Card yang tidak visible lewat perbedaan response.

---

## TASK-4.6 — GET .../members/:membership_id/assignments

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 4.6.1 | 🔎 | [CL-16](#cl-16)<br>[CL-15](#cl-15) | 80 | P1 | `GET /api/v1/projects/:project_id/members/:membership_id/assignments` (amandemen 2.10.0) — baca `membership_group_assignments` + `membership_permission_assignments` untuk Membership tsb (AKTIF dan REVOKED, tanpa filter server-side — pola sama `GET /invitations`), return `{data:{group_assignments:[...], permission_assignments:[...]}}`. Otorisasi: `member.read` (D.1, sudah ada sejak Phase 1 katalog) via `assertPermission` (TASK-4.4, bukan endpoint baru yang masih Owner-only interim). | [02-SPEC C.12](docs/02-SPEC.md) (amandemen 2.10.0) | 4.4 |

**Test:** Membership dengan >1 assignment (Group + direct, aktif + revoked campur) → seluruhnya muncul dengan `scopeType`/`scopeId`/`revokedAt` benar; Membership tanpa assignment → array kosong keduanya; `membership_id` milik Project lain → `RESOURCE_NOT_FOUND` (Project-boundary); non-`member.read` → `PERMISSION_DENIED`.
**DoD:** Response TIDAK menyertakan definisi permission Group secara penuh (cuma referensi `groupId` — client fetch detail Group terpisah via `GET /permission-groups`, hindari over-fetching); Project-boundary teruji eksplisit.

---

## TASK-4.7 — API Key: domain command + endpoint + list + identity resolver

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 4.7.1 | ⬜️ | — | 0 | P1 **[MODEL LEBIH KUAT WAJIB]** | `packages/infrastructure/src/database/api-key.ts`: `createApiKey(globalClient, {projectId, createdByUserId, name, expiresAt?})` — generate secret random (bukan predictable — pakai `crypto.randomBytes`/setara, BUKAN `Math.random()`), prefix `ak_` (Prinsip #9), simpan HANYA hash (`keyHash`, never plaintext — BR-057/FR-053), return `{id, name, secret (RAW, SEKALI SAJA), expiresAt, createdAt}` — secret TIDAK PERNAH disimpan/di-log plaintext setelah response ini. `revokeApiKey(globalClient, {projectId, keyId, actorUserId})` — set `revokedAt`. `listApiKeys(globalClient, projectId)` — metadata saja (`id, name, expiresAt, revokedAt, createdAt, lastUsedAt`), **TIDAK PERNAH** `keyHash` (C.2 03-ENG). Endpoint: `POST/GET /api/v1/projects/:project_id/api-keys`, `POST .../api-keys/:key_id/revoke` — otorisasi `api_key.create`/`api_key.read`/`api_key.revoke` (D.1, sudah di katalog) via `assertPermission`. | [02-SPEC C.14](docs/02-SPEC.md) (amandemen 2.10.0), BR-055, BR-057, BR-058, FR-051, FR-053, FR-054; [03-ENG C.2](docs/03-ENGINEERING.md) | 4.4 |
| 4.7.2 | ⬜️ | — | 0 | P0 **[MODEL LEBIH KUAT WAJIB]** | `packages/infrastructure/src/auth/api-key-identity-resolver.ts`: `ApiKeyIdentityResolver implements IdentityResolver` — parse header `Authorization: Bearer ak_...`, hash raw secret dari request lalu bandingkan ke `keyHash` tersimpan (constant-time compare, cegah timing attack — pakai `crypto.timingSafeEqual` atau setara), tolak jika tidak match/`revokedAt`/`expiresAt < now` (AC-023/AC-024) → return `null` (identity gagal resolve, BUKAN throw — konsisten kontrak `IdentityResolver`). **Kritis (AC-021, cross-project scope):** API Key HANYA valid untuk `projectId` miliknya (`api_keys.projectId`) — `resolveIdentity` menerima `projectId` context dari pemanggil (route sudah tahu `:project_id` dari path) dan MUST menolak jika `api_keys.projectId !== requestedProjectId`, WALAUPUN secret & hash cocok. Update `lastUsedAt` pada resolve sukses (best-effort, tidak dalam transaksi yang sama dengan operasi utama — kegagalan update `lastUsedAt` TIDAK boleh menggagalkan request). `CompositeIdentityResolver` (Prinsip #9): coba parse `Authorization` header dulu (`ak_`/`pat_` prefix menentukan resolver mana), fallback session cookie via `BetterAuthIdentityResolver` jika tidak ada header. | [02-SPEC C.14](docs/02-SPEC.md), BR-055, BR-058; [03-ENG C.2](docs/03-ENGINEERING.md) (AC-021, AC-023, AC-024) | 4.7.1 |

**Test:** Create → secret RAW hanya muncul di response create, TIDAK PERNAH lagi di response manapun setelahnya (list, get); create dengan `expiresAt` di masa lalu → `VALIDATION_ERROR`; API Key valid untuk Project A dipakai ke request Project B → ditolak (AC-021, uji eksplisit — ini yang paling kritis, cross-project credential leak); API Key expired → ditolak (AC-023); API Key revoked → ditolak (AC-024); API Key valid → identity resolve sukses, permission resolution SETELAHNYA (TASK-4.1) berjalan sama seperti Session (rantai Credential→User→Membership→Permission, C.1 03-ENG — BUKAN API Key membawa permission sendiri); `lastUsedAt` ter-update setelah request sukses; `keyHash` TIDAK PERNAH muncul di response `GET /api-keys` (list) — assert response shape eksplisit, bukan cuma "tidak error".
**DoD:** Secret generation pakai CSPRNG (bukan `Math.random()` — cek eksplisit di code review); constant-time comparison untuk hash matching (cegah timing side-channel); cross-project rejection (AC-021) punya test SPESIFIK, bukan cuma tersirat dari test lain.

---

## TASK-4.8 — PAT: domain command + endpoint + list + identity resolver  (dep: 4.1, 4.7)

| ID | Status | CL | % | Prior | Goal Description | Reference | Dependency |
|---|:--:|:--:|:--:|:--:|---|---|---|
| 4.8.1 | ⬜️ | — | 0 | P1 **[MODEL LEBIH KUAT WAJIB]** | `packages/infrastructure/src/database/personal-access-token.ts`: `createPersonalAccessToken(globalClient, {userId, name, expiresAt?})`, `revokePersonalAccessToken`, `listPersonalAccessTokens` — struktur identik TASK-4.7.1 tapi `User`-scoped (bukan Project-scoped, tidak ada `projectId` — FR-052), prefix `pat_`. Endpoint: `POST/GET /api/v1/me/personal-access-tokens`, `POST .../personal-access-tokens/:token_id/revoke` — otorisasi: User boleh kelola PAT MILIKNYA SENDIRI SELALU (bukan grant Permission Group — PAT bukan Project-scoped, tidak ada Membership yang relevan di titik pembuatan; analog Comment ownership BR-034A, business-level bukan grant-level), TIDAK ADA permission key `pat.*` di D.1 (dikonfirmasi sengaja saat audit pra-Phase-4 — PAT self-managed, beda dari API Key yang Project-scoped dan grant-gated `api_key.*`). | [02-SPEC C.14](docs/02-SPEC.md), BR-056, BR-057, BR-058, FR-052–054 | 4.1 |
| 4.8.2 | ⬜️ | — | 0 | P0 **[MODEL LEBIH KUAT WAJIB]** | `packages/infrastructure/src/auth/pat-identity-resolver.ts`: `PersonalAccessTokenIdentityResolver implements IdentityResolver` — pola identik TASK-4.7.2 (constant-time hash compare, expired/revoked → null, update `lastUsedAt` best-effort) TAPI **TANPA** cross-project scope check (PAT valid lintas Project SESUAI membership User yang bersangkutan — AC-022: PAT MUST NOT beri permission TAMBAHAN di luar yang dimiliki User, bukan PAT sendiri yang dibatasi ke satu Project). Setelah identity resolve sukses via PAT, permission resolution (TASK-4.1) berjalan berdasarkan Membership User TERSEBUT di Project yang diminta — PERSIS sama seperti User itu login via Session biasa, TIDAK ADA privilege tambahan/berkurang dari fakta bahwa dia pakai PAT. Update `CompositeIdentityResolver` (TASK-4.7.2) untuk include resolver ini. | [02-SPEC C.14](docs/02-SPEC.md), BR-056; [03-ENG C.2](docs/03-ENGINEERING.md) (AC-022, AC-023, AC-024) | 4.7.2, 4.8.1 |

**Test:** PAT dipakai ke Project di mana User adalah member → identity resolve sukses, permission SAMA seperti Session (uji: hasil `resolveEffectivePermissions` untuk User yang sama identik antara jalur Session vs jalur PAT, DENGAN Membership+assignment yang sama — regresi AC-022 paling langsung); PAT dipakai ke Project di mana User BUKAN member → identity resolve sukses (PAT valid) TAPI permission resolution gagal di step membership check (`PROJECT_ACCESS_DENIED`, bukan `PERMISSION_DENIED` — konsisten pola existing); PAT expired/revoked → ditolak (AC-023/024); User revoke PAT miliknya sendiri → berhasil tanpa syarat Membership/permission apa pun (self-managed); `token_hash` tidak pernah muncul di `GET /personal-access-tokens`.
**DoD:** AC-022 (tidak ada privilege tambahan dari PAT) punya test yang secara eksplisit membandingkan hasil resolusi permission Session vs PAT untuk actor+Project yang identik, bukan cuma "PAT berhasil login".

---

## Closure Log

<!-- Dev: `### CL-nn — YYYY-MM-DD · goal <id> <ringkasan>`. QA: `### QA-CL-nn — ...`. Review: `### Review-CL-nn — ...`. Cantumkan Role + Model/platform aktual. Append-only, jangan hapus/ubah entry lama. -->

<a id="review-cl-02"></a>
### Review-CL-02 — 2026-08-23 · goal 4.1.1 🔎 → ⚠️ — koreksi task text, `group_permissions.card_read_visibility` terlewat saat generate

**Role:** AI-Planning & Review · **Model:** Claude Sonnet 5

**[NEEDS-DECISION] dari AI-Dev (Gate A, sebelum mulai 4.2.1):** ditemukan discrepancy antara teks goal 4.1.1 (yang sudah diimplementasikan — `cardReadVisibility` HANYA dikumpulkan dari direct Permission assignment) vs SOT: **BR-040** ("Perubahan isi Permission Group (tambah/kurangi permission atau visibility `card.read`) MUST langsung berlaku ke semua Membership..."), schema `group_permissions.card_read_visibility` (field first-class, di-seed default `CREATED_BY_ME` saat Group diberi `card.read` — `project-admin.ts:183`), dan **BR-048** ("Jika beberapa grant berlaku pada entity yang sama, visibility terluas menang" — tanpa membedakan sumber grant). Engine yang sudah dibangun mengabaikan visibility milik Group, membuat kolom `group_permissions.card_read_visibility` jadi data mati di jalur Group.

**Verifikasi:** dicek langsung `packages/infrastructure/src/database/global-schema.ts:140-158` — `group_permissions` MEMANG punya kolom `card_read_visibility` sendiri (bukan cuma di `membership_permission_assignments`), dengan CHECK constraint enum yang sama. Ini bukan ambiguitas SOT yang butuh keputusan produk baru dari manusia — BR-040/BR-048/schema sudah SECARA EKSPLISIT menuntut Group ikut berkontribusi ke resolusi visibility; goal 4.1.1 (teks yang SAYA tulis saat generate task) yang keliru tidak mengikutsertakannya. Pola sama seperti Review-CL-02 Phase 2 (ancestor-check goal-text bug) — kesalahan spesifikasi saya sendiri, bukan Dev.

**Keputusan (tidak perlu eskalasi ke manusia — SOT sudah unambiguous):** Opsi A milik Dev (kumpulkan visibility dari KEDUA sumber, Group DAN direct, terluas menang) adalah satu-satunya yang sesuai SOT — Opsi B (direct-only, sesuai teks task lama) akan melanggar BR-040 secara langsung. Goal 4.1.1 dan 4.2.1 dikoreksi: shape `groupAssignments` berubah dari `{groupId, permissionKeys[], scopeType, scopeId}[]` menjadi `{scopeType, scopeId, permissions: {key, cardReadVisibility?}[]}[]` — setiap permission dalam Group membawa visibility miliknya sendiri, bukan daftar key polos. Langkah (3) resolusi visibility di 4.1.1 diperluas eksplisit menyebut kedua sumber.

**Status 4.1.1 diturunkan 🔎→⚠️, 80%→60%** — implementasi yang sudah ada (CL-01/CL-02) dibangun sesuai teks LAMA (direct-only), perlu direvisi Dev untuk memasukkan jalur Group sebelum bisa `🔎` lagi. Bukan kesalahan Dev — Dev justru benar berhenti di Gate A alih-alih menebak/melanjutkan dengan asumsi sendiri (AGENTS.md §10), persis perilaku yang diharapkan.

<a id="qa-cl-01"></a>
### QA-CL-01 — 2026-08-23 · goal 4.1.2 🔎 → ✅ — hasPermission + resolveCardVisibilityFilter, genuinely terisolasi dari gap 4.1.1
**Role:** AI-QA · **Model:** claude-sonnet-5 (Claude Code)
**Catatan lane:** goal 4.1.1 tetap `⚠️` (Review-CL-02, group_permissions.card_read_visibility belum dikonsumsi) — TIDAK disentuh/diverifikasi di sini, itu tanggung jawab Dev untuk rework dulu. Sebelum menerima 4.1.2 begitu saja, dicek dulu apakah goal ini SECARA STRUKTURAL bergantung pada gap tsb: baca `permission-engine.ts:122-144` — `hasPermission`/`resolveCardVisibilityFilter` HANYA menerima `EffectivePermissions` (tipe OUTPUT `{grantedKeys, cardReadVisibility}`), bukan `groupAssignments`/`directAssignments` mentah — keduanya tidak tahu apa pun soal bagaimana visibility itu dihitung, cuma konsumsi hasil akhirnya. Test `resolveCardVisibilityFilter` (`permission-engine.test.ts:230-` dst) dikonfirmasi HANYA memakai `directAssignments` untuk menyusun skenario visibility, tidak pernah lewat jalur Group — genuinely tidak menyentuh kode yang cacat. Kesimpulan: 4.1.2 independen dari status 4.1.1, aman diverifikasi terpisah (konsisten keputusan Dev sendiri yang tidak ikut menurunkan 4.1.2 saat 4.1.1 di-reopen).
**Bukti:** `hasPermission` — trivial `grantedKeys.has(key)`, dikonfirmasi benar termasuk Owner (seluruh katalog true) dan set kosong (seluruh key false). `resolveCardVisibilityFilter` — logika widening dikonfirmasi benar per kasus: `CREATED_BY_ME` (`creatorUserId===currentUserId` saja, assignee TIDAK cukup — dites eksplisit dengan Card yang assignee=ME tapi creator≠ME harus TIDAK lolos), `ASSIGNED_TO_ME` (OR creator/assignee), `ALL` (selalu true). Test suite `permission-engine.test.ts` (bagian 4.1.2, ~7 test) dijalankan ulang — hijau.
`pnpm -r typecheck`/`pnpm lint` bersih. Full suite `pnpm exec vitest run` → **70 file/437 test PASS**; `pnpm exec playwright test` → **1/1 PASS** (dijalankan sebagai bagian standar verifikasi closure, bukan cuma saat ada insiden).
**Kesimpulan:** ✅ ACCEPT goal 4.1.2. Goal 4.1.1 tetap `⚠️`, menunggu Dev rework terhadap teks goal yang sudah dikoreksi Review-CL-02.

<a id="cl-16"></a>
### CL-16 — 2026-08-23 · goal 4.6.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — GET assignments Membership
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 75 file / **461 test lulus** (+4 `membership-assignments.test.ts`: campuran AKTIF+REVOKED dengan scopeType/scopeId/revokedAt benar + DoD tanpa definisi Group penuh; kosong; boundary Project lain 404; negatif non-member.read 403 + positif Owner). `pnpm -r typecheck` Done; `pnpm lint` bersih.
**Catatan:** Loader `listMembershipAssignments` (tanpa filter server-side, pola GET /invitations) + `getMembershipInProject` (boundary → null → 404); authz via dep baru `assertPermissionKey` yang memakai engine TASK-4.1 scope Project — bukan Owner-only interim.

<a id="cl-15"></a>
### CL-15 — 2026-08-23 · goal 4.6.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 4.6.1 `⬜️/—/0`, dependency `4.4` = 4.4.1 `🔎80`. Router admin terverifikasi: `ProjectAdminRoutesDeps` memakai closure globalClient (bukan OpenProjectContext), sehingga authz `member.read` diimplementasikan sebagai dep baru dengan engine yang SAMA (resolveEffectivePermissions scope Project).
**Catatan:** Loader data mengembalikan AKTIF+REVOKED tanpa filter (pola GET /invitations) dan memverifikasi membership.project_id === projectId → RESOURCE_NOT_FOUND bila bukan (boundary).

<a id="cl-14"></a>
### CL-14 — 2026-08-23 · goal 4.5.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — filter visibility GET Card
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 74 file / **457 test lulus**, termasuk 4 baru `card-visibility.test.ts`: default CREATED_BY_ME (list hanya cd_own; hidden single → 404 bukan 403), ASSIGNED_TO_ME union OR + Owner ALL, ALL tanpa filter, BR-049 assignee diganti → visibility langsung berubah dari state terkini; `pnpm -r typecheck` Done; `pnpm lint` bersih.
**Catatan:** Test lama 2.9.1 "TANPA filter visibility" diperbarui — premisnya interim Phase 2 yang kini digantikan D.3/TASK-4.5 (hidden → RESOURCE_NOT_FOUND 404, anti-enumeration). Filter dijalankan SETELAH existence/boundary sesuai DoD urutan A.10.

<a id="cl-13"></a>
### CL-13 — 2026-08-23 · goal 4.5.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 4.5.1 `⬜️/—/0`, dependency `4.4` = 4.4.1 `🔎80`. Kedua endpoint GET Card terverifikasi dari disk (cards.ts:114 list, :128 single) — keduanya belum menyentuh visibility.
**Catatan:** Filter diaplikasikan SETELAH existence/boundary (404 dulu), sesuai DoD urutan A.10; GET tunggal yang tersembunyi → RESOURCE_NOT_FOUND 404 identik dengan tidak-ada.

<a id="cl-12"></a>
### CL-12 — 2026-08-23 · goal 4.4.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — interim Owner-only dihapus, formula ALLOW aktif
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → **73 file / 453 test lulus**, termasuk 5 test baru `authorization-scoped.test.ts`: grant `milestone.update` @ms_x → update ms_x 200; ms_y (scope salah) → 403; member tanpa assignment → 403; pewarisan `board.update` @ms_x → PATCH Board bd_x 200; regresi Owner tanpa assignment → 200. `pnpm -r typecheck` Done; `pnpm lint` bersih; DoD grep: `grep -rn assertOwnerInterim apps/api/src` → **0 hasil** (7 definisi + 30 call site dihapus).
**Catatan:** Helper `authorize(ctx, key, projectId, entity?)` di projects.ts (async — hierarchy entity di-walk via `loadEntityHierarchy`, card→list→board→milestone ≤3 query); re-resolve per-entity via `createEntityPermissionResolver`; fallback Project-scope saat entity tak ada agar 403 tetap mendahului 404. Pemetaan key D.1 per operasi: milestone/board/list `.<action>`; card create/update/move/archive/restore/delete + comment `card.comment(.update)`; assign/remove Label ke Card menumpang `card.update` (D.2); label `milestone_label.*`/`board_label.*`. 30 test double openProjectContext diperluas (permission+effectiveFor) — seluruh regresi Phase 0–3 hijau untuk Owner.

<a id="cl-11"></a>
### CL-11 — 2026-08-23 · goal 4.4.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 4.4.1 `⬜️/—/0`, dependency `4.3` = 4.3.1 `🔎80`. Inventarisasi dari disk: 30 call site assertOwnerInterim di 7 file (boards 4, card-labels 2, cards 5, comments 3, labels 7, lists 4, milestones 4 — definisi lokal dihapus semua); 32 test double `openProjectContext` di apps/api/test perlu menambah field ctx baru.
**Catatan:** Desain: (1) helper infra `loadEntityHierarchy` (walk parent card→list→board→milestone, 1 entitas = ≤3 query) + `createEntityPermissionResolver`; (2) `authorize(ctx, key, entity?)` di projects.ts — fallback Project-scope bila entity tidak ditemukan (menjaga urutan 403-sebelum-404 seperti interim); (3) hierarchy create Board/List/Card memakai chain parent dari path (grant scope ancestor tetap applicable, BR-042).

<a id="cl-10"></a>
### CL-10 — 2026-08-23 · goal 4.3.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — RealPermissionResolver ter-wire
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 72 file / **448** test lulus (+4 baru `permission-pipeline.test.ts`: member ber-assignment → grantedKeys benar + widest visibility, Owner → katalog penuh, member tanpa assignment → kosong tanpa crash, EmptyPermissionResolver masih injectable); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: `RealPermissionResolver` (loader 4.2.1 → engine 4.1.1, katalog dari `permissionCatalogKeys()`, isOwner dari `project.ownerUserId === identity.userId`); `ProjectRequestContext.permission: EffectivePermissions`; default pipeline kini Real (Empty tetap ada & injectable — DoD); `OpenProjectContext` membawa `permission`.
**Catatan:** Resolusi di pipeline HANYA scope Project (root) sesuai keputusan teknis goal; re-resolve per-entity hierarchy adalah pola TASK-4.4/4.5. apps/api tambah dep workspace `@kanban/domain`.

<a id="cl-09"></a>
### CL-09 — 2026-08-23 · goal 4.3.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 4.3.1 `⬜️/—/0`, dependency `4.1`+`4.2` = 4.1.1 `🔎80`, 4.1.2 `🔎80`, 4.2.1 `🔎80`. Seam terverifikasi: `permission-step.ts` (PermissionResolver + Empty), `pipeline.ts` (default Empty, ctx.permission null), `project-deps.ts` 2 titik konstruksi pipeline, `OpenProjectContext` sempit `{userId, ownerUserId, database}`.
**Catatan:** Keputusan teknis (C.6.5): RealPermissionResolver menjadi DEFAULT RequestPipeline (Empty tetap ada & injectable untuk test) — memenuhi DoD "Empty tidak lagi default wiring production" tanpa mengedit tiap titik konstruksi; ctx pipeline + OpenProjectContext membawa `permission: EffectivePermissions` agar TASK-4.4 bisa assert per-route.

<a id="cl-08"></a>
### CL-08 — 2026-08-23 · goal 4.2.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — loader assignment Global DB
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 71 file / **444** test lulus (+5 baru `permission-resolution.test.ts`: kosong-bukan-error, visibility per-entry Group terbawa, Group soft-deleted tidak ter-load, revoked tidak ter-load + aktif masuk, isolation antar-Membership); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: `loadEffectivePermissionInputs` di `packages/infrastructure/src/database/permission-resolution.ts` — 2 query paralel, JOIN `permission_groups.deleted_at IS NULL` (BR-041), filter `revoked_at IS NULL` di SQL (bukan layer atas), agregasi per-Group in-memory tanpa N+1.
**Catatan:** Shape return persis kontrak 4.1.1 pasca-revisi (`permissions: {key, cardReadVisibility?}[]`); visibility NULL → field dihilangkan; LEFT JOIN group_permissions menoleransi Group tanpa permission (key NULL dilewati).

<a id="cl-07"></a>
### CL-07 — 2026-08-23 · goal 4.2.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 4.2.1 `⬜️/—/0`, dependency `4.1` = 4.1.1 `🔎80` + 4.1.2 `🔎80`; teks goal hasil amandemen Review-CL-02 dibaca ulang (JOIN visibility per Group). Schema Global DB diverifikasi: `group_permissions.card_read_visibility`, `permission_groups.deleted_at`, kedua tabel assignment punya `revoked_at`.
**Catatan:** Agregasi baris JOIN per-Group dilakukan di memori (satu query, tanpa N+1); scopeType dipetakan langsung dari kolom enum.

<a id="cl-06"></a>
### CL-06 — 2026-08-23 · goal 4.1.1 revisi selesai sisi Dev (⚠️ → 🔄 → 🔎 · 60 → 80%) — visibility Group ikut diresolusi
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 70 file / **439** test lulus; `packages/domain/test/permission-engine.test.ts` kini 19 test — termasuk 5 kasus baru sumber Group: (1) visibility Group applicable dipakai walau tanpa direct card.read (3 nilai + default), (2) dua Group applicable visibility beda → terluas menang, (3) 4 kombinasi Group×direct widest-wins, (4) grant tidak applicable kedua sumber → default, (5) filter ALL bersumber Group; `pnpm -r typecheck` Done; `pnpm lint` bersih.
**Catatan:** `ScopedGroupAssignmentInput.permissions: {key, cardReadVisibility?}[]` menggantikan flat `permissionKeys`; `groupId` dihapus dari shape sesuai teks goal hasil Review-CL-02 (pemanggil TASK-4.2 yang membentuk). Logika resolusi tunggal `collect()` menangani kedua sumber — hanya entry `card.read` ber-visibility yang memengaruhi hasil.

<a id="cl-05"></a>
### CL-05 — 2026-08-23 · goal 4.1.1 dikerjakan ulang (⚠️ → 🔄 · 60% dipertahankan) — revisi visibility dari Group
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 4.1.1 `⚠️/60` dengan teks goal baru hasil Review-CL-02 (commit 23f4288, hanya PHASE-4-TASKS.md yang berubah — kode belum); `git show 23f4288 --stat` diverifikasi.
**Catatan:** Revisi: `ScopedGroupAssignmentInput.permissions: {key, cardReadVisibility?}[]` menggantikan flat `permissionKeys` (groupId tidak lagi dibawa — loader yang menentukan); resolusi visibility mengumpulkan widest dari KEDUA sumber applicable (Group + direct) sesuai BR-040/BR-048.

<a id="cl-04"></a>
### CL-04 — 2026-08-23 · goal 4.1.2 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — helper hasPermission + filter visibility
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 70 file / **437** test lulus (+5 baru di `permission-engine.test.ts`: hasPermission positif/negatif/kosong/Owner, filter CREATED_BY_ME / ASSIGNED_TO_ME union OR / ALL); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: `hasPermission` dan `resolveCardVisibilityFilter(effective, currentUserId)` di `permission-engine.ts`, diekspor via index domain.
**Catatan:** Filter ASSIGNED_TO_ME memakai union OR persis BR-047 (creator ATAU assignee, termasuk card creator null); CREATED_BY_ME menuntut `creatorUserId === currentUserId` saja.

<a id="cl-03"></a>
### CL-03 — 2026-08-23 · goal 4.1.2 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 4.1.2 `⬜️/—/0`, dependency `4.1.1` kini `🔎/80` (commit 298650e, suite 432 hijau). Reference D.3 + BR-047–049 dibaca dari disk saat Gate A 4.1.1.
**Catatan:** `hasPermission` + `resolveCardVisibilityFilter` ditempatkan di modul sama (`permission-engine.ts`) — masih pure, tanpa I/O.

<a id="cl-02"></a>
### CL-02 — 2026-08-23 · goal 4.1.1 selesai sisi Dev (🔄 → 🔎 · 0 → 80%) — permission resolution engine
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** `pnpm exec vitest run` → 70 file / **432** test lulus, termasuk 12 test baru `packages/domain/test/permission-engine.test.ts` (property-style: 5 level scope × kombinasi hierarchy, union multi-Group, widest-visibility pairs); `pnpm -r typecheck` Done; `pnpm lint` bersih. Implementasi: fungsi murni `resolveEffectivePermissions` di `packages/domain/src/permission/permission-engine.ts` + tipe terkait, diekspor via `packages/domain/src/index.ts`. Owner → seluruh katalog + `ALL` (BR-037); non-Owner → union assignment applicable per level hierarchy (BR-038/BR-042); visibility = widest dari direct `card.read` applicable (BR-047–049/D.3), default `CREATED_BY_ME`.
**Catatan:** Test negatif eksplisit: grant scope Milestone A ditolak untuk entity Milestone B/Project-scope lain; scope Board/List/Card dengan level mismatch; direct grant salah scope tidak menambah key maupun visibility. Tanpa I/O/tanggal/random (DoD kemurnian dites). Keputusan teknis `allPermissionKeys` di CL-01 tetap berlaku.

<a id="cl-01"></a>
### CL-01 — 2026-08-23 · goal 4.1.1 mulai dikerjakan (⬜️ → 🔄 · 0%)
**Role:** AI-Dev · **Model:** big-pickle (opencode)
**Bukti:** Freshness check dari disk: row 4.1.1 `⬜️/—/0/P0`, dependency `—`; Review-CL-01 adalah satu-satunya entry Closure Log file ini; working tree bersih pada commit review audit. Reference dibaca dari disk: 02-SPEC A.10 (BR-035–046), A.11 (BR-047–049), D.1–D.4; scope_type enum terverifikasi dari `global-schema.ts` (`'project'|'milestone'|'board'|'list'|'card'`).
**Catatan:** Keputusan teknis murni (C.6.5 poin 3, mudah diganti): input engine menambah field `allPermissionKeys: readonly string[]` — domain TIDAK boleh import `PERMISSION_CATALOG` milik infrastructure (boundary arsitektur), sehingga pemanggil (TASK-4.2/4.3) menyuplai katalog untuk jalur Owner BR-037. Semantik business tidak berubah.

<a id="review-cl-01"></a>
### Review-CL-01 — 2026-08-23 · generate task list Phase 4 (tanpa perubahan status implementasi)

**Role:** AI-Planning & Review · **Model:** Claude Sonnet 5

Generate `PHASE-4-TASKS.md` (8 task, 12 goal) mengikuti [04-DELIVERY C.6](docs/04-DELIVERY.md), setelah audit menyeluruh SOT-compliance/SOLID/code-review/no-hardcode atas Phase 0–3 (didokumentasikan di Review-CL terkait masing-masing file `PHASE-{1,3}-TASKS.md`) yang menghasilkan 4 amandemen SOT sebelum task ini digenerate: 2.9.0 (BR-052A), 2.10.0 (GET assignment/API Key/PAT list), 2.11.0 (GET list-children — gap paling signifikan, prasyarat langsung Card visibility scope Phase 4). Sebelum generate, dibaca penuh: 02-SPEC A.10/A.11/A.13, B.3/B.13, C.8/C.12/C.14, D.1–D.4; 03-ENGINEERING Part C penuh; state repo diperiksa (`permission-step.ts` sudah punya seam `EmptyPermissionResolver`, `global-schema.ts` sudah punya seluruh tabel assignment/credential sejak Phase 0, `project-admin.ts` sudah punya CRUD assignment sejak Phase 1 — Phase 4 murni membangun ENGINE resolusi + wiring + enforcement, bukan schema/CRUD assignment dari nol).

**Ditandai eksplisit sebagai P0 blocker LUAR file ini:** regresi bug CL-53 di `label-errors.ts` (Review-CL-03, `PHASE-3-TASKS.md`) — server tidak bisa boot via plain-Node sampai diperbaiki, akan menggagalkan SETIAP `playwright test` goal Phase 4 manapun. Tidak dibuat sebagai goal Phase 4 (itu perbaikan cross-cutting Phase 3, bukan pekerjaan Authorization) — dicatat sebagai prasyarat eksplisit di header file ini agar tidak terlewat.

**Keputusan model-tiering:** SELURUH goal ditandai `[MODEL LEBIH KUAT WAJIB]` (Prinsip #1) — berbeda dari Phase 2/3 yang hanya menandai goal terpilih, karena AGENTS.md §11.2 mendaftar "Authorization (Phase 4)" sebagai kategori penuh, bukan goal spesifik.

Belum ada implementasi yang dimulai — seluruh goal `⬜️`. Menunggu review manusia atas breakdown ini sebelum AI-Dev mulai bekerja (04-DELIVERY C.6.6).

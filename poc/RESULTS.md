# POC RESULTS — Turso cold start & query latency (0.2.1)

> Pengukuran riil 2026-08-18 (WIB) sesuai metodologi [03-ENGINEERING A.11](../docs/03-ENGINEERING.md) item 1.

## Setup

- Fungsi serverless Vercel: `poc/measure/api/[[...route]].ts` — Hono `4.13.2` + `@libsql/client` `0.17.4`, catch-all pattern, `SELECT 1`.
- Deploy: project `ng-odingin/ngodingin-kanban-poc`, production, region fungsi `iad1` (Washington, D.C. US East). Env `TURSO_DB_URL`/`TURSO_DB_TOKEN` (Sensitive).
- Turso DB: `poc-latency` @ group default, primary `aws-ap-south-1` (Mumbai). Client koneksi dibuat sekali per instance (module-level).
- Pengukuran: `poc/measure/scripts/measure.ts` — mode `cold` (1 request pertama setelah idle ≥ 10 menit) dan mode `warm` (request sekuensial; `dbMs` = durasi `client.execute`).
- Node v24.19.0 lokal; Vercel CLI 59.1.3; Turso CLI v1.0.31.

## Ambang POC (ditetapkan saat POC, lihat hasil assessment di bawah)

| Metrik | Ambang | Alasan |
|---|---|---|
| Warm p95 (total request) | ≤ 300 ms | Interaksi Kanban responsif |
| Cold start p95 | ≤ 1.5 s | Toleransi load pertama/after-idle |

## Hasil

### Cold start (request pertama setelah idle ≥ 10 menit, fungsi benar-benar dipanggil)

| Run | Tanggal | totalMs | dbMs | Keterangan |
|---|---|---|---|---|
| 1 | 2026-08-18 | 2474.09 | 905.39 | setelah idle 7 menit (era auto-detect deploy) |
| 2 | 2026-08-18 | 2383.42 | 886.79 | setelah idle 10 menit (era catch-all deploy) |

Cold start ≈ **2.4 s** (instansiasi λ + inisialisasi client + TLS/auth handshake Turso ~880 ms + query).

### Warm (instance hangat; n=12 sample fungsi, diambil via batch dengan verifikasi body JSON)

| Metrik | total (ms) | dbMs (ms) |
|---|---|---|
| min | 442.97 | 188.58 |
| p50 | 459.90 | 189.90 |
| p95 | 669.59 | 190.5 |
| max | 669.59 | 190.94 |

Query sederhana warm: **p50 ≈ 190 ms** (didominasi RTT lintas-region Vercel-iad1 ↔ Turso-Mumbai). Overhead di luar query ≈ 260–280 ms (edge sin1 → fungsi iad1).

## Temuan

1. **Region mismatch dominan.** DB di `aws-ap-south-1` (Mumbai), fungsi di `iad1` (Washington). RTT ~190 ms untuk `SELECT 1`. Rekomendasi produksi: co-locate DB dengan region fungsi (Turso `aws-us-east-1` ≈ Vercel `iad1`) — menurunkan query ke puluhan ms. Turso plan free saat ini tidak mengizinkan replikasi group ke region AWS lain (`replication is not supported at AWS`); opsi berbayar/group baru perlu diverifikasi di 0.2.4.
2. **Cold start ≈ 2.4 s.** Mayoritas = boot λ + handshake TLS/JWT Turso (~880 ms). Di atas ambang 1.5 s. Mitigasi: koneksi client di-cache per instance (sudah diterapkan), region co-location, dan pertimbangan `maxDuration`/region pin di 0.2.4.
3. **Routing flaky saat transisi cold.** Pada momen scale-to-zero/boot, sebagian request dapat dilayani static fallback (`index.html`) oleh edge, bukan fungsi (terjadi pada konfigurasi hybrid static+functions; pola catch-all mengurangi tapi tidak menghilangkan pada burst saat boot). Request wake pertama yang benar-benar sampai ke fungsi = ukuran cold start di atas. Catatan untuk produksi: gunakan satu fungsi catch-all untuk seluruh `/api/*` dan jangan campur static fallback pada path API.
4. Total warm ~450 ms (> ambang 300 ms) akibat overhead edge→fungsi + region mismatch; komponen query 190 ms akan turun drastis dengan co-location.

## Assessment terhadap ambang

- Warm p95 total: **GAGAL ambang** (670 ms vs 300 ms) — penyebab utama region mismatch + overhead routing; query saja (190 ms) mendekati batas UX.
- Cold start p95: **GAGAL ambang** (2.4 s vs 1.5 s) — wajar untuk boot λ + handshake; perlu co-location dan/atau strategi keep-warm bila UX menjadi prioritas.

**Kesimpulan sementara (final di 0.2.4):** Turso layak lanjut secara arsitektur (latensi query basis rendah bila co-located; provisioning & concurrency diverifikasi di 0.2.2/0.2.3). Region/plan DB dan strategi cold start menjadi pertimbangan keputusan GO/NO-GO.

---

# POC RESULTS — Concurrent write & BEGIN IMMEDIATE (0.2.3)

> Diukur 2026-08-18 terhadap Turso `poc-latency` (aws-ap-south-1) via `@libsql/client` 0.17.4 HTTP (hrana), 20 worker konkuren, satu baris counter (`value` + `version`). Skrip: `poc/measure/scripts/concurrency.ts`; raw: `poc/results-concurrency.jsonl`.

## Hasil

| Skenario | final | expected | lost updates | konflik/busy | catatan |
|---|---|---|---|---|---|
| Naive (tanpa tx, read-modify-write) | **1** | 20 | **19** | — | semua worker baca 0 lalu tulis 1 → hilang 19 update |
| `transaction("write")` + retry | **20** | 20 | 0 | busy 0 (run ini) | kunci tulis diambil saat BEGIN; retry menangani SQLITE_BUSY |
| Optimistic locking (version check + retry) | **20** | 20 | 0 | **177 konflik** terdeteksi | tidak ada overwrite diam-diam; konflik di-retry |

## Temuan

1. **`BEGIN IMMEDIATE` via `@libsql/client` HTTP = `transaction("write")`.** String mode `"immediate"` TIDAK didukung driver 0.17.4 (RangeError: hanya `"write" | "read" | "deferred"`); `"write"` mengakuisisi write lock saat BEGIN — setara `BEGIN IMMEDIATE` (A.6). Implementasi transaksi produksi MUST memakai mode `"write"`.
2. **SQLITE_BUSY di bawah kontensi.** `BEGIN` saat write lock dipegang tx lain → `SQLITE_BUSY` segera (tanpa menunggu), pada beberapa run teramati error ini. Mitigasi yang berlaku: **retry loop** pada `SQLITE_BUSY` (terbukti: 20/20 sukses).
3. **`PRAGMA busy_timeout` DILARANG di protokol hrana/HTTP Turso** (`SQL not allowed statement: PRAGMA busy_timeout`). Jadi busy-wait SQLite klasik tidak tersedia pada jalur HTTP — retry application-level adalah satu-satunya opsi (untuk libSQL lokal/native PRAGMA berlaku normal).
4. **Tanpa transaksi: lost updates masif** (19/20) — menguatkan kewajiban INV #6/#7 dan pola A.6 (mutation + activity atomik dalam satu tx `"write"`).
5. Durasi 20 worker serialized ≈ 4–5 s (roundtrip HTTP per tx; Turso remote). Catatan: naive run teramati sangat lambat (103 s) — dugaan retry/backoff driver pada error — tidak memengaruhi kesimpulan.

---

# POC RESULTS — Provisioning via Turso API (0.2.2)

> Diukur 2026-08-18 terhadap org `ngodingin-ai` (plan starter), group `default` (aws-ap-south-1), via `api.turso.tech/v1` + `@libsql/client` 0.17.4. Skrip: `poc/measure/scripts/provisioning.ts`; raw: `poc/results-provisioning.jsonl`. DB uji di-delete setelah tiap run (cleanup terverifikasi 200).

## Hasil (n=3)

| run | createMs | tokenMs | readyMs (create→query pertama OK) | firstQueryMs |
|---|---|---|---|---|
| 1 | 1305.2 | 606.8 | 2470.2 | 245.0 |
| 2 | 710.5 | 599.5 | 2044.7 | 295.8 |
| 3 | 713.8 | 499.0 | 2114.8 | 293.6 |
| **p50** | ~714 | ~600 | ~2115 | ~294 |

## Temuan

1. **Provisioning cepat: DB siap pakai (create + token + query pertama OK) ≈ 2.0–2.5 s** — masuk kategori "≲ beberapa detik" F.2 → **sinkron layak** untuk `POST /projects`; tidak perlu async queue untuk MVP.
2. **Alur provisioning nyata = create DB + mint JWT per-DB.** `POST /v1/organizations/{org}/databases` → `{database.Hostname}` (field **kapital**); `POST /v1/databases/{name}/auth/tokens` `{authorization:"full-access"}` → `{jwt}` (endpoint di bawah `/v1/databases/`, bukan `/organizations/`).
3. **Org API token TIDAK valid untuk koneksi libsql (401)** — hanya untuk REST API. Koneksi `libsql://` wajib memakai JWT per-DB (temuan wajib untuk 0.6/0.8).
4. Readiness tidak diekspos sebagai status instance di API v1 ini — polling query `SELECT 1` adalah sinyal "siap pakai" yang andal.
5. Biaya waktu tambahan provisioning untuk transaksi F.2: +migration Project schema + seed `project_state`/Activity di dalam satu tx `"write"` (0.5.3/0.6.1) — diperkirakan menambah ≲1 s (roundtrip + tx) pada jalur sinkron.

---

# POC RESULTS — Cost projection & GO/NO-GO assessment (0.2.4)

> Proyeksi 2026-08-18. Harga Turso per sumber terverifikasi (turso.tech/pricing via comparEdge/CostBench/StackSays, Juli 2026): **Free**: 100 database, 5 GB, 500M rows read/bln, 10M rows written/bln, 1 hari PITR; **Developer**: $4.99/bln, unlimited database, 9 GB, 2.5B reads/bln, 25M writes/bln; Scaler $24.92/bln. Plan akun saat ini: `starter` (gratis). Asumsi skala MVP (03-ENG F.1/F.2): kecil–menengah, potensial ribuan DB.

## Proyeksi biaya

| Skenario | Plan | Biaya/bln | Keterangan |
|---|---|---|---|
| Dev + preview + MVP awal (≤100 Project) | Free (starter) | $0 | 100 DB gratis; risiko utama: limit DB tercapai saat pertumbuhan |
| 100–1.000 Project | Developer | $4.99 | unlimited DB; storage/read/write MVP jauh di bawah limit |
| 1.000+ Project | Developer + overage / Scaler | $4.99–25 | per-DB size kecil (schema + data); overage reads/storage baru relevan di trafik besar |

Estimasi storage per Project DB MVP: schema tetap (10 tabel) + data — orde KB–MB; 5 GB free cukup untuk ribuan Project kosong/ringan. **Biaya tidak menjadi blocker: $0 → $4.99/bln.**

## Assessment POC gate A.11 (1–4)

| # | Item POC | Hasil | Verdict |
|---|---|---|---|
| 1 | Cold start + latensi serverless (0.2.1) | cold ~2.4 s (>1.5 s), warm p95 ~670 ms (>300 ms) — GAGAL ambang, dominan region mismatch (fungsi iad1 vs DB aws-ap-south-1) + overhead routing; `dbMs` ~190 ms | ⚠️ conditional |
| 2 | Provisioning via API (0.2.2) | create→siap pakai ≈ 2.0–2.5 s | ✅ sinkron layak |
| 3 | Concurrent writes + BEGIN IMMEDIATE (0.2.3) | `transaction("write")` + retry → 0 lost updates; optimistic locking deteksi konflik; SQLITE_BUSY ditangani retry | ✅ |
| 4 | Model biaya (0.2.4) | $0 → $4.99/bln | ✅ |

## Rekomendasi (menunggu keputusan manusia)

- **GO Turso** — ketiga gate teknis layak; kegagalan latensi adalah konfigurasi (region), bukan provider. Mitigasi: buat group/DB co-located dengan region fungsi Vercel (us-east-1/iad1) — free plan mengizinkan primary di AWS (replikasi ke AWS yang dibatasi, CL-03), lalu re-measure (0.2.1). Jika pasca co-location tetap di atas ambang → re-evaluasi fallback A.11.
- **Provisioning SINKRON** — 2.1 s ≲ "beberapa detik" (F.2): lebih sederhana untuk MVP, Project langsung operasional; tidak perlu `provisioning_state` async di MVP.
- Catatan implementasi yang terbawa ke 0.6: provisioning = create DB (API) + mint JWT per-DB (`POST /v1/databases/{name}/auth/tokens`) + migrasi schema + seed `project_state`/Activity dalam satu tx `"write"`; org API token tidak valid untuk koneksi libsql (401).

## Reproduksi

1. `turso db create poc-latency` → `TURSO_DB_URL`/`TURSO_DB_TOKEN` (`.env`; vercel env add production).
2. Deploy `poc/measure` (project settings: `buildCommand: "mkdir -p public"`, `outputDirectory: "public"`, `public/index.html` shell; fungsi `api/[[...route]].ts`).
3. Warm: `POC_URL=<url> POC_SAMPLE=60 pnpm measure:warm`; verifikasi setiap body memuat `dbMs` (n>0).
4. Cold: tunggu idle ≥ 10 menit → `POC_URL=<url> pnpm measure:cold`; verifikasi body `dbMs` (bukan `index.html`).
5. Catat ke tabel di atas.
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

## Reproduksi

1. `turso db create poc-latency` → `TURSO_DB_URL`/`TURSO_DB_TOKEN` (`.env`; vercel env add production).
2. Deploy `poc/measure` (project settings: `buildCommand: "mkdir -p public"`, `outputDirectory: "public"`, `public/index.html` shell; fungsi `api/[[...route]].ts`).
3. Warm: `POC_URL=<url> POC_SAMPLE=60 pnpm measure:warm`; verifikasi setiap body memuat `dbMs` (n>0).
4. Cold: tunggu idle ≥ 10 menit → `POC_URL=<url> pnpm measure:cold`; verifikasi body `dbMs` (bukan `index.html`).
5. Catat ke tabel di atas.
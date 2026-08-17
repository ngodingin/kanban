# POC RESULTS — Turso cold start & query latency (0.2.1)

> Diisi saat pengukuran riil dijalankan. Metodologi dan ambang ditetapkan saat POC sesuai [03-ENGINEERING A.11](../docs/03-ENGINEERING.md) item 1.

## Metodologi

- Fungsi serverless Vercel: `poc/measure/api/measure.ts` (Hono `4.13.2` + `@libsql/client` `0.17.4`), endpoint `GET /api/measure`, query sederhana `SELECT 1`.
- Deploy sebagai project Vercel terpisah (region default) dengan env `TURSO_DB_URL` + `TURSO_DB_TOKEN` (Turso DB baru).
- **Warm p95:** skrip `pnpm measure:warm` — 1 request warm-up (dibuang), lalu 60 request sekuensial; hitung p50/p95/p99/mean/min/max dari total latency sisi klien.
- **Cold start:** fungsi di-diamkan (idle ≥ 5–6 menit / scale-to-zero), lalu 1 request pertama diukur via `pnpm measure:cold`; dicatat beberapa kali untuk stabilitas.
- Tanggal/versi: TBD saat pengukuran.

## Ambang POC (ditetapkan saat POC)

| Metrik | Ambang | Alasan |
|---|---|---|
| Warm p95 (total request) | **≤ 300 ms** | Interaksi Kanban biasa (buka board = 1–2 query + overhead API); < 300 ms dianggap responsif (100–200 ms target umum UX) |
| Cold start p95 | **≤ 1.5 s** | Toleransi load pertama/after-idle; di atas ini pengalaman "lambat" saat membuka aplikasi setelah idle |

Ambang dapat direvisi berdasarkan hasil awal dengan alasan tercatat; keputusan GO/NO-GO dilakukan di 0.2.4.

## Hasil

| Run | Mode | Tanggal | Region | n | min | p50 | p95 | p99 | max | mean | dbMs (query) | Keterangan |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — | — | — | — | — | belum dijalankan |

## Reproduksi

1. `turso db create poc-latency` + dapatkan `TURSO_DB_URL`/`TURSO_DB_TOKEN`.
2. Deploy `poc/measure` ke Vercel (`vercel deploy --prod`), set kedua env di dashboard/CLI.
3. `POC_URL=<url-prod> pnpm measure:warm` (di `poc/measure`).
4. Tunggu idle ≥ 5–6 menit, lalu `POC_URL=<url-prod> pnpm measure:cold` (ulangi ≥ 3×).
5. Catat hasil ke tabel di atas.
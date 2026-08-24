# Rate Limiting Baseline (TASK-6.7.1, F.5)

> F.5 eksplisit: gunakan **fasilitas platform Vercel** (Firewall / Edge rate
> limit) — BUKAN infrastruktur kustom atau Redis tambahan. Dokumen ini adalah
> baseline konfigurasi yang MAY disesuaikan tanpa amandemen SOT (keputusan
> teknis murni).

## Scope

Endpoint yang dilindungi:
- Semua endpoint **mutation** (`POST`/`PATCH` pada `/api/v1/*`, kecuali GET).
- `/api/auth/*` (Magic Link — permukaan abuse email).

Tidak dilindungi: GET read-only & endpoint internal (`/api/internal/*` sudah
digerbangi credential sendiri).

## Rate limit key

| Jenis request | Key |
|---|---|
| Bearer API Key / PAT | hash SHA-256 dari token (BUKAN plaintext — menghindari leak key di log firewall) |
| Session cookie / anonim | IP klien (`x-forwarded-for` hop pertama) |

## Threshold baseline (permisif)

| Scope | Limit awal |
|---|---|
| Per key/IP | **100 request / menit** |
| `/api/auth/*` khusus | 20 request / menit |

Nilai ini sengaja longgar sebagai penghalang abuse kasar; pengetatan MAY
dilakukan kapan saja tanpa amandemen SOT.

## Konfigurasi di Vercel

1. Buka **Vercel Dashboard → Project → Firewall → Rate Limits**.
2. Buat rule per tabel di atas:
   - Match: path prefix `/api/v1` + method POST/PATCH → limit 100/min,
     key by header/hash atau IP.
   - Match: path prefix `/api/auth` → limit 20/min, key by IP.
3. Action saat melebihi: `429 Too Many Requests`.
4. Simpan; perubahan berlaku tanpa deploy ulang.

Aturan yang sama dapat direplikasi via Vercel Firewall REST API untuk
infrastructure-as-code bila diperlukan.

## Verifikasi

Setelah rule aktif: kirim burst >limit ke satu IP/key → respons `429`
sejak request ke-(N+1); request normal dari key lain tidak terpengaruh.

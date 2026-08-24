# Log Metrics — Query Metrik dari Structured Request Log (TASK-6.6.2)

> Operasional minimal F.4: SEMUA metrik diturunkan dari satu baris JSON per
> request yang di-emit `requestLogger()` (TASK-6.6.1). Tidak ada infrastruktur
> metrik baru — query langsung atas log (Vercel Log Drains / `jq` lokal).

## Bentuk baris log

```json
{"request_id":"01J...","user_id":"u1","project_id":"a-01J...",
 "action":"POST /v1/projects/a-01J/milestones","outcome":"201",
 "duration_ms":12}
```

`outcome` = `"<status>"` sukses, atau `"<status> <ERROR_CODE>"` bila ≥400.

## Contoh query (jq)

### Request rate per menit

```sh
tail -f app.log | jq -r 'select(.request_id) | .action' | --strip
# agregasi:
jq -s 'group_by(.action) | map({action: .[0].action, count: length})' app.log
```

### Error rate per kode kanonik

```sh
jq -s '[.[] | select((.outcome | tonumber? // 999) >= 400)] |
       group_by((.outcome | split(" "))[1] // "HTTP") |
       map({code: (.[0].outcome | split(" "))[1] // "HTTP", count: length})' app.log
```

### Latensi p50/p95

```sh
jq -s '[.[].duration_ms] | sort |
       {p50: .[(length*0.5|floor)], p95: .[(length*0.95|floor)]}' app.log
```

### VERSION_CONFLICT rate (kesehatan concurrency, AC-020)

```sh
jq -s '[.[] | select(.outcome | contains("VERSION_CONFLICT"))] | length' app.log
```

### Kegagalan provisioning

Provisioning dicatat sebagai request dengan outcome `5xx` pada
`POST /v1/projects`; filter:

```sh
jq -s '[.[] | select(.action == "POST /v1/projects" and (.outcome | startswith("5")))]' app.log
```

## Alternatif Node (environment tanpa `jq`)

Terverifikasi terhadap sampel log nyata (3 baris: 201, 409 VERSION_CONFLICT,
500 INTERNAL_ERROR):

```js
const lines = require("fs").readFileSync("app.log","utf8").trim().split("\n").map(JSON.parse);
const errors = lines.filter(l => parseInt(l.outcome) >= 400);
const byCode = {};
for (const l of errors) { const code = l.outcome.split(" ")[1] || "HTTP"; byCode[code]=(byCode[code]||0)+1; }
const durations = lines.map(l=>l.duration_ms).sort((a,b)=>a-b);
console.log({ errorRatePerCode: byCode, versionConflict: byCode.VERSION_CONFLICT||0,
              p50: durations[Math.floor(durations.length*0.5)],
              p95: durations[Math.floor(durations.length*0.95)] });
// → {"errorRatePerCode":{"VERSION_CONFLICT":1,"INTERNAL_ERROR":1},"versionConflict":1,"p50":8,"p95":12}
```

## Vercel (produksi)

Log JSON mengalir ke Vercel Logs (Log Drain → penyimpanan apa pun yang
mendukung query). Di dashboard Vercel gunakan filter teks pada field JSON,
mis. `outcome:"409 VERSION_CONFLICT"` untuk error-rate concurrency, atau
drain ke penyimpanan log eksternal dan jalankan query jq-setara di atas.

Retensi & alerting mengikuti plan Vercel saat ini; tidak ada komponen baru.

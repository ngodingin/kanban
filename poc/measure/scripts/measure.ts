const MODE = process.argv[2] ?? "warm";
const URL = process.env.POC_URL;
const N = Number(process.env.POC_SAMPLE ?? "60");

if (!URL) {
  throw new Error("POC_URL wajib diisi (URL fungsi Vercel yang sudah di-deploy).");
}

function percentile(sorted: number[], p: number): number {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i]!;
}

type Sample = { totalMs: number; dbMs?: number };

async function requestOnce(url: string): Promise<Sample> {
  const started = performance.now();
  const res = await fetch(url);
  const body = await res.text();
  const totalMs = performance.now() - started;
  if (!res.ok) throw new Error(`status ${res.status}`);
  let dbMs: number | undefined;
  try {
    dbMs = (JSON.parse(body) as { dbMs?: number }).dbMs;
  } catch {
    dbMs = undefined;
  }
  return { totalMs, dbMs };
}

function round(v: number | undefined): number | undefined {
  return v === undefined ? undefined : Math.round(v * 100) / 100;
}

if (MODE === "cold") {
  const started = performance.now();
  const res = await fetch(URL);
  const body = await res.text();
  const totalMs = performance.now() - started;
  if (!res.ok) throw new Error(`status ${res.status}`);
  console.log(JSON.stringify({ mode: "cold", totalMs: round(totalMs), rawBody: body.slice(0, 200) }, null, 2));
} else {
  await requestOnce(URL);
  const samples: Sample[] = [];
  for (let i = 0; i < N; i++) samples.push(await requestOnce(URL));

  const totals = samples.map((s) => s.totalMs).sort((a, b) => a - b);
  const dbOnly = samples.map((s) => s.dbMs).filter((v): v is number => v !== undefined).sort((a, b) => a - b);
  const sum = totals.reduce((a, b) => a + b, 0);

  console.log(
    JSON.stringify(
      {
        mode: "warm",
        n: totals.length,
        total: {
          minMs: round(totals[0]!),
          p50Ms: round(percentile(totals, 50)),
          p95Ms: round(percentile(totals, 95)),
          p99Ms: round(percentile(totals, 99)),
          maxMs: round(totals[totals.length - 1]!),
          meanMs: round(sum / totals.length),
        },
        db: {
          n: dbOnly.length,
          minMs: round(dbOnly[0]),
          p50Ms: round(percentile(dbOnly, 50)),
          p95Ms: round(percentile(dbOnly, 95)),
          p99Ms: round(percentile(dbOnly, 99)),
          maxMs: round(dbOnly[dbOnly.length - 1]),
        },
      },
      null,
      2,
    ),
  );
}
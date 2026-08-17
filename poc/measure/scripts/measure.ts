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

async function requestOnce(url: string): Promise<number> {
  const started = performance.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`status ${res.status}`);
  await res.text();
  return performance.now() - started;
}

if (MODE === "cold") {
  const ms = await requestOnce(URL);
  console.log(JSON.stringify({ mode: "cold", totalMs: Math.round(ms * 100) / 100 }));
} else {
  await requestOnce(URL);
  const samples: number[] = [];
  for (let i = 0; i < N; i++) samples.push(await requestOnce(URL));
  samples.sort((a, b) => a - b);
  const sum = samples.reduce((a, b) => a + b, 0);
  console.log(
    JSON.stringify(
      {
        mode: "warm",
        n: samples.length,
        minMs: Math.round(samples[0]! * 100) / 100,
        p50Ms: Math.round(percentile(samples, 50) * 100) / 100,
        p95Ms: Math.round(percentile(samples, 95) * 100) / 100,
        p99Ms: Math.round(percentile(samples, 99) * 100) / 100,
        maxMs: Math.round(samples[samples.length - 1]! * 100) / 100,
        meanMs: Math.round((sum / samples.length) * 100) / 100,
      },
      null,
      2,
    ),
  );
}
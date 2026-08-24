# @kanban/web — React/Vite SPA

Implementasi SPA **Phase 7** ([PHASE-7-TASKS.md](../../PHASE-7-TASKS.md)), di-bootstrap dari nol pada goal 7.1.1.

Stack (exact-pin, baseline [03-ENGINEERING A.8.2](../../docs/03-ENGINEERING.md) + revalidasi Review-CL-05):
React 19.2.x · React Router 8.x · Vite 8.x · Tailwind CSS 4.x (+ `@tailwindcss/vite`) · shadcn 4.x · TypeScript 6.0.x.

## Perintah

```bash
pnpm --filter @kanban/web dev        # dev server (proxy /api -> localhost:3100)
pnpm --filter @kanban/web build      # production build -> dist/
pnpm --filter @kanban/web typecheck  # tsc --noEmit
pnpm dlx shadcn@4.19.0 add <comp>    # tambahkan primitive shadcn (config: components.json)
```

## Topologi serving

Production build (`dist/`) disajikan bersama API Hono pada satu origin:
`scripts/preview-build.mjs` menyalin `apps/web/dist` ke output statis, dengan
rute filesystem → `/api/*` → fallback `index.html` (SPA deep link). Test:
`apps/web/test/web-serving.test.ts`.

Struktur kode mengikuti [05-FRONTEND §6](../../docs/05-FRONTEND.md).

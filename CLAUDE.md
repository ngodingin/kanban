# CLAUDE.md

Instruksi kerja untuk agent di repo ini **berada di [AGENTS.md](AGENTS.md)** — itu satu-satunya sumber aturan operasi, supaya tidak ada duplikasi yang bisa jadi tidak sinkron.

**Baca [AGENTS.md](AGENTS.md) sepenuhnya sebelum melakukan apa pun.**

Pengingat non-negotiable (detail & selebihnya ada di AGENTS.md):

- **SOT (`docs/`) menang atas kode.** Jangan menyelesaikan konflik spesifikasi dengan memilih perilaku sendiri secara diam-diam.
- Sebelum menulis kode, baca penuh `docs/02-SPEC.md` dan `docs/03-ENGINEERING.md`.
- Jangan langgar 10 invariant inti ([docs/02-SPEC.md](docs/02-SPEC.md) A.16) dan Implementation Rules ([docs/04-DELIVERY.md](docs/04-DELIVERY.md) C.4).
- Kerjakan per fase via file task di root (fase aktif: [PHASE-0-TASKS.md](PHASE-0-TASKS.md)); update Status + Closure Log tiap perubahan.
- Hal yang menyentuh business invariant / authorization / lifecycle / API semantics → **berhenti dan minta keputusan manusia**, tandai `[NEEDS-DECISION]` / `[NEEDS-SPEC-AMENDMENT]`.

Selebihnya: lihat **[AGENTS.md](AGENTS.md)**.

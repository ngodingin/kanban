# NGodingin Kanban

Platform project management / Kanban yang **sederhana, dinamis, dan API-first**, dengan isolasi penuh per-Project (multi-tenant lewat database-per-project).

> **Simple by default, flexible by design** — sistem tidak memaksakan workflow. List tidak punya makna baku; tim menentukan sendiri arti setiap kolom.

**Status:** Pra-implementasi. Spesifikasi (SOT) matang di **v1.0.3**. Fase aktif: **Phase 0 — Foundation**.

---

## Struktur domain

```text
Project → Milestone → Board → List → Card
```

Empat prinsip fundamental:
1. **Project Isolation** — Project adalah hard boundary; tidak ada perpindahan resource lintas-Project.
2. **Dynamic Workflow** — List ≠ Status; tidak ada "Done" universal.
3. **Historical Integrity** — Activity immutable & append-only.
4. **Valid State Transition** — *last valid write wins* (optimistic concurrency), bukan sekadar last write wins.

---

## Peta dokumen

| File | Untuk siapa | Isi |
|---|---|---|
| [AGENTS.md](AGENTS.md) | AI coding agent & kontributor | Manual operasi + aturan main (baca ini dulu bila akan menulis kode) |
| [PHASE-0-TASKS.md](PHASE-0-TASKS.md) | Pelaksana | Task & goal breakdown fase aktif, dengan status tracking |
| [PHASE-7-TASKS.md](PHASE-7-TASKS.md) | Pelaksana | Task UI — ⏸️ **blocked** sampai Phase 0–6 selesai & terverifikasi |
| [docs/05-FRONTEND.md](docs/05-FRONTEND.md) | Frontend dev | Design tokens, template foundation, UI↔domain mapping |
| [docs/01-PRODUCT.md](docs/01-PRODUCT.md) | Semua | Vision, PRD, user stories, governance, versioning |
| [docs/02-SPEC.md](docs/02-SPEC.md) | Developer/agent | Business rules, functional req, API contract, authorization |
| [docs/03-ENGINEERING.md](docs/03-ENGINEERING.md) | Developer/DevOps | Architecture, database, security, deployment, operations |
| [docs/04-DELIVERY.md](docs/04-DELIVERY.md) | Developer/QA | UX flows, testing, task breakdown, aturan agent |

---

## Tech stack (terkunci di SOT v1.0.3)

- **Frontend/API:** Next.js + TypeScript (Route Handlers)
- **Database:** libSQL / Turso — database-per-project *(pending POC gate)*
- **ORM:** Drizzle + drizzle-kit
- **ID:** ULID
- **Auth (web session):** Auth.js — user disimpan di Global DB milik sendiri
- **Validation:** Zod
- **Deployment:** Vercel

Rationale tiap keputusan ada di [docs/03-ENGINEERING.md](docs/03-ENGINEERING.md) A.8, A.11–A.14.

---

## Mulai dari mana

**Kalau kamu AI coding agent atau kontributor yang akan menulis kode:**
→ Baca **[AGENTS.md](AGENTS.md)** sepenuhnya lebih dulu, lalu `docs/02-SPEC.md` + `docs/03-ENGINEERING.md`, lalu kerjakan **[PHASE-0-TASKS.md](PHASE-0-TASKS.md)** goal per goal.

**Kalau kamu ingin memahami produk/keputusan:**
→ Mulai dari [docs/01-PRODUCT.md](docs/01-PRODUCT.md), lanjut sesuai kebutuhan.

**Prioritas Phase 0:** jalankan POC Turso (TASK-0.2) sebagai gating sebelum mengunci provider & strategi provisioning.

---

## Prinsip kontribusi

- SOT adalah sumber kebenaran. Kode mengikuti SOT, bukan sebaliknya.
- Perubahan aturan domain → lewat amandemen SOT + naik versi + update test, baru ubah kode.
- Jangan menambah fitur di luar MVP (lihat non-goals di [docs/01-PRODUCT.md](docs/01-PRODUCT.md) § 2.2).

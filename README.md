# AGENT HQ

Operational headquarters for **DEEMANNIE'S DIGITAL** — an AI-assisted digital
agency that discovers real prospects, verifies evidence, and keeps all
external actions behind a human approval gate.

> Phase 2 / REAL OPERATIONS. This build replaces agent theatre with durable
> tasks, live public-data research, verified result delivery, and explicit
> blockers.

## What is real

- **NOVA** executes live prospect research through a server-side bridge:
  Nominatim geocoding → Overpass/OpenStreetMap discovery → direct homepage
  HTTP audits.
- Tasks move through server-owned statuses: `QUEUED`, `RUNNING`, `COMPLETED`,
  `FAILED`, `AWAITING_APPROVAL`.
- `COMPLETED` requires a durable write **and** a read-back verification, not
  just a provider response.
- Results include business name/location, official website status, observed
  online-presence signals, source URLs, retrieval timestamps, SHA-256 evidence
  hashes, verified facts, and separately labelled assumptions.
- The interface receives live task changes over SSE and can also load the
  durable task record after a refresh.
- Outreach drafts are stored locally and require operator approval. Nothing is
  sent.

## What is blocked

- Email delivery: no provider or credentials.
- Website publishing: no deployment target.
- Payments/spend: no integration or authority.
- Model-assisted synthesis: no model provider key configured.
- Business-registry verification: identity rests on OpenStreetMap and the
  business website, not a government registry.

The System view reports these blocks in the running interface.

## Arcade

A complete, playable arcade game ships with this repository:

- [**NOVA BREAKER**](/game.html) — a neon brick-breaker built in self-contained
  TypeScript (`game.html` + `src/game/`). Mouse, touch or keyboard controls,
  5 looping sectors, combo scoring, five power-ups (wide paddle, multi-ball,
  slow-field, laser paddle, extra life), explosive bricks, synthesized sound
  and a persisted high score. Open `/game.html` on the running server, or the
  "Arcade" link in the dashboard top bar.

## Run it

```bash
npm install
npm run build
npm start
```

Open `http://localhost:3002`.

Development:

```bash
npm run dev          # API on :3002 + Vite on :5173
```

Tests and checks:

```bash
npm test
npm run typecheck
npm run build
```

Run the live research assignment against a running instance:

```bash
npm run research:live -- "Galway, Ireland" cafe 3
```

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness |
| `GET` | `/api/system` | Capability matrix and task counts |
| `GET` | `/api/tasks` | Durable task records |
| `GET` | `/api/tasks/:id` | Single task and evidence |
| `POST` | `/api/tasks/research` | Submit research (`city`, `category`, `count`) |
| `POST` | `/api/tasks/outreach` | Create local draft (`parentTaskId`, `prospectId`) |
| `POST` | `/api/tasks/:id/retry` | Re-queue a retryable failure |
| `POST` | `/api/tasks/:id/decision` | `APPROVE` or `REJECT` a draft |
| `GET` | `/api/events` | SSE task snapshots and updates |

## Documentation

- [Phase 2 audit](docs/PHASE2_AUDIT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Verification report](docs/VERIFICATION.md)
- [Security notes](docs/SECURITY.md)

## Baseline

The requested checkpoint `870d509` is absent from this repository. The actual
pre-Phase-2 HEAD is preserved as tag `pre-phase2-baseline`. See the audit for
evidence.

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/dannyleonards42-web/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/dannyleonards42-web/PlayGround)

- 🎮 [Open the project](https://omgithub.com/dannyleonards42-web/PlayGround).
- ✨ [Remix this project](https://omgithub.com/?remix=dannyleonards42-web%2FPlayGround).
- 💻 [Explore the source](https://github.com/dannyleonards42-web/PlayGround).
- 🛠️ [Check build runs](https://github.com/dannyleonards42-web/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/dannyleonards42-web/PlayGround/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/dannyleonards42-web).
- 🌍 [Create with OMGithub](https://omgithub.com).
<!-- omgithub:readme:end -->

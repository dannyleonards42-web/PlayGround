# PlayGround

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

## AGENT HQ — Phase 02 real operations

AGENT HQ is a zero-dependency Node application for real prospect research. NOVA
(Research & Opportunity Lead) discovers real businesses from OpenStreetMap,
fetches their public homepages, records only directly observed facts, and keeps
opportunity estimates in a separate assumptions field.

Nothing is sent, published, purchased, or changed. The approval queue releases a
draft for manual human use; it never performs an outbound action.

### Run it

```bash
npm start          # http://localhost:3000
npm test           # 26 tests
npm run check      # syntax / surface checks
npm run build      # self-contained dist/
```

`start.sh` intentionally runs this Node server because the UI requires `/api`
and persisted task state. Environment variables: `PORT`, `HOST`, `DATA_DIR`,
`PUBLIC_DIR`, `SEED_STATE`, `RESEARCH_USER_AGENT`.

A fresh data directory imports `data/seed-state.json`, a genuine archived run
against the live web, so the interface starts with real delivered evidence. Set
`SEED_STATE=off` to start empty.

### What is real vs. what is inferred

| Real, executed | Clearly labelled inference |
| --- | --- |
| OpenStreetMap/Nominatim discovery | Opportunity score and priority |
| Direct HTTP GET of the official homepage | Suggested outreach angle |
| HTML title, meta, links, forms, headers, payload size | Business fit, budget, intent, or impact |
| Source URL + observation timestamp per fact | Anything not present in delivered HTML |

A task is marked `COMPLETED` only after results are persisted and read back from
disk. `FAILED` records keep the public error and can be retried as a new task.
`AWAITING_APPROVAL` means a draft is delivered but undecided; after a decision
the task closes as `COMPLETED` with the decision recorded and `sendStatus:
NOT_SENT`. JavaScript-rendered content is not executed, so “not detected in the
delivered HTML” never means “proven absent from the live site.”

### Architecture

- `server/app.js` — HTTP API, SSE updates, security headers, static serving.
- `server/task-service.js` — sequential queue, execution, persistence readback.
- `server/store.js` — atomic JSON state, status transitions, recovery, metrics.
- `server/execution/bridge.js` — provider dispatch for research and drafts.
- `server/execution/discovery.js` — Nominatim search and chain/duplicate filtering.
- `server/execution/research-provider.js` — audit selection and evidence synthesis.
- `server/execution/site-audit.js` / `html-analyzer.js` — static HTML observations.
- `server/execution/outreach-provider.js` — approval-gated draft, never sends.
- `server/lib/network-guard.js` / `http-client.js` — SSRF, DNS, redirect, size caps.
- `public/` — mission-control UI, prospect board, task ledger, approvals, evidence.
- `data/seed-state.json` — archived verified run used for first boot.
- `test/` — lifecycle, API, research, audit, security coverage.

### API

- `GET /api/health`
- `GET /api/state`
- `GET /api/tasks`, `GET /api/tasks/:id`
- `POST /api/tasks` (`prospect_research` or `outreach_draft`)
- `POST /api/tasks/:id/retry`
- `GET /api/approvals`
- `POST /api/approvals/:id/decision` (`approve` or `reject`)
- `GET /api/events` (SSE)

### Verified first run

The archived run `tsk_0c378ad6c6d7` completed on 2026-11-02 in 4.2 s with
`delivery.verified: true`, 11 candidates screened, 6 homepages audited, and 3
prospects delivered: Coco Donuts (HOT, 50), Nate's Oatmeal Cookies (HOT, 40),
and Kinnamons (NURTURE, 14). It produced 50 sourced facts and 9 labelled
assumptions. Two location labels read `SOURCE_LISTED` because the delivered HTML
never mentions Portland; the UI and data say so explicitly.

### Checkpoint note

The requested checkpoint `870d509` does not exist in this repository. Baseline
HEAD `2aee5e6` was preserved. This implementation adds new untracked files and
does not rewrite existing history.

### Known limits

- Nominatim is community data and may be stale or incomplete.
- Static HTML inspection cannot see JavaScript-rendered content or bot blocks.
- No traffic, conversion, revenue, contact, or intent data is collected.
- The app is a local operator tool with no authentication; bind it to localhost
  or put it behind an authenticated proxy before exposing it.


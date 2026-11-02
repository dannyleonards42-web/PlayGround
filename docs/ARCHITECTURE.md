# AGENT HQ Architecture

AGENT HQ is a single-process TypeScript application. The Express server owns
tasks, execution, persistence, and evidence. The React/Vite interface is a
read-only projection of the server state plus three explicit command endpoints.

## Stack

- **Server:** Node.js 24, Express, Zod, `tsx`
- **Client:** React 19, Vite 6, lucide-react, hand-written CSS
- **Tests:** Vitest, Supertest
- **Persistence:** atomic JSON snapshot at `data/hq.json`
- **Transport:** JSON REST plus server-sent events (`/api/events`)
- **Research:** Nominatim geocoding, Overpass API, direct HTTP(S) homepage audit
- **Paid dependencies / credentials:** none

## Task lifecycle

```text
POST /api/tasks/research
        │
        ▼
     QUEUED ──► RUNNING ──► result persisted ──► read-back verified
                    │                                │
                    │                                ├─► SSE broadcast
                    │                                ▼
                    │                           COMPLETED
                    └─ error ──► FAILED (retryable?)
                                    │
                                    └─ POST /retry ──► QUEUED

POST /api/tasks/outreach ──► AWAITING_APPROVAL
                                  │
                    APPROVE ──────┴────── REJECT
                       │                    │
                  COMPLETED               FAILED
                (manual use only)     (no retry)
```

`COMPLETED` is never written until:

1. the provider returned exactly the requested number of prospects;
2. every prospect has at least one source reference;
3. the task record was written to durable storage;
4. the same record was read back from disk and validated;
5. the interface delivery was attempted and recorded.

If any check fails, the task becomes `FAILED` and any previous result is
cleared. It is not possible to display a completed result that only exists in
memory.

## Main modules

| Path | Responsibility |
| --- | --- |
| `server/index.ts` | Boot, environment, restart recovery, static serving |
| `server/app.ts` | REST routes, validation, SSE, security headers, rate limit |
| `server/runner.ts` | Queue, status transitions, execution, delivery verification, approvals |
| `server/store.ts` | Atomic JSON persistence and read-back |
| `server/bus.ts` | SSE client registry and task broadcast |
| `server/research/liveResearch.ts` | Nominatim/Overpass discovery and homepage audit orchestration |
| `server/research/extract.ts` | HTML extraction, identity matching, opportunity scoring |
| `server/research/http.ts` | Public-URL guard, redirect validation, capped fetch |
| `shared/types.ts` | Shared task, evidence, prospect, and API contracts |
| `src/App.tsx` | Dashboard state and SSE client |
| `src/components/TaskDetail.tsx` | Evidence report, delivery proof, timeline, approval gate |
| `tests/taskFlow.test.ts` | Submission, execution, failure/retry, delivery, approval, SSE |
| `tests/research.test.ts` | Extraction, scoring, identity, SSRF guard |

## Research method

1. **Geocode** the requested city via Nominatim.
2. **Discover** businesses with a website tag using Overpass within the city
   bounding box. Businesses are deduplicated by normalized name and domain.
3. **Audit** each candidate homepage directly with a 15-second timeout, a
   1.5 MB body cap, and a private-address guard on every redirect hop.
4. **Observe** only signals present in the fetched HTML/headers:
   viewport, meta description, HTTPS, booking path, social links, structured
   data, copyright year, business-name match, response time, payload size.
5. **Require** a successful HTML fetch before a site can be `PAGE_VERIFIED`.
6. **Prefer** candidates whose page identity matches the OSM business name.
7. **Persist** facts, assumptions, source URLs, timestamps, response metadata,
   and SHA-256 evidence hashes.

The app does not call a model to invent findings. Opportunity text is generated
deterministically from observed signals.

## Data model (summary)

- `Task`: id, type, input, status, timestamps, progress, events, execution
  provider/mode, result, error, approval, delivery proof.
- `ResearchResult`: assignment, prospects, methodology, limitations, sources,
  provider, candidate/audit counts, execution timestamp.
- `Prospect`: verified directory facts, website finding, opportunity signals,
  facts with source refs, assumptions, sources, research timestamp.
- `SourceReference`: kind, title, URL, publisher, retrieval timestamp, excerpt,
  content hash.
- `DeliveryProof`: persisted, read-back, broadcast client count, verification
  time, API path.

## Safety boundaries

- Outbound email: **no provider, no credentials, no send function**.
- Publishing: **no deployment target or token**.
- Payments: **no integration or spend authority**.
- Model providers: **none configured**.
- Research fetches are limited to public HTTP(S) hosts; localhost, private
  ranges, link-local, and credentials in URLs are rejected. Redirects are
  re-validated before each hop.
- API writes are rate-limited (8 POSTs/minute/IP) and body-limited to 32 KB.
- CSP, `nosniff`, frame denial, referrer policy, and permissions policy are set
  by the server.
- User text is rendered through React; no `dangerouslySetInnerHTML`.

### Known security limitation

DNS is resolved before each request to reject private targets, but Node's
`fetch` resolves the host again when connecting. A hostile DNS server could
rebind between checks. Production hardening should pin DNS or use a custom
dispatcher. This is not exercised by the current research dataset.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3002` | HTTP port |
| `HQ_DATA_DIR` | `./data` | Durable task store directory |
| `HQ_MODE` | `LIVE` | Displayed execution mode; tests use `TEST` |
| `HQ_BASE_URL` | `http://127.0.0.1:$PORT` | Live research CLI target |

No secret variables are required.

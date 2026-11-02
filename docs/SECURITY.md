# Security Notes

## Boundaries

AGENT HQ is intentionally unable to perform high-impact external actions:

| Action | Capability |
| --- | --- |
| Send email | **Absent.** No mail library, provider, address book, or credentials. |
| Publish websites | **Absent.** No deploy token or target. |
| Move money | **Absent.** No payment integration. |
| Change account settings | **Absent.** No account APIs. |
| Call a model | **Absent.** No model provider or key. |
| Read local files via research | **Blocked.** Research only fetches public HTTP(S) URLs discovered from OSM. |

Approving an outreach draft only records an operator decision. It does not
trigger a send.

## Secrets

No credentials are required to run the application. No `.env` file is read by
the server. No secrets were added to source, browser bundles, logs, or Git.

If future phases add credentials, use server-only environment variables and
never expose them through `VITE_*` variables, which are bundled into browser
code.

## Network safety

- Only `http:` and `https:` URLs are accepted for website audits.
- URLs containing credentials are rejected.
- `localhost`, `.localhost`, `.local`, private IPv4 ranges, link-local,
  carrier-grade NAT, benchmark ranges, multicast/reserved ranges, and private
  IPv6 ranges are rejected.
- Redirects are followed manually (max 5), and every hop is re-validated.
- Fetches have a 15-second timeout and a 1.5 MB body cap.
- External JSON providers (Nominatim, Overpass) are fixed, hard-coded URLs.

**Limitation:** DNS is checked before the request, then Node resolves again for
the actual connection. A DNS-rebinding attacker could theoretically pass the
check and connect to a private address. For a production multi-tenant
deployment, use a pinned-IP dispatcher or network egress policy. The app is
currently a single-operator local service.

## HTTP hardening

The Express server sends:

- `Content-Security-Policy` with `default-src 'self'`, no remote script origins,
  `frame-ancestors 'none'`, and `base-uri 'none'`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy` disabling camera, microphone, and geolocation
- No `X-Powered-By`

API JSON bodies are capped at 32 KB. POST routes are rate-limited to 8 requests
per minute per IP. Inputs are validated with Zod. React renders all task and
evidence text as text; there is no raw HTML injection.

## Evidence integrity

Website evidence includes a SHA-256 hash of the fetched HTML. The task's
delivery proof records durable write, disk read-back, SSE broadcast count, and
the API path. A task cannot be marked `COMPLETED` if read-back fails.

These controls make tampering detectable, not impossible: an operator with
write access to `data/hq.json` can alter records. Future work should sign task
records or append them to a hash chain if evidence needs legal-grade integrity.

## Data retention

Runtime data lives in `data/hq.json` (gitignored). Screenshots are gitignored by
default; curated evidence images under `docs/evidence/` are committed
deliberately. The store contains business research and source URLs, not
customer personal data. No contact messages or email addresses are collected.

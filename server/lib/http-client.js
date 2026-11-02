import { AppError } from './errors.js';
import { assertPublicHost } from './network-guard.js';

const DEFAULT_MAX_BYTES = 2_500_000;
const DEFAULT_TIMEOUT_MS = 12_000;

function decodeBody(buffer, contentType) {
  const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType ?? '')?.[1]?.toLowerCase();
  const decoder = charset
    ? (() => {
        try {
          return new TextDecoder(charset);
        } catch {
          return new TextDecoder('utf-8');
        }
      })()
    : new TextDecoder('utf-8');
  return decoder.decode(buffer);
}

async function readCapped(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxBytes) {
    throw new AppError('RESPONSE_TOO_LARGE', 'The website response exceeded the inspection size limit.', {
      status: 502,
      recoverable: true
    });
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new AppError('RESPONSE_TOO_LARGE', 'The website response exceeded the inspection size limit.', {
          status: 502,
          recoverable: true
        });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/**
 * Fetch a public web page with redirect re-validation, a body cap and timeouts.
 * Returns the final response even when the status is 4xx/5xx so the audit can
 * report exactly what a real visitor would see.
 */
export async function safeFetch(rawUrl, options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    userAgent = 'DEEMANNIES-AGENT-HQ/2.0 (local research)',
    maxBytes = DEFAULT_MAX_BYTES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRedirects = 3,
    resolver
  } = options;

  let current = new URL(rawUrl);
  const started = performance.now();
  const chain = [];

  for (let redirects = 0; ; redirects += 1) {
    await assertPublicHost(current, resolver);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(current, {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        signal: controller.signal,
        headers: {
          'user-agent': userAgent,
          accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'accept-language': 'en-US,en;q=0.8'
        }
      });
    } catch (error) {
      const timedOut = error?.name === 'AbortError';
      throw new AppError(
        timedOut ? 'FETCH_TIMEOUT' : 'FETCH_FAILED',
        timedOut
          ? `The website did not respond within ${Math.round(timeoutMs / 1000)} seconds.`
          : `Could not reach ${current.hostname}.`,
        { status: 502, recoverable: true, cause: error }
      );
    } finally {
      clearTimeout(timer);
    }

    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      if (redirects >= maxRedirects) {
        throw new AppError('TOO_MANY_REDIRECTS', 'The website redirected too many times.', {
          status: 502,
          recoverable: true
        });
      }
      chain.push(current.href);
      current = new URL(location, current);
      continue;
    }

    const bytes = await readCapped(response, maxBytes);
    const headers = Object.fromEntries(response.headers.entries());
    const contentType = headers['content-type'] ?? '';
    return {
      requestedUrl: rawUrl,
      finalUrl: current.href,
      redirects: chain,
      status: response.status,
      headers,
      contentType,
      body: decodeBody(bytes, contentType),
      bytes: bytes.byteLength,
      elapsedMs: Math.round(performance.now() - started),
      fetchedAt: new Date().toISOString()
    };
  }
}

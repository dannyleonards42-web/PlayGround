import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const RESEARCH_USER_AGENT =
  "AgentHQResearch/2.0 (DEEMANNIE'S DIGITAL; prospect research; +https://github.com/dannyleonards42-web/PlayGround)";

const MAX_BODY_BYTES = 1_500_000;
const MAX_REDIRECTS = 5;

export class FetchSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchSafetyError";
  }
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const parts = address.split(".").map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true;
    return false;
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    ) {
      return true;
    }
    if (normalized.startsWith("::ffff:")) {
      return isPrivateAddress(normalized.slice(7));
    }
    return false;
  }
  return true;
}

async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchSafetyError(`Invalid URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchSafetyError(`Unsupported protocol: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new FetchSafetyError("URLs with embedded credentials are not allowed");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new FetchSafetyError(`Local hostnames are not allowed: ${hostname}`);
  }
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new FetchSafetyError(`Private address is not allowed: ${hostname}`);
    }
    return url;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new FetchSafetyError(`DNS lookup failed for ${hostname}`);
  }
  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new FetchSafetyError(`Host resolves to a non-public address: ${hostname}`);
  }
  return url;
}

async function readCapped(
  response: Response,
  limit: number,
): Promise<{ text: string; bytes: number; truncated: boolean }> {
  if (!response.body) return { text: "", bytes: 0, truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limit) {
      const remaining = Math.max(0, limit - (total - value.byteLength));
      chunks.push(value.subarray(0, remaining));
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const merged = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return {
    text: merged.toString("utf8"),
    bytes: total,
    truncated,
  };
}

export interface SafeFetchResult {
  status: number;
  finalUrl: string;
  headers: Headers;
  bodyText: string;
  bytes: number;
  truncated: boolean;
  responseMs: number;
}

/**
 * Fetches a public HTTP(S) page with redirect validation, a body cap, and a
 * total timeout. Private/local targets are rejected before each hop.
 */
export async function safeFetch(
  rawUrl: string,
  timeoutMs = 15_000,
): Promise<SafeFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    let current = await assertSafeUrl(rawUrl);
    let response: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": RESEARCH_USER_AGENT,
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "accept-language": "en-GB,en;q=0.9",
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) break;
        current = await assertSafeUrl(new URL(location, current).toString());
        continue;
      }
      break;
    }
    if (!response) throw new Error("No response received");
    const contentType = response.headers.get("content-type");
    const isHtml =
      !contentType ||
      /text\/html|application\/xhtml\+xml/i.test(contentType);
    const body = isHtml
      ? await readCapped(response, MAX_BODY_BYTES)
      : { text: "", bytes: 0, truncated: false };
    return {
      status: response.status,
      finalUrl: response.url || current.toString(),
      headers: response.headers,
      bodyText: body.text,
      bytes: body.bytes,
      truncated: body.truncated,
      responseMs: performance.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

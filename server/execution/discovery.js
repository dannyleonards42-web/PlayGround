import { ExecutionError } from '../lib/errors.js';
import { nowIso } from '../lib/ids.js';

const CHAIN_PATTERNS = [
  /\bstarbucks\b/i,
  /\bdunkin\b/i,
  /\bpanera\b/i,
  /\bmcdonald'?s\b/i,
  /\bsubway\b/i,
  /\bgreat harvest\b/i,
  /\binsomnia cookies\b/i,
  /\bnothing bundt cakes\b/i,
  /\bcinnabon\b/i
];

function cleanAddress(displayName) {
  return String(displayName ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}

function normalizeWebsite(value) {
  if (!value) return null;
  let candidate = String(value).trim();
  if (!candidate) return null;
  if (candidate.startsWith('//')) candidate = `https:${candidate}`;
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function isGenericName(name) {
  return !name || /^(bakery|cafe|café|restaurant|coffee shop|the bakery)$/i.test(name.trim());
}

function isChain(name, tags) {
  return Boolean(tags?.brand) || CHAIN_PATTERNS.some((pattern) => pattern.test(name));
}

function normalizeCandidate(item) {
  const tags = item.extratags ?? {};
  const name = String(item.name ?? item.display_name?.split(',')[0] ?? '').trim();
  const websiteUrl = normalizeWebsite(tags.website ?? tags['contact:website'] ?? tags.url ?? tags['website:en']);
  return {
    name,
    category: tags.cuisine ?? item.type ?? 'business',
    location: cleanAddress(item.display_name),
    lat: item.lat ? Number(item.lat) : null,
    lon: item.lon ? Number(item.lon) : null,
    websiteUrl,
    osm: {
      type: item.osm_type ?? null,
      id: item.osm_id ?? null,
      url:
        item.osm_type && item.osm_id
          ? `https://www.openstreetmap.org/${item.osm_type}/${item.osm_id}`
          : null
    },
    tags: {
      brand: tags.brand ?? null,
      openingHours: tags.opening_hours ?? null,
      phone: tags.phone ?? null
    },
    discoveredAt: nowIso()
  };
}

/**
 * Discovery adapter backed by the public OpenStreetMap Nominatim API.
 * It is rate limited to one request per 1.1 seconds as required by the
 * Nominatim usage policy. Results are leads, not independently audited facts.
 */
export function createNominatimDiscovery(options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    userAgent = 'DEEMANNIES-AGENT-HQ/2.0 (local research)',
    endpoint = 'https://nominatim.openstreetmap.org/search',
    minIntervalMs = 1100,
    timeoutMs = 20_000
  } = options;

  let lastRequest = 0;

  async function request(query, limit) {
    const wait = minIntervalMs - (Date.now() - lastRequest);
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();

    const url = new URL(endpoint);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('q', query);
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('extratags', '1');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('accept-language', 'en');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url, {
        headers: {
          'user-agent': userAgent,
          accept: 'application/json',
          'accept-language': 'en-US,en;q=0.8'
        },
        signal: controller.signal
      });
    } catch (error) {
      throw new ExecutionError(
        error?.name === 'AbortError' ? 'DISCOVERY_TIMEOUT' : 'DISCOVERY_UNAVAILABLE',
        error?.name === 'AbortError'
          ? 'OpenStreetMap discovery timed out.'
          : 'OpenStreetMap discovery was unreachable.',
        { recoverable: true, cause: error }
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 429) {
      throw new ExecutionError(
        'DISCOVERY_RATE_LIMITED',
        'OpenStreetMap rate-limited this research run. Wait a minute and retry.',
        { recoverable: true }
      );
    }
    if (!response.ok) {
      throw new ExecutionError(
        'DISCOVERY_REJECTED',
        `OpenStreetMap discovery returned HTTP ${response.status}.`,
        { recoverable: true }
      );
    }
    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw new ExecutionError('DISCOVERY_BAD_RESPONSE', 'OpenStreetMap returned an unreadable response.', {
        recoverable: true,
        cause: error
      });
    }
    if (!Array.isArray(data)) {
      throw new ExecutionError('DISCOVERY_BAD_RESPONSE', 'OpenStreetMap returned an unexpected response.', {
        recoverable: true
      });
    }
    return { data, requestUrl: url.href };
  }

  async function discover({ niche, city, count }) {
    const cleanNiche = niche.trim();
    const cleanCity = city.trim();
    const shortCity = cleanCity.split(',')[0].trim();
    const queries = [...new Set([
      `${cleanNiche} in ${cleanCity}`,
      `${cleanNiche} ${cleanCity}`,
      `${cleanNiche} in ${shortCity}`
    ])];
    const limit = Math.min(20, Math.max(10, count * 4));
    const raw = [];
    const requests = [];
    const rejected = [];

    for (const query of queries) {
      const result = await request(query, limit);
      requests.push({ query, endpoint: result.requestUrl });
      raw.push(...result.data);
      const withWebsite = raw.filter((item) => normalizeWebsite(item.extratags?.website ?? item.extratags?.['contact:website']));
      if (withWebsite.length >= count * 2) break;
    }

    const seen = new Set();
    const candidates = [];
    for (const item of raw) {
      const candidate = normalizeCandidate(item);
      if (isGenericName(candidate.name)) {
        rejected.push({ name: candidate.name || '(unnamed)', reason: 'Generic or missing name' });
        continue;
      }
      if (isChain(candidate.name, item.extratags)) {
        rejected.push({ name: candidate.name, reason: 'Chain or franchise listing' });
        continue;
      }
      const key = candidate.websiteUrl
        ? `site:${new URL(candidate.websiteUrl).hostname.replace(/^www\./, '')}`
        : `name:${candidate.name.toLowerCase()}:${candidate.lat?.toFixed(3)}:${candidate.lon?.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(candidate);
    }

    candidates.sort((a, b) => {
      if (Boolean(a.websiteUrl) !== Boolean(b.websiteUrl)) return a.websiteUrl ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return {
      candidates,
      requests,
      rejected: rejected.slice(0, 12),
      source: 'OpenStreetMap Nominatim',
      fetchedAt: nowIso()
    };
  }

  return { discover, name: 'nominatim' };
}

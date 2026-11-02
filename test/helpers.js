import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';

export function tempDir(t, prefix = 'agent-hq-test-') {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export async function waitFor(check, { timeoutMs = 4000, intervalMs = 15, label = 'condition' } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

export async function json(base, pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, {
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    ...options
  });
  const body = await response.json();
  return { response, body };
}

export async function waitForTask(base, taskId, statuses, options) {
  const expected = new Set(statuses);
  return waitFor(
    async () => {
      const { body } = await json(base, `/api/tasks/${taskId}`);
      return expected.has(body.task?.status) ? body.task : null;
    },
    { ...options, label: `task ${taskId} to reach ${[...expected].join('/')}` }
  );
}

export function samplePage({ name = 'Alpha Bakery', website = 'https://alpha.example/', body, status = 200, headers = {} } = {}) {
  const html =
    body ??
    `<!doctype html><html><head><title>${name} | Portland</title></head><body>
      <h1>${name}</h1><p>Fresh bread in Portland, Oregon.</p>
      <a href="https://instagram.com/alpha">Instagram</a>
      <p>Copyright 2026</p>
    </body></html>`;
  return {
    requestedUrl: website,
    finalUrl: website,
    redirects: [],
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'strict-transport-security': 'max-age=31536000',
      ...headers
    },
    contentType: 'text/html; charset=utf-8',
    body: html,
    bytes: Buffer.byteLength(html),
    elapsedMs: 240,
    fetchedAt: new Date().toISOString()
  };
}

export function sampleCandidates(count = 4) {
  const names = ['Alpha Bakery', 'Beta Bakery', 'Gamma Bakery', 'Delta Bakery', 'Epsilon Bakery'];
  return names.slice(0, count).map((name, index) => ({
    name,
    category: 'bakery',
    location: `${100 + index} Main Street, Portland, Oregon, 9720${index}`,
    lat: 45.5 + index * 0.01,
    lon: -122.6 - index * 0.01,
    websiteUrl: `https://${name.split(' ')[0].toLowerCase()}.example/`,
    osm: { type: 'node', id: 1000 + index, url: `https://www.openstreetmap.org/node/${1000 + index}` },
    tags: { brand: null, openingHours: null, phone: null },
    discoveredAt: new Date().toISOString()
  }));
}

export function fakeDiscovery(candidates = sampleCandidates()) {
  return {
    name: 'fake-discovery',
    async discover() {
      return {
        candidates,
        requests: [{ query: 'bakery in Portland, Oregon', endpoint: 'https://nominatim.example/search' }],
        rejected: [{ name: 'Mega Chain', reason: 'Chain or franchise listing' }],
        source: 'fixture',
        fetchedAt: new Date().toISOString()
      };
    }
  };
}

export async function startTestApp(t, options = {}) {
  const dataDir = tempDir(t);
  const app = createApp({
    dataDir,
    seedPath: null,
    publicDir: path.resolve('public'),
    discovery: options.discovery ?? fakeDiscovery(),
    fetchPage:
      options.fetchPage ??
      (async (url) => samplePage({ name: url.includes('beta') ? 'Beta Bakery' : 'Alpha Bakery', website: url })),
    bridge: options.bridge,
    now: options.now
  });
  const { port } = await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  return { app, base: `http://127.0.0.1:${port}`, dataDir };
}

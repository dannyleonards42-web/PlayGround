import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchProvider } from '../server/execution/research-provider.js';
import { fakeDiscovery, sampleCandidates, samplePage } from './helpers.js';

function provider(fetchPage, candidates = sampleCandidates(4)) {
  return createResearchProvider({
    discovery: fakeDiscovery(candidates),
    fetchPage,
    now: () => new Date('2026-11-02T16:00:00.000Z'),
    sleep: async () => {}
  });
}

test('research returns sourced facts and labelled assumptions without inventing data', async () => {
  const pages = new Map(
    sampleCandidates(4).map((candidate) => [
      candidate.websiteUrl,
      samplePage({
        name: candidate.name,
        website: candidate.websiteUrl,
        body: `<!doctype html><html><head><title>${candidate.name} | Portland</title></head><body>
          <h1>${candidate.name}</h1><p>Fresh bread in Portland, Oregon.</p>
          <a href="https://instagram.com/${candidate.name.split(' ')[0].toLowerCase()}">Instagram</a>
          <p>Copyright 2026</p>
        </body></html>`
      })
    ])
  );

  const research = provider(async (url) => pages.get(url));
  const progress = [];
  const result = await research.execute(
    { id: 'tsk_test', input: { niche: 'bakery', city: 'Portland, Oregon', count: 3, requestedBy: 'test' } },
    { reportProgress: (phase, percent, message) => progress.push({ phase, percent, message }) }
  );

  assert.equal(result.assignment.requestedCount, 3);
  assert.equal(result.assignment.returnedCount, 3);
  assert.equal(result.prospects.length, 3);
  assert.ok(progress.some((entry) => entry.phase === 'DISCOVERING'));
  assert.ok(progress.some((entry) => entry.phase === 'DELIVERING'));

  for (const prospect of result.prospects) {
    assert.ok(prospect.name);
    assert.ok(prospect.location.includes('Portland'));
    assert.ok(prospect.website.verified);
    assert.equal(prospect.website.status, 200);
    assert.ok(prospect.facts.length >= 5);
    assert.ok(prospect.facts.every((fact) => fact.type === 'verified'));
    assert.ok(prospect.facts.every((fact) => fact.source?.url));
    assert.ok(prospect.facts.every((fact) => fact.observedAt));
    assert.ok(prospect.facts.every((fact) => fact.method));
    assert.ok(prospect.assumptions.length >= 1);
    assert.ok(prospect.assumptions.every((assumption) => assumption.type === 'assumption'));
    const factIds = new Set(prospect.facts.map((fact) => fact.id));
    for (const assumption of prospect.assumptions) {
      for (const basis of assumption.basis) assert.ok(factIds.has(basis), `missing basis ${basis}`);
    }
    assert.ok(prospect.researchedAt);
    assert.ok(prospect.sources.includes(prospect.osm.url));
  }

  assert.ok(result.methodology.length >= 4);
  assert.ok(result.limitations.some((item) => /JavaScript-rendered/.test(item)));
  assert.ok(result.limitations.some((item) => /No customer was contacted/.test(item)));
  assert.equal(result.screening.candidateCount, 4);
});

test('verification label does not claim a location cross-check when the page never mentions the city', async () => {
  const candidates = sampleCandidates(1);
  const research = provider(
    async (url) =>
      samplePage({
        name: 'Alpha Bakery',
        website: url,
        body: '<html><head><title>Alpha Bakery</title><meta name="viewport" content="width=device-width"></head><body><h1>Alpha Bakery</h1><p>Bread and pastry.</p></body></html>'
      }),
    candidates
  );

  const result = await research.execute(
    { id: 'tsk_label', input: { niche: 'bakery', city: 'Portland, Oregon', count: 1 } },
    { reportProgress: () => {} }
  );
  const prospect = result.prospects[0];
  assert.equal(prospect.verification.status, 'VERIFIED');
  assert.equal(prospect.verification.location, 'SOURCE_LISTED');
  assert.match(prospect.verification.label, /location is from the source listing only/);
  assert.doesNotMatch(prospect.verification.label, /location and live website/);
});

test('a blocked or unreachable website is reported honestly, not treated as a quality finding', async () => {
  const candidates = sampleCandidates(3);
  candidates[0].websiteUrl = 'https://alpha.example/';
  candidates[1].websiteUrl = 'https://beta.example/';
  candidates[2].websiteUrl = 'https://gamma.example/';
  const research = provider(async (url) => {
    if (url.includes('alpha')) {
      const error = new Error('The website did not respond within 12 seconds.');
      error.code = 'FETCH_TIMEOUT';
      throw error;
    }
    return samplePage({ name: 'Beta Bakery', website: url, status: 403, body: '<title>Just a moment...</title>' });
  }, candidates);

  const result = await research.execute(
    { id: 'tsk_blocked', input: { niche: 'bakery', city: 'Portland, Oregon', count: 3 } },
    { reportProgress: () => {} }
  );

  assert.equal(result.prospects.length, 3);
  assert.equal(result.screening.verifiedCount, 0);
  for (const prospect of result.prospects) {
    assert.equal(prospect.verification.status, 'PARTIAL');
    assert.equal(prospect.verification.website === 'VERIFIED', false);
    assert.equal(prospect.opportunity.priority, 'REVIEW');
    assert.equal(prospect.opportunity.score, 0);
    assert.ok(prospect.assumptions.some((entry) => /manual/i.test(entry.statement)));
    assert.ok(prospect.facts.some((fact) => /HTTP 403|could not be reached/i.test(fact.statement)));
  }
});

test('research fails explicitly when discovery returns no candidates', async () => {
  const research = provider(async () => samplePage(), []);
  await assert.rejects(
    () =>
      research.execute(
        { id: 'tsk_empty', input: { niche: 'bakery', city: 'Nowhere', count: 3 } },
        { reportProgress: () => {} }
      ),
    (error) => error.code === 'NO_CANDIDATES'
  );
});

test('ranking selects the three highest-opportunity verified prospects', async () => {
  const candidates = sampleCandidates(5);
  const research = provider(async (url) => {
    if (url.includes('alpha')) {
      return samplePage({
        name: 'Alpha Bakery',
        website: url,
        body: '<html><head><title>Alpha Bakery</title><meta name="description" content="Good site"><meta name="viewport" content="width=device-width"><link rel="canonical" href="https://alpha.example"><script type="application/ld+json">{"@type":"Bakery"}</script></head><body>Portland <a href="mailto:a@example.com">email</a> <a href="tel:555">call</a> <a href="/menu">Menu</a> Order online. Copyright 2026</body></html>'
      });
    }
    return samplePage({
      name: 'Weak Bakery',
      website: url,
      body: '<html><head><title>Weak Bakery</title><meta name="viewport" content="width=device-width"></head><body>Portland Copyright 2020</body></html>',
      headers: { 'strict-transport-security': 'max-age=0' }
    });
  }, candidates);

  const result = await research.execute(
    { id: 'tsk_rank', input: { niche: 'bakery', city: 'Portland, Oregon', count: 3 } },
    { reportProgress: () => {} }
  );
  assert.equal(result.prospects.length, 3);
  assert.equal(result.prospects[0].name, 'Alpha Bakery');
  assert.ok(result.prospects.slice(1).every((prospect) => prospect.opportunity.priority !== 'NURTURE'));
});

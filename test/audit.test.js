import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHtml } from '../server/execution/html-analyzer.js';
import { auditWebsite } from '../server/execution/site-audit.js';
import { samplePage } from './helpers.js';

const business = { name: 'Alpha Bakery', city: 'Portland, Oregon', websiteUrl: 'https://alpha.example/' };

test('HTML analyzer extracts observable signals without executing JavaScript', () => {
  const analysis = analyzeHtml(
    `<!doctype html><html><head>
      <title>Alpha Bakery &amp; Co.</title>
      <meta name="viewport" content="width=device-width">
      <meta property="og:site_name" content="Alpha">
      <link rel="canonical" href="https://alpha.example/">
      <script type="application/ld+json">{"@type":"Bakery","name":"Alpha"}</script>
    </head><body>
      <a href="https://instagram.com/alpha">Instagram</a>
      <a href="tel:555-0100">Call</a>
      <a href="mailto:hello@alpha.example">Email</a>
      <a href="/menu">Our menu</a>
      <form><input type="email" name="email"><textarea name="message"></textarea></form>
      <p>Order online for pickup. Copyright 2024.</p>
    </body></html>`,
    { 'strict-transport-security': 'max-age=31536000' }
  );
  assert.equal(analysis.title, 'Alpha Bakery & Co.');
  assert.equal(analysis.viewport, true);
  assert.equal(analysis.hsts, true);
  assert.deepEqual(analysis.social, ['Instagram']);
  assert.equal(analysis.phone, true);
  assert.equal(analysis.email, true);
  assert.equal(analysis.hasContactForm, true);
  assert.equal(analysis.ordering, true);
  assert.equal(analysis.menuLink, true);
  assert.equal(analysis.hasLocalBusinessSchema, true);
  assert.equal(analysis.copyrightYear, 2024);
});

test('audit creates facts with sources and separates assumptions for a live site', () => {
  const page = samplePage({
    name: 'Alpha Bakery',
    website: 'https://alpha.example/',
    body: '<html><head><title>Alpha Bakery</title></head><body>Portland <p>Copyright 2020</p></body></html>',
    headers: { 'strict-transport-security': 'max-age=0' }
  });
  const result = auditWebsite(business, page, { factPrefix: 'p1' });
  assert.equal(result.verified, true);
  assert.equal(result.website.identityMatch, true);
  assert.equal(result.website.locationMatch, true);
  assert.equal(result.state, 'VERIFIED');
  assert.equal(result.priority, 'HOT');
  assert.ok(result.facts.length > 8);
  assert.ok(result.facts.every((fact) => fact.type === 'verified'));
  assert.ok(result.facts.every((fact) => fact.source.url && fact.observedAt));
  assert.ok(result.opportunity.signals.some((signal) => signal.label === 'Missing meta description'));
  assert.ok(result.assumptions.every((entry) => entry.type === 'assumption'));
  assert.ok(result.facts.some((fact) => /No meta description/.test(fact.statement)));
});

test('a 403 challenge is reported as blocked instead of being judged on content', () => {
  const page = samplePage({
    name: 'Alpha Bakery',
    website: 'https://alpha.example/',
    status: 403,
    body: '<html><head><title>Just a moment...</title></head><body>Checking your browser</body></html>'
  });
  const result = auditWebsite(business, page, { factPrefix: 'p2' });
  assert.equal(result.verified, false);
  assert.equal(result.state, 'BLOCKED');
  assert.equal(result.priority, 'REVIEW');
  assert.equal(result.website.verified, false);
  assert.equal(result.opportunity.score, 0);
  assert.ok(result.facts.some((fact) => /HTTP 403/.test(fact.statement)));
  assert.ok(result.assumptions.some((entry) => /manual/i.test(entry.statement)));
});

test('a network failure is explicit and never converted into a site-quality claim', () => {
  const result = auditWebsite(
    business,
    { requestedUrl: 'https://alpha.example/', error: { message: 'Could not reach alpha.example.' }, fetchedAt: new Date().toISOString() },
    { factPrefix: 'p3' }
  );
  assert.equal(result.verified, false);
  assert.equal(result.state, 'UNREACHABLE');
  assert.equal(result.priority, 'REVIEW');
  assert.equal(result.checks, null);
  assert.ok(result.facts[0].statement.includes('could not be reached'));
  assert.ok(result.assumptions.length >= 1);
  assert.ok(!result.facts.some((fact) => /meta description|payload/i.test(fact.statement)));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicHost, assertSafeUrl, isPrivateIp } from '../server/lib/network-guard.js';
import { safeFetch } from '../server/lib/http-client.js';

test('private and reserved IP ranges are blocked', () => {
  for (const ip of [
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fd00::1',
    'ff02::1',
    '::ffff:127.0.0.1'
  ]) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111']) {
    assert.equal(isPrivateIp(ip), false, ip);
  }
});

test('unsafe URL schemes, credentials and local addresses are rejected', () => {
  for (const url of [
    'file:///etc/passwd',
    'http://localhost/',
    'http://127.0.0.1:6379/',
    'http://[::1]/',
    'http://169.254.169.254/latest/meta-data/',
    'http://user:pass@example.com/',
    'http://example.com:8080/',
    'http://something.local/'
  ]) {
    assert.throws(() => assertSafeUrl(url), /public|Local|credentials|standard web ports|not valid/i, url);
  }
  assert.equal(assertSafeUrl('https://example.com/path').hostname, 'example.com');
});

test('hostnames that resolve to private addresses are rejected', async () => {
  await assert.rejects(
    () => assertPublicHost(new URL('https://example.com/'), async () => [{ address: '10.0.0.7', family: 4 }]),
    /private network/i
  );
  const safe = await assertPublicHost(new URL('https://example.com/'), async () => [
    { address: '93.184.216.34', family: 4 }
  ]);
  assert.equal(safe.hostname, 'example.com');
});

test('safeFetch refuses to call fetch for a private address', async () => {
  let called = false;
  await assert.rejects(
    () =>
      safeFetch('http://127.0.0.1/private', {
        fetchImpl: async () => {
          called = true;
          return new Response('no');
        }
      }),
    /private network|Local/i
  );
  assert.equal(called, false);
});

test('safeFetch follows a public redirect once and reports the final URL', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url.href);
    if (url.href === 'https://example.com/start') {
      return new Response(null, { status: 301, headers: { location: 'https://example.com/final' } });
    }
    return new Response('<html><title>Final</title></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' }
    });
  };
  const page = await safeFetch('https://example.com/start', {
    fetchImpl,
    resolver: async () => [{ address: '93.184.216.34', family: 4 }]
  });
  assert.equal(page.status, 200);
  assert.equal(page.finalUrl, 'https://example.com/final');
  assert.equal(page.redirects.length, 1);
  assert.match(page.body, /Final/);
  assert.deepEqual(calls, ['https://example.com/start', 'https://example.com/final']);
});

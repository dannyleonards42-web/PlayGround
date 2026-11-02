import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { AppError } from './errors.js';

const BLOCKED_HOST_SUFFIXES = ['.local', '.internal', '.localhost', '.home.arpa'];
const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'metadata.azure.internal',
  'instance-data'
]);

function ipv4IsPrivate(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && (parts[2] === 0 || parts[2] === 2)) return true;
  if (a === 192 && b === 88 && parts[2] === 99) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  if (a >= 224) return true;
  return false;
}

export function isPrivateIp(input) {
  if (typeof input !== 'string') return true;
  const ip = input.trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  const version = net.isIP(ip);
  if (version === 4) return ipv4IsPrivate(ip);
  if (version !== 6) return true;

  if (ip === '::1' || ip === '::') return true;
  if (ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')) return true;
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true;
  if (ip.startsWith('ff')) return true;
  if (ip.startsWith('2001:db8')) return true;
  if (ip.startsWith('fec')) return true;

  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4IsPrivate(mapped[1]);

  return false;
}

export function assertSafeUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AppError('INVALID_URL', 'The website URL is not valid.', { status: 400, recoverable: true });
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new AppError('UNSAFE_URL', 'Only public http and https websites may be inspected.', {
      status: 400,
      recoverable: true
    });
  }
  if (url.username || url.password) {
    throw new AppError('UNSAFE_URL', 'Website URLs containing credentials are not allowed.', {
      status: 400,
      recoverable: true
    });
  }
  if (!['80', '443'].includes(url.port) && url.port !== '') {
    throw new AppError('UNSAFE_URL', 'Only standard web ports may be inspected.', {
      status: 400,
      recoverable: true
    });
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (!host || BLOCKED_HOSTS.has(host) || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new AppError('UNSAFE_URL', 'Local and private network addresses cannot be inspected.', {
      status: 400,
      recoverable: true
    });
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) {
      throw new AppError('UNSAFE_URL', 'Local and private network addresses cannot be inspected.', {
        status: 400,
        recoverable: true
      });
    }
    return url;
  }
  return url;
}

export async function assertPublicHost(url, resolver = lookup) {
  const safeUrl = assertSafeUrl(url.href);
  let addresses;
  try {
    addresses = await resolver(safeUrl.hostname, { all: true, verbatim: true });
  } catch (error) {
    throw new AppError('DNS_FAILED', `Could not resolve ${safeUrl.hostname}.`, {
      status: 502,
      recoverable: true,
      cause: error
    });
  }
  if (!addresses.length) {
    throw new AppError('DNS_FAILED', `No addresses were returned for ${safeUrl.hostname}.`, {
      status: 502,
      recoverable: true
    });
  }
  if (addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new AppError('UNSAFE_URL', 'This hostname resolves to a private network address.', {
      status: 400,
      recoverable: true
    });
  }
  return safeUrl;
}

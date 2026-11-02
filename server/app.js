import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createExecutionBridge } from './execution/bridge.js';
import { createNominatimDiscovery } from './execution/discovery.js';
import { createOutreachProvider } from './execution/outreach-provider.js';
import { createResearchProvider } from './execution/research-provider.js';
import { safeFetch } from './lib/http-client.js';
import { AppError, ValidationError, statusForError, toPublicError } from './lib/errors.js';
import { log } from './lib/log.js';
import { Store } from './store.js';
import { createTaskService } from './task-service.js';
import { validateApprovalDecision } from './validation.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readJsonBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new AppError('BODY_TOO_LARGE', 'Request body is too large.', { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) {
        reject(new ValidationError('A JSON request body is required.'));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new ValidationError('Request body must be valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname, publicDir) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    sendJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } });
    return;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    sendJson(res, 400, { error: { code: 'BAD_PATH', message: 'Invalid request path.' } });
    return;
  }
  if (decoded.includes('\0')) {
    sendJson(res, 400, { error: { code: 'BAD_PATH', message: 'Invalid request path.' } });
    return;
  }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const file = path.resolve(publicDir, relative);
  if (file !== publicDir && !file.startsWith(publicDir + path.sep)) {
    sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found.' } });
    return;
  }
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found.' } });
    return;
  }
  if (!stat.isFile()) {
    sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found.' } });
    return;
  }
  const body = fs.readFileSync(file);
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-cache'
  });
  if (req.method === 'HEAD') res.end();
  else res.end(body);
}

export function createApp(options = {}) {
  const {
    dataDir,
    seedPath = null,
    publicDir,
    discovery,
    fetchPage,
    bridge: injectedBridge,
    now = () => new Date().toISOString(),
    logger = log
  } = options;

  if (!dataDir) throw new Error('createApp requires dataDir.');
  if (!publicDir) throw new Error('createApp requires publicDir.');

  const store = new Store({ dataDir, seedPath });
  const researchProvider = createResearchProvider({
    discovery:
      discovery ??
      createNominatimDiscovery({
        userAgent: options.userAgent
      }),
    fetchPage: fetchPage ?? ((url) => safeFetch(url, { userAgent: options.userAgent })),
    now: typeof now === 'function' ? () => new Date(now()) : () => new Date()
  });
  const outreachProvider = createOutreachProvider({ store, now });
  const bridge =
    injectedBridge ??
    createExecutionBridge({
      providers: {
        prospect_research: researchProvider,
        outreach_draft: outreachProvider
      }
    });
  const taskService = createTaskService({ store, bridge, logger });
  taskService.recover();

  const sseClients = new Set();
  const rate = new Map();
  const startedAt = Date.now();
  const unsubscribe = store.subscribe((event) => {
    for (const client of sseClients) {
      client.write(`event: update\ndata: ${JSON.stringify(event)}\n\n`);
    }
  });

  function allowWrite(ip) {
    const windowMs = 60_000;
    const limit = 30;
    const nowMs = Date.now();
    const current = rate.get(ip);
    if (!current || nowMs - current.start > windowMs) {
      rate.set(ip, { start: nowMs, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= limit;
  }

  async function handleApi(req, res, url) {
    const pathname = url.pathname;

    if (req.method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        version: '2.0.0',
        now: new Date().toISOString(),
        uptimeMs: Date.now() - startedAt,
        bridge: bridge.list(),
        storage: 'Local atomic JSON store',
        execution: 'OpenStreetMap discovery + direct HTTP homepage inspection',
        outbound: 'LOCKED — no email, publishing or spending',
        seeded: store.snapshot().meta.seeded
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/state') {
      sendJson(res, 200, store.publicSnapshot());
      return;
    }

    if (req.method === 'GET' && pathname === '/api/tasks') {
      sendJson(res, 200, { tasks: store.snapshot().tasks, revision: store.snapshot().revision });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/tasks') {
      const ip = req.socket.remoteAddress ?? 'unknown';
      if (!allowWrite(ip)) {
        sendJson(res, 429, {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many task submissions. Wait a minute and retry.',
            recoverable: true
          }
        });
        return;
      }
      const body = await readJsonBody(req);
      const task = taskService.submit(body);
      sendJson(res, 202, { task });
      return;
    }

    const taskMatch = /^\/api\/tasks\/(tsk_[a-f0-9]{12})(\/retry)?$/.exec(pathname);
    if (taskMatch) {
      const taskId = taskMatch[1];
      if (req.method === 'GET' && !taskMatch[2]) {
        const task = store.getTask(taskId);
        if (!task) {
          sendJson(res, 404, { error: { code: 'TASK_NOT_FOUND', message: 'Task not found.' } });
          return;
        }
        sendJson(res, 200, { task });
        return;
      }
      if (req.method === 'POST' && taskMatch[2]) {
        const task = taskService.retry(taskId);
        if (!task) {
          sendJson(res, 404, { error: { code: 'TASK_NOT_FOUND', message: 'Task not found.' } });
          return;
        }
        sendJson(res, 202, { task });
        return;
      }
    }

    if (req.method === 'GET' && pathname === '/api/approvals') {
      sendJson(res, 200, { approvals: store.snapshot().approvals });
      return;
    }

    const approvalMatch = /^\/api\/approvals\/(apr_[a-f0-9]{12})\/decision$/.exec(pathname);
    if (req.method === 'POST' && approvalMatch) {
      const body = await readJsonBody(req);
      const decision = validateApprovalDecision(body);
      let approval;
      try {
        approval = store.decideApproval(approvalMatch[1], decision);
      } catch (error) {
        throw new AppError('APPROVAL_ALREADY_DECIDED', error.message, { status: 409 });
      }
      if (!approval) {
        sendJson(res, 404, { error: { code: 'APPROVAL_NOT_FOUND', message: 'Approval not found.' } });
        return;
      }
      sendJson(res, 200, { approval });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/events') {
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.write(`retry: 3000\n`);
      res.write(`event: ready\ndata: ${JSON.stringify({ revision: store.snapshot().revision })}\n\n`);
      sseClients.add(res);
      const heartbeat = setInterval(() => {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      }, 20_000);
      heartbeat.unref?.();
      req.on('close', () => {
        clearInterval(heartbeat);
        sseClients.delete(res);
      });
      return;
    }

    sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'API route not found.' } });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    try {
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url);
      } else {
        serveStatic(req, res, url.pathname, publicDir);
      }
    } catch (error) {
      const payload = toPublicError(error);
      logger.error('http.request_failed', {
        path: url.pathname,
        code: payload.code,
        message: payload.message
      });
      if (res.headersSent) {
        res.destroy();
        return;
      }
      sendJson(res, statusForError(error), { error: payload });
    }
  });

  function listen(port = 0, host = '127.0.0.1') {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolve({ server, port: server.address().port, host });
      });
    });
  }

  function close() {
    unsubscribe();
    for (const client of sseClients) client.end();
    sseClients.clear();
    return new Promise((resolve) => {
      if (!server.listening) return resolve();
      server.close(() => resolve());
    });
  }

  return { server, store, taskService, bridge, researchProvider, listen, close, publicDir };
}

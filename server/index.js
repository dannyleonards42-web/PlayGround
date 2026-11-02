import { pathToFileURL } from 'node:url';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { log } from './lib/log.js';

export async function startServer(overrides = {}) {
  const config = readConfig(overrides);
  const app = createApp({
    dataDir: config.dataDir,
    seedPath: config.seedPath,
    publicDir: config.publicDir,
    userAgent: config.userAgent
  });
  const { port, host } = await app.listen(config.port, config.host);
  log.info('server.started', {
    port,
    host,
    seeded: app.store.snapshot().meta.seeded,
    tasks: app.store.snapshot().tasks.length
  });
  return { ...app, port, host, config };
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
  const running = await startServer();
  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    log.info('server.stopping', { signal });
    await running.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

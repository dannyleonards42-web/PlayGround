import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, '..');

export function readConfig(overrides = {}) {
  return {
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? '0.0.0.0',
    dataDir: path.resolve(process.env.DATA_DIR ?? path.join(ROOT_DIR, 'data')),
    publicDir: path.resolve(process.env.PUBLIC_DIR ?? path.join(ROOT_DIR, 'public')),
    seedPath:
      process.env.SEED_STATE === 'off'
        ? null
        : path.resolve(process.env.SEED_STATE ?? path.join(ROOT_DIR, 'data', 'seed-state.json')),
    version: '2.0.0',
    userAgent:
      process.env.RESEARCH_USER_AGENT ??
      'DEEMANNIES-AGENT-HQ/2.0 (local research; https://github.com/dannyleonards42-web/PlayGround)',
    ...overrides
  };
}

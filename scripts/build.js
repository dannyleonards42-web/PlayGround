import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const dist = path.join(root, 'dist');

function copyDir(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const name of fs.readdirSync(source)) {
    const from = path.join(source, name);
    const to = path.join(target, name);
    const stat = fs.statSync(from);
    if (stat.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function hashTree(dir) {
  const hash = createHash('sha256');
  const walk = (current) => {
    for (const name of fs.readdirSync(current).sort()) {
      const full = path.join(current, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else {
        hash.update(path.relative(dir, full));
        hash.update(fs.readFileSync(full));
      }
    }
  };
  walk(dir);
  return hash.digest('hex');
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
copyDir(path.join(root, 'public'), path.join(dist, 'public'));
copyDir(path.join(root, 'server'), path.join(dist, 'server'));
fs.copyFileSync(path.join(root, 'package.json'), path.join(dist, 'package.json'));
if (fs.existsSync(path.join(root, 'README.md'))) fs.copyFileSync(path.join(root, 'README.md'), path.join(dist, 'README.md'));
fs.mkdirSync(path.join(dist, 'data'), { recursive: true });
if (fs.existsSync(path.join(root, 'data', 'seed-state.json'))) {
  fs.copyFileSync(path.join(root, 'data', 'seed-state.json'), path.join(dist, 'data', 'seed-state.json'));
}

let commit = 'unknown';
try {
  commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
} catch {
  commit = 'unavailable';
}

const manifest = {
  name: 'agent-hq',
  version: '2.0.0',
  builtAt: new Date().toISOString(),
  commit,
  entrypoint: 'server/index.js',
  staticDir: 'public',
  seed: fs.existsSync(path.join(dist, 'data', 'seed-state.json')),
  hash: hashTree(dist)
};
fs.writeFileSync(path.join(dist, 'build-manifest.json'), JSON.stringify(manifest, null, 2));
fs.writeFileSync(
  path.join(dist, 'README-DEPLOY.md'),
  [
    '# AGENT HQ production bundle',
    '',
    'Run `node server/index.js` from this directory.',
    '',
    `- Build: ${manifest.builtAt}`,
    `- Commit: ${commit}`,
    `- Seed archive: ${manifest.seed ? 'included' : 'not included'}`,
    '- Set `PORT` to choose a port, `DATA_DIR` to choose writable storage.',
    '- Outbound email, publishing and spending are not implemented.',
    ''
  ].join('\n')
);

console.log(`BUILD OK — dist/ (${manifest.hash.slice(0, 16)}), commit ${commit}, seed ${manifest.seed}.`);

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const errors = [];

function walk(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const stat = statSync(full);
    if (stat.isDirectory()) entries.push(...walk(full));
    else entries.push(full);
  }
  return entries;
}

const files = walk(root);
const js = files.filter((file) => file.endsWith('.js') || file.endsWith('.mjs'));
for (const file of js) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    errors.push(`${path.relative(root, file)}: ${error.stderr?.toString().trim() || error.message}`);
  }
}

const required = [
  'package.json',
  'server/index.js',
  'server/app.js',
  'server/store.js',
  'server/task-service.js',
  'server/execution/bridge.js',
  'server/execution/research-provider.js',
  'server/execution/discovery.js',
  'server/execution/site-audit.js',
  'public/index.html',
  'public/styles.css',
  'public/app.js'
];
for (const file of required) {
  if (!existsSync(path.join(root, file))) errors.push(`Missing required file: ${file}`);
}

const html = readFileSync(path.join(root, 'public/index.html'), 'utf8');
if (/<script(?![^>]*src=)/i.test(html)) errors.push('public/index.html contains an inline script (CSP incompatible).');
if (!html.includes('id="research-form"')) errors.push('The assignment form is missing.');

const appJs = readFileSync(path.join(root, 'public/app.js'), 'utf8');
if (/innerHTML\s*=/.test(appJs)) errors.push('public/app.js uses innerHTML; user data must be rendered with textContent.');
if (/OPENROUTER|OPENAI|API_KEY|SECRET/.test(appJs)) errors.push('public/app.js may reference credentials.');

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const script of ['start', 'test', 'build']) {
  if (!pkg.scripts?.[script]) errors.push(`package.json is missing the ${script} script.`);
}

if (errors.length) {
  console.error('CHECK FAILED');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`CHECK OK — ${js.length} JavaScript files parsed, required surface present, no inline scripts or innerHTML.`);

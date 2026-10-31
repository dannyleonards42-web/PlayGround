#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

PROJECT_DIR="$(pwd -P)"
PORT="${PORT:-3000}"
: "${OPENCODE_WEB_DIR:?OPENCODE_WEB_DIR must be set}"

[[ "$PORT" =~ ^[0-9]+$ ]] || { echo "PORT must be numeric: $PORT" >&2; exit 1; }

run() {
  /usr/bin/time -p "$@"
}

echo "==> Project: $PROJECT_DIR"
echo "==> Port: $PORT"

if [[ -f package.json ]]; then
  if [[ -f package-lock.json ]]; then
    run npm ci --no-audit --no-fund
  else
    run npm install --no-audit --no-fund
  fi
fi

DEPLOY_DIR="$PROJECT_DIR"
if [[ -f package.json ]] && node -e 'const p=require("./package.json"); process.exit(p.scripts && p.scripts.build ? 0 : 1)'; then
  echo "==> Building static output"
  run npm run build -- --base ./
  DEPLOY_DIR="$PROJECT_DIR/dist"
fi

[[ -f "$DEPLOY_DIR/index.html" ]] || {
  echo "Deployment output is missing index.html: $DEPLOY_DIR" >&2
  exit 1
}

echo "==> Declaring deployment output"
run node -e '
const fs = require("fs");
const path = require("path");
const project = process.argv[1];
const directory = process.argv[2];
fs.mkdirSync(process.env.OPENCODE_WEB_DIR, { recursive: true });
fs.writeFileSync(
  path.join(process.env.OPENCODE_WEB_DIR, "deployment-output.json"),
  JSON.stringify({ project, directory })
);
' "$PROJECT_DIR" "$DEPLOY_DIR"

echo "==> Serving $DEPLOY_DIR on 0.0.0.0:$PORT"
run python3 -m http.server "$PORT" --bind 0.0.0.0 --directory "$DEPLOY_DIR"

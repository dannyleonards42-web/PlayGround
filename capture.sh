#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

: "${CAPTURE_URL:?CAPTURE_URL must be set}"
: "${CAPTURE_DIR:?CAPTURE_DIR must be set}"
: "${RUNTIME_DIR:?RUNTIME_DIR must be set}"

PROJECT_DIR="$(pwd -P)"
CAPTURE_DIR="$(realpath -m "$CAPTURE_DIR")"

case "$CAPTURE_DIR" in
  "$PROJECT_DIR"|"$PROJECT_DIR"/*)
    echo "CAPTURE_DIR must be outside the project source: $CAPTURE_DIR" >&2
    exit 1
    ;;
esac

run() {
  /usr/bin/time -p "$@"
}

run mkdir -p "$CAPTURE_DIR"
echo "==> Capturing: $CAPTURE_URL"
echo "==> Output: $CAPTURE_DIR"

export CAPTURE_STRICT="${CAPTURE_STRICT:-1}"
run node "$RUNTIME_DIR/scripts/default-capture.mjs"

run test -s "$CAPTURE_DIR/final-desktop.png"
run test -s "$CAPTURE_DIR/final-mobile.png"
echo "==> Captured final-desktop.png and final-mobile.png"

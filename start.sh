#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# AGENT HQ needs its Node API for real execution and persisted task state.
# The default OMGithub static server cannot serve /api, so the project
# intentionally starts its own zero-dependency server here.
exec node server/index.js

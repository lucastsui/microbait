#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

node --test tests/*.test.js
METRIC="$(node eval/run.js)"

echo "METRIC=$METRIC"

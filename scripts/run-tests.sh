#!/usr/bin/env bash
# Run the project's checked-in regression tests with Node's built-in
# test runner via tsx. Honors path aliases (@/...) and JSX via tests/tsconfig.json.
#
# Usage:  scripts/run-tests.sh [extra args, e.g. tests/foo.test.ts]
set -euo pipefail

cd "$(dirname "$0")/.."

if [ "$#" -gt 0 ]; then
  exec npx tsx --tsconfig tests/tsconfig.json --test "$@"
else
  exec npx tsx --tsconfig tests/tsconfig.json --test tests/*.test.ts
fi

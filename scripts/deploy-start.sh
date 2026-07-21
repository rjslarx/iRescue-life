#!/bin/bash

# NOTE: We intentionally do NOT run `drizzle-kit push` here. It reliably hangs
# against the live Neon pool on this project and saturates DB connections,
# causing deployment healthchecks on / to return 500 and the publish to fail.
# Schema changes are applied via idempotent SQL ALTERs (see scripts/post-merge.sh).

echo "Starting production server..."
NODE_ENV=production exec node dist/index.js

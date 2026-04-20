#!/bin/bash
set -e
npm install
# drizzle-kit push occasionally prompts when it can't tell whether a new column
# is a "create" or a "rename" of an existing one. The default highlighted
# option is always "create column" (the safe choice for additive schema
# changes), so feed empty newlines to auto-accept defaults and avoid hangs.
yes "" | npx drizzle-kit push --force

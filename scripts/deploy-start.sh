#!/bin/bash

echo "Starting production server..."

echo "Pushing database schema..."
timeout 60 npx drizzle-kit push --force 2>&1
DB_RESULT=$?

if [ $DB_RESULT -eq 0 ]; then
  echo "Database schema pushed successfully"
elif [ $DB_RESULT -eq 124 ]; then
  echo "Warning: Database schema push timed out after 60s, continuing..."
else
  echo "Warning: Database schema push failed (exit $DB_RESULT), continuing..."
fi

echo "Seeding database..."
timeout 30 npx tsx server/seed.ts 2>&1
SEED_RESULT=$?

if [ $SEED_RESULT -eq 0 ]; then
  echo "Database seeding complete"
elif [ $SEED_RESULT -eq 124 ]; then
  echo "Warning: Database seeding timed out after 30s, continuing..."
else
  echo "Warning: Database seeding skipped (exit $SEED_RESULT)"
fi

echo "Starting Node.js server..."
NODE_ENV=production exec node dist/index.js

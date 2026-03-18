#!/bin/bash

echo "Starting production server immediately..."
NODE_ENV=production node dist/index.js &
SERVER_PID=$!

echo "Waiting for server to open port 5000..."
for i in $(seq 1 30); do
  if nc -z localhost 5000 2>/dev/null; then
    echo "Server is listening on port 5000"
    break
  fi
  sleep 1
done

echo "Running database schema push in background..."
timeout 45 npx drizzle-kit push --force 2>&1 &
DB_PID=$!

wait $DB_PID 2>/dev/null
DB_RESULT=$?
if [ $DB_RESULT -eq 0 ]; then
  echo "Database schema pushed successfully"
else
  echo "Warning: Database schema push exited with code $DB_RESULT, continuing..."
fi

wait $SERVER_PID

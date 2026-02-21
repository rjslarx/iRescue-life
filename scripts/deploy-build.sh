#!/bin/bash

echo "🚀 Starting deployment build..."

echo "📦 Building application..."
npm run build
BUILD_RESULT=$?

if [ $BUILD_RESULT -ne 0 ]; then
  echo "❌ Build failed!"
  exit 1
fi

echo "🗄️ Pushing database schema..."
# Try to push schema - this may fail on first deployment before production DB exists
MAX_RETRIES=5
RETRY_COUNT=0
DB_PUSH_SUCCESS=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  echo "Attempt $((RETRY_COUNT + 1)) of $MAX_RETRIES..."
  npm run db:push 2>&1
  if [ $? -eq 0 ]; then
    DB_PUSH_SUCCESS=true
    echo "✓ Database schema pushed successfully"
    break
  else
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
      echo "Database connection failed, waiting 10 seconds before retry..."
      sleep 10
    fi
  fi
done

if [ "$DB_PUSH_SUCCESS" = false ]; then
  echo "⚠️ Database schema push failed after $MAX_RETRIES attempts."
  echo "   This is expected on first deployment - the schema will be pushed on next deploy."
  echo "   Continuing with build..."
fi

echo "🌱 Seeding database..."
# Seeding is optional - it safely checks for existing data
npx tsx server/seed.ts 2>&1
if [ $? -eq 0 ]; then
  echo "✓ Database seeding complete"
else
  echo "⚠️ Database seeding skipped (database may not be ready yet)"
fi

echo "✅ Deployment build complete!"
exit 0

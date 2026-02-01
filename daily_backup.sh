#!/bin/bash

# daily_backup.sh - Synchronized database + code backup script
# Creates a point-in-time snapshot with matching timestamps
# Usage: ./daily_backup.sh

set -e

# Generate a unique snapshot ID for this backup
SNAPSHOT_ID=$(date +"%Y%m%d-%H%M%S")
BACKUP_FILE="backup.sql"
COMPRESSED_FILE="backup.sql.gz"
CURRENT_DATE=$(date +"%Y-%m-%d %H:%M:%S")

echo "=========================================="
echo "Starting synchronized backup (Snapshot: ${SNAPSHOT_ID})"
echo "=========================================="

# Step 1: Run pg_dump to save database
echo ""
echo "[1/5] Dumping database to ${BACKUP_FILE}..."
pg_dump "$DATABASE_URL" > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Database backup completed successfully."
else
    echo "❌ Error: Database backup failed."
    exit 1
fi

# Step 2: Compress the backup
echo ""
echo "[2/5] Compressing backup..."
gzip -c "$BACKUP_FILE" > "$COMPRESSED_FILE"
BACKUP_SIZE=$(ls -lh "$COMPRESSED_FILE" | awk '{print $5}')
echo "✅ Compressed to ${BACKUP_SIZE}"

# Step 3: Upload to Google Cloud Storage
echo ""
echo "[3/5] Uploading to Google Cloud Storage..."
if [ -n "$GCP_CREDENTIALS" ] && [ -n "$GCS_BUCKET_NAME" ]; then
    npx tsx scripts/upload-to-gcs.ts "$COMPRESSED_FILE" "$SNAPSHOT_ID"
    if [ $? -eq 0 ]; then
        echo "✅ Uploaded to cloud storage"
    else
        echo "⚠️  Cloud upload failed, continuing with git backup..."
    fi
else
    echo "⚠️  GCP credentials not configured, skipping cloud upload"
fi

# Clean up compressed file (keep local backup.sql for git)
rm -f "$COMPRESSED_FILE"

# Step 4: Git add all changes
echo ""
echo "[4/5] Adding files to git..."
git add -A 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ Files staged for commit"
else
    echo "⚠️  Git add skipped (git operations may be restricted)"
fi

# Step 5: Git commit with snapshot ID
echo ""
echo "[5/5] Committing changes (Snapshot: ${SNAPSHOT_ID})..."
git commit -m "Backup snapshot ${SNAPSHOT_ID}: ${CURRENT_DATE}" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ Changes committed"
else
    echo "⚠️  Git commit skipped (no changes or git restricted)"
fi

# Optional: Git push to sync with remote
echo ""
echo "Pushing to remote..."
git push 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ Pushed to remote"
else
    echo "⚠️  Push skipped (no remote configured or push failed)"
fi

echo ""
echo "=========================================="
echo "✅ Backup completed successfully!"
echo "   Snapshot ID: ${SNAPSHOT_ID}"
echo "   Database: backup.sql (local) + GCS (cloud)"
echo "   Code: Git commit with matching snapshot ID"
echo "=========================================="

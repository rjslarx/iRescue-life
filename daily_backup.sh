#!/bin/bash

# daily_backup.sh - Database backup and git sync script
# Usage: ./daily_backup.sh

set -e

BACKUP_FILE="backup.sql"
CURRENT_DATE=$(date +"%Y-%m-%d %H:%M:%S")

echo "Starting backup process..."

# Step 1: Run pg_dump to save database
echo "Dumping database to ${BACKUP_FILE}..."
pg_dump "$DATABASE_URL" > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "Database backup completed successfully."
else
    echo "Error: Database backup failed."
    exit 1
fi

# Step 2: Git add all changes
echo "Adding files to git..."
git add -A

# Step 3: Git commit with date-stamped message
echo "Committing changes..."
git commit -m "Auto-backup: ${CURRENT_DATE}" || echo "No changes to commit."

# Step 4: Git push to sync with remote
echo "Pushing to remote..."
git push || echo "Push failed or no remote configured."

echo "Backup process completed!"

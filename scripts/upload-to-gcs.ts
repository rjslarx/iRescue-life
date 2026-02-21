#!/usr/bin/env npx tsx
import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';

async function uploadToGCS() {
  const filePath = process.argv[2];
  const snapshotId = process.argv[3] || new Date().toISOString().replace(/[:.]/g, '-');
  
  if (!filePath) {
    console.error('Usage: npx tsx scripts/upload-to-gcs.ts <file-path> [snapshot-id]');
    process.exit(1);
  }

  const gcpCredentials = process.env.GCP_CREDENTIALS;
  const bucketName = process.env.GCS_BUCKET_NAME;

  if (!gcpCredentials) {
    console.error('Error: GCP_CREDENTIALS environment variable not set');
    process.exit(1);
  }

  if (!bucketName) {
    console.error('Error: GCS_BUCKET_NAME environment variable not set');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  try {
    const credentials = JSON.parse(gcpCredentials);
    const storage = new Storage({ credentials });
    const bucket = storage.bucket(bucketName);

    const fileName = path.basename(filePath);
    const destFileName = `database-backups/snapshot-${snapshotId}-${fileName}`;
    
    const file = bucket.file(destFileName);
    
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(file.createWriteStream({
          resumable: false,
          metadata: {
            contentType: 'application/octet-stream',
            metadata: {
              snapshotId,
              createdAt: new Date().toISOString(),
              source: 'daily_backup.sh'
            }
          }
        }))
        .on('error', reject)
        .on('finish', resolve);
    });

    const fileSize = fs.statSync(filePath).size;
    const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
    
    console.log(`✅ Uploaded to gs://${bucketName}/${destFileName} (${fileSizeMB} MB)`);
    
  } catch (err: any) {
    console.error('❌ Upload failed:', err.message);
    process.exit(1);
  }
}

uploadToGCS();

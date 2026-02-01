import { Storage } from "@google-cloud/storage";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";

const execAsync = promisify(exec);
const gzip = promisify(zlib.gzip);

interface BackupResult {
  success: boolean;
  fileName?: string;
  fileSize?: number;
  message: string;
  duration?: number;
}

interface RetentionResult {
  success: boolean;
  deletedCount: number;
  message: string;
}

let storageClient: Storage | null = null;

function getStorageClient(): Storage {
  if (storageClient) {
    return storageClient;
  }

  const credentialsJson = process.env.GCP_CREDENTIALS;
  if (!credentialsJson) {
    throw new Error("GCP_CREDENTIALS environment variable is not set");
  }

  try {
    const credentials = JSON.parse(credentialsJson);
    storageClient = new Storage({ credentials });
    return storageClient;
  } catch (error) {
    throw new Error(`Failed to parse GCP_CREDENTIALS: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function getBucketName(): string {
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("GCS_BUCKET_NAME environment variable is not set");
  }
  return bucketName;
}

export async function performDatabaseBackup(): Promise<BackupResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sqlFileName = `backup-${timestamp}.sql`;
  const gzFileName = `backup-${timestamp}.sql.gz`;
  const tempSqlPath = path.join("/tmp", sqlFileName);
  const tempGzPath = path.join("/tmp", gzFileName);

  console.log(`[DB Backup] Starting database backup at ${new Date().toISOString()}`);

  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    console.log(`[DB Backup] Running pg_dump...`);
    await execAsync(`pg_dump "${databaseUrl}" -f "${tempSqlPath}"`, {
      timeout: 300000,
      maxBuffer: 100 * 1024 * 1024,
    });

    const sqlStats = fs.statSync(tempSqlPath);
    console.log(`[DB Backup] SQL dump created: ${(sqlStats.size / 1024 / 1024).toFixed(2)} MB`);

    console.log(`[DB Backup] Compressing with gzip...`);
    const sqlContent = fs.readFileSync(tempSqlPath);
    const compressedContent = await gzip(sqlContent);
    fs.writeFileSync(tempGzPath, compressedContent);

    const gzStats = fs.statSync(tempGzPath);
    const compressionRatio = ((1 - gzStats.size / sqlStats.size) * 100).toFixed(1);
    console.log(`[DB Backup] Compressed: ${(gzStats.size / 1024 / 1024).toFixed(2)} MB (${compressionRatio}% reduction)`);

    fs.unlinkSync(tempSqlPath);
    console.log(`[DB Backup] Cleaned up temporary SQL file`);

    console.log(`[DB Backup] Uploading to Google Cloud Storage...`);
    const storage = getStorageClient();
    const bucketName = getBucketName();
    const bucket = storage.bucket(bucketName);

    await bucket.upload(tempGzPath, {
      destination: `database-backups/${gzFileName}`,
      metadata: {
        contentType: "application/gzip",
        metadata: {
          backupTimestamp: timestamp,
          originalSize: sqlStats.size.toString(),
          compressedSize: gzStats.size.toString(),
        },
      },
    });

    console.log(`[DB Backup] Upload complete: gs://${bucketName}/database-backups/${gzFileName}`);

    fs.unlinkSync(tempGzPath);
    console.log(`[DB Backup] Cleaned up temporary gzip file`);

    const duration = Date.now() - startTime;
    console.log(`[DB Backup] Backup completed successfully in ${(duration / 1000).toFixed(1)}s`);

    return {
      success: true,
      fileName: gzFileName,
      fileSize: gzStats.size,
      message: `Database backup completed successfully: ${gzFileName}`,
      duration,
    };
  } catch (error) {
    if (fs.existsSync(tempSqlPath)) {
      fs.unlinkSync(tempSqlPath);
    }
    if (fs.existsSync(tempGzPath)) {
      fs.unlinkSync(tempGzPath);
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[DB Backup] Backup failed: ${errorMessage}`);

    return {
      success: false,
      message: `Database backup failed: ${errorMessage}`,
      duration: Date.now() - startTime,
    };
  }
}

export async function applyRetentionPolicy(retentionDays: number = 30): Promise<RetentionResult> {
  console.log(`[DB Backup] Applying ${retentionDays}-day retention policy...`);

  try {
    const storage = getStorageClient();
    const bucketName = getBucketName();
    const bucket = storage.bucket(bucketName);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const [files] = await bucket.getFiles({
      prefix: "database-backups/",
    });

    let deletedCount = 0;
    for (const file of files) {
      const metadata = await file.getMetadata();
      const createdTime = new Date(metadata[0].timeCreated || 0);

      if (createdTime < cutoffDate) {
        console.log(`[DB Backup] Deleting old backup: ${file.name} (created ${createdTime.toISOString()})`);
        await file.delete();
        deletedCount++;
      }
    }

    const message = deletedCount > 0
      ? `Deleted ${deletedCount} backup(s) older than ${retentionDays} days`
      : `No backups older than ${retentionDays} days found`;

    console.log(`[DB Backup] Retention policy applied: ${message}`);

    return {
      success: true,
      deletedCount,
      message,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[DB Backup] Retention policy failed: ${errorMessage}`);

    return {
      success: false,
      deletedCount: 0,
      message: `Retention policy failed: ${errorMessage}`,
    };
  }
}

export async function runDatabaseBackupJob(): Promise<{
  backup: BackupResult;
  retention: RetentionResult;
}> {
  console.log("=== Starting Database Backup Job ===");

  const backup = await performDatabaseBackup();

  let retention: RetentionResult;
  if (backup.success) {
    retention = await applyRetentionPolicy(30);
  } else {
    retention = {
      success: false,
      deletedCount: 0,
      message: "Retention policy skipped due to backup failure",
    };
  }

  console.log("=== Database Backup Job Complete ===");

  return { backup, retention };
}

export async function listBackups(): Promise<Array<{
  name: string;
  size: number;
  created: Date;
}>> {
  try {
    const storage = getStorageClient();
    const bucketName = getBucketName();
    const bucket = storage.bucket(bucketName);

    const [files] = await bucket.getFiles({
      prefix: "database-backups/",
    });

    const backups = await Promise.all(
      files.map(async (file) => {
        const [metadata] = await file.getMetadata();
        return {
          name: file.name.replace("database-backups/", ""),
          size: parseInt(metadata.size || "0", 10),
          created: new Date(metadata.timeCreated || 0),
        };
      })
    );

    return backups.sort((a, b) => b.created.getTime() - a.created.getTime());
  } catch (error) {
    console.error(`[DB Backup] Failed to list backups: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return [];
  }
}

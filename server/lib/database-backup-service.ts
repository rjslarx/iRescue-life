import { Storage } from "@google-cloud/storage";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";
import { createWriteStream, createReadStream } from "fs";

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

function validateGcpConfig(): { valid: boolean; error?: string } {
  if (!process.env.GCP_CREDENTIALS) {
    return { valid: false, error: "GCP_CREDENTIALS environment variable is not set" };
  }
  if (!process.env.GCS_BUCKET_NAME) {
    return { valid: false, error: "GCS_BUCKET_NAME environment variable is not set" };
  }
  try {
    JSON.parse(process.env.GCP_CREDENTIALS);
  } catch {
    return { valid: false, error: "GCP_CREDENTIALS is not valid JSON" };
  }
  return { valid: true };
}

function parseDatabaseUrl(url: string): {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
} {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    database: parsed.pathname.slice(1),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  };
}

export async function performDatabaseBackup(): Promise<BackupResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const gzFileName = `backup-${timestamp}.sql.gz`;
  const tempGzPath = path.join("/tmp", gzFileName);

  console.log(`[DB Backup] Starting database backup at ${new Date().toISOString()}`);

  const gcpValidation = validateGcpConfig();
  if (!gcpValidation.valid) {
    console.warn(`[DB Backup] Skipping backup: ${gcpValidation.error}`);
    return {
      success: false,
      message: `Database backup skipped: ${gcpValidation.error}`,
      duration: Date.now() - startTime,
    };
  }

  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    const dbConfig = parseDatabaseUrl(databaseUrl);

    console.log(`[DB Backup] Running pg_dump with streaming compression...`);

    await new Promise<void>((resolve, reject) => {
      const env = {
        ...process.env,
        PGPASSWORD: dbConfig.password,
      };

      const pgDump = spawn("pg_dump", [
        "-h", dbConfig.host,
        "-p", dbConfig.port,
        "-U", dbConfig.user,
        "-d", dbConfig.database,
        "--no-password",
      ], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const gzip = createGzip();
      const writeStream = createWriteStream(tempGzPath);

      let stderrOutput = "";
      pgDump.stderr.on("data", (data) => {
        stderrOutput += data.toString();
      });

      pgDump.stdout.pipe(gzip).pipe(writeStream);

      writeStream.on("finish", () => {
        if (pgDump.exitCode === 0 || pgDump.exitCode === null) {
          resolve();
        } else {
          reject(new Error(`pg_dump failed with exit code ${pgDump.exitCode}: ${stderrOutput}`));
        }
      });

      writeStream.on("error", (err) => {
        reject(new Error(`Write stream error: ${err.message}`));
      });

      pgDump.on("error", (err) => {
        reject(new Error(`pg_dump spawn error: ${err.message}`));
      });

      pgDump.on("close", (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`pg_dump exited with code ${code}: ${stderrOutput}`));
        }
      });
    });

    const gzStats = fs.statSync(tempGzPath);
    console.log(`[DB Backup] Compressed backup created: ${(gzStats.size / 1024 / 1024).toFixed(2)} MB`);

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
    if (fs.existsSync(tempGzPath)) {
      try {
        fs.unlinkSync(tempGzPath);
      } catch {
      }
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

  const gcpValidation = validateGcpConfig();
  if (!gcpValidation.valid) {
    console.warn(`[DB Backup] Skipping retention: ${gcpValidation.error}`);
    return {
      success: false,
      deletedCount: 0,
      message: `Retention policy skipped: ${gcpValidation.error}`,
    };
  }

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

  const retention = await applyRetentionPolicy(30);

  console.log("=== Database Backup Job Complete ===");

  return { backup, retention };
}

export async function listBackups(): Promise<Array<{
  name: string;
  size: number;
  created: Date;
}>> {
  const gcpValidation = validateGcpConfig();
  if (!gcpValidation.valid) {
    console.warn(`[DB Backup] Cannot list backups: ${gcpValidation.error}`);
    return [];
  }

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

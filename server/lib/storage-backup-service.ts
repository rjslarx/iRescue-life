import { DriveService } from './googleWorkspace';
import { objectStorageClient, parseObjectPath, ObjectStorageService } from '../objectStorage';
import { db } from '../db';
import { tenants, platformIntegrations, animals, volunteerApplications, fosterApplications, donations } from '@shared/schema';
import { eq, and, isNotNull } from 'drizzle-orm';

const ROOT_FOLDERS = {
  ACTIVE_ANIMALS: '01_Active_Animals',
  ADOPTED_ARCHIVE: '02_Adopted_Archive',
  VOLUNTEERS: '03_Volunteers',
  FOSTERS: '04_Fosters',
  WEBSITE_ASSETS: '05_Website_Assets',
  FINANCE: '06_Finance',
  GENERAL_DOCS: '07_General_Docs',
  BACKUPS: '08_Backups',
};

export interface BackupProgress {
  tenantId: string;
  tenantName: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  filesScanned: number;
  filesBackedUp: number;
  filesSkipped: number;
  errors: string[];
  startedAt?: Date;
  completedAt?: Date;
}

export interface BackupJobResult {
  success: boolean;
  tenantsProcessed: number;
  totalFilesBackedUp: number;
  totalFilesSkipped: number;
  errors: string[];
  details: BackupProgress[];
}

/**
 * Storage Backup Service
 * Syncs files from Replit Object Storage to Google Drive for all tenants
 */
export class StorageBackupService {
  private progress: Map<string, BackupProgress> = new Map();

  /**
   * Run backup for all tenants with Google Drive enabled
   */
  async runBackupForAllTenants(): Promise<BackupJobResult> {
    console.log('[STORAGE BACKUP] Starting backup job for all tenants...');
    
    const result: BackupJobResult = {
      success: true,
      tenantsProcessed: 0,
      totalFilesBackedUp: 0,
      totalFilesSkipped: 0,
      errors: [],
      details: [],
    };

    try {
      // Find all tenants with Google Drive enabled and shared drive configured
      // We query platformIntegrations and filter by googleFeatures containing useDrive and sharedDriveId
      const allIntegrations = await db
        .select({
          tenantId: tenants.id,
          tenantName: tenants.name,
          subdomain: tenants.subdomain,
          googleFeatures: platformIntegrations.googleFeatures,
        })
        .from(tenants)
        .innerJoin(
          platformIntegrations,
          and(
            eq(platformIntegrations.tenantId, tenants.id),
            eq(platformIntegrations.platform, 'google_workspace'),
            eq(platformIntegrations.isEnabled, true),
            isNotNull(platformIntegrations.accessTokenEncrypted)
          )
        );

      // Filter to only tenants that have useDrive enabled AND sharedDriveId configured
      const tenantsWithDrive = allIntegrations.filter(t => {
        const features = t.googleFeatures as { useDrive?: boolean; sharedDriveId?: string } | null;
        return features?.useDrive === true && !!features?.sharedDriveId;
      });

      console.log(`[STORAGE BACKUP] Found ${tenantsWithDrive.length} tenants with Google Drive configured (of ${allIntegrations.length} with Google Workspace)`);

      for (const tenant of tenantsWithDrive) {
        try {
          const tenantResult = await this.runBackupForTenant(tenant.tenantId, tenant.tenantName || tenant.subdomain);
          result.details.push(tenantResult);
          result.tenantsProcessed++;
          result.totalFilesBackedUp += tenantResult.filesBackedUp;
          result.totalFilesSkipped += tenantResult.filesSkipped;
          
          if (tenantResult.errors.length > 0) {
            result.errors.push(...tenantResult.errors.map(e => `[${tenant.tenantName || tenant.subdomain}] ${e}`));
          }
        } catch (error: any) {
          const errorMsg = `Failed to backup tenant ${tenant.tenantName || tenant.subdomain}: ${error.message}`;
          console.error(`[STORAGE BACKUP] ${errorMsg}`);
          result.errors.push(errorMsg);
        }
      }
    } catch (error: any) {
      console.error('[STORAGE BACKUP] Backup job failed:', error);
      result.success = false;
      result.errors.push(`Backup job failed: ${error.message}`);
    }

    console.log(`[STORAGE BACKUP] Backup job completed. ${result.tenantsProcessed} tenants, ${result.totalFilesBackedUp} files backed up, ${result.totalFilesSkipped} skipped`);
    return result;
  }

  /**
   * Run backup for a specific tenant
   */
  async runBackupForTenant(tenantId: string, tenantName: string): Promise<BackupProgress> {
    const progress: BackupProgress = {
      tenantId,
      tenantName,
      status: 'in_progress',
      filesScanned: 0,
      filesBackedUp: 0,
      filesSkipped: 0,
      errors: [],
      startedAt: new Date(),
    };

    this.progress.set(tenantId, progress);

    console.log(`[STORAGE BACKUP] Starting backup for tenant: ${tenantName} (${tenantId})`);

    try {
      // Get Drive service for this tenant
      const driveService = await DriveService.forTenant(tenantId);
      
      if (!driveService || !driveService.hasSharedDriveConfigured()) {
        progress.status = 'failed';
        progress.errors.push('Google Drive not configured or no Shared Drive set');
        progress.completedAt = new Date();
        return progress;
      }

      // Ensure root backup folder exists
      const backupFolderResult = await this.getOrCreateFolder(driveService, ROOT_FOLDERS.BACKUPS);
      if (!backupFolderResult.success || !backupFolderResult.folderId) {
        progress.status = 'failed';
        progress.errors.push('Failed to create backup folder in Google Drive');
        progress.completedAt = new Date();
        return progress;
      }

      // Backup different categories of files
      await this.backupAnimalPhotos(tenantId, driveService, progress);
      await this.backupAnimalDocuments(tenantId, driveService, progress);
      await this.backupVolunteerDocuments(tenantId, driveService, progress);
      await this.backupFosterDocuments(tenantId, driveService, progress);
      await this.backupDonationReceipts(tenantId, driveService, progress);
      await this.backupWebsiteAssets(tenantId, driveService, progress);

      progress.status = 'completed';
      progress.completedAt = new Date();

      console.log(`[STORAGE BACKUP] Completed backup for ${tenantName}: ${progress.filesBackedUp} backed up, ${progress.filesSkipped} skipped`);
    } catch (error: any) {
      progress.status = 'failed';
      progress.errors.push(error.message);
      progress.completedAt = new Date();
      console.error(`[STORAGE BACKUP] Backup failed for ${tenantName}:`, error);
    }

    this.progress.set(tenantId, progress);
    return progress;
  }

  /**
   * Backup animal photos from Object Storage to Google Drive
   */
  private async backupAnimalPhotos(tenantId: string, driveService: DriveService, progress: BackupProgress): Promise<void> {
    console.log(`[STORAGE BACKUP] Backing up animal photos for tenant ${tenantId}...`);

    try {
      // Get all animals for this tenant that have photos
      const tenantAnimals = await db
        .select({
          id: animals.id,
          name: animals.name,
          photos: animals.photos,
          status: animals.status,
        })
        .from(animals)
        .where(eq(animals.tenantId, tenantId));

      // Guard against undefined/null results
      if (!tenantAnimals || !Array.isArray(tenantAnimals)) {
        console.log(`[STORAGE BACKUP] No animals found or invalid response for tenant: ${tenantId}`);
        return;
      }

      for (const animal of tenantAnimals) {
        if (!animal.photos || !Array.isArray(animal.photos) || animal.photos.length === 0) continue;

        for (const photoUrl of animal.photos) {
          // Skip null/undefined/empty URLs
          if (!photoUrl || typeof photoUrl !== 'string') {
            continue;
          }

          progress.filesScanned++;

          // Skip if already a Google Drive URL
          if (photoUrl.includes('drive.google.com') || photoUrl.includes('googleusercontent.com')) {
            progress.filesSkipped++;
            continue;
          }

          // Skip if not an object storage URL
          if (!photoUrl.startsWith('/objects/')) {
            progress.filesSkipped++;
            continue;
          }

          try {
            await this.syncFileToGoogleDrive(
              tenantId,
              photoUrl,
              driveService,
              animal,
              'Photos',
              progress
            );
          } catch (error: any) {
            progress.errors.push(`Failed to backup photo for ${animal.name}: ${error.message}`);
          }
        }
      }
    } catch (error: any) {
      progress.errors.push(`Failed to backup animal photos: ${error.message}`);
    }
  }

  /**
   * Backup animal medical/contract documents
   */
  private async backupAnimalDocuments(tenantId: string, driveService: DriveService, progress: BackupProgress): Promise<void> {
    console.log(`[STORAGE BACKUP] Backing up animal documents for tenant ${tenantId}...`);

    // This would scan for medical documents, contracts, etc.
    // The actual implementation depends on where these are stored
    // For now, we'll scan the object storage paths
    try {
      const objectStorage = new ObjectStorageService();
      const privateDir = objectStorage.getPrivateObjectDir();
      
      // List objects in the tenant's documents folder
      const docsPath = `${privateDir}/${tenantId}/animal-medical`;
      await this.scanAndBackupObjectStorageFolder(docsPath, driveService, ROOT_FOLDERS.ACTIVE_ANIMALS, progress);

      const contractsPath = `${privateDir}/${tenantId}/animal-contracts`;
      await this.scanAndBackupObjectStorageFolder(contractsPath, driveService, ROOT_FOLDERS.ACTIVE_ANIMALS, progress);
    } catch (error: any) {
      // Folder might not exist, which is fine
      console.log(`[STORAGE BACKUP] No animal documents folder found: ${error.message}`);
    }
  }

  /**
   * Backup volunteer documents
   */
  private async backupVolunteerDocuments(tenantId: string, driveService: DriveService, progress: BackupProgress): Promise<void> {
    console.log(`[STORAGE BACKUP] Backing up volunteer documents for tenant ${tenantId}...`);

    try {
      // Get volunteers with drive folders (indicating they may have documents)
      const volunteers = await db
        .select({
          id: volunteerApplications.id,
          name: volunteerApplications.applicantName,
          driveFolderId: volunteerApplications.driveFolderId,
        })
        .from(volunteerApplications)
        .where(and(
          eq(volunteerApplications.tenantId, tenantId),
          isNotNull(volunteerApplications.driveFolderId)
        ));

      // Guard against undefined/null results
      if (!volunteers || !Array.isArray(volunteers)) {
        console.log(`[STORAGE BACKUP] No volunteers found or invalid response for tenant: ${tenantId}`);
        return;
      }

      // Note: signedWaiverUrl column does not exist in the schema
      // Volunteer documents are stored in the driveFolderId folder directly
      // This backup scans object storage paths for volunteer documents
      const objectStorage = new ObjectStorageService();
      const privateDir = objectStorage.getPrivateObjectDir();

      for (const volunteer of volunteers) {
        const volunteerName = volunteer.name || 'Unknown';
        
        try {
          // Scan volunteer's object storage folder for documents
          const volunteerDocsPath = `${privateDir}/${tenantId}/volunteers/${volunteer.id}`;
          
          // Create volunteer folder in Google Drive if needed
          const volunteersFolder = await this.getOrCreateFolder(driveService, ROOT_FOLDERS.VOLUNTEERS);
          if (!volunteersFolder.success || !volunteersFolder.folderId) continue;

          const volunteerFolderName = `${volunteerName.replace(/[<>:"/\\|?*]/g, '_')} (ID_${volunteer.id.substring(0, 8)})`;
          const volunteerFolder = await this.getOrCreateFolder(driveService, volunteerFolderName, volunteersFolder.folderId);
          if (!volunteerFolder.success || !volunteerFolder.folderId) continue;

          await this.scanAndBackupObjectStorageFolder(volunteerDocsPath, driveService, volunteerFolderName, progress);
        } catch (error: any) {
          progress.errors.push(`Failed to backup volunteer docs for ${volunteerName}: ${error.message}`);
        }
      }
    } catch (error: any) {
      progress.errors.push(`Failed to backup volunteer documents: ${error.message}`);
    }
  }

  /**
   * Backup foster documents
   */
  private async backupFosterDocuments(tenantId: string, driveService: DriveService, progress: BackupProgress): Promise<void> {
    console.log(`[STORAGE BACKUP] Backing up foster documents for tenant ${tenantId}...`);

    try {
      // Get fosters with signed agreements
      const fosters = await db
        .select({
          id: fosterApplications.id,
          name: fosterApplications.name,
          signedAgreementUrl: fosterApplications.signedAgreementUrl,
          driveFolderId: fosterApplications.driveFolderId,
        })
        .from(fosterApplications)
        .where(and(
          eq(fosterApplications.tenantId, tenantId),
          isNotNull(fosterApplications.signedAgreementUrl)
        ));

      // Guard against undefined/null results
      if (!fosters || !Array.isArray(fosters)) {
        console.log(`[STORAGE BACKUP] No fosters found or invalid response for tenant: ${tenantId}`);
        return;
      }

      for (const foster of fosters) {
        // Skip if signedAgreementUrl is null/undefined or not a string
        if (!foster.signedAgreementUrl || typeof foster.signedAgreementUrl !== 'string') continue;
        progress.filesScanned++;

        // Skip if already in Google Drive
        if (foster.signedAgreementUrl.includes('drive.google.com') || foster.signedAgreementUrl.includes('googleusercontent.com')) {
          progress.filesSkipped++;
          continue;
        }

        if (!foster.signedAgreementUrl.startsWith('/objects/')) {
          progress.filesSkipped++;
          continue;
        }

        const fosterName = foster.name || 'Unknown';

        try {
          // Create foster folder if needed
          const fostersFolder = await this.getOrCreateFolder(driveService, ROOT_FOLDERS.FOSTERS);
          if (!fostersFolder.success || !fostersFolder.folderId) continue;

          const fosterFolderName = `${fosterName} (ID_${foster.id.substring(0, 8)})`;
          const fosterFolder = await this.getOrCreateFolder(driveService, fosterFolderName, fostersFolder.folderId);
          if (!fosterFolder.success || !fosterFolder.folderId) continue;

          const agreementsFolder = await this.getOrCreateFolder(driveService, 'Agreements', fosterFolder.folderId);
          if (!agreementsFolder.success || !agreementsFolder.folderId) continue;

          await this.uploadObjectStorageFileToGoogleDrive(
            foster.signedAgreementUrl,
            driveService,
            agreementsFolder.folderId,
            `Signed_Agreement_${fosterName}.pdf`,
            progress
          );
        } catch (error: any) {
          progress.errors.push(`Failed to backup foster agreement for ${fosterName}: ${error.message}`);
        }
      }
    } catch (error: any) {
      progress.errors.push(`Failed to backup foster documents: ${error.message}`);
    }
  }

  /**
   * Backup donation receipts
   */
  private async backupDonationReceipts(tenantId: string, driveService: DriveService, progress: BackupProgress): Promise<void> {
    console.log(`[STORAGE BACKUP] Backing up donation receipts for tenant ${tenantId}...`);

    try {
      // Get donations with receipt URLs from object storage
      const donationList = await db
        .select({
          id: donations.id,
          receiptUrl: donations.receiptUrl,
          donorEmail: donations.donorEmail,
          createdAt: donations.createdAt,
        })
        .from(donations)
        .where(and(
          eq(donations.tenantId, tenantId),
          isNotNull(donations.receiptUrl)
        ));

      // Guard against undefined/null results
      if (!donationList || !Array.isArray(donationList)) {
        console.log(`[STORAGE BACKUP] No donations found or invalid response for tenant: ${tenantId}`);
        return;
      }

      // Create finance/receipts folder
      const financeFolder = await this.getOrCreateFolder(driveService, ROOT_FOLDERS.FINANCE);
      if (!financeFolder.success || !financeFolder.folderId) return;

      const receiptsFolder = await this.getOrCreateFolder(driveService, 'Donation_Receipts', financeFolder.folderId);
      if (!receiptsFolder.success || !receiptsFolder.folderId) return;

      for (const donation of donationList) {
        // Skip if receiptUrl is null/undefined or not a string
        if (!donation.receiptUrl || typeof donation.receiptUrl !== 'string') continue;
        progress.filesScanned++;

        // Skip if already in Google Drive
        if (donation.receiptUrl.includes('drive.google.com') || donation.receiptUrl.includes('googleusercontent.com')) {
          progress.filesSkipped++;
          continue;
        }

        if (!donation.receiptUrl.startsWith('/objects/')) {
          progress.filesSkipped++;
          continue;
        }

        try {
          const dateStr = donation.createdAt ? new Date(donation.createdAt).toISOString().split('T')[0] : 'unknown';
          const fileName = `Receipt_${dateStr}_${donation.id.substring(0, 8)}.pdf`;

          await this.uploadObjectStorageFileToGoogleDrive(
            donation.receiptUrl,
            driveService,
            receiptsFolder.folderId,
            fileName,
            progress
          );
        } catch (error: any) {
          progress.errors.push(`Failed to backup donation receipt: ${error.message}`);
        }
      }
    } catch (error: any) {
      progress.errors.push(`Failed to backup donation receipts: ${error.message}`);
    }
  }

  /**
   * Backup website assets (logos, banners, etc.)
   */
  private async backupWebsiteAssets(tenantId: string, driveService: DriveService, progress: BackupProgress): Promise<void> {
    console.log(`[STORAGE BACKUP] Backing up website assets for tenant ${tenantId}...`);

    try {
      const objectStorage = new ObjectStorageService();
      const privateDir = objectStorage.getPrivateObjectDir();
      
      const assetsPath = `${privateDir}/${tenantId}/website-assets`;
      await this.scanAndBackupObjectStorageFolder(assetsPath, driveService, ROOT_FOLDERS.WEBSITE_ASSETS, progress);
    } catch (error: any) {
      // Folder might not exist, which is fine
      console.log(`[STORAGE BACKUP] No website assets folder found: ${error.message}`);
    }
  }

  /**
   * Scan an object storage folder and backup all files
   */
  private async scanAndBackupObjectStorageFolder(
    path: string,
    driveService: DriveService,
    driveRootFolder: string,
    progress: BackupProgress
  ): Promise<void> {
    try {
      const { bucketName, objectName } = parseObjectPath(path);
      const bucket = objectStorageClient.bucket(bucketName);
      
      const [files] = await bucket.getFiles({ prefix: objectName });
      
      // Guard against undefined/null files array
      if (!files || !Array.isArray(files)) {
        console.log(`[STORAGE BACKUP] No files found or invalid response for path: ${path}`);
        return;
      }
      
      for (const file of files) {
        progress.filesScanned++;
        
        try {
          const destFolder = await this.getOrCreateFolder(driveService, driveRootFolder);
          if (!destFolder.success || !destFolder.folderId) continue;

          const fileName = file.name.split('/').pop() || 'unknown';
          await this.uploadGCSFileToDrive(file, driveService, destFolder.folderId, fileName, progress);
        } catch (error: any) {
          progress.errors.push(`Failed to backup file ${file.name}: ${error.message}`);
        }
      }
    } catch (error: any) {
      // Folder might not exist
      console.log(`[STORAGE BACKUP] Could not scan folder: ${error.message}`);
    }
  }

  /**
   * Sync a single file from Object Storage to Google Drive
   */
  private async syncFileToGoogleDrive(
    tenantId: string,
    objectUrl: string,
    driveService: DriveService,
    animal: { id: string; name: string; status: string | null },
    subfolder: string,
    progress: BackupProgress
  ): Promise<void> {
    // Validate objectUrl before processing
    if (!objectUrl || typeof objectUrl !== 'string') {
      throw new Error('Invalid object URL: null or undefined');
    }

    try {
      // Determine target folder based on animal status
      const isAdopted = animal.status === 'adopted';
      const rootFolder = isAdopted ? ROOT_FOLDERS.ADOPTED_ARCHIVE : ROOT_FOLDERS.ACTIVE_ANIMALS;

      // Create folder structure
      const rootFolderResult = await this.getOrCreateFolder(driveService, rootFolder);
      if (!rootFolderResult.success || !rootFolderResult.folderId) {
        throw new Error('Failed to get root folder');
      }

      const animalName = animal.name || 'Unknown';
      const animalFolderName = `${animalName.replace(/[<>:"/\\|?*]/g, '_')} (ID_${animal.id.substring(0, 8)})`;
      const animalFolder = await this.getOrCreateFolder(driveService, animalFolderName, rootFolderResult.folderId);
      if (!animalFolder.success || !animalFolder.folderId) {
        throw new Error('Failed to create animal folder');
      }

      const subfolderResult = await this.getOrCreateFolder(driveService, subfolder, animalFolder.folderId);
      if (!subfolderResult.success || !subfolderResult.folderId) {
        throw new Error('Failed to create subfolder');
      }

      // Download from object storage and upload to Google Drive
      // Use deterministic filename based on object URL hash for consistent deduplication
      const urlHash = this.hashString(objectUrl).substring(0, 12);
      const extension = this.getExtensionFromUrl(objectUrl) || 'jpg';
      const fileName = `photo_${urlHash}.${extension}`;
      await this.uploadObjectStorageFileToGoogleDrive(objectUrl, driveService, subfolderResult.folderId, fileName, progress);
    } catch (error: any) {
      throw new Error(`Failed to sync file: ${error.message}`);
    }
  }

  /**
   * Download file from Object Storage and upload to Google Drive (with deduplication)
   */
  private async uploadObjectStorageFileToGoogleDrive(
    objectUrl: string,
    driveService: DriveService,
    folderId: string,
    fileName: string,
    progress: BackupProgress
  ): Promise<void> {
    // Validate objectUrl before processing
    if (!objectUrl || typeof objectUrl !== 'string') {
      throw new Error('Invalid object URL: null or undefined');
    }

    try {
      // Check if file already exists in the folder (deduplication)
      const exists = await this.fileExistsInFolder(driveService, fileName, folderId);
      if (exists) {
        progress.filesSkipped++;
        console.log(`[STORAGE BACKUP] Skipped (already exists): ${fileName}`);
        return;
      }

      const objectStorage = new ObjectStorageService();
      const file = await objectStorage.getObjectEntityFile(objectUrl);
      
      const [content] = await file.download();
      const [metadata] = await file.getMetadata();
      const mimeType = metadata.contentType || 'application/octet-stream';

      const result = await driveService.uploadFile({
        name: fileName,
        mimeType,
        content,
        folderId,
        visibility: 'private',
      });

      if (result.success) {
        progress.filesBackedUp++;
        console.log(`[STORAGE BACKUP] Backed up: ${fileName}`);
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error: any) {
      throw new Error(`Failed to upload ${fileName}: ${error.message}`);
    }
  }

  /**
   * Upload a GCS file directly to Google Drive (with deduplication)
   */
  private async uploadGCSFileToDrive(
    gcsFile: any,
    driveService: DriveService,
    folderId: string,
    fileName: string,
    progress: BackupProgress
  ): Promise<void> {
    try {
      // Check if file already exists in the folder (deduplication)
      const exists = await this.fileExistsInFolder(driveService, fileName, folderId);
      if (exists) {
        progress.filesSkipped++;
        console.log(`[STORAGE BACKUP] Skipped (already exists): ${fileName}`);
        return;
      }

      const [content] = await gcsFile.download();
      const [metadata] = await gcsFile.getMetadata();
      const mimeType = metadata.contentType || 'application/octet-stream';

      const result = await driveService.uploadFile({
        name: fileName,
        mimeType,
        content,
        folderId,
        visibility: 'private',
      });

      if (result.success) {
        progress.filesBackedUp++;
        console.log(`[STORAGE BACKUP] Backed up: ${fileName}`);
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error: any) {
      throw new Error(`Failed to upload ${fileName}: ${error.message}`);
    }
  }

  /**
   * Get or create a folder in Google Drive
   */
  private async getOrCreateFolder(
    driveService: DriveService,
    folderName: string,
    parentId?: string
  ): Promise<{ success: boolean; folderId?: string; error?: string }> {
    const existing = await driveService.findFolder(folderName, parentId);
    if (existing.success && existing.folderId) {
      return existing;
    }
    return driveService.createFolder({ name: folderName, parentId });
  }

  /**
   * Generate a simple hash of a string (for deterministic filenames)
   */
  private hashString(str: string): string {
    if (!str || typeof str !== 'string') {
      return 'unknown';
    }
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get file extension from a URL
   */
  private getExtensionFromUrl(url: string): string {
    if (!url || typeof url !== 'string') {
      return 'jpg';
    }
    const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    return match ? match[1].toLowerCase() : 'jpg';
  }

  /**
   * Check if a file with the given name already exists in the folder
   */
  private async fileExistsInFolder(
    driveService: DriveService,
    fileName: string,
    folderId: string
  ): Promise<boolean> {
    try {
      const result = await driveService.listFiles({ folderId, pageSize: 100 });
      if (result.success && result.files) {
        return result.files.some(f => f.name === fileName);
      }
    } catch (error) {
      console.log(`[STORAGE BACKUP] Could not check for existing file: ${fileName}`);
    }
    return false;
  }

  /**
   * Get backup progress for a tenant
   */
  getProgress(tenantId: string): BackupProgress | undefined {
    return this.progress.get(tenantId);
  }
}

// Singleton instance for scheduler
let backupServiceInstance: StorageBackupService | null = null;

export function getBackupService(): StorageBackupService {
  if (!backupServiceInstance) {
    backupServiceInstance = new StorageBackupService();
  }
  return backupServiceInstance;
}

/**
 * Run backup for all tenants (called by scheduler)
 */
export async function runStorageBackupForAllTenants(): Promise<BackupJobResult> {
  const service = getBackupService();
  return service.runBackupForAllTenants();
}

/**
 * Run backup for a specific tenant (called by API)
 */
export async function runStorageBackupForTenant(tenantId: string, tenantName: string): Promise<BackupProgress> {
  const service = getBackupService();
  return service.runBackupForTenant(tenantId, tenantName);
}

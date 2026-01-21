import { DriveService } from './googleWorkspace';
import { ObjectStorageService } from '../objectStorage';
import { ObjectAclPolicy } from '../objectAcl';

export type FileCategory = 'animal-photos' | 'animal-medical' | 'animal-contracts' | 'foster-updates' | 'website-assets' | 'general-docs' | 'form-uploads';
export type LegacyCategory = 'animals' | 'documents' | 'custom-pages';
export type AnyCategory = FileCategory | LegacyCategory;
export type FileVisibility = 'public' | 'private';
export type AnimalStatus = 'available' | 'pending' | 'adopted' | 'foster' | 'medical_hold' | 'stray_hold' | 'bite_hold' | 'deceased' | 'pending_transport' | 'transferred_out';

const LEGACY_CATEGORY_MAP: Record<LegacyCategory, FileCategory> = {
  'animals': 'animal-photos',
  'documents': 'animal-medical',
  'custom-pages': 'website-assets',
};

function normalizeCategory(category: AnyCategory): FileCategory {
  if (category in LEGACY_CATEGORY_MAP) {
    return LEGACY_CATEGORY_MAP[category as LegacyCategory];
  }
  return category as FileCategory;
}

export interface AnimalContext {
  id: string;
  name: string;
  status: AnimalStatus;
  adoptedYear?: number;
}

export interface UploadResult {
  success: boolean;
  fileUrl: string;
  storageType: 'google_drive' | 'replit_object_storage';
  driveFileId?: string;
  error?: string;
}

export interface UploadOptions {
  tenantId: string;
  userId: string;
  category: AnyCategory;
  visibility: FileVisibility;
  fileName: string;
  mimeType: string;
  content: Buffer;
  animal?: AnimalContext;
  folderId?: string;
}

const ROOT_FOLDERS = {
  ACTIVE_ANIMALS: '01_Active_Animals',
  ADOPTED_ARCHIVE: '02_Adopted_Archive',
  WEBSITE_ASSETS: '03_Website_Assets',
  GENERAL_DOCS: '04_General_Docs',
};

const ANIMAL_SUBFOLDERS: Record<string, string> = {
  'animal-photos': 'Photos',
  'animal-medical': 'Medical',
  'animal-contracts': 'Contracts',
  'foster-updates': 'Foster Updates',
};

const WEBSITE_SUBFOLDERS: Record<string, string> = {
  'logos': 'Logos',
  'banners': 'Banners',
  'pages': 'Pages',
};

export class TenantFileStorage {
  private tenantId: string;
  private objectStorage: ObjectStorageService;
  private folderCache: Map<string, string> = new Map();

  constructor(tenantId: string) {
    this.tenantId = tenantId;
    this.objectStorage = new ObjectStorageService();
  }

  async uploadFile(options: UploadOptions): Promise<UploadResult> {
    const { tenantId, userId, visibility, fileName, mimeType, content, animal, folderId } = options;
    const category = normalizeCategory(options.category);

    console.log(`[TENANT FILE STORAGE] uploadFile called: tenant=${tenantId}, category=${category}, file=${fileName}, size=${content?.length || 0} bytes, animal=${animal?.name || 'none'}`);

    const driveService = await DriveService.forTenant(tenantId);
    
    const hasDriveConfig = driveService && driveService.hasSharedDriveConfigured();
    console.log(`[TENANT FILE STORAGE] DriveService available: ${!!driveService}, hasSharedDrive: ${hasDriveConfig}`);
    
    if (hasDriveConfig) {
      console.log(`[TENANT FILE STORAGE] Attempting Google Drive upload...`);
      const driveResult = await this.uploadToGoogleDrive(driveService, {
        category,
        visibility,
        fileName,
        mimeType,
        content,
        animal,
        folderId,
      });

      if (driveResult.success) {
        console.log(`[TENANT FILE STORAGE] Google Drive upload SUCCESS: ${driveResult.fileUrl}`);
        return driveResult;
      }

      console.warn(`[TENANT FILE STORAGE] Google Drive upload failed for tenant ${tenantId}, falling back to Replit storage:`, driveResult.error);
    } else {
      console.log(`[TENANT FILE STORAGE] No Shared Drive configured, using Replit storage`);
    }

    return this.uploadToReplitStorage({
      tenantId,
      userId,
      category,
      visibility,
      fileName,
      mimeType,
      content,
      animal,
    });
  }

  private async uploadToGoogleDrive(
    driveService: DriveService,
    options: {
      category: FileCategory;
      visibility: FileVisibility;
      fileName: string;
      mimeType: string;
      content: Buffer;
      animal?: AnimalContext;
      folderId?: string;
    }
  ): Promise<UploadResult> {
    try {
      let targetFolderId = options.folderId;

      if (!targetFolderId) {
        const folderResult = await this.resolveTargetFolder(driveService, options.category, options.animal);
        if (folderResult.success && folderResult.folderId) {
          targetFolderId = folderResult.folderId;
        }
      }

      const result = await driveService.uploadFile({
        name: options.fileName,
        mimeType: options.mimeType,
        content: options.content,
        folderId: targetFolderId,
        visibility: options.visibility,
      });

      if (!result.success || !result.fileId) {
        return {
          success: false,
          fileUrl: '',
          storageType: 'google_drive',
          error: result.error || 'Unknown error uploading to Google Drive',
        };
      }

      const fileUrl = result.webViewLink || `https://drive.google.com/file/d/${result.fileId}/view`;

      return {
        success: true,
        fileUrl,
        storageType: 'google_drive',
        driveFileId: result.fileId,
      };
    } catch (error: any) {
      return {
        success: false,
        fileUrl: '',
        storageType: 'google_drive',
        error: error.message || 'Failed to upload to Google Drive',
      };
    }
  }

  private async resolveTargetFolder(
    driveService: DriveService,
    category: FileCategory,
    animal?: AnimalContext
  ): Promise<{ success: boolean; folderId?: string; error?: string }> {
    if (category === 'animal-photos' || category === 'animal-medical' || category === 'animal-contracts' || category === 'foster-updates') {
      if (!animal) {
        // For animal-related uploads without animal context (e.g., new animal creation),
        // use a temporary uploads folder within active animals
        const activeFolder = await this.getOrCreateFolder(driveService, ROOT_FOLDERS.ACTIVE_ANIMALS);
        if (!activeFolder.success || !activeFolder.folderId) {
          return activeFolder;
        }
        return this.getOrCreateFolder(driveService, '_Pending_Uploads', activeFolder.folderId);
      }
      return this.getOrCreateAnimalSubfolder(driveService, animal, category);
    }

    if (category === 'website-assets') {
      return this.getOrCreateFolder(driveService, ROOT_FOLDERS.WEBSITE_ASSETS);
    }

    if (category === 'general-docs') {
      return this.getOrCreateFolder(driveService, ROOT_FOLDERS.GENERAL_DOCS);
    }

    if (category === 'form-uploads') {
      // Form uploads go to a dedicated folder under General Docs
      const generalDocsFolder = await this.getOrCreateFolder(driveService, ROOT_FOLDERS.GENERAL_DOCS);
      if (!generalDocsFolder.success || !generalDocsFolder.folderId) {
        return generalDocsFolder;
      }
      return this.getOrCreateFolder(driveService, 'Form_Uploads', generalDocsFolder.folderId);
    }

    return { success: false, error: `Unknown category: ${category}` };
  }

  private formatAnimalFolderName(animal: AnimalContext): string {
    const sanitizedName = animal.name.replace(/[<>:"/\\|?*]/g, '_').trim();
    return `${sanitizedName} (ID_${animal.id})`;
  }

  private async getOrCreateAnimalSubfolder(
    driveService: DriveService,
    animal: AnimalContext,
    category: FileCategory
  ): Promise<{ success: boolean; folderId?: string; error?: string }> {
    const isAdopted = animal.status === 'adopted';
    const animalFolderName = this.formatAnimalFolderName(animal);
    const subfolderName = ANIMAL_SUBFOLDERS[category] || 'Documents';

    let parentPath: string;
    let parentFolderId: string | undefined;

    if (isAdopted) {
      const year = animal.adoptedYear || new Date().getFullYear();
      const yearFolderName = `Year_${year}`;
      
      const archiveFolder = await this.getOrCreateFolder(driveService, ROOT_FOLDERS.ADOPTED_ARCHIVE);
      if (!archiveFolder.success || !archiveFolder.folderId) {
        return archiveFolder;
      }
      
      const yearFolder = await this.getOrCreateFolder(driveService, yearFolderName, archiveFolder.folderId);
      if (!yearFolder.success || !yearFolder.folderId) {
        return yearFolder;
      }
      
      parentPath = `${ROOT_FOLDERS.ADOPTED_ARCHIVE}/${yearFolderName}`;
      parentFolderId = yearFolder.folderId;
    } else {
      const activeFolder = await this.getOrCreateFolder(driveService, ROOT_FOLDERS.ACTIVE_ANIMALS);
      if (!activeFolder.success || !activeFolder.folderId) {
        return activeFolder;
      }
      
      parentPath = ROOT_FOLDERS.ACTIVE_ANIMALS;
      parentFolderId = activeFolder.folderId;
    }

    const animalFolder = await this.getOrCreateAnimalFolder(driveService, animal, parentFolderId);
    if (!animalFolder.success || !animalFolder.folderId) {
      return animalFolder;
    }

    const subfolder = await this.getOrCreateFolder(driveService, subfolderName, animalFolder.folderId);
    return subfolder;
  }

  private async getOrCreateAnimalFolder(
    driveService: DriveService,
    animal: AnimalContext,
    parentFolderId: string
  ): Promise<{ success: boolean; folderId?: string; error?: string }> {
    const folderName = this.formatAnimalFolderName(animal);
    const cacheKey = `animal_${animal.id}_${parentFolderId}`;

    if (this.folderCache.has(cacheKey)) {
      return { success: true, folderId: this.folderCache.get(cacheKey) };
    }

    const searchPattern = `(ID_${animal.id})`;
    const existingFolder = await driveService.findFolderByPattern(searchPattern, parentFolderId);
    
    if (existingFolder.success && existingFolder.folderId) {
      this.folderCache.set(cacheKey, existingFolder.folderId);
      return { success: true, folderId: existingFolder.folderId };
    }

    const createResult = await driveService.createFolder({ 
      name: folderName, 
      parentId: parentFolderId 
    });
    
    if (createResult.success && createResult.folderId) {
      this.folderCache.set(cacheKey, createResult.folderId);
    }
    
    return createResult;
  }

  private async getOrCreateFolder(
    driveService: DriveService,
    folderName: string,
    parentId?: string
  ): Promise<{ success: boolean; folderId?: string; error?: string }> {
    const cacheKey = `${parentId || 'root'}_${folderName}`;
    
    if (this.folderCache.has(cacheKey)) {
      return { success: true, folderId: this.folderCache.get(cacheKey) };
    }

    const existingFolder = await driveService.findFolder(folderName, parentId);
    if (existingFolder.success && existingFolder.folderId) {
      this.folderCache.set(cacheKey, existingFolder.folderId);
      return { success: true, folderId: existingFolder.folderId };
    }

    const createResult = await driveService.createFolder({ name: folderName, parentId });
    if (createResult.success && createResult.folderId) {
      this.folderCache.set(cacheKey, createResult.folderId);
    }
    
    return createResult;
  }

  private async uploadToReplitStorage(options: {
    tenantId: string;
    userId: string;
    category: FileCategory;
    visibility: FileVisibility;
    fileName: string;
    mimeType: string;
    content: Buffer;
    animal?: AnimalContext;
  }): Promise<UploadResult> {
    try {
      let storagePath = options.category;
      if (options.animal) {
        storagePath = `${options.category}/${options.animal.id}`;
      }

      const { objectPath } = await this.objectStorage.uploadTenantFile(
        options.tenantId,
        storagePath,
        options.content,
        options.mimeType
      );

      // Only set ACL for private files - public files default to public read
      // without ACL metadata, which is more compatible with social media crawlers
      if (options.visibility === 'private') {
        const { setObjectAclPolicy } = await import('../objectAcl');
        const { parseObjectPath, objectStorageClient } = await import('../objectStorage');
        
        const privateDir = this.objectStorage.getPrivateObjectDir();
        const entityId = objectPath.slice('/objects/'.length);
        const fullPath = `${privateDir}/${entityId}`;
        const { bucketName, objectName } = parseObjectPath(fullPath);
        const file = objectStorageClient.bucket(bucketName).file(objectName);
        
        await setObjectAclPolicy(file, {
          owner: options.userId,
          visibility: options.visibility,
          tenantId: options.tenantId,
        });
      }

      return {
        success: true,
        fileUrl: objectPath,
        storageType: 'replit_object_storage',
      };
    } catch (error: any) {
      return {
        success: false,
        fileUrl: '',
        storageType: 'replit_object_storage',
        error: error.message || 'Failed to upload to Replit storage',
      };
    }
  }

  async getPresignedUploadUrl(options: {
    tenantId: string;
    userId: string;
    category: AnyCategory;
    visibility: FileVisibility;
    mimeType: string;
    animal?: AnimalContext;
  }): Promise<{
    success: boolean;
    uploadUrl?: string;
    fileUrl?: string;
    storageType: 'google_drive' | 'replit_object_storage';
    error?: string;
  }> {
    const category = normalizeCategory(options.category);
    const driveService = await DriveService.forTenant(options.tenantId);
    
    if (driveService && driveService.hasSharedDriveConfigured()) {
      return {
        success: false,
        storageType: 'google_drive',
        error: 'Google Drive does not support presigned URLs. Use uploadFile with content instead.',
      };
    }

    try {
      let storagePath = category as string;
      if (options.animal) {
        storagePath = `${category}/${options.animal.id}`;
      }

      const { url: uploadUrl, objectPath } = await this.objectStorage.getTenantUploadURL(
        options.tenantId,
        storagePath,
        options.mimeType
      );

      const fileUrl = `/objects/${objectPath.split('/').slice(1).join('/')}`;

      return {
        success: true,
        uploadUrl,
        fileUrl,
        storageType: 'replit_object_storage',
      };
    } catch (error: any) {
      return {
        success: false,
        storageType: 'replit_object_storage',
        error: error.message || 'Failed to get upload URL',
      };
    }
  }

  static async forTenant(tenantId: string): Promise<TenantFileStorage> {
    return new TenantFileStorage(tenantId);
  }

  async getStorageInfo(): Promise<{
    primaryStorage: 'google_drive' | 'replit_object_storage';
    googleDriveConnected: boolean;
    sharedDriveConfigured: boolean;
    sharedDriveId?: string;
  }> {
    const driveService = await DriveService.forTenant(this.tenantId);
    
    if (driveService && driveService.hasSharedDriveConfigured()) {
      return {
        primaryStorage: 'google_drive',
        googleDriveConnected: true,
        sharedDriveConfigured: true,
        sharedDriveId: driveService.getSharedDriveId(),
      };
    }

    return {
      primaryStorage: 'replit_object_storage',
      googleDriveConnected: !!driveService,
      sharedDriveConfigured: false,
    };
  }

  async moveAnimalToArchive(
    animal: AnimalContext,
    adoptedYear?: number
  ): Promise<{ success: boolean; error?: string }> {
    const driveService = await DriveService.forTenant(this.tenantId);
    
    if (!driveService || !driveService.hasSharedDriveConfigured()) {
      return { success: true };
    }

    try {
      const activeFolder = await this.getOrCreateFolder(driveService, ROOT_FOLDERS.ACTIVE_ANIMALS);
      if (!activeFolder.success || !activeFolder.folderId) {
        return { success: false, error: 'Could not find active animals folder' };
      }

      const searchPattern = `(ID_${animal.id})`;
      const existingFolder = await driveService.findFolderByPattern(searchPattern, activeFolder.folderId);
      
      if (!existingFolder.success || !existingFolder.folderId) {
        return { success: true };
      }

      const year = adoptedYear || new Date().getFullYear();
      const archiveFolder = await this.getOrCreateFolder(driveService, ROOT_FOLDERS.ADOPTED_ARCHIVE);
      if (!archiveFolder.success || !archiveFolder.folderId) {
        return { success: false, error: 'Could not create archive folder' };
      }

      const yearFolder = await this.getOrCreateFolder(driveService, `Year_${year}`, archiveFolder.folderId);
      if (!yearFolder.success || !yearFolder.folderId) {
        return { success: false, error: 'Could not create year folder' };
      }

      const moveResult = await driveService.moveFile(existingFolder.folderId, yearFolder.folderId);
      
      this.folderCache.clear();
      
      return moveResult;
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to move animal folder to archive' };
    }
  }

  /**
   * Delete a file from storage (Google Drive or Replit Object Storage)
   * 
   * @param fileUrl - The URL of the file to delete
   * @param driveFileId - Optional Google Drive file ID (if known)
   */
  async deleteFile(fileUrl: string, driveFileId?: string): Promise<{ success: boolean; error?: string }> {
    console.log(`[TENANT FILE STORAGE] deleteFile called: url=${fileUrl}, driveFileId=${driveFileId || 'none'}`);

    // If we have a Drive file ID, try to delete from Google Drive first
    if (driveFileId) {
      const driveService = await DriveService.forTenant(this.tenantId);
      
      if (driveService && driveService.hasSharedDriveConfigured()) {
        console.log(`[TENANT FILE STORAGE] Attempting Google Drive deletion for fileId: ${driveFileId}`);
        const driveResult = await driveService.deleteFile(driveFileId);
        
        if (driveResult.success) {
          console.log(`[TENANT FILE STORAGE] Google Drive deletion SUCCESS for fileId: ${driveFileId}`);
          return { success: true };
        } else {
          console.warn(`[TENANT FILE STORAGE] Google Drive deletion failed: ${driveResult.error}`);
          // Continue to try Replit storage deletion as fallback
        }
      }
    }

    // Check if URL is a Google Drive URL
    if (fileUrl.includes('drive.google.com') || fileUrl.includes('googleusercontent.com')) {
      // Extract file ID from Google Drive URL if not provided
      if (!driveFileId) {
        const idMatch = fileUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (idMatch) {
          const extractedId = idMatch[1];
          console.log(`[TENANT FILE STORAGE] Extracted Drive file ID from URL: ${extractedId}`);
          
          const driveService = await DriveService.forTenant(this.tenantId);
          if (driveService && driveService.hasSharedDriveConfigured()) {
            const driveResult = await driveService.deleteFile(extractedId);
            if (driveResult.success) {
              console.log(`[TENANT FILE STORAGE] Google Drive deletion SUCCESS for extracted fileId: ${extractedId}`);
              return { success: true };
            }
          }
        }
      }
      
      // If we get here with a Drive URL but couldn't delete, log it
      console.warn(`[TENANT FILE STORAGE] Could not delete Google Drive file: ${fileUrl}`);
      return { success: false, error: 'Could not delete file from Google Drive' };
    }

    // Try to delete from Replit Object Storage
    try {
      // Extract the object key from the URL
      const url = new URL(fileUrl);
      const objectKey = url.pathname.replace(/^\/objects\//, '');
      
      if (objectKey) {
        console.log(`[TENANT FILE STORAGE] Attempting Replit storage deletion for key: ${objectKey}`);
        await this.objectStorage.deleteObject(objectKey);
        console.log(`[TENANT FILE STORAGE] Replit storage deletion SUCCESS for key: ${objectKey}`);
        return { success: true };
      }
    } catch (error: any) {
      console.error(`[TENANT FILE STORAGE] Failed to delete from Replit storage:`, error.message);
    }

    return { success: true }; // Return success even if file wasn't found (idempotent deletion)
  }
}

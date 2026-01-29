import { DriveService } from './googleWorkspace';
import { ObjectStorageService } from '../objectStorage';
import { db } from '../db';
import { volunteerApplications, fosterApplications } from '@shared/schema';
import { eq } from 'drizzle-orm';

const ROOT_FOLDERS = {
  VOLUNTEERS: '03_Volunteers',
  FOSTERS: '04_Fosters',
};

const VOLUNTEER_SUBFOLDERS = ['Waivers', 'Training', 'Certifications', 'Notes'];
const FOSTER_SUBFOLDERS = ['Agreements', 'Updates', 'Notes'];

export interface BackupResult {
  success: boolean;
  folderId?: string;
  storageType: 'google_drive' | 'replit_object_storage';
  error?: string;
}

export class VolunteerFosterBackupService {
  private tenantId: string;
  private objectStorage: ObjectStorageService;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
    this.objectStorage = new ObjectStorageService();
  }

  private formatFolderName(name: string, id: string): string {
    const sanitizedName = name.replace(/[<>:"/\\|?*]/g, '_').trim();
    return `${sanitizedName} (ID_${id.substring(0, 8)})`;
  }

  private async getOrCreateDriveFolder(
    driveService: DriveService,
    folderName: string
  ): Promise<{ success: boolean; folderId?: string; error?: string }> {
    try {
      const existing = await driveService.findFolder(folderName);
      if (existing.success && existing.folderId) {
        return existing;
      }
      const created = await driveService.createFolder({ name: folderName });
      return created;
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async createVolunteerFolder(volunteerData: {
    id: string;
    applicantName: string;
    applicantEmail: string;
  }): Promise<BackupResult> {
    const folderName = this.formatFolderName(volunteerData.applicantName, volunteerData.id);
    console.log(`[VOLUNTEER BACKUP] Creating folder for volunteer: ${folderName}`);

    const driveService = await DriveService.forTenant(this.tenantId);
    const hasDriveConfig = driveService && driveService.hasSharedDriveConfigured();

    if (hasDriveConfig) {
      try {
        const volunteersFolder = await this.getOrCreateDriveFolder(driveService, ROOT_FOLDERS.VOLUNTEERS);
        if (!volunteersFolder.success || !volunteersFolder.folderId) {
          throw new Error(`Failed to get Volunteers folder: ${volunteersFolder.error}`);
        }

        const volunteerFolder = await driveService.createFolder({
          name: folderName,
          parentId: volunteersFolder.folderId,
        });

        if (!volunteerFolder.success || !volunteerFolder.folderId) {
          throw new Error(`Failed to create volunteer folder: ${volunteerFolder.error}`);
        }

        for (const subfolder of VOLUNTEER_SUBFOLDERS) {
          await driveService.createFolder({
            name: subfolder,
            parentId: volunteerFolder.folderId,
          });
        }

        await db.update(volunteerApplications)
          .set({ driveFolderId: volunteerFolder.folderId })
          .where(eq(volunteerApplications.id, volunteerData.id));

        console.log(`[VOLUNTEER BACKUP] Created Google Drive folder: ${volunteerFolder.folderId}`);
        return {
          success: true,
          folderId: volunteerFolder.folderId,
          storageType: 'google_drive',
        };
      } catch (error) {
        console.error(`[VOLUNTEER BACKUP] Google Drive folder creation failed:`, error);
      }
    }

    const objectStoragePath = `objects/${this.tenantId}/volunteers/${volunteerData.id}`;
    for (const subfolder of VOLUNTEER_SUBFOLDERS) {
      const placeholderPath = `${objectStoragePath}/${subfolder}/.folder`;
      try {
        await this.objectStorage.upload(placeholderPath, Buffer.from(''), 'text/plain');
      } catch (e) {
        console.log(`[VOLUNTEER BACKUP] Subfolder placeholder: ${subfolder}`);
      }
    }

    await db.update(volunteerApplications)
      .set({ driveFolderId: objectStoragePath })
      .where(eq(volunteerApplications.id, volunteerData.id));

    console.log(`[VOLUNTEER BACKUP] Created Object Storage folder: ${objectStoragePath}`);
    return {
      success: true,
      folderId: objectStoragePath,
      storageType: 'replit_object_storage',
    };
  }

  async createFosterFolder(fosterData: {
    id: string;
    applicantName: string;
    applicantEmail: string;
  }): Promise<BackupResult> {
    const folderName = this.formatFolderName(fosterData.applicantName, fosterData.id);
    console.log(`[FOSTER BACKUP] Creating folder for foster: ${folderName}`);

    const driveService = await DriveService.forTenant(this.tenantId);
    const hasDriveConfig = driveService && driveService.hasSharedDriveConfigured();

    if (hasDriveConfig) {
      try {
        const fostersFolder = await this.getOrCreateDriveFolder(driveService, ROOT_FOLDERS.FOSTERS);
        if (!fostersFolder.success || !fostersFolder.folderId) {
          throw new Error(`Failed to get Fosters folder: ${fostersFolder.error}`);
        }

        const fosterFolder = await driveService.createFolder({
          name: folderName,
          parentId: fostersFolder.folderId,
        });

        if (!fosterFolder.success || !fosterFolder.folderId) {
          throw new Error(`Failed to create foster folder: ${fosterFolder.error}`);
        }

        for (const subfolder of FOSTER_SUBFOLDERS) {
          await driveService.createFolder({
            name: subfolder,
            parentId: fosterFolder.folderId,
          });
        }

        await db.update(fosterApplications)
          .set({ driveFolderId: fosterFolder.folderId })
          .where(eq(fosterApplications.id, fosterData.id));

        console.log(`[FOSTER BACKUP] Created Google Drive folder: ${fosterFolder.folderId}`);
        return {
          success: true,
          folderId: fosterFolder.folderId,
          storageType: 'google_drive',
        };
      } catch (error) {
        console.error(`[FOSTER BACKUP] Google Drive folder creation failed:`, error);
      }
    }

    const objectStoragePath = `objects/${this.tenantId}/fosters/${fosterData.id}`;
    for (const subfolder of FOSTER_SUBFOLDERS) {
      const placeholderPath = `${objectStoragePath}/${subfolder}/.folder`;
      try {
        await this.objectStorage.upload(placeholderPath, Buffer.from(''), 'text/plain');
      } catch (e) {
        console.log(`[FOSTER BACKUP] Subfolder placeholder: ${subfolder}`);
      }
    }

    await db.update(fosterApplications)
      .set({ driveFolderId: objectStoragePath })
      .where(eq(fosterApplications.id, fosterData.id));

    console.log(`[FOSTER BACKUP] Created Object Storage folder: ${objectStoragePath}`);
    return {
      success: true,
      folderId: objectStoragePath,
      storageType: 'replit_object_storage',
    };
  }

  async uploadSignedDocument(params: {
    type: 'volunteer' | 'foster';
    applicationId: string;
    documentName: string;
    documentContent: string;
    subfolder: 'Waivers' | 'Agreements' | 'Training' | 'Certifications' | 'Updates' | 'Notes';
  }): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      const table = params.type === 'volunteer' ? volunteerApplications : fosterApplications;
      const [application] = await db.select().from(table).where(eq(table.id, params.applicationId));
      
      if (!application) {
        return { success: false, error: `${params.type} application not found` };
      }

      const sanitizedName = params.documentName.replace(/[<>:"/\\|?*]/g, '_');
      const fileName = `${sanitizedName}_${new Date().toISOString().split('T')[0]}.html`;
      const buffer = Buffer.from(params.documentContent, 'utf-8');

      const driveService = await DriveService.forTenant(this.tenantId);
      const hasDriveConfig = driveService && driveService.hasSharedDriveConfigured();

      if (hasDriveConfig && application.driveFolderId) {
        const subfolder = await driveService.findFolder(params.subfolder, application.driveFolderId);
        if (subfolder.success && subfolder.folderId) {
          await driveService.uploadFile({
            name: fileName,
            mimeType: 'text/html',
            content: buffer,
            parentId: subfolder.folderId,
          });
          console.log(`[${params.type.toUpperCase()} BACKUP] Uploaded ${params.documentName} to Google Drive`);
          return { success: true, filePath: `drive://${subfolder.folderId}/${fileName}` };
        }
      }

      const typeFolder = params.type === 'volunteer' ? 'volunteers' : 'fosters';
      const path = `objects/${this.tenantId}/${typeFolder}/${params.applicationId}/${params.subfolder}/${fileName}`;
      await this.objectStorage.upload(path, buffer, 'text/html');
      console.log(`[${params.type.toUpperCase()} BACKUP] Uploaded ${params.documentName} to Object Storage`);
      return { success: true, filePath: path };
    } catch (error) {
      console.error(`[${params.type.toUpperCase()} BACKUP] Failed to upload document:`, error);
      return { success: false, error: String(error) };
    }
  }
}

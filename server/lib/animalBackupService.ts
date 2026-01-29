import { DriveService } from './googleWorkspace';
import { ObjectStorageService } from '../objectStorage';
import { db } from '../db';
import { animals, vaccineRecords, medicalPrescriptions, procedureLogs, diagnosticTests, medicalExams } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const ROOT_FOLDERS = {
  ACTIVE_ANIMALS: '01_Active_Animals',
  ADOPTED_ARCHIVE: '02_Adopted_Archive',
};

const ANIMAL_SUBFOLDERS = ['Photos', 'Medical', 'Contracts', 'Foster Updates'];

export interface AnimalBackupResult {
  success: boolean;
  folderId?: string;
  storageType: 'google_drive' | 'replit_object_storage';
  error?: string;
}

export class AnimalBackupService {
  private tenantId: string;
  private objectStorage: ObjectStorageService;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
    this.objectStorage = new ObjectStorageService();
  }

  private formatAnimalFolderName(name: string, animalId: string): string {
    const sanitizedName = name.replace(/[<>:"/\\|?*]/g, '_').trim();
    return `${sanitizedName} (ID_${animalId.substring(0, 8)})`;
  }

  async createAnimalFolder(animalData: {
    id: string;
    name: string;
    intakeDate?: Date;
  }): Promise<AnimalBackupResult> {
    const folderName = this.formatAnimalFolderName(animalData.name, animalData.id);
    console.log(`[ANIMAL BACKUP] Creating folder for animal: ${folderName}`);

    const driveService = await DriveService.forTenant(this.tenantId);
    const hasDriveConfig = driveService && driveService.hasSharedDriveConfigured();

    if (hasDriveConfig) {
      try {
        const activeAnimalsFolder = await this.getOrCreateDriveFolder(driveService, ROOT_FOLDERS.ACTIVE_ANIMALS);
        if (!activeAnimalsFolder.success || !activeAnimalsFolder.folderId) {
          throw new Error(`Failed to get Active Animals folder: ${activeAnimalsFolder.error}`);
        }

        const animalFolder = await driveService.createFolder({
          name: folderName,
          parentId: activeAnimalsFolder.folderId,
        });

        if (!animalFolder.success || !animalFolder.folderId) {
          throw new Error(`Failed to create animal folder: ${animalFolder.error}`);
        }

        for (const subfolder of ANIMAL_SUBFOLDERS) {
          await driveService.createFolder({
            name: subfolder,
            parentId: animalFolder.folderId,
          });
        }

        await db.update(animals)
          .set({ driveFolderId: animalFolder.folderId })
          .where(eq(animals.id, animalData.id));

        console.log(`[ANIMAL BACKUP] Created Google Drive folder: ${animalFolder.folderId}`);
        return {
          success: true,
          folderId: animalFolder.folderId,
          storageType: 'google_drive',
        };
      } catch (error) {
        console.error(`[ANIMAL BACKUP] Google Drive folder creation failed:`, error);
      }
    }

    const objectStoragePath = `objects/${this.tenantId}/animals/${animalData.id}`;
    for (const subfolder of ANIMAL_SUBFOLDERS) {
      const placeholderPath = `${objectStoragePath}/${subfolder}/.folder`;
      try {
        await this.objectStorage.upload(placeholderPath, Buffer.from(''), 'text/plain');
      } catch (e) {
        console.log(`[ANIMAL BACKUP] Subfolder placeholder: ${subfolder}`);
      }
    }

    await db.update(animals)
      .set({ driveFolderId: objectStoragePath })
      .where(eq(animals.id, animalData.id));

    console.log(`[ANIMAL BACKUP] Created Object Storage folder: ${objectStoragePath}`);
    return {
      success: true,
      folderId: objectStoragePath,
      storageType: 'replit_object_storage',
    };
  }

  async generateIntakeDocument(animalId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const [animal] = await db.select().from(animals).where(eq(animals.id, animalId));
      if (!animal) {
        return { success: false, error: 'Animal not found' };
      }

      const intakeDate = animal.intakeDate ? new Date(animal.intakeDate).toLocaleDateString() : 'Unknown';
      const content = `
INTAKE RECORD
=============
Generated: ${new Date().toLocaleString()}

ANIMAL INFORMATION
------------------
Name: ${animal.name}
Animal ID: ${animal.animalId}
Species: ${animal.species || 'Unknown'}
Breed: ${animal.breed || 'Unknown'}
Age: ${animal.age || 'Unknown'}
Sex: ${animal.sex || 'Unknown'}
Neuter Status: ${animal.neuterStatus || 'Unknown'}
Weight: ${animal.weight || 'Not recorded'}

INTAKE DETAILS
--------------
Intake Date: ${intakeDate}
Intake Source: ${animal.intakeSource || 'Not specified'}

MEDICAL STATUS
--------------
Medical Status: ${animal.medicalStatus || 'healthy'}
Medical Alert: ${animal.medicalAlertMemo || 'None'}
Heartworm: ${animal.heartwormPositive ? 'Positive' : 'Negative/Unknown'}
Shots Current: ${animal.shotsCurrent ? 'Yes' : 'No/Unknown'}
Special Needs: ${animal.specialNeeds ? 'Yes' : 'No'}

BEHAVIOR & COMPATIBILITY
------------------------
Child Friendly: ${animal.childFriendly ? 'Yes' : 'Unknown'}
Dog Friendly: ${animal.dogFriendly ? 'Yes' : 'Unknown'}
Cat Friendly: ${animal.catFriendly ? 'Yes' : 'Unknown'}
Activity Level: ${animal.activityLevel || 'Not assessed'}

NOTES
-----
${animal.bio || 'No notes recorded.'}
`.trim();

      const fileName = `Intake_Record_${animal.animalId}_${intakeDate.replace(/\//g, '-')}.txt`;
      const buffer = Buffer.from(content, 'utf-8');

      const driveService = await DriveService.forTenant(this.tenantId);
      const hasDriveConfig = driveService && driveService.hasSharedDriveConfigured();

      if (hasDriveConfig && animal.driveFolderId) {
        const medicalFolder = await driveService.findFolder('Medical', animal.driveFolderId);
        if (medicalFolder.success && medicalFolder.folderId) {
          await driveService.uploadFile({
            name: fileName,
            mimeType: 'text/plain',
            content: buffer,
            parentId: medicalFolder.folderId,
          });
          console.log(`[ANIMAL BACKUP] Uploaded intake record to Google Drive`);
        }
      } else {
        const path = `objects/${this.tenantId}/animals/${animalId}/Medical/${fileName}`;
        await this.objectStorage.upload(path, buffer, 'text/plain');
        console.log(`[ANIMAL BACKUP] Uploaded intake record to Object Storage`);
      }

      return { success: true };
    } catch (error) {
      console.error(`[ANIMAL BACKUP] Failed to generate intake document:`, error);
      return { success: false, error: String(error) };
    }
  }

  async syncMedicalRecords(animalId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const [animal] = await db.select().from(animals).where(eq(animals.id, animalId));
      if (!animal) {
        return { success: false, error: 'Animal not found' };
      }

      const [vaccines, prescriptions, procedures, diagnostics, exams] = await Promise.all([
        db.select().from(vaccineRecords).where(eq(vaccineRecords.animalId, animalId)),
        db.select().from(medicalPrescriptions).where(eq(medicalPrescriptions.animalId, animalId)),
        db.select().from(procedureLogs).where(eq(procedureLogs.animalId, animalId)),
        db.select().from(diagnosticTests).where(eq(diagnosticTests.animalId, animalId)),
        db.select().from(medicalExams).where(eq(medicalExams.animalId, animalId)),
      ]);

      let content = `
MEDICAL RECORDS SUMMARY
=======================
Animal: ${animal.name} (${animal.animalId})
Generated: ${new Date().toLocaleString()}

`;

      content += `VACCINATIONS (${vaccines.length} records)\n`;
      content += '-'.repeat(40) + '\n';
      for (const v of vaccines) {
        const date = v.dateGiven ? new Date(v.dateGiven).toLocaleDateString() : 'Unknown';
        content += `- ${v.itemName} | Date: ${date} | Next Due: ${v.dateDue ? new Date(v.dateDue).toLocaleDateString() : 'N/A'}\n`;
      }

      content += `\nPRESCRIPTIONS (${prescriptions.length} records)\n`;
      content += '-'.repeat(40) + '\n';
      for (const p of prescriptions) {
        const startDate = p.startDate ? new Date(p.startDate).toLocaleDateString() : 'Unknown';
        content += `- ${p.medicationName} | ${p.dosage} | Started: ${startDate} | Status: ${p.status}\n`;
      }

      content += `\nPROCEDURES (${procedures.length} records)\n`;
      content += '-'.repeat(40) + '\n';
      for (const proc of procedures) {
        const date = proc.procedureDate ? new Date(proc.procedureDate).toLocaleDateString() : 'Scheduled';
        content += `- ${proc.procedureName} | Date: ${date} | Status: ${proc.status}\n`;
      }

      content += `\nDIAGNOSTICS (${diagnostics.length} records)\n`;
      content += '-'.repeat(40) + '\n';
      for (const d of diagnostics) {
        const date = d.testDate ? new Date(d.testDate).toLocaleDateString() : 'Unknown';
        content += `- ${d.testName} | Date: ${date} | Result: ${d.result || 'Pending'}\n`;
      }

      content += `\nVET EXAMS (${exams.length} records)\n`;
      content += '-'.repeat(40) + '\n';
      for (const e of exams) {
        const date = e.examDate ? new Date(e.examDate).toLocaleDateString() : 'Unknown';
        content += `- ${e.examType} | Date: ${date} | Performed By: ${e.performedBy || 'Not recorded'}\n`;
      }

      const fileName = `Medical_Summary_${animal.animalId}_${new Date().toISOString().split('T')[0]}.txt`;
      const buffer = Buffer.from(content, 'utf-8');

      const driveService = await DriveService.forTenant(this.tenantId);
      const hasDriveConfig = driveService && driveService.hasSharedDriveConfigured();

      if (hasDriveConfig && animal.driveFolderId) {
        const medicalFolder = await driveService.findFolder('Medical', animal.driveFolderId);
        if (medicalFolder.success && medicalFolder.folderId) {
          await driveService.uploadFile({
            name: fileName,
            mimeType: 'text/plain',
            content: buffer,
            parentId: medicalFolder.folderId,
          });
          console.log(`[ANIMAL BACKUP] Synced medical records to Google Drive`);
        }
      } else {
        const path = `objects/${this.tenantId}/animals/${animalId}/Medical/${fileName}`;
        await this.objectStorage.upload(path, buffer, 'text/plain');
        console.log(`[ANIMAL BACKUP] Synced medical records to Object Storage`);
      }

      return { success: true };
    } catch (error) {
      console.error(`[ANIMAL BACKUP] Failed to sync medical records:`, error);
      return { success: false, error: String(error) };
    }
  }

  async moveToAdoptedArchive(animalId: string, adoptionYear: number): Promise<{ success: boolean; error?: string }> {
    try {
      const [animal] = await db.select().from(animals).where(eq(animals.id, animalId));
      if (!animal || !animal.driveFolderId) {
        return { success: false, error: 'Animal not found or no Drive folder' };
      }

      const driveService = await DriveService.forTenant(this.tenantId);
      if (!driveService || !driveService.hasSharedDriveConfigured()) {
        console.log(`[ANIMAL BACKUP] No Drive configured - skipping archive move`);
        return { success: true };
      }

      const archiveFolder = await this.getOrCreateDriveFolder(driveService, ROOT_FOLDERS.ADOPTED_ARCHIVE);
      if (!archiveFolder.success || !archiveFolder.folderId) {
        return { success: false, error: 'Could not access archive folder' };
      }

      const yearFolder = await this.getOrCreateDriveFolder(driveService, `Year_${adoptionYear}`, archiveFolder.folderId);
      if (!yearFolder.success || !yearFolder.folderId) {
        return { success: false, error: 'Could not create year folder' };
      }

      await driveService.moveFile(animal.driveFolderId, yearFolder.folderId);
      console.log(`[ANIMAL BACKUP] Moved ${animal.name} to adopted archive Year_${adoptionYear}`);

      return { success: true };
    } catch (error) {
      console.error(`[ANIMAL BACKUP] Failed to move to archive:`, error);
      return { success: false, error: String(error) };
    }
  }

  private async getOrCreateDriveFolder(
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
}

export async function createAnimalBackup(tenantId: string, animalData: {
  id: string;
  name: string;
  intakeDate?: Date;
}): Promise<AnimalBackupResult> {
  const service = new AnimalBackupService(tenantId);
  const folderResult = await service.createAnimalFolder(animalData);
  
  if (folderResult.success) {
    await service.generateIntakeDocument(animalData.id);
  }
  
  return folderResult;
}

export async function syncAnimalMedicalRecords(tenantId: string, animalId: string): Promise<{ success: boolean; error?: string }> {
  const service = new AnimalBackupService(tenantId);
  return service.syncMedicalRecords(animalId);
}

export async function archiveAdoptedAnimal(tenantId: string, animalId: string, adoptionYear: number): Promise<{ success: boolean; error?: string }> {
  const service = new AnimalBackupService(tenantId);
  await service.syncMedicalRecords(animalId);
  return service.moveToAdoptedArchive(animalId, adoptionYear);
}

import { db } from '../db';
import { animals, platformIntegrations, animalPlatformSyncs } from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { encrypt, decrypt } from '../lib/encryption';
import { PETFINDER_BREEDS } from '@shared/petfinder-breeds';
import * as ftp from 'basic-ftp';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface PetfinderAnimalRow {
  Code: string;
  Name: string;
  Breed: string;
  Mix: string;
  Sex: string;
  Size: string;
  'Color 1': string;
  'Color 2': string;
  'Color 3': string;
  Age: string;
  Description: string;
  Type: string;
  Shots: string;
  Altered: string;
  NoDogs: string;
  NoCats: string;
  NoKids: string;
  Housetrained: string;
  Declawed: string;
  SpecialNeeds: string;
  'Photo 1': string;
  'Photo 2': string;
  'Photo 3': string;
  'Photo 4': string;
  'Photo 5': string;
  'Photo 6': string;
  'Arrival Date': string;
  'Birth Date': string;
}

const PETFINDER_COLUMNS = [
  'Code', 'Name', 'Breed', 'Mix', 'Sex', 'Size', 'Color 1', 'Color 2', 'Color 3',
  'Age', 'Description', 'Type', 'Shots', 'Altered', 'NoDogs', 'NoCats', 'NoKids',
  'Housetrained', 'Declawed', 'SpecialNeeds', 'Photo 1', 'Photo 2', 'Photo 3',
  'Photo 4', 'Photo 5', 'Photo 6', 'Arrival Date', 'Birth Date'
];

function mapSpeciesToType(species: string): string {
  const speciesMap: Record<string, string> = {
    'dog': 'Dog',
    'cat': 'Cat',
    'rabbit': 'Rabbit',
    'bird': 'Bird',
    'horse': 'Horse',
    'pig': 'Pig',
    'guinea pig': 'Small&Furry',
    'hamster': 'Small&Furry',
    'ferret': 'Small&Furry',
    'chinchilla': 'Small&Furry',
    'reptile': 'Scales, Fins & Other',
    'fish': 'Scales, Fins & Other',
    'barnyard': 'Barnyard',
    'other': 'Small&Furry',
  };
  return speciesMap[species.toLowerCase()] || 'Small&Furry';
}

function mapSexToCode(sex: string | null): string {
  if (!sex) return 'm';
  const sexLower = sex.toLowerCase();
  if (sexLower === 'female' || sexLower === 'f') return 'f';
  return 'm';
}

function mapSizeToCode(size: string | null, weight: number | null): string {
  if (size) {
    const sizeLower = size.toLowerCase();
    if (sizeLower.includes('small') || sizeLower.includes('toy')) return 'S';
    if (sizeLower.includes('medium')) return 'M';
    if (sizeLower.includes('large') && !sizeLower.includes('extra')) return 'L';
    if (sizeLower.includes('extra') || sizeLower.includes('xlarge')) return 'XL';
  }
  if (weight) {
    if (weight < 20) return 'S';
    if (weight < 50) return 'M';
    if (weight < 90) return 'L';
    return 'XL';
  }
  return 'M';
}

function calculateAge(birthDate: Date | null, intakeDate: Date | null): string {
  const refDate = birthDate || intakeDate || new Date();
  const now = new Date();
  const ageInMonths = (now.getFullYear() - refDate.getFullYear()) * 12 + 
                      (now.getMonth() - refDate.getMonth());
  
  if (ageInMonths < 6) return 'Baby';
  if (ageInMonths < 24) return 'Young';
  if (ageInMonths < 96) return 'Adult';
  return 'Senior';
}

function mapBreedToPetfinder(breed: string, species: string): string {
  const breedList = PETFINDER_BREEDS[species as keyof typeof PETFINDER_BREEDS] || [];
  
  const normalizedBreed = breed.toLowerCase().trim();
  const exactMatch = breedList.find(b => b.toLowerCase() === normalizedBreed);
  if (exactMatch) return exactMatch;
  
  const partialMatch = breedList.find(b => 
    b.toLowerCase().includes(normalizedBreed) || 
    normalizedBreed.includes(b.toLowerCase())
  );
  if (partialMatch) return partialMatch;
  
  return 'Mixed Breed';
}

function boolToYesNo(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  return value ? 'yes' : 'no';
}

function boolToYesNoInverted(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  return value === false ? 'yes' : 'no';
}

function formatDate(date: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function generatePetfinderCSV(tenantId: string): Promise<{ csv: string; animals: any[] }> {
  const availableAnimals = await db
    .select()
    .from(animals)
    .where(and(
      eq(animals.tenantId, tenantId),
      inArray(animals.status, ['available', 'fostered'])
    ));

  const rows: string[] = [];
  
  rows.push(PETFINDER_COLUMNS.map(escapeCSVField).join(','));

  for (const animal of availableAnimals) {
    const photos = (animal.photos as string[]) || [];
    const photoFilenames = photos.slice(0, 6).map((_, i) => `${animal.id}_${i + 1}.jpg`);
    
    const breedValue = mapBreedToPetfinder(animal.breed || 'Mixed', animal.species);
    const isMix = breedValue.toLowerCase().includes('mixed') || 
                  breedValue.toLowerCase().includes('mix') ||
                  (animal.secondaryBreed && animal.secondaryBreed.trim().length > 0);
    
    const row: PetfinderAnimalRow = {
      Code: animal.id,
      Name: animal.name,
      Breed: breedValue,
      Mix: isMix ? 'yes' : 'no',
      Sex: mapSexToCode(animal.sex),
      Size: mapSizeToCode(animal.size, animal.weight),
      'Color 1': animal.color || '',
      'Color 2': '',
      'Color 3': '',
      Age: calculateAge(animal.birthDate, animal.intakeDate),
      Description: (animal.description || '').replace(/<[^>]*>/g, '').substring(0, 5000),
      Type: mapSpeciesToType(animal.species),
      Shots: boolToYesNo(animal.vaccinated),
      Altered: boolToYesNo(animal.spayedNeutered),
      NoDogs: boolToYesNoInverted(animal.goodWithDogs),
      NoCats: boolToYesNoInverted(animal.goodWithCats),
      NoKids: boolToYesNoInverted(animal.goodWithChildren),
      Housetrained: boolToYesNo(animal.houseTrained),
      Declawed: boolToYesNo(animal.declawed),
      SpecialNeeds: boolToYesNo(animal.specialNeeds),
      'Photo 1': photoFilenames[0] || '',
      'Photo 2': photoFilenames[1] || '',
      'Photo 3': photoFilenames[2] || '',
      'Photo 4': photoFilenames[3] || '',
      'Photo 5': photoFilenames[4] || '',
      'Photo 6': photoFilenames[5] || '',
      'Arrival Date': formatDate(animal.intakeDate),
      'Birth Date': formatDate(animal.birthDate),
    };

    const rowValues = PETFINDER_COLUMNS.map(col => escapeCSVField(row[col as keyof PetfinderAnimalRow] || ''));
    rows.push(rowValues.join(','));
  }

  return { csv: rows.join('\n'), animals: availableAnimals };
}

async function downloadImage(url: string, destPath: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(destPath, Buffer.from(buffer));
    return true;
  } catch (error) {
    console.error(`Failed to download image ${url}:`, error);
    return false;
  }
}

export async function syncToPetfinder(tenantId: string): Promise<{
  success: boolean;
  message: string;
  animalsExported: number;
  imagesUploaded: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let animalsExported = 0;
  let imagesUploaded = 0;

  const integration = await db
    .select()
    .from(platformIntegrations)
    .where(and(
      eq(platformIntegrations.tenantId, tenantId),
      eq(platformIntegrations.platform, 'petfinder'),
      eq(platformIntegrations.isEnabled, true)
    ))
    .limit(1);

  if (integration.length === 0) {
    return {
      success: false,
      message: 'Petfinder integration not configured or disabled',
      animalsExported: 0,
      imagesUploaded: 0,
      errors: ['Integration not found'],
    };
  }

  const config = integration[0];
  
  if (!config.ftpHost || !config.ftpUsernameEncrypted || !config.ftpPasswordEncrypted) {
    return {
      success: false,
      message: 'FTP credentials not configured. Please add your Petfinder FTP credentials in settings.',
      animalsExported: 0,
      imagesUploaded: 0,
      errors: ['FTP credentials missing'],
    };
  }

  const ftpHost = config.ftpHost;
  const ftpUsername = decrypt(config.ftpUsernameEncrypted);
  const ftpPassword = decrypt(config.ftpPasswordEncrypted);
  const ftpPath = config.ftpPath || '/';

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'petfinder-sync-'));
  
  try {
    const { csv, animals: exportedAnimals } = await generatePetfinderCSV(tenantId);
    
    const csvPath = path.join(tempDir, 'import.csv');
    fs.writeFileSync(csvPath, csv, 'utf-8');
    animalsExported = exportedAnimals.length;

    for (const animal of exportedAnimals) {
      const photos = (animal.photos as string[]) || [];
      for (let i = 0; i < Math.min(photos.length, 6); i++) {
        const photoUrl = photos[i];
        const filename = `${animal.id}_${i + 1}.jpg`;
        const imagePath = path.join(tempDir, filename);
        
        if (await downloadImage(photoUrl, imagePath)) {
          imagesUploaded++;
        } else {
          errors.push(`Failed to download image for ${animal.name}: ${photoUrl}`);
        }
      }
    }

    const client = new ftp.Client();
    client.ftp.verbose = false;
    
    try {
      await client.access({
        host: ftpHost,
        user: ftpUsername,
        password: ftpPassword,
        secure: false,
      });

      if (ftpPath && ftpPath !== '/') {
        try {
          await client.cd(ftpPath);
        } catch (cdError) {
          errors.push(`Could not change to directory ${ftpPath}, using root`);
        }
      }

      const imageFiles = fs.readdirSync(tempDir).filter(f => f.endsWith('.jpg'));
      for (const imageFile of imageFiles) {
        try {
          await client.uploadFrom(path.join(tempDir, imageFile), imageFile);
        } catch (uploadError: any) {
          errors.push(`Failed to upload ${imageFile}: ${uploadError.message}`);
        }
      }

      await client.uploadFrom(csvPath, 'import.csv');

      client.close();
    } catch (ftpError: any) {
      client.close();
      throw new Error(`FTP connection failed: ${ftpError.message}`);
    }

    await db
      .update(platformIntegrations)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: errors.length > 0 ? 'partial' : 'success',
        lastSyncError: errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
        totalSynced: animalsExported,
        totalErrors: errors.length,
        updatedAt: new Date(),
      })
      .where(eq(platformIntegrations.id, config.id));

    for (const animal of exportedAnimals) {
      const existingSync = await db
        .select()
        .from(animalPlatformSyncs)
        .where(and(
          eq(animalPlatformSyncs.animalId, animal.id),
          eq(animalPlatformSyncs.platform, 'petfinder')
        ))
        .limit(1);

      if (existingSync.length > 0) {
        await db
          .update(animalPlatformSyncs)
          .set({
            status: 'active',
            lastSyncedAt: new Date(),
            lastSyncStatus: 'success',
            updatedAt: new Date(),
          })
          .where(eq(animalPlatformSyncs.id, existingSync[0].id));
      } else {
        await db
          .insert(animalPlatformSyncs)
          .values({
            tenantId,
            animalId: animal.id,
            platform: 'petfinder',
            platformAnimalId: animal.id,
            status: 'active',
            lastSyncStatus: 'success',
          });
      }
    }

    return {
      success: true,
      message: `Successfully exported ${animalsExported} animals to Petfinder`,
      animalsExported,
      imagesUploaded,
      errors,
    };

  } catch (error: any) {
    await db
      .update(platformIntegrations)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: 'error',
        lastSyncError: error.message,
        updatedAt: new Date(),
      })
      .where(eq(platformIntegrations.id, config.id));

    return {
      success: false,
      message: `Sync failed: ${error.message}`,
      animalsExported: 0,
      imagesUploaded: 0,
      errors: [error.message, ...errors],
    };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error('Failed to cleanup temp directory:', cleanupError);
    }
  }
}

export async function runScheduledPetfinderSync(): Promise<void> {
  console.log('[Petfinder Sync] Starting scheduled sync for all enabled tenants...');
  
  const enabledIntegrations = await db
    .select()
    .from(platformIntegrations)
    .where(and(
      eq(platformIntegrations.platform, 'petfinder'),
      eq(platformIntegrations.isEnabled, true),
      eq(platformIntegrations.autoSync, true)
    ));

  const currentHour = new Date().getUTCHours();
  
  for (const integration of enabledIntegrations) {
    const syncFrequency = integration.syncFrequency || 'daily';
    
    // Skip manual sync tenants (shouldn't have autoSync=true, but double-check)
    if (syncFrequency === 'manual') {
      continue;
    }
    
    // Daily sync only runs at midnight UTC
    if (syncFrequency === 'daily' && currentHour !== 0) {
      console.log(`[Petfinder Sync] Skipping tenant ${integration.tenantId} (daily sync, not midnight)`);
      continue;
    }
    
    // "frequent" and legacy "hourly" sync runs on every scheduled execution (every 6 hours)
    console.log(`[Petfinder Sync] Syncing tenant ${integration.tenantId} (${syncFrequency})...`);
    try {
      const result = await syncToPetfinder(integration.tenantId);
      console.log(`[Petfinder Sync] Tenant ${integration.tenantId}: ${result.message}`);
    } catch (error: any) {
      console.error(`[Petfinder Sync] Error for tenant ${integration.tenantId}:`, error.message);
    }
  }
  
  console.log('[Petfinder Sync] Scheduled sync complete.');
}

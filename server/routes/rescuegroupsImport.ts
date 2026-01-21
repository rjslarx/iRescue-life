import { Router } from 'express';
import { db } from '../db';
import { animals } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import { Readable } from 'stream';
import csvParser from 'csv-parser';
import axios from 'axios';
import { ObjectStorageService } from '../objectStorage';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || 
        file.originalname.endsWith('.csv') ||
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

interface RescueGroupsRow {
  AnimalID?: string;
  AnimalName?: string;
  AnimalBreed?: string;
  AnimalBreedPrimary?: string;
  AnimalBreedSecondary?: string;
  AnimalSex?: string;
  AnimalBirthdate?: string;
  AnimalDescription?: string;
  AnimalDescriptionPlain?: string;
  AnimalStatus?: string;
  AnimalSpecies?: string;
  AnimalColor?: string;
  AnimalCoatLength?: string;
  AnimalSize?: string;
  AnimalGeneralAge?: string;
  AnimalAltered?: string;
  AnimalHousetrained?: string;
  AnimalDeclawed?: string;
  AnimalSpecialNeeds?: string;
  AnimalCurrentShotsUptodate?: string;
  AnimalOKWithAdults?: string;
  AnimalOKWithDogs?: string;
  AnimalOKWithCats?: string;
  AnimalOKWithKids?: string;
  AnimalPictures?: string;
  AnimalPrimaryPhotoUrl?: string;
  AnimalPhoto1?: string;
  AnimalPhoto2?: string;
  AnimalPhoto3?: string;
  [key: string]: string | undefined;
}

function parseGender(sex: string | undefined): 'male' | 'female' | 'unknown' {
  if (!sex) return 'unknown';
  const normalized = sex.toLowerCase().trim();
  if (normalized === 'male' || normalized === 'm') return 'male';
  if (normalized === 'female' || normalized === 'f') return 'female';
  return 'unknown';
}

function parsePetfinderGender(sex: string | undefined): 'Male' | 'Female' | 'Unknown' {
  if (!sex) return 'Unknown';
  const normalized = sex.toLowerCase().trim();
  if (normalized === 'male' || normalized === 'm') return 'Male';
  if (normalized === 'female' || normalized === 'f') return 'Female';
  return 'Unknown';
}

function parseStatus(status: string | undefined): 'available' | 'pending' | 'adopted' | 'foster' | 'medical_hold' | 'stray_hold' | 'bite_hold' | 'deceased' | 'pending_transport' | 'transferred_out' {
  if (!status) return 'available';
  const normalized = status.toLowerCase().trim();
  if (normalized === 'available' || normalized === 'adoptable' || normalized === 'active') return 'available';
  if (normalized === 'adopted' || normalized === 'alumni' || normalized === 'closed' || normalized === 'placed') return 'adopted';
  if (normalized === 'pending' || normalized === 'hold' || normalized === 'on hold' || normalized === 'application' || normalized === 'reserved') return 'pending';
  if (normalized === 'foster' || normalized === 'fostered' || normalized === 'in foster' || normalized === 'foster care') return 'foster';
  if (normalized === 'medical' || normalized === 'medical_hold' || normalized === 'medical hold' || normalized === 'quarantine' || normalized === 'treatment') return 'medical_hold';
  if (normalized === 'stray' || normalized === 'stray_hold' || normalized === 'stray hold' || normalized === 'intake') return 'stray_hold';
  if (normalized === 'bite' || normalized === 'bite_hold' || normalized === 'bite hold' || normalized === 'bite quarantine') return 'bite_hold';
  if (normalized === 'deceased' || normalized === 'passed' || normalized === 'died' || normalized === 'euthanized' || normalized === 'rainbow bridge') return 'deceased';
  if (normalized === 'transfer' || normalized === 'transferred' || normalized === 'transferred_out') return 'transferred_out';
  if (normalized === 'transport' || normalized === 'pending_transport' || normalized === 'pending transport') return 'pending_transport';
  return 'available';
}

function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

function parseBoolean(value: string | undefined): boolean | null {
  if (!value) return null;
  const normalized = value.toLowerCase().trim();
  if (normalized === 'yes' || normalized === 'true' || normalized === '1') return true;
  if (normalized === 'no' || normalized === 'false' || normalized === '0') return false;
  return null;
}

function parseNeuterStatus(altered: string | undefined, sex: string | undefined): 'intact' | 'neutered' | 'spayed' | 'unknown' {
  const isAltered = parseBoolean(altered);
  if (isAltered === null) return 'unknown';
  if (!isAltered) return 'intact';
  const gender = parseGender(sex);
  if (gender === 'male') return 'neutered';
  if (gender === 'female') return 'spayed';
  return 'unknown';
}

function parsePetfinderAge(age: string | undefined): 'Baby' | 'Young' | 'Adult' | 'Senior' | undefined {
  if (!age) return undefined;
  const normalized = age.toLowerCase().trim();
  if (normalized === 'baby' || normalized === 'kitten' || normalized === 'puppy') return 'Baby';
  if (normalized === 'young' || normalized === 'junior') return 'Young';
  if (normalized === 'adult') return 'Adult';
  if (normalized === 'senior') return 'Senior';
  return undefined;
}

function parsePetfinderSize(size: string | undefined): 'Small' | 'Medium' | 'Large' | 'Extra Large' | undefined {
  if (!size) return undefined;
  const normalized = size.toLowerCase().trim();
  if (normalized === 'small' || normalized === 's') return 'Small';
  if (normalized === 'medium' || normalized === 'm') return 'Medium';
  if (normalized === 'large' || normalized === 'l') return 'Large';
  if (normalized === 'extra large' || normalized === 'xl' || normalized === 'xlarge') return 'Extra Large';
  return undefined;
}

function parsePetfinderType(species: string | undefined): 'Dog' | 'Cat' | 'Rabbit' | 'Small & Furry' | 'Horse' | 'Bird' | 'Scales, Fins & Other' | 'Barnyard' | undefined {
  if (!species) return undefined;
  const normalized = species.toLowerCase().trim();
  if (normalized === 'dog' || normalized === 'canine') return 'Dog';
  if (normalized === 'cat' || normalized === 'feline') return 'Cat';
  if (normalized === 'rabbit' || normalized === 'bunny') return 'Rabbit';
  if (normalized === 'horse' || normalized === 'equine') return 'Horse';
  if (normalized === 'bird') return 'Bird';
  if (normalized.includes('small') || normalized === 'hamster' || normalized === 'guinea pig' || normalized === 'ferret') return 'Small & Furry';
  if (normalized === 'fish' || normalized === 'reptile' || normalized === 'amphibian' || normalized === 'snake') return 'Scales, Fins & Other';
  if (normalized === 'pig' || normalized === 'goat' || normalized === 'sheep' || normalized === 'cow' || normalized === 'llama') return 'Barnyard';
  return undefined;
}

interface DownloadedImage {
  buffer: Buffer;
  mimeType: string;
}

async function downloadImage(url: string): Promise<DownloadedImage | null> {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'iRescue-Platform/1.0',
      },
    });
    
    const contentType = response.headers['content-type'] || 'image/jpeg';
    let mimeType = 'image/jpeg';
    
    if (contentType.includes('png')) {
      mimeType = 'image/png';
    } else if (contentType.includes('webp')) {
      mimeType = 'image/webp';
    } else if (contentType.includes('gif')) {
      mimeType = 'image/gif';
    }
    
    return {
      buffer: Buffer.from(response.data),
      mimeType,
    };
  } catch (error) {
    console.log(`[RescueGroups Import] Failed to download image from ${url}:`, error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

async function uploadImageToStorage(
  buffer: Buffer, 
  animalId: string, 
  tenantId: string, 
  mimeType: string
): Promise<string | null> {
  try {
    const storageService = new ObjectStorageService();
    const category = `animals/${animalId}/photos`;
    
    const result = await storageService.uploadTenantFile(
      tenantId,
      category,
      buffer,
      mimeType
    );
    
    return result.objectPath;
  } catch (error) {
    console.log(`[RescueGroups Import] Failed to upload image to storage:`, error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

function generateAnimalId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `A${timestamp}${random}`;
}

router.post('/rescuegroups', requireTenant, requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    const tenantId = req.tenant!.id;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const results: RescueGroupsRow[] = [];
    const errors: string[] = [];
    let imported = 0;
    let duplicates = 0;
    let imageErrors = 0;

    await new Promise<void>((resolve, reject) => {
      const stream = Readable.from(req.file!.buffer);
      stream
        .pipe(csvParser())
        .on('data', (row: RescueGroupsRow) => {
          results.push(row);
        })
        .on('error', (error: Error) => {
          reject(error);
        })
        .on('end', () => {
          resolve();
        });
    });

    console.log(`[RescueGroups Import] Parsed ${results.length} rows from CSV for tenant ${tenantId}`);

    for (const row of results) {
      try {
        const externalId = row.AnimalID || row['Animal ID'] || row['ID'];
        const name = row.AnimalName || row['Animal Name'] || row['Name'];
        
        if (!name) {
          errors.push(`Skipped row: Missing animal name`);
          continue;
        }

        const breed = row.AnimalBreed || row.AnimalBreedPrimary || row['Breed'] || 'Unknown';
        const species = row.AnimalSpecies || row['Species'] || 'Dog';
        const sex = parseGender(row.AnimalSex || row['Sex']);
        
        if (externalId) {
          const existing = await db.query.animals.findFirst({
            where: and(
              eq(animals.tenantId, tenantId),
              eq(animals.externalId, externalId)
            ),
          });

          if (existing) {
            duplicates++;
            continue;
          }
        } else {
          const existingByName = await db.query.animals.findFirst({
            where: and(
              eq(animals.tenantId, tenantId),
              eq(animals.name, name),
              eq(animals.species, species),
              eq(animals.sex, sex)
            ),
          });

          if (existingByName) {
            duplicates++;
            errors.push(`Possible duplicate: "${name}" (${species}, ${sex}) - skipped (no external ID to verify)`);
            continue;
          }
        }

        const description = row.AnimalDescription || row.AnimalDescriptionPlain || row['Description'] || '';
        
        const animalId = generateAnimalId();
        const photoUrls: string[] = [];
        
        const photoUrl = row.AnimalPrimaryPhotoUrl || row.AnimalPhoto1 || row['Photo'] || row['Photo URL'];
        
        if (photoUrl) {
          const imageData = await downloadImage(photoUrl);
          if (imageData) {
            const storagePath = await uploadImageToStorage(
              imageData.buffer, 
              animalId, 
              tenantId, 
              imageData.mimeType
            );
            if (storagePath) {
              photoUrls.push(storagePath);
            } else {
              imageErrors++;
            }
          } else {
            imageErrors++;
          }
        }

        for (let i = 2; i <= 3; i++) {
          const additionalPhoto = row[`AnimalPhoto${i}`];
          if (additionalPhoto) {
            const imageData = await downloadImage(additionalPhoto);
            if (imageData) {
              const storagePath = await uploadImageToStorage(
                imageData.buffer,
                animalId,
                tenantId,
                imageData.mimeType
              );
              if (storagePath) {
                photoUrls.push(storagePath);
              }
            }
          }
        }

        const animalData = {
          tenantId,
          animalId,
          name,
          species,
          breed,
          age: row.AnimalGeneralAge || 'Unknown',
          sex,
          neuterStatus: parseNeuterStatus(row.AnimalAltered, row.AnimalSex),
          dateOfBirth: parseDate(row.AnimalBirthdate || row['Birthdate']),
          bio: description,
          status: parseStatus(row.AnimalStatus || row['Status']),
          photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
          petfinderType: parsePetfinderType(species),
          petfinderBreed: breed,
          petfinderBreedSecondary: row.AnimalBreedSecondary || undefined,
          petfinderAge: parsePetfinderAge(row.AnimalGeneralAge),
          petfinderSize: parsePetfinderSize(row.AnimalSize || row['Size']),
          petfinderGender: parsePetfinderGender(row.AnimalSex || row['Sex']),
          houseTrained: parseBoolean(row.AnimalHousetrained),
          declawed: parseBoolean(row.AnimalDeclawed),
          specialNeeds: parseBoolean(row.AnimalSpecialNeeds),
          shotsCurrent: parseBoolean(row.AnimalCurrentShotsUptodate),
          childFriendly: parseBoolean(row.AnimalOKWithKids),
          catFriendly: parseBoolean(row.AnimalOKWithCats),
          dogFriendly: parseBoolean(row.AnimalOKWithDogs),
          externalId: externalId || undefined,
          externalSource: 'rescuegroups' as const,
          intakeDate: new Date(),
          intakeSource: 'transfer' as const,
        };

        await db.insert(animals).values(animalData);
        imported++;
        
      } catch (rowError) {
        const errorMsg = rowError instanceof Error ? rowError.message : 'Unknown error';
        errors.push(`Failed to import row: ${errorMsg}`);
        console.error(`[RescueGroups Import] Row error:`, rowError);
      }
    }

    console.log(`[RescueGroups Import] Complete - Imported: ${imported}, Duplicates: ${duplicates}, Image errors: ${imageErrors}`);

    res.json({
      success: true,
      imported,
      duplicates,
      imageErrors,
      totalRows: results.length,
      errors: errors.slice(0, 10),
    });
    
  } catch (error) {
    console.error('[RescueGroups Import] Error:', error);
    next(error);
  }
});

router.get('/rescuegroups/template', requireTenant, requireAuth, (_req, res) => {
  const headers = [
    'AnimalID',
    'AnimalName',
    'AnimalBreed',
    'AnimalBreedSecondary',
    'AnimalSex',
    'AnimalBirthdate',
    'AnimalDescription',
    'AnimalStatus',
    'AnimalSpecies',
    'AnimalSize',
    'AnimalGeneralAge',
    'AnimalAltered',
    'AnimalHousetrained',
    'AnimalDeclawed',
    'AnimalSpecialNeeds',
    'AnimalCurrentShotsUptodate',
    'AnimalOKWithDogs',
    'AnimalOKWithCats',
    'AnimalOKWithKids',
    'AnimalPrimaryPhotoUrl',
  ];
  
  const csv = headers.join(',') + '\n';
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="rescuegroups_import_template.csv"');
  res.send(csv);
});

export default router;

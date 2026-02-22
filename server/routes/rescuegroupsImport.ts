import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import { Readable } from 'stream';
import csvParser from 'csv-parser';
import axios from 'axios';
import { ObjectStorageService } from '../objectStorage';
import {
  AnimalInsertDTO,
  generateAnimalId,
  parseGender,
  parsePetfinderGender,
  parseStatus,
  parseDate,
  parseBoolean,
  parseNeuterStatus,
  parsePetfinderAge,
  parsePetfinderSize,
  parsePetfinderType,
  checkDuplicateByExternalId,
  checkDuplicateByNameSpeciesSex,
  insertAnimalFromDTO,
} from '../services/animalImport';

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

function mapRescueGroupsRowToDTO(row: RescueGroupsRow): { dto: AnimalInsertDTO; externalId?: string; photoUrls: string[] } | null {
  const name = row.AnimalName || row['Animal Name'] || row['Name'];
  if (!name) return null;

  const breed = row.AnimalBreed || row.AnimalBreedPrimary || row['Breed'] || 'Unknown';
  const species = row.AnimalSpecies || row['Species'] || 'Dog';
  const sexRaw = row.AnimalSex || row['Sex'];
  const description = row.AnimalDescription || row.AnimalDescriptionPlain || row['Description'] || '';
  const statusResult = parseStatus(row.AnimalStatus || row['Status']);

  const dto: AnimalInsertDTO = {
    name,
    species,
    breed,
    age: row.AnimalGeneralAge || 'Unknown',
    sex: parseGender(sexRaw),
    bio: description,
    status: statusResult.status,
    locationType: statusResult.locationType || 'shelter',
    neuterStatus: parseNeuterStatus(row.AnimalAltered, sexRaw),
    dateOfBirth: parseDate(row.AnimalBirthdate || row['Birthdate']),
    petfinderType: parsePetfinderType(species) || null,
    petfinderBreed: breed,
    petfinderBreedSecondary: row.AnimalBreedSecondary || undefined,
    petfinderAge: parsePetfinderAge(row.AnimalGeneralAge) || null,
    petfinderSize: parsePetfinderSize(row.AnimalSize || row['Size']) || null,
    petfinderGender: parsePetfinderGender(sexRaw) || null,
    houseTrained: parseBoolean(row.AnimalHousetrained),
    declawed: parseBoolean(row.AnimalDeclawed),
    specialNeeds: parseBoolean(row.AnimalSpecialNeeds),
    shotsCurrent: parseBoolean(row.AnimalCurrentShotsUptodate),
    childFriendly: parseBoolean(row.AnimalOKWithKids),
    catFriendly: parseBoolean(row.AnimalOKWithCats),
    dogFriendly: parseBoolean(row.AnimalOKWithDogs),
    externalId: row.AnimalID || row['Animal ID'] || row['ID'] || undefined,
    externalSource: 'rescuegroups',
    intakeDate: new Date(),
    intakeSource: 'transfer',
  };

  return { dto, externalId: dto.externalId, photoUrls: [] };
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
        const mapped = mapRescueGroupsRowToDTO(row);
        if (!mapped) {
          errors.push(`Skipped row: Missing animal name`);
          continue;
        }

        const { dto } = mapped;

        if (dto.externalId) {
          if (await checkDuplicateByExternalId(tenantId, dto.externalId)) {
            duplicates++;
            continue;
          }
        } else {
          if (await checkDuplicateByNameSpeciesSex(tenantId, dto.name, dto.species, dto.sex || 'unknown')) {
            duplicates++;
            errors.push(`Possible duplicate: "${dto.name}" (${dto.species}, ${dto.sex}) - skipped (no external ID to verify)`);
            continue;
          }
        }

        const tempAnimalId = generateAnimalId();
        const photoUrls: string[] = [];
        
        const photoUrl = row.AnimalPrimaryPhotoUrl || row.AnimalPhoto1 || row['Photo'] || row['Photo URL'];
        
        if (photoUrl) {
          const imageData = await downloadImage(photoUrl);
          if (imageData) {
            const storagePath = await uploadImageToStorage(
              imageData.buffer, 
              tempAnimalId, 
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
                tempAnimalId,
                tenantId,
                imageData.mimeType
              );
              if (storagePath) {
                photoUrls.push(storagePath);
              }
            }
          }
        }

        if (photoUrls.length > 0) {
          dto.photoUrls = photoUrls;
        }

        await insertAnimalFromDTO(tenantId, dto, tempAnimalId);
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

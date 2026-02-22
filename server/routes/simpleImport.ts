import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import { Readable } from 'stream';
import csvParser from 'csv-parser';
import {
  AnimalInsertDTO,
  parseGender,
  parsePetfinderGender,
  parseStatus,
  parseDate,
  parsePetfinderAge,
  checkDuplicateByNameSpeciesSex,
  insertAnimalFromDTO,
} from '../services/animalImport';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
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

interface SimpleRow {
  name?: string;
  breed?: string;
  sex?: string;
  age?: string;
  color?: string;
  microchip?: string;
  intake_date?: string;
  status?: string;
  [key: string]: string | undefined;
}

function mapSimpleRowToDTO(row: SimpleRow): AnimalInsertDTO | null {
  const name = row.name?.trim();
  if (!name) return null;

  const breed = row.breed?.trim() || 'Unknown';
  const sexRaw = row.sex?.trim();
  const sex = parseGender(sexRaw);
  const ageRaw = row.age?.trim();
  const statusResult = parseStatus(row.status?.trim());
  const colors = row.color?.trim() ? row.color.trim().split(/[,;\/]/).map(c => c.trim()).filter(Boolean) : [];

  const species = guessSpeciesFromBreed(breed);

  const dto: AnimalInsertDTO = {
    name,
    species,
    breed,
    age: ageRaw || 'Unknown',
    sex,
    bio: '',
    status: statusResult.status,
    locationType: statusResult.locationType || 'shelter',
    colors,
    microchipNumber: row.microchip?.trim() || null,
    intakeDate: parseDate(row.intake_date?.trim()) || new Date(),
    intakeSource: 'other',
    petfinderGender: parsePetfinderGender(sexRaw) || null,
    petfinderAge: parsePetfinderAge(ageRaw) || null,
    petfinderBreed: breed,
  };

  return dto;
}

function guessSpeciesFromBreed(breed: string): string {
  const normalized = breed.toLowerCase();
  const catBreeds = [
    'siamese', 'persian', 'maine coon', 'ragdoll', 'bengal', 'abyssinian',
    'sphynx', 'british shorthair', 'scottish fold', 'domestic shorthair',
    'domestic longhair', 'domestic mediumhair', 'tabby', 'calico', 'tuxedo',
    'tortoiseshell', 'russian blue', 'burmese', 'birman', 'himalayan',
    'oriental', 'devon rex', 'cornish rex', 'manx', 'exotic shorthair',
    'kitten', 'cat',
  ];
  for (const catBreed of catBreeds) {
    if (normalized.includes(catBreed)) return 'Cat';
  }
  return 'Dog';
}

router.post('/simple', requireTenant, requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    const tenantId = req.tenant!.id;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const results: SimpleRow[] = [];
    const errors: string[] = [];
    let imported = 0;
    let duplicates = 0;

    await new Promise<void>((resolve, reject) => {
      const stream = Readable.from(req.file!.buffer);
      stream
        .pipe(csvParser())
        .on('data', (row: SimpleRow) => {
          results.push(row);
        })
        .on('error', (error: Error) => {
          reject(error);
        })
        .on('end', () => {
          resolve();
        });
    });

    console.log(`[Simple Import] Parsed ${results.length} rows from CSV for tenant ${tenantId}`);

    for (const row of results) {
      try {
        const dto = mapSimpleRowToDTO(row);
        if (!dto) {
          errors.push(`Skipped row: Missing animal name`);
          continue;
        }

        if (await checkDuplicateByNameSpeciesSex(tenantId, dto.name, dto.species, dto.sex || 'unknown')) {
          duplicates++;
          errors.push(`Duplicate skipped: "${dto.name}" (${dto.species}, ${dto.sex})`);
          continue;
        }

        await insertAnimalFromDTO(tenantId, dto);
        imported++;
      } catch (rowError) {
        const errorMsg = rowError instanceof Error ? rowError.message : 'Unknown error';
        errors.push(`Failed to import "${row.name || 'unknown'}": ${errorMsg}`);
        console.error(`[Simple Import] Row error:`, rowError);
      }
    }

    console.log(`[Simple Import] Complete - Imported: ${imported}, Duplicates: ${duplicates}`);

    res.json({
      success: true,
      imported,
      duplicates,
      imageErrors: 0,
      totalRows: results.length,
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    console.error('[Simple Import] Error:', error);
    next(error);
  }
});

router.get('/simple/template', requireTenant, requireAuth, (_req, res) => {
  const headers = ['name', 'breed', 'sex', 'age', 'color', 'microchip', 'intake_date', 'status'];
  const exampleRow = ['Buddy', 'Labrador Retriever', 'Male', 'Young', 'Black', '985112345678901', '2025-01-15', 'Available'];

  const csv = headers.join(',') + '\n' + exampleRow.join(',') + '\n';

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="animal_import_template.csv"');
  res.send(csv);
});

export default router;

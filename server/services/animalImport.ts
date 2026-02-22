import { db } from '../db';
import { animals } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';

export interface AnimalInsertDTO {
  name: string;
  species: string;
  breed: string;
  age?: string;
  sex?: 'male' | 'female' | 'unknown';
  bio?: string;
  status?: 'available' | 'adoption_pending' | 'transfer_pending' | 'medical_hold' | 'stray_hold' | 'adopted' | 'transported' | 'deceased';
  locationType?: 'shelter' | 'foster' | 'clinic' | 'transport' | 'offsite';
  locationName?: string;
  colors?: string[];
  weight?: string | null;
  microchipNumber?: string | null;
  neuterStatus?: 'intact' | 'neutered' | 'spayed' | 'unknown';
  dateOfBirth?: Date | null;
  intakeDate?: Date | null;
  intakeSource?: 'stray' | 'owner_surrender' | 'transfer' | 'born_in_care' | 'other';
  photoUrls?: string[];
  petfinderType?: string | null;
  petfinderBreed?: string | null;
  petfinderBreedSecondary?: string | null;
  petfinderAge?: string | null;
  petfinderSize?: string | null;
  petfinderGender?: string | null;
  houseTrained?: boolean | null;
  declawed?: boolean | null;
  specialNeeds?: boolean | null;
  shotsCurrent?: boolean | null;
  childFriendly?: boolean | null;
  catFriendly?: boolean | null;
  dogFriendly?: boolean | null;
  externalId?: string;
  externalSource?: string;
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  imageErrors: number;
  totalRows: number;
  errors: string[];
}

export function generateAnimalId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `A${timestamp}${random}`;
}

export function parseGender(sex: string | undefined): 'male' | 'female' | 'unknown' {
  if (!sex) return 'unknown';
  const normalized = sex.toLowerCase().trim();
  if (normalized === 'male' || normalized === 'm') return 'male';
  if (normalized === 'female' || normalized === 'f') return 'female';
  return 'unknown';
}

export function parsePetfinderGender(sex: string | undefined): 'Male' | 'Female' | 'Unknown' {
  if (!sex) return 'Unknown';
  const normalized = sex.toLowerCase().trim();
  if (normalized === 'male' || normalized === 'm') return 'Male';
  if (normalized === 'female' || normalized === 'f') return 'Female';
  return 'Unknown';
}

export interface ParsedAnimalStatus {
  status: 'available' | 'adoption_pending' | 'transfer_pending' | 'medical_hold' | 'stray_hold' | 'adopted' | 'transported' | 'deceased';
  locationType?: 'foster';
}

export function parseStatus(status: string | undefined): ParsedAnimalStatus {
  if (!status) return { status: 'available' };
  const normalized = status.toLowerCase().trim();
  if (normalized === 'available' || normalized === 'adoptable' || normalized === 'active') return { status: 'available' };
  if (normalized === 'adopted' || normalized === 'alumni' || normalized === 'closed' || normalized === 'placed') return { status: 'adopted' };
  if (normalized === 'pending' || normalized === 'hold' || normalized === 'on hold' || normalized === 'application' || normalized === 'reserved') return { status: 'adoption_pending' };
  if (normalized === 'foster' || normalized === 'fostered' || normalized === 'in foster' || normalized === 'foster care') return { status: 'available', locationType: 'foster' };
  if (normalized === 'medical' || normalized === 'medical_hold' || normalized === 'medical hold' || normalized === 'quarantine' || normalized === 'treatment') return { status: 'medical_hold' };
  if (normalized === 'deceased' || normalized === 'passed' || normalized === 'died' || normalized === 'euthanized' || normalized === 'rainbow bridge') return { status: 'deceased' };
  if (normalized === 'stray' || normalized === 'intake') return { status: 'stray_hold' };
  return { status: 'available' };
}

export function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

export function parseBoolean(value: string | undefined): boolean | null {
  if (!value) return null;
  const normalized = value.toLowerCase().trim();
  if (normalized === 'yes' || normalized === 'true' || normalized === '1') return true;
  if (normalized === 'no' || normalized === 'false' || normalized === '0') return false;
  return null;
}

export function parseNeuterStatus(altered: string | undefined, sex: string | undefined): 'intact' | 'neutered' | 'spayed' | 'unknown' {
  const isAltered = parseBoolean(altered);
  if (isAltered === null) return 'unknown';
  if (!isAltered) return 'intact';
  const gender = parseGender(sex);
  if (gender === 'male') return 'neutered';
  if (gender === 'female') return 'spayed';
  return 'unknown';
}

export function parsePetfinderAge(age: string | undefined): 'Baby' | 'Young' | 'Adult' | 'Senior' | undefined {
  if (!age) return undefined;
  const normalized = age.toLowerCase().trim();
  if (normalized === 'baby' || normalized === 'kitten' || normalized === 'puppy') return 'Baby';
  if (normalized === 'young' || normalized === 'junior') return 'Young';
  if (normalized === 'adult') return 'Adult';
  if (normalized === 'senior') return 'Senior';
  return undefined;
}

export function parsePetfinderSize(size: string | undefined): 'Small' | 'Medium' | 'Large' | 'Extra Large' | undefined {
  if (!size) return undefined;
  const normalized = size.toLowerCase().trim();
  if (normalized === 'small' || normalized === 's') return 'Small';
  if (normalized === 'medium' || normalized === 'm') return 'Medium';
  if (normalized === 'large' || normalized === 'l') return 'Large';
  if (normalized === 'extra large' || normalized === 'xl' || normalized === 'xlarge') return 'Extra Large';
  return undefined;
}

export function parsePetfinderType(species: string | undefined): 'Dog' | 'Cat' | 'Rabbit' | 'Small & Furry' | 'Horse' | 'Bird' | 'Scales, Fins & Other' | 'Barnyard' | undefined {
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

export async function checkDuplicateByExternalId(tenantId: string, externalId: string): Promise<boolean> {
  const existing = await db.query.animals.findFirst({
    where: and(
      eq(animals.tenantId, tenantId),
      eq(animals.externalId, externalId)
    ),
  });
  return !!existing;
}

export async function checkDuplicateByNameSpeciesSex(tenantId: string, name: string, species: string, sex: string): Promise<boolean> {
  const existing = await db.query.animals.findFirst({
    where: and(
      eq(animals.tenantId, tenantId),
      eq(animals.name, name),
      eq(animals.species, species),
      eq(animals.sex, sex)
    ),
  });
  return !!existing;
}

export async function insertAnimalFromDTO(tenantId: string, dto: AnimalInsertDTO, preGeneratedAnimalId?: string): Promise<string> {
  const animalId = preGeneratedAnimalId || generateAnimalId();
  const statusResult = dto.status ? { status: dto.status } : parseStatus(undefined);

  await db.insert(animals).values({
    tenantId,
    animalId,
    name: dto.name,
    species: dto.species,
    breed: dto.breed,
    age: dto.age || 'Unknown',
    sex: dto.sex || 'unknown',
    bio: dto.bio || '',
    status: (dto.status as any) || statusResult.status,
    locationType: dto.locationType || 'shelter',
    locationName: dto.locationName || null,
    colors: dto.colors || [],
    weight: dto.weight || null,
    microchipNumber: dto.microchipNumber || null,
    neuterStatus: dto.neuterStatus || 'unknown',
    dateOfBirth: dto.dateOfBirth || null,
    intakeDate: dto.intakeDate || new Date(),
    intakeSource: dto.intakeSource || null,
    photoUrls: dto.photoUrls || [],
    petfinderType: dto.petfinderType || parsePetfinderType(dto.species) || null,
    petfinderBreed: dto.petfinderBreed || dto.breed || null,
    petfinderBreedSecondary: dto.petfinderBreedSecondary || null,
    petfinderAge: dto.petfinderAge || parsePetfinderAge(dto.age) || null,
    petfinderSize: dto.petfinderSize || null,
    petfinderGender: dto.petfinderGender || parsePetfinderGender(dto.sex) || null,
    houseTrained: dto.houseTrained ?? null,
    declawed: dto.declawed ?? null,
    specialNeeds: dto.specialNeeds ?? null,
    shotsCurrent: dto.shotsCurrent ?? null,
    childFriendly: dto.childFriendly ?? null,
    catFriendly: dto.catFriendly ?? null,
    dogFriendly: dto.dogFriendly ?? null,
    externalId: dto.externalId || null,
    externalSource: dto.externalSource || null,
  });

  return animalId;
}

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { db } from '../db';
import {
  users,
  adopterMagicTokens,
  applications,
  animals,
  adoptionCheckoutSessions,
  adoptionContracts,
  tenants,
  contacts,
  preventativeCareRecords,
  preventativeCareTypes,
  medicalExams,
  vaccineRecords,
  happyTails,
  adopterWeightLogs,
  adopterMedicationReminders,
  adopterMedicationConfirmationLogs,
  adopterNotificationPreferences,
  adopterNotificationLogs,
  adopterComplianceConfirmations,
  insertAdopterComplianceConfirmationSchema,
  complianceReminders,
  complianceReminderNotifications,
  complianceObligations,
  activityLogs,
  heartwormTreatmentPlans,
  personDocuments,
} from '@shared/schema';
import { eq, and, isNull, gt, desc, sql, asc, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { EmailService } from '../lib/email-service';

const router = Router();
const SALT_ROUNDS = 10;
const TOKEN_EXPIRY_HOURS = 24;

interface VaccineRecord {
  id: string;
  vaccineName: string;
  dateAdministered: string | Date | null;
  expirationDate: string | Date | null;
  veterinarian: string | null;
}

function normalizeVaccineName(name: string): string {
  const n = name.toLowerCase().trim();
  if (n.includes('rabies')) return 'rabies';
  if (n.includes('dhpp') || n.includes('da2pp') || n.includes('dapp') || n.includes('dappl')) return 'dhpp';
  if (n.includes('bordetella')) return 'bordetella';
  if (n.includes('lepto')) return 'leptospirosis';
  if (n.includes('canine influenza') || n.includes('civ')) return 'canine_influenza';
  if (n.includes('parvo')) return 'parvovirus';
  return n;
}

function deduplicateVaccineRecords(records: VaccineRecord[]): VaccineRecord[] {
  const grouped = new Map<string, VaccineRecord[]>();
  for (const rec of records) {
    const key = normalizeVaccineName(rec.vaccineName);
    const group = grouped.get(key) || [];
    group.push(rec);
    grouped.set(key, group);
  }

  const result: VaccineRecord[] = [];
  for (const [, group] of grouped) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    const withVet = group.filter(r => r.veterinarian && r.veterinarian.trim() !== '' && r.veterinarian !== 'Set at adoption');
    const best = withVet.length > 0 ? withVet : group;
    best.sort((a, b) => {
      const expA = a.expirationDate ? new Date(a.expirationDate).getTime() : 0;
      const expB = b.expirationDate ? new Date(b.expirationDate).getTime() : 0;
      if (expA !== expB) return expB - expA;
      const dA = a.dateAdministered ? new Date(a.dateAdministered).getTime() : 0;
      const dB = b.dateAdministered ? new Date(b.dateAdministered).getTime() : 0;
      return dB - dA;
    });
    result.push(best[0]);
  }

  result.sort((a, b) => {
    const dA = a.dateAdministered ? new Date(a.dateAdministered).getTime() : 0;
    const dB = b.dateAdministered ? new Date(b.dateAdministered).getTime() : 0;
    return dB - dA;
  });
  return result;
}

function getAppBaseUrl(): string {
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return process.env.APP_BASE_URL || 'https://irescue.life';
}

function buildAdopterPortalUrl(tenant: { subdomain: string | null; customDomain: string | null }, path: string): string {
  if (tenant.customDomain) {
    return `https://${tenant.customDomain}${path}`;
  }
  const baseUrl = getAppBaseUrl();
  const tenantPath = tenant.subdomain ? `/${tenant.subdomain}` : '';
  return `${baseUrl}${tenantPath}${path}`;
}

async function verifyAdopterOwnsAnimal(userId: string, tenantId: string, animalId: string): Promise<boolean> {
  const userRecord = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRecord.length) return false;
  const adopterEmail = userRecord[0].email.toLowerCase();

  const [match] = await db
    .select({ id: animals.id })
    .from(animals)
    .innerJoin(
      applications,
      and(
        eq(applications.animalId, animals.id),
        eq(applications.tenantId, tenantId),
        eq(applications.stage, 'adopted'),
        sql`LOWER(${applications.applicantEmail}) = ${adopterEmail}`
      )
    )
    .where(and(
      eq(animals.id, animalId),
      eq(animals.tenantId, tenantId)
    ))
    .limit(1);

  return !!match;
}

function requireAdopter(req: Request, res: Response): { userId: string; tenantId: string } | null {
  if (!req.user || !req.user.roles.includes('adopter')) {
    res.status(401).json({ error: 'Adopter access required' });
    return null;
  }
  return { userId: req.user.id, tenantId: req.user.tenantId };
}

/**
 * POST /api/adopter/request-magic-link
 */
router.post('/request-magic-link', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [adopterUser] = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        roles: users.roles,
        tenantId: users.tenantId,
      })
      .from(users)
      .where(and(
        eq(users.tenantId, tenantId),
        sql`LOWER(${users.email}) = ${normalizedEmail}`,
        eq(users.isActive, true),
        sql`${users.roles} @> ARRAY['adopter']::text[]`
      ))
      .limit(1);

    res.json({ message: 'If an account exists for this email, a login link has been sent.' });

    if (!adopterUser) {
      return;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, SALT_ROUNDS);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);

    await db.insert(adopterMagicTokens).values({
      tenantId,
      userId: adopterUser.id,
      tokenHash,
      expiresAt,
    });

    const [tenant] = await db
      .select({
        subdomain: tenants.subdomain,
        customDomain: tenants.customDomain,
        name: tenants.name,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) return;

    const encodedToken = encodeURIComponent(rawToken);
    const loginUrl = buildAdopterPortalUrl(tenant, `/my-pets/login?token=${encodedToken}`);

    const emailService = await EmailService.forTenant(tenantId);
    if (emailService) {
      await emailService.send({
        to: adopterUser.email,
        subject: `Your Pet Portal Login Link - ${tenant.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Pet Portal Login</h2>
            <p>Hi ${adopterUser.fullName},</p>
            <p>Click the button below to access your Pet Portal and view your adopted pet's information:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${loginUrl}" 
                 style="background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                Access My Pets
              </a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px;">
              This link expires in ${TOKEN_EXPIRY_HOURS} hours. If you didn't request this, you can safely ignore this email.
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="color: #9ca3af; font-size: 12px;">
              Sent by ${tenant.name} via iRescue
            </p>
          </div>
        `,
      });
    }
  } catch (error) {
    console.error('[Adopter Portal] Error sending magic link:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

/**
 * POST /api/adopter/magic-login
 */
router.post('/magic-login', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token is required' });
    }

    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }

    const pendingTokens = await db
      .select()
      .from(adopterMagicTokens)
      .where(and(
        eq(adopterMagicTokens.tenantId, tenantId),
        isNull(adopterMagicTokens.usedAt),
        gt(adopterMagicTokens.expiresAt, new Date())
      ))
      .orderBy(desc(adopterMagicTokens.createdAt))
      .limit(20);

    let matchedToken = null;
    for (const t of pendingTokens) {
      const isValid = await bcrypt.compare(token, t.tokenHash);
      if (isValid) {
        matchedToken = t;
        break;
      }
    }

    if (!matchedToken) {
      return res.status(401).json({ error: 'Invalid or expired login link' });
    }

    await db
      .update(adopterMagicTokens)
      .set({ usedAt: new Date() })
      .where(eq(adopterMagicTokens.id, matchedToken.id));

    const [adopterUser] = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        roles: users.roles,
        tenantId: users.tenantId,
      })
      .from(users)
      .where(and(
        eq(users.id, matchedToken.userId),
        eq(users.isActive, true),
        sql`${users.roles} @> ARRAY['adopter']::text[]`
      ))
      .limit(1);

    if (!adopterUser) {
      return res.status(401).json({ error: 'Account not found or no longer has adopter access' });
    }

    req.session.userId = adopterUser.id;
    req.session.tenantId = adopterUser.tenantId;
    req.session.activeRole = 'adopter';

    res.json({
      message: 'Login successful',
      redirectTo: '/my-pets',
      user: {
        id: adopterUser.id,
        email: adopterUser.email,
        fullName: adopterUser.fullName,
        roles: adopterUser.roles,
        activeRole: 'adopter',
      },
    });
  } catch (error) {
    console.error('[Adopter Portal] Error processing magic login:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * GET /api/adopter/my-pets
 */
router.get('/my-pets', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;

    const adopterEmail = req.user!.email.toLowerCase();
    const { tenantId } = auth;

    const adoptedAnimals = await db
      .select({
        id: animals.id,
        name: animals.name,
        species: animals.species,
        breed: animals.breed,
        photoUrls: animals.photoUrls,
        adoptedAt: animals.adoptionDate,
        microchipNumber: animals.microchipNumber,
        weight: animals.weight,
        status: animals.status,
        deceasedDate: animals.deceasedDate,
      })
      .from(animals)
      .innerJoin(
        applications,
        and(
          eq(applications.animalId, animals.id),
          eq(applications.tenantId, tenantId),
          eq(applications.stage, 'adopted'),
          sql`LOWER(${applications.applicantEmail}) = ${adopterEmail}`
        )
      )
      .where(and(
        eq(animals.tenantId, tenantId),
        inArray(animals.status, ['adopted', 'deceased'])
      ))
      .orderBy(desc(animals.adoptionDate));

    res.json(adoptedAnimals);
  } catch (error) {
    console.error('[Adopter Portal] Error fetching adopted animals:', error);
    res.status(500).json({ error: 'Failed to load pets' });
  }
});

/**
 * POST /api/adopter/report-passing
 * Adopter reports that their pet has passed away.
 * Wrapped in a transaction: updates animal status, resolves compliance reminders, logs activity.
 */
router.post('/report-passing', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;

    const { userId, tenantId } = auth;

    const schema = z.object({
      animalId: z.string().uuid(),
      dateOfPassing: z.coerce.date(),
      causeOrNotes: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request data', details: parsed.error.flatten() });
    }

    const { animalId, dateOfPassing, causeOrNotes } = parsed.data;

    const ownsAnimal = await verifyAdopterOwnsAnimal(userId, tenantId, animalId);
    if (!ownsAnimal) {
      return res.status(403).json({ error: 'You do not have access to this animal' });
    }

    const [animal] = await db
      .select({ id: animals.id, name: animals.name, status: animals.status })
      .from(animals)
      .where(and(eq(animals.id, animalId), eq(animals.tenantId, tenantId)))
      .limit(1);

    if (!animal) {
      return res.status(404).json({ error: 'Animal not found' });
    }

    if (animal.status === 'deceased') {
      return res.status(400).json({ error: 'This pet has already been marked as deceased' });
    }

    const adopterUser = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const adopterName = adopterUser[0]?.name || adopterUser[0]?.email || 'An adopter';

    await db.transaction(async (tx) => {
      await tx
        .update(animals)
        .set({
          status: 'deceased',
          deceasedDate: dateOfPassing,
          deceasedNotes: causeOrNotes || null,
        })
        .where(and(eq(animals.id, animalId), eq(animals.tenantId, tenantId)));

      await tx
        .update(complianceReminders)
        .set({ state: 'skipped' })
        .where(and(
          eq(complianceReminders.animalId, animalId),
          eq(complianceReminders.tenantId, tenantId),
          inArray(complianceReminders.state, ['pending', 'notified_3day', 'notified_due', 'overdue', 'requires_intervention'])
        ));

      await tx
        .update(adopterMedicationReminders)
        .set({ isActive: false })
        .where(and(
          eq(adopterMedicationReminders.animalId, animalId),
          eq(adopterMedicationReminders.tenantId, tenantId)
        ));

      await tx.insert(activityLogs).values({
        tenantId,
        userId: null,
        entityType: 'Animal',
        entityId: animalId,
        action: 'status_changed',
        description: `${adopterName} has reported that ${animal.name} has passed away.`,
        category: 'movement',
        metadata: {
          previousStatus: animal.status,
          newStatus: 'deceased',
          reportedBy: 'adopter',
          dateOfPassing: dateOfPassing.toISOString(),
          adopterUserId: userId,
        },
      });
    });

    res.json({ success: true, message: 'We have updated our records. Thank you for letting us know.' });
  } catch (error) {
    console.error('[Adopter Portal] Error reporting pet passing:', error);
    res.status(500).json({ error: 'Failed to process report' });
  }
});

/**
 * GET /api/adopter/pets/:animalId
 */
router.get('/pets/:animalId', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;

    const { animalId } = req.params;
    const adopterEmail = req.user!.email.toLowerCase();
    const { tenantId } = auth;

    const [animal] = await db
      .select({
        id: animals.id,
        name: animals.name,
        species: animals.species,
        breed: animals.breed,
        photoUrls: animals.photoUrls,
        adoptedAt: animals.adoptionDate,
        microchipNumber: animals.microchipNumber,
        weight: animals.weight,
        status: animals.status,
        deceasedDate: animals.deceasedDate,
      })
      .from(animals)
      .innerJoin(
        applications,
        and(
          eq(applications.animalId, animals.id),
          eq(applications.tenantId, tenantId),
          eq(applications.stage, 'adopted'),
          sql`LOWER(${applications.applicantEmail}) = ${adopterEmail}`
        )
      )
      .where(and(
        eq(animals.id, animalId),
        eq(animals.tenantId, tenantId)
      ))
      .limit(1);

    if (!animal) {
      return res.status(404).json({ error: 'Pet not found' });
    }

    res.json(animal);
  } catch (error) {
    console.error('[Adopter Portal] Error fetching pet detail:', error);
    res.status(500).json({ error: 'Failed to load pet details' });
  }
});

// ===== COMPLIANCE TAB ROUTES =====

/**
 * GET /api/adopter/pets/:animalId/vaccinations
 * Returns vaccination records (from both preventativeCareRecords vaccine category + vaccineRecords)
 */
router.get('/pets/:animalId/vaccinations', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;

    const { animalId } = req.params;
    const owns = await verifyAdopterOwnsAnimal(auth.userId, auth.tenantId, animalId);
    if (!owns) return res.status(404).json({ error: 'Pet not found' });

    const careRecords = await db
      .select({
        id: preventativeCareRecords.id,
        vaccineName: preventativeCareRecords.careName,
        dateAdministered: preventativeCareRecords.dateAdministered,
        expirationDate: preventativeCareRecords.nextDueDate,
        veterinarian: preventativeCareRecords.administeredBy,
      })
      .from(preventativeCareRecords)
      .where(and(
        eq(preventativeCareRecords.animalId, animalId),
        eq(preventativeCareRecords.tenantId, auth.tenantId),
        eq(preventativeCareRecords.careCategory, 'vaccine')
      ))
      .orderBy(desc(preventativeCareRecords.dateAdministered));

    const legacyVaccines = await db
      .select({
        id: vaccineRecords.id,
        vaccineName: vaccineRecords.itemName,
        dateAdministered: vaccineRecords.dateGiven,
        expirationDate: vaccineRecords.dateDue,
        veterinarian: vaccineRecords.administeredBy,
      })
      .from(vaccineRecords)
      .where(and(
        eq(vaccineRecords.animalId, animalId),
        eq(vaccineRecords.tenantId, auth.tenantId)
      ))
      .orderBy(desc(vaccineRecords.dateGiven));

    const combined = [...careRecords, ...legacyVaccines] as VaccineRecord[];
    const deduplicated = deduplicateVaccineRecords(combined);

    res.json(deduplicated);
  } catch (error) {
    console.error('[Adopter Portal] Error fetching vaccinations:', error);
    res.status(500).json({ error: 'Failed to load vaccinations' });
  }
});

/**
 * GET /api/adopter/pets/:animalId/medical-exams
 * Returns medical exam records for the adopted pet
 */
router.get('/pets/:animalId/medical-exams', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;

    const { animalId } = req.params;
    const owns = await verifyAdopterOwnsAnimal(auth.userId, auth.tenantId, animalId);
    if (!owns) return res.status(404).json({ error: 'Pet not found' });

    const exams = await db
      .select({
        id: medicalExams.id,
        examType: medicalExams.examType,
        examDate: medicalExams.examDate,
        findings: medicalExams.assessment,
        veterinarian: medicalExams.performedBy,
      })
      .from(medicalExams)
      .where(and(
        eq(medicalExams.animalId, animalId),
        eq(medicalExams.tenantId, auth.tenantId)
      ))
      .orderBy(desc(medicalExams.examDate));

    res.json(exams);
  } catch (error) {
    console.error('[Adopter Portal] Error fetching medical exams:', error);
    res.status(500).json({ error: 'Failed to load medical exams' });
  }
});

/**
 * GET /api/adopter/pets/:animalId/adoption-documents
 * Returns signed adoption contract PDFs for the pet
 */
router.get('/pets/:animalId/adoption-documents', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;

    const { animalId } = req.params;
    const owns = await verifyAdopterOwnsAnimal(auth.userId, auth.tenantId, animalId);
    if (!owns) return res.status(404).json({ error: 'Pet not found' });

    const contracts = await db
      .select({
        id: adoptionContracts.id,
        contractPdfUrl: adoptionContracts.contractPdfUrl,
        signerName: adoptionContracts.signerName,
        signedAt: adoptionContracts.signedAt,
        sessionStatus: adoptionCheckoutSessions.status,
      })
      .from(adoptionContracts)
      .innerJoin(
        adoptionCheckoutSessions,
        eq(adoptionCheckoutSessions.id, adoptionContracts.sessionId)
      )
      .where(and(
        eq(adoptionCheckoutSessions.animalId, animalId),
        eq(adoptionCheckoutSessions.tenantId, auth.tenantId),
        eq(adoptionCheckoutSessions.status, 'completed')
      ))
      .orderBy(desc(adoptionContracts.signedAt));

    res.json(contracts);
  } catch (error) {
    console.error('[Adopter Portal] Error fetching adoption documents:', error);
    res.status(500).json({ error: 'Failed to load documents' });
  }
});

// ===== HEALTH TAB ROUTES =====

/**
 * GET /api/adopter/pets/:animalId/weight-logs
 */
router.get('/pets/:animalId/weight-logs', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;

    const { animalId } = req.params;
    const owns = await verifyAdopterOwnsAnimal(auth.userId, auth.tenantId, animalId);
    if (!owns) return res.status(404).json({ error: 'Pet not found' });

    const logs = await db
      .select({
        id: adopterWeightLogs.id,
        weight: adopterWeightLogs.weight,
        weightUnit: adopterWeightLogs.weightUnit,
        notes: adopterWeightLogs.notes,
        loggedAt: adopterWeightLogs.loggedAt,
      })
      .from(adopterWeightLogs)
      .where(and(
        eq(adopterWeightLogs.animalId, animalId),
        eq(adopterWeightLogs.tenantId, auth.tenantId),
        eq(adopterWeightLogs.userId, auth.userId)
      ))
      .orderBy(desc(adopterWeightLogs.loggedAt));

    res.json(logs);
  } catch (error) {
    console.error('[Adopter Portal] Error fetching weight logs:', error);
    res.status(500).json({ error: 'Failed to load weight logs' });
  }
});

/**
 * POST /api/adopter/pets/:animalId/weight-logs
 */
router.post('/pets/:animalId/weight-logs', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;

    const { animalId } = req.params;
    const owns = await verifyAdopterOwnsAnimal(auth.userId, auth.tenantId, animalId);
    if (!owns) return res.status(404).json({ error: 'Pet not found' });

    const { weight, weightUnit, notes } = req.body;
    if (!weight || typeof weight !== 'string') {
      return res.status(400).json({ error: 'Weight is required' });
    }

    const validUnits = ['lbs', 'kg'];
    const unit = validUnits.includes(weightUnit) ? weightUnit : 'lbs';

    const [log] = await db
      .insert(adopterWeightLogs)
      .values({
        tenantId: auth.tenantId,
        animalId,
        userId: auth.userId,
        weight,
        weightUnit: unit,
        notes: notes || null,
      })
      .returning();

    res.json(log);
  } catch (error) {
    console.error('[Adopter Portal] Error creating weight log:', error);
    res.status(500).json({ error: 'Failed to save weight' });
  }
});

/**
 * GET /api/adopter/pets/:animalId/medication-reminders
 */
router.get('/pets/:animalId/medication-reminders', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;

    const { animalId } = req.params;
    const owns = await verifyAdopterOwnsAnimal(auth.userId, auth.tenantId, animalId);
    if (!owns) return res.status(404).json({ error: 'Pet not found' });

    const reminders = await db
      .select({
        id: adopterMedicationReminders.id,
        medicationName: adopterMedicationReminders.medicationName,
        frequency: adopterMedicationReminders.frequency,
        nextDueDate: adopterMedicationReminders.nextDueDate,
        lastConfirmedDate: adopterMedicationReminders.lastConfirmedDate,
      })
      .from(adopterMedicationReminders)
      .where(and(
        eq(adopterMedicationReminders.animalId, animalId),
        eq(adopterMedicationReminders.tenantId, auth.tenantId),
        eq(adopterMedicationReminders.userId, auth.userId),
        eq(adopterMedicationReminders.isActive, true)
      ))
      .orderBy(asc(adopterMedicationReminders.nextDueDate));

    res.json(reminders);
  } catch (error) {
    console.error('[Adopter Portal] Error fetching medication reminders:', error);
    res.status(500).json({ error: 'Failed to load reminders' });
  }
});

/**
 * POST /api/adopter/pets/:animalId/medication-reminders
 */
router.post('/pets/:animalId/medication-reminders', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;

    const { animalId } = req.params;
    const owns = await verifyAdopterOwnsAnimal(auth.userId, auth.tenantId, animalId);
    if (!owns) return res.status(404).json({ error: 'Pet not found' });

    const { medicationName, frequency, nextDueDate } = req.body;
    if (!medicationName || !frequency || !nextDueDate) {
      return res.status(400).json({ error: 'Medication name, frequency, and next due date are required' });
    }

    const validFrequencies = ['daily', 'weekly', 'monthly', 'yearly'];
    if (!validFrequencies.includes(frequency)) {
      return res.status(400).json({ error: 'Invalid frequency' });
    }

    const [reminder] = await db
      .insert(adopterMedicationReminders)
      .values({
        tenantId: auth.tenantId,
        animalId,
        userId: auth.userId,
        medicationName,
        frequency,
        nextDueDate: new Date(nextDueDate),
      })
      .returning();

    res.json(reminder);
  } catch (error) {
    console.error('[Adopter Portal] Error creating medication reminder:', error);
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

/**
 * POST /api/adopter/medication-reminders/:reminderId/confirm
 * Marks a medication as given and advances the next due date
 */
router.post('/medication-reminders/:reminderId/confirm', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;

    const { reminderId } = req.params;

    const [reminder] = await db
      .select()
      .from(adopterMedicationReminders)
      .where(and(
        eq(adopterMedicationReminders.id, reminderId),
        eq(adopterMedicationReminders.userId, auth.userId),
        eq(adopterMedicationReminders.tenantId, auth.tenantId)
      ))
      .limit(1);

    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    const now = new Date();
    let nextDue = new Date(reminder.nextDueDate);

    switch (reminder.frequency) {
      case 'daily':
        nextDue.setDate(nextDue.getDate() + 1);
        break;
      case 'weekly':
        nextDue.setDate(nextDue.getDate() + 7);
        break;
      case 'monthly':
        nextDue.setMonth(nextDue.getMonth() + 1);
        break;
      case 'yearly':
        nextDue.setFullYear(nextDue.getFullYear() + 1);
        break;
    }

    if (nextDue <= now) {
      nextDue = new Date(now);
      switch (reminder.frequency) {
        case 'daily':
          nextDue.setDate(nextDue.getDate() + 1);
          break;
        case 'weekly':
          nextDue.setDate(nextDue.getDate() + 7);
          break;
        case 'monthly':
          nextDue.setMonth(nextDue.getMonth() + 1);
          break;
        case 'yearly':
          nextDue.setFullYear(nextDue.getFullYear() + 1);
          break;
      }
    }

    const [updated] = await db
      .update(adopterMedicationReminders)
      .set({
        lastConfirmedDate: now,
        nextDueDate: nextDue,
      })
      .where(eq(adopterMedicationReminders.id, reminderId))
      .returning();

    await db.insert(adopterMedicationConfirmationLogs).values({
      tenantId: auth.tenantId,
      animalId: reminder.animalId,
      userId: auth.userId,
      reminderId: reminder.id,
      medicationName: reminder.medicationName,
      confirmedAt: now,
      confirmedVia: req.body?.confirmedVia || 'app',
    });

    res.json(updated);
  } catch (error) {
    console.error('[Adopter Portal] Error confirming medication:', error);
    res.status(500).json({ error: 'Failed to confirm medication' });
  }
});

// ===== COMPLIANCE CONFIRMATION ROUTES =====

/**
 * GET /api/adopter/pets/:animalId/due-care
 * Returns preventative care items (vaccines + parasite prevention) that are due or overdue for the adopter's pet
 */
router.get('/pets/:animalId/due-care', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;
    const { animalId } = req.params;
    const owns = await verifyAdopterOwnsAnimal(auth.userId, auth.tenantId, animalId);
    if (!owns) return res.status(403).json({ error: 'Access denied' });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const records = await db
      .select({
        id: preventativeCareRecords.id,
        careName: preventativeCareRecords.careName,
        careCategory: preventativeCareRecords.careCategory,
        nextDueDate: preventativeCareRecords.nextDueDate,
        dateAdministered: preventativeCareRecords.dateAdministered,
      })
      .from(preventativeCareRecords)
      .where(and(
        eq(preventativeCareRecords.tenantId, auth.tenantId),
        eq(preventativeCareRecords.animalId, animalId),
        sql`${preventativeCareRecords.careCategory} IN ('vaccine', 'parasite_prevention')`,
        sql`${preventativeCareRecords.nextDueDate} IS NOT NULL`,
        sql`${preventativeCareRecords.nextDueDate} <= ${threeDaysFromNow.toISOString()}`
      ));

    const existingConfirmations = await db
      .select({
        preventativeCareRecordId: adopterComplianceConfirmations.preventativeCareRecordId,
        status: adopterComplianceConfirmations.status,
      })
      .from(adopterComplianceConfirmations)
      .where(and(
        eq(adopterComplianceConfirmations.tenantId, auth.tenantId),
        eq(adopterComplianceConfirmations.animalId, animalId),
        eq(adopterComplianceConfirmations.userId, auth.userId),
        sql`${adopterComplianceConfirmations.status} IN ('pending_review', 'approved')`
      ));

    const confirmedIds = new Set(existingConfirmations.map(c => c.preventativeCareRecordId));

    const dueItems = records
      .filter(r => !confirmedIds.has(r.id))
      .map(r => ({
        ...r,
        isOverdue: r.nextDueDate ? new Date(r.nextDueDate) < today : false,
      }));

    res.json(dueItems);
  } catch (error) {
    console.error('[Adopter Portal] Error fetching due care:', error);
    res.status(500).json({ error: 'Failed to fetch due care items' });
  }
});

/**
 * POST /api/adopter/compliance-confirmations
 * Adopter submits a confirmation that they've completed a care item
 */
router.post('/compliance-confirmations', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;

    const parsed = insertAdopterComplianceConfirmationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() });
    }

    const { animalId, preventativeCareRecordId, careCategory, careName, dateAdministered, clinicName, notes } = parsed.data;

    const owns = await verifyAdopterOwnsAnimal(auth.userId, auth.tenantId, animalId);
    if (!owns) return res.status(403).json({ error: 'Access denied' });

    if (preventativeCareRecordId) {
      const [existingConfirmation] = await db
        .select({ id: adopterComplianceConfirmations.id })
        .from(adopterComplianceConfirmations)
        .where(and(
          eq(adopterComplianceConfirmations.preventativeCareRecordId, preventativeCareRecordId),
          eq(adopterComplianceConfirmations.userId, auth.userId),
          sql`${adopterComplianceConfirmations.status} IN ('pending_review', 'approved')`
        ))
        .limit(1);

      if (existingConfirmation) {
        return res.status(409).json({ error: 'A confirmation already exists for this care item' });
      }
    }

    const fileUrl = typeof req.body?.fileUrl === 'string' ? req.body.fileUrl : null;

    const [confirmation] = await db
      .insert(adopterComplianceConfirmations)
      .values({
        tenantId: auth.tenantId,
        userId: auth.userId,
        animalId,
        preventativeCareRecordId: preventativeCareRecordId || null,
        careCategory,
        careName,
        dateAdministered: new Date(dateAdministered),
        clinicName: clinicName || null,
        notes: notes || null,
        fileUrl,
      })
      .returning();

    res.status(201).json(confirmation);
  } catch (error) {
    console.error('[Adopter Portal] Error submitting compliance confirmation:', error);
    res.status(500).json({ error: 'Failed to submit confirmation' });
  }
});

/**
 * GET /api/adopter/pets/:animalId/compliance-confirmations
 * Returns the adopter's submitted compliance confirmations for a specific pet
 */
router.get('/pets/:animalId/compliance-confirmations', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;
    const { animalId } = req.params;
    const owns = await verifyAdopterOwnsAnimal(auth.userId, auth.tenantId, animalId);
    if (!owns) return res.status(403).json({ error: 'Access denied' });

    const confirmations = await db
      .select()
      .from(adopterComplianceConfirmations)
      .where(and(
        eq(adopterComplianceConfirmations.tenantId, auth.tenantId),
        eq(adopterComplianceConfirmations.animalId, animalId),
        eq(adopterComplianceConfirmations.userId, auth.userId)
      ))
      .orderBy(desc(adopterComplianceConfirmations.createdAt));

    res.json(confirmations);
  } catch (error) {
    console.error('[Adopter Portal] Error fetching compliance confirmations:', error);
    res.status(500).json({ error: 'Failed to fetch confirmations' });
  }
});

// ===== ALUMNI TAB ROUTES =====

/**
 * GET /api/adopter/pets/:animalId/happy-tails
 * Returns happy tail updates for the adopter's pet
 */
router.get('/pets/:animalId/happy-tails', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;

    const { animalId } = req.params;
    const owns = await verifyAdopterOwnsAnimal(auth.userId, auth.tenantId, animalId);
    if (!owns) return res.status(404).json({ error: 'Pet not found' });

    const updates = await db
      .select({
        id: happyTails.id,
        photoUrl: happyTails.photoUrl,
        message: happyTails.story,
        isApproved: happyTails.isPublished,
        createdAt: happyTails.createdAt,
      })
      .from(happyTails)
      .where(and(
        eq(happyTails.animalId, animalId),
        eq(happyTails.tenantId, auth.tenantId)
      ))
      .orderBy(desc(happyTails.createdAt));

    const mapped = updates.map(u => ({
      ...u,
      photoUrls: u.photoUrl ? [u.photoUrl] : [],
    }));

    res.json(mapped);
  } catch (error) {
    console.error('[Adopter Portal] Error fetching happy tails:', error);
    res.status(500).json({ error: 'Failed to load updates' });
  }
});

/**
 * POST /api/adopter/pets/:animalId/happy-tails
 * Submit a new happy tail update (pending approval)
 */
router.post('/pets/:animalId/happy-tails', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;

    const { animalId } = req.params;
    const owns = await verifyAdopterOwnsAnimal(auth.userId, auth.tenantId, animalId);
    if (!owns) return res.status(404).json({ error: 'Pet not found' });

    const { message, photoUrls } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'A message is required' });
    }

    const [animal] = await db
      .select({ name: animals.name })
      .from(animals)
      .where(eq(animals.id, animalId))
      .limit(1);

    const [happyTail] = await db
      .insert(happyTails)
      .values({
        tenantId: auth.tenantId,
        animalId,
        animalName: animal?.name || 'Unknown',
        adopterName: req.user!.fullName || req.user!.email,
        story: message,
        photoUrl: photoUrls && photoUrls.length > 0 ? photoUrls[0] : null,
        date: new Date().toISOString().split('T')[0],
        isPublished: false,
      })
      .returning();

    res.json({
      id: happyTail.id,
      message: happyTail.story,
      photoUrls: happyTail.photoUrl ? [happyTail.photoUrl] : [],
      isApproved: happyTail.isPublished,
      createdAt: happyTail.createdAt,
    });

    try {
      const [tenant] = await db
        .select({
          contactEmail: tenants.contactEmail,
          name: tenants.name,
          subdomain: tenants.subdomain,
          customDomain: tenants.customDomain,
        })
        .from(tenants)
        .where(eq(tenants.id, auth.tenantId))
        .limit(1);

      if (tenant?.contactEmail) {
        const emailService = await EmailService.forTenant(auth.tenantId);
        if (emailService) {
          const adopterName = req.user!.fullName || req.user!.email;
          const animalName = animal?.name || 'Unknown';
          const happyTailsUrl = buildAdopterPortalUrl(tenant, '/dashboard/happy-tails');

          await emailService.send({
            to: tenant.contactEmail,
            subject: `New Happy Tails Update: ${animalName} from ${adopterName}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #10b981;">New Happy Tails Submission</h2>
                <p>An adopter has submitted a new update about their pet!</p>
                
                <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
                  <p><strong>Animal:</strong> ${animalName}</p>
                  <p><strong>Adopter:</strong> ${adopterName}</p>
                  <p><strong>Message:</strong></p>
                  <p style="font-style: italic; color: #374151;">"${message.length > 500 ? message.substring(0, 500) + '...' : message}"</p>
                  ${happyTail.photoUrl ? '<p><strong>Photo included</strong></p>' : ''}
                </div>

                <p>This submission is pending your review. You can approve it to publish on your public site.</p>
                
                <div style="text-align: center; margin: 24px 0;">
                  <a href="${happyTailsUrl}" 
                     style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                    Review Happy Tails
                  </a>
                </div>
                
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
                <p style="color: #9ca3af; font-size: 12px;">
                  Sent by ${tenant.name} via iRescue
                </p>
              </div>
            `,
          });
          console.log(`[Adopter Portal] Sent Happy Tails notification to ${tenant.contactEmail} for animal ${animalName}`);
        }
      }
    } catch (emailError) {
      console.error('[Adopter Portal] Failed to send Happy Tails staff notification:', emailError);
    }
  } catch (error) {
    console.error('[Adopter Portal] Error submitting happy tail:', error);
    res.status(500).json({ error: 'Failed to submit update' });
  }
});

// ===== NOTIFICATION PREFERENCES ROUTES =====

/**
 * GET /api/adopter/notification-preferences
 */
router.get('/notification-preferences', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;

    const { userId, tenantId } = auth;

    const [prefs] = await db
      .select()
      .from(adopterNotificationPreferences)
      .where(and(
        eq(adopterNotificationPreferences.userId, userId),
        eq(adopterNotificationPreferences.tenantId, tenantId)
      ))
      .limit(1);

    if (!prefs) {
      return res.json({
        emailNotifications: true,
        smsNotifications: false,
        phone: null,
        vaccinationReminders: true,
        medicationReminders: true,
        generalUpdates: true,
      });
    }

    res.json({
      emailNotifications: prefs.emailNotifications,
      smsNotifications: prefs.smsNotifications,
      phone: prefs.phone,
      vaccinationReminders: prefs.vaccinationReminders,
      medicationReminders: prefs.medicationReminders,
      generalUpdates: prefs.generalUpdates,
    });
  } catch (error) {
    console.error('[Adopter Portal] Error fetching notification preferences:', error);
    res.status(500).json({ error: 'Failed to load notification preferences' });
  }
});

/**
 * PUT /api/adopter/notification-preferences
 */
router.put('/notification-preferences', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;

    const { userId, tenantId } = auth;

    const notifPrefsSchema = z.object({
      emailNotifications: z.boolean().default(true),
      smsNotifications: z.boolean().default(false),
      phone: z.string().nullable().optional(),
      vaccinationReminders: z.boolean().default(true),
      medicationReminders: z.boolean().default(true),
      generalUpdates: z.boolean().default(true),
    }).refine(
      (data) => !data.smsNotifications || (data.phone && data.phone.trim().length > 0),
      { message: 'Phone number is required for SMS notifications', path: ['phone'] }
    );

    const parseResult = notifPrefsSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message || 'Invalid input' });
    }

    const parsed = parseResult.data;

    const [existing] = await db
      .select({ id: adopterNotificationPreferences.id })
      .from(adopterNotificationPreferences)
      .where(and(
        eq(adopterNotificationPreferences.userId, userId),
        eq(adopterNotificationPreferences.tenantId, tenantId)
      ))
      .limit(1);

    const values = {
      emailNotifications: parsed.emailNotifications,
      smsNotifications: parsed.smsNotifications,
      phone: parsed.phone || null,
      vaccinationReminders: parsed.vaccinationReminders,
      medicationReminders: parsed.medicationReminders,
      generalUpdates: parsed.generalUpdates,
      updatedAt: new Date(),
    };

    if (existing) {
      await db
        .update(adopterNotificationPreferences)
        .set(values)
        .where(eq(adopterNotificationPreferences.id, existing.id));
    } else {
      await db
        .insert(adopterNotificationPreferences)
        .values({
          ...values,
          tenantId,
          userId,
        });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Adopter Portal] Error updating notification preferences:', error);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

/**
 * GET /api/adopter/notification-history
 */
router.get('/notification-history', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;

    const { userId, tenantId } = auth;

    const logs = await db
      .select({
        id: adopterNotificationLogs.id,
        notificationType: adopterNotificationLogs.notificationType,
        channel: adopterNotificationLogs.channel,
        subject: adopterNotificationLogs.subject,
        message: adopterNotificationLogs.message,
        sentAt: adopterNotificationLogs.sentAt,
        animalId: adopterNotificationLogs.animalId,
      })
      .from(adopterNotificationLogs)
      .where(and(
        eq(adopterNotificationLogs.userId, userId),
        eq(adopterNotificationLogs.tenantId, tenantId)
      ))
      .orderBy(desc(adopterNotificationLogs.sentAt))
      .limit(50);

    res.json(logs);
  } catch (error) {
    console.error('[Adopter Portal] Error fetching notification history:', error);
    res.status(500).json({ error: 'Failed to load notification history' });
  }
});

/**
 * POST /api/adopter/photos/upload
 * Upload photos for adopter happy tail submissions
 */
router.post('/photos/upload', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;

    const multer = (await import('multer')).default;
    const { ObjectStorageService } = await import('../objectStorage');
    const { randomUUID } = await import('crypto');

    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'avif'];

    const upload = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'image/svg+xml') {
          cb(new Error('SVG files are not allowed'));
          return;
        }
        if (file.mimetype.startsWith('image/')) {
          cb(null, true);
        } else {
          const ext = file.originalname.toLowerCase().split('.').pop();
          if (ext && imageExtensions.includes(ext)) {
            cb(null, true);
          } else {
            cb(new Error('Only image files are allowed'));
          }
        }
      },
    }).array('files', 5);

    upload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      try {
        const objectStorageService = new ObjectStorageService();
        const { objectStorageClient } = await import('../objectStorage');
        const privateObjectDir = objectStorageService.getPrivateObjectDir();
        const uploadedPaths: string[] = [];

        for (const file of files) {
          let fileBuffer = file.buffer;
          let contentType = file.mimetype;

          const ext = file.originalname.toLowerCase().split('.').pop();
          if (ext === 'heic' || ext === 'heif' || file.mimetype === 'image/heic' || file.mimetype === 'image/heif') {
            try {
              const heicConvert = (await import('heic-convert')).default;
              const convertedBuffer = await heicConvert({
                buffer: file.buffer,
                format: 'JPEG',
                quality: 0.9
              });
              fileBuffer = Buffer.from(convertedBuffer);
              contentType = 'image/jpeg';
              console.log(`[Adopter Portal] Converted HEIC file to JPEG: ${file.originalname}`);
            } catch (conversionError) {
              console.error('[Adopter Portal] HEIC conversion failed, uploading original:', conversionError);
            }
          }

          const objectId = randomUUID();
          const fullPath = `${privateObjectDir}/${auth.tenantId}/adopter-photos/${objectId}`;

          const parseObjectPath = (path: string): { bucketName: string; objectName: string } => {
            if (!path.startsWith("/")) {
              path = `/${path}`;
            }
            const pathParts = path.split("/");
            if (pathParts.length < 3) {
              throw new Error("Invalid path: must contain at least a bucket name");
            }
            const bucketName = pathParts[1];
            const objectName = pathParts.slice(2).join("/");
            return { bucketName, objectName };
          };

          const { bucketName, objectName } = parseObjectPath(fullPath);
          const bucket = objectStorageClient.bucket(bucketName);
          const fileObj = bucket.file(objectName);

          await fileObj.save(fileBuffer, {
            metadata: {
              contentType: contentType,
            },
          });

          const normalizedPath = `/objects/${auth.tenantId}/adopter-photos/${objectId}`;
          await objectStorageService.trySetObjectEntityAclPolicy(
            normalizedPath,
            {
              owner: auth.userId,
              visibility: 'public',
            }
          );

          uploadedPaths.push(normalizedPath);
        }

        res.json({ uploadedPaths });
      } catch (error: any) {
        console.error('[Adopter Portal] Error uploading photos:', error);
        return res.status(500).json({ error: 'Failed to upload photos' });
      }
    });
  } catch (error) {
    console.error('[Adopter Portal] Photo upload error:', error);
    res.status(500).json({ error: 'Failed to process upload' });
  }
});

// ===== ADMIN PREVIEW ROUTES =====
// These routes let admins/owners preview the adopter portal as if they were a specific adopter

function requireAdmin(req: Request, res: Response): { tenantId: string } | null {
  if (!req.user || !req.user.roles?.some((r: string) => ['admin', 'owner'].includes(r))) {
    res.status(403).json({ error: 'Admin access required' });
    return null;
  }
  if (!req.tenant?.id) {
    res.status(400).json({ error: 'Tenant required' });
    return null;
  }
  return { tenantId: req.tenant.id };
}

/**
 * GET /api/adopter/admin/adopters
 * Returns deduplicated list of adopters from completed adoption applications
 */
router.get('/admin/adopters', async (req: Request, res: Response) => {
  try {
    const auth = requireAdmin(req, res);
    if (!auth) return;

    const adoptedApps = await db
      .select({
        applicantName: applications.applicantName,
        applicantEmail: applications.applicantEmail,
        applicantPhone: applications.applicantPhone,
        animalId: applications.animalId,
        animalName: animals.name,
        adoptedAt: animals.adoptionDate,
      })
      .from(applications)
      .innerJoin(animals, eq(animals.id, applications.animalId))
      .where(and(
        eq(applications.tenantId, auth.tenantId),
        eq(applications.stage, 'adopted'),
        inArray(animals.status, ['adopted', 'deceased'])
      ))
      .orderBy(desc(animals.adoptionDate));

    const adoptersMap = new Map<string, {
      id: string;
      email: string;
      fullName: string;
      phone: string | null;
      adoptedAnimals: Array<{ id: string; name: string; adoptedAt: string }>;
    }>();

    for (const app of adoptedApps) {
      const key = app.applicantEmail.toLowerCase();
      const existing = adoptersMap.get(key);
      const animalEntry = {
        id: app.animalId,
        name: app.animalName || 'Unknown',
        adoptedAt: app.adoptedAt || new Date().toISOString(),
      };

      if (existing) {
        if (!existing.adoptedAnimals.find(a => a.id === app.animalId)) {
          existing.adoptedAnimals.push(animalEntry);
        }
      } else {
        adoptersMap.set(key, {
          id: key,
          email: app.applicantEmail,
          fullName: app.applicantName || app.applicantEmail,
          phone: app.applicantPhone || null,
          adoptedAnimals: [animalEntry],
        });
      }
    }

    res.json(Array.from(adoptersMap.values()));
  } catch (error) {
    console.error('[Adopter Portal Admin] Error fetching adopters:', error);
    res.status(500).json({ error: 'Failed to load adopters' });
  }
});

/**
 * GET /api/adopter/admin/adopter-preview/:adopterId/pets
 * Returns adopted animals for a specific adopter (adopterId is the lowercased email)
 */
router.get('/admin/adopter-preview/:adopterId/pets', async (req: Request, res: Response) => {
  try {
    const auth = requireAdmin(req, res);
    if (!auth) return;

    const adopterEmail = decodeURIComponent(req.params.adopterId).toLowerCase();

    const adoptedAnimals = await db
      .select({
        id: animals.id,
        name: animals.name,
        species: animals.species,
        breed: animals.breed,
        photoUrls: animals.photoUrls,
        adoptedAt: animals.adoptionDate,
        microchipNumber: animals.microchipNumber,
        status: animals.status,
        deceasedDate: animals.deceasedDate,
      })
      .from(animals)
      .innerJoin(
        applications,
        and(
          eq(applications.animalId, animals.id),
          eq(applications.tenantId, auth.tenantId),
          eq(applications.stage, 'adopted'),
          sql`LOWER(${applications.applicantEmail}) = ${adopterEmail}`
        )
      )
      .where(and(
        eq(animals.tenantId, auth.tenantId),
        inArray(animals.status, ['adopted', 'deceased'])
      ))
      .orderBy(desc(animals.adoptionDate));

    res.json(adoptedAnimals);
  } catch (error) {
    console.error('[Adopter Portal Admin] Error fetching adopter pets:', error);
    res.status(500).json({ error: 'Failed to load adopter pets' });
  }
});

/**
 * GET /api/adopter/admin/adopter-preview/:adopterId/pets/:animalId
 * Returns a single adopted animal detail for the admin preview
 */
router.get('/admin/adopter-preview/:adopterId/pets/:animalId', async (req: Request, res: Response) => {
  try {
    const auth = requireAdmin(req, res);
    if (!auth) return;

    const adopterEmail = decodeURIComponent(req.params.adopterId).toLowerCase();
    const { animalId } = req.params;

    const [animal] = await db
      .select({
        id: animals.id,
        name: animals.name,
        species: animals.species,
        breed: animals.breed,
        photoUrls: animals.photoUrls,
        adoptedAt: animals.adoptionDate,
        microchipNumber: animals.microchipNumber,
        weight: animals.weight,
      })
      .from(animals)
      .innerJoin(
        applications,
        and(
          eq(applications.animalId, animals.id),
          eq(applications.tenantId, auth.tenantId),
          eq(applications.stage, 'adopted'),
          sql`LOWER(${applications.applicantEmail}) = ${adopterEmail}`
        )
      )
      .where(and(
        eq(animals.id, animalId),
        eq(animals.tenantId, auth.tenantId)
      ))
      .limit(1);

    if (!animal) {
      return res.status(404).json({ error: 'Pet not found' });
    }

    res.json(animal);
  } catch (error) {
    console.error('[Adopter Portal Admin] Error fetching pet detail:', error);
    res.status(500).json({ error: 'Failed to load pet details' });
  }
});

/**
 * GET /api/adopter/admin/adopter-preview/:adopterId/pets/:animalId/vaccinations
 */
router.get('/admin/adopter-preview/:adopterId/pets/:animalId/vaccinations', async (req: Request, res: Response) => {
  try {
    const auth = requireAdmin(req, res);
    if (!auth) return;

    const { animalId } = req.params;

    const careRecords = await db
      .select({
        id: preventativeCareRecords.id,
        vaccineName: preventativeCareRecords.careName,
        dateAdministered: preventativeCareRecords.dateAdministered,
        expirationDate: preventativeCareRecords.nextDueDate,
        veterinarian: preventativeCareRecords.administeredBy,
      })
      .from(preventativeCareRecords)
      .where(and(
        eq(preventativeCareRecords.animalId, animalId),
        eq(preventativeCareRecords.tenantId, auth.tenantId),
        eq(preventativeCareRecords.careCategory, 'vaccine')
      ))
      .orderBy(desc(preventativeCareRecords.dateAdministered));

    const legacyVaccines = await db
      .select({
        id: vaccineRecords.id,
        vaccineName: vaccineRecords.itemName,
        dateAdministered: vaccineRecords.dateGiven,
        expirationDate: vaccineRecords.dateDue,
        veterinarian: vaccineRecords.administeredBy,
      })
      .from(vaccineRecords)
      .where(and(
        eq(vaccineRecords.animalId, animalId),
        eq(vaccineRecords.tenantId, auth.tenantId)
      ))
      .orderBy(desc(vaccineRecords.dateGiven));

    const combined = [...careRecords, ...legacyVaccines] as VaccineRecord[];
    const deduplicated = deduplicateVaccineRecords(combined);

    res.json(deduplicated);
  } catch (error) {
    console.error('[Adopter Portal Admin] Error fetching vaccinations:', error);
    res.status(500).json({ error: 'Failed to load vaccinations' });
  }
});

/**
 * GET /api/adopter/admin/adopter-preview/:adopterId/pets/:animalId/medical-exams
 */
router.get('/admin/adopter-preview/:adopterId/pets/:animalId/medical-exams', async (req: Request, res: Response) => {
  try {
    const auth = requireAdmin(req, res);
    if (!auth) return;

    const { animalId } = req.params;

    const exams = await db
      .select({
        id: medicalExams.id,
        examType: medicalExams.examType,
        examDate: medicalExams.examDate,
        findings: medicalExams.assessment,
        veterinarian: medicalExams.performedBy,
      })
      .from(medicalExams)
      .where(and(
        eq(medicalExams.animalId, animalId),
        eq(medicalExams.tenantId, auth.tenantId)
      ))
      .orderBy(desc(medicalExams.examDate));

    res.json(exams);
  } catch (error) {
    console.error('[Adopter Portal Admin] Error fetching medical exams:', error);
    res.status(500).json({ error: 'Failed to load medical exams' });
  }
});

/**
 * GET /api/adopter/admin/adopter-preview/:adopterId/pets/:animalId/weight-logs
 */
router.get('/admin/adopter-preview/:adopterId/pets/:animalId/weight-logs', async (req: Request, res: Response) => {
  try {
    const auth = requireAdmin(req, res);
    if (!auth) return;

    const { animalId } = req.params;

    const logs = await db
      .select({
        id: adopterWeightLogs.id,
        weight: adopterWeightLogs.weight,
        weightUnit: adopterWeightLogs.weightUnit,
        loggedAt: adopterWeightLogs.loggedAt,
        notes: adopterWeightLogs.notes,
      })
      .from(adopterWeightLogs)
      .where(and(
        eq(adopterWeightLogs.animalId, animalId),
        eq(adopterWeightLogs.tenantId, auth.tenantId)
      ))
      .orderBy(desc(adopterWeightLogs.loggedAt));

    res.json(logs);
  } catch (error) {
    console.error('[Adopter Portal Admin] Error fetching weight logs:', error);
    res.status(500).json({ error: 'Failed to load weight logs' });
  }
});

/**
 * GET /api/adopter/admin/adopter-preview/:adopterId/pets/:animalId/medication-reminders
 */
router.get('/admin/adopter-preview/:adopterId/pets/:animalId/medication-reminders', async (req: Request, res: Response) => {
  try {
    const auth = requireAdmin(req, res);
    if (!auth) return;

    const { animalId } = req.params;

    const reminders = await db
      .select({
        id: adopterMedicationReminders.id,
        medicationName: adopterMedicationReminders.medicationName,
        frequency: adopterMedicationReminders.frequency,
        nextDueDate: adopterMedicationReminders.nextDueDate,
        lastConfirmedDate: adopterMedicationReminders.lastConfirmedDate,
      })
      .from(adopterMedicationReminders)
      .where(and(
        eq(adopterMedicationReminders.animalId, animalId),
        eq(adopterMedicationReminders.tenantId, auth.tenantId)
      ))
      .orderBy(asc(adopterMedicationReminders.nextDueDate));

    res.json(reminders);
  } catch (error) {
    console.error('[Adopter Portal Admin] Error fetching medication reminders:', error);
    res.status(500).json({ error: 'Failed to load medication reminders' });
  }
});

/**
 * GET /api/adopter/admin/adopter-preview/:adopterId/pets/:animalId/happy-tails
 */
router.get('/admin/adopter-preview/:adopterId/pets/:animalId/happy-tails', async (req: Request, res: Response) => {
  try {
    const auth = requireAdmin(req, res);
    if (!auth) return;

    const { animalId } = req.params;

    const updates = await db
      .select({
        id: happyTails.id,
        photoUrl: happyTails.photoUrl,
        message: happyTails.story,
        isApproved: happyTails.isPublished,
        createdAt: happyTails.createdAt,
      })
      .from(happyTails)
      .where(and(
        eq(happyTails.animalId, animalId),
        eq(happyTails.tenantId, auth.tenantId)
      ))
      .orderBy(desc(happyTails.createdAt));

    const mapped = updates.map(u => ({
      ...u,
      photoUrls: u.photoUrl ? [u.photoUrl] : [],
    }));

    res.json(mapped);
  } catch (error) {
    console.error('[Adopter Portal Admin] Error fetching happy tails:', error);
    res.status(500).json({ error: 'Failed to load updates' });
  }
});

/**
 * GET /api/adopter/pets/:animalId/adoption-packet
 * Downloads the full medical adoption packet PDF for an adopter's pet
 */
router.get('/pets/:animalId/adoption-packet', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;
    const { animalId } = req.params;
    const owns = await verifyAdopterOwnsAnimal(auth.userId, auth.tenantId, animalId);
    if (!owns) return res.status(403).json({ error: 'Access denied' });

    const { generateAdoptionPacketPDF } = await import('../services/adoption-packet-pdf');
    const pdfBuffer = await generateAdoptionPacketPDF(animalId, auth.tenantId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="adoption-packet.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('[Adopter Portal] Error generating adoption packet:', error);
    res.status(500).json({ error: 'Failed to generate adoption packet' });
  }
});

/**
 * GET /api/adopter/pets/:animalId/compliance-obligations
 * Returns post-adoption compliance obligations (spay/neuter, etc.) for an adopter's pet
 */
router.get('/pets/:animalId/compliance-obligations', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;
    const { animalId } = req.params;
    const owns = await verifyAdopterOwnsAnimal(auth.userId, auth.tenantId, animalId);
    if (!owns) return res.status(403).json({ error: 'Access denied' });

    const obligations = await db
      .select({
        id: complianceObligations.id,
        obligationType: complianceObligations.obligationType,
        contractualDueDate: complianceObligations.contractualDueDate,
        status: complianceObligations.status,
        notes: complianceObligations.notes,
        proofDocumentUrl: complianceObligations.proofDocumentUrl,
      })
      .from(complianceObligations)
      .where(and(
        eq(complianceObligations.tenantId, auth.tenantId),
        eq(complianceObligations.animalId, animalId),
      ))
      .orderBy(asc(complianceObligations.contractualDueDate));

    res.json(obligations);
  } catch (error) {
    console.error('[Adopter Portal] Error fetching compliance obligations:', error);
    res.status(500).json({ error: 'Failed to fetch compliance obligations' });
  }
});

/**
 * POST /api/adopter/pets/:animalId/compliance-obligations/:obligationId/submit-proof
 * Adopter submits a proof document URL for a compliance obligation
 */
router.post('/pets/:animalId/compliance-obligations/:obligationId/submit-proof', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;
    const { animalId, obligationId } = req.params;
    const owns = await verifyAdopterOwnsAnimal(auth.userId, auth.tenantId, animalId);
    if (!owns) return res.status(403).json({ error: 'Access denied' });

    const { fileUrl } = req.body;
    if (!fileUrl || typeof fileUrl !== 'string') {
      return res.status(400).json({ error: 'fileUrl is required' });
    }

    const [updated] = await db
      .update(complianceObligations)
      .set({ proofDocumentUrl: fileUrl, status: 'pending_review' })
      .where(and(
        eq(complianceObligations.id, obligationId),
        eq(complianceObligations.animalId, animalId),
        eq(complianceObligations.tenantId, auth.tenantId),
      ))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Obligation not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('[Adopter Portal] Error submitting obligation proof:', error);
    res.status(500).json({ error: 'Failed to submit proof' });
  }
});

// ===== HEARTWORM TREATMENT ROUTES =====

/**
 * GET /api/adopter/pets/:animalId/heartworm-treatment-plan
 * Returns the most recent heartworm treatment plan for the adopter's pet, or null.
 */
router.get('/pets/:animalId/heartworm-treatment-plan', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;
    const { animalId } = req.params;
    const owns = await verifyAdopterOwnsAnimal(auth.userId, auth.tenantId, animalId);
    if (!owns) return res.status(403).json({ error: 'Access denied' });

    const [plan] = await db
      .select({
        id: heartwormTreatmentPlans.id,
        appointments: heartwormTreatmentPlans.appointments,
        locationName: heartwormTreatmentPlans.locationName,
        locationAddress: heartwormTreatmentPlans.locationAddress,
        locationPhone: heartwormTreatmentPlans.locationPhone,
        notes: heartwormTreatmentPlans.notes,
        contractSentAt: heartwormTreatmentPlans.contractSentAt,
        adopterName: heartwormTreatmentPlans.adopterName,
        createdAt: heartwormTreatmentPlans.createdAt,
      })
      .from(heartwormTreatmentPlans)
      .where(and(
        eq(heartwormTreatmentPlans.tenantId, auth.tenantId),
        eq(heartwormTreatmentPlans.animalId, animalId),
      ))
      .orderBy(desc(heartwormTreatmentPlans.createdAt))
      .limit(1);

    if (!plan) {
      return res.json(null);
    }
    res.json(plan);
  } catch (error) {
    console.error('[Adopter Portal] Error fetching heartworm treatment plan:', error);
    res.status(500).json({ error: 'Failed to load heartworm treatment plan' });
  }
});

/**
 * POST /api/adopter/pets/:animalId/heartworm-treatment-plan/:planId/appointments/:appointmentIndex/complete
 * Adopter marks a single appointment as completed, with optional vet receipt upload.
 * Multipart form fields: completedDate (required), notes (optional), receipt (optional file: image or PDF).
 */
router.post(
  '/pets/:animalId/heartworm-treatment-plan/:planId/appointments/:appointmentIndex/complete',
  async (req: Request, res: Response) => {
    try {
      const auth = requireAdopter(req, res);
      if (!auth) return;
      const { animalId, planId, appointmentIndex } = req.params;
      const owns = await verifyAdopterOwnsAnimal(auth.userId, auth.tenantId, animalId);
      if (!owns) return res.status(403).json({ error: 'Access denied' });

      const idx = Number(appointmentIndex);
      if (!Number.isInteger(idx) || idx < 0) {
        return res.status(400).json({ error: 'Invalid appointment index' });
      }

      const multer = (await import('multer')).default;
      // Require BOTH MIME and extension to be in the allowlist (defense in depth against
      // file-type spoofing). Each MIME-extension combination is whitelisted explicitly.
      const allowedMimeExtPairs: Record<string, string[]> = {
        'image/jpeg': ['jpg', 'jpeg'],
        'image/png': ['png'],
        'image/gif': ['gif'],
        'image/webp': ['webp'],
        'image/heic': ['heic', 'heif'],
        'image/heif': ['heic', 'heif'],
        'image/bmp': ['bmp'],
        'image/avif': ['avif'],
        'application/pdf': ['pdf'],
      };

      const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: (_r, file, cb) => {
          if (file.mimetype === 'image/svg+xml') {
            cb(new Error('SVG files are not allowed'));
            return;
          }
          const ext = file.originalname.toLowerCase().split('.').pop() || '';
          const allowedExts = allowedMimeExtPairs[file.mimetype];
          if (!allowedExts || !allowedExts.includes(ext)) {
            cb(new Error('Only image (JPEG/PNG/GIF/WebP/HEIC/HEIF/BMP/AVIF) or PDF files are allowed; the file type and extension must match'));
            return;
          }
          cb(null, true);
        },
      }).single('receipt');

      upload(req, res, async (uploadErr) => {
        if (uploadErr) {
          return res.status(400).json({ error: uploadErr.message });
        }

        try {
          const completedDate = (req.body?.completedDate as string | undefined)?.trim();
          if (!completedDate || !/^\d{4}-\d{2}-\d{2}$/.test(completedDate)) {
            return res.status(400).json({ error: 'completedDate (YYYY-MM-DD) is required' });
          }
          const notes = typeof req.body?.notes === 'string' && req.body.notes.trim().length > 0
            ? req.body.notes.trim().slice(0, 500)
            : null;

          const [plan] = await db
            .select()
            .from(heartwormTreatmentPlans)
            .where(and(
              eq(heartwormTreatmentPlans.tenantId, auth.tenantId),
              eq(heartwormTreatmentPlans.id, planId),
              eq(heartwormTreatmentPlans.animalId, animalId),
            ))
            .limit(1);

          if (!plan) {
            return res.status(404).json({ error: 'Treatment plan not found' });
          }

          const appointments = Array.isArray(plan.appointments) ? [...plan.appointments] : [];
          if (idx >= appointments.length) {
            return res.status(400).json({ error: 'Appointment index out of range' });
          }

          // Optional receipt upload
          let receiptObjectPath: string | null = appointments[idx]?.receiptObjectPath ?? null;
          let receiptFileName: string | null = null;
          let receiptContentType: string | null = null;
          let receiptFileSize: number | null = null;
          const file = req.file as Express.Multer.File | undefined;

          if (file) {
            // Magic-byte sniff: validate the leading bytes match the claimed MIME type
            // for the most common formats. Defense in depth on top of MIME+ext allowlist.
            const buf = file.buffer;
            const startsWith = (sig: number[], offset = 0) =>
              buf.length >= offset + sig.length &&
              sig.every((b, i) => buf[offset + i] === b);
            let signatureOk = true;
            switch (file.mimetype) {
              case 'application/pdf':
                signatureOk = startsWith([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
                break;
              case 'image/jpeg':
                signatureOk = startsWith([0xff, 0xd8, 0xff]);
                break;
              case 'image/png':
                signatureOk = startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
                break;
              case 'image/gif':
                signatureOk = startsWith([0x47, 0x49, 0x46, 0x38]); // GIF8
                break;
              case 'image/webp':
                signatureOk = startsWith([0x52, 0x49, 0x46, 0x46]) && // RIFF
                  startsWith([0x57, 0x45, 0x42, 0x50], 8); // WEBP
                break;
              case 'image/bmp':
                signatureOk = startsWith([0x42, 0x4d]); // BM
                break;
              // HEIC/HEIF/AVIF have an ftyp box at offset 4; we accept these without
              // strict signature checks because their box brand is variable.
              default:
                signatureOk = true;
            }
            if (!signatureOk) {
              return res.status(400).json({ error: 'File contents do not match the declared file type' });
            }

            const { ObjectStorageService, objectStorageClient } = await import('../objectStorage');
            const { randomUUID } = await import('crypto');
            const objectStorageService = new ObjectStorageService();
            const privateObjectDir = objectStorageService.getPrivateObjectDir();

            let fileBuffer = file.buffer;
            let contentType = file.mimetype;
            const ext = file.originalname.toLowerCase().split('.').pop() || '';
            if (ext === 'heic' || ext === 'heif' || contentType === 'image/heic' || contentType === 'image/heif') {
              try {
                const heicConvert = (await import('heic-convert')).default;
                const converted = await heicConvert({ buffer: file.buffer, format: 'JPEG', quality: 0.9 });
                fileBuffer = Buffer.from(converted);
                contentType = 'image/jpeg';
              } catch (convErr) {
                console.error('[Adopter Portal HW] HEIC conversion failed; uploading original:', convErr);
              }
            }

            const objectId = randomUUID();
            const folder = 'heartworm-receipts';
            const fullPath = `${privateObjectDir}/${auth.tenantId}/${folder}/${objectId}`;
            const parts = fullPath.startsWith('/') ? fullPath.split('/') : `/${fullPath}`.split('/');
            const bucketName = parts[1];
            const objectName = parts.slice(2).join('/');
            const bucket = objectStorageClient.bucket(bucketName);
            const fileObj = bucket.file(objectName);
            await fileObj.save(fileBuffer, { metadata: { contentType } });

            const normalizedPath = `/objects/${auth.tenantId}/${folder}/${objectId}`;
            await objectStorageService.trySetObjectEntityAclPolicy(normalizedPath, {
              owner: auth.userId,
              visibility: 'public',
            });
            receiptObjectPath = normalizedPath;
            receiptFileName = file.originalname;
            receiptContentType = contentType;
            receiptFileSize = fileBuffer.length;
          }

          // Update the appointment in place
          appointments[idx] = {
            ...appointments[idx],
            completedDate,
            completedByAdopter: true,
            ...(notes !== null ? { notes } : {}),
            ...(receiptObjectPath ? { receiptObjectPath } : {}),
          };

          const [updatedPlan] = await db
            .update(heartwormTreatmentPlans)
            .set({ appointments, updatedAt: new Date() })
            .where(and(
              eq(heartwormTreatmentPlans.tenantId, auth.tenantId),
              eq(heartwormTreatmentPlans.id, planId),
            ))
            .returning();

          // Link the receipt into person_documents so staff can see it alongside other adopter docs
          if (file && receiptObjectPath && receiptFileName) {
            try {
              const adopterEmail = req.user!.email;
              const normalizedEmail = adopterEmail.toLowerCase().trim();
              const [contact] = await db
                .select({ id: contacts.id })
                .from(contacts)
                .where(and(
                  eq(contacts.tenantId, auth.tenantId),
                  sql`LOWER(TRIM(${contacts.email})) = ${normalizedEmail}`,
                ))
                .limit(1);

              const apptLabel = appointments[idx]?.label || 'Heartworm Appointment';
              const [animalRow] = await db
                .select({ name: animals.name })
                .from(animals)
                .where(eq(animals.id, animalId))
                .limit(1);
              const animalName = animalRow?.name || 'Pet';

              await db.insert(personDocuments).values({
                tenantId: auth.tenantId,
                personType: 'contact',
                personId: contact?.id ?? null,
                personEmail: adopterEmail,
                documentType: 'uploaded',
                documentSubtype: 'other',
                title: `Heartworm Receipt — ${animalName} — ${apptLabel}`,
                description: `Vet receipt uploaded by adopter for "${apptLabel}" on ${completedDate}.`,
                objectPath: receiptObjectPath,
                fileName: receiptFileName,
                fileSize: receiptFileSize ?? undefined,
                contentType: receiptContentType ?? undefined,
                uploadedBy: auth.userId,
              });
            } catch (docErr) {
              console.error('[Adopter Portal HW] Failed to link receipt to person_documents:', docErr);
              // Non-fatal — appointment update already saved.
            }
          }

          res.json({
            id: updatedPlan.id,
            appointments: updatedPlan.appointments,
          });
        } catch (innerErr) {
          console.error('[Adopter Portal] Error completing HW appointment:', innerErr);
          res.status(500).json({ error: 'Failed to mark appointment completed' });
        }
      });
    } catch (error) {
      console.error('[Adopter Portal] Error in HW appointment completion handler:', error);
      res.status(500).json({ error: 'Failed to mark appointment completed' });
    }
  }
);

/**
 * GET /api/adopter/pets/:animalId/heartworm-treatment-plan/:planId/contract
 * Returns a printable HTML view of the heartworm treatment contract.
 * Adopter can use the browser's "Save as PDF" to download.
 */
router.get('/pets/:animalId/heartworm-treatment-plan/:planId/contract', async (req: Request, res: Response) => {
  try {
    const auth = requireAdopter(req, res);
    if (!auth) return;
    const { animalId, planId } = req.params;
    const owns = await verifyAdopterOwnsAnimal(auth.userId, auth.tenantId, animalId);
    if (!owns) return res.status(403).json({ error: 'Access denied' });

    const [plan] = await db
      .select()
      .from(heartwormTreatmentPlans)
      .where(and(
        eq(heartwormTreatmentPlans.tenantId, auth.tenantId),
        eq(heartwormTreatmentPlans.id, planId),
        eq(heartwormTreatmentPlans.animalId, animalId),
      ))
      .limit(1);

    if (!plan) return res.status(404).json({ error: 'Treatment plan not found' });

    // Only allow contract download once the rescue has formally sent the contract.
    // The UI hides the button when contractSentAt is null; enforce the same on the server.
    if (!plan.contractSentAt) {
      return res.status(404).json({ error: 'Contract is not available yet' });
    }

    const [animalRow] = await db
      .select({ name: animals.name })
      .from(animals)
      .where(eq(animals.id, animalId))
      .limit(1);

    const [tenantRow] = await db
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, auth.tenantId))
      .limit(1);

    const animalName = animalRow?.name || 'Your Pet';
    const tenantName = tenantRow?.name || 'the rescue organization';
    const escape = (s: string | null | undefined) =>
      String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

    const appointments = Array.isArray(plan.appointments) ? plan.appointments : [];
    const parseLocalDate = (s: string | null | undefined): Date | null => {
      if (!s) return null;
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (m) {
        const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return Number.isNaN(dt.getTime()) ? null : dt;
      }
      const dt = new Date(s);
      return Number.isNaN(dt.getTime()) ? null : dt;
    };

    const apptRows = appointments
      .map((a: any) => {
        const date = parseLocalDate(a?.scheduledDate);
        const formatted = date
          ? date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
          : escape(a?.scheduledDate);
        const completed = a?.completedDate
          ? `<span style="color:#16a34a;font-weight:600;"> — Completed ${escape(a.completedDate)}</span>`
          : '';
        return `<tr>
          <td style="padding:12px;border:1px solid #d1d5db;">${escape(a?.label)}</td>
          <td style="padding:12px;border:1px solid #d1d5db;">${formatted}${completed}</td>
        </tr>`;
      })
      .join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Heartworm Treatment Contract — ${escape(animalName)}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #111827; }
    h1 { color: #1f2937; border-bottom: 2px solid #dc2626; padding-bottom: 12px; }
    .warning { background: #fef2f2; border: 2px solid #dc2626; border-radius: 8px; padding: 16px; margin: 24px 0; }
    .warning p { color: #dc2626; font-weight: bold; margin: 0; }
    table { width: 100%; border-collapse: collapse; margin: 24px 0; }
    th { background: #f3f4f6; padding: 12px; text-align: left; border: 1px solid #d1d5db; }
    .location { background: #f9fafb; border-radius: 8px; padding: 16px; margin: 24px 0; }
    .actions { margin: 16px 0 24px; }
    .actions button { padding: 8px 16px; font-size: 14px; cursor: pointer; }
    @media print { body { padding: 20px; } .actions { display: none; } }
  </style>
</head>
<body>
  <div class="actions">
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
  <h1>Heartworm Treatment Contract</h1>
  <h2>Patient: ${escape(animalName)}</h2>
  <p><strong>Adopter:</strong> ${escape(plan.adopterName)}</p>

  <div class="warning">
    <p>IMPORTANT: Completion of ALL heartworm treatment appointments is MANDATORY. Failure to complete treatment may result in the dog being reclaimed by ${escape(tenantName)}.</p>
  </div>

  <h3>Appointment Schedule</h3>
  <table>
    <thead><tr><th>Appointment</th><th>Date</th></tr></thead>
    <tbody>${apptRows}</tbody>
  </table>

  <h3>Treatment Location</h3>
  <div class="location">
    <p style="margin:0;font-weight:bold;">${escape(plan.locationName)}</p>
    <p style="margin:4px 0 0 0;">${escape(plan.locationAddress)}</p>
    <p style="margin:4px 0 0 0;">Phone: ${escape(plan.locationPhone)}</p>
  </div>

  ${plan.notes ? `<h3>Additional Notes</h3><p>${escape(plan.notes)}</p>` : ''}
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  } catch (error) {
    console.error('[Adopter Portal] Error generating HW contract view:', error);
    res.status(500).json({ error: 'Failed to load contract' });
  }
});

export default router;

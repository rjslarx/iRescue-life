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
} from '@shared/schema';
import { eq, and, isNull, gt, desc, sql, asc } from 'drizzle-orm';
import { z } from 'zod';
import { EmailService } from '../lib/email-service';

const router = Router();
const SALT_ROUNDS = 10;
const TOKEN_EXPIRY_HOURS = 24;

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
        eq(animals.status, 'adopted')
      ))
      .orderBy(desc(animals.adoptionDate));

    res.json(adoptedAnimals);
  } catch (error) {
    console.error('[Adopter Portal] Error fetching adopted animals:', error);
    res.status(500).json({ error: 'Failed to load pets' });
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

    const combined = [...careRecords, ...legacyVaccines]
      .sort((a, b) => new Date(b.dateAdministered).getTime() - new Date(a.dateAdministered).getTime());

    res.json(combined);
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

export default router;

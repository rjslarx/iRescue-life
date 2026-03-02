import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { db } from '../db';
import {
  animals,
  contacts,
  users,
  adopterMagicTokens,
  complianceObligations,
  preventativeCareRecords,
  preventativeCareTypes,
  tenants,
} from '@shared/schema';
import { eq, and, or, sql, isNull, ilike } from 'drizzle-orm';
import { createAnimal } from '../services/animals';
import { EmailService } from '../lib/email-service';

const router = Router();

router.post('/adopted-backfill', async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.tenant) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRoles = (req.user as any).roles || [];
    if (!userRoles.includes('admin') && !userRoles.includes('owner')) {
      return res.status(403).json({ error: 'Admin or owner access required' });
    }

    const tenantId = req.tenant.id;
    const {
      animalName,
      species,
      breed,
      age,
      sex,
      microchip,
      neuterStatus,
      adopterName,
      adopterEmail,
      adopterPhone,
      adoptionDate,
      rabiesDueDate,
      dhppDueDate,
      bordetellaDueDate,
      heartwormDueDate,
      fleaTickDueDate,
      spayNeuterDate,
    } = req.body;

    if (!animalName || !species || !breed || !age || !adopterName || !adopterEmail || !adoptionDate) {
      return res.status(400).json({ error: 'Missing required fields: animalName, species, breed, age, adopterName, adopterEmail, adoptionDate' });
    }

    const parsedAdoptionDate = new Date(adoptionDate);
    if (isNaN(parsedAdoptionDate.getTime())) {
      return res.status(400).json({ error: 'Invalid adoption date' });
    }

    const normalizedEmail = adopterEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Invalid email address format' });
    }

    const dueDateFields = [rabiesDueDate, dhppDueDate, bordetellaDueDate, heartwormDueDate, fleaTickDueDate, spayNeuterDate].filter(Boolean);
    for (const d of dueDateFields) {
      if (isNaN(new Date(d).getTime())) {
        return res.status(400).json({ error: `Invalid date format: ${d}` });
      }
    }

    let contactId: string;

    const [existingContact] = await db
      .select()
      .from(contacts)
      .where(and(
        eq(contacts.tenantId, tenantId),
        sql`LOWER(${contacts.email}) = ${normalizedEmail}`
      ))
      .limit(1);

    if (existingContact) {
      contactId = existingContact.id;
    } else {
      const [newContact] = await db
        .insert(contacts)
        .values({
          tenantId,
          name: adopterName,
          email: adopterEmail.trim(),
          phone: adopterPhone || null,
          type: 'adopter',
        })
        .returning({ id: contacts.id });
      contactId = newContact.id;
    }

    const animal = await createAnimal(tenantId, {
      name: animalName,
      species,
      breed,
      age,
      sex: sex || 'Unknown',
      microchip: microchip || null,
      neuterStatus: neuterStatus || 'unknown',
      status: 'adopted',
      adoptionDate: parsedAdoptionDate,
      intakeDate: parsedAdoptionDate,
      sourceContactId: contactId,
    });

    let adopterUserId: string;
    const [existingUser] = await db
      .select({ id: users.id, roles: users.roles })
      .from(users)
      .where(and(
        eq(users.tenantId, tenantId),
        sql`LOWER(${users.email}) = ${normalizedEmail}`,
        eq(users.isActive, true)
      ))
      .limit(1);

    if (existingUser) {
      if (!existingUser.roles.includes('adopter')) {
        await db
          .update(users)
          .set({ roles: [...existingUser.roles, 'adopter'] })
          .where(eq(users.id, existingUser.id));
      }
      adopterUserId = existingUser.id;
    } else {
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, 10);

      const [newUser] = await db
        .insert(users)
        .values({
          tenantId,
          email: adopterEmail.trim(),
          passwordHash,
          fullName: adopterName,
          roles: ['adopter'] as any,
          isActive: true,
        })
        .returning({ id: users.id });
      adopterUserId = newUser.id;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, 10);
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 72);

    await db.insert(adopterMagicTokens).values({
      tenantId,
      userId: adopterUserId,
      tokenHash,
      expiresAt: tokenExpiry,
    });

    const medDates: Record<string, string> = {};
    if (rabiesDueDate) medDates.rabiesDueDate = rabiesDueDate;
    if (dhppDueDate) medDates.dhppDueDate = dhppDueDate;
    if (bordetellaDueDate) medDates.bordetellaDueDate = bordetellaDueDate;
    if (heartwormDueDate) medDates.heartwormDueDate = heartwormDueDate;
    if (fleaTickDueDate) medDates.fleaTickDueDate = fleaTickDueDate;

    const CARE_MAP: { dateKey: string; careName: string; category: 'vaccine' | 'parasite_prevention'; obligationType?: string; searchTerms: string[] }[] = [
      { dateKey: 'rabiesDueDate', careName: 'Rabies', category: 'vaccine', obligationType: 'rabies', searchTerms: ['rabies'] },
      { dateKey: 'dhppDueDate', careName: 'DHPP', category: 'vaccine', obligationType: 'dhpp_booster', searchTerms: ['dhpp', 'da2pp', 'dapp', 'distemper'] },
      { dateKey: 'bordetellaDueDate', careName: 'Bordetella', category: 'vaccine', searchTerms: ['bordetella', 'kennel cough'] },
      { dateKey: 'heartwormDueDate', careName: 'Heartworm Prevention', category: 'parasite_prevention', searchTerms: ['heartworm'] },
      { dateKey: 'fleaTickDueDate', careName: 'Flea/Tick Prevention', category: 'parasite_prevention', searchTerms: ['flea', 'tick'] },
    ];

    const allCareTypes = await db
      .select()
      .from(preventativeCareTypes)
      .where(
        or(
          eq(preventativeCareTypes.tenantId, tenantId),
          isNull(preventativeCareTypes.tenantId)
        )
      );

    const obligationsToInsert: any[] = [];

    for (const mapping of CARE_MAP) {
      const dueDateStr = medDates[mapping.dateKey];
      if (!dueDateStr) continue;

      const dueDate = new Date(dueDateStr);
      if (isNaN(dueDate.getTime())) continue;

      const matchingType = allCareTypes.find(ct => {
        const name = ct.name.toLowerCase();
        return mapping.searchTerms.some(term => name.includes(term));
      });

      await db.insert(preventativeCareRecords).values({
        animalId: animal.id,
        tenantId,
        careTypeId: matchingType?.id || null,
        careName: matchingType?.name || mapping.careName,
        careCategory: mapping.category,
        dateAdministered: parsedAdoptionDate,
        nextDueDate: dueDate,
        administeredBy: 'Set during backfill import',
        notes: 'Due date set during adopted animal backfill registration',
      });

      if (mapping.obligationType) {
        obligationsToInsert.push({
          tenantId,
          animalId: animal.id,
          adopterName,
          adopterEmail: adopterEmail.trim(),
          adopterPhone: adopterPhone || null,
          obligationType: mapping.obligationType,
          label: mapping.careName,
          contractualDueDate: dueDateStr,
          status: 'pending',
        });
      }
    }

    if (neuterStatus === 'intact' && spayNeuterDate) {
      obligationsToInsert.push({
        tenantId,
        animalId: animal.id,
        adopterName,
        adopterEmail: adopterEmail.trim(),
        adopterPhone: adopterPhone || null,
        obligationType: 'spay_neuter',
        label: 'Spay/Neuter',
        contractualDueDate: spayNeuterDate,
        status: 'pending',
      });
    }

    if (obligationsToInsert.length > 0) {
      await db.insert(complianceObligations).values(obligationsToInsert);
    }

    try {
      const [tenantInfo] = await db
        .select({ subdomain: tenants.subdomain, customDomain: tenants.customDomain, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      if (tenantInfo) {
        const encodedToken = encodeURIComponent(rawToken);
        let loginUrl: string;
        if (tenantInfo.customDomain) {
          loginUrl = `https://${tenantInfo.customDomain}/my-pets/login?token=${encodedToken}`;
        } else {
          const baseUrl = process.env.REPLIT_DEV_DOMAIN
            ? `https://${process.env.REPLIT_DEV_DOMAIN}`
            : (process.env.APP_BASE_URL || 'https://irescue.life');
          const tenantPath = tenantInfo.subdomain ? `/${tenantInfo.subdomain}` : '';
          loginUrl = `${baseUrl}${tenantPath}/my-pets/login?token=${encodedToken}`;
        }

        const emailService = await EmailService.forTenant(tenantId);
        if (emailService) {
          await emailService.send({
            to: adopterEmail.trim(),
            subject: `Your Pet Portal is Ready - ${tenantInfo.name}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2563eb;">Welcome to Your Pet Portal!</h2>
                <p>Hi ${adopterName.split(' ')[0]},</p>
                <p>Great news! You now have access to your <strong>Pet Portal</strong> for <strong>${animalName}</strong> where you can:</p>
                
                <ul style="font-size: 14px; line-height: 1.8;">
                  <li>View ${animalName}'s medical records and vaccination history</li>
                  <li>Track weight and health milestones</li>
                  <li>Set medication reminders</li>
                  <li>Share Happy Tails updates and photos</li>
                </ul>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${loginUrl}" 
                     style="background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                    Access My Pet Portal
                  </a>
                </div>
                
                <p style="color: #6b7280; font-size: 14px;">
                  No password needed! Just click the button above. This link expires in 3 days, but you can always request a new one from the Pet Portal login page.
                </p>
                
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                
                <p style="color: #9ca3af; font-size: 12px;">
                  Thank you for being part of our rescue family!<br>
                  ${tenantInfo.name}
                </p>
              </div>
            `,
          });
          console.log(`[Backfill] Sent Pet Portal welcome email to ${adopterEmail}`);
        }
      }
    } catch (emailErr) {
      console.warn('[Backfill] Welcome email failed (non-blocking):', emailErr instanceof Error ? emailErr.message : 'Unknown');
    }

    console.log(`[Backfill] Created adopted animal ${animal.id} (${animalName}) with adopter ${adopterName} for tenant ${tenantId}`);

    return res.json({
      success: true,
      animalId: animal.id,
      localShelterId: animal.localShelterId,
      animalName: animal.name,
      adopterName,
      complianceObligationsCreated: obligationsToInsert.length,
    });
  } catch (error: any) {
    console.error('[Backfill] Error:', error);
    if (error.message?.includes('duplicate') || error.message?.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;

import { Router } from 'express';
import { requireTenant } from '../middleware/tenant';
import { requireAuth, requireRole } from '../middleware/auth';
import { db } from '../db';
import { heartwormTreatmentPlans, animals, adoptions } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { EmailService } from '../lib/email-service';
import { format } from 'date-fns';

const router = Router();

const appointmentSchema = z.object({
  type: z.enum(['start_doxy', 'first_injection', 'second_third_injection', 'recheck', 'proheart']),
  label: z.string(),
  scheduledDate: z.string(),
  completedDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const createTreatmentPlanSchema = z.object({
  animalId: z.string().uuid(),
  adoptionId: z.string().uuid().optional(),
  adopterName: z.string().min(1),
  adopterEmail: z.string().email(),
  adopterPhone: z.string().optional(),
  locationName: z.string().default('Rice City Animal Hospital'),
  locationAddress: z.string().default('2604 N. Main Street, Pearland, TX 77581'),
  locationPhone: z.string().default('281-993-0300'),
  appointments: z.array(appointmentSchema),
  notes: z.string().optional(),
});

const updateTreatmentPlanSchema = z.object({
  locationName: z.string().optional(),
  locationAddress: z.string().optional(),
  locationPhone: z.string().optional(),
  appointments: z.array(appointmentSchema).optional(),
  notes: z.string().optional(),
});

router.post('/api/heartworm-treatment-plans', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const tenantId = req.tenant!.id;
    const data = createTreatmentPlanSchema.parse(req.body);

    const [plan] = await db.insert(heartwormTreatmentPlans).values({
      tenantId,
      animalId: data.animalId,
      adoptionId: data.adoptionId,
      adopterName: data.adopterName,
      adopterEmail: data.adopterEmail,
      adopterPhone: data.adopterPhone,
      locationName: data.locationName,
      locationAddress: data.locationAddress,
      locationPhone: data.locationPhone,
      appointments: data.appointments,
      notes: data.notes,
    }).returning();

    res.json({ plan });
  } catch (error) {
    next(error);
  }
});

router.get('/api/heartworm-treatment-plans', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const tenantId = req.tenant!.id;
    const { animalId } = req.query;

    let plans;
    if (animalId) {
      plans = await db.select().from(heartwormTreatmentPlans)
        .where(and(
          eq(heartwormTreatmentPlans.tenantId, tenantId),
          eq(heartwormTreatmentPlans.animalId, animalId as string)
        ))
        .orderBy(desc(heartwormTreatmentPlans.createdAt));
    } else {
      plans = await db.select().from(heartwormTreatmentPlans)
        .where(eq(heartwormTreatmentPlans.tenantId, tenantId))
        .orderBy(desc(heartwormTreatmentPlans.createdAt));
    }

    res.json({ plans });
  } catch (error) {
    next(error);
  }
});

router.get('/api/heartworm-treatment-plans/:id', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const tenantId = req.tenant!.id;
    const { id } = req.params;

    const [plan] = await db.select().from(heartwormTreatmentPlans)
      .where(and(
        eq(heartwormTreatmentPlans.tenantId, tenantId),
        eq(heartwormTreatmentPlans.id, id)
      ));

    if (!plan) {
      return res.status(404).json({ error: 'Treatment plan not found' });
    }

    res.json({ plan });
  } catch (error) {
    next(error);
  }
});

router.patch('/api/heartworm-treatment-plans/:id', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const tenantId = req.tenant!.id;
    const { id } = req.params;
    const data = updateTreatmentPlanSchema.parse(req.body);

    const [plan] = await db.update(heartwormTreatmentPlans)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(
        eq(heartwormTreatmentPlans.tenantId, tenantId),
        eq(heartwormTreatmentPlans.id, id)
      ))
      .returning();

    if (!plan) {
      return res.status(404).json({ error: 'Treatment plan not found' });
    }

    res.json({ plan });
  } catch (error) {
    next(error);
  }
});

router.post('/api/heartworm-treatment-plans/:id/send-email', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const tenantId = req.tenant!.id;
    const { id } = req.params;

    const [plan] = await db.select().from(heartwormTreatmentPlans)
      .where(and(
        eq(heartwormTreatmentPlans.tenantId, tenantId),
        eq(heartwormTreatmentPlans.id, id)
      ));

    if (!plan) {
      return res.status(404).json({ error: 'Treatment plan not found' });
    }

    const [animal] = await db.select().from(animals)
      .where(eq(animals.id, plan.animalId));

    const animalName = animal?.name || 'your pet';
    const appointments = plan.appointments as Array<{
      type: string;
      label: string;
      scheduledDate: string;
      completedDate?: string | null;
      notes?: string | null;
    }>;

    const appointmentRows = appointments.map(appt => {
      const date = new Date(appt.scheduledDate);
      const formattedDate = format(date, 'EEEE, MMMM d, yyyy');
      return `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${appt.label}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${formattedDate}</td>
        </tr>
      `;
    }).join('');

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1f2937; margin-bottom: 24px;">Heartworm Treatment Schedule for ${animalName}</h1>
        
        <p style="color: #4b5563; margin-bottom: 16px;">
          Dear ${plan.adopterName},
        </p>
        
        <p style="color: #4b5563; margin-bottom: 24px;">
          Thank you for adopting ${animalName}! Below is the heartworm treatment schedule that must be followed. 
          Please keep this email for your records.
        </p>

        <div style="background: #fef2f2; border: 2px solid #dc2626; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <p style="color: #dc2626; font-weight: bold; margin: 0;">
            IMPORTANT: Completion of ALL heartworm treatment appointments is MANDATORY. 
            Failure to complete treatment will result in the dog being reclaimed by ${req.tenant!.name}.
          </p>
        </div>

        <h2 style="color: #1f2937; margin-bottom: 16px;">Appointment Schedule</h2>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #d1d5db;">Appointment</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #d1d5db;">Date</th>
            </tr>
          </thead>
          <tbody>
            ${appointmentRows}
          </tbody>
        </table>

        <h2 style="color: #1f2937; margin-bottom: 16px;">Treatment Location</h2>
        
        <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0; font-weight: bold;">${plan.locationName}</p>
          <p style="margin: 4px 0 0 0;">${plan.locationAddress}</p>
          <p style="margin: 4px 0 0 0;">Phone: ${plan.locationPhone}</p>
        </div>

        <p style="color: #4b5563; margin-bottom: 16px;">
          If you have any questions or need to reschedule, please contact us immediately.
        </p>

        <p style="color: #4b5563;">
          Thank you,<br/>
          ${req.tenant!.name}
        </p>
      </div>
    `;

    const emailService = await EmailService.forTenant(tenantId);
    if (!emailService) {
      return res.status(400).json({ error: 'Email service not configured for this organization' });
    }

    await emailService.send({
      to: plan.adopterEmail,
      subject: `Heartworm Treatment Schedule for ${animalName}`,
      html: emailHtml,
    });

    await db.update(heartwormTreatmentPlans)
      .set({ contractSentAt: new Date(), updatedAt: new Date() })
      .where(eq(heartwormTreatmentPlans.id, id));

    res.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;

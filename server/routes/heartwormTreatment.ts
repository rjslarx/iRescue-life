import { Router } from 'express';
import { requireTenant } from '../middleware/tenant';
import { requireAuth, requireRole } from '../middleware/auth';
import { db } from '../db';
import { heartwormTreatmentPlans, animals, adoptions } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
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
  adopterNotes: z.string().nullable().optional(),
  receiptObjectPath: z.string().nullable().optional(),
  completedByAdopter: z.boolean().optional(),
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

/**
 * GET /api/heartworm-treatment-plans/summary
 *
 * Staff Command Center roll-up of heartworm treatment plans, grouped by
 * derived status:
 *   - on_track:                 has at least one upcoming/scheduled appointment, none overdue
 *   - overdue:                  at least one non-completed appointment whose scheduledDate is in the past
 *   - restriction_window_active: today falls inside the 30-day strict-rest window
 *       triggered by any completed immiticide injection (first_injection or
 *       second_third_injection). Mirrors AdopterPetDetailPage exercise-restriction logic.
 *   - completed:                every appointment has a completedDate
 *
 * Each row includes:
 *   - plan + animal identifiers (so the UI can open the existing
 *     HeartwormTreatmentModal for that animal)
 *   - the most recent adopter-uploaded receipt path (for thumbnail)
 *   - hasUnverifiedAdopterCompletion flag (adopter marked complete but no
 *     staff verification yet — we treat completedByAdopter=true as the signal
 *     since the staff workflow for "verify" lives in the modal itself)
 *   - the next upcoming appointment (label + date) for triage at a glance
 *
 * Filters (query params):
 *   - status: comma-separated subset of statuses to return
 *   - overdueType: comma-separated appointment types — only return rows where
 *     at least one OVERDUE appointment matches one of these types
 *   - unverifiedOnly: 'true' to only return rows with hasUnverifiedAdopterCompletion
 *
 * Note: drafts (contractSentAt IS NULL) are excluded — those plans haven't
 * been issued to the adopter yet, so there's nothing to triage.
 */
router.get('/api/heartworm-treatment-plans/summary', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const tenantId = req.tenant!.id;

    const rows = await db
      .select({
        id: heartwormTreatmentPlans.id,
        animalId: heartwormTreatmentPlans.animalId,
        adopterName: heartwormTreatmentPlans.adopterName,
        adopterEmail: heartwormTreatmentPlans.adopterEmail,
        adopterPhone: heartwormTreatmentPlans.adopterPhone,
        adoptionId: heartwormTreatmentPlans.adoptionId,
        appointments: heartwormTreatmentPlans.appointments,
        contractSentAt: heartwormTreatmentPlans.contractSentAt,
        createdAt: heartwormTreatmentPlans.createdAt,
        animalName: animals.name,
        animalPhotoUrl: sql<string | null>`(${animals.photoUrls})[1]`,
      })
      .from(heartwormTreatmentPlans)
      .leftJoin(animals, eq(animals.id, heartwormTreatmentPlans.animalId))
      .where(and(
        eq(heartwormTreatmentPlans.tenantId, tenantId),
        sql`${heartwormTreatmentPlans.contractSentAt} IS NOT NULL`,
      ))
      .orderBy(desc(heartwormTreatmentPlans.createdAt));

    type Appt = {
      type: string;
      label: string;
      scheduledDate: string;
      completedDate?: string | null;
      adopterNotes?: string | null;
      receiptObjectPath?: string | null;
      completedByAdopter?: boolean;
    };

    type Status = 'on_track' | 'overdue' | 'restriction_window_active' | 'completed';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

    const enriched = rows.map((row) => {
      const appts: Appt[] = Array.isArray(row.appointments) ? row.appointments as Appt[] : [];

      const allCompleted = appts.length > 0 && appts.every((a) => !!a.completedDate);

      const overdueAppts = appts.filter((a) => {
        if (a.completedDate) return false;
        const sched = parseLocalDate(a.scheduledDate);
        return sched !== null && sched.getTime() < today.getTime();
      });

      // Strict-rest window mirrors AdopterPetDetailPage.getExerciseRestriction:
      // each *completed* immiticide injection (first OR second/third) starts a
      // 30-day rest window. The plan is "restriction-window-active" when today
      // falls inside any one of those windows.
      const HW_INJECTION_REST_DAYS = 30;
      let restrictionActive = false;
      for (const a of appts) {
        if (a.type !== 'first_injection' && a.type !== 'second_third_injection') continue;
        if (!a.completedDate) continue;
        const start = parseLocalDate(a.completedDate);
        if (!start) continue;
        const end = new Date(start);
        end.setDate(end.getDate() + HW_INJECTION_REST_DAYS);
        if (start.getTime() <= today.getTime() && today.getTime() <= end.getTime()) {
          restrictionActive = true;
          break;
        }
      }

      let status: Status;
      if (allCompleted) status = 'completed';
      else if (overdueAppts.length > 0) status = 'overdue';
      else if (restrictionActive) status = 'restriction_window_active';
      else status = 'on_track';

      // Next upcoming appointment (earliest scheduledDate that isn't yet
      // completed). Used for at-a-glance triage in the row.
      const upcoming = appts
        .filter((a) => !a.completedDate)
        .map((a) => ({ a, d: parseLocalDate(a.scheduledDate) }))
        .filter((x) => x.d !== null)
        .sort((x, y) => x.d!.getTime() - y.d!.getTime());
      const nextAppointment = upcoming[0]
        ? { type: upcoming[0].a.type, label: upcoming[0].a.label, scheduledDate: upcoming[0].a.scheduledDate }
        : null;

      // Most recent adopter-uploaded receipt across all appointments.
      const withReceipt = appts
        .filter((a) => !!a.receiptObjectPath && !!a.completedDate)
        .sort((x, y) => (y.completedDate || '').localeCompare(x.completedDate || ''));
      const latestReceipt = withReceipt[0]
        ? {
            objectPath: withReceipt[0].receiptObjectPath!,
            appointmentLabel: withReceipt[0].label,
            completedDate: withReceipt[0].completedDate!,
          }
        : null;

      const hasUnverifiedAdopterCompletion = appts.some(
        (a) => a.completedByAdopter === true,
      );

      return {
        id: row.id,
        animalId: row.animalId,
        animalName: row.animalName || 'Unknown',
        animalPhotoUrl: row.animalPhotoUrl,
        adopterName: row.adopterName,
        adopterEmail: row.adopterEmail,
        adopterPhone: row.adopterPhone,
        adoptionId: row.adoptionId,
        contractSentAt: row.contractSentAt,
        status,
        nextAppointment,
        overdueAppointmentTypes: overdueAppts.map((a) => a.type),
        overdueAppointmentLabels: overdueAppts.map((a) => a.label),
        latestReceipt,
        hasUnverifiedAdopterCompletion,
        appointmentsTotal: appts.length,
        appointmentsCompleted: appts.filter((a) => !!a.completedDate).length,
      };
    });

    // ---- Apply optional filters ----
    const parseList = (v: unknown): string[] | null => {
      if (typeof v !== 'string' || !v.trim()) return null;
      return v.split(',').map((s) => s.trim()).filter(Boolean);
    };
    const statusFilter = parseList(req.query.status);
    const overdueTypeFilter = parseList(req.query.overdueType);
    const unverifiedOnly = req.query.unverifiedOnly === 'true';

    let filtered = enriched;
    if (statusFilter) {
      const allowed = new Set(statusFilter);
      filtered = filtered.filter((r) => allowed.has(r.status));
    }
    if (overdueTypeFilter) {
      const allowed = new Set(overdueTypeFilter);
      filtered = filtered.filter((r) => r.overdueAppointmentTypes.some((t) => allowed.has(t)));
    }
    if (unverifiedOnly) {
      filtered = filtered.filter((r) => r.hasUnverifiedAdopterCompletion);
    }

    // ---- Group by status for the UI ----
    const groups: Record<Status, typeof filtered> = {
      overdue: [],
      restriction_window_active: [],
      on_track: [],
      completed: [],
    };
    for (const r of filtered) {
      groups[r.status].push(r);
    }

    const counts = {
      overdue: groups.overdue.length,
      restriction_window_active: groups.restriction_window_active.length,
      on_track: groups.on_track.length,
      completed: groups.completed.length,
      total: filtered.length,
      // Pre-filter totals so the UI can show "10 plans, 3 currently shown by filter"
      totalUnfiltered: enriched.length,
    };

    res.json({ plans: filtered, groups, counts });
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

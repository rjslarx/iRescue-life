import { Router } from "express";
import { db } from "../db";
import { 
  animalAdopters, 
  animals, 
  adopterWeightLogs, 
  adopterMedicationReminders,
  medicationConfirmationLogs,
  happyTailUpdates,
  magicLinks,
  vaccineRecords,
  medicalExams
} from "@shared/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { z } from "zod";

const router = Router();

// Middleware to ensure user has adopter role and is accessing their own data
const requireAdopterRole = (req: any, res: any, next: any) => {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  if (!req.user.roles?.includes("adopter")) {
    return res.status(403).json({ message: "Adopter role required" });
  }
  next();
};

// GET /api/adopter/my-pets - Get all animals adopted by current user
router.get("/my-pets", requireAuth, requireAdopterRole, async (req, res) => {
  try {
    const adoptedAnimals = await db
      .select({
        adoption: animalAdopters,
        animal: animals,
      })
      .from(animalAdopters)
      .innerJoin(animals, eq(animalAdopters.animalId, animals.id))
      .where(
        and(
          eq(animalAdopters.userId, req.user!.id),
          eq(animalAdopters.tenantId, req.tenant!.id)
        )
      )
      .orderBy(desc(animalAdopters.adoptedAt));

    res.json(adoptedAnimals.map(({ animal, adoption }) => ({
      ...animal,
      adoptedAt: adoption.adoptedAt,
    })));
  } catch (error) {
    console.error("Error fetching adopted animals:", error);
    res.status(500).json({ message: "Failed to fetch adopted animals" });
  }
});

// GET /api/adopter/pets/:animalId - Get single adopted animal details
router.get("/pets/:animalId", requireAuth, requireAdopterRole, async (req, res) => {
  try {
    const { animalId } = req.params;
    
    // Verify user has adopted this animal
    const adoption = await db
      .select()
      .from(animalAdopters)
      .where(
        and(
          eq(animalAdopters.animalId, animalId),
          eq(animalAdopters.userId, req.user!.id),
          eq(animalAdopters.tenantId, req.tenant!.id)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (!adoption) {
      return res.status(403).json({ message: "You don't have access to this animal" });
    }

    const animal = await db
      .select()
      .from(animals)
      .where(
        and(
          eq(animals.tenantId, req.tenant!.id),
          eq(animals.id, animalId)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (!animal) {
      return res.status(404).json({ message: "Animal not found" });
    }

    res.json({ ...animal, adoptedAt: adoption.adoptedAt });
  } catch (error) {
    console.error("Error fetching animal:", error);
    res.status(500).json({ message: "Failed to fetch animal" });
  }
});

// GET /api/adopter/pets/:animalId/vaccinations - Get vaccination records
router.get("/pets/:animalId/vaccinations", requireAuth, requireAdopterRole, async (req, res) => {
  try {
    const { animalId } = req.params;
    const tenantId = req.tenantId!;
    
    // Verify user has adopted this animal (with tenant scoping for isolation)
    const adoption = await db
      .select()
      .from(animalAdopters)
      .where(
        and(
          eq(animalAdopters.tenantId, tenantId),
          eq(animalAdopters.animalId, animalId),
          eq(animalAdopters.userId, req.user!.id)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (!adoption) {
      return res.status(403).json({ message: "You don't have access to this animal" });
    }

    const vaccinationRecords = await db
      .select()
      .from(vaccineRecords)
      .where(
        and(
          eq(vaccineRecords.tenantId, tenantId),
          eq(vaccineRecords.animalId, animalId)
        )
      )
      .orderBy(desc(vaccineRecords.dateAdministered));

    res.json(vaccinationRecords);
  } catch (error) {
    console.error("Error fetching vaccinations:", error);
    res.status(500).json({ message: "Failed to fetch vaccinations" });
  }
});

// GET /api/adopter/pets/:animalId/medical-exams - Get medical exams
router.get("/pets/:animalId/medical-exams", requireAuth, requireAdopterRole, async (req, res) => {
  try {
    const { animalId } = req.params;
    const tenantId = req.tenantId!;
    
    // Verify user has adopted this animal (with tenant scoping for isolation)
    const adoption = await db
      .select()
      .from(animalAdopters)
      .where(
        and(
          eq(animalAdopters.tenantId, tenantId),
          eq(animalAdopters.animalId, animalId),
          eq(animalAdopters.userId, req.user!.id)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (!adoption) {
      return res.status(403).json({ message: "You don't have access to this animal" });
    }

    const exams = await db
      .select()
      .from(medicalExams)
      .where(
        and(
          eq(medicalExams.tenantId, tenantId),
          eq(medicalExams.animalId, animalId)
        )
      )
      .orderBy(desc(medicalExams.examDate));

    res.json(exams);
  } catch (error) {
    console.error("Error fetching medical exams:", error);
    res.status(500).json({ message: "Failed to fetch medical exams" });
  }
});

// GET /api/adopter/pets/:animalId/weight-logs - Get weight tracking history
router.get("/pets/:animalId/weight-logs", requireAuth, requireAdopterRole, async (req, res) => {
  try {
    const { animalId } = req.params;
    const tenantId = req.tenantId!;
    
    // Verify user has adopted this animal (with tenant scoping for isolation)
    const adoption = await db
      .select()
      .from(animalAdopters)
      .where(
        and(
          eq(animalAdopters.tenantId, tenantId),
          eq(animalAdopters.animalId, animalId),
          eq(animalAdopters.userId, req.user!.id)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (!adoption) {
      return res.status(403).json({ message: "You don't have access to this animal" });
    }

    const logs = await db
      .select()
      .from(adopterWeightLogs)
      .where(
        and(
          eq(adopterWeightLogs.tenantId, tenantId),
          eq(adopterWeightLogs.animalId, animalId)
        )
      )
      .orderBy(desc(adopterWeightLogs.loggedAt));

    res.json(logs);
  } catch (error) {
    console.error("Error fetching weight logs:", error);
    res.status(500).json({ message: "Failed to fetch weight logs" });
  }
});

// POST /api/adopter/pets/:animalId/weight-logs - Add weight log
router.post("/pets/:animalId/weight-logs", requireAuth, requireAdopterRole, async (req, res) => {
  try {
    const { animalId } = req.params;
    const tenantId = req.tenantId!;
    
    // Verify user has adopted this animal (with tenant scoping for isolation)
    const adoption = await db
      .select()
      .from(animalAdopters)
      .where(
        and(
          eq(animalAdopters.tenantId, tenantId),
          eq(animalAdopters.animalId, animalId),
          eq(animalAdopters.userId, req.user!.id)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (!adoption) {
      return res.status(403).json({ message: "You don't have access to this animal" });
    }

    const schema = z.object({
      weight: z.string(),
      weightUnit: z.enum(["lbs", "kg"]).default("lbs"),
      notes: z.string().optional(),
    });

    const data = schema.parse(req.body);
    
    // Parse numeric value for graphing
    const numericMatch = data.weight.match(/[\d.]+/);
    const weightValue = numericMatch ? Math.round(parseFloat(numericMatch[0]) * 10) : null;

    const [log] = await db.insert(adopterWeightLogs).values({
      tenantId: req.tenant!.id,
      animalId,
      userId: req.user!.id,
      weight: data.weight,
      weightUnit: data.weightUnit,
      weightValue,
      notes: data.notes,
    }).returning();

    res.status(201).json(log);
  } catch (error) {
    console.error("Error adding weight log:", error);
    res.status(500).json({ message: "Failed to add weight log" });
  }
});

// GET /api/adopter/pets/:animalId/medication-reminders - Get medication reminders
router.get("/pets/:animalId/medication-reminders", requireAuth, requireAdopterRole, async (req, res) => {
  try {
    const { animalId } = req.params;
    const tenantId = req.tenantId!;
    
    // Verify user has adopted this animal (with tenant scoping for isolation)
    const adoption = await db
      .select()
      .from(animalAdopters)
      .where(
        and(
          eq(animalAdopters.tenantId, tenantId),
          eq(animalAdopters.animalId, animalId),
          eq(animalAdopters.userId, req.user!.id)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (!adoption) {
      return res.status(403).json({ message: "You don't have access to this animal" });
    }

    const reminders = await db
      .select()
      .from(adopterMedicationReminders)
      .where(
        and(
          eq(adopterMedicationReminders.tenantId, tenantId),
          eq(adopterMedicationReminders.animalId, animalId),
          eq(adopterMedicationReminders.isActive, true)
        )
      )
      .orderBy(asc(adopterMedicationReminders.nextDueDate));

    res.json(reminders);
  } catch (error) {
    console.error("Error fetching medication reminders:", error);
    res.status(500).json({ message: "Failed to fetch medication reminders" });
  }
});

// POST /api/adopter/pets/:animalId/medication-reminders - Add medication reminder
router.post("/pets/:animalId/medication-reminders", requireAuth, requireAdopterRole, async (req, res) => {
  try {
    const { animalId } = req.params;
    const tenantId = req.tenantId!;
    
    // Verify user has adopted this animal (with tenant scoping for isolation)
    const adoption = await db
      .select()
      .from(animalAdopters)
      .where(
        and(
          eq(animalAdopters.tenantId, tenantId),
          eq(animalAdopters.animalId, animalId),
          eq(animalAdopters.userId, req.user!.id)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (!adoption) {
      return res.status(403).json({ message: "You don't have access to this animal" });
    }

    const schema = z.object({
      medicationName: z.string(),
      frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
      nextDueDate: z.string().transform(s => new Date(s)),
      notes: z.string().optional(),
    });

    const data = schema.parse(req.body);

    const [reminder] = await db.insert(adopterMedicationReminders).values({
      tenantId: req.tenant!.id,
      animalId,
      userId: req.user!.id,
      medicationName: data.medicationName,
      frequency: data.frequency,
      nextDueDate: data.nextDueDate,
      notes: data.notes,
    }).returning();

    res.status(201).json(reminder);
  } catch (error) {
    console.error("Error adding medication reminder:", error);
    res.status(500).json({ message: "Failed to add medication reminder" });
  }
});

// POST /api/adopter/medication-reminders/:reminderId/confirm - Confirm medication given
router.post("/medication-reminders/:reminderId/confirm", requireAuth, requireAdopterRole, async (req, res) => {
  try {
    const { reminderId } = req.params;
    const tenantId = req.tenantId!;
    
    const reminder = await db
      .select()
      .from(adopterMedicationReminders)
      .where(
        and(
          eq(adopterMedicationReminders.tenantId, tenantId),
          eq(adopterMedicationReminders.id, reminderId)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (!reminder) {
      return res.status(404).json({ message: "Reminder not found" });
    }

    // Verify user owns this reminder
    if (reminder.userId !== req.user!.id) {
      return res.status(403).json({ message: "You don't have access to this reminder" });
    }

    const confirmedVia = req.body.confirmedVia || "app";

    // Log the confirmation
    await db.insert(medicationConfirmationLogs).values({
      tenantId: req.tenant!.id,
      reminderId,
      animalId: reminder.animalId,
      userId: req.user!.id,
      confirmedVia,
      dueDate: reminder.nextDueDate,
    });

    // Calculate next due date based on frequency
    const nextDueDate = new Date(reminder.nextDueDate);
    switch (reminder.frequency) {
      case "daily":
        nextDueDate.setDate(nextDueDate.getDate() + 1);
        break;
      case "weekly":
        nextDueDate.setDate(nextDueDate.getDate() + 7);
        break;
      case "monthly":
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        break;
      case "yearly":
        nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);
        break;
    }

    // Update reminder with confirmation and next due date
    const [updated] = await db
      .update(adopterMedicationReminders)
      .set({
        lastConfirmedDate: new Date(),
        nextDueDate,
        updatedAt: new Date(),
      })
      .where(eq(adopterMedicationReminders.id, reminderId))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Error confirming medication:", error);
    res.status(500).json({ message: "Failed to confirm medication" });
  }
});

// GET /api/adopter/pets/:animalId/happy-tails - Get happy tail updates
router.get("/pets/:animalId/happy-tails", requireAuth, requireAdopterRole, async (req, res) => {
  try {
    const { animalId } = req.params;
    const tenantId = req.tenantId!;
    
    // Verify user has adopted this animal (with tenant scoping for isolation)
    const adoption = await db
      .select()
      .from(animalAdopters)
      .where(
        and(
          eq(animalAdopters.tenantId, tenantId),
          eq(animalAdopters.animalId, animalId),
          eq(animalAdopters.userId, req.user!.id)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (!adoption) {
      return res.status(403).json({ message: "You don't have access to this animal" });
    }

    const updates = await db
      .select()
      .from(happyTailUpdates)
      .where(
        and(
          eq(happyTailUpdates.tenantId, tenantId),
          eq(happyTailUpdates.animalId, animalId)
        )
      )
      .orderBy(desc(happyTailUpdates.createdAt));

    res.json(updates);
  } catch (error) {
    console.error("Error fetching happy tail updates:", error);
    res.status(500).json({ message: "Failed to fetch updates" });
  }
});

// POST /api/adopter/pets/:animalId/happy-tails - Submit happy tail update
router.post("/pets/:animalId/happy-tails", requireAuth, requireAdopterRole, async (req, res) => {
  try {
    const { animalId } = req.params;
    const tenantId = req.tenantId!;
    
    // Verify user has adopted this animal (with tenant scoping for isolation)
    const adoption = await db
      .select()
      .from(animalAdopters)
      .where(
        and(
          eq(animalAdopters.tenantId, tenantId),
          eq(animalAdopters.animalId, animalId),
          eq(animalAdopters.userId, req.user!.id)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (!adoption) {
      return res.status(403).json({ message: "You don't have access to this animal" });
    }

    const schema = z.object({
      photoUrls: z.array(z.string()).optional(),
      message: z.string().optional(),
    });

    const data = schema.parse(req.body);

    const [update] = await db.insert(happyTailUpdates).values({
      tenantId: req.tenant!.id,
      animalId,
      userId: req.user!.id,
      photoUrls: data.photoUrls,
      message: data.message,
      isApproved: false,
      isShared: false,
    }).returning();

    res.status(201).json(update);
  } catch (error) {
    console.error("Error submitting happy tail update:", error);
    res.status(500).json({ message: "Failed to submit update" });
  }
});

// Magic link for medication confirmation (no auth required)
router.get("/confirm-medication/:token", async (req, res) => {
  try {
    const { token } = req.params;
    
    const link = await db
      .select()
      .from(magicLinks)
      .where(
        and(
          eq(magicLinks.token, token),
          eq(magicLinks.action, "confirm_medication")
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (!link) {
      return res.status(404).json({ message: "Invalid or expired link" });
    }

    if (link.usedAt) {
      return res.status(400).json({ message: "This link has already been used" });
    }

    if (new Date() > link.expiresAt) {
      return res.status(400).json({ message: "This link has expired" });
    }

    // Get the reminder
    const reminder = await db
      .select()
      .from(adopterMedicationReminders)
      .where(eq(adopterMedicationReminders.id, link.targetId!))
      .limit(1)
      .then(rows => rows[0]);

    if (!reminder) {
      return res.status(404).json({ message: "Reminder not found" });
    }

    // Get animal info for display
    const animal = await db
      .select()
      .from(animals)
      .where(eq(animals.id, reminder.animalId))
      .limit(1)
      .then(rows => rows[0]);

    res.json({
      reminder,
      animal: animal ? { name: animal.name, photoUrls: animal.photoUrls } : null,
      token,
    });
  } catch (error) {
    console.error("Error fetching magic link:", error);
    res.status(500).json({ message: "Failed to process link" });
  }
});

// POST /api/adopter/confirm-medication/:token - Confirm via magic link
router.post("/confirm-medication/:token", async (req, res) => {
  try {
    const { token } = req.params;
    
    const link = await db
      .select()
      .from(magicLinks)
      .where(
        and(
          eq(magicLinks.token, token),
          eq(magicLinks.action, "confirm_medication")
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (!link) {
      return res.status(404).json({ message: "Invalid or expired link" });
    }

    if (link.usedAt) {
      return res.status(400).json({ message: "This link has already been used" });
    }

    if (new Date() > link.expiresAt) {
      return res.status(400).json({ message: "This link has expired" });
    }

    const reminder = await db
      .select()
      .from(adopterMedicationReminders)
      .where(eq(adopterMedicationReminders.id, link.targetId!))
      .limit(1)
      .then(rows => rows[0]);

    if (!reminder) {
      return res.status(404).json({ message: "Reminder not found" });
    }

    // Log the confirmation
    await db.insert(medicationConfirmationLogs).values({
      tenantId: link.tenantId,
      reminderId: link.targetId!,
      animalId: reminder.animalId,
      userId: link.userId,
      confirmedVia: "email",
      dueDate: reminder.nextDueDate,
    });

    // Calculate next due date
    const nextDueDate = new Date(reminder.nextDueDate);
    switch (reminder.frequency) {
      case "daily":
        nextDueDate.setDate(nextDueDate.getDate() + 1);
        break;
      case "weekly":
        nextDueDate.setDate(nextDueDate.getDate() + 7);
        break;
      case "monthly":
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        break;
      case "yearly":
        nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);
        break;
    }

    // Update reminder
    await db
      .update(adopterMedicationReminders)
      .set({
        lastConfirmedDate: new Date(),
        nextDueDate,
        updatedAt: new Date(),
      })
      .where(eq(adopterMedicationReminders.id, link.targetId!));

    // Mark link as used
    await db
      .update(magicLinks)
      .set({ usedAt: new Date() })
      .where(eq(magicLinks.id, link.id));

    res.json({ success: true, message: "Medication confirmed!" });
  } catch (error) {
    console.error("Error confirming medication via magic link:", error);
    res.status(500).json({ message: "Failed to confirm medication" });
  }
});

// POST /api/adopter/magic-login - Authenticate via magic link token
router.post("/magic-login", async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }

    const link = await db
      .select()
      .from(magicLinks)
      .where(eq(magicLinks.token, token))
      .limit(1)
      .then(rows => rows[0]);

    if (!link) {
      return res.status(404).json({ message: "Invalid or expired link" });
    }

    if (link.usedAt) {
      return res.status(400).json({ message: "This link has already been used" });
    }

    if (link.expiresAt && new Date() > new Date(link.expiresAt)) {
      return res.status(400).json({ message: "This link has expired" });
    }

    if (link.action !== 'login') {
      return res.status(400).json({ message: "Invalid link type" });
    }

    const { users } = await import("@shared/schema");
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, link.userId))
      .limit(1)
      .then(rows => rows[0]);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Mark link as used
    await db
      .update(magicLinks)
      .set({ usedAt: new Date() })
      .where(eq(magicLinks.id, link.id));

    // Establish session
    req.session.userId = user.id;
    req.session.tenantId = link.tenantId;

    // Return user info for frontend
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: user.roles,
      },
      redirectTo: '/my-pets',
    });
  } catch (error) {
    console.error("Error authenticating via magic link:", error);
    res.status(500).json({ message: "Failed to authenticate" });
  }
});

// POST /api/adopter/request-magic-link - Request a new magic link for portal access
router.post("/request-magic-link", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const { users, tenants } = await import("@shared/schema");
    const crypto = await import("crypto");

    // Find user with adopter role
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1)
      .then(rows => rows[0]);

    if (!user) {
      // Don't reveal if email exists or not
      return res.json({ success: true, message: "If an account exists with this email, a login link will be sent." });
    }

    const userRoles = user.roles as string[] || [];
    if (!userRoles.includes('adopter')) {
      return res.json({ success: true, message: "If an account exists with this email, a login link will be sent." });
    }

    // Get tenant for email template
    const tenant = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, user.tenantId))
      .limit(1)
      .then(rows => rows[0]);

    // Generate magic link
    const magicLinkToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.insert(magicLinks).values({
      tenantId: user.tenantId,
      userId: user.id,
      token: magicLinkToken,
      expiresAt,
      purpose: 'portal_access',
    });

    // Send email
    const baseUrl = process.env.REPLIT_SLUG 
      ? `https://${process.env.REPLIT_SLUG}.${process.env.REPLIT_DEV_DOMAIN}`
      : 'http://localhost:5000';
    
    const tenantPath = tenant?.subdomain ? `/${tenant.subdomain}` : '';
    const loginUrl = `${baseUrl}${tenantPath}/my-pets/login?token=${magicLinkToken}`;

    const { EmailService } = await import('../lib/email-service');
    const emailService = new EmailService();

    await emailService.sendEmail(
      user.tenantId,
      user.email,
      'Your Pet Portal Login Link',
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Hi ${user.firstName || 'there'},</h2>
          <p>You requested access to your Pet Portal. Click the button below to log in instantly:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}" style="display: inline-block; background-color: #8b5cf6; color: #ffffff; padding: 15px 40px; text-decoration: none; border-radius: 6px; font-weight: 600;">
              Access My Pet Portal
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">This link expires in 24 hours.</p>
          <p style="color: #999; font-size: 12px;">If you didn't request this link, you can safely ignore this email.</p>
        </div>
      `,
      { category: 'adopter_portal', tags: ['magic-link', 'login'] }
    );

    res.json({ success: true, message: "If an account exists with this email, a login link will be sent." });
  } catch (error) {
    console.error("Error requesting magic link:", error);
    res.status(500).json({ message: "Failed to send login link" });
  }
});

// ============================================
// STAFF COMPLIANCE ENDPOINTS
// ============================================

// GET /api/staff/compliance/stats - Get compliance statistics
router.get("/staff/compliance/stats", requireAuth, async (req, res) => {
  try {
    const { sql } = await import("drizzle-orm");
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const totalReminders = await db
      .select({ count: sql<number>`count(*)` })
      .from(adopterMedicationReminders)
      .where(eq(adopterMedicationReminders.tenantId, req.tenant!.id))
      .then(rows => Number(rows[0]?.count || 0));

    const activeReminders = await db
      .select({ count: sql<number>`count(*)` })
      .from(adopterMedicationReminders)
      .where(and(
        eq(adopterMedicationReminders.tenantId, req.tenant!.id),
        eq(adopterMedicationReminders.isActive, true)
      ))
      .then(rows => Number(rows[0]?.count || 0));

    const confirmedToday = await db
      .select({ count: sql<number>`count(*)` })
      .from(medicationConfirmationLogs)
      .where(and(
        eq(medicationConfirmationLogs.tenantId, req.tenant!.id),
        sql`${medicationConfirmationLogs.confirmedAt} >= ${todayStart}`
      ))
      .then(rows => Number(rows[0]?.count || 0));

    const overdueReminders = await db
      .select({ count: sql<number>`count(*)` })
      .from(adopterMedicationReminders)
      .where(and(
        eq(adopterMedicationReminders.tenantId, req.tenant!.id),
        eq(adopterMedicationReminders.isActive, true),
        sql`${adopterMedicationReminders.nextDueDate} < ${todayStart}`
      ))
      .then(rows => Number(rows[0]?.count || 0));

    const complianceRate = activeReminders > 0 
      ? Math.round(((activeReminders - overdueReminders) / activeReminders) * 100)
      : 100;

    res.json({
      totalReminders,
      activeReminders,
      confirmedToday,
      overdueReminders,
      complianceRate,
    });
  } catch (error) {
    console.error("Error fetching compliance stats:", error);
    res.status(500).json({ message: "Failed to fetch compliance stats" });
  }
});

// GET /api/staff/compliance/reminders - Get all reminders with details
router.get("/staff/compliance/reminders", requireAuth, async (req, res) => {
  try {
    const { users } = await import("@shared/schema");
    const { sql } = await import("drizzle-orm");
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const remindersWithDetails = await db
      .select({
        reminder: adopterMedicationReminders,
        animal: animals,
        adopter: animalAdopters,
      })
      .from(adopterMedicationReminders)
      .innerJoin(animals, eq(adopterMedicationReminders.animalId, animals.id))
      .innerJoin(animalAdopters, eq(animalAdopters.animalId, animals.id))
      .where(and(
        eq(adopterMedicationReminders.tenantId, req.tenant!.id),
        eq(adopterMedicationReminders.isActive, true)
      ))
      .orderBy(asc(adopterMedicationReminders.nextDueDate));

    const result = [];
    
    for (const { reminder, animal, adopter } of remindersWithDetails) {
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, adopter.userId))
        .limit(1)
        .then(rows => rows[0]);

      if (!user) continue;

      const nextDueDate = new Date(reminder.nextDueDate);
      const isOverdue = nextDueDate < today;
      
      let daysSinceConfirmation: number | undefined;
      if (isOverdue) {
        const timeDiff = today.getTime() - nextDueDate.getTime();
        daysSinceConfirmation = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      }

      result.push({
        id: reminder.id,
        animalId: animal.id,
        animalName: animal.name,
        adopterName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        adopterEmail: user.email,
        medicationName: reminder.medicationName,
        dosage: reminder.dosage,
        frequency: reminder.frequency,
        nextDueDate: reminder.nextDueDate,
        lastConfirmedDate: reminder.lastConfirmedDate,
        lastNotifiedDate: reminder.lastNotifiedDate,
        isOverdue,
        daysSinceConfirmation,
      });
    }

    res.json(result);
  } catch (error) {
    console.error("Error fetching compliance reminders:", error);
    res.status(500).json({ message: "Failed to fetch compliance reminders" });
  }
});

// GET /api/staff/compliance/confirmations - Get recent confirmation logs
router.get("/staff/compliance/confirmations", requireAuth, async (req, res) => {
  try {
    const { users } = await import("@shared/schema");
    
    const logs = await db
      .select({
        log: medicationConfirmationLogs,
        reminder: adopterMedicationReminders,
        animal: animals,
      })
      .from(medicationConfirmationLogs)
      .innerJoin(adopterMedicationReminders, eq(medicationConfirmationLogs.reminderId, adopterMedicationReminders.id))
      .innerJoin(animals, eq(adopterMedicationReminders.animalId, animals.id))
      .where(eq(medicationConfirmationLogs.tenantId, req.tenant!.id))
      .orderBy(desc(medicationConfirmationLogs.confirmedAt))
      .limit(50);

    const result = [];
    
    for (const { log, reminder, animal } of logs) {
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, log.confirmedBy))
        .limit(1)
        .then(rows => rows[0]);

      result.push({
        id: log.id,
        animalName: animal.name,
        medicationName: reminder.medicationName,
        confirmedAt: log.confirmedAt,
        confirmationMethod: log.confirmationMethod || 'portal',
        adopterName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'Unknown',
      });
    }

    res.json(result);
  } catch (error) {
    console.error("Error fetching confirmation logs:", error);
    res.status(500).json({ message: "Failed to fetch confirmation logs" });
  }
});

export default router;

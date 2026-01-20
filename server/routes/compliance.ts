import { Router } from 'express';
import { db } from '../db';
import { 
  tenants, 
  animals, 
  sacMonthlyReports,
  complianceDocuments,
  impactStats,
  reviewRequests,
  payments,
  donors,
  supplyDonations,
  SAC_INTAKE_CATEGORIES,
  SAC_OUTCOME_CATEGORIES,
  insertSacMonthlyReportSchema,
  insertComplianceDocumentSchema,
} from '@shared/schema';
import { eq, and, gte, lt, sql, desc, isNotNull } from 'drizzle-orm';
import { requireTenant } from '../middleware/tenant';
import { requireAuth } from '../middleware/auth';
import { z } from 'zod';

const router = Router();

// SAC Settings validation schema
const sacSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  autoCalculate: z.boolean().optional(),
  intakeMapping: z.record(z.enum(SAC_INTAKE_CATEGORIES)).optional(),
  outcomeMapping: z.record(z.enum(SAC_OUTCOME_CATEGORIES)).optional(),
  juvenileAgeDays: z.number().min(0).max(365).optional(),
});

/**
 * GET /api/compliance/sac/settings
 * Get SAC settings including status mappings
 */
router.get('/sac/settings', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user!.activeRole || '')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tenant = await db
      .select({ sacSettings: tenants.sacSettings })
      .from(tenants)
      .where(eq(tenants.id, req.tenant!.id))
      .limit(1);

    if (!tenant.length) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Default SAC settings with auto-mapping for common statuses
    const defaultSettings = {
      enabled: false,
      autoCalculate: true,
      juvenileAgeDays: 180, // 6 months = juvenile
      intakeMapping: {
        stray: 'stray_at_large',
        owner_surrender: 'relinquished_by_owner',
        transfer: 'transferred_in',
        born_in_care: 'other_intake',
        other: 'other_intake',
      },
      outcomeMapping: {
        adopted: 'adoption',
        return_to_owner: 'returned_to_owner',
        transfer_out: 'transferred_out',
        tnr_return: 'returned_to_field',
        foster_to_adopt: 'adoption',
        died: 'died_in_care',
        lost: 'lost_in_care',
        euthanasia: 'shelter_euthanasia',
        ore: 'owner_intended_euthanasia',
      },
    };

    const settings = { ...defaultSettings, ...(tenant[0].sacSettings as object || {}) };
    
    res.json({ 
      settings,
      intakeCategories: SAC_INTAKE_CATEGORIES,
      outcomeCategories: SAC_OUTCOME_CATEGORIES,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/compliance/sac/settings
 * Update SAC settings including status mappings
 */
router.put('/sac/settings', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (req.user!.activeRole !== 'admin') {
      return res.status(403).json({ error: 'Admin role required' });
    }

    const result = sacSettingsSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid settings', details: result.error.issues });
    }

    // Get current settings and merge
    const tenant = await db
      .select({ sacSettings: tenants.sacSettings })
      .from(tenants)
      .where(eq(tenants.id, req.tenant!.id))
      .limit(1);

    const currentSettings = (tenant[0]?.sacSettings as object) || {};
    const newSettings = { ...currentSettings, ...result.data };

    await db
      .update(tenants)
      .set({ sacSettings: newSettings })
      .where(eq(tenants.id, req.tenant!.id));

    res.json({ success: true, settings: newSettings });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/compliance/sac/reports
 * Get list of generated SAC reports
 */
router.get('/sac/reports', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user!.activeRole || '')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const reports = await db
      .select()
      .from(sacMonthlyReports)
      .where(eq(sacMonthlyReports.tenantId, req.tenant!.id))
      .orderBy(desc(sacMonthlyReports.reportYear), desc(sacMonthlyReports.reportMonth))
      .limit(24); // Last 2 years

    res.json({ reports });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/compliance/sac/generate
 * Generate SAC report for a specific month
 */
router.post('/sac/generate', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (req.user!.activeRole !== 'admin') {
      return res.status(403).json({ error: 'Admin role required' });
    }

    const { month, year } = req.body;
    if (!month || !year || month < 1 || month > 12 || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Invalid month or year' });
    }

    // Get SAC settings for mappings
    const tenant = await db
      .select({ sacSettings: tenants.sacSettings })
      .from(tenants)
      .where(eq(tenants.id, req.tenant!.id))
      .limit(1);

    const sacSettings = (tenant[0]?.sacSettings as any) || {};
    const juvenileAgeDays = sacSettings.juvenileAgeDays || 180;
    const intakeMapping = sacSettings.intakeMapping || {};
    const outcomeMapping = sacSettings.outcomeMapping || {};

    // Date range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1); // First day of next month
    const prevMonthStart = new Date(year, month - 2, 1);

    // Get animals for this tenant with relevant dates
    const allAnimals = await db
      .select({
        id: animals.id,
        species: animals.species,
        petfinderType: animals.petfinderType,
        dateOfBirth: animals.dateOfBirth,
        intakeDate: animals.intakeDate,
        intakeSource: animals.intakeSource,
        status: animals.status,
        adoptionDate: animals.adoptionDate,
        deceasedDate: animals.deceasedDate,
        causeOfDeath: animals.causeOfDeath,
      })
      .from(animals)
      .where(eq(animals.tenantId, req.tenant!.id));

    // Helper to determine if juvenile (under juvenileAgeDays days old at intake)
    const isJuvenile = (dob: Date | null, intakeDate: Date) => {
      if (!dob) return false; // If no DOB, assume adult
      const ageAtIntake = Math.floor((intakeDate.getTime() - dob.getTime()) / (1000 * 60 * 60 * 24));
      return ageAtIntake < juvenileAgeDays;
    };

    // Helper to get species category (dog, cat, or other)
    const getSpeciesCategory = (species: string, pfType: string | null): 'dogs' | 'cats' | 'other' => {
      const s = (species || pfType || '').toLowerCase();
      if (s.includes('dog') || s === 'canine' || pfType === 'Dog') return 'dogs';
      if (s.includes('cat') || s === 'feline' || pfType === 'Cat') return 'cats';
      return 'other';
    };

    // Initialize stats structure
    const stats = {
      dogs: {
        juvenile: { beginning: 0, intakes: 0, outcomes: 0, ending: 0 },
        adult: { beginning: 0, intakes: 0, outcomes: 0, ending: 0 },
      },
      cats: {
        juvenile: { beginning: 0, intakes: 0, outcomes: 0, ending: 0 },
        adult: { beginning: 0, intakes: 0, outcomes: 0, ending: 0 },
      },
      other: { beginning: 0, intakes: 0, outcomes: 0, ending: 0 },
      intakeBreakdown: {} as Record<string, number>,
      outcomeBreakdown: {} as Record<string, number>,
    };

    // Validation errors
    const validationErrors: Array<{ field: string; message: string; animalIds?: string[] }> = [];
    const unmappedIntakes: string[] = [];
    const unmappedOutcomes: string[] = [];

    // Process each animal
    for (const animal of allAnimals) {
      const species = getSpeciesCategory(animal.species, animal.petfinderType);
      const intakeDate = animal.intakeDate ? new Date(animal.intakeDate) : null;
      const dob = animal.dateOfBirth ? new Date(animal.dateOfBirth) : null;
      
      if (!intakeDate) continue;

      const juvenile = isJuvenile(dob, intakeDate);
      const ageGroup = juvenile ? 'juvenile' : 'adult';

      // Beginning count: Was in care at start of month (intake before month start, outcome after or none)
      const wasInCareAtStart = intakeDate < startDate;
      const outcomeDate = animal.adoptionDate || animal.deceasedDate;
      const stillInCareAtStart = !outcomeDate || new Date(outcomeDate) >= startDate;

      if (wasInCareAtStart && stillInCareAtStart) {
        if (species === 'other') {
          stats.other.beginning++;
        } else {
          stats[species][ageGroup].beginning++;
        }
      }

      // Intakes: Entered this month
      if (intakeDate >= startDate && intakeDate < endDate) {
        if (species === 'other') {
          stats.other.intakes++;
        } else {
          stats[species][ageGroup].intakes++;
        }

        // Map intake source to SAC category
        const intakeSource = animal.intakeSource || 'other';
        const sacIntake = intakeMapping[intakeSource] || 'other_intake';
        stats.intakeBreakdown[sacIntake] = (stats.intakeBreakdown[sacIntake] || 0) + 1;

        // Track unmapped
        if (!intakeMapping[intakeSource]) {
          unmappedIntakes.push(animal.id);
        }
      }

      // Outcomes: Left this month
      if (outcomeDate) {
        const outDate = new Date(outcomeDate);
        if (outDate >= startDate && outDate < endDate) {
          if (species === 'other') {
            stats.other.outcomes++;
          } else {
            stats[species][ageGroup].outcomes++;
          }

          // Determine outcome type
          let outcomeType = 'other';
          if (animal.status === 'adopted' && animal.adoptionDate) {
            outcomeType = 'adopted';
          } else if (animal.status === 'deceased') {
            if (animal.causeOfDeath === 'euthanasia') {
              outcomeType = 'euthanasia';
            } else {
              outcomeType = 'died';
            }
          }

          const sacOutcome = outcomeMapping[outcomeType] || 'other_live_outcome';
          stats.outcomeBreakdown[sacOutcome] = (stats.outcomeBreakdown[sacOutcome] || 0) + 1;

          // Track unmapped
          if (!outcomeMapping[outcomeType]) {
            unmappedOutcomes.push(animal.id);
          }
        }
      }

      // Ending count: In care at end of month
      const stillInCareAtEnd = !outcomeDate || new Date(outcomeDate) >= endDate;
      const wasIntakenByEnd = intakeDate < endDate;

      if (wasIntakenByEnd && stillInCareAtEnd) {
        if (species === 'other') {
          stats.other.ending++;
        } else {
          stats[species][ageGroup].ending++;
        }
      }
    }

    // Add validation errors for unmapped statuses
    if (unmappedIntakes.length > 0) {
      validationErrors.push({
        field: 'intakeMapping',
        message: `${unmappedIntakes.length} animals have unmapped intake sources`,
        animalIds: unmappedIntakes.slice(0, 10),
      });
    }

    if (unmappedOutcomes.length > 0) {
      validationErrors.push({
        field: 'outcomeMapping',
        message: `${unmappedOutcomes.length} animals have unmapped outcome types`,
        animalIds: unmappedOutcomes.slice(0, 10),
      });
    }

    // Check if beginning + intakes - outcomes = ending (basic validation)
    for (const species of ['dogs', 'cats'] as const) {
      for (const age of ['juvenile', 'adult'] as const) {
        const s = stats[species][age];
        const expected = s.beginning + s.intakes - s.outcomes;
        if (expected !== s.ending) {
          validationErrors.push({
            field: `${species}.${age}`,
            message: `Count mismatch: ${s.beginning} + ${s.intakes} - ${s.outcomes} = ${expected}, but ending is ${s.ending}`,
          });
        }
      }
    }

    const otherExpected = stats.other.beginning + stats.other.intakes - stats.other.outcomes;
    if (otherExpected !== stats.other.ending) {
      validationErrors.push({
        field: 'other',
        message: `Count mismatch: ${stats.other.beginning} + ${stats.other.intakes} - ${stats.other.outcomes} = ${otherExpected}, but ending is ${stats.other.ending}`,
      });
    }

    // Save report
    const validationStatus = validationErrors.length > 0 ? 'errors' : 'valid';
    
    // Upsert the report
    const existingReport = await db
      .select({ id: sacMonthlyReports.id })
      .from(sacMonthlyReports)
      .where(and(
        eq(sacMonthlyReports.tenantId, req.tenant!.id),
        eq(sacMonthlyReports.reportMonth, month),
        eq(sacMonthlyReports.reportYear, year),
      ))
      .limit(1);

    let reportId: string;
    
    if (existingReport.length > 0) {
      // Update existing
      await db
        .update(sacMonthlyReports)
        .set({
          statistics: stats,
          validationStatus,
          validationErrors: validationErrors.length > 0 ? validationErrors : null,
          generatedAt: new Date(),
          generatedBy: req.user!.id,
          updatedAt: new Date(),
        })
        .where(eq(sacMonthlyReports.id, existingReport[0].id));
      reportId = existingReport[0].id;
    } else {
      // Insert new
      const [newReport] = await db
        .insert(sacMonthlyReports)
        .values({
          tenantId: req.tenant!.id,
          reportMonth: month,
          reportYear: year,
          statistics: stats,
          validationStatus,
          validationErrors: validationErrors.length > 0 ? validationErrors : null,
          generatedAt: new Date(),
          generatedBy: req.user!.id,
        })
        .returning({ id: sacMonthlyReports.id });
      reportId = newReport.id;
    }

    res.json({
      success: true,
      reportId,
      statistics: stats,
      validationStatus,
      validationErrors,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/compliance/sac/export/:reportId
 * Export SAC report as CSV
 */
router.get('/sac/export/:reportId', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user!.activeRole || '')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const report = await db
      .select()
      .from(sacMonthlyReports)
      .where(and(
        eq(sacMonthlyReports.id, req.params.reportId),
        eq(sacMonthlyReports.tenantId, req.tenant!.id),
      ))
      .limit(1);

    if (!report.length) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const { statistics, reportMonth, reportYear } = report[0];
    const stats = statistics as any;

    // Generate SAC-compliant CSV format
    const monthName = new Date(reportYear, reportMonth - 1).toLocaleString('en-US', { month: 'long' });
    
    const csvLines = [
      `Shelter Animals Count Monthly Report`,
      `Month: ${monthName} ${reportYear}`,
      ``,
      `Species,Age Group,Beginning,Intakes,Outcomes,Ending`,
      `Dogs,Juvenile,${stats.dogs.juvenile.beginning},${stats.dogs.juvenile.intakes},${stats.dogs.juvenile.outcomes},${stats.dogs.juvenile.ending}`,
      `Dogs,Adult,${stats.dogs.adult.beginning},${stats.dogs.adult.intakes},${stats.dogs.adult.outcomes},${stats.dogs.adult.ending}`,
      `Cats,Juvenile,${stats.cats.juvenile.beginning},${stats.cats.juvenile.intakes},${stats.cats.juvenile.outcomes},${stats.cats.juvenile.ending}`,
      `Cats,Adult,${stats.cats.adult.beginning},${stats.cats.adult.intakes},${stats.cats.adult.outcomes},${stats.cats.adult.ending}`,
      `Other,,${stats.other.beginning},${stats.other.intakes},${stats.other.outcomes},${stats.other.ending}`,
      ``,
      `Intake Breakdown`,
    ];

    // Add intake breakdown
    for (const [category, count] of Object.entries(stats.intakeBreakdown || {})) {
      csvLines.push(`${category.replace(/_/g, ' ')},${count}`);
    }

    csvLines.push(``, `Outcome Breakdown`);

    // Add outcome breakdown
    for (const [category, count] of Object.entries(stats.outcomeBreakdown || {})) {
      csvLines.push(`${category.replace(/_/g, ' ')},${count}`);
    }

    const csv = csvLines.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="SAC_Report_${reportYear}_${String(reportMonth).padStart(2, '0')}.csv"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/compliance/sac/report/:id
 * Get a specific SAC report
 */
router.get('/sac/report/:id', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user!.activeRole || '')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const report = await db
      .select()
      .from(sacMonthlyReports)
      .where(and(
        eq(sacMonthlyReports.id, req.params.id),
        eq(sacMonthlyReports.tenantId, req.tenant!.id),
      ))
      .limit(1);

    if (!report.length) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ report: report[0] });
  } catch (error) {
    next(error);
  }
});

// ===== IMPACT STATS (Live Release Rate) =====

/**
 * GET /api/compliance/impact/settings
 * Get impact dashboard settings
 */
router.get('/impact/settings', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user!.activeRole || '')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tenant = await db
      .select({ impactSettings: tenants.impactSettings })
      .from(tenants)
      .where(eq(tenants.id, req.tenant!.id))
      .limit(1);

    const defaultSettings = {
      enabled: false,
      showOnPublicSite: false,
      excludeOre: true, // Exclude Owner Requested Euthanasia from denominator
      periodType: 'rolling_12_months',
    };

    res.json({ 
      settings: { ...defaultSettings, ...(tenant[0]?.impactSettings as object || {}) },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/compliance/impact/settings
 * Update impact dashboard settings
 */
router.put('/impact/settings', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (req.user!.activeRole !== 'admin') {
      return res.status(403).json({ error: 'Admin role required' });
    }

    const schema = z.object({
      enabled: z.boolean().optional(),
      showOnPublicSite: z.boolean().optional(),
      excludeOre: z.boolean().optional(),
      periodType: z.enum(['monthly', 'quarterly', 'annual', 'rolling_12_months']).optional(),
    });

    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid settings' });
    }

    const tenant = await db
      .select({ impactSettings: tenants.impactSettings })
      .from(tenants)
      .where(eq(tenants.id, req.tenant!.id))
      .limit(1);

    const currentSettings = (tenant[0]?.impactSettings as object) || {};
    const newSettings = { ...currentSettings, ...result.data };

    await db
      .update(tenants)
      .set({ impactSettings: newSettings })
      .where(eq(tenants.id, req.tenant!.id));

    res.json({ success: true, settings: newSettings });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/compliance/impact/stats
 * Get latest impact statistics
 */
router.get('/impact/stats', requireTenant, requireAuth, async (req, res, next) => {
  try {
    // Allow public access if showOnPublicSite is enabled
    const tenant = await db
      .select({ impactSettings: tenants.impactSettings })
      .from(tenants)
      .where(eq(tenants.id, req.tenant!.id))
      .limit(1);

    const settings = tenant[0]?.impactSettings as any || {};
    
    // Get latest stats
    const latestStats = await db
      .select()
      .from(impactStats)
      .where(eq(impactStats.tenantId, req.tenant!.id))
      .orderBy(desc(impactStats.computedAt))
      .limit(1);

    if (!latestStats.length) {
      return res.json({ 
        hasData: false,
        message: 'No impact statistics calculated yet',
      });
    }

    res.json({
      hasData: true,
      stats: latestStats[0],
      settings,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/compliance/impact/calculate
 * Manually trigger impact stats calculation
 */
router.post('/impact/calculate', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (req.user!.activeRole !== 'admin') {
      return res.status(403).json({ error: 'Admin role required' });
    }

    // Get settings
    const tenant = await db
      .select({ impactSettings: tenants.impactSettings })
      .from(tenants)
      .where(eq(tenants.id, req.tenant!.id))
      .limit(1);

    const settings = (tenant[0]?.impactSettings as any) || {};
    const periodType = settings.periodType || 'rolling_12_months';
    const excludeOre = settings.excludeOre !== false;

    // Calculate date range
    const endDate = new Date();
    let startDate: Date;

    switch (periodType) {
      case 'monthly':
        startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 1, 1);
        break;
      case 'quarterly':
        startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 3, 1);
        break;
      case 'annual':
        startDate = new Date(endDate.getFullYear() - 1, endDate.getMonth(), 1);
        break;
      default: // rolling_12_months
        startDate = new Date(endDate.getFullYear() - 1, endDate.getMonth(), endDate.getDate());
    }

    // Get animals with outcomes in the period
    const animalsWithOutcomes = await db
      .select({
        id: animals.id,
        status: animals.status,
        adoptionDate: animals.adoptionDate,
        deceasedDate: animals.deceasedDate,
        causeOfDeath: animals.causeOfDeath,
        intakeDate: animals.intakeDate,
      })
      .from(animals)
      .where(eq(animals.tenantId, req.tenant!.id));

    // Calculate stats
    let liveOutcomes = 0;
    let totalOutcomes = 0;
    let adoptionsCount = 0;
    let transfersOutCount = 0;
    let returnedToOwnerCount = 0;
    let euthanasiaCount = 0;
    let diedInCareCount = 0;
    let ownerRequestedEuthanasia = 0;
    let totalIntakes = 0;

    for (const animal of animalsWithOutcomes) {
      // Count intakes in period
      if (animal.intakeDate) {
        const intakeDate = new Date(animal.intakeDate);
        if (intakeDate >= startDate && intakeDate < endDate) {
          totalIntakes++;
        }
      }

      // Check for outcomes
      const outcomeDate = animal.adoptionDate || animal.deceasedDate;
      if (!outcomeDate) continue;

      const outDate = new Date(outcomeDate);
      if (outDate < startDate || outDate >= endDate) continue;

      totalOutcomes++;

      // Categorize outcome
      if (animal.status === 'adopted') {
        liveOutcomes++;
        adoptionsCount++;
      } else if (animal.status === 'deceased') {
        if (animal.causeOfDeath === 'euthanasia') {
          euthanasiaCount++;
          // Check if ORE (we'd need to enhance the schema to track this better)
          // For now, we count all euthanasia
        } else {
          diedInCareCount++;
        }
      }
      // Note: transfers and RTO would need additional status tracking
    }

    // Calculate LRR
    const denominator = excludeOre ? (totalOutcomes - ownerRequestedEuthanasia) : totalOutcomes;
    const liveReleaseRate = denominator > 0 ? (liveOutcomes / denominator * 100).toFixed(2) : '0.00';

    // Save stats
    const [newStats] = await db
      .insert(impactStats)
      .values({
        tenantId: req.tenant!.id,
        periodStart: startDate,
        periodEnd: endDate,
        periodType,
        liveOutcomes,
        totalOutcomes,
        ownerRequestedEuthanasia,
        excludedOre: excludeOre,
        liveReleaseRate: liveReleaseRate,
        totalIntakes,
        adoptionsCount,
        transfersOutCount,
        returnedToOwnerCount,
        euthanasiaCount,
        diedInCareCount,
      })
      .returning();

    res.json({
      success: true,
      stats: newStats,
      liveReleaseRate: parseFloat(liveReleaseRate),
    });
  } catch (error) {
    next(error);
  }
});

// ===== TRANSPARENCY VAULT =====

/**
 * GET /api/compliance/documents
 * Get all compliance documents
 */
router.get('/documents', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user!.activeRole || '')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const docs = await db
      .select()
      .from(complianceDocuments)
      .where(eq(complianceDocuments.tenantId, req.tenant!.id))
      .orderBy(desc(complianceDocuments.uploadedAt));

    res.json({ documents: docs });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/compliance/transparency-vault/settings
 * Get Transparency Vault settings
 */
router.get('/transparency-vault/settings', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user!.activeRole || '')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tenant = await db
      .select({ transparencyVault: tenants.transparencyVault })
      .from(tenants)
      .where(eq(tenants.id, req.tenant!.id))
      .limit(1);

    const defaultSettings = {
      enabled: false,
      publicPageEnabled: false,
      ein: '',
      candidSealLevel: null, // 'bronze', 'silver', 'gold', 'platinum'
    };

    res.json({ 
      settings: { ...defaultSettings, ...(tenant[0]?.transparencyVault as object || {}) },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/compliance/transparency-vault/settings
 * Update Transparency Vault settings
 */
router.put('/transparency-vault/settings', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (req.user!.activeRole !== 'admin') {
      return res.status(403).json({ error: 'Admin role required' });
    }

    const schema = z.object({
      enabled: z.boolean().optional(),
      publicPageEnabled: z.boolean().optional(),
      ein: z.string().optional(),
      candidSealLevel: z.enum(['bronze', 'silver', 'gold', 'platinum']).nullable().optional(),
    });

    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid settings' });
    }

    const tenant = await db
      .select({ transparencyVault: tenants.transparencyVault })
      .from(tenants)
      .where(eq(tenants.id, req.tenant!.id))
      .limit(1);

    const currentSettings = (tenant[0]?.transparencyVault as object) || {};
    const newSettings = { ...currentSettings, ...result.data };

    await db
      .update(tenants)
      .set({ transparencyVault: newSettings })
      .where(eq(tenants.id, req.tenant!.id));

    res.json({ success: true, settings: newSettings });
  } catch (error) {
    next(error);
  }
});

// ===== GREATNONPROFITS REVIEW REQUESTS =====

/**
 * GET /api/compliance/reviews/settings
 * Get GreatNonprofits settings
 */
router.get('/reviews/settings', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user!.activeRole || '')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tenant = await db
      .select({ greatNonprofitsSettings: tenants.greatNonprofitsSettings })
      .from(tenants)
      .where(eq(tenants.id, req.tenant!.id))
      .limit(1);

    const defaultSettings = {
      enabled: false,
      delayDays: 7,
      reviewUrl: '', // GreatNonprofits profile URL
      emailSubject: 'Share your adoption experience!',
      emailTemplate: 'default',
    };

    res.json({ 
      settings: { ...defaultSettings, ...(tenant[0]?.greatNonprofitsSettings as object || {}) },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/compliance/reviews/settings
 * Update GreatNonprofits settings
 */
router.put('/reviews/settings', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (req.user!.activeRole !== 'admin') {
      return res.status(403).json({ error: 'Admin role required' });
    }

    const schema = z.object({
      enabled: z.boolean().optional(),
      delayDays: z.number().min(1).max(30).optional(),
      reviewUrl: z.string().url().or(z.literal('')).optional(),
      emailSubject: z.string().min(1).max(100).optional(),
      emailTemplate: z.enum(['default', 'custom']).optional(),
    });

    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid settings' });
    }

    const tenant = await db
      .select({ greatNonprofitsSettings: tenants.greatNonprofitsSettings })
      .from(tenants)
      .where(eq(tenants.id, req.tenant!.id))
      .limit(1);

    const currentSettings = (tenant[0]?.greatNonprofitsSettings as object) || {};
    const newSettings = { ...currentSettings, ...result.data };

    await db
      .update(tenants)
      .set({ greatNonprofitsSettings: newSettings })
      .where(eq(tenants.id, req.tenant!.id));

    res.json({ success: true, settings: newSettings });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/compliance/reviews/pending
 * Get pending review requests
 */
router.get('/reviews/pending', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user!.activeRole || '')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const pending = await db
      .select()
      .from(reviewRequests)
      .where(and(
        eq(reviewRequests.tenantId, req.tenant!.id),
        eq(reviewRequests.status, 'pending'),
      ))
      .orderBy(reviewRequests.scheduledFor)
      .limit(50);

    res.json({ requests: pending });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/compliance/reviews/history
 * Get review request history
 */
router.get('/reviews/history', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user!.activeRole || '')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const history = await db
      .select()
      .from(reviewRequests)
      .where(eq(reviewRequests.tenantId, req.tenant!.id))
      .orderBy(desc(reviewRequests.createdAt))
      .limit(100);

    res.json({ requests: history });
  } catch (error) {
    next(error);
  }
});

// ===== PUBLIC ENDPOINTS (No Auth Required) =====

/**
 * GET /api/compliance/public/transparency
 * Get public transparency vault data (no auth required)
 */
router.get('/public/transparency', requireTenant, async (req, res, next) => {
  try {
    const tenant = await db
      .select({ 
        transparencyVault: tenants.transparencyVault,
        name: tenants.name,
      })
      .from(tenants)
      .where(eq(tenants.id, req.tenant!.id))
      .limit(1);

    if (!tenant.length) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const settings = (tenant[0].transparencyVault as any) || {};
    
    if (!settings.publicPageEnabled) {
      return res.json({ 
        settings: { publicPageEnabled: false },
        documents: [],
      });
    }

    const docs = await db
      .select()
      .from(complianceDocuments)
      .where(and(
        eq(complianceDocuments.tenantId, req.tenant!.id),
        eq(complianceDocuments.isPublic, true),
      ))
      .orderBy(desc(complianceDocuments.uploadedAt));

    res.json({ 
      settings: {
        enabled: settings.enabled,
        publicPageEnabled: settings.publicPageEnabled,
        ein: settings.ein,
        candidSealLevel: settings.candidSealLevel,
      },
      documents: docs,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/compliance/public/impact-stats
 * Get public impact statistics (no auth required)
 */
router.get('/public/impact-stats', requireTenant, async (req, res, next) => {
  try {
    const tenant = await db
      .select({ impactSettings: tenants.impactSettings })
      .from(tenants)
      .where(eq(tenants.id, req.tenant!.id))
      .limit(1);

    if (!tenant.length) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const settings = (tenant[0].impactSettings as any) || {};
    
    if (!settings.showOnPublicSite) {
      return res.json({ 
        hasData: false,
        message: 'Impact stats are not public',
      });
    }

    const latestStats = await db
      .select()
      .from(impactStats)
      .where(eq(impactStats.tenantId, req.tenant!.id))
      .orderBy(desc(impactStats.computedAt))
      .limit(1);

    if (!latestStats.length) {
      return res.json({ 
        hasData: false,
        message: 'No impact statistics calculated yet',
      });
    }

    res.json({
      hasData: true,
      stats: latestStats[0],
      settings: { showOnPublicSite: settings.showOnPublicSite },
    });
  } catch (error) {
    next(error);
  }
});

// ===== ANNUAL GIVING SUMMARY (IRS Year-End Tax Summaries) =====

import {
  getEligibleDonors,
  generateAnnualSummaryPdf,
  sendAnnualSummary,
  sendAllAnnualSummaries,
  checkProTierRequired,
} from '../services/annual-giving-summary-service';

/**
 * GET /api/compliance/annual-summary/eligible-donors
 * Get list of donors who gave $250+ in a calendar year
 * Available to both Free and Pro tiers
 */
router.get('/annual-summary/eligible-donors', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user!.activeRole || '')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const year = parseInt(req.query.year as string) || new Date().getFullYear() - 1;
    
    const eligibleDonors = await getEligibleDonors(req.tenant!.id, year);
    
    const tenant = await db
      .select({ subscriptionTier: tenants.subscriptionTier })
      .from(tenants)
      .where(eq(tenants.id, req.tenant!.id))
      .limit(1);

    const isProTier = tenant.length > 0 && !checkProTierRequired(tenant[0].subscriptionTier);

    res.json({
      year,
      eligibleDonors,
      totalEligible: eligibleDonors.length,
      totalAmount: eligibleDonors.reduce((sum, d) => sum + d.totalAmount, 0),
      isProTier,
      canBulkSend: isProTier,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/compliance/annual-summary/download/:email
 * Download a single donor's annual summary PDF
 * Available to both Free and Pro tiers
 */
router.get('/annual-summary/download/:email', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user!.activeRole || '')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const year = parseInt(req.query.year as string) || new Date().getFullYear() - 1;
    const email = decodeURIComponent(req.params.email);
    
    const eligibleDonors = await getEligibleDonors(req.tenant!.id, year);
    const donor = eligibleDonors.find(d => d.donorEmail.toLowerCase() === email.toLowerCase());
    
    if (!donor) {
      return res.status(404).json({ error: 'Donor not found or not eligible' });
    }

    const result = await generateAnnualSummaryPdf(req.tenant!.id, donor, year);
    
    if (!result.success || !result.pdfBuffer) {
      return res.status(500).json({ error: result.message });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Annual_Summary_${year}_${result.receiptNumber}.pdf"`);
    res.send(result.pdfBuffer);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/compliance/annual-summary/send/:email
 * Send annual summary to a single donor
 * Available to Pro tier only
 */
router.post('/annual-summary/send/:email', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user!.activeRole || '')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tenant = await db
      .select({ subscriptionTier: tenants.subscriptionTier })
      .from(tenants)
      .where(eq(tenants.id, req.tenant!.id))
      .limit(1);

    if (tenant.length === 0 || checkProTierRequired(tenant[0].subscriptionTier)) {
      return res.status(403).json({ 
        error: 'Professional subscription required',
        message: 'Upgrade to Professional to send annual summaries automatically. Free tier can download and send manually.'
      });
    }

    const year = parseInt(req.query.year as string) || new Date().getFullYear() - 1;
    const email = decodeURIComponent(req.params.email);
    
    const eligibleDonors = await getEligibleDonors(req.tenant!.id, year);
    const donor = eligibleDonors.find(d => d.donorEmail.toLowerCase() === email.toLowerCase());
    
    if (!donor) {
      return res.status(404).json({ error: 'Donor not found or not eligible' });
    }

    const result = await sendAnnualSummary(req.tenant!.id, donor, year);
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/compliance/annual-summary/send-all
 * Send annual summaries to all eligible donors
 * Pro tier only - the killer feature!
 */
router.post('/annual-summary/send-all', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (req.user!.activeRole !== 'admin') {
      return res.status(403).json({ error: 'Admin role required' });
    }

    const tenant = await db
      .select({ subscriptionTier: tenants.subscriptionTier })
      .from(tenants)
      .where(eq(tenants.id, req.tenant!.id))
      .limit(1);

    if (tenant.length === 0 || checkProTierRequired(tenant[0].subscriptionTier)) {
      return res.status(403).json({ 
        error: 'Professional subscription required',
        message: 'Upgrade to Professional to send all annual summaries with one click. Free tier must download and send manually.'
      });
    }

    const year = parseInt(req.body.year as string) || new Date().getFullYear() - 1;
    
    const result = await sendAllAnnualSummaries(req.tenant!.id, year);
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/compliance/annual-summary/export-csv
 * Export eligible donors as CSV (for Free tier manual processing)
 */
router.get('/annual-summary/export-csv', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user!.activeRole || '')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const year = parseInt(req.query.year as string) || new Date().getFullYear() - 1;
    
    const eligibleDonors = await getEligibleDonors(req.tenant!.id, year);

    const csvLines = [
      'Donor Name,Email,Address,Total Amount,Number of Donations',
    ];

    for (const donor of eligibleDonors) {
      const address = (donor.donorAddress || '').replace(/,/g, ';').replace(/"/g, '""');
      csvLines.push(`"${donor.donorName}","${donor.donorEmail}","${address}",${(donor.totalAmount / 100).toFixed(2)},${donor.donationCount}`);
    }

    const csv = csvLines.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="Eligible_Donors_${year}.csv"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/compliance/public/recent-donations
 * Get recent public donations for the donation widget (no auth required)
 * Returns donor first name + last initial, amount, and location
 * Includes both regular donations (payments) and wishlist donations (supply donations)
 */
router.get('/public/recent-donations', requireTenant, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 20);
    
    // Helper function to format donor name for privacy
    const formatDisplayName = (name: string | null) => {
      const nameParts = (name || 'Anonymous').split(' ').filter(Boolean);
      let displayName = 'Anonymous';
      if (nameParts.length >= 1 && nameParts[0].toLowerCase() !== 'anonymous') {
        displayName = nameParts[0];
        if (nameParts.length >= 2 && nameParts[nameParts.length - 1]) {
          displayName += ` ${nameParts[nameParts.length - 1][0]}.`;
        }
      }
      return displayName;
    };
    
    // Fetch recent successful public payments with donor info
    const recentPayments = await db
      .select({
        id: payments.id,
        amount: payments.amount,
        donorCity: payments.donorCity,
        donorState: payments.donorState,
        donorCountry: payments.donorCountry,
        createdAt: payments.createdAt,
        donorName: donors.name,
      })
      .from(payments)
      .leftJoin(donors, eq(payments.donorId, donors.id))
      .where(
        and(
          eq(payments.tenantId, req.tenant!.id),
          eq(payments.status, 'succeeded'),
          eq(payments.isPublic, true)
        )
      )
      .orderBy(desc(payments.createdAt))
      .limit(limit);

    // Fetch recent wishlist donations (supply donations paid via Stripe)
    // Include both 'monetary' and 'both' donation types
    const recentWishlistDonations = await db
      .select({
        id: supplyDonations.id,
        amount: supplyDonations.amount,
        donorName: supplyDonations.donorName,
        createdAt: supplyDonations.createdAt,
      })
      .from(supplyDonations)
      .where(
        and(
          eq(supplyDonations.tenantId, req.tenant!.id),
          eq(supplyDonations.paymentMethod, 'stripe'),
          sql`${supplyDonations.donationType} IN ('monetary', 'both')`
        )
      )
      .orderBy(desc(supplyDonations.createdAt))
      .limit(limit);

    // Format regular payments for public display
    const formattedPayments = recentPayments.map(payment => {
      // Format location
      let location = '';
      if (payment.donorCity && payment.donorState) {
        location = `${payment.donorCity}, ${payment.donorState}`;
      } else if (payment.donorCity) {
        location = payment.donorCity;
      } else if (payment.donorState) {
        location = payment.donorState;
      }
      if (payment.donorCountry && payment.donorCountry !== 'US') {
        location = location ? `${location}, ${payment.donorCountry}` : payment.donorCountry;
      }

      return {
        id: payment.id,
        displayName: formatDisplayName(payment.donorName),
        amount: payment.amount, // in cents
        location: location || null,
        createdAt: payment.createdAt,
      };
    });

    // Format wishlist donations for public display
    const formattedWishlistDonations = recentWishlistDonations.map(donation => ({
      id: donation.id,
      displayName: formatDisplayName(donation.donorName),
      // Supply donations store amount in dollars (numeric), convert to cents
      amount: donation.amount ? Math.round(parseFloat(donation.amount) * 100) : 0,
      location: null, // Wishlist donations don't have location info
      createdAt: donation.createdAt,
    }));

    // Merge and sort by createdAt descending, then take the limit
    const allDonations = [...formattedPayments, ...formattedWishlistDonations]
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
      .slice(0, limit);

    res.json(allDonations);
  } catch (error) {
    next(error);
  }
});

export default router;

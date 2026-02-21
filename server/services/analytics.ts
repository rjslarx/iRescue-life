import { db } from "../db";
import {
  animals,
  adoptions,
  applications,
  payments,
  donations,
  users,
  volunteerSignups,
  volunteerOpportunities,
} from "../../shared/schema";
import { eq, and, gte, lte, sql, count, sum, avg, desc } from "drizzle-orm";

/**
 * Analytics Service - Calculates key metrics for rescue organizations
 */

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface AnalyticsOverview {
  // Adoption Metrics
  totalAdoptions: number;
  adoptionsThisPeriod: number;
  adoptionRate: number; // Percentage of animals adopted vs total intake
  averageDaysToAdoption: number;
  adoptionsBySpecies: { species: string; count: number }[];
  
  // Application Metrics
  totalApplications: number;
  applicationsThisPeriod: number;
  applicationConversionRate: number; // Approved applications / total applications
  applicationsByStage: { stage: string; count: number }[];
  
  // Financial Metrics
  totalRevenue: number;
  revenueThisPeriod: number;
  averageDonationAmount: number;
  totalDonors: number;
  recurringDonors: number;
  donorRetentionRate: number;
  
  // Animal Inventory
  totalAnimals: number;
  availableAnimals: number;
  animalsInFoster: number;
  animalsPending: number;
  animalsOnMedicalHold: number;
  
  // Volunteer Metrics
  totalVolunteers: number;
  activeVolunteersThisPeriod: number;
  volunteerParticipationRate: number;
  totalVolunteerSlotsFilled: number;
}

export interface TrendData {
  date: string;
  adoptions: number;
  applications: number;
  revenue: number;
  newAnimals: number;
}

export interface SpeciesBreakdown {
  species: string;
  total: number;
  adopted: number;
  available: number;
  averageDaysToAdoption: number;
}

/**
 * Get comprehensive analytics overview for a tenant
 */
export async function getAnalyticsOverview(
  tenantId: string,
  dateRange: DateRange
): Promise<AnalyticsOverview> {
  const { startDate, endDate } = dateRange;

  // Adoption Metrics
  const allAdoptions = await db
    .select()
    .from(adoptions)
    .where(eq(adoptions.tenantId, tenantId));

  const adoptionsInPeriod = allAdoptions.filter(
    (a) => a.adoptionDate >= startDate && a.adoptionDate <= endDate
  );

  const allAnimals = await db
    .select()
    .from(animals)
    .where(eq(animals.tenantId, tenantId));

  const animalsIntakeInPeriod = allAnimals.filter(
    (a) => a.intakeDate >= startDate && a.intakeDate <= endDate
  );

  // Calculate average days to adoption
  const adoptedAnimals = allAnimals.filter((a) => a.status === "adopted" && a.adoptionDate);
  const daysToAdoptionArray = adoptedAnimals
    .map((a) => {
      if (!a.adoptionDate) return null;
      const days = Math.floor(
        (a.adoptionDate.getTime() - a.intakeDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      return days;
    })
    .filter((d): d is number => d !== null && d >= 0);

  const averageDaysToAdoption =
    daysToAdoptionArray.length > 0
      ? Math.round(daysToAdoptionArray.reduce((a, b) => a + b, 0) / daysToAdoptionArray.length)
      : 0;

  // Adoptions by species
  const adoptionsBySpecies: { species: string; count: number }[] = Array.from(
    adoptedAnimals.reduce((map, animal) => {
      const species = animal.species || "Unknown";
      map.set(species, (map.get(species) || 0) + 1);
      return map;
    }, new Map<string, number>()).entries()
  ).map(([species, count]) => ({ species, count }));

  // Application Metrics
  const allApplications = await db
    .select()
    .from(applications)
    .where(eq(applications.tenantId, tenantId));

  const applicationsInPeriod = allApplications.filter(
    (a) => a.createdAt >= startDate && a.createdAt <= endDate
  );

  const approvedApplications = allApplications.filter((a) => a.stage === "approved");
  const applicationConversionRate =
    allApplications.length > 0
      ? Math.round((approvedApplications.length / allApplications.length) * 100)
      : 0;

  const applicationsByStage: { stage: string; count: number }[] = Array.from(
    allApplications.reduce((map, app) => {
      map.set(app.stage, (map.get(app.stage) || 0) + 1);
      return map;
    }, new Map<string, number>()).entries()
  ).map(([stage, count]) => ({ stage, count }));

  // Financial Metrics
  const allPayments = await db
    .select()
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.status, "succeeded")));

  const paymentsInPeriod = allPayments.filter(
    (p) => p.createdAt >= startDate && p.createdAt <= endDate
  );

  const totalRevenue = allPayments.reduce((sum, p) => sum + p.amount, 0) / 100; // Convert cents to dollars
  const revenueThisPeriod = paymentsInPeriod.reduce((sum, p) => sum + p.amount, 0) / 100;

  const averageDonationAmount =
    allPayments.length > 0 ? Math.round(totalRevenue / allPayments.length) : 0;

  // Unique donors (by donorId)
  const uniqueDonorIds = new Set(allPayments.map((p) => p.donorId).filter(Boolean));
  const totalDonors = uniqueDonorIds.size;

  // Recurring donors (donors who have made more than one payment)
  const donorPaymentCounts = new Map<string, number>();
  allPayments.forEach((p) => {
    if (p.donorId) {
      donorPaymentCounts.set(p.donorId, (donorPaymentCounts.get(p.donorId) || 0) + 1);
    }
  });
  const recurringDonors = Array.from(donorPaymentCounts.values()).filter((count) => count > 1)
    .length;

  const donorRetentionRate =
    totalDonors > 0 ? Math.round((recurringDonors / totalDonors) * 100) : 0;

  // Animal Inventory (current state)
  const availableAnimals = allAnimals.filter((a) => a.status === "available").length;
  const animalsInFoster = allAnimals.filter((a) => a.locationType === "foster").length;
  const animalsPending = allAnimals.filter((a) => a.status === "pending").length;
  const animalsOnMedicalHold = allAnimals.filter((a) => a.status === "medical_hold").length;

  // Volunteer Metrics
  const allVolunteers = await db
    .select()
    .from(users)
    .where(eq(users.tenantId, tenantId));

  const volunteersWithRole = allVolunteers.filter((u) => u.roles.includes("volunteer"));

  const allSignups = await db
    .select()
    .from(volunteerSignups)
    .innerJoin(volunteerOpportunities, eq(volunteerSignups.opportunityId, volunteerOpportunities.id))
    .where(eq(volunteerOpportunities.tenantId, tenantId));

  const signupsInPeriod = allSignups.filter(
    (s) => s.volunteer_signups.createdAt >= startDate && s.volunteer_signups.createdAt <= endDate
  );

  const activeVolunteerIds = new Set(signupsInPeriod.map((s) => s.volunteer_signups.userId));

  const volunteerParticipationRate =
    volunteersWithRole.length > 0
      ? Math.round((activeVolunteerIds.size / volunteersWithRole.length) * 100)
      : 0;

  // Adoption rate (animals adopted vs total animals in system)
  const adoptionRate =
    allAnimals.length > 0 ? Math.round((adoptedAnimals.length / allAnimals.length) * 100) : 0;

  return {
    // Adoption Metrics
    totalAdoptions: allAdoptions.length,
    adoptionsThisPeriod: adoptionsInPeriod.length,
    adoptionRate,
    averageDaysToAdoption,
    adoptionsBySpecies,

    // Application Metrics
    totalApplications: allApplications.length,
    applicationsThisPeriod: applicationsInPeriod.length,
    applicationConversionRate,
    applicationsByStage,

    // Financial Metrics
    totalRevenue,
    revenueThisPeriod,
    averageDonationAmount,
    totalDonors,
    recurringDonors,
    donorRetentionRate,

    // Animal Inventory
    totalAnimals: allAnimals.length,
    availableAnimals,
    animalsInFoster,
    animalsPending,
    animalsOnMedicalHold,

    // Volunteer Metrics
    totalVolunteers: volunteersWithRole.length,
    activeVolunteersThisPeriod: activeVolunteerIds.size,
    volunteerParticipationRate,
    totalVolunteerSlotsFilled: allSignups.length,
  };
}

/**
 * Get trend data over time (for charts)
 */
export async function getTrendData(
  tenantId: string,
  dateRange: DateRange,
  granularity: "day" | "week" | "month" = "month"
): Promise<TrendData[]> {
  const { startDate, endDate } = dateRange;

  // Fetch all relevant data
  const allAdoptions = await db
    .select()
    .from(adoptions)
    .where(
      and(
        eq(adoptions.tenantId, tenantId),
        gte(adoptions.adoptionDate, startDate),
        lte(adoptions.adoptionDate, endDate)
      )
    );

  const allApplications = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.tenantId, tenantId),
        gte(applications.createdAt, startDate),
        lte(applications.createdAt, endDate)
      )
    );

  const allPayments = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.tenantId, tenantId),
        eq(payments.status, "succeeded"),
        gte(payments.createdAt, startDate),
        lte(payments.createdAt, endDate)
      )
    );

  const allAnimals = await db
    .select()
    .from(animals)
    .where(
      and(
        eq(animals.tenantId, tenantId),
        gte(animals.intakeDate, startDate),
        lte(animals.intakeDate, endDate)
      )
    );

  // Group data by time period
  const dataByPeriod = new Map<string, TrendData>();

  const getDateKey = (date: Date): string => {
    if (granularity === "day") {
      return date.toISOString().split("T")[0];
    } else if (granularity === "week") {
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - date.getDay());
      return startOfWeek.toISOString().split("T")[0];
    } else {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    }
  };

  // Initialize all periods with zero values
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const key = getDateKey(currentDate);
    if (!dataByPeriod.has(key)) {
      dataByPeriod.set(key, {
        date: key,
        adoptions: 0,
        applications: 0,
        revenue: 0,
        newAnimals: 0,
      });
    }

    if (granularity === "day") {
      currentDate.setDate(currentDate.getDate() + 1);
    } else if (granularity === "week") {
      currentDate.setDate(currentDate.getDate() + 7);
    } else {
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
  }

  // Aggregate adoptions
  allAdoptions.forEach((adoption) => {
    const key = getDateKey(adoption.adoptionDate);
    const data = dataByPeriod.get(key);
    if (data) {
      data.adoptions++;
    }
  });

  // Aggregate applications
  allApplications.forEach((application) => {
    const key = getDateKey(application.createdAt);
    const data = dataByPeriod.get(key);
    if (data) {
      data.applications++;
    }
  });

  // Aggregate revenue
  allPayments.forEach((payment) => {
    const key = getDateKey(payment.createdAt);
    const data = dataByPeriod.get(key);
    if (data) {
      data.revenue += payment.amount / 100; // Convert cents to dollars
    }
  });

  // Aggregate new animals
  allAnimals.forEach((animal) => {
    const key = getDateKey(animal.intakeDate);
    const data = dataByPeriod.get(key);
    if (data) {
      data.newAnimals++;
    }
  });

  // Convert to array and sort by date
  return Array.from(dataByPeriod.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get species breakdown with detailed metrics
 */
export async function getSpeciesBreakdown(tenantId: string): Promise<SpeciesBreakdown[]> {
  const allAnimals = await db.select().from(animals).where(eq(animals.tenantId, tenantId));

  const speciesMap = new Map<string, SpeciesBreakdown>();

  allAnimals.forEach((animal) => {
    const species = animal.species || "Unknown";
    if (!speciesMap.has(species)) {
      speciesMap.set(species, {
        species,
        total: 0,
        adopted: 0,
        available: 0,
        averageDaysToAdoption: 0,
      });
    }

    const data = speciesMap.get(species)!;
    data.total++;

    if (animal.status === "adopted") {
      data.adopted++;
    } else if (animal.status === "available") {
      data.available++;
    }
  });

  // Calculate average days to adoption per species
  const result: SpeciesBreakdown[] = [];
  const speciesEntries = Array.from(speciesMap.entries());
  for (const [species, data] of speciesEntries) {
    const speciesAnimals = allAnimals.filter(
      (a) => (a.species || "Unknown") === species && a.status === "adopted" && a.adoptionDate
    );

    const daysToAdoptionArray = speciesAnimals
      .map((a) => {
        if (!a.adoptionDate) return null;
        const days = Math.floor(
          (a.adoptionDate.getTime() - a.intakeDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        return days;
      })
      .filter((d): d is number => d !== null && d >= 0);

    const averageDaysToAdoption =
      daysToAdoptionArray.length > 0
        ? Math.round(daysToAdoptionArray.reduce((a, b) => a + b, 0) / daysToAdoptionArray.length)
        : 0;

    result.push({
      ...data,
      averageDaysToAdoption,
    });
  }

  return result.sort((a, b) => b.total - a.total);
}

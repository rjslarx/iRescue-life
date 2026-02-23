import { db } from '../db';
import { preventativeCareTypes } from '@shared/schema';
import { eq, and, isNull } from 'drizzle-orm';

const PLATFORM_DEFAULT_PROTOCOLS = [
  {
    name: "Simparica",
    category: "parasite_prevention" as const,
    targetSpecies: "Dog" as const,
    isCore: false,
    defaultIntervalDays: 30,
    coversHeartworm: false,
    coversFleaTick: true,
    description: "Monthly oral flea and tick prevention",
    sortOrder: 10,
  },
  {
    name: "Simparica Trio",
    category: "parasite_prevention" as const,
    targetSpecies: "Dog" as const,
    isCore: true,
    defaultIntervalDays: 30,
    coversHeartworm: true,
    coversFleaTick: true,
    description: "Monthly oral heartworm, flea, and tick prevention (combination)",
    sortOrder: 11,
  },
  {
    name: "NexGard",
    category: "parasite_prevention" as const,
    targetSpecies: "Dog" as const,
    isCore: false,
    defaultIntervalDays: 30,
    coversHeartworm: false,
    coversFleaTick: true,
    description: "Monthly oral flea and tick prevention",
    sortOrder: 12,
  },
  {
    name: "Heartgard Plus",
    category: "parasite_prevention" as const,
    targetSpecies: "Dog" as const,
    isCore: true,
    defaultIntervalDays: 30,
    coversHeartworm: true,
    coversFleaTick: false,
    description: "Monthly oral heartworm prevention",
    sortOrder: 13,
  },
  {
    name: "ProHeart 6",
    category: "parasite_prevention" as const,
    targetSpecies: "Dog" as const,
    isCore: false,
    defaultIntervalDays: 180,
    coversHeartworm: true,
    coversFleaTick: false,
    description: "6-month injectable heartworm prevention",
    sortOrder: 14,
  },
  {
    name: "ProHeart 12",
    category: "parasite_prevention" as const,
    targetSpecies: "Dog" as const,
    isCore: false,
    defaultIntervalDays: 365,
    coversHeartworm: true,
    coversFleaTick: false,
    description: "12-month injectable heartworm prevention",
    sortOrder: 15,
  },
  {
    name: "Revolution Plus",
    category: "parasite_prevention" as const,
    targetSpecies: "Cat" as const,
    isCore: true,
    defaultIntervalDays: 30,
    coversHeartworm: true,
    coversFleaTick: true,
    description: "Monthly topical heartworm, flea, and tick prevention for cats",
    sortOrder: 20,
  },
  {
    name: "Bravecto",
    category: "parasite_prevention" as const,
    targetSpecies: "Both" as const,
    isCore: false,
    defaultIntervalDays: 90,
    coversHeartworm: false,
    coversFleaTick: true,
    description: "3-month oral flea and tick prevention",
    sortOrder: 21,
  },
];

export async function seedPlatformPreventativeProtocols() {
  try {
    let inserted = 0;

    for (const protocol of PLATFORM_DEFAULT_PROTOCOLS) {
      const existing = await db
        .select({ id: preventativeCareTypes.id })
        .from(preventativeCareTypes)
        .where(and(
          isNull(preventativeCareTypes.tenantId),
          eq(preventativeCareTypes.name, protocol.name)
        ))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(preventativeCareTypes).values({
          tenantId: null,
          ...protocol,
          isActive: true,
        });
        inserted++;
      }
    }

    if (inserted > 0) {
      console.log(`[PreventativeProtocols] Seeded ${inserted} platform default protocol(s)`);
    }

    // Backfill coverage flags on pre-existing generic types
    const COVERAGE_BACKFILL = [
      { name: 'Heartworm Prevention', coversHeartworm: true, coversFleaTick: false },
      { name: 'Flea & Tick Prevention', coversHeartworm: false, coversFleaTick: true },
    ];

    for (const entry of COVERAGE_BACKFILL) {
      await db
        .update(preventativeCareTypes)
        .set({ coversHeartworm: entry.coversHeartworm, coversFleaTick: entry.coversFleaTick })
        .where(and(
          isNull(preventativeCareTypes.tenantId),
          eq(preventativeCareTypes.name, entry.name),
          eq(preventativeCareTypes.coversHeartworm, false),
          eq(preventativeCareTypes.coversFleaTick, false),
        ));
    }
  } catch (error) {
    console.error('[PreventativeProtocols] Seeding failed:', error);
  }
}

import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { and, desc, eq, sql, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  expenseCampaigns,
  campaignMatchPools,
  donations,
  tenants,
  auditLogs,
} from "@shared/schema";
import { calculateMatch, publicSponsorLabel, computeEffectiveMatchStatus } from "@shared/expense-campaign-match";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

// Campaign-edit permission gate.
// Mirrors the task spec requirement: "All staff actions are permission-gated
// (campaign-edit role)." Tenant-admins, owners, and board members are the
// roles authorized to create / edit / configure expense campaigns + match
// pools. Staff have read-only access to reconciliation reports. Deletion is
// reserved for tenant owners/admins.
const requireCampaignEdit = requireRole("admin", "owner", "board_member");
const requireCampaignView = requireRole("admin", "owner", "board_member", "staff");
const requireCampaignDelete = requireRole("admin", "owner");

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "campaign";
}

const matchPoolSchema = z
  .object({
    publicSponsorName: z.string().max(200).nullable().optional(),
    showSponsorPublicly: z.boolean().default(true),
    internalSponsorName: z.string().min(1).max(200),
    internalSponsorEmail: z.string().email().max(200),
    pledgedCapCents: z.number().int().min(100),
    ratioNumerator: z.number().int().min(1).max(10).default(1),
    ratioDenominator: z.number().int().min(1).max(10).default(1),
    perGiftCapCents: z.number().int().min(0).nullable().optional(),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
  })
  .nullable();

const upsertCampaignSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().max(80).optional(),
  shortDescription: z.string().max(500).nullable().optional(),
  longDescription: z.string().max(20000).nullable().optional(),
  heroImageUrl: z.string().max(1000).nullable().optional(),
  goalAmountCents: z.number().int().min(100),
  endDate: z.string().datetime().nullable().optional(),
  status: z.enum(["active", "ended", "archived"]).default("active"),
  matchPool: matchPoolSchema.optional(),
});

// Task #213 — audit-log helper for campaign + match-pool config changes.
// Skips silently if the request has no authenticated user (defensive — every
// admin route is wrapped in requireAuth, so this should never happen).
async function logCampaignAudit(
  req: Request,
  action: "expense_campaign.create" | "expense_campaign.update" | "expense_campaign.delete" |
          "campaign_match_pool.create" | "campaign_match_pool.update" | "campaign_match_pool.delete",
  entityId: string,
  changes?: { before?: Record<string, any>; after?: Record<string, any> },
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) return;
  try {
    await db.insert(auditLogs).values({
      userId,
      tenantId: req.tenant?.id ?? null,
      action,
      entityType: action.startsWith("expense_campaign") ? "expense_campaign" : "campaign_match_pool",
      entityId,
      changes: changes ?? null,
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
  } catch (err) {
    console.error("[expense-campaign audit-log] failed:", err);
  }
}

async function ensureUniqueSlug(tenantId: string, base: string, excludeId?: string): Promise<string> {
  let candidate = base;
  let n = 1;
  while (true) {
    const rows = await db
      .select({ id: expenseCampaigns.id })
      .from(expenseCampaigns)
      .where(and(eq(expenseCampaigns.tenantId, tenantId), eq(expenseCampaigns.slug, candidate)))
      .limit(1);
    const conflict = rows[0];
    if (!conflict || conflict.id === excludeId) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

// ---------------------------------------------------------------------------
// Admin / staff CRUD
// ---------------------------------------------------------------------------

router.get(
  "/",
  requireAuth,
  requireCampaignView,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant!.id;
      const rows = await db
        .select()
        .from(expenseCampaigns)
        .where(eq(expenseCampaigns.tenantId, tenantId))
        .orderBy(desc(expenseCampaigns.createdAt));

      const ids = rows.map((r) => r.id);
      const pools = ids.length
        ? await db
            .select()
            .from(campaignMatchPools)
            .where(
              and(
                eq(campaignMatchPools.tenantId, tenantId),
                inArray(campaignMatchPools.expenseCampaignId, ids),
              ),
            )
        : [];
      const poolByCampaign = new Map(pools.map((p) => [p.expenseCampaignId, p]));

      res.json({
        campaigns: rows.map((c) => ({
          ...c,
          matchPool: poolByCampaign.get(c.id) ?? null,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/",
  requireAuth,
  requireCampaignEdit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant!.id;
      const data = upsertCampaignSchema.parse(req.body);
      const slug = await ensureUniqueSlug(tenantId, slugify(data.slug || data.title));

      const [campaign] = await db
        .insert(expenseCampaigns)
        .values({
          tenantId,
          title: data.title,
          slug,
          shortDescription: data.shortDescription ?? null,
          longDescription: data.longDescription ?? null,
          heroImageUrl: data.heroImageUrl ?? null,
          goalAmountCents: data.goalAmountCents,
          endDate: data.endDate ? new Date(data.endDate) : null,
          status: data.status,
          createdByUserId: req.user?.id ?? null,
        })
        .returning();

      await logCampaignAudit(req, "expense_campaign.create", campaign.id, { after: campaign });

      let pool = null;
      if (data.matchPool) {
        const mp = data.matchPool;
        const [created] = await db
          .insert(campaignMatchPools)
          .values({
            tenantId,
            expenseCampaignId: campaign.id,
            publicSponsorName: mp.publicSponsorName ?? null,
            showSponsorPublicly: mp.showSponsorPublicly,
            internalSponsorName: mp.internalSponsorName,
            internalSponsorEmail: mp.internalSponsorEmail,
            pledgedCapCents: mp.pledgedCapCents,
            ratioNumerator: mp.ratioNumerator,
            ratioDenominator: mp.ratioDenominator,
            perGiftCapCents: mp.perGiftCapCents ?? null,
            startsAt: mp.startsAt ? new Date(mp.startsAt) : null,
            endsAt: mp.endsAt ? new Date(mp.endsAt) : null,
          })
          .returning();
        pool = created;
        await logCampaignAudit(req, "campaign_match_pool.create", created.id, { after: created });
      }

      res.status(201).json({ campaign: { ...campaign, matchPool: pool } });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/:id",
  requireAuth,
  requireCampaignEdit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant!.id;
      const { id } = req.params;
      const data = upsertCampaignSchema.partial().parse(req.body);

      const existing = await db
        .select()
        .from(expenseCampaigns)
        .where(and(eq(expenseCampaigns.id, id), eq(expenseCampaigns.tenantId, tenantId)))
        .limit(1)
        .then((r) => r[0]);
      if (!existing) return res.status(404).json({ error: "Campaign not found" });

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (data.title !== undefined) updates.title = data.title;
      if (data.shortDescription !== undefined) updates.shortDescription = data.shortDescription;
      if (data.longDescription !== undefined) updates.longDescription = data.longDescription;
      if (data.heroImageUrl !== undefined) updates.heroImageUrl = data.heroImageUrl;
      if (data.goalAmountCents !== undefined) updates.goalAmountCents = data.goalAmountCents;
      if (data.endDate !== undefined)
        updates.endDate = data.endDate ? new Date(data.endDate) : null;
      if (data.status !== undefined) updates.status = data.status;
      if (data.slug !== undefined) {
        updates.slug = await ensureUniqueSlug(tenantId, slugify(data.slug), id);
      }

      const [campaign] = await db
        .update(expenseCampaigns)
        .set(updates)
        .where(and(eq(expenseCampaigns.id, id), eq(expenseCampaigns.tenantId, tenantId)))
        .returning();

      await logCampaignAudit(req, "expense_campaign.update", id, { before: existing, after: campaign });

      // Match pool: explicit null clears, undefined leaves alone, object upserts.
      // Every query is tenant-scoped to prevent cross-tenant data mixing.
      type CampaignMatchPool = typeof campaignMatchPools.$inferSelect;
      let pool: CampaignMatchPool | null = null;
      if (data.matchPool === null) {
        const removed = await db
          .delete(campaignMatchPools)
          .where(
            and(
              eq(campaignMatchPools.expenseCampaignId, id),
              eq(campaignMatchPools.tenantId, tenantId),
            ),
          )
          .returning();
        for (const row of removed) {
          await logCampaignAudit(req, "campaign_match_pool.delete", row.id, { before: row });
        }
      } else if (data.matchPool) {
        const mp = data.matchPool;
        const fields = {
          publicSponsorName: mp.publicSponsorName ?? null,
          showSponsorPublicly: mp.showSponsorPublicly,
          internalSponsorName: mp.internalSponsorName,
          internalSponsorEmail: mp.internalSponsorEmail,
          pledgedCapCents: mp.pledgedCapCents,
          ratioNumerator: mp.ratioNumerator,
          ratioDenominator: mp.ratioDenominator,
          perGiftCapCents: mp.perGiftCapCents ?? null,
          startsAt: mp.startsAt ? new Date(mp.startsAt) : null,
          endsAt: mp.endsAt ? new Date(mp.endsAt) : null,
          updatedAt: new Date(),
        };
        const existingPool = await db
          .select({ id: campaignMatchPools.id })
          .from(campaignMatchPools)
          .where(
            and(
              eq(campaignMatchPools.expenseCampaignId, id),
              eq(campaignMatchPools.tenantId, tenantId),
            ),
          )
          .limit(1)
          .then((r) => r[0]);
        if (existingPool) {
          [pool] = await db
            .update(campaignMatchPools)
            .set(fields)
            .where(
              and(
                eq(campaignMatchPools.id, existingPool.id),
                eq(campaignMatchPools.tenantId, tenantId),
              ),
            )
            .returning();
          await logCampaignAudit(req, "campaign_match_pool.update", existingPool.id, { after: pool });
        } else {
          [pool] = await db
            .insert(campaignMatchPools)
            .values({ ...fields, tenantId, expenseCampaignId: id })
            .returning();
          await logCampaignAudit(req, "campaign_match_pool.create", pool.id, { after: pool });
        }
      } else {
        pool = await db
          .select()
          .from(campaignMatchPools)
          .where(
            and(
              eq(campaignMatchPools.expenseCampaignId, id),
              eq(campaignMatchPools.tenantId, tenantId),
            ),
          )
          .limit(1)
          .then((r) => r[0] ?? null);
      }

      res.json({ campaign: { ...campaign, matchPool: pool } });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/:id",
  requireAuth,
  requireCampaignDelete,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant!.id;
      const { id } = req.params;

      // Guardrail: preserve donor + finance history. If any donation has ever
      // been credited to this campaign we refuse a hard delete and steer the
      // caller toward archiving. (The schema's ON DELETE SET NULL on
      // donations.expense_campaign_id would otherwise erase attribution.)
      const linked = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(donations)
        .where(
          and(eq(donations.tenantId, tenantId), eq(donations.expenseCampaignId, id)),
        );
      const donationCount = linked[0]?.count ?? 0;
      if (donationCount > 0) {
        return res.status(409).json({
          error: "Cannot delete a campaign that has donations on it.",
          hint: "Archive the campaign instead to preserve donor + finance history.",
          donationCount,
        });
      }

      const removed = await db
        .delete(expenseCampaigns)
        .where(and(eq(expenseCampaigns.id, id), eq(expenseCampaigns.tenantId, tenantId)))
        .returning();
      for (const row of removed) {
        await logCampaignAudit(req, "expense_campaign.delete", row.id, { before: row });
      }
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Finance roll-up: all expense campaigns + match totals for the Finance page
// ---------------------------------------------------------------------------

router.get(
  "/finance-rollup",
  requireAuth,
  requireCampaignView,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant!.id;
      const campaignRows = await db
        .select()
        .from(expenseCampaigns)
        .where(eq(expenseCampaigns.tenantId, tenantId))
        .orderBy(desc(expenseCampaigns.createdAt));

      const ids = campaignRows.map((c) => c.id);
      const pools = ids.length
        ? await db
            .select()
            .from(campaignMatchPools)
            .where(eq(campaignMatchPools.tenantId, tenantId))
        : [];
      const poolByCampaign = new Map(pools.map((p) => [p.expenseCampaignId, p]));

      const rows = campaignRows.map((c) => {
        const pool = poolByCampaign.get(c.id);
        const matched = pool?.totalMatchedCents ?? 0;
        return {
          id: c.id,
          title: c.title,
          slug: c.slug,
          status: c.status,
          goalAmountCents: c.goalAmountCents,
          raisedAmountCents: c.raisedAmountCents,
          matchedAmountCents: matched,
          totalImpactCents: c.raisedAmountCents + matched,
          hasMatchPool: !!pool,
          sponsorLabel: pool ? publicSponsorLabel(pool.publicSponsorName, pool.showSponsorPublicly) : null,
        };
      });

      const totals = rows.reduce(
        (acc, r) => ({
          raisedCents: acc.raisedCents + r.raisedAmountCents,
          matchedCents: acc.matchedCents + r.matchedAmountCents,
          totalImpactCents: acc.totalImpactCents + r.totalImpactCents,
        }),
        { raisedCents: 0, matchedCents: 0, totalImpactCents: 0 },
      );

      res.json({ campaigns: rows, totals });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Reconciliation: per-donation table + summary for a single campaign
// ---------------------------------------------------------------------------

router.get(
  "/:id/reconciliation",
  requireAuth,
  requireCampaignView,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant!.id;
      const { id } = req.params;

      const campaign = await db
        .select()
        .from(expenseCampaigns)
        .where(and(eq(expenseCampaigns.id, id), eq(expenseCampaigns.tenantId, tenantId)))
        .limit(1)
        .then((r) => r[0]);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });

      const pool = await db
        .select()
        .from(campaignMatchPools)
        .where(
          and(
            eq(campaignMatchPools.expenseCampaignId, id),
            eq(campaignMatchPools.tenantId, tenantId),
          ),
        )
        .limit(1)
        .then((r) => r[0] ?? null);

      const rows = await db
        .select({
          id: donations.id,
          date: donations.date,
          donorName: donations.donorName,
          donorEmail: donations.donorEmail,
          amount: donations.amount,
          matchedAmountCents: donations.matchedAmountCents,
        })
        .from(donations)
        .where(and(eq(donations.tenantId, tenantId), eq(donations.expenseCampaignId, id)))
        .orderBy(desc(donations.date));

      res.json({
        campaign,
        matchPool: pool,
        donations: rows,
        summary: {
          totalDonations: rows.length,
          totalRaisedCents: rows.reduce((sum, r) => sum + (r.amount ?? 0), 0),
          totalMatchedCents: rows.reduce((sum, r) => sum + (r.matchedAmountCents ?? 0), 0),
          remainingPoolCents: pool ? Math.max(0, pool.pledgedCapCents - pool.totalMatchedCents) : 0,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// Sponsor invoice PDF (lazy-generated each request)
router.get(
  "/:id/sponsor-invoice.pdf",
  requireAuth,
  requireCampaignView,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant!.id;
      const { id } = req.params;

      const campaign = await db
        .select()
        .from(expenseCampaigns)
        .where(and(eq(expenseCampaigns.id, id), eq(expenseCampaigns.tenantId, tenantId)))
        .limit(1)
        .then((r) => r[0]);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const pool = await db
        .select()
        .from(campaignMatchPools)
        .where(
          and(
            eq(campaignMatchPools.expenseCampaignId, id),
            eq(campaignMatchPools.tenantId, tenantId),
          ),
        )
        .limit(1)
        .then((r) => r[0] ?? null);
      if (!pool) return res.status(400).json({ error: "No match pool configured" });

      const rows = await db
        .select({
          date: donations.date,
          donorName: donations.donorName,
          amount: donations.amount,
          matchedAmountCents: donations.matchedAmountCents,
        })
        .from(donations)
        .where(
          and(
            eq(donations.tenantId, tenantId),
            eq(donations.expenseCampaignId, id),
            sql`${donations.matchedAmountCents} > 0`,
          ),
        )
        .orderBy(desc(donations.date));

      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);

      const { generateSponsorInvoicePdf } = await import("../services/sponsor-invoice-pdf");
      const pdf = await generateSponsorInvoicePdf({
        tenantName: tenant?.name ?? "Animal Rescue",
        tenantEin: tenant?.ein ?? null,
        campaign,
        pool,
        donations: rows,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="sponsor-invoice-${campaign.slug}.pdf"`,
      );
      res.send(pdf);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Public endpoints (no auth)
// ---------------------------------------------------------------------------

export const publicRouter = Router();

publicRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;
    const rows = await db
      .select()
      .from(expenseCampaigns)
      .where(and(eq(expenseCampaigns.tenantId, tenantId), eq(expenseCampaigns.status, "active")))
      .orderBy(desc(expenseCampaigns.createdAt));
    res.json({
      campaigns: rows.map((c) => ({
        id: c.id,
        slug: c.slug,
        title: c.title,
        shortDescription: c.shortDescription,
        heroImageUrl: c.heroImageUrl,
        goalAmountCents: c.goalAmountCents,
        raisedAmountCents: c.raisedAmountCents,
      })),
    });
  } catch (err) {
    next(err);
  }
});

publicRouter.get("/:slug", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;
    const { slug } = req.params;

    const campaign = await db
      .select()
      .from(expenseCampaigns)
      .where(and(eq(expenseCampaigns.tenantId, tenantId), eq(expenseCampaigns.slug, slug)))
      .limit(1)
      .then((r) => r[0]);
    if (!campaign || campaign.status === "archived") {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const pool = await db
      .select()
      .from(campaignMatchPools)
      .where(
        and(
          eq(campaignMatchPools.expenseCampaignId, campaign.id),
          eq(campaignMatchPools.tenantId, tenantId),
        ),
      )
      .limit(1)
      .then((r) => r[0] ?? null);

    const publicPool = pool
      ? {
          sponsorLabel: publicSponsorLabel(pool.publicSponsorName, pool.showSponsorPublicly),
          pledgedCapCents: pool.pledgedCapCents,
          totalMatchedCents: pool.totalMatchedCents,
          remainingCents: Math.max(0, pool.pledgedCapCents - pool.totalMatchedCents),
          ratioNumerator: pool.ratioNumerator,
          ratioDenominator: pool.ratioDenominator,
          perGiftCapCents: pool.perGiftCapCents,
          // Persisted status — kept for backward compat.
          status: pool.status,
          // Time-window-aware status used by the public landing page banners.
          effectiveStatus: computeEffectiveMatchStatus(pool),
          startsAt: pool.startsAt,
          endsAt: pool.endsAt,
        }
      : null;

    // Goal met = donor cash alone covers the goal. The sponsor match is a
    // bonus on top, so the thank-you state only fires once donors have
    // collectively given the full goal amount. This keeps the "Goal met!"
    // banner in lockstep with the progress bar, which also tracks donor cash.
    const totalImpactCents =
      campaign.raisedAmountCents + (pool ? pool.totalMatchedCents : 0);
    const goalMet = campaign.raisedAmountCents >= campaign.goalAmountCents;

    res.json({
      campaign: {
        id: campaign.id,
        slug: campaign.slug,
        title: campaign.title,
        shortDescription: campaign.shortDescription,
        longDescription: campaign.longDescription,
        heroImageUrl: campaign.heroImageUrl,
        goalAmountCents: campaign.goalAmountCents,
        raisedAmountCents: campaign.raisedAmountCents,
        endDate: campaign.endDate,
        status: campaign.status,
        totalImpactCents,
        goalMet,
      },
      matchPool: publicPool,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Public checkout (Stripe) for an expense campaign
// ---------------------------------------------------------------------------

publicRouter.post("/:id/checkout", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;
    const { id } = req.params;
    const schema = z.object({
      amountCents: z.number().int().min(100),
    });
    const { amountCents } = schema.parse(req.body);

    const campaign = await db
      .select()
      .from(expenseCampaigns)
      .where(
        and(
          eq(expenseCampaigns.id, id),
          eq(expenseCampaigns.tenantId, tenantId),
          eq(expenseCampaigns.status, "active"),
        ),
      )
      .limit(1)
      .then((r) => r[0]);
    if (!campaign) return res.status(404).json({ error: "Campaign not found or inactive" });

    const [tenant] = await db
      .select({
        stripeConnectedAccountId: tenants.stripeConnectedAccountId,
        subdomain: tenants.subdomain,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!tenant?.stripeConnectedAccountId) {
      return res.status(400).json({ error: "Stripe Connect not configured for this rescue." });
    }

    const Stripe = (await import("stripe")).default;
    const stripeSecretKey = process.env.PLATFORM_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) return res.status(500).json({ error: "Stripe not configured" });
    const stripe = new Stripe(stripeSecretKey);

    const origin = `${req.protocol}://${req.get("host")}`;
    const usePrefix = tenant.subdomain && !req.hostname.includes(tenant.subdomain);
    const slugPath = usePrefix ? `/${tenant.subdomain}/expense-campaign/${campaign.slug}` : `/expense-campaign/${campaign.slug}`;

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amountCents,
              product_data: {
                name: `Donation: ${campaign.title}`,
                description: campaign.shortDescription || undefined,
              },
            },
            quantity: 1,
          },
        ],
        success_url: `${origin}${slugPath}?thanks=1`,
        cancel_url: `${origin}${slugPath}`,
        metadata: {
          expenseCampaignId: campaign.id,
          expenseCampaignTitle: campaign.title.slice(0, 200),
          baseAmount: String(amountCents),
        },
      },
      { stripeAccount: tenant.stripeConnectedAccountId },
    );

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

export default router;

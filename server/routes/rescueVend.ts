import { Router } from "express";
import type Stripe from "stripe";
import rateLimit from "express-rate-limit";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { tenants } from "@shared/schema";
import { vendingMenuItems, vendingMenuSchema, vendingCheckoutSchema, vendingCart, verifiedVendingSession, vendingMachineTitle } from "@shared/rescue-vend";
import { getVendingMenu, saveVendingMenu } from "../services/rescue-vend-menu";
import { requireAuth, requireRole } from "../middleware/auth";
import { stripeService } from "../lib/stripe-service";
import { calculatePlatformFee, getPlatformFeePercent } from "../config/platform";
import { getAppBaseUrl } from "../lib/app-base-url";

const router = Router();
const checkoutLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false });
const statusLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });

router.use("/settings", requireAuth, requireRole("owner", "admin"), (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.user?.tenantId !== req.tenant?.id) return res.status(403).json({ error: "Rescue access denied" });
  next();
});
router.get("/settings", async (req, res, next) => {
  try {
    const menu = await getVendingMenu(req.tenant!.id);
    // Older open tabs validate this response strictly and do not know the new flag.
    const { showInNavigation, ...legacyMenu } = menu;
    res.json(req.query.navigation === "1" ? menu : legacyMenu);
  }
  catch (error) { next(error); }
});
router.put("/settings", async (req, res, next) => {
  const parsed = vendingMenuSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Check the machine style, one- or two-word rescue name, and all eight supplies with whole-cent amounts from $1 to $1,000." });
  try {
    const menu = await saveVendingMenu(req.tenant!.id, parsed.data, !Object.prototype.hasOwnProperty.call(req.body, "showInNavigation"));
    if (!menu) return res.status(409).json({ error: "The menu changed since you opened it. Reload the latest menu before saving." });
    const { showInNavigation, ...legacyMenu } = menu;
    res.json(req.query.navigation === "1" ? menu : legacyMenu);
  } catch (error) { next(error); }
});

async function getTenant(id: string) {
  return (await db.select().from(tenants).where(eq(tenants.id, id)).limit(1))[0];
}

router.get("/navigation", async (req, res, next) => {
  try {
    const menu = await getVendingMenu(req.tenant!.id);
    res.setHeader("Cache-Control", "no-store");
    res.json({ showInNavigation: menu.showInNavigation });
  } catch (error) { next(error); }
});

router.get("/", async (req, res, next) => {
  try {
    const tenant = await getTenant(req.tenant!.id);
    if (!tenant) return res.status(404).json({ error: "Rescue not found" });
    const menu = await getVendingMenu(tenant.id);
    const items = vendingMenuItems(menu).filter(item => item.enabled);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      rescueName: tenant.name,
      machineStyle: menu.machineStyle,
      machineTitle: vendingMachineTitle(tenant.name, menu.shortName),
      items,
      version: menu.version,
      available: Boolean(items.length && tenant.stripeEnabled && tenant.stripeConnectedAccountId && stripeService.getPlatformStripeClient()),
    });
  } catch (error) { next(error); }
});

router.post("/checkout", checkoutLimiter, async (req, res, next) => {
  try {
    const tenant = await getTenant(req.tenant!.id);
    if (!tenant) return res.status(404).json({ error: "Rescue not found" });
    const menu = await getVendingMenu(tenant.id);
    let cart: ReturnType<typeof vendingCart>;
    try {
      const selection = vendingCheckoutSchema.parse(req.body);
      if ((selection.catalogVersion ?? "1") !== menu.version) {
        return res.status(409).json({ error: "The supplies or donation amounts changed. Refresh this page and review your selection." });
      }
      cart = vendingCart(selection, menu);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid selection" });
    }
    // Connect is required so both the platform fee and processing recovery are
    // deducted from this gift, never billed on top or paid by the platform.
    if (!tenant?.stripeEnabled || !tenant.stripeConnectedAccountId) {
      return res.status(400).json({ error: "This rescue must complete Stripe Connect setup before accepting vending donations." });
    }
    const fee = calculatePlatformFee(cart.totalCents, tenant.subscriptionTier || "free", tenant.platformFeePercent);
    const production = process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
    const customDomain = production && tenant.customDomainVerified && tenant.customDomain;
    const base = customDomain ? `https://${customDomain}` : getAppBaseUrl();
    const path = customDomain ? "/rescue-vend" : `/${tenant.subdomain}/rescue-vend`;
    const selection = cart.items.map(({ id, quantity }) => ({ id, quantity }));
    const session = await stripeService.createCheckoutSession(tenant, {
      amount: cart.totalCents,
      currency: "usd",
      isRecurring: false,
      forceCardOnly: true,
      surface: "donation",
      collectEmail: true,
      connectedAccountId: tenant.stripeConnectedAccountId,
      platformFeeAmount: fee,
      idempotencyKey: cart.checkoutKey ? `rescue-vend:${tenant.id}:${menu.version}:${cart.checkoutKey}` : undefined,
      productName: `Virtual supply donation to ${tenant.name}`,
      productDescription: `${cart.items.map(item => `${item.quantity} × ${item.name}`).join(", ")}. Symbolic donation; no physical goods. Fees deducted from donation.`,
      successUrl: `${base}${path}?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}${path}?cancelled=1`,
      metadata: {
        type: "rescue_vend",
        vendingCatalogVersion: menu.version,
        vendingItems: JSON.stringify(selection),
        message: `Virtual vending donation: ${cart.items.map(item => `${item.quantity} x ${item.name}`).join(", ")}`.slice(0, 500),
        baseAmount: String(cart.totalCents),
        chargeAmount: String(cart.totalCents),
        donorCoveredFees: "false",
        feesCovered: "0",
        platformFeeAmount: String(fee),
        platformFeePercent: String(getPlatformFeePercent(tenant.subscriptionTier || "free", tenant.platformFeePercent)),
        platformFeeCollected: String(fee > 0),
      },
    });
    if (!session?.url) throw new Error("Stripe checkout is unavailable");
    res.json({ url: session.url });
  } catch (error) { next(error); }
});

router.get("/session", statusLimiter, async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const id = req.query.session_id;
  if (typeof id !== "string" || !/^cs_[a-zA-Z0-9_]{10,250}$/.test(id)) {
    return res.status(400).json({ error: "Invalid checkout session" });
  }
  try {
    const tenant = await getTenant(req.tenant!.id);
    if (!tenant) return res.status(404).json({ error: "Rescue not found" });
    const result: { session?: Stripe.Checkout.Session } = {};
    const context = await stripeService.resolveStripeContext(tenant, async (stripe, options) => {
      result.session = await stripe.checkout.sessions.retrieve(id, options);
    });
    const session = result.session;
    if (!context || !session) return res.status(404).json({ error: "Donation not found" });
    try {
      // No donor identity, email, customer ID or payment details in public response.
      if (session.metadata?.tenantId !== tenant.id || session.metadata?.type !== "rescue_vend" ||
          !session.metadata?.vendingCatalogVersion) throw new Error("Invalid donation");
      const menu = await getVendingMenu(tenant.id, session.metadata.vendingCatalogVersion);
      return res.json(verifiedVendingSession(session, tenant.id, menu));
    } catch {
      return res.status(404).json({ error: "Vending donation not found" });
    }
  } catch (error) { next(error); }
});

export default router;

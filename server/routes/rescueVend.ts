import { Router } from "express";
import rateLimit from "express-rate-limit";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { tenants } from "@shared/schema";
import { VENDING_ITEMS, VENDING_CATALOG_VERSION, vendingCart, verifiedVendingSession } from "@shared/rescue-vend";
import { stripeService } from "../lib/stripe-service";
import { calculatePlatformFee, getPlatformFeePercent } from "../config/platform";
import { getAppBaseUrl } from "../lib/app-base-url";

const router = Router();
const checkoutLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false });
const statusLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });

async function getTenant(id: string) {
  return (await db.select().from(tenants).where(eq(tenants.id, id)).limit(1))[0];
}

router.get("/", async (req, res, next) => {
  try {
    const tenant = await getTenant(req.tenant!.id);
    if (!tenant) return res.status(404).json({ error: "Rescue not found" });
    res.json({
      rescueName: tenant.name,
      items: VENDING_ITEMS,
      available: Boolean(tenant.stripeEnabled && tenant.stripeConnectedAccountId && stripeService.getPlatformStripeClient()),
    });
  } catch (error) { next(error); }
});

router.post("/checkout", checkoutLimiter, async (req, res, next) => {
  let cart: ReturnType<typeof vendingCart>;
  try { cart = vendingCart(req.body); }
  catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid selection" }); }
  try {
    const tenant = await getTenant(req.tenant!.id);
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
      idempotencyKey: cart.checkoutKey ? `rescue-vend:${tenant.id}:${cart.checkoutKey}` : undefined,
      productName: `Virtual supply donation to ${tenant.name}`,
      productDescription: `${cart.items.map(item => `${item.quantity} × ${item.name}`).join(", ")}. Symbolic donation; no physical goods. Fees deducted from donation.`,
      successUrl: `${base}${path}?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}${path}?cancelled=1`,
      metadata: {
        type: "rescue_vend",
        vendingCatalogVersion: VENDING_CATALOG_VERSION,
        vendingItems: JSON.stringify(selection),
        message: `Virtual vending donation: ${cart.items.map(item => `${item.quantity} x ${item.name}`).join(", ")}`,
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
    let session;
    const context = await stripeService.resolveStripeContext(tenant, async (stripe, options) => {
      session = await stripe.checkout.sessions.retrieve(id, options);
    });
    if (!context || !session) return res.status(404).json({ error: "Donation not found" });
    try {
      // No donor identity, email, customer ID or payment details in public response.
      return res.json(verifiedVendingSession(session, tenant.id));
    } catch {
      return res.status(404).json({ error: "Vending donation not found" });
    }
  } catch (error) { next(error); }
});

export default router;

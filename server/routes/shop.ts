import { Router } from 'express';
import { db } from '../db';
import { requireTenant } from '../middleware/tenant';
import { requireAuth, requireRole, requireRoleOrPageAccess } from '../middleware/auth';
import { toStripeStatementDescriptor, stripeService, getPlatformStripeKey } from '../lib/stripe-service';
import { 
  shopProducts, 
  shopProductVariants, 
  shopOrders, 
  shopOrderItems,
  shopRaffleDrawings,
  shopRaffleBonusTickets,
  insertShopProductSchema,
  insertShopProductVariantSchema,
  insertShopOrderSchema,
  insertShopOrderItemSchema,
} from '@shared/schema';
import { eq, and, desc, asc, sql, inArray } from 'drizzle-orm';
import { z } from 'zod';
import Stripe from 'stripe';
import { computeBundledPrice, computeCheckoutPaymentAmounts, computeSplitPotAmounts } from '@shared/raffle-pricing';
import { sendShopOrderConfirmationEmail } from '../lib/shop-emails';
import {
  refundClosedRafflePayment,
  ShopRaffleClosedError,
  transitionShopOrderToPaid,
} from '../lib/shop-order-payment';

const router = Router();

class ShopCheckoutError extends Error {}
class ShopProductNotFoundError extends Error {}
class ShopProductTermsLockedError extends Error {}

function isEvenCentAmount(value: string | number): boolean {
  const cents = Math.round(Number(value) * 100);
  return Number.isFinite(cents) && cents > 0 && cents % 2 === 0;
}

function validateSplitPotPricing(product: {
  raffleMode?: string | null;
  basePrice?: string | null;
  bundlePricing?: { quantity: number; price: string }[] | null;
}): string | null {
  if (product.raffleMode !== 'split_pot') return null;
  if (!product.basePrice || !isEvenCentAmount(product.basePrice)) {
    return 'Split-the-pot ticket prices must be positive and divisible evenly into two shares';
  }
  if ((product.bundlePricing || []).some((tier) => !isEvenCentAmount(tier.price))) {
    return 'Every split-the-pot bundle price must divide evenly into two shares';
  }
  return null;
}

function sameMoneyAmount(left: string | number | null | undefined, right: string | number | null | undefined): boolean {
  return Math.round(Number(left || 0) * 100) === Math.round(Number(right || 0) * 100);
}

function normalizedBundlePricing(value: { quantity: number; price: string }[] | null | undefined): string {
  return JSON.stringify(
    [...(value || [])]
      .map((tier) => ({ quantity: tier.quantity, price: Number(tier.price).toFixed(2) }))
      .sort((a, b) => a.quantity - b.quantity),
  );
}

async function loadPaidRaffleSales(
  productIds: string[],
  executor: Pick<typeof db, 'select'> = db,
): Promise<Map<string, string>> {
  if (productIds.length === 0) return new Map();
  const rows = await executor
    .select({
      productId: shopOrderItems.productId,
      amount: sql<string>`coalesce(sum((${shopOrderItems.totalPrice})::numeric), 0)::text`,
    })
    .from(shopOrderItems)
    .innerJoin(shopOrders, eq(shopOrderItems.orderId, shopOrders.id))
    .where(and(
      inArray(shopOrderItems.productId, productIds),
      eq(shopOrders.paymentStatus, 'paid'),
    ))
    .groupBy(shopOrderItems.productId);
  return new Map(rows.map((row) => [row.productId, row.amount]));
}

type PublicRaffleDrawing = {
  productId: string;
  drawnAt: Date | null;
  ticketSalesAmount: string | null;
  winnerPrizeAmount: string | null;
  rescueShareAmount: string | null;
};

async function loadPublicRaffleDrawings(productIds: string[]): Promise<Map<string, PublicRaffleDrawing>> {
  if (productIds.length === 0) return new Map();
  const rows = await db
    .select({
      productId: shopRaffleDrawings.productId,
      drawnAt: shopRaffleDrawings.drawnAt,
      ticketSalesAmount: shopRaffleDrawings.ticketSalesAmount,
      winnerPrizeAmount: shopRaffleDrawings.winnerPrizeAmount,
      rescueShareAmount: shopRaffleDrawings.rescueShareAmount,
    })
    .from(shopRaffleDrawings)
    .where(and(
      inArray(shopRaffleDrawings.productId, productIds),
      eq(shopRaffleDrawings.status, 'drawn'),
    ));
  return new Map(rows.map((row) => [row.productId, row]));
}

function publicSplitPotStats(
  product: typeof shopProducts.$inferSelect,
  salesByProduct: Map<string, string>,
  drawing?: PublicRaffleDrawing,
) {
  if (product.productType !== 'raffle' || product.raffleMode !== 'split_pot') return undefined;
  if (drawing?.winnerPrizeAmount && drawing.ticketSalesAmount && drawing.rescueShareAmount) {
    return {
      ticketSalesAmount: drawing.ticketSalesAmount,
      winnerPrizeAmount: drawing.winnerPrizeAmount,
      rescueShareAmount: drawing.rescueShareAmount,
      isDrawn: true,
      drawnAt: drawing.drawnAt,
    };
  }
  return {
    ...computeSplitPotAmounts(salesByProduct.get(product.id) || '0'),
    isDrawn: false,
    drawnAt: null,
  };
}

// ============================================================================
// Public Shop Routes (no authentication required)
// ============================================================================

/**
 * GET /api/shop/products
 * Get all active products for the public shop
 */
router.get('/products', requireTenant, async (req, res, next) => {
  try {
    const products = await db
      .select()
      .from(shopProducts)
      .where(
        and(
          eq(shopProducts.tenantId, req.tenant!.id),
          eq(shopProducts.status, 'active')
        )
      )
      .orderBy(desc(shopProducts.featured), asc(shopProducts.displayOrder), desc(shopProducts.createdAt));

    // Get variants for all products
    const productIds = products.map(p => p.id);
    let variants: typeof shopProductVariants.$inferSelect[] = [];
    
    if (productIds.length > 0) {
      variants = await db
        .select()
        .from(shopProductVariants)
        .where(
          and(
            eq(shopProductVariants.tenantId, req.tenant!.id),
            eq(shopProductVariants.isActive, true),
            inArray(shopProductVariants.productId, productIds)
          )
        )
        .orderBy(asc(shopProductVariants.displayOrder));
    }

    // Group variants by product
    const variantsByProduct = variants.reduce((acc, v) => {
      if (!acc[v.productId]) acc[v.productId] = [];
      acc[v.productId].push(v);
      return acc;
    }, {} as Record<string, typeof variants>);

    const salesByProduct = await loadPaidRaffleSales(
      products.filter((p) => p.productType === 'raffle' && p.raffleMode === 'split_pot').map((p) => p.id),
    );
    const drawingsByProduct = await loadPublicRaffleDrawings(
      products.filter((p) => p.productType === 'raffle').map((p) => p.id),
    );

    // Combine products with their variants and public split-pot total.
    const productsWithVariants = products.map(p => ({
      ...p,
      variants: variantsByProduct[p.id] || [],
      raffleClosed: drawingsByProduct.has(p.id),
      splitPot: publicSplitPotStats(p, salesByProduct, drawingsByProduct.get(p.id)),
    }));

    res.json({ products: productsWithVariants });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/shop/products/:slug
 * Get a single product by slug for the public shop
 */
router.get('/products/:slug', requireTenant, async (req, res, next) => {
  try {
    const [product] = await db
      .select()
      .from(shopProducts)
      .where(
        and(
          eq(shopProducts.tenantId, req.tenant!.id),
          eq(shopProducts.slug, req.params.slug),
          eq(shopProducts.status, 'active')
        )
      );

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Get variants
    const variants = await db
      .select()
      .from(shopProductVariants)
      .where(
        and(
          eq(shopProductVariants.productId, product.id),
          eq(shopProductVariants.isActive, true)
        )
      )
      .orderBy(asc(shopProductVariants.displayOrder));

    const salesByProduct = await loadPaidRaffleSales([product.id]);
    const drawingsByProduct = await loadPublicRaffleDrawings([product.id]);

    res.json({
      product: {
        ...product,
        variants,
        raffleClosed: drawingsByProduct.has(product.id),
        splitPot: publicSplitPotStats(product, salesByProduct, drawingsByProduct.get(product.id)),
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/shop/checkout
 * Create an order and a Stripe PaymentIntent
 */
router.post('/checkout', requireTenant, async (req, res, next) => {
  try {
    const checkoutSchema = z.object({
      items: z.array(z.object({
        productId: z.string().uuid(),
        variantId: z.string().uuid().optional(),
        quantity: z.number().int().positive(),
      })).min(1),
      customerEmail: z.string().email(),
      customerName: z.string().min(1),
      customerPhone: z.string().optional(),
      shippingAddress: z.object({
        line1: z.string().min(1),
        line2: z.string().optional(),
        city: z.string().min(1),
        state: z.string().min(1),
        postalCode: z.string().min(1),
        country: z.string().min(1).default('US'),
      }).optional(),
      customerNotes: z.string().optional(),
      paymentMethod: z.enum(['stripe']).default('stripe'),
    });

    const data = checkoutSchema.parse(req.body);
    const tenant = req.tenant!;

    // Check if Stripe is configured
    const stripeAvailable = tenant.stripeEnabled && (
      tenant.stripeSecretKeyEncrypted ||
      (tenant.stripeConnectedAccountId && getPlatformStripeKey())
    );

    if (!stripeAvailable) {
      return res.status(400).json({ error: 'Stripe payments are not configured for this organization' });
    }

    // Fetch products and calculate totals
    const productIds = [...new Set(data.items.map(i => i.productId))];
    const products = await db
      .select()
      .from(shopProducts)
      .where(
        and(
          eq(shopProducts.tenantId, tenant.id),
          eq(shopProducts.status, 'active'),
          inArray(shopProducts.id, productIds)
        )
      );

    const productMap = new Map(products.map(p => [p.id, p]));

    // Get variants if needed
    const variantIds = data.items.filter(i => i.variantId).map(i => i.variantId!);
    let variantMap = new Map<string, typeof shopProductVariants.$inferSelect>();
    
    if (variantIds.length > 0) {
      const variants = await db
        .select()
        .from(shopProductVariants)
        .where(inArray(shopProductVariants.id, variantIds));
      variantMap = new Map(variants.map(v => [v.id, v]));
    }

    // Validate items and calculate totals
    let subtotal = 0;
    let hasPhysicalProduct = false;
    const orderItems: {
      productId: string;
      variantId?: string;
      productName: string;
      variantName?: string;
      productType: 'physical' | 'digital' | 'raffle';
      quantity: number;
      unitPrice: string;
      totalPrice: string;
      raffleTicketNumbers?: string[];
    }[] = [];

    for (const item of data.items) {
      const product = productMap.get(item.productId);
      if (!product) {
        return res.status(400).json({ error: `Product not found: ${item.productId}` });
      }

      // Check max per order
      if (product.maxPerOrder && item.quantity > product.maxPerOrder) {
        return res.status(400).json({ 
          error: `Maximum ${product.maxPerOrder} allowed per order for ${product.name}` 
        });
      }

      // Calculate unit price
      let unitPrice = parseFloat(product.basePrice);
      let variantName: string | undefined;

      if (item.variantId) {
        const variant = variantMap.get(item.variantId);
        if (!variant || variant.productId !== product.id) {
          return res.status(400).json({ error: `Invalid variant for product ${product.name}` });
        }
        unitPrice += parseFloat(variant.priceAdjustment);
        variantName = variant.name;

        // Check variant inventory
        if (product.trackInventory && variant.inventory < item.quantity) {
          return res.status(400).json({ 
            error: `Not enough inventory for ${product.name} - ${variant.name}` 
          });
        }
      }

      // Apply bundle (bulk-discount) pricing when configured — the server is
      // authoritative: it computes the cheapest combination of bundles +
      // singles for the requested quantity (e.g. 5 for $20, 15 for $50).
      let itemTotal = unitPrice * item.quantity;
      if (
        product.productType === 'raffle' &&
        !item.variantId &&
        product.bundlePricing &&
        product.bundlePricing.length > 0
      ) {
        itemTotal = computeBundledPrice(item.quantity, product.basePrice, product.bundlePricing);
      }
      subtotal += itemTotal;

      if (product.productType === 'physical') {
        hasPhysicalProduct = true;
      }

      orderItems.push({
        productId: product.id,
        variantId: item.variantId,
        productName: product.name,
        variantName,
        productType: product.productType,
        quantity: item.quantity,
        // Effective per-unit price so "qty x unitPrice" matches the (possibly
        // bundle-discounted) total on receipts and order views.
        unitPrice: (itemTotal / item.quantity).toFixed(2),
        totalPrice: itemTotal.toFixed(2),
      });
    }

    // Require shipping address for physical products
    if (hasPhysicalProduct && !data.shippingAddress) {
      return res.status(400).json({ error: 'Shipping address is required for physical products' });
    }

    // Generate order number
    const orderCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(shopOrders)
      .where(eq(shopOrders.tenantId, tenant.id));
    
    const orderNumber = `ORD-${String((orderCount[0]?.count || 0) + 1).padStart(6, '0')}`;

    const splitPotItems = orderItems.filter((item) => {
      const product = productMap.get(item.productId);
      return product?.productType === 'raffle' && product.raffleMode === 'split_pot';
    });
    if (splitPotItems.length > 0 && splitPotItems.length !== orderItems.length) {
      return res.status(400).json({ error: 'Split-the-pot raffle tickets must be purchased separately' });
    }
    const isSplitPotOnlyOrder = splitPotItems.length > 0;
    if (isSplitPotOnlyOrder && !isEvenCentAmount(subtotal)) {
      return res.status(400).json({ error: 'This split-the-pot ticket total cannot be divided evenly into two shares' });
    }

    // Regular shop buyers cover the card fee. For split-the-pot raffles, the
    // buyer pays only the ticket price and Stripe's fee comes from the rescue's
    // half; the winner's half is always 50% of paid ticket revenue.
    const checkoutAmounts = computeCheckoutPaymentAmounts(subtotal, !isSplitPotOnlyOrder);
    const processingFee = checkoutAmounts.processingFee;
    const totalAmount = checkoutAmounts.totalAmount;

    // Create the order and its items atomically. Raffle ticket numbers are
    // allocated inside the transaction while holding a row lock on the
    // product, so concurrent checkouts for the same raffle can never read
    // the same ticket count and assign overlapping numbers.
    const order = await db.transaction(async (tx) => {
      const [createdOrder] = await tx.insert(shopOrders).values({
        tenantId: tenant.id,
        orderNumber,
        customerEmail: data.customerEmail,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        shippingAddress: data.shippingAddress,
        subtotal: subtotal.toFixed(2),
        shippingAmount: '0',
        taxAmount: '0',
        processingFee: processingFee.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        paymentStatus: 'pending',
        paymentMethod: data.paymentMethod,
        customerNotes: data.customerNotes,
        fulfillmentStatus: hasPhysicalProduct ? 'unfulfilled' : 'delivered',
      }).returning();

      for (const item of orderItems) {
        let raffleTicketNumbers: string[] | undefined;
        if (item.productType === 'raffle') {
          // Serialize ticket allocation per product: lock the product row so
          // only one checkout at a time can count existing tickets.
          await tx.execute(
            sql`SELECT id FROM shop_products WHERE id = ${item.productId} FOR UPDATE`
          );

          // The product was initially read before this transaction. Re-check
          // its financial terms after taking the lock so a concurrent staff
          // edit cannot turn an in-flight fixed raffle into split-pot (or
          // vice versa) before this first entry is committed.
          const [lockedProduct] = await tx
            .select({
              productType: shopProducts.productType,
              raffleMode: shopProducts.raffleMode,
              basePrice: shopProducts.basePrice,
              bundlePricing: shopProducts.bundlePricing,
              status: shopProducts.status,
            })
            .from(shopProducts)
            .where(and(
              eq(shopProducts.id, item.productId),
              eq(shopProducts.tenantId, tenant.id),
            ));
          const originalProduct = productMap.get(item.productId);
          if (
            !lockedProduct
            || lockedProduct.status !== 'active'
            || lockedProduct.productType !== originalProduct?.productType
            || lockedProduct.raffleMode !== originalProduct?.raffleMode
            || !sameMoneyAmount(lockedProduct.basePrice, originalProduct?.basePrice)
            || normalizedBundlePricing(lockedProduct.bundlePricing) !== normalizedBundlePricing(originalProduct?.bundlePricing)
          ) {
            throw new ShopCheckoutError(`${item.productName} changed while checkout was starting. Please refresh and try again.`);
          }

          const [drawn] = await tx
            .select({ id: shopRaffleDrawings.id })
            .from(shopRaffleDrawings)
            .where(and(
              eq(shopRaffleDrawings.productId, item.productId),
              eq(shopRaffleDrawings.status, 'drawn'),
            ));
          if (drawn) {
            throw new ShopCheckoutError(`${item.productName} has already been drawn and is no longer accepting entries`);
          }

          // Sum quantities (each order item row can contain many tickets) PLUS
          // any bonus tickets already granted for this raffle so numbers never
          // collide across orders or with earned bonus tickets.
          const ticketCount = await tx
            .select({ count: sql<number>`coalesce(sum(${shopOrderItems.quantity}), 0)::int` })
            .from(shopOrderItems)
            .where(eq(shopOrderItems.productId, item.productId));
          const bonusCount = await tx
            .select({ count: sql<number>`coalesce(sum(cardinality(${shopRaffleBonusTickets.ticketNumbers})), 0)::int` })
            .from(shopRaffleBonusTickets)
            .where(eq(shopRaffleBonusTickets.productId, item.productId));

          const startNumber = (ticketCount[0]?.count || 0) + (bonusCount[0]?.count || 0) + 1;
          raffleTicketNumbers = Array.from(
            { length: item.quantity },
            (_, i) => String(startNumber + i).padStart(6, '0')
          );
        }

        await tx.insert(shopOrderItems).values({
          orderId: createdOrder.id,
          productId: item.productId,
          variantId: item.variantId,
          tenantId: tenant.id,
          productName: item.productName,
          variantName: item.variantName,
          productType: item.productType,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          raffleTicketNumbers,
        });
      }

      return createdOrder;
    });

    // Handle payment based on method
    if (data.paymentMethod === 'stripe') {
      // Create a PaymentIntent on the tenant's own Stripe account or, for
      // Stripe Connect tenants, as a destination charge on the platform account.
      const amountCents = Math.round(totalAmount * 100);
      const useConnect = !tenant.stripeSecretKeyEncrypted && tenant.stripeConnectedAccountId;
      const { calculatePlatformFee } = await import('../config/platform');
      const platformFeeAmount = useConnect
        ? calculatePlatformFee(amountCents, tenant.subscriptionTier || 'free', tenant.platformFeePercent)
        : 0;

      const paymentIntent = await stripeService.createPaymentIntent(tenant as any, {
        amount: amountCents,
        description: `Order ${orderNumber} from ${tenant.name}`,
        receiptEmail: data.customerEmail,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
        },
        connectedAccountId: useConnect ? tenant.stripeConnectedAccountId! : undefined,
        platformFeeAmount: platformFeeAmount > 0 ? platformFeeAmount : undefined,
      });

      // Update order with payment intent ID
      await db.update(shopOrders)
        .set({ 
          stripePaymentIntentId: paymentIntent.id,
          paymentStatus: 'processing',
        })
        .where(eq(shopOrders.id, order.id));

      res.json({
        orderId: order.id,
        orderNumber: order.orderNumber,
        accessToken: order.accessToken,
        clientSecret: paymentIntent.client_secret,
        subtotal: subtotal.toFixed(2),
        processingFee: processingFee.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
      });
    } else {
      // Non-Stripe checkout - just return the order info without payment intent
      res.json({
        orderId: order.id,
        orderNumber: order.orderNumber,
        accessToken: order.accessToken,
        totalAmount: totalAmount.toFixed(2),
      });
    }
  } catch (error) {
    if (error instanceof ShopCheckoutError) {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid checkout data', details: error.errors });
    }
    next(error);
  }
});

/**
 * POST /api/shop/checkout/confirm
 * Confirm payment was successful and finalize the order
 */
router.post('/checkout/confirm', requireTenant, async (req, res, next) => {
  try {
    const { orderId, paymentIntentId } = req.body;

    if (!orderId || !paymentIntentId) {
      return res.status(400).json({ error: 'Order ID and Payment Intent ID are required' });
    }

    const [order] = await db
      .select()
      .from(shopOrders)
      .where(
        and(
          eq(shopOrders.id, orderId),
          eq(shopOrders.tenantId, req.tenant!.id)
        )
      );

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.stripePaymentIntentId !== paymentIntentId) {
      return res.status(400).json({ error: 'Payment intent mismatch' });
    }

    // Verify payment with Stripe
    const tenant = req.tenant!;
    let stripe: Stripe;
    if (tenant.stripeSecretKeyEncrypted) {
      const { decrypt } = await import('../lib/encryption');
      const stripeSecretKey = decrypt(tenant.stripeSecretKeyEncrypted);
      stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-09-30.clover' });
    } else if (tenant.stripeConnectedAccountId && getPlatformStripeKey()) {
      // Connect destination charges live on the platform account
      stripe = new Stripe(getPlatformStripeKey()!, { apiVersion: '2025-09-30.clover' });
    } else {
      return res.status(400).json({ error: 'Stripe not configured' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      // Idempotent transition: only the first confirm call moves the order to
      // 'paid' and decrements inventory. Repeated confirms (double-click,
      // retries) return success without side effects.
      // See PAYABLE_ORDER_STATES for exactly which states may transition to
      // paid (includes sweep-cancelled orders; excludes refunded).
      let transitioned = false;
      try {
        transitioned = await db.transaction(async (tx) => {
          const updated = await transitionShopOrderToPaid(
            order.id,
            typeof paymentIntent.latest_charge === 'string' ? paymentIntent.latest_charge : null,
            tx,
          );
          if (updated.length === 0) return false;

          // Update inventory for variants in the same transaction as the
          // first successful payment transition.
          const orderItems = await tx
            .select()
            .from(shopOrderItems)
            .where(eq(shopOrderItems.orderId, order.id));
          for (const item of orderItems) {
            if (item.variantId) {
              await tx.update(shopProductVariants)
                .set({ inventory: sql`${shopProductVariants.inventory} - ${item.quantity}` })
                .where(eq(shopProductVariants.id, item.variantId));
            }
          }
          return true;
        });
      } catch (error) {
        if (!(error instanceof ShopRaffleClosedError)) throw error;
        await refundClosedRafflePayment(stripe, order.id, paymentIntentId, {
          reverseTransfer: !!paymentIntent.transfer_data,
          refundApplicationFee: !!paymentIntent.application_fee_amount,
        });
        return res.status(409).json({
          success: false,
          refunded: true,
          error: 'This raffle was drawn before payment completed. Your payment has been refunded.',
        });
      }

      if (transitioned) {
        // Email the buyer their receipt (with raffle ticket numbers when
        // applicable). Fire-and-forget so email problems never block the
        // payment confirmation response.
        sendShopOrderConfirmationEmail(tenant.id, order.id).catch((err) => {
          console.error(`[Shop] Order confirmation email failed for order ${order.orderNumber}:`, err);
        });
      }

      const [finalOrder] = await db
        .select()
        .from(shopOrders)
        .where(and(
          eq(shopOrders.id, order.id),
          eq(shopOrders.tenantId, req.tenant!.id),
        ));
      if (!finalOrder) return res.status(404).json({ error: 'Order not found' });
      if (finalOrder.paymentStatus === 'refunded') {
        return res.status(409).json({
          success: false,
          refunded: true,
          error: 'This raffle was drawn before payment completed. Your payment has been refunded.',
        });
      }
      if (finalOrder.paymentStatus !== 'paid') {
        return res.status(409).json({
          success: false,
          status: finalOrder.paymentStatus,
          error: 'Payment cannot finalize this order',
        });
      }

      // Get order items for response
      const items = await db
        .select()
        .from(shopOrderItems)
        .where(eq(shopOrderItems.orderId, order.id));

      res.json({ 
        success: true,
        order: {
          ...finalOrder,
          items,
        }
      });
    } else {
      res.json({ 
        success: false,
        status: paymentIntent.status,
        error: 'Payment not completed'
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/shop/orders/:orderNumber
 * Get order details by order number (for confirmation page)
 */
router.get('/orders/:orderNumber', requireTenant, async (req, res, next) => {
  try {
    const [order] = await db
      .select()
      .from(shopOrders)
      .where(
        and(
          eq(shopOrders.tenantId, req.tenant!.id),
          eq(shopOrders.orderNumber, req.params.orderNumber)
        )
      );

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get order items
    const items = await db
      .select()
      .from(shopOrderItems)
      .where(eq(shopOrderItems.orderId, order.id));

    // Bonus tickets earned via sharing incentives (per order item)
    const bonusRows = await db
      .select()
      .from(shopRaffleBonusTickets)
      .where(eq(shopRaffleBonusTickets.orderId, order.id));

    // Sharing-incentive status for raffle items on paid orders
    const raffleProductIds = items
      .filter((i) => i.productType === 'raffle')
      .map((i) => i.productId);
    let incentives: Record<string, {
      enabled: boolean;
      maxReferrals: number;
      shareClaimed: boolean;
      referralsUsed: number;
      drawn: boolean;
      productSlug: string;
      productName: string;
    }> = {};
    let raffleProducts: (typeof shopProducts.$inferSelect)[] = [];
    let raffleSales = new Map<string, string>();
    let raffleDrawings = new Map<string, PublicRaffleDrawing>();
    if (raffleProductIds.length > 0) {
      raffleProducts = await db
        .select()
        .from(shopProducts)
        .where(inArray(shopProducts.id, raffleProductIds));
      raffleSales = await loadPaidRaffleSales(raffleProductIds);
      raffleDrawings = await loadPublicRaffleDrawings(raffleProductIds);
      const drawings = await db
        .select({ productId: shopRaffleDrawings.productId })
        .from(shopRaffleDrawings)
        .where(and(
          inArray(shopRaffleDrawings.productId, raffleProductIds),
          eq(shopRaffleDrawings.status, 'drawn')
        ));
      const drawnSet = new Set(drawings.map((d) => d.productId));
      for (const item of items) {
        if (item.productType !== 'raffle') continue;
        const product = raffleProducts.find((p) => p.id === item.productId);
        if (!product) continue;
        const itemBonuses = bonusRows.filter((b) => b.orderItemId === item.id);
        incentives[item.id] = {
          enabled: product.raffleIncentivesEnabled,
          maxReferrals: product.raffleMaxReferrals,
          shareClaimed: itemBonuses.some((b) => b.actionType === 'share'),
          referralsUsed: itemBonuses.filter((b) => b.actionType === 'referral').length,
          drawn: drawnSet.has(product.id),
          productSlug: product.slug,
          productName: product.name,
        };
      }
    }

    // Order numbers are sequential/guessable, so mask buyer PII on this
    // unauthenticated endpoint. Incentive mutations require the full email.
    const maskEmail = (email: string) => {
      const [local, domain] = email.split('@');
      if (!domain) return '***';
      return `${(local || '').slice(0, 1)}***@${domain}`;
    };

    const { accessToken: _secretToken, ...publicOrder } = order;
    res.json({ 
      order: {
        ...publicOrder,
        customerEmail: maskEmail(order.customerEmail),
        customerPhone: null,
        items: items.map((item) => ({
          ...item,
          raffleMode: raffleProducts.find((p) => p.id === item.productId)?.raffleMode,
          splitPot: (() => {
            const product = raffleProducts.find((p) => p.id === item.productId);
            return product ? publicSplitPotStats(product, raffleSales, raffleDrawings.get(product.id)) : undefined;
          })(),
          bonusTickets: bonusRows
            .filter((b) => b.orderItemId === item.id)
            .map((b) => ({ actionType: b.actionType, ticketNumbers: b.ticketNumbers })),
        })),
        incentives,
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Grant bonus raffle tickets for a sharing incentive, atomically and
 * idempotently. Numbers are allocated under the product row lock (same
 * sequence as purchased tickets); the partial unique indexes on
 * shop_raffle_bonus_tickets make concurrent duplicate claims a no-op.
 * Returns the granted ticket numbers, or null if this claim already existed.
 */
async function grantBonusTickets(opts: {
  tenantId: string;
  orderId: string;
  orderItemId: string;
  productId: string;
  actionType: 'share' | 'referral';
  referredEmail?: string;
  count: number;
  maxReferrals?: number;
}): Promise<string[] | null | 'drawn' | 'cap'> {
  return db.transaction(async (tx) => {
    // Serialize with checkout, other bonus grants, AND the draw for this raffle
    await tx.execute(sql`SELECT id FROM shop_products WHERE id = ${opts.productId} FOR UPDATE`);

    // Re-check drawing status under the lock: the draw also locks the product
    // row, so a grant can never slip in after the winner pool is assembled.
    const [drawnRow] = await tx
      .select({ id: shopRaffleDrawings.id })
      .from(shopRaffleDrawings)
      .where(and(
        eq(shopRaffleDrawings.productId, opts.productId),
        eq(shopRaffleDrawings.status, 'drawn')
      ));
    if (drawnRow) return 'drawn';

    // Enforce the referral cap under the lock (concurrent-safe)
    if (opts.actionType === 'referral' && opts.maxReferrals !== undefined) {
      const used = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(shopRaffleBonusTickets)
        .where(and(
          eq(shopRaffleBonusTickets.orderItemId, opts.orderItemId),
          eq(shopRaffleBonusTickets.actionType, 'referral')
        ));
      if ((used[0]?.count || 0) >= opts.maxReferrals) return 'cap';
    }

    const soldCount = await tx
      .select({ count: sql<number>`coalesce(sum(${shopOrderItems.quantity}), 0)::int` })
      .from(shopOrderItems)
      .where(eq(shopOrderItems.productId, opts.productId));
    const bonusCount = await tx
      .select({ count: sql<number>`coalesce(sum(cardinality(${shopRaffleBonusTickets.ticketNumbers})), 0)::int` })
      .from(shopRaffleBonusTickets)
      .where(eq(shopRaffleBonusTickets.productId, opts.productId));

    const startNumber = (soldCount[0]?.count || 0) + (bonusCount[0]?.count || 0) + 1;
    const ticketNumbers = Array.from(
      { length: opts.count },
      (_, i) => String(startNumber + i).padStart(6, '0')
    );

    const inserted = await tx
      .insert(shopRaffleBonusTickets)
      .values({
        tenantId: opts.tenantId,
        orderId: opts.orderId,
        orderItemId: opts.orderItemId,
        productId: opts.productId,
        actionType: opts.actionType,
        referredEmail: opts.referredEmail || null,
        ticketNumbers,
      })
      .onConflictDoNothing()
      .returning();

    return inserted.length > 0 ? ticketNumbers : null;
  });
}

/**
 * Shared validation for both incentive endpoints: the order must exist in this
 * tenant, be PAID, contain a raffle item whose product has incentives enabled,
 * and the raffle must not be drawn yet.
 */
async function loadIncentiveContext(tenantId: string, orderNumber: string, orderItemId?: string) {
  const [order] = await db
    .select()
    .from(shopOrders)
    .where(and(eq(shopOrders.tenantId, tenantId), eq(shopOrders.orderNumber, orderNumber)));
  if (!order) return { error: 'Order not found', status: 404 as const };
  if (order.paymentStatus !== 'paid') return { error: 'Bonus tickets are only available on paid orders', status: 400 as const };

  const items = await db
    .select()
    .from(shopOrderItems)
    .where(and(eq(shopOrderItems.orderId, order.id), eq(shopOrderItems.productType, 'raffle')));
  if (items.length === 0) return { error: 'This order has no raffle tickets', status: 400 as const };

  // Bind the claim to the specific raffle item the buyer acted on. Orders can
  // contain multiple raffles; only fall back to the sole item when unambiguous.
  let item: typeof items[number] | undefined;
  if (orderItemId) {
    item = items.find((i) => i.id === orderItemId);
    if (!item) return { error: 'Raffle item not found on this order', status: 404 as const };
  } else if (items.length === 1) {
    item = items[0];
  } else {
    return { error: 'Please specify which raffle to claim the bonus for', status: 400 as const };
  }
  const [product] = await db
    .select()
    .from(shopProducts)
    .where(and(eq(shopProducts.id, item.productId), eq(shopProducts.tenantId, tenantId)));
  if (!product || !product.raffleIncentivesEnabled) {
    return { error: 'Bonus tickets are not available for this raffle', status: 400 as const };
  }

  const [drawing] = await db
    .select()
    .from(shopRaffleDrawings)
    .where(and(
      eq(shopRaffleDrawings.productId, product.id),
      eq(shopRaffleDrawings.status, 'drawn')
    ));
  if (drawing) return { error: 'This raffle has already been drawn', status: 400 as const };

  return { order, item, product };
}

/**
 * POST /api/shop/orders/:orderNumber/claim-share-bonus
 * Grant +1 bonus ticket for sharing the raffle to social media. Once per order.
 */
router.post('/orders/:orderNumber/claim-share-bonus', requireTenant, async (req, res, next) => {
  try {
    // Order numbers are guessable; require the per-order access token
    // (issued at checkout and in the confirmation email link) as proof of ownership.
    const tokenParse = z.object({
      accessToken: z.string().min(8).max(128),
      orderItemId: z.string().uuid().optional(),
    }).safeParse(req.body);
    if (!tokenParse.success) {
      return res.status(400).json({ error: 'Please use the link from your order confirmation to claim bonuses' });
    }

    const ctx = await loadIncentiveContext(req.tenant!.id, req.params.orderNumber, tokenParse.data.orderItemId);
    if ('error' in ctx) return res.status(ctx.status ?? 400).json({ error: ctx.error });

    if (tokenParse.data.accessToken !== ctx.order.accessToken) {
      return res.status(403).json({ error: "This link isn't valid for this order" });
    }

    const result = await grantBonusTickets({
      tenantId: req.tenant!.id,
      orderId: ctx.order.id,
      orderItemId: ctx.item.id,
      productId: ctx.product.id,
      actionType: 'share',
      count: 1,
    });

    if (result === 'drawn') {
      return res.status(400).json({ error: 'This raffle has already been drawn' });
    }
    if (result === null || result === 'cap') {
      return res.status(200).json({ alreadyClaimed: true });
    }
    res.status(201).json({ ticketNumbers: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/shop/orders/:orderNumber/refer
 * Grant +1 bonus ticket for referring a friend by email (up to the product's
 * cap per order). Sends the friend a short invite email with the raffle link.
 */
router.post('/orders/:orderNumber/refer', requireTenant, async (req, res, next) => {
  try {
    const bodySchema = z.object({
      friendEmail: z.string().email().max(320),
      accessToken: z.string().min(8).max(128),
      orderItemId: z.string().uuid().optional(),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }
    const friendEmail = parsed.data.friendEmail.trim().toLowerCase();

    const ctx = await loadIncentiveContext(req.tenant!.id, req.params.orderNumber, parsed.data.orderItemId);
    if ('error' in ctx) return res.status(ctx.status ?? 400).json({ error: ctx.error });

    if (parsed.data.accessToken !== ctx.order.accessToken) {
      return res.status(403).json({ error: "This link isn't valid for this order" });
    }

    if (friendEmail === ctx.order.customerEmail.trim().toLowerCase()) {
      return res.status(400).json({ error: "You can't refer yourself" });
    }

    const result = await grantBonusTickets({
      tenantId: req.tenant!.id,
      orderId: ctx.order.id,
      orderItemId: ctx.item.id,
      productId: ctx.product.id,
      actionType: 'referral',
      referredEmail: friendEmail,
      count: 1,
      maxReferrals: ctx.product.raffleMaxReferrals,
    });

    if (result === 'drawn') {
      return res.status(400).json({ error: 'This raffle has already been drawn' });
    }
    if (result === 'cap') {
      return res.status(400).json({ error: `You've reached the maximum of ${ctx.product.raffleMaxReferrals} referrals for this order` });
    }
    if (result === null) {
      return res.status(400).json({ error: "You've already referred this email address" });
    }
    const ticketNumbers = result;

    // Invite the friend (fire-and-forget so email issues never block the grant)
    const { sendRaffleReferralInviteEmail } = await import('../lib/shop-emails');
    sendRaffleReferralInviteEmail(
      req.tenant!.id,
      friendEmail,
      ctx.order.customerName,
      ctx.product.id,
    ).catch((err) => {
      console.error(`[Shop] Referral invite email failed for order ${ctx.order.orderNumber}:`, err);
    });

    res.status(201).json({ ticketNumbers });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Admin Shop Routes (authentication required)
// ============================================================================

/**
 * GET /api/shop/admin/products
 * Get all products for admin (including drafts)
 */
router.get('/admin/products', requireTenant, requireAuth, requireRoleOrPageAccess('shop', 'admin', 'staff'), async (req, res, next) => {
  try {
    const products = await db
      .select()
      .from(shopProducts)
      .where(eq(shopProducts.tenantId, req.tenant!.id))
      .orderBy(asc(shopProducts.displayOrder), desc(shopProducts.createdAt));

    // Get variants
    const productIds = products.map(p => p.id);
    let variants: typeof shopProductVariants.$inferSelect[] = [];
    
    if (productIds.length > 0) {
      variants = await db
        .select()
        .from(shopProductVariants)
        .where(
          and(
            eq(shopProductVariants.tenantId, req.tenant!.id),
            inArray(shopProductVariants.productId, productIds)
          )
        )
        .orderBy(asc(shopProductVariants.displayOrder));
    }

    const variantsByProduct = variants.reduce((acc, v) => {
      if (!acc[v.productId]) acc[v.productId] = [];
      acc[v.productId].push(v);
      return acc;
    }, {} as Record<string, typeof variants>);

    const productsWithVariants = products.map(p => ({
      ...p,
      variants: variantsByProduct[p.id] || [],
    }));

    res.json({ products: productsWithVariants });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/shop/admin/products
 * Create a new product
 */
router.post('/admin/products', requireTenant, requireAuth, requireRoleOrPageAccess('shop', 'admin', 'staff'), async (req, res, next) => {
  try {
    const productData = insertShopProductSchema.parse({
      ...req.body,
      tenantId: req.tenant!.id,
    });

    // Bundle (bulk-discount) pricing is a raffle-only feature
    if (productData.productType !== 'raffle') {
      productData.bundlePricing = null;
      productData.raffleMode = 'fixed';
    }
    const pricingError = validateSplitPotPricing(productData);
    if (pricingError) return res.status(400).json({ error: pricingError });

    // Generate slug if not provided
    if (!productData.slug) {
      productData.slug = productData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    const [product] = await db.insert(shopProducts).values(productData).returning();
    res.status(201).json({ product });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid product data', details: error.errors });
    }
    next(error);
  }
});

/**
 * PATCH /api/shop/admin/products/:id
 * Update a product
 */
router.patch('/admin/products/:id', requireTenant, requireAuth, requireRoleOrPageAccess('shop', 'admin', 'staff'), async (req, res, next) => {
  try {
    const updateData = insertShopProductSchema.partial().parse(req.body);
    const product = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM shop_products WHERE id = ${req.params.id} AND tenant_id = ${req.tenant!.id} FOR UPDATE`
      );
      const [existing] = await tx
        .select()
        .from(shopProducts)
        .where(and(
          eq(shopProducts.id, req.params.id),
          eq(shopProducts.tenantId, req.tenant!.id),
        ));
      if (!existing) throw new ShopProductNotFoundError();

      // Bundle (bulk-discount) pricing is a raffle-only feature — clear any
      // tiers when the product is (or becomes) a non-raffle type.
      const effectiveType = updateData.productType ?? existing.productType;
      if (effectiveType !== 'raffle') {
        updateData.bundlePricing = null;
        updateData.raffleMode = 'fixed';
      }

      const pricingError = validateSplitPotPricing({
        raffleMode: updateData.raffleMode ?? existing.raffleMode,
        basePrice: updateData.basePrice ?? existing.basePrice,
        bundlePricing: updateData.bundlePricing === undefined ? existing.bundlePricing : updateData.bundlePricing,
      });
      if (pricingError) throw new ShopProductTermsLockedError(pricingError);

      const [entry] = await tx
        .select({ id: shopOrderItems.id })
        .from(shopOrderItems)
        .where(eq(shopOrderItems.productId, existing.id))
        .limit(1);
      const [drawing] = await tx
        .select({ id: shopRaffleDrawings.id })
        .from(shopRaffleDrawings)
        .where(eq(shopRaffleDrawings.productId, existing.id))
        .limit(1);

      const changesProductType = updateData.productType !== undefined
        && updateData.productType !== existing.productType;
      const changesRaffleFinancialTerms = existing.productType === 'raffle' && (
        (updateData.raffleMode !== undefined && updateData.raffleMode !== existing.raffleMode)
        || (updateData.basePrice !== undefined && !sameMoneyAmount(updateData.basePrice, existing.basePrice))
        || (
          updateData.bundlePricing !== undefined
          && normalizedBundlePricing(updateData.bundlePricing) !== normalizedBundlePricing(existing.bundlePricing)
        )
      );
      if ((entry || drawing) && (changesProductType || changesRaffleFinancialTerms)) {
        throw new ShopProductTermsLockedError(
          'Raffle type, prize mode, ticket price, and bundle pricing cannot change after entries have been created',
        );
      }

      const [updated] = await tx
        .update(shopProducts)
        .set({ ...updateData, updatedAt: new Date() })
        .where(and(
          eq(shopProducts.id, req.params.id),
          eq(shopProducts.tenantId, req.tenant!.id),
        ))
        .returning();
      return updated;
    });

    res.json({ product });
  } catch (error) {
    if (error instanceof ShopProductNotFoundError) {
      return res.status(404).json({ error: 'Product not found' });
    }
    if (error instanceof ShopProductTermsLockedError) {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid product data', details: error.errors });
    }
    next(error);
  }
});

/**
 * DELETE /api/shop/admin/products/:id
 * Delete a product (only if no orders exist)
 */
router.delete('/admin/products/:id', requireTenant, requireAuth, requireRoleOrPageAccess('shop', 'admin'), async (req, res, next) => {
  try {
    const [existing] = await db
      .select()
      .from(shopProducts)
      .where(
        and(
          eq(shopProducts.id, req.params.id),
          eq(shopProducts.tenantId, req.tenant!.id)
        )
      );

    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check for existing orders
    const [orderCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(shopOrderItems)
      .where(eq(shopOrderItems.productId, req.params.id));

    if (orderCount.count > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete product with existing orders. Archive it instead.' 
      });
    }

    await db.delete(shopProducts).where(eq(shopProducts.id, req.params.id));
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/shop/admin/products/:id/variants
 * Add a variant to a product
 */
router.post('/admin/products/:id/variants', requireTenant, requireAuth, requireRoleOrPageAccess('shop', 'admin', 'staff'), async (req, res, next) => {
  try {
    const [product] = await db
      .select()
      .from(shopProducts)
      .where(
        and(
          eq(shopProducts.id, req.params.id),
          eq(shopProducts.tenantId, req.tenant!.id)
        )
      );

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const variantData = insertShopProductVariantSchema.parse({
      ...req.body,
      productId: product.id,
      tenantId: req.tenant!.id,
    });

    const [variant] = await db.insert(shopProductVariants).values(variantData).returning();
    res.status(201).json({ variant });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid variant data', details: error.errors });
    }
    next(error);
  }
});

/**
 * PATCH /api/shop/admin/variants/:id
 * Update a variant
 */
router.patch('/admin/variants/:id', requireTenant, requireAuth, requireRoleOrPageAccess('shop', 'admin', 'staff'), async (req, res, next) => {
  try {
    const [existing] = await db
      .select()
      .from(shopProductVariants)
      .where(
        and(
          eq(shopProductVariants.id, req.params.id),
          eq(shopProductVariants.tenantId, req.tenant!.id)
        )
      );

    if (!existing) {
      return res.status(404).json({ error: 'Variant not found' });
    }

    const updateData = insertShopProductVariantSchema.partial().parse(req.body);
    
    const [variant] = await db
      .update(shopProductVariants)
      .set(updateData)
      .where(eq(shopProductVariants.id, req.params.id))
      .returning();

    res.json({ variant });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid variant data', details: error.errors });
    }
    next(error);
  }
});

/**
 * DELETE /api/shop/admin/variants/:id
 * Delete a variant
 */
router.delete('/admin/variants/:id', requireTenant, requireAuth, requireRoleOrPageAccess('shop', 'admin', 'staff'), async (req, res, next) => {
  try {
    const [existing] = await db
      .select()
      .from(shopProductVariants)
      .where(
        and(
          eq(shopProductVariants.id, req.params.id),
          eq(shopProductVariants.tenantId, req.tenant!.id)
        )
      );

    if (!existing) {
      return res.status(404).json({ error: 'Variant not found' });
    }

    await db.delete(shopProductVariants).where(eq(shopProductVariants.id, req.params.id));
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/shop/admin/orders
 * Get all orders for admin
 */
router.get('/admin/orders', requireTenant, requireAuth, requireRoleOrPageAccess('shop', 'admin', 'staff'), async (req, res, next) => {
  try {
    const orders = await db
      .select()
      .from(shopOrders)
      .where(eq(shopOrders.tenantId, req.tenant!.id))
      .orderBy(desc(shopOrders.createdAt));

    // Get items for all orders
    const orderIds = orders.map(o => o.id);
    let items: typeof shopOrderItems.$inferSelect[] = [];
    
    if (orderIds.length > 0) {
      items = await db
        .select()
        .from(shopOrderItems)
        .where(inArray(shopOrderItems.orderId, orderIds));
    }

    const itemsByOrder = items.reduce((acc, item) => {
      if (!acc[item.orderId]) acc[item.orderId] = [];
      acc[item.orderId].push(item);
      return acc;
    }, {} as Record<string, typeof items>);

    const ordersWithItems = orders.map(o => ({
      ...o,
      items: itemsByOrder[o.id] || [],
    }));

    res.json({ orders: ordersWithItems });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/shop/admin/orders/:id
 * Update order (fulfillment status, tracking, notes)
 */
router.patch('/admin/orders/:id', requireTenant, requireAuth, requireRoleOrPageAccess('shop', 'admin', 'staff'), async (req, res, next) => {
  try {
    const [existing] = await db
      .select()
      .from(shopOrders)
      .where(
        and(
          eq(shopOrders.id, req.params.id),
          eq(shopOrders.tenantId, req.tenant!.id)
        )
      );

    if (!existing) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const updateSchema = z.object({
      fulfillmentStatus: z.enum(['unfulfilled', 'processing', 'shipped', 'delivered', 'cancelled']).optional(),
      trackingNumber: z.string().optional(),
      trackingUrl: z.string().url().optional().or(z.literal('')),
      internalNotes: z.string().optional(),
    });

    const updateData = updateSchema.parse(req.body);
    
    const updates: any = { ...updateData, updatedAt: new Date() };
    
    if (updateData.fulfillmentStatus === 'shipped' && !existing.shippedAt) {
      updates.shippedAt = new Date();
    }
    if (updateData.fulfillmentStatus === 'delivered' && !existing.deliveredAt) {
      updates.deliveredAt = new Date();
    }

    const [order] = await db
      .update(shopOrders)
      .set(updates)
      .where(eq(shopOrders.id, req.params.id))
      .returning();

    res.json({ order });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid order data', details: error.errors });
    }
    next(error);
  }
});

/**
 * POST /api/shop/admin/orders/:id/resend-ticket-email
 * Resend the raffle ticket / receipt email for a paid order containing
 * raffle items (e.g. after a bounce, spam filtering, or a corrected email).
 */
router.post('/admin/orders/:id/resend-ticket-email', requireTenant, requireAuth, requireRoleOrPageAccess('shop', 'admin', 'staff'), async (req, res, next) => {
  try {
    const [order] = await db
      .select()
      .from(shopOrders)
      .where(
        and(
          eq(shopOrders.id, req.params.id),
          eq(shopOrders.tenantId, req.tenant!.id)
        )
      );

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.paymentStatus !== 'paid') {
      return res.status(400).json({ error: 'Ticket emails can only be resent for paid orders' });
    }

    if (!order.customerEmail) {
      return res.status(400).json({ error: 'This order has no customer email on file' });
    }

    const items = await db
      .select()
      .from(shopOrderItems)
      .where(eq(shopOrderItems.orderId, order.id));

    if (!items.some(i => i.productType === 'raffle')) {
      return res.status(400).json({ error: 'This order does not contain raffle tickets' });
    }

    // Await the send so staff get a real success/failure signal (unlike the
    // fire-and-forget initial send on payment confirmation).
    const { EmailService } = await import('../lib/email-service');
    const emailService = await EmailService.forTenant(req.tenant!.id);
    if (!emailService) {
      return res.status(400).json({ error: 'Email is not configured for this organization' });
    }

    await sendShopOrderConfirmationEmail(req.tenant!.id, order.id);

    res.json({ success: true, sentTo: order.customerEmail });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/shop/admin/raffles
 * Get all raffle products for management
 */
router.get('/admin/raffles', requireTenant, requireAuth, requireRoleOrPageAccess('shop', 'admin', 'staff'), async (req, res, next) => {
  try {
    const raffles = await db
      .select()
      .from(shopProducts)
      .where(
        and(
          eq(shopProducts.tenantId, req.tenant!.id),
          eq(shopProducts.productType, 'raffle')
        )
      )
      .orderBy(desc(shopProducts.createdAt));

    // Get ticket counts for each raffle
    const raffleIds = raffles.map(r => r.id);
    let ticketCounts: { productId: string; count: number }[] = [];
    
    if (raffleIds.length > 0) {
      const counts = await db
        .select({
          productId: shopOrderItems.productId,
          count: sql<number>`sum(${shopOrderItems.quantity})::int`,
        })
        .from(shopOrderItems)
        .innerJoin(shopOrders, eq(shopOrderItems.orderId, shopOrders.id))
        .where(
          and(
            inArray(shopOrderItems.productId, raffleIds),
            eq(shopOrders.paymentStatus, 'paid')
          )
        )
        .groupBy(shopOrderItems.productId);
      
      ticketCounts = counts;
    }

    // Bonus tickets (earned via sharing incentives) on paid orders
    let bonusCounts: { productId: string; count: number }[] = [];
    if (raffleIds.length > 0) {
      bonusCounts = await db
        .select({
          productId: shopRaffleBonusTickets.productId,
          count: sql<number>`coalesce(sum(cardinality(${shopRaffleBonusTickets.ticketNumbers})), 0)::int`,
        })
        .from(shopRaffleBonusTickets)
        .innerJoin(shopOrders, eq(shopRaffleBonusTickets.orderId, shopOrders.id))
        .where(
          and(
            inArray(shopRaffleBonusTickets.productId, raffleIds),
            eq(shopOrders.paymentStatus, 'paid')
          )
        )
        .groupBy(shopRaffleBonusTickets.productId);
    }

    const ticketCountMap = new Map(ticketCounts.map(t => [t.productId, t.count]));
    const bonusCountMap = new Map(bonusCounts.map(t => [t.productId, t.count]));

    // Get drawing status
    const drawings = await db
      .select()
      .from(shopRaffleDrawings)
      .where(
        and(
          eq(shopRaffleDrawings.tenantId, req.tenant!.id),
          inArray(shopRaffleDrawings.productId, raffleIds)
        )
      );

    const drawingMap = new Map(drawings.map(d => [d.productId, d]));
    const salesByProduct = await loadPaidRaffleSales(raffleIds);

    const rafflesWithStats = raffles.map(r => {
      const drawing = drawingMap.get(r.id);
      return {
        ...r,
        ticketsSold: ticketCountMap.get(r.id) || 0,
        bonusTickets: bonusCountMap.get(r.id) || 0,
        splitPot: publicSplitPotStats(r, salesByProduct),
        drawing,
        drawn: !!drawing,
        winnerName: drawing?.winnerName,
        winnerEmail: drawing?.winnerEmail,
        winningTicketNumber: drawing?.winningTicketNumber,
        ticketSalesAmount: drawing?.ticketSalesAmount,
        winnerPrizeAmount: drawing?.winnerPrizeAmount,
        rescueShareAmount: drawing?.rescueShareAmount,
        payoutStatus: drawing?.payoutStatus,
        prizePaidAt: drawing?.prizePaidAt,
      };
    });

    res.json({ raffles: rafflesWithStats });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/shop/admin/raffles/:id/tickets
 * Consolidated read-only list of every PAID ticket for a raffle — used by
 * staff to run a manual/live drawing. Same aggregation as the draw endpoint.
 */
router.get('/admin/raffles/:id/tickets', requireTenant, requireAuth, requireRoleOrPageAccess('shop', 'admin', 'staff'), async (req, res, next) => {
  try {
    const [raffle] = await db
      .select()
      .from(shopProducts)
      .where(
        and(
          eq(shopProducts.id, req.params.id),
          eq(shopProducts.tenantId, req.tenant!.id),
          eq(shopProducts.productType, 'raffle')
        )
      );

    if (!raffle) {
      return res.status(404).json({ error: 'Raffle not found' });
    }

    // Only paid orders count toward the drawing
    const rows = await db
      .select({
        orderItem: shopOrderItems,
        order: shopOrders,
      })
      .from(shopOrderItems)
      .innerJoin(shopOrders, eq(shopOrderItems.orderId, shopOrders.id))
      .where(
        and(
          eq(shopOrderItems.productId, raffle.id),
          eq(shopOrders.paymentStatus, 'paid')
        )
      );

    const tickets: {
      ticketNumber: string;
      customerName: string;
      customerEmail: string;
      customerPhone: string | null;
      orderNumber: string;
      orderDate: string | null;
      isBonus: boolean;
    }[] = [];

    for (const { orderItem, order } of rows) {
      if (orderItem.raffleTicketNumbers) {
        for (const ticketNumber of orderItem.raffleTicketNumbers) {
          tickets.push({
            ticketNumber,
            customerName: order.customerName,
            customerEmail: order.customerEmail,
            customerPhone: order.customerPhone || null,
            orderNumber: order.orderNumber,
            orderDate: order.createdAt ? new Date(order.createdAt).toISOString() : null,
            isBonus: false,
          });
        }
      }
    }

    // Bonus tickets earned via sharing incentives (paid orders only)
    const bonusRows = await db
      .select({
        bonus: shopRaffleBonusTickets,
        order: shopOrders,
      })
      .from(shopRaffleBonusTickets)
      .innerJoin(shopOrders, eq(shopRaffleBonusTickets.orderId, shopOrders.id))
      .where(
        and(
          eq(shopRaffleBonusTickets.productId, raffle.id),
          eq(shopOrders.paymentStatus, 'paid')
        )
      );
    for (const { bonus, order } of bonusRows) {
      for (const ticketNumber of bonus.ticketNumbers) {
        tickets.push({
          ticketNumber,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          customerPhone: order.customerPhone || null,
          orderNumber: order.orderNumber,
          orderDate: order.createdAt ? new Date(order.createdAt).toISOString() : null,
          isBonus: true,
        });
      }
    }

    tickets.sort((a, b) => a.ticketNumber.localeCompare(b.ticketNumber));

    res.json({
      raffle: {
        id: raffle.id,
        name: raffle.name,
        raffleDrawDate: raffle.raffleDrawDate,
        raffleMode: raffle.raffleMode,
        splitPot: publicSplitPotStats(raffle, await loadPaidRaffleSales([raffle.id])),
      },
      totalTickets: tickets.length,
      purchasedTickets: tickets.filter((t) => !t.isBonus).length,
      bonusTickets: tickets.filter((t) => t.isBonus).length,
      tickets,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/shop/admin/raffles/:id/draw
 * Draw a winner for a raffle
 */
router.post('/admin/raffles/:id/draw', requireTenant, requireAuth, requireRoleOrPageAccess('shop', 'admin'), async (req, res, next) => {
  try {
    const [raffle] = await db
      .select()
      .from(shopProducts)
      .where(
        and(
          eq(shopProducts.id, req.params.id),
          eq(shopProducts.tenantId, req.tenant!.id),
          eq(shopProducts.productType, 'raffle')
        )
      );

    if (!raffle) {
      return res.status(404).json({ error: 'Raffle not found' });
    }

    // Check if already drawn
    const [existingDrawing] = await db
      .select()
      .from(shopRaffleDrawings)
      .where(
        and(
          eq(shopRaffleDrawings.productId, raffle.id),
          eq(shopRaffleDrawings.status, 'drawn')
        )
      );

    if (existingDrawing) {
      return res.status(400).json({ error: 'Raffle has already been drawn' });
    }

    // Assemble the pool and record the winner inside one transaction holding
    // the product row lock, so bonus-ticket grants (which take the same lock)
    // can never land after the pool is assembled, and two concurrent draws
    // serialize (the second sees the first's drawn record and aborts).
    const drawResult = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM shop_products WHERE id = ${raffle.id} FOR UPDATE`);

    const [alreadyDrawn] = await tx
      .select({ id: shopRaffleDrawings.id })
      .from(shopRaffleDrawings)
      .where(and(
        eq(shopRaffleDrawings.productId, raffle.id),
        eq(shopRaffleDrawings.status, 'drawn')
      ));
    if (alreadyDrawn) {
      return { error: 'Raffle has already been drawn' as const };
    }

    // Get all paid tickets for this raffle
    const tickets = await tx
      .select({
        orderItem: shopOrderItems,
        order: shopOrders,
      })
      .from(shopOrderItems)
      .innerJoin(shopOrders, eq(shopOrderItems.orderId, shopOrders.id))
      .where(
        and(
          eq(shopOrderItems.productId, raffle.id),
          eq(shopOrders.paymentStatus, 'paid')
        )
      );

    // Flatten all ticket numbers
    const allTickets: { ticketNumber: string; orderItemId: string; customerName: string; customerEmail: string; customerPhone?: string }[] = [];
    
    for (const { orderItem, order } of tickets) {
      if (orderItem.raffleTicketNumbers) {
        for (const ticketNumber of orderItem.raffleTicketNumbers) {
          allTickets.push({
            ticketNumber,
            orderItemId: orderItem.id,
            customerName: order.customerName,
            customerEmail: order.customerEmail,
            customerPhone: order.customerPhone || undefined,
          });
        }
      }
    }

    // Include bonus tickets earned via sharing incentives (paid orders only).
    // They reference the underlying order item so the winner record still
    // points at a real purchase.
    const bonusRows = await tx
      .select({
        bonus: shopRaffleBonusTickets,
        order: shopOrders,
      })
      .from(shopRaffleBonusTickets)
      .innerJoin(shopOrders, eq(shopRaffleBonusTickets.orderId, shopOrders.id))
      .where(
        and(
          eq(shopRaffleBonusTickets.productId, raffle.id),
          eq(shopOrders.paymentStatus, 'paid')
        )
      );
    for (const { bonus, order } of bonusRows) {
      for (const ticketNumber of bonus.ticketNumbers) {
        allTickets.push({
          ticketNumber,
          orderItemId: bonus.orderItemId,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          customerPhone: order.customerPhone || undefined,
        });
      }
    }

    if (allTickets.length === 0) {
      return { error: 'No tickets sold for this raffle' as const };
    }

    // Random draw
    const winnerIndex = Math.floor(Math.random() * allTickets.length);
    const winner = allTickets[winnerIndex];

    const splitPot = raffle.raffleMode === 'split_pot'
      ? computeSplitPotAmounts((await loadPaidRaffleSales([raffle.id], tx)).get(raffle.id) || '0')
      : null;

    // Create drawing record. Split-pot accounting is snapshotted under the
    // same product lock, so later payments/refunds cannot silently change the
    // winner's recorded prize.
    const [drawing] = await tx.insert(shopRaffleDrawings).values({
      productId: raffle.id,
      tenantId: req.tenant!.id,
      winningOrderItemId: winner.orderItemId,
      winningTicketNumber: winner.ticketNumber,
      winnerName: winner.customerName,
      winnerEmail: winner.customerEmail,
      winnerPhone: winner.customerPhone,
      status: 'drawn',
      drawnAt: new Date(),
      drawnBy: req.user!.id,
      ticketSalesAmount: splitPot?.ticketSalesAmount,
      winnerPrizeAmount: splitPot?.winnerPrizeAmount,
      rescueShareAmount: splitPot?.rescueShareAmount,
      payoutStatus: splitPot ? 'pending' : null,
    }).returning();

    return { drawing, totalTickets: allTickets.length };
    });

    if ('error' in drawResult) {
      return res.status(400).json({ error: drawResult.error });
    }

    res.json(drawResult);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/shop/admin/raffles/:id/payout/paid
 * Record that staff paid a split-the-pot winner. Idempotent.
 */
router.post('/admin/raffles/:id/payout/paid', requireTenant, requireAuth, requireRoleOrPageAccess('shop', 'admin'), async (req, res, next) => {
  try {
    const [raffle] = await db
      .select({ id: shopProducts.id, raffleMode: shopProducts.raffleMode })
      .from(shopProducts)
      .where(and(
        eq(shopProducts.id, req.params.id),
        eq(shopProducts.tenantId, req.tenant!.id),
        eq(shopProducts.productType, 'raffle'),
      ));
    if (!raffle) return res.status(404).json({ error: 'Raffle not found' });
    if (raffle.raffleMode !== 'split_pot') {
      return res.status(400).json({ error: 'Payout tracking is only available for split-the-pot raffles' });
    }

    const [drawing] = await db
      .select()
      .from(shopRaffleDrawings)
      .where(and(
        eq(shopRaffleDrawings.productId, raffle.id),
        eq(shopRaffleDrawings.tenantId, req.tenant!.id),
        eq(shopRaffleDrawings.status, 'drawn'),
      ));
    if (!drawing) return res.status(400).json({ error: 'Draw a winner before recording the payout' });
    const [updated] = await db
      .update(shopRaffleDrawings)
      .set({
        payoutStatus: 'paid',
        prizePaidAt: new Date(),
        prizePaidBy: req.user!.id,
        updatedAt: new Date(),
      })
      .where(and(
        eq(shopRaffleDrawings.id, drawing.id),
        eq(shopRaffleDrawings.tenantId, req.tenant!.id),
        eq(shopRaffleDrawings.payoutStatus, 'pending'),
      ))
      .returning();
    if (updated) return res.json({ drawing: updated });

    // Another request may have won the pending -> paid transition. Return the
    // immutable audit fields it wrote rather than overwriting its timestamp or
    // staff actor.
    const [current] = await db
      .select()
      .from(shopRaffleDrawings)
      .where(and(
        eq(shopRaffleDrawings.id, drawing.id),
        eq(shopRaffleDrawings.tenantId, req.tenant!.id),
      ));
    res.json({ drawing: current });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/shop/admin/stats
 * Get shop statistics
 */
router.get('/admin/stats', requireTenant, requireAuth, requireRoleOrPageAccess('shop', 'admin', 'staff'), async (req, res, next) => {
  try {
    const tenantId = req.tenant!.id;

    // Total revenue
    const [revenue] = await db
      .select({
        total: sql<string>`coalesce(sum(${shopOrders.totalAmount}::numeric), 0)::text`,
      })
      .from(shopOrders)
      .where(
        and(
          eq(shopOrders.tenantId, tenantId),
          eq(shopOrders.paymentStatus, 'paid')
        )
      );

    // Order counts
    const [orderCounts] = await db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${shopOrders.fulfillmentStatus} = 'unfulfilled')::int`,
        shipped: sql<number>`count(*) filter (where ${shopOrders.fulfillmentStatus} = 'shipped')::int`,
      })
      .from(shopOrders)
      .where(
        and(
          eq(shopOrders.tenantId, tenantId),
          eq(shopOrders.paymentStatus, 'paid')
        )
      );

    // Product counts
    const [productCounts] = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${shopProducts.status} = 'active')::int`,
      })
      .from(shopProducts)
      .where(eq(shopProducts.tenantId, tenantId));

    res.json({
      revenue: parseFloat(revenue.total || '0').toFixed(2),
      orders: orderCounts,
      products: productCounts,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/shop/admin/products/images/upload
 * Upload a product image
 */
router.post('/admin/products/images/upload', requireTenant, requireAuth, requireRoleOrPageAccess('shop', 'admin', 'staff'), async (req, res, next) => {
  try {
    const multer = (await import('multer')).default;
    const { TenantFileStorage } = await import('../lib/tenantFileStorage');

    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif'];

    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = file.originalname.split('.').pop()?.toLowerCase() || '';
        if (file.mimetype.startsWith('image/') || imageExtensions.includes(ext)) {
          cb(null, true);
        } else {
          cb(new Error('Only image files are allowed'));
        }
      },
    });

    upload.single('file')(req, res, async (err: any) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      try {
        const storage = new TenantFileStorage(req.tenant!.id);
        const result = await storage.uploadFile({
          tenantId: req.tenant!.id,
          userId: req.user!.id,
          category: 'animal-photos',
          visibility: 'public',
          fileName: `shop-${Date.now()}-${req.file.originalname}`,
          mimeType: req.file.mimetype,
          content: req.file.buffer,
        });
        res.json({ imageUrl: result.fileUrl });
      } catch (uploadError: any) {
        console.error('Error uploading shop product image:', uploadError);
        res.status(500).json({ error: 'Failed to upload image' });
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;

import { Router } from 'express';
import { db } from '../db';
import { requireTenant } from '../middleware/tenant';
import { requireAuth, requireRole } from '../middleware/auth';
import { 
  shopProducts, 
  shopProductVariants, 
  shopOrders, 
  shopOrderItems,
  shopRaffleDrawings,
  insertShopProductSchema,
  insertShopProductVariantSchema,
  insertShopOrderSchema,
  insertShopOrderItemSchema,
} from '@shared/schema';
import { eq, and, desc, asc, sql, inArray } from 'drizzle-orm';
import { z } from 'zod';
import Stripe from 'stripe';
import { 
  createPaypalOrder, 
  capturePaypalOrder, 
  loadPaypalDefault,
  isTenantPayPalConfigured,
} from '../paypal';

const router = Router();

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

    // Combine products with their variants
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

    res.json({ 
      product: {
        ...product,
        variants,
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/shop/checkout
 * Create an order and optionally a Stripe PaymentIntent
 * Supports both Stripe and PayPal payment methods
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
      paymentMethod: z.enum(['stripe', 'paypal']).optional().default('stripe'),
    });

    const data = checkoutSchema.parse(req.body);
    const tenant = req.tenant!;

    // Check if the selected payment method is available
    const stripeAvailable = tenant.stripeEnabled && tenant.stripeSecretKeyEncrypted;
    const paypalAvailable = isTenantPayPalConfigured(tenant);

    if (data.paymentMethod === 'stripe' && !stripeAvailable) {
      return res.status(400).json({ error: 'Stripe payments are not configured for this organization' });
    }
    
    if (data.paymentMethod === 'paypal' && !paypalAvailable) {
      return res.status(400).json({ error: 'PayPal payments are not configured' });
    }

    if (!stripeAvailable && !paypalAvailable) {
      return res.status(400).json({ error: 'No payment methods are configured for this organization' });
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

      const itemTotal = unitPrice * item.quantity;
      subtotal += itemTotal;

      if (product.productType === 'physical') {
        hasPhysicalProduct = true;
      }

      // Generate raffle ticket numbers if this is a raffle
      let raffleTicketNumbers: string[] | undefined;
      if (product.productType === 'raffle') {
        // Generate unique ticket numbers
        const ticketCount = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(shopOrderItems)
          .where(eq(shopOrderItems.productId, product.id));
        
        const startNumber = (ticketCount[0]?.count || 0) + 1;
        raffleTicketNumbers = Array.from(
          { length: item.quantity }, 
          (_, i) => String(startNumber + i).padStart(6, '0')
        );
      }

      orderItems.push({
        productId: product.id,
        variantId: item.variantId,
        productName: product.name,
        variantName,
        productType: product.productType,
        quantity: item.quantity,
        unitPrice: unitPrice.toFixed(2),
        totalPrice: itemTotal.toFixed(2),
        raffleTicketNumbers,
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

    // Calculate totals (no tax/shipping for now - can be added later)
    const totalAmount = subtotal;

    // Create order in database
    const [order] = await db.insert(shopOrders).values({
      tenantId: tenant.id,
      orderNumber,
      customerEmail: data.customerEmail,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      shippingAddress: data.shippingAddress,
      subtotal: subtotal.toFixed(2),
      shippingAmount: '0',
      taxAmount: '0',
      totalAmount: totalAmount.toFixed(2),
      paymentStatus: 'pending',
      paymentMethod: data.paymentMethod,
      customerNotes: data.customerNotes,
      fulfillmentStatus: hasPhysicalProduct ? 'unfulfilled' : 'delivered',
    }).returning();

    // Create order items
    for (const item of orderItems) {
      await db.insert(shopOrderItems).values({
        orderId: order.id,
        productId: item.productId,
        variantId: item.variantId,
        tenantId: tenant.id,
        productName: item.productName,
        variantName: item.variantName,
        productType: item.productType,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        raffleTicketNumbers: item.raffleTicketNumbers,
      });
    }

    // Handle payment based on method
    if (data.paymentMethod === 'stripe') {
      // Decrypt Stripe secret key and create PaymentIntent
      const { decrypt } = await import('../lib/encryption');
      const stripeSecretKey = decrypt(tenant.stripeSecretKeyEncrypted!);
      const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-09-30.clover' });

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(totalAmount * 100), // Stripe uses cents
        currency: 'usd',
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          tenantId: tenant.id,
        },
        receipt_email: data.customerEmail,
        description: `Order ${orderNumber} from ${tenant.name}`,
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
        clientSecret: paymentIntent.client_secret,
        totalAmount: totalAmount.toFixed(2),
      });
    } else {
      // PayPal - just return the order info, PayPal payment will be created on the frontend
      res.json({
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalAmount: totalAmount.toFixed(2),
      });
    }
  } catch (error) {
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
    if (!tenant.stripeSecretKeyEncrypted) {
      return res.status(400).json({ error: 'Stripe not configured' });
    }

    const { decrypt } = await import('../lib/encryption');
    const stripeSecretKey = decrypt(tenant.stripeSecretKeyEncrypted);
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-09-30.clover' });

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      // Update order status
      await db.update(shopOrders)
        .set({ 
          paymentStatus: 'paid',
          stripeChargeId: paymentIntent.latest_charge as string,
          updatedAt: new Date(),
        })
        .where(eq(shopOrders.id, order.id));

      // Update inventory for variants
      const orderItems = await db
        .select()
        .from(shopOrderItems)
        .where(eq(shopOrderItems.orderId, order.id));

      for (const item of orderItems) {
        if (item.variantId) {
          await db.update(shopProductVariants)
            .set({ 
              inventory: sql`${shopProductVariants.inventory} - ${item.quantity}` 
            })
            .where(eq(shopProductVariants.id, item.variantId));
        }
      }

      // Get order items for response
      const items = await db
        .select()
        .from(shopOrderItems)
        .where(eq(shopOrderItems.orderId, order.id));

      res.json({ 
        success: true,
        order: {
          ...order,
          paymentStatus: 'paid',
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

    res.json({ 
      order: {
        ...order,
        items,
      }
    });
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
router.get('/admin/products', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'staff'].includes(req.user!.activeRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

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
router.post('/admin/products', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'staff'].includes(req.user!.activeRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const productData = insertShopProductSchema.parse({
      ...req.body,
      tenantId: req.tenant!.id,
    });

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
router.patch('/admin/products/:id', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'staff'].includes(req.user!.activeRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

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

    const updateData = insertShopProductSchema.partial().parse(req.body);
    
    const [product] = await db
      .update(shopProducts)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(shopProducts.id, req.params.id))
      .returning();

    res.json({ product });
  } catch (error) {
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
router.delete('/admin/products/:id', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (req.user!.activeRole !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }

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
router.post('/admin/products/:id/variants', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'staff'].includes(req.user!.activeRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

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
router.patch('/admin/variants/:id', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'staff'].includes(req.user!.activeRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

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
router.delete('/admin/variants/:id', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'staff'].includes(req.user!.activeRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

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
router.get('/admin/orders', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'staff'].includes(req.user!.activeRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

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
router.patch('/admin/orders/:id', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'staff'].includes(req.user!.activeRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

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
 * GET /api/shop/admin/raffles
 * Get all raffle products for management
 */
router.get('/admin/raffles', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'staff'].includes(req.user!.activeRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

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

    const ticketCountMap = new Map(ticketCounts.map(t => [t.productId, t.count]));

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

    const rafflesWithStats = raffles.map(r => ({
      ...r,
      ticketsSold: ticketCountMap.get(r.id) || 0,
      drawing: drawingMap.get(r.id),
    }));

    res.json({ raffles: rafflesWithStats });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/shop/admin/raffles/:id/draw
 * Draw a winner for a raffle
 */
router.post('/admin/raffles/:id/draw', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (req.user!.activeRole !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }

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

    // Get all paid tickets for this raffle
    const tickets = await db
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

    if (tickets.length === 0) {
      return res.status(400).json({ error: 'No tickets sold for this raffle' });
    }

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

    // Random draw
    const winnerIndex = Math.floor(Math.random() * allTickets.length);
    const winner = allTickets[winnerIndex];

    // Create drawing record
    const [drawing] = await db.insert(shopRaffleDrawings).values({
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
    }).returning();

    res.json({ 
      drawing,
      totalTickets: allTickets.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/shop/admin/stats
 * Get shop statistics
 */
router.get('/admin/stats', requireTenant, requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'staff'].includes(req.user!.activeRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

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

// ============================================================================
// PayPal Payment Routes
// ============================================================================

/**
 * GET /api/shop/paypal/setup
 * Get PayPal client token for SDK initialization
 */
router.get('/paypal/setup', requireTenant, async (req, res, next) => {
  try {
    await loadPaypalDefault(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/shop/paypal/order
 * Create a PayPal order
 */
router.post('/paypal/order', requireTenant, async (req, res, next) => {
  try {
    await createPaypalOrder(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/shop/paypal/order/:orderID/capture
 * Capture a PayPal order after approval
 */
router.post('/paypal/order/:orderID/capture', requireTenant, async (req, res, next) => {
  try {
    await capturePaypalOrder(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/shop/paypal/available
 * Check if PayPal is configured for this tenant
 */
router.get('/paypal/available', requireTenant, async (req, res) => {
  res.json({ available: isTenantPayPalConfigured(req.tenant!) });
});

/**
 * POST /api/shop/checkout/paypal-confirm
 * Confirm payment was successful via PayPal and finalize the order
 */
router.post('/checkout/paypal-confirm', requireTenant, async (req, res, next) => {
  try {
    const { orderId, paypalOrderId, paypalCaptureId } = req.body;

    if (!orderId || !paypalOrderId) {
      return res.status(400).json({ error: 'Order ID and PayPal Order ID are required' });
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

    // Update order status
    await db.update(shopOrders)
      .set({ 
        paymentStatus: 'paid',
        paymentMethod: 'paypal',
        paypalOrderId: paypalOrderId,
        paypalCaptureId: paypalCaptureId,
        updatedAt: new Date(),
      })
      .where(eq(shopOrders.id, order.id));

    // Update inventory for variants
    const orderItems = await db
      .select()
      .from(shopOrderItems)
      .where(eq(shopOrderItems.orderId, order.id));

    for (const item of orderItems) {
      if (item.variantId) {
        await db.update(shopProductVariants)
          .set({ 
            inventory: sql`${shopProductVariants.inventory} - ${item.quantity}` 
          })
          .where(eq(shopProductVariants.id, item.variantId));
      }
    }

    res.json({ 
      success: true,
      order: {
        ...order,
        paymentStatus: 'paid',
        paymentMethod: 'paypal',
        items: orderItems,
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;

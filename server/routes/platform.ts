import { Router } from 'express';
import { db } from '../db';
import { 
  tenants, users, animals, featureFlags, auditLogs, 
  platformAnnouncements, platformSettings,
  insertTenantSchema, insertFeatureFlagSchema,
  insertPlatformAnnouncementSchema, insertPlatformSettingSchema,
  applications, donations, volunteerOpportunities
} from '@shared/schema';
import { requireAuth } from '../middleware/auth';
import { requirePlatformAdmin } from '../middleware/tenant';
import { eq, count, gte, and, sql, desc, or, isNull, lte } from 'drizzle-orm';
import { createAuditLog } from '../audit';
import { hash } from 'bcrypt';
import Stripe from 'stripe';
import { z } from 'zod';
import { resetDemoData } from '../lib/demo-reset';
import { EmailService } from '../lib/email-service';

// Initialize Stripe
// In development, use test keys; in production, use live keys
const isDevelopment = process.env.NODE_ENV === 'development';
const stripeSecretKey = isDevelopment 
  ? process.env.TESTING_STRIPE_SECRET_KEY 
  : process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error(`Missing required Stripe secret: ${isDevelopment ? 'TESTING_STRIPE_SECRET_KEY' : 'STRIPE_SECRET_KEY'}`);
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2025-09-30.clover',
});

const router = Router();

// ============================================================================
// Public Stripe Subscription Routes (NO AUTH REQUIRED)
// ============================================================================

/**
 * POST /api/platform/create-subscription
 * Create a Stripe subscription for a new tenant signup
 * PUBLIC ROUTE - Used during tenant signup flow
 */
router.post('/create-subscription', async (req, res, next) => {
  try {
    console.log('🚀 [CREATE-SUBSCRIPTION] Endpoint called');
    const subscriptionSchema = z.object({
      tenantId: z.string().uuid(), // Tenant must be created first
      email: z.string().email(),
      rescueName: z.string().min(1),
      priceId: z.string().min(1), // Stripe price ID
      tier: z.enum(['free', 'professional']),
    });

    const data = subscriptionSchema.parse(req.body);
    
    console.log('💳 [CREATE-SUBSCRIPTION] Request data:', {
      tenantId: data.tenantId,
      email: data.email,
      rescueName: data.rescueName,
      priceId: data.priceId,
      tier: data.tier
    });

    // Verify tenant exists
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, data.tenantId))
      .limit(1);

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check for duplicate subscription - prevent creating subscription if one already exists
    if (tenant.stripeCustomerId) {
      return res.status(400).json({ 
        error: 'Subscription already exists',
        message: 'This organization already has an active subscription. Please contact support if you need assistance.'
      });
    }

    // Create Stripe customer with idempotency key to prevent duplicates
    let customer;
    try {
      console.log('💰 [CREATE-SUBSCRIPTION] Creating Stripe customer...');
      customer = await stripe.customers.create({
        email: data.email,
        name: data.rescueName,
        metadata: {
          tenantId: data.tenantId,
          tier: data.tier,
        },
      }, {
        idempotencyKey: `customer_${data.tenantId}`,
      });
      console.log('✅ [CREATE-SUBSCRIPTION] Stripe customer created:', customer.id);
    } catch (stripeError: any) {
      console.error('❌ [CREATE-SUBSCRIPTION] Stripe customer creation error:', stripeError);
      return res.status(500).json({
        error: 'Failed to create payment profile',
        message: 'We encountered an issue setting up your payment profile. Please try again or contact support.'
      });
    }

    // Create Stripe subscription with 30-day trial
    // Use idempotency key to prevent duplicate subscriptions
    let subscription;
    try {
      console.log('🔄 [CREATE-SUBSCRIPTION] Creating Stripe subscription with 30-day trial...');
      subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: data.priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
        trial_period_days: 30, // 30-day free trial for all new subscriptions
      }, {
        idempotencyKey: `subscription_${data.tenantId}_${data.tier}`,
      });
      console.log('✅ [CREATE-SUBSCRIPTION] Stripe subscription created:', {
        id: subscription.id,
        status: subscription.status,
        trial_end: subscription.trial_end
      });
    } catch (stripeError: any) {
      console.error('❌ [CREATE-SUBSCRIPTION] Stripe subscription creation error:', stripeError);
      return res.status(500).json({
        error: 'Failed to create subscription',
        message: stripeError.message || 'We encountered an issue creating your subscription. Please try again or contact support.'
      });
    }

    // Extract client secret from the subscription
    const latestInvoice = subscription.latest_invoice as any;
    let clientSecret: string | null = null;
    
    if (latestInvoice && typeof latestInvoice === 'object') {
      const paymentIntent = latestInvoice.payment_intent;
      if (paymentIntent && typeof paymentIntent === 'object') {
        clientSecret = paymentIntent.client_secret || null;
      }
    }

    // For trials, there's no immediate payment needed, so clientSecret will be null
    // This is expected and we should activate the tenant immediately
    const isTrialing = subscription.status === 'trialing';
    
    if (!clientSecret && !isTrialing) {
      console.error('No client secret returned from Stripe subscription creation and subscription is not trialing');
      return res.status(500).json({
        error: 'Payment setup incomplete',
        message: 'Your subscription was created but we couldn\'t set up payment. Please add a payment method in your account settings or contact support.'
      });
    }

    // Calculate trial end date
    const trialEndsAt = subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Update tenant with Stripe IDs
    await db
      .update(tenants)
      .set({
        stripeCustomerId: customer.id,
        stripeSubscriptionId: subscription.id,
        stripePriceId: data.priceId,
        subscriptionTier: data.tier,
        subscriptionStatus: 'trial',
        trialEndsAt,
      })
      .where(eq(tenants.id, data.tenantId));

    console.log('✅ [CREATE-SUBSCRIPTION] Subscription creation complete!', {
      subscriptionId: subscription.id,
      customerId: customer.id,
      isTrialing,
      hasClientSecret: !!clientSecret
    });

    // If trialing, we don't need payment confirmation, return success immediately
    res.json({
      subscriptionId: subscription.id,
      customerId: customer.id,
      clientSecret: clientSecret || undefined, // Return undefined instead of null for trials
      requiresPayment: !isTrialing, // Frontend can use this to skip payment step
    });
  } catch (error: any) {
    console.error('Stripe subscription creation error:', error);
    
    // Handle Zod validation errors
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Invalid request data',
        message: 'Please check your information and try again.'
      });
    }
    
    // Handle Stripe-specific errors
    if (error.type && error.type.startsWith('Stripe')) {
      return res.status(500).json({
        error: 'Payment processing error',
        message: error.message || 'We encountered an issue with the payment service. Please try again later.'
      });
    }
    
    // Generic error handler
    next(error);
  }
});

/**
 * POST /api/platform/finalize-subscription
 * Finalize subscription after successful payment
 * PUBLIC ROUTE - Called after payment confirmation on frontend
 */
router.post('/finalize-subscription', async (req, res, next) => {
  try {
    const finalizeSchema = z.object({
      tenantId: z.string().uuid(),
      subscriptionId: z.string().min(1),
    });

    const data = finalizeSchema.parse(req.body);

    // Verify tenant exists
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, data.tenantId))
      .limit(1);

    if (!tenant) {
      return res.status(404).json({ 
        error: 'Tenant not found',
        message: 'The organization could not be found. Please contact support.'
      });
    }

    // Fetch subscription from Stripe to verify it exists and get details
    let subscription;
    try {
      subscription = await stripe.subscriptions.retrieve(data.subscriptionId);
    } catch (stripeError: any) {
      console.error('Stripe subscription retrieval error:', stripeError);
      return res.status(404).json({
        error: 'Subscription not found',
        message: 'The subscription could not be verified. Please contact support.'
      });
    }

    // Verify subscription belongs to this tenant's customer
    if (tenant.stripeCustomerId && subscription.customer !== tenant.stripeCustomerId) {
      console.error('Subscription customer mismatch', {
        tenantId: data.tenantId,
        expectedCustomer: tenant.stripeCustomerId,
        actualCustomer: subscription.customer,
      });
      return res.status(400).json({
        error: 'Subscription mismatch',
        message: 'The subscription does not match this organization. Please contact support.'
      });
    }

    // Get the price ID from the subscription
    const priceId = subscription.items.data[0]?.price.id || null;

    // Map Stripe subscription status to our status
    // Stripe statuses: incomplete, incomplete_expired, trialing, active, past_due, canceled, unpaid
    // Our allowed statuses: trial, active, cancelled, suspended
    let subscriptionStatus: 'trial' | 'active' | 'cancelled' | 'suspended';
    if (subscription.status === 'active') {
      subscriptionStatus = 'active';
    } else if (subscription.status === 'trialing') {
      subscriptionStatus = 'trial';
    } else if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
      subscriptionStatus = 'suspended';
    } else if (subscription.status === 'canceled' || subscription.status === 'incomplete_expired') {
      subscriptionStatus = 'cancelled';
    } else if (subscription.status === 'incomplete') {
      // Incomplete subscriptions should be retried, mark as suspended
      subscriptionStatus = 'suspended';
    } else {
      // Default fallback for any unknown status
      subscriptionStatus = 'suspended';
    }

    // Update tenant with verified subscription details from Stripe
    const [updatedTenant] = await db
      .update(tenants)
      .set({
        stripeCustomerId: subscription.customer as string,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        subscriptionStatus: subscriptionStatus,
      })
      .where(eq(tenants.id, data.tenantId))
      .returning();

    console.log('Subscription finalized successfully', {
      tenantId: data.tenantId,
      subscriptionId: subscription.id,
      status: subscriptionStatus,
    });

    // Send welcome emails after successful subscription activation
    try {
      // Get admin user for this tenant
      const [adminUser] = await db
        .select()
        .from(users)
        .where(and(
          eq(users.tenantId, data.tenantId),
          eq(users.role, 'admin')
        ))
        .limit(1);

      if (adminUser) {
        // Send welcome email to tenant admin
        await EmailService.sendTenantWelcomeEmail({
          rescueName: updatedTenant.name,
          adminEmail: adminUser.email,
          subdomain: updatedTenant.subdomain,
          tier: updatedTenant.tier,
        });
        console.log('Welcome email sent to tenant admin:', adminUser.email);

        // Send notification to platform admin
        await EmailService.sendNewTenantNotification({
          rescueName: updatedTenant.name,
          adminEmail: adminUser.email,
          subdomain: updatedTenant.subdomain,
          tier: updatedTenant.tier,
        });
        console.log('Notification email sent to platform admin');
      } else {
        console.warn('No admin user found for tenant:', data.tenantId);
      }
    } catch (emailError) {
      // Log email errors but don't fail the request
      console.error('Email sending error (non-critical):', emailError);
    }

    res.json({
      success: true,
      subdomain: updatedTenant.subdomain,
      subscription: {
        id: subscription.id,
        status: subscriptionStatus,
        customerId: subscription.customer,
      },
    });
  } catch (error: any) {
    console.error('Finalize subscription error:', error);
    
    // Handle Zod validation errors
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Invalid request data',
        message: 'Please check your information and try again.'
      });
    }
    
    // Handle Stripe-specific errors
    if (error.type && error.type.startsWith('Stripe')) {
      return res.status(500).json({
        error: 'Payment processing error',
        message: error.message || 'We encountered an issue verifying your subscription. Please contact support.'
      });
    }
    
    // Generic error handler
    next(error);
  }
});

// All other platform admin routes require authentication and platform admin role
router.use(requireAuth, requirePlatformAdmin);

/**
 * POST /api/platform/demo/reset
 * Manually reset demo tenant data (platform admin only)
 */
router.post('/demo/reset', async (req, res, next) => {
  try {
    console.log('🔄 Manual demo reset triggered by platform admin');
    
    const result = await resetDemoData();
    
    if (result.success) {
      // Log audit entry
      if (req.user) {
        await createAuditLog({
          userId: req.user.id,
          tenantId: req.user.tenantId,
          action: 'demo_reset',
          entityType: 'tenant',
          entityId: 'demo',
          changes: { after: result.deletedCounts },
          req,
        });
      }
      
      res.json({
        success: true,
        message: result.message,
        deletedCounts: result.deletedCounts,
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error: any) {
    console.error('❌ Manual demo reset failed:', error);
    next(error);
  }
});

/**
 * GET /api/platform/stats
 * Get platform-wide statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    // Count total and active tenants
    const [totalTenantsResult] = await db
      .select({ count: count() })
      .from(tenants);
    
    const [activeTenantsResult] = await db
      .select({ count: count() })
      .from(tenants)
      .where(eq(tenants.isActive, true));
    
    // Count total users (excluding platform tenant users)
    const [platformTenant] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.subdomain, 'platform'))
      .limit(1);
    
    const usersWhere = platformTenant ? sql`${users.tenantId} != ${platformTenant.id}` : sql`true`;
    const [totalUsersResult] = await db
      .select({ count: count() })
      .from(users)
      .where(usersWhere);
    
    // Total animals across all tenants
    const [totalAnimalsResult] = await db
      .select({ count: count() })
      .from(animals);
    
    // New tenants this month
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);
    
    const [newTenantsResult] = await db
      .select({ count: count() })
      .from(tenants)
      .where(gte(tenants.createdAt, firstDayOfMonth));
    
    const newUsersWhere = platformTenant 
      ? and(
          gte(users.createdAt, firstDayOfMonth),
          sql`${users.tenantId} != ${platformTenant.id}`
        )
      : gte(users.createdAt, firstDayOfMonth);
    
    const [newUsersResult] = await db
      .select({ count: count() })
      .from(users)
      .where(newUsersWhere);

    res.json({
      totalTenants: totalTenantsResult.count,
      activeTenants: activeTenantsResult.count,
      totalUsers: totalUsersResult.count,
      totalAnimals: totalAnimalsResult.count,
      recentActivity: {
        newTenantsThisMonth: newTenantsResult.count,
        newUsersThisMonth: newUsersResult.count,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/platform/tenants
 * Get all tenants with their stats
 */
router.get('/tenants', async (req, res, next) => {
  try {
    // Get all tenants except platform tenant
    const allTenants = await db
      .select({
        id: tenants.id,
        subdomain: tenants.subdomain,
        name: tenants.name,
        contactEmail: tenants.contactEmail,
        customDomain: tenants.customDomain,
        customDomainVerified: tenants.customDomainVerified,
        isActive: tenants.isActive,
        createdAt: tenants.createdAt,
        platformFeePercent: tenants.platformFeePercent,
      })
      .from(tenants)
      .where(sql`${tenants.subdomain} != 'platform'`)
      .orderBy(tenants.createdAt);

    // Get stats for each tenant
    const tenantsWithStats = await Promise.all(
      allTenants.map(async (tenant) => {
        const [userCountResult] = await db
          .select({ count: count() })
          .from(users)
          .where(eq(users.tenantId, tenant.id));
        
        const [animalCountResult] = await db
          .select({ count: count() })
          .from(animals)
          .where(eq(animals.tenantId, tenant.id));

        return {
          ...tenant,
          stats: {
            userCount: userCountResult.count,
            animalCount: animalCountResult.count,
          },
        };
      })
    );

    res.json({ tenants: tenantsWithStats });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/platform/users
 * Get all users across all tenants
 */
router.get('/users', async (req, res, next) => {
  try {
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        roles: users.roles,
        tenantId: users.tenantId,
        isActive: users.isActive,
        createdAt: users.createdAt,
        tenantName: tenants.name,
        tenantSubdomain: tenants.subdomain,
      })
      .from(users)
      .innerJoin(tenants, eq(users.tenantId, tenants.id))
      .where(sql`${tenants.subdomain} != 'platform'`)
      .orderBy(users.createdAt);

    res.json({ users: allUsers });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/platform/tenants
 * Create a new tenant
 */
router.post('/tenants', async (req, res, next) => {
  try {
    const validatedData = insertTenantSchema.parse(req.body);

    // Check if subdomain already exists
    const existing = await db
      .select()
      .from(tenants)
      .where(eq(tenants.subdomain, validatedData.subdomain))
      .limit(1);

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Subdomain already exists' });
    }

    const [newTenant] = await db
      .insert(tenants)
      .values([validatedData as any])
      .returning();

    // Log the action
    await createAuditLog({
      userId: req.user!.id,
      action: 'tenant.create',
      entityType: 'tenant',
      entityId: newTenant.id,
      changes: { after: newTenant },
      req,
    });

    res.status(201).json({ tenant: newTenant });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/platform/tenants/:id
 * Update a tenant
 */
router.patch('/tenants/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get existing tenant
    const [existing] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Whitelist of allowed fields to update (prevents accidentally nullifying required fields)
    const allowedFields = [
      'name', 'tagline', 'logoUrl', 'heroImageUrl', 'branding',
      'contactEmail', 'contactPhone', 'address', 'city', 'state', 'zipCode',
      'websiteUrl', 'facebookUrl', 'instagramUrl', 'twitterUrl',
      'subscriptionTier', 'subscriptionStatus', 'platformFeePercent',
      'trialEndsAt', 'proTrialUsed', 'heroLayout', 'isActive'
    ];
    
    // Build update object with only allowed fields that are present in request
    const updateData: Record<string, any> = {};
    for (const field of allowedFields) {
      if (field in req.body) {
        updateData[field] = req.body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Update tenant
    const [updated] = await db
      .update(tenants)
      .set(updateData)
      .where(eq(tenants.id, id))
      .returning();

    // Log the action
    await createAuditLog({
      userId: req.user!.id,
      action: 'tenant.update',
      entityType: 'tenant',
      entityId: id,
      changes: { before: existing, after: updated },
      req,
    });

    res.json({ tenant: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/platform/tenants/:id/send-dns-records
 * Send custom domain DNS records email to tenant admin
 * Platform admin provides the A record and TXT record values from Replit
 */
router.post('/tenants/:id/send-dns-records', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const dnsRecordsSchema = z.object({
      aRecordValue: z.string().min(1, "A record IP address is required"),
      txtRecordValue: z.string().min(1, "TXT record value is required"),
    });
    
    const { aRecordValue, txtRecordValue } = dnsRecordsSchema.parse(req.body);

    // Get tenant details
    const [tenant] = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        subdomain: tenants.subdomain,
        customDomain: tenants.customDomain,
      })
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1);

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (!tenant.customDomain) {
      return res.status(400).json({ error: 'Tenant does not have a custom domain configured' });
    }

    // Get admin user email for the tenant
    const [adminUser] = await db
      .select({
        email: users.email,
        fullName: users.fullName,
      })
      .from(users)
      .where(and(
        eq(users.tenantId, id),
        sql`'admin' = ANY(${users.roles})`
      ))
      .limit(1);

    if (!adminUser) {
      return res.status(400).json({ error: 'No admin user found for this tenant' });
    }

    // Send the DNS records email
    const emailSent = await EmailService.sendCustomDomainDnsRecords({
      rescueName: tenant.name,
      adminEmail: adminUser.email,
      customDomain: tenant.customDomain,
      aRecordValue,
      txtRecordValue,
    });

    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send DNS records email' });
    }

    // Log the action
    await createAuditLog({
      userId: req.user!.id,
      action: 'tenant.send_dns_records',
      entityType: 'tenant',
      entityId: id,
      changes: { 
        customDomain: tenant.customDomain,
        adminEmail: adminUser.email,
        aRecordValue,
        txtRecordValue: txtRecordValue.substring(0, 20) + '...' // Truncate for privacy
      },
      req,
    });

    res.json({ 
      success: true, 
      message: `DNS records email sent to ${adminUser.email}`,
      customDomain: tenant.customDomain,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/platform/users/:id
 * Update a user (including disable/enable)
 */
router.patch('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get existing user
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user
    const [updated] = await db
      .update(users)
      .set(req.body)
      .where(eq(users.id, id))
      .returning();

    // Log the action
    await createAuditLog({
      userId: req.user!.id,
      action: 'user.update',
      entityType: 'user',
      entityId: id,
      tenantId: existing.tenantId,
      changes: { before: existing, after: updated },
      req,
    });

    res.json({ user: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/platform/feature-flags
 * Get all feature flags
 */
router.get('/feature-flags', async (req, res, next) => {
  try {
    const flags = await db
      .select()
      .from(featureFlags)
      .orderBy(featureFlags.featureName);

    res.json({ featureFlags: flags });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/platform/feature-flags
 * Create or update a feature flag
 */
router.post('/feature-flags', async (req, res, next) => {
  try {
    const validatedData = insertFeatureFlagSchema.parse(req.body);

    // Check if flag exists
    const where = validatedData.tenantId
      ? and(
          eq(featureFlags.tenantId, validatedData.tenantId),
          eq(featureFlags.featureName, validatedData.featureName)
        )
      : and(
          isNull(featureFlags.tenantId),
          eq(featureFlags.featureName, validatedData.featureName)
        );

    const [existing] = await db
      .select()
      .from(featureFlags)
      .where(where!)
      .limit(1);

    let flag;
    if (existing) {
      // Update existing
      [flag] = await db
        .update(featureFlags)
        .set(validatedData)
        .where(eq(featureFlags.id, existing.id))
        .returning();
    } else {
      // Create new
      [flag] = await db
        .insert(featureFlags)
        .values(validatedData)
        .returning();
    }

    // Log the action
    await createAuditLog({
      userId: req.user!.id,
      action: existing ? 'feature_flag.update' : 'feature_flag.create',
      entityType: 'feature_flag',
      entityId: flag.id,
      changes: existing ? { before: existing, after: flag } : { after: flag },
      req,
    });

    res.json({ featureFlag: flag });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/platform/audit-logs
 * Get audit logs with pagination and filtering
 */
router.get('/audit-logs', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const logs = await db
      .select({
        id: auditLogs.id,
        userId: auditLogs.userId,
        tenantId: auditLogs.tenantId,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        changes: auditLogs.changes,
        metadata: auditLogs.metadata,
        ipAddress: auditLogs.ipAddress,
        userAgent: auditLogs.userAgent,
        createdAt: auditLogs.createdAt,
        userName: users.fullName,
        userEmail: users.email,
        tenantName: tenants.name,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .leftJoin(tenants, eq(auditLogs.tenantId, tenants.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ logs });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/platform/settings
 * Get all platform settings
 */
router.get('/settings', async (req, res, next) => {
  try {
    const settings = await db
      .select()
      .from(platformSettings)
      .orderBy(platformSettings.category, platformSettings.key);

    res.json({ settings });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/platform/settings/:key
 * Create or update a platform setting
 */
router.put('/settings/:key', async (req, res, next) => {
  try {
    const { key } = req.params;
    const validatedData = insertPlatformSettingSchema.parse({
      ...req.body,
      key,
      updatedBy: req.user!.id,
    });

    // Check if setting exists
    const [existing] = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.key, key))
      .limit(1);

    let setting;
    if (existing) {
      // Update existing
      [setting] = await db
        .update(platformSettings)
        .set({...validatedData as any})
        .where(eq(platformSettings.key, key))
        .returning();
    } else {
      // Create new
      [setting] = await db
        .insert(platformSettings)
        .values([validatedData as any])
        .returning();
    }

    // Log the action
    await createAuditLog({
      userId: req.user!.id,
      action: existing ? 'platform_setting.update' : 'platform_setting.create',
      entityType: 'platform_setting',
      entityId: setting.id,
      changes: existing ? { before: existing, after: setting } : { after: setting },
      req,
    });

    res.json({ setting });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/platform/announcements
 * Get active platform announcements
 */
router.get('/announcements', async (req, res, next) => {
  try {
    const now = new Date();

    const announcements = await db
      .select()
      .from(platformAnnouncements)
      .where(
        and(
          eq(platformAnnouncements.isActive, true),
          lte(platformAnnouncements.startDate, now),
          or(
            isNull(platformAnnouncements.endDate),
            gte(platformAnnouncements.endDate, now)
          )
        )
      )
      .orderBy(desc(platformAnnouncements.priority), desc(platformAnnouncements.createdAt));

    res.json({ announcements });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/platform/announcements
 * Create a new announcement
 */
router.post('/announcements', async (req, res, next) => {
  try {
    const validatedData = insertPlatformAnnouncementSchema.parse({
      ...req.body,
      createdBy: req.user!.id,
    });

    const [announcement] = await db
      .insert(platformAnnouncements)
      .values([validatedData as any])
      .returning();

    // Log the action
    await createAuditLog({
      userId: req.user!.id,
      action: 'announcement.create',
      entityType: 'announcement',
      entityId: announcement.id,
      changes: { after: announcement },
      req,
    });

    res.status(201).json({ announcement });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/platform/announcements/:id
 * Update an announcement
 */
router.patch('/announcements/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const [existing] = await db
      .select()
      .from(platformAnnouncements)
      .where(eq(platformAnnouncements.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    const [updated] = await db
      .update(platformAnnouncements)
      .set(req.body)
      .where(eq(platformAnnouncements.id, id))
      .returning();

    // Log the action
    await createAuditLog({
      userId: req.user!.id,
      action: 'announcement.update',
      entityType: 'announcement',
      entityId: id,
      changes: { before: existing, after: updated },
      req,
    });

    res.json({ announcement: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/platform/health
 * Get system health metrics
 */
router.get('/health', async (req, res, next) => {
  try {
    // Database stats
    const dbStats = await db.execute(sql`
      SELECT 
        pg_database_size(current_database()) as db_size,
        (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections
    `);

    // Recent activity metrics
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [newAnimals] = await db
      .select({ count: count() })
      .from(animals)
      .where(gte(animals.createdAt, last24Hours));

    const [newApplications] = await db
      .select({ count: count() })
      .from(applications)
      .where(gte(applications.createdAt, last24Hours));

    const [newDonations] = await db
      .select({ count: count() })
      .from(donations)
      .where(gte(donations.createdAt, last24Hours));

    res.json({
      database: {
        size: dbStats.rows[0].db_size,
        activeConnections: dbStats.rows[0].active_connections,
      },
      activity24h: {
        newAnimals: newAnimals.count,
        newApplications: newApplications.count,
        newDonations: newDonations.count,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/platform/impersonate/:tenantId
 * Start impersonating a tenant
 */
router.post('/impersonate/:tenantId', async (req, res, next) => {
  try {
    // Prevent nested impersonation
    if (req.session.impersonating) {
      return res.status(400).json({ 
        error: 'Already impersonating', 
        message: 'Please exit current impersonation before starting a new one' 
      });
    }

    const { tenantId } = req.params;

    // Verify tenant exists and is active
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (!tenant.isActive) {
      return res.status(403).json({ error: 'Cannot impersonate inactive tenant' });
    }

    // Store original session data before switching
    req.session.originalUserId = req.session.userId;
    req.session.originalTenantId = req.session.tenantId;
    req.session.impersonating = true;
    req.session.impersonatedTenantId = tenantId;
    
    // Switch session to impersonated tenant
    req.session.tenantId = tenantId;
    // Clear active role so it gets re-determined for the impersonated tenant
    req.session.activeRole = undefined;

    // Create audit log
    await createAuditLog({
      userId: req.user!.id,
      tenantId: req.user!.tenantId,
      action: 'impersonate_start',
      entityType: 'session',
      metadata: {
        impersonatedTenantId: tenantId,
        impersonatedTenantName: tenant.name,
        impersonatedTenantSubdomain: tenant.subdomain,
        success: true,
        timestamp: new Date().toISOString(),
      },
      req,
    });

    res.json({
      success: true,
      impersonatedTenant: {
        id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/platform/end-impersonation
 * End impersonation and return to platform admin view
 */
router.post('/end-impersonation', async (req, res, next) => {
  try {
    if (!req.session.impersonating) {
      return res.status(400).json({ error: 'Not currently impersonating' });
    }

    const impersonatedTenantId = req.session.impersonatedTenantId;

    // Restore original session data
    if (req.session.originalTenantId) {
      req.session.tenantId = req.session.originalTenantId;
    }
    if (req.session.originalUserId) {
      req.session.userId = req.session.originalUserId;
    }
    
    // Clear impersonation flags
    req.session.impersonating = false;
    req.session.impersonatedTenantId = undefined;
    req.session.originalUserId = undefined;
    req.session.originalTenantId = undefined;
    req.session.activeRole = undefined; // Clear to force re-determination

    // Create audit log
    await createAuditLog({
      userId: req.user!.id,
      tenantId: req.user!.tenantId,
      action: 'impersonate_end',
      entityType: 'session',
      metadata: {
        impersonatedTenantId,
        success: true,
        timestamp: new Date().toISOString(),
      },
      req,
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/platform/impersonation-status
 * Check current impersonation status
 */
router.get('/impersonation-status', async (req, res, next) => {
  try {
    if (!req.session.impersonating || !req.session.impersonatedTenantId) {
      return res.json({ impersonating: false });
    }

    // Get impersonated tenant details
    const [tenant] = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        subdomain: tenants.subdomain,
      })
      .from(tenants)
      .where(eq(tenants.id, req.session.impersonatedTenantId))
      .limit(1);

    if (!tenant) {
      // Tenant was deleted, end impersonation
      req.session.impersonating = false;
      req.session.impersonatedTenantId = undefined;
      return res.json({ impersonating: false });
    }

    res.json({
      impersonating: true,
      tenant,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/platform/subscription-status/:tenantId
 * Get subscription status for a tenant
 */
router.get('/subscription-status/:tenantId', async (req, res, next) => {
  try {
    const [tenant] = await db
      .select({
        id: tenants.id,
        subscriptionTier: tenants.subscriptionTier,
        subscriptionStatus: tenants.subscriptionStatus,
        stripeCustomerId: tenants.stripeCustomerId,
        stripeSubscriptionId: tenants.stripeSubscriptionId,
      })
      .from(tenants)
      .where(eq(tenants.id, req.params.tenantId))
      .limit(1);

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // If tenant has a Stripe subscription, fetch live status
    let stripeSubscription: Stripe.Subscription | null = null;
    if (tenant.stripeSubscriptionId) {
      try {
        stripeSubscription = await stripe.subscriptions.retrieve(tenant.stripeSubscriptionId);
      } catch (error) {
        console.error('Error fetching Stripe subscription:', error);
      }
    }

    res.json({
      tenantId: tenant.id,
      tier: tenant.subscriptionTier,
      status: tenant.subscriptionStatus,
      stripeStatus: stripeSubscription?.status || null,
      currentPeriodEnd: stripeSubscription 
        ? new Date((stripeSubscription as any).current_period_end * 1000) 
        : null,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/platform/create-billing-portal-session
 * Create a Stripe Customer Portal session for subscription management
 * This allows tenant admins to manage their subscription, update payment methods, and cancel
 */
router.post('/create-billing-portal-session', async (req, res, next) => {
  try {
    const bodySchema = z.object({
      tenantId: z.string().uuid(),
      returnUrl: z.string().url(),
    });

    const { tenantId, returnUrl } = bodySchema.parse(req.body);

    // Get tenant's Stripe customer ID
    const [tenant] = await db
      .select({
        id: tenants.id,
        stripeCustomerId: tenants.stripeCustomerId,
        subscriptionStatus: tenants.subscriptionStatus,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    if (!tenant.stripeCustomerId) {
      return res.status(400).json({ 
        error: 'No billing account found',
        message: 'This organization does not have an active billing account. Please contact support.'
      });
    }

    // Create Stripe Customer Portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: returnUrl,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating billing portal session:', error);
    next(error);
  }
});

export default router;

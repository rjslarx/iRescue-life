import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { db } from '../db';
import {
  adoptionCheckoutSessions,
  adoptionContracts,
  adoptionPayments,
  postAdoptionJourneys,
  scheduledCommunications,
  grantAllocations,
  animals,
  applications,
  grants,
  contacts,
  tenants,
  medicalFiles,
  type InsertAdoptionCheckoutSession,
  type InsertAdoptionContract,
  type InsertAdoptionPayment,
  type InsertPostAdoptionJourney,
  type InsertGrantAllocation,
  type AdoptionCheckoutSession,
  type AdoptionContract,
  type AdoptionPayment,
  type Tenant,
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { EmailService } from '../lib/email-service';
import { stripeService } from '../lib/stripe-service';
import { generatePaymentReceiptPDF } from './payment-receipt-pdf';
import { generateMedicalHistoryPDF } from './medical-history-pdf';
import { objectStorageClient, parseObjectPath } from '../objectStorage';
import { calculatePlatformFee } from '../config/platform';

const SALT_ROUNDS = 10;
const TOKEN_LENGTH = 32; // 32 bytes = 256 bits
const DEFAULT_EXPIRATION_HOURS = 72;
const MAX_SEND_ATTEMPTS = 3;

/**
 * Generate a cryptographically secure random token
 */
export function generateSecureToken(): string {
  return crypto.randomBytes(TOKEN_LENGTH).toString('hex');
}

/**
 * Hash a token using bcrypt for secure storage
 */
export async function hashToken(token: string): Promise<string> {
  return bcrypt.hash(token, SALT_ROUNDS);
}

/**
 * Validate a token against a session's stored hash
 */
export async function validateToken(token: string, sessionId: string): Promise<AdoptionCheckoutSession | null> {
  const [session] = await db
    .select()
    .from(adoptionCheckoutSessions)
    .where(eq(adoptionCheckoutSessions.id, sessionId))
    .limit(1);

  if (!session) {
    return null;
  }

  // Check if token matches
  const isValid = await bcrypt.compare(token, session.secureTokenHash);
  if (!isValid) {
    return null;
  }

  // Check if expired
  if (new Date() > session.expiresAt) {
    return null;
  }

  return session;
}

// Stripe processing fee constants (same as platform.ts)
const STRIPE_PROCESSING_FEE_PERCENT = 2.9;
const STRIPE_PROCESSING_FEE_FIXED_CENTS = 30;

/**
 * Calculate totals including processing fees if needed
 * 
 * Two modes:
 * 1. passFeesToAdopter: true - Automatically add platform + processing fees to adopter total
 * 2. passFeesToAdopter: false + coverFees: true - Adopter chose to cover processing fees only
 */
function calculateTotals(
  baseFee: string, 
  donationBoost?: string, 
  coverFees: boolean = false,
  passFeesToAdopter: boolean = false,
  platformFeePercent: number = 0
): {
  subtotal: string;
  fees: string;
  total: string;
} {
  const baseFeeNum = parseFloat(baseFee);
  const donationBoostNum = parseFloat(donationBoost || '0');
  const subtotal = baseFeeNum + donationBoostNum;

  let total = subtotal;
  let fees = 0;

  if (passFeesToAdopter) {
    // Tenant setting: Add all fees (processing + platform) to adopter's total
    // Use gross-up formula: total = (subtotal + fixed) / (1 - totalPercentFee)
    const processingPercent = STRIPE_PROCESSING_FEE_PERCENT / 100;
    const platformPercent = platformFeePercent / 100;
    const totalPercentFee = processingPercent + platformPercent;
    const fixedFee = STRIPE_PROCESSING_FEE_FIXED_CENTS / 100;
    
    total = (subtotal + fixedFee) / (1 - totalPercentFee);
    fees = total - subtotal;
  } else if (coverFees) {
    // Adopter chose to cover Stripe processing fees only
    const processingPercent = STRIPE_PROCESSING_FEE_PERCENT / 100;
    const fixedFee = STRIPE_PROCESSING_FEE_FIXED_CENTS / 100;
    total = (subtotal + fixedFee) / (1 - processingPercent);
    fees = total - subtotal;
  }

  return {
    subtotal: subtotal.toFixed(2),
    fees: fees.toFixed(2),
    total: total.toFixed(2),
  };
}

/**
 * Validate payment inputs to prevent manipulation
 * Throws an error if validation fails
 */
export function validatePaymentInputs(donationBoost: string, coverFees: boolean, baseFee: string): void {
  const boost = parseFloat(donationBoost || '0');
  const base = parseFloat(baseFee);
  
  if (isNaN(boost)) {
    throw new Error('Invalid donation amount: must be a number');
  }
  
  if (boost < 0) {
    throw new Error('Invalid donation amount: cannot be negative');
  }
  
  if (boost > 10000) {
    throw new Error('Invalid donation amount: exceeds maximum limit');
  }
  
  if (typeof coverFees !== 'boolean') {
    throw new Error('Invalid coverFees value: must be boolean');
  }
  
  if (isNaN(base) || base < 0) {
    throw new Error('Invalid base fee');
  }
}

/**
 * Create a new adoption checkout session
 */
export async function createCheckoutSession(
  tenantId: string,
  data: {
    applicationId: string;
    animalId: string;
    adopterContactId?: string;
    grantId?: string;
    contractTemplateId?: number;
    staffInitiatedBy: string;
    baseFee: string;
    waiveFee?: boolean;
    donationBoost?: string;
    coverFees?: boolean;
    processor?: 'stripe';
    vetAppointmentDate?: string;
    spayNeuterDate?: string;
  }
): Promise<{ session: AdoptionCheckoutSession; token: string }> {
  // Validate application belongs to tenant
  const [application] = await db
    .select()
    .from(applications)
    .where(and(
      eq(applications.id, data.applicationId),
      eq(applications.tenantId, tenantId)
    ))
    .limit(1);

  if (!application) {
    throw new Error('Application not found or does not belong to this organization');
  }

  // Validate animal belongs to tenant
  const [animal] = await db
    .select()
    .from(animals)
    .where(and(
      eq(animals.id, data.animalId),
      eq(animals.tenantId, tenantId)
    ))
    .limit(1);

  if (!animal) {
    throw new Error('Animal not found or does not belong to this organization');
  }

  // Validate grant if provided
  if (data.grantId) {
    const [grant] = await db
      .select()
      .from(grants)
      .where(and(
        eq(grants.id, data.grantId),
        eq(grants.tenantId, tenantId)
      ))
      .limit(1);

    if (!grant) {
      throw new Error('Grant not found or does not belong to this organization');
    }
  }

  // Fetch tenant settings for fee configuration
  const { getPlatformFeePercent } = await import('../config/platform');
  const [tenant] = await db
    .select({
      passFeesToAdopter: tenants.passFeesToAdopter,
      subscriptionTier: tenants.subscriptionTier,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const passFeesToAdopter = tenant?.passFeesToAdopter || false;
  const platformFeePercent = getPlatformFeePercent(tenant?.subscriptionTier || 'free');

  // Generate secure token
  const token = generateSecureToken();
  const tokenHash = await hashToken(token);

  // Calculate expiration (72 hours from now)
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + DEFAULT_EXPIRATION_HOURS);

  // Calculate totals - include passFeesToAdopter and platform fee if tenant enabled
  const totals = calculateTotals(
    data.baseFee,
    data.donationBoost || '0',
    data.coverFees || false,
    passFeesToAdopter,
    platformFeePercent
  );

  // Create session
  const [session] = await db
    .insert(adoptionCheckoutSessions)
    .values({
      tenantId,
      applicationId: data.applicationId,
      animalId: data.animalId,
      adopterContactId: data.adopterContactId,
      grantId: data.grantId,
      contractTemplateId: data.contractTemplateId,
      staffInitiatedBy: data.staffInitiatedBy,
      baseFee: data.baseFee,
      donationBoost: data.donationBoost || '0',
      coverFees: data.coverFees || false,
      processor: data.processor || 'stripe',
      secureTokenHash: tokenHash,
      expiresAt,
      totals,
      metadata: {
        sendAttempts: 0,
        createdBy: data.staffInitiatedBy,
        createdAt: new Date().toISOString(),
        waiveFee: data.waiveFee || false,
        vetAppointmentDate: data.vetAppointmentDate || null,
        spayNeuterDate: data.spayNeuterDate || null,
      },
    })
    .returning();

  // If fee is waived, update the application's fee status
  if (data.waiveFee) {
    await db
      .update(applications)
      .set({
        adoptionFeeStatus: 'waived',
        adoptionFeeAmount: '0',
      })
      .where(eq(applications.id, data.applicationId));
  }

  return { session, token };
}

/**
 * Get checkout session by ID (staff access)
 */
export async function getCheckoutSession(tenantId: string, sessionId: string): Promise<AdoptionCheckoutSession | null> {
  const [session] = await db
    .select()
    .from(adoptionCheckoutSessions)
    .where(and(
      eq(adoptionCheckoutSessions.id, sessionId),
      eq(adoptionCheckoutSessions.tenantId, tenantId)
    ))
    .limit(1);

  return session || null;
}

/**
 * Get checkout session by token (public access)
 * Returns sessions that are in the adoption workflow and haven't expired
 */
export async function getCheckoutSessionByToken(token: string): Promise<AdoptionCheckoutSession | null> {
  // This is a bit inefficient but secure - we need to check all sessions
  // In production, you might want to add a tokenId field to speed this up
  const allSessions = await db
    .select()
    .from(adoptionCheckoutSessions)
    .where(
      sql`${adoptionCheckoutSessions.status} IN ('initiated', 'awaiting_signature', 'awaiting_payment')`
    );

  for (const session of allSessions) {
    const isValid = await bcrypt.compare(token, session.secureTokenHash);
    if (isValid && new Date() <= session.expiresAt) {
      return session;
    }
  }

  return null;
}

/**
 * Get checkout session by token for any status (for contract downloads)
 * Includes completed sessions but enforces a download window (7 days after completion)
 * Security: Token access expires 7 days after adoption completion to limit exposure
 */
export async function getCheckoutSessionByTokenForDownload(token: string): Promise<AdoptionCheckoutSession | null> {
  // Get all active sessions (initiated, awaiting_signature, awaiting_payment) 
  // and recently completed sessions (within 7 days of completion)
  const allSessions = await db
    .select()
    .from(adoptionCheckoutSessions)
    .where(
      sql`(${adoptionCheckoutSessions.status} IN ('initiated', 'awaiting_signature', 'awaiting_payment', 'completed'))`
    );

  for (const session of allSessions) {
    const isValid = await bcrypt.compare(token, session.secureTokenHash);
    if (!isValid) continue;

    // For non-completed sessions, check expiry
    if (session.status !== 'completed') {
      if (new Date() <= session.expiresAt) {
        return session;
      }
    } else {
      // For completed sessions, allow download within 7 days of payment
      // This limits the exposure window for leaked tokens
      const downloadWindow = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
      if (session.paidAt && (Date.now() - new Date(session.paidAt).getTime()) <= downloadWindow) {
        return session;
      }
    }
  }

  return null;
}

/**
 * List all checkout sessions for a tenant
 */
export async function listCheckoutSessions(tenantId: string): Promise<AdoptionCheckoutSession[]> {
  return db
    .select()
    .from(adoptionCheckoutSessions)
    .where(eq(adoptionCheckoutSessions.tenantId, tenantId))
    .orderBy(desc(adoptionCheckoutSessions.createdAt));
}

/**
 * Update checkout session
 */
export async function updateCheckoutSession(
  tenantId: string,
  sessionId: string,
  updates: Partial<{
    baseFee: string;
    donationBoost: string;
    coverFees: boolean;
    grantId: string;
    processor: 'stripe';
  }>
): Promise<AdoptionCheckoutSession | null> {
  // Fetch current session
  const session = await getCheckoutSession(tenantId, sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  // Can only update sessions that haven't been completed
  if (session.status !== 'initiated' && session.status !== 'awaiting_signature' && session.status !== 'awaiting_payment') {
    throw new Error('Cannot update completed or cancelled session');
  }

  // Validate grant if being updated
  if (updates.grantId) {
    const [grant] = await db
      .select()
      .from(grants)
      .where(and(
        eq(grants.id, updates.grantId),
        eq(grants.tenantId, tenantId)
      ))
      .limit(1);

    if (!grant) {
      throw new Error('Grant not found or does not belong to this organization');
    }
  }

  // Recalculate totals if fee-related fields changed
  let totals = session.totals;
  if (updates.baseFee || updates.donationBoost !== undefined || updates.coverFees !== undefined) {
    // Fetch tenant settings for fee configuration
    const { getPlatformFeePercent } = await import('../config/platform');
    const [tenant] = await db
      .select({
        passFeesToAdopter: tenants.passFeesToAdopter,
        subscriptionTier: tenants.subscriptionTier,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const passFeesToAdopter = tenant?.passFeesToAdopter || false;
    const platformFeePercent = getPlatformFeePercent(tenant?.subscriptionTier || 'free');

    totals = calculateTotals(
      updates.baseFee || session.baseFee,
      updates.donationBoost !== undefined ? updates.donationBoost : session.donationBoost || '0',
      updates.coverFees !== undefined ? updates.coverFees : session.coverFees || false,
      passFeesToAdopter,
      platformFeePercent
    );
  }

  const [updated] = await db
    .update(adoptionCheckoutSessions)
    .set({
      ...updates,
      totals,
      updatedAt: new Date(),
    })
    .where(and(
      eq(adoptionCheckoutSessions.id, sessionId),
      eq(adoptionCheckoutSessions.tenantId, tenantId)
    ))
    .returning();

  return updated || null;
}

/**
 * Send checkout link to adopter via email
 */
export async function sendCheckoutLink(
  sessionId: string,
  token: string,
  method: 'email' | 'sms' = 'email'
): Promise<void> {
  const [session] = await db
    .select()
    .from(adoptionCheckoutSessions)
    .where(eq(adoptionCheckoutSessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw new Error('Session not found');
  }

  // Check send attempts
  const sendAttempts = (session.metadata as any)?.sendAttempts || 0;
  if (sendAttempts >= MAX_SEND_ATTEMPTS) {
    throw new Error(`Maximum send attempts (${MAX_SEND_ATTEMPTS}) exceeded`);
  }

  // Get adopter contact info
  let email: string;
  let name: string;

  if (session.adopterContactId) {
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, session.adopterContactId))
      .limit(1);

    if (!contact) {
      throw new Error('Adopter contact not found');
    }

    email = contact.email;
    name = contact.name;
  } else {
    // Fallback to application data
    const [application] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, session.applicationId))
      .limit(1);

    if (!application) {
      throw new Error('Application not found');
    }

    email = application.applicantEmail;
    name = application.applicantName;
  }

  // Get animal details
  const [animal] = await db
    .select()
    .from(animals)
    .where(eq(animals.id, session.animalId))
    .limit(1);

  if (!animal) {
    throw new Error('Animal not found');
  }

  if (method === 'email') {
    const emailService = await EmailService.forTenant(session.tenantId);
    if (!emailService) {
      throw new Error('Email service not configured for this organization');
    }

    // Get tenant subdomain to build correct URL
    const [tenant] = await db
      .select({ subdomain: tenants.subdomain, customDomain: tenants.customDomain, customDomainVerified: tenants.customDomainVerified })
      .from(tenants)
      .where(eq(tenants.id, session.tenantId))
      .limit(1);

    // Build checkout URL with proper tenant routing
    // Use custom domain if available and verified, otherwise use path-based routing
    let checkoutUrl: string;
    if (tenant?.customDomain && tenant?.customDomainVerified) {
      checkoutUrl = `https://${tenant.customDomain}/adoption-checkout/${token}`;
    } else {
      // Use Replit dev domain in development, otherwise use BASE_URL or default to irescue.life
      let baseUrl: string;
      if (process.env.REPLIT_DEV_DOMAIN) {
        baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
      } else {
        baseUrl = process.env.BASE_URL || 'https://irescue.life';
      }
      checkoutUrl = `${baseUrl}/${tenant?.subdomain || 'demo'}/adoption-checkout/${token}`;
    }

    const html = `
      <h2>Complete Your Adoption of ${animal.name}!</h2>
      <p>Dear ${name},</p>
      <p>Congratulations! Your adoption application for <strong>${animal.name}</strong> has been approved.</p>
      <p>To finalize the adoption, please complete the following steps:</p>
      <ol>
        <li>Review and sign the adoption contract</li>
        <li>Complete the adoption fee payment</li>
      </ol>
      <p><strong>Adoption Fee:</strong> $${session.baseFee}</p>
      ${session.donationBoost && parseFloat(session.donationBoost) > 0 ? `<p><strong>Additional Donation:</strong> $${session.donationBoost}</p>` : ''}
      ${session.totals ? `<p><strong>Total:</strong> $${(session.totals as any).total}</p>` : ''}
      <p><a href="${checkoutUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">Complete Adoption</a></p>
      <p>This link will expire in 72 hours.</p>
      <p>If you have any questions, please don't hesitate to contact us.</p>
    `;

    await emailService.send({
      to: email,
      subject: `Complete Your Adoption of ${animal.name}`,
      html,
    });
  } else if (method === 'sms') {
    // SMS sending would be implemented here using Twilio or similar
    throw new Error('SMS sending not yet implemented');
  }

  // Update send attempts
  await db
    .update(adoptionCheckoutSessions)
    .set({
      metadata: {
        ...(session.metadata as any),
        sendAttempts: sendAttempts + 1,
        lastSentAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(eq(adoptionCheckoutSessions.id, sessionId));
}

/**
 * Send payment link email after signature is captured
 * Called automatically after contract signing to continue the adoption workflow
 */
export async function sendPaymentLinkEmail(
  sessionId: string,
  token: string
): Promise<void> {
  const [session] = await db
    .select()
    .from(adoptionCheckoutSessions)
    .where(eq(adoptionCheckoutSessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw new Error('Session not found');
  }

  // Get adopter contact info
  let email: string;
  let name: string;

  if (session.adopterContactId) {
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, session.adopterContactId))
      .limit(1);

    if (contact) {
      email = contact.email;
      name = contact.name;
    } else {
      const [application] = await db
        .select()
        .from(applications)
        .where(eq(applications.id, session.applicationId))
        .limit(1);
      email = application?.applicantEmail || '';
      name = application?.applicantName || '';
    }
  } else {
    const [application] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, session.applicationId))
      .limit(1);

    if (!application) {
      throw new Error('Application not found');
    }

    email = application.applicantEmail;
    name = application.applicantName;
  }

  // Get animal details
  const [animal] = await db
    .select()
    .from(animals)
    .where(eq(animals.id, session.animalId))
    .limit(1);

  if (!animal) {
    throw new Error('Animal not found');
  }

  const emailService = await EmailService.forTenant(session.tenantId);
  if (!emailService) {
    console.error('Email service not configured for payment link - skipping');
    return;
  }

  // Get tenant subdomain to build correct URL
  const [tenant] = await db
    .select({ subdomain: tenants.subdomain, customDomain: tenants.customDomain, customDomainVerified: tenants.customDomainVerified })
    .from(tenants)
    .where(eq(tenants.id, session.tenantId))
    .limit(1);

  // Build checkout URL with proper tenant routing
  let checkoutUrl: string;
  if (tenant?.customDomain && tenant?.customDomainVerified) {
    checkoutUrl = `https://${tenant.customDomain}/adoption-checkout/${token}`;
  } else {
    // Use Replit dev domain in development, otherwise use BASE_URL or default to irescue.life
    let baseUrl: string;
    if (process.env.REPLIT_DEV_DOMAIN) {
      baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
    } else {
      baseUrl = process.env.BASE_URL || 'https://irescue.life';
    }
    checkoutUrl = `${baseUrl}/${tenant?.subdomain || 'demo'}/adoption-checkout/${token}`;
  }

  const totals = session.totals as { subtotal: string; fees: string; total: string } | null;

  const html = `
    <h2>Contract Signed - Complete Payment for ${animal.name}</h2>
    <p>Dear ${name},</p>
    <p>Thank you for signing the adoption contract for <strong>${animal.name}</strong>!</p>
    <p>Your contract has been signed and recorded. The final step is to complete the adoption fee payment.</p>
    <p><strong>Adoption Fee:</strong> $${session.baseFee}</p>
    ${session.donationBoost && parseFloat(session.donationBoost) > 0 ? `<p><strong>Additional Donation:</strong> $${session.donationBoost}</p>` : ''}
    ${totals ? `<p><strong>Total:</strong> $${totals.total}</p>` : ''}
    <p><a href="${checkoutUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">Complete Payment</a></p>
    <p>Once payment is received, the adoption will be finalized and ${animal.name} will officially be yours!</p>
    <p>This link will expire in 72 hours.</p>
    <p>If you have any questions, please don't hesitate to contact us.</p>
  `;

  try {
    await emailService.send({
      to: email,
      subject: `Complete Payment for ${animal.name}'s Adoption`,
      html,
    });
    console.log(`Payment link email sent to ${email} for session ${sessionId}`);
  } catch (error) {
    console.error('Failed to send payment link email:', error);
    // Don't throw - we don't want to fail the signature capture
  }
}

/**
 * Cancel a checkout session
 */
export async function cancelCheckoutSession(tenantId: string, sessionId: string): Promise<AdoptionCheckoutSession | null> {
  const [session] = await db
    .update(adoptionCheckoutSessions)
    .set({
      status: 'cancelled',
      updatedAt: new Date(),
    })
    .where(and(
      eq(adoptionCheckoutSessions.id, sessionId),
      eq(adoptionCheckoutSessions.tenantId, tenantId)
    ))
    .returning();

  return session || null;
}

/**
 * Capture signature for adoption contract
 * Returns contract and skipPayment flag (true when fee is waived)
 */
export async function captureSignature(
  sessionId: string,
  signatureData: {
    signerName: string;
    signerEmail: string;
    signatureImageData: string; // Base64 image data
    ipAddress?: string;
    userAgent?: string;
    templateId?: number;
    driversLicenseNumber?: string;
    driversLicenseImageData?: string; // Base64 image data
  }
): Promise<{ contract: AdoptionContract; skipPayment: boolean }> {
  const [session] = await db
    .select()
    .from(adoptionCheckoutSessions)
    .where(eq(adoptionCheckoutSessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw new Error('Session not found');
  }

  if (session.status !== 'initiated' && session.status !== 'awaiting_signature') {
    throw new Error('Session is not in a state to accept signatures');
  }

  // Process signature image and upload to storage
  const { processSignatureImage, generateAdoptionContractPDF } = await import('./contract-pdf');
  const signatureImageUrl = await processSignatureImage(signatureData.signatureImageData);
  const signedAt = new Date();

  // Process driver's license image if provided
  let driversLicenseImageUrl: string | undefined;
  if (signatureData.driversLicenseImageData) {
    driversLicenseImageUrl = await processSignatureImage(signatureData.driversLicenseImageData, 'drivers-license');
  }

  // Generate PDF contract with signature, including IP and timestamp for legal verification
  const contractPdfUrl = await generateAdoptionContractPDF(session, signatureImageUrl, {
    ipAddress: signatureData.ipAddress,
    signedAt,
  });

  // Create contract record
  const [contract] = await db
    .insert(adoptionContracts)
    .values({
      sessionId,
      templateSnapshot: { id: signatureData.templateId || 1, capturedAt: signedAt.toISOString() },
      contractPdfUrl,
      signatureImageUrl,
      signerName: signatureData.signerName,
      signerEmail: signatureData.signerEmail,
      signedIp: signatureData.ipAddress,
      signedUserAgent: signatureData.userAgent,
      signedAt,
      driversLicenseNumber: signatureData.driversLicenseNumber || null,
      driversLicenseImageUrl: driversLicenseImageUrl || null,
    })
    .returning();

  // Check if fee is waived (baseFee is 0 or metadata indicates waived)
  const baseFee = parseFloat(session.baseFee?.toString() || '0');
  const metadata = session.metadata as { waiveFee?: boolean } | null;
  const isFeeWaived = baseFee === 0 || metadata?.waiveFee === true;

  if (isFeeWaived) {
    // Fee is waived - finalize adoption immediately without payment
    await db
      .update(adoptionCheckoutSessions)
      .set({
        status: 'completed',
        signedAt,
        paidAt: signedAt, // Mark as paid at same time since no payment needed
        updatedAt: new Date(),
      })
      .where(eq(adoptionCheckoutSessions.id, sessionId));

    // Finalize the adoption (update animal status, application, etc.)
    await finalizeAdoption(sessionId);

    return { contract, skipPayment: true };
  }

  // Fee is not waived - proceed to payment step
  await db
    .update(adoptionCheckoutSessions)
    .set({
      status: 'awaiting_payment',
      signedAt,
      updatedAt: new Date(),
    })
    .where(eq(adoptionCheckoutSessions.id, sessionId));

  return { contract, skipPayment: false };
}

/**
 * Create a Stripe PaymentIntent for an adoption checkout session
 * Includes platform fee calculation based on tenant subscription tier
 */
export async function createAdoptionPaymentIntent(
  sessionId: string
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const [session] = await db
    .select()
    .from(adoptionCheckoutSessions)
    .where(eq(adoptionCheckoutSessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw new Error('Session not found');
  }

  if (session.status !== 'awaiting_payment') {
    throw new Error('Session is not awaiting payment');
  }

  if (!session.totals) {
    throw new Error('Session totals not calculated');
  }

  const totals = session.totals as { subtotal: string; fees: string; total: string };

  // Fetch tenant for Stripe configuration
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, session.tenantId))
    .limit(1);

  if (!tenant) {
    throw new Error('Organization not found');
  }

  // Check if tenant has Stripe Connect or their own Stripe keys
  const hasStripeConnect = !!tenant.stripeConnectedAccountId;
  const hasOwnStripeKeys = tenant.stripeEnabled && !!tenant.stripeSecretKeyEncrypted;
  
  if (!hasStripeConnect && !hasOwnStripeKeys) {
    throw new Error('Stripe is not configured for this organization. Please contact the rescue to set up payment processing.');
  }

  // Fetch animal details for description
  const [animal] = await db
    .select()
    .from(animals)
    .where(eq(animals.id, session.animalId))
    .limit(1);

  // Fetch applicant email
  const [application] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, session.applicationId))
    .limit(1);

  const amountInCents = Math.round(parseFloat(totals.total) * 100);
  
  // Calculate platform fee based on tenant's subscription tier
  // Free tier pays 5% platform fee, Professional tier pays 0%
  const platformFeeAmount = hasStripeConnect 
    ? calculatePlatformFee(amountInCents, tenant.subscriptionTier || 'free')
    : 0;

  const paymentIntent = await stripeService.createPaymentIntent(tenant, {
    amount: amountInCents,
    currency: 'usd',
    description: `Adoption fee for ${animal?.name || 'Animal'} - ${tenant.name}`,
    receiptEmail: application?.applicantEmail,
    metadata: {
      sessionId: session.id,
      animalId: session.animalId,
      applicationId: session.applicationId,
      type: 'adoption_fee',
    },
    // Pass Stripe Connect parameters for platform fee collection
    connectedAccountId: tenant.stripeConnectedAccountId || undefined,
    platformFeeAmount: platformFeeAmount > 0 ? platformFeeAmount : undefined,
  });

  // Store the PaymentIntent ID on the session
  await db
    .update(adoptionCheckoutSessions)
    .set({
      paymentIntentId: paymentIntent.id,
      updatedAt: new Date(),
    })
    .where(eq(adoptionCheckoutSessions.id, sessionId));

  return {
    clientSecret: paymentIntent.client_secret!,
    paymentIntentId: paymentIntent.id,
  };
}

/**
 * Process payment for adoption (confirms payment and records it)
 */
export async function processPayment(
  sessionId: string,
  paymentData: {
    processor: 'stripe';
    paymentIntentId?: string; // For Stripe - the confirmed PaymentIntent ID
    paymentMethodId?: string; // For Stripe - if confirming server-side
  }
): Promise<AdoptionPayment> {
  const [session] = await db
    .select()
    .from(adoptionCheckoutSessions)
    .where(eq(adoptionCheckoutSessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw new Error('Session not found');
  }

  if (session.status !== 'awaiting_payment') {
    throw new Error('Session is not awaiting payment');
  }

  if (!session.totals) {
    throw new Error('Session totals not calculated');
  }

  const totals = session.totals as { subtotal: string; fees: string; total: string };

  // Process payment based on processor
  let chargeId: string;
  let receiptUrl: string | undefined;

  if (paymentData.processor === 'stripe') {
    // Fetch tenant for Stripe verification
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, session.tenantId))
      .limit(1);

    if (!tenant) {
      throw new Error('Organization not found');
    }

    const paymentIntentId = paymentData.paymentIntentId || session.paymentIntentId;
    
    if (!paymentIntentId) {
      throw new Error('No PaymentIntent found for this session. Please create one first.');
    }

    // Verify the payment succeeded by retrieving the PaymentIntent
    if (tenant.stripeEnabled && tenant.stripeSecretKeyEncrypted) {
      const paymentIntent = await stripeService.retrievePaymentIntent(tenant, paymentIntentId);
      
      if (paymentIntent.status !== 'succeeded') {
        throw new Error(`Payment not completed. Status: ${paymentIntent.status}`);
      }

      chargeId = paymentIntent.id;
      receiptUrl = paymentIntent.receipt_email 
        ? `https://dashboard.stripe.com/payments/${paymentIntent.id}`
        : undefined;
    } else {
      // Fallback for testing without Stripe
      chargeId = paymentIntentId || 'ch_' + crypto.randomBytes(12).toString('hex');
    }
  } else {
    throw new Error('Unsupported payment processor');
  }

  // Create payment record
  const [payment] = await db
    .insert(adoptionPayments)
    .values({
      sessionId,
      processor: paymentData.processor,
      amountBreakdown: {
        baseFee: session.baseFee,
        donationBoost: session.donationBoost || '0',
        processingFee: totals.fees,
        total: totals.total,
      },
      receiptUrl,
      chargeId,
      status: 'succeeded',
    })
    .returning();

  // Update session
  await db
    .update(adoptionCheckoutSessions)
    .set({
      status: 'completed',
      paidAt: new Date(),
      paymentIntentId: chargeId,
      updatedAt: new Date(),
    })
    .where(eq(adoptionCheckoutSessions.id, sessionId));

  return payment;
}

/**
 * Record an offline payment (cash, check, etc.) for staff to bypass Stripe
 * This allows completing adoptions when the adopter pays with non-digital methods
 */
export async function recordOfflinePayment(
  tenantId: string,
  sessionId: string,
  paymentData: {
    paymentMethod: 'cash' | 'check' | 'money_order' | 'other';
    amount: string;
    referenceNumber?: string;
    notes?: string;
    recordedBy: string;
  }
): Promise<AdoptionPayment> {
  const [session] = await db
    .select()
    .from(adoptionCheckoutSessions)
    .where(and(
      eq(adoptionCheckoutSessions.id, sessionId),
      eq(adoptionCheckoutSessions.tenantId, tenantId)
    ))
    .limit(1);

  if (!session) {
    throw new Error('Session not found');
  }

  if (session.status !== 'awaiting_payment') {
    throw new Error('Session must be in awaiting_payment status (contract must be signed first)');
  }

  const amountNum = parseFloat(paymentData.amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    throw new Error('Invalid payment amount');
  }

  const referenceId = `offline_${paymentData.paymentMethod}_${crypto.randomBytes(8).toString('hex')}`;

  const [payment] = await db
    .insert(adoptionPayments)
    .values({
      sessionId,
      processor: 'stripe',
      amountBreakdown: {
        baseFee: session.baseFee,
        donationBoost: session.donationBoost || '0',
        processingFee: '0',
        total: paymentData.amount,
        offlinePayment: true,
        paymentMethod: paymentData.paymentMethod,
        referenceNumber: paymentData.referenceNumber,
        notes: paymentData.notes,
        recordedBy: paymentData.recordedBy,
      },
      chargeId: referenceId,
      status: 'succeeded',
    })
    .returning();

  await db
    .update(adoptionCheckoutSessions)
    .set({
      status: 'completed',
      paidAt: new Date(),
      paymentIntentId: referenceId,
      updatedAt: new Date(),
      metadata: {
        ...(session.metadata as any),
        offlinePayment: {
          method: paymentData.paymentMethod,
          amount: paymentData.amount,
          referenceNumber: paymentData.referenceNumber,
          notes: paymentData.notes,
          recordedBy: paymentData.recordedBy,
          recordedAt: new Date().toISOString(),
        },
      },
    })
    .where(eq(adoptionCheckoutSessions.id, sessionId));

  return payment;
}

/**
 * Finalize adoption - update animal status, create post-adoption journey, send confirmation
 */
export async function finalizeAdoption(sessionId: string): Promise<void> {
  const [session] = await db
    .select()
    .from(adoptionCheckoutSessions)
    .where(eq(adoptionCheckoutSessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw new Error('Session not found');
  }

  if (session.status !== 'completed') {
    throw new Error('Session is not completed');
  }

  // Update animal status to adopted
  await db
    .update(animals)
    .set({
      status: 'adopted',
      adoptionDate: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(animals.id, session.animalId));

  // Save signed adoption contract to animal's medical files
  try {
    const [contract] = await db
      .select()
      .from(adoptionContracts)
      .where(eq(adoptionContracts.sessionId, session.id))
      .limit(1);

    if (contract?.contractPdfUrl) {
      await db.insert(medicalFiles).values({
        animalId: session.animalId,
        tenantId: session.tenantId,
        fileName: `Adoption Contract - Signed ${new Date().toLocaleDateString()}`,
        fileUrl: contract.contractPdfUrl,
        mimeType: 'application/pdf',
        description: `Signed adoption contract for ${contract.signerName} (${contract.signerEmail}). Signed on ${contract.signedAt?.toLocaleDateString() || 'unknown date'}.`,
      });
      console.log(`[Adoption] Saved signed contract to animal ${session.animalId} medical files`);
    }
  } catch (error) {
    console.error('Failed to save adoption contract to animal files:', error);
  }

  // Update application status
  await db
    .update(applications)
    .set({
      stage: 'adopted',
      updatedAt: new Date(),
    })
    .where(eq(applications.id, session.applicationId));

  // Create grant allocation if grant was used
  if (session.grantId) {
    await db
      .insert(grantAllocations)
      .values({
        grantId: session.grantId,
        sessionId: session.id,
        waiverAmount: session.baseFee, // In a real implementation, calculate actual waiver amount
      });
  }

  // Get adopter info for scheduled communications
  const [animal] = await db
    .select()
    .from(animals)
    .where(eq(animals.id, session.animalId))
    .limit(1);

  let recipientEmail: string = '';
  let recipientName: string = '';

  if (session.adopterContactId) {
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, session.adopterContactId))
      .limit(1);

    if (contact) {
      recipientEmail = contact.email;
      recipientName = contact.name;
    }
  }

  if (!recipientEmail) {
    const [application] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, session.applicationId))
      .limit(1);

    if (application) {
      recipientEmail = application.applicantEmail;
      recipientName = application.applicantName;
    }
  }

  // Create 3-3-3 Rule scheduled communications (3 Days, 3 Weeks, 3 Months)
  if (recipientEmail && animal) {
    const now = new Date();
    const day3 = new Date(now);
    day3.setDate(day3.getDate() + 3);
    const week3 = new Date(now);
    week3.setDate(week3.getDate() + 21);
    const month3 = new Date(now);
    month3.setDate(month3.getDate() + 90);

    await db.insert(scheduledCommunications).values([
      {
        tenantId: session.tenantId,
        adoptionId: session.id,
        animalId: session.animalId,
        adopterEmail: recipientEmail,
        adopterName: recipientName,
        animalName: animal.name,
        sendDate: day3,
        messageType: '3_days',
        status: 'pending',
      },
      {
        tenantId: session.tenantId,
        adoptionId: session.id,
        animalId: session.animalId,
        adopterEmail: recipientEmail,
        adopterName: recipientName,
        animalName: animal.name,
        sendDate: week3,
        messageType: '3_weeks',
        status: 'pending',
      },
      {
        tenantId: session.tenantId,
        adoptionId: session.id,
        animalId: session.animalId,
        adopterEmail: recipientEmail,
        adopterName: recipientName,
        animalName: animal.name,
        sendDate: month3,
        messageType: '3_months',
        status: 'pending',
      },
    ]);
  }

  // Send confirmation email with PDF attachments
  const emailService = await EmailService.forTenant(session.tenantId);
  if (emailService && animal && recipientEmail) {
    try {
      // Generate all three PDF attachments
      const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];

      // 1. Payment Receipt PDF
      try {
        const receiptPdf = await generatePaymentReceiptPDF(session.id);
        attachments.push({
          filename: `adoption-receipt-${animal.name.replace(/\s+/g, '-').toLowerCase()}.pdf`,
          content: receiptPdf,
          contentType: 'application/pdf',
        });
      } catch (error) {
        console.error('Failed to generate payment receipt PDF:', error);
      }

      // 2. Signed Contract PDF
      try {
        const [contract] = await db
          .select()
          .from(adoptionContracts)
          .where(eq(adoptionContracts.sessionId, session.id))
          .limit(1);

        if (contract?.contractPdfUrl) {
          // Reconstruct full object storage path
          const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
          if (!privateObjectDir) {
            throw new Error('PRIVATE_OBJECT_DIR not configured');
          }

          // Extract filename from URL
          const filename = contract.contractPdfUrl.split('/').pop();
          if (!filename) {
            throw new Error('Invalid contract PDF URL');
          }

          // Build full object path and parse using shared helper
          const objectPath = `${privateObjectDir}/contracts/${filename}`;
          const { bucketName, objectName } = parseObjectPath(objectPath);

          const bucket = objectStorageClient.bucket(bucketName);
          const file = bucket.file(objectName);
          const [contractBuffer] = await file.download();

          attachments.push({
            filename: `adoption-contract-${animal.name.replace(/\s+/g, '-').toLowerCase()}.pdf`,
            content: contractBuffer,
            contentType: 'application/pdf',
          });
        }
      } catch (error) {
        console.error('Failed to download signed contract PDF:', error);
      }

      // 3. Medical History PDF
      try {
        const medicalHistoryPdf = await generateMedicalHistoryPDF(session.animalId, session.tenantId);
        attachments.push({
          filename: `medical-history-${animal.name.replace(/\s+/g, '-').toLowerCase()}.pdf`,
          content: medicalHistoryPdf,
          contentType: 'application/pdf',
        });
      } catch (error) {
        console.error('Failed to generate medical history PDF:', error);
      }

      // Send confirmation email with 3-3-3 Rule info
      await emailService.send({
        to: recipientEmail,
        subject: `Congratulations on Adopting ${animal.name}!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Welcome to the Family!</h2>
            <p>Dear ${recipientName},</p>
            <p>Congratulations on completing the adoption of <strong>${animal.name}</strong>!</p>
            
            <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0;">
              <h3 style="color: #10b981; margin-top: 0;">What's Included</h3>
              <p style="margin: 5px 0;">We've attached three important documents to this email:</p>
              <ul style="margin: 10px 0;">
                <li><strong>Payment Receipt</strong> - Your official adoption payment receipt</li>
                <li><strong>Signed Adoption Contract</strong> - Your legally binding adoption agreement</li>
                <li><strong>Medical History</strong> - ${animal.name}'s complete medical records</li>
              </ul>
              <p style="margin: 5px 0; font-size: 14px; color: #166534;">
                Please save these documents for your records.
              </p>
            </div>

            <div style="background-color: #f8fafc; padding: 15px; margin: 20px 0; border-radius: 8px;">
              <h3 style="color: #2563eb; margin-top: 0;">The 3-3-3 Rule</h3>
              <p>It takes time for ${animal.name} to adjust to their new home!</p>
              <ul style="font-size: 14px;">
                <li><strong>3 Days:</strong> Feeling overwhelmed and scared - don't panic!</li>
                <li><strong>3 Weeks:</strong> Starting to settle in and test boundaries</li>
                <li><strong>3 Months:</strong> Feeling comfortable and truly at home</li>
              </ul>
              <p style="font-size: 14px; margin-top: 10px;">
                Be patient, provide structure, and give ${animal.name} the time they need to thrive!
              </p>
            </div>

            <p>We'll check in with you at each of these milestones to see how things are going.</p>
            
            <p>Thank you for giving ${animal.name} a loving home!</p>
            
            <p style="margin-top: 30px;">
              With gratitude,<br>
              <strong>The Rescue Team</strong>
            </p>
          </div>
        `,
        attachments,
      });
    } catch (error) {
      console.error('Failed to send confirmation email with attachments:', error);
      // Send basic email if attachment generation fails
      await emailService.send({
        to: recipientEmail,
        subject: `Congratulations on Adopting ${animal.name}!`,
        html: `
          <h2>Welcome to the Family!</h2>
          <p>Dear ${recipientName},</p>
          <p>Congratulations on completing the adoption of <strong>${animal.name}</strong>!</p>
          <p>We'll be in touch with follow-up information in the coming days.</p>
          <p>Thank you for giving ${animal.name} a loving home!</p>
        `,
      });
    }
  }
}

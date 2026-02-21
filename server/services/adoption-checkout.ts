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
  personDocuments,
  users,
  adopterMagicTokens,
  preventativeCareRecords,
  preventativeCareTypes,
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
import { eq, and, or, desc, sql, isNull, ilike } from 'drizzle-orm';
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

  // If subtotal is $0, no fees should be charged - return all zeros
  if (subtotal === 0) {
    return {
      subtotal: '0.00',
      fees: '0.00',
      total: '0.00',
    };
  }

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
    donationBoost?: string;
    coverFees?: boolean;
    processor?: 'stripe';
    vetAppointmentDate?: string;
    spayNeuterDate?: string;
    staffConfirmValues?: Record<string, string>;
    medicalDueDates?: {
      rabiesDueDate?: string;
      dhppDueDate?: string;
      bordetellaDueDate?: string;
      heartwormDueDate?: string;
      fleaTickDueDate?: string;
    };
    carePriorities?: {
      enabled: boolean;
      flags: {
        medicalNeeds?: { checked: boolean; notes: string };
        behavioral?: { checked: boolean; notes: string };
        diet?: { checked: boolean; notes: string };
        flightRisk?: { checked: boolean; notes: string };
      };
    };
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
      platformFeePercent: tenants.platformFeePercent,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const passFeesToAdopter = tenant?.passFeesToAdopter || false;
  const platformFeePercent = getPlatformFeePercent(tenant?.subscriptionTier || 'free', tenant?.platformFeePercent);

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
      vetAppointmentDate: data.vetAppointmentDate,
      spayNeuterDate: data.spayNeuterDate,
      staffConfirmValues: data.staffConfirmValues || null,
      medicalDueDates: data.medicalDueDates || null,
      carePriorities: data.carePriorities || null,
      metadata: {
        sendAttempts: 0,
        createdBy: data.staffInitiatedBy,
        createdAt: new Date().toISOString(),
      },
    })
    .returning();

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
 * Returns active sessions (initiated, awaiting_signature, awaiting_payment) that haven't expired
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
      // For completed sessions, allow download within 7 days of completion
      // Use paidAt if available, fall back to signedAt, then createdAt
      const downloadWindow = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
      const completionDate = session.paidAt || session.signedAt || session.createdAt;
      if (completionDate && (Date.now() - new Date(completionDate).getTime()) <= downloadWindow) {
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
        platformFeePercent: tenants.platformFeePercent,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const passFeesToAdopter = tenant?.passFeesToAdopter || false;
    const platformFeePercent = getPlatformFeePercent(tenant?.subscriptionTier || 'free', tenant?.platformFeePercent);

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

  // Get tenant details for constructing the correct URL
  const [tenant] = await db
    .select({
      subdomain: tenants.subdomain,
      customDomain: tenants.customDomain,
    })
    .from(tenants)
    .where(eq(tenants.id, session.tenantId))
    .limit(1);

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  if (method === 'email') {
    const emailService = await EmailService.forTenant(session.tenantId);
    if (!emailService) {
      throw new Error('Email service not configured for this organization');
    }

    // Construct URL using tenant's custom domain or subdomain
    const baseUrl = tenant.customDomain 
      ? `https://${tenant.customDomain}`
      : `https://${tenant.subdomain}.irescue.life`;
    const checkoutUrl = `${baseUrl}/adoption-checkout/${token}`;

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
      <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
      <p style="font-size: 14px; word-break: break-all;"><a href="${checkoutUrl}" style="color: #4F46E5;">${checkoutUrl}</a></p>
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

  // Get tenant details for constructing the correct URL
  const [tenant] = await db
    .select({
      subdomain: tenants.subdomain,
      customDomain: tenants.customDomain,
    })
    .from(tenants)
    .where(eq(tenants.id, session.tenantId))
    .limit(1);

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  const emailService = await EmailService.forTenant(session.tenantId);
  if (!emailService) {
    console.error('Email service not configured for payment link - skipping');
    return;
  }

  // Construct URL using tenant's custom domain or subdomain
  const baseUrl = tenant.customDomain 
    ? `https://${tenant.customDomain}`
    : `https://${tenant.subdomain}.irescue.life`;
  const checkoutUrl = `${baseUrl}/adoption-checkout/${token}`;
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
    <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
    <p style="font-size: 14px; word-break: break-all;"><a href="${checkoutUrl}" style="color: #4F46E5;">${checkoutUrl}</a></p>
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
  }
): Promise<AdoptionContract> {
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

  // Generate PDF contract with signature, including IP, timestamp, and driver's license for legal verification
  const contractPdfUrl = await generateAdoptionContractPDF(session, signatureImageUrl, {
    ipAddress: signatureData.ipAddress,
    signedAt,
    driversLicenseNumber: signatureData.driversLicenseNumber,
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
      driversLicenseNumber: signatureData.driversLicenseNumber,
    })
    .returning();

  // Update session status
  await db
    .update(adoptionCheckoutSessions)
    .set({
      status: 'awaiting_payment',
      signedAt,
      updatedAt: new Date(),
    })
    .where(eq(adoptionCheckoutSessions.id, sessionId));

  return contract;
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
  
  // Calculate platform fee based on tenant's subscription tier or custom fee override
  // Free tier pays 5% platform fee, Professional tier pays 0%, unless custom fee is set
  const platformFeeAmount = hasStripeConnect 
    ? calculatePlatformFee(amountInCents, tenant.subscriptionTier || 'free', tenant.platformFeePercent)
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

  // Get contract and payment for saving to multiple locations
  const [contract] = await db
    .select()
    .from(adoptionContracts)
    .where(eq(adoptionContracts.sessionId, session.id))
    .limit(1);

  const [payment] = await db
    .select()
    .from(adoptionPayments)
    .where(eq(adoptionPayments.sessionId, session.id))
    .limit(1);

  // Get animal info for document titles
  const [animal] = await db
    .select()
    .from(animals)
    .where(eq(animals.id, session.animalId))
    .limit(1);

  const animalName = animal?.name || 'Unknown Animal';

  // Save signed adoption contract to animal's medical files
  try {
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

  // Save adoption contract to adopter's person documents
  try {
    if (contract?.contractPdfUrl && session.adopterContactId) {
      await db.insert(personDocuments).values({
        tenantId: session.tenantId,
        personType: 'contact',
        personId: session.adopterContactId,
        personEmail: contract.signerEmail,
        documentType: 'agreement',
        documentSubtype: 'adoption_contract',
        title: `Adoption Contract - ${animalName}`,
        description: `Signed adoption contract for ${animalName}. Signed on ${contract.signedAt?.toLocaleDateString() || new Date().toLocaleDateString()}.`,
        objectPath: contract.contractPdfUrl,
        sourceId: session.id,
        sourceTable: 'adoption_contracts',
        fileName: `adoption-contract-${animalName.replace(/\s+/g, '-').toLowerCase()}.pdf`,
        contentType: 'application/pdf',
      });
      console.log(`[Adoption] Saved signed contract to adopter's person documents`);
    }
  } catch (error) {
    console.error('Failed to save adoption contract to adopter documents:', error);
  }

  // Note: Adoption contracts are automatically displayed in the Documents page Agreements tab
  // via the /api/documents/applications-agreements endpoint querying adoptionContracts table

  // Save payment receipt URL to adopter's documents if available
  try {
    if (payment?.receiptUrl && session.adopterContactId) {
      await db.insert(personDocuments).values({
        tenantId: session.tenantId,
        personType: 'contact',
        personId: session.adopterContactId,
        personEmail: contract?.signerEmail,
        documentType: 'uploaded',
        documentSubtype: 'other',
        title: `Payment Receipt - ${animalName}`,
        description: `Adoption payment receipt for ${animalName}. Paid on ${new Date().toLocaleDateString()}.`,
        objectPath: payment.receiptUrl,
        sourceId: session.id,
        sourceTable: 'adoption_contracts',
        fileName: `adoption-receipt-${animalName.replace(/\s+/g, '-').toLowerCase()}.pdf`,
        contentType: 'application/pdf',
      });
      console.log(`[Adoption] Saved payment receipt to adopter's person documents`);
    }
  } catch (error) {
    console.error('Failed to save payment receipt to adopter documents:', error);
  }

  // Create preventative care records from medical due dates for compliance monitoring
  try {
    const medDates = session.medicalDueDates as any;
    if (medDates && typeof medDates === 'object') {
      const CARE_MAP: { dateKey: string; careName: string; category: 'vaccine' | 'parasite_prevention'; searchTerms: string[] }[] = [
        { dateKey: 'rabiesDueDate', careName: 'Rabies', category: 'vaccine', searchTerms: ['rabies'] },
        { dateKey: 'dhppDueDate', careName: 'DHPP', category: 'vaccine', searchTerms: ['dhpp', 'da2pp', 'dapp', 'distemper'] },
        { dateKey: 'bordetellaDueDate', careName: 'Bordetella', category: 'vaccine', searchTerms: ['bordetella', 'kennel cough'] },
        { dateKey: 'heartwormDueDate', careName: 'Heartworm Prevention', category: 'parasite_prevention', searchTerms: ['heartworm'] },
        { dateKey: 'fleaTickDueDate', careName: 'Flea/Tick Prevention', category: 'parasite_prevention', searchTerms: ['flea', 'tick'] },
      ];

      const allCareTypes = await db
        .select()
        .from(preventativeCareTypes)
        .where(
          or(
            eq(preventativeCareTypes.tenantId, session.tenantId),
            isNull(preventativeCareTypes.tenantId)
          )
        );

      for (const mapping of CARE_MAP) {
        const dueDateStr = medDates[mapping.dateKey];
        if (!dueDateStr) continue;

        const dueDate = new Date(dueDateStr);
        if (isNaN(dueDate.getTime())) continue;

        const matchingType = allCareTypes.find(ct => {
          const name = ct.name.toLowerCase();
          return mapping.searchTerms.some(term => name.includes(term));
        });

        const existingRecords = await db
          .select()
          .from(preventativeCareRecords)
          .where(
            and(
              eq(preventativeCareRecords.animalId, session.animalId),
              eq(preventativeCareRecords.tenantId, session.tenantId),
              matchingType
                ? eq(preventativeCareRecords.careTypeId, matchingType.id)
                : ilike(preventativeCareRecords.careName, `%${mapping.careName}%`)
            )
          )
          .orderBy(sql`${preventativeCareRecords.dateAdministered} DESC`)
          .limit(1);

        if (existingRecords.length > 0) {
          await db
            .update(preventativeCareRecords)
            .set({
              nextDueDate: dueDate,
              updatedAt: new Date(),
            })
            .where(eq(preventativeCareRecords.id, existingRecords[0].id));
        } else {
          await db.insert(preventativeCareRecords).values({
            animalId: session.animalId,
            tenantId: session.tenantId,
            careTypeId: matchingType?.id || null,
            careName: matchingType?.name || mapping.careName,
            careCategory: mapping.category,
            dateAdministered: new Date(),
            nextDueDate: dueDate,
            administeredBy: 'Set at adoption',
            notes: `Due date confirmed during adoption checkout`,
          });
        }
      }
      console.log(`[Adoption] Created/updated preventative care records from medical due dates for animal ${session.animalId}`);
    }
  } catch (error) {
    console.error('Failed to create preventative care records from medical due dates:', error);
  }

  try {
    const cp = session.carePriorities as any;
    if (cp && cp.enabled && cp.flags) {
      const notes: string[] = [];
      if (cp.flags.medicalNeeds?.checked && cp.flags.medicalNeeds.notes) {
        notes.push(`[Medical] ${cp.flags.medicalNeeds.notes}`);
      }
      if (cp.flags.behavioral?.checked && cp.flags.behavioral.notes) {
        notes.push(`[Behavioral] ${cp.flags.behavioral.notes}`);
      }
      if (cp.flags.diet?.checked && cp.flags.diet.notes) {
        notes.push(`[Diet] ${cp.flags.diet.notes}`);
      }
      if (cp.flags.flightRisk?.checked && cp.flags.flightRisk.notes) {
        notes.push(`[Flight Risk] ${cp.flags.flightRisk.notes}`);
      }

      if (notes.length > 0) {
        const [currentAnimal] = await db
          .select({ medicalAlertMemo: animals.medicalAlertMemo })
          .from(animals)
          .where(eq(animals.id, session.animalId))
          .limit(1);

        const existingMemo = currentAnimal?.medicalAlertMemo || '';
        const careSection = `\n--- Care Priorities (Adoption ${new Date().toLocaleDateString()}) ---\n${notes.join('\n')}`;
        const updatedMemo = existingMemo ? `${existingMemo}${careSection}` : careSection.trim();

        await db
          .update(animals)
          .set({ medicalAlertMemo: updatedMemo, updatedAt: new Date() })
          .where(eq(animals.id, session.animalId));

        console.log(`[Adoption] Persisted care priorities to animal ${session.animalId} medical alert memo`);
      }
    }
  } catch (error) {
    console.error('Failed to persist care priorities to animal record:', error);
  }

  // Send staff notification email about completed adoption
  try {
    const [staffUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, session.staffInitiatedBy))
      .limit(1);

    if (staffUser?.email) {
      const emailService = await EmailService.forTenant(session.tenantId);
      if (emailService) {
        const totalAmount = session.totals?.total || session.baseFee || '0';
        await emailService.send({
          to: staffUser.email,
          subject: `Adoption Complete: ${animalName} has been adopted!`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #10b981;">Adoption Complete!</h2>
              <p>Great news! The adoption for <strong>${animalName}</strong> has been successfully completed.</p>
              
              <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <h3 style="margin-top: 0;">Adoption Details</h3>
                <p><strong>Animal:</strong> ${animalName}</p>
                <p><strong>Adopter:</strong> ${contract?.signerName || 'N/A'}</p>
                <p><strong>Email:</strong> ${contract?.signerEmail || 'N/A'}</p>
                <p><strong>Payment Amount:</strong> $${totalAmount}</p>
                <p><strong>Completed:</strong> ${new Date().toLocaleString()}</p>
              </div>
              
              <p>The signed adoption contract can be found in:</p>
              <ul>
                <li>Animal's medical files</li>
                <li>Adopter's person documents</li>
                <li>Documents page → Agreements tab → Adoption Agreements folder</li>
              </ul>
              
              <p>The application has been moved to "Adopted" status on the pipeline.</p>
            </div>
          `,
        });
        console.log(`[Adoption] Sent staff notification email to ${staffUser.email}`);
      }
    }
  } catch (error) {
    console.error('Failed to send staff notification email:', error);
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

  // Auto-create adopter user account for Pet Portal access
  try {
    const adopterEmail = contract?.signerEmail;
    const adopterName = contract?.signerName;
    
    if (adopterEmail) {
      const normalizedEmail = adopterEmail.trim().toLowerCase();
      
      // Check if user already exists for this tenant
      const [existingUser] = await db
        .select({ id: users.id, roles: users.roles })
        .from(users)
        .where(and(
          eq(users.tenantId, session.tenantId),
          sql`LOWER(${users.email}) = ${normalizedEmail}`,
          eq(users.isActive, true)
        ))
        .limit(1);
      
      let adopterUserId: string;
      
      if (existingUser) {
        // User exists — add 'adopter' role if not already present
        if (!existingUser.roles.includes('adopter')) {
          await db
            .update(users)
            .set({ roles: [...existingUser.roles, 'adopter'] })
            .where(eq(users.id, existingUser.id));
          console.log(`[Adoption] Added 'adopter' role to existing user ${existingUser.id}`);
        }
        adopterUserId = existingUser.id;
      } else {
        // Create new adopter-only user account with a random password (they use magic links)
        const randomPassword = crypto.randomBytes(32).toString('hex');
        const passwordHash = await bcrypt.hash(randomPassword, 10);
        
        const [newUser] = await db
          .insert(users)
          .values({
            tenantId: session.tenantId,
            email: adopterEmail,
            passwordHash,
            fullName: adopterName || adopterEmail,
            roles: ['adopter'] as any,
            isActive: true,
          })
          .returning({ id: users.id });
        
        adopterUserId = newUser.id;
        console.log(`[Adoption] Created adopter user account ${newUser.id} for ${adopterEmail}`);
      }
      
      // Generate and send welcome magic link
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = await bcrypt.hash(rawToken, 10);
      const tokenExpiry = new Date();
      tokenExpiry.setHours(tokenExpiry.getHours() + 72); // 3 days for first login
      
      await db.insert(adopterMagicTokens).values({
        tenantId: session.tenantId,
        userId: adopterUserId,
        tokenHash,
        expiresAt: tokenExpiry,
      });
      
      // Build magic link URL
      const [tenantInfo] = await db
        .select({ subdomain: tenants.subdomain, customDomain: tenants.customDomain, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, session.tenantId))
        .limit(1);
      
      if (tenantInfo) {
        const encodedToken = encodeURIComponent(rawToken);
        let loginUrl: string;
        if (tenantInfo.customDomain) {
          loginUrl = `https://${tenantInfo.customDomain}/my-pets/login?token=${encodedToken}`;
        } else {
          const baseUrl = process.env.REPLIT_DEV_DOMAIN 
            ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
            : (process.env.APP_BASE_URL || 'https://irescue.life');
          const tenantPath = tenantInfo.subdomain ? `/${tenantInfo.subdomain}` : '';
          loginUrl = `${baseUrl}${tenantPath}/my-pets/login?token=${encodedToken}`;
        }
        
        const welcomeEmailService = await EmailService.forTenant(session.tenantId);
        if (welcomeEmailService) {
          await welcomeEmailService.send({
            to: adopterEmail,
            subject: `Your Pet Portal is Ready - ${tenantInfo.name}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2563eb;">Welcome to Your Pet Portal!</h2>
                <p>Hi ${adopterName || 'there'},</p>
                <p>Now that ${animalName}'s adoption is complete, you have access to your own <strong>Pet Portal</strong> where you can:</p>
                
                <ul style="font-size: 14px; line-height: 1.8;">
                  <li>View ${animalName}'s medical records and vaccination history</li>
                  <li>Track weight and health milestones</li>
                  <li>Set medication reminders</li>
                  <li>Share Happy Tails updates and photos</li>
                </ul>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${loginUrl}" 
                     style="background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                    Access My Pet Portal
                  </a>
                </div>
                
                <p style="color: #6b7280; font-size: 14px;">
                  No password needed! Just click the button above. This link expires in 3 days, but you can always request a new one from the Pet Portal login page.
                </p>
                
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                
                <p style="color: #9ca3af; font-size: 12px;">
                  Thank you for giving ${animalName} a loving home!<br>
                  ${tenantInfo.name}
                </p>
              </div>
            `,
          });
          console.log(`[Adoption] Sent Pet Portal welcome email to ${adopterEmail}`);
        }
      }
    }
  } catch (adopterError) {
    console.error('[Adoption] Failed to create adopter portal account:', adopterError);
  }

  // Get adopter info for scheduled communications
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
      const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
      const attachedDocNames: string[] = [];

      // 1. Payment Receipt PDF (only for paid adoptions)
      const hasPaidAmount = session.paidAt || (session.totals && parseFloat((session.totals as any).total || '0') > 0);
      if (hasPaidAmount) {
        try {
          const receiptPdf = await generatePaymentReceiptPDF(session.id);
          attachments.push({
            filename: `adoption-receipt-${animal.name.replace(/\s+/g, '-').toLowerCase()}.pdf`,
            content: receiptPdf,
            contentType: 'application/pdf',
          });
          attachedDocNames.push('<li><strong>Payment Receipt</strong> - Your official adoption payment receipt</li>');
        } catch (error) {
          console.error('Failed to generate payment receipt PDF:', error);
        }
      }

      // 2. Signed Contract PDF
      try {
        const [contractForAttach] = await db
          .select()
          .from(adoptionContracts)
          .where(eq(adoptionContracts.sessionId, session.id))
          .limit(1);

        if (contractForAttach?.contractPdfUrl) {
          const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
          if (!privateObjectDir) {
            throw new Error('PRIVATE_OBJECT_DIR not configured');
          }

          const pdfFilename = contractForAttach.contractPdfUrl.split('/').pop();
          if (!pdfFilename) {
            throw new Error('Invalid contract PDF URL');
          }

          const objectPath = `${privateObjectDir}/contracts/${pdfFilename}`;
          const pathParts = objectPath.split('/');
          const bucketName = pathParts[1];
          const objectName = pathParts.slice(2).join('/');

          console.log(`[Adoption] Downloading contract PDF from bucket=${bucketName}, object=${objectName}`);

          const bucket = objectStorageClient.bucket(bucketName);
          const file = bucket.file(objectName);

          const [exists] = await file.exists();
          if (!exists) {
            console.error(`[Adoption] Contract PDF file does not exist in storage: ${objectName} (stored path: ${contractForAttach.contractPdfUrl})`);
            throw new Error('Contract PDF file not found in storage');
          }

          const [contractBuffer] = await file.download();
          console.log(`[Adoption] Contract PDF downloaded: ${contractBuffer.length} bytes`);

          attachments.push({
            filename: `adoption-contract-${animal.name.replace(/\s+/g, '-').toLowerCase()}.pdf`,
            content: contractBuffer,
            contentType: 'application/pdf',
          });
          attachedDocNames.push('<li><strong>Signed Adoption Contract</strong> - Your legally binding adoption agreement</li>');
        } else {
          console.warn(`[Adoption] No contract PDF URL found for session ${session.id}`);
        }
      } catch (error) {
        console.error('[Adoption] Failed to download signed contract PDF:', error);
      }

      // 3. Medical History PDF
      try {
        const medicalHistoryPdf = await generateMedicalHistoryPDF(session.animalId, session.tenantId);
        attachments.push({
          filename: `medical-history-${animal.name.replace(/\s+/g, '-').toLowerCase()}.pdf`,
          content: medicalHistoryPdf,
          contentType: 'application/pdf',
        });
        attachedDocNames.push(`<li><strong>Medical History</strong> - ${animal.name}'s complete medical records</li>`);
      } catch (error) {
        console.error('Failed to generate medical history PDF:', error);
      }

      // Build dynamic attachments section for the email
      const attachmentsSection = attachments.length > 0 ? `
            <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0;">
              <h3 style="color: #10b981; margin-top: 0;">What's Included</h3>
              <p style="margin: 5px 0;">We've attached the following documents to this email:</p>
              <ul style="margin: 10px 0;">
                ${attachedDocNames.join('\n                ')}
              </ul>
              <p style="margin: 5px 0; font-size: 14px; color: #166534;">
                Please save these documents for your records.
              </p>
            </div>` : '';

      console.log(`[Adoption] Sending confirmation email with ${attachments.length} attachments for session ${session.id}`);

      await emailService.send({
        to: recipientEmail,
        subject: `Congratulations on Adopting ${animal.name}!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Welcome to the Family!</h2>
            <p>Dear ${recipientName},</p>
            <p>Congratulations on completing the adoption of <strong>${animal.name}</strong>!</p>
            ${attachmentsSection}

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
        attachments: attachments.length > 0 ? attachments : undefined,
      });
    } catch (error) {
      console.error('Failed to send confirmation email with attachments:', error);
      try {
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
      } catch (fallbackError) {
        console.error('Failed to send fallback confirmation email:', fallbackError);
      }
    }
  }
}

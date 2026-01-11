import { eq, sql, and, gte } from 'drizzle-orm';
import { db } from '../db';
import { tenants, platformIntegrations, users, gmailSendLogs } from '@shared/schema';
import { decrypt } from './encryption';
import { GmailService } from './googleWorkspace';

const RESEND_API_URL = 'https://api.resend.com';

// Gmail API limits for Google Workspace (including Nonprofits)
const GMAIL_DAILY_LIMIT = 2000; // 2,000 emails per 24-hour rolling window
const GMAIL_BATCH_THRESHOLD = 500; // Recommend batch scheduling if > 500 recipients

// Cache to track which tenants have been notified about Gmail failures
// Key: tenantId, Value: timestamp when notified
// Notifications won't be sent again for 24 hours
const gmailFailureNotifiedTenants = new Map<string, number>();
const NOTIFICATION_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

// Cache to track which tenants have been warned about approaching Gmail limits
// Key: tenantId, Value: timestamp when warned
const gmailLimitWarningTenants = new Map<string, number>();
const LIMIT_WARNING_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown for limit warnings

/**
 * Email Deliverability Utilities
 * These helpers improve spam filter scoring
 */

/**
 * Remove emojis and clean subject lines for better deliverability
 * Spam filters often flag emails with emojis in subjects
 */
function cleanSubjectLine(subject: string): string {
  // Remove emojis (Unicode emoji ranges)
  let cleaned = subject.replace(/[\u{1F600}-\u{1F64F}]/gu, ''); // Emoticons
  cleaned = cleaned.replace(/[\u{1F300}-\u{1F5FF}]/gu, ''); // Misc Symbols and Pictographs
  cleaned = cleaned.replace(/[\u{1F680}-\u{1F6FF}]/gu, ''); // Transport and Map
  cleaned = cleaned.replace(/[\u{1F1E0}-\u{1F1FF}]/gu, ''); // Flags
  cleaned = cleaned.replace(/[\u{2600}-\u{26FF}]/gu, ''); // Misc symbols
  cleaned = cleaned.replace(/[\u{2700}-\u{27BF}]/gu, ''); // Dingbats
  cleaned = cleaned.replace(/[\u{FE00}-\u{FE0F}]/gu, ''); // Variation Selectors
  cleaned = cleaned.replace(/[\u{1F900}-\u{1F9FF}]/gu, ''); // Supplemental Symbols and Pictographs
  cleaned = cleaned.replace(/[\u{1FA00}-\u{1FA6F}]/gu, ''); // Chess Symbols
  cleaned = cleaned.replace(/[\u{1FA70}-\u{1FAFF}]/gu, ''); // Symbols and Pictographs Extended-A
  
  // Remove common spam trigger patterns
  cleaned = cleaned.replace(/!!+/g, '!'); // Multiple exclamation marks
  cleaned = cleaned.replace(/\?\?+/g, '?'); // Multiple question marks
  cleaned = cleaned.replace(/\$\$+/g, '$'); // Multiple dollar signs
  cleaned = cleaned.replace(/FREE/gi, 'Free'); // All caps FREE
  cleaned = cleaned.replace(/URGENT/gi, 'Urgent'); // All caps URGENT
  cleaned = cleaned.replace(/ACT NOW/gi, 'Act now'); // All caps ACT NOW
  cleaned = cleaned.replace(/LIMITED TIME/gi, 'Limited time'); // All caps LIMITED TIME
  
  // Clean up extra whitespace from removed emojis
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

/**
 * Convert HTML email to plain text alternative
 * Many spam filters prefer multipart emails with both HTML and text versions
 */
function htmlToPlainText(html: string): string {
  let text = html;
  
  // Remove style and script tags with their content
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  
  // Convert common HTML elements to text equivalents
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '  - ');
  text = text.replace(/<\/tr>/gi, '\n');
  text = text.replace(/<\/td>/gi, '\t');
  
  // Convert links to text with URL
  text = text.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/gi, '$2 ($1)');
  
  // Convert strong/bold to *text*
  text = text.replace(/<(strong|b)[^>]*>([^<]*)<\/(strong|b)>/gi, '*$2*');
  
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  
  // Decode HTML entities
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");
  text = text.replace(/&copy;/gi, '(c)');
  text = text.replace(/&reg;/gi, '(R)');
  text = text.replace(/&trade;/gi, '(TM)');
  
  // Clean up whitespace
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n'); // Max 2 consecutive newlines
  text = text.replace(/[ \t]+/g, ' '); // Multiple spaces to single space
  text = text.trim();
  
  return text;
}

/**
 * Generate List-Unsubscribe header value
 * This signals to email providers that this is legitimate marketing email
 */
function generateUnsubscribeHeader(email: string, tenantSubdomain?: string): string {
  // Use mailto unsubscribe (most compatible)
  const unsubscribeEmail = `unsubscribe@irescue.life?subject=Unsubscribe&body=Please%20unsubscribe%20${encodeURIComponent(email)}`;
  
  // Also include a URL if we have tenant info
  if (tenantSubdomain) {
    const unsubscribeUrl = `https://irescue.life/${tenantSubdomain}/unsubscribe?email=${encodeURIComponent(email)}`;
    return `<mailto:${unsubscribeEmail}>, <${unsubscribeUrl}>`;
  }
  
  return `<mailto:${unsubscribeEmail}>`;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string; // Buffer or base64 string
  contentType?: string;
}

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string; // Plain text alternative for better deliverability
  from?: string; // Override from address
  replyTo?: string;
  attachments?: EmailAttachment[]; // PDF attachments
  headers?: Record<string, string>; // Custom headers like List-Unsubscribe
  strictGmailQuota?: boolean; // If true, fail instead of falling back to Resend when Gmail quota exceeded
}

interface ResendResponse {
  id?: string;
  error?: {
    message: string;
    name: string;
  };
}

/**
 * Email service for sending emails via Resend or Gmail
 * Supports three modes:
 * 1. Google Workspace Gmail (preferred) - uses Gmail API if configured
 * 2. Platform-wide API key (default) - uses PLATFORM_RESEND_API_KEY with quota tracking
 * 3. Tenant-specific API key (optional) - allows tenants to use their own Resend account
 */
export class EmailService {
  private apiKey: string;
  private fromEmail: string;
  private fromName: string;
  private tenantId: string;
  private usePlatformKey: boolean;
  private gmailService: GmailService | null;

  private tenantReplyToEmail: string | null = null;  // For DMARC compliance with Resend fallback

  constructor(apiKey: string, fromEmail: string, fromName: string, tenantId: string, usePlatformKey: boolean = false, gmailService: GmailService | null = null) {
    this.apiKey = apiKey;
    this.fromEmail = fromEmail;
    this.fromName = fromName;
    this.tenantId = tenantId;
    this.usePlatformKey = usePlatformKey;
    this.gmailService = gmailService;
  }

  /**
   * Set the tenant's reply-to email for DMARC compliance when using Resend fallback
   */
  setTenantReplyToEmail(email: string): void {
    this.tenantReplyToEmail = email;
  }

  /**
   * Check if this email service is using Gmail API (vs Resend)
   */
  isUsingGmail(): boolean {
    return this.gmailService !== null;
  }

  /**
   * Get Gmail sends in the last 24 hours for this tenant (rolling window)
   */
  static async getGmailSendsLast24Hours(tenantId: string): Promise<number> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const result = await db
      .select({ count: sql<number>`COALESCE(SUM(recipient_count), 0)::int` })
      .from(gmailSendLogs)
      .where(and(
        eq(gmailSendLogs.tenantId, tenantId),
        gte(gmailSendLogs.sentAt, twentyFourHoursAgo)
      ));
    
    return result[0]?.count || 0;
  }

  /**
   * Get remaining Gmail quota for this tenant
   */
  static async getGmailRemainingQuota(tenantId: string): Promise<{ used: number; remaining: number; limit: number }> {
    const used = await EmailService.getGmailSendsLast24Hours(tenantId);
    return {
      used,
      remaining: Math.max(0, GMAIL_DAILY_LIMIT - used),
      limit: GMAIL_DAILY_LIMIT
    };
  }

  /**
   * Log a Gmail send for rate limiting tracking
   */
  private async logGmailSend(recipientEmail: string, messageId?: string, purpose: 'newsletter' | 'notification' | 'transactional' | 'campaign' | 'other' = 'other'): Promise<void> {
    try {
      await db.insert(gmailSendLogs).values({
        tenantId: this.tenantId,
        recipientEmail,
        recipientCount: 1,
        messageId,
        purpose,
      });
    } catch (error) {
      console.warn(`[EmailService] Failed to log Gmail send for tenant ${this.tenantId}:`, error);
    }
  }

  /**
   * Check if Gmail sending is allowed (under daily limit)
   * Returns remaining quota and whether sending is blocked
   * IMPORTANT: `allowed` is false if remaining quota is 0 OR if requested count would exceed
   */
  async checkGmailQuota(recipientsCount: number = 1): Promise<{ 
    allowed: boolean; 
    used: number; 
    remaining: number; 
    wouldExceed: boolean;
    message?: string;
  }> {
    const quota = await EmailService.getGmailRemainingQuota(this.tenantId);
    const wouldExceed = recipientsCount > quota.remaining;
    const allowed = quota.remaining > 0 && !wouldExceed;
    
    return {
      allowed,
      used: quota.used,
      remaining: quota.remaining,
      wouldExceed,
      message: !allowed 
        ? `Gmail daily limit would be exceeded. You've sent ${quota.used} emails in the last 24 hours. Limit: ${GMAIL_DAILY_LIMIT}. Remaining: ${quota.remaining}. Requested: ${recipientsCount}.`
        : undefined
    };
  }

  /**
   * Check if batch scheduling is recommended for a campaign
   */
  static shouldBatchCampaign(recipientCount: number): boolean {
    return recipientCount > GMAIL_BATCH_THRESHOLD;
  }

  /**
   * Get the daily batch threshold
   */
  static getBatchThreshold(): number {
    return GMAIL_BATCH_THRESHOLD;
  }

  /**
   * Get the daily Gmail limit
   */
  static getDailyLimit(): number {
    return GMAIL_DAILY_LIMIT;
  }

  /**
   * Create an EmailService instance for a specific tenant
   * Priority order:
   * 1. Google Workspace Gmail (if enabled with useGmail = true)
   * 2. Tenant's own Resend API key
   * 3. Platform-wide Resend API key
   */
  static async forTenant(tenantId: string): Promise<EmailService | null> {
    console.log(`[EmailService] Creating email service for tenant: ${tenantId}`);
    
    const [tenant] = await db
      .select({
        name: tenants.name,
        resendApiKeyEncrypted: tenants.resendApiKeyEncrypted,
        resendFromEmail: tenants.resendFromEmail,
        resendFromName: tenants.resendFromName,
        resendEnabled: tenants.resendEnabled,
        emailsSentThisMonth: tenants.emailsSentThisMonth,
        emailQuotaLimit: tenants.emailQuotaLimit,
        contactEmail: tenants.contactEmail, // For DMARC compliance reply-to
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      console.log(`[EmailService] Tenant not found: ${tenantId}`);
      return null;
    }
    
    // Resolve tenant reply-to email for DMARC compliance
    // Priority: resendFromEmail > contactEmail > null
    const tenantReplyTo = tenant.resendFromEmail || tenant.contactEmail || null;

    // 1. Check for Google Workspace Gmail integration
    try {
      console.log(`[EmailService] Checking Gmail integration for tenant: ${tenantId}`);
      const gmailService = await GmailService.forTenant(tenantId);
      console.log(`[EmailService] GmailService.forTenant result: ${gmailService ? 'found' : 'null'}`);
      
      if (gmailService) {
        // Check if Gmail is enabled for sending (platformIntegrations imported at top of file)
        const [integration] = await db
          .select()
          .from(platformIntegrations)
          .where(and(
            eq(platformIntegrations.tenantId, tenantId),
            eq(platformIntegrations.platform, 'google_workspace'),
            eq(platformIntegrations.isEnabled, true)
          ))
          .limit(1);

        console.log(`[EmailService] Google Workspace integration found: ${!!integration}`);
        console.log(`[EmailService] googleFeatures:`, JSON.stringify(integration?.googleFeatures || {}, null, 2));
        console.log(`[EmailService] useGmail enabled: ${integration?.googleFeatures?.useGmail}`);

        if (integration?.googleFeatures?.useGmail) {
          // IMPORTANT: When using Gmail API, the "From" address MUST be a verified
          // send-as alias in the connected Gmail account. Do NOT fall back to 
          // Resend addresses (like noreply@irescue.life) as Gmail will reject or
          // rewrite the header to look unprofessional.
          
          // Priority order for sender email:
          // 1. Default address from senderAddresses array
          // 2. Legacy senderEmail field
          // 3. connectedEmail (the OAuth account)
          const senderAddresses = integration.googleFeatures.senderAddresses || [];
          const defaultAddress = senderAddresses.find((a: any) => a.isDefault);
          
          const fromEmail = defaultAddress?.email ||
                           integration.googleFeatures.senderEmail || 
                           integration.googleFeatures.connectedEmail;
          
          console.log(`[EmailService] Gmail senderAddresses: ${JSON.stringify(senderAddresses)}`);
          console.log(`[EmailService] Gmail defaultAddress: ${JSON.stringify(defaultAddress)}`);
          console.log(`[EmailService] Gmail fromEmail resolved to: ${fromEmail}`);
          
          if (!fromEmail) {
            console.warn(`[EmailService] Gmail enabled for tenant ${tenantId} but no valid sender email configured - falling through to Resend`);
            // Fall through to Resend instead of using invalid Gmail sender
          } else {
            // Use sender name from default address, legacy senderName, or fall back to tenant name
            const fromName = defaultAddress?.name ||
                            integration.googleFeatures.senderName || 
                            tenant.resendFromName || 
                            tenant.name;
            
            // CRITICAL: Get fallback Resend API key for when Gmail OAuth expires
            // This allows the EmailService to fall back to Resend if Gmail fails
            let fallbackResendKey = '';
            let usePlatformKey = false;
            
            // Try tenant's own Resend key first
            if (tenant.resendEnabled && tenant.resendApiKeyEncrypted) {
              fallbackResendKey = decrypt(tenant.resendApiKeyEncrypted);
              console.log(`[EmailService] Gmail with tenant Resend fallback configured`);
            } else {
              // Fall back to platform key
              fallbackResendKey = process.env.PLATFORM_RESEND_API_KEY || '';
              usePlatformKey = !!fallbackResendKey;
              if (fallbackResendKey) {
                console.log(`[EmailService] Gmail with platform Resend fallback configured`);
              }
            }
            
            console.log(`[EmailService] ✅ Using Gmail API with sender: ${fromName} <${fromEmail}> (Resend fallback: ${fallbackResendKey ? 'available' : 'NOT AVAILABLE'})`);
            const service = new EmailService(fallbackResendKey, fromEmail, fromName, tenantId, usePlatformKey, gmailService);
            // Set reply-to for DMARC compliance when falling back to Resend
            if (tenantReplyTo) {
              service.setTenantReplyToEmail(tenantReplyTo);
            }
            return service;
          }
        } else {
          console.log(`[EmailService] Gmail not enabled (useGmail is false or undefined)`);
        }
      }
    } catch (error) {
      console.warn('[EmailService] Failed to check Google Workspace integration, falling back to Resend:', error);
    }

    // 2. Check if tenant has their own Resend API key configured
    if (tenant.resendEnabled && tenant.resendApiKeyEncrypted) {
      const apiKey = decrypt(tenant.resendApiKeyEncrypted);
      const fromEmail = tenant.resendFromEmail || 'noreply@example.com';
      const fromName = tenant.resendFromName || tenant.name;
      console.log(`[EmailService] Using tenant's own Resend API key with sender: ${fromName} <${fromEmail}>`);
      const service = new EmailService(apiKey, fromEmail, fromName, tenantId, false);
      // Set reply-to for DMARC compliance (tenant's own key may still need this)
      if (tenantReplyTo) {
        service.setTenantReplyToEmail(tenantReplyTo);
      }
      return service;
    }

    // 3. Fall back to platform-wide API key if available
    const platformApiKey = process.env.PLATFORM_RESEND_API_KEY;
    if (platformApiKey) {
      // Check quota before creating service
      if (tenant.emailsSentThisMonth >= tenant.emailQuotaLimit) {
        console.warn(`[EmailService] Tenant ${tenantId} has exceeded email quota (${tenant.emailsSentThisMonth}/${tenant.emailQuotaLimit})`);
        return null; // Quota exceeded
      }

      const fromEmail = tenant.resendFromEmail || 'noreply@irescue.life';
      const fromName = tenant.resendFromName || tenant.name;
      console.log(`[EmailService] ⚠️ Falling back to platform Resend API key with sender: ${fromName} <${fromEmail}>`);
      const service = new EmailService(platformApiKey, fromEmail, fromName, tenantId, true);
      // CRITICAL: Set reply-to for DMARC compliance when using platform key
      // This ensures replies go to the tenant, not the platform email
      if (tenantReplyTo) {
        service.setTenantReplyToEmail(tenantReplyTo);
        console.log(`[EmailService] Set tenant reply-to for DMARC compliance: ${tenantReplyTo}`);
      }
      return service;
    }

    // No email service available
    console.log(`[EmailService] No email service available for tenant ${tenantId}`);
    return null;
  }

  /**
   * Increment email usage counter for tenant (when using platform key)
   */
  private async incrementUsage(count: number = 1): Promise<void> {
    if (!this.usePlatformKey) {
      return; // Only track usage for platform key
    }

    await db
      .update(tenants)
      .set({
        emailsSentThisMonth: sql`${tenants.emailsSentThisMonth} + ${count}`,
      })
      .where(eq(tenants.id, this.tenantId));
  }

  /**
   * Notify tenant admins when Gmail fails and falls back to Resend
   * Only sends one notification per 24 hours to avoid spamming
   */
  private async notifyAdminsGmailFailure(errorReason: string): Promise<void> {
    // Check if we have a Resend API key to send the notification
    if (!this.apiKey) {
      console.warn(`[EmailService] Cannot send Gmail failure notification - no Resend API key available for tenant ${this.tenantId}`);
      return;
    }

    // Check if we've already notified this tenant recently
    const lastNotified = gmailFailureNotifiedTenants.get(this.tenantId);
    if (lastNotified && (Date.now() - lastNotified) < NOTIFICATION_COOLDOWN_MS) {
      console.log(`[EmailService] Skipping Gmail failure notification for tenant ${this.tenantId} - already notified recently`);
      return;
    }

    try {
      // Get admin users for this tenant
      const adminUsers = await db
        .select({ email: users.email, firstName: users.firstName })
        .from(users)
        .where(and(
          eq(users.tenantId, this.tenantId),
          sql`'admin' = ANY(${users.roles})`
        ));

      if (adminUsers.length === 0) {
        console.log(`[EmailService] No admin users found for tenant ${this.tenantId} to notify about Gmail failure`);
        return;
      }

      // Get tenant info for the email
      const [tenant] = await db
        .select({ name: tenants.name, subdomain: tenants.subdomain })
        .from(tenants)
        .where(eq(tenants.id, this.tenantId))
        .limit(1);

      const tenantName = tenant?.name || 'Your organization';
      const subdomain = tenant?.subdomain || '';

      // Build the notification email
      const subject = `Action Required: Gmail Connection Needs Reconnection`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #d97706;">Gmail Connection Issue Detected</h2>
          
          <p>Hello,</p>
          
          <p>We detected an issue with the Gmail connection for <strong>${tenantName}</strong>. 
          Your emails are still being sent successfully using our backup email service (Resend), 
          but to restore Gmail sending, you'll need to reconnect your Google Workspace.</p>
          
          <div style="background-color: #fef3c7; border-left: 4px solid #d97706; padding: 12px 16px; margin: 20px 0;">
            <strong>Technical Details:</strong><br>
            ${errorReason}
          </div>
          
          <h3>Why did this happen?</h3>
          <p>Gmail authorization tokens can expire or become invalid when:</p>
          <ul>
            <li>Someone changes their Google password</li>
            <li>App permissions were revoked in Google Account settings</li>
            <li>Google's security policies detected unusual activity</li>
            <li>The connection hasn't been used for an extended period</li>
          </ul>
          
          <h3>How to fix it:</h3>
          <ol>
            <li>Log in to your admin portal</li>
            <li>Go to <strong>Settings</strong> &rarr; <strong>Integrations</strong></li>
            <li>Find <strong>Google Workspace</strong> and click <strong>Disconnect</strong></li>
            <li>Click <strong>Connect</strong> again and re-authorize the permissions</li>
          </ol>
          
          <p style="margin-top: 20px;">
            <a href="https://irescue.life/${subdomain}/settings" 
               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Go to Settings
            </a>
          </p>
          
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            Note: Your emails are still being delivered via our backup service. This is just a notification 
            to let you know that Gmail sending is temporarily unavailable until you reconnect.
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px;">
            This is an automated system notification from iRescue.life
          </p>
        </div>
      `;

      // Send notification to each admin (using Resend since Gmail is broken)
      for (const admin of adminUsers) {
        if (!admin.email) continue;
        
        try {
          await this.sendViaResend({
            to: admin.email,
            subject,
            html,
          });
          console.log(`[EmailService] Gmail failure notification sent to admin: ${admin.email}`);
        } catch (err) {
          console.error(`[EmailService] Failed to send Gmail failure notification to ${admin.email}:`, err);
        }
      }

      // Mark this tenant as notified
      gmailFailureNotifiedTenants.set(this.tenantId, Date.now());
      console.log(`[EmailService] Gmail failure notifications sent to ${adminUsers.length} admins for tenant ${this.tenantId}`);
    } catch (error) {
      console.error(`[EmailService] Error sending Gmail failure notification:`, error);
    }
  }

  /**
   * Check if tenant has sufficient quota remaining
   */
  async checkQuota(emailCount: number = 1): Promise<{ allowed: boolean; remaining: number; limit: number }> {
    if (!this.usePlatformKey) {
      // Tenant has their own key, no quota limit
      return { allowed: true, remaining: -1, limit: -1 };
    }

    const [tenant] = await db
      .select({
        emailsSentThisMonth: tenants.emailsSentThisMonth,
        emailQuotaLimit: tenants.emailQuotaLimit,
      })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId))
      .limit(1);

    if (!tenant) {
      return { allowed: false, remaining: 0, limit: 0 };
    }

    const remaining = tenant.emailQuotaLimit - tenant.emailsSentThisMonth;
    const allowed = remaining >= emailCount;

    return {
      allowed,
      remaining: Math.max(0, remaining),
      limit: tenant.emailQuotaLimit,
    };
  }

  /**
   * Send a single email
   */
  async send(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // If Gmail is configured, try it first
    if (this.gmailService) {
      try {
        // CRITICAL: Check Gmail daily quota before sending (2,000/day limit for Workspace)
        const gmailQuota = await this.checkGmailQuota(1);
        if (!gmailQuota.allowed) {
          console.warn(`[EmailService] Gmail daily limit reached (${gmailQuota.used}/${GMAIL_DAILY_LIMIT})`);
          // Warn admins about approaching/exceeding limit (rate-limited)
          const lastWarned = gmailLimitWarningTenants.get(this.tenantId);
          if (!lastWarned || (Date.now() - lastWarned) > LIMIT_WARNING_COOLDOWN_MS) {
            console.log(`[EmailService] Gmail quota exceeded for tenant ${this.tenantId} - should notify admins`);
            gmailLimitWarningTenants.set(this.tenantId, Date.now());
          }
          
          // If strictGmailQuota mode, fail without fallback (used for batch newsletter sends)
          if (options.strictGmailQuota) {
            return {
              success: false,
              error: `GMAIL_QUOTA_EXCEEDED: ${gmailQuota.message}`,
            };
          }
          
          // Fall back to Resend
          console.warn(`[EmailService] Falling back to Resend...`);
          if (this.apiKey) {
            return await this.sendViaResend(options);
          }
          return {
            success: false,
            error: `Gmail daily limit of ${GMAIL_DAILY_LIMIT} emails reached. No Resend fallback available.`,
          };
        }

        // Ensure the from address is set using the configured sender email
        const gmailOptions = {
          ...options,
          from: options.from || `${this.fromName} <${this.fromEmail}>`,
        };
        
        const result = await this.gmailService.sendEmail(gmailOptions);
        
        // If Gmail fails, fall back to Resend if available
        if (!result.success) {
          console.warn(`[EmailService] Gmail send failed: ${result.error}, attempting Resend Fallback...`);
          
          // Check if this is a token error that should trigger Resend fallback
          const isTokenError = result.error?.includes('invalid_grant') || 
                              result.error?.includes('Token has been expired') ||
                              result.error?.includes('Token has been revoked');
          
          if (isTokenError || this.apiKey) {
            console.log(`[EmailService] Falling back to Resend due to Gmail failure`);
            // Notify admins about Gmail failure (non-blocking)
            if (isTokenError) {
              this.notifyAdminsGmailFailure(result.error || 'Gmail OAuth token expired or revoked').catch(() => {});
            }
            const resendResult = await this.sendViaResend(options);
            if (resendResult.success) {
              console.log(`[EmailService] ✅ Sent via Resend Fallback (Gmail failed)`);
            }
            return resendResult;
          }
        }
        
        // Log successful Gmail send for quota tracking
        const recipientEmail = Array.isArray(options.to) ? options.to[0] : options.to;
        await this.logGmailSend(recipientEmail, result.messageId, 'other');
        
        console.log(`[EmailService] ✅ Sent via Gmail Integration (${gmailQuota.used + 1}/${GMAIL_DAILY_LIMIT} today)`);
        return result;
      } catch (gmailError: any) {
        // Gmail threw an exception - check if we should fall back to Resend
        const errorMessage = gmailError?.message || String(gmailError);
        console.error(`[EmailService] Gmail exception: ${errorMessage}`);
        
        // Check for OAuth token errors that indicate we should use Resend instead
        const isTokenError = errorMessage.includes('invalid_grant') || 
                            errorMessage.includes('Token has been expired') ||
                            errorMessage.includes('Token has been revoked') ||
                            errorMessage.includes('refresh');
        
        if (isTokenError) {
          console.warn(`[EmailService] Gmail OAuth token error detected, falling back to Resend`);
          // Notify admins about Gmail failure (non-blocking)
          this.notifyAdminsGmailFailure(errorMessage).catch(() => {});
          try {
            return await this.sendViaResend(options);
          } catch (resendError) {
            return {
              success: false,
              error: `Gmail failed (${errorMessage}), Resend fallback also failed: ${resendError}`,
            };
          }
        }
        
        // For other Gmail errors, still try Resend as fallback
        console.warn(`[EmailService] Gmail error, attempting Resend fallback`);
        try {
          return await this.sendViaResend(options);
        } catch (resendError) {
          return {
            success: false,
            error: `Gmail failed: ${errorMessage}`,
          };
        }
      }
    }

    // No Gmail configured, use Resend directly
    try {
      return await this.sendViaResend(options);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error sending email',
      };
    }
  }

  /**
   * Send email via Resend API
   * Includes deliverability improvements:
   * - Plain text alternative (multipart email)
   * - Cleaned subject lines (no emojis, avoid spam triggers)
   * - Custom headers support (List-Unsubscribe)
   * - DMARC compliance: hardcoded from address with reply_to for tenant email
   */
  private async sendViaResend(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Check quota before sending (only for platform key)
      const quota = await this.checkQuota(1);
      if (!quota.allowed) {
        return {
          success: false,
          error: `Email quota exceeded. Limit: ${quota.limit}/month. Please upgrade your plan or configure your own Resend API key.`,
        };
      }

      // CRITICAL (DMARC Compliance): When using Resend (especially platform key),
      // the "from" address MUST be from our verified domain to pass DMARC checks.
      // The tenant's email goes in reply_to so replies reach the correct person.
      // This prevents emails from bouncing or going to spam.
      let from: string;
      let replyTo = options.replyTo;
      
      if (this.usePlatformKey) {
        // Using platform key - MUST use verified domain sender
        from = `Adoption Alerts <notifications@irescue.life>`;
        // Set reply_to to tenant's email if available and not already set
        if (!replyTo && this.tenantReplyToEmail) {
          replyTo = this.tenantReplyToEmail;
        }
        console.log(`[EmailService] Resend using DMARC-compliant from: ${from}, reply_to: ${replyTo || 'none'}`);
      } else {
        // Tenant has their own Resend key with verified domain
        from = options.from || `${this.fromName} <${this.fromEmail}>`;
      }
      
      // Clean subject line for better deliverability (remove emojis, spam triggers)
      const cleanedSubject = cleanSubjectLine(options.subject);
      
      // Generate plain text alternative if not provided
      const plainText = options.text || htmlToPlainText(options.html);
      
      // Format attachments for Resend API
      const attachments = options.attachments?.map(att => {
        if (!att.filename || att.filename.trim() === '') {
          throw new Error('Attachment filename cannot be empty');
        }
        return {
          filename: att.filename,
          content: Buffer.isBuffer(att.content) ? att.content.toString('base64') : att.content,
          ...(att.contentType && { content_type: att.contentType }),
        };
      });
      
      // Build email payload with deliverability improvements
      const emailPayload: Record<string, any> = {
        from,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: cleanedSubject,
        html: options.html,
        text: plainText, // Plain text alternative for multipart email
        reply_to: replyTo, // Use DMARC-compliant reply_to (tenant email for platform key)
        attachments,
      };
      
      // Add custom headers if provided (e.g., List-Unsubscribe)
      if (options.headers && Object.keys(options.headers).length > 0) {
        emailPayload.headers = options.headers;
      }
      
      const response = await fetch(`${RESEND_API_URL}/emails`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailPayload),
      });

      const data: ResendResponse = await response.json();

      if (!response.ok || data.error) {
        return {
          success: false,
          error: data.error?.message || `Email API error: ${response.statusText}`,
        };
      }

      // Increment usage counter after successful send
      await this.incrementUsage(1);

      return {
        success: true,
        messageId: data.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error sending email',
      };
    }
  }

  /**
   * Send bulk emails (one at a time to avoid rate limits)
   * Returns summary of successful and failed sends
   * 
   * CRITICAL (Anti-Spam): When using Gmail API, we implement a 2-second delay
   * between emails to avoid triggering rate limits (Gmail has ~1 request/sec limit).
   * For Resend, a shorter delay is used since it handles rate limiting differently.
   */
  async sendBulk(options: Omit<EmailOptions, 'to'> & { 
    recipients: string[];
    fromName?: string;  // Optional override sender name
    fromEmail?: string; // Optional override sender email
  }): Promise<{
    total: number;
    successful: number;
    failed: number;
    errors: string[];
  }> {
    // Check quota for all recipients upfront
    const quota = await this.checkQuota(options.recipients.length);
    if (!quota.allowed) {
      return {
        total: options.recipients.length,
        successful: 0,
        failed: options.recipients.length,
        errors: [`Email quota exceeded. Limit: ${quota.limit}/month. Remaining: ${quota.remaining}. Please upgrade or configure your own Resend API key.`],
      };
    }

    const results = {
      total: options.recipients.length,
      successful: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Build from address with optional overrides
    let fromAddress = options.from;
    if (options.fromName && options.fromEmail) {
      fromAddress = `${options.fromName} <${options.fromEmail}>`;
    } else if (options.fromEmail) {
      fromAddress = options.fromEmail;
    }

    // Determine delay based on email provider
    // CRITICAL: Gmail API has rate limit of ~1 request/sec - use 2 second delay to avoid 429 errors
    // Resend handles rate limiting differently, so we can use a shorter delay
    const delayMs = this.isUsingGmail() ? 2000 : 200;
    const providerName = this.isUsingGmail() ? 'Gmail Integration' : 'Resend';
    
    console.log(`[EmailService] Starting bulk send to ${options.recipients.length} recipients via ${providerName} (delay: ${delayMs}ms per email)`);

    // Send emails one at a time to avoid overwhelming the API
    for (let i = 0; i < options.recipients.length; i++) {
      const recipient = options.recipients[i];
      const result = await this.send({
        to: recipient,
        subject: options.subject,
        html: options.html,
        from: fromAddress,
        replyTo: options.replyTo,
      });

      if (result.success) {
        results.successful++;
      } else {
        results.failed++;
        results.errors.push(`${recipient}: ${result.error}`);
      }

      // Rate limit delay between emails - CRITICAL for Gmail to avoid 429 errors
      // Only delay if there are more emails to send
      if (i < options.recipients.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    console.log(`[EmailService] Bulk send complete via ${providerName}: ${results.successful} success, ${results.failed} failed`);

    return results;
  }

  /**
   * Validate email configuration
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // Send a test email to verify the API key works
      const result = await this.send({
        to: this.fromEmail, // Send to self as a test
        subject: 'Test Email',
        html: '<p>This is a test email from your rescue portal.</p>',
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get usage statistics for the tenant
   */
  async getUsageStats(): Promise<{
    sent: number;
    limit: number;
    remaining: number;
    usePlatformKey: boolean;
  } | null> {
    const [tenant] = await db
      .select({
        emailsSentThisMonth: tenants.emailsSentThisMonth,
        emailQuotaLimit: tenants.emailQuotaLimit,
      })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId))
      .limit(1);

    if (!tenant) {
      return null;
    }

    return {
      sent: tenant.emailsSentThisMonth,
      limit: tenant.emailQuotaLimit,
      remaining: Math.max(0, tenant.emailQuotaLimit - tenant.emailsSentThisMonth),
      usePlatformKey: this.usePlatformKey,
    };
  }

  /**
   * Send notification to platform admin about new tenant signup
   */
  static async sendNewTenantNotification(tenantData: {
    rescueName: string;
    subdomain: string;
    adminEmail: string;
    tier: string;
  }): Promise<void> {
    console.log('🔔 [EMAIL SERVICE] sendNewTenantNotification called with:', { 
      rescueName: tenantData.rescueName, 
      subdomain: tenantData.subdomain, 
      adminEmail: tenantData.adminEmail,
      tier: tenantData.tier 
    });
    
    const platformAdminEmail = process.env.PLATFORM_ADMIN_EMAIL;
    const platformApiKey = process.env.PLATFORM_RESEND_API_KEY;

    console.log('🔑 [EMAIL SERVICE] Environment check:', {
      platformAdminEmail: platformAdminEmail || 'MISSING',
      platformApiKeyExists: !!platformApiKey
    });

    if (!platformAdminEmail || !platformApiKey) {
      console.error('❌ [EMAIL SERVICE] Platform admin email or API key not configured - skipping notification');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .detail-row { padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
            .label { font-weight: bold; color: #4b5563; display: inline-block; width: 150px; }
            .value { color: #111827; }
            .alert { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 4px; }
            .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">🎉 New Tenant Signup!</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">A new rescue organization has joined iRescue.life</p>
            </div>
            <div class="content">
              <div class="detail-row">
                <span class="label">Organization:</span>
                <span class="value">${tenantData.rescueName}</span>
              </div>
              <div class="detail-row">
                <span class="label">Subdomain:</span>
                <span class="value">${tenantData.subdomain}</span>
              </div>
              <div class="detail-row">
                <span class="label">Admin Email:</span>
                <span class="value">${tenantData.adminEmail}</span>
              </div>
              <div class="detail-row">
                <span class="label">Subscription Tier:</span>
                <span class="value">${tenantData.tier.charAt(0).toUpperCase() + tenantData.tier.slice(1)}</span>
              </div>
              
              <div style="margin-top: 30px; padding: 20px; background: white; border-radius: 6px;">
                <h3 style="margin-top: 0;">System Status:</h3>
                <ul style="margin: 0; padding-left: 20px; list-style: none;">
                  <li>Tenant account created in database</li>
                  <li>30-day free trial activated</li>
                  <li>Admin credentials configured</li>
                  <li>Welcome email sent with portal access instructions</li>
                </ul>
                
                <h3 style="margin-top: 20px; color: #4b5563;">Tenant Portal Access:</h3>
                <p style="margin: 10px 0; color: #6b7280;">The tenant can access their portal immediately at:</p>
                <div style="background: #1f2937; color: #10b981; padding: 10px 15px; border-radius: 6px; font-family: 'Courier New', monospace; margin: 10px 0;">
                  https://irescue.life/${tenantData.subdomain}
                </div>
                
                <div class="alert" style="background: #fef3c7; border-left-color: #f59e0b; margin-top: 20px;">
                  <strong>Custom Domain Setup (If Requested):</strong>
                  <p style="margin: 10px 0 0 0; color: #78350f;">If this tenant requests a custom domain:</p>
                  <ol style="margin: 10px 0 0 20px; color: #78350f;">
                    <li>Go to Replit Deployments > Settings > Link a domain</li>
                    <li>Add their custom domain (e.g., happypaws.org)</li>
                    <li>Copy the A record IP and TXT record values Replit generates</li>
                    <li>Send the DNS records to the tenant using the "Custom Domain DNS Records" email template</li>
                    <li>Once they configure DNS, verify and provision SSL</li>
                  </ol>
                </div>
                
                <h3 style="margin-top: 20px; color: #4b5563;">Monitoring:</h3>
                <ul style="margin: 0; padding-left: 20px;">
                  <li>Monitor tenant activity in platform admin panel</li>
                  <li>Check Stripe dashboard for subscription details</li>
                  <li>Review system health and usage metrics</li>
                </ul>
              </div>
            </div>
            <div class="footer">
              <p>This is an automated notification from iRescue.life Platform</p>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      console.log('📧 [EMAIL SERVICE] Sending admin notification via Resend API...');
      
      // Use cleaned subject line for better deliverability
      const subject = cleanSubjectLine(`New Signup: ${tenantData.rescueName} (${tenantData.subdomain})`);
      const plainText = htmlToPlainText(html);
      
      console.log('📧 [EMAIL SERVICE] Payload:', {
        from: 'iRescue.life Platform <notifications@irescue.life>',
        to: platformAdminEmail,
        subject
      });
      
      const response = await fetch(`${RESEND_API_URL}/emails`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${platformApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'iRescue.life Platform <notifications@irescue.life>',
          to: platformAdminEmail,
          subject,
          html,
          text: plainText,
        }),
      });

      console.log('📧 [EMAIL SERVICE] Resend API response status:', response.status);
      const result = await response.json() as ResendResponse;
      console.log('📧 [EMAIL SERVICE] Resend API response body:', JSON.stringify(result, null, 2));
      
      if (result.error) {
        console.error('❌ [EMAIL SERVICE] Failed to send admin notification:', result.error);
      } else {
        console.log(`✅ [EMAIL SERVICE] Admin notification sent successfully! Email ID: ${result.id}`);
      }
    } catch (error) {
      console.error('❌ [EMAIL SERVICE] Error sending admin notification:', error);
    }
  }

  /**
   * Send notification to platform admin about custom domain request from tenant settings
   */
  static async sendCustomDomainRequest(data: {
    tenantName: string;
    tenantSubdomain: string;
    customDomain: string;
    adminEmail: string;
  }): Promise<void> {
    console.log('🌐 [EMAIL SERVICE] sendCustomDomainRequest called with:', data);
    
    const platformAdminEmail = process.env.PLATFORM_ADMIN_EMAIL;
    const platformApiKey = process.env.PLATFORM_RESEND_API_KEY;

    if (!platformAdminEmail || !platformApiKey) {
      console.error('❌ [EMAIL SERVICE] Platform admin email or API key not configured - skipping custom domain notification');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .detail-row { padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
            .label { font-weight: bold; color: #4b5563; display: inline-block; width: 150px; }
            .value { color: #111827; }
            .alert { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 4px; }
            .steps { background: white; padding: 20px; border-radius: 6px; margin-top: 20px; }
            .step { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
            .step:last-child { border-bottom: none; }
            .step-number { display: inline-block; width: 24px; height: 24px; background: #667eea; color: white; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: bold; margin-right: 10px; }
            .code { background: #1f2937; color: #10b981; padding: 10px 15px; border-radius: 6px; font-family: 'Courier New', monospace; margin: 10px 0; }
            .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">🌐 Custom Domain Request</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">A tenant has requested a custom domain setup</p>
            </div>
            <div class="content">
              <div class="alert">
                <strong>⚡ Action Required:</strong> This tenant needs their custom domain configured in Replit deployment settings.
              </div>
              
              <div class="detail-row">
                <span class="label">Organization:</span>
                <span class="value">${data.tenantName}</span>
              </div>
              <div class="detail-row">
                <span class="label">Current URL:</span>
                <span class="value">irescue.life/${data.tenantSubdomain}</span>
              </div>
              <div class="detail-row">
                <span class="label">Requested Domain:</span>
                <span class="value" style="color: #059669; font-weight: bold;">${data.customDomain}</span>
              </div>
              <div class="detail-row">
                <span class="label">Admin Email:</span>
                <span class="value">${data.adminEmail}</span>
              </div>
              
              <div class="steps">
                <h3 style="margin-top: 0; color: #374151;">Setup Steps:</h3>
                
                <div class="step">
                  <span class="step-number">1</span>
                  <strong>Add Domain in Replit:</strong>
                  <p style="margin: 5px 0 0 40px; color: #6b7280;">Go to Replit Deployments → Settings → Link a domain → Add "${data.customDomain}"</p>
                </div>
                
                <div class="step">
                  <span class="step-number">2</span>
                  <strong>Copy DNS Records:</strong>
                  <p style="margin: 5px 0 0 40px; color: #6b7280;">Replit will generate A record IP and TXT record values</p>
                </div>
                
                <div class="step">
                  <span class="step-number">3</span>
                  <strong>Send DNS Records Email:</strong>
                  <p style="margin: 5px 0 0 40px; color: #6b7280;">Go to Platform Admin → Tenants → Find "${data.tenantSubdomain}" → Click "Send DNS Records Email"</p>
                </div>
                
                <div class="step">
                  <span class="step-number">4</span>
                  <strong>Wait for DNS Propagation:</strong>
                  <p style="margin: 5px 0 0 40px; color: #6b7280;">Tenant configures DNS at their registrar (takes 5 min - 48 hours to propagate)</p>
                </div>
                
                <div class="step">
                  <span class="step-number">5</span>
                  <strong>Verify Domain in Platform Admin:</strong>
                  <p style="margin: 5px 0 0 40px; color: #6b7280;">Once DNS propagates, go to Platform Admin → Tenants → Find "${data.tenantSubdomain}" → Click <strong>"Mark Domain Verified"</strong> button to activate the custom domain</p>
                </div>
              </div>
              
              <div style="margin-top: 20px; padding: 15px; background: #d1fae5; border-radius: 6px;">
                <strong>✅ Final Step Reminder:</strong> The custom domain won't work until you click "Mark Domain Verified" in the Platform Admin → Tenants page!
              </div>
              
              <div style="margin-top: 15px; padding: 15px; background: #dbeafe; border-radius: 6px;">
                <strong>💡 Tip:</strong> The tenant has been notified to check their email for DNS setup instructions. Make sure to send them promptly!
              </div>
            </div>
            <div class="footer">
              <p>This is an automated notification from iRescue.life Platform</p>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      console.log('📧 [EMAIL SERVICE] Sending custom domain request notification to platform admin...');
      
      const subject = cleanSubjectLine(`Custom Domain Request: ${data.customDomain} (${data.tenantSubdomain})`);
      const plainText = htmlToPlainText(html);
      
      const response = await fetch(`${RESEND_API_URL}/emails`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${platformApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'iRescue.life Platform <notifications@irescue.life>',
          to: platformAdminEmail,
          subject,
          html,
          text: plainText,
        }),
      });

      const result = await response.json() as ResendResponse;
      
      if (result.error) {
        console.error('❌ [EMAIL SERVICE] Failed to send custom domain request notification:', result.error);
      } else {
        console.log(`✅ [EMAIL SERVICE] Custom domain request notification sent! Email ID: ${result.id}`);
      }
    } catch (error) {
      console.error('❌ [EMAIL SERVICE] Error sending custom domain request notification:', error);
    }
  }

  /**
   * Send immediate welcome email on signup (before payment)
   */
  static async sendSignupWelcomeEmail(tenantData: {
    rescueName: string;
    adminEmail: string;
    subdomain: string;
  }): Promise<void> {
    console.log('👋 [EMAIL SERVICE] sendSignupWelcomeEmail called with:', {
      rescueName: tenantData.rescueName,
      adminEmail: tenantData.adminEmail,
      subdomain: tenantData.subdomain,
    });
    
    const platformApiKey = process.env.PLATFORM_RESEND_API_KEY;

    if (!platformApiKey) {
      console.error('❌ [EMAIL SERVICE] Platform API key not configured - skipping signup welcome email');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .alert { background: #dbeafe; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 4px; }
            .success { background: #d1fae5; border-left-color: #10b981; }
            .btn { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
            .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 32px;">🎉 Welcome to iRescue.life!</h1>
              <p style="margin: 15px 0 0 0; opacity: 0.9; font-size: 18px;">${tenantData.rescueName}</p>
            </div>
            <div class="content">
              <div class="alert success">
                <strong>✅ Your account has been created!</strong> You're ready to get started.
              </div>

              <p style="font-size: 16px; margin: 20px 0;">Hi there! 👋</p>
              <p style="margin: 10px 0;">Thank you for signing up with iRescue.life. Your account is set up and you can access your portal immediately!</p>

              <div class="alert">
                <strong>📍 Your Portal Access</strong>
                <p style="margin: 10px 0 0 0;">Portal URL: <strong>irescue.life/${tenantData.subdomain}</strong></p>
                <p style="margin: 10px 0 0 0;">Email: <strong>${tenantData.adminEmail}</strong></p>
              </div>

              <p style="margin: 20px 0;">
                <a href="https://irescue.life/${tenantData.subdomain}" class="btn" style="color: white;">Access Your Portal →</a>
              </p>

              <h2 style="color: #374151; margin-top: 30px;">What's Next?</h2>
              <ul style="color: #4b5563;">
                <li>Complete your subscription setup to activate all features</li>
                <li>Add your first animals to the system</li>
                <li>Customize your branding and settings</li>
                <li>Invite team members to collaborate</li>
              </ul>

              <div style="background: #f3f4f6; border-radius: 6px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0; font-size: 13px; color: #6b7280;">
                  <strong>Important Documents:</strong>
                </p>
                <p style="margin: 0; font-size: 13px; color: #6b7280;">
                  By using iRescue.life, you agree to our 
                  <a href="https://irescue.life/#terms" style="color: #5B7B6B;">Terms of Service</a> and 
                  <a href="https://irescue.life/#privacy" style="color: #5B7B6B;">Privacy Policy</a>.
                </p>
              </div>

              <div class="footer">
                <p>Questions? We're here to help! Reply to this email anytime.</p>
                <p style="margin-top: 10px;">© 2025 iRescue.life. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      console.log('📧 [EMAIL SERVICE] Sending signup welcome email via Resend API...');
      
      // Use cleaned subject line for better deliverability
      const subject = cleanSubjectLine('Welcome to iRescue.life - Your Account is Ready!');
      const plainText = htmlToPlainText(html);
      
      // Add List-Unsubscribe header for marketing emails
      const unsubscribeHeader = generateUnsubscribeHeader(tenantData.adminEmail, tenantData.subdomain);
      
      const response = await fetch(`${RESEND_API_URL}/emails`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${platformApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'iRescue.life <welcome@irescue.life>',
          to: tenantData.adminEmail,
          subject,
          html,
          text: plainText,
          headers: {
            'List-Unsubscribe': unsubscribeHeader,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }),
      });

      const result = await response.json() as ResendResponse;
      
      if (result.error) {
        console.error('❌ [EMAIL SERVICE] Failed to send signup welcome email:', result.error);
      } else {
        console.log(`✅ [EMAIL SERVICE] Signup welcome email sent successfully! Email ID: ${result.id}`);
      }
    } catch (error) {
      console.error('❌ [EMAIL SERVICE] Error sending signup welcome email:', error);
    }
  }

  /**
   * Send welcome email to new tenant admin with custom domain setup instructions
   */
  static async sendTenantWelcomeEmail(tenantData: {
    rescueName: string;
    adminEmail: string;
    subdomain: string;
    tier: string;
  }): Promise<void> {
    console.log('👋 [EMAIL SERVICE] sendTenantWelcomeEmail called with:', {
      rescueName: tenantData.rescueName,
      adminEmail: tenantData.adminEmail,
      subdomain: tenantData.subdomain,
      tier: tenantData.tier
    });
    
    const platformApiKey = process.env.PLATFORM_RESEND_API_KEY;

    console.log('🔑 [EMAIL SERVICE] Environment check:', {
      platformApiKeyExists: !!platformApiKey
    });

    if (!platformApiKey) {
      console.error('❌ [EMAIL SERVICE] Platform API key not configured - skipping welcome email');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .alert { background: #dbeafe; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 4px; }
            .success { background: #d1fae5; border-left-color: #10b981; }
            .step-box { background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 15px 0; }
            .step-number { background: #667eea; color: white; border-radius: 50%; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 10px; }
            .code-box { background: #1f2937; color: #10b981; padding: 15px; border-radius: 6px; font-family: 'Courier New', monospace; margin: 10px 0; overflow-x: auto; }
            .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
            .btn { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 32px;">Welcome to iRescue.life!</h1>
              <p style="margin: 15px 0 0 0; opacity: 0.9; font-size: 18px;">${tenantData.rescueName}</p>
            </div>
            <div class="content">
              <div class="alert success">
                <strong>Your account is ready!</strong> Your 30-day free trial has started, and your admin credentials are active.
              </div>

              <p style="font-size: 16px; margin: 20px 0;">Hi there!</p>
              <p style="margin: 10px 0;">Thank you for choosing iRescue.life to power your animal rescue operations. Your account is set up and ready to go!</p>

              <div class="alert success">
                <strong>Your Portal is Ready!</strong>
                <p style="margin: 10px 0 0 0;">You can access your portal right now at: <strong>irescue.life/${tenantData.subdomain}</strong></p>
              </div>

              <h2 style="color: #374151; margin-top: 30px;">Getting Started</h2>
              
              <div class="step-box">
                <div style="display: flex; align-items: start;">
                  <span class="step-number">1</span>
                  <div style="flex: 1;">
                    <h3 style="margin: 0 0 10px 0; color: #1f2937;">Log In to Your Portal</h3>
                    <p style="margin: 0 0 10px 0; color: #4b5563;">Visit your portal and log in with:</p>
                    <div class="code-box">
                      Portal URL: https://irescue.life/${tenantData.subdomain}<br>
                      Email: ${tenantData.adminEmail}<br>
                      Password: [the password you created during signup]
                    </div>
                  </div>
                </div>
              </div>

              <div class="step-box">
                <div style="display: flex; align-items: start;">
                  <span class="step-number">2</span>
                  <div style="flex: 1;">
                    <h3 style="margin: 0 0 10px 0; color: #1f2937;">Add Your First Animals</h3>
                    <p style="margin: 0; color: #4b5563;">Start by adding the animals currently in your care. You can add photos, medical records, and all their details.</p>
                  </div>
                </div>
              </div>

              <div class="step-box">
                <div style="display: flex; align-items: start;">
                  <span class="step-number">3</span>
                  <div style="flex: 1;">
                    <h3 style="margin: 0 0 10px 0; color: #1f2937;">Invite Your Team</h3>
                    <p style="margin: 0; color: #4b5563;">Add staff members, volunteers, and foster coordinators with customized access levels.</p>
                  </div>
                </div>
              </div>

              <h2 style="color: #374151; margin-top: 30px;">Start Accepting Donations</h2>
              <div class="alert" style="background: #fef3c7; border-left-color: #f59e0b;">
                <strong>Ready to accept credit card donations?</strong>
                <p style="margin: 10px 0;">We use Stripe (the same processor used by Amazon and Google) to securely handle your payments. To connect your bank account, you'll need:</p>
              </div>
              
              <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 15px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 5px; vertical-align: top; width: 30px;">
                      <span style="background: #10b981; color: white; border-radius: 50%; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; font-size: 12px;">1</span>
                    </td>
                    <td style="padding: 10px 5px;">
                      <strong style="color: #1f2937;">Your IRS Determination Letter</strong>
                      <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">Legal name (exactly as on IRS letter), EIN (9-digit tax ID), and physical address</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 5px; vertical-align: top;">
                      <span style="background: #10b981; color: white; border-radius: 50%; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; font-size: 12px;">2</span>
                    </td>
                    <td style="padding: 10px 5px;">
                      <strong style="color: #1f2937;">Account Representative Info</strong>
                      <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">Personal home address (not rescue address), date of birth, and last 4 of SSN for the Treasurer/President/Director</p>
                      <p style="margin: 5px 0 0 0; color: #92400e; font-size: 13px;"><em>Note: This is a soft identity check required by banking law - not a credit check.</em></p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 5px; vertical-align: top;">
                      <span style="background: #10b981; color: white; border-radius: 50%; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; font-size: 12px;">3</span>
                    </td>
                    <td style="padding: 10px 5px;">
                      <strong style="color: #1f2937;">Bank Account Details</strong>
                      <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">Routing number and account number for donation deposits</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 5px; vertical-align: top;">
                      <span style="background: #10b981; color: white; border-radius: 50%; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; font-size: 12px;">4</span>
                    </td>
                    <td style="padding: 10px 5px;">
                      <strong style="color: #1f2937;">Statement Descriptor</strong>
                      <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">The text donors see on their credit card statement (e.g., "HAPPY PAWS RESCUE")</p>
                    </td>
                  </tr>
                </table>
              </div>
              
              <div style="background: #d1fae5; border-radius: 6px; padding: 12px 16px; margin: 15px 0;">
                <p style="margin: 0; color: #065f46; font-size: 14px;">
                  <strong>Security:</strong> iRescue.life never sees your SSN or bank details. You'll enter them directly on Stripe's secure, government-grade vault.
                </p>
              </div>
              
              <p style="margin: 15px 0; color: #4b5563;">
                <strong>Already have a Stripe account?</strong> Great! Just log in and authorize iRescue.life when prompted - no document hunting needed.
              </p>

              <h2 style="color: #374151; margin-top: 30px;">Custom Domain (Optional)</h2>
              <div class="alert">
                <strong>Want to use your own domain?</strong>
                <p style="margin: 10px 0 0 0;">Upgrade to a paid plan to use your own professional domain (e.g., happypaws.org) instead of the trial URL. Custom domains require coordination with our platform team to ensure proper SSL certificate configuration.</p>
                <p style="margin: 10px 0 0 0;"><strong>How it works:</strong></p>
                <ol style="margin: 10px 0 0 20px; color: #4b5563;">
                  <li>Enter your domain in Settings > Custom Domain</li>
                  <li>Our team will email you the specific DNS records to add</li>
                  <li>Configure the records at your domain registrar</li>
                  <li>We'll provision your SSL certificate once DNS propagates</li>
                </ol>
              </div>

              <div style="background: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 25px 0;">
                <h3 style="margin: 0 0 10px 0; color: #92400e;">Need Help?</h3>
                <p style="margin: 0; color: #78350f;">If you run into any issues, we're here to help! Contact our support team at <a href="mailto:support@irescue.life" style="color: #92400e;">support@irescue.life</a></p>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <p style="margin: 0 0 15px 0; color: #4b5563; font-size: 16px;"><strong>Your Account Details:</strong></p>
                <p style="margin: 5px 0; color: #6b7280;">Organization: <strong>${tenantData.rescueName}</strong></p>
                <p style="margin: 5px 0; color: #6b7280;">Plan: <strong>${tenantData.tier.charAt(0).toUpperCase() + tenantData.tier.slice(1)}</strong></p>
                <p style="margin: 5px 0; color: #6b7280;">Trial Period: <strong>30 days</strong></p>
              </div>

              <div style="background: #f3f4f6; border-radius: 6px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0; font-size: 13px; color: #6b7280;">
                  <strong>Important Documents:</strong>
                </p>
                <p style="margin: 0; font-size: 13px; color: #6b7280;">
                  By using iRescue.life, you agree to our 
                  <a href="https://irescue.life/#terms" style="color: #5B7B6B;">Terms of Service</a> and 
                  <a href="https://irescue.life/#privacy" style="color: #5B7B6B;">Privacy Policy</a>.
                </p>
              </div>
            </div>
            <div class="footer">
              <p>Welcome to the iRescue.life community!</p>
              <p style="margin-top: 10px;">This email was sent to ${tenantData.adminEmail}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      console.log('📧 [EMAIL SERVICE] Sending tenant welcome email via Resend API...');
      
      // Use cleaned subject line for better deliverability
      const subject = cleanSubjectLine('Welcome to iRescue.life - Your Portal is Ready!');
      const plainText = htmlToPlainText(html);
      
      // Add List-Unsubscribe header for marketing emails
      const unsubscribeHeader = generateUnsubscribeHeader(tenantData.adminEmail, tenantData.subdomain);
      
      console.log('📧 [EMAIL SERVICE] Payload:', {
        from: 'iRescue.life <welcome@irescue.life>',
        to: tenantData.adminEmail,
        subject
      });
      
      const response = await fetch(`${RESEND_API_URL}/emails`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${platformApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'iRescue.life <welcome@irescue.life>',
          to: tenantData.adminEmail,
          subject,
          html,
          text: plainText,
          headers: {
            'List-Unsubscribe': unsubscribeHeader,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }),
      });

      console.log('📧 [EMAIL SERVICE] Resend API response status:', response.status);
      const result = await response.json() as ResendResponse;
      console.log('📧 [EMAIL SERVICE] Resend API response body:', JSON.stringify(result, null, 2));
      
      if (result.error) {
        console.error('❌ [EMAIL SERVICE] Failed to send tenant welcome email:', result.error);
      } else {
        console.log(`✅ [EMAIL SERVICE] Welcome email sent successfully to ${tenantData.adminEmail}! Email ID: ${result.id}`);
      }
    } catch (error) {
      console.error('❌ [EMAIL SERVICE] Error sending tenant welcome email:', error);
    }
  }

  /**
   * Send custom domain DNS records to tenant admin
   * Platform admin uses this to provide the specific A record and TXT record values
   * that Replit generates when adding a custom domain to the deployment
   */
  static async sendCustomDomainDnsRecords(tenantData: {
    rescueName: string;
    adminEmail: string;
    customDomain: string;
    aRecordValue: string;
    txtRecordValue: string;
  }): Promise<boolean> {
    console.log('🌐 [EMAIL SERVICE] sendCustomDomainDnsRecords called for:', tenantData.adminEmail);
    
    const platformApiKey = process.env.PLATFORM_RESEND_API_KEY;

    if (!platformApiKey) {
      console.error('❌ [EMAIL SERVICE] Platform API key not configured - skipping DNS records email');
      return false;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .alert { background: #dbeafe; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 4px; }
            .success { background: #d1fae5; border-left-color: #10b981; }
            .warning { background: #fef3c7; border-left-color: #f59e0b; }
            .step-box { background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 15px 0; }
            .step-number { background: #667eea; color: white; border-radius: 50%; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 10px; }
            .code-box { background: #1f2937; color: #10b981; padding: 15px; border-radius: 6px; font-family: 'Courier New', monospace; margin: 10px 0; overflow-x: auto; word-break: break-all; }
            .record-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            .record-table th, .record-table td { text-align: left; padding: 12px; border: 1px solid #e5e7eb; }
            .record-table th { background: #f3f4f6; font-weight: 600; }
            .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 28px;">Custom Domain DNS Records</h1>
              <p style="margin: 15px 0 0 0; opacity: 0.9; font-size: 16px;">${tenantData.customDomain}</p>
            </div>
            <div class="content">
              <p style="font-size: 16px; margin: 20px 0;">Hi there!</p>
              <p style="margin: 10px 0;">Great news! We've configured your custom domain <strong>${tenantData.customDomain}</strong> on our platform. Now you just need to add the DNS records below at your domain registrar.</p>

              <div class="alert success">
                <strong>Your DNS Records Are Ready!</strong>
                <p style="margin: 10px 0 0 0;">Add the following records at your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.)</p>
              </div>

              <div class="step-box">
                <div style="display: flex; align-items: start;">
                  <span class="step-number">1</span>
                  <div style="flex: 1;">
                    <h3 style="margin: 0 0 10px 0; color: #1f2937;">A Record (Required)</h3>
                    <p style="margin: 0 0 10px 0; color: #4b5563;">This points your domain to our servers:</p>
                    <table class="record-table">
                      <tr>
                        <th>Type</th>
                        <td>A</td>
                      </tr>
                      <tr>
                        <th>Host/Name</th>
                        <td>@ (or leave blank for root domain)</td>
                      </tr>
                      <tr>
                        <th>Value/Points To</th>
                        <td><strong>${tenantData.aRecordValue}</strong></td>
                      </tr>
                      <tr>
                        <th>TTL</th>
                        <td>3600 (or default)</td>
                      </tr>
                    </table>
                  </div>
                </div>
              </div>

              <div class="step-box">
                <div style="display: flex; align-items: start;">
                  <span class="step-number">2</span>
                  <div style="flex: 1;">
                    <h3 style="margin: 0 0 10px 0; color: #1f2937;">TXT Record (Required for SSL)</h3>
                    <p style="margin: 0 0 10px 0; color: #4b5563;">This verifies domain ownership for SSL certificate:</p>
                    <table class="record-table">
                      <tr>
                        <th>Type</th>
                        <td>TXT</td>
                      </tr>
                      <tr>
                        <th>Host/Name</th>
                        <td>@ (or leave blank for root domain)</td>
                      </tr>
                      <tr>
                        <th>Value</th>
                        <td style="word-break: break-all;"><strong>${tenantData.txtRecordValue}</strong></td>
                      </tr>
                      <tr>
                        <th>TTL</th>
                        <td>3600 (or default)</td>
                      </tr>
                    </table>
                  </div>
                </div>
              </div>

              <div class="step-box">
                <div style="display: flex; align-items: start;">
                  <span class="step-number">3</span>
                  <div style="flex: 1;">
                    <h3 style="margin: 0 0 10px 0; color: #1f2937;">Optional: WWW Subdomain</h3>
                    <p style="margin: 0 0 10px 0; color: #4b5563;">If you want www.${tenantData.customDomain} to also work, add this CNAME:</p>
                    <table class="record-table">
                      <tr>
                        <th>Type</th>
                        <td>CNAME</td>
                      </tr>
                      <tr>
                        <th>Host/Name</th>
                        <td>www</td>
                      </tr>
                      <tr>
                        <th>Value/Points To</th>
                        <td>${tenantData.customDomain}</td>
                      </tr>
                      <tr>
                        <th>TTL</th>
                        <td>3600 (or default)</td>
                      </tr>
                    </table>
                  </div>
                </div>
              </div>

              <div class="alert warning">
                <strong>Important Notes:</strong>
                <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                  <li>DNS changes can take 5 minutes to 48 hours to propagate globally</li>
                  <li>You can check propagation status at <a href="https://dnschecker.org" style="color: #92400e;">dnschecker.org</a></li>
                  <li>Once DNS propagates, your SSL certificate will be automatically provisioned</li>
                  <li>Do NOT use Cloudflare proxy (orange cloud) - use DNS only (gray cloud)</li>
                </ul>
              </div>

              <div style="background: #f3f4f6; border-radius: 6px; padding: 16px; margin: 25px 0;">
                <h3 style="margin: 0 0 10px 0; color: #374151;">Need Help?</h3>
                <p style="margin: 0; color: #4b5563;">
                  If you're having trouble with DNS configuration, here are some helpful guides:
                </p>
                <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #6b7280;">
                  <li><strong>GoDaddy:</strong> Search "Add A record GoDaddy" in their help center</li>
                  <li><strong>Namecheap:</strong> Search "Add DNS records Namecheap"</li>
                  <li><strong>Cloudflare:</strong> Search "Add DNS record Cloudflare"</li>
                </ul>
                <p style="margin: 15px 0 0 0; color: #4b5563;">
                  Or contact us at <a href="mailto:support@irescue.life" style="color: #667eea;">support@irescue.life</a> - we're happy to help!
                </p>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <p style="margin: 0 0 15px 0; color: #4b5563; font-size: 16px;"><strong>Your Domain Details:</strong></p>
                <p style="margin: 5px 0; color: #6b7280;">Organization: <strong>${tenantData.rescueName}</strong></p>
                <p style="margin: 5px 0; color: #6b7280;">Custom Domain: <strong>${tenantData.customDomain}</strong></p>
              </div>
            </div>
            <div class="footer">
              <p>iRescue.life Platform Support</p>
              <p style="margin-top: 10px;">This email was sent to ${tenantData.adminEmail}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      // Use cleaned subject line for better deliverability
      const subject = cleanSubjectLine(`Your DNS Records for ${tenantData.customDomain}`);
      const plainText = htmlToPlainText(html);
      
      console.log('📧 [EMAIL SERVICE] Sending DNS records email to:', tenantData.adminEmail);
      
      const response = await fetch(`${RESEND_API_URL}/emails`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${platformApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'iRescue.life Support <support@irescue.life>',
          to: tenantData.adminEmail,
          subject,
          html,
          text: plainText,
        }),
      });

      const result = await response.json() as ResendResponse;
      
      if (result.error) {
        console.error('❌ [EMAIL SERVICE] Failed to send DNS records email:', result.error);
        return false;
      }
      
      console.log(`✅ [EMAIL SERVICE] DNS records email sent successfully to ${tenantData.adminEmail}! Email ID: ${result.id}`);
      return true;
    } catch (error) {
      console.error('❌ [EMAIL SERVICE] Error sending DNS records email:', error);
      return false;
    }
  }

  /**
   * Send Day 2 onboarding email - encouraging first animal addition
   * Sent 2 days after signup to prompt engagement
   */
  static async sendDay2OnboardingEmail(tenantData: {
    rescueName: string;
    adminEmail: string;
    adminName: string;
    subdomain: string;
  }): Promise<boolean> {
    console.log('📧 [EMAIL SERVICE] sendDay2OnboardingEmail called for:', tenantData.adminEmail);
    
    const platformApiKey = process.env.PLATFORM_RESEND_API_KEY;

    if (!platformApiKey) {
      console.error('❌ [EMAIL SERVICE] Platform API key not configured - skipping Day 2 onboarding email');
      return false;
    }

    // Build the portal URL for add animal
    const portalUrl = `https://irescue.life/${tenantData.subdomain}`;
    const addAnimalUrl = `${portalUrl}/animals?action=add`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #5B7B6B; color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .mission-box { background: white; border: 2px solid #5B7B6B; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .btn { display: inline-block; background: #5B7B6B; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 15px 0; }
            .btn:hover { background: #4a6a5a; }
            .tip-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 4px; }
            .footer { text-align: left; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
            .signature { margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 24px;">Is your spreadsheet costing you time?</h1>
            </div>
            <div class="content">
              <p style="font-size: 16px; margin: 20px 0;">Hi ${tenantData.adminName || 'there'},</p>
              
              <p style="margin: 15px 0;">We've all been there—trying to remember if "Buddy" had his distemper shot or digging through emails to find a foster parent's phone number.</p>
              
              <p style="margin: 15px 0;">The real power of iRescue.life is having all that data in <strong>one searchable place</strong>.</p>

              <div class="mission-box">
                <h3 style="margin: 0 0 15px 0; color: #5B7B6B;">📋 Today's Mission: Add Your First Animal</h3>
                <p style="margin: 0 0 15px 0; color: #4b5563;">Try adding just one dog to the system today. Upload their photo, add their medical notes, and assign a location. Once you see how easy it is to track a dog's journey from intake to adoption, you'll never want to open a spreadsheet again.</p>
                <div style="text-align: center;">
                  <a href="${addAnimalUrl}" class="btn" style="color: white;">Add an Animal</a>
                </div>
              </div>

              <div class="tip-box">
                <p style="margin: 0; color: #92400e;"><strong>Pro Tip:</strong> Did you know you can upload medical documents directly to the animal's profile? No more lost vet records!</p>
              </div>

              <div style="background: #dbeafe; border: 1px solid #3b82f6; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0; color: #1e40af;"><strong>Ready to accept donations?</strong></p>
                <p style="margin: 0; color: #1e40af; font-size: 14px;">
                  Before connecting your bank account, gather your IRS determination letter, the representative's personal info (home address, last 4 of SSN), and bank details. 
                  Go to Settings and click "Connect with Stripe" when you're ready!
                </p>
              </div>

              <div class="signature">
                <p style="margin: 5px 0;">Cheers,</p>
                <p style="margin: 5px 0;"><strong>Robby</strong></p>
                <p style="margin: 5px 0; color: #6b7280;">Founder, iRescue.life</p>
                <p style="margin: 5px 0; color: #6b7280; font-size: 13px;">Turbeau, LLC</p>
              </div>

              <div class="footer">
                <p style="font-size: 12px; color: #9ca3af;">
                  You're receiving this because you signed up for iRescue.life.
                  <br>
                  <a href="https://irescue.life/#privacy" style="color: #5B7B6B;">Privacy Policy</a> | 
                  <a href="https://irescue.life/#terms" style="color: #5B7B6B;">Terms of Service</a>
                </p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      // Use cleaned subject line for better deliverability
      const subject = cleanSubjectLine('Is your spreadsheet costing you time?');
      const plainText = htmlToPlainText(html);
      
      // Add List-Unsubscribe header for marketing emails
      const unsubscribeHeader = generateUnsubscribeHeader(tenantData.adminEmail, tenantData.subdomain);
      
      const response = await fetch(`${RESEND_API_URL}/emails`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${platformApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Robby from iRescue.life <robby@irescue.life>',
          to: tenantData.adminEmail,
          subject,
          html,
          text: plainText,
          headers: {
            'List-Unsubscribe': unsubscribeHeader,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }),
      });

      const result = await response.json() as ResendResponse;
      
      if (result.error) {
        console.error('❌ [EMAIL SERVICE] Failed to send Day 2 onboarding email:', result.error);
        return false;
      } else {
        console.log(`✅ [EMAIL SERVICE] Day 2 onboarding email sent to ${tenantData.adminEmail}! Email ID: ${result.id}`);
        return true;
      }
    } catch (error) {
      console.error('❌ [EMAIL SERVICE] Error sending Day 2 onboarding email:', error);
      return false;
    }
  }

  /**
   * Send Day 5 onboarding email - Team roles and permissions
   * Uses platform-wide API key
   */
  static async sendDay5OnboardingEmail(tenantData: {
    rescueName: string;
    adminEmail: string;
    adminName: string;
    subdomain: string;
  }): Promise<boolean> {
    console.log('📧 [EMAIL SERVICE] sendDay5OnboardingEmail called for:', tenantData.adminEmail);
    
    const platformApiKey = process.env.PLATFORM_RESEND_API_KEY;

    if (!platformApiKey) {
      console.error('❌ [EMAIL SERVICE] Platform API key not configured - skipping Day 5 onboarding email');
      return false;
    }

    // Build the portal URL for team management
    const portalUrl = `https://irescue.life/${tenantData.subdomain}`;
    const teamUrl = `${portalUrl}/team`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #5B7B6B; color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .mission-box { background: white; border: 2px solid #5B7B6B; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .btn { display: inline-block; background: #5B7B6B; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 15px 0; }
            .btn:hover { background: #4a6a5a; }
            .role-list { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .role-item { padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
            .role-item:last-child { border-bottom: none; }
            .role-name { font-weight: bold; color: #5B7B6B; }
            .role-desc { color: #6b7280; font-size: 14px; margin-top: 4px; }
            .tip-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 4px; }
            .footer { text-align: left; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
            .signature { margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 24px;">Don't do it alone</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Invite your team securely!</p>
            </div>
            <div class="content">
              <p style="font-size: 16px; margin: 20px 0;">Hi ${tenantData.adminName || 'there'},</p>
              
              <p style="margin: 15px 0;">Rescue is a team sport, but that doesn't mean everyone needs the keys to the castle.</p>
              
              <p style="margin: 15px 0;">One of the biggest fears rescues have about moving to the cloud is <strong>data privacy</strong>. You don't want every volunteer seeing your donors' private information or your foster parents' home addresses.</p>

              <p style="margin: 15px 0;">We solved this with <strong>Role-Based Permissions</strong>.</p>

              <p style="margin: 15px 0;">When you invite your team to iRescue.life, you can assign them specific roles:</p>

              <div class="role-list">
                <div class="role-item">
                  <div class="role-name">👑 Admins</div>
                  <div class="role-desc">Have full operational control.</div>
                </div>
                <div class="role-item">
                  <div class="role-name">🙋 Volunteers</div>
                  <div class="role-desc">By default, they see only what they need—like the shift calendar and the animal roster (kennel numbers and walking notes). They cannot see sensitive contact info or financial data.</div>
                </div>
              </div>

              <div class="tip-box">
                <p style="margin: 0; color: #92400e;"><strong>💡 Need something custom?</strong> You can even tweak permissions for specific individuals. Have a trusted volunteer who helps with data entry? You can grant them extra access without making them a full Admin.</p>
              </div>

              <div style="text-align: center; margin: 25px 0;">
                <a href="${teamUrl}" class="btn" style="color: white;">Set Your Team Roles</a>
              </div>

              <p style="margin: 20px 0; text-align: center; color: #6b7280; font-style: italic;">Secure your data while empowering your team.</p>

              <div class="signature">
                <p style="margin: 5px 0;">Best,</p>
                <p style="margin: 5px 0;"><strong>Robby</strong></p>
                <p style="margin: 5px 0; color: #6b7280;">Founder, iRescue.life</p>
                <p style="margin: 5px 0; color: #6b7280; font-size: 13px;">Turbeau, LLC</p>
              </div>

              <div class="footer">
                <p style="font-size: 12px; color: #9ca3af;">
                  You're receiving this because you signed up for iRescue.life.
                  <br>
                  <a href="https://irescue.life/#privacy" style="color: #5B7B6B;">Privacy Policy</a> | 
                  <a href="https://irescue.life/#terms" style="color: #5B7B6B;">Terms of Service</a>
                </p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      // Use cleaned subject line for better deliverability
      const subject = cleanSubjectLine("Don't do it alone - Invite your team securely!");
      const plainText = htmlToPlainText(html);
      
      // Add List-Unsubscribe header for marketing emails
      const unsubscribeHeader = generateUnsubscribeHeader(tenantData.adminEmail, tenantData.subdomain);
      
      const response = await fetch(`${RESEND_API_URL}/emails`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${platformApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Robby from iRescue.life <robby@irescue.life>',
          to: tenantData.adminEmail,
          subject,
          html,
          text: plainText,
          headers: {
            'List-Unsubscribe': unsubscribeHeader,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }),
      });

      const result = await response.json() as ResendResponse;
      
      if (result.error) {
        console.error('❌ [EMAIL SERVICE] Failed to send Day 5 onboarding email:', result.error);
        return false;
      } else {
        console.log(`✅ [EMAIL SERVICE] Day 5 onboarding email sent to ${tenantData.adminEmail}! Email ID: ${result.id}`);
        return true;
      }
    } catch (error) {
      console.error('❌ [EMAIL SERVICE] Error sending Day 5 onboarding email:', error);
      return false;
    }
  }

  /**
   * Send notification to a participant when they're added to a transport
   */
  async sendTransportParticipantNotification(options: {
    participantName: string;
    participantEmail: string;
    transportName: string;
    role: string;
    departureDate?: Date | null;
    origin?: string | null;
    destination?: string | null;
    transportId: string;
    tenantSubdomain: string;
    rescueName: string;
  }): Promise<{ success: boolean; error?: string }> {
    const {
      participantName,
      participantEmail,
      transportName,
      role,
      departureDate,
      origin,
      destination,
      transportId,
      tenantSubdomain,
      rescueName,
    } = options;

    const formattedRole = role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const formattedDate = departureDate 
      ? new Date(departureDate).toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      : 'TBD';

    const transportUrl = `https://irescue.life/${tenantSubdomain}/dashboard/collaboration`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #5B7B6B; color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .transport-card { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .detail-row { display: flex; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
            .detail-label { font-weight: 600; color: #6b7280; width: 120px; }
            .detail-value { color: #111827; }
            .role-badge { display: inline-block; background: #5B7B6B; color: white; padding: 4px 12px; border-radius: 20px; font-size: 14px; }
            .btn { display: inline-block; background: #5B7B6B; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 15px 0; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 24px;">You've Been Added to a Transport</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">${rescueName}</p>
            </div>
            
            <div class="content">
              <p>Hi ${participantName},</p>
              
              <p>You've been added as a participant to an upcoming animal transport. Here are the details:</p>
              
              <div class="transport-card">
                <h3 style="margin-top: 0; color: #111827;">${transportName}</h3>
                
                <div class="detail-row">
                  <span class="detail-label">Your Role:</span>
                  <span class="detail-value"><span class="role-badge">${formattedRole}</span></span>
                </div>
                
                <div class="detail-row">
                  <span class="detail-label">Date:</span>
                  <span class="detail-value">${formattedDate}</span>
                </div>
                
                ${origin ? `
                <div class="detail-row">
                  <span class="detail-label">Origin:</span>
                  <span class="detail-value">${origin}</span>
                </div>
                ` : ''}
                
                ${destination ? `
                <div class="detail-row">
                  <span class="detail-label">Destination:</span>
                  <span class="detail-value">${destination}</span>
                </div>
                ` : ''}
              </div>
              
              <p>Please log in to view the full transport details, manifest, and coordinate with other participants.</p>
              
              <div style="text-align: center;">
                <a href="${transportUrl}" class="btn">View Transport Details</a>
              </div>
              
              <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                If you have any questions or cannot participate, please contact the transport coordinator directly.
              </p>
              
              <div class="footer">
                <p style="font-size: 12px; color: #9ca3af;">
                  This notification was sent by ${rescueName} via iRescue.life
                </p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      const result = await this.send({
        to: participantEmail,
        subject: `You've been added to transport: ${transportName}`,
        html,
        replyTo: this.fromEmail,
      });

      if (result.success) {
        console.log(`[EMAIL] Transport participant notification sent to ${participantName} <${participantEmail}>`);
      }

      return result;
    } catch (error) {
      console.error('[EMAIL] Failed to send transport participant notification:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Export utility functions for use in other email-related modules
export { cleanSubjectLine, htmlToPlainText, generateUnsubscribeHeader };

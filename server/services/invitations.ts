import { db } from '../db';
import { contacts, userInvitations, users, tenants, tutorials, volunteerApplications, volunteerTrainingAccessSessions } from '@shared/schema';
import { eq, and, isNull, gt, or, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { EmailService } from '../lib/email-service';

function invitationConflict(code: string, message: string) {
  return Object.assign(new Error(message), { status: 409, code });
}

export function decideBoundVolunteerInvitationAcceptance(args: {
  pipelineStatus: string;
  recipientMatches: boolean;
  hasEstablishedContact: boolean;
  trainingAllowed: boolean;
}) {
  if (args.pipelineStatus !== 'active_pool') return { allowed: false as const, code: 'VOLUNTEER_INVITATION_STAGE_INVALID' };
  if (!args.recipientMatches) return { allowed: false as const, code: 'VOLUNTEER_INVITATION_RECIPIENT_STALE' };
  if (!args.hasEstablishedContact) return { allowed: false as const, code: 'VOLUNTEER_INVITATION_IDENTITY_REVIEW_REQUIRED' };
  if (!args.trainingAllowed) return { allowed: false as const, code: 'VOLUNTEER_INVITATION_TRAINING_REQUIRED' };
  return { allowed: true as const };
}

export function decideUnboundVolunteerInvitationAcceptance(isVolunteer: boolean, requiredTrainingExists: boolean) {
  return isVolunteer && requiredTrainingExists
    ? { allowed: false as const, code: 'VOLUNTEER_INVITATION_APPLICATION_REQUIRED' }
    : { allowed: true as const };
}

export const BOUND_VOLUNTEER_USER_CREATION_OPTIONS = Object.freeze({
  initiallyInactive: true,
  skipContactSync: true,
});

export function decideInvitationContactWrite(boundInvitation: boolean, exactContactExists: boolean) {
  if (boundInvitation && !exactContactExists) return { action: 'identity_conflict' as const };
  if (exactContactExists) return { action: 'update_exact' as const };
  return { action: 'insert_new' as const };
}

async function requiredVolunteerTrainingExists(tenantId: string) {
  const [required] = await db.select({ id: tutorials.id }).from(tutorials).where(and(
    eq(tutorials.tenantId, tenantId),
    eq(tutorials.requiredForVolunteers, true),
  )).limit(1);
  return !!required;
}

export async function validateBoundVolunteerInvitation(
  tenantId: string,
  applicationId: string,
  recipientEmail: string,
) {
  const [application] = await db.select().from(volunteerApplications).where(and(
    eq(volunteerApplications.tenantId, tenantId),
    eq(volunteerApplications.id, applicationId),
  )).limit(1);
  if (!application) throw invitationConflict('VOLUNTEER_INVITATION_APPLICATION_INVALID', 'The volunteer application is unavailable');
  if (application.pipelineStatus !== 'active_pool') {
    throw invitationConflict('VOLUNTEER_INVITATION_STAGE_INVALID', 'The volunteer application is not active');
  }
  if (application.applicantEmail.trim().toLowerCase() !== recipientEmail.trim().toLowerCase()) {
    throw invitationConflict('VOLUNTEER_INVITATION_RECIPIENT_STALE', 'The invitation recipient no longer matches the application');
  }
  const { getApplicationEstablishedIdentity, getActivationTrainingGuard } = await import('./volunteer-training');
  const established = await getApplicationEstablishedIdentity(tenantId, applicationId);
  if (!established.contactId) {
    throw invitationConflict('VOLUNTEER_INVITATION_IDENTITY_REVIEW_REQUIRED', 'Volunteer identity requires staff review');
  }
  const [contact] = await db.select().from(contacts).where(and(
    eq(contacts.tenantId, tenantId),
    eq(contacts.id, established.contactId),
  )).limit(1);
  if (!contact || (established.userId && contact.userId && established.userId !== contact.userId)) {
    throw invitationConflict('VOLUNTEER_INVITATION_IDENTITY_REVIEW_REQUIRED', 'Volunteer identity requires staff review');
  }
  if (contact.email.trim().toLowerCase() !== recipientEmail.trim().toLowerCase()) {
    throw invitationConflict('VOLUNTEER_INVITATION_RECIPIENT_STALE', 'The established contact recipient no longer matches');
  }
  const guard = await getActivationTrainingGuard(tenantId, applicationId);
  const decision = decideBoundVolunteerInvitationAcceptance({
    pipelineStatus: application.pipelineStatus,
    recipientMatches: application.applicantEmail.trim().toLowerCase() === recipientEmail.trim().toLowerCase(),
    hasEstablishedContact: !!contact,
    trainingAllowed: guard.allowed,
  });
  if (!decision.allowed) {
    throw invitationConflict(decision.code, 'Current volunteer invitation eligibility must be reviewed');
  }
  return { application, contact, established };
}

/**
 * Get the base URL for the application based on environment
 * In production, uses irescue.life
 * Falls back to REPLIT_DEV_DOMAIN for development
 */
export function getAppBaseUrl(): string {
  // For production deployments, always use irescue.life
  if (process.env.REPLIT_DEPLOYMENT === '1') {
    return 'https://irescue.life';
  }
  
  // For development, use REPLIT_DEV_DOMAIN
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  
  // Fallback to localhost
  return 'http://localhost:5000';
}

export function buildTenantPublicUrl(
  tenant: { customDomain?: string | null; subdomain?: string | null },
  path: string,
): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (tenant.customDomain) return `https://${tenant.customDomain}${normalizedPath}`;
  const tenantPath = tenant.subdomain ? `/${tenant.subdomain}` : '';
  return `${getAppBaseUrl()}${tenantPath}${normalizedPath}`;
}

/**
 * Generate a secure random token for invitation
 * Uses 12 bytes (96 bits) encoded as base64url for a 16-character token
 * This is much shorter than the previous 64-character hex token,
 * reducing issues with email clients truncating long URLs
 */
function generateInvitationToken(): string {
  // Generate 12 random bytes and encode as base64url (URL-safe base64)
  const bytes = crypto.randomBytes(12);
  // Convert to base64 and make URL-safe: replace + with -, / with _, remove =
  return bytes.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Create a new user invitation
 */
export async function createInvitation(
  tenantId: string,
  invitedBy: string,
  data: {
    email: string;
    fullName?: string;
    phone?: string;
    roles: ('admin' | 'board_member' | 'staff' | 'foster' | 'volunteer')[];
    volunteerApplicationId?: string;
  }
) {
  if (data.roles.includes('volunteer')) {
    if (data.volunteerApplicationId) {
      await validateBoundVolunteerInvitation(tenantId, data.volunteerApplicationId, data.email);
    } else {
      const unbound = decideUnboundVolunteerInvitationAcceptance(true, await requiredVolunteerTrainingExists(tenantId));
      if (!unbound.allowed) {
        throw invitationConflict(unbound.code, 'Reissue this volunteer invitation from an approved application');
      }
    }
  }
  // Check if user already exists
  const [existingUser] = await db
    .select()
    .from(users)
    .where(and(
      eq(users.tenantId, tenantId),
      eq(users.email, data.email)
    ))
    .limit(1);

  if (existingUser) {
    throw new Error('A user with this email already exists in your organization');
  }

  // Check if there's a pending invitation for this email
  const [existingInvitation] = await db
    .select()
    .from(userInvitations)
    .where(and(
      eq(userInvitations.tenantId, tenantId),
      eq(userInvitations.email, data.email),
      isNull(userInvitations.acceptedAt),
      gt(userInvitations.expiresAt, new Date())
    ))
    .limit(1);

  if (existingInvitation) {
    if (data.roles.includes('volunteer') && data.volunteerApplicationId) {
      if (!existingInvitation.roles.includes('volunteer')) {
        throw invitationConflict('VOLUNTEER_INVITATION_APPLICATION_CONFLICT', 'A different pending invitation already exists for this recipient');
      }
      if (existingInvitation.volunteerApplicationId &&
          existingInvitation.volunteerApplicationId !== data.volunteerApplicationId) {
        throw invitationConflict('VOLUNTEER_INVITATION_APPLICATION_CONFLICT', 'The pending invitation belongs to another volunteer application');
      }
      if (!existingInvitation.volunteerApplicationId) {
        const [bound] = await db.update(userInvitations).set({
          volunteerApplicationId: data.volunteerApplicationId,
        }).where(and(
          eq(userInvitations.id, existingInvitation.id),
          isNull(userInvitations.volunteerApplicationId),
        )).returning();
        if (bound) return bound;
        const [raced] = await db.select({ volunteerApplicationId: userInvitations.volunteerApplicationId })
          .from(userInvitations).where(eq(userInvitations.id, existingInvitation.id)).limit(1);
        if (raced?.volunteerApplicationId !== data.volunteerApplicationId) {
          throw invitationConflict('VOLUNTEER_INVITATION_APPLICATION_CONFLICT', 'The pending invitation belongs to another volunteer application');
        }
      }
    }
    throw new Error('An invitation has already been sent to this email');
  }

  // Generate invitation token
  const token = generateInvitationToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

  // Create invitation
  const [invitation] = await db
    .insert(userInvitations)
    .values({
      tenantId,
      email: data.email,
      fullName: data.fullName || null,
      phone: data.phone || null,
      roles: data.roles,
      token,
      invitedBy,
      expiresAt,
      volunteerApplicationId: data.volunteerApplicationId || null,
    })
    .returning();

  return invitation;
}

/**
 * Send invitation email
 */
export async function sendInvitationEmail(
  tenantId: string,
  invitation: {
    id: string;
    email: string;
    fullName: string | null;
    roles: string[];
    token: string;
  },
  inviterName: string,
  tenantName: string
) {
  const emailService = await EmailService.forTenant(tenantId);
  
  if (!emailService) {
    throw new Error('Email service is not configured. Please set up Resend to send invitations.');
  }

  // Get tenant subdomain for path-based URL routing
  const [tenant] = await db
    .select({ subdomain: tenants.subdomain, customDomain: tenants.customDomain })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const roleLabels = invitation.roles
    .map(role => {
      const labels: Record<string, string> = {
        admin: 'Admin',
        board_member: 'Board Member',
        staff: 'Staff',
        foster: 'Foster',
        volunteer: 'Volunteer',
      };
      return labels[role] || role;
    })
    .join(', ');

  // Construct the accept URL with tenant path for path-based routing
  // If tenant has a custom domain, use it directly, otherwise use path-based routing
  // URL-encode the token to prevent email quoted-printable encoding from misinterpreting
  // patterns like =04 as encoded characters (which breaks the link)
  const encodedToken = encodeURIComponent(invitation.token);
  const acceptUrl = buildTenantPublicUrl(tenant || {}, `/accept-invitation?token=${encodedToken}`);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">You've been invited to join ${tenantName}!</h2>
      
      <p>Hello${invitation.fullName ? ` ${invitation.fullName}` : ''},</p>
      
      <p>${inviterName} has invited you to join <strong>${tenantName}</strong> as a team member with the following role${invitation.roles.length > 1 ? 's' : ''}: <strong>${roleLabels}</strong>.</p>
      
      <p>Click the button below to accept the invitation and create your account:</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${acceptUrl}" style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Accept Invitation</a>
      </div>
      
      <p style="color: #6b7280; font-size: 14px;">
        Or copy and paste this link into your browser:<br>
        <a href="${acceptUrl}" style="color: #2563eb;">${acceptUrl}</a>
      </p>
      
      <p style="color: #6b7280; font-size: 14px;">
        This invitation will expire in 7 days.
      </p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      
      <p style="color: #9ca3af; font-size: 12px;">
        If you weren't expecting this invitation, you can safely ignore this email.
      </p>
    </div>
  `;

  const result = await emailService.send({
    to: invitation.email,
    subject: `You've been invited to join ${tenantName}`,
    html,
  });

  if (!result.success) {
    throw new Error(result.error || 'Failed to send invitation email');
  }

  return result;
}

/**
 * Send foster welcome email when a foster application reaches Active Pool
 * and no existing user account is found. Uses the invitation system
 * so the foster can set their own password and access the Foster Portal.
 */
export async function sendFosterWelcomeEmail(
  tenantId: string,
  invitation: {
    id: string;
    email: string;
    fullName: string | null;
    roles: string[];
    token: string;
  },
  tenantName: string
) {
  const emailService = await EmailService.forTenant(tenantId);
  
  if (!emailService) {
    console.error('[Foster Welcome] Email service not configured, cannot send foster welcome email');
    return { success: false, error: 'Email service not configured' };
  }

  const [tenant] = await db
    .select({ subdomain: tenants.subdomain, customDomain: tenants.customDomain })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const encodedToken = encodeURIComponent(invitation.token);
  let acceptUrl: string;
  if (tenant?.customDomain) {
    acceptUrl = `https://${tenant.customDomain}/accept-invitation?token=${encodedToken}`;
  } else {
    const baseUrl = getAppBaseUrl();
    const tenantPath = tenant?.subdomain ? `/${tenant.subdomain}` : '';
    acceptUrl = `${baseUrl}${tenantPath}/accept-invitation?token=${encodedToken}`;
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Welcome to ${tenantName}!</h2>
      
      <p>Hello${invitation.fullName ? ` ${invitation.fullName}` : ''},</p>
      
      <p>Congratulations! Your foster application with <strong>${tenantName}</strong> has been approved, and you've been added to our active foster pool.</p>
      
      <p>To get started, please set up your account by clicking the button below. Once your account is set up, you'll have access to your <strong>Foster Portal</strong> where you can:</p>
      
      <ul style="color: #374151; line-height: 1.8;">
        <li>View details about animals placed in your care</li>
        <li>Submit foster updates and photos</li>
        <li>Access medical records and care instructions</li>
        <li>Communicate with the rescue team</li>
      </ul>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${acceptUrl}" style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Set Up Your Account</a>
      </div>
      
      <p style="color: #6b7280; font-size: 14px;">
        Or copy and paste this link into your browser:<br>
        <a href="${acceptUrl}" style="color: #2563eb;">${acceptUrl}</a>
      </p>
      
      <p style="color: #6b7280; font-size: 14px;">
        This link will expire in 7 days. If it expires, please contact the rescue team to have a new one sent.
      </p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      
      <p style="color: #9ca3af; font-size: 12px;">
        Thank you for opening your heart and home to animals in need!
      </p>
    </div>
  `;

  const result = await emailService.send({
    to: invitation.email,
    subject: `Welcome to ${tenantName} - Set Up Your Foster Account`,
    html,
  });

  if (!result.success) {
    throw new Error(result.error || 'Failed to send foster welcome email');
  }

  return result;
}

/**
 * Send a volunteer-specific welcome email with account setup link
 * Mirrors sendFosterWelcomeEmail but with volunteer-appropriate copy
 */
export async function sendVolunteerWelcomeEmail(
  tenantId: string,
  invitation: {
    id: string;
    email: string;
    fullName: string | null;
    roles: string[];
    token: string;
  },
  tenantName: string
) {
  const emailService = await EmailService.forTenant(tenantId);

  if (!emailService) {
    console.error('[Volunteer Welcome] Email service not configured, cannot send volunteer welcome email');
    return { success: false, error: 'Email service not configured' };
  }

  const [tenant] = await db
    .select({ subdomain: tenants.subdomain, customDomain: tenants.customDomain })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const encodedToken = encodeURIComponent(invitation.token);
  let acceptUrl: string;
  if (tenant?.customDomain) {
    acceptUrl = `https://${tenant.customDomain}/accept-invitation?token=${encodedToken}`;
  } else {
    const baseUrl = getAppBaseUrl();
    const tenantPath = tenant?.subdomain ? `/${tenant.subdomain}` : '';
    acceptUrl = `${baseUrl}${tenantPath}/accept-invitation?token=${encodedToken}`;
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Welcome to the ${tenantName} Volunteer Team!</h2>
      
      <p>Hello${invitation.fullName ? ` ${invitation.fullName}` : ''},</p>
      
      <p>Thank you for becoming an active volunteer with <strong>${tenantName}</strong>! We're thrilled to have you on the team.</p>
      
      <p>To get started, please set up your account by clicking the button below. Once your account is active, you'll be able to:</p>
      
      <ul style="color: #374151; line-height: 1.8;">
        <li>View upcoming volunteer events and shifts</li>
        <li>Sign up for volunteer opportunities</li>
        <li>Access volunteer resources and care instructions</li>
        <li>Stay connected with the rescue team</li>
      </ul>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${acceptUrl}" style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Set Up Your Account</a>
      </div>
      
      <p style="color: #6b7280; font-size: 14px;">
        Or copy and paste this link into your browser:<br>
        <a href="${acceptUrl}" style="color: #2563eb;">${acceptUrl}</a>
      </p>
      
      <p style="color: #6b7280; font-size: 14px;">
        This link will expire in 7 days. If it expires, please contact the rescue team to have a new one sent.
      </p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      
      <p style="color: #9ca3af; font-size: 12px;">
        Thank you for giving your time to help animals in need!
      </p>
    </div>
  `;

  const result = await emailService.send({
    to: invitation.email,
    subject: `Welcome to the ${tenantName} Volunteer Team - Set Up Your Account`,
    html,
  });

  if (!result.success) {
    throw new Error(result.error || 'Failed to send volunteer welcome email');
  }

  return result;
}

/**
 * Idempotent helper: creates an invitation and sends the volunteer welcome email.
 * Guards against duplicate sends by checking for an existing user account or
 * a still-pending (non-expired, not-yet-accepted) invitation for the same email.
 */
export async function createAndSendVolunteerWelcome(
  tenantId: string,
  applicationId: string,
  applicantEmail: string,
  applicantName: string
): Promise<{ success?: boolean; skipped?: boolean; reason?: string }> {
  const normalizedEmail = applicantEmail.trim().toLowerCase();
  await validateBoundVolunteerInvitation(tenantId, applicationId, normalizedEmail);

  // Guard 1: user account already exists
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.email, normalizedEmail)))
    .limit(1);

  if (existingUser) {
    console.log(`[Volunteer Welcome] Skipping — user account already exists for ${normalizedEmail}`);
    return { skipped: true, reason: 'user_exists' };
  }

  // Guard 2: a non-expired, pending invitation already exists
  const [existingInvitation] = await db
    .select({ id: userInvitations.id, roles: userInvitations.roles, volunteerApplicationId: userInvitations.volunteerApplicationId })
    .from(userInvitations)
    .where(and(
      eq(userInvitations.tenantId, tenantId),
      eq(userInvitations.email, normalizedEmail),
      isNull(userInvitations.acceptedAt),
      gt(userInvitations.expiresAt, new Date())
    ))
    .limit(1);

  if (existingInvitation) {
    if (!existingInvitation.roles.includes('volunteer')) {
      throw invitationConflict('VOLUNTEER_INVITATION_APPLICATION_CONFLICT', 'A different pending invitation already exists for this recipient');
    }
    if (existingInvitation.volunteerApplicationId && existingInvitation.volunteerApplicationId !== applicationId) {
      throw invitationConflict('VOLUNTEER_INVITATION_APPLICATION_CONFLICT', 'The pending invitation belongs to another volunteer application');
    }
    if (!existingInvitation.volunteerApplicationId) {
      const [bound] = await db.update(userInvitations).set({ volunteerApplicationId: applicationId })
        .where(and(eq(userInvitations.id, existingInvitation.id), isNull(userInvitations.volunteerApplicationId)))
        .returning({ id: userInvitations.id });
      if (!bound) {
        const [raced] = await db.select({ volunteerApplicationId: userInvitations.volunteerApplicationId })
          .from(userInvitations).where(eq(userInvitations.id, existingInvitation.id)).limit(1);
        if (raced?.volunteerApplicationId !== applicationId) {
          throw invitationConflict('VOLUNTEER_INVITATION_APPLICATION_CONFLICT', 'The pending invitation belongs to another volunteer application');
        }
      }
    }
    console.log(`[Volunteer Welcome] Skipping — pending invitation already exists for ${normalizedEmail}`);
    return { skipped: true, reason: 'invitation_pending' };
  }

  // Create invitation (system-generated on behalf of the tenant's first owner/admin)
  const token = generateInvitationToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  // Resolve a valid invitedBy user (required by FK constraint) — use tenant's first owner or admin
  const [tenantAdmin] = await db
    .select({ id: users.id, name: tenants.name })
    .from(users)
    .innerJoin(tenants, eq(tenants.id, users.tenantId))
    .where(eq(users.tenantId, tenantId))
    .orderBy(users.createdAt)
    .limit(1);

  if (!tenantAdmin) {
    console.error(`[Volunteer Welcome] Cannot find any user for tenant ${tenantId} to use as invitedBy`);
    return { skipped: true, reason: 'no_admin_user' };
  }

  const [invitation] = await db
    .insert(userInvitations)
    .values({
      tenantId,
      email: normalizedEmail,
      fullName: applicantName || null,
      phone: null,
      roles: ['volunteer'],
      token,
      invitedBy: tenantAdmin.id,
      expiresAt,
      volunteerApplicationId: applicationId,
    })
    .returning();

  const tenantName = tenantAdmin.name || 'the rescue';

  await sendVolunteerWelcomeEmail(tenantId, invitation, tenantName);

  return { success: true };
}

/**
 * Send invitation via SMS
 */
export async function sendInvitationSms(
  tenantId: string,
  invitation: {
    id: string;
    phone?: string | null;
    fullName: string | null;
    roles: string[];
    token: string;
  },
  inviterName: string,
  tenantName: string
) {
  if (!invitation.phone) {
    throw new Error('No phone number provided for SMS invitation');
  }

  const { sendSms, isTwilioEnabled } = await import('../lib/twilio-service');

  const twilioReady = await isTwilioEnabled(tenantId);
  if (!twilioReady) {
    console.warn(`[Invitation SMS] Twilio not configured for tenant ${tenantId}, skipping SMS`);
    return { success: false, error: 'Twilio not configured' };
  }

  const [tenant] = await db
    .select({ subdomain: tenants.subdomain, customDomain: tenants.customDomain })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const acceptUrl = buildInvitationUrl(invitation.token, tenant);

  const roleLabels = invitation.roles
    .map(role => {
      const labels: Record<string, string> = {
        admin: 'Admin',
        board_member: 'Board Member',
        staff: 'Staff',
        foster: 'Foster',
        volunteer: 'Volunteer',
      };
      return labels[role] || role;
    })
    .join(', ');

  const greeting = invitation.fullName ? `Hi ${invitation.fullName}! ` : '';
  const message = `${greeting}${inviterName} invited you to join ${tenantName} as ${roleLabels}. Set up your account here: ${acceptUrl}`;

  const result = await sendSms(tenantId, invitation.phone, message, 'team_invitation', { skipOrgPrefix: true });

  if (result.status === 'failed') {
    return { success: false, error: result.error || 'SMS send failed' };
  }

  return { success: true };
}

/**
 * Construct the invitation accept URL based on tenant configuration
 * Uses custom domain if available, otherwise path-based routing
 * URL-encodes the token to prevent email quoted-printable encoding issues
 */
export function buildInvitationUrl(token: string, tenant: { subdomain: string | null; customDomain: string | null }): string {
  const encodedToken = encodeURIComponent(token);
  if (tenant.customDomain) {
    return `https://${tenant.customDomain}/accept-invitation?token=${encodedToken}`;
  }
  const baseUrl = getAppBaseUrl();
  const tenantPath = tenant.subdomain ? `/${tenant.subdomain}` : '';
  return `${baseUrl}${tenantPath}/accept-invitation?token=${encodedToken}`;
}

/**
 * Get all pending invitations for a tenant
 */
export async function getPendingInvitations(tenantId: string) {
  const invitations = await db
    .select({
      invitation: userInvitations,
      inviter: {
        id: users.id,
        fullName: users.fullName,
        email: users.email,
      },
    })
    .from(userInvitations)
    .leftJoin(users, eq(userInvitations.invitedBy, users.id))
    .where(and(
      eq(userInvitations.tenantId, tenantId),
      isNull(userInvitations.acceptedAt),
      gt(userInvitations.expiresAt, new Date())
    ))
    .orderBy(userInvitations.createdAt);

  return invitations;
}

/**
 * Verify and get invitation by token
 */
export async function getInvitationByToken(token: string) {
  const [invitation] = await db
    .select()
    .from(userInvitations)
    .where(eq(userInvitations.token, token))
    .limit(1);

  if (!invitation) {
    throw new Error('Invalid invitation link');
  }

  if (invitation.acceptedAt) {
    throw new Error('This invitation has already been accepted');
  }

  if (new Date() > invitation.expiresAt) {
    throw new Error('This invitation has expired');
  }

  return invitation;
}

/**
 * Accept invitation and create user
 */
async function acceptVolunteerInvitationAtomic(args: {
  invitation: typeof userInvitations.$inferSelect;
  passwordHash: string;
  fullName: string;
  phone: string;
  address: string;
}) {
  const normalizedEmail = args.invitation.email.trim().toLowerCase();
  return db.transaction(async tx => {
    const {
      acquireVolunteerTrainingActivationPolicyLock,
      activationAllowed,
      getApplicationCompliance,
      getApplicationEstablishedIdentity,
      reconcileTrainingIdentityWithExecutor,
    } = await import('./volunteer-training');
    await acquireVolunteerTrainingActivationPolicyLock(tx, args.invitation.tenantId);
    const [invitation] = await tx.select().from(userInvitations).where(and(
      eq(userInvitations.id, args.invitation.id),
      eq(userInvitations.tenantId, args.invitation.tenantId),
      eq(userInvitations.token, args.invitation.token),
      isNull(userInvitations.acceptedAt),
      gt(userInvitations.expiresAt, new Date()),
    )).limit(1).for('no key update');
    if (!invitation || !invitation.roles.includes('volunteer') ||
        invitation.email.trim().toLowerCase() !== normalizedEmail) {
      throw invitationConflict('VOLUNTEER_INVITATION_FINALIZATION_CONFLICT', 'The invitation changed during acceptance');
    }
    const existingUsers = await tx.select({ id: users.id }).from(users).where(and(
      eq(users.tenantId, invitation.tenantId),
      sql`lower(trim(${users.email})) = ${normalizedEmail}`,
    ));
    if (existingUsers.length) {
      throw invitationConflict('VOLUNTEER_INVITATION_USER_EXISTS', 'A user with this email already exists');
    }

    let application: typeof volunteerApplications.$inferSelect | null = null;
    let contact: typeof contacts.$inferSelect | null = null;
    if (invitation.volunteerApplicationId) {
      await tx.execute(sql`SELECT id FROM volunteer_applications WHERE tenant_id = ${invitation.tenantId} AND id = ${invitation.volunteerApplicationId} FOR NO KEY UPDATE`);
      [application] = await tx.select().from(volunteerApplications).where(and(
        eq(volunteerApplications.tenantId, invitation.tenantId),
        eq(volunteerApplications.id, invitation.volunteerApplicationId),
      )).limit(1);
      if (!application || application.pipelineStatus !== 'active_pool' ||
          application.applicantEmail.trim().toLowerCase() !== normalizedEmail) {
        throw invitationConflict('VOLUNTEER_INVITATION_STAGE_INVALID', 'The volunteer application is no longer eligible');
      }
      const established = await getApplicationEstablishedIdentity(invitation.tenantId, application.id, tx);
      if (!established.contactId || established.userId) {
        throw invitationConflict('VOLUNTEER_INVITATION_IDENTITY_REVIEW_REQUIRED', 'Volunteer identity requires staff review');
      }
      await tx.execute(sql`SELECT id FROM contacts WHERE tenant_id = ${invitation.tenantId} AND id = ${established.contactId} FOR NO KEY UPDATE`);
      const matching = await tx.select().from(contacts).where(and(
        eq(contacts.tenantId, invitation.tenantId),
        sql`lower(trim(${contacts.email})) = ${normalizedEmail}`,
      ));
      if (matching.length !== 1 || matching[0].id !== established.contactId || matching[0].userId) {
        throw invitationConflict('VOLUNTEER_INVITATION_IDENTITY_REVIEW_REQUIRED', 'The established contact identity changed');
      }
      contact = matching[0];
      const compliance = await getApplicationCompliance(invitation.tenantId, application.id, tx);
      if (!compliance || !activationAllowed(compliance.overallStatus)) {
        throw invitationConflict('VOLUNTEER_INVITATION_TRAINING_REQUIRED', 'Required volunteer training is not current');
      }
    } else {
      const [required] = await tx.select({ id: tutorials.id }).from(tutorials).where(and(
        eq(tutorials.tenantId, invitation.tenantId), eq(tutorials.requiredForVolunteers, true),
      )).limit(1);
      if (required) {
        throw invitationConflict('VOLUNTEER_INVITATION_APPLICATION_REQUIRED', 'Staff must reissue this invitation from an eligible application');
      }
      const matching = await tx.select().from(contacts).where(and(
        eq(contacts.tenantId, invitation.tenantId),
        sql`lower(trim(${contacts.email})) = ${normalizedEmail}`,
      ));
      if (matching.length > 1 || matching[0]?.userId) {
        throw invitationConflict('CONTACT_OWNERSHIP_CONFLICT', 'The invitation recipient has conflicting contact ownership');
      }
      contact = matching[0] || null;
    }

    const { insertUserWithHashedPassword } = await import('./auth');
    const user = await insertUserWithHashedPassword(tx, invitation.tenantId, {
      email: normalizedEmail,
      passwordHash: args.passwordHash,
      fullName: args.fullName || invitation.fullName || invitation.email,
      roles: invitation.roles as ('admin' | 'board_member' | 'staff' | 'foster' | 'volunteer')[],
      phone: args.phone || invitation.phone,
      initiallyInactive: true,
    });
    if (contact) {
      [contact] = await tx.update(contacts).set({
        userId: user.id,
        name: args.fullName,
        email: normalizedEmail,
        phone: args.phone,
        address: args.address,
        source: Array.from(new Set([...(contact.source || []), 'user' as const])),
        role: Array.from(new Set([...(contact.role || []), ...invitation.roles])) as any,
        updatedAt: new Date(),
      }).where(and(
        eq(contacts.tenantId, invitation.tenantId), eq(contacts.id, contact.id), isNull(contacts.userId),
      )).returning();
      if (!contact) throw invitationConflict('CONTACT_OWNERSHIP_CONFLICT', 'Contact ownership changed during acceptance');
    } else {
      [contact] = await tx.insert(contacts).values({
        tenantId: invitation.tenantId,
        userId: user.id,
        name: args.fullName,
        email: normalizedEmail,
        phone: args.phone,
        address: args.address,
        source: ['user'],
        role: invitation.roles as any,
      }).returning();
    }
    if (application) {
      const [linked] = await tx.update(volunteerApplications).set({
        userId: user.id, contactId: contact.id, updatedAt: new Date(),
      }).where(and(
        eq(volunteerApplications.tenantId, invitation.tenantId),
        eq(volunteerApplications.id, application.id),
        eq(volunteerApplications.pipelineStatus, 'active_pool'),
        isNull(volunteerApplications.userId),
      )).returning({ id: volunteerApplications.id });
      if (!linked) throw invitationConflict('VOLUNTEER_INVITATION_FINALIZATION_CONFLICT', 'Application ownership changed');
    }
    await reconcileTrainingIdentityWithExecutor(tx, {
      tenantId: invitation.tenantId,
      userId: user.id,
      contactId: contact.id,
      applicationId: application?.id,
    });
    if (application) {
      await tx.update(volunteerTrainingAccessSessions).set({ revokedAt: new Date() }).where(and(
        eq(volunteerTrainingAccessSessions.tenantId, invitation.tenantId),
        eq(volunteerTrainingAccessSessions.volunteerApplicationId, application.id),
        isNull(volunteerTrainingAccessSessions.revokedAt),
      ));
    }
    const [accepted] = await tx.update(userInvitations).set({ acceptedAt: new Date() }).where(and(
      eq(userInvitations.id, invitation.id), isNull(userInvitations.acceptedAt),
    )).returning({ id: userInvitations.id });
    const [activated] = await tx.update(users).set({ isActive: true }).where(and(
      eq(users.id, user.id), eq(users.tenantId, invitation.tenantId), eq(users.isActive, false),
    )).returning();
    if (!accepted || !activated) throw invitationConflict('VOLUNTEER_INVITATION_FINALIZATION_CONFLICT', 'Invitation finalization failed');
    const { passwordHash: _, ...safeUser } = activated;
    return { user: safeUser, invitation };
  });
}

export async function acceptInvitation(
  token: string,
  password: string,
  fullName: string,
  phone: string,
  address: string
) {
  const invitation = await getInvitationByToken(token);
  const normalizedEmail = invitation.email.trim().toLowerCase();
  const isVolunteer = invitation.roles.includes('volunteer');
  let boundVolunteer: Awaited<ReturnType<typeof validateBoundVolunteerInvitation>> | null = null;
  if (isVolunteer) {
    if (invitation.volunteerApplicationId) {
      boundVolunteer = await validateBoundVolunteerInvitation(
        invitation.tenantId,
        invitation.volunteerApplicationId,
        normalizedEmail,
      );
    } else {
      const unbound = decideUnboundVolunteerInvitationAcceptance(true, await requiredVolunteerTrainingExists(invitation.tenantId));
      if (!unbound.allowed) {
        throw invitationConflict(
          unbound.code,
          'Staff must reissue this invitation from the approved volunteer application',
        );
      }
    }
  }
  if (boundVolunteer) {
    const normalizedContacts = await db.select({ id: contacts.id }).from(contacts).where(and(
      eq(contacts.tenantId, invitation.tenantId),
      sql`lower(trim(${contacts.email})) = ${normalizedEmail}`,
    ));
    if (normalizedContacts.length !== 1 || normalizedContacts[0].id !== boundVolunteer.contact.id) {
      throw invitationConflict(
        'VOLUNTEER_INVITATION_IDENTITY_REVIEW_REQUIRED',
        'The invitation recipient has conflicting contact identities',
      );
    }
  }
  const emailPreflight = boundVolunteer ? [] : await db.select({
    id: contacts.id,
    userId: contacts.userId,
    source: contacts.source,
    role: contacts.role,
  }).from(contacts).where(and(
    eq(contacts.tenantId, invitation.tenantId),
    sql`lower(${contacts.email}) = ${normalizedEmail}`,
  )).limit(1);
  const preflightContact = boundVolunteer ? boundVolunteer.contact : emailPreflight[0];
  if (preflightContact?.userId) {
    const error = new Error('This email is already linked to an existing contact account') as Error & { status?: number; code?: string };
    error.status = 409;
    error.code = 'CONTACT_OWNERSHIP_CONFLICT';
    throw error;
  }
  if (preflightContact && !boundVolunteer) {
    const linkedApplications = await db.select({ id: volunteerApplications.id })
      .from(volunteerApplications).where(and(
        eq(volunteerApplications.tenantId, invitation.tenantId),
        eq(volunteerApplications.contactId, preflightContact.id),
      ));
    const { getApplicationEstablishedIdentity } = await import('./volunteer-training');
    for (const application of linkedApplications) {
      const owner = await getApplicationEstablishedIdentity(invitation.tenantId, application.id);
      if ((owner.contactId && owner.contactId !== preflightContact.id) || owner.userId) {
        throw Object.assign(new Error('A linked volunteer application has established conflicting ownership'), {
          status: 409,
          code: 'VOLUNTEER_APPLICATION_OWNERSHIP_CONFLICT',
        });
      }
    }
  }

  if (isVolunteer) {
    const { hashPassword } = await import('./auth');
    const passwordHash = await hashPassword(password);
    return acceptVolunteerInvitationAtomic({
      invitation,
      passwordHash,
      fullName,
      phone,
      address,
    });
  }

  // Create the user using the auth service
  const { createUser } = await import('./auth');
  const user = await createUser(invitation.tenantId, {
    email: normalizedEmail,
    password,
    fullName: fullName || invitation.fullName || invitation.email,
    roles: invitation.roles as ('admin' | 'board_member' | 'staff' | 'foster' | 'volunteer')[],
  }, isVolunteer ? {
    initiallyInactive: true,
    skipContactSync: !!boundVolunteer,
  } : undefined);

  // Update user with phone number if provided (from invitation or accept form)
  // Also set fosterStatus='active' if the user has the foster role
  const phoneToSave = phone || invitation.phone;
  const isFoster = invitation.roles.includes('foster');
  const updateFields: Record<string, any> = {};
  if (phoneToSave) updateFields.phone = phoneToSave;
  if (isFoster) updateFields.fosterStatus = 'active';

  if (Object.keys(updateFields).length > 0) {
    await db
      .update(users)
      .set(updateFields)
      .where(eq(users.id, user.id));
  }

  // createUser synchronizes a contact through the ownership-safe contact
  // service. Re-read it and only permit the same user (or still-unowned row).
  const [postCreateContact] = await db.select({
    id: contacts.id,
    userId: contacts.userId,
    source: contacts.source,
    role: contacts.role,
  }).from(contacts).where(boundVolunteer
    ? and(eq(contacts.tenantId, invitation.tenantId), eq(contacts.id, boundVolunteer.contact.id))
    : and(eq(contacts.tenantId, invitation.tenantId), sql`lower(${contacts.email}) = ${normalizedEmail}`)
  ).limit(1);
  const contactWrite = decideInvitationContactWrite(!!boundVolunteer, !!postCreateContact);
  if (contactWrite.action === 'identity_conflict') {
    throw invitationConflict(
      'VOLUNTEER_INVITATION_IDENTITY_REVIEW_REQUIRED',
      'The established volunteer contact changed during acceptance',
    );
  }
  if (postCreateContact?.userId && postCreateContact.userId !== user.id) {
    throw Object.assign(new Error('Contact ownership changed while accepting the invitation'), {
      status: 409,
      code: 'CONTACT_OWNERSHIP_CONFLICT',
    });
  }
  let contact: { id: string } | undefined;
  if (postCreateContact && boundVolunteer) {
    contact = { id: postCreateContact.id };
  } else if (postCreateContact) {
    [contact] = await db.update(contacts).set({
      userId: user.id,
      name: fullName,
      email: normalizedEmail,
      phone,
      address,
      source: Array.from(new Set([...(postCreateContact.source || []), 'user' as const])),
      role: Array.from(new Set([...(postCreateContact.role || []), ...invitation.roles])) as ('admin' | 'board_member' | 'staff' | 'foster' | 'volunteer')[],
      updatedAt: new Date(),
    }).where(and(
      eq(contacts.id, postCreateContact.id),
      or(isNull(contacts.userId), eq(contacts.userId, user.id)),
    )).returning({ id: contacts.id });
    if (!contact) {
      throw Object.assign(new Error('Contact ownership changed while accepting the invitation'), {
        status: 409,
        code: 'CONTACT_OWNERSHIP_CONFLICT',
      });
    }
  } else if (!boundVolunteer) {
    [contact] = await db.insert(contacts).values({
      tenantId: invitation.tenantId,
      userId: user.id,
      name: fullName,
      email: normalizedEmail,
      phone: phone,
      address: address,
      source: ['user'],
      role: invitation.roles as ('admin' | 'board_member' | 'staff' | 'foster' | 'volunteer')[],
    }).returning({ id: contacts.id });
  }
  if (!contact) {
    throw invitationConflict(
      'VOLUNTEER_INVITATION_IDENTITY_REVIEW_REQUIRED',
      'The established volunteer contact could not be linked',
    );
  }

  await db.update(userInvitations)
    .set({ acceptedAt: new Date() })
    .where(eq(userInvitations.id, invitation.id));

  return { user, invitation };
}

/**
 * Update the email address on a pending invitation
 * Generates a new token since the old link should no longer work
 */
export async function updateInvitationEmail(
  invitationId: string,
  tenantId: string,
  newEmail: string
) {
  const normalizedEmail = newEmail.trim().toLowerCase();
  return db.transaction(async tx => {
    const [invitation] = await tx.select().from(userInvitations).where(and(
      eq(userInvitations.id, invitationId),
      eq(userInvitations.tenantId, tenantId),
      isNull(userInvitations.acceptedAt),
    )).limit(1).for('no key update');
    if (!invitation) throw new Error('Invitation not found or already accepted');
    if (invitation.volunteerApplicationId) {
      throw invitationConflict(
        'APPLICATION_BOUND_INVITATION_EMAIL_IMMUTABLE',
        'This invitation recipient belongs to a verified volunteer application and cannot be edited',
      );
    }
    const [existingUser] = await tx.select({ id: users.id }).from(users).where(and(
      eq(users.tenantId, tenantId),
      sql`lower(trim(${users.email})) = ${normalizedEmail}`,
    )).limit(1);
    if (existingUser) throw new Error('A user with this email already exists in your organization');
    const [existingInvitation] = await tx.select({ id: userInvitations.id }).from(userInvitations).where(and(
      eq(userInvitations.tenantId, tenantId),
      sql`lower(trim(${userInvitations.email})) = ${normalizedEmail}`,
      isNull(userInvitations.acceptedAt),
      gt(userInvitations.expiresAt, new Date()),
      sql`${userInvitations.id} <> ${invitationId}`,
    )).limit(1);
    if (existingInvitation) throw new Error('An invitation has already been sent to this email');
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + 7);
    const [updated] = await tx.update(userInvitations).set({
      email: normalizedEmail,
      token: generateInvitationToken(),
      expiresAt: newExpiresAt,
    }).where(and(
      eq(userInvitations.id, invitationId),
      eq(userInvitations.tenantId, tenantId),
      isNull(userInvitations.acceptedAt),
      isNull(userInvitations.volunteerApplicationId),
    )).returning();
    if (!updated) throw invitationConflict('INVITATION_UPDATE_CONFLICT', 'The invitation changed before its email was updated');
    return updated;
  });
}

/**
 * Cancel/delete an invitation
 */
export async function cancelInvitation(invitationId: string, tenantId: string) {
  const result = await db
    .delete(userInvitations)
    .where(and(
      eq(userInvitations.id, invitationId),
      eq(userInvitations.tenantId, tenantId)
    ))
    .returning();

  if (result.length === 0) {
    throw new Error('Invitation not found');
  }

  return result[0];
}

/**
 * Resend an existing invitation
 */
export async function resendInvitation(invitationId: string, tenantId: string) {
  const [invitation] = await db
    .select()
    .from(userInvitations)
    .where(and(
      eq(userInvitations.id, invitationId),
      eq(userInvitations.tenantId, tenantId),
      isNull(userInvitations.acceptedAt)
    ))
    .limit(1);

  if (!invitation) {
    throw new Error('Invitation not found or already accepted');
  }
  if (invitation.roles.includes('volunteer')) {
    if (invitation.volunteerApplicationId) {
      await validateBoundVolunteerInvitation(
        tenantId,
        invitation.volunteerApplicationId,
        invitation.email,
      );
    } else {
      const unbound = decideUnboundVolunteerInvitationAcceptance(
        true,
        await requiredVolunteerTrainingExists(tenantId),
      );
      if (!unbound.allowed) {
        throw invitationConflict(
          unbound.code,
          'Staff must reissue this invitation from the approved volunteer application',
        );
      }
    }
  }

  // Extend expiration
  const newExpiresAt = new Date();
  newExpiresAt.setDate(newExpiresAt.getDate() + 7);

  const [extended] = await db
    .update(userInvitations)
    .set({ expiresAt: newExpiresAt })
    .where(and(
      eq(userInvitations.id, invitationId),
      eq(userInvitations.tenantId, tenantId),
      isNull(userInvitations.acceptedAt),
    )).returning();
  if (!extended) throw invitationConflict('VOLUNTEER_INVITATION_FINALIZATION_CONFLICT', 'The invitation changed before resend');

  return extended;
}

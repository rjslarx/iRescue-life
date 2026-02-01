import { db } from '../db';
import { userInvitations, users, tenants } from '@shared/schema';
import { eq, and, isNull, gt } from 'drizzle-orm';
import crypto from 'crypto';
import { EmailService } from '../lib/email-service';

/**
 * Get the base URL for the application based on environment
 * In production, uses irescue.life
 * Falls back to REPLIT_DEV_DOMAIN for development
 */
function getAppBaseUrl(): string {
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
  }
) {
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
export async function acceptInvitation(
  token: string,
  password: string,
  fullName: string,
  phone: string,
  address: string
) {
  const invitation = await getInvitationByToken(token);

  // Create the user using the auth service
  const { createUser } = await import('./auth');
  const user = await createUser(invitation.tenantId, {
    email: invitation.email,
    password,
    fullName: fullName || invitation.fullName || invitation.email,
    roles: invitation.roles as ('admin' | 'board_member' | 'staff' | 'foster' | 'volunteer')[],
  });

  // Update user with phone number if provided (from invitation or accept form)
  const phoneToSave = phone || invitation.phone;
  if (phoneToSave) {
    await db
      .update(users)
      .set({ phone: phoneToSave })
      .where(eq(users.id, user.id));
  }

  // Mark invitation as accepted
  await db
    .update(userInvitations)
    .set({ acceptedAt: new Date() })
    .where(eq(userInvitations.id, invitation.id));

  // Create a contact record for the new team member
  const { contacts } = await import('@shared/schema');
  await db
    .insert(contacts)
    .values({
      tenantId: invitation.tenantId,
      userId: user.id,
      name: fullName,
      email: invitation.email,
      phone: phone,
      address: address,
      source: ['user'],
      role: invitation.roles as ('admin' | 'board_member' | 'staff' | 'foster' | 'volunteer')[],
    })
    .onConflictDoUpdate({
      target: [contacts.tenantId, contacts.email],
      set: {
        userId: user.id,
        name: fullName,
        phone: phone,
        address: address,
        role: invitation.roles as ('admin' | 'board_member' | 'staff' | 'foster' | 'volunteer')[],
        updatedAt: new Date(),
      },
    });

  return { user, invitation };
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

  // Extend expiration
  const newExpiresAt = new Date();
  newExpiresAt.setDate(newExpiresAt.getDate() + 7);

  await db
    .update(userInvitations)
    .set({ expiresAt: newExpiresAt })
    .where(eq(userInvitations.id, invitationId));

  return { ...invitation, expiresAt: newExpiresAt };
}

import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import {
  tenants,
  partnerOrganizations,
  surgeryDayRequests,
  surgeryDayRequestAnimals,
  type SurgeryDayRequest,
  type SurgeryDayRequestAnimal,
} from '@shared/schema';
import { EmailService } from '../lib/email-service';

const LOG = '[SurgeryDayPartnerEmail]';

type Status = SurgeryDayRequest['status'];

export interface SurgeryDayStatusEmailInput {
  tenantId: string;
  requestId: string;
  prevStatus: Status;
  prevScheduledDate: string | null;
  prevDeclinedReason: string | null;
  newStatus: Status;
  newScheduledDate: string | null;
  newDeclinedReason: string | null;
}

const NOTIFY_STATUSES: ReadonlySet<Status> = new Set([
  'approved',
  'scheduled',
  'declined',
  'completed',
  'cancelled',
]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateLong(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  // Surgery date is stored as a postgres date (YYYY-MM-DD). Parse as local
  // calendar date to avoid TZ shifts.
  const [y, m, d] = dateStr.split('-').map((p) => parseInt(p, 10));
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildSpeciesSummary(animals: SurgeryDayRequestAnimal[]): string {
  const counts: Record<string, number> = { dog: 0, cat: 0, other: 0 };
  for (const a of animals) {
    counts[a.species] = (counts[a.species] ?? 0) + 1;
  }
  const parts: string[] = [];
  if (counts.dog) parts.push(`${counts.dog} ${counts.dog === 1 ? 'dog' : 'dogs'}`);
  if (counts.cat) parts.push(`${counts.cat} ${counts.cat === 1 ? 'cat' : 'cats'}`);
  if (counts.other) parts.push(`${counts.other} other`);
  return parts.join(', ') || `${animals.length} animal${animals.length === 1 ? '' : 's'}`;
}

function buildAnimalNamesLine(animals: SurgeryDayRequestAnimal[]): string {
  const named = animals
    .map((a) => (a.name && a.name.trim() ? a.name.trim() : null))
    .filter((n): n is string => !!n);
  if (named.length === 0) return '';
  return named.join(', ');
}

interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

const PRE_OP_BLOCK_HTML = `
  <h3 style="margin: 24px 0 8px 0; color: #1e293b; font-size: 16px;">Pre-Operative Instructions</h3>
  <ul style="margin: 0 0 8px 0; padding-left: 20px; color: #334155; line-height: 1.6;">
    <li>No food or water after 10 PM the night before surgery.</li>
    <li>Drop-off window: <strong>8:00 AM &ndash; 9:00 AM</strong> on the scheduled day.</li>
    <li>Pick-up window: <strong>2:00 PM &ndash; 3:00 PM</strong> on the scheduled day.</li>
    <li>If you need to reschedule, please contact us as soon as possible.</li>
  </ul>
`.trim();

const PRE_OP_BLOCK_TEXT = [
  'Pre-Operative Instructions:',
  '- No food or water after 10 PM the night before surgery.',
  '- Drop-off window: 8:00 AM - 9:00 AM on the scheduled day.',
  '- Pick-up window: 2:00 PM - 3:00 PM on the scheduled day.',
  '- If you need to reschedule, please contact us as soon as possible.',
].join('\n');

function buildEmail(params: {
  tenantName: string;
  status: Status;
  request: SurgeryDayRequest;
  animals: SurgeryDayRequestAnimal[];
  scheduledDate: string | null;
}): BuiltEmail | null {
  const { tenantName, status, request, animals, scheduledDate } = params;
  const speciesSummary = buildSpeciesSummary(animals);
  const animalNames = buildAnimalNamesLine(animals);
  const greetingName = request.contactName?.trim() || 'there';
  const orgName = request.organizationName?.trim() || 'your organization';

  const tenantSafe = escapeHtml(tenantName);
  const greetingSafe = escapeHtml(greetingName);
  const orgSafe = escapeHtml(orgName);
  const speciesSafe = escapeHtml(speciesSummary);
  const animalNamesSafe = animalNames ? escapeHtml(animalNames) : '';
  const dateLong = formatDateLong(scheduledDate);
  const dateSafe = escapeHtml(dateLong);
  const declinedReasonSafe = request.declinedReason ? escapeHtml(request.declinedReason.trim()) : '';
  const requestRefSafe = escapeHtml(request.id.slice(0, 8));

  const sharedFooterHtml = `
    <p style="margin: 24px 0 0 0; color: #64748b; font-size: 13px;">
      Reference: Request #${requestRefSafe}<br/>
      Submitted by ${orgSafe} for ${speciesSafe}${animalNamesSafe ? ` (${animalNamesSafe})` : ''}.
    </p>
    <p style="margin: 16px 0 0 0; color: #94a3b8; font-size: 12px;">
      This is an automated update from ${tenantSafe}. Please reply to this email if you have any questions.
    </p>
  `.trim();

  const sharedFooterText = [
    '',
    `Reference: Request #${request.id.slice(0, 8)}`,
    `Submitted by ${orgName} for ${speciesSummary}${animalNames ? ` (${animalNames})` : ''}.`,
    '',
    `This is an automated update from ${tenantName}. Reply to this email if you have any questions.`,
  ].join('\n');

  let subject: string;
  let bodyHtml: string;
  let bodyText: string;

  switch (status) {
    case 'approved':
      subject = `[${tenantName}] Your surgery day request has been approved`;
      bodyHtml = `
        <p>Hi ${greetingSafe},</p>
        <p>Good news &mdash; your surgery day request for <strong>${orgSafe}</strong> covering ${speciesSafe}${animalNamesSafe ? ` (${animalNamesSafe})` : ''} has been <strong>approved</strong>.</p>
        <p>We'll be in touch shortly with a scheduled date. No action is needed from you right now.</p>
      `.trim();
      bodyText = [
        `Hi ${greetingName},`,
        '',
        `Good news -- your surgery day request for ${orgName} covering ${speciesSummary}${animalNames ? ` (${animalNames})` : ''} has been approved.`,
        '',
        `We'll be in touch shortly with a scheduled date. No action is needed from you right now.`,
      ].join('\n');
      break;

    case 'scheduled':
      if (!scheduledDate) {
        // Defensive: a "scheduled" status should always have a date. If not, skip.
        return null;
      }
      subject = `[${tenantName}] Your surgery day is scheduled for ${dateLong}`;
      bodyHtml = `
        <p>Hi ${greetingSafe},</p>
        <p>Your surgery day for <strong>${orgSafe}</strong> covering ${speciesSafe}${animalNamesSafe ? ` (${animalNamesSafe})` : ''} is scheduled for <strong>${dateSafe}</strong>.</p>
        ${PRE_OP_BLOCK_HTML}
      `.trim();
      bodyText = [
        `Hi ${greetingName},`,
        '',
        `Your surgery day for ${orgName} covering ${speciesSummary}${animalNames ? ` (${animalNames})` : ''} is scheduled for ${dateLong}.`,
        '',
        PRE_OP_BLOCK_TEXT,
      ].join('\n');
      break;

    case 'declined':
      subject = `[${tenantName}] Update on your surgery day request`;
      bodyHtml = `
        <p>Hi ${greetingSafe},</p>
        <p>Unfortunately, we weren't able to take on the surgery day request you submitted for <strong>${orgSafe}</strong> covering ${speciesSafe}${animalNamesSafe ? ` (${animalNamesSafe})` : ''}.</p>
        ${declinedReasonSafe
          ? `<p><strong>Reason:</strong> ${declinedReasonSafe}</p>`
          : ''}
        <p>Please reach out if you have questions or would like to discuss alternatives.</p>
      `.trim();
      bodyText = [
        `Hi ${greetingName},`,
        '',
        `Unfortunately, we weren't able to take on the surgery day request you submitted for ${orgName} covering ${speciesSummary}${animalNames ? ` (${animalNames})` : ''}.`,
        ...(request.declinedReason ? ['', `Reason: ${request.declinedReason.trim()}`] : []),
        '',
        `Please reach out if you have questions or would like to discuss alternatives.`,
      ].join('\n');
      break;

    case 'completed':
      subject = `[${tenantName}] Surgery day complete &mdash; thank you`;
      bodyHtml = `
        <p>Hi ${greetingSafe},</p>
        <p>Surgery day is complete for <strong>${orgSafe}</strong> covering ${speciesSafe}${animalNamesSafe ? ` (${animalNamesSafe})` : ''}. Thank you for partnering with us!</p>
        <p>Please be sure to follow the post-operative care instructions provided at pick-up. If anything seems off in the next few days, contact us right away.</p>
      `.trim();
      bodyText = [
        `Hi ${greetingName},`,
        '',
        `Surgery day is complete for ${orgName} covering ${speciesSummary}${animalNames ? ` (${animalNames})` : ''}. Thank you for partnering with us!`,
        '',
        `Please be sure to follow the post-operative care instructions provided at pick-up. If anything seems off in the next few days, contact us right away.`,
      ].join('\n');
      break;

    case 'cancelled':
      subject = `[${tenantName}] Your scheduled surgery day has been cancelled`;
      bodyHtml = `
        <p>Hi ${greetingSafe},</p>
        <p>Your scheduled surgery day for <strong>${orgSafe}</strong> covering ${speciesSafe}${animalNamesSafe ? ` (${animalNamesSafe})` : ''} has been <strong>cancelled</strong>.</p>
        <p>If you'd like to reschedule, please reach out and we'll find a new date together.</p>
      `.trim();
      bodyText = [
        `Hi ${greetingName},`,
        '',
        `Your scheduled surgery day for ${orgName} covering ${speciesSummary}${animalNames ? ` (${animalNames})` : ''} has been cancelled.`,
        '',
        `If you'd like to reschedule, please reach out and we'll find a new date together.`,
      ].join('\n');
      break;

    default:
      return null;
  }

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #0f172a; line-height: 1.5;">
      <div style="padding: 24px;">
        ${bodyHtml}
        ${sharedFooterHtml}
      </div>
    </div>
  `.trim();

  const text = `${bodyText}${sharedFooterText}`;

  return { subject, html, text };
}

function isValidEmail(email: string | null | undefined): email is string {
  if (!email) return false;
  const trimmed = email.trim();
  if (trimmed.length === 0) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Decide whether the change in a Surgery Day Request warrants a partner email.
 * Returns the status whose template should be sent, or null to skip.
 */
export function decideStatusEmailToSend(input: SurgeryDayStatusEmailInput): Status | null {
  const { prevStatus, prevScheduledDate, prevDeclinedReason, newStatus, newScheduledDate, newDeclinedReason } = input;

  // Status moved to a notify-worthy status
  if (newStatus !== prevStatus && NOTIFY_STATUSES.has(newStatus)) {
    return newStatus;
  }

  // Same status but scheduled date changed (e.g. reschedule). Only meaningful for `scheduled`.
  if (newStatus === 'scheduled' && newScheduledDate && newScheduledDate !== prevScheduledDate) {
    return 'scheduled';
  }

  // Same status but declined reason changed while still declined.
  if (newStatus === 'declined' && (newDeclinedReason || '').trim() !== (prevDeclinedReason || '').trim()) {
    return 'declined';
  }

  return null;
}

export async function sendSurgeryDayPartnerStatusEmail(input: SurgeryDayStatusEmailInput): Promise<void> {
  const statusToSend = decideStatusEmailToSend(input);
  if (!statusToSend) return;

  try {
    // Load tenant + check kill switch
    const [tenant] = await db
      .select({ id: tenants.id, name: tenants.name, commsPaused: tenants.commsPaused })
      .from(tenants)
      .where(eq(tenants.id, input.tenantId));
    if (!tenant) {
      console.warn(`${LOG} tenant ${input.tenantId} not found; skipping`);
      return;
    }
    if (tenant.commsPaused) {
      console.log(`${LOG} paused: tenant ${tenant.id} has commsPaused=true; skipping ${statusToSend} email for request ${input.requestId}`);
      return;
    }

    // Load the request + its animals
    const [request] = await db
      .select()
      .from(surgeryDayRequests)
      .where(and(eq(surgeryDayRequests.id, input.requestId), eq(surgeryDayRequests.tenantId, input.tenantId)));
    if (!request) {
      console.warn(`${LOG} request ${input.requestId} not found in tenant ${input.tenantId}`);
      return;
    }

    const animals = await db
      .select()
      .from(surgeryDayRequestAnimals)
      .where(eq(surgeryDayRequestAnimals.requestId, request.id))
      .orderBy(surgeryDayRequestAnimals.sortIndex);

    // Resolve recipients: request contact email + linked partner org contact email (when different)
    const recipientSet = new Set<string>();
    if (isValidEmail(request.contactEmail)) {
      recipientSet.add(request.contactEmail.trim().toLowerCase());
    }
    if (request.partnerOrganizationId) {
      const [partner] = await db
        .select({
          contactEmail: partnerOrganizations.contactEmail,
          secondaryContactEmail: partnerOrganizations.secondaryContactEmail,
        })
        .from(partnerOrganizations)
        .where(and(
          eq(partnerOrganizations.id, request.partnerOrganizationId),
          eq(partnerOrganizations.tenantId, input.tenantId),
        ));
      if (partner) {
        if (isValidEmail(partner.contactEmail)) {
          recipientSet.add(partner.contactEmail.trim().toLowerCase());
        }
        if (isValidEmail(partner.secondaryContactEmail)) {
          recipientSet.add(partner.secondaryContactEmail.trim().toLowerCase());
        }
      }
    }

    if (recipientSet.size === 0) {
      console.log(`${LOG} no valid recipient email for request ${request.id}; skipping ${statusToSend}`);
      return;
    }

    const built = buildEmail({
      tenantName: tenant.name || 'Animal Rescue',
      status: statusToSend,
      request,
      animals,
      scheduledDate: input.newScheduledDate,
    });
    if (!built) {
      console.warn(`${LOG} could not build email body for status ${statusToSend} on request ${request.id}; skipping`);
      return;
    }

    const emailService = await EmailService.forTenant(input.tenantId);
    if (!emailService) {
      console.warn(`${LOG} no email service configured for tenant ${input.tenantId}; skipping ${statusToSend} email for request ${request.id}`);
      return;
    }

    for (const recipient of recipientSet) {
      try {
        const result = await emailService.send({
          to: recipient,
          subject: built.subject,
          html: built.html,
          text: built.text,
        });
        if (result.success) {
          console.log(`${LOG} sent ${statusToSend} email to ${recipient} for request ${request.id}`);
        } else {
          console.warn(`${LOG} send failed for ${recipient} on request ${request.id}: ${result.error}`);
        }
      } catch (err) {
        console.error(`${LOG} send error for ${recipient} on request ${request.id}:`, err);
      }
    }
  } catch (err) {
    console.error(`${LOG} unexpected error sending ${statusToSend} email for request ${input.requestId}:`, err);
  }
}

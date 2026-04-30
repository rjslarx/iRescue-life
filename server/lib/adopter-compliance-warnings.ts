/**
 * Adopter Compliance Warning Engine (Task #137)
 *
 * Sends a strongly-worded contract-enforcement warning to adopters when their
 * dog's parasite-prevention (heartworm/flea/tick) is overdue ≥14 days with no
 * proof of treatment uploaded and no warning sent in the past 30 days.
 *
 * IMPORTANT: This intentionally bypasses the adopter's email/SMS opt-out
 * preferences because it is a transactional contract-enforcement notice — not
 * a marketing message.
 */
import crypto from 'crypto';
import { db } from '../db';
import {
  animals,
  adoptions,
  preventativeCareRecords,
  adopterComplianceConfirmations,
  adopterComplianceWarnings,
  adopterComplianceWarningTemplates,
  adopterNotificationLogs,
  tenants,
  users,
} from '@shared/schema';
import { and, eq, gte, lte, sql, desc, isNotNull, inArray } from 'drizzle-orm';
import { EmailService } from './email-service';
import { sendSms, isTwilioEnabled } from './twilio-service';

export const WARNING_DEADLINE_DAYS = 7;
export const WARNING_DEDUP_DAYS = 30;
export const OVERDUE_THRESHOLD_DAYS = 14;

export const DEFAULT_WARNING_EMAIL_SUBJECT =
  `Action Required: {{dogName}}'s heartworm prevention is overdue — 7 days to comply`;

// Wording inspired by the Haseya rescue manager's preferred message — strong,
// direct, unambiguous about the contract, but caring.
export const DEFAULT_WARNING_EMAIL_BODY = `Dear {{adopterFirstName}},

This is a formal notice from {{rescueName}} regarding your adoption contract.

Our records show that {{dogName}}'s heartworm and parasite prevention is OVERDUE and we have not received proof of current treatment. Per the adoption contract you signed, you are required to keep {{dogName}} on year-round, vet-prescribed heartworm prevention for the life of your dog.

Heartworm disease is preventable — but once contracted it is painful, expensive to treat, and often fatal. Skipping doses puts {{dogName}}'s life at real risk and is a direct violation of the agreement we made together when you adopted.

DEADLINE: You have until {{deadlineDate}} (7 days from today) to upload proof of current heartworm prevention to your Adopter Portal.

Upload Proof Now: {{portalLink}}

If we do not receive proof by {{deadlineDate}}, {{rescueName}} will be required to take further action under the terms of your adoption contract — which may include reclamation of the animal.

We do not want it to come to that. If cost is the problem, please reply to this email or call us today — we have low-cost prevention resources and may be able to help. Please do not ignore this notice.

— The {{rescueName}} Team`;

export const DEFAULT_WARNING_SMS_BODY =
  `URGENT — {{rescueName}}: {{dogName}}'s heartworm prevention is OVERDUE and is a violation of your adoption contract. Upload proof at {{portalLink}} by {{deadlineDate}} (7 days). Reply to this message if you need help.`;

export interface WarningTokens {
  rescueName: string;
  adopterFirstName: string;
  dogName: string;
  deadlineDate: string;
  portalLink: string;
}

export function renderWarningTemplate(template: string, tokens: WarningTokens): string {
  return template
    .replace(/\{\{rescueName\}\}/g, tokens.rescueName)
    .replace(/\{\{adopterFirstName\}\}/g, tokens.adopterFirstName)
    .replace(/\{\{dogName\}\}/g, tokens.dogName)
    .replace(/\{\{deadlineDate\}\}/g, tokens.deadlineDate)
    .replace(/\{\{portalLink\}\}/g, tokens.portalLink);
}

function getAppBaseUrl(): string {
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return process.env.APP_BASE_URL || 'https://irescue.life';
}

export function buildAdopterPortalUrl(
  tenant: { subdomain: string | null; customDomain: string | null },
  animalId: string,
): string {
  const path = `/my-pets/${animalId}`;
  if (tenant.customDomain) return `https://${tenant.customDomain}${path}`;
  const tenantPath = tenant.subdomain ? `/${tenant.subdomain}` : '';
  return `${getAppBaseUrl()}${tenantPath}${path}`;
}

/**
 * Tracking URLs for the warning email. Two URL families exist for backwards
 * compatibility:
 *  - UUID-based: /api/heartworm-tracking/{open,click}/:warningId — used by
 *    new warning emails (this task).
 *  - Token-based: /api/track/heartworm-warning/{open,click}/:token — used by
 *    legacy warning emails that embedded the random `tracking_token` column.
 * Both endpoint families stamp the same `emailOpenedAt` / `linkClickedAt`
 * columns. The UUID-based builders are the canonical ones; the token-based
 * builders are kept exported so any pre-existing call sites keep compiling.
 */
export function buildTrackingPixelUrl(warningId: string): string {
  return `${getAppBaseUrl()}/api/heartworm-tracking/open/${warningId}.gif`;
}

export function buildTrackedClickUrl(warningId: string): string {
  return `${getAppBaseUrl()}/api/heartworm-tracking/click/${warningId}`;
}

export function buildTrackingPixelUrlByToken(token: string): string {
  return `${getAppBaseUrl()}/api/track/heartworm-warning/open/${token}.gif`;
}

export function buildTrackingClickUrl(token: string): string {
  return `${getAppBaseUrl()}/api/track/heartworm-warning/click/${token}`;
}

export function formatDeadlineDate(deadline: Date): string {
  return deadline.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

export async function getEffectiveTemplate(tenantId: string): Promise<{
  emailSubject: string;
  emailBody: string;
  smsBody: string;
  isCustom: boolean;
}> {
  const [override] = await db
    .select()
    .from(adopterComplianceWarningTemplates)
    .where(eq(adopterComplianceWarningTemplates.tenantId, tenantId))
    .limit(1);
  return {
    emailSubject: override?.emailSubject || DEFAULT_WARNING_EMAIL_SUBJECT,
    emailBody: override?.emailBody || DEFAULT_WARNING_EMAIL_BODY,
    smsBody: override?.smsBody || DEFAULT_WARNING_SMS_BODY,
    isCustom: !!(override?.emailSubject || override?.emailBody || override?.smsBody),
  };
}

export type WarningEngagementStatus =
  | 'proof_uploaded'
  | 'link_clicked'
  | 'email_opened'
  | 'no_response'
  | 'sms_only'  // last warning had no email channel — nothing to track
  | 'never_warned';

export interface WarningEngagement {
  emailOpenedAt: Date | null;
  linkClickedAt: Date | null;
  proofUploadedAt: Date | null;
  status: WarningEngagementStatus;
}

export interface EligibleWarningCandidate {
  animalId: string;
  animalName: string;
  itemId: string;          // preventativeCareRecord.id
  careName: string;
  careCategory: string;
  dueDate: string;         // ISO date
  daysOverdue: number;
  adopterName: string;
  adopterEmail: string;
  adopterPhone: string | null;
  lastWarningAt: Date | null;
  lastWarningDeadline: string | null;
  warningsInLast30Days: number;
  // Engagement signals for the most recent warning to this adopter+item.
  // `null` when there is no recent warning at all.
  engagement: WarningEngagement | null;
}

export interface WarningMonthlyStats {
  warningsSent: number;
  proofUploaded: number;
  emailOpened: number;
  linkClicked: number;
  monthLabel: string;  // e.g. "April 2026"
}

/**
 * Returns parasite-prevention items that are overdue ≥14 days for an adopted
 * animal and have no proof uploaded. Includes items already warned in the past
 * 30 days (for UI display) but flags `warningsInLast30Days` so the cron can
 * filter them out.
 */
export async function findEligibleHeartwormWarnings(
  tenantId: string,
): Promise<EligibleWarningCandidate[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - OVERDUE_THRESHOLD_DAYS);

  const dedupSince = new Date();
  dedupSince.setDate(dedupSince.getDate() - WARNING_DEDUP_DAYS);

  // Pull every parasite_prevention record overdue ≥14 days for an adopted animal.
  // The adoption join also returns adoptionDate so we can pick the most recent
  // adoption per animal (an animal returned & re-adopted may have multiple
  // adoption rows; we always notify the *current* adopter).
  const rawRows = await db
    .select({
      itemId: preventativeCareRecords.id,
      careName: preventativeCareRecords.careName,
      careCategory: preventativeCareRecords.careCategory,
      nextDueDate: preventativeCareRecords.nextDueDate,
      animalId: animals.id,
      animalName: animals.name,
      adopterName: adoptions.adopterName,
      adopterEmail: adoptions.adopterEmail,
      adopterPhone: adoptions.adopterPhone,
      adoptionDate: adoptions.adoptionDate,
    })
    .from(preventativeCareRecords)
    .innerJoin(animals, and(
      eq(animals.id, preventativeCareRecords.animalId),
      eq(animals.tenantId, tenantId),
      eq(animals.status, 'adopted'),
    ))
    .innerJoin(adoptions, and(
      eq(adoptions.animalId, preventativeCareRecords.animalId),
      eq(adoptions.tenantId, tenantId),
    ))
    .where(and(
      eq(preventativeCareRecords.tenantId, tenantId),
      eq(preventativeCareRecords.careCategory, 'parasite_prevention'),
      isNotNull(preventativeCareRecords.nextDueDate),
      lte(preventativeCareRecords.nextDueDate, cutoff),
    ));

  if (rawRows.length === 0) return [];

  // Dedupe: one row per (animalId, itemId), keeping the most recent adoption
  // record so we always reach the *current* adopter (not a returned one).
  const dedupMap = new Map<string, typeof rawRows[number]>();
  for (const r of rawRows) {
    const key = `${r.animalId}:${r.itemId}`;
    const existing = dedupMap.get(key);
    if (!existing) { dedupMap.set(key, r); continue; }
    const a = r.adoptionDate ? new Date(r.adoptionDate).getTime() : 0;
    const b = existing.adoptionDate ? new Date(existing.adoptionDate).getTime() : 0;
    if (a > b) dedupMap.set(key, r);
  }
  const rows = Array.from(dedupMap.values());

  // For each candidate row, check whether the adopter has already uploaded an
  // approved or pending-review compliance confirmation for this care item that
  // covers (or post-dates) the due date.
  const animalIds = Array.from(new Set(rows.map(r => r.animalId)));
  const confirmations = await db
    .select({
      animalId: adopterComplianceConfirmations.animalId,
      careName: adopterComplianceConfirmations.careName,
      preventativeCareRecordId: adopterComplianceConfirmations.preventativeCareRecordId,
      dateAdministered: adopterComplianceConfirmations.dateAdministered,
      // createdAt is the actual upload time (i.e. when the adopter submitted
      // proof in the portal); dateAdministered is the *treatment* date the
      // adopter typed into the form, which can be earlier than the warning
      // sent_at and so is not a valid signal of post-warning engagement.
      createdAt: adopterComplianceConfirmations.createdAt,
      status: adopterComplianceConfirmations.status,
    })
    .from(adopterComplianceConfirmations)
    .where(and(
      eq(adopterComplianceConfirmations.tenantId, tenantId),
      eq(adopterComplianceConfirmations.careCategory, 'parasite_prevention'),
      inArray(adopterComplianceConfirmations.animalId, animalIds),
      inArray(adopterComplianceConfirmations.status, ['approved', 'pending_review']),
    ));

  // Recent warnings — used for both dedup and the "last warned on" badge.
  // Dedup is keyed by (tenant, lower(adopter_email), item_id) so that a brand-
  // new adopter for the same animal+item is NOT suppressed by a warning sent
  // to a previous adopter (e.g. after a return + re-adoption).
  // We also pull the engagement timestamps so the dashboard can show "Email
  // opened" / "Link clicked" badges per row.
  const recentWarnings = await db
    .select({
      animalId: adopterComplianceWarnings.animalId,
      itemId: adopterComplianceWarnings.itemId,
      adopterEmail: adopterComplianceWarnings.adopterEmail,
      sentAt: adopterComplianceWarnings.sentAt,
      deadlineDate: adopterComplianceWarnings.deadlineDate,
      channelsUsed: adopterComplianceWarnings.channelsUsed,
      trackingToken: adopterComplianceWarnings.trackingToken,
      emailOpenedAt: adopterComplianceWarnings.emailOpenedAt,
      linkClickedAt: adopterComplianceWarnings.linkClickedAt,
    })
    .from(adopterComplianceWarnings)
    .where(and(
      eq(adopterComplianceWarnings.tenantId, tenantId),
      inArray(adopterComplianceWarnings.animalId, animalIds),
      gte(adopterComplianceWarnings.sentAt, dedupSince),
    ))
    .orderBy(desc(adopterComplianceWarnings.sentAt));

  const dedupKey = (email: string | null | undefined, itemId: string) =>
    `${(email || '').toLowerCase()}:${itemId}`;

  // Track the *most recent* warning per (adopter, item) for the dashboard
  // (engagement signals always reflect the latest send), plus a count for the
  // 30-day dedup. The recentWarnings query is already DESC by sent_at so the
  // first hit per key is the latest.
  interface RecentWarningSummary {
    sentAt: Date;
    deadlineDate: string;
    count: number;
    channelsUsed: string[];
    emailOpenedAt: Date | null;
    linkClickedAt: Date | null;
    animalId: string;
  }
  const warningsByAdopterItem = new Map<string, RecentWarningSummary>();
  for (const w of recentWarnings) {
    const key = dedupKey(w.adopterEmail, w.itemId);
    const existing = warningsByAdopterItem.get(key);
    if (!existing) {
      warningsByAdopterItem.set(key, {
        sentAt: w.sentAt,
        deadlineDate: w.deadlineDate,
        count: 1,
        channelsUsed: w.channelsUsed || [],
        emailOpenedAt: w.emailOpenedAt,
        linkClickedAt: w.linkClickedAt,
        animalId: w.animalId,
      });
    } else {
      existing.count += 1;
    }
  }

  // Build a per-(animal,item) lookup of the earliest confirmation row, so we
  // can decide both whether proof exists AND when it was uploaded (for the
  // "Proof uploaded" engagement status). We fall back to careName + admin
  // date matching when preventativeCareRecordId is null on the confirmation.
  // Prefer matching by `preventativeCareRecordId` (the strong key); fall back
  // to careName-with-coverage-date only when the confirmation is unlinked.
  // This keeps a single confirmation from being attributed to multiple
  // unrelated warnings.
  function findCoveringProof(animalId: string, itemId: string, careName: string, dueDate: Date) {
    const byId = confirmations.find(c =>
      c.animalId === animalId && c.preventativeCareRecordId === itemId,
    );
    if (byId) return byId;
    return confirmations.find(c =>
      c.animalId === animalId
        && c.preventativeCareRecordId === null
        && c.careName === careName
        && new Date(c.dateAdministered) >= dueDate,
    );
  }

  function buildEngagement(
    recent: RecentWarningSummary | undefined,
    proofUploadedAt: Date | null,
  ): WarningEngagement | null {
    if (!recent) return null;
    // Only count proof uploaded AFTER the warning as a response to the
    // warning. A pre-existing confirmation means the adopter is already
    // compliant and the warning shouldn't have been sent — it doesn't count
    // as engagement.
    const isPostWarningProof = !!(proofUploadedAt && proofUploadedAt >= recent.sentAt);
    // Order matters: highest signal wins. We treat proof uploaded as the
    // top-of-funnel resolution because that's the actual outcome the contract
    // demanded; everything else is just a signal toward it.
    let status: WarningEngagementStatus;
    if (isPostWarningProof) {
      status = 'proof_uploaded';
    } else if (recent.linkClickedAt) {
      status = 'link_clicked';
    } else if (recent.emailOpenedAt) {
      status = 'email_opened';
    } else if (!recent.channelsUsed.includes('email')) {
      status = 'sms_only';
    } else {
      status = 'no_response';
    }
    return {
      emailOpenedAt: recent.emailOpenedAt,
      linkClickedAt: recent.linkClickedAt,
      proofUploadedAt: isPostWarningProof ? proofUploadedAt : null,
      status,
    };
  }

  const candidates: EligibleWarningCandidate[] = [];
  for (const row of rows) {
    if (!row.nextDueDate) continue;
    const dueDate = row.nextDueDate instanceof Date ? row.nextDueDate : new Date(row.nextDueDate);
    const dueDateStr = dueDate.toISOString().split('T')[0];

    const recent = warningsByAdopterItem.get(dedupKey(row.adopterEmail, row.itemId));
    const proofConfirmation = findCoveringProof(row.animalId, row.itemId, row.careName, dueDate);
    // Use createdAt (true upload timestamp), not dateAdministered (the
    // adopter-typed treatment date), so the engagement signal reflects
    // genuine post-warning action.
    const proofUploadedAt = proofConfirmation
      ? new Date(proofConfirmation.createdAt)
      : null;

    // If the adopter has already uploaded covering proof and we never warned
    // them, drop the row — it isn't a compliance concern. If we DID warn them
    // recently, keep the row visible so the dashboard can show that the
    // warning produced a successful outcome.
    if (proofConfirmation && !recent) continue;

    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    candidates.push({
      animalId: row.animalId,
      animalName: row.animalName,
      itemId: row.itemId,
      careName: row.careName,
      careCategory: row.careCategory,
      dueDate: dueDateStr,
      daysOverdue,
      adopterName: row.adopterName,
      adopterEmail: row.adopterEmail,
      adopterPhone: row.adopterPhone || null,
      lastWarningAt: recent?.sentAt || null,
      lastWarningDeadline: recent?.deadlineDate || null,
      warningsInLast30Days: recent?.count || 0,
      engagement: buildEngagement(recent, proofUploadedAt),
    });
  }

  return candidates;
}

export interface RecentlyWarnedItem {
  warningId: string;
  animalId: string;
  animalName: string;
  itemId: string;
  careName: string;
  dueDate: string;
  daysOverdue: number;
  adopterName: string;
  adopterEmail: string;
  adopterPhone: string | null;
  sentAt: string;            // ISO
  deadlineDate: string;      // YYYY-MM-DD
  emailOpenedAt: string | null;
  linkClickedAt: string | null;
  proofUploadedAt: string | null;
  engagementStatus:
    | 'no_response'
    | 'email_opened'
    | 'link_clicked'
    | 'proof_uploaded';
}

export interface MonthlyWarningStats {
  warningsSent: number;
  proofUploaded: number;
  emailsOpened: number;
  linksClicked: number;
  monthLabel: string;        // e.g. "April 2026"
}

/**
 * Returns warnings sent in the last 30 days for a tenant, with engagement
 * status (opened / clicked / proof uploaded) per row. Used by the Heartworm
 * Watch tab so staff can prioritize follow-up calls based on whether the
 * adopter actually engaged with the warning.
 */
export async function findRecentlyWarnedItems(
  tenantId: string,
): Promise<RecentlyWarnedItem[]> {
  const since = new Date();
  since.setDate(since.getDate() - WARNING_DEDUP_DAYS);

  const warnings = await db
    .select({
      warningId: adopterComplianceWarnings.id,
      animalId: adopterComplianceWarnings.animalId,
      itemId: adopterComplianceWarnings.itemId,
      careName: adopterComplianceWarnings.careName,
      dueDate: adopterComplianceWarnings.dueDate,
      deadlineDate: adopterComplianceWarnings.deadlineDate,
      sentAt: adopterComplianceWarnings.sentAt,
      adopterEmail: adopterComplianceWarnings.adopterEmail,
      emailOpenedAt: adopterComplianceWarnings.emailOpenedAt,
      linkClickedAt: adopterComplianceWarnings.linkClickedAt,
      animalName: animals.name,
    })
    .from(adopterComplianceWarnings)
    .innerJoin(animals, eq(animals.id, adopterComplianceWarnings.animalId))
    .where(and(
      eq(adopterComplianceWarnings.tenantId, tenantId),
      gte(adopterComplianceWarnings.sentAt, since),
    ))
    .orderBy(desc(adopterComplianceWarnings.sentAt));

  if (warnings.length === 0) return [];

  // Dedup so each (animalId, itemId) shows only the most-recent warning row —
  // engagement is tracked per-row but the Watch tab only needs one summary
  // row per outstanding obligation.
  const seen = new Set<string>();
  const latestPerKey = warnings.filter(w => {
    const k = `${w.animalId}:${w.itemId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Pull the matching adopter info (name + phone) from the most recent
  // adoption per animal so we don't have to denormalize it on warning rows.
  const animalIds = Array.from(new Set(latestPerKey.map(w => w.animalId)));
  const adoptionRows = animalIds.length === 0 ? [] : await db
    .select({
      animalId: adoptions.animalId,
      adopterName: adoptions.adopterName,
      adopterEmail: adoptions.adopterEmail,
      adopterPhone: adoptions.adopterPhone,
      adoptionDate: adoptions.adoptionDate,
    })
    .from(adoptions)
    .where(and(
      eq(adoptions.tenantId, tenantId),
      inArray(adoptions.animalId, animalIds),
    ));

  const adopterByAnimal = new Map<string, { adopterName: string; adopterPhone: string | null }>();
  for (const row of adoptionRows) {
    const existing = adopterByAnimal.get(row.animalId);
    if (!existing) {
      adopterByAnimal.set(row.animalId, {
        adopterName: row.adopterName,
        adopterPhone: row.adopterPhone || null,
      });
      continue;
    }
    // Replace if this adoption is more recent (handles return + re-adoption)
    const a = row.adoptionDate ? new Date(row.adoptionDate).getTime() : 0;
    const b = adoptionRows
      .filter(r => r.animalId === row.animalId)
      .map(r => r.adoptionDate ? new Date(r.adoptionDate).getTime() : 0)
      .reduce((m, t) => Math.max(m, t), 0);
    if (a >= b) {
      adopterByAnimal.set(row.animalId, {
        adopterName: row.adopterName,
        adopterPhone: row.adopterPhone || null,
      });
    }
  }

  // Pull all confirmations for these animals in the relevant care category so
  // we can compute "Proof uploaded" status (any approved/pending confirmation
  // dated on or after the warning was sent counts as a response).
  const confirmations = animalIds.length === 0 ? [] : await db
    .select({
      animalId: adopterComplianceConfirmations.animalId,
      preventativeCareRecordId: adopterComplianceConfirmations.preventativeCareRecordId,
      careName: adopterComplianceConfirmations.careName,
      dateAdministered: adopterComplianceConfirmations.dateAdministered,
      createdAt: adopterComplianceConfirmations.createdAt,
      status: adopterComplianceConfirmations.status,
    })
    .from(adopterComplianceConfirmations)
    .where(and(
      eq(adopterComplianceConfirmations.tenantId, tenantId),
      eq(adopterComplianceConfirmations.careCategory, 'parasite_prevention'),
      inArray(adopterComplianceConfirmations.animalId, animalIds),
      inArray(adopterComplianceConfirmations.status, ['approved', 'pending_review']),
    ));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return latestPerKey.map(w => {
    const due = new Date(w.dueDate);
    const daysOverdue = Math.max(0, Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
    const adopter = adopterByAnimal.get(w.animalId);

    // Find a proof confirmation that arrived on or after this warning was sent
    // for the same care item. Prefer matching by preventative_care_record_id
    // when set (strong key), otherwise fall back to careName equality.
    const proof = confirmations.find(c => {
      if (c.animalId !== w.animalId) return false;
      if (new Date(c.createdAt) < w.sentAt) return false;
      if (c.preventativeCareRecordId === w.itemId) return true;
      return c.preventativeCareRecordId === null && c.careName === w.careName;
    });

    let engagementStatus: RecentlyWarnedItem['engagementStatus'] = 'no_response';
    if (proof) engagementStatus = 'proof_uploaded';
    else if (w.linkClickedAt) engagementStatus = 'link_clicked';
    else if (w.emailOpenedAt) engagementStatus = 'email_opened';

    return {
      warningId: w.warningId,
      animalId: w.animalId,
      animalName: w.animalName,
      itemId: w.itemId,
      careName: w.careName,
      dueDate: w.dueDate,
      daysOverdue,
      adopterName: adopter?.adopterName || 'Unknown adopter',
      adopterEmail: w.adopterEmail || '',
      adopterPhone: adopter?.adopterPhone || null,
      sentAt: w.sentAt.toISOString(),
      deadlineDate: w.deadlineDate,
      emailOpenedAt: w.emailOpenedAt ? w.emailOpenedAt.toISOString() : null,
      linkClickedAt: w.linkClickedAt ? w.linkClickedAt.toISOString() : null,
      proofUploadedAt: proof ? new Date(proof.createdAt).toISOString() : null,
      engagementStatus,
    };
  });
}

/**
 * Counts warnings sent and proof uploads received for the current calendar
 * month. Drives the "X warnings sent this month, Y resulted in proof
 * uploaded" header counter on the Heartworm Watch tab.
 */
export async function getMonthlyWarningStats(
  tenantId: string,
): Promise<MonthlyWarningStats> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const monthlyWarnings = await db
    .select({
      id: adopterComplianceWarnings.id,
      animalId: adopterComplianceWarnings.animalId,
      itemId: adopterComplianceWarnings.itemId,
      careName: adopterComplianceWarnings.careName,
      sentAt: adopterComplianceWarnings.sentAt,
      emailOpenedAt: adopterComplianceWarnings.emailOpenedAt,
      linkClickedAt: adopterComplianceWarnings.linkClickedAt,
    })
    .from(adopterComplianceWarnings)
    .where(and(
      eq(adopterComplianceWarnings.tenantId, tenantId),
      gte(adopterComplianceWarnings.sentAt, monthStart),
    ));

  if (monthlyWarnings.length === 0) {
    return { warningsSent: 0, proofUploaded: 0, emailsOpened: 0, linksClicked: 0, monthLabel };
  }

  const animalIds = Array.from(new Set(monthlyWarnings.map(w => w.animalId)));
  const confirmations = await db
    .select({
      animalId: adopterComplianceConfirmations.animalId,
      preventativeCareRecordId: adopterComplianceConfirmations.preventativeCareRecordId,
      careName: adopterComplianceConfirmations.careName,
      dateAdministered: adopterComplianceConfirmations.dateAdministered,
      createdAt: adopterComplianceConfirmations.createdAt,
    })
    .from(adopterComplianceConfirmations)
    .where(and(
      eq(adopterComplianceConfirmations.tenantId, tenantId),
      eq(adopterComplianceConfirmations.careCategory, 'parasite_prevention'),
      inArray(adopterComplianceConfirmations.animalId, animalIds),
      // Only count confirmations the staff has actually accepted (or is
      // reviewing). Rejected/withdrawn confirmations do not satisfy a warning.
      inArray(adopterComplianceConfirmations.status, ['approved', 'pending_review']),
      gte(adopterComplianceConfirmations.createdAt, monthStart),
    ));

  let proofUploaded = 0;
  let emailsOpened = 0;
  let linksClicked = 0;
  for (const w of monthlyWarnings) {
    if (w.emailOpenedAt) emailsOpened++;
    if (w.linkClickedAt) linksClicked++;
    // Prefer the strong key (preventativeCareRecordId) so a single confirmation
    // can't be attributed to multiple unrelated warnings on the same animal.
    // Fall back to careName matching only when the confirmation is unlinked.
    const matched = confirmations.find(c => {
      if (c.animalId !== w.animalId) return false;
      if (new Date(c.createdAt) < w.sentAt) return false;
      if (c.preventativeCareRecordId === w.itemId) return true;
      return c.preventativeCareRecordId === null && c.careName === w.careName;
    });
    if (matched) proofUploaded++;
  }

  return {
    warningsSent: monthlyWarnings.length,
    proofUploaded,
    emailsOpened,
    linksClicked,
    monthLabel,
  };
}

export interface SendWarningInput {
  tenantId: string;
  animalId: string;
  animalName?: string;
  itemId: string;
  itemKey?: string;
  careName: string;
  dueDate: string;
  adopterName: string;
  adopterEmail: string;
  adopterPhone: string | null;
  channels: ('email' | 'sms')[];
  triggeredBy: string | null; // user id; null = system/cron
  trigger: 'automatic' | 'manual';
}

export interface SendWarningResult {
  success: boolean;
  channelsSent: ('email' | 'sms')[];
  email?: { ok: boolean; error?: string };
  sms?: { ok: boolean; error?: string };
  warningId?: string;
  deadlineDate: string;
  reason?: string;
}

/**
 * Send a single compliance warning. Caller is responsible for verifying
 * eligibility (overdue ≥14d, no proof, no recent warning) — this function
 * just performs the send + audit.
 *
 * Adopter notification opt-outs are intentionally bypassed because this is a
 * transactional contract-enforcement notice.
 */
export async function sendComplianceWarning(input: SendWarningInput): Promise<SendWarningResult> {
  const [tenant] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      subdomain: tenants.subdomain,
      customDomain: tenants.customDomain,
    })
    .from(tenants)
    .where(eq(tenants.id, input.tenantId))
    .limit(1);

  if (!tenant) {
    return {
      success: false,
      channelsSent: [],
      deadlineDate: '',
      reason: 'Tenant not found',
    };
  }

  const deadline = new Date();
  deadline.setHours(0, 0, 0, 0);
  deadline.setDate(deadline.getDate() + WARNING_DEADLINE_DAYS);
  const deadlineStr = deadline.toISOString().split('T')[0];
  const deadlineDisplay = formatDeadlineDate(deadline);

  let dogName = input.animalName;
  if (!dogName) {
    const [a] = await db
      .select({ name: animals.name })
      .from(animals)
      .where(eq(animals.id, input.animalId))
      .limit(1);
    dogName = a?.name || 'your dog';
  }

  const tokens: WarningTokens = {
    rescueName: tenant.name,
    adopterFirstName: input.adopterName.split(' ')[0] || input.adopterName,
    dogName,
    deadlineDate: deadlineDisplay,
    portalLink: buildAdopterPortalUrl(tenant, input.animalId),
  };

  const tpl = await getEffectiveTemplate(input.tenantId);
  const emailSubject = renderWarningTemplate(tpl.emailSubject, tokens);
  const emailBodyText = renderWarningTemplate(tpl.emailBody, tokens);
  const smsBody = renderWarningTemplate(tpl.smsBody, tokens);

  const wantEmail = input.channels.includes('email') && !!input.adopterEmail;
  const wantSms = input.channels.includes('sms') && !!input.adopterPhone;

  // Strict pre-validation: if the caller explicitly asked for a channel that
  // the adopter has no contact info for, refuse before sending anything. This
  // surfaces user errors clearly instead of silently dropping a channel.
  if (input.channels.includes('email') && !input.adopterEmail) {
    return {
      success: false,
      channelsSent: [],
      deadlineDate: deadlineStr,
      reason: 'Adopter has no email on file',
    };
  }
  if (input.channels.includes('sms') && !input.adopterPhone) {
    return {
      success: false,
      channelsSent: [],
      deadlineDate: deadlineStr,
      reason: 'Adopter has no phone on file',
    };
  }
  if (!wantEmail && !wantSms) {
    return {
      success: false,
      channelsSent: [],
      deadlineDate: deadlineStr,
      reason: 'No channels selected',
    };
  }

  // Generate a tracking token up-front so we can embed it in the rendered
  // email (pixel + wrapped portal link). We MUST persist a row containing the
  // token before sending the email; otherwise an aggressive image proxy
  // (e.g. Gmail's) can prefetch the pixel during the milliseconds between
  // emailService.send() returning and the audit insert completing, and we
  // would silently lose the very first open we care about most.
  const trackingToken = crypto.randomBytes(16).toString('base64url');

  // Pre-insert a placeholder audit row when we plan to send email so the
  // tracking endpoints can resolve the token immediately. We DELETE the
  // placeholder later if no channel ultimately delivers (so the 30-day dedup
  // doesn't suppress a legitimate retry).
  let pendingWarningId: string | undefined;
  if (wantEmail) {
    const [pending] = await db.insert(adopterComplianceWarnings).values({
      tenantId: input.tenantId,
      animalId: input.animalId,
      itemId: input.itemId,
      itemKey: input.itemKey || `parasite_prevention:${input.careName}`,
      careName: input.careName,
      dueDate: input.dueDate,
      deadlineDate: deadlineStr,
      // Empty until we know what actually delivered — this is the signal that
      // the row is in flight.
      channelsUsed: [],
      trigger: input.trigger,
      triggeredBy: input.triggeredBy,
      adopterEmail: input.adopterEmail || null,
      trackingToken,
    }).returning({ id: adopterComplianceWarnings.id });
    pendingWarningId = pending?.id;
  }

  const result: SendWarningResult = {
    success: false,
    channelsSent: [],
    deadlineDate: deadlineStr,
  };

  // Insert the audit row BEFORE sending so the tracking pixel and tracked
  // upload-link URLs in the email reference a row that already exists. This
  // closes a race where an extremely fast image prefetch / click (some
  // mailbox providers prefetch within milliseconds) would arrive at the
  // tracking endpoints before the row was persisted, silently missing the
  // first-write stamp. We mark channelsUsed=[] for now and update the row
  // after the actual send completes; if every channel fails we delete the
  // row so the 30-day dedup doesn't suppress a legitimate retry later.
  const warningId = crypto.randomUUID();
  await db.insert(adopterComplianceWarnings).values({
    id: warningId,
    tenantId: input.tenantId,
    animalId: input.animalId,
    itemId: input.itemId,
    itemKey: input.itemKey || `parasite_prevention:${input.careName}`,
    careName: input.careName,
    dueDate: input.dueDate,
    deadlineDate: deadlineStr,
    channelsUsed: [],
    trigger: input.trigger,
    triggeredBy: input.triggeredBy,
    adopterEmail: input.adopterEmail || null,
  });

  if (wantEmail) {
    const emailService = await EmailService.forTenant(input.tenantId);
    if (!emailService) {
      result.email = { ok: false, error: 'Email service is not configured for this organization' };
    } else {
      try {
        const html = buildEmailHtml({
          tenantName: tenant.name,
          subject: emailSubject,
          bodyText: emailBodyText,
          portalLink: tokens.portalLink,
          deadlineDisplay,
          trackedClickUrl: buildTrackedClickUrl(warningId),
          trackingPixelUrl: buildTrackingPixelUrl(warningId),
        });
        const sendRes = await emailService.send({
          to: input.adopterEmail,
          subject: emailSubject,
          html,
        });
        if (sendRes.success) {
          result.email = { ok: true };
          result.channelsSent.push('email');
        } else {
          result.email = { ok: false, error: sendRes.error || 'Email send failed' };
        }
      } catch (err: any) {
        result.email = { ok: false, error: err?.message || 'Email send threw' };
      }
    }
  }

  if (wantSms) {
    const enabled = await isTwilioEnabled(input.tenantId);
    if (!enabled) {
      result.sms = { ok: false, error: 'SMS is not configured for this organization' };
    } else {
      try {
        const smsRes = await sendSms(
          input.tenantId,
          input.adopterPhone!,
          smsBody,
          'notification',
          {
            relatedAnimalId: input.animalId,
            // Contract-enforcement notice: bypass quiet hours and skip the
            // duplicate org prefix (the rendered SMS body already includes the
            // rescue name from the {{rescueName}} merge token).
            bypassQuietHours: true,
            skipOrgPrefix: true,
          },
        );
        if (smsRes.status === 'failed') {
          result.sms = { ok: false, error: smsRes.error || 'SMS send failed' };
        } else {
          result.sms = { ok: true };
          result.channelsSent.push('sms');
        }
      } catch (err: any) {
        result.sms = { ok: false, error: err?.message || 'SMS send threw' };
      }
    }
  }

  result.success = result.channelsSent.length > 0;

  // Audit row reconciliation:
  //  - If we pre-inserted a placeholder (email path) and at least one channel
  //    delivered, UPDATE it with the final delivery details.
  //  - If we pre-inserted a placeholder but nothing delivered, DELETE it so
  //    the 30-day dedup doesn't suppress a legitimate retry.
  //  - If we did NOT pre-insert (SMS-only path) and SMS delivered, INSERT a
  //    fresh row now (no tracking token needed for SMS-only).
  if (result.success && pendingWarningId) {
    await db.update(adopterComplianceWarnings)
      .set({
        channelsUsed: result.channelsSent,
        recipientEmail: result.email?.ok ? input.adopterEmail : null,
        recipientPhone: result.sms?.ok ? input.adopterPhone : null,
        emailSubject: result.email?.ok ? emailSubject : null,
        emailBody: result.email?.ok ? emailBodyText : null,
        smsBody: result.sms?.ok ? smsBody : null,
        // Clear the token if the email did not actually send so a stray pixel
        // fetch doesn't get attributed to anything (pixel still 200s with
        // a transparent GIF — see tracking endpoint).
        trackingToken: result.email?.ok ? trackingToken : null,
      })
      .where(eq(adopterComplianceWarnings.id, pendingWarningId));
    result.warningId = pendingWarningId;
  } else if (!result.success && pendingWarningId) {
    await db.delete(adopterComplianceWarnings)
      .where(eq(adopterComplianceWarnings.id, pendingWarningId));
  } else if (result.success && !pendingWarningId) {
    const [inserted] = await db.insert(adopterComplianceWarnings).values({
      id: warningId,
      tenantId: input.tenantId,
      animalId: input.animalId,
      itemId: input.itemId,
      itemKey: input.itemKey || `parasite_prevention:${input.careName}`,
      careName: input.careName,
      dueDate: input.dueDate,
      deadlineDate: deadlineStr,
      channelsUsed: result.channelsSent,
      trigger: input.trigger,
      triggeredBy: input.triggeredBy,
      adopterEmail: input.adopterEmail || null,
      recipientEmail: result.email?.ok ? input.adopterEmail : null,
      recipientPhone: result.sms?.ok ? input.adopterPhone : null,
      emailSubject: result.email?.ok ? emailSubject : null,
      emailBody: result.email?.ok ? emailBodyText : null,
      smsBody: result.sms?.ok ? smsBody : null,
      trackingToken: null,
    }).returning({ id: adopterComplianceWarnings.id });
    result.warningId = inserted?.id;
  }

  if (result.success) {

    // Also write into the unified adopter_notification_logs audit trail so the
    // existing dashboards / reports surface this delivery alongside other
    // compliance notifications. We only insert when we can resolve an adopter
    // user (the column is NOT NULL); if the adopter does not have a portal
    // account yet, the dedicated adopterComplianceWarnings row above is the
    // sole audit record.
    try {
      const adopterUserRow = input.adopterEmail
        ? (await db
            .select({ id: users.id })
            .from(users)
            .where(and(
              eq(users.tenantId, input.tenantId),
              sql`LOWER(${users.email}) = LOWER(${input.adopterEmail})`,
            ))
            .limit(1))[0]
        : undefined;

      if (adopterUserRow?.id) {
        const baseLog = {
          tenantId: input.tenantId,
          userId: adopterUserRow.id,
          animalId: input.animalId,
          notificationType: 'compliance_warning' as const,
          itemId: input.itemId,
        };
        if (result.email?.ok) {
          await db.insert(adopterNotificationLogs).values({
            ...baseLog,
            channel: 'email',
            subject: emailSubject,
            message: emailBodyText,
          });
        }
        if (result.sms?.ok) {
          await db.insert(adopterNotificationLogs).values({
            ...baseLog,
            channel: 'sms',
            message: smsBody,
          });
        }
      }
    } catch (logErr) {
      console.error('[ComplianceWarning] Failed to write adopter_notification_logs row:', logErr);
    }
  } else {
    // Every channel failed — remove the placeholder row so a retry isn't
    // suppressed by the 30-day dedup logic. Tracking pixel hits arriving
    // after this delete are silently no-ops, which is the correct behavior
    // (the email never actually went out).
    try {
      await db
        .delete(adopterComplianceWarnings)
        .where(eq(adopterComplianceWarnings.id, warningId));
    } catch (delErr) {
      console.error('[ComplianceWarning] Failed to clean up placeholder warning row:', delErr);
    }
    result.reason = [
      result.email?.error && `Email: ${result.email.error}`,
      result.sms?.error && `SMS: ${result.sms.error}`,
    ].filter(Boolean).join(' | ') || 'No deliverable channels';
  }

  return result;
}

/**
 * Renders the warning email subject + body and SMS body for a given
 * candidate without sending anything. Used by the manual "Preview before send"
 * confirmation dialog so staff can see exactly what the adopter will receive.
 */
export async function previewWarning(input: {
  tenantId: string;
  animalId: string;
  animalName?: string;
  adopterName: string;
}): Promise<{
  emailSubject: string;
  emailBody: string;
  smsBody: string;
  deadlineDate: string;
  deadlineDisplay: string;
  isCustomTemplate: boolean;
  portalLink: string;
}> {
  const [tenant] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      subdomain: tenants.subdomain,
      customDomain: tenants.customDomain,
    })
    .from(tenants)
    .where(eq(tenants.id, input.tenantId))
    .limit(1);

  if (!tenant) throw new Error('Tenant not found');

  const deadline = new Date();
  deadline.setHours(0, 0, 0, 0);
  deadline.setDate(deadline.getDate() + WARNING_DEADLINE_DAYS);
  const deadlineDate = deadline.toISOString().split('T')[0];
  const deadlineDisplay = formatDeadlineDate(deadline);

  let dogName = input.animalName;
  if (!dogName) {
    const [a] = await db
      .select({ name: animals.name })
      .from(animals)
      .where(eq(animals.id, input.animalId))
      .limit(1);
    dogName = a?.name || 'your dog';
  }

  const tokens: WarningTokens = {
    rescueName: tenant.name,
    adopterFirstName: input.adopterName.split(' ')[0] || input.adopterName,
    dogName,
    deadlineDate: deadlineDisplay,
    portalLink: buildAdopterPortalUrl(tenant, input.animalId),
  };

  const tpl = await getEffectiveTemplate(input.tenantId);
  return {
    emailSubject: renderWarningTemplate(tpl.emailSubject, tokens),
    emailBody: renderWarningTemplate(tpl.emailBody, tokens),
    smsBody: renderWarningTemplate(tpl.smsBody, tokens),
    deadlineDate,
    deadlineDisplay,
    isCustomTemplate: tpl.isCustom,
    portalLink: tokens.portalLink,
  };
}

function buildEmailHtml(args: {
  tenantName: string;
  subject: string;
  bodyText: string;
  portalLink: string;
  deadlineDisplay: string;
  trackedClickUrl?: string;   // Wraps the upload-link CTA when provided.
  trackingPixelUrl?: string;  // 1x1 GIF appended to body when provided.
}): string {
  // Replace the literal portal link inside the body text (it was rendered from
  // the {{portalLink}} merge token) with the tracked redirect URL so any
  // adopter who clicks through gets attributed to the warning. Falls back to
  // the bare portal link if tracking isn't configured.
  const linkInBody = args.trackedClickUrl || args.portalLink;
  const ctaHref = args.trackedClickUrl || args.portalLink;

  const bodyForEmail = args.bodyText.split(args.portalLink).join(linkInBody);

  const escaped = bodyForEmail
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const paragraphs = escaped.split(/\n\s*\n/).map(p =>
    `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#374151;">${p.replace(/\n/g, '<br>')}</p>`,
  ).join('');

  // Open-tracking pixel: 1x1 transparent GIF served by the public tracking
  // endpoint. Width/height/alt attributes mimic standard mailing-platform
  // pixels so most email clients won't block it as suspicious.
  const trackingPixel = args.trackingPixelUrl
    ? `<img src="${args.trackingPixelUrl}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;opacity:0;" />`
    : '';

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111827;background:#ffffff;">
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:20px;">
    <p style="margin:0;font-size:13px;font-weight:600;color:#b91c1c;letter-spacing:0.06em;text-transform:uppercase;">Adoption Contract Notice</p>
    <p style="margin:6px 0 0 0;font-size:13px;color:#7f1d1d;">Action required by ${args.deadlineDisplay}</p>
  </div>
  ${paragraphs}
  <div style="text-align:center;margin:28px 0;">
    <a href="${ctaHref}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;">
      Upload Proof in Adopter Portal
    </a>
  </div>
  <p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:32px;">
    This is a transactional contract-enforcement notice from ${args.tenantName} and is not affected by your marketing notification preferences.
  </p>
  ${trackingPixel}
</div>`.trim();
}

export interface RunWarningsResult {
  tenantId: string;
  candidatesEvaluated: number;
  warningsSent: number;
  errors: string[];
}

export async function runComplianceWarningsForTenant(
  tenantId: string,
): Promise<RunWarningsResult> {
  const result: RunWarningsResult = { tenantId, candidatesEvaluated: 0, warningsSent: 0, errors: [] };
  try {
    const candidates = await findEligibleHeartwormWarnings(tenantId);
    result.candidatesEvaluated = candidates.length;

    for (const c of candidates) {
      // 30-day dedup: skip if already warned for this exact item
      if (c.warningsInLast30Days > 0) continue;

      // Need at least one usable channel — email is required (we always have it)
      // and SMS is opportunistic when phone exists + Twilio is configured.
      const channels: ('email' | 'sms')[] = ['email'];
      if (c.adopterPhone) channels.push('sms');

      try {
        const r = await sendComplianceWarning({
          tenantId,
          animalId: c.animalId,
          animalName: c.animalName,
          itemId: c.itemId,
          itemKey: `parasite_prevention:${c.careName}`,
          careName: c.careName,
          dueDate: c.dueDate,
          adopterName: c.adopterName,
          adopterEmail: c.adopterEmail,
          adopterPhone: c.adopterPhone,
          channels,
          triggeredBy: null,
          trigger: 'automatic',
        });

        if (r.success) {
          result.warningsSent++;
          console.log(`[ComplianceWarning] Sent to ${c.adopterEmail} for ${c.animalName}/${c.careName} (channels: ${r.channelsSent.join(',')})`);
        } else if (r.reason) {
          result.errors.push(`${c.animalName}/${c.careName}: ${r.reason}`);
        }
      } catch (err) {
        result.errors.push(`${c.animalName}/${c.careName}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }
  } catch (err) {
    result.errors.push(`Tenant ${tenantId}: ${err instanceof Error ? err.message : 'Unknown'}`);
  }
  return result;
}

export async function runComplianceWarningsForAllTenants(): Promise<{
  tenantsProcessed: number;
  totalSent: number;
  errors: string[];
}> {
  const activeTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.isActive, true));

  let totalSent = 0;
  const errors: string[] = [];
  for (const t of activeTenants) {
    try {
      const r = await runComplianceWarningsForTenant(t.id);
      totalSent += r.warningsSent;
      errors.push(...r.errors);
    } catch (err) {
      errors.push(`Tenant ${t.id}: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }
  return { tenantsProcessed: activeTenants.length, totalSent, errors };
}

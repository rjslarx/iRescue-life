import { Router, type Request, type Response, type NextFunction } from 'express';
import { and, eq, like, sql } from 'drizzle-orm';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { db } from '../db';
import { donors, platformSettings, subscriptions, tenants } from '@shared/schema';
import { requireAuth } from '../middleware/auth';
import { requirePlatformAdmin } from '../middleware/tenant';
import { authVipDonor, signVipToken, buildVipPortalUrl } from './vipPortal';
import { hasGameMembership, canPlayVipGame } from '../lib/vip-game-policy';
import { vipGameDocument } from '../services/vip-game-document';
import { EmailService } from '../lib/email-service';
import { createTeamGameRouter } from '../lib/team-game-router';
import { rescuePackInvitation } from '../lib/rescue-pack-invitation';

const prefix = 'vip_game_pilot:';
const configKey = (tenantId: string) => `${prefix}${tenantId}:config`;
const inviteKey = (tenantId: string, donorId: string) => `${prefix}${tenantId}:invite:${donorId}`;
const statsKey = (tenantId: string, donorId: string) => `${prefix}${tenantId}:stats:${donorId}`;
const uuid = z.string().uuid();
const gameIdSchema = z.enum(['pasture-run', 'rescue-shuffle', 'rescue-triple-match', 'rescue-merge']).default('pasture-run');
const wrap = (fn: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    Promise.resolve(fn(req, res)).catch(error => {
      if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid request', details: error.flatten() });
      next(error);
    });
  };

async function setting(key: string) {
  const [row] = await db.select({ value: platformSettings.value }).from(platformSettings)
    .where(eq(platformSettings.key, key)).limit(1);
  return row?.value;
}

async function save(key: string, value: unknown, userId: string) {
  await db.insert(platformSettings).values({
    key, value, category: 'features', isPublic: false, updatedBy: userId,
    description: 'Private Rescue Pack game pilot',
  }).onConflictDoUpdate({ target: platformSettings.key,
    set: { value, isPublic: false, updatedBy: userId, updatedAt: new Date() } });
}

async function donorSubs(tenantId: string, donorId: string) {
  return db.select({ status: subscriptions.status, currentPeriodEnd: subscriptions.currentPeriodEnd })
    .from(subscriptions).where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.donorId, donorId)));
}

async function eligible(tenantId: string, donorId: string) {
  const [config, invite, subs] = await Promise.all([
    setting(configKey(tenantId)), setting(inviteKey(tenantId, donorId)), donorSubs(tenantId, donorId),
  ]);
  return canPlayVipGame(config?.enabled === true, invite?.invited === true, subs);
}

export const adminGameRouter = Router();
adminGameRouter.use(requireAuth, requirePlatformAdmin);
adminGameRouter.use((req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)
      && (req.get('sec-fetch-site') === 'cross-site' || !req.is('application/json'))) {
    return res.status(403).json({ error: 'Same-site JSON request required' });
  }
  next();
});
adminGameRouter.use(rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false }));

adminGameRouter.get('/', wrap(async (_req, res) => {
  const [tenantRows, rows] = await Promise.all([
    db.select({ id: tenants.id, name: tenants.name }).from(tenants).orderBy(tenants.name),
    db.select({ key: platformSettings.key, value: platformSettings.value }).from(platformSettings)
      .where(like(platformSettings.key, `${prefix}%`)),
  ]);
  res.json({ tenants: tenantRows.map(tenant => {
    const relevant = rows.filter(row => row.key.startsWith(`${prefix}${tenant.id}:`));
    const stats = relevant.filter(row => row.key.includes(':stats:')).map(row => row.value);
    return { ...tenant,
      enabled: relevant.find(row => row.key === configKey(tenant.id))?.value?.enabled === true,
      invitedCount: relevant.filter(row => row.key.includes(':invite:') && row.value?.invited === true).length,
      starts: stats.reduce((n, s) => n + (Number(s.starts) || 0), 0),
      players: stats.length,
      returningPlayers: stats.filter(s => s.returning === true).length,
    };
  }) });
}));

adminGameRouter.post('/preview', wrap(async (req, res) => {
  const { gameId, tenantId } = z.object({ gameId: gameIdSchema, tenantId: uuid.optional() }).parse(req.body);
  if (gameId !== 'pasture-run' && !tenantId) return res.status(400).json({ error: 'Select a rescue to preview its animal game.' });
  res.json({ html: await vipGameDocument(gameId, tenantId) });
}));

adminGameRouter.get('/:tenantId', wrap(async (req, res) => {
  const tenantId = uuid.parse(req.params.tenantId);
  const [config, rows] = await Promise.all([
    setting(configKey(tenantId)),
    db.select({ key: platformSettings.key, value: platformSettings.value }).from(platformSettings)
      .where(like(platformSettings.key, `${prefix}${tenantId}:invite:%`)),
  ]);
  const invitations = [];
  for (const row of rows) {
    if (row.value?.invited !== true) continue;
    const donorId = row.key.split(':').at(-1)!;
    const [donor] = await db.select({ donorId: donors.id, name: donors.name, email: donors.email })
      .from(donors).where(and(eq(donors.id, donorId), eq(donors.tenantId, tenantId)));
    if (donor) invitations.push({ ...donor, eligible: hasGameMembership(await donorSubs(tenantId, donorId)) });
  }
  res.json({ enabled: config?.enabled === true, invitations });
}));

adminGameRouter.put('/:tenantId', wrap(async (req, res) => {
  const tenantId = uuid.parse(req.params.tenantId);
  const value = z.object({ enabled: z.boolean() }).strict().parse(req.body);
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) return res.status(404).json({ error: 'Rescue not found' });
  await save(configKey(tenantId), value, req.user!.id);
  res.json(value);
}));

adminGameRouter.post('/:tenantId/invitations', wrap(async (req, res) => {
  const tenantId = uuid.parse(req.params.tenantId);
  const { email } = z.object({ email: z.string().trim().email().max(254) }).parse(req.body);
  const [donor] = await db.select().from(donors).where(and(eq(donors.tenantId, tenantId),
    sql`lower(${donors.email}) = ${email.toLowerCase()}`)).limit(1);
  if (!donor || !hasGameMembership(await donorSubs(tenantId, donor.id))) {
    return res.status(400).json({ error: 'Use an existing Rescue Pack donor email with an active, current paid membership at this rescue.' });
  }
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) return res.status(404).json({ error: 'Rescue not found' });
  if ((await setting(configKey(tenantId)))?.enabled !== true) {
    return res.status(400).json({ error: 'Enable this rescue’s private pilot before inviting a member.' });
  }
  await save(inviteKey(tenantId, donor.id), { invited: true }, req.user!.id);
  let sent = false;
  try {
    const service = await EmailService.forTenant(tenantId);
    if (service) {
      const link = buildVipPortalUrl(tenant, signVipToken(donor.id, tenantId));
      const result = await service.send({
        to: donor.email,
        ...rescuePackInvitation(tenant.name, link),
      });
      sent = result.success;
    }
  } catch {
    // Preserve the invitation and explicitly report delivery failure for retry.
  }
  res.json({ sent, message: sent ? 'Invitation sent.' : 'Access granted, but the invitation email could not be sent. Retry to resend, or ask the member to request their existing Rescue Pack access link.' });
}));

adminGameRouter.delete('/:tenantId/invitations/:donorId', wrap(async (req, res) => {
  const tenantId = uuid.parse(req.params.tenantId);
  const donorId = uuid.parse(req.params.donorId);
  await save(inviteKey(tenantId, donorId), { invited: false }, req.user!.id);
  res.sendStatus(204);
}));

export const memberGameRouter = Router();
export const teamGameRouter = createTeamGameRouter({
  requireAuth,
  enabled: async tenantId => (await setting(configKey(tenantId)))?.enabled === true,
  document: vipGameDocument,
});
memberGameRouter.use(rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: 'draft-7', legacyHeaders: false }));
memberGameRouter.get('/access', wrap(async (req, res) => {
  const auth = await authVipDonor(req, res);
  if (!auth) return;
  res.json({ eligible: await eligible(auth.tenantId, auth.donorId) });
}));
memberGameRouter.post('/launch', wrap(async (req, res) => {
  const auth = await authVipDonor(req, res);
  if (!auth) return;
  if (!await eligible(auth.tenantId, auth.donorId)) return res.status(403).json({ error: 'This private perk is not available for this membership.' });
  res.json({ html: await vipGameDocument(gameIdSchema.parse(req.query.gameId), auth.tenantId) });
}));
memberGameRouter.post('/start', wrap(async (req, res) => {
  gameIdSchema.parse(req.query.gameId);
  const auth = await authVipDonor(req, res);
  if (!auth) return;
  if (!await eligible(auth.tenantId, auth.donorId)) return res.status(403).json({ error: 'Game access ended.' });
  const today = new Date().toISOString().slice(0, 10);
  // One private row per donor; no play-event history or publicly exposed donor IDs.
  // Atomic upsert preserves counts when requests overlap.
  await db.insert(platformSettings).values({
    key: statsKey(auth.tenantId, auth.donorId), category: 'features', isPublic: false,
    value: { starts: 1, lastDay: today, returning: false },
  }).onConflictDoUpdate({ target: platformSettings.key,
    set: { updatedAt: new Date(), value: sql`jsonb_build_object(
      'starts', COALESCE((${platformSettings.value}->>'starts')::integer, 0) + 1,
      'lastDay', ${today}::text,
      'returning', COALESCE((${platformSettings.value}->>'returning')::boolean, false)
        OR (${platformSettings.value}->>'lastDay') IS DISTINCT FROM ${today}::text)` } });
  res.sendStatus(204);
}));

import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import type { VipGameId } from '@shared/vip-games';

const teamRoles = new Set(['owner', 'admin', 'board_member', 'staff', 'volunteer']);
const gameId = z.enum(['pasture-run', 'rescue-shuffle', 'rescue-triple-match', 'rescue-merge']).default('pasture-run');

/** Session authentication loads only active users; never trust a requested tenant or role. */
export function createTeamGameRouter(deps: {
  requireAuth: RequestHandler;
  enabled: (tenantId: string) => Promise<boolean>;
  document: (game: VipGameId, tenantId: string) => Promise<string>;
}) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  router.use(deps.requireAuth);
  router.use((req, res, next) => {
    if (!req.tenant || req.user?.tenantId !== req.tenant.id
      || !req.user.roles.some(role => teamRoles.has(role))) {
      return res.status(403).json({ error: 'Games are available to this rescue’s staff and volunteers only.' });
    }
    if (req.method === 'POST' && (req.get('sec-fetch-site') === 'cross-site' || !req.is('application/json'))) {
      return res.status(403).json({ error: 'Same-site JSON request required' });
    }
    next();
  });
  router.use(rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: 'draft-7', legacyHeaders: false }));
  router.get('/access', async (req, res, next) => {
    try {
      res.json({ eligible: await deps.enabled(req.tenant!.id) });
    } catch (error) { next(error); }
  });
  for (const action of ['launch', 'start'] as const) {
    router.post(`/${action}`, async (req, res, next) => {
      try {
        const selectedGame = gameId.parse(req.query.gameId);
        const tenantId = req.tenant!.id;
        if (!await deps.enabled(tenantId)) {
          return res.status(403).json({ error: 'Games are not enabled for this rescue.' });
        }
        if (action === 'launch') {
          return res.json({ html: await deps.document(selectedGame, tenantId) });
        }
        // Team play is not donor engagement; do not write to VIP donor statistics.
        res.sendStatus(204);
      } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid game' });
        next(error);
      }
    });
  }
  return router;
}

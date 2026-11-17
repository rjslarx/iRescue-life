import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { publicPuzzleSettingsSchema, publicPuzzleTenant, type PublicPuzzleSettings } from './public-puzzle-policy';

export function createPublicPuzzleRouter(deps: {
  requireAuth: RequestHandler;
  read: (tenantId: string) => Promise<PublicPuzzleSettings>;
  save: (tenantId: string, value: PublicPuzzleSettings, userId: string) => Promise<void>;
  launch: (tenantId: string, resume?: { petId: string | null; photoVersion: string | null }) => Promise<{ html: string; pet: unknown; photoVersion?: string | null }>;
}) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  router.use((req, res, next) => {
    if (!publicPuzzleTenant(req.tenant?.subdomain)) return res.status(404).json({ error: 'Public puzzle not available for this rescue.' });
    if (!['GET', 'HEAD'].includes(req.method) && (req.get('sec-fetch-site') === 'cross-site' || !req.is('application/json'))) {
      return res.status(403).json({ error: 'Same-site JSON request required.' });
    }
    next();
  });
  router.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }));
  router.get('/access', async (req, res, next) => {
    try { res.json({ ...await deps.read(req.tenant!.id), rescueName: req.tenant!.name }); }
    catch (error) { next(error); }
  });
  router.post('/launch', rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false }), async (req, res, next) => {
    try {
      // This endpoint can only generate this puzzle, never a caller-selected game.
      const input = z.object({ resume: z.object({
        petId: z.string().min(1).max(100).nullable(),
        photoVersion: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
      }).strict().optional() }).strict().safeParse(req.body ?? {});
      if (Object.keys(req.query).length || !input.success) return res.status(400).json({ error: 'Unexpected puzzle parameters.' });
      const config = await deps.read(req.tenant!.id);
      if (!config.enabled) return res.status(403).json({ error: 'The public puzzle is paused. Please check back later.' });
      const game = await deps.launch(req.tenant!.id, input.data.resume);
      if (input.data.resume && ((game.pet as { id?: string } | null)?.id ?? null) !== input.data.resume.petId ||
          input.data.resume && (game.photoVersion ?? null) !== input.data.resume.photoVersion) {
        return res.status(409).json({ error: 'That saved puzzle photo is no longer available. Please start a new puzzle.' });
      }
      if (!(await deps.read(req.tenant!.id)).enabled) return res.status(403).json({ error: 'The public puzzle is paused.' });
      res.json({ ...config, ...game, rescueName: req.tenant!.name });
    } catch (error) { next(error); }
  });
  router.use('/settings', deps.requireAuth, (req, res, next) => {
    if (req.user?.tenantId !== req.tenant!.id || !req.user.roles.some(role => role === 'owner' || role === 'admin')) {
      return res.status(403).json({ error: 'Only this rescue’s owner or administrator can manage its public puzzle.' });
    }
    next();
  });
  router.get('/settings', async (req, res, next) => {
    try { res.json({ ...await deps.read(req.tenant!.id), rescueName: req.tenant!.name }); }
    catch (error) { next(error); }
  });
  router.put('/settings', async (req, res, next) => {
    try {
      const config = publicPuzzleSettingsSchema.parse(req.body);
      await deps.save(req.tenant!.id, config, req.user!.id);
      res.json({ ...config, rescueName: req.tenant!.name });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid settings.' });
      next(error);
    }
  });
  return router;
}

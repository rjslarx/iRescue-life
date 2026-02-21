import { Router } from 'express';
import { z } from 'zod';
import { BroadcastService } from '../services/broadcast-service';
import { isTwilioEnabled } from '../lib/twilio-service';
import { PushNotificationService } from '../services/push-notifications';
import { insertBroadcastTemplateSchema } from '@shared/schema';

const router = Router();

const requireTenant = (req: any, res: any, next: any) => {
  if (!req.tenant) {
    return res.status(400).json({ error: 'Tenant context required' });
  }
  next();
};

const requireAuth = (req: any, res: any, next: any) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

const requireAdmin = (req: any, res: any, next: any) => {
  const adminRoles = ['admin', 'platform_admin'];
  if (!req.user?.roles?.some((role: string) => adminRoles.includes(role))) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

router.post('/send', requireTenant, requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const schema = z.object({
      title: z.string().min(1).max(100),
      message: z.string().min(1).max(500),
      channels: z.array(z.enum(['push', 'sms', 'email'])).min(1),
      targetRoles: z.array(z.enum(['admin', 'board_member', 'staff', 'foster', 'volunteer'])).optional(),
      targetUserIds: z.array(z.string().uuid()).optional(),
      templateId: z.string().uuid().optional(),
    });

    const data = schema.parse(req.body);

    if (!data.targetRoles?.length && !data.targetUserIds?.length) {
      return res.status(400).json({ error: 'Either targetRoles or targetUserIds must be provided' });
    }

    const result = await BroadcastService.sendBroadcast({
      tenantId: req.tenant!.id,
      title: data.title,
      message: data.message,
      channels: data.channels,
      targetRoles: data.targetRoles,
      targetUserIds: data.targetUserIds,
      templateId: data.templateId,
      sentBy: { id: req.user!.id, name: req.user!.fullName },
    });

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

router.get('/', requireTenant, requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const broadcasts = await BroadcastService.getBroadcasts(req.tenant!.id, limit);
    res.json(broadcasts);
  } catch (error) {
    next(error);
  }
});

router.get('/status', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const [twilioEnabled, pushConfigured] = await Promise.all([
      isTwilioEnabled(req.tenant!.id),
      Promise.resolve(PushNotificationService.isConfigured()),
    ]);

    res.json({
      push: { available: pushConfigured },
      sms: { available: twilioEnabled },
      email: { available: false },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/recipients', requireTenant, requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const rolesParam = req.query.roles as string | undefined;
    const roles = rolesParam ? rolesParam.split(',') as any[] : undefined;
    
    const users = await BroadcastService.getTargetableUsers(req.tenant!.id, roles);
    res.json(users);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requireTenant, requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const broadcast = await BroadcastService.getBroadcastById(req.tenant!.id, req.params.id);
    if (!broadcast) {
      return res.status(404).json({ error: 'Broadcast not found' });
    }
    res.json(broadcast);
  } catch (error) {
    next(error);
  }
});

router.get('/templates/list', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const templates = await BroadcastService.getTemplates(req.tenant!.id);
    res.json(templates);
  } catch (error) {
    next(error);
  }
});

router.post('/templates', requireTenant, requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100),
      category: z.enum(['urgent', 'event', 'reminder', 'general']),
      subject: z.string().min(1).max(100),
      body: z.string().min(1).max(500),
      channels: z.array(z.enum(['push', 'sms', 'email'])).min(1),
      targetRoles: z.array(z.enum(['admin', 'board_member', 'staff', 'foster', 'volunteer'])).optional(),
    });

    const data = schema.parse(req.body);

    const template = await BroadcastService.createTemplate(req.tenant!.id, {
      ...data,
      createdBy: req.user!.id,
    });

    res.status(201).json(template);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

router.patch('/templates/:id', requireTenant, requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100).optional(),
      category: z.enum(['urgent', 'event', 'reminder', 'general']).optional(),
      subject: z.string().min(1).max(100).optional(),
      body: z.string().min(1).max(500).optional(),
      channels: z.array(z.enum(['push', 'sms', 'email'])).min(1).optional(),
      targetRoles: z.array(z.enum(['admin', 'board_member', 'staff', 'foster', 'volunteer'])).optional(),
      isActive: z.boolean().optional(),
    });

    const data = schema.parse(req.body);

    const template = await BroadcastService.updateTemplate(req.tenant!.id, req.params.id, data);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

router.delete('/templates/:id', requireTenant, requireAuth, requireAdmin, async (req, res, next) => {
  try {
    await BroadcastService.deleteTemplate(req.tenant!.id, req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post('/templates/seed-defaults', requireTenant, requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const templates = await BroadcastService.seedDefaultTemplates(req.tenant!.id);
    if (templates.length === 0) {
      return res.json({ message: 'Templates already exist', created: 0 });
    }
    res.json({ message: 'Default templates created', created: templates.length, templates });
  } catch (error) {
    next(error);
  }
});

export default router;

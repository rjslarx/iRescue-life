import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { VolunteerThresholdAlertService } from "../services/volunteer-threshold-alerts";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

const createAlertSchema = z.object({
  name: z.string().min(1).max(100),
  isEnabled: z.boolean().optional().default(true),
  minimumVolunteers: z.number().int().min(1).optional().default(2),
  daysAhead: z.number().int().min(1).max(30).optional().default(3),
  pushEnabled: z.boolean().optional().default(true),
  smsEnabled: z.boolean().optional().default(false),
  emailEnabled: z.boolean().optional().default(true),
  targetAllVolunteers: z.boolean().optional().default(true),
  targetRoles: z.array(z.enum(["admin", "staff", "volunteer", "foster", "board_member"])).optional(),
  calendarIds: z.array(z.string().uuid()).optional(),
  checkTime: z.string().regex(/^\d{2}:\d{2}$/).optional().default("09:00"),
  daysOfWeek: z.array(z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"])).optional().default(["mon", "tue", "wed", "thu", "fri"]),
  messageTemplate: z.string().max(500).optional(),
});

const updateAlertSchema = createAlertSchema.partial();

router.get('/', requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;
    const alerts = await VolunteerThresholdAlertService.getTenantAlerts(tenantId);
    res.json({ alerts });
  } catch (error) {
    next(error);
  }
});

router.get('/history', requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;
    const limit = parseInt(req.query.limit as string) || 50;
    const history = await VolunteerThresholdAlertService.getAlertHistory(tenantId, limit);
    res.json({ history });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const alert = await VolunteerThresholdAlertService.getAlertById(req.params.id);
    if (!alert || alert.tenantId !== req.tenant!.id) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    res.json({ alert });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;
    const data = createAlertSchema.parse(req.body);
    
    const alert = await VolunteerThresholdAlertService.createAlert({
      ...data,
      tenantId,
    });
    
    res.status(201).json({ alert });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

router.patch('/:id', requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await VolunteerThresholdAlertService.getAlertById(req.params.id);
    if (!existing || existing.tenantId !== req.tenant!.id) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const data = updateAlertSchema.parse(req.body);
    const alert = await VolunteerThresholdAlertService.updateAlert(req.params.id, data);
    
    res.json({ alert });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

router.delete('/:id', requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await VolunteerThresholdAlertService.getAlertById(req.params.id);
    if (!existing || existing.tenantId !== req.tenant!.id) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    await VolunteerThresholdAlertService.deleteAlert(req.params.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/test', requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await VolunteerThresholdAlertService.getAlertById(req.params.id);
    if (!existing || existing.tenantId !== req.tenant!.id) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const result = await VolunteerThresholdAlertService.triggerAlertCheck(req.params.id);
    res.json({ 
      success: true, 
      result: result || { message: 'No shortages detected - no notifications sent' }
    });
  } catch (error) {
    next(error);
  }
});

export default router;

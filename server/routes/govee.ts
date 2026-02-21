import { Router, Response, NextFunction } from 'express';
import { db } from '../db';
import { 
  goveeCredentials, 
  goveeDevices, 
  goveeReadings, 
  goveeAlertRules, 
  goveeAlertEvents,
  insertGoveeDeviceSchema,
  insertGoveeAlertRuleSchema
} from '@shared/schema';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { GoveeService, isTemperatureSensorModel } from '../lib/govee-service';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const connectSchema = z.object({
  apiKey: z.string().min(10, 'API key is required'),
  accountEmail: z.string().email().optional(),
});

router.post('/connect', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.activeRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { apiKey, accountEmail } = connectSchema.parse(req.body);
    
    const service = new GoveeService(apiKey);
    const isValid = await service.validateApiKey();
    
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid Govee API key. Please check your key and try again.' });
    }

    const encryptedApiKey = GoveeService.encryptApiKey(apiKey);

    const existing = await db
      .select()
      .from(goveeCredentials)
      .where(eq(goveeCredentials.tenantId, req.tenant!.id));

    if (existing.length > 0) {
      await db
        .update(goveeCredentials)
        .set({
          encryptedApiKey,
          accountEmail: accountEmail || null,
          status: 'active',
          lastSyncError: null,
          updatedAt: new Date(),
        })
        .where(eq(goveeCredentials.tenantId, req.tenant!.id));
    } else {
      await db.insert(goveeCredentials).values({
        tenantId: req.tenant!.id,
        encryptedApiKey,
        accountEmail: accountEmail || null,
        status: 'active',
      });
    }

    const devices = await service.getDevices();
    const tempSensors = devices.filter(d => isTemperatureSensorModel(d.model));

    res.json({ 
      success: true, 
      message: 'Govee account connected successfully',
      devicesFound: tempSensors.length,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/disconnect', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.activeRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    await db
      .delete(goveeCredentials)
      .where(eq(goveeCredentials.tenantId, req.tenant!.id));

    res.json({ success: true, message: 'Govee account disconnected' });
  } catch (error) {
    next(error);
  }
});

router.get('/status', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.activeRole !== 'admin' && req.user!.activeRole !== 'staff') {
      return res.status(403).json({ error: 'Admin or staff access required' });
    }

    const [cred] = await db
      .select()
      .from(goveeCredentials)
      .where(eq(goveeCredentials.tenantId, req.tenant!.id));

    if (!cred) {
      return res.json({ connected: false });
    }

    const deviceCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(goveeDevices)
      .where(eq(goveeDevices.tenantId, req.tenant!.id));

    res.json({
      connected: true,
      status: cred.status,
      accountEmail: cred.accountEmail,
      lastSyncAt: cred.lastSyncAt,
      lastSyncError: cred.lastSyncError,
      deviceCount: deviceCount[0]?.count || 0,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/discover-devices', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.activeRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const [cred] = await db
      .select()
      .from(goveeCredentials)
      .where(eq(goveeCredentials.tenantId, req.tenant!.id));

    if (!cred) {
      return res.status(400).json({ error: 'Govee account not connected' });
    }

    const service = await GoveeService.createFromEncrypted(cred.encryptedApiKey);
    const allDevices = await service.getDevices();
    const tempSensors = allDevices.filter(d => isTemperatureSensorModel(d.model));

    const existingDevices = await db
      .select({ goveeDeviceId: goveeDevices.goveeDeviceId })
      .from(goveeDevices)
      .where(eq(goveeDevices.tenantId, req.tenant!.id));

    const existingIds = new Set(existingDevices.map(d => d.goveeDeviceId));

    const discoveredDevices = tempSensors.map(d => ({
      goveeDeviceId: d.device,
      model: d.model,
      deviceName: d.deviceName,
      isRegistered: existingIds.has(d.device),
    }));

    res.json({ devices: discoveredDevices });
  } catch (error) {
    next(error);
  }
});

router.post('/devices', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.activeRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const schema = insertGoveeDeviceSchema.omit({ tenantId: true });
    const data = schema.parse(req.body);

    const [device] = await db
      .insert(goveeDevices)
      .values({
        ...data,
        tenantId: req.tenant!.id,
      })
      .returning();

    res.status(201).json(device);
  } catch (error) {
    next(error);
  }
});

router.get('/devices', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.activeRole !== 'admin' && req.user!.activeRole !== 'staff') {
      return res.status(403).json({ error: 'Admin or staff access required' });
    }

    const devices = await db
      .select()
      .from(goveeDevices)
      .where(eq(goveeDevices.tenantId, req.tenant!.id))
      .orderBy(goveeDevices.deviceName);

    res.json({ devices });
  } catch (error) {
    next(error);
  }
});

router.patch('/devices/:deviceId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.activeRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { deviceId } = req.params;
    const updateSchema = z.object({
      locationLabel: z.string().optional(),
      isEnabled: z.boolean().optional(),
      pollingIntervalMinutes: z.number().min(5).max(60).optional(),
    });

    const updates = updateSchema.parse(req.body);

    const [updated] = await db
      .update(goveeDevices)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(
        eq(goveeDevices.id, deviceId),
        eq(goveeDevices.tenantId, req.tenant!.id)
      ))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/devices/:deviceId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.activeRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { deviceId } = req.params;

    const [deleted] = await db
      .delete(goveeDevices)
      .where(and(
        eq(goveeDevices.id, deviceId),
        eq(goveeDevices.tenantId, req.tenant!.id)
      ))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get('/devices/:deviceId/readings', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.activeRole !== 'admin' && req.user!.activeRole !== 'staff') {
      return res.status(403).json({ error: 'Admin or staff access required' });
    }

    const { deviceId } = req.params;
    const hours = parseInt(req.query.hours as string) || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const readings = await db
      .select()
      .from(goveeReadings)
      .where(and(
        eq(goveeReadings.deviceId, deviceId),
        eq(goveeReadings.tenantId, req.tenant!.id),
        gte(goveeReadings.recordedAt, since)
      ))
      .orderBy(desc(goveeReadings.recordedAt))
      .limit(500);

    res.json({ readings });
  } catch (error) {
    next(error);
  }
});

router.get('/readings/latest', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.activeRole !== 'admin' && req.user!.activeRole !== 'staff') {
      return res.status(403).json({ error: 'Admin or staff access required' });
    }

    const devices = await db
      .select()
      .from(goveeDevices)
      .where(eq(goveeDevices.tenantId, req.tenant!.id));

    const latestReadings = await Promise.all(
      devices.map(async (device) => {
        const [latest] = await db
          .select()
          .from(goveeReadings)
          .where(and(
            eq(goveeReadings.deviceId, device.id),
            eq(goveeReadings.tenantId, req.tenant!.id)
          ))
          .orderBy(desc(goveeReadings.recordedAt))
          .limit(1);

        return {
          device,
          reading: latest || null,
        };
      })
    );

    res.json({ readings: latestReadings });
  } catch (error) {
    next(error);
  }
});

router.post('/alert-rules', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.activeRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const schema = insertGoveeAlertRuleSchema.omit({ tenantId: true });
    const data = schema.parse(req.body);

    const [rule] = await db
      .insert(goveeAlertRules)
      .values({
        ...data,
        tenantId: req.tenant!.id,
      })
      .returning();

    res.status(201).json(rule);
  } catch (error) {
    next(error);
  }
});

router.get('/alert-rules', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.activeRole !== 'admin' && req.user!.activeRole !== 'staff') {
      return res.status(403).json({ error: 'Admin or staff access required' });
    }

    const rules = await db
      .select()
      .from(goveeAlertRules)
      .where(eq(goveeAlertRules.tenantId, req.tenant!.id))
      .orderBy(goveeAlertRules.name);

    res.json({ rules });
  } catch (error) {
    next(error);
  }
});

router.patch('/alert-rules/:ruleId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.activeRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { ruleId } = req.params;
    const updateSchema = z.object({
      name: z.string().optional(),
      isEnabled: z.boolean().optional(),
      minTemperatureF: z.string().optional().nullable(),
      maxTemperatureF: z.string().optional().nullable(),
      minHumidityPercent: z.string().optional().nullable(),
      maxHumidityPercent: z.string().optional().nullable(),
      notifyEmail: z.boolean().optional(),
      notifySms: z.boolean().optional(),
      notificationEmails: z.array(z.string().email()).optional(),
      notificationPhones: z.array(z.string()).optional(),
      cooldownMinutes: z.number().min(5).max(1440).optional(),
      quietHoursStart: z.string().optional().nullable(),
      quietHoursEnd: z.string().optional().nullable(),
    });

    const updates = updateSchema.parse(req.body);

    const [updated] = await db
      .update(goveeAlertRules)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(
        eq(goveeAlertRules.id, ruleId),
        eq(goveeAlertRules.tenantId, req.tenant!.id)
      ))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Alert rule not found' });
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/alert-rules/:ruleId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.activeRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { ruleId } = req.params;

    const [deleted] = await db
      .delete(goveeAlertRules)
      .where(and(
        eq(goveeAlertRules.id, ruleId),
        eq(goveeAlertRules.tenantId, req.tenant!.id)
      ))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Alert rule not found' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get('/alerts', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.activeRole !== 'admin' && req.user!.activeRole !== 'staff') {
      return res.status(403).json({ error: 'Admin or staff access required' });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const status = req.query.status as string;

    let query = db
      .select()
      .from(goveeAlertEvents)
      .where(eq(goveeAlertEvents.tenantId, req.tenant!.id));

    if (status) {
      query = db
        .select()
        .from(goveeAlertEvents)
        .where(and(
          eq(goveeAlertEvents.tenantId, req.tenant!.id),
          eq(goveeAlertEvents.status, status as any)
        ));
    }

    const alerts = await query
      .orderBy(desc(goveeAlertEvents.triggeredAt))
      .limit(limit);

    res.json({ alerts });
  } catch (error) {
    next(error);
  }
});

router.patch('/alerts/:alertId/acknowledge', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.activeRole !== 'admin' && req.user!.activeRole !== 'staff') {
      return res.status(403).json({ error: 'Admin or staff access required' });
    }

    const { alertId } = req.params;

    const [updated] = await db
      .update(goveeAlertEvents)
      .set({
        status: 'acknowledged',
        acknowledgedAt: new Date(),
        acknowledgedBy: req.user!.id,
      })
      .where(and(
        eq(goveeAlertEvents.id, alertId),
        eq(goveeAlertEvents.tenantId, req.tenant!.id)
      ))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.patch('/alerts/:alertId/resolve', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.activeRole !== 'admin' && req.user!.activeRole !== 'staff') {
      return res.status(403).json({ error: 'Admin or staff access required' });
    }

    const { alertId } = req.params;

    const [updated] = await db
      .update(goveeAlertEvents)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
      })
      .where(and(
        eq(goveeAlertEvents.id, alertId),
        eq(goveeAlertEvents.tenantId, req.tenant!.id)
      ))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.post('/sync', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.activeRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const [cred] = await db
      .select()
      .from(goveeCredentials)
      .where(eq(goveeCredentials.tenantId, req.tenant!.id));

    if (!cred) {
      return res.status(400).json({ error: 'Govee account not connected' });
    }

    const service = await GoveeService.createFromEncrypted(cred.encryptedApiKey);
    
    const devices = await db
      .select()
      .from(goveeDevices)
      .where(and(
        eq(goveeDevices.tenantId, req.tenant!.id),
        eq(goveeDevices.isEnabled, true)
      ));

    let readingsCollected = 0;

    for (const device of devices) {
      try {
        const state = await service.getDeviceState(device.goveeDeviceId, device.model);
        
        if (state) {
          const reading = service.extractTemperatureHumidity(state);
          
          if (reading.temperatureCelsius !== null && reading.temperatureFahrenheit !== null) {
            await db.insert(goveeReadings).values({
              tenantId: req.tenant!.id,
              deviceId: device.id,
              temperatureCelsius: reading.temperatureCelsius.toFixed(2),
              temperatureFahrenheit: reading.temperatureFahrenheit.toFixed(2),
              humidityPercent: reading.humidityPercent?.toFixed(2) ?? null,
              batteryLevel: device.batteryLevel,
              recordedAt: new Date(),
            });
            readingsCollected++;
          }

          await db
            .update(goveeDevices)
            .set({
              isOnline: reading.isOnline,
              lastReadingAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(goveeDevices.id, device.id));
        }
      } catch (deviceError) {
        console.error(`Error syncing device ${device.goveeDeviceId}:`, deviceError);
      }
    }

    await db
      .update(goveeCredentials)
      .set({
        lastSyncAt: new Date(),
        lastSyncError: null,
        updatedAt: new Date(),
      })
      .where(eq(goveeCredentials.id, cred.id));

    res.json({ 
      success: true, 
      message: `Synced ${readingsCollected} reading(s) from ${devices.length} device(s)`,
      readingsCollected,
      devicesPolled: devices.length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

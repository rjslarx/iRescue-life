import { db } from '../db';
import { 
  goveeCredentials, 
  goveeDevices, 
  goveeReadings, 
  goveeAlertRules, 
  goveeAlertEvents 
} from '@shared/schema';
import { eq, and, lte, isNull, or, sql } from 'drizzle-orm';
import { GoveeService, isTemperatureSensorModel } from '../lib/govee-service';
import { EmailService } from '../lib/email-service';

const POLLING_INTERVAL_MS = 10 * 60 * 1000;
let pollingInterval: NodeJS.Timeout | null = null;

export async function startGoveePoller(): Promise<void> {
  console.log('[Govee Poller] Starting temperature monitoring poller...');
  
  await pollAllTenants();
  
  pollingInterval = setInterval(async () => {
    await pollAllTenants();
  }, POLLING_INTERVAL_MS);
}

export function stopGoveePoller(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log('[Govee Poller] Stopped temperature monitoring poller');
  }
}

async function pollAllTenants(): Promise<void> {
  try {
    const credentials = await db
      .select()
      .from(goveeCredentials)
      .where(eq(goveeCredentials.status, 'active'));

    console.log(`[Govee Poller] Polling ${credentials.length} tenant(s) with active Govee integration`);

    for (const cred of credentials) {
      try {
        await pollTenant(cred);
      } catch (error) {
        console.error(`[Govee Poller] Error polling tenant ${cred.tenantId}:`, error);
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await db
          .update(goveeCredentials)
          .set({
            lastSyncError: errorMessage,
            status: errorMessage.includes('Invalid') ? 'invalid' : 
                    errorMessage.includes('rate limit') ? 'rate_limited' : 'active',
            updatedAt: new Date(),
          })
          .where(eq(goveeCredentials.id, cred.id));
      }
    }
  } catch (error) {
    console.error('[Govee Poller] Failed to poll tenants:', error);
  }
}

async function pollTenant(cred: typeof goveeCredentials.$inferSelect): Promise<void> {
  const service = await GoveeService.createFromEncrypted(cred.encryptedApiKey);
  
  const devices = await db
    .select()
    .from(goveeDevices)
    .where(and(
      eq(goveeDevices.tenantId, cred.tenantId),
      eq(goveeDevices.isEnabled, true)
    ));

  if (devices.length === 0) {
    return;
  }

  for (const device of devices) {
    try {
      const state = await service.getDeviceState(device.goveeDeviceId, device.model);
      
      if (!state) {
        await db
          .update(goveeDevices)
          .set({ isOnline: false, updatedAt: new Date() })
          .where(eq(goveeDevices.id, device.id));
        continue;
      }

      const reading = service.extractTemperatureHumidity(state);
      
      await db
        .update(goveeDevices)
        .set({
          isOnline: reading.isOnline,
          lastReadingAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(goveeDevices.id, device.id));

      if (reading.temperatureCelsius !== null && reading.temperatureFahrenheit !== null) {
        const [insertedReading] = await db
          .insert(goveeReadings)
          .values({
            tenantId: cred.tenantId,
            deviceId: device.id,
            temperatureCelsius: reading.temperatureCelsius.toFixed(2),
            temperatureFahrenheit: reading.temperatureFahrenheit.toFixed(2),
            humidityPercent: reading.humidityPercent?.toFixed(2) ?? null,
            batteryLevel: device.batteryLevel,
            recordedAt: new Date(),
          })
          .returning();

        await checkAlertRules(cred.tenantId, device, insertedReading);
      }
    } catch (deviceError) {
      console.error(`[Govee Poller] Error polling device ${device.goveeDeviceId}:`, deviceError);
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
}

async function checkAlertRules(
  tenantId: string,
  device: typeof goveeDevices.$inferSelect,
  reading: typeof goveeReadings.$inferSelect
): Promise<void> {
  const rules = await db
    .select()
    .from(goveeAlertRules)
    .where(and(
      eq(goveeAlertRules.tenantId, tenantId),
      eq(goveeAlertRules.isEnabled, true),
      or(
        isNull(goveeAlertRules.deviceId),
        eq(goveeAlertRules.deviceId, device.id)
      )
    ));

  const tempF = parseFloat(reading.temperatureFahrenheit);
  const humidity = reading.humidityPercent ? parseFloat(reading.humidityPercent) : null;
  const now = new Date();

  for (const rule of rules) {
    if (rule.lastTriggeredAt) {
      const cooldownMs = (rule.cooldownMinutes || 30) * 60 * 1000;
      if (now.getTime() - rule.lastTriggeredAt.getTime() < cooldownMs) {
        continue;
      }
    }

    if (isInQuietHours(rule.quietHoursStart, rule.quietHoursEnd)) {
      continue;
    }

    let alertType: string | null = null;
    let triggerValue: number | null = null;
    let thresholdValue: number | null = null;
    let message: string | null = null;

    if (rule.minTemperatureF && tempF < parseFloat(rule.minTemperatureF)) {
      alertType = 'temp_low';
      triggerValue = tempF;
      thresholdValue = parseFloat(rule.minTemperatureF);
      message = `Temperature too low at ${device.locationLabel || device.deviceName}: ${tempF.toFixed(1)}°F (minimum: ${thresholdValue}°F)`;
    } else if (rule.maxTemperatureF && tempF > parseFloat(rule.maxTemperatureF)) {
      alertType = 'temp_high';
      triggerValue = tempF;
      thresholdValue = parseFloat(rule.maxTemperatureF);
      message = `Temperature too high at ${device.locationLabel || device.deviceName}: ${tempF.toFixed(1)}°F (maximum: ${thresholdValue}°F)`;
    } else if (humidity !== null && rule.minHumidityPercent && humidity < parseFloat(rule.minHumidityPercent)) {
      alertType = 'humidity_low';
      triggerValue = humidity;
      thresholdValue = parseFloat(rule.minHumidityPercent);
      message = `Humidity too low at ${device.locationLabel || device.deviceName}: ${humidity.toFixed(1)}% (minimum: ${thresholdValue}%)`;
    } else if (humidity !== null && rule.maxHumidityPercent && humidity > parseFloat(rule.maxHumidityPercent)) {
      alertType = 'humidity_high';
      triggerValue = humidity;
      thresholdValue = parseFloat(rule.maxHumidityPercent);
      message = `Humidity too high at ${device.locationLabel || device.deviceName}: ${humidity.toFixed(1)}% (maximum: ${thresholdValue}%)`;
    }

    if (alertType && message) {
      const [alertEvent] = await db
        .insert(goveeAlertEvents)
        .values({
          tenantId,
          ruleId: rule.id,
          deviceId: device.id,
          readingId: reading.id,
          alertType: alertType as any,
          triggerValue: triggerValue?.toFixed(2) ?? null,
          thresholdValue: thresholdValue?.toFixed(2) ?? null,
          message,
          status: 'triggered',
        })
        .returning();

      await db
        .update(goveeAlertRules)
        .set({ lastTriggeredAt: now, updatedAt: now })
        .where(eq(goveeAlertRules.id, rule.id));

      await sendAlertNotifications(rule, alertEvent, device);
    }
  }
}

function isInQuietHours(start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();
  
  const [startHour, startMin] = start.split(':').map(Number);
  const [endHour, endMin] = end.split(':').map(Number);
  
  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;
  
  if (startTime < endTime) {
    return currentTime >= startTime && currentTime < endTime;
  } else {
    return currentTime >= startTime || currentTime < endTime;
  }
}

async function sendAlertNotifications(
  rule: typeof goveeAlertRules.$inferSelect,
  alertEvent: typeof goveeAlertEvents.$inferSelect,
  device: typeof goveeDevices.$inferSelect
): Promise<void> {
  const emailRecipients: string[] = [];
  
  if (rule.notifyEmail && rule.notificationEmails && rule.notificationEmails.length > 0) {
    emailRecipients.push(...rule.notificationEmails);
  }

  if (emailRecipients.length > 0) {
    try {
      // Get email service for tenant
      const emailService = await EmailService.forTenant(rule.tenantId);
      if (!emailService) {
        console.warn(`[Govee Poller] No email service configured for tenant ${rule.tenantId}`);
        return;
      }
      
      for (const email of emailRecipients) {
        await emailService.send({
          to: email,
          subject: `Temperature Alert: ${rule.name}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #dc2626;">Temperature Alert</h2>
              <p><strong>Location:</strong> ${device.locationLabel || device.deviceName}</p>
              <p><strong>Alert:</strong> ${alertEvent.message}</p>
              <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
              <hr style="border: 1px solid #e5e7eb; margin: 20px 0;" />
              <p style="color: #6b7280; font-size: 12px;">
                This alert was triggered by the "${rule.name}" rule. 
                To adjust settings, visit your organization's Temperature Monitoring settings.
              </p>
            </div>
          `,
        });
      }

      await db
        .update(goveeAlertEvents)
        .set({
          emailSent: true,
          emailRecipients,
        })
        .where(eq(goveeAlertEvents.id, alertEvent.id));
    } catch (error) {
      console.error('[Govee Poller] Failed to send email alert:', error);
    }
  }
}

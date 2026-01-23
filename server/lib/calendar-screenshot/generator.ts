import puppeteer from 'puppeteer';
import { db } from '../../db';
import { calendars, calendarEvents, tenants } from '@shared/schema';
import { eq, and, gte, lte, inArray } from 'drizzle-orm';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const CACHE_DIR = '/tmp/calendar-screenshots';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CalendarScreenshotOptions {
  tenantId: string;
  calendarIds?: string[];
  width?: number;
  height?: number;
}

async function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCacheKey(options: CalendarScreenshotOptions): string {
  const data = JSON.stringify({
    tenantId: options.tenantId,
    calendarIds: options.calendarIds?.sort() || [],
  });
  return crypto.createHash('md5').update(data).digest('hex');
}

function getCachePath(cacheKey: string): string {
  return path.join(CACHE_DIR, `${cacheKey}.png`);
}

function isCacheValid(cachePath: string): boolean {
  if (!fs.existsSync(cachePath)) return false;
  const stats = fs.statSync(cachePath);
  const age = Date.now() - stats.mtimeMs;
  return age < CACHE_TTL_MS;
}

export async function generateCalendarScreenshot(options: CalendarScreenshotOptions): Promise<Buffer | null> {
  await ensureCacheDir();
  
  const cacheKey = getCacheKey(options);
  const cachePath = getCachePath(cacheKey);
  
  // Check cache first
  if (isCacheValid(cachePath)) {
    console.log(`[CALENDAR-SCREENSHOT] Cache hit for ${cacheKey}`);
    return fs.promises.readFile(cachePath);
  }
  
  console.log(`[CALENDAR-SCREENSHOT] Generating screenshot for tenant ${options.tenantId}`);
  
  try {
    // Get tenant info
    const [tenant] = await db.select()
      .from(tenants)
      .where(eq(tenants.id, options.tenantId))
      .limit(1);
    
    if (!tenant) {
      console.error(`[CALENDAR-SCREENSHOT] Tenant not found: ${options.tenantId}`);
      return null;
    }
    
    // Get calendars
    let calendarQuery = db.select()
      .from(calendars)
      .where(eq(calendars.tenantId, options.tenantId));
    
    if (options.calendarIds && options.calendarIds.length > 0) {
      calendarQuery = db.select()
        .from(calendars)
        .where(and(
          eq(calendars.tenantId, options.tenantId),
          inArray(calendars.id, options.calendarIds)
        ));
    }
    
    const calendarList = await calendarQuery;
    
    if (calendarList.length === 0) {
      console.log(`[CALENDAR-SCREENSHOT] No calendars found`);
      return null;
    }
    
    // Get events for next 30 days
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    const events = await db.select()
      .from(calendarEvents)
      .where(and(
        eq(calendarEvents.tenantId, options.tenantId),
        inArray(calendarEvents.calendarId, calendarList.map(c => c.id)),
        gte(calendarEvents.startTime, now),
        lte(calendarEvents.startTime, thirtyDaysFromNow)
      ))
      .orderBy(calendarEvents.startTime)
      .limit(10);
    
    // Generate HTML for the calendar preview
    const html = generateCalendarHTML(tenant, calendarList, events);
    
    // Launch puppeteer and capture screenshot
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    
    try {
      const page = await browser.newPage();
      
      await page.setViewport({
        width: options.width || 1200,
        height: options.height || 630,
        deviceScaleFactor: 2,
      });
      
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      const screenshot = await page.screenshot({
        type: 'png',
        clip: {
          x: 0,
          y: 0,
          width: options.width || 1200,
          height: options.height || 630,
        },
      });
      
      // Save to cache
      await fs.promises.writeFile(cachePath, screenshot);
      console.log(`[CALENDAR-SCREENSHOT] Saved to cache: ${cachePath}`);
      
      return screenshot as Buffer;
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error(`[CALENDAR-SCREENSHOT] Error generating screenshot:`, error);
    return null;
  }
}

function generateCalendarHTML(
  tenant: typeof tenants.$inferSelect,
  calendarList: (typeof calendars.$inferSelect)[],
  events: (typeof calendarEvents.$inferSelect)[]
): string {
  const calendarNames = calendarList.map(c => c.name).join(', ');
  const primaryColor = tenant.primaryColor || '#2563eb';
  
  // Group events by date
  const eventsByDate: Record<string, typeof events> = {};
  events.forEach(event => {
    const dateKey = new Date(event.startTime).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    if (!eventsByDate[dateKey]) {
      eventsByDate[dateKey] = [];
    }
    eventsByDate[dateKey].push(event);
  });
  
  const eventListHTML = Object.entries(eventsByDate).slice(0, 5).map(([date, dateEvents]) => `
    <div style="margin-bottom: 16px;">
      <div style="font-weight: 600; color: #374151; margin-bottom: 8px; font-size: 14px;">${date}</div>
      ${dateEvents.slice(0, 3).map(event => {
        const time = new Date(event.startTime).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });
        const calendar = calendarList.find(c => c.id === event.calendarId);
        const color = calendar?.color || primaryColor;
        return `
          <div style="display: flex; align-items: center; margin-bottom: 6px; padding: 8px; background: white; border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
            <div style="width: 4px; height: 32px; background: ${color}; border-radius: 2px; margin-right: 12px;"></div>
            <div>
              <div style="font-weight: 500; color: #111827; font-size: 14px;">${escapeHtml(event.title)}</div>
              <div style="color: #6b7280; font-size: 12px;">${time}</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `).join('');
  
  const noEventsHTML = events.length === 0 ? `
    <div style="text-align: center; padding: 40px; color: #6b7280;">
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 16px;">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
      </svg>
      <div style="font-size: 16px;">No upcoming events</div>
    </div>
  ` : '';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, ${primaryColor}15 0%, ${primaryColor}05 100%);
      width: 1200px;
      height: 630px;
      display: flex;
      flex-direction: column;
    }
  </style>
</head>
<body>
  <div style="padding: 40px; flex: 1; display: flex; flex-direction: column;">
    <!-- Header -->
    <div style="display: flex; align-items: center; margin-bottom: 32px;">
      <div style="width: 64px; height: 64px; background: ${primaryColor}; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-right: 20px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </div>
      <div>
        <div style="font-size: 28px; font-weight: 700; color: #111827;">${escapeHtml(calendarNames)}</div>
        <div style="font-size: 18px; color: #6b7280; margin-top: 4px;">${escapeHtml(tenant.name)}</div>
      </div>
    </div>
    
    <!-- Events -->
    <div style="flex: 1; overflow: hidden;">
      <div style="font-size: 18px; font-weight: 600; color: #374151; margin-bottom: 16px;">Upcoming Events</div>
      ${events.length > 0 ? eventListHTML : noEventsHTML}
    </div>
    
    <!-- Footer -->
    <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <div style="color: #9ca3af; font-size: 14px;">View full calendar</div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="width: 24px; height: 24px; background: linear-gradient(135deg, #06b6d4, #3b82f6); border-radius: 4px;"></div>
        <span style="font-weight: 600; color: #374151; font-size: 14px;">iRescue.life</span>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function cleanupOldScreenshots(): Promise<void> {
  await ensureCacheDir();
  
  const files = await fs.promises.readdir(CACHE_DIR);
  const now = Date.now();
  
  for (const file of files) {
    const filePath = path.join(CACHE_DIR, file);
    const stats = await fs.promises.stat(filePath);
    const age = now - stats.mtimeMs;
    
    // Remove files older than 1 hour
    if (age > 60 * 60 * 1000) {
      await fs.promises.unlink(filePath);
      console.log(`[CALENDAR-SCREENSHOT] Cleaned up old file: ${file}`);
    }
  }
}

import puppeteer from 'puppeteer';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, getDay } from 'date-fns';

interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date | string;
  endTime: Date | string;
  location?: string | null;
  description?: string | null;
  calendarId?: string;
}

interface CalendarInfo {
  id?: string;
  name: string;
  color: string;
  type?: string;
  minVolunteersRequired?: number;
}

interface ShareImageOptions {
  tenantName: string;
  tenantLogo?: string | null;
  calendars: CalendarInfo[];
  events: CalendarEvent[];
  month: Date;
  calendarPageUrl: string;
}

function buildCalendarHtml(options: ShareImageOptions): string {
  const { tenantName, calendars, events, month, calendarPageUrl } = options;

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const startDayOfWeek = getDay(monthStart);

  const eventsByDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const eventDate = new Date(event.startTime);
    if (eventDate >= monthStart && eventDate <= monthEnd) {
      const key = format(eventDate, 'yyyy-MM-dd');
      if (!eventsByDay.has(key)) {
        eventsByDay.set(key, []);
      }
      eventsByDay.get(key)!.push(event);
    }
  }

  const primaryColor = calendars[0]?.color || '#6366f1';

  const colorMap = new Map<string, string>();
  for (const cal of calendars) {
    if (cal.id) colorMap.set(cal.id, cal.color);
  }

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const calendarCells: string[] = [];

  for (let i = 0; i < startDayOfWeek; i++) {
    calendarCells.push(`<div class="day empty"></div>`);
  }

  const isVolunteerView = calendars.length === 1 && calendars[0].type === 'volunteer';
  const minRequired = calendars[0]?.minVolunteersRequired ?? 2;

  for (const day of days) {
    const key = format(day, 'yyyy-MM-dd');
    const dayNum = format(day, 'd');
    const dayEvents = eventsByDay.get(key) || [];
    const isToday = format(new Date(), 'yyyy-MM-dd') === key;

    let dayBgStyle = '';
    if (isVolunteerView) {
      const volunteerCount = dayEvents.length;
      if (volunteerCount === 0) {
        dayBgStyle = 'background-color: rgba(239, 68, 68, 0.15);';
      } else if (volunteerCount < minRequired) {
        dayBgStyle = 'background-color: rgba(234, 179, 8, 0.2);';
      } else {
        dayBgStyle = 'background-color: rgba(34, 197, 94, 0.15);';
      }
    }

    const eventDots = dayEvents.slice(0, 3).map((ev, i) => {
      const truncTitle = ev.title.length > 22 ? ev.title.slice(0, 20) + '...' : ev.title;
      const evColor = (ev.calendarId && colorMap.get(ev.calendarId)) || primaryColor;
      return `<div class="event-item" style="background: ${evColor}20; border-left: 3px solid ${evColor};">
        <span class="event-title">${truncTitle}</span>
      </div>`;
    }).join('');

    const moreCount = dayEvents.length > 3 ? `<div class="more-events">+${dayEvents.length - 3} more</div>` : '';

    calendarCells.push(`<div class="day${isToday ? ' today' : ''}" style="${dayBgStyle}">
      <div class="day-number${isToday ? ' today-number' : ''}">${dayNum}</div>
      <div class="events">${eventDots}${moreCount}</div>
    </div>`);
  }

  const totalCells = calendarCells.length;
  const remainingCells = (7 - (totalCells % 7)) % 7;
  for (let i = 0; i < remainingCells; i++) {
    calendarCells.push(`<div class="day empty"></div>`);
  }

  const totalEvents = events.filter(e => {
    const d = new Date(e.startTime);
    return d >= monthStart && d <= monthEnd;
  }).length;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #ffffff;
    width: 1200px;
    height: 630px;
    overflow: hidden;
  }
  .container {
    width: 1200px;
    height: 630px;
    display: flex;
    flex-direction: column;
    padding: 24px 28px 20px;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 2px solid ${primaryColor};
  }
  .header-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .header-left-top {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .org-name {
    font-size: 22px;
    font-weight: 700;
    color: #1a1a2e;
  }
  .calendar-title {
    font-size: 15px;
    font-weight: 500;
    color: ${primaryColor};
  }
  .month-title {
    font-size: 20px;
    font-weight: 600;
    color: ${primaryColor};
  }
  .event-count {
    font-size: 13px;
    color: #666;
    background: ${primaryColor}15;
    padding: 4px 12px;
    border-radius: 20px;
    font-weight: 500;
  }
  .weekday-header {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    margin-bottom: 2px;
  }
  .weekday {
    text-align: center;
    font-size: 12px;
    font-weight: 600;
    color: #888;
    padding: 6px 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    flex: 1;
  }
  .day {
    background: #fafafa;
    border-radius: 4px;
    padding: 3px 4px;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .day.empty {
    background: transparent;
  }
  .day.today {
    background: ${primaryColor}08;
    outline: 2px solid ${primaryColor};
    outline-offset: -1px;
  }
  .day-number {
    font-size: 12px;
    font-weight: 600;
    color: #444;
    margin-bottom: 2px;
  }
  .today-number {
    color: ${primaryColor};
    font-weight: 700;
  }
  .events {
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow: hidden;
    flex: 1;
  }
  .event-item {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 1px 4px;
    border-radius: 2px;
    overflow: hidden;
    white-space: nowrap;
  }
  .event-title {
    font-size: 9px;
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .more-events {
    font-size: 9px;
    color: ${primaryColor};
    font-weight: 500;
    padding: 0 4px;
  }
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid #eee;
  }
  .footer-url {
    font-size: 12px;
    color: ${primaryColor};
    font-weight: 500;
  }
  .footer-cta {
    font-size: 12px;
    color: #888;
  }
  .legend {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 11px;
    color: #666;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="header-left">
      <div class="header-left-top">
        <div class="org-name">${tenantName}</div>
        <div class="event-count">${totalEvents} event${totalEvents !== 1 ? 's' : ''} this month</div>
      </div>
      ${calendars.length > 0 ? `<div class="calendar-title">${calendars.map(c => c.name).join(' / ')}</div>` : ''}
    </div>
    <div class="month-title">${format(month, 'MMMM yyyy')}</div>
  </div>

  <div class="weekday-header">
    ${weekdays.map(d => `<div class="weekday">${d}</div>`).join('')}
  </div>

  <div class="calendar-grid">
    ${calendarCells.join('')}
  </div>

  <div class="footer">
    <div class="footer-cta">View full calendar & event details online</div>
    ${isVolunteerView ? `<div class="legend">
      <div class="legend-item"><div class="legend-dot" style="background: rgba(34, 197, 94, 0.4);"></div> Filled</div>
      <div class="legend-item"><div class="legend-dot" style="background: rgba(234, 179, 8, 0.5);"></div> Needs Help</div>
      <div class="legend-item"><div class="legend-dot" style="background: rgba(239, 68, 68, 0.4);"></div> No Volunteers</div>
    </div>` : ''}
    <div class="footer-url">${calendarPageUrl}</div>
  </div>
</div>
</body>
</html>`;
}

export async function generateCalendarShareImage(options: ShareImageOptions): Promise<Buffer> {
  const html = buildCalendarHtml(options);

  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 630 });
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const imageBuffer = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: 1200, height: 630 },
    });

    return Buffer.from(imageBuffer);
  } finally {
    await browser.close();
  }
}

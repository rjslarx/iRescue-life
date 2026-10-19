/** Explicit timezone formatting: email output must not depend on the server TZ. */
export function resolveVolunteerEmailTimezone(timezone?: string | null): string {
  for (const candidate of [timezone, process.env.DEFAULT_TENANT_TIMEZONE, "America/Chicago"]) {
    if (!candidate) continue;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: candidate });
      return candidate;
    } catch { /* Try the configured fallback, then Central. */ }
  }
  return "America/Chicago";
}

export function volunteerEmailDate(when: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(when);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function volunteerEmailTime(when: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true,
    timeZoneName: "short",
  }).format(when);
}

import { z } from "zod";
export const helpSettingsSchema = z.object({
  smsAlerts: z.boolean().optional(),
  generalAssigneeId: z.string().uuid().nullable().optional(),
  generalAssigneeIds: z.array(z.string().uuid()).max(100).optional(),
  voice: z.enum(["default", "man", "woman"]).optional(),
  phone: z.string().regex(/^$|^\+1\d{10}$/, "Use a US number in +1 format"),
  timezone: z.string().refine(s => { try { new Intl.DateTimeFormat("en", { timeZone: s }); return true; } catch { return false; } }, "Choose a valid timezone"),
  openHour: z.number().int().min(0).max(23), closeHour: z.number().int().min(1).max(24),
  days: z.array(z.number().int().min(0).max(6)).max(7),
  weeklyHours: z.array(z.object({
    openHour: z.number().int().min(0).max(23),
    closeHour: z.number().int().min(1).max(24),
  }).strict().refine(h => h.openHour < h.closeHour, "Closing hour must be after opening hour").nullable()).length(7).optional(),
  greeting: z.string().trim().min(1).max(700), afterHours: z.string().trim().min(1).max(700),
  handoff: z.string().trim().min(1).max(700), emergency: z.string().trim().min(1).max(700),
  teamIds: z.array(z.string().uuid()).max(100),
  topics: z.array(z.object({ id: z.string().uuid(), label: z.string().trim().min(1).max(70),
    keywords: z.array(z.string().trim().min(2).max(60)).max(20),
    answer: z.string().trim().min(1).max(1000), assigneeId: z.string().uuid().nullable(),
    assigneeIds: z.array(z.string().uuid()).max(100).optional(),
    notificationMode: z.enum(["always", "answer_first"]).optional(),
  }).strict()).max(30),
}).strict().refine(s => s.openHour < s.closeHour, "Closing hour must be after opening hour")
  .refine(s => generalTeam(s).every(id => s.teamIds.includes(id)), "General-message recipients must be on the inbox team")
  .refine(s => new Set(s.topics.map(t => t.id)).size === s.topics.length, "Topic IDs must be unique")
  .refine(s => new Set(s.topics.map(t => t.label.toLowerCase())).size === s.topics.length, "Category names must be unique")
  .refine(s => s.topics.every(t => topicTeam(t).every(id => s.teamIds.includes(id))), "Topic assignees must be on the inbox team");
export type HelpSettings = z.infer<typeof helpSettingsSchema>;
export const defaultHelpSettings: HelpSettings = {
  voice: "default", smsAlerts: true,
  phone: "", timezone: "America/Chicago", openHour: 9, closeHour: 17, days: [1,2,3,4,5], teamIds: [], topics: [],
  greeting: "Thank you for contacting the rescue. Please text your question, or reply TEAM to request a person. This line is not monitored for emergencies.",
  afterHours: "The team is currently outside its response hours. Your message is saved for follow-up. This line is not monitored for emergencies.",
  handoff: "Your message is in the rescue team's inbox. A team member will follow up when available.",
  emergency: "This line cannot provide emergency assistance or veterinary advice. For an animal medical emergency, contact a local emergency veterinarian. For immediate danger to people, contact emergency services.",
};
export function topicTeam(topic?: { assigneeId?: string | null; assigneeIds?: string[] }) {
  return [...new Set(topic?.assigneeIds ?? (topic?.assigneeId ? [topic.assigneeId] : []))];
}
export function generalTeam(s: { generalAssigneeId?: string | null; generalAssigneeIds?: string[] }) {
  return Array.from(new Set(s.generalAssigneeIds ?? (s.generalAssigneeId ? [s.generalAssigneeId] : [])));
}
export function helpRecipients(s: HelpSettings, thread: { assignee_id?: string | null; topic?: string | null; status: string }) {
  if (thread.status === "resolved") return [];
  if (s.generalAssigneeIds !== undefined || s.generalAssigneeId !== undefined) {
    const category = s.topics.find(t => t.label === thread.topic);
    const general = !category || /^(general|uncategorized)$/i.test(category.label.trim());
    const members = general ? [] : topicTeam(category);
    const eligible = (members.length ? members : generalTeam(s))
      .filter(id => s.teamIds.includes(id));
    // Claims do not grant permission to receive unrelated category texts.
    if (thread.assignee_id && eligible.includes(thread.assignee_id)) return [thread.assignee_id];
    if (thread.status === "bot" && category?.notificationMode === "answer_first") return [];
    return eligible;
  }
  if (thread.assignee_id) return s.teamIds.includes(thread.assignee_id) ? [thread.assignee_id] : [];
  const category = s.topics.find(t => t.label === thread.topic);
  if (thread.status === "bot" && category?.notificationMode === "answer_first") return [];
  const members = topicTeam(category);
  return (members.length ? members : s.teamIds).filter(id => s.teamIds.includes(id));
}
export function canClaimHelp(s: HelpSettings, thread: { assignee_id?: string | null; topic?: string | null; status: string }, userId: string, admin: boolean) {
  return admin || helpRecipients(s, { ...thread, status: "waiting" }).includes(userId);
}
// Only explicitly selected Basic voices may override the account default.
// Twilio Basic TTS has no additional synthesis charge; premium IDs are never passed through.
export function helpVoiceOptions(voice: unknown): { voice?: "man" | "woman"; language?: "en-US" } {
  return voice === "man" || voice === "woman" ? { voice, language: "en-US" } : {};
}
// Sunday first. Missing weekly hours retain the existing shared-hours schedule.
export function helpWeeklyHours(s: Pick<HelpSettings, "weeklyHours" | "days" | "openHour" | "closeHour">) {
  return s.weeklyHours ?? Array.from({ length: 7 }, (_, day) =>
    s.days.includes(day) ? { openHour: s.openHour, closeHour: s.closeHour } : null);
}
export function helpIsOpen(s: HelpSettings, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: s.timezone, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const day = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(parts.find(p => p.type === "weekday")!.value);
  const hour = Number(parts.find(p => p.type === "hour")!.value);
  const hours = helpWeeklyHours(s)[day];
  return !!hours && hour >= hours.openHour && hour < hours.closeHour;
}
export function helpMatch(s: HelpSettings, body: string) {
  const normalized = body.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const padded = ` ${normalized} `;
  if (/\b(emergency|bleeding|poison|poisoned|dying|not breathing)\b/.test(normalized)) return { kind: "emergency" as const };
  if (/^(team|human|person|help me)$/.test(normalized) ||
      /\b(talk|speak|connect)( to| with)? (a |an |the |your )?(human|person|volunteer|team|someone)\b/.test(normalized))
    return { kind: "handoff" as const };
  const matches = s.topics.filter(t => t.keywords.some(k => {
    const key = k.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    return key && padded.includes(` ${key} `);
  }));
  return matches.length === 1 ? { kind: "answer" as const, topic: matches[0] } : { kind: "handoff" as const };
}

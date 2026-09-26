import { z } from "zod";
import { VOTING_CONTEST_THEMES } from "./schema";

export { VOTING_CONTEST_THEMES } from "./schema";

const contestColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color")
  .or(z.literal("").transform(() => null))
  .nullable()
  .optional();

export const contestAppearanceSchema = z.object({
  primaryColor: contestColorSchema,
  accentColor: contestColorSchema,
  themeBackground: z.enum(VOTING_CONTEST_THEMES).nullable().optional(),
});

// Uploads return same-origin object paths, not absolute web URLs.
export const votingContestImageSchema = z.string().refine(value => {
  if (value === "") return true;
  if (/^\/objects\/[^\s\\?#]+$/.test(value)) {
    return !value.split("/").some(segment => segment === "." || segment === "..");
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}, "Choose an uploaded photo or a valid HTTP/HTTPS image URL");

export const votingContestEntrantDescriptionSchema = z.string().trim().max(500)
  .transform(value => value || null)
  .nullable();

export const votingContestEntrantRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  photoUrl: votingContestImageSchema.optional(),
  description: votingContestEntrantDescriptionSchema.optional(),
});

export const votingContestEntrantDescriptionRequestSchema = z.object({
  description: votingContestEntrantDescriptionSchema,
}).strict();
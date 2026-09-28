import { z } from "zod";
import { VOTING_CONTEST_THEMES } from "./schema";

export { VOTING_CONTEST_THEMES } from "./schema";

const contestColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color")
  .or(z.literal("").transform(() => null))
  .nullable()
  .optional();

export const contestAppearanceSchema = z.object({
  backgroundImageUrl: z.string().regex(/^\/objects\/[0-9a-f-]{36}\/voting-backgrounds\/[0-9a-f-]{36}$/i, "Choose an uploaded contest background").nullable().optional(),
  backgroundImageTarget: z.enum(["page", "frames", "both"]).optional(),
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

export const votingContestOwnerDisplayNameSchema = z.string().trim().max(100)
  .transform(value => value || null).nullable();

export const votingContestEntrantRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  ownerDisplayName: votingContestOwnerDisplayNameSchema.optional(),
  photoUrl: votingContestImageSchema.optional(),
  description: votingContestEntrantDescriptionSchema.optional(),
});

export const votingContestEntrantDescriptionRequestSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  ownerDisplayName: votingContestOwnerDisplayNameSchema.optional(),
  description: votingContestEntrantDescriptionSchema.optional(),
}).strict().refine(value => Object.keys(value).length > 0, "Provide at least one field");
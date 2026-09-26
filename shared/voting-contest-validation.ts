import { z } from "zod";

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

export const votingContestEntrantRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  photoUrl: votingContestImageSchema.optional(),
});
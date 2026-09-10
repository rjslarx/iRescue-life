export const SENSITIVE_VOLUNTEER_TRAINING_PATH =
  /(?:^|\/)volunteer-training\/[^/?#]+(?:[/?#]|$)/i;

export function isSensitiveVolunteerTrainingUrl(value: string): boolean {
  try {
    const parsed = new URL(value, "https://irescue.invalid");
    return SENSITIVE_VOLUNTEER_TRAINING_PATH.test(parsed.pathname);
  } catch {
    return SENSITIVE_VOLUNTEER_TRAINING_PATH.test(value);
  }
}

export function tokenFreeCanonical(value: string, origin?: string): string {
  const parsed = new URL(value, origin || "https://irescue.life");
  if (!isSensitiveVolunteerTrainingUrl(parsed.href)) return parsed.href;
  const segments = parsed.pathname.split("/");
  const trainingIndex = segments.findIndex(segment => segment.toLowerCase() === "volunteer-training");
  parsed.pathname = segments.slice(0, trainingIndex + 1).join("/") || "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed.href;
}
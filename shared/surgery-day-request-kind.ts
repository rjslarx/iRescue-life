import { z } from "zod";

// Keep the existing organization display field usable in staff views, emails,
// and PDFs without creating a fictitious partner organization.
export function normalizeSurgeryDayRequest(input: unknown, subdomain?: string | null) {
  const kind = z.object({ feralCats: z.boolean().optional() }).passthrough().parse(input);
  if (!kind.feralCats) return input;
  if (subdomain !== "haseyas") {
    throw new z.ZodError([{ code: "custom", path: ["feralCats"], message: "Feral cat requests are not available for this rescue" }]);
  }
  z.object({
    animals: z.array(z.object({ species: z.literal("cat") })).min(1),
  }).parse(input);
  return { ...kind, organizationName: "Feral cats", partnerOrganizationId: null };
}

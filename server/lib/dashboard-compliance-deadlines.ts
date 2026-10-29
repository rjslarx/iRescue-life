type DashboardObligation = {
  animalId: string;
  obligationType: string;
  status: string;
  contractualDueDate: string;
  label?: string;
};

const TYPES: Record<string, string> = {
  rabies: "rabies", rabies_booster: "rabies", dhpp_booster: "dhpp",
  fvrcp: "fvrcp", fvrcp_booster: "fvrcp", felv: "felv",
  bordetella: "bordetella", leptospirosis: "lepto", lyme: "lyme",
  canine_influenza: "influenza",
  heartworm_prevention_proof: "prevention:heartworm",
  flea_tick_prevention: "prevention:flea_tick",
};
// Custom requirements are free text: only unambiguous vaccine/prevention names
// qualify. "Rabies certificate", tests, treatment and arbitrary instructions do not.
const LABELS: Record<string, string> = {
  rabies: "rabies", "rabies vaccine": "rabies",
  dhpp: "dhpp", dapp: "dhpp", da2pp: "dhpp", "dhpp booster": "dhpp",
  fvrcp: "fvrcp", hcp: "fvrcp", "fvrcp booster": "fvrcp",
  felv: "felv", "felv vaccine": "felv", bordetella: "bordetella",
  "bordetella vaccine": "bordetella", leptospirosis: "lepto", lepto: "lepto",
  lyme: "lyme", "canine influenza": "influenza",
  "heartworm prevention": "prevention:heartworm",
  "flea/tick prevention": "prevention:flea_tick",
};
export function dashboardCoverageKey(ob: Pick<DashboardObligation, "obligationType" | "label">): string | undefined {
  if (ob.obligationType === "custom") return LABELS[(ob.label || "").trim().toLowerCase()];
  return TYPES[ob.obligationType];
}

/** Project a display deadline without changing the signed contract or completion state.
 * Restrict matching to supported types and exact labels, never arbitrary treatment.
 */
export function resolveDashboardComplianceDeadlines<T extends DashboardObligation>(
  obligations: T[], expiries: Map<string, Map<string, Date>>,
): T[] {
  return obligations.map(ob => {
    const key = dashboardCoverageKey(ob);
    if (ob.status !== "pending" || !key) return ob;
    const stored = new Date(ob.contractualDueDate);
    const expiry = expiries.get(ob.animalId)?.get(key);
    const effective = expiry && stored < expiry ? expiry : stored;
    if (!Number.isFinite(effective.getTime()) || effective.getTime() === stored.getTime()) return ob;
    // Existing dashboard consumers use contractualDueDate for grouping and display.
    // Preserve its recorded value explicitly; this projection is never persisted.
    return { ...ob, recordedContractualDueDate: ob.contractualDueDate, contractualDueDate: effective.toISOString().slice(0, 10) };
  });
}

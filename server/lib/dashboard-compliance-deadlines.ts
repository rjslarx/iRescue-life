import { rabiesReminderDeadline } from "./current-rabies-coverage";

type DashboardObligation = {
  animalId: string;
  obligationType: string;
  status: string;
  contractualDueDate: string;
};

/** Project a display deadline without changing the signed contract or completion state.
 * Restrict matching to supported rabies types, not arbitrary labels/custom obligations.
 */
export function resolveDashboardComplianceDeadlines<T extends DashboardObligation>(
  obligations: T[], expiries: Map<string, Map<string, Date>>,
): T[] {
  return obligations.map(ob => {
    if (ob.status !== "pending" || !["rabies", "rabies_booster"].includes(ob.obligationType)) return ob;
    const stored = new Date(ob.contractualDueDate);
    const effective = rabiesReminderDeadline("rabies", stored, expiries.get(ob.animalId)?.get("rabies") || null);
    if (!Number.isFinite(effective.getTime()) || effective.getTime() === stored.getTime()) return ob;
    // Existing dashboard consumers use contractualDueDate for grouping and display.
    // Preserve its recorded value explicitly; this projection is never persisted.
    return { ...ob, recordedContractualDueDate: ob.contractualDueDate, contractualDueDate: effective.toISOString().slice(0, 10) };
  });
}

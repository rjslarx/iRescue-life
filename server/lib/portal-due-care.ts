import { vaccineReminderDeadline } from "./vaccine-renewal-coverage";

type DueCareRecord = {
  id: string;
  careName: string;
  careCategory: string;
  nextDueDate: Date | string | null;
};

/** Resolve medical alert dates only; never modify history or contract/proof obligations. */
export function resolvePortalDueCare<T extends DueCareRecord>(
  records: T[],
  confirmedIds: ReadonlySet<string | null>,
  expiries: Map<string, Date>,
  today: Date,
  horizon: Date,
) {
  return records
    .filter(r => !confirmedIds.has(r.id))
    .map(r => {
      const due = r.nextDueDate ? new Date(r.nextDueDate) : null;
      const resolved = due && r.careCategory === "vaccine"
        ? vaccineReminderDeadline(r.careName, due, expiries)
        : due;
      return {
        ...r,
        nextDueDate: resolved && due && resolved.getTime() !== due.getTime()
          ? resolved : r.nextDueDate,
        isOverdue: resolved ? resolved < today : false,
      };
    })
    .filter(r => r.nextDueDate !== null && new Date(r.nextDueDate) <= horizon);
}

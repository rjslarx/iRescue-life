import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { medicalDeadlineFields, medicalDeadlineWarnings, type MedicalDeadlines } from "@shared/adoption-medical-dates";

export function useAdoptionMedicalDeadlines(animalId: string | undefined, open: boolean) {
  const [edited, setEdited] = useState<MedicalDeadlines | null>(null);
  const [confirmedSnapshot, setConfirmedSnapshot] = useState<string | null>(null);
  const query = useQuery<{ dates: MedicalDeadlines; today: string }>({
    queryKey: ["/api/adoptions/medical-dates", animalId],
    queryFn: async () => (await apiRequest("GET", `/api/adoptions/medical-dates/${animalId}`)).json(),
    enabled: open && !!animalId,
    staleTime: 0,
  });
  useEffect(() => { setEdited(null); setConfirmedSnapshot(null); }, [open, animalId]);
  const dates = edited ?? query.data?.dates ?? {};
  let warnings: string[] = [];
  let invalid = "";
  try { warnings = medicalDeadlineWarnings(dates, query.data?.dates ?? {}, query.data?.today ?? ""); }
  catch (error) { invalid = (error as Error).message; }
  const snapshot = JSON.stringify({ dates, warnings });
  const confirmed = confirmedSnapshot === snapshot;
  const ready = !!query.data && !query.isFetching && !query.isError && !invalid && (!warnings.length || confirmed);
  return { dates, setDates: setEdited, warnings, invalid, confirmed, ready,
    confirm: (value: boolean) => setConfirmedSnapshot(value ? snapshot : null),
    loading: query.isFetching, error: query.isError };
}

export function AdoptionMedicalDeadlines({ review }: { review: ReturnType<typeof useAdoptionMedicalDeadlines> }) {
  return <section className="space-y-3 rounded-md border p-4">
    <h3 className="font-medium">Medical deadlines</h3>
    <p className="text-sm text-muted-foreground">
      Prefilled from administered medical care, not adoption placeholders. These are contractual deadlines,
      not new doses. Saving will not change vaccination history or existing signed contracts.
    </p>
    {review.loading && <p role="status">Loading medical records…</p>}
    {review.error && <p role="alert">Could not load medical records. Reopen this dialog to retry.</p>}
    {medicalDeadlineFields.map(field => <label key={field.key} className="block text-sm">
      {field.label}
      <Input type="date" value={review.dates[field.key] || ""} disabled={review.loading || review.error}
        onChange={event => review.setDates({ ...review.dates, [field.key]: event.target.value })} />
    </label>)}
    {review.invalid && <p role="alert">{review.invalid}</p>}
    {!!review.warnings.length && <div className="space-y-2 text-sm" role="alert">
      {review.warnings.map(warning => <p key={warning}>{warning}</p>)}
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={review.confirmed} onChange={event => review.confirm(event.target.checked)} />
        I reviewed these dates and intentionally accept the past or conflicting deadlines.
      </label>
    </div>}
  </section>;
}

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { CheckCircle2, Grid3X3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SQUARE_SMS_CONSENT, freeSquareReservationSchema } from "@shared/free-squares";
import { SquareEmpty, SquareError, SquareFreeNotice, SquareGrid, SquareLoading, SquareScore, SquareStatus, useSquarePrivacy } from "./SquareComponents";
import { squareErrorStatus, squareRequest, useFreeSquaresAccess, usePublicFreeSquare } from "./use-free-squares";

type ReservationResult = { reservation: { id: string; squares: number[] }; replay?: true };
export default function PublicFreeSquaresPage() {
  const { id = "" } = useParams<{ id: string }>();
  return <PublicBoard key={id} id={id} />;
}
function PublicBoard({ id }: { id: string }) {
  useSquarePrivacy();
  const access = useFreeSquaresAccess();
  const query = usePublicFreeSquare(id, access.publicAllowed);
  const [selected, setSelected] = useState<number[]>([]);
  const [form, setForm] = useState({ name: "", email: "", phone: "", smsConsent: false });
  const [validation, setValidation] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [success, setSuccess] = useState<number[] | null>(null);
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  const inFlight = useRef(false);
  const reserve = useMutation({
    retry: false,
    mutationFn: (data: ReturnType<typeof freeSquareReservationSchema.parse>) =>
      squareRequest<ReservationResult>("POST", `/api/free-squares/public/${id}/reservations`, data),
  });
  const change = (next: typeof form) => { setForm(next); request.current = null; setValidation(null); reserve.reset(); };
  if (access.tenantLoading) return <SquareLoading />;
  if (access.error) return <main className="free-squares mx-auto max-w-3xl p-6"><SquareError error={access.error} retry={() => void access.retry()} /></main>;
  if (!access.publicAllowed) return <main className="free-squares mx-auto max-w-3xl p-6"><SquareEmpty title="Board unavailable">This community board is not available for this rescue.</SquareEmpty></main>;
  if (query.isLoading) return <SquareLoading />;
  if (query.error && !query.data) return <main className="free-squares mx-auto max-w-3xl p-6"><SquareError error={new Error(squareErrorStatus(query.error) === 404 ? "This board is not available. It may still be a draft or have been archived." : "We could not load this community board.")} retry={() => void query.refetch()} /></main>;
  if (!query.data) return null;
  const { board, claimedSquares } = query.data;
  if (board.status === "draft" || board.status === "archived") return <main className="free-squares mx-auto max-w-3xl p-6"><SquareEmpty title="Board unavailable">This board is not currently shared with the community.</SquareEmpty></main>;
  const isOpen = board.status === "open";
  const submit = async () => {
    if (inFlight.current || !isOpen) return;
    const fingerprint = JSON.stringify({ ...form, squares: selected });
    if (!request.current || request.current.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() };
    const parsed = freeSquareReservationSchema.safeParse({ ...form, squares: selected, requestKey: request.current.key });
    if (!parsed.success) { setValidation(parsed.error.issues.map(issue => issue.message).join(". ")); return; }
    setValidation(null); setNotice(null); inFlight.current = true;
    try {
      const result = await reserve.mutateAsync(parsed.data);
      setSuccess(result.reservation.squares);
      setSelected([]);
      request.current = null;
      void query.refetch();
    } catch (error) {
      if (squareErrorStatus(error) === 409) {
        const refreshed = await query.refetch();
        if (refreshed.data) {
          setSelected(old => old.filter(number => !refreshed.data!.claimedSquares.includes(number)));
          request.current = null;
        }
        setNotice("The board changed while you were choosing. We refreshed it and removed any newly claimed squares from your selection. Your contact details are still here; review your selection and try again.");
      }
    } finally { inFlight.current = false; }
  };
  return <main className="free-squares min-h-[100dvh] bg-background pb-12">
    <div className="mx-auto max-w-6xl px-3 py-5 md:px-8 md:py-10 space-y-6 sq-enter">
      <header className="flex gap-3 items-center"><span className="rounded-xl border p-2.5 bg-muted/30"><Grid3X3 className="h-5 w-5" /></span><div><p className="font-semibold">{access.tenant?.name}</p><p className="text-xs text-muted-foreground">A shared community game board</p></div></header>
      <section className="sq-banner space-y-4">
        <div className="sq-actions justify-between"><p className="sq-eyebrow">Football. Friends. Our rescue.</p><SquareStatus status={board.status} /></div>
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight break-words">{board.title}</h1>
        {board.description && <p className="max-w-3xl text-sm md:text-base whitespace-pre-wrap break-words">{board.description}</p>}
        <SquareFreeNotice />
      </section>
      {query.error && <SquareError error={new Error("The board could not refresh. Please refresh before reserving.")} retry={() => void query.refetch()} />}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.3fr)_minmax(280px,.8fr)] gap-6 items-start">
        <section className="sq-panel space-y-6">
          <SquareScore board={board} />
          <div className="flex items-baseline justify-between gap-3"><h2 className="font-semibold">Choose your squares</h2><span className="text-xs text-muted-foreground">{100 - claimedSquares.length} available</span></div>
          <SquareGrid claimed={claimedSquares} selected={selected} disabled={!isOpen || reserve.isPending || !!success} onSelect={number => {
            request.current = null; reserve.reset(); setValidation(null);
            setSelected(old => old.includes(number) ? old.filter(value => value !== number) : old.length < 10 ? [...old, number].sort((a, b) => a - b) : old);
          }} />
          <p className="text-xs text-muted-foreground">Choose 1–10 available squares. The board refreshes every 10 seconds. Names and contact details are never shown here.</p>
        </section>
        <section className="sq-panel space-y-5" aria-label="Reserve your free squares">
          {success ? <div className="space-y-5" role="status" data-testid="reservation-success">
            <CheckCircle2 className="h-10 w-10 text-primary" /><div><p className="sq-eyebrow mb-2">You're on the board</p><h2 className="text-2xl font-bold">Your squares are reserved.</h2></div>
            <div className="flex flex-wrap gap-2">{success.map(number => <span className="rounded-lg bg-primary/10 px-3 py-2 font-semibold tabular-nums" key={number}>#{number}</span>)}</div>
            <p className="text-sm text-muted-foreground">Your free reservation is confirmed now. Save these numbers for your records. Rescue staff may follow up personally using the contact details you shared.</p>
            <Button variant="outline" data-testid="button-new-reservation" onClick={() => { setSuccess(null); setForm({ name: "", email: "", phone: "", smsConsent: false }); setSelected([]); setNotice(null); reserve.reset(); request.current = null; }}>Back to the board</Button>
          </div> : !isOpen ? <div className="space-y-3"><h2 className="text-xl font-semibold">Reservations are closed</h2><p className="text-sm text-muted-foreground">You can still follow the board and scores. No new squares can be reserved.</p></div> : <form className="space-y-5" onSubmit={event => { event.preventDefault(); void submit(); }}>
            <div><p className="sq-eyebrow mb-2">Make it yours</p><h2 className="text-xl font-semibold">Reserve for free</h2><p className="text-sm text-muted-foreground mt-2">Pick your squares, then leave a way for our team to reach you.</p></div>
            <div className="rounded-lg bg-muted/50 p-3 space-y-2"><p className="text-sm font-medium" data-testid="selected-squares">{selected.length} of 10 selected</p><p className="text-sm">{selected.length ? selected.map(number => `#${number}`).join(", ") : "Tap an available square to get started."}</p>{selected.length > 0 && <Button type="button" variant="ghost" size="sm" disabled={reserve.isPending} onClick={() => { setSelected([]); request.current = null; reserve.reset(); }}>Clear selection</Button>}</div>
            <fieldset disabled={reserve.isPending} className="space-y-4">
              <div className="space-y-2"><Label htmlFor="square-name">Your name</Label><Input id="square-name" data-testid="input-reservation-name" autoComplete="name" required maxLength={100} value={form.name} onChange={event => change({ ...form, name: event.target.value })} /></div>
              <p className="text-xs text-muted-foreground">Provide an email address or phone number. Only one is required.</p>
              <div className="space-y-2"><Label htmlFor="square-email">Email address</Label><Input id="square-email" data-testid="input-reservation-email" type="email" autoComplete="email" maxLength={254} value={form.email} onChange={event => change({ ...form, email: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="square-phone">Phone number</Label><Input id="square-phone" data-testid="input-reservation-phone" type="tel" autoComplete="tel" maxLength={32} value={form.phone} onChange={event => change({ ...form, phone: event.target.value })} /></div>
              <label className="flex gap-3 rounded-lg border p-3 text-xs leading-relaxed cursor-pointer" htmlFor="square-sms-consent"><input id="square-sms-consent" data-testid="checkbox-sms-consent" type="checkbox" className="mt-1 shrink-0" checked={form.smsConsent} onChange={event => change({ ...form, smsConsent: event.target.checked })} /><span>{SQUARE_SMS_CONSENT}</span></label>
            </fieldset>
            {notice && <p role="alert" className="rounded-lg border p-3 text-sm">{notice}</p>}
            {validation && <SquareError error={new Error(validation)} />}
            {reserve.error && !notice && <SquareError error={reserve.error} />}
            <Button className="w-full" type="submit" data-testid="button-reserve-squares" disabled={reserve.isPending || !selected.length || !!query.error}>{reserve.isPending ? "Confirming reservation…" : reserve.error && squareErrorStatus(reserve.error) !== 409 ? "Retry this reservation" : "Confirm free reservation"}</Button>
            <SquareFreeNotice />
          </form>}
        </section>
      </div>
      <footer className="text-center text-xs text-muted-foreground pt-4">One community board. Clear reservations. A personal connection with your rescue.</footer>
    </div>
  </main>;
}

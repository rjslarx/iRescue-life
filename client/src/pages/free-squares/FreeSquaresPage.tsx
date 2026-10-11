import { useState } from "react";
import { Link, Redirect } from "wouter";
import { ArrowLeft, Copy, ExternalLink, Grid3X3, Mail, Plus, RefreshCw, Search } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTenant } from "@/contexts/TenantContext";
import type { FreeSquareBoard, FreeSquareReservation } from "@shared/free-squares";
import BoardEditor from "./BoardEditor";
import MessageComposer from "./MessageComposer";
import { SquareEmpty, SquareError, SquareFreeNotice, SquareGrid, SquareLoading, SquareScore, SquareStatus, useSquarePrivacy } from "./SquareComponents";
import { useAssignFreeSquareDigits, useFreeSquareBoards, useFreeSquareDetail, useFreeSquaresAccess, useReleaseFreeSquare, useSaveFreeSquareBoard } from "./use-free-squares";

export default function FreeSquaresPage() {
  useSquarePrivacy();
  const access = useFreeSquaresAccess();
  const boards = useFreeSquareBoards(access.allowed);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  if (access.loading) return <SquareLoading />;
  if (!access.user) return <Redirect to="/login" />;
  if (access.error) return <DashboardLayout><div className="free-squares"><SquareError error={access.error} retry={() => void access.retry()} /></div></DashboardLayout>;
  if (!access.allowed) return <DashboardLayout><div className="free-squares"><SquareEmpty title="Community squares are not available">This tool is available only to staff at Haseyas and Southern Pets. Switch to an eligible staff role if you have one.</SquareEmpty></div></DashboardLayout>;
  return <DashboardLayout>
    <div className="free-squares space-y-6 sq-enter" data-testid="free-squares-management">
      {selectedId ? <BoardDetail key={selectedId} id={selectedId} onBack={() => setSelectedId(null)} /> : <>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="sq-eyebrow mb-2">Community, not comment threads</p><h1 className="text-2xl md:text-3xl font-bold tracking-tight">Football squares</h1><p className="text-muted-foreground mt-2 max-w-2xl text-sm">A shared board for your rescue. Clear reservations and personal follow-up, all in one place.</p></div>
          <Button onClick={() => setCreateOpen(true)} data-testid="button-create-board"><Plus className="h-4 w-4 mr-2" />Create board</Button>
        </header>
        <section className="sq-banner flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2"><h2 className="font-semibold text-lg">A place for everyone on game day.</h2><SquareFreeNotice /><p className="text-sm text-muted-foreground">Share the board link directly. Participant details stay staff-only; messages are always sent individually by your team.</p></div>
          <Grid3X3 className="hidden md:block h-14 w-14 shrink-0 opacity-40" strokeWidth={1.1} />
        </section>
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-2"><Label htmlFor="square-board-filter">Boards</Label><select id="square-board-filter" className="rounded-md border bg-background px-3 py-2 text-sm" value={filter} onChange={event => setFilter(event.target.value)}>{["all", "draft", "open", "closed", "archived"].map(status => <option value={status} key={status}>{status === "all" ? "All boards" : `${status[0].toUpperCase()}${status.slice(1)}`}</option>)}</select></div>
          <Button variant="ghost" size="sm" disabled={boards.isFetching} onClick={() => void boards.refetch()}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
        </div>
        {boards.isLoading ? <SquareLoading /> : boards.error ? <SquareError error={boards.error} retry={() => void boards.refetch()} /> : boards.data?.boards.length === 0 ? <SquareEmpty title="Your first community board starts here"><p className="mb-4">Create a draft, add the teams, then open it when you're ready to welcome your community.</p><Button onClick={() => setCreateOpen(true)} data-testid="button-create-first-board">Create your first board</Button></SquareEmpty> : <div className="space-y-3">
          {boards.data?.boards.filter(board => filter === "all" || board.status === filter).map(board => <article key={board.id} className="sq-panel flex flex-col md:flex-row md:items-center justify-between gap-5" data-testid={`board-card-${board.id}`}>
            <div className="space-y-2 min-w-0"><SquareStatus status={board.status} /><h2 className="font-semibold text-lg break-words">{board.title}</h2><p className="text-sm text-muted-foreground break-words">{board.home_team} vs {board.away_team}</p>
              <p className="text-xs text-muted-foreground">{board.claimed_count ?? 0} / 100 squares claimed · {board.reservation_count ?? 0} reservations</p></div>
            <Button variant="outline" data-testid={`button-manage-board-${board.id}`} onClick={() => setSelectedId(board.id)}>Manage board</Button>
          </article>)}
          {boards.data?.boards.length && !boards.data.boards.some(board => filter === "all" || board.status === filter) ? <SquareEmpty title={`No ${filter} boards`}>Choose another status to see your community boards.</SquareEmpty> : null}
        </div>}
      </>}
      {createOpen && <BoardEditor onClose={() => setCreateOpen(false)} onSaved={board => { setCreateOpen(false); setSelectedId(board.id); }} />}
    </div>
  </DashboardLayout>;
}

function BoardDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const detail = useFreeSquareDetail(id, true);
  const save = useSaveFreeSquareBoard();
  const release = useReleaseFreeSquare(id);
  const assignDigits = useAssignFreeSquareDigits(id);
  const { basePath } = useTenant();
  const [editing, setEditing] = useState(false);
  const [recipient, setRecipient] = useState<FreeSquareReservation | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<FreeSquareReservation | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [digitsConfirm, setDigitsConfirm] = useState(false);
  const [tab, setTab] = useState<"reservations" | "history" | "board">("reservations");
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  if (detail.isLoading) return <SquareLoading />;
  if (!detail.data) return <div className="space-y-4"><Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" />All boards</Button><SquareError error={detail.error || new Error("This board could not be found.")} retry={() => void detail.refetch()} /></div>;
  const { board, reservations, messages } = detail.data;
  const active = reservations.filter(item => !item.cancelled_at);
  const claimed = active.flatMap(item => item.squares);
  const digitsAssigned = !!board.digits_assigned_at;
  const claimedCount = new Set(claimed).size;
  const canAssignDigits = claimedCount === 100 && (board.status === "open" || board.status === "closed") && !digitsAssigned;
  const publicVisible = board.status === "open" || board.status === "closed";
  const updateStatus = (status: FreeSquareBoard["status"]) => save.mutate({ id, data: { status } }, { onSuccess: () => setArchiveConfirm(false) });
  const filtered = reservations.filter(item =>
    (filter === "all" || (filter === "active" ? !item.cancelled_at : !!item.cancelled_at)) &&
    `${item.name} ${item.email || ""} ${item.phone || ""} ${item.squares.join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  const latestRecipient = recipient ? reservations.find(item => item.id === recipient.id) ?? recipient : null;
  return <div className="space-y-6">
    <Button variant="ghost" onClick={onBack} data-testid="button-all-boards"><ArrowLeft className="h-4 w-4 mr-2" />All boards</Button>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-2"><SquareStatus status={board.status} /><h1 className="text-2xl md:text-3xl font-bold tracking-tight break-words">{board.title}</h1><p className="text-sm text-muted-foreground">{claimed.length} squares claimed · {active.length} active reservations · Staff-only contact details</p></div>
      <div className="sq-actions">
        <Button variant="outline" onClick={() => setEditing(true)} data-testid="button-edit-board">Edit board & templates</Button>
        {board.status !== "open" && !digitsAssigned && <Button disabled={save.isPending || assignDigits.isPending} onClick={() => updateStatus("open")} data-testid="button-open-board">{board.status === "draft" ? "Open board" : "Reopen board"}</Button>}
        {board.status === "archived" && digitsAssigned && <Button variant="outline" disabled={save.isPending} onClick={() => updateStatus("closed")} data-testid="button-restore-closed-board">Restore as closed</Button>}
        {board.status === "open" && <Button disabled={save.isPending} variant="outline" onClick={() => updateStatus("closed")} data-testid="button-close-board">Close reservations</Button>}
        {board.status !== "archived" && <Button variant="ghost" disabled={save.isPending} onClick={() => setArchiveConfirm(true)} data-testid="button-archive-board">Archive</Button>}
      </div>
    </header>
    {save.error && <SquareError error={save.error} />}
    {detail.error && <SquareError error={new Error("The latest board update could not be loaded. Displayed details may be out of date.")} retry={() => void detail.refetch()} />}
    <section className="sq-banner space-y-4">
      <SquareFreeNotice />
      <div className="sq-actions">
        {publicVisible ? <>
          <Link className="inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4" href={`/squares/${id}`} target="_blank" rel="noopener noreferrer" data-testid="link-public-board"><ExternalLink className="h-4 w-4" />View shared board</Link>
          <Button variant="outline" size="sm" data-testid="button-copy-board-link" onClick={async () => {
            try { await navigator.clipboard.writeText(`${window.location.origin}${basePath}/squares/${id}`); setCopyState("copied"); } catch { setCopyState("error"); }
          }}><Copy className="h-4 w-4 mr-2" />{copyState === "copied" ? "Link copied" : "Copy board link"}</Button>
        </> : <p className="text-sm">This {board.status} board is not publicly accessible. Open it to share reservations.</p>}
      </div>
      {copyState === "error" && <p role="alert" className="text-sm text-destructive">Could not copy the link. Open “View shared board” and copy its address instead.</p>}
      <p className="text-xs text-muted-foreground">Shared by direct link only. This page and the public board request no search indexing. Reservations are confirmed immediately; your team decides when to reach out.</p>
    </section>
    <section className="sq-panel space-y-3" aria-label="Score digit assignment">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h2 className="font-semibold">{digitsAssigned ? "Score digits are locked" : "Assign score digits"}</h2>
          <p className="text-sm text-muted-foreground">{digitsAssigned ? "Reservations, releases and team names are locked. You can still update scores, descriptions and message templates, or archive this board." : "Once all 100 squares are reserved, assign 0–9 once each to the home columns and away rows, shuffled independently."}</p>
        </div>
        {!digitsAssigned && <Button variant="outline" disabled={!canAssignDigits || assignDigits.isPending || save.isPending || release.isPending || !!detail.error || detail.isFetching} onClick={() => { assignDigits.reset(); setDigitsConfirm(true); }} data-testid="button-assign-digits">Assign digits</Button>}
      </div>
      <p className="text-xs text-muted-foreground" role="status">{digitsAssigned ? `Assigned ${new Date(board.digits_assigned_at!).toLocaleString()}. Permanent; no reshuffle.` : canAssignDigits ? "100 of 100 reserved. Ready to assign. This permanently closes reservations and locks releases and team names." : `Readiness: ${claimedCount} of 100 squares reserved.${claimedCount < 100 ? ` ${100 - claimedCount} more needed.` : ""}${board.status !== "open" && board.status !== "closed" ? " The board must be open or closed before assignment." : ""} Digits cannot be assigned early.`}</p>
      {assignDigits.error && !digitsConfirm && <SquareError error={assignDigits.error} retry={() => void detail.refetch()} />}
    </section>
    <div className="flex flex-wrap gap-2 border-b pb-3" role="tablist" aria-label="Board sections">
      {(["reservations", "history", "board"] as const).map(value => <Button key={value} role="tab" aria-selected={tab === value} variant={tab === value ? "default" : "ghost"} onClick={() => setTab(value)} data-testid={`tab-${value}`}>{value === "reservations" ? "Reservations" : value === "history" ? `Message history (${messages.length})` : "Board & scores"}</Button>)}
    </div>
    <section role="tabpanel" className="space-y-4">
      {tab === "board" ? <div className="sq-panel max-w-2xl space-y-6"><SquareScore board={board} /><SquareGrid board={board} claimed={claimed} /><p className="text-xs text-muted-foreground">The shared board uses these same team axes and digits. Edit the board to update scores{digitsAssigned ? "." : " or team names."}</p></div> : tab === "history" ? <>
        <p className="text-sm text-muted-foreground">Only staff-initiated individual messages appear here. Accepted does not mean delivered. Sending and unknown outcomes must not be silently retried.</p>
        {messages.length === 0 ? <SquareEmpty title="No messages sent yet">Choose an active reservation to write a personal email or text. Reserving a square never sends a background message.</SquareEmpty> : messages.map(message => <article className="sq-panel space-y-3" key={message.id} data-testid={`message-history-${message.id}`}>
          <div className="flex flex-wrap gap-2 justify-between"><div><p className="font-medium">{reservations.find(item => item.id === message.reservation_id)?.name || "Reservation contact"}</p><p className="text-xs text-muted-foreground">{message.channel === "email" ? "Email" : "Text message"} · {new Date(message.created_at).toLocaleString()}</p></div><Badge variant={message.status === "failed" ? "destructive" : "secondary"} className="h-fit">{message.status === "accepted" ? "Accepted by provider" : message.status === "sending" ? "Processing" : message.status === "unknown" ? "Unknown outcome" : "Failed"}</Badge></div>
          {message.subject && <p className="font-medium text-sm break-words">{message.subject}</p>}<p className="text-sm sq-message">{message.body}</p>
          {message.error && <p className="text-sm text-destructive break-words" role="alert">{message.error}</p>}
          {message.status === "accepted" && <p className="text-xs text-muted-foreground">Provider acceptance is recorded; delivery is not confirmed.</p>}
          {(message.status === "unknown" || message.status === "sending") && <p className="text-xs text-muted-foreground">{message.status === "sending" ? "Processing. If this status remains, check with the provider; never automatically retry." : "Outcome not confirmed. Check with the provider before sending another message."}</p>}
        </article>)}
      </> : <>
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1"><Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" /><Input className="pl-9" aria-label="Search reservations" placeholder="Search name, contact or square number" value={search} onChange={event => setSearch(event.target.value)} data-testid="input-reservation-search" /></div>
          <select aria-label="Reservation status" className="rounded-md border bg-background px-3 py-2 text-sm" value={filter} onChange={event => setFilter(event.target.value)}><option value="active">Active reservations</option><option value="cancelled">Cancelled reservations</option><option value="all">All reservations</option></select>
        </div>
        {filtered.length === 0 ? <SquareEmpty title={reservations.length ? "No matching reservations" : "The board is ready for your community"}>{reservations.length ? "Try another search or reservation status." : "Once you open and share the board, reservations will appear here with private contact details."}</SquareEmpty> : filtered.map(reservation => {
          const canEmail = !!reservation.email && !reservation.email_revoked_at;
          const canSms = !!reservation.phone && !!reservation.sms_consent_at && !reservation.sms_revoked_at;
          const hasUncertainMessage = messages.some(message => message.reservation_id === reservation.id && (message.status === "sending" || message.status === "unknown"));
          return <article key={reservation.id} className="sq-panel space-y-4" data-testid={`reservation-${reservation.id}`}>
            <div className="flex flex-col md:flex-row justify-between gap-4">
              <div className="min-w-0 space-y-2"><div className="flex flex-wrap gap-2 items-center"><h3 className="font-semibold break-words">{reservation.name}</h3>{reservation.cancelled_at && <Badge variant="secondary">Cancelled</Badge>}</div><div className="sq-contact text-sm text-muted-foreground"><p>{reservation.email || "No email provided"}</p><p>{reservation.phone || "No phone provided"}</p></div><p className="text-xs text-muted-foreground">{reservation.sms_revoked_at ? "Text consent revoked" : reservation.sms_consent_at ? `Text consent recorded ${new Date(reservation.sms_consent_at).toLocaleDateString()}` : "No text consent"}</p></div>
              <div className="sq-actions self-start"><Button variant="outline" size="sm" disabled={!!reservation.cancelled_at || (!canEmail && !canSms) || hasUncertainMessage} onClick={() => setRecipient(reservation)} data-testid={`button-message-reservation-${reservation.id}`}><Mail className="h-4 w-4 mr-2" />Message</Button>
                {!reservation.cancelled_at && <Button variant="ghost" size="sm" disabled={digitsAssigned || assignDigits.isPending} title={digitsAssigned ? "Releases are locked after digits are assigned." : undefined} onClick={() => { release.reset(); setReleaseTarget(reservation); }} data-testid={`button-release-reservation-${reservation.id}`}>Release squares</Button>}
              </div>
            </div>
            {reservation.email_revoked_at && <p className="text-xs text-muted-foreground">Email contact opted out; email messaging is disabled.</p>}
            {hasUncertainMessage && <p className="text-xs text-muted-foreground">A message is processing or has an unknown outcome. Check message history and the provider before sending another message.</p>}
            <div className="flex flex-wrap gap-1.5">{reservation.squares.map(number => <span key={number} className={`rounded-md border px-2 py-1 text-xs tabular-nums ${reservation.cancelled_at ? "line-through text-muted-foreground" : "bg-muted/40 font-medium"}`}>#{number}</span>)}</div>
            <p className="text-xs text-muted-foreground">Reserved {new Date(reservation.created_at).toLocaleString()}{reservation.cancelled_at ? ` · Released ${new Date(reservation.cancelled_at).toLocaleString()}` : ""}</p>
          </article>;
        })}
      </>}
    </section>
    {editing && <BoardEditor board={board} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
    {latestRecipient && <MessageComposer key={latestRecipient.id} board={board} reservation={latestRecipient} onClose={() => setRecipient(null)} />}
    <Dialog open={!!releaseTarget} onOpenChange={open => { if (!open && !release.isPending) setReleaseTarget(null); }}>
      <DialogContent className="free-squares max-h-[90dvh] overflow-y-auto" onInteractOutside={event => { if (release.isPending) event.preventDefault(); }} onEscapeKeyDown={event => { if (release.isPending) event.preventDefault(); }}>
        <DialogHeader><DialogTitle>Release this reservation?</DialogTitle><DialogDescription>This cancels the entire reservation and makes its squares available again. No message is sent to the participant.</DialogDescription></DialogHeader>
        <p className="text-sm break-words">{releaseTarget?.name}: {releaseTarget?.squares.map(number => `#${number}`).join(", ")}</p>
        {release.error && <SquareError error={release.error} />}
        {digitsAssigned && <p className="text-sm text-muted-foreground">Digits have been assigned. This reservation can no longer be released.</p>}
        <div className="sq-actions justify-end"><Button variant="outline" disabled={release.isPending} onClick={() => setReleaseTarget(null)}>Keep reservation</Button><Button variant="destructive" disabled={release.isPending || digitsAssigned || assignDigits.isPending} data-testid="button-confirm-release" onClick={() => { if (releaseTarget && !digitsAssigned) release.mutate(releaseTarget.id, { onSuccess: () => setReleaseTarget(null) }); }}>{release.isPending ? "Releasing…" : "Confirm release"}</Button></div>
      </DialogContent>
    </Dialog>
    <Dialog open={archiveConfirm} onOpenChange={open => { if (!save.isPending) setArchiveConfirm(open); }}>
      <DialogContent className="free-squares max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Archive this board?</DialogTitle><DialogDescription>The public link will stop showing the board. Staff keep the reservations and message history. {digitsAssigned ? "You can restore it as closed later; reservations cannot reopen." : "You can reopen it later."}</DialogDescription></DialogHeader>
        {save.error && <SquareError error={save.error} />}
        <div className="sq-actions justify-end"><Button variant="outline" disabled={save.isPending} onClick={() => setArchiveConfirm(false)}>Keep board</Button><Button disabled={save.isPending} onClick={() => updateStatus("archived")} data-testid="button-confirm-archive">{save.isPending ? "Archiving…" : "Archive board"}</Button></div>
      </DialogContent>
    </Dialog>
    <Dialog open={digitsConfirm} onOpenChange={open => { if (!assignDigits.isPending) setDigitsConfirm(open); }}>
      <DialogContent className="free-squares max-h-[90dvh] overflow-y-auto" onInteractOutside={event => { if (assignDigits.isPending) event.preventDefault(); }} onEscapeKeyDown={event => { if (assignDigits.isPending) event.preventDefault(); }}>
        <DialogHeader><DialogTitle>Permanently assign score digits?</DialogTitle><DialogDescription>Each axis gets its own independent random shuffle of 0–9, with every digit used exactly once. This cannot be undone or reshuffled.</DialogDescription></DialogHeader>
        <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
          <p><strong>{board.home_team}</strong>: columns across the top.</p>
          <p><strong>{board.away_team}</strong>: rows down the left.</p>
          <p>All 100 reservations stay in place. Reservations close, square releases stop, and team names are locked. Scores, descriptions and message templates remain editable.</p>
        </div>
        {!canAssignDigits && <p role="alert" className="text-sm text-destructive">The board has changed and is no longer ready for assignment. Review the updated board before continuing.</p>}
        {assignDigits.error && <><SquareError error={assignDigits.error} retry={() => void detail.refetch()} /><p className="text-xs text-muted-foreground">Another staff member may have changed the board. We requested the latest details; review them before trying again.</p></>}
        <div className="sq-actions justify-end">
          <Button variant="outline" disabled={assignDigits.isPending} onClick={() => setDigitsConfirm(false)}>Not yet</Button>
          <Button disabled={!canAssignDigits || assignDigits.isPending || save.isPending || release.isPending || !!detail.error || detail.isFetching} data-testid="button-confirm-assign-digits" onClick={() => { if (canAssignDigits) assignDigits.mutate(undefined, { onSuccess: () => { setDigitsConfirm(false); setTab("board"); } }); }}>{assignDigits.isPending ? "Assigning digits…" : "Assign permanently"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}

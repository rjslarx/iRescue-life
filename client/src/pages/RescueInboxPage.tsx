import { useEffect, useRef, useState } from "react";
import { Link, useSearch } from "wouter";
import { Inbox, MessageSquare, LockKeyhole, Play, ArrowLeft, CheckCheck } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { tenantApiRequest } from "@/lib/tenantApi";
import { RescueInboxSettings } from "@/components/rescue-inbox/RescueInboxSettings";
import { RescueInboxImage } from "@/components/rescue-inbox/RescueInboxImage";
import { RescueInboxAlerts } from "@/components/rescue-inbox/RescueInboxAlerts";
import { RescueInboxCalls } from "@/components/rescue-inbox/RescueInboxCalls";
import LoginForm from "@/components/LoginForm";
import { canClaimHelp } from "@shared/rescue-help";
import { RescueHelpError, rescueHelpError, useRescueInbox, type RescueInboxApi, type RescueMessage, type RescueThread } from "@/hooks/use-rescue-inbox";
import "@/components/rescue-inbox/rescue-inbox.css";
import "@/components/rescue-inbox/mobile-conversations.css";

function Loading() { return <div role="status" aria-label="Loading rescue inbox"><div className="ri-skeleton" /><div className="ri-skeleton" /><div className="ri-skeleton" /></div>; }
function ErrorState({ error, retry }: { error: unknown; retry: () => void }) {
  const status = error instanceof RescueHelpError ? error.status : null;
  return <div className="ri-empty" role="alert"><LockKeyhole size={30} /><h2>{status === 401 ? "Please sign in again" : status === 403 ? "A place on the inbox team is required" : "The inbox could not load"}</h2><p className="ri-muted">{status === 403 ? "Ask your rescue administrator to add you to the Rescue Inbox team. General dashboard access is not enough." : rescueHelpError(error)}</p>{status === 401 ? <Link className="ri-btn primary" href="/login">Sign in</Link> : <button className="ri-btn" onClick={retry}>Check again</button>}</div>;
}
const labels: Record<RescueThread["status"], string> = { bot: "Approved answers", waiting: "Needs a person", human: "With team", resolved: "Resolved" };
function time(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
function Voicemail({ message, onDelete }: { message: RescueMessage; onDelete?: () => Promise<unknown> }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const objectUrl = useRef("");
  const mounted = useRef(true);
  const deleting = useRef(false);
  const [deleted, setDeleted] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }; }, []);
  if (deleted) return <p role="status">Voicemail deleted.</p>;
  return <div>{url ? <audio className="ri-audio" controls autoPlay src={url} aria-label="Voicemail recording" onError={() => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = ""; setUrl("");
    setError("Your browser could not play this recording. Refresh the page and try again.");
  }} /> : <button type="button" className="ri-btn mt-2" disabled={busy} onClick={async () => {
    setError(""); setBusy(true);
    try { const response = await tenantApiRequest("GET", `/api/rescue-help/messages/${encodeURIComponent(message.id)}/audio`); const blob = await response.blob(); if (!mounted.current) return; objectUrl.current = URL.createObjectURL(blob); setUrl(objectUrl.current); }
    catch { if (mounted.current) setError("Recording could not load. Please try again."); }
    finally { if (mounted.current) setBusy(false); }
  }}><Play size={14} />{busy ? "Please wait…" : "Play voicemail"}</button>}
    {onDelete && <button type="button" className="ri-btn danger mt-2" disabled={busy} onClick={async () => {
      if (deleting.current || !window.confirm("Permanently delete this voicemail recording from Twilio? This cannot be undone. The conversation and a deleted-voicemail entry will be kept.")) return;
      deleting.current = true; setBusy(true); setError("");
      // Stop playback and release locally loaded audio before deleting.
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = ""; setUrl("");
      try { await onDelete(); if (mounted.current) setDeleted(true); }
      catch (err) { if (mounted.current) setError(rescueHelpError(err)); }
      finally { deleting.current = false; if (mounted.current) setBusy(false); }
    }}>Delete voicemail</button>}
    {error && <p className="ri-error" role="alert">{error}</p>}<small>Voice recording · no transcription</small></div>;
}
function Conversation({ api, enabled }: { api: RescueInboxApi; enabled: boolean }) {
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"outbound" | "note">("outbound");
  const [error, setError] = useState<unknown>(null);
  const [uncertain, setUncertain] = useState(false);
  const [sent, setSent] = useState("");
  const submitting = useRef(false);
  const data = api.detail.data;
  if (api.detail.isError) return <ErrorState error={api.detail.error} retry={() => void api.detail.refetch()} />;
  if (!data) return <Loading />;
  const { thread, messages } = data;
  const list = api.threads.data;
  const admin = list?.admin === true;
  const mine = !!thread.assigneeId && thread.assigneeId === list?.userId;
  const canManage = admin || mine;
  const pending = api.claim.isPending || api.update.isPending || api.send.isPending;
  async function action(run: () => Promise<unknown>) { setError(null); try { await run(); } catch (err) { setError(err); } }
  return <div className="ri-detail">
    {admin && <RescueInboxAlerts api={api} />}
    <div className="ri-detail-head"><div className="ri-toolbar"><div><h2>{thread.phone}</h2><p className="ri-muted mt-1">{thread.topic || "General conversation"} · {list?.team.find(m => m.id === thread.assigneeId)?.name || (thread.assigneeId ? "Assigned team member" : "Unassigned")}</p></div><span className={`ri-badge ${thread.status}`}>{labels[thread.status]}</span></div>
      <div className="ri-toolbar mt-4">
        {!thread.assigneeId && <button className="ri-btn primary" disabled={pending || !api.settings.data || !canClaimHelp(api.settings.data.settings,{status:thread.status,topic:thread.topic,assignee_id:null},list?.userId || "",admin)} onClick={() => void action(() => api.claim.mutateAsync(thread.id))}>Claim conversation</button>}
        {admin && <label className="ri-field"><span>Assign to</span><select aria-label="Assign conversation" disabled={pending} value={thread.assigneeId || ""} onChange={e => void action(() => api.update.mutateAsync({ id: thread.id, assigneeId: e.target.value || null }))}><option value="">Unassigned</option>{thread.assigneeId && !list?.team.some(m => m.id === thread.assigneeId) && <option value={thread.assigneeId}>Assigned team member</option>}{list?.team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
        {canManage && <div className="flex gap-2 flex-wrap">{thread.assigneeId && <button className="ri-btn" disabled={pending} onClick={() => { if (window.confirm("Release this conversation so another category volunteer can claim it? The category team may receive an alert.")) void action(() => api.update.mutateAsync({ id: thread.id, status: "waiting", assigneeId:null })); }}>Release to category team</button>}{thread.status !== "resolved" && <button className="ri-btn" disabled={pending} onClick={() => void action(() => api.update.mutateAsync({ id: thread.id, status: "resolved" }))}><CheckCheck size={15} />Resolve</button>}</div>}
      </div><p className="ri-muted mt-3">One volunteer claims and replies; administrators can override or reassign. Other category volunteers can still read the conversation. Release it to let someone else take over.</p>
      <RescueInboxCalls api={api} threadId={thread.id} canManage={canManage} />
    </div>
    <div className="ri-messages" aria-label="Conversation messages">{messages.length ? messages.map(message => <article key={message.id} className={`ri-message ${message.kind}`}>
      {message.kind === "note" && <span className="ri-badge mb-2"><LockKeyhole size={11} />Internal note · team only</span>}
      <p>{message.body || (message.kind === "voicemail" ? "Voicemail received" : "")}</p>
      {Array.from({length: Math.min(message.mediaCount || 0,10)},(_,index) => <RescueInboxImage key={index} messageId={message.id} index={index} />)}
      {message.kind === "voicemail" && (message.hasRecording ? <Voicemail message={message} onDelete={admin ? () => api.deleteVoicemail.mutateAsync(message.id) : undefined} /> : <small>{message.status === "deleted" ? "Recording permanently removed" : "No recording available"}</small>)}
      <small>{message.authorName || (message.kind === "inbound" || message.kind === "voicemail" ? "Caller" : "Rescue team")} · {time(message.createdAt)}{message.status ? ` · ${message.status}` : ""}</small>
    </article>) : <div className="ri-empty"><MessageSquare size={28} /><h3>No messages yet</h3><p className="ri-muted">Messages and internal notes will appear here.</p></div>}</div>
    <form className="ri-composer" onSubmit={async e => {
      e.preventDefault(); if (submitting.current || uncertain || !body.trim()) return;
      submitting.current = true; setError(null); setSent("");
      const requestId = crypto.randomUUID();
      try { await api.send.mutateAsync({ id: thread.id, body: body.trim(), kind, requestId }); setBody(""); setSent(kind === "note" ? "Internal note saved." : "Reply submitted. Check the message delivery status above."); }
      catch (err) { setError(err); setUncertain(true); }
      finally { submitting.current = false; }
    }}>
      <div className="flex gap-2 mb-3"><button type="button" className="ri-btn" aria-pressed={kind === "outbound"} disabled={pending || uncertain} onClick={() => setKind("outbound")}>Reply by SMS</button><button type="button" className="ri-btn" aria-pressed={kind === "note"} disabled={pending || uncertain} onClick={() => setKind("note")}><LockKeyhole size={13} />Internal note</button></div>
      {kind === "outbound" && !canManage && <p className="ri-muted mb-3">Claim this conversation to reply. Only the assigned member or an administrator can send SMS.</p>}
      {!enabled && kind === "outbound" && <p className="ri-muted mb-3">Service is disabled. Sending is off; internal notes are still available.</p>}
      <label className="ri-field"><span>{kind === "note" ? "Visible only to your inbox team" : "Message to caller"}</span><textarea maxLength={1000} required value={body} disabled={pending || uncertain || (kind === "outbound" && (!canManage || !enabled))} onChange={e => { setBody(e.target.value); setSent(""); }} /></label>
      <div className="ri-toolbar mt-3"><span className="ri-muted">{body.length}/1,000 characters</span><button type="submit" className="ri-btn primary" disabled={pending || uncertain || !body.trim() || (kind === "outbound" && (!canManage || !enabled))}>{api.send.isPending ? "Submitting…" : kind === "note" ? "Save internal note" : "Send reply"}</button></div>
      {uncertain && <div className="ri-error" role="alert"><strong>{kind === "outbound" ? "Send status unknown." : "Save status unknown."}</strong> We will not retry automatically. Refresh the conversation and check whether your message appears before composing another.<div className="flex flex-wrap gap-2 mt-3"><button type="button" className="ri-btn" onClick={() => void api.detail.refetch()}>Refresh conversation</button><button type="button" className="ri-btn" onClick={() => { if (window.confirm("Have you checked the conversation? Starting a new message could duplicate a message that was already accepted.")) { setUncertain(false); setBody(""); setError(null); } }}>I checked; start a new message</button></div></div>}
      {sent && <p className="ri-success" role="status">{sent}</p>}
      {error != null && <p className="ri-error" role="alert">{error instanceof RescueHelpError && error.status === 409 ? "Another teammate claimed this conversation first. The inbox has been refreshed." : rescueHelpError(error)}</p>}
    </form>
  </div>;
}
function InboxWorkspace() {
  const search=useSearch();
  const linkedThread=new URLSearchParams(search).get("thread");
  const validThread=linkedThread && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(linkedThread) ? linkedThread : null;
  const [selected, setSelected] = useState<string | null>(validThread);
  const [mobileConversation, setMobileConversation] = useState(!!validThread);
  const conversationPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (validThread) setMobileConversation(true);
  }, [validThread]);
  useEffect(() => {
    if (!selected || !mobileConversation || !window.matchMedia("(max-width: 767px)").matches) return;
    const frame = requestAnimationFrame(() => {
      conversationPanel.current?.scrollIntoView({ block: "start" });
      conversationPanel.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [selected, mobileConversation]);
  useEffect(()=>{ if(validThread) setSelected(validThread); },[validThread]);
  const [tab, setTab] = useState<"inbox" | "settings">("inbox");
  const [filter, setFilter] = useState("all");
  const api = useRescueInbox(selected);
  const permitted = api.access.data?.allowed === true;
  const blocked = api.access.error || [api.settings.error, api.threads.error, api.detail.error].find(error => error?.status === 401 || error?.status === 403);
  const threads = api.threads.data?.threads || [];
  const waiting = threads.filter(t => t.status === "waiting").length;
  const settings = api.settings.data;
  const admin = api.access.data?.admin === true;
  return <DashboardLayout title="Rescue Inbox" description="Approved answers, with your team close by."><div className="rescue-inbox">
    {blocked ? <ErrorState error={blocked} retry={() => { void api.access.refetch(); void api.settings.refetch(); void api.threads.refetch(); if (selected) void api.detail.refetch(); }} /> : api.access.isPending ? <Loading /> : !permitted ? <ErrorState error={new RescueHelpError(403, "Team access required")} retry={() => void api.access.refetch()} /> : <>
      <section className="ri-banner"><div className="ri-toolbar"><h2>One inbox. No one carries it alone.</h2><span className="ri-badge">{settings?.enabled ? "Service enabled" : settings ? "Service disabled" : "Checking service"}</span></div><p className="ri-muted">{settings ? settings.enabled ? `${settings.number || "Dedicated number"} · Shared SMS and voicemail for the rescue team.` : "Setup mode: approved answers can be prepared now. The bot and outgoing sending remain off until an administrator activates a separate, approved number." : "Loading the rescue’s service configuration."}</p>{waiting > 0 && <p><span className="ri-badge waiting">{waiting} {waiting === 1 ? "conversation needs" : "conversations need"} a person</span></p>}</section>
      <div className="ri-tabs"><button className="ri-btn" aria-pressed={tab === "inbox"} onClick={() => setTab("inbox")}><Inbox size={16} />Shared inbox</button>{admin && <button className="ri-btn" aria-pressed={tab === "settings"} onClick={() => setTab("settings")}>Answers & setup</button>}</div>
      {tab === "settings" && admin ? api.settings.isError ? <ErrorState error={api.settings.error} retry={() => void api.settings.refetch()} /> : settings ? <RescueInboxSettings key={api.scope} api={api} initial={settings} /> : <Loading /> : <>
        {api.settings.isError && <div className="ri-error" role="alert">Service status unavailable. SMS sending is disabled until it can be checked. <button className="ri-btn" onClick={() => void api.settings.refetch()}>Retry</button></div>}
        <div className="ri-toolbar mb-4"><label className="ri-field"><span>Show conversations</span><select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All conversations</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}{value === "waiting" ? ` (${waiting})` : ""}</option>)}</select></label><span className="ri-muted">Shared with the inbox team · updates every 20 seconds</span></div>
        {api.threads.isError ? <ErrorState error={api.threads.error} retry={() => void api.threads.refetch()} /> : api.threads.isPending ? <Loading /> : <div className={`ri-workspace ${mobileConversation && selected ? "ri-show-conversation" : "ri-show-list"}`}>
          <div className="ri-list" aria-label="Conversations">{threads.filter(t => filter === "all" || t.status === filter).map(thread => <button type="button" key={thread.id} className={`ri-thread ${thread.status}`} aria-current={selected === thread.id} onClick={() => { setSelected(thread.id); setMobileConversation(true); }}><div className="ri-toolbar"><strong className="text-sm">{thread.phone}</strong><span className={`ri-badge ${thread.status}`}>{labels[thread.status]}</span></div><p>{thread.preview || "No preview yet"}</p><div className="ri-toolbar mt-3"><small className="ri-muted">{thread.topic || "General"}</small><small className="ri-muted">{time(thread.updatedAt)}</small></div></button>)}{!threads.some(t => filter === "all" || t.status === filter) && <div className="ri-empty"><Inbox size={30} /><h3>{threads.length ? "Nothing in this view" : "A fresh start for the team"}</h3><p className="ri-muted">{threads.length ? "Try another conversation filter." : "Incoming texts and voicemail will appear here once the dedicated service is activated."}</p>{filter !== "all" && <button className="ri-btn" onClick={() => setFilter("all")}>Show all conversations</button>}</div>}</div>
          <div className="ri-conversation-panel" ref={conversationPanel} tabIndex={-1} aria-label="Selected conversation">
            <button type="button" className="ri-btn ri-mobile-back" onClick={() => setMobileConversation(false)}><ArrowLeft size={16} />Back to conversations</button>
            {selected ? <Conversation key={`${api.scope}:${selected}`} api={api} enabled={settings?.enabled === true && !api.settings.isError} /> : <div className="ri-empty"><MessageSquare size={34} /><h2>A shared place to help</h2><p className="ri-muted">Select a conversation to read approved answers, claim a handoff, or leave a note for the team.</p><span className="ri-badge"><LockKeyhole size={12} />Internal notes stay with the team</span></div>}
          </div>
        </div>}
      </>}
    </>}
  </div></DashboardLayout>;
}
export default function RescueInboxPage() {
  const { user, isLoading } = useAuth();
  const { tenantId, basePath } = useTenant();
  if (isLoading) return <div className="rescue-inbox p-6"><Loading /></div>;
  if (!user) return <LoginForm stayOnPage rescueName="your rescue’s shared inbox" />;
  if (!tenantId) return <div className="rescue-inbox"><div className="ri-empty"><h2>Open your rescue workspace</h2><p className="ri-muted">A rescue must be selected before opening its shared inbox.</p><Link className="ri-btn" href="/dashboard">Return to dashboard</Link></div></div>;
  return <InboxWorkspace key={`${tenantId}:${basePath}:${user.id}:${user.activeRole}`} />;
}

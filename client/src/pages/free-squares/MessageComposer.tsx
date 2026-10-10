import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { freeSquareMessageSchema, renderSquareMessage } from "@shared/free-squares";
import type { FreeSquareBoard, FreeSquareMessage, FreeSquareReservation } from "@shared/free-squares";
import { SquareError } from "./SquareComponents";
import { squareErrorStatus, useSendFreeSquareMessage } from "./use-free-squares";

export default function MessageComposer({ board, reservation, onClose }: { board: FreeSquareBoard; reservation: FreeSquareReservation; onClose: () => void }) {
  const canEmail = !!reservation.email && !reservation.email_revoked_at;
  const canSms = !!reservation.phone && !!reservation.sms_consent_at && !reservation.sms_revoked_at;
  const initialChannel = canEmail ? "email" : "sms";
  const render = (template: string) => renderSquareMessage(template, { name: reservation.name, event: board.title, squares: reservation.squares });
  const [channel, setChannel] = useState<"email" | "sms">(initialChannel);
  const [subject, setSubject] = useState(() => render(board.email_subject));
  const [body, setBody] = useState(() => render(initialChannel === "email" ? board.email_template : board.sms_template));
  const [preview, setPreview] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [result, setResult] = useState<FreeSquareMessage | null>(null);
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  const send = useSendFreeSquareMessage(board.id);
  const eligible = !reservation.cancelled_at && (channel === "email" ? canEmail : canSms);
  const locked = send.isPending || uncertain || !!result;
  const submit = () => {
    if (!eligible || reservation.cancelled_at || send.isPending || result) return;
    const fingerprint = JSON.stringify({ channel, subject: channel === "email" ? subject : undefined, body, reservationId: reservation.id });
    if (!request.current || request.current.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() };
    const data = { requestKey: request.current.key, channel, subject: channel === "email" ? subject : undefined, body };
    const parsed = freeSquareMessageSchema.safeParse(data);
    if (!parsed.success) { setValidation(parsed.error.issues.map(issue => issue.message).join(". ")); return; }
    setValidation(null);
    send.mutate({ reservationId: reservation.id, data: parsed.data }, {
      onSuccess: response => { setUncertain(false); setResult(response.message); },
      onError: error => {
        // A lost response or server error may have happened after provider acceptance.
        // Freeze the payload and keep its key; only an explicit same-request check is offered.
        const status = squareErrorStatus(error);
        setUncertain(status === undefined || status >= 500);
      },
    });
  };
  return <Dialog open onOpenChange={open => { if (!open && !send.isPending && !uncertain) onClose(); }}>
    <DialogContent className="free-squares max-h-[90dvh] overflow-y-auto sm:max-w-xl"
      onInteractOutside={event => { if (send.isPending || uncertain) event.preventDefault(); }}
      onEscapeKeyDown={event => { if (send.isPending || uncertain) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{preview ? "Review personal message" : "Write a personal message"}</DialogTitle>
        <DialogDescription>One recipient, one message. Accepted means the provider accepted the request, not that it was delivered.</DialogDescription></DialogHeader>
      <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-1 sq-contact"><p className="font-semibold">{reservation.name}</p><p>{channel === "email" ? reservation.email : reservation.phone}</p><p className="text-muted-foreground">{reservation.squares.map(number => `#${number}`).join(", ")}</p></div>
      {!preview ? <div className="space-y-4">
        <fieldset disabled={locked} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="square-message-channel">Send by</Label>
            <select id="square-message-channel" data-testid="select-message-channel" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={channel} onChange={event => {
              const next = event.target.value as "email" | "sms";
              setChannel(next); setBody(render(next === "email" ? board.email_template : board.sms_template)); send.reset(); request.current = null;
            }}>
              <option value="email" disabled={!canEmail}>Email{reservation.email_revoked_at ? " — opted out" : !canEmail ? " — no email address" : ""}</option>
              <option value="sms" disabled={!canSms}>Text message{!canSms ? " — no active text consent" : ""}</option>
            </select>
          </div>
          {channel === "email" && <div className="space-y-2"><Label htmlFor="square-message-subject">Subject</Label><Input id="square-message-subject" data-testid="input-message-subject" maxLength={200} value={subject} onChange={event => setSubject(event.target.value)} /></div>}
          <div className="space-y-2"><Label htmlFor="square-message-body">Message</Label><Textarea id="square-message-body" data-testid="input-message-body" rows={7} maxLength={channel === "sms" ? 1000 : 5000} value={body} onChange={event => setBody(event.target.value)} /><p className="text-xs text-muted-foreground">{body.length} / {channel === "sms" ? 1000 : 5000} characters</p></div>
        </fieldset>
        <Button data-testid="button-preview-message" disabled={locked || !eligible || !body.trim() || (channel === "email" && !subject.trim())} onClick={() => setPreview(true)}>Preview message</Button>
      </div> : <div className="space-y-4">
        <div className="sq-panel space-y-3" data-testid="message-preview">
          {channel === "email" && <h3 className="font-semibold break-words">{subject}</h3>}
          <p className="sq-message text-sm">{body}</p>
        </div>
        {!result && <div className="sq-actions">
          <Button variant="outline" disabled={locked} onClick={() => { setPreview(false); send.reset(); }}>Back to edit</Button>
          <Button data-testid="button-confirm-send-message" disabled={!eligible || send.isPending} onClick={submit}>{send.isPending ? "Submitting…" : uncertain ? "Check same request" : "Confirm and send"}</Button>
        </div>}
      </div>}
      {validation && <SquareError error={new Error(validation)} />}
      {send.error && <SquareError error={send.error} />}
      {uncertain && <p role="alert" className="text-sm rounded-lg border p-3">The outcome is uncertain. Do not start a new message. “Check same request” reuses the original request ID; it does not request a second send. This message will not retry in the background.</p>}
      {result && <div role="status" data-testid="message-result" className="rounded-lg border bg-muted/40 p-4 space-y-2">
        <p className="font-semibold">{result.status === "accepted" ? "Accepted by provider" : result.status === "sending" ? "Processing" : result.status === "unknown" ? "Unknown outcome" : "Failed"}</p>
        <p className="text-sm text-muted-foreground">{result.status === "accepted" ? "Accepted by the provider. Delivery is not confirmed." : result.status === "failed" ? "The message failed. Review the error before composing another message." : result.status === "sending" ? "This request is processing. If it remains here, check with the provider. Do not send another copy." : "Do not resend this message. The provider outcome has not been confirmed; check with the provider and review the message history."}</p>
        {result.error && <p className="text-sm text-destructive break-words">{result.error}</p>}
      </div>}
      <div className="flex justify-end"><Button variant="outline" disabled={send.isPending || uncertain} onClick={onClose}>Close</Button></div>
    </DialogContent>
  </Dialog>;
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_SQUARE_EMAIL_SUBJECT, DEFAULT_SQUARE_MESSAGE, freeSquareBoardSchema } from "@shared/free-squares";
import type { FreeSquareBoard } from "@shared/free-squares";
import { SquareError } from "./SquareComponents";
import { useSaveFreeSquareBoard } from "./use-free-squares";
import type { BoardInput } from "./use-free-squares";

export default function BoardEditor({ board, onClose, onSaved }: { board?: FreeSquareBoard; onClose: () => void; onSaved: (board: FreeSquareBoard) => void }) {
  const [form, setForm] = useState<BoardInput>(() => ({
    title: board?.title ?? "", description: board?.description ?? "", status: board?.status ?? "draft",
    home_team: board?.home_team ?? "Home", away_team: board?.away_team ?? "Away",
    home_score: board?.home_score ?? null, away_score: board?.away_score ?? null,
    email_subject: board?.email_subject ?? DEFAULT_SQUARE_EMAIL_SUBJECT,
    email_template: board?.email_template ?? DEFAULT_SQUARE_MESSAGE,
    sms_template: board?.sms_template ?? DEFAULT_SQUARE_MESSAGE,
  }));
  const [validation, setValidation] = useState<string | null>(null);
  const save = useSaveFreeSquareBoard();
  const set = <K extends keyof BoardInput>(key: K, value: BoardInput[K]) => setForm(old => ({ ...old, [key]: value }));
  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}>
    <DialogContent className="free-squares max-h-[90dvh] overflow-y-auto sm:max-w-2xl" onInteractOutside={event => { if (save.isPending) event.preventDefault(); }} onEscapeKeyDown={event => { if (save.isPending) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{board ? "Edit community board" : "Create a community board"}</DialogTitle>
        <DialogDescription>Free-entry football squares, with personal follow-up from your team. New boards start as drafts.</DialogDescription></DialogHeader>
      <form className="space-y-5" onSubmit={event => {
        event.preventDefault();
        const result = freeSquareBoardSchema.safeParse(form);
        if (!result.success) { setValidation(result.error.issues.map(issue => `${issue.path.join(" ")}: ${issue.message}`).join(". ")); return; }
        setValidation(null);
        save.mutate({ id: board?.id, data: result.data }, { onSuccess: result => onSaved(result.board) });
      }}>
        <fieldset disabled={save.isPending} className="space-y-5 min-w-0">
          <div className="space-y-2"><Label htmlFor="square-title">Board title</Label><Input autoFocus id="square-title" data-testid="input-board-title" required maxLength={120} value={form.title} onChange={event => set("title", event.target.value)} placeholder="Sunday football with our rescue" /></div>
          <div className="space-y-2"><Label htmlFor="square-description">A note for your community</Label><Textarea id="square-description" data-testid="input-board-description" maxLength={2000} value={form.description} onChange={event => set("description", event.target.value)} placeholder="Tell everyone what this gathering is about." /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(["home", "away"] as const).map(side => <div className="space-y-3" key={side}>
              <div className="space-y-2"><Label htmlFor={`square-${side}`}>{side === "home" ? "Home" : "Away"} team</Label><Input id={`square-${side}`} data-testid={`input-${side}-team`} required maxLength={80} value={form[`${side}_team`]} onChange={event => set(`${side}_team`, event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor={`square-${side}-score`}>Score (optional)</Label><Input id={`square-${side}-score`} data-testid={`input-${side}-score`} type="number" min={0} max={999} step={1} value={form[`${side}_score`] ?? ""} onChange={event => set(`${side}_score`, event.target.value === "" ? null : Number(event.target.value))} /></div>
            </div>)}
          </div>
          <section className="border-t pt-5 space-y-4">
            <div><h3 className="font-semibold">Personal message templates</h3><p className="text-sm text-muted-foreground mt-1">Use {"{name}"}, {"{event}"} and {"{squares}"}. Templates only fill the composer; nothing is sent automatically.</p></div>
            <div className="space-y-2"><Label htmlFor="square-email-subject">Email subject</Label><Input id="square-email-subject" data-testid="input-email-subject-template" required maxLength={200} value={form.email_subject} onChange={event => set("email_subject", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="square-email-template">Email template</Label><Textarea id="square-email-template" data-testid="input-email-template" required maxLength={5000} rows={4} value={form.email_template} onChange={event => set("email_template", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="square-sms-template">Text template</Label><Textarea id="square-sms-template" data-testid="input-sms-template" required maxLength={1000} rows={3} value={form.sms_template} onChange={event => set("sms_template", event.target.value)} /><p className="text-xs text-muted-foreground">Texting is available only for a phone number with active, explicit consent.</p></div>
          </section>
        </fieldset>
        {validation && <SquareError error={new Error(validation)} />}
        {save.error && <SquareError error={save.error} />}
        <div className="sq-actions justify-end border-t pt-4">
          <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending} data-testid="button-save-board">{save.isPending ? "Saving…" : board ? "Save changes" : "Create draft board"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

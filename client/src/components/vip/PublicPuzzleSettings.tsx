import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, Grid3X3 } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { publicPuzzleRequest, type PublicPuzzleConfig } from "@/hooks/use-public-puzzle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import "./public-puzzle.css";

function SettingsContent() {
  const { basePath } = useTenant();
  const [status, setStatus] = useState<"loading" | "hidden" | "ready" | "error">("loading");
  const [enabled, setEnabled] = useState(false);
  const [facebookPostUrl, setFacebookPostUrl] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [timezone, setTimezone] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const savingController = useRef<AbortController | null>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const publicLink = `${window.location.origin}${basePath}/puzzle`;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; savingController.current?.abort(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setError("");
    void publicPuzzleRequest<PublicPuzzleConfig>("settings", "GET", undefined, controller.signal).then(config => {
      if (controller.signal.aborted) return;
      setEnabled(config.enabled);
      setFacebookPostUrl(config.facebookPostUrl);
      setStartsAt(config.startsAt || "");
      setEndsAt(config.endsAt || "");
      setTimezone(config.timezone);
      setStatus("ready");
    }).catch((reason: Error & { status?: number }) => {
      if (controller.signal.aborted) return;
      if ([401, 403, 404].includes(reason.status || 0)) setStatus("hidden");
      else { setError(reason.message); setStatus("error"); }
    });
    return () => controller.abort();
  }, [attempt]);

  const save = async () => {
    if (saving) return;
    const value = facebookPostUrl.trim();
    if (value) {
      try {
        const url = new URL(value);
        if (url.protocol !== "https:" || !(url.hostname === "facebook.com" || url.hostname.endsWith(".facebook.com")) || url.username || url.password) throw new Error();
      } catch { setError("Use an https://facebook.com post link, or leave this field empty."); return; }
    }
    setSaving(true); setError(""); setNotice("");
    const controller = new AbortController();
    savingController.current = controller;
    try {
      await publicPuzzleRequest<PublicPuzzleConfig>("settings", "PUT", { enabled, facebookPostUrl: value, startsAt: startsAt || null, endsAt: endsAt || null }, controller.signal);
      if (mounted.current && !controller.signal.aborted) setNotice("Public puzzle settings saved.");
    } catch (reason) {
      if (mounted.current && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Settings could not be saved. Your edits are still here.");
    } finally { if (mounted.current && !controller.signal.aborted) setSaving(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(publicLink); if (mounted.current) setNotice("Public puzzle link copied."); }
    catch {
      if (!mounted.current) return;
      linkInput.current?.focus(); linkInput.current?.select();
      setNotice("Select and copy the public link below.");
    }
  };

  if (status === "hidden") return null;
  return <Card>
    <CardHeader>
      <div className="mb-2 flex items-center gap-2 text-primary"><Grid3X3 className="h-5 w-5" aria-hidden="true" /><span className="text-xs font-semibold uppercase tracking-wider">Community challenge</span></div>
      <CardTitle>Public rescue puzzle</CardTitle>
      <CardDescription>A photo puzzle supporters can play without signing in.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      {status === "loading" ? <div role="status" aria-label="Loading public puzzle settings" className="space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-10 w-full" /></div> :
        status === "error" ? <div role="alert" className="space-y-3"><p className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => setAttempt(v => v + 1)}>Retry settings</Button></div> :
          <form className="space-y-5" onSubmit={event => { event.preventDefault(); void save(); }}>
            <p className="puzzle-settings-intro text-sm text-muted-foreground">This public challenge is independent of the private game pilot. Turning it off stops public play and solved-image exports, without changing team or donor games.</p>
            <div className="flex items-center justify-between gap-5 rounded-md border p-4">
              <div><Label htmlFor="public-puzzle-enabled">Enable public puzzle</Label><p className="mt-1 text-xs text-muted-foreground">Off always pauses play. On allows free play within the optional schedule.</p></div>
              <Switch id="public-puzzle-enabled" checked={enabled} onCheckedChange={value => { setEnabled(value); setNotice(""); }} disabled={saving} />
            </div>
            <fieldset className="space-y-3" disabled={saving}>
              <legend className="text-sm font-medium">Optional schedule · {timezone}</legend>
              <p className="text-xs text-muted-foreground">Use the rescue’s local time shown above, not your device’s timezone. Leave a field blank for no limit. Closing stops active play and solved-image exports. Times in skipped or repeated daylight-saving hours cannot be used.</p>
              <Label htmlFor="public-puzzle-start">Opens at</Label>
              <Input id="public-puzzle-start" type="datetime-local" value={startsAt} onChange={event => { setStartsAt(event.target.value); setNotice(""); }} />
              <Label htmlFor="public-puzzle-end">Closes at</Label>
              <Input id="public-puzzle-end" type="datetime-local" value={endsAt} onChange={event => { setEndsAt(event.target.value); setNotice(""); }} />
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor="public-puzzle-facebook">Facebook challenge post <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="public-puzzle-facebook" type="url" placeholder="https://www.facebook.com/…" value={facebookPostUrl} onChange={event => { setFacebookPostUrl(event.target.value); setNotice(""); }} disabled={saving} aria-describedby="public-puzzle-facebook-help" />
              <p id="public-puzzle-facebook-help" className="text-xs text-muted-foreground">Supporters save their solved image, then manually attach it to a comment on this post. No entries or comments are posted automatically.</p>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={saving}>{saving ? "Saving settings…" : "Save public puzzle settings"}</Button>
            <div className="space-y-2 border-t pt-5">
              <Label htmlFor="public-puzzle-link">Public puzzle link</Label>
              <Input ref={linkInput} id="public-puzzle-link" value={publicLink} readOnly onFocus={event => event.target.select()} />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void copy()}><Copy className="mr-2 h-4 w-4" aria-hidden="true" />Copy link</Button>
                <Button type="button" variant="ghost" asChild><a href={publicLink} target="_blank" rel="noopener noreferrer">Open public page<ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" /></a></Button>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">Haseyas administers the challenge rules and winners. Play and participation are free; optional donations do not affect chances. Completing a puzzle is not an automatic entry.</p>
            {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
          </form>}
    </CardContent>
  </Card>;
}

export function PublicPuzzleSettings() {
  const { tenantId, basePath } = useTenant();
  return <SettingsContent key={`${tenantId}:${basePath}`} />;
}

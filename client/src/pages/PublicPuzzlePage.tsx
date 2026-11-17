import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowRight, Check, Download, ExternalLink, Grid3X3, Heart, PawPrint, Play, RotateCcw, Share2 } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { useSEO } from "@/hooks/useSEO";
import { publicPuzzleRequest, type PublicPuzzleConfig, type PublicPuzzleLaunch } from "@/hooks/use-public-puzzle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { puzzleTime, renderPuzzleImage, type PuzzleCompletion } from "@/components/vip/public-puzzle-export";
import "@/components/vip/public-puzzle.css";
import { parsePuzzleSave, PUZZLE_SAVE_KEY, validPuzzleRound, type PuzzleSave } from "@/lib/puzzle-progress";

type SavedImage = { url: string; file: File | null; canShare: boolean };

function facebookLink(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (url.hostname === "facebook.com" || url.hostname.endsWith(".facebook.com")) ? url.href : null;
  } catch { return null; }
}

function PuzzleContent() {
  const { basePath, tenantId } = useTenant();
  const tenantKey = tenantId || "";
  const [saved, setSaved] = useState<PuzzleSave | null>(null);
  const [remember, setRemember] = useState(false);
  const rememberRef = useRef(false);
  const restoring = useRef<PuzzleSave | null>(null);
  const [saveNotice, setSaveNotice] = useState("");
  const clearProgress = () => {
    restoring.current = null;
    setSaved(null);
    try { localStorage.removeItem(PUZZLE_SAVE_KEY); } catch { /* Optional storage. */ }
  };
  const [config, setConfig] = useState<PublicPuzzleConfig | null>(null);
  const [checking, setChecking] = useState(true);
  const [accessError, setAccessError] = useState("");
  const [accessAttempt, setAccessAttempt] = useState(0);
  const [launch, setLaunch] = useState<PublicPuzzleLaunch | null>(null);
  const [launching, setLaunching] = useState(false);
  const [ready, setReady] = useState(false);
  const [gameError, setGameError] = useState("");
  const [completion, setCompletion] = useState<PuzzleCompletion | null>(null);
  const [image, setImage] = useState<SavedImage | null>(null);
  const [imageError, setImageError] = useState("");
  const [exportAttempt, setExportAttempt] = useState(0);
  const [shareMessage, setShareMessage] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  const launchController = useRef<AbortController | null>(null);
  const allowed = useRef(false);
  const generation = useRef(0);
  const readyRef = useRef(false);
  const solvedRef = useRef(false);
  const mounted = useRef(false);
  const rescueName = config?.rescueName || "Haseyas";
  const postUrl = facebookLink(config?.facebookPostUrl);

  useSEO({ title: `Rescue Puzzle Challenge | ${rescueName}`, description: "A little puzzle. A little rescue joy. Play for free, save your solved image, and join the conversation.", url: `${window.location.origin}${basePath}/puzzle` });

  useEffect(() => {
    mounted.current = true;
    const robots = document.createElement("meta");
    robots.name = "robots"; robots.content = "noindex, nofollow";
    document.head.appendChild(robots);
    return () => { mounted.current = false; allowed.current = false; generation.current++; launchController.current?.abort(); robots.remove(); };
  }, []);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const controllers = new Set<AbortController>();
    const closeGame = () => {
      allowed.current = false;
      generation.current++;
      launchController.current?.abort();
      setLaunch(null); setLaunching(false); setReady(false); setCompletion(null); setImage(null); setShareMessage("");
    };
    const check = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      const controller = new AbortController();
      controllers.add(controller);
      const deadline = window.setTimeout(() => controller.abort(), 10000);
      try {
        const result = await publicPuzzleRequest<PublicPuzzleConfig>("access", "GET", undefined, controller.signal);
        if (!active) return;
        if (typeof result.enabled !== "boolean") throw new Error("Puzzle availability could not be checked.");
        setConfig(result); setAccessError("");
        allowed.current = result.enabled;
        if (!result.enabled) { closeGame(); clearProgress(); }
        else {
          try {
            const raw = localStorage.getItem(PUZZLE_SAVE_KEY);
            const progress = parsePuzzleSave(raw, tenantKey);
            setSaved(progress);
            if (raw && !progress) localStorage.removeItem(PUZZLE_SAVE_KEY);
          } catch { setSaveNotice("Saving is unavailable in this browser. You can still play."); }
        }
      } catch {
        if (!active) return;
        closeGame(); setConfig(null);
        setAccessError("We couldn’t confirm that the puzzle is available. Please check your connection and try again.");
      } finally {
        window.clearTimeout(deadline); controllers.delete(controller);
        inFlight = false;
        if (active) setChecking(false);
      }
    };
    setChecking(true);
    void check();
    const interval = window.setInterval(() => void check(), 30000);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false; controllers.forEach(c => c.abort()); window.clearInterval(interval);
      window.removeEventListener("focus", onVisible); document.removeEventListener("visibilitychange", onVisible);
    };
  }, [accessAttempt]);

  const start = async (resume?: PuzzleSave) => {
    if (!allowed.current || launching || launchController.current) return;
    const progress = resume ? parsePuzzleSave(JSON.stringify(resume), tenantKey) : null;
    if (!resume || !progress) clearProgress();
    else setSaved(null);
    if (resume && !progress) { setGameError("That saved round has expired. Please start a new puzzle."); return; }
    restoring.current = progress;
    if (progress) { rememberRef.current = true; setRemember(true); }
    const version = ++generation.current;
    const controller = new AbortController();
    launchController.current = controller;
    setLaunch(null); setCompletion(null); setImage(null); setImageError(""); setShareMessage(""); setGameError(""); setLaunching(true); setReady(false);
    readyRef.current = false; solvedRef.current = false;
    const deadline = window.setTimeout(() => controller.abort(), 20000);
    try {
      const result = await publicPuzzleRequest<PublicPuzzleLaunch>("launch", "POST",
        progress ? { resume: { petId: progress.petId, photoVersion: progress.photoVersion } } : undefined, controller.signal);
      if (!mounted.current || version !== generation.current || !allowed.current) return;
      if (!result.enabled || typeof result.html !== "string" || !result.html) throw new Error("The puzzle is not available right now. Please check availability again.");
      if (progress && ((result.pet?.id ?? null) !== progress.petId || result.photoVersion !== progress.photoVersion)) throw Object.assign(new Error("That saved photo is no longer available. Please start a new puzzle."), { status: 409 });
      setLaunch(result);
    } catch (reason) {
      if (!mounted.current || version !== generation.current) return;
      if (progress) {
        if ([403, 404, 409].includes((reason as { status?: number })?.status ?? 0)) clearProgress();
        else setSaved(progress);
      }
      setGameError(controller.signal.aborted ? "The puzzle took too long to open. Please try again." : reason instanceof Error ? reason.message : "The puzzle could not be opened.");
    } finally {
      window.clearTimeout(deadline);
      if (launchController.current === controller) launchController.current = null;
      if (mounted.current && version === generation.current) setLaunching(false);
    }
  };

  useEffect(() => {
    if (!launch) return;
    readyRef.current = false;
    const timeout = window.setTimeout(() => {
      if (readyRef.current) return;
      setLaunch(null); setGameError("The puzzle did not finish loading. Please try again."); setCompletion(null); setImage(null);
    }, 25000);
    const onMessage = (event: MessageEvent) => {
      if (!allowed.current || !frame.current || event.source !== frame.current.contentWindow) return;
      const data: unknown = event.data;
      if (!data || typeof data !== "object" || Array.isArray(data)) return;
      const payload = data as Record<string, unknown>;
      const keys = Object.keys(payload);
      if (payload.type === "rescue-shuffle-ready" && keys.length === 1) {
        readyRef.current = true; setReady(true); window.clearTimeout(timeout);
        frame.current.contentWindow?.postMessage({ type: "rescue-shuffle-restore", round: restoring.current?.round ?? null }, "*");
      } else if (payload.type === "rescue-shuffle-photo-error" && keys.length === 1) {
        clearProgress(); generation.current++; solvedRef.current = false;
        setLaunch(null); setCompletion(null); setImage(null);
        setGameError("This animal’s photo could not load. Please start a new puzzle.");
      } else if (payload.type === "rescue-shuffle-progress" && keys.length === 2 && readyRef.current && !solvedRef.current && validPuzzleRound(payload.round)) {
        if (!rememberRef.current || !tenantKey) return;
        const progress = { version: 1, tenant: tenantKey, savedAt: Date.now(), petId: launch.pet?.id ?? null,
          photoVersion: launch.photoVersion, round: payload.round };
        const raw = JSON.stringify(progress);
        if (!parsePuzzleSave(raw, tenantKey)) return;
        try { localStorage.setItem(PUZZLE_SAVE_KEY, raw); }
        catch { setSaveNotice("Your browser could not save progress. Keep this page open to continue."); }
      } else if (payload.type === "rescue-shuffle-reset" && keys.length === 1 && readyRef.current) {
        clearProgress();
        generation.current++;
        solvedRef.current = false;
        setCompletion(null); setImage(null); setImageError(""); setShareMessage("");
      } else if (payload.type === "rescue-shuffle-solved" && keys.length === 4 && keys.every(key => ["type", "petId", "moves", "seconds"].includes(key)) && readyRef.current && !solvedRef.current) {
        if (payload.petId !== (launch.pet?.id ?? null) || !Number.isSafeInteger(payload.moves) || (payload.moves as number) < 1 || !Number.isSafeInteger(payload.seconds) || (payload.seconds as number) < 0) return;
        solvedRef.current = true;
        clearProgress();
        setCompletion({ petId: payload.petId as string | null, moves: payload.moves as number, seconds: payload.seconds as number });
      }
    };
    window.addEventListener("message", onMessage);
    return () => { window.clearTimeout(timeout); window.removeEventListener("message", onMessage); };
  }, [launch]);

  useEffect(() => {
    setImage(null); setImageError(""); setShareMessage("");
    if (!completion || !launch || !allowed.current) return;
    const controller = new AbortController();
    let url: string | null = null;
    void renderPuzzleImage(launch, completion, controller.signal).then(blob => {
      if (controller.signal.aborted || !allowed.current) return;
      const file = typeof File === "function" ? new File([blob], "haseyas-solved-puzzle.png", { type: "image/png" }) : null;
      url = URL.createObjectURL(blob);
      let canShare = false;
      try { canShare = !!file && !!navigator.share && !!navigator.canShare?.({ files: [file] }); } catch { /* File sharing is optional. */ }
      setImage({ url, file, canShare });
    }).catch(reason => {
      if (!controller.signal.aborted) setImageError(reason instanceof Error ? reason.message : "Your solved image could not be created.");
    });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [completion, launch, exportAttempt]);

  const share = () => {
    if (!image?.file || !allowed.current || !completion) return;
    // The File is prepared before this click to preserve native user activation.
    const version = generation.current;
    void navigator.share({ files: [image.file], title: `${rescueName} puzzle` }).catch(reason => {
      if (!mounted.current || version !== generation.current || !allowed.current) return;
      if (reason instanceof Error && reason.name === "AbortError") return;
      setShareMessage("Sharing wasn’t available. Save the image below, then attach it to your comment.");
    });
  };

  const available = config?.enabled === true && !accessError;
  return <div className="public-puzzle">
    <div className="puzzle-shell">
      <header className="puzzle-header">
        <a className="puzzle-brand" href={basePath || "/"}><PawPrint size={25} strokeWidth={1.6} aria-hidden="true" />{rescueName}</a>
        <span>A little play. A lot of heart.</span>
      </header>
      <main>
        <section className="puzzle-intro">
          <div><span className="puzzle-eyebrow">The rescue puzzle challenge</span><h1>Piece together<br /><span>a little happiness.</span></h1></div>
          <p>One animal. A few shuffled tiles. A moment just for you. Solve a rescue puzzle, save your finished image, and share a little joy in our Facebook comments.</p>
        </section>
        <div className="puzzle-layout">
          <section className="puzzle-stage" aria-label="Rescue puzzle">
            <div className="puzzle-stage-heading"><span><Grid3X3 size={17} aria-hidden="true" />Rescue Shuffle</span><small>{completion ? "Puzzle complete" : "Free to play · No sign-in"}</small></div>
            {available && !completion && <div className="px-5 py-3 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={remember} onChange={event => {
                setRemember(event.target.checked); rememberRef.current = event.target.checked;
                if (!event.target.checked) clearProgress();
              }} />Save unfinished progress on this device for up to 7 days</label>
              <p>Only the board and play counters are saved—no donor information or photos. Time away is not counted.</p>
              {saveNotice && <p role="status">{saveNotice}</p>}
            </div>}
            {checking && !launch ? <div className="puzzle-welcome" role="status" aria-label="Checking puzzle availability"><Skeleton className="h-36 w-36 rounded-xl" /><Skeleton className="h-7 w-52" /><p>Checking puzzle availability…</p></div> :
              !available ? <div className="puzzle-welcome">
                <AlertCircle size={35} strokeWidth={1.4} aria-hidden="true" /><h2>{accessError ? "Let’s check that connection." : "A little pause in play."}</h2>
                <p role={accessError ? "alert" : "status"}>{accessError || "The public puzzle is taking a break. Please check back soon."}</p>
                <Button className="puzzle-primary" onClick={() => setAccessAttempt(v => v + 1)} disabled={checking}>Check availability</Button>
              </div> : completion ? <div className="puzzle-result">
                <span className="puzzle-eyebrow"><Check className="mr-1 inline h-4 w-4" aria-hidden="true" />All the pieces, together</span>
                <h2>You did it. Now share the joy.</h2>
                <p>{completion.moves} moves · {puzzleTime(completion.seconds)}. {launch?.pet?.imageUrl ? "Your finished photo is ready for its moment in the comments." : "You solved the numbered board. No animal photo was available for this game."}</p>
                {image ? <img src={image.url} alt={`Completed ${launch?.pet?.imageUrl ? "animal-photo" : "numbered"} puzzle for ${rescueName}, ${completion.moves} moves in ${puzzleTime(completion.seconds)}`} /> :
                  imageError ? <div role="alert" className="space-y-3 rounded-lg border p-5"><p>{imageError}</p><Button variant="outline" onClick={() => setExportAttempt(v => v + 1)}>Retry solved image</Button></div> :
                    <div role="status"><Skeleton className="aspect-[4/5] w-full rounded-lg" /><p className="mt-3 text-sm">Preparing your solved image…</p></div>}
                <div className="puzzle-actions">
                  {image && <Button asChild className="puzzle-primary"><a href={image.url} download="haseyas-solved-puzzle.png"><Download className="mr-2 h-4 w-4" aria-hidden="true" />Save solved image</a></Button>}
                  {image?.canShare && <Button variant="outline" onClick={share}><Share2 className="mr-2 h-4 w-4" aria-hidden="true" />Share image</Button>}
                  <Button asChild variant="outline"><a href={`${basePath}/donate`}><Heart className="mr-2 h-4 w-4" aria-hidden="true" />Donate (optional)</a></Button>
                  <Button variant="outline" onClick={() => void start()} disabled={launching}><RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />Play again</Button>
                </div>
                {image && <p className="puzzle-save-note">On a phone? Touch and hold the image to save it to Photos. Then open the Facebook post and manually attach it to your comment. Sharing does not automatically enter the challenge.</p>}
                {shareMessage && <p role="status" className="puzzle-save-note">{shareMessage}</p>}
              </div> : launch ? <div className="puzzle-game">
                {!ready && <div className="puzzle-game-loading" role="status"><Skeleton className="h-10 w-2/3" /><Skeleton className="aspect-square w-full" /><p>Getting your puzzle ready…</p></div>}
                <iframe ref={frame} srcDoc={launch.html} title={`${rescueName} rescue photo sliding puzzle`} sandbox="allow-scripts" referrerPolicy="no-referrer" tabIndex={ready ? 0 : -1} style={{ visibility: ready ? "visible" : "hidden" }} onError={() => { setLaunch(null); setGameError("The puzzle could not load. Please try again."); }} />
              </div> : <div className="puzzle-welcome">
                {launching ? <div role="status" className="flex flex-col items-center gap-5"><Skeleton className="h-36 w-36 rounded-xl" /><p>Finding a rescue face for your puzzle…</p></div> : <>
                  <div className="puzzle-motif" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <span key={i} />)}</div>
                  <h2>{gameError ? "Let’s try that again." : "Your next happy little challenge."}</h2>
                  <p role={gameError ? "alert" : undefined}>{gameError || "Slide the tiles into place to reveal an animal photo. If a photo isn’t available, enjoy a classic numbered puzzle instead."}</p>
                  <Button className="puzzle-primary" onClick={() => void start()}><Play className="mr-2 h-4 w-4" aria-hidden="true" />{gameError ? "Retry puzzle" : "Start your puzzle"}<ArrowRight className="ml-4 h-4 w-4" aria-hidden="true" /></Button>
                  {saved && <Button variant="outline" onClick={() => void start(saved)}>Resume unfinished puzzle</Button>}
                  <p>No donation required. Just a little patience.</p>
                </>}
              </div>}
          </section>
          <aside className="puzzle-side">
            <span className="puzzle-eyebrow">From tiles to comments</span><h2>A small challenge.<br />A shared happy moment.</h2>
            <ol className="puzzle-steps">
              <li><div><strong>Make the picture whole.</strong>Slide a tile next to the empty space until everything is in place.</div></li>
              <li><div><strong>Keep your finished image.</strong>After solving, save the image with your moves and time.</div></li>
              <li><div><strong>Join the conversation.</strong>Open our Facebook post and manually attach the saved image to a comment. Follow the post’s rules to participate.</div></li>
            </ol>
            {postUrl ? <a className="puzzle-post" href={postUrl} target="_blank" rel="noopener noreferrer">Open the Facebook post<ExternalLink size={14} aria-hidden="true" /></a> : <p className="text-sm leading-relaxed">A Facebook challenge post hasn’t been linked yet. You can still play for free.</p>}
            <div className="puzzle-donation"><Heart size={22} strokeWidth={1.5} aria-hidden="true" /><h2 className="mt-3">A little extra kindness?</h2><p>If you’d like, help {rescueName} care for the animals behind the pictures. Giving is always optional and does not affect chances.</p><Button asChild variant="outline"><a href={`${basePath}/donate`}>Donate to the rescue<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></a></Button></div>
          </aside>
        </div>
      </main>
      <footer className="puzzle-footer"><span className="font-semibold">{rescueName} · Rescue Puzzle</span><p>Play and participation are free. Optional donations do not affect chances. {rescueName} administers the rules and winners; see the Facebook post for details. Completion images reflect your play, are not verified contest evidence, and do not create an automatic entry. Nothing is posted to Facebook automatically.</p></footer>
    </div>
  </div>;
}

export default function PublicPuzzlePage() {
  const { tenantId, basePath } = useTenant();
  return <PuzzleContent key={`${tenantId}:${basePath}`} />;
}

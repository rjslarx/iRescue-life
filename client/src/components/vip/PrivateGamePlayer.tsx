import { useEffect, useRef, useState } from "react";
import { VIP_GAMES, type VipGameId } from "@shared/vip-games";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { donorGameRequest, pilotPath, pilotRequest } from "@/hooks/use-vip-game";
import { withPrivateGamePresentation } from "./private-game-presentation";
import "./private-game-player.css";

interface PrivateGamePlayerProps {
  token?: string;
  preview?: boolean;
  gameId?: VipGameId;
  previewTenantId?: string;
  onClose: () => void;
}

export function PrivateGamePlayer({ token, preview = false, gameId = "pasture-run", previewTenantId, onClose }: PrivateGamePlayerProps) {
  const game = VIP_GAMES.find((entry) => entry.id === gameId)!;
  const iframe = useRef<HTMLIFrameElement>(null);
  const returnButton = useRef<HTMLButtonElement>(null);
  const launch = useRef<{ key: string; promise: Promise<{ html: string }> } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [html, setHtml] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessLost, setAccessLost] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    let active = true;
    let readyReceived = false;
    setHtml(null);
    setReady(false);
    setError(null);
    setAccessLost(false);
    const controllers = new Set<AbortController>();
    const failAccess = () => {
      if (!active) return;
      setAccessLost(true);
      setHtml(null);
      setError("Your private play session is no longer available. Return to your giving history to check access.");
      returnButton.current?.focus();
    };
    // Keep the promise across StrictMode's effect replay; launch is never called during render.
    const launchKey = JSON.stringify([token, preview, gameId, previewTenantId]);
    if (!launch.current || launch.current.key !== launchKey) {
      const promise = preview
        ? gameId === "rescue-shuffle" && !previewTenantId
          ? Promise.reject(new Error("Choose a rescue to preview Rescue Shuffle 15 with its animal photos."))
          : pilotRequest<{ html: string }>(`${pilotPath}/preview`, "POST", { gameId, ...(previewTenantId ? { tenantId: previewTenantId } : {}) })
        : token
          ? donorGameRequest<{ html: string }>(token, "launch", undefined, gameId)
          : Promise.reject(new Error("Please return to your giving history and open a new secure link."));
      launch.current = { key: launchKey, promise };
    }
    launch.current.promise.then((result) => {
      if (!active) return;
      if (!result.html) throw new Error("The game could not be loaded. Please try again.");
      setHtml(gameId === "pasture-run" ? withPrivateGamePresentation(result.html) : result.html);
    }).catch((reason: Error) => {
      if (active) { setError(reason.message); setHtml(null); }
    });

    const onMessage = (event: MessageEvent) => {
      if (!iframe.current || event.source !== iframe.current.contentWindow || !event.data || typeof event.data !== "object") return;
      const messagePrefix = gameId === "pasture-run" ? "pasture" : "rescue-shuffle";
      if (event.data.type === `${messagePrefix}-ready`) {
        readyReceived = true;
        setReady(true);
      }
      if (event.data.type === `${messagePrefix}-start` && !preview && token) {
        const controller = new AbortController();
        controllers.add(controller);
        void donorGameRequest<void>(token, "start", controller.signal, gameId)
          .catch(() => { if (!controller.signal.aborted) failAccess(); })
          .finally(() => controllers.delete(controller));
      }
    };
    window.addEventListener("message", onMessage);
    const timeout = window.setTimeout(() => {
      if (!active || readyReceived) return;
      setHtml(null);
      setError(`${game.name} did not finish loading. Please try again.`);
      returnButton.current?.focus();
    }, 25000);
    const checkAccess = async () => {
      if (preview || !token) return;
      const controller = new AbortController();
      controllers.add(controller);
      const deadline = window.setTimeout(() => controller.abort(), 10000);
      try {
        const access = await donorGameRequest<{ eligible: boolean }>(token, "access", controller.signal);
        if (!access.eligible) failAccess();
      } catch { failAccess(); }
      finally { window.clearTimeout(deadline); controllers.delete(controller); }
    };
    const interval = preview ? undefined : window.setInterval(() => { void checkAccess(); }, 60000);
    const onVisibility = () => { if (document.visibilityState === "visible") void checkAccess(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      controllers.forEach((controller) => controller.abort());
      window.clearTimeout(timeout);
      if (interval !== undefined) window.clearInterval(interval);
      window.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [attempt, token, preview, gameId, previewTenantId, game.name]);

  const retry = () => {
    launch.current = null;
    setHtml(null);
    setReady(false);
    setError(null);
    setAttempt((value) => value + 1);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) closeRef.current(); }}>
      <DialogContent
        className="private-game-player"
        onOpenAutoFocus={(event) => { event.preventDefault(); returnButton.current?.focus(); }}
      >
        <div className="private-game-player__toolbar">
          <Button ref={returnButton} variant="ghost" onClick={() => closeRef.current()}
            aria-label={preview ? "Return to pilot" : "Return to giving history"}
            title={preview ? "Return to pilot" : "Return to giving history"}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />Return
          </Button>
          <DialogTitle className="private-game-player__title">{game.name} {preview ? "· Owner preview" : ""}</DialogTitle>
          {ready && !error && <Button variant="ghost" onClick={() => iframe.current?.focus()}>Focus game</Button>}
        </div>
        <DialogDescription className="sr-only">{preview ? "Private sandbox. Preview runs are not recorded." : "A little playtime, with thanks for your VIP support."}</DialogDescription>
        <div className="private-game-player__stage">
          {!ready && !error && (
            <div className="absolute inset-0 space-y-4 p-6" role="status" aria-label={`Loading ${game.name}`}>
              <Skeleton className="h-8 w-2/3" /><Skeleton className="h-3/4 w-full" />
              <p className="text-sm text-muted-foreground">Opening {game.name}…</p>
            </div>
          )}
          {html && !error && (
            <iframe ref={iframe} srcDoc={html} sandbox="allow-scripts" referrerPolicy="no-referrer"
              title={`${game.name} ${preview ? "private owner preview" : "VIP game"}`}
              className={`h-full w-full border-0 ${ready ? "" : "invisible"}`}
              tabIndex={ready ? 0 : -1}
               onError={() => { setHtml(null); setError(`${game.name} could not be loaded. Please try again.`); }}
            />
          )}
          {error && (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center" role="alert">
              <AlertCircle className="h-8 w-8 text-muted-foreground" />
              <h2 className="font-semibold">{accessLost ? "Play session ended" : `${game.name} is taking a moment`}</h2>
              <p className="max-w-md text-sm text-muted-foreground">{error}</p>
              {!accessLost && <Button variant="outline" onClick={retry}>Try again</Button>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

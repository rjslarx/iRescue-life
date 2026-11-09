import { useEffect, useRef, useState } from "react";
import { VIP_GAMES, type VipGameId } from "@shared/vip-games";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { donorGameRequest, teamGameRequest, pilotPath, pilotRequest } from "@/hooks/use-vip-game";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { withPrivateGamePresentation } from "./private-game-presentation";
import "./private-game-player.css";

interface PrivateGamePlayerProps {
  token?: string;
  preview?: boolean;
  gameId?: VipGameId;
  previewTenantId?: string;
  team?: boolean;
  onClose: () => void;
}

export function PrivateGamePlayer({ token, preview = false, team = false, gameId = "pasture-run", previewTenantId, onClose }: PrivateGamePlayerProps) {
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const isTeam = team && !preview;
  const teamIdentity = isTeam ? JSON.stringify([tenantId, user?.tenantId, user?.id, user?.activeRole, user?.roles]) : "";
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
    let sessionEnded = false;
    setHtml(null);
    setReady(false);
    setError(null);
    setAccessLost(false);
    const controllers = new Set<AbortController>();
    const failAccess = () => {
      if (!active) return;
      sessionEnded = true;
      setAccessLost(true);
      setHtml(null);
      setError(isTeam
        ? "Team play is no longer available. Return to Games to check your rescue’s access."
        : "Your private play session is no longer available. Return to your giving history to check access.");
      returnButton.current?.focus();
    };
    // Keep the promise across StrictMode's effect replay; launch is never called during render.
    const launchKey = JSON.stringify([token, preview, gameId, previewTenantId]);
    if (!isTeam && (!launch.current || launch.current.key !== launchKey)) {
      const promise = preview
        ? gameId === "rescue-shuffle" && !previewTenantId
          ? Promise.reject(new Error("Choose a rescue to preview Rescue Shuffle 15 with its animal photos."))
          : pilotRequest<{ html: string }>(`${pilotPath}/preview`, "POST", { gameId, ...(previewTenantId ? { tenantId: previewTenantId } : {}) })
        : token
          ? donorGameRequest<{ html: string }>(token, "launch", undefined, gameId)
          : Promise.reject(new Error("Please return to your giving history and open a new secure link."));
      launch.current = { key: launchKey, promise };
    }
    const launchController = new AbortController();
    controllers.add(launchController);
    const launchPromise = isTeam
      ? teamGameRequest<{ html: string }>("launch", launchController.signal, gameId)
      : launch.current!.promise;
    launchPromise.then((result) => {
      if (!active || sessionEnded) return;
      if (!result.html) throw new Error("The game could not be loaded. Please try again.");
      setHtml(gameId === "pasture-run" ? withPrivateGamePresentation(result.html) : result.html);
    }).catch((reason: Error) => {
      if (active) {
        if (isTeam && [401, 403].includes((reason as Error & { status?: number }).status ?? 0)) failAccess();
        else { setError(reason.message); setHtml(null); }
      }
    });

    const onMessage = (event: MessageEvent) => {
      if (sessionEnded || !iframe.current || event.source !== iframe.current.contentWindow || !event.data || typeof event.data !== "object") return;
      const messagePrefix = gameId === "pasture-run" ? "pasture" : "rescue-shuffle";
      if (event.data.type === `${messagePrefix}-ready`) {
        readyReceived = true;
        setReady(true);
      }
      if (event.data.type === `${messagePrefix}-start` && readyReceived && !preview && (isTeam || token)) {
        const controller = new AbortController();
        controllers.add(controller);
        void (isTeam
          ? teamGameRequest<void>("start", controller.signal, gameId)
          : donorGameRequest<void>(token!, "start", controller.signal, gameId))
          .catch(() => { if (!controller.signal.aborted) failAccess(); })
          .finally(() => controllers.delete(controller));
      }
    };
    window.addEventListener("message", onMessage);
    const timeout = window.setTimeout(() => {
      if (!active || sessionEnded || readyReceived) return;
      setHtml(null);
      setError(`${game.name} did not finish loading. Please try again.`);
      returnButton.current?.focus();
    }, 25000);
    const checkAccess = async () => {
      if (!active || sessionEnded || preview || (!isTeam && !token)) return;
      const controller = new AbortController();
      controllers.add(controller);
      const deadline = window.setTimeout(() => controller.abort(), 10000);
      try {
        const access = isTeam
          ? await teamGameRequest<{ eligible: boolean }>("access", controller.signal)
          : await donorGameRequest<{ eligible: boolean }>(token!, "access", controller.signal);
        if (!access.eligible) failAccess();
      } catch { failAccess(); }
      finally { window.clearTimeout(deadline); controllers.delete(controller); }
    };
    const interval = preview ? undefined : window.setInterval(() => { void checkAccess(); }, 60000);
    const onVisibility = () => { if (document.visibilityState === "visible") void checkAccess(); };
    const onFocus = () => { void checkAccess(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      controllers.forEach((controller) => controller.abort());
      window.clearTimeout(timeout);
      if (interval !== undefined) window.clearInterval(interval);
      window.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [attempt, token, preview, isTeam, teamIdentity, gameId, previewTenantId, game.name]);

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
            aria-label={preview ? "Return to pilot" : isTeam ? "Return to Games" : "Return to giving history"}
            title={preview ? "Return to pilot" : isTeam ? "Return to Games" : "Return to giving history"}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />Return
          </Button>
          <DialogTitle className="private-game-player__title">{game.name} {preview ? "· Owner preview" : isTeam ? "· Team play" : ""}</DialogTitle>
          {ready && !error && <Button variant="ghost" onClick={() => iframe.current?.focus()}>Focus game</Button>}
        </div>
        <DialogDescription className="sr-only">{preview ? "Private sandbox. Preview runs are not recorded." : isTeam ? "A little downtime for your rescue team. No VIP membership or invitation needed." : "A little playtime, with thanks for your VIP support."}</DialogDescription>
        <div className="private-game-player__stage">
          {!ready && !error && (
            <div className="absolute inset-0 space-y-4 p-6" role="status" aria-label={`Loading ${game.name}`}>
              <Skeleton className="h-8 w-2/3" /><Skeleton className="h-3/4 w-full" />
              <p className="text-sm text-muted-foreground">Opening {game.name}…</p>
            </div>
          )}
          {html && !error && (
            <iframe ref={iframe} srcDoc={html} sandbox="allow-scripts" referrerPolicy="no-referrer"
              title={`${game.name} ${preview ? "private owner preview" : isTeam ? "team game" : "VIP game"}`}
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

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, Gamepad2, PauseCircle, Play, PawPrint, Grid3X3, Layers3, CircleDot } from "lucide-react";
import { VIP_GAMES, type VipGameId } from "@shared/vip-games";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useTeamGameAccess } from "@/hooks/use-vip-game";
import DashboardLayout from "@/components/DashboardLayout";
import { PrivateGamePlayer } from "@/components/vip/PrivateGamePlayer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

function GamesLoading() {
  return (
    <div className="space-y-5 p-6" role="status" aria-label="Checking team game access">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-56 w-full" />
      <span className="sr-only">Checking your rescue’s game access…</span>
    </div>
  );
}

function SignedInGames() {
  const access = useTeamGameAccess();
  const [selectedGame, setSelectedGame] = useState<VipGameId | null>(null);
  const permitted = access.data?.eligible === true && !access.isError;
  useEffect(() => {
    if (!permitted) setSelectedGame(null);
  }, [permitted]);

  return (
    <DashboardLayout title="Games" description="A little downtime for the people who show up.">
      <div className="mx-auto max-w-5xl space-y-6">
        {access.isPending ? <GamesLoading /> : access.isError ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 p-6" role="alert">
              <AlertCircle className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-lg font-semibold">{access.error.status === 401 ? "Please sign in again" : access.error.status === 403 ? "Team access required" : "We couldn’t check game access"}</h2>
              <p className="max-w-xl text-sm text-muted-foreground">{access.error.status === 403 ? "Games are available to your rescue’s staff and volunteers. Foster-only and adopter-only accounts do not have team play access." : access.error.message}</p>
              {access.error.status === 401 ? <Button asChild><Link href="/login">Sign in</Link></Button> : <Button variant="outline" onClick={() => void access.refetch()} disabled={access.isFetching}>Check again</Button>}
            </CardContent>
          </Card>
        ) : !permitted ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 p-6 sm:p-8">
              <PauseCircle className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-xl font-semibold">Team games aren’t available right now</h2>
              <p className="max-w-xl text-sm text-muted-foreground">Your rescue’s game pilot may be paused. Team play is available to staff and volunteers when the pilot is enabled—no Rescue Pack membership or invitation needed.</p>
              <Button variant="outline" onClick={() => void access.refetch()} disabled={access.isFetching}>Check availability</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <section className="rounded-lg border bg-primary/5 p-6 sm:p-8" aria-labelledby="team-games-welcome">
              <div className="mb-4 flex items-center gap-3">
                <Gamepad2 className="h-6 w-6 text-primary" aria-hidden="true" />
                <Badge variant="secondary">Team play</Badge>
              </div>
              <h2 id="team-games-welcome" className="text-2xl font-semibold tracking-tight sm:text-3xl">Take a well-earned breather.</h2>
              <p className="mt-3 max-w-2xl text-muted-foreground">A quick run, a quiet puzzle, then back to the animals. These games are a thank-you for your rescue’s staff and volunteers. No Rescue Pack membership or invitation required.</p>
            </section>
            <section className="grid grid-cols-1 gap-5 md:grid-cols-2" aria-label="Choose a game">
              {VIP_GAMES.map((game) => {
                const Icon = game.id === "pasture-run" ? PawPrint : game.id === "rescue-shuffle" ? Grid3X3 : game.id === "rescue-merge" ? CircleDot : Layers3;
                return (
                  <Card key={game.id} className="flex flex-col overflow-hidden">
                    <div className="flex h-28 items-center justify-center border-b bg-muted/40" aria-hidden="true">
                      <Icon className="h-12 w-12 text-primary/70" strokeWidth={1.3} />
                    </div>
                    <CardHeader>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{game.id === "pasture-run" ? "A change of pace" : game.id === "rescue-shuffle" ? "One tile at a time" : game.id === "rescue-merge" ? "Drop, match, make room" : "Match three, clear the dock"}</p>
                      <CardTitle className="text-xl">{game.name}</CardTitle>
                      <CardDescription>{game.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto">
                      <Button className="w-full sm:w-auto" onClick={() => setSelectedGame(game.id)} data-testid={`play-team-${game.id}`}>
                        <Play className="mr-2 h-4 w-4" aria-hidden="true" />Play {game.name}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </section>
            <p className="text-sm text-muted-foreground">Games open in a full-screen player. Use Return to come back here. Team play stays separate from donor activity.</p>
          </>
        )}
        {selectedGame && permitted && (
          <PrivateGamePlayer key={selectedGame} team gameId={selectedGame} onClose={() => {
            setSelectedGame(null);
            void access.refetch();
          }} />
        )}
      </div>
    </DashboardLayout>
  );
}

export default function TeamGamesPage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { tenantId } = useTenant();
  if (isLoading) return <GamesLoading />;
  if (!isAuthenticated || !user) return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Gamepad2 className="mb-3 h-8 w-8 text-primary" aria-hidden="true" />
          <CardTitle>A little downtime for your team</CardTitle>
          <CardDescription>Sign in with your rescue account to check team game access.</CardDescription>
        </CardHeader>
        <CardContent><Button asChild className="w-full"><Link href="/login">Sign in to your rescue</Link></Button></CardContent>
      </Card>
    </main>
  );
  return <SignedInGames key={`${tenantId}:${user.tenantId}:${user.id}:${user.activeRole}:${user.roles.join(",")}`} />;
}

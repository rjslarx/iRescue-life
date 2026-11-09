import { useState } from "react";
import { VIP_GAMES, type VipGameId } from "@shared/vip-games";
import { useQuery } from "@tanstack/react-query";
import { Gamepad2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PrivateGamePlayer } from "@/components/vip/PrivateGamePlayer";
import { donorGameRequest } from "@/hooks/use-vip-game";

export function VipGamePerk({ token }: { token: string }) {
  const [activeGame, setActiveGame] = useState<VipGameId | null>(null);
  const { data, isError } = useQuery({
    queryKey: ["/api/vip-portal/game/access", token],
    queryFn: ({ signal }) => donorGameRequest<{ eligible: boolean }>(token, "access", signal),
    retry: false,
    refetchInterval: 60000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
  // Fail closed: never advertise a private perk to an unverified or ineligible donor.
  if (!data?.eligible || isError) return null;
  return (
    <Card className="border-primary/20 bg-primary/5 p-5 sm:p-6" data-testid="vip-game-perk">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-background text-primary"><Gamepad2 className="h-6 w-6" /></div>
        <div className="flex-1 space-y-2">
          <Badge variant="secondary">Your private VIP bonus</Badge>
          <h3 className="font-display text-xl font-semibold">A little playtime, with our thanks</h3>
          <p className="text-sm text-muted-foreground">Choose a private game as a thank-you for the VIP support you already give. No extra donation needed.</p>
        </div>
      </div>
      <ul className="mt-5 divide-y divide-primary/10 border-t border-primary/10">
        {VIP_GAMES.map((game) => (
          <li key={game.id} className="flex flex-col gap-3 py-4 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1"><h4 className="font-semibold">{game.name}</h4><p className="text-sm text-muted-foreground">{game.description}</p></div>
            <Button className="self-start sm:shrink-0" onClick={() => setActiveGame(game.id)} data-testid={`button-launch-${game.id}`}>Play {game.name}<ArrowRight className="ml-2 h-4 w-4" /></Button>
          </li>
        ))}
      </ul>
      {activeGame && <PrivateGamePlayer key={`${token}:${activeGame}`} token={token} gameId={activeGame} onClose={() => setActiveGame(null)} />}
    </Card>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { TransportBroadcastSummary } from "./TransportBroadcastSummary";
import type { TransportBroadcastResult } from "@/lib/transport-broadcast-results";

export function TransportBroadcastHistory({ tenantId, transportId }: { tenantId: string; transportId: string }) {
  const [offset, setOffset] = useState(0);
  const history = useQuery<{
    attempts: { id: string; message: string; createdAt: string; complete: boolean; results: TransportBroadcastResult[] }[];
    nextOffset: number | null;
  }>({
    queryKey: ["transport-broadcast-history", tenantId, transportId, offset],
    queryFn: async () => (await apiRequest("GET", `/api/transports/${transportId}/sms-broadcasts?offset=${offset}`)).json(),
    staleTime: 0,
    refetchInterval: query => query.state.data?.attempts.some(a => !a.complete && Date.now() - new Date(a.createdAt).getTime() < 300000) ? 5000 : false,
  });
  return <section className="space-y-3" data-testid="transport-broadcast-history">
    <h4 className="font-medium">Broadcast history</h4>
    <p className="text-sm text-muted-foreground">Saved attempts include paused and unsubscribed recipients. Older broadcasts sent before history was enabled are not included.</p>
    <Button variant="outline" size="sm" onClick={() => history.refetch()} disabled={history.isFetching}>Refresh history</Button>
    {history.isPending ? <p role="status">Loading broadcast history…</p> : history.isError ?
      <p role="alert">History could not be loaded. Do not resend a broadcast based on missing results. Refresh history or check SMS logs.</p> :
      history.data.attempts.length === 0 ? <p>No saved broadcasts on this page.</p> :
      history.data.attempts.map(attempt => <details key={attempt.id} className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm">
          {new Date(attempt.createdAt).toLocaleString()} — {attempt.results.length} unique phone numbers
          {!attempt.complete && " — results incomplete"}
        </summary>
        <p className="my-3 whitespace-pre-wrap break-words text-sm">{attempt.message}</p>
        {!attempt.complete && <p className="text-sm mb-2">This attempt is still running or was interrupted. Unconfirmed outcomes must not be retried.</p>}
        <TransportBroadcastSummary results={attempt.results} />
      </details>)}
    <div className="flex gap-2">
      {offset > 0 && <Button variant="outline" onClick={() => setOffset(Math.max(0, offset - 20))}>Newer broadcasts</Button>}
      {history.data?.nextOffset != null && <Button variant="outline" onClick={() => setOffset(history.data!.nextOffset!)}>Older broadcasts</Button>}
    </div>
  </section>;
}

import * as React from "react";
import { broadcastOutcomeCopy, summarizeTransportBroadcast, type BroadcastOutcome, type TransportBroadcastResult } from "../lib/transport-broadcast-results";

export function TransportBroadcastSummary({ results }: { results?: TransportBroadcastResult[] }) {
  if (!results?.length) {
    return <div role="status" className="rounded-md border p-3 text-sm" data-testid="transport-broadcast-summary">
      <h4 className="font-medium">Broadcast outcome uncertain</h4>
      <p>Recipient results could not be confirmed. Do not resend this broadcast. Check the SMS logs and provider records first; some messages may already have been accepted.</p>
    </div>;
  }
  const { groups, total, duplicates } = summarizeTransportBroadcast(results);
  return <div role="status" className="space-y-3 rounded-md border p-3 text-sm" data-testid="transport-broadcast-summary">
    <h4 className="font-medium">Broadcast results — {total} unique phone {total === 1 ? "number" : "numbers"}</h4>
    {duplicates > 0 && <p className="text-muted-foreground">{duplicates} duplicate subscriber {duplicates === 1 ? "entry counted" : "entries counted"} only once.</p>}
    {(Object.keys(broadcastOutcomeCopy) as BroadcastOutcome[]).map(outcome => {
      const recipients = groups[outcome];
      if (!recipients.length) return null;
      const copy = broadcastOutcomeCopy[outcome];
      return <section key={outcome} data-testid={`broadcast-outcome-${outcome}`}>
        <h5 className="font-medium">{copy.label}: {recipients.length}</h5>
        <p className="text-muted-foreground">{copy.guidance}</p>
        {outcome !== "sent" && <details className="mt-1">
          <summary className="cursor-pointer">View affected numbers</summary>
          <ul className="space-y-1 mt-1">
            {recipients.map(result => <li key={result.number} className="break-words">
              <span className="font-mono">{result.number}</span>{result.error && <> — {result.error}</>}
            </li>)}
          </ul>
        </details>}
      </section>;
    })}
  </div>;
}

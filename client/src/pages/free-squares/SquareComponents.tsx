import { useEffect } from "react";
import type { ReactNode } from "react";
import { AlertCircle, Grid3X3, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { FreeSquareBoard } from "@shared/free-squares";
import { squareError } from "./use-free-squares";
import "./free-squares.css";

export function useSquarePrivacy() {
  useEffect(() => {
    const previous = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const oldContent = previous?.content;
    const meta = previous || document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow, noarchive";
    if (!previous) document.head.appendChild(meta);
    return () => {
      if (previous) previous.content = oldContent || "";
      else meta.remove();
    };
  }, []);
}
export function SquareLoading() {
  return <div className="space-y-4 p-6" aria-label="Loading community squares" role="status">
    <Skeleton className="h-8 w-56" /><Skeleton className="h-28 w-full rounded-xl" /><Skeleton className="h-80 w-full rounded-xl" />
  </div>;
}
export function SquareError({ error, retry }: { error: unknown; retry?: () => void }) {
  return <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
    <div className="flex gap-2 items-start text-destructive"><AlertCircle className="h-5 w-5 shrink-0" /><p className="text-sm break-words">{squareError(error)}</p></div>
    {retry && <Button variant="outline" size="sm" onClick={retry}>Try again</Button>}
  </div>;
}
export function SquareStatus({ status }: { status: FreeSquareBoard["status"] }) {
  return <Badge variant={status === "open" ? "default" : "secondary"} className="capitalize">{status === "open" ? "Open for reservations" : status}</Badge>;
}
export function SquareEmpty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="sq-panel text-center py-12 space-y-3">
    <Grid3X3 className="h-9 w-9 mx-auto text-muted-foreground" />
    <h2 className="font-semibold text-lg">{title}</h2><div className="text-sm text-muted-foreground max-w-md mx-auto">{children}</div>
  </div>;
}
export function SquareFreeNotice() {
  return <p className="flex gap-2 text-sm items-start text-muted-foreground"><ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />Free entry. No purchase or donation required. Your contact details stay private.</p>;
}
export function SquareScore({ board }: { board: Pick<FreeSquareBoard, "home_team" | "away_team" | "home_score" | "away_score"> }) {
  return <div className="flex items-center justify-between gap-4 rounded-xl border bg-background/50 p-5">
    <div className="min-w-0 flex-1"><p className="text-sm font-medium break-words mb-2">{board.home_team}</p><div className="sq-score">{board.home_score ?? "—"}</div></div>
    <span className="sq-eyebrow shrink-0">vs</span>
    <div className="min-w-0 flex-1 text-right"><p className="text-sm font-medium break-words mb-2">{board.away_team}</p><div className="sq-score">{board.away_score ?? "—"}</div></div>
  </div>;
}
export function SquareGrid({ claimed, selected = [], onSelect, disabled = false }: { claimed: number[]; selected?: number[]; onSelect?: (square: number) => void; disabled?: boolean }) {
  const claimedSet = new Set(claimed);
  return <div className="space-y-4">
    <div className="sq-grid" aria-label="Community board, squares 1 through 100">
      {Array.from({ length: 100 }, (_, index) => index + 1).map(number => {
        const isSelected = selected.includes(number);
        const isClaimed = claimedSet.has(number);
        return <button key={number} type="button" className="sq-cell" data-testid={`square-${number}`}
          data-claimed={isClaimed} data-selected={isSelected} aria-pressed={isSelected}
          aria-label={`Square ${number}, ${isClaimed ? "claimed" : isSelected ? "selected" : "available"}`}
          disabled={disabled || isClaimed || !onSelect || (selected.length >= 10 && !isSelected)}
          onClick={() => onSelect?.(number)}>{number}</button>;
      })}
    </div>
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
      <span className="flex gap-1.5 items-center"><span className="h-3 w-3 rounded-sm border bg-card" />Available</span>
      <span className="flex gap-1.5 items-center"><span className="h-3 w-3 rounded-sm border bg-muted" />Claimed</span>
      {onSelect && <span className="flex gap-1.5 items-center"><span className="h-3 w-3 rounded-sm bg-primary" />Your selection</span>}
    </div>
  </div>;
}

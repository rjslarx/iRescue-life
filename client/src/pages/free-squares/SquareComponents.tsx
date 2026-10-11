import { Fragment, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, Grid3X3, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  return <p className="flex gap-2 text-sm items-start text-muted-foreground"><ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />Display names are public on the board. Your real name and contact details stay private.</p>;
}
export function SquareScore({ board }: { board: Pick<FreeSquareBoard, "home_team" | "away_team" | "home_score" | "away_score"> }) {
  return <div className="flex items-center justify-between gap-4 rounded-xl border bg-background/50 p-5">
    <div className="min-w-0 flex-1"><p className="text-sm font-medium break-words mb-2">{board.home_team}</p><div className="sq-score">{board.home_score ?? "—"}</div></div>
    <span className="sq-eyebrow shrink-0">vs</span>
    <div className="min-w-0 flex-1 text-right"><p className="text-sm font-medium break-words mb-2">{board.away_team}</p><div className="sq-score">{board.away_score ?? "—"}</div></div>
  </div>;
}
export function SquareGrid({ board, claimed, displayNames = {}, selected = [], onSelect, disabled = false }: { board: Pick<FreeSquareBoard, "home_team" | "away_team" | "row_digits" | "column_digits" | "digits_assigned_at">; claimed: number[]; displayNames?: Record<string, string | null>; selected?: number[]; onSelect?: (square: number) => void; disabled?: boolean }) {
  const [inspected, setInspected] = useState<number | null>(null);
  const claimedSet = new Set(claimed);
  const assigned = !!board.digits_assigned_at;
  return <div className="space-y-4">
    <p className="text-xs text-muted-foreground">Scroll sideways to see the whole board. Tap a reserved square to read its full display name.</p>
    <div className="sq-board-scroll" tabIndex={0} role="region" aria-label="Scrollable community squares board">
    <div className="sq-axis-board">
      <p className="sq-axis-label sq-axis-top">{board.home_team} · Home · Columns / top</p>
      <p className="sq-axis-label sq-axis-left">{board.away_team} · Away · Rows / left</p>
      <div className="sq-grid" data-assigned={assigned} aria-label="Community board, squares 1 through 100">
      <span aria-hidden="true" />
      {Array.from({ length: 10 }, (_, column) => <span className="sq-digit" key={`column-${column}`} data-testid={`column-digit-${column}`} aria-label={`${board.home_team}, column ${column + 1}, ${assigned ? `score digit ${board.column_digits?.[column] ?? "pending"}` : "digit pending"}`}>{assigned ? board.column_digits?.[column] ?? "—" : "—"}</span>)}
      {Array.from({ length: 100 }, (_, index) => index + 1).map(number => {
        const isSelected = selected.includes(number);
        const isClaimed = claimedSet.has(number);
        const displayName = displayNames[String(number)]?.trim() || "Reserved";
        const row = Math.floor((number - 1) / 10);
        const column = (number - 1) % 10;
        return <Fragment key={number}>
          {column === 0 && <span className="sq-digit" data-testid={`row-digit-${row}`} aria-label={`${board.away_team}, row ${row + 1}, ${assigned ? `score digit ${board.row_digits?.[row] ?? "pending"}` : "digit pending"}`}>{assigned ? board.row_digits?.[row] ?? "—" : "—"}</span>}
          <button type="button" className="sq-cell" data-testid={`square-${number}`}
          data-claimed={isClaimed} data-selected={isSelected} aria-pressed={isClaimed ? undefined : isSelected}
          title={isClaimed ? `Square ${number} · ${displayName}` : undefined}
          aria-label={`Square ${number}, ${isClaimed ? `reserved, display name: ${displayName}` : isSelected ? "selected" : "available"}${assigned ? `, ${board.home_team} score digit ${board.column_digits?.[column]}, ${board.away_team} score digit ${board.row_digits?.[row]}` : ""}`}
          disabled={!isClaimed && (disabled || assigned || !onSelect || (selected.length >= 10 && !isSelected))}
          onClick={() => { if (isClaimed) setInspected(number); else onSelect?.(number); }}><span>{number}</span>{isClaimed && <span className="sq-cell-name">{displayName}</span>}</button>
        </Fragment>;
      })}
      </div>
    </div>
    </div>
    <p className="text-xs text-muted-foreground">{assigned ? "Headers show the permanent score digits. Use the last digit of each team’s score; square numbers 1–100 stay unchanged." : "Header digits are pending. After all 100 squares are reserved, staff can assign 0–9 once per axis in two independent random shuffles."}</p>
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
      <span className="flex gap-1.5 items-center"><span className="h-3 w-3 rounded-sm border bg-card" />Available</span>
      <span className="flex gap-1.5 items-center"><span className="h-3 w-3 rounded-sm border bg-muted" />Claimed</span>
      {onSelect && <span className="flex gap-1.5 items-center"><span className="h-3 w-3 rounded-sm bg-primary" />Your selection</span>}
    </div>
    <Dialog open={inspected !== null} onOpenChange={open => { if (!open) setInspected(null); }}>
      <DialogContent className="free-squares max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Square {inspected}</DialogTitle><DialogDescription>Public display name for this reserved square. Personal names and contact details are not shown.</DialogDescription></DialogHeader>
        <div className="rounded-lg border bg-muted/30 p-4 space-y-2"><p className="sq-eyebrow">Display name</p><p className="text-lg font-semibold break-words">{inspected !== null ? displayNames[String(inspected)]?.trim() || "Reserved" : ""}</p></div>
        {assigned && inspected !== null && <div className="space-y-2 text-sm"><p className="break-words">{board.home_team} · Home / column digit: <strong>{board.column_digits?.[(inspected - 1) % 10]}</strong></p><p className="break-words">{board.away_team} · Away / row digit: <strong>{board.row_digits?.[Math.floor((inspected - 1) / 10)]}</strong></p></div>}
        <Button variant="outline" onClick={() => setInspected(null)}>Back to board</Button>
      </DialogContent>
    </Dialog>
  </div>;
}

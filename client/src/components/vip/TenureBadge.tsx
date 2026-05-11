import { Award, Medal, Trophy, Gem } from "lucide-react";
import { cn } from "@/lib/utils";

export type TenureTier = "bronze" | "silver" | "gold" | "diamond";

export interface TenureInfo {
  tier: TenureTier;
  label: string;
  monthsActive: number;
}

export function calcTenure(since: string | Date, now: Date = new Date()): TenureInfo {
  const start = new Date(since);
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) months = 0;

  let tier: TenureTier = "bronze";
  if (months >= 24) tier = "diamond";
  else if (months >= 12) tier = "gold";
  else if (months >= 6) tier = "silver";

  const labelMap: Record<TenureTier, string> = {
    bronze: "Bronze Paw",
    silver: "Silver Paw",
    gold: "Gold Paw",
    diamond: "Diamond Paw",
  };
  return { tier, label: labelMap[tier], monthsActive: months };
}

interface TenureBadgeProps {
  since: string | Date;
  size?: "sm" | "md";
  showMonths?: boolean;
  className?: string;
  /**
   * If provided, freezes the tenure at this paid-month count instead of
   * computing it from `since`. Used for Forever Hero memorial tiles so the
   * badge donors earned at cancellation never silently advances.
   */
  frozenMonths?: number | null;
}

export function TenureBadge({ since, size = "md", showMonths = true, className, frozenMonths }: TenureBadgeProps) {
  const live = calcTenure(since);
  let monthsActive = live.monthsActive;
  let tier = live.tier;
  let label = live.label;
  if (typeof frozenMonths === "number" && Number.isFinite(frozenMonths) && frozenMonths >= 0) {
    monthsActive = Math.floor(frozenMonths);
    tier = monthsActive >= 24 ? "diamond" : monthsActive >= 12 ? "gold" : monthsActive >= 6 ? "silver" : "bronze";
    label = ({ bronze: "Bronze Paw", silver: "Silver Paw", gold: "Gold Paw", diamond: "Diamond Paw" } as const)[tier];
  }

  const Icon = tier === "diamond" ? Gem : tier === "gold" ? Trophy : tier === "silver" ? Medal : Award;

  const styles: Record<TenureTier, string> = {
    bronze:
      "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800",
    silver:
      "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800/60 dark:text-slate-100 dark:border-slate-600",
    gold:
      "bg-yellow-100 text-yellow-900 border-yellow-400 dark:bg-yellow-950/40 dark:text-yellow-200 dark:border-yellow-700",
    diamond:
      "bg-gradient-to-r from-cyan-100 via-sky-100 to-indigo-100 text-indigo-900 border-cyan-400 shadow-[0_0_12px_rgba(56,189,248,0.5)] dark:from-cyan-950/50 dark:via-sky-950/50 dark:to-indigo-950/50 dark:text-cyan-100 dark:border-cyan-700 dark:shadow-[0_0_14px_rgba(56,189,248,0.45)]",
  };

  const sizeClass = size === "sm" ? "text-xs px-2 py-0.5 gap-1" : "text-xs px-2.5 py-1 gap-1.5";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  const monthsLabel =
    monthsActive === 0
      ? "New"
      : monthsActive === 1
      ? "1 month"
      : monthsActive < 12
      ? `${monthsActive} months`
      : `${Math.floor(monthsActive / 12)}y${monthsActive % 12 ? ` ${monthsActive % 12}m` : ""}`;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border font-medium whitespace-nowrap",
        sizeClass,
        styles[tier],
        className,
      )}
      data-testid={`tenure-badge-${tier}`}
      title={`${label} · ${monthsLabel} as a sustaining donor`}
    >
      <Icon className={cn(iconSize, "shrink-0")} />
      <span>{label}</span>
      {showMonths ? <span className="opacity-75">· {monthsLabel}</span> : null}
    </span>
  );
}

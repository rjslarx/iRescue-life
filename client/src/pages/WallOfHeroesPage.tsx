import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Sparkles, Heart, ArrowLeft } from "lucide-react";
import PublicHeader from "@/components/PublicHeader";
import { useSEO } from "@/hooks/useSEO";
import { TenureBadge, calcTenure } from "@/components/vip/TenureBadge";
import { FeatheredAvatar } from "@/components/vip/FeatheredAvatar";
import type { Tenant } from "@shared/schema";

// Re-export so existing imports (e.g. tests) keep working after the
// component was extracted into its own shared module.
export { FeatheredAvatar };

export interface Hero {
  displayName: string;
  // Legacy alias for older cached responses; prefer `displayName`.
  firstName?: string;
  tierName: string | null;
  since: string;
  memorialPhotoUrl?: string | null;
  memorialFrameStyle?: "heart" | "paw" | null;
  foreverHero?: boolean;
  foreverHeroTenureMonths?: number | null;
  // Server-side flag combining "has memorial photo" with "name starts with In
  // Memory/Honor of". Older cached payloads won't have this; we fall back to
  // the regex check below.
  isMemorial?: boolean;
  // Task #210 — opt-in "From {first name + last initial}" attribution. Only
  // present when the donor explicitly enabled it; null/undefined otherwise.
  donorDisplayName?: string | null;
}

const MEMORIAL_PHRASE_RE = /^\s*in\s+(loving\s+)?(memory|honor)\s+of\b/i;
export function isMemorialHero(h: Hero): boolean {
  if (h.isMemorial) return true;
  if (h.memorialPhotoUrl) return true;
  const name = h.displayName ?? h.firstName ?? "";
  return MEMORIAL_PHRASE_RE.test(name);
}

export interface HonorRollEntry {
  tributeName: string;
  tributeKind: "memory" | "honor";
  frameStyle: "heart" | "paw";
  photoUrl: string | null;
  latestDonationDate: string;
  donorCount: number;
  // Task #210 — only set when exactly one donor contributed AND that donor
  // opted in. Null otherwise (no consent or multiple donors).
  donorDisplayName?: string | null;
}

interface WallResponse {
  heroes: Hero[];
  count: number;
  honorRoll?: HonorRollEntry[];
}

export const ALL_TIERS_KEY = "__all__";

// Unified tile model — every card on the page is rendered from one of these.
interface TileBase {
  key: string;
  name: string;
  since: string;
  index: number;
}
export interface HeroTile extends TileBase {
  kind: "hero";
  tierName: string | null;
  foreverHero: boolean;
  foreverHeroTenureMonths: number | null;
}
export interface TributeTile extends TileBase {
  kind: "tribute";
  photoUrl: string | null;
  donorCount: number;
  // For memorial-subscription heroes that ended up in this section but should
  // still surface their tier line + tenure badge + Forever Hero badge.
  tierName: string | null;
  foreverHero: boolean;
  foreverHeroTenureMonths: number | null;
  showTenure: boolean;
  // Pre-split display fields. The `name` field above remains the full
  // searchable string ("In loving memory of Bella"); the tile renders these
  // two so the bold honoree line gets the full row width without being
  // crowded by the eyebrow phrase next to a 56px avatar.
  eyebrow: string | null;
  honoreeName: string;
  // Task #210 — opt-in "From {first name + last initial}" line. Null when
  // the donor declined consent or when multiple donors contributed.
  donorDisplayName: string | null;
}

/**
 * Pull a leading "In loving memory of" / "In memory of" / "In honor of"
 * phrase off a memorial-subscription hero's saved display name so the tile
 * can render that phrase as a small eyebrow above the bold honoree name.
 * Returns `eyebrow = null` when the saved name doesn't start with one of
 * those phrases — those tiles fall through with no eyebrow.
 */
const MEMORIAL_PREFIX_RE =
  /^\s*(in\s+loving\s+memory\s+of|in\s+memory\s+of|in\s+honor\s+of)\s+(.+?)\s*$/i;
function splitMemorialDisplayName(displayName: string): {
  eyebrow: string | null;
  honoreeName: string;
} {
  const m = displayName.match(MEMORIAL_PREFIX_RE);
  if (!m) return { eyebrow: null, honoreeName: displayName };
  const matched = m[1].replace(/\s+/g, " ").trim().toLowerCase();
  // Memorial-subscription heroes whose saved name starts with the bare
  // "In memory of …" get a tighter "In memory" eyebrow (per task spec).
  // The longer "In loving memory of" and "In honor of" phrases are kept
  // intact, title-cased.
  let eyebrow: string;
  if (matched === "in memory of") {
    eyebrow = "In memory";
  } else {
    eyebrow = matched.charAt(0).toUpperCase() + matched.slice(1);
  }
  return { eyebrow, honoreeName: m[2].trim() };
}
export type Tile = HeroTile | TributeTile;

// --- Pure helpers (exported for testing) ----------------------------------

export function buildTributeTiles(
  heroes: Hero[],
  honorRoll: HonorRollEntry[],
): TributeTile[] {
  const fromMemorialHeroes: TributeTile[] = heroes
    .filter(isMemorialHero)
    .map((h, i) => {
      const fullName = h.displayName || h.firstName || "Anonymous";
      const { eyebrow, honoreeName } = splitMemorialDisplayName(fullName);
      return {
        kind: "tribute",
        key: `mem-${h.displayName ?? h.firstName ?? "anon"}-${h.since}-${i}`,
        name: fullName,
        eyebrow,
        honoreeName,
        since: h.since,
        photoUrl: h.memorialPhotoUrl ?? null,
        donorCount: 1,
        tierName: h.tierName,
        foreverHero: !!h.foreverHero,
        foreverHeroTenureMonths: h.foreverHeroTenureMonths ?? null,
        showTenure: true,
        index: i,
        donorDisplayName: h.donorDisplayName ?? null,
      };
    });

  const fromHonorRoll: TributeTile[] = honorRoll.map((entry, i) => {
    const phrase = entry.tributeKind === "memory" ? "In loving memory of" : "In honor of";
    return {
      kind: "tribute",
      key: `hr-${entry.tributeName}-${i}`,
      name: `${phrase} ${entry.tributeName}`,
      eyebrow: phrase,
      honoreeName: entry.tributeName,
      since: entry.latestDonationDate,
      photoUrl: entry.photoUrl,
      donorCount: entry.donorCount,
      tierName: null,
      foreverHero: false,
      foreverHeroTenureMonths: null,
      showTenure: false,
      index: fromMemorialHeroes.length + i,
      // Only render attribution when exactly one donor contributed AND
      // they opted in. Server already enforces this; the extra guard here
      // is belt-and-suspenders against stale clients.
      donorDisplayName: entry.donorCount === 1 ? (entry.donorDisplayName ?? null) : null,
    };
  });

  return [...fromMemorialHeroes, ...fromHonorRoll];
}

export function buildHeroTiles(heroes: Hero[]): HeroTile[] {
  return heroes
    .filter((h) => !isMemorialHero(h))
    .map((h, i) => ({
      kind: "hero",
      key: `hero-${h.displayName ?? h.firstName ?? "anon"}-${h.since}-${i}`,
      name: h.displayName || h.firstName || "Anonymous",
      since: h.since,
      tierName: h.tierName,
      foreverHero: !!h.foreverHero,
      foreverHeroTenureMonths: h.foreverHeroTenureMonths ?? null,
      index: i,
    }));
}

/**
 * Tribute tiles obey the search box on every render. The tier-filter pills,
 * however, are conceptually about donor tiers — tributes don't have one — so
 * selecting any specific tier hides the whole tribute section. With the
 * "All Heroes" pill active the section stays visible (subject to search).
 */
export function filterTributeTiles(
  tiles: TributeTile[],
  search: string,
  activeTier: string,
): TributeTile[] {
  if (activeTier !== ALL_TIERS_KEY) return [];
  const q = search.trim().toLowerCase();
  return tiles.filter((t) => {
    if (q && !t.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function filterHeroTiles(
  tiles: HeroTile[],
  search: string,
  activeTier: string,
): HeroTile[] {
  const q = search.trim().toLowerCase();
  return tiles.filter((t) => {
    if (q && !t.name.toLowerCase().includes(q)) return false;
    if (activeTier !== ALL_TIERS_KEY && t.tierName !== activeTier) return false;
    return true;
  });
}

export default function WallOfHeroesPage() {
  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ["/api/tenant"],
  });
  const tenant = tenantData?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";

  useSEO({
    title: `Wall of Heroes | ${rescueName}`,
    description: `Celebrating the monthly donors whose recurring support powers ${rescueName}'s mission every single day.`,
    siteName: rescueName,
  });

  const [search, setSearch] = useState("");
  const [activeTier, setActiveTier] = useState<string>(ALL_TIERS_KEY);

  const { data, isLoading } = useQuery<WallResponse>({
    queryKey: ["/api/vip-club/wall-of-heroes"],
  });

  const heroes = data?.heroes ?? [];
  const honorRoll = data?.honorRoll ?? [];

  const tierOptions = useMemo(() => {
    const set = new Set<string>();
    for (const h of heroes) {
      if (h.tierName) set.add(h.tierName);
    }
    return Array.from(set).sort();
  }, [heroes]);

  // --- Tile assembly --------------------------------------------------------

  const tributeTiles = useMemo<TributeTile[]>(
    () => buildTributeTiles(heroes, honorRoll),
    [heroes, honorRoll],
  );

  const heroTiles = useMemo<HeroTile[]>(() => buildHeroTiles(heroes), [heroes]);

  // --- Filtering ------------------------------------------------------------

  const filteredTributes = useMemo(
    () => filterTributeTiles(tributeTiles, search, activeTier),
    [tributeTiles, search, activeTier],
  );

  const filteredHeroes = useMemo(
    () => filterHeroTiles(heroTiles, search, activeTier),
    [heroTiles, search, activeTier],
  );

  // Stats for the hero summary (unchanged — based on the full heroes list).
  const totalCount = heroes.length;
  const diamondCount = useMemo(
    () => heroes.filter((h) => calcTenure(h.since).tier === "diamond").length,
    [heroes],
  );
  const goldOrBetter = useMemo(
    () =>
      heroes.filter((h) => {
        const t = calcTenure(h.since).tier;
        return t === "gold" || t === "diamond";
      }).length,
    [heroes],
  );

  // "All Heroes" pill total reflects monthly heroes + tribute tiles so the
  // count visitors see matches the visible cards on the page.
  const allTotal = heroes.length + honorRoll.length;

  const noResults =
    !isLoading && filteredTributes.length === 0 && filteredHeroes.length === 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
      <main className="flex-1">
        {/* Hero / Intro */}
        <section className="border-b bg-gradient-to-b from-primary/5 to-transparent">
          <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
            <Link href="/vip-club">
              <Button variant="ghost" size="sm" className="mb-4 -ml-2" data-testid="link-back-vip-club">
                <ArrowLeft className="h-4 w-4" />
                Back to VIP Club
              </Button>
            </Link>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-3">
                  <Heart className="h-3.5 w-3.5" />
                  Our sustaining donors
                </div>
                <h1
                  className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight"
                  data-testid="text-page-title"
                >
                  Wall of Heroes
                </h1>
                <p className="mt-3 text-muted-foreground max-w-2xl">
                  These are the monthly donors whose recurring support powers our mission every single day. Their loyalty is measured in months — and every milestone is celebrated.
                </p>
              </div>
              <div className="flex gap-3 sm:gap-4">
                <Stat label="Heroes" value={totalCount} testId="stat-total-heroes" />
                <Stat label="Gold+" value={goldOrBetter} testId="stat-gold-heroes" />
                <Stat label="Diamond" value={diamondCount} testId="stat-diamond-heroes" />
              </div>
            </div>
          </div>
        </section>

        {/* Filters */}
        <section className="border-b sticky top-0 z-30 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name…"
                className="pl-9"
                data-testid="input-search-heroes"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterPill
                label="All Heroes"
                count={allTotal}
                active={activeTier === ALL_TIERS_KEY}
                onClick={() => setActiveTier(ALL_TIERS_KEY)}
                testId="filter-all"
              />
              {tierOptions.map((t) => (
                <FilterPill
                  key={t}
                  label={t}
                  count={heroes.filter((h) => h.tierName === t).length}
                  active={activeTier === t}
                  onClick={() => setActiveTier(t)}
                  testId={`filter-tier-${t.toLowerCase().replace(/\s+/g, "-")}`}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Loading skeletons */}
        {isLoading && (
          <section className="container max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-md" />
              ))}
            </div>
          </section>
        )}

        {/* In Loving Memory & Honor — combines memorial-subscription heroes
            and one-time tribute gifts into a single tribute section, all
            rendered with the unified tile design. */}
        {!isLoading && filteredTributes.length > 0 && (
          <section
            className="container max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12"
            data-testid="section-in-memory-and-honor"
          >
            <div className="rounded-md bg-rose-50/60 dark:bg-rose-950/20 ring-1 ring-rose-200/60 dark:ring-rose-900/40 p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-2">
                <Heart className="h-4 w-4 text-rose-500" fill="currentColor" />
                <h2 className="font-display text-xl sm:text-2xl font-semibold">
                  In Loving Memory &amp; Honor
                </h2>
                <Badge variant="outline" className="text-xs">{filteredTributes.length}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-5 max-w-2xl">
                Gifts given in memory or honor of someone special.
              </p>
              <div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                data-testid="grid-in-memory-and-honor"
              >
                {filteredTributes.map((t) => (
                  <UnifiedTile key={t.key} tile={t} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Our Sustaining Heroes — monthly donors. */}
        {!isLoading && filteredHeroes.length > 0 && (
          <section
            className="container max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12"
            data-testid="section-sustaining-heroes"
          >
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="font-display text-xl sm:text-2xl font-semibold">
                Our Sustaining Heroes
              </h2>
              <Badge variant="outline" className="text-xs">{filteredHeroes.length}</Badge>
            </div>
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              data-testid="grid-heroes"
            >
              {filteredHeroes.map((t) => (
                <UnifiedTile key={t.key} tile={t} />
              ))}
            </div>
          </section>
        )}

        {/* Empty state — only when nothing qualifies anywhere on the page. */}
        {noResults && (
          <section className="container max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
            <div className="text-center py-16 border rounded-md bg-muted/30">
              <Sparkles className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p
                className="text-muted-foreground italic"
                data-testid="text-empty-state"
              >
                {heroes.length === 0 && honorRoll.length === 0
                  ? "Be the first to join our Wall of Heroes!"
                  : "No heroes match your search."}
              </p>
              {heroes.length === 0 && honorRoll.length === 0 ? (
                <Link href="/vip-club">
                  <Button variant="default" className="mt-4" data-testid="button-join-vip-empty">
                    Become a sustaining donor
                  </Button>
                </Link>
              ) : null}
            </div>
          </section>
        )}

        {/* Bottom spacer so the last section breathes before the CTA. */}
        {!isLoading && !noResults && <div className="py-6 sm:py-10" />}

        {/* CTA */}
        <section className="border-t bg-muted/30">
          <div className="container max-w-3xl mx-auto px-4 sm:px-6 py-12 text-center">
            <h2 className="font-display text-2xl sm:text-3xl font-bold mb-3">Want to see your name here?</h2>
            <p className="text-muted-foreground mb-6">
              Join our VIP Club and become a sustaining monthly donor. Every level of support saves lives — and earns you a permanent spot on the Wall.
            </p>
            <Link href="/vip-club">
              <Button size="lg" data-testid="button-join-vip-cta">
                Join the VIP Club
              </Button>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="text-center px-3" data-testid={testId}>
      <div className="text-2xl sm:text-3xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}

function FilterPill({
  label,
  count,
  active,
  onClick,
  testId,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      className="gap-2"
      data-testid={testId}
    >
      <span>{label}</span>
      <Badge variant={active ? "secondary" : "outline"} className="text-xs">
        {count}
      </Badge>
    </Button>
  );
}

/**
 * The single tile component for the entire wall. Supports two visual kinds:
 *  - "hero":     Sparkles in a primary-tinted disc, tenure paw badge.
 *  - "tribute":  Feathered photo (or Heart fallback) in a rose-tinted disc,
 *                no tenure badge by default.
 */
export function UnifiedTile({ tile }: { tile: Tile }) {
  const sinceLabel = new Date(tile.since).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });

  if (tile.kind === "hero") {
    const { tier } = calcTenure(tile.since);
    return (
      <Card
        className={
          "p-4 flex flex-col gap-3 hover-elevate transition-shadow " +
          (tier === "diamond" ? "ring-1 ring-cyan-400/40 dark:ring-cyan-700/50" : "")
        }
        data-testid={`card-hero-${tile.index}`}
      >
        <div className="flex items-start gap-3">
          <div
            className={
              "h-14 w-14 shrink-0 rounded-full flex items-center justify-center " +
              (tier === "diamond"
                ? "bg-gradient-to-br from-cyan-200 to-indigo-200 text-indigo-900 dark:from-cyan-900 dark:to-indigo-900 dark:text-cyan-100"
                : "bg-primary/10 text-primary")
            }
          >
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="font-semibold text-base truncate"
              data-testid={`text-hero-name-${tile.index}`}
            >
              {tile.name}
            </p>
            {tile.tierName ? (
              <p className="text-xs text-primary/80 font-medium truncate">{tile.tierName}</p>
            ) : null}
            <p className="text-xs text-muted-foreground mt-0.5">Since {sinceLabel}</p>
          </div>
        </div>
        <TenureBadge
          since={tile.since}
          className="self-start"
          frozenMonths={tile.foreverHero ? tile.foreverHeroTenureMonths ?? null : null}
        />
        {tile.foreverHero && (
          <Badge
            variant="outline"
            className="self-start text-[10px] border-amber-400/60 text-amber-700 dark:text-amber-300"
            data-testid={`badge-forever-hero-${tile.index}`}
          >
            <Sparkles className="h-3 w-3" />
            Forever Hero
          </Badge>
        )}
      </Card>
    );
  }

  // Tribute tile.
  return (
    <Card
      className="p-4 flex flex-col gap-3 hover-elevate"
      data-testid={`card-tribute-${tile.index}`}
    >
      <div className="flex items-start gap-3">
        <FeatheredAvatar photoUrl={tile.photoUrl} name={tile.name} sizePx={56} />
        <div className="min-w-0 flex-1">
          {tile.eyebrow ? (
            <p
              className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight"
              data-testid={`text-tribute-eyebrow-${tile.index}`}
            >
              {tile.eyebrow}
            </p>
          ) : null}
          <p
            className="font-semibold text-base leading-snug break-words line-clamp-2"
            data-testid={`text-tribute-name-${tile.index}`}
          >
            {tile.honoreeName}
          </p>
          {tile.tierName ? (
            <p className="text-xs text-primary/80 font-medium truncate">{tile.tierName}</p>
          ) : null}
          {tile.donorDisplayName && tile.donorCount === 1 ? (
            <p
              className="text-[10px] uppercase tracking-wide text-primary/80 truncate mt-0.5"
              data-testid={`text-tribute-from-${tile.index}`}
            >
              From {tile.donorDisplayName}
            </p>
          ) : null}
          {tile.donorCount > 1 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Honored by {tile.donorCount} donors
            </p>
          )}
          <p
            className="text-xs text-muted-foreground mt-0.5"
            data-testid={`text-tribute-since-${tile.index}`}
          >
            {tile.showTenure ? `Since ${sinceLabel}` : sinceLabel}
          </p>
        </div>
      </div>
      {tile.showTenure && (
        <TenureBadge
          since={tile.since}
          className="self-start"
          frozenMonths={tile.foreverHero ? tile.foreverHeroTenureMonths ?? null : null}
        />
      )}
      {tile.foreverHero && (
        <Badge
          variant="outline"
          className="self-start text-[10px] border-amber-400/60 text-amber-700 dark:text-amber-300"
          data-testid={`badge-forever-hero-tribute-${tile.index}`}
        >
          <Sparkles className="h-3 w-3" />
          Forever Hero
        </Badge>
      )}
    </Card>
  );
}

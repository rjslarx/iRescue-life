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
import type { Tenant } from "@shared/schema";

interface Hero {
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
}

const MEMORIAL_PHRASE_RE = /^\s*in\s+(loving\s+)?(memory|honor)\s+of\b/i;
function isMemorialHero(h: Hero): boolean {
  if (h.isMemorial) return true;
  if (h.memorialPhotoUrl) return true;
  const name = h.displayName ?? h.firstName ?? "";
  return MEMORIAL_PHRASE_RE.test(name);
}

interface HonorRollEntry {
  tributeName: string;
  tributeKind: "memory" | "honor";
  frameStyle: "heart" | "paw";
  photoUrl: string | null;
  latestDonationDate: string;
  donorCount: number;
}

interface WallResponse {
  heroes: Hero[];
  count: number;
  honorRoll?: HonorRollEntry[];
}

const ALL_TIERS_KEY = "__all__";

// Unified tile model — every card on the page is rendered from one of these.
interface TileBase {
  key: string;
  name: string;
  since: string;
  index: number;
}
interface HeroTile extends TileBase {
  kind: "hero";
  tierName: string | null;
  foreverHero: boolean;
  foreverHeroTenureMonths: number | null;
}
interface TributeTile extends TileBase {
  kind: "tribute";
  photoUrl: string | null;
  donorCount: number;
  // For memorial-subscription heroes that ended up in this section but should
  // still surface their tier line + tenure badge + Forever Hero badge.
  tierName: string | null;
  foreverHero: boolean;
  foreverHeroTenureMonths: number | null;
  showTenure: boolean;
}
type Tile = HeroTile | TributeTile;

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

  // Tribute tiles: memorial-subscription heroes + one-time honor-roll entries.
  const tributeTiles = useMemo<TributeTile[]>(() => {
    const fromMemorialHeroes: TributeTile[] = heroes
      .filter(isMemorialHero)
      .map((h, i) => ({
        kind: "tribute",
        key: `mem-${h.displayName ?? h.firstName ?? "anon"}-${h.since}-${i}`,
        name: h.displayName || h.firstName || "Anonymous",
        since: h.since,
        photoUrl: h.memorialPhotoUrl ?? null,
        donorCount: 1,
        tierName: h.tierName,
        foreverHero: !!h.foreverHero,
        foreverHeroTenureMonths: h.foreverHeroTenureMonths ?? null,
        showTenure: true,
        index: i,
      }));

    const fromHonorRoll: TributeTile[] = honorRoll.map((entry, i) => {
      const phrase = entry.tributeKind === "memory" ? "In loving memory of" : "In honor of";
      return {
        kind: "tribute",
        key: `hr-${entry.tributeName}-${i}`,
        name: `${phrase} ${entry.tributeName}`,
        since: entry.latestDonationDate,
        photoUrl: entry.photoUrl,
        donorCount: entry.donorCount,
        tierName: null,
        foreverHero: false,
        foreverHeroTenureMonths: null,
        showTenure: false,
        index: fromMemorialHeroes.length + i,
      };
    });

    return [...fromMemorialHeroes, ...fromHonorRoll];
  }, [heroes, honorRoll]);

  // Hero tiles: monthly donors that aren't classified as memorial.
  const heroTiles = useMemo<HeroTile[]>(() => {
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
  }, [heroes]);

  // --- Filtering ------------------------------------------------------------

  const q = search.trim().toLowerCase();

  const filteredTributes = useMemo(() => {
    return tributeTiles.filter((t) => {
      if (q && !t.name.toLowerCase().includes(q)) return false;
      // Tier filter excludes tribute tiles entirely (they have no donor tier).
      if (activeTier !== ALL_TIERS_KEY) return false;
      return true;
    });
  }, [tributeTiles, q, activeTier]);

  const filteredHeroes = useMemo(() => {
    return heroTiles.filter((t) => {
      if (q && !t.name.toLowerCase().includes(q)) return false;
      if (activeTier !== ALL_TIERS_KEY && t.tierName !== activeTier) return false;
      return true;
    });
  }, [heroTiles, q, activeTier]);

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
 * Soft, feathered round avatar for tribute tiles.
 *
 * Uses an SVG <radialGradient> alpha mask so the photo's edges fade gently
 * into the card background instead of being clipped to a hard heart/paw
 * silhouette. Falls back to a Heart icon on a rose-tinted disc when no
 * photo is provided.
 */
function FeatheredAvatar({
  photoUrl,
  name,
  sizePx = 56,
}: {
  photoUrl: string | null | undefined;
  name: string;
  sizePx?: number;
}) {
  // Stable mask id per render so multiple avatars on the same page don't
  // collide. React.useId can't be used at module top-level, but inline here.
  const maskId = useMemo(
    () => `feather-mask-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );

  if (!photoUrl) {
    return (
      <div
        className="shrink-0 rounded-full flex items-center justify-center bg-rose-100 dark:bg-rose-950/40 ring-1 ring-rose-300/60 dark:ring-rose-800/60"
        style={{ width: sizePx, height: sizePx }}
        aria-label={`Tribute for ${name}`}
        role="img"
        data-testid="feathered-avatar-fallback"
      >
        <Heart
          className="text-rose-500 dark:text-rose-400"
          style={{ width: sizePx * 0.4, height: sizePx * 0.4 }}
          fill="currentColor"
        />
      </div>
    );
  }

  return (
    <div
      className="relative shrink-0 rounded-full ring-1 ring-rose-300/60 dark:ring-rose-800/60"
      style={{ width: sizePx, height: sizePx }}
      aria-label={`Tribute photo for ${name}`}
      role="img"
      data-testid="feathered-avatar"
    >
      <svg
        viewBox="0 0 100 100"
        width={sizePx}
        height={sizePx}
        xmlns="http://www.w3.org/2000/svg"
        className="block rounded-full"
      >
        <defs>
          <radialGradient id={maskId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="70%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id={`${maskId}-mask`}>
            <rect x="0" y="0" width="100" height="100" fill={`url(#${maskId})`} />
          </mask>
        </defs>
        <image
          href={photoUrl}
          x="0"
          y="0"
          width="100"
          height="100"
          preserveAspectRatio="xMidYMid slice"
          mask={`url(#${maskId}-mask)`}
        />
      </svg>
    </div>
  );
}

/**
 * The single tile component for the entire wall. Supports two visual kinds:
 *  - "hero":     Sparkles in a primary-tinted disc, tenure paw badge.
 *  - "tribute":  Feathered photo (or Heart fallback) in a rose-tinted disc,
 *                no tenure badge by default.
 */
function UnifiedTile({ tile }: { tile: Tile }) {
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
          <p
            className="font-semibold text-base truncate"
            data-testid={`text-tribute-name-${tile.index}`}
          >
            {tile.name}
          </p>
          {tile.tierName ? (
            <p className="text-xs text-primary/80 font-medium truncate">{tile.tierName}</p>
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

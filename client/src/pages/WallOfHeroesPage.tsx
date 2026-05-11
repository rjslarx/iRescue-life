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
import { MemorialFrame } from "@/components/vip/MemorialFrame";
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
  // Memory/Honor of" — drives the In-Memory section. Older cached payloads
  // won't have this; we fall back to the regex check below.
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

  const filteredHonorRoll = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Tribute Wall respects search filter only (tier filter is donor-tier specific).
    if (!q) return honorRoll;
    return honorRoll.filter((h) => h.tributeName.toLowerCase().includes(q));
  }, [honorRoll, search]);

  const tierOptions = useMemo(() => {
    const set = new Set<string>();
    for (const h of heroes) {
      if (h.tierName) set.add(h.tierName);
    }
    return Array.from(set).sort();
  }, [heroes]);

  // Memorial heroes are pulled out of the regular grid and shown as their own
  // "In Memory" section above. Search + tier filters apply to both lists, but
  // we never want a tribute tile to also appear in the standard grid.
  const memorialHeroes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return heroes.filter((h) => {
      if (!isMemorialHero(h)) return false;
      if (activeTier !== ALL_TIERS_KEY && h.tierName !== activeTier) return false;
      const name = h.displayName ?? h.firstName ?? "";
      if (q && !name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [heroes, search, activeTier]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return heroes.filter((h) => {
      if (isMemorialHero(h)) return false;
      if (activeTier !== ALL_TIERS_KEY && h.tierName !== activeTier) return false;
      const name = h.displayName ?? h.firstName ?? "";
      if (q && !name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [heroes, search, activeTier]);

  // Stats for the hero summary
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
                count={heroes.length}
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

        {/* In Memory — Task #196. Memorial-tribute hero tiles (any sub with a
            memorial photo OR a recognition name starting with "In memory of"
            / "In honor of"). Sits above the regular grid; hidden when empty. */}
        {memorialHeroes.length > 0 && (
          <section
            className="container max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12"
            data-testid="section-in-memory"
          >
            <div className="flex items-center gap-2 mb-4">
              <Heart className="h-4 w-4 text-rose-500" fill="currentColor" />
              <h2 className="font-display text-xl sm:text-2xl font-semibold">In Memory</h2>
              <Badge variant="outline" className="text-xs">{memorialHeroes.length}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-5 max-w-2xl">
              Sustaining gifts given in memory or honor of someone special.
            </p>
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              data-testid="grid-in-memory"
            >
              {memorialHeroes.map((h, i) => (
                <MemorialHeroCard key={`${h.displayName ?? h.firstName}-${h.since}-${i}`} hero={h} index={i} />
              ))}
            </div>
          </section>
        )}

        {/* Tribute Wall — Task #198. Tribute gifts from the last 12 months. */}
        {filteredHonorRoll.length > 0 && (
          <section
            className="container max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12"
            data-testid="section-honor-roll"
          >
            <div className="flex items-center gap-2 mb-4">
              <Heart className="h-4 w-4 text-rose-500" fill="currentColor" />
              <h2 className="font-display text-xl sm:text-2xl font-semibold">Tribute Wall</h2>
              <Badge variant="outline" className="text-xs">{filteredHonorRoll.length}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-5 max-w-2xl">
              Names lifted up by gifts made in their memory or honor over the past year.
            </p>
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              data-testid="grid-honor-roll"
            >
              {filteredHonorRoll.map((entry, i) => (
                <HonorRollCard key={`${entry.tributeName}-${i}`} entry={entry} index={i} />
              ))}
            </div>
          </section>
        )}

        {/* Grid */}
        <section className="container max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-md" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 border rounded-md bg-muted/30">
              <Sparkles className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p
                className="text-muted-foreground italic"
                data-testid="text-empty-state"
              >
                {heroes.length === 0
                  ? "Be the first to join our Wall of Heroes!"
                  : "No heroes match your search."}
              </p>
              {heroes.length === 0 ? (
                <Link href="/vip-club">
                  <Button variant="default" className="mt-4" data-testid="button-join-vip-empty">
                    Become a sustaining donor
                  </Button>
                </Link>
              ) : null}
            </div>
          ) : (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              data-testid="grid-heroes"
            >
              {filtered.map((h, i) => (
                <HeroCard key={`${h.displayName ?? h.firstName}-${h.since}-${i}`} hero={h} index={i} />
              ))}
            </div>
          )}
        </section>

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

function HonorRollCard({ entry, index }: { entry: HonorRollEntry; index: number }) {
  const phrase = entry.tributeKind === "memory" ? "In loving memory of" : "In honor of";
  return (
    <Card
      className="p-4 flex items-start gap-3 hover-elevate"
      data-testid={`card-honor-roll-${index}`}
    >
      <MemorialFrame
        photoUrl={entry.photoUrl}
        name={entry.tributeName}
        frameStyle={entry.frameStyle}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{phrase}</p>
        <p
          className="font-semibold text-base truncate mt-0.5"
          data-testid={`text-honor-name-${index}`}
        >
          {entry.tributeName}
        </p>
        {entry.donorCount > 1 && (
          <p className="text-xs text-muted-foreground mt-1">
            Honored by {entry.donorCount} donors
          </p>
        )}
        <p
          className="text-xs text-muted-foreground mt-0.5"
          data-testid={`text-honor-month-${index}`}
        >
          {new Date(entry.latestDonationDate).toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>
    </Card>
  );
}

function MemorialHeroCard({ hero, index }: { hero: Hero; index: number }) {
  const sinceLabel = new Date(hero.since).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
  const frameStyle: "heart" | "paw" =
    hero.memorialFrameStyle === "paw" ? "paw" : "heart";
  const name = hero.displayName || hero.firstName || "Anonymous";
  return (
    <Card
      className="p-4 flex items-start gap-3 hover-elevate ring-1 ring-rose-300/40 dark:ring-rose-800/40"
      data-testid={`card-in-memory-${index}`}
    >
      <MemorialFrame
        photoUrl={hero.memorialPhotoUrl ?? null}
        name={name}
        frameStyle={frameStyle}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <p
          className="font-semibold text-base truncate"
          data-testid={`text-in-memory-name-${index}`}
        >
          {name}
        </p>
        {hero.tierName ? (
          <p className="text-xs text-primary/80 font-medium truncate">{hero.tierName}</p>
        ) : null}
        <div className="mt-1">
          <TenureBadge
            since={hero.since}
            size="sm"
            frozenMonths={hero.foreverHero ? hero.foreverHeroTenureMonths ?? null : null}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">Since {sinceLabel}</p>
        {hero.foreverHero && (
          <Badge
            variant="outline"
            className="mt-2 text-[10px] border-amber-400/60 text-amber-700 dark:text-amber-300"
            data-testid={`badge-forever-hero-${index}`}
          >
            <Sparkles className="h-3 w-3" />
            Forever Hero
          </Badge>
        )}
      </div>
    </Card>
  );
}

function HeroCard({ hero, index }: { hero: Hero; index: number }) {
  const { tier } = calcTenure(hero.since);
  const sinceLabel = new Date(hero.since).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
  return (
    <Card
      className={
        "p-4 flex flex-col gap-3 hover-elevate transition-shadow " +
        (tier === "diamond" ? "ring-1 ring-cyan-400/40 dark:ring-cyan-700/50" : "")
      }
      data-testid={`card-hero-${index}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={
            "h-11 w-11 shrink-0 rounded-full flex items-center justify-center " +
            (tier === "diamond"
              ? "bg-gradient-to-br from-cyan-200 to-indigo-200 text-indigo-900 dark:from-cyan-900 dark:to-indigo-900 dark:text-cyan-100"
              : "bg-primary/10 text-primary")
          }
        >
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="font-semibold text-base truncate"
            data-testid={`text-hero-name-${index}`}
          >
            {hero.displayName || hero.firstName || "Anonymous"}
          </p>
          {hero.tierName ? (
            <p className="text-xs text-primary/80 font-medium truncate">{hero.tierName}</p>
          ) : null}
          <p className="text-xs text-muted-foreground mt-0.5">Since {sinceLabel}</p>
        </div>
      </div>
      <TenureBadge since={hero.since} className="self-start" />
    </Card>
  );
}

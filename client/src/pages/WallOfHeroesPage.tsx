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

interface Hero {
  firstName: string;
  tierName: string | null;
  since: string;
}

interface WallResponse {
  heroes: Hero[];
  count: number;
}

const ALL_TIERS_KEY = "__all__";

export default function WallOfHeroesPage() {
  useSEO({
    title: "Wall of Heroes — Our Sustaining Monthly Donors",
    description:
      "Celebrating the monthly donors whose recurring support powers our rescue mission every single day.",
  });

  const [search, setSearch] = useState("");
  const [activeTier, setActiveTier] = useState<string>(ALL_TIERS_KEY);

  const { data, isLoading } = useQuery<WallResponse>({
    queryKey: ["/api/vip-club/wall-of-heroes"],
  });

  const heroes = data?.heroes ?? [];

  const tierOptions = useMemo(() => {
    const set = new Set<string>();
    for (const h of heroes) {
      if (h.tierName) set.add(h.tierName);
    }
    return Array.from(set).sort();
  }, [heroes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return heroes.filter((h) => {
      if (activeTier !== ALL_TIERS_KEY && h.tierName !== activeTier) return false;
      if (q && !(h.firstName ?? "").toLowerCase().includes(q)) return false;
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
      <PublicHeader />
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
                <HeroCard key={`${h.firstName}-${h.since}-${i}`} hero={h} index={i} />
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
            {hero.firstName || "Anonymous"}
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

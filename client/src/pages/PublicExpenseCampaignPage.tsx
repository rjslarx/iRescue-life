import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Heart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import PublicHeader from "@/components/PublicHeader";
import type { Tenant } from "@shared/schema";

interface MatchPoolPublic {
  tiers?: {
    id: string;
    sponsorLabel: string;
    pledgedCapCents: number;
    totalMatchedCents: number;
    remainingCents: number;
  }[] | null;
  sponsorLabel: string;
  pledgedCapCents: number;
  totalMatchedCents: number;
  remainingCents: number;
  ratioNumerator: number;
  ratioDenominator: number;
  perGiftCapCents: number | null;
  status: "active" | "exhausted" | "ended";
  effectiveStatus: "pending" | "active" | "exhausted" | "ended";
  startsAt: string | null;
  endsAt: string | null;
}

interface CampaignPublic {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  longDescription: string | null;
  heroImageUrl: string | null;
  goalAmountCents: number;
  raisedAmountCents: number;
  endDate: string | null;
  status: "active" | "ended" | "archived";
  totalImpactCents: number;
  goalMet: boolean;
}

const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

const PRESETS = [25, 50, 100, 250];

export default function PublicExpenseCampaignPage() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [amountDollars, setAmountDollars] = useState<string>("50");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const { data, isLoading } = useQuery<{ campaign: CampaignPublic; matchPool: MatchPoolPublic | null }>({
    queryKey: ["/api/public/expense-campaigns", slug],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/public/expense-campaigns/${slug}`);
      return res.json();
    },
  });

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ["/api/tenant"],
  });
  const tenant = tenantData?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const cents = Math.round(parseFloat(amountDollars || "0") * 100);
      if (!Number.isSafeInteger(cents) || cents < 100 || cents > 2_000_000_000) throw new Error("Enter a donation from $1 to $20,000,000.");
      const res = await apiRequest("POST", `/api/public/expense-campaigns/${data!.campaign.id}/checkout`, {
        amountCents: cents,
      });
      const body = await res.json();
      if (body.url) window.location.href = body.url;
      else throw new Error(body.error || "Could not start checkout.");
    },
    onError: (err: any) => {
      toast({ title: "Donation failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
        <div className="max-w-3xl mx-auto p-8 text-center text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (!data?.campaign) {
    return (
      <div className="min-h-screen bg-background" data-testid="page-expense-campaign-not-found">
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
        <div className="max-w-3xl mx-auto p-8 text-center">
          <h1 className="text-2xl font-semibold">Campaign not found</h1>
          <p className="text-muted-foreground mt-2">This campaign may have been archived.</p>
        </div>
      </div>
    );
  }

  const { campaign, matchPool } = data;
  const pct = Math.min(100, Math.round((campaign.raisedAmountCents / Math.max(1, campaign.goalAmountCents)) * 100));
  const matchingStatus = !matchPool ? null
    : matchPool.remainingCents <= 0 || matchPool.status === "exhausted" ? "exhausted"
    : matchPool.status === "ended" || (matchPool.endsAt && now >= new Date(matchPool.endsAt).getTime()) ? "ended"
    : matchPool.startsAt && now < new Date(matchPool.startsAt).getTime() ? "pending"
    : matchPool.effectiveStatus === "ended" || matchPool.effectiveStatus === "exhausted" ? matchPool.effectiveStatus
    : "active";
  const tiered = !!matchPool?.tiers?.length;
  const giftCents = Math.round(Number(amountDollars || "0") * 100);

  const previewMatch = (() => {
    if (!matchPool || matchingStatus !== "active" || campaign.status !== "active") return 0;
    const cents = giftCents;
    if (!Number.isSafeInteger(cents) || cents < 100 || cents > 2_000_000_000) return 0;
    const raw = tiered ? cents : Math.floor((cents * matchPool.ratioNumerator) / matchPool.ratioDenominator);
    const capped = !tiered && matchPool.perGiftCapCents != null ? Math.min(raw, matchPool.perGiftCapCents) : raw;
    return Math.max(0, Math.min(capped, matchPool.remainingCents));
  })();
  let unallocatedPreview = previewMatch;
  const previewAllocations = (matchPool?.tiers ?? []).map((tier) => {
    const matchedCents = Math.min(unallocatedPreview, Math.max(0, tier.remainingCents));
    unallocatedPreview -= matchedCents;
    return { ...tier, matchedCents };
  }).filter((tier) => tier.matchedCents > 0);
  const currentTierId = matchPool?.tiers?.find((tier) => tier.remainingCents > 0)?.id;

  return (
    <div className="min-h-screen bg-background" data-testid="page-public-expense-campaign">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
      {campaign.heroImageUrl && (
        <div
          className="relative h-64 md:h-80 bg-cover bg-center"
          style={{ backgroundImage: `url(${campaign.heroImageUrl})` }}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-0 flex items-end p-6">
            <h1 className="text-white text-3xl md:text-4xl font-bold" data-testid="text-campaign-title">
              {campaign.title}
            </h1>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {!campaign.heroImageUrl && (
          <h1 className="text-3xl font-bold" data-testid="text-campaign-title">
            {campaign.title}
          </h1>
        )}
        {campaign.shortDescription && (
          <p className="text-lg text-muted-foreground" data-testid="text-short-description">
            {campaign.shortDescription}
          </p>
        )}

        {campaign.status === "active" ? (
          <div className="space-y-3 pt-2">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p}
                  variant={amountDollars === String(p) ? "default" : "outline"}
                  onClick={() => setAmountDollars(String(p))}
                  data-testid={`button-preset-${p}`}
                >
                  ${p}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                min="1"
                max="20000000"
                step="0.01"
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
                placeholder="Other amount"
                data-testid="input-amount"
              />
              <Button
                onClick={() => checkoutMutation.mutate()}
                disabled={checkoutMutation.isPending || !Number.isSafeInteger(giftCents) || giftCents < 100 || giftCents > 2_000_000_000}
                data-testid="button-donate"
              >
                {checkoutMutation.isPending ? "Redirecting…" : "Donate"}
              </Button>
            </div>
            {previewMatch > 0 && (
              <div className="text-sm text-primary" aria-live="polite" data-testid="text-match-preview">
                <p>Your {usd(giftCents)} gift unlocks an additional{" "}
                {usd(previewMatch)} from {matchPool!.sponsorLabel}.
                </p>
                {previewAllocations.length > 0 && <ul className="mt-1 space-y-1 text-xs">
                  {previewAllocations.map((tier) => <li key={tier.id}>{tier.sponsorLabel}: {usd(tier.matchedCents)} in matching support</li>)}
                </ul>}
                {tiered && previewMatch < giftCents && <p className="mt-1 text-xs text-muted-foreground">Only {usd(previewMatch)} of this gift can be matched before the commitments are fully unlocked.</p>}
                <p className="mt-1 text-xs text-muted-foreground">Estimated match; availability is confirmed when your donation completes.</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground" data-testid="text-campaign-closed">
            This campaign is no longer accepting donations.
          </p>
        )}

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-2xl font-bold" data-testid="text-raised">
                  {usd(campaign.raisedAmountCents)}
                </span>
                <span className="text-muted-foreground">raised of {usd(campaign.goalAmountCents)} goal</span>
              </div>
              <Progress value={pct} data-testid="progress-raised" />
            </div>

            {matchPool && (
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-md bg-muted/40 p-2">
                  <div className="text-xs text-muted-foreground">Matched so far</div>
                  <div className="font-semibold" data-testid="text-matched-so-far">
                    {usd(matchPool.totalMatchedCents)}
                  </div>
                </div>
                <div className="rounded-md bg-muted/40 p-2">
                  <div className="text-xs text-muted-foreground">Match pool remaining</div>
                  <div className="font-semibold" data-testid="text-match-remaining">
                    {usd(matchPool.remainingCents)}
                  </div>
                </div>
                <div className="rounded-md bg-muted/40 p-2">
                  <div className="text-xs text-muted-foreground">Total impact</div>
                  <div className="font-semibold" data-testid="text-total-impact">
                    {usd(campaign.raisedAmountCents + matchPool.totalMatchedCents)}
                  </div>
                </div>
              </div>
            )}

            {matchPool && matchingStatus === "active" && (
              <div
                className="rounded-md border-2 border-primary/40 bg-primary/5 p-4 space-y-1"
                data-testid="banner-match-pool"
              >
                <div className="flex items-center gap-2">
                  <Heart className="h-5 w-5 text-primary" />
                  <span className="font-semibold">
                    Eligible gifts {matchPool.ratioNumerator === matchPool.ratioDenominator
                      ? "are matched"
                      : `gets a ${matchPool.ratioNumerator}:${matchPool.ratioDenominator} match`}{" "}
                    by {matchPool.sponsorLabel}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {usd(matchPool.remainingCents)} of {usd(matchPool.pledgedCapCents)} match still available.
                </div>
              </div>
            )}

            {matchPool && matchingStatus === "pending" && (
              <Badge variant="secondary" data-testid="badge-match-pending">
                Matching window opens soon
              </Badge>
            )}

            {matchPool && matchingStatus === "exhausted" && (
              <div
                className="rounded-md border-2 border-primary/40 bg-primary/5 p-4 flex items-center gap-2"
                data-testid="banner-match-exhausted"
              >
                <Heart className="h-5 w-5 text-primary" />
                <span className="font-semibold">
                  Match goal reached! Thanks to {matchPool.sponsorLabel}, the full {usd(matchPool.pledgedCapCents)}
                  {" "}has been unlocked.
                </span>
              </div>
            )}

            {matchPool && matchingStatus === "ended" && (
              <Badge variant="secondary" data-testid="badge-match-ended">
                Matching window has ended
              </Badge>
            )}

            {tiered && matchPool && (
              <section className="space-y-3" aria-label="Matching milestones" data-testid="section-matching-milestones">
                <div>
                  <h2 className="font-semibold">Matching milestones</h2>
                  <p className="text-sm text-muted-foreground">
                    Sponsors match eligible donations dollar-for-dollar, in order, up to {usd(matchPool.pledgedCapCents)} in total commitments. A gift may unlock support from more than one sponsor.
                  </p>
                  {(matchPool.startsAt || matchPool.endsAt) && <p className="text-xs text-muted-foreground mt-1">Matching window: {matchPool.startsAt ? new Date(matchPool.startsAt).toLocaleString() : "Started immediately"} — {matchPool.endsAt ? new Date(matchPool.endsAt).toLocaleString() : "no end date"}.</p>}
                </div>
                <ol className="space-y-3">
                  {matchPool.tiers!.map((tier, index) => {
                    const completed = tier.remainingCents <= 0;
                    const current = tier.id === currentTierId && matchingStatus === "active" && campaign.status === "active";
                    const label = completed ? "Completed" : matchingStatus === "ended" || campaign.status !== "active" ? "Matching closed" : current ? "Matching now" : "Upcoming";
                    return (
                      <li key={tier.id} className={`rounded-md border p-3 space-y-2 ${current ? "border-primary/40 bg-primary/5" : ""}`} data-testid={`matching-milestone-${tier.id}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-medium">{index + 1}. {tier.sponsorLabel}</h3>
                          <Badge variant={current ? "default" : "secondary"}>{label}</Badge>
                        </div>
                        <Progress aria-label={`${tier.sponsorLabel} matching progress`} value={Math.min(100, Math.max(0, tier.totalMatchedCents / Math.max(1, tier.pledgedCapCents) * 100))} />
                        <div className="flex flex-wrap justify-between gap-1 text-xs text-muted-foreground">
                          <span>{usd(tier.totalMatchedCents)} unlocked of {usd(tier.pledgedCapCents)}</span>
                          <span>{usd(tier.remainingCents)} remaining</span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}

            {campaign.goalMet && (
              <div
                className="rounded-md border-2 border-emerald-500/40 bg-emerald-500/10 p-4 flex items-center gap-2"
                data-testid="banner-goal-met"
              >
                <Heart className="h-5 w-5 text-emerald-600" />
                <span className="font-semibold text-emerald-900 dark:text-emerald-100">
                  Goal met! Thank you to everyone who made this happen.
                  {!campaign.endDate && " Donations are still welcome — every dollar over goal helps the animals."}
                </span>
              </div>
            )}

          </CardContent>
        </Card>

        {campaign.longDescription && (
          <Card>
            <CardContent
              className="pt-6 prose prose-sm dark:prose-invert max-w-none"
              data-testid="text-long-description"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {campaign.longDescription}
              </ReactMarkdown>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

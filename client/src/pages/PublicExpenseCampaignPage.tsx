import { useState } from "react";
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

interface MatchPoolPublic {
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
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const PRESETS = [25, 50, 100, 250];

export default function PublicExpenseCampaignPage() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [amountDollars, setAmountDollars] = useState<string>("50");

  const { data, isLoading } = useQuery<{ campaign: CampaignPublic; matchPool: MatchPoolPublic | null }>({
    queryKey: ["/api/public/expense-campaigns", slug],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/public/expense-campaigns/${slug}`);
      return res.json();
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const cents = Math.round(parseFloat(amountDollars || "0") * 100);
      if (cents < 100) throw new Error("Minimum donation is $1.");
      const res = await apiRequest("POST", `/api/public/expense-campaigns/${data!.campaign.id}/checkout`, {
        amountCents: cents,
        donorCoversFees: false,
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
    return <div className="max-w-3xl mx-auto p-8 text-center text-muted-foreground">Loading…</div>;
  }
  if (!data?.campaign) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center" data-testid="page-expense-campaign-not-found">
        <h1 className="text-2xl font-semibold">Campaign not found</h1>
        <p className="text-muted-foreground mt-2">This campaign may have been archived.</p>
      </div>
    );
  }

  const { campaign, matchPool } = data;
  const pct = Math.min(100, Math.round((campaign.raisedAmountCents / Math.max(1, campaign.goalAmountCents)) * 100));

  const previewMatch = (() => {
    if (!matchPool || matchPool.effectiveStatus !== "active") return 0;
    const cents = Math.round(parseFloat(amountDollars || "0") * 100);
    if (cents <= 0) return 0;
    const raw = Math.floor((cents * matchPool.ratioNumerator) / matchPool.ratioDenominator);
    const capped = matchPool.perGiftCapCents != null ? Math.min(raw, matchPool.perGiftCapCents) : raw;
    return Math.max(0, Math.min(capped, matchPool.remainingCents));
  })();

  return (
    <div className="min-h-screen bg-background" data-testid="page-public-expense-campaign">
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

            {matchPool && matchPool.effectiveStatus === "active" && (
              <div
                className="rounded-md border-2 border-primary/40 bg-primary/5 p-4 space-y-1"
                data-testid="banner-match-pool"
              >
                <div className="flex items-center gap-2">
                  <Heart className="h-5 w-5 text-primary" />
                  <span className="font-semibold">
                    Every gift {matchPool.ratioNumerator === matchPool.ratioDenominator
                      ? "is matched"
                      : `gets a ${matchPool.ratioNumerator}:${matchPool.ratioDenominator} match`}{" "}
                    by {matchPool.sponsorLabel}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {usd(matchPool.remainingCents)} of {usd(matchPool.pledgedCapCents)} match still available.
                </div>
              </div>
            )}

            {matchPool && matchPool.effectiveStatus === "pending" && (
              <Badge variant="secondary" data-testid="badge-match-pending">
                Matching window opens soon
              </Badge>
            )}

            {matchPool && matchPool.effectiveStatus === "exhausted" && (
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

            {matchPool && matchPool.effectiveStatus === "ended" && (
              <Badge variant="secondary" data-testid="badge-match-ended">
                Matching window has ended
              </Badge>
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
                    step="0.01"
                    value={amountDollars}
                    onChange={(e) => setAmountDollars(e.target.value)}
                    placeholder="Other amount"
                    data-testid="input-amount"
                  />
                  <Button
                    onClick={() => checkoutMutation.mutate()}
                    disabled={checkoutMutation.isPending}
                    data-testid="button-donate"
                  >
                    {checkoutMutation.isPending ? "Redirecting…" : "Donate"}
                  </Button>
                </div>
                {previewMatch > 0 && (
                  <p className="text-sm text-primary" data-testid="text-match-preview">
                    Your {usd(Math.round(parseFloat(amountDollars || "0") * 100))} gift unlocks an additional{" "}
                    {usd(previewMatch)} from {matchPool!.sponsorLabel}.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground" data-testid="text-campaign-closed">
                This campaign is no longer accepting donations.
              </p>
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

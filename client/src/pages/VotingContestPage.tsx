import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearch } from "wouter";
import { useSEO } from "@/hooks/useSEO";
import ContestantShareActions from "@/components/ContestantShareActions";
import { contestantUrl } from "@/lib/contestShare";
import { contrastText, readableColor, validVotingColor, votingBackgroundStyle, VOTING_THEME_SURFACES } from "@/lib/votingThemes";
import { apiRequest } from "@/lib/queryClient";
import PublicHeader from "@/components/PublicHeader";
import ContestEntrantPhoto from "@/components/ContestEntrantPhoto";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, Vote, CheckCircle, Heart } from "lucide-react";
import type { VotingContest, VotingContestEntrant, Tenant } from "@shared/schema";

type DescribedVotingContestEntrant = VotingContestEntrant & { description: string | null };

interface ContestPageData extends VotingContest {
  entrants: DescribedVotingContestEntrant[];
  rescueName: string;
}

const VOTE_PACKAGES = [
  { amount: 1, votes: 1, label: "$1 (1 Vote)" },
  { amount: 5, votes: 5, label: "$5 (5 Votes)" },
  { amount: 10, votes: 10, label: "$10 (10 Votes)" },
  { amount: 20, votes: 20, label: "$20 (20 Votes)" },
];

export default function VotingContestPage() {
  const params = useParams<{ slug: string }>();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const votedSuccess = searchParams.get("voted") === "success";
  const linkedEntrantId = searchParams.get("entrant");

  const [selectedEntrant, setSelectedEntrant] = useState<DescribedVotingContestEntrant | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(votedSuccess);

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ["/api/tenant"],
  });

  const {
    data: contestData,
    isLoading,
  } = useQuery<ContestPageData>({
    queryKey: ["/api/public/voting-contest", params.slug],
    enabled: !!params.slug,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (votedSuccess) {
      setShowSuccessMessage(true);
      const timer = setTimeout(() => setShowSuccessMessage(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [votedSuccess]);

  const tenant = tenantData?.tenant;
  const rescueName = contestData?.rescueName || tenant?.name || "Animal Rescue";
  const linkedEntrant = contestData?.entrants?.find((entrant) => entrant.id === linkedEntrantId);

  const pageTitle = linkedEntrant && contestData
    ? `${linkedEntrant.name} | ${contestData.title} | ${rescueName}`
    : contestData
    ? `${contestData.title} | ${rescueName}`
    : `Voting Contest | ${rescueName}`;

  useSEO(linkedEntrantId && !contestData ? null : {
    title: pageTitle,
    description: linkedEntrant && contestData
      ? linkedEntrant.description || `Vote for ${linkedEntrant.name} in ${contestData.title}, hosted by ${rescueName}!`
      : contestData?.description || `Vote with your dollar in this fundraising contest hosted by ${rescueName}!`,
    siteName: rescueName,
    image: linkedEntrant?.photoUrl || contestData?.imageUrl || undefined,
    url: linkedEntrant && params.slug ? contestantUrl(params.slug, linkedEntrant.id, undefined, true) : undefined,
    type: "website",
  });

  useEffect(() => {
    if (!linkedEntrant) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`contest-entrant-${linkedEntrant.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [linkedEntrant?.id, params.slug]);

  const handleVote = async () => {
    if (!selectedEntrant) return;
    const amount = useCustom
      ? parseInt(customAmount, 10)
      : selectedPackage;
    if (!amount || amount < 1) return;

    setIsCheckingOut(true);
    try {
      const res = await apiRequest(
        "POST",
        `/api/public/voting-contest/${selectedEntrant.id}/checkout`,
        { amount }
      );
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setIsCheckingOut(false);
    }
  };

  const currentVoteAmount = useCustom
    ? parseInt(customAmount, 10) || 0
    : selectedPackage || 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader
          rescueName={rescueName}
          logoUrl={tenant?.logoUrl || undefined}
        />
        <main className="max-w-5xl mx-auto px-4 py-8">
          <Skeleton className="h-10 w-2/3 mb-2" />
          <Skeleton className="h-5 w-1/2 mb-8" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-72 w-full rounded-md" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (!contestData) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader
          rescueName={rescueName}
          logoUrl={tenant?.logoUrl || undefined}
        />
        <main className="max-w-lg mx-auto px-4 py-16 text-center">
          <Trophy className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-2xl font-semibold mb-2" data-testid="text-not-found">
            Contest Not Found
          </h2>
          <p className="text-muted-foreground mb-6">
            This voting contest may no longer be active or the link is incorrect.
          </p>
          <Button variant="outline" asChild>
            <a href="/" data-testid="link-go-home">
              Return Home
            </a>
          </Button>
        </main>
      </div>
    );
  }

  const entrants = contestData.entrants || [];
  const totalVotes = entrants.reduce((sum, e) => sum + (e.totalVotes || 0), 0);
  const hasEnded = contestData.endDate
    ? new Date(contestData.endDate) < new Date()
    : false;
  const primary = validVotingColor(contestData.primaryColor);
  const accent = validVotingColor(contestData.accentColor);
  const primaryTextStyle = primary ? { color: readableColor(primary) } : undefined;
  const voteButtonStyle = accent ? { backgroundColor: accent, borderColor: accent, color: contrastText(accent) } : primary ? { backgroundColor: primary, borderColor: primary, color: contrastText(primary) } : undefined;
  const themeStyle = votingBackgroundStyle(contestData.themeBackground, primary);

  return (
    <div className="min-h-screen relative bg-background" style={contestData.themeBackground && VOTING_THEME_SURFACES[contestData.themeBackground] ? { backgroundColor: VOTING_THEME_SURFACES[contestData.themeBackground] } : undefined}>
      {themeStyle && <div className="absolute inset-0 pointer-events-none opacity-[0.2] dark:opacity-[0.16]" style={themeStyle} aria-hidden="true" data-testid="voting-theme-background" />}
      <div className="relative">
      <PublicHeader
        rescueName={rescueName}
        logoUrl={tenant?.logoUrl || undefined}
      />

      {contestData.imageUrl && (
        <div className="relative w-full h-[40vh] min-h-[240px] max-h-[400px]">
          <img
            src={contestData.imageUrl}
            alt={contestData.title}
            className="w-full h-full object-cover"
            data-testid="img-contest-banner"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
            <div className="max-w-5xl mx-auto">
              <Badge variant="secondary" className="mb-3" data-testid="badge-vote-dollar">
                $1 = 1 Vote
              </Badge>
              <h1
                className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight"
                data-testid="text-contest-title"
              >
                {contestData.title}
              </h1>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-8">
        {!contestData.imageUrl && (
          <div className="mb-8">
            <Badge variant="secondary" className="mb-3" data-testid="badge-vote-dollar">
              $1 = 1 Vote
            </Badge>
            <h1
              className="text-3xl md:text-4xl font-bold"
              style={primaryTextStyle}
              data-testid="text-contest-title"
            >
              {contestData.title}
            </h1>
          </div>
        )}

        {showSuccessMessage && (
          <div
            className="mb-6 p-4 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 flex items-center gap-3"
            data-testid="alert-vote-success"
          >
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
            <p className="text-green-800 dark:text-green-200 font-medium">
              Thank you for voting! Your votes have been counted.
            </p>
          </div>
        )}

        {contestData.description && (
          <p
            className="text-foreground/80 max-w-3xl mb-6 leading-relaxed"
            data-testid="text-contest-description"
          >
            {contestData.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4 mb-8 text-sm text-muted-foreground">
          <span data-testid="text-total-votes">
            {totalVotes.toLocaleString()} total vote{totalVotes !== 1 ? "s" : ""}
          </span>
          <span data-testid="text-entrant-count">
            {entrants.length} entrant{entrants.length !== 1 ? "s" : ""}
          </span>
          {contestData.endDate && (
            <span data-testid="text-end-date">
              {hasEnded
                ? "Contest ended"
                : `Ends ${new Date(contestData.endDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}`}
            </span>
          )}
        </div>

        {hasEnded && (
          <div className="mb-6 p-4 rounded-md bg-muted text-center">
            <p className="font-medium text-foreground/80" data-testid="text-contest-ended">
              This contest has ended. Thanks to everyone who voted!
            </p>
          </div>
        )}

        {entrants.length === 0 ? (
          <div className="text-center py-16">
            <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground" data-testid="text-no-entrants">
              No entrants yet. Check back soon!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {entrants.map((entrant, idx) => {
              const isLeader = idx === 0 && entrant.totalVotes > 0;
              return (
                <Card
                  key={entrant.id}
                  id={`contest-entrant-${entrant.id}`}
                  className={`overflow-visible relative rounded-[2rem] p-3 bg-card ${linkedEntrant?.id === entrant.id ? "ring-4 ring-amber-500" : isLeader ? "ring-2 ring-primary" : ""}`}
                  style={isLeader && linkedEntrant?.id !== entrant.id && primary ? { borderColor: primary, boxShadow: `0 0 0 2px ${primary}` } : undefined}
                  data-testid={`card-entrant-${entrant.id}`}
                >
                  {isLeader && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                      <Badge variant="default" style={voteButtonStyle} data-testid="badge-leader">
                        <Trophy className="h-3 w-3 mr-1" />
                        Leader
                      </Badge>
                    </div>
                  )}
                  <ContestEntrantPhoto name={entrant.name} ownerDisplayName={entrant.ownerDisplayName} photoUrl={entrant.photoUrl} theme={contestData.themeBackground} primaryColor={contestData.primaryColor} accentColor={contestData.accentColor} />
                  <CardContent className="px-3 pt-3 pb-2 flex flex-1 flex-col items-center text-center space-y-4">

                    <div>
                      <h3
                        className="text-lg font-semibold"
                        data-testid={`text-entrant-name-${entrant.id}`}
                      >
                        {entrant.name}
                      </h3>
                      {entrant.description && (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words" data-testid={`text-entrant-description-${entrant.id}`}>
                          {entrant.description}
                        </p>
                      )}
                      <p
                        className="text-2xl font-bold text-primary mt-1"
                        style={primaryTextStyle}
                        data-testid={`text-entrant-votes-${entrant.id}`}
                      >
                        {(entrant.totalVotes || 0).toLocaleString()} vote
                        {entrant.totalVotes !== 1 ? "s" : ""}
                      </p>
                    </div>

                    {!hasEnded && (
                      <Button
                        className="w-full gap-2"
                        style={voteButtonStyle}
                        onClick={() => {
                          setSelectedEntrant(entrant);
                          setSelectedPackage(null);
                          setCustomAmount("");
                          setUseCustom(false);
                        }}
                        data-testid={`button-vote-${entrant.id}`}
                      >
                        <Vote className="h-4 w-4" />
                        Vote for {entrant.name}!
                      </Button>
                    )}
                    <ContestantShareActions url={contestantUrl(params.slug!, entrant.id, undefined, true)} name={entrant.name} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-12 text-center text-sm text-muted-foreground space-y-1">
          <p>
            This contest is hosted by <strong>{rescueName}</strong>
          </p>
          <p>$1 = 1 Vote. Payments are processed securely through Stripe.</p>
        </div>
      </main>

      <Dialog
        open={!!selectedEntrant}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedEntrant(null);
            setIsCheckingOut(false);
          }
        }}
      >
        <DialogContent data-testid="dialog-vote">
          <DialogHeader>
            <DialogTitle data-testid="dialog-vote-title">
              Vote for {selectedEntrant?.name}
            </DialogTitle>
            <DialogDescription>
              Select a vote package or enter a custom amount. $1 = 1 Vote.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {selectedEntrant?.photoUrl && (
              <div className="flex justify-center">
                <Avatar className="h-20 w-20">
                  <AvatarImage
                    src={selectedEntrant.photoUrl}
                    alt={selectedEntrant.name}
                  />
                  <AvatarFallback className="text-xl">
                    {selectedEntrant.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2">
              {VOTE_PACKAGES.map((pkg) => (
                <Button
                  key={pkg.amount}
                  variant={
                    !useCustom && selectedPackage === pkg.amount
                      ? "default"
                      : "outline"
                  }
                  className="justify-between"
                  style={!useCustom && selectedPackage === pkg.amount ? voteButtonStyle : undefined}
                  onClick={() => {
                    setSelectedPackage(pkg.amount);
                    setUseCustom(false);
                  }}
                  data-testid={`button-package-${pkg.amount}`}
                >
                  <span>{pkg.label}</span>
                  <Heart className="h-4 w-4" />
                </Button>
              ))}
            </div>

            <div className="space-y-2">
              <Button
                variant={useCustom ? "default" : "outline"}
                className="w-full"
                style={useCustom ? voteButtonStyle : undefined}
                onClick={() => setUseCustom(true)}
                data-testid="button-custom-vote"
              >
                Custom Amount
              </Button>
              {useCustom && (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Enter amount (min $1)"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="pl-7"
                    data-testid="input-custom-vote-amount"
                  />
                  {customAmount && parseInt(customAmount, 10) >= 1 && (
                    <p className="text-sm text-muted-foreground mt-1">
                      = {parseInt(customAmount, 10)} vote
                      {parseInt(customAmount, 10) !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              )}
            </div>

            <Button
              size="lg"
              className="w-full gap-2"
              style={voteButtonStyle}
              onClick={handleVote}
              disabled={isCheckingOut || currentVoteAmount < 1}
              data-testid="button-confirm-vote"
            >
              <Vote className="h-5 w-5" />
              {isCheckingOut
                ? "Redirecting to checkout..."
                : currentVoteAmount >= 1
                  ? `Cast ${currentVoteAmount} Vote${currentVoteAmount !== 1 ? "s" : ""} — $${currentVoteAmount}`
                  : "Select an amount"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}

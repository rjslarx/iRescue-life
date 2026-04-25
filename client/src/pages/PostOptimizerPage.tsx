import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TERMINAL_STATUSES } from "@shared/schema";
import {
  Sparkles,
  Copy,
  Check,
  AlertTriangle,
  Heart,
  Home,
  PartyPopper,
  ShieldAlert,
  ChevronsUpDown,
  X,
  HandHeart,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type PostCategory =
  | "urgent_emotional"
  | "overwhelmed_shelter"
  | "happy_adoption"
  | "volunteer_recruitment";

interface OptimizeResponse {
  success: true;
  optimizedCaption: string;
  firstComment: string;
  category: PostCategory;
  paymentHandlesRemoved: number;
  paymentInterceptionApplied: boolean;
  usedEmergencyCampaign: boolean;
  emergencyCampaignTitle: string | null;
}

interface AnimalLite {
  id: string;
  name: string;
  species?: string | null;
  status?: string | null;
}

interface AnimalsResponse {
  animals: AnimalLite[];
}

const CATEGORY_META: Record<
  PostCategory,
  { label: string; icon: typeof Heart; description: string }
> = {
  urgent_emotional: {
    label: "Urgent / Emotional",
    icon: AlertTriangle,
    description: "Driving monthly giving via the VIP Club",
  },
  overwhelmed_shelter: {
    label: "Overwhelmed Shelter",
    icon: Home,
    description: "Driving foster sign-ups",
  },
  happy_adoption: {
    label: "Happy / Adoption",
    icon: PartyPopper,
    description: "Driving adoption applications",
  },
  volunteer_recruitment: {
    label: "Volunteer Recruitment",
    icon: HandHeart,
    description: "Driving volunteer sign-ups",
  },
};

export default function PostOptimizerPage() {
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [animalId, setAnimalId] = useState<string | null>(null);
  const [animalPopoverOpen, setAnimalPopoverOpen] = useState(false);
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedComment, setCopiedComment] = useState(false);

  const {
    data: animalsData,
    isLoading: animalsLoading,
    isError: animalsError,
  } = useQuery<AnimalsResponse>({
    queryKey: ["/api/animals"],
  });

  const animals = useMemo(() => {
    const list = animalsData?.animals ?? [];
    // Hide archived animals — anything in a terminal status (adopted,
    // transported, deceased, returned-to-owner, returned-to-field) — so the
    // picker stays focused on current cases. Mirrors the same constant the
    // Animals page uses to define its "Archived" tab.
    const hidden = new Set<string>(TERMINAL_STATUSES as readonly string[]);
    return list
      .filter((a) => !a.status || !hidden.has(a.status))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [animalsData]);

  const selectedAnimal = useMemo(
    () => animals.find((a) => a.id === animalId) ?? null,
    [animals, animalId]
  );

  const optimizeMutation = useMutation({
    mutationFn: async (input: { draft: string; animalId: string | null }): Promise<OptimizeResponse> => {
      const body: Record<string, unknown> = { draft: input.draft };
      if (input.animalId) body.animalId = input.animalId;
      const res = await apiRequest("POST", "/api/ai/optimize-post", body);
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      setCopiedCaption(false);
      setCopiedComment(false);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Something went wrong. Please try again.";
      toast({
        title: "Could not optimize post",
        description: message,
        variant: "destructive",
      });
    },
  });

  const handleOptimize = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      toast({
        title: "Draft is empty",
        description: "Write your draft Facebook post before optimizing.",
        variant: "destructive",
      });
      return;
    }
    setResult(null);
    optimizeMutation.mutate({ draft: trimmed, animalId });
  };

  const copyToClipboard = async (
    text: string,
    label: string,
    setCopied: (v: boolean) => void
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: `${label} copied`,
        description: "Paste it into Facebook when you're ready.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Copy failed",
        description: "Your browser blocked the copy. Select the text manually.",
        variant: "destructive",
      });
    }
  };

  const isPending = optimizeMutation.isPending;

  return (
    <DashboardLayout
      title="Post Optimizer"
      description="Turn a draft Facebook post into an algorithm-friendly caption + a strategic first comment."
    >
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column: draft + button */}
          <Card data-testid="card-draft">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Draft Your Facebook Post
              </CardTitle>
              <CardDescription>
                Write your post the way you normally would. We'll strip outbound links and payment handles, rewrite the caption, and suggest a strategic first comment.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="animal-picker-trigger" className="text-sm">
                  Which animal is this post about? <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Popover open={animalPopoverOpen} onOpenChange={setAnimalPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="animal-picker-trigger"
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={animalPopoverOpen}
                        className="flex-1 justify-between font-normal"
                        data-testid="button-animal-picker"
                        disabled={isPending}
                      >
                        <span className="truncate">
                          {selectedAnimal ? selectedAnimal.name : "Skip — link to general donate page"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search animals..." data-testid="input-animal-search" />
                        <CommandList>
                          {animalsLoading ? (
                            <div className="px-3 py-6 text-center text-sm text-muted-foreground" data-testid="text-animals-loading">
                              Loading animals…
                            </div>
                          ) : animalsError ? (
                            <div className="px-3 py-6 text-center text-sm text-destructive" data-testid="text-animals-error">
                              Couldn't load animals. You can still optimize without picking one.
                            </div>
                          ) : (
                            <CommandEmpty>No animals found.</CommandEmpty>
                          )}
                          <CommandGroup className="max-h-[260px] overflow-y-auto">
                            {animals.map((a) => (
                              <CommandItem
                                key={a.id}
                                value={`${a.name} ${a.species ?? ""}`.trim()}
                                onSelect={() => {
                                  setAnimalId(a.id);
                                  setAnimalPopoverOpen(false);
                                }}
                                data-testid={`option-animal-${a.id}`}
                              >
                                <span className="truncate">{a.name}</span>
                                {a.species && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    {a.species}
                                  </span>
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {selectedAnimal && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setAnimalId(null)}
                      disabled={isPending}
                      data-testid="button-clear-animal"
                      aria-label="Clear selected animal"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  If this animal has an active emergency fundraiser, we'll send donors there. Otherwise we use your general donate page.
                </p>
              </div>

              <Textarea
                placeholder="Type or paste your draft Facebook post here..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={14}
                className="resize-y min-h-64"
                data-testid="input-draft"
                disabled={isPending}
              />
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm text-muted-foreground" data-testid="text-draft-count">
                  {draft.length.toLocaleString()} characters
                </p>
                <Button
                  onClick={handleOptimize}
                  disabled={isPending || draft.trim().length === 0}
                  data-testid="button-optimize"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {isPending ? "Optimizing..." : "Optimize for Facebook"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Right column: results */}
          <div className="space-y-6">
            {!isPending && !result && (
              <Card data-testid="card-empty-state">
                <CardHeader>
                  <CardTitle>Your optimized post will appear here</CardTitle>
                  <CardDescription>
                    Click "Optimize for Facebook" to see a cleaned caption and a strategic first comment with the right call-to-action link.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground space-y-2">
                    <p>We'll classify the emotional tone of your post into one of four categories and pick the matching link:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li><span className="font-medium text-foreground">Urgent / Emotional</span> &rarr; VIP Club (monthly giving)</li>
                      <li><span className="font-medium text-foreground">Overwhelmed Shelter</span> &rarr; Foster application</li>
                      <li><span className="font-medium text-foreground">Happy / Adoption</span> &rarr; Adoption application</li>
                      <li><span className="font-medium text-foreground">Volunteer Recruitment</span> &rarr; Volunteer sign-up</li>
                    </ul>
                    <p className="pt-2">
                      If your draft mentions Venmo, CashApp, or PayPal, we'll strip those handles (Facebook hides posts that contain them) and route donors to your fundraiser instead — with Apple Pay and Google Pay so it's just as fast.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {isPending && (
              <>
                <Card data-testid="card-caption-loading">
                  <CardHeader>
                    <CardTitle>Optimized Caption</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-11/12" />
                    <Skeleton className="h-4 w-9/12" />
                    <Skeleton className="h-4 w-10/12" />
                    <Skeleton className="h-4 w-7/12" />
                  </CardContent>
                </Card>
                <Card data-testid="card-comment-loading">
                  <CardHeader>
                    <CardTitle>First Comment Strategy</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-10/12" />
                    <Skeleton className="h-4 w-8/12" />
                  </CardContent>
                </Card>
              </>
            )}

            {!isPending && result && (
              <>
                {result.paymentInterceptionApplied && (
                  <div
                    className="rounded-md border bg-card p-4 flex items-start gap-3"
                    data-testid="callout-payment-interception"
                  >
                    <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="space-y-1 text-sm">
                      <p className="font-medium text-foreground">
                        Removed {result.paymentHandlesRemoved} payment handle{result.paymentHandlesRemoved === 1 ? "" : "s"} from your caption.
                      </p>
                      <p className="text-muted-foreground" data-testid="text-payment-interception-detail">
                        Facebook throttles posts that mention Venmo, CashApp, or PayPal. Your first comment now points donors to{" "}
                        {result.usedEmergencyCampaign && result.emergencyCampaignTitle ? (
                          <span className="font-medium text-foreground">{result.emergencyCampaignTitle}</span>
                        ) : (
                          <span className="font-medium text-foreground">your general donate page</span>
                        )}
                        {" "}with Apple Pay and Google Pay.
                      </p>
                      {!result.usedEmergencyCampaign && (
                        <p className="text-muted-foreground">
                          Tip: a dedicated{" "}
                          <Link
                            href="/dashboard/donations"
                            className="underline font-medium text-foreground hover-elevate active-elevate-2 rounded px-0.5"
                            data-testid="link-create-emergency-campaign"
                          >
                            Emergency Campaign
                          </Link>
                          {" "}for {selectedAnimal ? selectedAnimal.name : "this animal"} usually converts higher than the general page.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <Card data-testid="card-optimized-caption">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <CardTitle>Optimized Caption</CardTitle>
                        <CardDescription>No outbound links — Facebook-friendly.</CardDescription>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          copyToClipboard(result.optimizedCaption, "Caption", setCopiedCaption)
                        }
                        data-testid="button-copy-caption"
                      >
                        {copiedCaption ? (
                          <Check className="h-4 w-4 mr-2" />
                        ) : (
                          <Copy className="h-4 w-4 mr-2" />
                        )}
                        {copiedCaption ? "Copied" : "Copy to Clipboard"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <pre
                      className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground"
                      data-testid="text-optimized-caption"
                    >
                      {result.optimizedCaption}
                    </pre>
                  </CardContent>
                </Card>

                <Card data-testid="card-first-comment">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="space-y-2">
                        <CardTitle>First Comment Strategy</CardTitle>
                        <CardDescription>
                          Post this as the first comment under your Facebook post.
                        </CardDescription>
                        {(() => {
                          const meta = CATEGORY_META[result.category];
                          const Icon = meta.icon;
                          const description = result.paymentInterceptionApplied
                            ? result.usedEmergencyCampaign && result.emergencyCampaignTitle
                              ? `Driving donors to ${result.emergencyCampaignTitle}`
                              : "Driving donors to your general donate page"
                            : meta.description;
                          return (
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="secondary" data-testid="badge-category">
                                <Icon className="h-3 w-3 mr-1" />
                                {meta.label}
                              </Badge>
                              <span className="text-xs text-muted-foreground" data-testid="text-category-description">
                                {description}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          copyToClipboard(result.firstComment, "First comment", setCopiedComment)
                        }
                        data-testid="button-copy-comment"
                      >
                        {copiedComment ? (
                          <Check className="h-4 w-4 mr-2" />
                        ) : (
                          <Copy className="h-4 w-4 mr-2" />
                        )}
                        {copiedComment ? "Copied" : "Copy to Clipboard"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <pre
                      className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground"
                      data-testid="text-first-comment"
                    >
                      {result.firstComment}
                    </pre>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Copy, Check, AlertTriangle, Heart, Home, PartyPopper } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type PostCategory = "urgent_emotional" | "overwhelmed_shelter" | "happy_adoption";

interface OptimizeResponse {
  success: true;
  optimizedCaption: string;
  firstComment: string;
  category: PostCategory;
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
};

export default function PostOptimizerPage() {
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedComment, setCopiedComment] = useState(false);

  const optimizeMutation = useMutation({
    mutationFn: async (input: string): Promise<OptimizeResponse> => {
      const res = await apiRequest("POST", "/api/ai/optimize-post", { draft: input });
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
    optimizeMutation.mutate(trimmed);
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
                Write your post the way you normally would. We'll strip outbound links, rewrite the caption, and suggest a strategic first comment.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                    <p>We'll classify the emotional tone of your post into one of three categories and pick the matching link:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li><span className="font-medium text-foreground">Urgent / Emotional</span> &rarr; VIP Club (monthly giving)</li>
                      <li><span className="font-medium text-foreground">Overwhelmed Shelter</span> &rarr; Foster application</li>
                      <li><span className="font-medium text-foreground">Happy / Adoption</span> &rarr; Adoption application</li>
                    </ul>
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
                          return (
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="secondary" data-testid="badge-category">
                                <Icon className="h-3 w-3 mr-1" />
                                {meta.label}
                              </Badge>
                              <span className="text-xs text-muted-foreground" data-testid="text-category-description">
                                {meta.description}
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

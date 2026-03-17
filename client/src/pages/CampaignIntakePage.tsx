import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useSEO } from "@/hooks/useSEO";
import { apiRequest } from "@/lib/queryClient";
import PublicHeader from "@/components/PublicHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, Heart, Calendar, Target, DollarSign, Users, Copy, ExternalLink, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function CampaignIntakePage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<{
    valid: boolean;
    partnerName: string;
    partnerEmail: string;
    animalId?: string | null;
    animalName?: string | null;
    tenantName: string;
    tenantLogo?: string | null;
  }>({
    queryKey: ["/api/peer-campaigns/intake", token],
    queryFn: async () => {
      const res = await fetch(`/api/peer-campaigns/intake/${token}`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Invalid link" }));
        throw new Error(err.error || "Invalid link");
      }
      return res.json();
    },
    retry: false,
  });

  const [campaignTitle, setCampaignTitle] = useState("");
  const [goalType, setGoalType] = useState<"currency" | "units">("currency");
  const [goalAmount, setGoalAmount] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalUnitLabel, setGoalUnitLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [participantText, setParticipantText] = useState("");

  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{
    campaign: { slug: string; campaignTitle: string };
    participants: { id: string; displayName: string }[];
    campaignUrl: string;
  } | null>(null);

  useSEO({
    title: data ? `Campaign Intake - ${data.tenantName}` : "Campaign Intake",
    description: "Create a fundraising campaign for your community",
  });

  const submitMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiRequest("POST", `/api/peer-campaigns/intake/${token}`, payload);
      return res.json();
    },
    onSuccess: (data) => {
      setSubmitted(true);
      setResult(data);
    },
    onError: (err: Error) => {
      toast({ title: "Submission failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignTitle.trim()) {
      toast({ title: "Campaign title is required", variant: "destructive" });
      return;
    }

    const participants = participantText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    submitMutation.mutate({
      campaignTitle: campaignTitle.trim(),
      goalType,
      goalAmount: goalType === "currency" ? Math.round(parseFloat(goalAmount || "0") * 100) : 0,
      goalTarget: goalType === "units" ? parseInt(goalTarget || "0", 10) : null,
      goalUnitLabel: goalType === "units" ? goalUnitLabel || "units" : null,
      startDate: startDate || null,
      endDate: endDate || null,
      description: description.trim() || null,
      participants,
    });
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data?.valid) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-lg mx-auto p-6 pt-20 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold" data-testid="text-intake-error-title">
            Invalid Invitation
          </h1>
          <p className="text-muted-foreground" data-testid="text-intake-error-message">
            {(error as Error)?.message || "This invitation link is invalid, expired, or has already been used."}
          </p>
        </div>
      </div>
    );
  }

  if (submitted && result) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader rescueName={data.tenantName} logoUrl={data.tenantLogo || undefined} />
        <div className="max-w-lg mx-auto p-6 space-y-6">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold" data-testid="text-intake-success-title">Campaign Created!</h1>
            <p className="text-muted-foreground">
              Your campaign <strong>{result.campaign.campaignTitle}</strong> is now live. Share the links below with your community!
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Campaign Link</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input value={result.campaignUrl} readOnly className="flex-1 text-sm font-mono" data-testid="input-campaign-url" />
                <Button size="icon" variant="outline" onClick={() => handleCopy(result.campaignUrl)} data-testid="button-copy-campaign-url">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" onClick={() => window.open(result.campaignUrl, "_blank")} data-testid="button-open-campaign">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {result.participants.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Participant Links</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.participants.map((p) => {
                  const url = `${result.campaignUrl}/p/${p.id}`;
                  return (
                    <div key={p.id} className="flex items-center gap-2" data-testid={`participant-link-${p.id}`}>
                      <span className="text-sm font-medium min-w-[100px] truncate">{p.displayName}</span>
                      <Input value={url} readOnly className="flex-1 text-xs font-mono" />
                      <Button size="icon" variant="ghost" onClick={() => handleCopy(url)} data-testid={`button-copy-participant-${p.id}`}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <p className="text-center text-sm text-muted-foreground">
            A confirmation email with all these links has also been sent to <strong>{data.partnerEmail}</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-testid="page-campaign-intake">
      <PublicHeader rescueName={data.tenantName} logoUrl={data.tenantLogo || undefined} />
      <div className="max-w-lg mx-auto p-6 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Heart className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold" data-testid="text-intake-title">Create a Fundraising Campaign</h1>
          <p className="text-muted-foreground text-sm">
            Hi <strong>{data.partnerName}</strong>! Fill out the details below to set up your campaign for <strong>{data.tenantName}</strong>.
          </p>
          {data.animalName && (
            <Badge variant="secondary" data-testid="badge-intake-animal">
              Supporting: {data.animalName}
            </Badge>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="campaignTitle">Campaign Title *</Label>
                <Input
                  id="campaignTitle"
                  value={campaignTitle}
                  onChange={(e) => setCampaignTitle(e.target.value)}
                  placeholder="e.g. Mrs. Smith's 3rd Grade Penny Drive"
                  required
                  data-testid="input-intake-title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tell supporters what your campaign is about..."
                  rows={3}
                  data-testid="input-intake-description"
                />
              </div>

              <div className="space-y-2">
                <Label>Goal Type *</Label>
                <Select value={goalType} onValueChange={(v) => setGoalType(v as "currency" | "units")}>
                  <SelectTrigger data-testid="select-intake-goal-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="currency">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4" /> Dollar Amount
                      </div>
                    </SelectItem>
                    <SelectItem value="units">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4" /> Unit-Based (e.g. lbs of food)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {goalType === "currency" ? (
                <div className="space-y-2">
                  <Label htmlFor="goalAmount">Goal Amount ($) *</Label>
                  <Input
                    id="goalAmount"
                    type="number"
                    min="1"
                    step="1"
                    value={goalAmount}
                    onChange={(e) => setGoalAmount(e.target.value)}
                    placeholder="500"
                    required
                    data-testid="input-intake-goal-amount"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="goalTarget">Target *</Label>
                    <Input
                      id="goalTarget"
                      type="number"
                      min="1"
                      value={goalTarget}
                      onChange={(e) => setGoalTarget(e.target.value)}
                      placeholder="100"
                      required
                      data-testid="input-intake-goal-target"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="goalUnitLabel">Unit Label</Label>
                    <Input
                      id="goalUnitLabel"
                      value={goalUnitLabel}
                      onChange={(e) => setGoalUnitLabel(e.target.value)}
                      placeholder="lbs of food"
                      data-testid="input-intake-goal-unit"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="startDate">
                    <Calendar className="h-3.5 w-3.5 inline mr-1" />
                    Start Date (optional)
                  </Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    data-testid="input-intake-start-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">
                    <Calendar className="h-3.5 w-3.5 inline mr-1" />
                    End Date (optional)
                  </Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    data-testid="input-intake-end-date"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Participant Roster
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Add one participant name per line (e.g. student names, team members). Each will get their own fundraising sub-link.
              </p>
            </CardHeader>
            <CardContent>
              <Textarea
                value={participantText}
                onChange={(e) => setParticipantText(e.target.value)}
                placeholder={"Alice Johnson\nBob Smith\nCarla Davis\n..."}
                rows={6}
                data-testid="input-intake-participants"
              />
              {participantText.trim() && (
                <p className="text-xs text-muted-foreground mt-2" data-testid="text-participant-count">
                  {participantText.split("\n").filter((l) => l.trim()).length} participant(s)
                </p>
              )}
            </CardContent>
          </Card>

          <Button
            type="submit"
            className="w-full"
            disabled={submitMutation.isPending || !campaignTitle.trim()}
            data-testid="button-submit-intake"
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Campaign...
              </>
            ) : (
              <>
                <Heart className="mr-2 h-4 w-4" />
                Create Campaign
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Send, Sparkles, XCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type BadgeDraft = { key: string; label: string; explanation: string };
type RevealDraft = { title: string; body: string };
type ProfileDraft = { personalityTags?: string[]; superpowerBadges?: BadgeDraft[]; revealCards?: RevealDraft[] };
type Submission = { id: string; status: string; proposedPayload?: ProfileDraft };

export function PersonalityFitEditor({
  animalId,
  animalName,
  initialProfile,
  canReview = false,
}: {
  animalId: string;
  animalName: string;
  initialProfile?: ProfileDraft;
  canReview?: boolean;
}) {
  const { toast } = useToast();
  const [tags, setTags] = useState("");
  const [badges, setBadges] = useState<BadgeDraft[]>([{ key: "", label: "", explanation: "" }]);
  const [reveals, setReveals] = useState<RevealDraft[]>([{ title: "", body: "" }]);
  const { data } = useQuery<{ submissions: Submission[] }>({ queryKey: ["/api/animals", animalId, "profile-submissions"] });
  const latest = data?.submissions?.[0];
  const latestProfile = latest?.proposedPayload || initialProfile;

  useEffect(() => {
    if (!latestProfile) return;
    setTags((latestProfile.personalityTags || []).join(", "));
    setBadges(latestProfile.superpowerBadges?.length ? latestProfile.superpowerBadges : [{ key: "", label: "", explanation: "" }]);
    setReveals(latestProfile.revealCards?.length ? latestProfile.revealCards : [{ title: "", body: "" }]);
  }, [
    latest?.id,
    initialProfile?.personalityTags,
    initialProfile?.superpowerBadges,
    initialProfile?.revealCards,
  ]);

  const submit = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/animals/${animalId}/profile-submissions`, {
        personalityTags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        superpowerBadges: badges
          .filter((badge) => badge.label.trim() && badge.explanation.trim())
          .map((badge) => ({
            ...badge,
            key: badge.key.trim() || badge.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
          })),
        revealCards: reveals.filter((card) => card.title.trim() && card.body.trim()),
      });
      return response.json() as Promise<{ status: string }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/animals", animalId, "profile-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/animals"] });
      toast({ title: result.status === "pending" ? "Profile submitted for review" : "Profile published", description: result.status === "pending" ? `${animalName}'s personality update is waiting for approval.` : `${animalName}'s public profile is now up to date.` });
    },
    onError: (error: Error) => toast({ title: "Could not submit profile", description: error.message, variant: "destructive" }),
  });
  const review = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approve" | "reject" }) => (await apiRequest("POST", `/api/animal-profile-submissions/${id}/${action}`, {})).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/animals", animalId, "profile-submissions"] }); queryClient.invalidateQueries({ queryKey: ["/api/animals"] }); toast({ title: "Profile review recorded" }); },
    onError: (error: Error) => toast({ title: "Could not record review", description: error.message, variant: "destructive" }),
  });

  const statusIsPending = latest?.status === "pending";
  return (
    <Card className="mt-6 overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /><CardTitle className="text-lg">Personality &amp; Adoption Fit</CardTitle></div>
        <CardDescription>Give visitors the small details that help them imagine life with {animalName}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2"><Label htmlFor="personality-tags">Personality tags</Label><Input id="personality-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Gentle greeter, Window watcher, Treat motivated" /><p className="text-xs text-muted-foreground">Separate short, welcoming traits with commas.</p></div>
        <div className="space-y-3">
          <Label>Superpowers</Label>
          {badges.map((badge, index) => <div key={index} className="grid gap-2 rounded-lg border border-border/70 bg-background/60 p-3 sm:grid-cols-[1fr_2fr]">
            <Input value={badge.label} onChange={(event) => setBadges(badges.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} placeholder="Display name" aria-label={`Superpower ${index + 1} label`} />
            <Input value={badge.explanation} onChange={(event) => setBadges(badges.map((item, i) => i === index ? { ...item, explanation: event.target.value } : item))} placeholder="What does this look like at home?" aria-label={`Superpower ${index + 1} explanation`} />
          </div>)}
          <Button type="button" variant="ghost" size="sm" onClick={() => setBadges([...badges, { key: "", label: "", explanation: "" }])}>Add superpower</Button>
        </div>
        <div className="space-y-3">
          <Label>Tap-to-reveal moments</Label>
          {reveals.map((reveal, index) => <div key={index} className="grid gap-2 rounded-lg border border-border/70 bg-background/60 p-3 sm:grid-cols-[1fr_2fr]">
            <Input value={reveal.title} onChange={(event) => setReveals(reveals.map((item, i) => i === index ? { ...item, title: event.target.value } : item))} placeholder="Moment title" aria-label={`Reveal ${index + 1} title`} />
            <Textarea value={reveal.body} onChange={(event) => setReveals(reveals.map((item, i) => i === index ? { ...item, body: event.target.value } : item))} placeholder="A specific, honest little detail" aria-label={`Reveal ${index + 1} detail`} className="min-h-10" />
          </div>)}
          <Button type="button" variant="ghost" size="sm" onClick={() => setReveals([...reveals, { title: "", body: "" }])}>Add reveal</Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">{statusIsPending ? <><Clock3 className="h-4 w-4 text-amber-600" />Awaiting an admin review</> : latest ? <><CheckCircle2 className="h-4 w-4 text-primary" />Latest version is published</> : "Draft your first public personality profile."}</p>
          <Button type="button" onClick={() => submit.mutate()} disabled={submit.isPending} data-testid="button-submit-profile-personality"><Send className="h-4 w-4" />{submit.isPending ? "Submitting" : "Submit profile"}</Button>
        </div>
        {canReview && data?.submissions?.filter((item) => item.status === "pending").map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-amber-50/50 p-3 dark:bg-amber-950/20"><span className="flex items-center gap-2 text-sm font-medium"><Clock3 className="h-4 w-4 text-amber-600" />Pending profile submission</span><div className="flex gap-2"><Button type="button" size="sm" onClick={() => review.mutate({ id: item.id, action: "approve" })} disabled={review.isPending}><CheckCircle2 className="h-4 w-4" />Approve</Button><Button type="button" size="sm" variant="outline" onClick={() => review.mutate({ id: item.id, action: "reject" })} disabled={review.isPending}><XCircle className="h-4 w-4" />Reject</Button></div></div>)}
      </CardContent>
    </Card>
  );
}
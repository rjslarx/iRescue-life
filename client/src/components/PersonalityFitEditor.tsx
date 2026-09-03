import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Lightbulb, Plus, Send, Sparkles, Video, X, XCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ObjectUploader } from "@/components/ObjectUploader";
import {
  appendUniqueTag,
  insertBadgeExample,
  insertRevealExample,
  type BadgeDraft,
  type RevealDraft,
} from "./personalityFitExamples";

type ProfileVideoDraft = { url: string; label: string; description: string };
type ProfileDraft = { personalityTags?: string[]; superpowerBadges?: BadgeDraft[]; revealCards?: RevealDraft[]; profileVideos?: ProfileVideoDraft[] };
type Submission = { id: string; status: string; proposedPayload?: ProfileDraft };

const TAG_EXAMPLES = [
  "Gentle greeter",
  "Window watcher",
  "Treat motivated",
  "Couch cuddler",
  "Toy collector",
  "Curious explorer",
];

const SUPERPOWER_EXAMPLES: BadgeDraft[] = [
  { key: "", label: "Champion nap buddy", explanation: "Settles beside you while you read, work, or watch TV." },
  { key: "", label: "Toy-finding expert", explanation: "Can always locate a favorite toy, even when it rolls under the couch." },
  { key: "", label: "Morning motivator", explanation: "Greets the day with a happy stretch and is ready for a walk." },
];

const REVEAL_EXAMPLES: RevealDraft[] = [
  { title: "The fastest way to my heart", body: "Sit on the floor and offer a small treat. I usually come over for a gentle hello." },
  { title: "My favorite little routine", body: "After dinner, I carry my favorite toy to the living room and settle nearby." },
  { title: "Something I am still learning", body: "New visitors can make me shy, but I relax when they give me a little space." },
];

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
  const [videos, setVideos] = useState<ProfileVideoDraft[]>([]);
  const { data } = useQuery<{ submissions: Submission[] }>({ queryKey: ["/api/animals", animalId, "profile-submissions"] });
  const latest = data?.submissions?.[0];
  const latestProfile = latest?.proposedPayload || initialProfile;

  useEffect(() => {
    if (!latestProfile) return;
    setTags((latestProfile.personalityTags || []).join(", "));
    setBadges(latestProfile.superpowerBadges?.length ? latestProfile.superpowerBadges : [{ key: "", label: "", explanation: "" }]);
    setReveals(latestProfile.revealCards?.length ? latestProfile.revealCards : [{ title: "", body: "" }]);
    setVideos(latestProfile.profileVideos || []);
  }, [
    latest?.id,
    initialProfile?.personalityTags,
    initialProfile?.superpowerBadges,
    initialProfile?.revealCards,
    initialProfile?.profileVideos,
  ]);

  const submit = useMutation({
    mutationFn: async () => {
      if (videos.some((video) => !video.label.trim() || !video.description.trim())) {
        throw new Error("Add an action label and an accessible description for every uploaded video.");
      }
      const response = await apiRequest("POST", `/api/animals/${animalId}/profile-submissions`, {
        personalityTags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        superpowerBadges: badges
          .filter((badge) => badge.label.trim() && badge.explanation.trim())
          .map((badge) => ({
            ...badge,
            key: badge.key.trim() || badge.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
          })),
        revealCards: reveals.filter((card) => card.title.trim() && card.body.trim()),
        profileVideos: videos.map((video) => ({ ...video, label: video.label.trim(), description: video.description.trim() })),
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
  const addTagExample = (example: string) => {
    setTags((current) => appendUniqueTag(current, example));
  };
  const addBadgeExample = (example: BadgeDraft) => {
    setBadges((current) => insertBadgeExample(current, example));
  };
  const addRevealExample = (example: RevealDraft) => {
    setReveals((current) => insertRevealExample(current, example));
  };

  return (
    <Card className="mt-6 overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /><CardTitle className="text-lg">Personality &amp; Adoption Fit</CardTitle></div>
        <CardDescription>Give visitors the small details that help them imagine life with {animalName}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="personality-tags">Personality tags</Label>
          <Input id="personality-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Gentle greeter, Window watcher, Treat motivated" />
          <p className="text-xs text-muted-foreground">Separate short, welcoming traits with commas.</p>
          <details className="group rounded-lg border border-dashed border-primary/30 bg-primary/5">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Lightbulb className="h-4 w-4" aria-hidden="true" />
              See personality tag examples
            </summary>
            <div className="border-t border-primary/15 px-3 py-3">
              <p className="mb-3 text-xs text-muted-foreground">Choose only traits you have personally observed, then adjust the wording to fit {animalName}.</p>
              <div className="flex flex-wrap gap-2">
                {TAG_EXAMPLES.map((example) => (
                  <Button key={example} type="button" variant="outline" size="sm" onClick={() => addTagExample(example)} aria-label={`Add personality tag example: ${example}`}>
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />{example}
                  </Button>
                ))}
              </div>
            </div>
          </details>
        </div>
        <div className="space-y-3">
          <Label>Superpowers</Label>
          {badges.map((badge, index) => <div key={index} className="grid gap-2 rounded-lg border border-border/70 bg-background/60 p-3 sm:grid-cols-[1fr_2fr]">
            <Input value={badge.label} onChange={(event) => setBadges(badges.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} placeholder="Display name" aria-label={`Superpower ${index + 1} label`} />
            <Input value={badge.explanation} onChange={(event) => setBadges(badges.map((item, i) => i === index ? { ...item, explanation: event.target.value } : item))} placeholder="What does this look like at home?" aria-label={`Superpower ${index + 1} explanation`} />
          </div>)}
          <Button type="button" variant="ghost" size="sm" onClick={() => setBadges([...badges, { key: "", label: "", explanation: "" }])}>Add superpower</Button>
          <details className="group rounded-lg border border-dashed border-primary/30 bg-primary/5">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Lightbulb className="h-4 w-4" aria-hidden="true" />
              See superpower examples
            </summary>
            <div className="space-y-2 border-t border-primary/15 px-3 py-3">
              <p className="text-xs text-muted-foreground">A superpower pairs a fun display name with what an adopter would actually see at home. Use only something you have observed.</p>
              {SUPERPOWER_EXAMPLES.map((example) => (
                <button key={example.label} type="button" onClick={() => addBadgeExample(example)} className="flex w-full items-start gap-2 rounded-md border bg-background p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Add superpower example: ${example.label}. ${example.explanation}`}>
                  <Plus className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span><span className="block text-sm font-medium">{example.label}</span><span className="block text-xs text-muted-foreground">{example.explanation}</span></span>
                </button>
              ))}
            </div>
          </details>
        </div>
        <div className="space-y-3">
          <div>
            <Label>See me in action</Label>
            <p className="mt-1 text-xs text-muted-foreground">Add up to three candid clips. Aim for 5–10 seconds and show one clear action in each.</p>
          </div>
          {videos.map((video, index) => (
            <div key={video.url} className="grid gap-3 rounded-lg border border-border/70 bg-background/60 p-3 sm:grid-cols-[160px_1fr_auto] sm:items-start">
              <video src={video.url} className="aspect-video w-full rounded-md bg-black object-cover" muted playsInline controls preload="metadata" aria-label={`Preview of action clip ${index + 1}`} />
              <div className="space-y-3">
                <div className="space-y-1">
                <Label htmlFor={`profile-video-label-${index}`}>What is {animalName} doing?</Label>
                <Input id={`profile-video-label-${index}`} value={video.label} maxLength={60} onChange={(event) => setVideos(videos.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} placeholder="Playing fetch in the yard" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`profile-video-description-${index}`}>Describe the clip for someone who cannot hear or see it</Label>
                  <Textarea id={`profile-video-description-${index}`} value={video.description} maxLength={240} onChange={(event) => setVideos(videos.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} placeholder={`${animalName} trots after a yellow ball, brings it back, and wags while waiting for another throw.`} />
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setVideos(videos.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove action clip ${index + 1}`}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          {videos.length < 3 && (
            <ObjectUploader
              value={videos.map((video) => video.url)}
              onChange={(urls) => setVideos(urls.map((url) => videos.find((video) => video.url === url) || { url, label: "", description: "" }))}
              maxFiles={3}
              maxFileSize={20 * 1024 * 1024}
              uploadEndpoint={`/api/animals/${animalId}/profile-videos/upload`}
              accept="video/mp4,video/webm,video/quicktime,.mov"
              buttonText="Upload action clip"
              showPreview={false}
            />
          )}
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><Video className="h-4 w-4" aria-hidden="true" />Clips play muted until a visitor chooses sound. MP4, WebM, or MOV; 20 MB maximum each.</p>
        </div>
        <div className="space-y-3">
          <Label>Tap-to-reveal moments</Label>
          {reveals.map((reveal, index) => <div key={index} className="grid gap-2 rounded-lg border border-border/70 bg-background/60 p-3 sm:grid-cols-[1fr_2fr]">
            <Input value={reveal.title} onChange={(event) => setReveals(reveals.map((item, i) => i === index ? { ...item, title: event.target.value } : item))} placeholder="Moment title" aria-label={`Reveal ${index + 1} title`} />
            <Textarea value={reveal.body} onChange={(event) => setReveals(reveals.map((item, i) => i === index ? { ...item, body: event.target.value } : item))} placeholder="A specific, honest little detail" aria-label={`Reveal ${index + 1} detail`} className="min-h-10" />
          </div>)}
          <Button type="button" variant="ghost" size="sm" onClick={() => setReveals([...reveals, { title: "", body: "" }])}>Add reveal</Button>
          <details className="group rounded-lg border border-dashed border-primary/30 bg-primary/5">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Lightbulb className="h-4 w-4" aria-hidden="true" />
              See tap-to-reveal examples
            </summary>
            <div className="space-y-2 border-t border-primary/15 px-3 py-3">
              <p className="text-xs text-muted-foreground">Share one specific, honest moment that helps someone picture daily life with {animalName}. Customize any example you add.</p>
              {REVEAL_EXAMPLES.map((example) => (
                <button key={example.title} type="button" onClick={() => addRevealExample(example)} className="flex w-full items-start gap-2 rounded-md border bg-background p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Add tap-to-reveal example: ${example.title}. ${example.body}`}>
                  <Plus className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span><span className="block text-sm font-medium">{example.title}</span><span className="block text-xs text-muted-foreground">{example.body}</span></span>
                </button>
              ))}
            </div>
          </details>
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
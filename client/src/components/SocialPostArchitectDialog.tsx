import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Sparkles,
  ChevronsUpDown,
  X,
  Copy,
  Check,
  AlertTriangle,
  Loader2,
  Plus,
  ExternalLink,
  Image as ImageIcon,
  Hash,
} from "lucide-react";

type Theme =
  | "transformation_tuesday"
  | "happy_tail"
  | "urgent_need"
  | "volunteer_recruitment"
  | "monthly_donor_push"
  | "giving_tuesday"
  | "custom";

type Tone = "heartwarming" | "urgent" | "celebratory";

interface AnimalLite {
  id: string;
  name: string;
  species?: string | null;
  status?: string | null;
  intakeDate?: string | null;
  intakeSource?: string | null;
  locationFound?: string | null;
  bio?: string | null;
  adoptionDate?: string | null;
  photoUrls?: string[] | null;
}

// Statuses that should NEVER appear in the picker — animals that are no
// longer in the rescue's care AND have no positive story to feature.
// "adopted" and "transported" are intentionally allowed because they
// power the Happy Tail / Adoption Announcement and partner-shoutout
// themes.
const HIDDEN_ANIMAL_STATUSES = new Set<string>([
  "deceased",
  "returned_to_owner",
  "returned_to_field",
]);

interface AnimalsResponse {
  animals: AnimalLite[];
}

interface GenerateResponse {
  success: true;
  caption: string;
  firstComment: string;
  suggestedHashtags: string[];
  visualCue: string;
  destination: {
    url: string;
    label: string;
    kind: string;
    source: string;
    isFallback: boolean;
  };
  tenantContext: {
    name: string;
    location: string | null;
    socialFacebook: string | null;
    socialInstagram: string | null;
  };
}

const THEME_OPTIONS: { value: Theme; label: string; tagline: string }[] = [
  { value: "transformation_tuesday", label: "Transformation Tuesday", tagline: "Before-and-after rescue story" },
  { value: "happy_tail", label: "Happy Tail / Adoption", tagline: "Celebrate a successful adoption" },
  { value: "urgent_need", label: "Urgent Need", tagline: "Specific medical / foster ask" },
  { value: "volunteer_recruitment", label: "Volunteer Recruitment", tagline: "Recruit for a specific role" },
  { value: "monthly_donor_push", label: "Monthly Donor Push", tagline: "Recurring giving program ask" },
  { value: "giving_tuesday", label: "Giving Tuesday", tagline: "Annual giving day rally" },
  { value: "custom", label: "Custom Post", tagline: "Anything else — driven by your prompt" },
];

const TONE_OPTIONS: { value: Tone; label: string }[] = [
  { value: "heartwarming", label: "Heartwarming" },
  { value: "urgent", label: "Urgent" },
  { value: "celebratory", label: "Celebratory" },
];

function buildDefaultHashtagFromName(name: string | undefined): string {
  if (!name) return "#AnimalRescue";
  const cleaned = name
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
  return cleaned ? `#${cleaned}` : "#AnimalRescue";
}

const THEME_HASHTAGS: Record<Theme, string[]> = {
  transformation_tuesday: ["#TransformationTuesday", "#RescueTransformation"],
  happy_tail: ["#HappyTail", "#AdoptDontShop"],
  urgent_need: ["#UrgentNeed", "#PleaseHelp"],
  volunteer_recruitment: ["#Volunteer", "#JoinUs"],
  monthly_donor_push: ["#MonthlyGiving", "#JoinThePack"],
  giving_tuesday: ["#GivingTuesday", "#GiveBack"],
  custom: [],
};

interface SocialPostArchitectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTheme?: Theme;
  initialAnimalId?: string | null;
}

export default function SocialPostArchitectDialog({
  open,
  onOpenChange,
  initialTheme,
  initialAnimalId,
}: SocialPostArchitectDialogProps) {
  const { toast } = useToast();

  const { data: tenantData } = useQuery<{ tenant: any }>({ queryKey: ["/api/tenant"] });
  const tenant = tenantData?.tenant;

  const { data: animalsData, isLoading: animalsLoading, error: animalsError } = useQuery<AnimalsResponse>({
    queryKey: ["/api/animals"],
    enabled: open,
  });

  const animals = useMemo(() => {
    const list = animalsData?.animals ?? [];
    return list
      .filter((a) => !HIDDEN_ANIMAL_STATUSES.has((a.status ?? "") as string))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [animalsData]);

  const [theme, setTheme] = useState<Theme>(initialTheme ?? "transformation_tuesday");
  const [tone, setTone] = useState<Tone>("heartwarming");
  const [animalId, setAnimalId] = useState<string | null>(initialAnimalId ?? null);
  const [animalPopoverOpen, setAnimalPopoverOpen] = useState(false);

  const [beforeText, setBeforeText] = useState("");
  const [afterText, setAfterText] = useState("");
  const [needDescription, setNeedDescription] = useState("");
  const [dollarAmount, setDollarAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [volunteerRole, setVolunteerRole] = useState("");
  const [timeCommitment, setTimeCommitment] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");

  const [hashtags, setHashtags] = useState<string[]>([]);
  const [newHashtag, setNewHashtag] = useState("");
  // Tracks the last seed list applied (tenant tag + theme defaults). Lets us
  // distinguish "user-added" tags from theme-default tags across theme changes,
  // so user customs are preserved while old theme defaults are dropped.
  const prevSeedRef = useRef<string[]>([]);

  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Reset form when dialog opens, applying any initial values + tenant-aware
  // hashtag defaults so the user doesn't see stale state from a prior run.
  useEffect(() => {
    if (!open) return;
    setTheme(initialTheme ?? "transformation_tuesday");
    setTone("heartwarming");
    setAnimalId(initialAnimalId ?? null);
    setBeforeText("");
    setAfterText("");
    setNeedDescription("");
    setDollarAmount("");
    setDeadline("");
    setVolunteerRole("");
    setTimeCommitment("");
    setCustomInstructions("");
    setResult(null);
    setCopiedKey(null);
  }, [open, initialTheme, initialAnimalId]);

  // Recompute the seed hashtag list whenever theme or tenant changes so the
  // chips stay relevant. Preserves any user-added tags (anything not present
  // in the *previously applied* seed) while swapping out the prior theme's
  // default tags.
  useEffect(() => {
    if (!open) return;
    const tenantTag = buildDefaultHashtagFromName(tenant?.name);
    const themeTags = THEME_HASHTAGS[theme] || [];
    const seed = Array.from(new Set([tenantTag, ...themeTags].filter(Boolean) as string[]));
    setHashtags((prev) => {
      const prevSeed = prevSeedRef.current;
      // First apply (no prior seed): start from the seed only.
      if (prevSeed.length === 0) {
        prevSeedRef.current = seed;
        return seed;
      }
      // Anything in `prev` that wasn't in the prior seed is a user-added tag.
      const custom = prev.filter((t) => !prevSeed.includes(t));
      const merged = Array.from(new Set([...seed, ...custom]));
      prevSeedRef.current = seed;
      return merged;
    });
  }, [theme, tenant?.name, open]);

  // Reset prevSeedRef whenever the dialog closes so reopening starts fresh.
  useEffect(() => {
    if (!open) prevSeedRef.current = [];
  }, [open]);

  const selectedAnimal = useMemo(
    () => animals.find((a) => a.id === animalId) ?? null,
    [animals, animalId],
  );

  // Track which animal we last auto-filled for, so the user's manual edits
  // aren't clobbered when this effect re-runs on theme switches or rerenders.
  const autofilledAnimalIdRef = useRef<string | null>(null);

  // When the user picks an animal, pre-fill the relevant theme inputs from
  // the animal's data so they have a head start instead of a blank canvas.
  // Only auto-fills inputs that are empty (preserves anything the user typed).
  useEffect(() => {
    if (!open) return;
    if (!selectedAnimal) {
      autofilledAnimalIdRef.current = null;
      return;
    }
    if (autofilledAnimalIdRef.current === selectedAnimal.id) return;
    autofilledAnimalIdRef.current = selectedAnimal.id;

    const intakePieces: string[] = [];
    if (selectedAnimal.intakeDate) {
      intakePieces.push(`Came to us on ${new Date(selectedAnimal.intakeDate).toLocaleDateString()}`);
    }
    if (selectedAnimal.locationFound) intakePieces.push(`from ${selectedAnimal.locationFound}`);
    if (selectedAnimal.intakeSource) intakePieces.push(`(${selectedAnimal.intakeSource})`);
    const intakeSummary = intakePieces.length
      ? `${selectedAnimal.name} ${intakePieces.join(" ")}.${selectedAnimal.bio ? " " + selectedAnimal.bio : ""}`.trim()
      : selectedAnimal.bio || `Meet ${selectedAnimal.name}.`;

    const adoptedSummary = selectedAnimal.adoptionDate
      ? `${selectedAnimal.name} was adopted on ${new Date(selectedAnimal.adoptionDate).toLocaleDateString()}!`
      : selectedAnimal.status === "adopted"
        ? `${selectedAnimal.name} found their forever home!`
        : `${selectedAnimal.name} is thriving and ready for what's next.`;

    // Theme-targeted auto-fill (only when the field is empty so user edits stick)
    if (theme === "transformation_tuesday") {
      setBeforeText((cur) => (cur.trim() ? cur : intakeSummary));
      setAfterText((cur) => (cur.trim() ? cur : adoptedSummary));
    } else if (theme === "happy_tail") {
      setAfterText((cur) => (cur.trim() ? cur : adoptedSummary));
    } else if (theme === "urgent_need") {
      setNeedDescription((cur) =>
        cur.trim() ? cur : `${selectedAnimal.name} needs help right away. ${selectedAnimal.bio ?? ""}`.trim(),
      );
    }
  }, [selectedAnimal, theme, open]);

  const generateMutation = useMutation({
    mutationFn: async (): Promise<GenerateResponse> => {
      const inputs = {
        beforeText: beforeText.trim() || undefined,
        afterText: afterText.trim() || undefined,
        needDescription: needDescription.trim() || undefined,
        dollarAmount: dollarAmount.trim() || undefined,
        deadline: deadline.trim() || undefined,
        volunteerRole: volunteerRole.trim() || undefined,
        timeCommitment: timeCommitment.trim() || undefined,
        customInstructions: customInstructions.trim() || undefined,
      };
      const res = await apiRequest("POST", "/api/social-post-architect/generate", {
        theme,
        tone,
        animalId: animalId || undefined,
        inputs,
        preferredHashtags: hashtags,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
    },
    onError: (err: any) => {
      const message = err?.message || "Failed to generate the post. Please try again.";
      toast({ title: "Generation failed", description: message, variant: "destructive" });
    },
  });

  const handleAddHashtag = () => {
    const raw = newHashtag.trim();
    if (!raw) return;
    const cleaned = raw.replace(/^#+/, "").replace(/[^A-Za-z0-9]/g, "");
    if (!cleaned) {
      setNewHashtag("");
      return;
    }
    const tag = `#${cleaned}`;
    setHashtags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    setNewHashtag("");
  };

  const handleRemoveHashtag = (tag: string) => {
    setHashtags((prev) => prev.filter((t) => t !== tag));
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Couldn't copy", description: "Try selecting and copying manually.", variant: "destructive" });
    }
  };

  const showBeforeAfter = theme === "transformation_tuesday";
  const showUrgentFields = theme === "urgent_need";
  const showVolunteerFields = theme === "volunteer_recruitment";
  const isGenerating = generateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" data-testid="dialog-social-post-architect">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Social Post Architect
          </DialogTitle>
          <DialogDescription>
            Generate a polished, ready-to-paste social post in seconds — pick a theme, fill in a few details, and we'll write the caption + first comment with the right call-to-action link for your rescue.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-2">
          {/* LEFT: form (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Theme + Tone */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="theme-select">Theme</Label>
                <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
                  <SelectTrigger id="theme-select" data-testid="select-theme">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {THEME_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} data-testid={`option-theme-${opt.value}`}>
                        <div className="flex flex-col">
                          <span>{opt.label}</span>
                          <span className="text-xs text-muted-foreground">{opt.tagline}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tone-select">Tone</Label>
                <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
                  <SelectTrigger id="tone-select" data-testid="select-tone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} data-testid={`option-tone-${opt.value}`}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Animal picker */}
            <div className="space-y-2">
              <Label htmlFor="animal-picker-trigger">
                Animal <span className="text-muted-foreground font-normal">(optional)</span>
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
                      data-testid="button-architect-animal-picker"
                      disabled={isGenerating}
                    >
                      <span className="truncate">
                        {selectedAnimal ? selectedAnimal.name : "No specific animal"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search animals..." data-testid="input-architect-animal-search" />
                      <CommandList>
                        {animalsLoading ? (
                          <div className="px-3 py-6 text-center text-sm text-muted-foreground">Loading animals…</div>
                        ) : animalsError ? (
                          <div className="px-3 py-6 text-center text-sm text-destructive">
                            Couldn't load animals. You can still generate without picking one.
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
                              data-testid={`option-architect-animal-${a.id}`}
                            >
                              <span className="truncate">{a.name}</span>
                              {a.species && (
                                <span className="ml-2 text-xs text-muted-foreground">{a.species}</span>
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
                    disabled={isGenerating}
                    data-testid="button-architect-clear-animal"
                    aria-label="Clear selected animal"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {selectedAnimal && (
                <p className="text-xs text-muted-foreground">
                  We'll use {selectedAnimal.name}'s intake date, location, bio, and current status to ground the post.
                </p>
              )}
            </div>

            {/* Theme-specific fields */}
            {showBeforeAfter && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="before-text">Before</Label>
                  <Textarea
                    id="before-text"
                    placeholder="Describe the animal's condition or situation when they arrived (e.g., 'Found in a parking lot, severely matted, terrified of people')."
                    value={beforeText}
                    onChange={(e) => setBeforeText(e.target.value)}
                    rows={4}
                    disabled={isGenerating}
                    data-testid="input-before-text"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="after-text">After</Label>
                  <Textarea
                    id="after-text"
                    placeholder="Describe how they are now (e.g., 'Healthy, fully groomed, follows their foster everywhere, ready for adoption')."
                    value={afterText}
                    onChange={(e) => setAfterText(e.target.value)}
                    rows={4}
                    disabled={isGenerating}
                    data-testid="input-after-text"
                  />
                </div>
              </div>
            )}

            {showUrgentFields && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="need-description">What's the need?</Label>
                  <Textarea
                    id="need-description"
                    placeholder="Describe the situation (e.g., 'Bella needs an emergency leg amputation after a hit-and-run')."
                    value={needDescription}
                    onChange={(e) => setNeedDescription(e.target.value)}
                    rows={3}
                    disabled={isGenerating}
                    data-testid="input-need-description"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dollar-amount">Dollar goal</Label>
                    <Input
                      id="dollar-amount"
                      placeholder="e.g., $2,400"
                      value={dollarAmount}
                      onChange={(e) => setDollarAmount(e.target.value)}
                      disabled={isGenerating}
                      data-testid="input-dollar-amount"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deadline">Deadline / urgency</Label>
                    <Input
                      id="deadline"
                      placeholder="e.g., by Friday morning"
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                      disabled={isGenerating}
                      data-testid="input-deadline"
                    />
                  </div>
                </div>
              </div>
            )}

            {showVolunteerFields && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="volunteer-role">Role</Label>
                  <Input
                    id="volunteer-role"
                    placeholder="e.g., Saturday dog walker"
                    value={volunteerRole}
                    onChange={(e) => setVolunteerRole(e.target.value)}
                    disabled={isGenerating}
                    data-testid="input-volunteer-role"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time-commitment">Time commitment</Label>
                  <Input
                    id="time-commitment"
                    placeholder="e.g., 2 hours / week"
                    value={timeCommitment}
                    onChange={(e) => setTimeCommitment(e.target.value)}
                    disabled={isGenerating}
                    data-testid="input-time-commitment"
                  />
                </div>
              </div>
            )}

            {/* Custom instructions */}
            <div className="space-y-2">
              <Label htmlFor="custom-instructions">
                Custom instructions <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="custom-instructions"
                placeholder="Anything specific you want included or avoided — names to mention, milestones to highlight, words to skip."
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                rows={3}
                disabled={isGenerating}
                data-testid="input-custom-instructions"
              />
            </div>

            {/* Hashtag chips */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Hash className="h-4 w-4" />
                Hashtags
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {hashtags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="gap-1"
                    data-testid={`badge-hashtag-${tag.replace("#", "")}`}
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveHashtag(tag)}
                      className="ml-0.5 inline-flex items-center"
                      aria-label={`Remove ${tag}`}
                      disabled={isGenerating}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={newHashtag}
                  onChange={(e) => setNewHashtag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddHashtag();
                    }
                  }}
                  placeholder="Add a hashtag (without #)"
                  disabled={isGenerating}
                  data-testid="input-new-hashtag"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddHashtag}
                  disabled={isGenerating || !newHashtag.trim()}
                  data-testid="button-add-hashtag"
                >
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>
            </div>

            {/* Generate button */}
            <div className="flex justify-end pt-2">
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={isGenerating}
                data-testid="button-generate-post"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" /> Generate Post
                  </>
                )}
              </Button>
            </div>

            {/* Results */}
            {result && (
              <div className="space-y-4 pt-2">
                {result.destination.isFallback && (
                  <Alert data-testid="alert-destination-fallback">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {(() => {
                        // Targeted guidance based on which destination kind
                        // we fell back to, with a deep link to the right
                        // settings page.
                        const kind = result.destination.kind;
                        const isVip = kind?.includes("vip") || theme === "transformation_tuesday" || theme === "monthly_donor_push";
                        const isVolunteer = kind?.includes("volunteer") || theme === "volunteer_recruitment";
                        const isAdoption = kind?.includes("adoption") || theme === "happy_tail";
                        const isUrgent = theme === "urgent_need";

                        let label = "Donate page";
                        let path = "/dashboard/settings/branding";
                        let advice = "Set a custom donate URL in Branding settings so supporters land on the right page.";
                        if (isVip) {
                          label = "VIP Club / Monthly Donor URL";
                          path = "/dashboard/settings/branding";
                          advice = "Configure a Monthly Donor / VIP Club page so Transformation Tuesday and Monthly Donor posts deep-link to it.";
                        } else if (isVolunteer) {
                          label = "Volunteer signup URL";
                          path = "/dashboard/settings/branding";
                          advice = "Add your volunteer signup URL (JotForm or other) in Branding settings so volunteer posts route to the right form.";
                        } else if (isAdoption) {
                          label = "Adoption application URL";
                          path = "/dashboard/settings/branding";
                          advice = "Add your adoption application URL in Branding settings so Happy Tail posts deep-link adopters to the right form.";
                        } else if (isUrgent) {
                          label = "Animal-specific emergency fundraiser";
                          path = "/dashboard/fundraising";
                          advice = "Create an animal-specific emergency fundraiser in the Fundraising Hub so urgent posts can route donors directly to that campaign.";
                        }

                        return (
                          <>
                            Using a fallback link (<span className="font-medium">{result.destination.label}</span>). {advice}{" "}
                            <a
                              href={path}
                              className="underline font-medium"
                              data-testid="link-fallback-settings"
                            >
                              Open {label} settings →
                            </a>
                          </>
                        );
                      })()}
                    </AlertDescription>
                  </Alert>
                )}

                <Card data-testid="card-result-caption">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                    <CardTitle className="text-base">Caption (paste as your post)</CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(result.caption, "caption")}
                      data-testid="button-copy-caption"
                    >
                      {copiedKey === "caption" ? (
                        <>
                          <Check className="h-3.5 w-3.5 mr-1" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                        </>
                      )}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      readOnly
                      value={result.caption}
                      rows={Math.min(14, Math.max(6, result.caption.split("\n").length + 2))}
                      className="resize-y font-sans"
                      data-testid="text-result-caption"
                    />
                  </CardContent>
                </Card>

                <Card data-testid="card-result-first-comment">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                    <CardTitle className="text-base">First comment (paste right after publishing)</CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(result.firstComment, "firstComment")}
                      data-testid="button-copy-first-comment"
                    >
                      {copiedKey === "firstComment" ? (
                        <>
                          <Check className="h-3.5 w-3.5 mr-1" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                        </>
                      )}
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      readOnly
                      value={result.firstComment}
                      rows={Math.min(8, Math.max(4, result.firstComment.split("\n").length + 1))}
                      className="resize-y font-sans"
                      data-testid="text-result-first-comment"
                    />
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" />
                        Links to: {result.destination.label}
                      </span>
                      <a
                        href={result.destination.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline truncate max-w-[280px]"
                        data-testid="link-destination-url"
                      >
                        {result.destination.url}
                      </a>
                    </div>
                  </CardContent>
                </Card>

                {result.suggestedHashtags.length > 0 && (
                  <Card data-testid="card-result-hashtags">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                      <CardTitle className="text-base">Suggested hashtags</CardTitle>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          copyToClipboard(result.suggestedHashtags.join(" "), "hashtags")
                        }
                        data-testid="button-copy-hashtags"
                      >
                        {copiedKey === "hashtags" ? (
                          <>
                            <Check className="h-3.5 w-3.5 mr-1" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 mr-1" /> Copy all
                          </>
                        )}
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1.5">
                        {result.suggestedHashtags.map((tag) => (
                          <Badge key={tag} variant="secondary" data-testid={`badge-result-hashtag-${tag.replace("#", "")}`}>
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card data-testid="card-result-visual-cue">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-1.5">
                      <ImageIcon className="h-4 w-4" /> Visual cue
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground" data-testid="text-visual-cue">
                      {result.visualCue}
                    </p>
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      copyToClipboard(
                        `${result.caption}\n\n---\nFirst comment:\n${result.firstComment}`,
                        "both",
                      )
                    }
                    data-testid="button-copy-both"
                  >
                    {copiedKey === "both" ? (
                      <>
                        <Check className="h-4 w-4 mr-1" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1" /> Copy caption + first comment
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Story Boost checklist */}
          <div className="lg:col-span-1">
            <Card data-testid="card-story-boost-checklist" className="sticky top-2">
              <CardHeader>
                <CardTitle className="text-base">Story Boost Checklist</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3 text-sm">
                  <li className="flex gap-2">
                    <span className="font-bold text-muted-foreground">1.</span>
                    <span>Post the caption to your feed with a clear, well-lit photo{selectedAnimal ? ` of ${selectedAnimal.name}` : ""}.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-muted-foreground">2.</span>
                    <span>Immediately after publishing, paste the first comment so the link sits at the top of the comments.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-muted-foreground">3.</span>
                    <span>Re-share the post to your Story and add the Link sticker pointing to the destination URL.</span>
                  </li>
                  {tenant?.footerAddress && (
                    <li className="flex gap-2">
                      <span className="font-bold text-muted-foreground">4.</span>
                      <span>
                        Tag your location: <span className="font-medium">{tenant.footerAddress}</span>
                      </span>
                    </li>
                  )}
                  {(tenant?.socialFacebook || tenant?.socialInstagram) && (
                    <li className="flex gap-2">
                      <span className="font-bold text-muted-foreground">{tenant?.footerAddress ? "5." : "4."}</span>
                      <span>
                        Tag your handles:{" "}
                        {tenant?.socialFacebook && (
                          <a
                            href={tenant.socialFacebook}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                            data-testid="link-tenant-facebook"
                          >
                            Facebook
                          </a>
                        )}
                        {tenant?.socialFacebook && tenant?.socialInstagram && " · "}
                        {tenant?.socialInstagram && (
                          <a
                            href={tenant.socialInstagram}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                            data-testid="link-tenant-instagram"
                          >
                            Instagram
                          </a>
                        )}
                      </span>
                    </li>
                  )}
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

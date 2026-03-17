import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSEO } from "@/hooks/useSEO";
import { apiRequest } from "@/lib/queryClient";
import PublicHeader from "@/components/PublicHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ObjectUploader } from "@/components/ObjectUploader";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Heart, Link as LinkIcon, Loader2, Target, DollarSign, Calendar } from "lucide-react";
import type { Tenant } from "@shared/schema";

interface TenantResponse {
  tenant: Tenant;
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

const formSchema = z.object({
  creatorName: z.string().min(1, "Your name is required"),
  creatorEmail: z.string().email("Please enter a valid email"),
  campaignTitle: z.string().min(1, "Campaign title is required").max(100, "Title must be 100 characters or less"),
  campaignStory: z.string().optional(),
  goalType: z.enum(["currency", "units"]),
  goalAmount: z.string().min(1, "Goal amount is required").refine(
    (val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 1;
    },
    "Goal must be at least $1"
  ),
  goalUnitLabel: z.string().max(50).optional(),
  goalTarget: z.string().optional(),
  animalName: z.string().max(100).optional(),
  coverImageUrl: z.string().optional(),
  endsAt: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.goalType === "units") {
    if (!data.goalUnitLabel || data.goalUnitLabel.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unit label is required for pledge campaigns",
        path: ["goalUnitLabel"],
      });
    }
    if (!data.goalTarget || parseInt(data.goalTarget) < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Target must be at least 1",
        path: ["goalTarget"],
      });
    }
  }
});

type FormValues = z.infer<typeof formSchema>;

export default function PeerCampaignCreatePage() {
  const [, navigate] = useLocation();
  const [coverImages, setCoverImages] = useState<string[]>([]);

  const { data, isLoading } = useQuery<TenantResponse>({
    queryKey: ["/api/tenant"],
  });

  const tenant = data?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";

  useSEO({
    title: `Start a Fundraiser | ${rescueName}`,
    description: `Create a personal fundraising campaign to support ${rescueName}. Birthday fundraisers, pledge challenges, and more.`,
    siteName: rescueName,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      creatorName: "",
      creatorEmail: "",
      campaignTitle: "",
      campaignStory: "",
      goalType: "currency",
      goalAmount: "",
      goalUnitLabel: "",
      goalTarget: "",
      animalName: "",
      coverImageUrl: "",
      endsAt: "",
    },
  });

  const goalType = form.watch("goalType");
  const titleValue = form.watch("campaignTitle");
  const slugPreview = generateSlug(titleValue || "");

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const goalCents = Math.round(parseFloat(values.goalAmount) * 100);
      const payload: Record<string, any> = {
        creatorName: values.creatorName,
        creatorEmail: values.creatorEmail,
        campaignTitle: values.campaignTitle,
        campaignStory: values.campaignStory || null,
        goalAmount: goalCents,
        goalType: values.goalType,
      };

      if (values.goalType === "units") {
        payload.goalUnitLabel = values.goalUnitLabel;
        payload.goalTarget = parseInt(values.goalTarget || "0");
        if (values.animalName?.trim()) {
          payload.animalName = values.animalName.trim();
        }
      }

      if (coverImages.length > 0) {
        payload.coverImageUrl = coverImages[0];
      }

      if (values.endsAt) {
        payload.endsAt = values.endsAt;
      }

      const res = await apiRequest("POST", "/api/peer-campaigns", payload);
      return res.json();
    },
    onSuccess: (result) => {
      const slug = result?.campaign?.slug || result?.slug;
      if (slug) {
        navigate(`/campaign/${slug}`);
      }
    },
  });

  const onSubmit = (values: FormValues) => {
    createMutation.mutate(values);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader rescueName={rescueName} logoUrl={undefined} />
        <main className="container max-w-xl mx-auto py-12 px-4">
          <Skeleton className="h-8 w-3/4 mx-auto mb-4" />
          <Skeleton className="h-4 w-1/2 mx-auto mb-8" />
          <Skeleton className="h-[500px] w-full" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />

      <main className="container max-w-xl mx-auto py-8 sm:py-12 px-4 sm:px-6">
        <div className="text-center mb-8">
          <h1
            className="font-display text-3xl sm:text-4xl font-bold mb-2"
            data-testid="text-fundraise-title"
          >
            Start a Fundraiser
          </h1>
          <p className="text-muted-foreground" data-testid="text-fundraise-subtitle">
            Create a personal campaign to raise money for {rescueName}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5" />
              Campaign Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="creatorName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Sarah Johnson"
                          data-testid="input-creator-name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="creatorEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="sarah@example.com"
                          data-testid="input-creator-email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="campaignTitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campaign Title</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={goalType === "units" ? "Help Biscuit Lose 7 lbs!" : "Sarah's 30th Birthday Fundraiser"}
                          data-testid="input-campaign-title"
                          {...field}
                        />
                      </FormControl>
                      {slugPreview && (
                        <FormDescription className="flex items-center gap-1.5 text-xs">
                          <LinkIcon className="h-3 w-3" />
                          <span data-testid="text-slug-preview">
                            {typeof window !== "undefined" ? window.location.origin : ""}/campaign/{slugPreview}
                          </span>
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="campaignStory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campaign Story (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={goalType === "units"
                            ? "Tell people about your pledge challenge. What's the goal, and why does it matter?"
                            : "Tell people why you're fundraising. Share your connection to the rescue and what inspired you to start this campaign..."
                          }
                          className="resize-none min-h-[120px]"
                          data-testid="input-campaign-story"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="goalType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campaign Type</FormLabel>
                      <FormControl>
                        <div className="grid grid-cols-2 gap-3">
                          <Button
                            type="button"
                            variant={field.value === "currency" ? "default" : "outline"}
                            className="flex flex-col items-center gap-1 h-auto py-3"
                            onClick={() => field.onChange("currency")}
                            data-testid="button-goal-type-currency"
                          >
                            <DollarSign className="h-5 w-5" />
                            <span className="text-sm font-medium">Dollar Goal</span>
                            <span className="text-xs opacity-70">Raise a set amount</span>
                          </Button>
                          <Button
                            type="button"
                            variant={field.value === "units" ? "default" : "outline"}
                            className="flex flex-col items-center gap-1 h-auto py-3"
                            onClick={() => field.onChange("units")}
                            data-testid="button-goal-type-units"
                          >
                            <Target className="h-5 w-5" />
                            <span className="text-sm font-medium">Pledge Challenge</span>
                            <span className="text-xs opacity-70">$/unit pledges</span>
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {goalType === "units" && (
                  <div className="space-y-4 p-4 rounded-md bg-muted/50 border border-muted">
                    <FormField
                      control={form.control}
                      name="goalUnitLabel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Unit Label</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="lbs, miles, laps, etc."
                              data-testid="input-goal-unit-label"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>What are people pledging per? (e.g., "lbs" for weight loss)</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="goalTarget"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Target</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              placeholder="7"
                              data-testid="input-goal-target"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>How many units is the goal? (e.g., 7 lbs to lose)</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="animalName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Animal Name (Optional)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Biscuit"
                              data-testid="input-animal-name"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>The name of the animal this challenge is for</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="goalAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {goalType === "units" ? "Minimum Donation Goal ($)" : "Fundraising Goal ($)"}
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                            $
                          </span>
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            placeholder="500"
                            className="pl-7"
                            data-testid="input-goal-amount"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      {goalType === "units" && (
                        <FormDescription>Overall fundraising goal in dollars</FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <FormLabel>Cover Image (Optional)</FormLabel>
                  <ObjectUploader
                    value={coverImages}
                    onChange={(urls) => setCoverImages(urls)}
                    maxFiles={1}
                    maxFileSize={10 * 1024 * 1024}
                    uploadEndpoint="/api/peer-campaigns/public-media/upload"
                    accept="image/*"
                    data-testid="uploader-cover-image"
                    buttonText={coverImages.length > 0 ? "Change Image" : "Upload Cover Image"}
                    buttonVariant="outline"
                    showPreview={true}
                    previewSize="lg"
                  />
                  <p className="text-xs text-muted-foreground">
                    This image will appear at the top of your campaign page
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="endsAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Calendar className="h-4 w-4" />
                        End Date (Optional)
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          min={new Date().toISOString().split("T")[0]}
                          data-testid="input-ends-at"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>Leave blank for an open-ended campaign</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {createMutation.isError && (
                  <p
                    className="text-sm text-destructive text-center"
                    data-testid="text-create-error"
                  >
                    {(createMutation.error as any)?.message ||
                      "Something went wrong. Please try again."}
                  </p>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full gap-2"
                  disabled={createMutation.isPending}
                  data-testid="button-create-campaign"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : goalType === "units" ? (
                    <Target className="h-4 w-4" />
                  ) : (
                    <Heart className="h-4 w-4" />
                  )}
                  {createMutation.isPending
                    ? "Creating..."
                    : goalType === "units"
                      ? "Launch Pledge Challenge"
                      : "Launch My Fundraiser"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            Your fundraiser will be hosted by{" "}
            <strong>{rescueName}</strong>
          </p>
          <p className="mt-1">
            All donations go directly to the rescue through secure Stripe
            processing.
          </p>
        </div>
      </main>
    </div>
  );
}

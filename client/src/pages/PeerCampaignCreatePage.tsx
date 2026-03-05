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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Heart, Link as LinkIcon, Loader2 } from "lucide-react";
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
  goalAmount: z.string().min(1, "Goal amount is required").refine(
    (val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 1;
    },
    "Goal must be at least $1"
  ),
});

type FormValues = z.infer<typeof formSchema>;

export default function PeerCampaignCreatePage() {
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery<TenantResponse>({
    queryKey: ["/api/tenant"],
  });

  const tenant = data?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";

  useSEO({
    title: `Start a Fundraiser | ${rescueName}`,
    description: `Create a personal fundraising campaign to support ${rescueName}. Birthday fundraisers, memorial campaigns, and more.`,
    siteName: rescueName,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      creatorName: "",
      creatorEmail: "",
      campaignTitle: "",
      campaignStory: "",
      goalAmount: "",
    },
  });

  const titleValue = form.watch("campaignTitle");
  const slugPreview = generateSlug(titleValue || "");

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const goalCents = Math.round(parseFloat(values.goalAmount) * 100);
      const res = await apiRequest("POST", "/api/peer-campaigns", {
        creatorName: values.creatorName,
        creatorEmail: values.creatorEmail,
        campaignTitle: values.campaignTitle,
        campaignStory: values.campaignStory || null,
        goalAmount: goalCents,
      });
      return res.json();
    },
    onSuccess: (result) => {
      const slug = result?.campaign?.slug || result?.slug;
      if (slug) {
        navigate(`/fundraise/${slug}`);
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
                          placeholder="Sarah's 30th Birthday Fundraiser"
                          data-testid="input-campaign-title"
                          {...field}
                        />
                      </FormControl>
                      {slugPreview && (
                        <FormDescription className="flex items-center gap-1.5 text-xs">
                          <LinkIcon className="h-3 w-3" />
                          <span data-testid="text-slug-preview">
                            {typeof window !== "undefined" ? window.location.origin : ""}/fundraise/{slugPreview}
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
                          placeholder="Tell people why you're fundraising. Share your connection to the rescue and what inspired you to start this campaign..."
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
                  name="goalAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fundraising Goal ($)</FormLabel>
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
                  ) : (
                    <Heart className="h-4 w-4" />
                  )}
                  {createMutation.isPending
                    ? "Creating..."
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

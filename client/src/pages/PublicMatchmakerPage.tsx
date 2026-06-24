import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import PublicHeader from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PawPrint, Heart, CheckCircle2, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useSEO } from "@/hooks/useSEO";
import { useTenant } from "@/contexts/TenantContext";
import type { Tenant } from "@shared/schema";

interface SingleChoiceQuestion {
  name: string;
  label: string;
  options: string[];
}

// Fixed v1 question set. Each single-choice question maps directly to a labeled
// response that gets emailed to the rescue.
const QUESTIONS: SingleChoiceQuestion[] = [
  { name: "homeType", label: "What kind of home do you live in?", options: ["House", "Apartment", "Condo", "Townhome", "Other"] },
  { name: "ownRent", label: "Do you own or rent your home?", options: ["Own", "Rent"] },
  { name: "yard", label: "Do you have a yard?", options: ["Fenced yard", "Unfenced yard", "No yard", "Shared / community space"] },
  { name: "household", label: "Who lives in your home?", options: ["Just adults", "Adults + older kids (6+)", "Adults + young kids (under 6)", "Multi-generational household"] },
  { name: "currentPets", label: "Do you currently have any pets?", options: ["None", "Dog(s)", "Cat(s)", "Dogs and cats", "Other"] },
  { name: "activityLevel", label: "How active is your household?", options: ["Low-key / relaxed", "Moderately active", "Very active / outdoorsy"] },
  { name: "hoursAlone", label: "How long would a dog typically be home alone?", options: ["Rarely alone", "1–4 hours", "4–8 hours", "8+ hours"] },
  { name: "experience", label: "How much experience do you have with dogs?", options: ["First-time owner", "Some experience", "Very experienced"] },
  { name: "preferredSize", label: "Preferred dog size", options: ["Small", "Medium", "Large", "No preference"] },
  { name: "preferredAge", label: "Preferred age", options: ["Puppy", "Young adult", "Adult", "Senior", "No preference"] },
  { name: "preferredEnergy", label: "Preferred energy level", options: ["Calm / mellow", "Moderate", "High energy", "No preference"] },
];

const GOOD_WITH = [
  { name: "goodWithKids", label: "Kids" },
  { name: "goodWithDogs", label: "Other dogs" },
  { name: "goodWithCats", label: "Cats" },
] as const;

const matchmakerSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name"),
  email: z.string().trim().min(1, "Please enter your email").email("Please enter a valid email"),
  phone: z.string().trim().optional(),
  location: z.string().trim().optional(),
  homeType: z.string().optional(),
  ownRent: z.string().optional(),
  yard: z.string().optional(),
  household: z.string().optional(),
  currentPets: z.string().optional(),
  activityLevel: z.string().optional(),
  hoursAlone: z.string().optional(),
  experience: z.string().optional(),
  preferredSize: z.string().optional(),
  preferredAge: z.string().optional(),
  preferredEnergy: z.string().optional(),
  goodWithKids: z.boolean().optional(),
  goodWithDogs: z.boolean().optional(),
  goodWithCats: z.boolean().optional(),
  dealbreakers: z.string().optional(),
  about: z.string().optional(),
});

type MatchmakerFormData = z.infer<typeof matchmakerSchema>;

export default function PublicMatchmakerPage() {
  const { toast } = useToast();
  const { tenantId, basePath } = useTenant();
  const [submitted, setSubmitted] = useState(false);

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ["/api/tenant", tenantId],
  });

  const { data: matchmakerData, isLoading: matchmakerLoading } = useQuery<{ enabled: boolean; introText: string | null }>({
    queryKey: ["/api/public/matchmaker", tenantId],
  });

  const tenant = tenantData?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";
  const enabled = matchmakerData ? matchmakerData.enabled : true;
  const introText = matchmakerData?.introText;

  useSEO({
    title: `Find Your Match - ${rescueName}`,
    description: `Tell ${rescueName} about your home and lifestyle and we'll help match you with dogs that could be a great fit. No account needed.`,
    siteName: rescueName,
  });

  const form = useForm<MatchmakerFormData>({
    resolver: zodResolver(matchmakerSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      location: "",
      homeType: "",
      ownRent: "",
      yard: "",
      household: "",
      currentPets: "",
      activityLevel: "",
      hoursAlone: "",
      experience: "",
      preferredSize: "",
      preferredAge: "",
      preferredEnergy: "",
      goodWithKids: false,
      goodWithDogs: false,
      goodWithCats: false,
      dealbreakers: "",
      about: "",
    },
  });

  const buildResponses = (data: MatchmakerFormData) => {
    const responses: { label: string; value: string }[] = [];
    for (const q of QUESTIONS) {
      const value = (data as Record<string, any>)[q.name];
      responses.push({ label: q.label, value: value && String(value).trim() ? String(value) : "" });
    }
    const goodWith = GOOD_WITH.filter((g) => (data as Record<string, any>)[g.name]).map((g) => g.label);
    responses.push({ label: "Should be good with", value: goodWith.length ? goodWith.join(", ") : "" });
    if (data.dealbreakers?.trim()) responses.push({ label: "Things that wouldn't work for us", value: data.dealbreakers.trim() });
    if (data.about?.trim()) responses.push({ label: "Anything else / what we're looking for", value: data.about.trim() });
    return responses;
  };

  const submitMutation = useMutation({
    mutationFn: async (data: MatchmakerFormData) => {
      return await apiRequest("POST", "/api/public/matchmaker", {
        name: data.name,
        email: data.email,
        phone: data.phone || undefined,
        location: data.location || undefined,
        responses: buildResponses(data),
      });
    },
    onSuccess: () => {
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Something went wrong",
        description: error?.message || "We couldn't submit your form. Please try again.",
      });
    },
  });

  const onSubmit = (data: MatchmakerFormData) => submitMutation.mutate(data);

  const renderSelect = (q: SingleChoiceQuestion) => (
    <FormField
      key={q.name}
      control={form.control}
      name={q.name as keyof MatchmakerFormData}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{q.label}</FormLabel>
          <Select onValueChange={field.onChange} value={(field.value as string) || ""}>
            <FormControl>
              <SelectTrigger data-testid={`select-${q.name}`}>
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {q.options.map((opt) => (
                <SelectItem key={opt} value={opt} data-testid={`option-${q.name}-${opt}`}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />

      <main className="flex-1">
        <section className="py-12 md:py-16 bg-gradient-to-b from-primary/5 to-background">
          <div className="container px-6">
            <div className="text-center max-w-3xl mx-auto">
              <PawPrint className="w-12 h-12 mx-auto mb-4 text-primary" />
              <h1 className="text-3xl md:text-4xl font-bold mb-3" data-testid="text-matchmaker-title">
                Find Your Match
              </h1>
              <p className="text-muted-foreground text-lg">
                Tell us a little about your home and what you're looking for, and we'll help match you
                with dogs at {rescueName} that could be a great fit.
              </p>
            </div>
          </div>
        </section>

        <section className="py-10">
          <div className="container px-6">
            <div className="max-w-2xl mx-auto">
              {matchmakerLoading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground" data-testid="status-loading">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  Loading...
                </div>
              ) : submitted ? (
                <Card data-testid="card-matchmaker-success">
                  <CardContent className="py-12 text-center">
                    <CheckCircle2 className="w-14 h-14 mx-auto mb-4 text-primary" />
                    <h2 className="text-2xl font-bold mb-2">Thank you!</h2>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      We've received your information and the {rescueName} team will be in touch soon
                      about dogs that might be a great match for you.
                    </p>
                    <div className="mt-6">
                      <Button asChild variant="outline" data-testid="link-view-animals">
                        <a href={`${basePath || ''}/animals`}>
                          <Heart className="w-4 h-4 mr-2" />
                          Browse available dogs
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : !enabled ? (
                <Card data-testid="card-matchmaker-disabled">
                  <CardContent className="py-12 text-center">
                    <PawPrint className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <h2 className="text-xl font-semibold mb-2">Not accepting submissions right now</h2>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      Our matchmaker form is temporarily unavailable. Please check back soon or reach
                      out to us directly.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    {introText ? (
                      <div className="rounded-md border p-4 bg-muted/50 text-sm text-muted-foreground whitespace-pre-line" data-testid="text-intro">
                        {introText}
                      </div>
                    ) : null}

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Your contact info</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Full name</FormLabel>
                              <FormControl>
                                <Input placeholder="Your name" {...field} data-testid="input-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email</FormLabel>
                              <FormControl>
                                <Input type="email" placeholder="you@example.com" {...field} data-testid="input-email" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="grid gap-4 sm:grid-cols-2">
                          <FormField
                            control={form.control}
                            name="phone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Phone (optional)</FormLabel>
                                <FormControl>
                                  <Input type="tel" placeholder="(555) 555-5555" {...field} data-testid="input-phone" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="location"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>City / area (optional)</FormLabel>
                                <FormControl>
                                  <Input placeholder="Where you live" {...field} data-testid="input-location" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Your home &amp; lifestyle</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {QUESTIONS.slice(0, 8).map(renderSelect)}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">What you're looking for</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {QUESTIONS.slice(8).map(renderSelect)}

                        <div className="space-y-3">
                          <Label>Should be good with (optional)</Label>
                          <div className="flex flex-wrap gap-4">
                            {GOOD_WITH.map((g) => (
                              <FormField
                                key={g.name}
                                control={form.control}
                                name={g.name}
                                render={({ field }) => (
                                  <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                    <FormControl>
                                      <Checkbox
                                        checked={Boolean(field.value)}
                                        onCheckedChange={field.onChange}
                                        data-testid={`checkbox-${g.name}`}
                                      />
                                    </FormControl>
                                    <FormLabel className="font-normal cursor-pointer">{g.label}</FormLabel>
                                  </FormItem>
                                )}
                              />
                            ))}
                          </div>
                        </div>

                        <FormField
                          control={form.control}
                          name="dealbreakers"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Anything that wouldn't work for you? (optional)</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="e.g. can't have a dog that barks a lot, allergies, etc."
                                  className="resize-none"
                                  rows={3}
                                  {...field}
                                  data-testid="input-dealbreakers"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="about"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Anything else you'd like us to know? (optional)</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Tell us about your ideal dog or your family"
                                  className="resize-none"
                                  rows={4}
                                  {...field}
                                  data-testid="input-about"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </CardContent>
                    </Card>

                    <Button
                      type="submit"
                      size="lg"
                      className="w-full"
                      disabled={submitMutation.isPending}
                      data-testid="button-submit-matchmaker"
                    >
                      {submitMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Heart className="w-4 h-4 mr-2" />
                          Find my match
                        </>
                      )}
                    </Button>
                  </form>
                </Form>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

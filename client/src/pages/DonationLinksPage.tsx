import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Copy, Plus, Trash2, ExternalLink, Link2, DollarSign, AlertCircle } from "lucide-react";
import type { DonationLink } from "@shared/schema";

const createLinkSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().optional(),
  amount: z.number().min(100, "Minimum amount is $1.00"),
  isRecurring: z.boolean().default(true),
  interval: z.enum(["month", "year"]).default("month"),
  imageUrl: z.string().url("Please enter a valid URL").optional().or(z.literal("")),
});

type CreateLinkFormData = z.infer<typeof createLinkSchema>;

export default function DonationLinksPage() {
  const { tenantId } = useTenant();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  const form = useForm<CreateLinkFormData>({
    resolver: zodResolver(createLinkSchema),
    defaultValues: {
      title: "",
      description: "",
      amount: 2500,
      isRecurring: true,
      interval: "month",
      imageUrl: "",
    },
  });

  const { data, isLoading, error } = useQuery<{ donationLinks: DonationLink[] }>({
    queryKey: ["/api/donation-links", tenantId],
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateLinkFormData) => {
      const payload = {
        ...data,
        imageUrl: data.imageUrl || undefined,
      };
      return apiRequest("/api/donation-links", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/donation-links"] });
      toast({ title: "Donation link created successfully!" });
      setDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create donation link",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/donation-links/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/donation-links"] });
      toast({ title: "Donation link deactivated" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to deactivate link",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied to clipboard!" });
  };

  const onSubmit = (data: CreateLinkFormData) => {
    createMutation.mutate(data);
  };

  const activeLinks = data?.donationLinks?.filter(link => link.isActive) || [];
  const inactiveLinks = data?.donationLinks?.filter(link => !link.isActive) || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Donation Links</h1>
            <p className="text-muted-foreground">
              Create shareable payment links for Facebook and social media fundraising
            </p>
          </div>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-donation-link">
              <Plus className="h-4 w-4 mr-2" />
              Create Link
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create Donation Link</DialogTitle>
              <DialogDescription>
                Generate a Stripe payment link for your fundraising campaign
              </DialogDescription>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campaign Title</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g., Monthly Kennel Sponsor" 
                          {...field} 
                          data-testid="input-link-title"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Help support our rescue animals..." 
                          {...field} 
                          data-testid="input-link-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input 
                            type="number"
                            step="0.01"
                            min="1"
                            className="pl-9"
                            value={field.value / 100}
                            onChange={(e) => field.onChange(Math.round(parseFloat(e.target.value || "0") * 100))}
                            data-testid="input-link-amount"
                          />
                        </div>
                      </FormControl>
                      <FormDescription>Amount in dollars</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="isRecurring"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Recurring</FormLabel>
                          <FormDescription className="text-xs">
                            Monthly subscription
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-recurring"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="interval"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Interval</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={!form.watch("isRecurring")}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-interval">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="month">Monthly</SelectItem>
                            <SelectItem value="year">Yearly</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="imageUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Image URL (Optional)</FormLabel>
                      <FormControl>
                        <Input 
                          type="url"
                          placeholder="https://example.com/image.jpg" 
                          {...field} 
                          data-testid="input-image-url"
                        />
                      </FormControl>
                      <FormDescription>
                        Image for the Stripe payment page preview
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createMutation.isPending}
                    data-testid="button-submit-create-link"
                  >
                    {createMutation.isPending ? "Creating..." : "Create Link"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-destructive">Failed to load donation links. Please try again.</p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {activeLinks.length === 0 && inactiveLinks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Link2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">No donation links yet</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Create your first shareable donation link for social media fundraising
                </p>
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Link
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {activeLinks.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Active Links</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {activeLinks.map((link) => (
                      <Card key={link.id} data-testid={`card-donation-link-${link.id}`}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <CardTitle className="text-base truncate">{link.title}</CardTitle>
                              <CardDescription className="mt-1">
                                ${(link.amount / 100).toFixed(2)}
                                {link.isRecurring && ` / ${link.interval}`}
                              </CardDescription>
                            </div>
                            <Badge variant="default" className="flex-shrink-0">
                              {link.isRecurring ? "Recurring" : "One-time"}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                            <Input 
                              value={link.stripePaymentLinkUrl} 
                              readOnly 
                              className="text-xs border-0 bg-transparent h-8"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="flex-1"
                              onClick={() => copyToClipboard(link.stripePaymentLinkUrl)}
                              data-testid={`button-copy-link-${link.id}`}
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              Copy
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              asChild
                            >
                              <a 
                                href={link.stripePaymentLinkUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                data-testid={`button-open-link-${link.id}`}
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => deleteMutation.mutate(link.id)}
                              disabled={deleteMutation.isPending}
                              data-testid={`button-delete-link-${link.id}`}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {inactiveLinks.length > 0 && (
                <div className="space-y-4 mt-8">
                  <h2 className="text-lg font-semibold text-muted-foreground">Inactive Links</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {inactiveLinks.map((link) => (
                      <Card key={link.id} className="opacity-60">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <CardTitle className="text-base truncate">{link.title}</CardTitle>
                              <CardDescription className="mt-1">
                                ${(link.amount / 100).toFixed(2)}
                                {link.isRecurring && ` / ${link.interval}`}
                              </CardDescription>
                            </div>
                            <Badge variant="secondary" className="flex-shrink-0">
                              Inactive
                            </Badge>
                          </div>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
      </div>
    </DashboardLayout>
  );
}

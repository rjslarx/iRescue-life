import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Heart, Loader2, QrCode, ExternalLink, Copy, Check, DollarSign } from "lucide-react";
import { SocialShareButtons } from "@/components/SocialShareButtons";
import { CampaignCardGenerator } from "@/components/CampaignCardGenerator";
import type { Animal } from "@shared/schema";

interface MedicalFundStatus {
  hasCampaign: boolean;
  goal: number | null;
  raised: number;
  url: string | null;
  qrCodeUrl: string | null;
  campaignId: string | null;
}

const createCampaignSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  goal: z.coerce.number().positive("Goal must be a positive number").optional().nullable(),
});

type CreateCampaignData = z.infer<typeof createCampaignSchema>;

interface MedicalFundDialogProps {
  animal: Animal;
  trigger?: React.ReactNode;
}

export function MedicalFundDialog({ animal, trigger }: MedicalFundDialogProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: fundStatus, isLoading } = useQuery<MedicalFundStatus>({
    queryKey: ['/api/animals', animal.id, 'medical-fund'],
    enabled: open,
  });

  const { data: stripeStatus } = useQuery<{ enabled: boolean }>({
    queryKey: ['/api/tenant/stripe/status'],
    enabled: open,
  });

  const form = useForm<CreateCampaignData>({
    resolver: zodResolver(createCampaignSchema),
    defaultValues: {
      title: `Help ${animal.name} with medical expenses`,
      description: `${animal.name} needs your support! This ${animal.species?.toLowerCase() || 'pet'} is in need of medical care. Your donation will help cover veterinary expenses and give ${animal.name} the treatment they deserve.`,
      goal: undefined,
    },
  });

  const createCampaignMutation = useMutation({
    mutationFn: async (data: CreateCampaignData) => {
      const response = await apiRequest('POST', `/api/animals/${animal.id}/medical-fund`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals', animal.id, 'medical-fund'] });
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });
      toast({
        title: "Medical fund created",
        description: "The medical fund campaign has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create campaign",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateCampaignData) => {
    createCampaignMutation.mutate(data);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied!",
        description: "Link copied to clipboard.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Please copy the link manually.",
        variant: "destructive",
      });
    }
  };

  const progressPercentage = fundStatus?.goal && fundStatus.goal > 0
    ? Math.min((fundStatus.raised / fundStatus.goal) * 100, 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2" data-testid="button-medical-fund">
            <Heart className="h-4 w-4" />
            Medical Fund
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="dialog-title-medical-fund">
            <Heart className="h-5 w-5 text-pink-500" />
            Medical Fund for {animal.name}
          </DialogTitle>
          <DialogDescription>
            Create a fundraising campaign to help cover medical expenses for {animal.name}.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !stripeStatus?.enabled ? (
          <div className="space-y-4 py-4">
            <div className="text-center text-muted-foreground">
              <Heart className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="font-medium">Stripe is not configured</p>
              <p className="text-sm mt-2">
                To create medical fund campaigns, please configure Stripe in your organization settings.
              </p>
            </div>
          </div>
        ) : fundStatus?.hasCampaign ? (
          <div className="space-y-4 py-4">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Raised</p>
                    <p className="text-2xl font-bold">${fundStatus.raised.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Goal</p>
                    <p className="text-2xl font-bold">${fundStatus.goal?.toLocaleString() || '0'}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Progress value={progressPercentage} className="h-3" />
                  <p className="text-xs text-center text-muted-foreground">
                    {progressPercentage.toFixed(0)}% of goal reached
                  </p>
                </div>

                {fundStatus.qrCodeUrl && (
                  <div className="flex flex-col items-center gap-2 pt-4 border-t">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <QrCode className="h-4 w-4" />
                      QR Code for Kennel Cards
                    </p>
                    <img 
                      src={fundStatus.qrCodeUrl} 
                      alt="Donation QR Code" 
                      className="w-32 h-32 border rounded-lg"
                      data-testid="img-qr-code"
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      Print this on kennel cards for easy mobile donations
                    </p>
                  </div>
                )}

                {fundStatus.url && (
                  <div className="space-y-4 pt-4 border-t">
                    <div className="flex items-center gap-2">
                      <Input 
                        value={fundStatus.url} 
                        readOnly 
                        className="text-xs"
                        data-testid="input-campaign-url"
                      />
                      <Button 
                        size="icon" 
                        variant="outline"
                        onClick={() => copyToClipboard(fundStatus.url!)}
                        data-testid="button-copy-url"
                      >
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                      <Button 
                        size="icon" 
                        variant="outline" 
                        asChild
                        data-testid="button-open-campaign"
                      >
                        <a href={fundStatus.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                    
                    <SocialShareButtons
                      url={fundStatus.url}
                      title={`Help ${animal.name} with medical expenses`}
                      description={`${animal.name} needs your support for medical care. Every donation helps!`}
                      animalName={animal.name}
                      raised={fundStatus.raised}
                      goal={fundStatus.goal || undefined}
                      variant="horizontal"
                    />
                    
                    <CampaignCardGenerator
                      animal={animal}
                      campaignUrl={fundStatus.url}
                      raised={fundStatus.raised}
                      goal={fundStatus.goal}
                      qrCodeUrl={fundStatus.qrCodeUrl}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Campaign Title</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Help Max with surgery costs" 
                        data-testid="input-campaign-title"
                        {...field} 
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
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Tell donors about the animal and their medical needs..."
                        rows={4}
                        data-testid="input-campaign-description"
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      This will appear on the donation page
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="goal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fundraising Goal ($)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          type="number"
                          min={1}
                          placeholder="500"
                          className="pl-9"
                          data-testid="input-campaign-goal"
                          {...field} 
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => setOpen(false)}
                  data-testid="button-cancel-campaign"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={createCampaignMutation.isPending}
                  data-testid="button-create-campaign"
                >
                  {createCampaignMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Heart className="h-4 w-4 mr-2" />
                  Create Campaign
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

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
import { Copy, Plus, Trash2, ExternalLink, Link2, DollarSign, AlertCircle, Heart, Home, Siren, QrCode, Loader2, Download, FileText, Printer, ImagePlus, Target, Share2, Clock, Users, MessageCircle, UserPlus, CheckCircle } from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";
import { CampaignUpdatesDialog } from "@/components/CampaignUpdatesDialog";
import { Progress } from "@/components/ui/progress";
import { jsPDF } from "jspdf";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { DonationLink, CampaignContribution, CampaignUpdate } from "@shared/schema";

const createLinkSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().optional(),
  amount: z.number().min(100, "Minimum amount is $1.00"),
  isRecurring: z.boolean().default(true),
  interval: z.enum(["month", "year"]).default("month"),
  imageUrl: z.string().optional().or(z.literal("")),
});

type CreateLinkFormData = z.infer<typeof createLinkSchema>;

function ContributorFeed({ donationLinkId }: { donationLinkId: string }) {
  const { data } = useQuery<{ contributions: CampaignContribution[]; totalRaised: number; contributorCount: number }>({
    queryKey: [`/api/campaign-contributions/${donationLinkId}`],
  });

  const contributions = data?.contributions || [];

  if (contributions.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-muted-foreground">No supporters yet. Be the first to share this campaign!</p>
      </div>
    );
  }

  const timeAgo = (date: string | Date) => {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return then.toLocaleDateString();
  };

  return (
    <div className="space-y-2 max-h-48 overflow-y-auto" data-testid={`contributors-list-${donationLinkId}`}>
      {contributions.map((c) => (
        <div key={c.id} className="flex items-start gap-3 p-2 rounded-md bg-muted/50">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback className="text-xs bg-destructive/10 text-destructive">
              {(c.isAnonymous ? "A" : c.donorName.charAt(0)).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <span className="text-sm font-medium truncate">
                {c.isAnonymous ? "Anonymous" : c.donorName}
              </span>
              <span className="text-xs text-muted-foreground flex-shrink-0">{timeAgo(c.createdAt)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-destructive">${(c.amount / 100).toFixed(0)}</span>
              {c.message && (
                <span className="text-xs text-muted-foreground truncate flex-1">
                  {c.message}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DonationLinksPage() {
  const { tenantId, basePath } = useTenant();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [emergencyDialogOpen, setEmergencyDialogOpen] = useState(false);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  
  // Emergency Fund form state
  const [emergencyTitle, setEmergencyTitle] = useState("");
  const [emergencyDescription, setEmergencyDescription] = useState("");
  const [emergencyGoal, setEmergencyGoal] = useState(300000); // $3000
  const [emergencySuggested, setEmergencySuggested] = useState(2500); // $25
  const [emergencyImageUrl, setEmergencyImageUrl] = useState("");
  
  // Campaign updates dialog state
  const [updatesDialogOpen, setUpdatesDialogOpen] = useState(false);
  const [updatesCampaignId, setUpdatesCampaignId] = useState<string>("");
  const [updatesCampaignTitle, setUpdatesCampaignTitle] = useState("");

  // Event flyer state
  const [eventName, setEventName] = useState("Trivia Fundraiser");
  const [eventAmount, setEventAmount] = useState(1500); // $15 default for trivia fundraiser // $20
  const [eventRecurring, setEventRecurring] = useState(false); // Default to one-time for events
  const [generatedQrCode, setGeneratedQrCode] = useState<string | null>(null);
  const [generatedFlyerLink, setGeneratedFlyerLink] = useState<DonationLink | null>(null);

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

  // Fetch event tickets
  interface EventTicket {
    id: string;
    eventName: string;
    pricePerTicket: number;
    isRecurring: boolean;
    isActive: boolean;
    createdAt: string;
  }
  
  const { data: eventTicketsData, isLoading: eventTicketsLoading } = useQuery<{ eventTickets: EventTicket[] }>({
    queryKey: ["/api/event-tickets", tenantId],
  });

  const { data: contributionSummaries } = useQuery<{ summaries: Record<string, { totalRaised: number; contributorCount: number }> }>({
    queryKey: ["/api/campaign-contributions-summary"],
  });

  const [contributorDialogOpen, setContributorDialogOpen] = useState(false);
  const [contributorCampaignId, setContributorCampaignId] = useState<string | null>(null);
  const [contributorName, setContributorName] = useState("");
  const [contributorAmount, setContributorAmount] = useState(2500);
  const [contributorMessage, setContributorMessage] = useState("");
  const [contributorAnonymous, setContributorAnonymous] = useState(false);

  const addContributionMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/campaign-contributions", {
        donationLinkId: contributorCampaignId,
        donorName: contributorAnonymous ? "Anonymous" : contributorName,
        amount: contributorAmount,
        message: contributorMessage || undefined,
        isAnonymous: contributorAnonymous,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaign-contributions-summary"] });
      if (contributorCampaignId) {
        queryClient.invalidateQueries({ queryKey: [`/api/campaign-contributions/${contributorCampaignId}`] });
      }
      toast({ title: "Contribution recorded!" });
      setContributorDialogOpen(false);
      setContributorName("");
      setContributorAmount(2500);
      setContributorMessage("");
      setContributorAnonymous(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to record contribution", description: error.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateLinkFormData) => {
      const payload = {
        ...data,
        imageUrl: data.imageUrl || undefined,
      };
      return apiRequest("POST", "/api/donation-links", payload);
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
      return apiRequest("DELETE", `/api/donation-links/${id}`);
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

  const completeCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/donation-links/${id}/complete`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/donation-links"] });
      toast({ title: "Campaign marked as completed" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to complete campaign",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  // Virtual Kennel mutation
  const virtualKennelMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/donation-links/virtual-kennel", {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/donation-links"] });
      if (data.existing) {
        toast({ title: "Virtual Kennel tiers already exist!" });
      } else {
        toast({ title: "Virtual Kennel tiers created!", description: "3 subscription tiers are now available." });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create Virtual Kennel tiers",
        description: error.message || "Please check Stripe Connect configuration",
        variant: "destructive",
      });
    },
  });

  // Emergency Fund mutation
  const emergencyFundMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/donation-links/emergency-fund", {
        title: emergencyTitle,
        description: emergencyDescription || undefined,
        goalAmount: emergencyGoal,
        suggestedAmount: emergencySuggested,
        imageUrl: emergencyImageUrl || undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/donation-links"] });
      toast({ title: "Emergency fund campaign created!" });
      setEmergencyDialogOpen(false);
      setEmergencyTitle("");
      setEmergencyDescription("");
      setEmergencyGoal(300000);
      setEmergencySuggested(2500);
      setEmergencyImageUrl("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create emergency campaign",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  // Event Flyer mutation - creates event ticket and generates QR code
  const eventFlyerMutation = useMutation({
    mutationFn: async () => {
      // First, create the event ticket in the database
      const createResponse = await apiRequest("POST", "/api/event-tickets", {
        eventName,
        pricePerTicket: eventAmount,
        isRecurring: eventRecurring,
        description: `Entry fee for ${eventName}`,
      });
      
      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create event ticket');
      }
      
      const { eventTicket } = await createResponse.json();
      
      // Then generate the QR code for the checkout page
      const qrResponse = await apiRequest("POST", `/api/event-tickets/${eventTicket.id}/generate-qr`, {});
      
      if (!qrResponse.ok) {
        const errorData = await qrResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate QR code');
      }
      
      return qrResponse.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/event-tickets"] });
      setGeneratedQrCode(data.qrCodeDataUrl);
      setGeneratedFlyerLink({
        id: data.eventTicket.id,
        tenantId: '',
        title: data.eventTicket.eventName,
        amount: data.eventTicket.pricePerTicket,
        isRecurring: data.eventTicket.isRecurring,
        interval: 'month',
        stripePaymentLinkUrl: data.checkoutUrl,
        stripePaymentLinkId: '',
        isActive: true,
        createdAt: new Date(),
      });
      toast({ title: "Event flyer generated!", description: "Customers can now select quantity and cover fees when checking out." });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to generate event flyer",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  // Delete event ticket mutation
  const deleteEventTicketMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/event-tickets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/event-tickets"] });
      toast({ title: "Event ticket deactivated" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to deactivate event ticket",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  // Download QR code for an existing event ticket
  const [downloadingQrId, setDownloadingQrId] = useState<string | null>(null);
  
  const downloadEventQr = async (ticketId: string, eventName: string) => {
    try {
      setDownloadingQrId(ticketId);
      const response = await apiRequest("POST", `/api/event-tickets/${ticketId}/generate-qr`, {});
      if (!response.ok) throw new Error("Failed to generate QR code");
      const data = await response.json();
      
      // Download the QR code
      const link = document.createElement('a');
      link.download = `${eventName.replace(/\s+/g, '-')}-QR.png`;
      link.href = data.qrCodeDataUrl;
      link.click();
      
      toast({ title: "QR code downloaded!" });
    } catch (error: any) {
      toast({
        title: "Failed to download QR code",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setDownloadingQrId(null);
    }
  };

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied to clipboard!" });
  };

  const onSubmit = (data: CreateLinkFormData) => {
    createMutation.mutate(data);
  };

  const activeLinks = data?.donationLinks?.filter(link => link.isActive) || [];
  const inactiveLinks = data?.donationLinks?.filter(link => !link.isActive) || [];
  
  // Filter links by campaign type
  const sponsorLinks = activeLinks.filter(link => link.campaignType === "sponsor_pet");
  const kennelLinks = activeLinks.filter(link => link.campaignType === "virtual_kennel");
  const emergencyLinks = activeLinks.filter(link => link.campaignType === "emergency_fund");
  const completedEmergencyLinks = inactiveLinks.filter(link => link.campaignType === "emergency_fund");
  const eventLinks = activeLinks.filter(link => link.campaignType === "event");
  const generalLinks = activeLinks.filter(link => !link.campaignType || link.campaignType === "general");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Donation Links & Campaigns</h1>
            <p className="text-muted-foreground">
              Create shareable payment links for Facebook and social media fundraising
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button 
              variant="outline"
              onClick={() => virtualKennelMutation.mutate()}
              disabled={virtualKennelMutation.isPending || kennelLinks.length > 0}
              data-testid="button-create-virtual-kennel"
            >
              {virtualKennelMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Home className="h-4 w-4 mr-2" />
              )}
              {kennelLinks.length > 0 ? "Kennel Active" : "Virtual Kennel"}
            </Button>
            
            <Dialog open={emergencyDialogOpen} onOpenChange={setEmergencyDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="button-open-emergency-dialog">
                  <Siren className="h-4 w-4 mr-2" />
                  Emergency Fund
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] p-0 max-h-[90vh] flex flex-col">
                <div className="bg-destructive/10 dark:bg-destructive/20 border-b border-destructive/20 p-6 flex-shrink-0">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg">
                      <div className="p-2 rounded-md bg-destructive/15">
                        <Siren className="h-5 w-5 text-destructive" />
                      </div>
                      Create Emergency Vet Fund
                    </DialogTitle>
                    <DialogDescription className="text-sm">
                      Launch a high-urgency donation campaign. Emergency campaigns appear with special visual prominence to maximize donor engagement.
                    </DialogDescription>
                  </DialogHeader>
                </div>
                <div className="p-6 space-y-5 overflow-y-auto flex-1">
                  <div className="space-y-2">
                    <Label htmlFor="emergency-title">Campaign Title</Label>
                    <Input
                      id="emergency-title"
                      placeholder="e.g., Save Lucky's Leg - Emergency Surgery Needed"
                      value={emergencyTitle}
                      onChange={(e) => setEmergencyTitle(e.target.value)}
                      data-testid="input-emergency-title"
                    />
                    <p className="text-xs text-muted-foreground">Use a clear, compelling title that conveys the urgency</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emergency-description">Story / Description</Label>
                    <Textarea
                      id="emergency-description"
                      placeholder="Tell the story behind this emergency. What happened? What treatment is needed? How will donations help?"
                      value={emergencyDescription}
                      onChange={(e) => setEmergencyDescription(e.target.value)}
                      className="min-h-[100px]"
                      data-testid="input-emergency-description"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="emergency-goal" className="flex items-center gap-1.5">
                        <Target className="h-3.5 w-3.5 text-muted-foreground" />
                        Fundraising Goal
                      </Label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="emergency-goal"
                          type="number"
                          min="1"
                          step="1"
                          className="pl-9"
                          value={emergencyGoal / 100}
                          onChange={(e) => setEmergencyGoal(Math.round(parseFloat(e.target.value || "0") * 100))}
                          data-testid="input-emergency-goal"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="emergency-suggested" className="flex items-center gap-1.5">
                        <Heart className="h-3.5 w-3.5 text-muted-foreground" />
                        Suggested Donation
                      </Label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="emergency-suggested"
                          type="number"
                          min="1"
                          step="1"
                          className="pl-9"
                          value={emergencySuggested / 100}
                          onChange={(e) => setEmergencySuggested(Math.round(parseFloat(e.target.value || "0") * 100))}
                          data-testid="input-emergency-suggested"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <ImagePlus className="h-3.5 w-3.5 text-muted-foreground" />
                      Campaign Image
                    </Label>
                    <ObjectUploader
                      value={emergencyImageUrl ? [emergencyImageUrl] : []}
                      onChange={(urls) => setEmergencyImageUrl(urls[0] || "")}
                      maxFiles={1}
                      uploadEndpoint="/api/animals/photos/upload"
                      accept="image/*"
                      data-testid="input-emergency-image"
                      buttonText={emergencyImageUrl ? "Change Image" : "Upload Image"}
                      showPreview={true}
                      previewSize="lg"
                    />
                    <p className="text-xs text-muted-foreground">Add a photo of the animal to increase donor empathy and engagement</p>
                  </div>
                  {emergencyTitle && (
                    <Card className="border-destructive/30 bg-destructive/5" data-testid="emergency-preview-card">
                      <CardHeader className="pb-2">
                        <p className="text-xs font-medium text-muted-foreground">Campaign Preview</p>
                        <CardTitle className="text-base">{emergencyTitle}</CardTitle>
                        {emergencyDescription && (
                          <CardDescription className="text-sm line-clamp-2">{emergencyDescription}</CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Goal: ${(emergencyGoal / 100).toLocaleString()}</span>
                          <span className="text-muted-foreground">Suggested: ${(emergencySuggested / 100).toLocaleString()}</span>
                        </div>
                        <Progress value={0} className="h-2 bg-destructive/10" />
                        <p className="text-xs text-muted-foreground text-center">$0 raised of ${(emergencyGoal / 100).toLocaleString()} goal</p>
                      </CardContent>
                    </Card>
                  )}
                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button variant="outline" onClick={() => setEmergencyDialogOpen(false)} data-testid="button-cancel-emergency">Cancel</Button>
                    <Button 
                      onClick={() => emergencyFundMutation.mutate()}
                      disabled={emergencyFundMutation.isPending || !emergencyTitle}
                      data-testid="button-create-emergency-fund"
                    >
                      {emergencyFundMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Siren className="h-4 w-4 mr-2" />
                          Launch Emergency Campaign
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            
            <Dialog open={eventDialogOpen} onOpenChange={(open) => {
              setEventDialogOpen(open);
              if (!open) {
                setGeneratedQrCode(null);
                setGeneratedFlyerLink(null);
              }
            }}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="button-open-event-dialog">
                  <QrCode className="h-4 w-4 mr-2" />
                  Event QR Flyer
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <QrCode className="h-5 w-5" />
                    Create Event QR Code Flyer
                  </DialogTitle>
                  <DialogDescription>
                    Generate a QR code for events. Customers can select quantity and optionally cover transaction fees at checkout.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {!generatedQrCode ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="event-name">Event Name</Label>
                        <Input
                          id="event-name"
                          placeholder="e.g., Adoption Day at PetSmart"
                          value={eventName}
                          onChange={(e) => setEventName(e.target.value)}
                          data-testid="input-event-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="event-amount">Suggested Amount</Label>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="event-amount"
                            type="number"
                            min="5"
                            className="pl-9"
                            value={eventAmount / 100}
                            onChange={(e) => setEventAmount(Math.round(parseFloat(e.target.value || "0") * 100))}
                            data-testid="input-event-amount"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <Label>Monthly Recurring</Label>
                          <p className="text-xs text-muted-foreground">Donations become monthly subscriptions</p>
                        </div>
                        <Switch
                          checked={eventRecurring}
                          onCheckedChange={setEventRecurring}
                          data-testid="switch-event-recurring"
                        />
                      </div>
                      <Button 
                        className="w-full"
                        onClick={() => eventFlyerMutation.mutate()}
                        disabled={eventFlyerMutation.isPending || !eventName}
                        data-testid="button-generate-event-flyer"
                      >
                        {eventFlyerMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <QrCode className="h-4 w-4 mr-2" />
                            Generate QR Code
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-col items-center p-6 bg-card rounded-lg border" data-testid="container-qr-flyer">
                        <img 
                          src={generatedQrCode} 
                          alt="Donation QR Code" 
                          className="w-48 h-48"
                          data-testid="img-qr-code"
                        />
                        <p className="text-center mt-4 font-semibold text-lg" data-testid="text-qr-cta">Scan to Donate!</p>
                        <p className="text-center text-sm text-muted-foreground" data-testid="text-qr-amount">
                          ${(eventAmount / 100).toFixed(0)}{eventRecurring ? "/month" : " one-time"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input 
                          value={generatedFlyerLink?.stripePaymentLinkUrl || ""} 
                          readOnly 
                          className="text-xs"
                          data-testid="input-flyer-link-url"
                        />
                        <Button 
                          size="icon" 
                          variant="outline"
                          onClick={() => copyToClipboard(generatedFlyerLink?.stripePaymentLinkUrl || "")}
                          data-testid="button-copy-flyer-link"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <Button 
                            className="flex-1"
                            variant="outline"
                            onClick={() => {
                              const link = document.createElement('a');
                              link.download = `${eventName.replace(/\s+/g, '-')}-QR.png`;
                              link.href = generatedQrCode;
                              link.click();
                            }}
                            data-testid="button-download-qr"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download QR
                          </Button>
                          <Button 
                            className="flex-1"
                            variant="outline"
                            onClick={() => {
                              const pdf = new jsPDF();
                              const pageWidth = pdf.internal.pageSize.getWidth();
                              
                              // Add title
                              pdf.setFontSize(24);
                              pdf.text(eventName, pageWidth / 2, 30, { align: 'center' });
                              
                              // Add subtitle
                              pdf.setFontSize(16);
                              pdf.setTextColor(100);
                              pdf.text('Support Our Animal Rescue!', pageWidth / 2, 45, { align: 'center' });
                              
                              // Add QR code image
                              const qrSize = 80;
                              pdf.addImage(generatedQrCode, 'PNG', (pageWidth - qrSize) / 2, 60, qrSize, qrSize);
                              
                              // Add amount
                              pdf.setFontSize(20);
                              pdf.setTextColor(37, 99, 235);
                              pdf.text(
                                `$${(eventAmount / 100).toFixed(0)}${eventRecurring ? '/month' : ' one-time'}`,
                                pageWidth / 2, 155, { align: 'center' }
                              );
                              
                              // Add CTA
                              pdf.setFontSize(18);
                              pdf.setTextColor(0);
                              pdf.text('Scan to Donate!', pageWidth / 2, 170, { align: 'center' });
                              
                              // Save the PDF
                              pdf.save(`${eventName.replace(/\s+/g, '-')}-Flyer.pdf`);
                            }}
                            data-testid="button-download-pdf-flyer"
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            Download PDF
                          </Button>
                        </div>
                        <Button 
                          className="w-full"
                          onClick={() => {
                            setGeneratedQrCode(null);
                            setGeneratedFlyerLink(null);
                          }}
                          data-testid="button-create-another-flyer"
                        >
                          Create Another
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            
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
                      <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-3">
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
              {emergencyLinks.length > 0 && (activeTab === "all" || activeTab === "emergency") && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Siren className="h-5 w-5 text-destructive" />
                    <h2 className="text-lg font-semibold">Emergency Campaigns</h2>
                    <Badge variant="destructive">{emergencyLinks.length} active</Badge>
                  </div>
                  <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2">
                    {emergencyLinks.map((link) => {
                      const summary = contributionSummaries?.summaries?.[link.id];
                      const totalRaised = summary?.totalRaised || 0;
                      const contributorCount = summary?.contributorCount || 0;
                      const goalAmount = link.goalAmount || 0;
                      const progressPercent = goalAmount > 0 ? Math.min((totalRaised / goalAmount) * 100, 100) : 0;
                      return (
                        <Card 
                          key={link.id} 
                          className="border-destructive/30 overflow-hidden"
                          data-testid={`card-donation-link-${link.id}`}
                        >
                          {link.imageUrl && (
                            <div className="relative" data-testid={`image-donation-link-${link.id}`}>
                              <img
                                src={link.imageUrl}
                                alt={link.title}
                                className="w-full h-64 sm:h-72 object-cover"
                                onError={(e) => { 
                                  const container = (e.target as HTMLImageElement).parentElement;
                                  if (container) container.style.display = 'none';
                                }}
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                              <div className="absolute top-3 left-3">
                                <Badge variant="destructive">
                                  <Siren className="h-3.5 w-3.5 mr-1" />
                                  URGENT
                                </Badge>
                              </div>
                              <div className="absolute bottom-4 left-4 right-4">
                                <h3 className="text-white text-xl sm:text-2xl font-bold drop-shadow-md leading-tight">{link.title}</h3>
                              </div>
                            </div>
                          )}
                          {!link.imageUrl && (
                            <div className="bg-destructive/10 dark:bg-destructive/20 p-6">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <Badge variant="destructive" className="mb-2">
                                    <Siren className="h-3.5 w-3.5 mr-1" />
                                    URGENT
                                  </Badge>
                                  <h3 className="text-xl font-bold leading-tight">{link.title}</h3>
                                </div>
                              </div>
                            </div>
                          )}
                          <CardContent className="p-5 space-y-4">
                            {link.description && (
                              <p className="text-sm leading-relaxed" data-testid={`text-description-${link.id}`}>
                                {link.description}
                              </p>
                            )}
                            {goalAmount > 0 && (
                              <div className="space-y-2" data-testid={`progress-donation-link-${link.id}`}>
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-2xl font-bold text-destructive">${(totalRaised / 100).toLocaleString()}</span>
                                  <span className="text-sm text-muted-foreground">raised of ${(goalAmount / 100).toLocaleString()} goal</span>
                                </div>
                                <Progress value={progressPercent} className="h-3 bg-destructive/10" />
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    {contributorCount} {contributorCount === 1 ? 'supporter' : 'supporters'}
                                  </span>
                                  <span>{Math.round(progressPercent)}% funded</span>
                                </div>
                              </div>
                            )}
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button 
                                variant="default"
                                className="flex-1"
                                asChild
                              >
                                <a 
                                  href={link.stripePaymentLinkUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  data-testid={`button-donate-link-${link.id}`}
                                >
                                  <Heart className="h-4 w-4 mr-2" />
                                  Donate ${(link.amount / 100).toFixed(0)}
                                </a>
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  const shareUrl = link.campaignType === 'emergency_fund'
                                    ? `${window.location.origin}${basePath}/donate/${link.id}`
                                    : link.stripePaymentLinkUrl;
                                  const shareText = `${link.title} - Please help! Donate here: ${shareUrl}`;
                                  if (navigator.share) {
                                    navigator.share({ title: link.title, text: shareText, url: shareUrl });
                                  } else {
                                    navigator.clipboard.writeText(shareText);
                                    toast({ title: "Share text copied to clipboard!" });
                                  }
                                }}
                                data-testid={`button-share-link-${link.id}`}
                              >
                                <Share2 className="h-4 w-4 mr-1" />
                                Share
                              </Button>
                              <Button 
                                size="icon" 
                                variant="outline"
                                onClick={() => copyToClipboard(link.stripePaymentLinkUrl)}
                                data-testid={`button-copy-link-${link.id}`}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setUpdatesCampaignId(link.id);
                                  setUpdatesCampaignTitle(link.title);
                                  setUpdatesDialogOpen(true);
                                }}
                                data-testid={`button-updates-${link.id}`}
                              >
                                <MessageCircle className="h-4 w-4 mr-1" />
                                Updates
                              </Button>
                              <Button
                                variant="outline"
                                asChild
                              >
                                <a href={`${basePath}/campaigns/${link.id}`} target="_blank" rel="noopener noreferrer" data-testid={`button-view-page-${link.id}`}>
                                  <ExternalLink className="h-4 w-4 mr-1" />
                                  View Page
                                </a>
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => completeCampaignMutation.mutate(link.id)}
                                disabled={completeCampaignMutation.isPending}
                                data-testid={`button-complete-campaign-${link.id}`}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Mark Complete
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost"
                                onClick={() => deleteMutation.mutate(link.id)}
                                disabled={deleteMutation.isPending}
                                data-testid={`button-delete-link-${link.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                            <div className="border-t pt-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                                  <Users className="h-4 w-4 text-muted-foreground" />
                                  Recent Supporters
                                </h4>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setContributorCampaignId(link.id);
                                    setContributorDialogOpen(true);
                                  }}
                                  data-testid={`button-add-contributor-${link.id}`}
                                >
                                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                                  Add
                                </Button>
                              </div>
                              <ContributorFeed 
                                donationLinkId={link.id}
                              />
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}
              {completedEmergencyLinks.length > 0 && (activeTab === "all" || activeTab === "emergency") && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold text-muted-foreground">Completed Campaigns</h2>
                    <Badge variant="secondary">{completedEmergencyLinks.length}</Badge>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
                    {completedEmergencyLinks.map((link) => {
                      const summary = contributionSummaries?.summaries?.[link.id];
                      const totalRaised = summary?.totalRaised || 0;
                      const contributorCount = summary?.contributorCount || 0;
                      const goalAmount = link.goalAmount || 0;

                      return (
                        <Card key={link.id} className="opacity-70" data-testid={`card-completed-campaign-${link.id}`}>
                          {link.imageUrl && (
                            <div className="relative h-32 w-full overflow-hidden rounded-t-md grayscale">
                              <img src={link.imageUrl} alt={link.title} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                              <div className="absolute top-2 right-2">
                                <Badge variant="secondary" className="text-xs">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Completed
                                </Badge>
                              </div>
                              <div className="absolute bottom-3 left-3 right-3">
                                <h3 className="text-base font-bold text-white drop-shadow-lg">{link.title}</h3>
                              </div>
                            </div>
                          )}
                          {!link.imageUrl && (
                            <CardContent className="pt-4 pb-2">
                              <div className="flex items-center justify-between gap-2">
                                <h3 className="text-base font-bold">{link.title}</h3>
                                <Badge variant="secondary" className="text-xs">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Completed
                                </Badge>
                              </div>
                            </CardContent>
                          )}
                          <CardContent className={link.imageUrl ? "p-4" : "pt-0 p-4"}>
                            <div className="flex items-center justify-between gap-2 text-sm">
                              <span className="font-semibold">${(totalRaised / 100).toLocaleString()} raised</span>
                              {goalAmount > 0 && <span className="text-muted-foreground">of ${(goalAmount / 100).toLocaleString()} goal</span>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{contributorCount} {contributorCount === 1 ? 'supporter' : 'supporters'}</p>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}
              {activeLinks.length > 0 && (
                <div className="space-y-4">
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList>
                      <TabsTrigger value="all" data-testid="tab-all">All ({activeLinks.length})</TabsTrigger>
                      {generalLinks.length > 0 && (
                        <TabsTrigger value="general" data-testid="tab-general">General ({generalLinks.length})</TabsTrigger>
                      )}
                      {sponsorLinks.length > 0 && (
                        <TabsTrigger value="sponsor" data-testid="tab-sponsor">Sponsors ({sponsorLinks.length})</TabsTrigger>
                      )}
                      {kennelLinks.length > 0 && (
                        <TabsTrigger value="kennel" data-testid="tab-kennel">Virtual Kennel ({kennelLinks.length})</TabsTrigger>
                      )}
                      {emergencyLinks.length > 0 && (
                        <TabsTrigger value="emergency" data-testid="tab-emergency">Emergency ({emergencyLinks.length})</TabsTrigger>
                      )}
                      {eventLinks.length > 0 && (
                        <TabsTrigger value="event" data-testid="tab-event">Events ({eventLinks.length})</TabsTrigger>
                      )}
                    </TabsList>
                  </Tabs>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {(activeTab === "all" ? activeLinks.filter(l => l.campaignType !== "emergency_fund") :
                      activeTab === "general" ? generalLinks :
                      activeTab === "sponsor" ? sponsorLinks :
                      activeTab === "kennel" ? kennelLinks :
                      activeTab === "emergency" ? [] :
                      activeTab === "event" ? eventLinks :
                      activeLinks.filter(l => l.campaignType !== "emergency_fund")
                    ).map((link) => (
                      <Card 
                        key={link.id} 
                        data-testid={`card-donation-link-${link.id}`}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <CardTitle className="text-base truncate">{link.title}</CardTitle>
                              <CardDescription className="mt-1 flex items-center gap-2 flex-wrap">
                                ${(link.amount / 100).toFixed(2)}
                                {link.isRecurring && ` / ${link.interval}`}
                              </CardDescription>
                            </div>
                            <div className="flex flex-col gap-1 items-end flex-shrink-0">
                              <Badge variant="default">
                                {link.isRecurring ? "Recurring" : "One-time"}
                              </Badge>
                              {link.campaignType && link.campaignType !== "general" && (
                                <Badge variant="secondary" className="text-xs">
                                  {link.campaignType === "sponsor_pet" ? "Sponsor" :
                                   link.campaignType === "virtual_kennel" ? link.tierName || "Kennel" :
                                   link.campaignType === "event" ? "Event" : link.campaignType}
                                </Badge>
                              )}
                            </div>
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

          {/* Event Tickets Section - rendered independently of donation links */}
          {(eventTicketsData?.eventTickets?.length ?? 0) > 0 && (
            <div className="space-y-4 mt-8">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <QrCode className="h-5 w-5" />
                  Event QR Codes
                </h2>
                <Badge variant="secondary">{eventTicketsData?.eventTickets?.length} events</Badge>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {eventTicketsData?.eventTickets?.map((ticket) => (
                  <Card key={ticket.id} data-testid={`card-event-ticket-${ticket.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="text-base truncate">{ticket.eventName}</CardTitle>
                          <CardDescription className="mt-1">
                            ${(ticket.pricePerTicket / 100).toFixed(2)}
                            {ticket.isRecurring && " / month"}
                          </CardDescription>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          <QrCode className="h-3 w-3 mr-1" />
                          Event
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="text-xs text-muted-foreground mb-3">
                        Created: {new Date(ticket.createdAt).toLocaleDateString()}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => downloadEventQr(ticket.id, ticket.eventName)}
                          disabled={downloadingQrId === ticket.id}
                          data-testid={`button-download-qr-${ticket.id}`}
                        >
                          {downloadingQrId === ticket.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-1" />
                              QR
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteEventTicketMutation.mutate(ticket.id)}
                          disabled={deleteEventTicketMutation.isPending}
                          data-testid={`button-delete-event-ticket-${ticket.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      </div>

      <Dialog open={contributorDialogOpen} onOpenChange={setContributorDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Record Contribution
            </DialogTitle>
            <DialogDescription>
              Manually record a donation or contribution to this campaign.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contributor-name">Donor Name</Label>
              <Input
                id="contributor-name"
                placeholder="e.g., Jane Smith"
                value={contributorName}
                onChange={(e) => setContributorName(e.target.value)}
                disabled={contributorAnonymous}
                data-testid="input-contributor-name"
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div className="space-y-0.5">
                <Label>Anonymous</Label>
                <p className="text-xs text-muted-foreground">Hide donor name from public view</p>
              </div>
              <Switch
                checked={contributorAnonymous}
                onCheckedChange={setContributorAnonymous}
                data-testid="switch-contributor-anonymous"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contributor-amount">Amount</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="contributor-amount"
                  type="number"
                  min="1"
                  step="1"
                  className="pl-9"
                  value={contributorAmount / 100}
                  onChange={(e) => setContributorAmount(Math.round(parseFloat(e.target.value || "0") * 100))}
                  data-testid="input-contributor-amount"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contributor-message">Message (optional)</Label>
              <Textarea
                id="contributor-message"
                placeholder="A short message from the donor..."
                value={contributorMessage}
                onChange={(e) => setContributorMessage(e.target.value)}
                data-testid="input-contributor-message"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setContributorDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => addContributionMutation.mutate()}
                disabled={addContributionMutation.isPending || (!contributorAnonymous && !contributorName)}
                data-testid="button-submit-contribution"
              >
                {addContributionMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Heart className="h-4 w-4 mr-2" />
                )}
                Record Contribution
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CampaignUpdatesDialog
        open={updatesDialogOpen}
        onOpenChange={setUpdatesDialogOpen}
        campaignId={updatesCampaignId}
        campaignTitle={updatesCampaignTitle}
      />
    </DashboardLayout>
  );
}


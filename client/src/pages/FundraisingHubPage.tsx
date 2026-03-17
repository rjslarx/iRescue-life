import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import QRCode from "qrcode";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ObjectUploader } from "@/components/ObjectUploader";
import {
  Copy,
  Download,
  ExternalLink,
  Search,
  ChevronRight,
  ChevronDown,
  Heart,
  Target,
  Megaphone,
  Link2,
  QrCode,
  AlertCircle,
  ChevronsUpDown,
  Check,
  Users,
  DollarSign,
  TrendingUp,
  Eye,
  Power,
  PowerOff,
  Share2,
  Plus,
  Trophy,
  ArrowLeft,
  Calendar,
  Trash2,
  Vote,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import DashboardLayout from "@/components/DashboardLayout";
import { getAvatarIcon, getAvatarColor, AVATAR_TYPES } from "@/lib/participant-avatars";
import type { VotingContest, VotingContestEntrant } from "@shared/schema";

export default function FundraisingHubPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: tenantData, isLoading: tenantLoading } = useQuery<{ tenant: any }>({
    queryKey: ["/api/tenant"],
  });
  const tenant = tenantData?.tenant;

  const donationUrl = (() => {
    if (tenant?.stripeLink) return tenant.stripeLink;
    if (tenant?.stripeEnabled) {
      const base = window.location.origin;
      const usePrefix = tenant?.subdomain && !isCustomDomain();
      const path = usePrefix ? `/${tenant.subdomain}/donate` : "/donate";
      return `${base}${path}`;
    }
    return "";
  })();

  return (
    <DashboardLayout title="Donation & Fundraising Hub" description="Your centralized toolkit for managing donations, running campaigns, and maximizing fundraising impact.">
      <div className="space-y-6" data-testid="page-fundraising-hub">

      <Tabs defaultValue="toolkit" className="space-y-4">
        <TabsList data-testid="tabs-fundraising">
          <TabsTrigger value="toolkit" data-testid="tab-toolkit">Toolkit</TabsTrigger>
          <TabsTrigger value="campaigns" data-testid="tab-campaign-manager">Campaigns</TabsTrigger>
          <TabsTrigger value="community" data-testid="tab-community-fundraisers">Community</TabsTrigger>
          <TabsTrigger value="voting-contests" data-testid="tab-voting-contests">Voting</TabsTrigger>
        </TabsList>

        <TabsContent value="toolkit">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            <GeneralDonationsCard donationUrl={donationUrl} tenantName={tenant?.name} isLoading={tenantLoading} />
            <AnimalCampaignsCard onNavigate={setLocation} />
            <SocialMediaPlaybookCard />
          </div>
        </TabsContent>

        <TabsContent value="campaigns">
          <CampaignManagerTab tenantSubdomain={tenant?.subdomain} />
        </TabsContent>

        <TabsContent value="community">
          <CommunityFundraisersTab tenantSubdomain={tenant?.subdomain} />
        </TabsContent>

        <TabsContent value="voting-contests">
          <VotingContestsTab tenantSubdomain={tenant?.subdomain} />
        </TabsContent>
      </Tabs>
      </div>
    </DashboardLayout>
  );
}

function isCustomDomain(): boolean {
  const hostname = window.location.hostname;
  return !(
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.includes('replit.dev') ||
    hostname.endsWith('.replit.app') ||
    hostname.endsWith('irescue.life')
  );
}

function CommunityFundraisersTab({ tenantSubdomain }: { tenantSubdomain?: string }) {
  const { toast } = useToast();
  const [donationsDialogCampaignId, setDonationsDialogCampaignId] = useState<string | null>(null);
  const [donationsDialogTitle, setDonationsDialogTitle] = useState("");

  const { data, isLoading } = useQuery<{ campaigns: any[] }>({
    queryKey: ["/api/peer-campaigns"],
  });

  const campaigns = data?.campaigns || [];

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/peer-campaigns/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/peer-campaigns"] });
      toast({ title: "Campaign updated" });
    },
    onError: () => {
      toast({ title: "Failed to update campaign", variant: "destructive" });
    },
  });

  const totalCampaigns = campaigns.length;
  const activeCampaigns = campaigns.filter((c: any) => c.isActive).length;
  const totalRaised = campaigns.reduce((sum: number, c: any) => sum + (c.donationTotal || c.amountRaised || 0), 0);

  const handleCopyCreationLink = async () => {
    const base = window.location.origin;
    const usePrefix = tenantSubdomain && !isCustomDomain();
    const path = usePrefix ? `/${tenantSubdomain}/fundraise` : "/fundraise";
    try {
      await navigator.clipboard.writeText(`${base}${path}`);
      toast({ title: "Link copied", description: "Campaign creation link copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const handleViewPublicPage = (slug: string) => {
    const base = window.location.origin;
    const usePrefix = tenantSubdomain && !isCustomDomain();
    const path = usePrefix ? `/${tenantSubdomain}/fundraise/${slug}` : `/fundraise/${slug}`;
    window.open(`${base}${path}`, "_blank");
  };

  return (
    <div className="space-y-4" data-testid="section-community-fundraisers">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card data-testid="stat-total-campaigns">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-blue-500/10 p-2">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Campaigns</p>
                <p className="text-2xl font-bold" data-testid="text-total-campaigns">{totalCampaigns}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-total-raised">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-green-500/10 p-2">
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Raised (P2P)</p>
                <p className="text-2xl font-bold" data-testid="text-total-raised">
                  ${(totalRaised / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-active-campaigns">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-amber-500/10 p-2">
                <TrendingUp className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Campaigns</p>
                <p className="text-2xl font-bold" data-testid="text-active-campaigns">{activeCampaigns}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-rose-500" />
              <CardTitle className="text-lg">Community Fundraisers</CardTitle>
            </div>
            <Button variant="outline" onClick={handleCopyCreationLink} data-testid="button-copy-creation-link">
              <Share2 className="mr-2 h-4 w-4" />
              Copy Creation Link
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Peer-to-peer campaigns created by supporters. Share the creation link so anyone can start a fundraiser for your rescue.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="rounded-full bg-muted p-3">
                <Users className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium" data-testid="text-no-campaigns">No community fundraisers yet</p>
                <p className="text-xs text-muted-foreground">
                  Share the creation link with supporters so they can start birthday fundraisers and more.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table data-testid="table-peer-campaigns">
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Creator</TableHead>
                    <TableHead className="text-right">Goal</TableHead>
                    <TableHead className="text-right">Raised</TableHead>
                    <TableHead className="text-right">Progress</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((campaign: any) => {
                    const raised = campaign.donationTotal || campaign.amountRaised || 0;
                    const goal = campaign.goalAmount || 1;
                    const progress = Math.min(100, Math.round((raised / goal) * 100));
                    const isEnded = campaign.endsAt && new Date(campaign.endsAt) < new Date();

                    return (
                      <TableRow key={campaign.id} data-testid={`row-campaign-${campaign.id}`}>
                        <TableCell>
                          <div className="font-medium" data-testid={`text-campaign-title-${campaign.id}`}>
                            {campaign.campaignTitle}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(campaign.createdAt).toLocaleDateString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm" data-testid={`text-creator-${campaign.id}`}>
                            {campaign.creatorName}
                          </div>
                          <div className="text-xs text-muted-foreground">{campaign.creatorEmail}</div>
                        </TableCell>
                        <TableCell className="text-right font-medium" data-testid={`text-goal-${campaign.id}`}>
                          ${(goal / 100).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-medium" data-testid={`text-raised-${campaign.id}`}>
                          ${(raised / 100).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-green-500 transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-8 text-right" data-testid={`text-progress-${campaign.id}`}>
                              {progress}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {isEnded ? (
                            <Badge variant="secondary" data-testid={`badge-status-${campaign.id}`}>Ended</Badge>
                          ) : campaign.isActive ? (
                            <Badge variant="default" className="bg-green-600" data-testid={`badge-status-${campaign.id}`}>Active</Badge>
                          ) : (
                            <Badge variant="secondary" data-testid={`badge-status-${campaign.id}`}>Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleViewPublicPage(campaign.slug)}
                              title="View public page"
                              data-testid={`button-view-campaign-${campaign.id}`}
                            >
                              <Eye />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setDonationsDialogCampaignId(campaign.id);
                                setDonationsDialogTitle(campaign.campaignTitle);
                              }}
                              title="View donations"
                              data-testid={`button-donations-${campaign.id}`}
                            >
                              <DollarSign />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => toggleMutation.mutate({ id: campaign.id, isActive: !campaign.isActive })}
                              title={campaign.isActive ? "Deactivate" : "Activate"}
                              data-testid={`button-toggle-${campaign.id}`}
                            >
                              {campaign.isActive ? <PowerOff /> : <Power />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {donationsDialogCampaignId && (
        <DonationsDialog
          campaignId={donationsDialogCampaignId}
          campaignTitle={donationsDialogTitle}
          onClose={() => setDonationsDialogCampaignId(null)}
        />
      )}
    </div>
  );
}

function DonationsDialog({ campaignId, campaignTitle, onClose }: { campaignId: string; campaignTitle: string; onClose: () => void }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const { data, isLoading } = useQuery<{ donations: any[] }>({
    queryKey: ["/api/peer-campaigns", campaignId, "donations", statusFilter],
    queryFn: async () => {
      const url = `/api/peer-campaigns/${campaignId}/donations${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch donations");
      return res.json();
    },
    enabled: !!campaignId,
  });

  const donations = data?.donations || [];

  const statusBadgeVariant = (status: string) => {
    if (status === "paid") return "default";
    if (status === "pending") return "secondary";
    return "outline";
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg" data-testid="dialog-campaign-donations">
        <DialogHeader>
          <DialogTitle data-testid="text-donations-dialog-title">Donations & Pledges — {campaignTitle}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 flex-wrap">
          <Label className="text-sm text-muted-foreground">Filter:</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-donation-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isLoading ? (
          <div className="space-y-2 py-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        ) : donations.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-donations">
            No donations yet for this campaign.
          </p>
        ) : (
          <div className="max-h-[400px] overflow-y-auto space-y-3">
            {donations.map((d: any, i: number) => (
              <div key={d.id || i} className="flex items-start justify-between gap-3 py-2 border-b last:border-0" data-testid={`donation-row-${i}`}>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium" data-testid={`text-donor-name-${i}`}>
                      {d.isAnonymous ? "Anonymous" : d.donorName}
                    </p>
                    <Badge variant={statusBadgeVariant(d.paymentStatus)} data-testid={`badge-status-${i}`}>
                      {d.paymentStatus}
                    </Badge>
                    {d.pledgeType === "per_unit" && (
                      <Badge variant="outline" data-testid={`badge-pledge-${i}`}>
                        Pledge
                      </Badge>
                    )}
                  </div>
                  {!d.isAnonymous && d.donorEmail && (
                    <p className="text-xs text-muted-foreground">{d.donorEmail}</p>
                  )}
                  {d.pledgeType === "per_unit" && d.pledgePerUnit && (
                    <p className="text-xs text-muted-foreground">${(d.pledgePerUnit / 100).toFixed(2)}/unit pledge</p>
                  )}
                  {d.message && (
                    <p className="text-xs text-muted-foreground mt-1 italic">"{d.message}"</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold" data-testid={`text-donation-amount-${i}`}>
                    ${(d.amount / 100).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function GeneralDonationsCard({ donationUrl, tenantName, isLoading }: { donationUrl: string; tenantName?: string; isLoading: boolean }) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrGenerated, setQrGenerated] = useState(false);

  useEffect(() => {
    if (donationUrl && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, donationUrl, {
        width: 180,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      }).then(() => setQrGenerated(true)).catch(() => setQrGenerated(false));
    }
  }, [donationUrl]);

  const handleCopyLink = async () => {
    if (!donationUrl) return;
    try {
      await navigator.clipboard.writeText(donationUrl);
      toast({ title: "Link copied", description: "Donation link copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Could not copy to clipboard.", variant: "destructive" });
    }
  };

  const handleDownloadQR = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `${tenantName || "donation"}-qr-code.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  return (
    <Card data-testid="card-general-donations">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-rose-500" />
          <CardTitle className="text-lg">General Rescue Donations</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          Your master links for general operating support.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="h-[180px] w-[180px] rounded-md bg-muted animate-pulse" />
            <div className="h-9 w-48 rounded-md bg-muted animate-pulse" />
          </div>
        ) : donationUrl ? (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Donation URL</label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={donationUrl}
                  className="text-sm font-mono"
                  data-testid="input-donation-url"
                />
                <Button size="icon" variant="outline" onClick={handleCopyLink} data-testid="button-copy-link">
                  <Copy />
                </Button>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3 py-2">
              <canvas ref={canvasRef} className="rounded-md border" data-testid="qr-code-canvas" />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleCopyLink}
                  data-testid="button-copy-link-secondary"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Link
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDownloadQR}
                  disabled={!qrGenerated}
                  data-testid="button-download-qr"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download QR
                </Button>
              </div>
            </div>

            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
              onClick={() => window.open(donationUrl, "_blank")}
              data-testid="button-open-donation-page"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Preview donation page
            </Button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="rounded-full bg-muted p-3">
              <AlertCircle className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium" data-testid="text-no-stripe-link">No donation link configured</p>
              <p className="text-xs text-muted-foreground">
                Set up your Stripe donation link in Settings &gt; Integrations to enable general donations.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AnimalCampaignsCard({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const { data: animalsData, isLoading } = useQuery<{ animals: any[] }>({
    queryKey: ["/api/animals"],
  });

  const animals = (animalsData?.animals || []).filter(
    (a: any) => a.status === "available" || a.status === "in_shelter" || a.status === "foster"
  );

  const filteredAnimals = searchValue
    ? animals.filter((a: any) =>
        a.name?.toLowerCase().includes(searchValue.toLowerCase()) ||
        a.localShelterId?.toLowerCase().includes(searchValue.toLowerCase())
      )
    : animals;

  const handleSelectAnimal = (animalId: string) => {
    setOpen(false);
    setSearchValue("");
    onNavigate(`/dashboard/animals?selected=${animalId}`);
  };

  return (
    <Card data-testid="card-animal-campaigns">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-blue-500" />
          <CardTitle className="text-lg">Targeted Animal Fundraising</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          Generate custom, trackable donation links and printable cage cards for specific animals.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Search for an animal</label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between font-normal"
                data-testid="button-animal-search"
              >
                <span className="text-muted-foreground">Select an animal...</span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
              <Command>
                <CommandInput
                  placeholder="Search by name or ID..."
                  value={searchValue}
                  onValueChange={setSearchValue}
                  data-testid="input-animal-search"
                />
                <CommandList>
                  <CommandEmpty>
                    {isLoading ? "Loading animals..." : "No animals found."}
                  </CommandEmpty>
                  <CommandGroup>
                    {filteredAnimals.slice(0, 50).map((animal: any) => (
                      <CommandItem
                        key={animal.id}
                        value={`${animal.name} ${animal.localShelterId || ""}`}
                        onSelect={() => handleSelectAnimal(animal.id)}
                        data-testid={`item-animal-${animal.id}`}
                      >
                        <div className="flex items-center gap-2 w-full">
                          <span className="font-medium">{animal.name}</span>
                          {animal.localShelterId && (
                            <Badge variant="secondary" className="text-xs">
                              {animal.localShelterId}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs ml-auto capitalize">
                            {animal.species || "unknown"}
                          </Badge>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="rounded-md bg-muted/50 p-3 space-y-2">
          <p className="text-sm font-medium">How it works</p>
          <ul className="text-xs text-muted-foreground space-y-1.5">
            <li className="flex items-start gap-2">
              <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Search and select an animal above to open their profile
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Set up per-animal donation links and fundraising keywords
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Generate printable cage cards with QR codes for social media
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function VotingContestsTab({ tenantSubdomain }: { tenantSubdomain?: string }) {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [managingContestId, setManagingContestId] = useState<string | null>(null);
  const [addEntrantDialogOpen, setAddEntrantDialogOpen] = useState(false);
  const [entrantName, setEntrantName] = useState("");
  const [entrantPhotoUrls, setEntrantPhotoUrls] = useState<string[]>([]);

  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [newImageUrl, setNewImageUrl] = useState("");

  const { data: contestsData, isLoading } = useQuery<(VotingContest & { entrantCount?: number; totalVotesAll?: number })[]>({
    queryKey: ["/api/voting-contests"],
  });
  const contests = contestsData || [];

  const { data: managedContestData } = useQuery<VotingContest & { entrants: VotingContestEntrant[] }>({
    queryKey: ["/api/voting-contests", managingContestId],
    enabled: !!managingContestId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; description: string; startDate: string; endDate: string; imageUrl?: string }) => {
      const res = await apiRequest("POST", "/api/voting-contests", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voting-contests"] });
      toast({ title: "Contest created" });
      setCreateDialogOpen(false);
      setNewTitle("");
      setNewDescription("");
      setNewStartDate("");
      setNewEndDate("");
      setNewImageUrl("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create contest", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/voting-contests/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voting-contests"] });
      toast({ title: "Contest deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete contest", variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/voting-contests/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voting-contests"] });
      toast({ title: "Contest updated" });
    },
    onError: () => {
      toast({ title: "Failed to update contest", variant: "destructive" });
    },
  });

  const addEntrantMutation = useMutation({
    mutationFn: async (data: { name: string; photoUrl?: string }) => {
      const res = await apiRequest("POST", `/api/voting-contests/${managingContestId}/entrants`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voting-contests", managingContestId] });
      queryClient.invalidateQueries({ queryKey: ["/api/voting-contests"] });
      toast({ title: "Entrant added" });
      setAddEntrantDialogOpen(false);
      setEntrantName("");
      setEntrantPhotoUrls([]);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add entrant", description: err.message, variant: "destructive" });
    },
  });

  const removeEntrantMutation = useMutation({
    mutationFn: async (entrantId: string) => {
      await apiRequest("DELETE", `/api/voting-contest-entrants/${entrantId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voting-contests", managingContestId] });
      queryClient.invalidateQueries({ queryKey: ["/api/voting-contests"] });
      toast({ title: "Entrant removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove entrant", variant: "destructive" });
    },
  });

  const handleCopyShareLink = async (slug: string) => {
    const base = window.location.origin;
    const usePrefix = tenantSubdomain && !isCustomDomain();
    const path = usePrefix ? `/${tenantSubdomain}/contest/${slug}` : `/contest/${slug}`;
    try {
      await navigator.clipboard.writeText(`${base}${path}`);
      toast({ title: "Link copied", description: "Public contest link copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const getContestStatus = (contest: VotingContest) => {
    const now = new Date();
    if (!contest.isActive) return "inactive";
    if (contest.endDate && new Date(contest.endDate) < now) return "ended";
    if (contest.startDate && new Date(contest.startDate) > now) return "scheduled";
    return "active";
  };

  const handleCreateSubmit = () => {
    if (!newTitle.trim()) return;
    createMutation.mutate({
      title: newTitle.trim(),
      description: newDescription.trim(),
      startDate: newStartDate,
      endDate: newEndDate,
      imageUrl: newImageUrl || undefined,
    });
  };

  if (managingContestId && managedContestData) {
    const contest = managedContestData;
    const entrants = managedContestData.entrants || [];

    return (
      <div className="space-y-4" data-testid="section-manage-contest">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" onClick={() => setManagingContestId(null)} data-testid="button-back-to-contests">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h2 className="text-lg font-semibold" data-testid="text-manage-contest-title">{contest.title}</h2>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm text-muted-foreground">{entrants.length} entrant{entrants.length !== 1 ? "s" : ""}</p>
          <Button onClick={() => setAddEntrantDialogOpen(true)} data-testid="button-add-entrant">
            <Plus className="mr-2 h-4 w-4" />
            Add Entrant
          </Button>
        </div>

        {entrants.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="rounded-full bg-muted p-3">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium" data-testid="text-no-entrants">No entrants yet</p>
                <p className="text-xs text-muted-foreground">Add entrants to this contest so supporters can vote for them.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {entrants
              .sort((a, b) => (b.totalVotes ?? 0) - (a.totalVotes ?? 0))
              .map((entrant, idx) => (
              <Card key={entrant.id} data-testid={`card-entrant-${entrant.id}`}>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-14 w-14 rounded-md">
                      {entrant.photoUrl ? (
                        <AvatarImage src={entrant.photoUrl} alt={entrant.name} />
                      ) : null}
                      <AvatarFallback className="rounded-md">{entrant.name.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium truncate" data-testid={`text-entrant-name-${entrant.id}`}>{entrant.name}</p>
                        {idx === 0 && entrants.length > 1 && (
                          <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-2xl font-bold" data-testid={`text-entrant-votes-${entrant.id}`}>
                        {(entrant.totalVotes ?? 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">votes</p>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="pt-0 justify-end">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeEntrantMutation.mutate(entrant.id)}
                    disabled={removeEntrantMutation.isPending}
                    data-testid={`button-remove-entrant-${entrant.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={addEntrantDialogOpen} onOpenChange={setAddEntrantDialogOpen}>
          <DialogContent data-testid="dialog-add-entrant">
            <DialogHeader>
              <DialogTitle>Add Entrant</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={entrantName}
                  onChange={(e) => setEntrantName(e.target.value)}
                  placeholder="e.g., Luna the Labrador"
                  data-testid="input-entrant-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Photo</Label>
                <ObjectUploader
                  value={entrantPhotoUrls}
                  onChange={setEntrantPhotoUrls}
                  maxFiles={1}
                  data-testid="uploader-entrant-photo"
                  buttonText="Upload Photo"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddEntrantDialogOpen(false)} data-testid="button-cancel-add-entrant">
                Cancel
              </Button>
              <Button
                onClick={() => addEntrantMutation.mutate({ name: entrantName, photoUrl: entrantPhotoUrls[0] || undefined })}
                disabled={!entrantName.trim() || addEntrantMutation.isPending}
                data-testid="button-submit-add-entrant"
              >
                {addEntrantMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Add Entrant
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="section-voting-contests">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-semibold">Voting Contests</h2>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-contest">
          <Plus className="mr-2 h-4 w-4" />
          Create Contest
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Run gamified fundraising campaigns where $1 = 1 Vote. Supporters vote for their favorite entrant by donating.
      </p>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : contests.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="rounded-full bg-muted p-3">
                <Trophy className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium" data-testid="text-no-contests">No voting contests yet</p>
              <p className="text-xs text-muted-foreground">Create your first contest to start a fun, gamified fundraiser.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {contests.map((contest) => {
            const status = getContestStatus(contest);
            const statusBadge = status === "active" ? (
              <Badge variant="default" className="bg-green-600" data-testid={`badge-contest-status-${contest.id}`}>Active</Badge>
            ) : status === "ended" ? (
              <Badge variant="secondary" data-testid={`badge-contest-status-${contest.id}`}>Ended</Badge>
            ) : status === "scheduled" ? (
              <Badge variant="outline" data-testid={`badge-contest-status-${contest.id}`}>Scheduled</Badge>
            ) : (
              <Badge variant="secondary" data-testid={`badge-contest-status-${contest.id}`}>Inactive</Badge>
            );

            return (
              <Card key={contest.id} data-testid={`card-contest-${contest.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate" data-testid={`text-contest-title-${contest.id}`}>{contest.title}</CardTitle>
                      {contest.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{contest.description}</p>
                      )}
                    </div>
                    {statusBadge}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                    {(contest.startDate || contest.endDate) && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>
                          {contest.startDate ? new Date(contest.startDate).toLocaleDateString() : "—"}
                          {" — "}
                          {contest.endDate ? new Date(contest.endDate).toLocaleDateString() : "—"}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      <span data-testid={`text-entrant-count-${contest.id}`}>{(contest as any).entrantCount ?? 0} entrants</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex items-center justify-end gap-1 flex-wrap">
                  <Button
                    variant="outline"
                   
                    onClick={() => handleCopyShareLink(contest.slug)}
                    data-testid={`button-share-contest-${contest.id}`}
                  >
                    <Share2 className="mr-2 h-3.5 w-3.5" />
                    Share Link
                  </Button>
                  <Button
                    variant="outline"
                   
                    onClick={() => setManagingContestId(contest.id)}
                    data-testid={`button-manage-contest-${contest.id}`}
                  >
                    Manage
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => toggleMutation.mutate({ id: contest.id, isActive: !contest.isActive })}
                    data-testid={`button-toggle-contest-${contest.id}`}
                  >
                    {contest.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm("Delete this contest? This cannot be undone.")) {
                        deleteMutation.mutate(contest.id);
                      }
                    }}
                    data-testid={`button-delete-contest-${contest.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent data-testid="dialog-create-contest">
          <DialogHeader>
            <DialogTitle>Create Voting Contest</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g., Cutest Puppy Contest 2025"
                data-testid="input-contest-title"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Describe what this contest is about..."
                className="resize-none"
                data-testid="input-contest-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                  data-testid="input-contest-start-date"
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={newEndDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  data-testid="input-contest-end-date"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Image URL (optional)</Label>
              <Input
                value={newImageUrl}
                onChange={(e) => setNewImageUrl(e.target.value)}
                placeholder="https://..."
                data-testid="input-contest-image-url"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} data-testid="button-cancel-create-contest">
              Cancel
            </Button>
            <Button
              onClick={handleCreateSubmit}
              disabled={!newTitle.trim() || createMutation.isPending}
              data-testid="button-submit-create-contest"
            >
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Contest
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SocialMediaPlaybookCard() {
  const [linkInCommentsOpen, setLinkInCommentsOpen] = useState(false);
  const [keywordOpen, setKeywordOpen] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);

  return (
    <Card data-testid="card-social-media-playbook">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-amber-500" />
          <CardTitle className="text-lg">Maximizing Social Media</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          Proven strategies to boost engagement and drive donations from social platforms.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        <Collapsible open={linkInCommentsOpen} onOpenChange={setLinkInCommentsOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between font-medium"
              data-testid="button-toggle-link-in-comments"
            >
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Link in Comments Strategy
              </div>
              {linkInCommentsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="rounded-md bg-muted/50 p-3 mt-1 space-y-2 text-sm text-muted-foreground" data-testid="content-link-in-comments">
              <p className="font-medium text-foreground">Why put links in comments?</p>
              <p>
                Facebook's algorithm penalizes posts that contain external links by reducing their organic reach. 
                Posts with links are shown to fewer followers in their feed.
              </p>
              <p className="font-medium text-foreground mt-3">The strategy:</p>
              <ol className="list-decimal list-inside space-y-1.5 ml-1">
                <li>Create your post with a compelling photo and story — no link in the post itself</li>
                <li>Include a call-to-action like "Donation link in the comments below"</li>
                <li>Immediately comment on your own post with the donation link</li>
                <li>Pin that comment so it stays at the top</li>
              </ol>
              <p className="text-xs mt-2 italic">
                This simple change can increase your post reach by 2-5x compared to including the link directly in the post.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible open={keywordOpen} onOpenChange={setKeywordOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between font-medium"
              data-testid="button-toggle-keyword-strategy"
            >
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4" />
                Fundraising Keyword Auto-Responders
              </div>
              {keywordOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="rounded-md bg-muted/50 p-3 mt-1 space-y-2 text-sm text-muted-foreground" data-testid="content-keyword-strategy">
              <p className="font-medium text-foreground">Using keyword auto-responders</p>
              <p>
                Many social media automation tools (like ManyChat or Comment Sold) let you set up auto-responders 
                that trigger when someone comments a specific keyword on your post.
              </p>
              <p className="font-medium text-foreground mt-3">How to set it up:</p>
              <ol className="list-decimal list-inside space-y-1.5 ml-1">
                <li>Set a unique "Fundraising Keyword" on the animal's profile (e.g., "HELP" or the animal's name)</li>
                <li>Connect your auto-responder tool to your Facebook page</li>
                <li>Create a rule: when someone comments the keyword, automatically DM them the donation link</li>
                <li>In your post, add a CTA like "Comment LUNA below to get a direct link to help fund her surgery"</li>
              </ol>
              <p className="text-xs mt-2 italic">
                This method drives massive engagement because every comment boosts the post's algorithmic reach, 
                while also delivering the donation link privately to each interested person.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible open={tipsOpen} onOpenChange={setTipsOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between font-medium"
              data-testid="button-toggle-quick-tips"
            >
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4" />
                Quick Tips for Maximum Impact
              </div>
              {tipsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="rounded-md bg-muted/50 p-3 mt-1 space-y-2 text-sm text-muted-foreground" data-testid="content-quick-tips">
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />
                  <span><strong>Photos outperform graphics.</strong> Real photos of animals get 3-4x more engagement than designed flyers.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />
                  <span><strong>Post at peak times.</strong> Typically 9 AM, 12 PM, and 7 PM local time get the best reach.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />
                  <span><strong>Tell a story.</strong> Posts with a personal narrative about the animal raise 4x more than generic asks.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />
                  <span><strong>Use urgency sparingly.</strong> Genuine urgency (surgery deadline, medical emergency) drives action, but overuse causes donor fatigue.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />
                  <span><strong>Follow up with results.</strong> Share updates after fundraising goals are met to build trust and encourage repeat donors.</span>
                </li>
              </ul>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

function CampaignManagerTab({ tenantSubdomain }: { tenantSubdomain?: string }) {
  const { toast } = useToast();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showDonors, setShowDonors] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [progressValue, setProgressValue] = useState("");

  const { data, isLoading } = useQuery<{ campaigns: any[] }>({
    queryKey: ["/api/peer-campaigns"],
  });

  const campaigns = data?.campaigns || [];
  const staffCampaigns = campaigns.filter((c: any) => c.createdByUserId || c.goalType === "units");

  const totalRaised = staffCampaigns.reduce((sum: number, c: any) => sum + (c.donationTotal || c.amountRaised || 0), 0);
  const activeCampaigns = staffCampaigns.filter((c: any) => c.isActive && c.status === "active").length;

  const handleViewPublicPage = (slug: string) => {
    const base = window.location.origin;
    const usePrefix = tenantSubdomain && !isCustomDomain();
    const path = usePrefix ? `/${tenantSubdomain}/campaign/${slug}` : `/campaign/${slug}`;
    window.open(`${base}${path}`, "_blank");
  };

  return (
    <div className="space-y-4" data-testid="section-campaign-manager">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-purple-500/10 p-2">
                <Target className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Staff Campaigns</p>
                <p className="text-2xl font-bold" data-testid="text-staff-campaigns-count">{staffCampaigns.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-green-500/10 p-2">
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Raised</p>
                <p className="text-2xl font-bold" data-testid="text-cm-total-raised">${(totalRaised / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-amber-500/10 p-2">
                <TrendingUp className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold" data-testid="text-cm-active">{activeCampaigns}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-purple-500" />
              <CardTitle className="text-lg">Campaign Manager</CardTitle>
            </div>
            <Button onClick={() => setShowCreateForm(true)} data-testid="button-create-campaign">
              <Plus className="mr-2 h-4 w-4" />
              New Campaign
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">Create and manage staff-run campaigns with pledge-per-unit goals, progress tracking, and timeline updates.</p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (<div key={i} className="h-12 rounded-md bg-muted animate-pulse" />))}
            </div>
          ) : staffCampaigns.length === 0 && !showCreateForm ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="rounded-full bg-muted p-3">
                <Target className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium" data-testid="text-no-staff-campaigns">No campaigns yet</p>
                <p className="text-xs text-muted-foreground">Create a campaign to start fundraising with pledges, progress tracking, and timeline updates.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table data-testid="table-staff-campaigns">
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Progress</TableHead>
                    <TableHead className="text-right">Raised</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffCampaigns.map((campaign: any) => {
                    const raised = campaign.donationTotal || campaign.amountRaised || 0;
                    const isUnits = campaign.goalType === "units";
                    const progress = isUnits
                      ? (campaign.goalTarget > 0 ? Math.min(100, Math.round((campaign.currentProgress / campaign.goalTarget) * 100)) : 0)
                      : (campaign.goalAmount > 0 ? Math.min(100, Math.round((raised / campaign.goalAmount) * 100)) : 0);

                    return (
                      <TableRow key={campaign.id} data-testid={`row-staff-campaign-${campaign.id}`}>
                        <TableCell>
                          <div className="font-medium">{campaign.campaignTitle}</div>
                          <div className="text-xs text-muted-foreground">{new Date(campaign.createdAt).toLocaleDateString()}</div>
                        </TableCell>
                        <TableCell>
                          {isUnits ? (
                            <Badge variant="secondary"><Target className="h-3 w-3 mr-1" />{campaign.goalUnitLabel || "units"}</Badge>
                          ) : (
                            <Badge variant="secondary"><DollarSign className="h-3 w-3 mr-1" />Dollar</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${progress}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground w-12 text-right">
                              {isUnits ? `${campaign.currentProgress || 0}/${campaign.goalTarget || 0}` : `${progress}%`}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">${(raised / 100).toLocaleString()}</TableCell>
                        <TableCell>
                          {campaign.status === "completed" ? (
                            <Badge variant="secondary">Completed</Badge>
                          ) : campaign.isActive ? (
                            <Badge variant="default" className="bg-green-600">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => handleViewPublicPage(campaign.slug)} title="View public page" data-testid={`button-view-staff-campaign-${campaign.id}`}>
                              <Eye />
                            </Button>
                            {campaign.goalType === "units" && (
                              <Button size="icon" variant="ghost" onClick={() => { setSelectedCampaignId(campaign.id); setProgressValue(String(campaign.currentProgress || 0)); setShowUpdateForm(false); setShowDonors(false); }} title="Update progress" data-testid={`button-progress-${campaign.id}`}>
                                <TrendingUp />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" onClick={() => { setSelectedCampaignId(campaign.id); setShowParticipants(true); setShowUpdateForm(false); setShowDonors(false); }} title="Manage participants" data-testid={`button-participants-${campaign.id}`}>
                              <Users />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => { setSelectedCampaignId(campaign.id); setShowUpdateForm(true); setShowDonors(false); setShowParticipants(false); }} title="Post update" data-testid={`button-post-update-${campaign.id}`}>
                              <Megaphone />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => { setSelectedCampaignId(campaign.id); setShowDonors(true); setShowUpdateForm(false); setShowParticipants(false); }} title="View donors" data-testid={`button-view-donors-${campaign.id}`}>
                              <DollarSign />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {showCreateForm && (
        <CreateCampaignDialog onClose={() => setShowCreateForm(false)} />
      )}

      {selectedCampaignId && !showUpdateForm && !showDonors && !showParticipants && (
        <ProgressUpdateDialog
          campaignId={selectedCampaignId}
          initialProgress={progressValue}
          onClose={() => setSelectedCampaignId(null)}
        />
      )}

      {selectedCampaignId && showUpdateForm && (
        <PostUpdateDialog
          campaignId={selectedCampaignId}
          onClose={() => { setSelectedCampaignId(null); setShowUpdateForm(false); }}
        />
      )}

      {selectedCampaignId && showDonors && (
        <DonationsDialog
          campaignId={selectedCampaignId}
          campaignTitle={campaigns.find((c: any) => c.id === selectedCampaignId)?.campaignTitle || "Campaign"}
          onClose={() => { setSelectedCampaignId(null); setShowDonors(false); }}
        />
      )}

      {selectedCampaignId && showParticipants && (
        <ManageParticipantsDialog
          campaignId={selectedCampaignId}
          campaignSlug={campaigns.find((c: any) => c.id === selectedCampaignId)?.slug || ""}
          campaignTitle={campaigns.find((c: any) => c.id === selectedCampaignId)?.campaignTitle || "Campaign"}
          tenantSubdomain={tenantSubdomain}
          onClose={() => { setSelectedCampaignId(null); setShowParticipants(false); }}
        />
      )}
    </div>
  );
}

function CreateCampaignDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [story, setStory] = useState("");
  const [goalType, setGoalType] = useState<"currency" | "units">("currency");
  const [goalAmount, setGoalAmount] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [unitLabel, setUnitLabel] = useState("lbs");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [animalId, setAnimalId] = useState("");

  const { data: animalsListData } = useQuery<{ animals: any[] }>({
    queryKey: ["/api/animals"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string | number | undefined> = {
        campaignTitle: title,
        campaignStory: story || undefined,
        goalAmount: goalType === "currency" ? Math.round(parseFloat(goalAmount) * 100) : 100,
        goalType,
        endsAt: endsAt || undefined,
        coverImageUrl: coverImageUrl || undefined,
        animalId: animalId && animalId !== "none" ? animalId : undefined,
      };
      if (goalType === "units") {
        payload.goalTarget = parseInt(goalTarget);
        payload.goalUnitLabel = unitLabel;
      }
      const res = await apiRequest("POST", "/api/peer-campaigns/staff", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/peer-campaigns"] });
      toast({ title: "Campaign created!" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to create campaign", variant: "destructive" });
    },
  });

  const canSubmit = title.trim().length > 0 && (
    (goalType === "currency" && parseFloat(goalAmount) >= 1) ||
    (goalType === "units" && parseInt(goalTarget) >= 1 && unitLabel.trim().length > 0)
  );

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg" data-testid="dialog-create-campaign">
        <DialogHeader>
          <DialogTitle>Create Campaign</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Campaign Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Luna's 7-Pound Shed-A-Thon" data-testid="input-cm-title" />
          </div>
          <div>
            <Label>Story / Description</Label>
            <Textarea value={story} onChange={(e) => setStory(e.target.value)} placeholder="Tell supporters about this campaign..." className="resize-none min-h-[100px]" data-testid="input-cm-story" />
          </div>
          <div>
            <Label>Goal Type</Label>
            <div className="flex gap-2 mt-1">
              <Button variant={goalType === "currency" ? "default" : "outline"} onClick={() => setGoalType("currency")} data-testid="button-goal-currency">
                <DollarSign className="h-4 w-4 mr-1" />Dollar Goal
              </Button>
              <Button variant={goalType === "units" ? "default" : "outline"} onClick={() => setGoalType("units")} data-testid="button-goal-units">
                <Target className="h-4 w-4 mr-1" />Unit Goal
              </Button>
            </div>
          </div>
          {goalType === "currency" ? (
            <div>
              <Label>Goal Amount ($)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input type="number" min="1" step="1" value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} className="pl-7" placeholder="500" data-testid="input-cm-goal-amount" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Target ({unitLabel})</Label>
                <Input type="number" min="1" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} placeholder="7" data-testid="input-cm-goal-target" />
              </div>
              <div>
                <Label>Unit Label</Label>
                <Input value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} placeholder="lbs" data-testid="input-cm-unit-label" />
              </div>
            </div>
          )}
          <div>
            <Label>Cover Image URL (optional)</Label>
            <Input value={coverImageUrl} onChange={(e) => setCoverImageUrl(e.target.value)} placeholder="https://..." data-testid="input-cm-cover-image" />
          </div>
          <div>
            <Label>End Date (optional)</Label>
            <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} data-testid="input-cm-ends-at" />
          </div>
          <div>
            <Label>Link to Animal (optional)</Label>
            <Select value={animalId} onValueChange={setAnimalId}>
              <SelectTrigger data-testid="select-cm-animal">
                <SelectValue placeholder="No animal linked" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No animal linked</SelectItem>
                {animalsListData?.animals?.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending} data-testid="button-cm-submit">
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Create Campaign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProgressUpdateDialog({ campaignId, initialProgress, onClose }: { campaignId: string; initialProgress: string; onClose: () => void }) {
  const { toast } = useToast();
  const [value, setValue] = useState(initialProgress);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/peer-campaigns/${campaignId}/progress`, {
        currentProgress: parseInt(value),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/peer-campaigns"] });
      toast({ title: "Progress updated!" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to update progress", variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm" data-testid="dialog-progress-update">
        <DialogHeader>
          <DialogTitle>Update Progress</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label>Current Progress</Label>
          <Input type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} data-testid="input-progress-value" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} data-testid="button-save-progress">
            {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PostUpdateDialog({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [updateText, setUpdateText] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [videoUrls, setVideoUrls] = useState<string[]>([]);

  const postMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/peer-campaigns/${campaignId}/updates`, {
        updateText,
        imageUrl: imageUrls[0] || undefined,
        videoUrl: videoUrls[0] || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/peer-campaigns"] });
      toast({ title: "Update posted!" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to post update", variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg" data-testid="dialog-post-update">
        <DialogHeader>
          <DialogTitle>Post Campaign Update</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Update Text</Label>
            <Textarea value={updateText} onChange={(e) => setUpdateText(e.target.value)} placeholder="Weigh-in Wednesday! Luna lost 1 lb!" className="resize-none min-h-[100px]" data-testid="input-update-text" />
          </div>
          <div>
            <Label>Photo (optional)</Label>
            <ObjectUploader
              value={imageUrls}
              onChange={setImageUrls}
              maxFiles={1}
              accept="image/*"
              uploadEndpoint="/api/peer-campaigns/media/upload"
              data-testid="uploader-update-image"
              buttonText="Upload Photo"
            />
          </div>
          <div>
            <Label>Video (optional)</Label>
            <ObjectUploader
              value={videoUrls}
              onChange={setVideoUrls}
              maxFiles={1}
              maxFileSize={100 * 1024 * 1024}
              accept="video/*"
              uploadEndpoint="/api/peer-campaigns/media/upload"
              data-testid="uploader-update-video"
              buttonText="Upload Video"
              showPreview={false}
            />
            {videoUrls.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">Video uploaded successfully</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => postMutation.mutate()} disabled={!updateText.trim() || postMutation.isPending} data-testid="button-submit-update">
            {postMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Post Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageParticipantsDialog({
  campaignId,
  campaignSlug,
  campaignTitle,
  tenantSubdomain,
  onClose,
}: {
  campaignId: string;
  campaignSlug: string;
  campaignTitle: string;
  tenantSubdomain?: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAvatar, setNewAvatar] = useState("paw");
  const [bulkNames, setBulkNames] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUnits, setEditUnits] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<{ participants: any[] }>({
    queryKey: ["/api/peer-campaigns", campaignId, "participants"],
    queryFn: async () => {
      const res = await fetch(`/api/peer-campaigns/${campaignId}/participants`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!campaignId,
  });

  const participants = data?.participants || [];

  const addMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("POST", `/api/peer-campaigns/${campaignId}/participants`, body);
      return res.json();
    },
    onSuccess: () => {
      refetch();
      setNewName("");
      setNewAvatar("paw");
      setShowAdd(false);
      toast({ title: "Participant added" });
    },
    onError: () => toast({ title: "Failed to add participant", variant: "destructive" }),
  });

  const bulkMutation = useMutation({
    mutationFn: async (names: string[]) => {
      const body = names.map(n => ({ displayName: n.trim() }));
      const res = await apiRequest("POST", `/api/peer-campaigns/${campaignId}/participants`, body);
      return res.json();
    },
    onSuccess: (result) => {
      refetch();
      setBulkNames("");
      setShowBulk(false);
      toast({ title: `${result.participants?.length || 0} participants imported` });
    },
    onError: () => toast({ title: "Import failed", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ pid, body }: { pid: string; body: any }) => {
      const res = await apiRequest("PATCH", `/api/peer-campaigns/${campaignId}/participants/${pid}`, body);
      return res.json();
    },
    onSuccess: () => {
      refetch();
      setEditingId(null);
      toast({ title: "Participant updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (pid: string) => {
      const res = await apiRequest("DELETE", `/api/peer-campaigns/${campaignId}/participants/${pid}`);
      return res.json();
    },
    onSuccess: () => {
      refetch();
      setDeleteId(null);
      toast({ title: "Participant removed" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const handleCopySubLink = (pid: string) => {
    const base = window.location.origin;
    const usePrefix = tenantSubdomain && !isCustomDomain();
    const path = usePrefix ? `/${tenantSubdomain}/campaign/${campaignSlug}/p/${pid}` : `/campaign/${campaignSlug}/p/${pid}`;
    navigator.clipboard.writeText(`${base}${path}`).then(() => {
      toast({ title: "Link copied", description: "Participant sub-page link copied." });
    });
  };

  const handleBulkImport = () => {
    const names = bulkNames.split("\n").map(n => n.trim()).filter(n => n.length > 0);
    if (names.length === 0) return;
    bulkMutation.mutate(names);
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-manage-participants">
        <DialogHeader>
          <DialogTitle data-testid="text-participants-dialog-title">Participants — {campaignTitle}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={() => { setShowAdd(true); setShowBulk(false); }} data-testid="button-add-participant">
            <Plus className="h-4 w-4 mr-2" />
            Add Participant
          </Button>
          <Button variant="outline" onClick={() => { setShowBulk(true); setShowAdd(false); }} data-testid="button-bulk-import">
            <Users className="h-4 w-4 mr-2" />
            Bulk Import
          </Button>
        </div>

        {showAdd && (
          <Card data-testid="card-add-participant">
            <CardContent className="pt-4 space-y-3">
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input placeholder="e.g. Mrs. Smith's Class" value={newName} onChange={(e) => setNewName(e.target.value)} data-testid="input-new-participant-name" />
              </div>
              <div className="space-y-2">
                <Label>Avatar</Label>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_TYPES.map(type => {
                    const Icon = getAvatarIcon(type);
                    const color = getAvatarColor(type);
                    return (
                      <button
                        key={type}
                        className={`w-10 h-10 rounded-md border flex items-center justify-center transition-colors ${newAvatar === type ? "ring-2 ring-primary bg-primary/10" : "hover-elevate"}`}
                        onClick={() => setNewAvatar(type)}
                        data-testid={`avatar-option-${type}`}
                      >
                        <Icon className={`h-5 w-5 ${color}`} />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => addMutation.mutate({ displayName: newName.trim(), avatarType: newAvatar })} disabled={!newName.trim() || addMutation.isPending} data-testid="button-confirm-add-participant">
                  {addMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Add
                </Button>
                <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {showBulk && (
          <Card data-testid="card-bulk-import">
            <CardContent className="pt-4 space-y-3">
              <div className="space-y-2">
                <Label>Paste Names (one per line)</Label>
                <Textarea placeholder={"Mrs. Smith's Class\nMr. Jones' Class\nRoom 204"} value={bulkNames} onChange={(e) => setBulkNames(e.target.value)} rows={6} data-testid="textarea-bulk-names" />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleBulkImport} disabled={!bulkNames.trim() || bulkMutation.isPending} data-testid="button-confirm-bulk">
                  {bulkMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Import {bulkNames.split("\n").filter(n => n.trim()).length} Participants
                </Button>
                <Button variant="outline" onClick={() => setShowBulk(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-2 py-4">
            {[1, 2, 3].map(i => <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />)}
          </div>
        ) : participants.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-participants">
            No participants yet. Add participants to enable the leaderboard on the campaign page.
          </p>
        ) : (
          <div className="space-y-2">
            {participants.map((p: any) => {
              const AIcon = getAvatarIcon(p.avatarType);
              const aColor = getAvatarColor(p.avatarType);
              const isEditing = editingId === p.id;

              return (
                <div key={p.id} className="flex items-center gap-3 py-2 border-b last:border-0" data-testid={`participant-row-${p.id}`}>
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <AIcon className={`h-4 w-4 ${aColor}`} />
                  </div>
                  {isEditing ? (
                    <div className="flex-1 flex items-center gap-2 flex-wrap">
                      <Input className="w-40" value={editName} onChange={(e) => setEditName(e.target.value)} data-testid={`input-edit-name-${p.id}`} />
                      <Input className="w-20" type="number" min="0" value={editUnits} onChange={(e) => setEditUnits(e.target.value)} placeholder="Units" data-testid={`input-edit-units-${p.id}`} />
                      <Button size="sm" onClick={() => updateMutation.mutate({ pid: p.id, body: { displayName: editName, currentUnits: parseInt(editUnits) || 0 } })} disabled={updateMutation.isPending} data-testid={`button-save-edit-${p.id}`}>
                        {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" data-testid={`text-participant-name-${p.id}`}>{p.displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.currentUnits} units | ${(p.totalRaised / 100).toLocaleString()} raised | {p.donationCount} sponsors
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="icon" variant="ghost" onClick={() => handleCopySubLink(p.id)} title="Copy sub-link" data-testid={`button-copy-sublink-${p.id}`}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => { setEditingId(p.id); setEditName(p.displayName); setEditUnits(String(p.currentUnits || 0)); }} title="Edit" data-testid={`button-edit-participant-${p.id}`}>
                          <TrendingUp className="h-4 w-4" />
                        </Button>
                        {deleteId === p.id ? (
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(p.id)} disabled={deleteMutation.isPending} data-testid={`button-confirm-delete-${p.id}`}>
                              {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setDeleteId(null)}>No</Button>
                          </div>
                        ) : (
                          <Button size="icon" variant="ghost" onClick={() => setDeleteId(p.id)} title="Remove" data-testid={`button-delete-participant-${p.id}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

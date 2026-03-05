import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import QRCode from "qrcode";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import DashboardLayout from "@/components/DashboardLayout";

export default function FundraisingHubPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: tenantData, isLoading: tenantLoading } = useQuery<{ tenant: any }>({
    queryKey: ["/api/tenant"],
  });
  const tenant = tenantData?.tenant;

  const donationUrl = tenant?.stripeLink || "";

  return (
    <DashboardLayout title="Donation & Fundraising Hub" description="Your centralized toolkit for managing donations, running campaigns, and maximizing fundraising impact.">
      <div className="space-y-6" data-testid="page-fundraising-hub">

      <Tabs defaultValue="toolkit" className="space-y-4">
        <TabsList data-testid="tabs-fundraising">
          <TabsTrigger value="toolkit" data-testid="tab-toolkit">Toolkit</TabsTrigger>
          <TabsTrigger value="community" data-testid="tab-community-fundraisers">Community Fundraisers</TabsTrigger>
        </TabsList>

        <TabsContent value="toolkit">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            <GeneralDonationsCard donationUrl={donationUrl} tenantName={tenant?.name} isLoading={tenantLoading} />
            <AnimalCampaignsCard onNavigate={setLocation} />
            <SocialMediaPlaybookCard />
          </div>
        </TabsContent>

        <TabsContent value="community">
          <CommunityFundraisersTab tenantSubdomain={tenant?.subdomain} />
        </TabsContent>
      </Tabs>
      </div>
    </DashboardLayout>
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
    const path = tenantSubdomain ? `/${tenantSubdomain}/fundraise` : "/fundraise";
    try {
      await navigator.clipboard.writeText(`${base}${path}`);
      toast({ title: "Link copied", description: "Campaign creation link copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const handleViewPublicPage = (slug: string) => {
    const base = window.location.origin;
    const path = tenantSubdomain ? `/${tenantSubdomain}/fundraise/${slug}` : `/fundraise/${slug}`;
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
  const { data, isLoading } = useQuery<{ donations: any[] }>({
    queryKey: ["/api/peer-campaigns", campaignId, "donations"],
    enabled: !!campaignId,
  });

  const donations = data?.donations || [];

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg" data-testid="dialog-campaign-donations">
        <DialogHeader>
          <DialogTitle data-testid="text-donations-dialog-title">Donations — {campaignTitle}</DialogTitle>
        </DialogHeader>
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
                  <p className="text-sm font-medium" data-testid={`text-donor-name-${i}`}>
                    {d.isAnonymous ? "Anonymous" : d.donorName}
                  </p>
                  {!d.isAnonymous && d.donorEmail && (
                    <p className="text-xs text-muted-foreground">{d.donorEmail}</p>
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

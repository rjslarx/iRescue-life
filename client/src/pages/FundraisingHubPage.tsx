import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import QRCode from "qrcode";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function FundraisingHubPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: tenantData, isLoading: tenantLoading } = useQuery<{ tenant: any }>({
    queryKey: ["/api/tenant"],
  });
  const tenant = tenantData?.tenant;

  const donationUrl = tenant?.stripeLink || "";

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6" data-testid="page-fundraising-hub">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
          Donation & Fundraising Hub
        </h1>
        <p className="text-muted-foreground mt-1" data-testid="text-page-subtitle">
          Your centralized toolkit for managing donations, running campaigns, and maximizing fundraising impact.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <GeneralDonationsCard donationUrl={donationUrl} tenantName={tenant?.name} isLoading={tenantLoading} />
        <AnimalCampaignsCard onNavigate={setLocation} />
        <SocialMediaPlaybookCard />
      </div>
    </div>
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

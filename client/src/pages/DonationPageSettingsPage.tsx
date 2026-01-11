import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Heart, AlertCircle, ExternalLink, QrCode, CheckCircle2, Smartphone, Download, Copy, Check } from "lucide-react";
import { SiPaypal, SiVenmo, SiCashapp } from "react-icons/si";
import type { Tenant } from "@shared/schema";
import { useState, useEffect } from "react";

export default function DonationPageSettingsPage() {
  const { toast } = useToast();
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant/settings'],
  });

  // Generate the donation page URL based on tenant subdomain or custom domain
  const getDonationUrl = () => {
    const tenant = data?.tenant;
    if (!tenant) return `${window.location.origin}/give`;
    
    // If tenant has a verified custom domain, use it
    if ((tenant as any).customDomain && (tenant as any).customDomainVerified) {
      return `https://${(tenant as any).customDomain}/give`;
    }
    
    // Use path-based URL: irescue.life/{subdomain}/give or replit-url/{subdomain}/give
    const subdomain = (tenant as any).subdomain;
    if (subdomain) {
      return `${window.location.origin}/${subdomain}/give`;
    }
    
    // Fallback to current origin
    return `${window.location.origin}/give`;
  };

  const donationUrl = getDonationUrl();

  // Fetch QR code from server
  useEffect(() => {
    if (data?.tenant) {
      fetch(`/api/qr-code?url=${encodeURIComponent(donationUrl)}`)
        .then(res => res.json())
        .then(data => {
          if (data.qrCode) {
            setQrCodeUrl(data.qrCode);
          }
        })
        .catch(console.error);
    }
  }, [data?.tenant, donationUrl]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(donationUrl);
      setCopied(true);
      toast({ title: "Copied!", description: "URL copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  const downloadQrCode = () => {
    if (!qrCodeUrl) return;
    const link = document.createElement('a');
    link.href = qrCodeUrl;
    link.download = 'donation-qr-code.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  const tenant = data?.tenant;
  const paypalUsername = (tenant as any)?.paypalUsername;
  const venmoUsername = (tenant as any)?.venmoUsername;
  const cashappUsername = (tenant as any)?.cashappUsername;
  const hasPaymentApps = paypalUsername || venmoUsername || cashappUsername;
  const hasDonationUrl = (tenant as any)?.donationLandingButtonUrl || (tenant as any)?.stripeEnabled;

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900">
            <QrCode className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Donation Landing Page</h2>
            <p className="text-sm text-muted-foreground">
              Customize the mobile-optimized page at <code className="text-xs bg-muted px-1 py-0.5 rounded">/give</code> for QR code scanning
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Page Content</CardTitle>
              <CardDescription>
                Customize what donors see when they scan your QR code
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="donationLandingHeader">Header Text</Label>
                <Input
                  id="donationLandingHeader"
                  placeholder={`Thank you for supporting ${tenant?.name || 'our organization'}!`}
                  defaultValue={(tenant as any)?.donationLandingHeader || ''}
                  onBlur={(e) => {
                    apiRequest('PATCH', '/api/tenant/settings/donation-landing', {
                      donationLandingHeader: e.target.value.trim() || null,
                    }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
                      queryClient.invalidateQueries({ queryKey: ['/api/public/tenant'] });
                      toast({ title: "Saved", description: "Header text updated" });
                    });
                  }}
                  data-testid="input-donation-landing-header"
                />
                <p className="text-xs text-muted-foreground">The main heading visitors see when they scan the QR code</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="donationLandingButtonLabel">Donate Button Text</Label>
                <Input
                  id="donationLandingButtonLabel"
                  placeholder="Donate Online (Credit/Debit)"
                  defaultValue={(tenant as any)?.donationLandingButtonLabel || ''}
                  onBlur={(e) => {
                    apiRequest('PATCH', '/api/tenant/settings/donation-landing', {
                      donationLandingButtonLabel: e.target.value.trim() || null,
                    }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
                      queryClient.invalidateQueries({ queryKey: ['/api/public/tenant'] });
                      toast({ title: "Saved", description: "Button text updated" });
                    });
                  }}
                  data-testid="input-donation-landing-button-label"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="donationLandingButtonUrl">Donate Button URL (Optional)</Label>
                <Input
                  id="donationLandingButtonUrl"
                  placeholder="Custom donation URL (optional)"
                  defaultValue={(tenant as any)?.donationLandingButtonUrl || ''}
                  onBlur={(e) => {
                    apiRequest('PATCH', '/api/tenant/settings/donation-landing', {
                      donationLandingButtonUrl: e.target.value.trim() || null,
                    }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
                      queryClient.invalidateQueries({ queryKey: ['/api/public/tenant'] });
                      toast({ title: "Saved", description: "Button URL updated" });
                    }).catch((err) => {
                      toast({ 
                        title: "Invalid URL", 
                        description: err.message || "Please enter a valid URL",
                        variant: "destructive" 
                      });
                    });
                  }}
                  data-testid="input-donation-landing-button-url"
                />
                <p className="text-xs text-muted-foreground">If empty, uses Stripe checkout when available</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="donationLandingMailingText">Check Mailing Prompt</Label>
                <Input
                  id="donationLandingMailingText"
                  placeholder="Prefer to mail a check? Send to:"
                  defaultValue={(tenant as any)?.donationLandingMailingText || ''}
                  onBlur={(e) => {
                    apiRequest('PATCH', '/api/tenant/settings/donation-landing', {
                      donationLandingMailingText: e.target.value.trim() || null,
                    }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
                      queryClient.invalidateQueries({ queryKey: ['/api/public/tenant'] });
                      toast({ title: "Saved", description: "Mailing text updated" });
                    });
                  }}
                  data-testid="input-donation-landing-mailing-text"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="donationLandingMailingAddress">Mailing Address</Label>
                <Textarea
                  id="donationLandingMailingAddress"
                  placeholder="PO Box 123&#10;City, ST 12345"
                  defaultValue={(tenant as any)?.donationLandingMailingAddress || ''}
                  onBlur={(e) => {
                    apiRequest('PATCH', '/api/tenant/settings/donation-landing', {
                      donationLandingMailingAddress: e.target.value.trim() || null,
                    }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
                      queryClient.invalidateQueries({ queryKey: ['/api/public/tenant'] });
                      toast({ title: "Saved", description: "Mailing address updated" });
                    });
                  }}
                  data-testid="input-donation-landing-mailing-address"
                />
                <p className="text-xs text-muted-foreground">If empty, uses your footer address from branding settings</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                Preview & Status
              </CardTitle>
              <CardDescription>
                See what payment options will appear on your donation page
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Main Donate Button</span>
                  {hasDonationUrl ? (
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Configured
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Not configured</Badge>
                  )}
                </div>
                {hasDonationUrl && (
                  <p className="text-xs text-muted-foreground">
                    Using: {(tenant as any)?.donationLandingButtonUrl ? 'Custom URL' : 'Stripe Checkout'}
                  </p>
                )}
              </div>

              <div className="border-t pt-3 space-y-3">
                <span className="text-sm font-medium">Payment App Buttons</span>
                <div className="grid grid-cols-3 gap-2">
                  <div className={`flex flex-col items-center gap-1 p-2 rounded border ${paypalUsername ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-muted'}`}>
                    <SiPaypal className={`h-5 w-5 ${paypalUsername ? 'text-[#003087]' : 'text-muted-foreground'}`} />
                    <span className="text-xs">{paypalUsername ? 'Active' : 'Not set'}</span>
                  </div>
                  <div className={`flex flex-col items-center gap-1 p-2 rounded border ${venmoUsername ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-muted'}`}>
                    <SiVenmo className={`h-5 w-5 ${venmoUsername ? 'text-[#3D95CE]' : 'text-muted-foreground'}`} />
                    <span className="text-xs">{venmoUsername ? 'Active' : 'Not set'}</span>
                  </div>
                  <div className={`flex flex-col items-center gap-1 p-2 rounded border ${cashappUsername ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-muted'}`}>
                    <SiCashapp className={`h-5 w-5 ${cashappUsername ? 'text-[#00D632]' : 'text-muted-foreground'}`} />
                    <span className="text-xs">{cashappUsername ? 'Active' : 'Not set'}</span>
                  </div>
                </div>
                {!hasPaymentApps && (
                  <p className="text-xs text-muted-foreground">
                    Configure payment app usernames in Settings → Integrations to show these buttons
                  </p>
                )}
              </div>

              <div className="border-t pt-3">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.open(donationUrl, '_blank', 'noopener,noreferrer')}
                  data-testid="button-preview-give-page"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Preview Donation Page
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <QrCode className="h-4 w-4" />
                QR Code for Donations
              </CardTitle>
              <CardDescription>
                Scan to open your donation page on mobile
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center space-y-4">
                {qrCodeUrl ? (
                  <div className="bg-white p-4 rounded-lg border shadow-sm">
                    <img 
                      src={qrCodeUrl} 
                      alt="Donation QR Code" 
                      className="w-48 h-48"
                      data-testid="img-donation-qr-code"
                    />
                  </div>
                ) : (
                  <div className="w-48 h-48 bg-muted rounded-lg flex items-center justify-center">
                    <div className="animate-pulse text-muted-foreground">Loading...</div>
                  </div>
                )}
                
                <div className="w-full space-y-2">
                  <Label className="text-xs text-muted-foreground">URL:</Label>
                  <div className="flex gap-2">
                    <code className="flex-1 text-xs bg-muted px-3 py-2 rounded break-all">
                      {donationUrl}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={copyToClipboard}
                      data-testid="button-copy-donation-url"
                    >
                      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="flex gap-2 w-full">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={downloadQrCode}
                    disabled={!qrCodeUrl}
                    data-testid="button-download-qr-code"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download QR Code
                  </Button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Print this QR code on kennel cards, flyers, event materials, and donation stations for easy mobile donations.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

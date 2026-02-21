import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Heart, DollarSign, Mail, Type, Palette, CreditCard } from "lucide-react";
import type { Tenant } from "@shared/schema";

export default function DonatePageSettingsPage() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant/settings'],
  });

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

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Heart className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Donate Page Settings</h2>
            <p className="text-sm text-muted-foreground">
              Customize the full-featured donation page at <code className="text-xs bg-muted px-1 py-0.5 rounded">/donate</code>
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Type className="h-4 w-4" />
                Page Title & Subtitle
              </CardTitle>
              <CardDescription>
                Customize the main heading on your /donate page
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="donatePageTitle">Page Title</Label>
                <Input
                  id="donatePageTitle"
                  placeholder="Become a Monthly Guardian"
                  defaultValue={(tenant as any)?.donationSection?.pageTitle || ''}
                  onBlur={(e) => {
                    const currentSection = (tenant as any)?.donationSection || {};
                    apiRequest('PATCH', '/api/tenant/settings/donation-section', {
                      donationSection: { ...currentSection, pageTitle: e.target.value.trim() || null },
                    }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
                      toast({ title: "Saved", description: "Page title updated" });
                    });
                  }}
                  data-testid="input-donate-page-title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="donatePageSubtitle">Page Subtitle</Label>
                <Textarea
                  id="donatePageSubtitle"
                  placeholder="Join our community of monthly supporters making a lasting impact for animals in need"
                  defaultValue={(tenant as any)?.donationSection?.pageSubtitle || ''}
                  onBlur={(e) => {
                    const currentSection = (tenant as any)?.donationSection || {};
                    apiRequest('PATCH', '/api/tenant/settings/donation-section', {
                      donationSection: { ...currentSection, pageSubtitle: e.target.value.trim() || null },
                    }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
                      toast({ title: "Saved", description: "Page subtitle updated" });
                    });
                  }}
                  data-testid="input-donate-page-subtitle"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                One-Time Donation Amounts
              </CardTitle>
              <CardDescription>
                Set preset amounts for one-time donations (in addition to monthly giving)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                {[10, 20, 50, 100].map((defaultAmount, index) => {
                  const currentAmounts = (tenant as any)?.donationSection?.oneTimeAmounts || [10, 20, 50, 100];
                  return (
                    <div key={index} className="space-y-1">
                      <Label htmlFor={`amount-${index}`} className="text-xs">Amount {index + 1}</Label>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                        <Input
                          id={`amount-${index}`}
                          type="number"
                          className="pl-6"
                          defaultValue={currentAmounts[index] || defaultAmount}
                          onBlur={(e) => {
                            const value = parseInt(e.target.value) || defaultAmount;
                            const currentSection = (tenant as any)?.donationSection || {};
                            const newAmounts = [...(currentSection.oneTimeAmounts || [10, 20, 50, 100])];
                            newAmounts[index] = value;
                            apiRequest('PATCH', '/api/tenant/settings/donation-section', {
                              donationSection: { ...currentSection, oneTimeAmounts: newAmounts },
                            }).then(() => {
                              queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
                              queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
                              toast({ title: "Saved", description: "Donation amount updated" });
                            });
                          }}
                          data-testid={`input-amount-${index}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="space-y-0.5">
                  <Label>Show Custom Amount Field</Label>
                  <p className="text-xs text-muted-foreground">Allow donors to enter any amount</p>
                </div>
                <Switch
                  checked={(tenant as any)?.donationSection?.showCustomAmount !== false}
                  onCheckedChange={(checked) => {
                    const currentSection = (tenant as any)?.donationSection || {};
                    apiRequest('PATCH', '/api/tenant/settings/donation-section', {
                      donationSection: { ...currentSection, showCustomAmount: checked },
                    }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
                      toast({ title: "Saved", description: checked ? "Custom amount enabled" : "Custom amount disabled" });
                    });
                  }}
                  data-testid="switch-show-custom-amount"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Mail-In Donations
              </CardTitle>
              <CardDescription>
                Display mailing address for check donations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mailingAddressLabel">Mailing Section Label</Label>
                <Input
                  id="mailingAddressLabel"
                  placeholder="Prefer to mail a check? Send to:"
                  defaultValue={(tenant as any)?.donationSection?.mailingAddressLabel || ''}
                  onBlur={(e) => {
                    const currentSection = (tenant as any)?.donationSection || {};
                    apiRequest('PATCH', '/api/tenant/settings/donation-section', {
                      donationSection: { ...currentSection, mailingAddressLabel: e.target.value.trim() || null },
                    }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
                      toast({ title: "Saved", description: "Mailing label updated" });
                    });
                  }}
                  data-testid="input-mailing-label"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="donateMailingAddress">Mailing Address for Donations</Label>
                <Textarea
                  id="donateMailingAddress"
                  placeholder="Organization Name&#10;PO Box 123&#10;City, ST 12345"
                  defaultValue={(tenant as any)?.donationSection?.donateMailingAddress || ''}
                  onBlur={(e) => {
                    const currentSection = (tenant as any)?.donationSection || {};
                    apiRequest('PATCH', '/api/tenant/settings/donation-section', {
                      donationSection: { ...currentSection, donateMailingAddress: e.target.value.trim() || null },
                    }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
                      toast({ title: "Saved", description: "Mailing address updated" });
                    });
                  }}
                  data-testid="input-donate-mailing-address"
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
                <Palette className="h-4 w-4" />
                Monthly Giving Module
              </CardTitle>
              <CardDescription>
                Customize the monthly giving call-to-action
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="monthlyGivingTitle">Title</Label>
                <Input
                  id="monthlyGivingTitle"
                  placeholder="Become a Monthly Guardian"
                  defaultValue={(tenant as any)?.donationSection?.monthlyGivingTitle || ''}
                  onBlur={(e) => {
                    const currentSection = (tenant as any)?.donationSection || {};
                    apiRequest('PATCH', '/api/tenant/settings/donation-section', {
                      donationSection: { ...currentSection, monthlyGivingTitle: e.target.value.trim() || null },
                    }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
                      toast({ title: "Saved", description: "Monthly giving title updated" });
                    });
                  }}
                  data-testid="input-monthly-giving-title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="monthlyGivingDescription">Description</Label>
                <Textarea
                  id="monthlyGivingDescription"
                  placeholder="Join The Pack to provide predictable support. $10/month saves lives all year long."
                  defaultValue={(tenant as any)?.donationSection?.monthlyGivingDescription || ''}
                  onBlur={(e) => {
                    const currentSection = (tenant as any)?.donationSection || {};
                    apiRequest('PATCH', '/api/tenant/settings/donation-section', {
                      donationSection: { ...currentSection, monthlyGivingDescription: e.target.value.trim() || null },
                    }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
                      toast({ title: "Saved", description: "Monthly giving description updated" });
                    });
                  }}
                  data-testid="input-monthly-giving-description"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="monthlyGivingIcon">Icon</Label>
                <Select
                  defaultValue={(tenant as any)?.donationSection?.monthlyGivingIcon || 'shield'}
                  onValueChange={(value) => {
                    const currentSection = (tenant as any)?.donationSection || {};
                    apiRequest('PATCH', '/api/tenant/settings/donation-section', {
                      donationSection: { ...currentSection, monthlyGivingIcon: value },
                    }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
                      toast({ title: "Saved", description: "Monthly giving icon updated" });
                    });
                  }}
                >
                  <SelectTrigger id="monthlyGivingIcon" data-testid="select-monthly-giving-icon">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shield">Shield</SelectItem>
                    <SelectItem value="heart">Heart</SelectItem>
                    <SelectItem value="star">Star</SelectItem>
                    <SelectItem value="paw-print">Paw Print</SelectItem>
                    <SelectItem value="sparkles">Sparkles</SelectItem>
                    <SelectItem value="users">Users</SelectItem>
                    <SelectItem value="home">Home</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Button Labels
              </CardTitle>
              <CardDescription>
                Customize donation type button text
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="oneTimeButtonText">One-Time Button Text</Label>
                <Input
                  id="oneTimeButtonText"
                  placeholder="One-Time"
                  defaultValue={(tenant as any)?.donationSection?.oneTimeButtonText || ''}
                  onBlur={(e) => {
                    const currentSection = (tenant as any)?.donationSection || {};
                    apiRequest('PATCH', '/api/tenant/settings/donation-section', {
                      donationSection: { ...currentSection, oneTimeButtonText: e.target.value.trim() || null },
                    }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
                      toast({ title: "Saved", description: "Button text updated" });
                    });
                  }}
                  data-testid="input-one-time-button-text"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="monthlyButtonText">Monthly Button Text</Label>
                <Input
                  id="monthlyButtonText"
                  placeholder="Monthly"
                  defaultValue={(tenant as any)?.donationSection?.monthlyButtonText || ''}
                  onBlur={(e) => {
                    const currentSection = (tenant as any)?.donationSection || {};
                    apiRequest('PATCH', '/api/tenant/settings/donation-section', {
                      donationSection: { ...currentSection, monthlyButtonText: e.target.value.trim() || null },
                    }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
                      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
                      toast({ title: "Saved", description: "Button text updated" });
                    });
                  }}
                  data-testid="input-monthly-button-text"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payment Provider</CardTitle>
              <CardDescription>
                How donations are processed
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-primary" />
                    <span className="font-medium">Stripe</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    All donations are processed securely through Stripe
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

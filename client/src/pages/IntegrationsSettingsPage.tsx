import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Save,
  Loader2,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Mail,
  Palette,
  Copy,
  Inbox,
  HelpCircle,
  Check,
  Info,
  MessageSquare,
  Phone,
  FileSignature,
  Shield,
  DollarSign,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { z } from "zod";
import DashboardLayout from "@/components/DashboardLayout";
import { StripeConnectBanner } from "@/components/StripeConnectBanner";
import type { Tenant } from "@shared/schema";

const stripeSettingsSchema = z.object({
  stripePublishableKey: z.string().min(1, "Publishable key is required").startsWith("pk_", "Must be a valid publishable key"),
  stripeSecretKey: z.string().min(1, "Secret key is required").startsWith("sk_", "Must be a valid secret key"),
  stripeWebhookSecret: z.string().optional(),
});

const emailSettingsSchema = z.object({
  resendApiKey: z.string().min(1, "Resend API key is required").startsWith("re_", "Must be a valid Resend API key"),
  resendFromEmail: z.string().email("Must be a valid email address"),
  resendFromName: z.string().min(1, "From name is required"),
  constantContactApiKey: z.string().optional(),
});

const twilioSettingsSchema = z.object({
  twilioAccountSid: z.string().min(1, "Account SID is required").startsWith("AC", "Account SID must start with AC"),
  twilioAuthToken: z.string().min(1, "Auth Token is required"),
  twilioPhoneNumber: z.string().min(1, "Phone number is required").regex(/^\+[1-9]\d{1,14}$/, "Phone number must be in E.164 format (e.g., +15551234567)"),
  twilioMessagingServiceSid: z.string().optional()
    .transform((val) => val?.trim() || undefined)
    .refine(
      (val) => !val || val.startsWith("MG"),
      { message: "Messaging Service SID must start with MG" }
    ),
  twilioBrandSid: z.string().optional()
    .transform((val) => val?.trim() || undefined)
    .refine(
      (val) => !val || val.startsWith("BN"),
      { message: "Brand SID must start with BN" }
    ),
});

type StripeSettingsData = z.infer<typeof stripeSettingsSchema>;
type EmailSettingsData = z.infer<typeof emailSettingsSchema>;
type TwilioSettingsData = z.infer<typeof twilioSettingsSchema>;

export default function IntegrationsSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: ownerData, isLoading: isOwnerLoading } = useQuery<{ isOwner: boolean }>({
    queryKey: ['/api/me/is-owner'],
  });

  const isOwner = ownerData?.isOwner === true;
  const isAdmin = user?.activeRole === 'admin';
  const canViewPage = isOwner || isAdmin;

  const { data, isLoading } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant/settings'],
    enabled: canViewPage,
  });

  const isEditRestricted = isAdmin && !isOwner && data?.tenant?.restrictAdminSettingsEdit === true;
  const canEdit = !isEditRestricted;
  const isLiteTier = (data?.tenant as any)?.subscriptionTier === 'lite';

  const { data: emailUsage } = useQuery<{
    sent: number;
    limit: number;
    remaining: number;
    lastReset: string;
    usePlatformKey: boolean;
    hasOwnApiKey: boolean;
  }>({
    queryKey: ['/api/tenant/email-usage'],
    enabled: canViewPage,
  });

  const [surrenderFeeInput, setSurrenderFeeInput] = useState("");
  const [surrenderFeeEnabled, setSurrenderFeeEnabled] = useState(false);
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const [brandSidValue, setBrandSidValue] = useState("");
  const [brandSidLoaded, setBrandSidLoaded] = useState(false);

  useEffect(() => {
    if (data?.tenant) {
      const fee = data.tenant.defaultSurrenderFee;
      if (fee && parseFloat(fee) > 0) {
        setSurrenderFeeEnabled(true);
        setSurrenderFeeInput(parseFloat(fee).toFixed(2));
      } else {
        setSurrenderFeeEnabled(false);
        setSurrenderFeeInput("");
      }
    }
  }, [data?.tenant?.defaultSurrenderFee]);

  useEffect(() => {
    if (data?.tenant && !brandSidLoaded) {
      setBrandSidValue((data.tenant as any).twilioBrandSid ?? "");
      setBrandSidLoaded(true);
    }
  }, [data?.tenant, brandSidLoaded]);

  const stripeForm = useForm<StripeSettingsData>({
    resolver: zodResolver(stripeSettingsSchema),
    defaultValues: {
      stripePublishableKey: "",
      stripeSecretKey: "",
      stripeWebhookSecret: "",
    },
  });

  const twilioForm = useForm<TwilioSettingsData>({
    resolver: zodResolver(twilioSettingsSchema),
    defaultValues: {
      twilioAccountSid: "",
      twilioAuthToken: "",
      twilioPhoneNumber: "",
      twilioMessagingServiceSid: "",
      twilioBrandSid: "",
    },
  });

  const emailForm = useForm<EmailSettingsData>({
    resolver: zodResolver(emailSettingsSchema),
    defaultValues: {
      resendApiKey: "",
      resendFromEmail: "",
      resendFromName: "",
      constantContactApiKey: "",
    },
  });

  const updateStripeMutation = useMutation({
    mutationFn: async (settings: StripeSettingsData) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings/stripe', settings);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      toast({ title: "Stripe configured", description: "Your Stripe integration is now active for processing donations." });
      stripeForm.reset();
    },
    onError: (error: any) => {
      toast({ title: "Failed to configure Stripe", description: error.message || "Please verify your API keys and try again.", variant: "destructive" });
    },
  });

  const updatePassFeesMutation = useMutation({
    mutationFn: async (passFeesToAdopter: boolean) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings', { passFeesToAdopter });
      return response.json();
    },
    onSuccess: (_, passFeesToAdopter) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      toast({
        title: passFeesToAdopter ? "Fee passthrough enabled" : "Fee passthrough disabled",
        description: passFeesToAdopter ? "Adopters will now pay service fees on checkout." : "Your rescue will now absorb service fees.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update fee settings", description: error.message || "Please try again later.", variant: "destructive" });
    },
  });

  const updateSurrenderFeeMutation = useMutation({
    mutationFn: async (fee: string | null) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings', { defaultSurrenderFee: fee });
      return response.json();
    },
    onSuccess: (_, fee) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      toast({
        title: fee ? "Surrender fee updated" : "Surrender fee disabled",
        description: fee ? `Default surrender fee set to $${parseFloat(fee).toFixed(2)}` : "No surrender fee will be charged by default.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update surrender fee", description: error.message || "Please try again later.", variant: "destructive" });
    },
  });

  const updateRequireSpayNeuterContractMutation = useMutation({
    mutationFn: async (requireSpayNeuterContract: boolean) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings', { requireSpayNeuterContract });
      return response.json();
    },
    onSuccess: (_, requireSpayNeuterContract) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      toast({
        title: requireSpayNeuterContract ? "Spay/neuter contract enabled" : "Spay/neuter contract disabled",
        description: requireSpayNeuterContract ? "Adopters will sign an additional agreement for unaltered animals." : "No separate spay/neuter agreement will be required.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update spay/neuter contract settings", description: error.message || "Please try again later.", variant: "destructive" });
    },
  });

  const updateEnableTransferAgreementMutation = useMutation({
    mutationFn: async (enableTransferAgreement: boolean) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings', { enableTransferAgreement });
      return response.json();
    },
    onSuccess: (_, enableTransferAgreement) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      toast({
        title: enableTransferAgreement ? "Transfer agreements enabled" : "Transfer agreements disabled",
        description: enableTransferAgreement ? "A transfer agreement can be generated for transport events." : "No transfer agreements will be generated.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update transfer agreement settings", description: error.message || "Please try again later.", variant: "destructive" });
    },
  });

  const updateTnrEnabledMutation = useMutation({
    mutationFn: async (tnrEnabled: boolean) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings/tnr', { tnrEnabled });
      return response.json();
    },
    onSuccess: (_, tnrEnabled) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      toast({
        title: tnrEnabled ? "TNR Log enabled" : "TNR Log disabled",
        description: tnrEnabled ? "The TNR Log is now available in the Operations sidebar." : "The TNR Log has been hidden from the sidebar.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update TNR settings", description: error.message || "Please try again later.", variant: "destructive" });
    },
  });

  const updateTwilioMutation = useMutation({
    mutationFn: async (settings: TwilioSettingsData) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings/twilio', settings);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      twilioForm.reset();
      toast({ title: "Twilio configured", description: "SMS messaging is now enabled for transport alerts and foster communications." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to configure Twilio", description: error.message || "Please verify your credentials and try again.", variant: "destructive" });
    },
  });

  const disableTwilioMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', '/api/tenant/settings/twilio');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      toast({ title: "Twilio disabled", description: "SMS messaging has been disabled." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to disable Twilio", description: error.message, variant: "destructive" });
    },
  });

  const testTwilioMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      const response = await apiRequest('POST', '/api/tenant/settings/twilio/test', { phoneNumber });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Test message sent", description: "Check your phone for the test SMS." });
    },
    onError: (error: any) => {
      toast({ title: "Test failed", description: error.message || "Failed to send test SMS.", variant: "destructive" });
    },
  });

  const updateBrandSidMutation = useMutation({
    mutationFn: async (twilioBrandSid: string) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings/twilio/brand-sid', { twilioBrandSid });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      toast({ title: "Brand SID saved", description: "A2P 10DLC Brand Registration SID has been updated." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to save", description: error.message || "Could not save Brand SID.", variant: "destructive" });
    },
  });

  const updateEmailMutation = useMutation({
    mutationFn: async (settings: EmailSettingsData) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings/email', settings);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/email-usage'] });
      toast({ title: "Email configured", description: "Your email service is now active for sending campaigns with unlimited quota." });
      emailForm.reset();
    },
    onError: (error: any) => {
      toast({ title: "Failed to configure email", description: error.message || "Please verify your API keys and try again.", variant: "destructive" });
    },
  });

  if (isOwnerLoading) {
    return (
      <DashboardLayout breadcrumbs={[{ label: "Settings" }, { label: "Integrations" }]}>
        <div className="flex items-center justify-center h-64" data-testid="loading-integrations">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!canViewPage) {
    return (
      <DashboardLayout breadcrumbs={[{ label: "Settings" }, { label: "Integrations" }]}>
        <div className="max-w-2xl mx-auto py-12" data-testid="integrations-access-denied">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-destructive">
                <Shield className="h-6 w-6" />
                <CardTitle>Access Restricted</CardTitle>
              </div>
              <CardDescription>Integration settings can only be accessed by administrators</CardDescription>
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>You don't have permission to view integration settings.</AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      breadcrumbs={[{ label: "Settings" }, { label: "Integrations" }]}
      title="Integrations"
      description="Configure payment processing, SMS, email delivery, and electronic signature services."
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-64" data-testid="loading-integrations">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">
          {isEditRestricted && (
            <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/20" data-testid="alert-view-only">
              <Info className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                <strong>View-Only Mode:</strong> Contact the organization owner for edit permissions.
              </AlertDescription>
            </Alert>
          )}

          {/* Inbound Email Address */}
          {data?.tenant?.subdomain && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Inbox className="h-5 w-5" />
                  <CardTitle>Inbound Email Address</CardTitle>
                </div>
                <CardDescription>
                  Anyone can email documents, updates, and information directly to your rescue at this address
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-3 bg-muted rounded-md font-mono text-sm" data-testid="text-inbound-email">
                    {data.tenant.subdomain}@mail.irescue.life
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(`${data.tenant.subdomain}@mail.irescue.life`);
                      toast({ title: "Email address copied", description: "The inbound email address has been copied to your clipboard." });
                    }}
                    data-testid="button-copy-email"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-3">
                  Share this address with veterinarians, volunteers, donors, and partners. Incoming emails will appear in your <span className="font-medium">Email Inbox</span> for staff to review and process.
                </p>
              </CardContent>
            </Card>
          )}

          <StripeConnectBanner />

          {/* Adoption Fee Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                <CardTitle>Adoption Fee Settings</CardTitle>
              </div>
              <CardDescription>
                Configure how payment processing fees are handled for adoption checkouts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="pass-fees-toggle" className="text-base font-medium">
                    Pass service fees to adopter
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    When enabled, a small service fee (processing + platform fees) is added to the adopter's total.
                    This ensures 100% of the adoption fee goes to your rescue.
                  </p>
                </div>
                <Switch
                  id="pass-fees-toggle"
                  checked={data?.tenant?.passFeesToAdopter || false}
                  disabled={updatePassFeesMutation.isPending || !canEdit}
                  onCheckedChange={(checked) => updatePassFeesMutation.mutate(checked)}
                  data-testid="switch-pass-fees"
                />
              </div>
              {data?.tenant?.passFeesToAdopter && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Adopters will see a service fee breakdown on the checkout page explaining that the fee covers payment processing and helps ensure the full adoption amount goes to your rescue.
                  </AlertDescription>
                </Alert>
              )}

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="require-spay-neuter-toggle" className="text-base font-medium">
                    Require Spay/Neuter Agreement
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    When enabled, adopters of unaltered animals will be required to sign an additional Spay/Neuter Agreement
                    during checkout. This includes a $500 breach penalty clause.
                  </p>
                </div>
                <Switch
                  id="require-spay-neuter-toggle"
                  checked={data?.tenant?.requireSpayNeuterContract || false}
                  disabled={updateRequireSpayNeuterContractMutation.isPending || !canEdit}
                  onCheckedChange={(checked) => updateRequireSpayNeuterContractMutation.mutate(checked)}
                  data-testid="switch-require-spay-neuter"
                />
              </div>
              {data?.tenant?.requireSpayNeuterContract && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    The spay/neuter agreement will only appear for animals that are not already spayed or neutered,
                    and only when staff sets a spay/neuter deadline during checkout.
                  </AlertDescription>
                </Alert>
              )}

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="tnr-enabled-toggle" className="text-base font-medium">
                    TNR Log (Trap-Neuter-Return)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Enable rapid batch-entry logging for TNR programs. Adds a TNR Log page to the Operations sidebar and makes it available as a Quick Action. TNR animals are kept separate from the standard rescue pipeline.
                  </p>
                </div>
                <Switch
                  id="tnr-enabled-toggle"
                  checked={data?.tenant?.tnrEnabled || false}
                  disabled={updateTnrEnabledMutation.isPending || !canEdit}
                  onCheckedChange={(checked) => updateTnrEnabledMutation.mutate(checked)}
                  data-testid="switch-tnr-enabled"
                />
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="surrender-fee-toggle" className="text-base font-medium">
                      Owner Surrender Fee
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      When enabled, staff will be prompted to collect a surrender fee during the intake process.
                      The fee can be waived on a case-by-case basis.
                    </p>
                  </div>
                  <Switch
                    id="surrender-fee-toggle"
                    checked={surrenderFeeEnabled}
                    disabled={updateSurrenderFeeMutation.isPending || !canEdit}
                    onCheckedChange={(checked) => {
                      setSurrenderFeeEnabled(checked);
                      if (!checked) {
                        setSurrenderFeeInput("");
                        updateSurrenderFeeMutation.mutate(null);
                      }
                    }}
                    data-testid="switch-surrender-fee"
                  />
                </div>
                {surrenderFeeEnabled && (
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label htmlFor="surrender-fee-amount" className="text-sm">Default Fee Amount ($)</Label>
                      <Input
                        id="surrender-fee-amount"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="e.g. 75.00"
                        value={surrenderFeeInput}
                        onChange={(e) => setSurrenderFeeInput(e.target.value)}
                        disabled={updateSurrenderFeeMutation.isPending || !canEdit}
                        data-testid="input-default-surrender-fee"
                      />
                    </div>
                    <Button
                      onClick={() => {
                        const val = parseFloat(surrenderFeeInput);
                        if (!isNaN(val) && val > 0) {
                          updateSurrenderFeeMutation.mutate(val.toFixed(2));
                        } else {
                          toast({ title: "Invalid amount", description: "Please enter a valid fee amount greater than 0.", variant: "destructive" });
                        }
                      }}
                      disabled={updateSurrenderFeeMutation.isPending || !canEdit}
                      data-testid="button-save-surrender-fee"
                    >
                      {updateSurrenderFeeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                    </Button>
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="enable-transfer-agreement-toggle" className="text-base font-medium">
                    Enable Transfer Agreements
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    When enabled, you can generate transfer agreements for transport events.
                    These agreements document the transfer of animal ownership between organizations.
                  </p>
                </div>
                <Switch
                  id="enable-transfer-agreement-toggle"
                  checked={data?.tenant?.enableTransferAgreement || false}
                  disabled={updateEnableTransferAgreementMutation.isPending || !canEdit}
                  onCheckedChange={(checked) => updateEnableTransferAgreementMutation.mutate(checked)}
                  data-testid="switch-enable-transfer-agreement"
                />
              </div>
              {data?.tenant?.enableTransferAgreement && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Transfer agreements can be generated from the Collaboration Hub when viewing transport details.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Stripe API Keys - platform admins only */}
          {user?.roles?.includes('platform_admin') && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    <CardTitle>Stripe API Keys (Advanced)</CardTitle>
                  </div>
                  {data?.tenant?.stripeEnabled && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Active</span>
                    </div>
                  )}
                </div>
                <CardDescription>
                  For advanced users: configure your own Stripe API keys for direct integration.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {data?.tenant?.stripeEnabled ? (
                  <>
                    <Alert>
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertDescription>
                        Stripe is configured and active. Donors can now make credit card donations, and payments will be tracked automatically.
                      </AlertDescription>
                    </Alert>
                    <div className="space-y-2">
                      <Label>Publishable Key</Label>
                      <div className="flex items-center gap-2">
                        <Input value={data.tenant.stripePublishableKey || ""} disabled className="font-mono text-sm" data-testid="display-stripe-publishable-key" />
                      </div>
                      <p className="text-xs text-muted-foreground">To update your Stripe keys, enter new keys below.</p>
                    </div>
                  </>
                ) : (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>Stripe is not configured. Add your API keys below to start accepting card donations.</AlertDescription>
                  </Alert>
                )}

                <Separator />

                <Form {...stripeForm}>
                  <form onSubmit={stripeForm.handleSubmit((d) => updateStripeMutation.mutate(d))} className="space-y-4">
                    <FormField
                      control={stripeForm.control}
                      name="stripePublishableKey"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Publishable Key</FormLabel>
                          <FormControl>
                            <Input placeholder="pk_live_..." className="font-mono" data-testid="input-stripe-publishable-key" {...field} />
                          </FormControl>
                          <FormDescription>Your Stripe publishable key (starts with pk_)</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={stripeForm.control}
                      name="stripeSecretKey"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Secret Key</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="sk_live_..." className="font-mono" data-testid="input-stripe-secret-key" {...field} />
                          </FormControl>
                          <FormDescription>Your Stripe secret key (starts with sk_) - kept encrypted in our database</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={stripeForm.control}
                      name="stripeWebhookSecret"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Webhook Secret (Optional)</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="whsec_..." className="font-mono" data-testid="input-stripe-webhook-secret" {...field} />
                          </FormControl>
                          <FormDescription>Your Stripe webhook signing secret for automatic payment tracking (optional)</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-end pt-2">
                      <Button type="submit" disabled={updateStripeMutation.isPending || !canEdit} data-testid="button-save-stripe">
                        {updateStripeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        <Save className="h-4 w-4 mr-2" />
                        {data?.tenant?.stripeEnabled ? "Update Stripe Keys" : "Enable Stripe"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}

          {/* SMS Messaging / Twilio */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  <CardTitle>SMS Messaging (Twilio)</CardTitle>
                </div>
                {data?.tenant?.twilioEnabled && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Active</span>
                  </div>
                )}
              </div>
              <CardDescription>
                Enable SMS alerts for transport coordination and private foster/adopter communications.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {data?.tenant?.twilioEnabled ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <span>Twilio is configured with number {data.tenant.twilioPhoneNumber}</span>
                      {data.tenant.twilioMessagingServiceSid && (
                        <span className="text-xs text-muted-foreground">Messaging Service: {data.tenant.twilioMessagingServiceSid}</span>
                      )}
                      {(data.tenant as any).twilioBrandSid && (
                        <span className="text-xs text-muted-foreground">Brand SID: {(data.tenant as any).twilioBrandSid}</span>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => disableTwilioMutation.mutate()}
                      disabled={disableTwilioMutation.isPending}
                      data-testid="button-disable-twilio"
                    >
                      {disableTwilioMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Disable
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Twilio is not configured. Add your credentials below to enable SMS messaging.{' '}
                    <a href="https://www.twilio.org/impact-access-nonprofits/" target="_blank" rel="noopener noreferrer" className="underline">
                      Apply for nonprofit credits ($100+)
                    </a>
                  </AlertDescription>
                </Alert>
              )}

              {data?.tenant?.twilioEnabled && (
                <div className="rounded-lg border p-4 space-y-3">
                  <h4 className="text-sm font-medium">Send Test SMS</h4>
                  <div className="flex gap-2">
                    <Input
                      placeholder="(555) 867-5309"
                      value={testPhoneNumber}
                      onChange={(e) => setTestPhoneNumber(e.target.value)}
                      className="font-mono flex-1"
                      data-testid="input-test-phone"
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        const stripped = testPhoneNumber.replace(/[\s\-().]/g, '');
                        const normalized = /^\d{10}$/.test(stripped) ? `+1${stripped}` : /^1\d{10}$/.test(stripped) ? `+${stripped}` : stripped;
                        testTwilioMutation.mutate(normalized);
                      }}
                      disabled={!testPhoneNumber || testTwilioMutation.isPending}
                      data-testid="button-test-sms"
                    >
                      {testTwilioMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      <Phone className="h-4 w-4 mr-2" />
                      Send Test
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">US numbers like (555) 867-5309 work as-is — international numbers need a + country code prefix</p>
                </div>
              )}

              {data?.tenant?.twilioEnabled && (
                <div className="rounded-lg border p-4 space-y-3">
                  <div>
                    <h4 className="text-sm font-medium">A2P Brand Registration SID</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">Stored for compliance tracking only — not used for sending</p>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="BNxxxxxxxxxxxxxx"
                      value={brandSidValue}
                      onChange={(e) => setBrandSidValue(e.target.value)}
                      className="font-mono flex-1"
                      data-testid="input-brand-sid"
                    />
                    <Button
                      variant="outline"
                      onClick={() => updateBrandSidMutation.mutate(brandSidValue)}
                      disabled={updateBrandSidMutation.isPending || !canEdit}
                      data-testid="button-save-brand-sid"
                    >
                      {updateBrandSidMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      <Save className="h-4 w-4 mr-2" />
                      Save
                    </Button>
                  </div>
                </div>
              )}

              {!data?.tenant?.twilioEnabled && (
                <>
                  <Separator />
                  <Form {...twilioForm}>
                    <form onSubmit={twilioForm.handleSubmit((d) => updateTwilioMutation.mutate(d))} className="space-y-4">
                      <FormField
                        control={twilioForm.control}
                        name="twilioAccountSid"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Account SID</FormLabel>
                            <FormControl>
                              <Input placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="font-mono" data-testid="input-twilio-account-sid" {...field} />
                            </FormControl>
                            <FormDescription>Find this in your Twilio Console dashboard</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={twilioForm.control}
                        name="twilioAuthToken"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Auth Token</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Your Auth Token" className="font-mono" data-testid="input-twilio-auth-token" {...field} />
                            </FormControl>
                            <FormDescription>Keep this secret - it will be encrypted at rest</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={twilioForm.control}
                        name="twilioPhoneNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Twilio Phone Number</FormLabel>
                            <FormControl>
                              <Input placeholder="+15551234567" className="font-mono" data-testid="input-twilio-phone-number" {...field} />
                            </FormControl>
                            <FormDescription>Your Twilio phone number in E.164 format</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={twilioForm.control}
                        name="twilioMessagingServiceSid"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Messaging Service SID (Optional)</FormLabel>
                            <FormControl>
                              <Input placeholder="MGxxxxxxxxxxxxxx" className="font-mono" data-testid="input-twilio-messaging-service-sid" {...field} />
                            </FormControl>
                            <FormDescription>
                              If you have a registered A2P 10DLC campaign, enter your Messaging Service SID (starts with MG) for better deliverability
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={twilioForm.control}
                        name="twilioBrandSid"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Brand Registration SID (Optional)</FormLabel>
                            <FormControl>
                              <Input placeholder="BNxxxxxxxxxxxxxx" className="font-mono" data-testid="input-twilio-brand-sid" {...field} />
                            </FormControl>
                            <FormDescription>
                              Your A2P 10DLC Brand Registration SID (starts with BN) — stored for compliance tracking, not used for sending
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end pt-2">
                        <Button type="submit" disabled={updateTwilioMutation.isPending || !canEdit} data-testid="button-save-twilio">
                          {updateTwilioMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          <Save className="h-4 w-4 mr-2" />
                          Enable Twilio
                        </Button>
                      </div>
                    </form>
                  </Form>
                </>
              )}

              <div className="rounded-lg bg-muted/50 p-4">
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Features Enabled with Twilio
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3" /> Transport SMS alerts for drivers and coordinators</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3" /> Foster/adopter privacy messaging (phone number masking)</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3" /> Emergency broadcast notifications</li>
                </ul>
                <p className="text-xs text-muted-foreground mt-2">
                  <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" className="underline">Twilio Console</a>
                  {' | '}
                  <a href="https://www.twilio.org/impact-access-nonprofits/" target="_blank" rel="noopener noreferrer" className="underline">Nonprofit Credits (Impact Access)</a>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Electronic Signatures */}
          {!isLiteTier && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileSignature className="h-5 w-5" />
                    <CardTitle>Electronic Signatures</CardTitle>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Built-in</span>
                  </div>
                </div>
                <CardDescription>
                  Native electronic signatures for adoption contracts. No external service required.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    Electronic signatures are built into iRescue.life. When you start an adoption checkout, adopters receive an email with a link to review the contract, sign electronically, and complete payment.
                  </AlertDescription>
                </Alert>
                <div className="rounded-lg bg-muted/50 p-4">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    E-Signature Features
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3" /> Draw-to-sign signature capture</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3" /> IP address and timestamp recorded for legal verification</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3" /> Auto-update application status when contract is signed</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3" /> Signed PDF generated with embedded signature</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3" /> Signed documents saved to Google Drive (if connected)</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Email Services / Resend */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  <CardTitle>Email Services</CardTitle>
                </div>
                {(emailUsage?.usePlatformKey || data?.tenant?.resendEnabled) && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Active</span>
                  </div>
                )}
              </div>
              <CardDescription>
                Send newsletters, campaigns, and updates. Configure your own Resend API key for unlimited emails, or use our shared service (1,000 emails/month).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {emailUsage && (
                <div className="rounded-lg border p-4 space-y-3" data-testid="card-email-usage">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Email Usage This Month</h4>
                    {emailUsage.usePlatformKey ? (
                      <span className="text-xs px-2 py-1 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">Platform Account</span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-md bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">Your Account</span>
                    )}
                  </div>
                  {emailUsage.usePlatformKey && (
                    <>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{emailUsage.sent} / {emailUsage.limit} emails sent</span>
                          <span className="font-medium">{emailUsage.remaining} remaining</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full transition-all ${emailUsage.remaining < 100 ? 'bg-destructive' : emailUsage.remaining < 300 ? 'bg-yellow-500' : 'bg-primary'}`}
                            style={{ width: `${(emailUsage.sent / emailUsage.limit) * 100}%` }}
                            data-testid="progress-email-usage"
                          />
                        </div>
                      </div>
                      {emailUsage.remaining < 100 && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            You're running low on emails. Configure your own Resend API key below for unlimited sending.
                          </AlertDescription>
                        </Alert>
                      )}
                    </>
                  )}
                  {!emailUsage.usePlatformKey && emailUsage.hasOwnApiKey && (
                    <Alert>
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertDescription>You're using your own Resend account with unlimited email sending.</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {data?.tenant?.resendEnabled && (
                <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                  <Label className="text-xs text-muted-foreground">Current Configuration</Label>
                  <div className="space-y-1">
                    <div className="text-sm"><span className="text-muted-foreground">From:</span> <span className="font-mono">{data.tenant.resendFromEmail}</span></div>
                    <div className="text-sm"><span className="text-muted-foreground">Name:</span> {data.tenant.resendFromName}</div>
                  </div>
                </div>
              )}

              <Separator />

              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  <strong>Optional Configuration (Enterprise):</strong> Configure your own Resend account below for unlimited email sending. By default, you'll use our shared platform account with a monthly quota based on your plan (Starter: 500, Professional: 5,000, Enterprise: 25,000). Get your own Resend API key at{' '}
                  <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">resend.com</a>
                  {' '}(3,000 free emails/month on their free tier).
                </p>
              </div>

              <Accordion type="single" collapsible className="border rounded-lg">
                <AccordionItem value="dns-guide" className="border-0">
                  <AccordionTrigger className="px-4 hover:no-underline hover-elevate">
                    <div className="flex items-center gap-2">
                      <HelpCircle className="h-4 w-4 text-primary" />
                      <span className="font-medium">How to Set Up Your Custom Email Domain</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="space-y-6 text-sm">
                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                          To send emails from your own domain (e.g., <code className="px-1 py-0.5 bg-muted rounded">contact@yourrescue.org</code>), you'll need to configure DNS records at your domain hosting provider.
                        </AlertDescription>
                      </Alert>
                      <div className="space-y-4">
                        {[
                          { step: 1, title: "Sign up for Resend", desc: <span>Create a free account at <a href="https://resend.com/signup" target="_blank" rel="noopener noreferrer" className="text-primary underline">resend.com/signup</a> (includes 3,000 free emails/month)</span> },
                          { step: 2, title: "Add Your Domain in Resend", desc: <span>Go to <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="text-primary underline">resend.com/domains</a> and add your domain</span> },
                          { step: 3, title: "Configure DNS Records", desc: "Resend will provide you with DNS records to add at your domain hosting provider (GoDaddy, Cloudflare, Namecheap, etc.)" },
                          { step: 4, title: "Wait for DNS Propagation", desc: "DNS changes can take anywhere from a few minutes to 48 hours to propagate." },
                          { step: 5, title: "Get Your API Key", desc: <span>Once your domain is verified, go to <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">resend.com/api-keys</a> and create a new API key.</span> },
                          { step: 6, title: "Configure Settings Below", desc: "Enter your Resend API key, from email address, and from name in the form below." },
                        ].map(({ step, title, desc }) => (
                          <div key={step} className="flex items-start gap-3">
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">{step}</div>
                            <div className="space-y-1 flex-1">
                              <h4 className="font-semibold">{title}</h4>
                              <p className="text-muted-foreground">{desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <Form {...emailForm}>
                <form onSubmit={emailForm.handleSubmit((d) => updateEmailMutation.mutate(d))} className="space-y-4">
                  <FormField
                    control={emailForm.control}
                    name="resendApiKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Resend API Key (Optional)</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="re_..." className="font-mono" data-testid="input-resend-api-key" {...field} />
                        </FormControl>
                        <FormDescription>Your Resend API key (starts with re_) - kept encrypted in our database</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={emailForm.control}
                    name="resendFromEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>From Email Address</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="noreply@yourrescue.org" data-testid="input-resend-from-email" {...field} />
                        </FormControl>
                        <FormDescription>The email address that will appear in the "From" field (must be verified in Resend)</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={emailForm.control}
                    name="resendFromName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>From Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Happy Paws Rescue" data-testid="input-resend-from-name" {...field} />
                        </FormControl>
                        <FormDescription>The name that will appear in the "From" field (e.g., your rescue name)</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Separator />
                  <FormField
                    control={emailForm.control}
                    name="constantContactApiKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Constant Contact API Key (Optional)</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Your Constant Contact API key" className="font-mono" data-testid="input-constant-contact-api-key" {...field} />
                        </FormControl>
                        <FormDescription>Optional: Connect Constant Contact for advanced email marketing features</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={updateEmailMutation.isPending || !canEdit} data-testid="button-save-email">
                      {updateEmailMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      <Save className="h-4 w-4 mr-2" />
                      {data?.tenant?.resendEnabled ? "Update Email Settings" : "Enable Email Service"}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { CustomDomainSettings } from "@/components/CustomDomainSettings";
import { ActionCircleSettings } from "@/components/ActionCircleSettings";
import { HeroLayoutSettings } from "@/components/HeroLayoutSettings";
import MascotSettings from "@/components/MascotSettings";
import NotificationSettings from "@/components/NotificationSettings";
import MedicalReminderSettings from "@/components/MedicalReminderSettings";
import VolunteerAlertSettings from "@/components/VolunteerAlertSettings";
import VolunteerDigestSettings from "@/components/VolunteerDigestSettings";
import { GoveeSettings } from "@/components/GoveeSettings";
import { StripeConnectBanner } from "@/components/StripeConnectBanner";
import { Save, Loader2, DollarSign, CreditCard, AlertCircle, CheckCircle2, Mail, Palette, Globe, ExternalLink, Copy, Inbox, HelpCircle, Check, Info, MessageSquare, Phone, FileSignature, Heart, Shield, Star, Users, Home, HandHeart, PawPrint, Upload, FileUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { z } from "zod";
import type { Tenant } from "@shared/schema";
import { ObjectUploader } from "@/components/ObjectUploader";
import { RichTextEditor } from "@/components/RichTextEditor";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const urlOrPathSchema = z.string().refine(
  (val) => val === "" || val.startsWith("/") || val.startsWith("http://") || val.startsWith("https://"),
  { message: "Must be a valid URL or storage path" }
).optional().or(z.literal(""));

const sponsorLogoSchema = z.object({
  id: z.string(),
  imageUrl: z.string(),
  altText: z.string(),
  linkUrl: z.string().optional(),
});

const brandingSettingsSchema = z.object({
  name: z.string().min(1, "Organization name is required"),
  tagline: z.string().optional(),
  missionStatement: z.string().optional(),
  logoUrl: urlOrPathSchema,
  heroImageUrl: urlOrPathSchema,
  heroMobileImageUrl: urlOrPathSchema,
  heroHeadline: z.string().optional(),
  heroButtonText: z.string().optional(),
  heroButton2Text: z.string().optional(),
  heroFocalPoint: z.enum(["center", "top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"]).optional(),
  announcementBarEnabled: z.boolean().optional(),
  announcementBarText: z.string().optional(),
  announcementBarLinkText: z.string().optional(),
  announcementBarLinkUrl: z.string().optional(),
  announcementBarStyle: z.enum(["info", "warning", "urgent"]).optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  accentColor: z.string().optional(),
  successColor: z.string().optional(),
  warningColor: z.string().optional(),
  destructiveColor: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  formNotificationsEnabled: z.boolean().optional(),
  formNotificationEmail: z.string().email().optional().or(z.literal("")),
  footerText: z.string().optional(),
  footerHours: z.string().optional(),
  footerAddress: z.string().optional(),
  socialFacebook: z.string().url().optional().or(z.literal("")),
  socialInstagram: z.string().url().optional().or(z.literal("")),
  socialYoutube: z.string().url().optional().or(z.literal("")),
  socialTiktok: z.string().url().optional().or(z.literal("")),
  sponsorLogos: z.array(sponsorLogoSchema).optional(),
});

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

const customDomainSchema = z.object({
  customDomain: z.string().min(1, "Domain is required").regex(/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i, "Invalid domain format"),
});

const twilioSettingsSchema = z.object({
  twilioAccountSid: z.string().min(1, "Account SID is required").startsWith("AC", "Account SID must start with AC"),
  twilioAuthToken: z.string().min(1, "Auth Token is required"),
  twilioPhoneNumber: z.string().min(1, "Phone number is required").regex(/^\+[1-9]\d{1,14}$/, "Phone number must be in E.164 format (e.g., +15551234567)"),
});

const donationSectionSchema = z.object({
  sectionHeading: z.string().max(100).optional(),
  sectionDescription: z.string().max(500).optional(),
  monthlyGivingTitle: z.string().max(100).optional(),
  monthlyGivingDescription: z.string().max(500).optional(),
  monthlyGivingIcon: z.enum(["shield", "heart", "paw", "star", "hand-heart", "users", "home"]).optional(),
  oneTimeButtonText: z.string().max(50).optional(),
  monthlyButtonText: z.string().max(50).optional(),
  amazonWishListUrl: z.string().url().optional().or(z.literal("")),
  chewyWishListUrl: z.string().url().optional().or(z.literal("")),
});

type BrandingSettingsData = z.infer<typeof brandingSettingsSchema>;
type DonationSectionData = z.infer<typeof donationSectionSchema>;
type StripeSettingsData = z.infer<typeof stripeSettingsSchema>;
type EmailSettingsData = z.infer<typeof emailSettingsSchema>;
type CustomDomainData = z.infer<typeof customDomainSchema>;
type TwilioSettingsData = z.infer<typeof twilioSettingsSchema>;

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant/settings'],
  });

  const { data: emailUsage } = useQuery<{
    sent: number;
    limit: number;
    remaining: number;
    lastReset: string;
    usePlatformKey: boolean;
    hasOwnApiKey: boolean;
  }>({
    queryKey: ['/api/tenant/email-usage'],
  });

  // Subscription status query
  const { data: subscriptionData, isLoading: isSubscriptionLoading } = useQuery<{
    tenantId: string;
    tier: string;
    status: string;
    stripeStatus: string | null;
    currentPeriodEnd: string | null;
  }>({
    queryKey: ['/api/platform/subscription-status', data?.tenant?.id],
    enabled: !!data?.tenant?.id,
  });

  // Billing portal mutation
  const createBillingPortalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/platform/create-billing-portal-session', {
        tenantId: data?.tenant?.id,
        returnUrl: window.location.href,
      });
      return response.json();
    },
    onSuccess: (result) => {
      if (result.url) {
        window.location.href = result.url;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Unable to open billing portal",
        description: error.message || "Please try again or contact support.",
        variant: "destructive",
      });
    },
  });

  const updateBrandingMutation = useMutation({
    mutationFn: async (settings: BrandingSettingsData) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings/branding', settings);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      toast({
        title: "Branding saved",
        description: "Your organization's branding has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save branding",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const updateStripeMutation = useMutation({
    mutationFn: async (settings: StripeSettingsData) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings/stripe', settings);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      toast({
        title: "Stripe configured",
        description: "Your Stripe integration is now active for processing donations.",
      });
      stripeForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to configure Stripe",
        description: error.message || "Please verify your API keys and try again.",
        variant: "destructive",
      });
    },
  });

  // Pass fees to adopter toggle mutation
  const updatePassFeesMutation = useMutation({
    mutationFn: async (passFeesToAdopter: boolean) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings', { passFeesToAdopter });
      return response.json();
    },
    onSuccess: (_, passFeesToAdopter) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      toast({
        title: passFeesToAdopter ? "Fee passthrough enabled" : "Fee passthrough disabled",
        description: passFeesToAdopter 
          ? "Adopters will now pay service fees on checkout." 
          : "Your rescue will now absorb service fees.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update fee settings",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
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
      toast({
        title: "Twilio configured",
        description: "SMS messaging is now enabled for transport alerts and foster communications.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to configure Twilio",
        description: error.message || "Please verify your credentials and try again.",
        variant: "destructive",
      });
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
      toast({
        title: "Twilio disabled",
        description: "SMS messaging has been disabled.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to disable Twilio",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const testTwilioMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      const response = await apiRequest('POST', '/api/tenant/settings/twilio/test', { phoneNumber });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Test message sent",
        description: "Check your phone for the test SMS.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Test failed",
        description: error.message || "Failed to send test SMS.",
        variant: "destructive",
      });
    },
  });

  const updateDonationSectionMutation = useMutation({
    mutationFn: async (settings: DonationSectionData) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings/donation-section', settings);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      toast({
        title: "Donation section updated",
        description: "Your donation section text and styling have been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update donation section",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const brandingForm = useForm<BrandingSettingsData>({
    resolver: zodResolver(brandingSettingsSchema),
    defaultValues: {
      name: data?.tenant?.name || "",
      tagline: data?.tenant?.tagline || "",
      missionStatement: data?.tenant?.missionStatement || "",
      logoUrl: data?.tenant?.logoUrl || "",
      heroImageUrl: data?.tenant?.heroImageUrl || "",
      heroMobileImageUrl: (data?.tenant as any)?.heroMobileImageUrl || "",
      heroHeadline: data?.tenant?.heroHeadline || "",
      heroButtonText: data?.tenant?.heroButtonText || "",
      heroButton2Text: data?.tenant?.heroButton2Text || "",
      heroFocalPoint: (data?.tenant as any)?.heroFocalPoint || "center",
      announcementBarEnabled: (data?.tenant?.announcementBar as any)?.enabled || false,
      announcementBarText: (data?.tenant?.announcementBar as any)?.text || "",
      announcementBarLinkText: (data?.tenant?.announcementBar as any)?.linkText || "",
      announcementBarLinkUrl: (data?.tenant?.announcementBar as any)?.linkUrl || "",
      announcementBarStyle: (data?.tenant?.announcementBar as any)?.style || "info",
      primaryColor: (data?.tenant?.branding as any)?.primaryColor || "",
      secondaryColor: (data?.tenant?.branding as any)?.secondaryColor || "",
      accentColor: (data?.tenant?.branding as any)?.accentColor || "",
      successColor: (data?.tenant?.branding as any)?.successColor || "",
      warningColor: (data?.tenant?.branding as any)?.warningColor || "",
      destructiveColor: (data?.tenant?.branding as any)?.destructiveColor || "",
      contactEmail: data?.tenant?.contactEmail || "",
      contactPhone: data?.tenant?.contactPhone || "",
      formNotificationsEnabled: data?.tenant?.formNotificationsEnabled || false,
      formNotificationEmail: data?.tenant?.formNotificationEmail || "",
      footerText: data?.tenant?.footerText || "",
      footerHours: data?.tenant?.footerHours || "",
      footerAddress: data?.tenant?.footerAddress || "",
      socialFacebook: data?.tenant?.socialFacebook || "",
      socialInstagram: data?.tenant?.socialInstagram || "",
      socialYoutube: data?.tenant?.socialYoutube || "",
      socialTiktok: data?.tenant?.socialTiktok || "",
      sponsorLogos: (data?.tenant?.sponsorLogos as any[]) || [],
    },
    values: data?.tenant ? {
      name: data.tenant.name || "",
      tagline: data.tenant.tagline || "",
      missionStatement: data.tenant.missionStatement || "",
      logoUrl: data.tenant.logoUrl || "",
      heroImageUrl: data.tenant.heroImageUrl || "",
      heroMobileImageUrl: (data.tenant as any)?.heroMobileImageUrl || "",
      heroHeadline: data.tenant.heroHeadline || "",
      heroButtonText: data.tenant.heroButtonText || "",
      heroButton2Text: data.tenant.heroButton2Text || "",
      heroFocalPoint: (data.tenant as any)?.heroFocalPoint || "center",
      announcementBarEnabled: (data.tenant.announcementBar as any)?.enabled || false,
      announcementBarText: (data.tenant.announcementBar as any)?.text || "",
      announcementBarLinkText: (data.tenant.announcementBar as any)?.linkText || "",
      announcementBarLinkUrl: (data.tenant.announcementBar as any)?.linkUrl || "",
      announcementBarStyle: (data.tenant.announcementBar as any)?.style || "info",
      primaryColor: (data.tenant.branding as any)?.primaryColor || "",
      secondaryColor: (data.tenant.branding as any)?.secondaryColor || "",
      accentColor: (data.tenant.branding as any)?.accentColor || "",
      successColor: (data.tenant.branding as any)?.successColor || "",
      warningColor: (data.tenant.branding as any)?.warningColor || "",
      destructiveColor: (data.tenant.branding as any)?.destructiveColor || "",
      contactEmail: data.tenant.contactEmail || "",
      contactPhone: data.tenant.contactPhone || "",
      formNotificationsEnabled: data.tenant.formNotificationsEnabled || false,
      formNotificationEmail: data.tenant.formNotificationEmail || "",
      footerText: data.tenant.footerText || "",
      footerHours: data.tenant.footerHours || "",
      footerAddress: data.tenant.footerAddress || "",
      socialFacebook: data.tenant.socialFacebook || "",
      socialInstagram: data.tenant.socialInstagram || "",
      socialYoutube: data.tenant.socialYoutube || "",
      socialTiktok: data.tenant.socialTiktok || "",
      sponsorLogos: (data.tenant.sponsorLogos as any[]) || [],
    } : undefined,
  });

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
    },
  });

  const donationSectionForm = useForm<DonationSectionData>({
    resolver: zodResolver(donationSectionSchema),
    defaultValues: {
      sectionHeading: (data?.tenant as any)?.donationSection?.sectionHeading || "",
      sectionDescription: (data?.tenant as any)?.donationSection?.sectionDescription || "",
      monthlyGivingTitle: (data?.tenant as any)?.donationSection?.monthlyGivingTitle || "",
      monthlyGivingDescription: (data?.tenant as any)?.donationSection?.monthlyGivingDescription || "",
      monthlyGivingIcon: (data?.tenant as any)?.donationSection?.monthlyGivingIcon || "shield",
      oneTimeButtonText: (data?.tenant as any)?.donationSection?.oneTimeButtonText || "",
      monthlyButtonText: (data?.tenant as any)?.donationSection?.monthlyButtonText || "",
      amazonWishListUrl: (data?.tenant as any)?.donationSection?.amazonWishListUrl || "",
      chewyWishListUrl: (data?.tenant as any)?.donationSection?.chewyWishListUrl || "",
    },
    values: data?.tenant ? {
      sectionHeading: (data.tenant as any)?.donationSection?.sectionHeading || "",
      sectionDescription: (data.tenant as any)?.donationSection?.sectionDescription || "",
      monthlyGivingTitle: (data.tenant as any)?.donationSection?.monthlyGivingTitle || "",
      monthlyGivingDescription: (data.tenant as any)?.donationSection?.monthlyGivingDescription || "",
      monthlyGivingIcon: (data.tenant as any)?.donationSection?.monthlyGivingIcon || "shield",
      oneTimeButtonText: (data.tenant as any)?.donationSection?.oneTimeButtonText || "",
      monthlyButtonText: (data.tenant as any)?.donationSection?.monthlyButtonText || "",
      amazonWishListUrl: (data.tenant as any)?.donationSection?.amazonWishListUrl || "",
      chewyWishListUrl: (data.tenant as any)?.donationSection?.chewyWishListUrl || "",
    } : undefined,
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

  const updateEmailMutation = useMutation({
    mutationFn: async (settings: EmailSettingsData) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings/email', settings);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/email-usage'] });
      toast({
        title: "Email configured",
        description: "Your email service is now active for sending campaigns with unlimited quota.",
      });
      emailForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to configure email",
        description: error.message || "Please verify your API keys and try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmitBranding = (data: BrandingSettingsData) => {
    updateBrandingMutation.mutate(data);
  };

  const onSubmitStripe = (data: StripeSettingsData) => {
    updateStripeMutation.mutate(data);
  };

  const onSubmitTwilio = (data: TwilioSettingsData) => {
    updateTwilioMutation.mutate(data);
  };

  const onSubmitDonationSection = (data: DonationSectionData) => {
    updateDonationSectionMutation.mutate(data);
  };

  const [testPhoneNumber, setTestPhoneNumber] = useState("");

  const onSubmitEmail = (data: EmailSettingsData) => {
    updateEmailMutation.mutate(data);
  };

  return (
    <DashboardLayout
      breadcrumbs={[
        { label: "Settings" }
      ]}
    >
      {isLoading ? (
              <div className="flex items-center justify-center h-64" data-testid="loading-settings">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <div className="max-w-2xl space-y-6">
                {/* Billing & Subscription */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      <CardTitle>Billing & Subscription</CardTitle>
                    </div>
                    <CardDescription>
                      Manage your iRescue.life subscription, update payment methods, or cancel your account
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {isSubscriptionLoading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Loading subscription info...</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Plan:</span>
                            <Badge variant="secondary" className="capitalize" data-testid="badge-subscription-tier">
                              {subscriptionData?.tier || 'Trial'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Status:</span>
                            <Badge 
                              variant={
                                subscriptionData?.status === 'active' || subscriptionData?.stripeStatus === 'active' 
                                  ? 'default' 
                                  : subscriptionData?.status === 'trial' || subscriptionData?.stripeStatus === 'trialing'
                                    ? 'secondary'
                                    : 'destructive'
                              }
                              className="capitalize"
                              data-testid="badge-subscription-status"
                            >
                              {subscriptionData?.stripeStatus === 'trialing' ? 'Trial' : 
                               subscriptionData?.stripeStatus || subscriptionData?.status || 'Unknown'}
                            </Badge>
                          </div>
                        </div>

                        {subscriptionData?.currentPeriodEnd && (
                          <p className="text-sm text-muted-foreground">
                            {subscriptionData.stripeStatus === 'trialing' ? 'Trial ends' : 'Next billing date'}:{' '}
                            <span className="font-medium">
                              {new Date(subscriptionData.currentPeriodEnd).toLocaleDateString()}
                            </span>
                          </p>
                        )}

                        <Separator />

                        <div className="space-y-3">
                          <p className="text-sm text-muted-foreground">
                            Use the billing portal to update your payment method, view invoices, change your plan, or cancel your subscription.
                          </p>
                          <Button
                            onClick={() => createBillingPortalMutation.mutate()}
                            disabled={createBillingPortalMutation.isPending || !data?.tenant?.stripeCustomerId}
                            data-testid="button-manage-billing"
                          >
                            {createBillingPortalMutation.isPending ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Opening Portal...
                              </>
                            ) : (
                              <>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Manage Subscription
                              </>
                            )}
                          </Button>
                          {!data?.tenant?.stripeCustomerId && (
                            <p className="text-sm text-muted-foreground">
                              No billing account found. Contact support if you need assistance.
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

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
                            toast({
                              title: "Email address copied",
                              description: "The inbound email address has been copied to your clipboard.",
                            });
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

                {/* Branding & Appearance */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Palette className="h-5 w-5" />
                      <CardTitle>Branding & Appearance</CardTitle>
                    </div>
                    <CardDescription>
                      Customize your organization's branding to make your site unique
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...brandingForm}>
                      <form onSubmit={brandingForm.handleSubmit(onSubmitBranding)} className="space-y-6">
                        <FormField
                          control={brandingForm.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Organization Name</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Your Rescue Name" 
                                  data-testid="input-org-name"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                The name of your rescue organization
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={brandingForm.control}
                          name="tagline"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tagline</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Saving lives, one paw at a time" 
                                  data-testid="input-tagline"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                A short tagline displayed in the hero section
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={brandingForm.control}
                          name="missionStatement"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Mission Statement / About Us</FormLabel>
                              <FormControl>
                                <RichTextEditor
                                  value={field.value || ""}
                                  onChange={field.onChange}
                                  placeholder="Tell visitors about your organization's mission, values, and the work you do..."
                                  minHeight="180px"
                                  data-testid="editor-mission-statement"
                                />
                              </FormControl>
                              <FormDescription>
                                A detailed description of your organization displayed in the About Us section (supports rich text formatting)
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={brandingForm.control}
                          name="logoUrl"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Logo</FormLabel>
                              <FormControl>
                                <ObjectUploader
                                  value={field.value ? [field.value] : []}
                                  onChange={(urls) => field.onChange(urls[0] || "")}
                                  maxFiles={1}
                                  accept="image/*"
                                  data-testid="uploader-logo"
                                />
                              </FormControl>
                              <FormDescription>
                                Upload your organization's logo (recommended: square image, 200x200px or larger)
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={brandingForm.control}
                          name="heroImageUrl"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Homepage Hero Image</FormLabel>
                              <FormControl>
                                <ObjectUploader
                                  value={field.value ? [field.value] : []}
                                  onChange={(urls) => field.onChange(urls[0] || "")}
                                  maxFiles={1}
                                  accept="image/*"
                                  data-testid="uploader-hero"
                                />
                              </FormControl>
                              <FormDescription>
                                Upload a background image for your homepage hero section (recommended: 1920x1080px or larger)
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={brandingForm.control}
                          name="heroMobileImageUrl"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Mobile Hero Image (Optional)</FormLabel>
                              <FormControl>
                                <ObjectUploader
                                  value={field.value ? [field.value] : []}
                                  onChange={(urls) => field.onChange(urls[0] || "")}
                                  maxFiles={1}
                                  accept="image/*"
                                  data-testid="uploader-hero-mobile"
                                />
                              </FormControl>
                              <FormDescription>
                                Upload a separate hero image optimized for mobile devices (portrait orientation, 1080x1920px recommended). If not provided, the main hero image will be used with the focus point setting above.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={brandingForm.control}
                          name="heroHeadline"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Hero Headline</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Find Your Perfect Companion" 
                                  data-testid="input-hero-headline"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                Custom headline for your homepage hero section. Leave empty to use your organization name.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={brandingForm.control}
                            name="heroButtonText"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Primary Button Text</FormLabel>
                                <FormControl>
                                  <Input 
                                    placeholder="Meet Our Pets" 
                                    data-testid="input-hero-button"
                                    {...field} 
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={brandingForm.control}
                            name="heroButton2Text"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Secondary Button Text</FormLabel>
                                <FormControl>
                                  <Input 
                                    placeholder="Donate Now" 
                                    data-testid="input-hero-button2"
                                    {...field} 
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={brandingForm.control}
                          name="heroFocalPoint"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Hero Image Focus Point</FormLabel>
                              <Select 
                                value={field.value || "center"} 
                                onValueChange={field.onChange}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="select-hero-focal-point">
                                    <SelectValue placeholder="Select focus area" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="center">Center</SelectItem>
                                  <SelectItem value="top">Top</SelectItem>
                                  <SelectItem value="bottom">Bottom</SelectItem>
                                  <SelectItem value="left">Left</SelectItem>
                                  <SelectItem value="right">Right</SelectItem>
                                  <SelectItem value="top-left">Top Left</SelectItem>
                                  <SelectItem value="top-right">Top Right</SelectItem>
                                  <SelectItem value="bottom-left">Bottom Left</SelectItem>
                                  <SelectItem value="bottom-right">Bottom Right</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Choose which part of the hero image to focus on when displayed on mobile devices. If your subject (like a dog) is in the lower right of the image, select "Bottom Right".
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Separator />

                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-sm font-medium">Announcement Bar</h4>
                              <p className="text-xs text-muted-foreground">Display an urgent banner above your hero section</p>
                            </div>
                            <FormField
                              control={brandingForm.control}
                              name="announcementBarEnabled"
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Switch
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      data-testid="switch-announcement-bar"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>

                          {brandingForm.watch("announcementBarEnabled") && (
                            <div className="space-y-4 pl-4 border-l-2 border-muted">
                              <FormField
                                control={brandingForm.control}
                                name="announcementBarText"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Announcement Text</FormLabel>
                                    <FormControl>
                                      <Input 
                                        placeholder="We urgently need fosters for our kittens!" 
                                        data-testid="input-announcement-text"
                                        {...field} 
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <div className="grid grid-cols-2 gap-4">
                                <FormField
                                  control={brandingForm.control}
                                  name="announcementBarLinkText"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Link Text (optional)</FormLabel>
                                      <FormControl>
                                        <Input 
                                          placeholder="Learn More" 
                                          data-testid="input-announcement-link-text"
                                          {...field} 
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={brandingForm.control}
                                  name="announcementBarLinkUrl"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Link URL (optional)</FormLabel>
                                      <FormControl>
                                        <Input 
                                          placeholder="/foster" 
                                          data-testid="input-announcement-link-url"
                                          {...field} 
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>
                              <FormField
                                control={brandingForm.control}
                                name="announcementBarStyle"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Style</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value || "info"}>
                                      <FormControl>
                                        <SelectTrigger data-testid="select-announcement-style">
                                          <SelectValue placeholder="Choose a style" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="info">Info (Blue)</SelectItem>
                                        <SelectItem value="warning">Warning (Yellow)</SelectItem>
                                        <SelectItem value="urgent">Urgent (Red)</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          )}
                        </div>

                        <Separator />

                        <div className="space-y-4">
                          <div>
                            <h4 className="font-medium text-sm">Brand Colors</h4>
                            <p className="text-sm text-muted-foreground mb-4">Customize your organization's color theme</p>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                              control={brandingForm.control}
                              name="primaryColor"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="flex items-center gap-2">
                                    Primary Color
                                    <Badge variant="default" style={{ backgroundColor: field.value || undefined }}>Preview</Badge>
                                  </FormLabel>
                                  <FormControl>
                                    <div className="flex gap-2 items-center">
                                      <Input 
                                        type="color"
                                        className="w-14 h-10 cursor-pointer p-1"
                                        data-testid="input-primary-color"
                                        value={field.value || "#3B82F6"}
                                        onChange={field.onChange}
                                      />
                                      <Input 
                                        placeholder="#3B82F6" 
                                        className="flex-1"
                                        {...field} 
                                      />
                                    </div>
                                  </FormControl>
                                  <FormDescription>Main brand color for buttons and links</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={brandingForm.control}
                              name="secondaryColor"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="flex items-center gap-2">
                                    Secondary Color
                                    <Badge variant="secondary" style={{ backgroundColor: field.value || undefined }}>Preview</Badge>
                                  </FormLabel>
                                  <FormControl>
                                    <div className="flex gap-2 items-center">
                                      <Input 
                                        type="color"
                                        className="w-14 h-10 cursor-pointer p-1"
                                        data-testid="input-secondary-color"
                                        value={field.value || "#6B7280"}
                                        onChange={field.onChange}
                                      />
                                      <Input 
                                        placeholder="#6B7280" 
                                        className="flex-1"
                                        {...field} 
                                      />
                                    </div>
                                  </FormControl>
                                  <FormDescription>Secondary elements and backgrounds</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={brandingForm.control}
                              name="accentColor"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="flex items-center gap-2">
                                    Accent Color
                                    <Badge style={{ backgroundColor: field.value || "#8B5CF6", color: "#fff" }}>Preview</Badge>
                                  </FormLabel>
                                  <FormControl>
                                    <div className="flex gap-2 items-center">
                                      <Input 
                                        type="color"
                                        className="w-14 h-10 cursor-pointer p-1"
                                        data-testid="input-accent-color"
                                        value={field.value || "#8B5CF6"}
                                        onChange={field.onChange}
                                      />
                                      <Input 
                                        placeholder="#8B5CF6" 
                                        className="flex-1"
                                        {...field} 
                                      />
                                    </div>
                                  </FormControl>
                                  <FormDescription>Highlights and interactive elements</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={brandingForm.control}
                              name="successColor"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="flex items-center gap-2">
                                    Success Color
                                    <Badge style={{ backgroundColor: field.value || "#22C55E", color: "#fff" }}>Preview</Badge>
                                  </FormLabel>
                                  <FormControl>
                                    <div className="flex gap-2 items-center">
                                      <Input 
                                        type="color"
                                        className="w-14 h-10 cursor-pointer p-1"
                                        data-testid="input-success-color"
                                        value={field.value || "#22C55E"}
                                        onChange={field.onChange}
                                      />
                                      <Input 
                                        placeholder="#22C55E" 
                                        className="flex-1"
                                        {...field} 
                                      />
                                    </div>
                                  </FormControl>
                                  <FormDescription>Success messages and positive actions</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={brandingForm.control}
                              name="warningColor"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="flex items-center gap-2">
                                    Warning Color
                                    <Badge style={{ backgroundColor: field.value || "#F59E0B", color: "#fff" }}>Preview</Badge>
                                  </FormLabel>
                                  <FormControl>
                                    <div className="flex gap-2 items-center">
                                      <Input 
                                        type="color"
                                        className="w-14 h-10 cursor-pointer p-1"
                                        data-testid="input-warning-color"
                                        value={field.value || "#F59E0B"}
                                        onChange={field.onChange}
                                      />
                                      <Input 
                                        placeholder="#F59E0B" 
                                        className="flex-1"
                                        {...field} 
                                      />
                                    </div>
                                  </FormControl>
                                  <FormDescription>Warning messages and cautions</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={brandingForm.control}
                              name="destructiveColor"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="flex items-center gap-2">
                                    Danger Color
                                    <Badge variant="destructive" style={{ backgroundColor: field.value || undefined }}>Preview</Badge>
                                  </FormLabel>
                                  <FormControl>
                                    <div className="flex gap-2 items-center">
                                      <Input 
                                        type="color"
                                        className="w-14 h-10 cursor-pointer p-1"
                                        data-testid="input-destructive-color"
                                        value={field.value || "#EF4444"}
                                        onChange={field.onChange}
                                      />
                                      <Input 
                                        placeholder="#EF4444" 
                                        className="flex-1"
                                        {...field} 
                                      />
                                    </div>
                                  </FormControl>
                                  <FormDescription>Errors, deletions, and warnings</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>

                        <Separator />

                        <FormField
                          control={brandingForm.control}
                          name="contactEmail"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Contact Email</FormLabel>
                              <FormControl>
                                <Input 
                                  type="email"
                                  placeholder="contact@yourrescue.org" 
                                  data-testid="input-contact-email"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                Public contact email for your organization
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={brandingForm.control}
                          name="contactPhone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Contact Phone</FormLabel>
                              <FormControl>
                                <Input 
                                  type="tel"
                                  placeholder="(555) 123-4567" 
                                  data-testid="input-contact-phone"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                Public contact phone number for your organization
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Separator />

                        <div className="space-y-4">
                          <h4 className="text-sm font-medium">Form Submission Notifications</h4>
                          <p className="text-sm text-muted-foreground">
                            Receive email notifications when forms are submitted (adoption, foster, volunteer, surrender applications).
                          </p>

                          <FormField
                            control={brandingForm.control}
                            name="formNotificationsEnabled"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                  <FormLabel className="text-base">Enable Form Notifications</FormLabel>
                                  <FormDescription>
                                    Send email alerts when applications are submitted
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="switch-form-notifications"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={brandingForm.control}
                            name="formNotificationEmail"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Notification Email</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="email"
                                    placeholder="notifications@yourrescue.org" 
                                    data-testid="input-notification-email"
                                    {...field} 
                                  />
                                </FormControl>
                                <FormDescription>
                                  Email address to receive form submission alerts. Falls back to Contact Email if not set.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <Separator />

                        <FormField
                          control={brandingForm.control}
                          name="footerText"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Footer Text</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="© 2024 Happy Paws Rescue. 501(c)(3) Non-Profit Organization" 
                                  data-testid="input-footer-text"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                Custom text for your website footer (e.g., copyright, 501(c)(3) status)
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={brandingForm.control}
                          name="footerHours"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Business Hours</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Mon-Fri: 9am-5pm, Sat: 10am-4pm, Sun: Closed" 
                                  data-testid="input-footer-hours"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                Your organization's operating hours
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={brandingForm.control}
                          name="footerAddress"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Address</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="123 Main St, City, State 12345" 
                                  data-testid="input-footer-address"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                Your organization's physical address
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Separator />

                        <div className="space-y-4">
                          <h4 className="text-sm font-medium">Social Media Links</h4>
                          <p className="text-xs text-muted-foreground">Add links to your social media profiles to display in the footer</p>
                          
                          <div className="grid gap-4 sm:grid-cols-2">
                            <FormField
                              control={brandingForm.control}
                              name="socialFacebook"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Facebook</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="https://facebook.com/yourrescue" 
                                      data-testid="input-social-facebook"
                                      {...field} 
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={brandingForm.control}
                              name="socialInstagram"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Instagram</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="https://instagram.com/yourrescue" 
                                      data-testid="input-social-instagram"
                                      {...field} 
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={brandingForm.control}
                              name="socialYoutube"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>YouTube</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="https://youtube.com/@yourrescue" 
                                      data-testid="input-social-youtube"
                                      {...field} 
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={brandingForm.control}
                              name="socialTiktok"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>TikTok</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="https://tiktok.com/@yourrescue" 
                                      data-testid="input-social-tiktok"
                                      {...field} 
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>

                        <Separator />

                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-sm font-medium">Sponsor Logos</h4>
                              <p className="text-xs text-muted-foreground">Display sponsor/partner logos in your footer</p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const currentLogos = brandingForm.getValues("sponsorLogos") || [];
                                brandingForm.setValue("sponsorLogos", [
                                  ...currentLogos,
                                  { id: crypto.randomUUID(), imageUrl: "", altText: "", linkUrl: "" }
                                ]);
                              }}
                              data-testid="button-add-sponsor"
                            >
                              Add Sponsor
                            </Button>
                          </div>

                          {(brandingForm.watch("sponsorLogos") || []).map((sponsor, index) => (
                            <div key={sponsor.id} className="space-y-3 p-4 border rounded-lg relative">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute top-2 right-2 h-6 w-6 p-0"
                                onClick={() => {
                                  const currentLogos = brandingForm.getValues("sponsorLogos") || [];
                                  brandingForm.setValue("sponsorLogos", currentLogos.filter((_, i) => i !== index));
                                }}
                                data-testid={`button-remove-sponsor-${index}`}
                              >
                                ×
                              </Button>
                              <FormField
                                control={brandingForm.control}
                                name={`sponsorLogos.${index}.imageUrl`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Logo Image</FormLabel>
                                    <FormControl>
                                      <ObjectUploader
                                        value={field.value ? [field.value] : []}
                                        onChange={(urls) => field.onChange(urls[0] || "")}
                                        maxFiles={1}
                                        accept="image/*"
                                        data-testid={`uploader-sponsor-logo-${index}`}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={brandingForm.control}
                                name={`sponsorLogos.${index}.altText`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Sponsor Name</FormLabel>
                                    <FormControl>
                                      <Input 
                                        placeholder="Sponsor Name" 
                                        data-testid={`input-sponsor-name-${index}`}
                                        {...field} 
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={brandingForm.control}
                                name={`sponsorLogos.${index}.linkUrl`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Link URL (optional)</FormLabel>
                                    <FormControl>
                                      <Input 
                                        placeholder="https://sponsor-website.com" 
                                        data-testid={`input-sponsor-link-${index}`}
                                        {...field} 
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          ))}
                        </div>

                        <Button 
                          type="submit" 
                          disabled={updateBrandingMutation.isPending}
                          data-testid="button-save-branding"
                        >
                          {updateBrandingMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="mr-2 h-4 w-4" />
                              Save Branding
                            </>
                          )}
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>

                {/* Hero Layout Configuration */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Palette className="h-5 w-5" />
                      <CardTitle>Hero Layout</CardTitle>
                    </div>
                    <CardDescription>
                      Choose how to display action items in your homepage hero section.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <HeroLayoutSettings tenant={data?.tenant} />
                  </CardContent>
                </Card>

                {/* Mascot Widget Settings */}
                <MascotSettings 
                  mascot={data?.tenant?.mascot as { enabled?: boolean; speechText?: string } | undefined}
                  rescueName={data?.tenant?.name || 'Your Rescue'}
                />

                {/* Custom Domain Configuration */}
                <CustomDomainSettings tenant={data?.tenant} />

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Heart className="h-5 w-5" />
                      <CardTitle>Donation Section</CardTitle>
                    </div>
                    <CardDescription>
                      Customize the text and icons shown in the donation section on your home page.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...donationSectionForm}>
                      <form onSubmit={donationSectionForm.handleSubmit(onSubmitDonationSection)} className="space-y-6">
                        <FormField
                          control={donationSectionForm.control}
                          name="sectionHeading"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Section Heading</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Support Our Mission" 
                                  data-testid="input-donation-heading"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                The main heading shown above the donation form (default: "Support Our Mission")
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={donationSectionForm.control}
                          name="sectionDescription"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Section Description</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Your donation helps us rescue, care for, and find homes for animals in need." 
                                  data-testid="input-donation-description"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                The description text shown below the heading
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Separator />

                        <div className="space-y-1">
                          <h4 className="text-sm font-medium">Monthly Giving Card</h4>
                          <p className="text-sm text-muted-foreground">
                            Customize the recurring donation card appearance
                          </p>
                        </div>

                        <FormField
                          control={donationSectionForm.control}
                          name="monthlyGivingTitle"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Monthly Giving Title</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Become a Monthly Guardian" 
                                  data-testid="input-monthly-title"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                The title shown on the recurring donation card (default: "Become a Monthly Guardian")
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={donationSectionForm.control}
                          name="monthlyGivingDescription"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Monthly Giving Description</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Join The Pack to provide predictable support. $10/month saves lives all year long." 
                                  data-testid="input-monthly-description"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                The description for recurring donations
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={donationSectionForm.control}
                          name="monthlyGivingIcon"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Monthly Giving Icon</FormLabel>
                              <Select 
                                onValueChange={field.onChange} 
                                value={field.value || "shield"}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="select-donation-icon">
                                    <SelectValue placeholder="Select an icon" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="shield">
                                    <div className="flex items-center gap-2">
                                      <Shield className="h-4 w-4" />
                                      <span>Shield (Guardian)</span>
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="heart">
                                    <div className="flex items-center gap-2">
                                      <Heart className="h-4 w-4" />
                                      <span>Heart (Love)</span>
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="paw">
                                    <div className="flex items-center gap-2">
                                      <PawPrint className="h-4 w-4" />
                                      <span>Paw (Animals)</span>
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="star">
                                    <div className="flex items-center gap-2">
                                      <Star className="h-4 w-4" />
                                      <span>Star (VIP)</span>
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="hand-heart">
                                    <div className="flex items-center gap-2">
                                      <HandHeart className="h-4 w-4" />
                                      <span>Hand Heart (Caring)</span>
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="users">
                                    <div className="flex items-center gap-2">
                                      <Users className="h-4 w-4" />
                                      <span>Users (Community)</span>
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="home">
                                    <div className="flex items-center gap-2">
                                      <Home className="h-4 w-4" />
                                      <span>Home (Shelter)</span>
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                The icon displayed on the monthly giving card
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Separator />

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={donationSectionForm.control}
                            name="oneTimeButtonText"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>One-Time Button Text</FormLabel>
                                <FormControl>
                                  <Input 
                                    placeholder="One-Time ($50)" 
                                    data-testid="input-onetime-text"
                                    {...field} 
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={donationSectionForm.control}
                            name="monthlyButtonText"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Monthly Button Text</FormLabel>
                                <FormControl>
                                  <Input 
                                    placeholder="Monthly ($10)" 
                                    data-testid="input-monthly-text"
                                    {...field} 
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <Separator />

                        <div className="space-y-2">
                          <h4 className="font-medium">External Wish Lists</h4>
                          <p className="text-sm text-muted-foreground">
                            Add links to your Amazon and Chewy wish lists. These will appear as buttons below your donation description.
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={donationSectionForm.control}
                            name="amazonWishListUrl"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Amazon Wish List URL</FormLabel>
                                <FormControl>
                                  <Input 
                                    placeholder="https://www.amazon.com/hz/wishlist/ls/..." 
                                    data-testid="input-amazon-wishlist"
                                    {...field} 
                                  />
                                </FormControl>
                                <FormDescription>
                                  Paste your full Amazon Wish List share link
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={donationSectionForm.control}
                            name="chewyWishListUrl"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Chewy Wish List URL</FormLabel>
                                <FormControl>
                                  <Input 
                                    placeholder="https://www.chewy.com/g/..." 
                                    data-testid="input-chewy-wishlist"
                                    {...field} 
                                  />
                                </FormControl>
                                <FormDescription>
                                  Paste your full Chewy Wish List share link
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="flex justify-end">
                          <Button 
                            type="submit" 
                            disabled={updateDonationSectionMutation.isPending}
                            data-testid="button-save-donation-section"
                          >
                            {updateDonationSectionMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            <Save className="h-4 w-4 mr-2" />
                            Save Donation Section
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>

                <StripeConnectBanner />

                {/* Fee Passthrough Settings */}
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
                        disabled={updatePassFeesMutation.isPending}
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
                  </CardContent>
                </Card>

                {/* Legacy Stripe API Keys - for tenants who prefer direct integration */}
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
                      For advanced users: configure your own Stripe API keys for direct integration. Most organizations should use the Connect button above instead.
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
                            <Input 
                              value={data.tenant.stripePublishableKey || ""} 
                              disabled 
                              className="font-mono text-sm"
                              data-testid="display-stripe-publishable-key"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            To update your Stripe keys, enter new keys below.
                          </p>
                        </div>
                      </>
                    ) : (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Stripe is not configured. Add your API keys below to start accepting card donations.
                        </AlertDescription>
                      </Alert>
                    )}

                    <Separator />

                    <Form {...stripeForm}>
                      <form onSubmit={stripeForm.handleSubmit(onSubmitStripe)} className="space-y-4">
                        <FormField
                          control={stripeForm.control}
                          name="stripePublishableKey"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Publishable Key</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="pk_live_..." 
                                  className="font-mono"
                                  data-testid="input-stripe-publishable-key"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                Your Stripe publishable key (starts with pk_)
                              </FormDescription>
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
                                <Input 
                                  type="password"
                                  placeholder="sk_live_..." 
                                  className="font-mono"
                                  data-testid="input-stripe-secret-key"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                Your Stripe secret key (starts with sk_) - kept encrypted in our database
                              </FormDescription>
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
                                <Input 
                                  type="password"
                                  placeholder="whsec_..." 
                                  className="font-mono"
                                  data-testid="input-stripe-webhook-secret"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                Your Stripe webhook signing secret for automatic payment tracking (optional)
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="flex justify-end pt-2">
                          <Button 
                            type="submit" 
                            disabled={updateStripeMutation.isPending}
                            data-testid="button-save-stripe"
                          >
                            {updateStripeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            <Save className="h-4 w-4 mr-2" />
                            {data?.tenant?.stripeEnabled ? "Update Stripe Keys" : "Enable Stripe"}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>

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
                          <span>
                            Twilio is configured with number {data.tenant.twilioPhoneNumber}
                          </span>
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
                          <a 
                            href="https://www.twilio.org/impact-access-nonprofits/" 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="underline"
                          >
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
                            placeholder="+15551234567"
                            value={testPhoneNumber}
                            onChange={(e) => setTestPhoneNumber(e.target.value)}
                            className="font-mono flex-1"
                            data-testid="input-test-phone"
                          />
                          <Button
                            variant="outline"
                            onClick={() => testTwilioMutation.mutate(testPhoneNumber)}
                            disabled={!testPhoneNumber || testTwilioMutation.isPending}
                            data-testid="button-test-sms"
                          >
                            {testTwilioMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            <Phone className="h-4 w-4 mr-2" />
                            Send Test
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Enter a phone number in E.164 format (e.g., +15551234567)
                        </p>
                      </div>
                    )}

                    {!data?.tenant?.twilioEnabled && (
                      <>
                        <Separator />
                        <Form {...twilioForm}>
                          <form onSubmit={twilioForm.handleSubmit(onSubmitTwilio)} className="space-y-4">
                            <FormField
                              control={twilioForm.control}
                              name="twilioAccountSid"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Account SID</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" 
                                      className="font-mono"
                                      data-testid="input-twilio-account-sid"
                                      {...field} 
                                    />
                                  </FormControl>
                                  <FormDescription>
                                    Find this in your Twilio Console dashboard
                                  </FormDescription>
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
                                    <Input 
                                      type="password"
                                      placeholder="Your Auth Token" 
                                      className="font-mono"
                                      data-testid="input-twilio-auth-token"
                                      {...field} 
                                    />
                                  </FormControl>
                                  <FormDescription>
                                    Keep this secret - it will be encrypted at rest
                                  </FormDescription>
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
                                    <Input 
                                      placeholder="+15551234567" 
                                      className="font-mono"
                                      data-testid="input-twilio-phone-number"
                                      {...field} 
                                    />
                                  </FormControl>
                                  <FormDescription>
                                    Your Twilio phone number in E.164 format
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <div className="flex justify-end pt-2">
                              <Button 
                                type="submit" 
                                disabled={updateTwilioMutation.isPending}
                                data-testid="button-save-twilio"
                              >
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
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3" />
                          Transport SMS alerts for drivers and coordinators
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3" />
                          Foster/adopter privacy messaging (phone number masking)
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3" />
                          Emergency broadcast notifications
                        </li>
                      </ul>
                      <p className="text-xs text-muted-foreground mt-2">
                        <a 
                          href="https://console.twilio.com" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="underline"
                        >
                          Twilio Console
                        </a>
                        {' | '}
                        <a 
                          href="https://www.twilio.org/impact-access-nonprofits/" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="underline"
                        >
                          Nonprofit Credits (Impact Access)
                        </a>
                      </p>
                    </div>
                  </CardContent>
                </Card>

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
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3" />
                          Draw-to-sign signature capture
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3" />
                          IP address and timestamp recorded for legal verification
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3" />
                          Auto-update application status when contract is signed
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3" />
                          Signed PDF generated with embedded signature
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3" />
                          Signed documents saved to Google Drive (if connected)
                        </li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>

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
                    {/* Email Usage Statistics */}
                    {emailUsage && (
                      <div className="rounded-lg border p-4 space-y-3" data-testid="card-email-usage">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium">Email Usage This Month</h4>
                          {emailUsage.usePlatformKey ? (
                            <span className="text-xs px-2 py-1 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                              Platform Account
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded-md bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                              Your Account
                            </span>
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
                                  className={`h-full transition-all ${
                                    emailUsage.remaining < 100 ? 'bg-destructive' : 
                                    emailUsage.remaining < 300 ? 'bg-yellow-500' : 
                                    'bg-primary'
                                  }`}
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
                            <AlertDescription>
                              You're using your own Resend account with unlimited email sending.
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    )}

                    {/* Current Configuration Display */}
                    {data?.tenant?.resendEnabled && (
                      <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                        <Label className="text-xs text-muted-foreground">Current Configuration</Label>
                        <div className="space-y-1">
                          <div className="text-sm">
                            <span className="text-muted-foreground">From:</span> <span className="font-mono">{data.tenant.resendFromEmail}</span>
                          </div>
                          <div className="text-sm">
                            <span className="text-muted-foreground">Name:</span> {data.tenant.resendFromName}
                          </div>
                        </div>
                      </div>
                    )}

                    <Separator />

                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                      <p className="text-sm text-blue-900 dark:text-blue-100">
                        <strong>Optional Configuration (Enterprise):</strong> Configure your own Resend account below for unlimited email sending. By default, you'll use our shared platform account with a monthly quota based on your plan (Starter: 500, Professional: 5,000, Enterprise: 25,000). Get your own Resend API key at{' '}
                        <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                          resend.com
                        </a>
                        {' '}(3,000 free emails/month on their free tier).
                      </p>
                    </div>

                    {/* DNS Setup Guide */}
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
                            {/* Introduction */}
                            <Alert>
                              <Info className="h-4 w-4" />
                              <AlertDescription>
                                To send emails from your own domain (e.g., <code className="px-1 py-0.5 bg-muted rounded">contact@yourrescue.org</code>), you'll need to configure DNS records at your domain hosting provider. This ensures your emails are authenticated and trusted by recipients' email servers.
                              </AlertDescription>
                            </Alert>

                            {/* Step-by-step guide */}
                            <div className="space-y-4">
                              <div className="flex items-start gap-3">
                                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">
                                  1
                                </div>
                                <div className="space-y-2 flex-1">
                                  <h4 className="font-semibold">Sign up for Resend</h4>
                                  <p className="text-muted-foreground">
                                    Create a free account at{' '}
                                    <a href="https://resend.com/signup" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                                      resend.com/signup
                                    </a>
                                    {' '}(includes 3,000 free emails/month)
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-start gap-3">
                                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">
                                  2
                                </div>
                                <div className="space-y-2 flex-1">
                                  <h4 className="font-semibold">Add Your Domain in Resend</h4>
                                  <p className="text-muted-foreground">
                                    Go to{' '}
                                    <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                                      resend.com/domains
                                    </a>
                                    {' '}and add your domain (e.g., <code className="px-1 py-0.5 bg-muted rounded">yourrescue.org</code>) or subdomain (e.g., <code className="px-1 py-0.5 bg-muted rounded">email.yourrescue.org</code>)
                                  </p>
                                  <Alert className="mt-2">
                                    <AlertDescription className="text-xs">
                                      💡 <strong>Tip:</strong> Using a subdomain like <code className="px-1 py-0.5 bg-muted rounded">email.yourrescue.org</code> is recommended to isolate your email sending reputation from your main website.
                                    </AlertDescription>
                                  </Alert>
                                </div>
                              </div>

                              <div className="flex items-start gap-3">
                                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">
                                  3
                                </div>
                                <div className="space-y-2 flex-1">
                                  <h4 className="font-semibold">Configure DNS Records</h4>
                                  <p className="text-muted-foreground">
                                    Resend will provide you with DNS records to add. Log into your domain hosting provider (GoDaddy, Cloudflare, Namecheap, etc.) and add these <strong>3 DNS records</strong>:
                                  </p>
                                  
                                  <div className="space-y-3 mt-3">
                                    {/* SPF Record */}
                                    <div className="border rounded-lg p-3 bg-muted/30">
                                      <div className="flex items-center gap-2 mb-2">
                                        <Check className="h-4 w-4 text-green-600" />
                                        <span className="font-semibold">SPF Record (Required)</span>
                                      </div>
                                      <div className="space-y-1 text-xs font-mono bg-background p-2 rounded border">
                                        <div><span className="text-muted-foreground">Type:</span> TXT</div>
                                        <div><span className="text-muted-foreground">Name:</span> @ <span className="text-muted-foreground">(or your subdomain)</span></div>
                                        <div><span className="text-muted-foreground">Value:</span> v=spf1 include:_spf.resend.com ~all</div>
                                        <div><span className="text-muted-foreground">TTL:</span> 3600 <span className="text-muted-foreground">(or Auto)</span></div>
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-2">
                                        Authorizes Resend to send emails on your behalf
                                      </p>
                                    </div>

                                    {/* DKIM Record */}
                                    <div className="border rounded-lg p-3 bg-muted/30">
                                      <div className="flex items-center gap-2 mb-2">
                                        <Check className="h-4 w-4 text-green-600" />
                                        <span className="font-semibold">DKIM Record (Required)</span>
                                      </div>
                                      <div className="space-y-1 text-xs font-mono bg-background p-2 rounded border">
                                        <div><span className="text-muted-foreground">Type:</span> TXT or CNAME</div>
                                        <div><span className="text-muted-foreground">Name:</span> resend._domainkey <span className="text-muted-foreground">(provided by Resend)</span></div>
                                        <div><span className="text-muted-foreground">Value:</span> [unique key from Resend dashboard]</div>
                                        <div><span className="text-muted-foreground">TTL:</span> 3600 <span className="text-muted-foreground">(or Auto)</span></div>
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-2">
                                        Cryptographic signature that verifies email authenticity
                                      </p>
                                    </div>

                                    {/* DMARC Record */}
                                    <div className="border rounded-lg p-3 bg-muted/30">
                                      <div className="flex items-center gap-2 mb-2">
                                        <Info className="h-4 w-4 text-blue-600" />
                                        <span className="font-semibold">DMARC Record (Recommended)</span>
                                      </div>
                                      <div className="space-y-1 text-xs font-mono bg-background p-2 rounded border">
                                        <div><span className="text-muted-foreground">Type:</span> TXT</div>
                                        <div><span className="text-muted-foreground">Name:</span> _dmarc</div>
                                        <div><span className="text-muted-foreground">Value:</span> v=DMARC1; p=none; rua=mailto:admin@yourrescue.org</div>
                                        <div><span className="text-muted-foreground">TTL:</span> 3600 <span className="text-muted-foreground">(or Auto)</span></div>
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-2">
                                        Improves email deliverability and protects your domain reputation
                                      </p>
                                    </div>
                                  </div>

                                  <Alert variant="destructive" className="mt-3">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertDescription className="text-xs">
                                      <strong>Important:</strong> If you already have an SPF record, you must merge it with Resend's SPF. A domain can only have ONE SPF record. Example: <code className="px-1 py-0.5 bg-destructive/10 rounded text-xs">v=spf1 include:_spf.resend.com include:other.provider.com ~all</code>
                                    </AlertDescription>
                                  </Alert>
                                </div>
                              </div>

                              <div className="flex items-start gap-3">
                                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">
                                  4
                                </div>
                                <div className="space-y-2 flex-1">
                                  <h4 className="font-semibold">Wait for DNS Propagation</h4>
                                  <p className="text-muted-foreground">
                                    DNS changes can take anywhere from <strong>a few minutes to 48 hours</strong> to propagate. After adding the records, click "Verify" in the Resend dashboard.
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-start gap-3">
                                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">
                                  5
                                </div>
                                <div className="space-y-2 flex-1">
                                  <h4 className="font-semibold">Get Your API Key</h4>
                                  <p className="text-muted-foreground">
                                    Once your domain is verified, go to{' '}
                                    <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                                      resend.com/api-keys
                                    </a>
                                    {' '}and create a new API key. Copy the key (starts with <code className="px-1 py-0.5 bg-muted rounded">re_</code>).
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-start gap-3">
                                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">
                                  6
                                </div>
                                <div className="space-y-2 flex-1">
                                  <h4 className="font-semibold">Configure Settings Below</h4>
                                  <p className="text-muted-foreground">
                                    Enter your Resend API key, from email address (must match your verified domain), and from name in the form below. Click "Enable Email Service" to activate.
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Additional Resources */}
                            <div className="pt-4 border-t">
                              <h4 className="font-semibold mb-2">Additional Resources</h4>
                              <ul className="space-y-1 text-muted-foreground">
                                <li>
                                  📖{' '}
                                  <a href="https://resend.com/docs/dashboard/domains/introduction" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                                    Official Resend Domain Setup Guide
                                  </a>
                                </li>
                                <li>
                                  🔍{' '}
                                  <a href="https://dkimvalidator.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                                    Test Your Email Authentication (DKIM Validator)
                                  </a>
                                </li>
                                <li>
                                  💬 Need help? Contact your domain hosting provider's support team for DNS assistance
                                </li>
                              </ul>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>

                    <Form {...emailForm}>
                      <form onSubmit={emailForm.handleSubmit(onSubmitEmail)} className="space-y-4">
                        <FormField
                          control={emailForm.control}
                          name="resendApiKey"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Resend API Key (Optional)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="password"
                                  placeholder="re_..." 
                                  className="font-mono"
                                  data-testid="input-resend-api-key"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                Your Resend API key (starts with re_) - kept encrypted in our database
                              </FormDescription>
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
                                <Input 
                                  type="email"
                                  placeholder="noreply@yourrescue.org" 
                                  data-testid="input-resend-from-email"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                The email address that will appear in the "From" field (must be verified in Resend)
                              </FormDescription>
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
                                <Input 
                                  placeholder="Happy Paws Rescue" 
                                  data-testid="input-resend-from-name"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                The name that will appear in the "From" field (e.g., your rescue name)
                              </FormDescription>
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
                                <Input 
                                  type="password"
                                  placeholder="Your Constant Contact API key" 
                                  className="font-mono"
                                  data-testid="input-constant-contact-api-key"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                Optional: Connect Constant Contact for advanced email marketing features
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="flex justify-end pt-2">
                          <Button 
                            type="submit" 
                            disabled={updateEmailMutation.isPending}
                            data-testid="button-save-email"
                          >
                            {updateEmailMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            <Save className="h-4 w-4 mr-2" />
                            {data?.tenant?.resendEnabled ? "Update Email Settings" : "Enable Email Service"}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>

                {/* Email Copy Recipients Card */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Inbox className="h-5 w-5" />
                      <CardTitle>Email Auto-Copy</CardTitle>
                    </div>
                    <CardDescription>
                      Automatically send copies of inbound emails to your personal email addresses. When someone emails {data?.tenant?.subdomain}@mail.irescue.life, both the platform inbox and your personal email will receive a copy.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <EmailCopyRecipientsManager tenant={data?.tenant} />
                  </CardContent>
                </Card>

                {/* Push Notification Settings */}
                <NotificationSettings />

                {/* Medical Reminder Settings - Admin Only */}
                <MedicalReminderSettings />

                {/* Volunteer Threshold Alerts */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      <CardTitle>Volunteer Threshold Alerts</CardTitle>
                    </div>
                    <CardDescription>
                      Get notified when volunteer opportunities don't have enough signups
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <VolunteerAlertSettings />
                  </CardContent>
                </Card>

                {/* Weekly Volunteer Schedule Digest */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      <CardTitle>Weekly Volunteer Schedule Digest</CardTitle>
                    </div>
                    <CardDescription>
                      Send volunteers a weekly summary of their upcoming shifts and commitments
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <VolunteerDigestSettings />
                  </CardContent>
                </Card>

                {/* Govee Temperature Monitoring */}
                <GoveeSettings />

                {/* Data Import */}
                <RescueGroupsImporter />
              </div>
            )}
    </DashboardLayout>
  );
}

// Email Copy Recipients Manager Component
function EmailCopyRecipientsManager({ tenant }: { tenant?: Tenant }) {
  const { toast } = useToast();
  const [recipients, setRecipients] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    if (tenant?.emailCopyRecipients) {
      setRecipients(tenant.emailCopyRecipients);
    }
  }, [tenant]);

  const updateRecipientsMutation = useMutation({
    mutationFn: async (emailList: string[]) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings/email-copy', {
        emailCopyRecipients: emailList,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      toast({
        title: "Email copy recipients updated",
        description: "Inbound emails will now be copied to the specified addresses.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update recipients",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleAddEmail = () => {
    const email = inputValue.trim();
    if (!email) return;

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    if (recipients.includes(email)) {
      toast({
        title: "Duplicate email",
        description: "This email address is already in the list.",
        variant: "destructive",
      });
      return;
    }

    const newRecipients = [...recipients, email];
    setRecipients(newRecipients);
    setInputValue("");
    updateRecipientsMutation.mutate(newRecipients);
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    const newRecipients = recipients.filter(e => e !== emailToRemove);
    setRecipients(newRecipients);
    updateRecipientsMutation.mutate(newRecipients);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Copy Recipients</Label>
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="director@yourrescue.org"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddEmail();
              }
            }}
            data-testid="input-email-copy-recipient"
          />
          <Button
            type="button"
            onClick={handleAddEmail}
            disabled={updateRecipientsMutation.isPending || !inputValue.trim()}
            data-testid="button-add-email-copy"
          >
            {updateRecipientsMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Add"
            )}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Add email addresses that should receive copies of all inbound emails. Press Enter or click Add.
        </p>
      </div>

      {recipients.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Current Recipients</Label>
          <div className="space-y-2">
            {recipients.map((email) => (
              <div
                key={email}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
                data-testid={`recipient-${email}`}
              >
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-sm">{email}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveEmail(email)}
                  disabled={updateRecipientsMutation.isPending}
                  data-testid={`button-remove-${email}`}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {recipients.length === 0 && (
        <Alert>
          <Inbox className="h-4 w-4" />
          <AlertDescription>
            No copy recipients configured. Add email addresses above to automatically receive copies of inbound emails.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function RescueGroupsImporter() {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    duplicates: number;
    imageErrors: number;
    totalRows: number;
    errors: string[];
  } | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        title: "Invalid file type",
        description: "Please upload a CSV file exported from RescueGroups.org",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/import/rescuegroups', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Import failed');
      }

      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });

      const hasWarnings = result.errors.length > 0 || result.imageErrors > 0 || result.duplicates > 0;
      
      toast({
        title: hasWarnings ? "Import Complete with Warnings" : "Import Complete",
        description: hasWarnings 
          ? `Imported ${result.imported} animals. ${result.duplicates} duplicates skipped, ${result.imageErrors} images failed.`
          : `Successfully imported ${result.imported} animals`,
        variant: result.errors.length > 0 ? "destructive" : "default",
      });
    } catch (error) {
      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await fetch('/api/import/rescuegroups/template', {
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error('Failed to download template');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rescuegroups_import_template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Could not download template",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          <CardTitle>Import Data</CardTitle>
        </div>
        <CardDescription>
          Import your animal data from RescueGroups.org or other platforms
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>RescueGroups.org Import</Label>
          <p className="text-sm text-muted-foreground">
            Export your animals from RescueGroups.org as a CSV file, then upload it here to import all your data including photos.
          </p>
        </div>

        <div className="flex flex-col gap-4 p-4 border-2 border-dashed rounded-lg bg-muted/30">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <FileUp className="h-8 w-8" />
            <div className="text-center">
              <p className="font-medium">Upload RescueGroups CSV</p>
              <p className="text-xs">Photos will be automatically downloaded and stored</p>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={downloadTemplate}
              data-testid="button-download-template"
            >
              Download Template
            </Button>
            
            <input
              id="csv-upload"
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={isUploading}
              className="hidden"
              data-testid="input-csv-upload"
            />
            <Button
              onClick={() => document.getElementById('csv-upload')?.click()}
              disabled={isUploading}
              data-testid="button-upload-csv"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload CSV
                </>
              )}
            </Button>
          </div>
        </div>

        {importResult && (
          <Alert variant={importResult.errors.length > 0 ? "destructive" : "default"}>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <p className="font-medium">
                Import Complete: {importResult.imported} animals imported
              </p>
              {importResult.duplicates > 0 && (
                <p className="text-sm">
                  {importResult.duplicates} duplicates skipped (already in database)
                </p>
              )}
              {importResult.imageErrors > 0 && (
                <p className="text-sm text-muted-foreground">
                  {importResult.imageErrors} images could not be downloaded
                </p>
              )}
              {importResult.errors.length > 0 && (
                <div className="text-sm">
                  <p className="font-medium">Errors:</p>
                  <ul className="list-disc list-inside">
                    {importResult.errors.slice(0, 5).map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Supported fields:</strong> Animal ID, Name, Breed, Sex, Birthdate, Description, Status, Species, Size, Age, and more. 
            Photos are automatically downloaded from RescueGroups URLs.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

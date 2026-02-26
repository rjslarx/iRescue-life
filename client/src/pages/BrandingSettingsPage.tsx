import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { CustomDomainSettings } from "@/components/CustomDomainSettings";
import { HeroLayoutSettings } from "@/components/HeroLayoutSettings";
import MascotSettings from "@/components/MascotSettings";
import QuickActionsSettings from "@/components/QuickActionsSettings";
import {
  Save,
  Loader2,
  Palette,
  AlertCircle,
  Shield,
  Heart,
  Star,
  Users,
  Home,
  HandHeart,
  PawPrint,
  X,
  Plus,
  Info,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { z } from "zod";
import type { Tenant } from "@shared/schema";
import { ObjectUploader } from "@/components/ObjectUploader";
import { RichTextEditor } from "@/components/RichTextEditor";
import DashboardLayout from "@/components/DashboardLayout";

const urlOrPathSchema = z.string().refine(
  (val) => val === "" || val.startsWith("/") || val.startsWith("http://") || val.startsWith("https://"),
  { message: "Must be a valid URL or storage path" }
).optional().or(z.literal(""));

function MultiEmailInput({ control, name }: { control: any; name: string }) {
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState('');

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const emails = field.value
          ? field.value.split(',').map((e: string) => e.trim()).filter((e: string) => e)
          : [];

        const addEmail = () => {
          const email = newEmail.trim().toLowerCase();
          if (!email) return;

          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(email)) {
            setEmailError('Please enter a valid email address');
            return;
          }

          if (emails.includes(email)) {
            setEmailError('This email is already added');
            return;
          }

          setEmailError('');
          const newEmails = [...emails, email];
          field.onChange(newEmails.join(', '));
          setNewEmail('');
        };

        const removeEmail = (emailToRemove: string) => {
          const newEmails = emails.filter((e: string) => e !== emailToRemove);
          field.onChange(newEmails.length > 0 ? newEmails.join(', ') : '');
        };

        return (
          <FormItem>
            <FormLabel>Notification Emails</FormLabel>
            <div className="space-y-3">
              {emails.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {emails.map((email: string) => (
                    <Badge
                      key={email}
                      variant="secondary"
                      className="flex items-center gap-1 pr-0.5"
                      data-testid={`badge-email-${email}`}
                    >
                      {email}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-5 w-5 p-0 ml-1"
                        onClick={() => removeEmail(email)}
                        data-testid={`button-remove-email-${email}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="Add notification email..."
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value);
                    setEmailError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addEmail();
                    }
                  }}
                  data-testid="input-notification-email"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addEmail}
                  data-testid="button-add-email"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>

              {emailError && (
                <p className="text-sm text-destructive">{emailError}</p>
              )}
            </div>
            <FormDescription>
              Email addresses to receive form submission alerts. Falls back to Contact Email if none set.
            </FormDescription>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

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
  formNotificationEmail: z.string().optional(),
  volunteerApplicationNotificationEmails: z.string().optional(),
  footerText: z.string().optional(),
  footerHours: z.string().optional(),
  footerAddress: z.string().optional(),
  socialFacebook: z.string().url().optional().or(z.literal("")),
  socialInstagram: z.string().url().optional().or(z.literal("")),
  socialYoutube: z.string().url().optional().or(z.literal("")),
  socialTiktok: z.string().url().optional().or(z.literal("")),
  sponsorLogos: z.array(sponsorLogoSchema).optional(),
});

const donationSectionSchema = z.object({
  sectionHeading: z.string().max(100).optional(),
  sectionDescription: z.string().max(500).optional(),
  sectionDescriptionExtended: z.string().max(1000).optional(),
  sectionImageUrl: z.string().refine(
    (val) => val === "" || val.startsWith("/") || val.startsWith("http://") || val.startsWith("https://"),
    { message: "Must be a valid URL or storage path" }
  ).optional().or(z.literal("")),
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

export default function BrandingSettingsPage() {
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

  const updateBrandingMutation = useMutation({
    mutationFn: async (settings: BrandingSettingsData) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings/branding', settings);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      toast({ title: "Branding saved", description: "Your organization's branding has been updated successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to save branding", description: error.message || "Please try again later.", variant: "destructive" });
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
      toast({ title: "Donation section updated", description: "Your donation section text and styling have been saved." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update donation section", description: error.message || "Please try again later.", variant: "destructive" });
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
      heroMobileImageUrl: data?.tenant?.heroMobileImageUrl || "",
      heroHeadline: data?.tenant?.heroHeadline || "",
      heroButtonText: data?.tenant?.heroButtonText || "",
      heroButton2Text: data?.tenant?.heroButton2Text || "",
      heroFocalPoint: data?.tenant?.heroFocalPoint || "center",
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
      volunteerApplicationNotificationEmails: data?.tenant?.volunteerApplicationNotificationEmails || "",
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
      heroMobileImageUrl: data.tenant.heroMobileImageUrl || "",
      heroHeadline: data.tenant.heroHeadline || "",
      heroButtonText: data.tenant.heroButtonText || "",
      heroButton2Text: data.tenant.heroButton2Text || "",
      heroFocalPoint: data.tenant.heroFocalPoint || "center",
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
      volunteerApplicationNotificationEmails: data.tenant.volunteerApplicationNotificationEmails || "",
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

  const donationSectionForm = useForm<DonationSectionData>({
    resolver: zodResolver(donationSectionSchema),
    defaultValues: {
      sectionHeading: (data?.tenant as any)?.donationSection?.sectionHeading || "",
      sectionDescription: (data?.tenant as any)?.donationSection?.sectionDescription || "",
      sectionDescriptionExtended: (data?.tenant as any)?.donationSection?.sectionDescriptionExtended || "",
      sectionImageUrl: (data?.tenant as any)?.donationSection?.sectionImageUrl || "",
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
      sectionDescriptionExtended: (data.tenant as any)?.donationSection?.sectionDescriptionExtended || "",
      sectionImageUrl: (data.tenant as any)?.donationSection?.sectionImageUrl || "",
      monthlyGivingTitle: (data.tenant as any)?.donationSection?.monthlyGivingTitle || "",
      monthlyGivingDescription: (data.tenant as any)?.donationSection?.monthlyGivingDescription || "",
      monthlyGivingIcon: (data.tenant as any)?.donationSection?.monthlyGivingIcon || "shield",
      oneTimeButtonText: (data.tenant as any)?.donationSection?.oneTimeButtonText || "",
      monthlyButtonText: (data.tenant as any)?.donationSection?.monthlyButtonText || "",
      amazonWishListUrl: (data.tenant as any)?.donationSection?.amazonWishListUrl || "",
      chewyWishListUrl: (data.tenant as any)?.donationSection?.chewyWishListUrl || "",
    } : undefined,
  });

  if (isOwnerLoading) {
    return (
      <DashboardLayout breadcrumbs={[{ label: "Settings" }, { label: "Branding" }]}>
        <div className="flex items-center justify-center h-64" data-testid="loading-branding">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!canViewPage) {
    return (
      <DashboardLayout breadcrumbs={[{ label: "Settings" }, { label: "Branding" }]}>
        <div className="max-w-2xl mx-auto py-12" data-testid="branding-access-denied">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-destructive">
                <Shield className="h-6 w-6" />
                <CardTitle>Access Restricted</CardTitle>
              </div>
              <CardDescription>Branding settings can only be accessed by administrators</CardDescription>
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>You don't have permission to view branding settings.</AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      breadcrumbs={[{ label: "Settings" }, { label: "Branding" }]}
      title="Branding"
      description="Customize your organization's appearance and public-facing website content."
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-64" data-testid="loading-branding">
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
                <form onSubmit={brandingForm.handleSubmit((d) => updateBrandingMutation.mutate(d))} className="space-y-6">
                  <FormField
                    control={brandingForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organization Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Your Rescue Name" data-testid="input-org-name" {...field} />
                        </FormControl>
                        <FormDescription>The name of your rescue organization</FormDescription>
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
                          <Input placeholder="Saving lives, one paw at a time" data-testid="input-tagline" {...field} />
                        </FormControl>
                        <FormDescription>A short tagline displayed in the hero section</FormDescription>
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
                          Upload a separate hero image optimized for mobile devices (portrait orientation, 1080x1920px recommended). If not provided, the main hero image will be used with the focus point setting.
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
                          <Input placeholder="Find Your Perfect Companion" data-testid="input-hero-headline" {...field} />
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
                            <Input placeholder="Meet Our Pets" data-testid="input-hero-button" {...field} />
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
                            <Input placeholder="Donate Now" data-testid="input-hero-button2" {...field} />
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
                        <Select value={field.value || "center"} onValueChange={field.onChange}>
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
                          Choose which part of the hero image to focus on when displayed on mobile devices.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Separator />

                  {/* Announcement Bar */}
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
                                <Input placeholder="We urgently need fosters for our kittens!" data-testid="input-announcement-text" {...field} />
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
                                  <Input placeholder="Learn More" data-testid="input-announcement-link-text" {...field} />
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
                                  <Input placeholder="/foster" data-testid="input-announcement-link-url" {...field} />
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

                  {/* Brand Colors */}
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-sm">Brand Colors</h4>
                      <p className="text-sm text-muted-foreground mb-4">Customize your organization's color theme</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { name: "primaryColor" as const, label: "Primary Color", default: "#3B82F6", desc: "Main brand color for buttons and links", badgeVariant: "default" as const },
                        { name: "secondaryColor" as const, label: "Secondary Color", default: "#6B7280", desc: "Secondary elements and backgrounds", badgeVariant: "secondary" as const },
                        { name: "accentColor" as const, label: "Accent Color", default: "#8B5CF6", desc: "Highlights and interactive elements" },
                        { name: "successColor" as const, label: "Success Color", default: "#22C55E", desc: "Success messages and positive actions" },
                        { name: "warningColor" as const, label: "Warning Color", default: "#F59E0B", desc: "Warning messages and cautions" },
                        { name: "destructiveColor" as const, label: "Danger Color", default: "#EF4444", desc: "Errors, deletions, and warnings", badgeVariant: "destructive" as const },
                      ].map(({ name, label, default: defaultColor, desc, badgeVariant }) => (
                        <FormField
                          key={name}
                          control={brandingForm.control}
                          name={name}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-2">
                                {label}
                                <Badge
                                  variant={badgeVariant}
                                  style={!badgeVariant || badgeVariant === 'default' ? undefined : { backgroundColor: field.value || defaultColor, color: "#fff" }}
                                >
                                  Preview
                                </Badge>
                              </FormLabel>
                              <FormControl>
                                <div className="flex gap-2 items-center">
                                  <Input
                                    type="color"
                                    className="w-14 h-10 cursor-pointer p-1"
                                    data-testid={`input-${name.replace(/([A-Z])/g, '-$1').toLowerCase()}`}
                                    value={field.value || defaultColor}
                                    onChange={field.onChange}
                                  />
                                  <Input placeholder={defaultColor} className="flex-1" {...field} />
                                </div>
                              </FormControl>
                              <FormDescription>{desc}</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ))}
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
                          <Input type="email" placeholder="contact@yourrescue.org" data-testid="input-contact-email" {...field} />
                        </FormControl>
                        <FormDescription>Public contact email for your organization</FormDescription>
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
                          <Input type="tel" placeholder="(555) 123-4567" data-testid="input-contact-phone" {...field} />
                        </FormControl>
                        <FormDescription>Public contact phone number for your organization</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Separator />

                  {/* Form Submission Notifications */}
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
                            <FormDescription>Send email alerts when applications are submitted</FormDescription>
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

                    <MultiEmailInput control={brandingForm.control} name="formNotificationEmail" />

                    <FormField
                      control={brandingForm.control}
                      name="volunteerApplicationNotificationEmails"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Additional Volunteer Application Notification Emails</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="volunteer-coordinator@example.org, screener@example.org"
                              data-testid="input-volunteer-notification-emails"
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormDescription>
                            Additional email addresses (comma-separated) that will receive volunteer application notifications.
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
                          <Input placeholder="© 2024 Happy Paws Rescue. 501(c)(3) Non-Profit Organization" data-testid="input-footer-text" {...field} />
                        </FormControl>
                        <FormDescription>Custom text for your website footer (e.g., copyright, 501(c)(3) status)</FormDescription>
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
                          <Input placeholder="Mon-Fri: 9am-5pm, Sat: 10am-4pm, Sun: Closed" data-testid="input-footer-hours" {...field} />
                        </FormControl>
                        <FormDescription>Your organization's operating hours</FormDescription>
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
                          <Input placeholder="123 Main St, City, State 12345" data-testid="input-footer-address" {...field} />
                        </FormControl>
                        <FormDescription>Your organization's physical address</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Separator />

                  {/* Social Media */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Social Media Links</h4>
                    <p className="text-xs text-muted-foreground">Add links to your social media profiles to display in the footer</p>

                    <div className="grid gap-4 sm:grid-cols-2">
                      {[
                        { name: "socialFacebook" as const, label: "Facebook", placeholder: "https://facebook.com/yourrescue" },
                        { name: "socialInstagram" as const, label: "Instagram", placeholder: "https://instagram.com/yourrescue" },
                        { name: "socialYoutube" as const, label: "YouTube", placeholder: "https://youtube.com/@yourrescue" },
                        { name: "socialTiktok" as const, label: "TikTok", placeholder: "https://tiktok.com/@yourrescue" },
                      ].map(({ name, label, placeholder }) => (
                        <FormField
                          key={name}
                          control={brandingForm.control}
                          name={name}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{label}</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder={placeholder}
                                  data-testid={`input-social-${name.replace('social', '').toLowerCase()}`}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Sponsor Logos */}
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
                                <Input placeholder="Sponsor Name" data-testid={`input-sponsor-name-${index}`} {...field} />
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
                                <Input placeholder="https://sponsor-website.com" data-testid={`input-sponsor-link-${index}`} {...field} />
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
                    disabled={updateBrandingMutation.isPending || !canEdit}
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

          {/* Hero Layout */}
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

          {/* Quick Actions Customization */}
          <QuickActionsSettings />

          {/* Mascot Widget Settings */}
          <MascotSettings
            mascot={data?.tenant?.mascot as { enabled?: boolean; speechText?: string; videoUrl?: string } | undefined}
            rescueName={data?.tenant?.name || 'Your Rescue'}
          />

          {/* Custom Domain */}
          <CustomDomainSettings tenant={data?.tenant} />

          {/* Donation Section */}
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
                <form onSubmit={donationSectionForm.handleSubmit((d) => updateDonationSectionMutation.mutate(d))} className="space-y-6">
                  <FormField
                    control={donationSectionForm.control}
                    name="sectionHeading"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Section Heading</FormLabel>
                        <FormControl>
                          <Input placeholder="Support Our Mission" data-testid="input-donation-heading" {...field} />
                        </FormControl>
                        <FormDescription>The main heading shown above the donation form (default: "Support Our Mission")</FormDescription>
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
                        <FormDescription>The short description text shown below the heading</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={donationSectionForm.control}
                    name="sectionDescriptionExtended"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Extended Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Your financial contribution enables us to be there for our community..."
                            rows={4}
                            data-testid="input-donation-description-extended"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>The longer paragraph shown below the short description (optional)</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={donationSectionForm.control}
                    name="sectionImageUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Section Image</FormLabel>
                        <FormControl>
                          <ObjectUploader
                            value={field.value ? [field.value] : []}
                            onChange={(urls) => field.onChange(urls[0] || "")}
                            maxFiles={1}
                            accept="image/*"
                            data-testid="uploader-donation-section-image"
                          />
                        </FormControl>
                        <FormDescription>An optional image to display below the text in the Support Our Mission section</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Separator />

                  <div className="space-y-1">
                    <h4 className="text-sm font-medium">Monthly Giving Card</h4>
                    <p className="text-sm text-muted-foreground">Customize the recurring donation card appearance</p>
                  </div>

                  <FormField
                    control={donationSectionForm.control}
                    name="monthlyGivingTitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Monthly Giving Title</FormLabel>
                        <FormControl>
                          <Input placeholder="Become a Monthly Guardian" data-testid="input-monthly-title" {...field} />
                        </FormControl>
                        <FormDescription>The title shown on the recurring donation card (default: "Become a Monthly Guardian")</FormDescription>
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
                          <Input placeholder="Join The Pack to provide predictable support. $10/month saves lives all year long." data-testid="input-monthly-description" {...field} />
                        </FormControl>
                        <FormDescription>The description for recurring donations</FormDescription>
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
                        <Select onValueChange={field.onChange} value={field.value || "shield"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-donation-icon">
                              <SelectValue placeholder="Select an icon" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="shield"><div className="flex items-center gap-2"><Shield className="h-4 w-4" /><span>Shield (Guardian)</span></div></SelectItem>
                            <SelectItem value="heart"><div className="flex items-center gap-2"><Heart className="h-4 w-4" /><span>Heart (Love)</span></div></SelectItem>
                            <SelectItem value="paw"><div className="flex items-center gap-2"><PawPrint className="h-4 w-4" /><span>Paw (Animals)</span></div></SelectItem>
                            <SelectItem value="star"><div className="flex items-center gap-2"><Star className="h-4 w-4" /><span>Star (VIP)</span></div></SelectItem>
                            <SelectItem value="hand-heart"><div className="flex items-center gap-2"><HandHeart className="h-4 w-4" /><span>Hand Heart (Caring)</span></div></SelectItem>
                            <SelectItem value="users"><div className="flex items-center gap-2"><Users className="h-4 w-4" /><span>Users (Community)</span></div></SelectItem>
                            <SelectItem value="home"><div className="flex items-center gap-2"><Home className="h-4 w-4" /><span>Home (Shelter)</span></div></SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>The icon displayed on the monthly giving card</FormDescription>
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
                            <Input placeholder="One-Time ($50)" data-testid="input-onetime-text" {...field} />
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
                            <Input placeholder="Monthly ($10)" data-testid="input-monthly-text" {...field} />
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
                            <Input placeholder="https://www.amazon.com/hz/wishlist/ls/..." data-testid="input-amazon-wishlist" {...field} />
                          </FormControl>
                          <FormDescription>Paste your full Amazon Wish List share link</FormDescription>
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
                            <Input placeholder="https://www.chewy.com/g/..." data-testid="input-chewy-wishlist" {...field} />
                          </FormControl>
                          <FormDescription>Paste your full Chewy Wish List share link</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={updateDonationSectionMutation.isPending || !canEdit}
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
        </div>
      )}
    </DashboardLayout>
  );
}

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Shield,
  AlertCircle,
  Loader2,
  Mail,
  Inbox,
  Users,
  Receipt,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import DashboardLayout from "@/components/DashboardLayout";
import NotificationSettings from "@/components/NotificationSettings";
import NotificationPreferencesSettings from "@/components/NotificationPreferencesSettings";
import VolunteerAlertSettings, { VolunteerRecruitmentSmsSettings } from "@/components/VolunteerAlertSettings";
import VolunteerDigestSettings from "@/components/VolunteerDigestSettings";
import type { Tenant } from "@shared/schema";

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

function AutoSendTaxReceiptsToggle({ tenant }: { tenant?: Tenant }) {
  const { toast } = useToast();

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings', {
        autoSendTaxReceipts: enabled,
      });
      return response.json();
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      toast({
        title: enabled ? "Auto-send enabled" : "Auto-send disabled",
        description: enabled
          ? "Tax receipts will be automatically emailed to donors when donations are received."
          : "Tax receipts will only be sent when manually triggered from the Finance page.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update setting",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const isEnabled = tenant?.autoSendTaxReceipts ?? true;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          <CardTitle>Auto-Send Tax Receipts</CardTitle>
        </div>
        <CardDescription>
          Automatically generate and email IRS-compliant tax receipts to donors when donations are received through Stripe. Receipts include your organization name, EIN, donation amount, and date. If disabled, receipts can still be sent manually from the Finance page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="auto-send-receipts" className="flex-1">
            Send tax receipts automatically
          </Label>
          <Switch
            id="auto-send-receipts"
            data-testid="switch-auto-send-receipts"
            checked={isEnabled}
            disabled={toggleMutation.isPending}
            onCheckedChange={(checked) => toggleMutation.mutate(checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default function NotificationsSettingsPage() {
  const { user } = useAuth();

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

  if (isOwnerLoading) {
    return (
      <DashboardLayout breadcrumbs={[{ label: "Settings" }, { label: "Notifications" }]}>
        <div className="flex items-center justify-center h-64" data-testid="loading-notifications">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!canViewPage) {
    return (
      <DashboardLayout breadcrumbs={[{ label: "Settings" }, { label: "Notifications" }]}>
        <div className="max-w-2xl mx-auto py-12" data-testid="notifications-access-denied">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-destructive">
                <Shield className="h-6 w-6" />
                <CardTitle>Access Restricted</CardTitle>
              </div>
              <CardDescription>
                Notification settings can only be accessed by administrators
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You don't have permission to view notification settings.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      breadcrumbs={[{ label: "Settings" }, { label: "Notifications" }]}
      title="Notifications"
      description="Configure which events send notifications and how they are delivered."
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-64" data-testid="loading-notifications">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">
          <AutoSendTaxReceiptsToggle tenant={data?.tenant} />

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

          <NotificationSettings />

          <NotificationPreferencesSettings twilioEnabled={data?.tenant?.twilioEnabled} />

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

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                <CardTitle>Volunteer Recruitment SMS</CardTitle>
              </div>
              <CardDescription>
                Send grouped or personalized texts to opted-in volunteers when shifts need more coverage
              </CardDescription>
            </CardHeader>
            <CardContent>
              <VolunteerRecruitmentSmsSettings />
            </CardContent>
          </Card>

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
        </div>
      )}
    </DashboardLayout>
  );
}

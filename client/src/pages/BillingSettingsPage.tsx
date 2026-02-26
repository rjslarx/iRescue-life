import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { CreditCard, ExternalLink, Loader2, Shield, AlertCircle } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import type { Tenant } from "@shared/schema";

export default function BillingSettingsPage() {
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

  if (isOwnerLoading) {
    return (
      <DashboardLayout breadcrumbs={[{ label: "Settings" }, { label: "Billing" }]}>
        <div className="flex items-center justify-center h-64" data-testid="loading-billing">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!canViewPage) {
    return (
      <DashboardLayout breadcrumbs={[{ label: "Settings" }, { label: "Billing" }]}>
        <div className="max-w-2xl mx-auto py-12" data-testid="billing-access-denied">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-destructive">
                <Shield className="h-6 w-6" />
                <CardTitle>Access Restricted</CardTitle>
              </div>
              <CardDescription>
                Billing settings can only be accessed by administrators
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You don't have permission to view billing settings.
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
      breadcrumbs={[{ label: "Settings" }, { label: "Billing" }]}
      title="Billing"
      description="Manage your subscription plan and billing details."
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-64" data-testid="loading-billing">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">
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
        </div>
      )}
    </DashboardLayout>
  );
}

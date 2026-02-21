import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { StripeSetupChecklist } from "./StripeSetupChecklist";
import { 
  CreditCard, 
  Loader2, 
  CheckCircle2, 
  ExternalLink,
  AlertCircle,
  Banknote,
  ArrowRight,
  Unlink
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface StripeConnectStatus {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  accountId: string | null;
}

export function StripeConnectBanner() {
  const { toast } = useToast();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);

  const { data: status, isLoading, refetch } = useQuery<StripeConnectStatus>({
    queryKey: ['/api/stripe/connect/status'],
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Handle successful return from Stripe OAuth
    if (urlParams.get('stripe_return') === 'true') {
      queryClient.invalidateQueries({ queryKey: ['/api/stripe/connect/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      refetch();
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
      toast({
        title: "Stripe connected successfully!",
        description: "Your organization can now accept credit card donations.",
      });
    }
    
    // Handle errors from Stripe OAuth
    const stripeError = urlParams.get('stripe_error');
    if (stripeError) {
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
      toast({
        title: "Stripe connection failed",
        description: decodeURIComponent(stripeError),
        variant: "destructive",
      });
    }
  }, [refetch, toast]);

  // Standard Connect OAuth: get authorization URL and redirect
  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/stripe/connect', {
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to start Stripe connection');
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        setIsRedirecting(true);
        // Open in new window/tab to avoid iframe restrictions (Stripe blocks iframes)
        // This is necessary when viewing the app in Replit's webview or other embedded contexts
        const popup = window.open(data.url, '_blank');
        if (!popup) {
          // Fallback if popup blocked - try direct navigation
          window.location.href = data.url;
        }
      }
    },
    onError: (error: any) => {
      toast({
        title: "Connection failed",
        description: error.message || "Failed to start Stripe connection. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Disconnect Stripe account
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/stripe/connect/disconnect');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stripe/connect/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      toast({
        title: "Stripe disconnected",
        description: "Your Stripe account has been disconnected. You can reconnect at any time.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Disconnect failed",
        description: error.message || "Failed to disconnect Stripe. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Fully connected and ready to accept donations
  if (status?.connected && status.chargesEnabled) {
    return (
      <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <CardTitle className="text-lg">Donations Enabled</CardTitle>
                <CardDescription>
                  Your organization is ready to accept credit card donations
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="border-green-600 text-green-600">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Active
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('https://dashboard.stripe.com', '_blank')}
              data-testid="button-stripe-dashboard"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Stripe Dashboard
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  data-testid="button-disconnect-stripe"
                >
                  <Unlink className="h-4 w-4 mr-2" />
                  Disconnect
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect Stripe?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will prevent your organization from accepting credit card donations until you reconnect.
                    Your Stripe account and all donation history will remain intact - you're just unlinking it from this platform.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => disconnectMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {disconnectMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Disconnect
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            You own your Stripe account. All donation history, recurring donations, and payout settings remain with you.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Connected but not fully set up (shouldn't happen with Standard Connect, but handle gracefully)
  if (status?.connected && !status.chargesEnabled) {
    return (
      <Card className="border-yellow-200 bg-yellow-50/50 dark:border-yellow-900 dark:bg-yellow-950/20">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900">
                <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <CardTitle className="text-lg">Account Setup Incomplete</CardTitle>
                <CardDescription>
                  Your Stripe account needs additional verification before accepting payments
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="border-yellow-600 text-yellow-600">
              Pending
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => window.open('https://dashboard.stripe.com', '_blank')}
              className="gap-2"
              data-testid="button-complete-stripe-setup"
            >
              <ExternalLink className="h-4 w-4" />
              Complete Setup in Stripe
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              data-testid="button-refresh-status"
            >
              Refresh Status
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Visit your Stripe Dashboard to complete any required verification steps, then refresh this page.
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleConnectClick = () => {
    setShowChecklist(true);
  };

  const handleProceedToStripe = () => {
    setShowChecklist(false);
    connectMutation.mutate();
  };

  // Not connected - show connect prompt
  return (
    <>
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
            <Banknote className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Accept Donations Online</CardTitle>
          <CardDescription className="text-base max-w-md mx-auto">
            Connect your Stripe account to securely accept credit card donations. 
            You own your account - Stripe deposits directly to your bank.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 pt-2">
          <Button
            size="lg"
            onClick={handleConnectClick}
            disabled={connectMutation.isPending || isRedirecting}
            className="gap-2 px-8"
            data-testid="button-connect-stripe"
          >
            {(connectMutation.isPending || isRedirecting) ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Connecting to Stripe...
              </>
            ) : (
              <>
                <CreditCard className="h-5 w-5" />
                Connect with Stripe
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
          <div className="text-xs text-muted-foreground text-center max-w-sm space-y-2">
            <p>
              You'll sign into your existing Stripe account or create a new one.
              <strong className="block mt-1">You own your account</strong> - if you ever leave this platform, 
              your Stripe account, donor data, and recurring donations stay with you.
            </p>
          </div>
        </CardContent>
      </Card>

      <StripeSetupChecklist
        open={showChecklist}
        onOpenChange={setShowChecklist}
        onProceed={handleProceedToStripe}
        isPending={connectMutation.isPending || isRedirecting}
        hasExistingStripeAccount={false}
      />
    </>
  );
}

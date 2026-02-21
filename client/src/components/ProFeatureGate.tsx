import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import DashboardLayout from "@/components/DashboardLayout";

interface ProFeatureGateProps {
  children: React.ReactNode;
  featureName?: string;
}

export function ProFeatureGate({ children, featureName }: ProFeatureGateProps) {
  const { data: tenantData, isLoading } = useQuery<{ tenant: { subscriptionTier: string } }>({
    queryKey: ['/api/tenant'],
  });

  const isLiteTier = tenantData?.tenant?.subscriptionTier === 'lite';

  if (isLoading) return null;

  if (isLiteTier) {
    return (
      <DashboardLayout title="Feature Not Available" description="">
        <div className="flex items-center justify-center min-h-[60vh] p-6">
          <Card className="max-w-md w-full p-8 text-center">
            <Lock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2" data-testid="text-pro-gate-title">
              Professional Feature
            </h2>
            <p className="text-muted-foreground mb-6" data-testid="text-pro-gate-description">
              {featureName
                ? `${featureName} is available on the Professional plan.`
                : "This feature is available on the Professional plan."}{" "}
              Upgrade to unlock built-in pipelines, custom forms, and more.
            </p>
            <Link href="/dashboard">
              <Button data-testid="button-back-to-dashboard">Back to Dashboard</Button>
            </Link>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return <>{children}</>;
}

export function useIsLiteTier(): { isLiteTier: boolean; isLoading: boolean } {
  const { data, isLoading } = useQuery<{ tenant: { subscriptionTier: string } }>({
    queryKey: ['/api/tenant'],
  });

  return {
    isLiteTier: data?.tenant?.subscriptionTier === 'lite',
    isLoading,
  };
}

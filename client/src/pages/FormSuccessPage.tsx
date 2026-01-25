import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, Home, CheckCircle } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import type { Tenant } from "@shared/schema";

export default function FormSuccessPage() {
  const [, params] = useRoute("/form-success/:formType");
  const [, setLocation] = useLocation();
  const { tenantId } = useTenant();
  const formType = params?.formType || "application";

  // Include tenantId in queryKey to prevent stale data when switching between tenant sites
  const { data: tenantData, isLoading } = useQuery<{ tenant: Tenant }>({
    queryKey: ["/api/tenant", tenantId],
    enabled: !!tenantId,
  });

  const organizationName = tenantData?.tenant?.name || "Our Rescue";

  const getFormTypeLabel = (type: string): string => {
    switch (type) {
      case "foster":
        return "foster application";
      case "volunteer":
        return "volunteer application";
      default:
        return "application";
    }
  };

  const getFormTypeMessage = (type: string): string => {
    switch (type) {
      case "foster":
        return "Your willingness to open your home to an animal in need means everything to us and the animals we serve.";
      case "volunteer":
        return "Your dedication to helping animals in need will make a real difference in their lives.";
      default:
        return "Your support means the world to us and the animals we care for.";
    }
  };

  // Show loading state while tenant data loads
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full shadow-lg">
          <CardContent className="pt-8 pb-8 px-6 text-center">
            <div className="mb-6 flex justify-center">
              <Skeleton className="h-20 w-20 rounded-full" />
            </div>
            <Skeleton className="h-8 w-48 mx-auto mb-4" />
            <Skeleton className="h-6 w-72 mx-auto mb-4" />
            <Skeleton className="h-24 w-full mb-6" />
            <Skeleton className="h-10 w-40 mx-auto" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full shadow-lg">
        <CardContent className="pt-8 pb-8 px-6 text-center">
          <div className="mb-6 flex justify-center">
            <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-4">
              <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
            </div>
          </div>

          <h1 className="text-2xl font-bold mb-2" data-testid="text-success-title">
            Thank You!
          </h1>

          <p className="text-lg text-muted-foreground mb-4" data-testid="text-organization-thanks">
            {organizationName} is grateful for your {getFormTypeLabel(formType)}.
          </p>

          <div className="bg-muted/50 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Heart className="h-5 w-5 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground" data-testid="text-form-message">
              {getFormTypeMessage(formType)}
            </p>
          </div>

          <p className="text-muted-foreground mb-6" data-testid="text-contact-timeline">
            A member of our team will review your application and contact you within the next several days.
          </p>

          <Button
            onClick={() => setLocation("/")}
            className="gap-2"
            data-testid="button-return-home"
          >
            <Home className="h-4 w-4" />
            Return to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

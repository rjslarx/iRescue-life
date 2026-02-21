import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Heart, Mail, ExternalLink } from "lucide-react";
import type { Tenant } from "@shared/schema";

export default function GivePage() {
  const { tenant: contextTenant, isLoading: tenantLoading } = useTenant();
  
  const { data: tenantData, isLoading: dataLoading } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });
  
  const isLoading = tenantLoading || dataLoading;
  const tenant = tenantData?.tenant || contextTenant;
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Organization not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const headerText = (tenant as any).donationLandingHeader || 
    `Thank you for supporting ${tenant.name}!`;
  
  const buttonLabel = (tenant as any).donationLandingButtonLabel || 
    "Donate Online (Credit/Debit)";
  
  const buttonUrl = (tenant as any).donationLandingButtonUrl;
  
  const mailingText = (tenant as any).donationLandingMailingText || 
    "Prefer to mail a check? Send to:";
  
  const mailingAddress = (tenant as any).donationLandingMailingAddress || 
    tenant.footerAddress;
  
  const handleDonateClick = () => {
    if (buttonUrl) {
      window.open(buttonUrl, '_blank', 'noopener,noreferrer');
    }
  };
  
  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4"
      data-testid="give-page-container"
    >
      <div className="w-full max-w-md space-y-6 text-center">
        {tenant.logoUrl && (
          <div className="flex justify-center mb-4">
            <img 
              src={tenant.logoUrl} 
              alt={`${tenant.name} logo`}
              className="h-20 w-auto object-contain"
              data-testid="img-org-logo"
            />
          </div>
        )}
        
        <h1 
          className="text-2xl sm:text-3xl font-bold text-foreground leading-tight"
          data-testid="text-donation-header"
        >
          {headerText}
        </h1>
        
        {buttonUrl && (
          <Button
            size="lg"
            onClick={handleDonateClick}
            className="w-full py-6 text-lg font-semibold bg-green-600 hover:bg-green-700 text-white shadow-lg"
            data-testid="button-donate-online"
          >
            <Heart className="w-5 h-5 mr-2" />
            {buttonLabel}
            <ExternalLink className="w-4 h-4 ml-2" />
          </Button>
        )}
        
        {!buttonUrl && (
          <Card className="bg-muted/50">
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-sm">
                Online donations are not currently configured. Please contact the organization directly.
              </p>
            </CardContent>
          </Card>
        )}
        
        {mailingAddress && (
          <div className="space-y-2 pt-4">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Mail className="w-4 h-4" />
              <p className="text-sm" data-testid="text-mailing-prompt">
                {mailingText}
              </p>
            </div>
            <Card className="bg-card">
              <CardContent className="pt-4 pb-4">
                <p 
                  className="text-foreground whitespace-pre-line font-medium"
                  data-testid="text-mailing-address"
                >
                  {mailingAddress}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
        
        <p className="text-xs text-muted-foreground pt-4">
          Your donation helps save lives. Thank you!
        </p>
      </div>
    </div>
  );
}

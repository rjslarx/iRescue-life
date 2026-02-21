import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Rocket, CheckCircle, XCircle, ExternalLink, Building2, Palette, Mail, Globe, Heart, Users } from "lucide-react";

interface ReviewStepProps {
  onNext: () => void;
}

export default function ReviewStep({ onNext }: ReviewStepProps) {
  // Fetch tenant info
  const { data: tenantResponse, isLoading: isLoadingTenant } = useQuery<{
    tenant: {
      id: string;
      name: string;
      subdomain: string;
      tagline?: string;
      contactEmail?: string;
      contactPhone?: string;
      logoUrl?: string;
      heroImageUrl?: string;
      branding?: { primaryColor?: string };
      resendEnabled: boolean;
      customDomain?: string;
      customDomainVerified: boolean;
    };
  }>({
    queryKey: ['/api/tenant'],
  });

  const tenant = tenantResponse?.tenant;

  // Fetch animals count
  const { data: animalsData } = useQuery<{ animals: any[] }>({
    queryKey: ['/api/animals'],
  });

  // Fetch team members count
  const { data: usersData } = useQuery<any[]>({
    queryKey: ['/api/users'],
  });

  const animalCount = animalsData?.animals?.length || 0;
  const teamMemberCount = usersData?.length || 0;

  // Build the public URL based on hybrid URL architecture
  // Path-based for trials: irescue.life/{subdomain}
  // Custom domain for paid: custom-domain.org
  const publicUrl = tenant?.customDomain && tenant.customDomainVerified
    ? `https://${tenant.customDomain}`
    : `https://irescue.life/${tenant?.subdomain}`;

  if (isLoadingTenant) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasBasicInfo = !!(tenant?.name && tenant?.contactEmail);
  const hasBranding = !!(tenant?.logoUrl || tenant?.heroImageUrl || tenant?.branding?.primaryColor);
  const hasEmail = !!(tenant?.resendEnabled);
  const hasDomain = !!(tenant?.customDomain && tenant?.customDomainVerified);

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <Rocket className="h-12 w-12 text-primary mx-auto mb-4" />
        <h2 className="text-2xl font-bold">You're ready to launch!</h2>
        <p className="text-muted-foreground">
          Review your setup and launch your rescue website to the world.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Setup Summary</CardTitle>
          <CardDescription>
            Here's what you've configured
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Basic Info */}
          <div className="flex items-start gap-3" data-testid="summary-basic-info">
            <div className="mt-0.5">
              {hasBasicInfo ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Organization Info</span>
              </div>
              {hasBasicInfo ? (
                <div className="text-sm text-muted-foreground">
                  <p>{tenant?.name}</p>
                  {tenant?.tagline && <p className="text-xs">{tenant.tagline}</p>}
                  {tenant?.contactEmail && <p className="text-xs">{tenant.contactEmail}</p>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not configured</p>
              )}
            </div>
          </div>

          <Separator />

          {/* Branding */}
          <div className="flex items-start gap-3" data-testid="summary-branding">
            <div className="mt-0.5">
              {hasBranding ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Branding</span>
              </div>
              {hasBranding ? (
                <div className="flex gap-2 items-center text-sm text-muted-foreground">
                  {tenant?.logoUrl && <Badge variant="secondary">Logo ✓</Badge>}
                  {tenant?.heroImageUrl && <Badge variant="secondary">Hero Image ✓</Badge>}
                  {tenant?.branding?.primaryColor && (
                    <Badge variant="secondary">
                      Color: {tenant.branding.primaryColor}
                    </Badge>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not configured</p>
              )}
            </div>
          </div>

          <Separator />

          {/* Email */}
          <div className="flex items-start gap-3" data-testid="summary-email">
            <div className="mt-0.5">
              {hasEmail ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <CheckCircle className="h-5 w-5 text-green-600" />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Email Setup</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {hasEmail ? "Custom Resend API configured" : "Using platform email credits"}
              </p>
            </div>
          </div>

          <Separator />

          {/* Domain */}
          <div className="flex items-start gap-3" data-testid="summary-domain">
            <div className="mt-0.5">
              {hasDomain ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Custom Domain</span>
              </div>
              {hasDomain ? (
                <p className="text-sm text-muted-foreground">{tenant?.customDomain}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Using {tenant?.subdomain}.irescue.life
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* Animals */}
          <div className="flex items-start gap-3" data-testid="summary-animals">
            <div className="mt-0.5">
              {animalCount > 0 ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Animals</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {animalCount === 0 ? "No animals added yet" : `${animalCount} animal${animalCount === 1 ? '' : 's'} added`}
              </p>
            </div>
          </div>

          <Separator />

          {/* Team */}
          <div className="flex items-start gap-3" data-testid="summary-team">
            <div className="mt-0.5">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Team Members</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {teamMemberCount} member{teamMemberCount === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Your Public Website
          </CardTitle>
          <CardDescription>
            Your rescue site is ready to go live!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Site URL:</span>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
              data-testid="link-public-site"
            >
              {publicUrl}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <p className="text-sm text-muted-foreground">
            After launching, you can continue adding animals, customizing content, and inviting team members from your dashboard.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-center pt-4">
        <Button 
          size="lg"
          onClick={onNext}
          data-testid="button-launch-site"
          className="min-w-[200px]"
        >
          <Rocket className="mr-2 h-5 w-5" />
          Launch My Site
        </Button>
      </div>
    </div>
  );
}

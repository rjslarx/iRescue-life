import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Mail, Globe, Clock } from "lucide-react";

export default function SignupSuccessPage() {
  const [subdomain, setSubdomain] = useState<string>("");
  const [, navigate] = useLocation();

  useEffect(() => {
    // Get subdomain from URL query params
    const urlParams = new URLSearchParams(window.location.search);
    const subdomainParam = urlParams.get("subdomain");
    
    if (subdomainParam) {
      setSubdomain(subdomainParam);
      
      // Fire Google Ads conversion tracking for subscription signup
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'conversion', {
          'send_to': 'AW-17428400771/FXpNCLrm2bobEIOVwfZA'
        });
      }
    } else {
      // If no subdomain provided, redirect to platform landing
      navigate("/platform");
    }
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <div className="rounded-full bg-green-500/10 p-4">
              <CheckCircle2 className="h-12 w-12 text-green-600" data-testid="icon-success" />
            </div>
          </div>
          <CardTitle className="text-3xl" data-testid="text-success-title">
            Account Created Successfully!
          </CardTitle>
          <CardDescription className="text-base">
            Your 30-day free trial has started. Check your email for setup instructions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert className="bg-blue-50 border-blue-200" data-testid="alert-email-sent">
            <Mail className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>📧 Check Your Email!</strong> We've sent you detailed setup instructions including how to configure your custom domain.
            </AlertDescription>
          </Alert>

          <div className="rounded-md bg-primary/5 border-2 border-primary p-6 space-y-3">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Your Website is Live!
            </h3>
            <p className="text-sm text-muted-foreground">
              Access your rescue's website and admin portal at:
            </p>
            <div className="rounded-md bg-card p-4 border-2 border-primary">
              <a 
                href={`https://irescue.life/${subdomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xl font-mono font-bold text-primary hover:underline block text-center"
                data-testid="link-tenant-site"
              >
                irescue.life/{subdomain}
              </a>
            </div>
          </div>

          <div className="rounded-md bg-muted p-6 space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Want Your Own Domain?
            </h3>
            <p className="text-sm text-muted-foreground">
              You can configure a custom domain (like yourrescue.org) to point to your rescue's site.
            </p>
            
            <div className="rounded-md border bg-card p-4 space-y-3 text-sm">
              <div>
                <p className="font-medium">Step 1: Configure in Admin Settings</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Log into your admin portal and go to <strong>Settings → Custom Domain</strong>
                </p>
              </div>
              <div>
                <p className="font-medium">Step 2: Add CNAME Record at Your Domain Registrar</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Point your domain to <strong className="font-mono">{subdomain}.irescue.life</strong> using a CNAME record
                </p>
                <div className="mt-2 rounded bg-muted p-2 font-mono text-xs">
                  <div>Type: CNAME</div>
                  <div>Name: @ (or your domain)</div>
                  <div>Value: {subdomain}.irescue.life</div>
                  <div>TTL: 3600</div>
                </div>
              </div>
              <div>
                <p className="font-medium">Step 3: Verify DNS</p>
                <p className="text-muted-foreground text-xs mt-1">
                  After DNS propagates (5 mins - 48 hours), verify in Settings → Custom Domain
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-md bg-muted p-6 space-y-3">
            <h3 className="font-semibold">What You Can Do After Logging In:</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                <span>Customize your branding with your logo and colors</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                <span>Add animals to your database and make them available for adoption</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                <span>Invite staff members, volunteers, and foster caregivers</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                <span>Track medical records, manage applications, and much more</span>
              </li>
            </ul>
          </div>

          <Button
            onClick={() => navigate("/platform")}
            variant="outline"
            className="w-full"
            size="lg"
            data-testid="button-back-to-platform"
          >
            Back to Platform Home
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Questions? Contact us at{" "}
            <a
              href="mailto:support@irescue.life"
              className="text-primary hover:underline"
              data-testid="link-support"
            >
              support@irescue.life
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

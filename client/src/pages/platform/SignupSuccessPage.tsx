import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Mail, Globe, ExternalLink, ArrowRight, Heart, Zap, PawPrint } from "lucide-react";

const TEAL = "#2B8CA3";
const TEAL_LIGHT = "#EDF6F8";

export default function SignupSuccessPage() {
  const [subdomain, setSubdomain] = useState<string>("");
  const [tier, setTier] = useState<"lite" | "professional">("lite");
  const [, navigate] = useLocation();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const subdomainParam = urlParams.get("subdomain");
    const tierParam = urlParams.get("tier");

    if (subdomainParam) {
      setSubdomain(subdomainParam);
      if (tierParam === "professional") {
        setTier("professional");
      }

      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'conversion', {
          'send_to': 'AW-17428400771/FXpNCLrm2bobEIOVwfZA'
        });
      }
    } else {
      navigate("/platform");
    }
  }, [navigate]);

  const isPro = tier === "professional";
  const portalUrl = `https://irescue.life/${subdomain}`;
  const loginUrl = `/${subdomain}/login`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4 sm:p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <div className="rounded-full p-4" style={{ backgroundColor: TEAL_LIGHT }}>
              <CheckCircle2 className="h-12 w-12" style={{ color: TEAL }} data-testid="icon-success" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <CardTitle className="text-2xl sm:text-3xl" data-testid="text-success-title">
                Account Created Successfully!
              </CardTitle>
            </div>
            <Badge style={{ backgroundColor: TEAL }} className="text-white" data-testid="badge-tier">
              {isPro ? (
                <><Zap className="h-3 w-3 mr-1" />14-Day Pro Trial</>
              ) : (
                <><Heart className="h-3 w-3 mr-1" />Lite Plan</>
              )}
            </Badge>
          </div>
          <CardDescription className="text-base">
            {isPro
              ? "Your Professional trial is active. Enjoy all features for 14 days."
              : "Your Lite account is ready. Start managing your rescue today."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Alert className="border" style={{ backgroundColor: TEAL_LIGHT, borderColor: `${TEAL}30` }} data-testid="alert-email-sent">
            <Mail className="h-4 w-4" style={{ color: TEAL }} />
            <AlertDescription style={{ color: "#1a1a1a" }}>
              <strong>Check your email</strong> for setup instructions and a link to log in.
            </AlertDescription>
          </Alert>

          <div className="rounded-lg border-2 p-5 space-y-3" style={{ borderColor: TEAL }}>
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Globe className="h-5 w-5" style={{ color: TEAL }} />
              Your Website is Live
            </h3>
            <p className="text-sm text-muted-foreground">
              Access your rescue's website and admin portal at:
            </p>
            <div className="rounded-md bg-muted p-3 border">
              <a
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lg font-mono font-bold hover:underline flex items-center justify-center gap-2"
                style={{ color: TEAL }}
                data-testid="link-tenant-site"
              >
                irescue.life/{subdomain}
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="rounded-lg bg-muted p-5 space-y-3">
            <h3 className="font-semibold">Next Steps</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: TEAL }} />
                <span>Customize your branding with your logo and colors</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: TEAL }} />
                <span>Add animals to your database and make them available for adoption</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: TEAL }} />
                <span>Invite staff members, volunteers, and foster caregivers</span>
              </li>
              {!isPro && (
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: TEAL }} />
                  <span>Configure your JotForm / Google Form URLs in Settings</span>
                </li>
              )}
              {isPro && (
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: TEAL }} />
                  <span>Set up adoption and foster pipelines with built-in forms</span>
                </li>
              )}
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: TEAL }} />
                <span>Connect Stripe to accept donations and adoption fees</span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <a href={loginUrl} className="flex-1">
              <Button
                className="w-full text-white"
                style={{ backgroundColor: TEAL }}
                size="lg"
                data-testid="button-go-to-dashboard"
              >
                Go to Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>
            <Button
              onClick={() => navigate("/platform")}
              variant="outline"
              size="lg"
              data-testid="button-back-to-platform"
            >
              Back to Home
            </Button>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Questions? Contact us at{" "}
            <a
              href="mailto:support@irescue.life"
              className="font-medium hover:underline"
              style={{ color: TEAL }}
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

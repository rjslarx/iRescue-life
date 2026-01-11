import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSEO } from "@/hooks/useSEO";
import { ArrowLeft, PawPrint, CheckCircle, Mail, CreditCard, Calendar, Cloud, Bot, Building2, Smartphone } from "lucide-react";

export default function PlatformIntegrationsInfoPage() {
  useSEO({
    title: "Integrations - iRescue.life",
    description: "Explore all integrations available with iRescue.life animal rescue management platform.",
    siteName: "iRescue.life",
  });

  const integrations = [
    {
      name: "Stripe",
      category: "Payments",
      icon: CreditCard,
      description: "Accept donations and process payments securely with Stripe's industry-leading payment platform.",
      features: [
        "One-time and recurring donations",
        "Subscription management",
        "PCI compliance built-in",
        "Support for all major payment methods",
        "Donor portal for self-service"
      ],
      status: "Active"
    },
    {
      name: "PayPal",
      category: "Payments",
      icon: CreditCard,
      description: "Offer PayPal as an alternative payment option for donors who prefer it.",
      features: [
        "One-click donations",
        "Trusted payment brand",
        "Mobile-friendly checkout",
        "International currency support"
      ],
      status: "Active"
    },
    {
      name: "Resend",
      category: "Email",
      icon: Mail,
      description: "Professional email delivery for all your rescue's communication needs.",
      features: [
        "High deliverability rates",
        "Email templates and campaigns",
        "Newsletter subscriptions",
        "Automated notifications",
        "Inbound email processing"
      ],
      status: "Active"
    },
    {
      name: "Google Workspace for Nonprofits",
      category: "Email & Productivity",
      icon: Mail,
      description: "Optional integration for nonprofits to unlock free unlimited email sending and productivity tools.",
      features: [
        "Free Gmail API email sending (up to Google's limits)",
        "Google Calendar sync",
        "Google Drive storage integration",
        "Free for nonprofits (up to 2,000 users)",
        "Automatic fallback to Resend"
      ],
      status: "Optional",
      badge: "For Nonprofits"
    },
    {
      name: "OpenAI",
      category: "AI",
      icon: Bot,
      description: "Power the AI Help Assistant with OpenAI's GPT models for context-aware support.",
      features: [
        "Context-aware responses",
        "Natural language understanding",
        "Instant answers about animals and applications",
        "Staff time savings",
        "Continuous learning"
      ],
      status: "Active",
      badge: "New"
    },
    {
      name: "PetFinder",
      category: "Adoption Platforms",
      icon: PawPrint,
      description: "Sync your adoptable animals to PetFinder automatically.",
      features: [
        "Automatic listing sync",
        "Photo and bio updates",
        "Status synchronization",
        "Increased visibility"
      ],
      status: "Coming Soon"
    },
    {
      name: "Adopt-a-Pet",
      category: "Adoption Platforms",
      icon: PawPrint,
      description: "Expand your reach by syncing animals to Adopt-a-Pet.com.",
      features: [
        "Multi-platform exposure",
        "Automated updates",
        "Lead tracking",
        "Analytics integration"
      ],
      status: "Coming Soon"
    },
    {
      name: "RescueGroups.org",
      category: "Adoption Platforms",
      icon: Building2,
      description: "Connect with the RescueGroups.org network for additional adoption visibility.",
      features: [
        "Network-wide listings",
        "Volunteer coordination",
        "Resource sharing",
        "Community support"
      ],
      status: "Coming Soon"
    },
    {
      name: "Google Analytics",
      category: "Analytics",
      icon: Building2,
      description: "Track website performance and visitor behavior with GA4 integration.",
      features: [
        "Page view tracking",
        "Conversion tracking",
        "User behavior insights",
        "Custom event tracking"
      ],
      status: "Active"
    },
    {
      name: "Replit Object Storage",
      category: "Storage",
      icon: Cloud,
      description: "Secure cloud storage for animal photos, documents, and files.",
      features: [
        "Unlimited file storage",
        "Secure presigned URLs",
        "Public and private storage",
        "Fast CDN delivery"
      ],
      status: "Active"
    }
  ];

  const categories = Array.from(new Set(integrations.map(i => i.category)));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50">
        <div className="container max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/platform">
              <a className="flex items-center gap-2 hover:opacity-80 transition-opacity" data-testid="link-home">
                <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
                  <PawPrint className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="font-display font-bold text-xl">iRescue.life</span>
              </a>
            </Link>
            <Link href="/platform">
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-12 sm:py-20 bg-muted/30">
        <div className="container max-w-7xl mx-auto px-6 sm:px-8 text-center">
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold mb-4" data-testid="heading-integrations">
            Powerful Integrations
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto">
            Connect iRescue.life with the tools you already use. Our integrations help you work smarter, not harder.
          </p>
        </div>
      </section>

      {/* Integrations by Category */}
      <div className="container max-w-7xl mx-auto px-6 py-12 sm:py-16">
        {categories.map((category) => (
          <div key={category} className="mb-12">
            <h2 className="font-display text-2xl sm:text-3xl font-bold mb-6" data-testid={`heading-category-${category.toLowerCase().replace(/\s+/g, '-')}`}>
              {category}
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {integrations
                .filter(integration => integration.category === category)
                .map((integration, index) => (
                  <Card key={index} className="hover-elevate" data-testid={`integration-card-${integration.name.toLowerCase().replace(/\s+/g, '-')}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <integration.icon className="h-6 w-6 text-primary" />
                        </div>
                        {integration.badge && (
                          <Badge variant="outline" className="text-xs" data-testid={`badge-${integration.badge.toLowerCase().replace(/\s+/g, '-')}`}>
                            {integration.badge}
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-xl">{integration.name}</CardTitle>
                      <CardDescription className="text-sm">
                        {integration.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <ul className="space-y-2 text-sm">
                          {integration.features.map((feature, fIndex) => (
                            <li key={fIndex} className="flex items-start gap-2">
                              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                              <span className="text-muted-foreground">{feature}</span>
                            </li>
                          ))}
                        </ul>
                        <div>
                          <Badge 
                            variant={integration.status === "Active" ? "default" : integration.status === "Optional" ? "secondary" : "outline"}
                            data-testid={`status-${integration.status.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            {integration.status}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </div>
        ))}
      </div>

      {/* CTA Section */}
      <section className="py-12 sm:py-20 bg-muted/30">
        <div className="container max-w-4xl mx-auto px-6 text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-4">
            Need a Custom Integration?
          </h2>
          <p className="text-muted-foreground mb-8 text-lg">
            We're always expanding our integration ecosystem. Let us know which tools you'd like to connect.
          </p>
          <Button size="lg" asChild data-testid="button-request-integration">
            <a href="mailto:integrations@irescue.life">Request an Integration</a>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 bg-muted/30 mt-12">
        <div className="container max-w-7xl mx-auto px-6 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Turbeau, LLC. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

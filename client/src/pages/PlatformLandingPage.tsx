import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DemoRequestModal } from "@/components/DemoRequestModal";
import { DemoAccessDialog } from "@/components/DemoAccessDialog";
import { ContactFormModal } from "@/components/ContactFormModal";
import { AboutUsModal } from "@/components/AboutUsModal";
import { BlogModal } from "@/components/BlogModal";
import { PrivacyPolicyModal } from "@/components/PrivacyPolicyModal";
import { TermsOfServiceModal } from "@/components/TermsOfServiceModal";
import { CookiePolicyModal } from "@/components/CookiePolicyModal";
import { useSEO } from "@/hooks/useSEO";
import { 
  PawPrint, 
  CheckCircle,
  ArrowRight,
  Heart,
  Play,
  Zap,
  Crown,
  Sparkles,
} from "lucide-react";

import dualPhoneMockup from "@assets/generated_images/dual_phone_app_mockup.png";

const TEAL = "#2B8CA3";
const TEAL_DARK = "#1F7189";
const TEAL_LIGHT = "#EDF6F8";
const TEAL_BADGE = "#E0F2F6";
const RED_HEART = "#E25555";

export default function PlatformLandingPage() {
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [demoAccessDialogOpen, setDemoAccessDialogOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [aboutUsModalOpen, setAboutUsModalOpen] = useState(false);
  const [blogModalOpen, setBlogModalOpen] = useState(false);
  const [privacyPolicyModalOpen, setPrivacyPolicyModalOpen] = useState(false);
  const [termsOfServiceModalOpen, setTermsOfServiceModalOpen] = useState(false);
  const [cookiePolicyModalOpen, setCookiePolicyModalOpen] = useState(false);

  useSEO({
    title: "iRescue.life - Complete Animal Rescue Management Platform",
    description: "All-in-one platform for animal rescues. Manage adoptions, volunteers, finances, medical records, and more. Choose Lite (free) or Pro ($39/mo) to fit your rescue's needs.",
    siteName: "iRescue.life",
  });

  const sharedFeatures = [
    "Unlimited animals & team members",
    "Public website & adoptable profiles",
    "Stripe donation & adoption payments",
    "Kennel management & layout editor",
    "Contact & communications hub",
    "Event calendar & volunteer signups",
    "Supply wishlist (Amazon, Chewy)",
    "Happy Tails success stories",
    "Partner organizations & transports",
    "Analytics & reporting",
    "PWA mobile app",
    "AI help assistant",
  ];

  const liteOnlyFeatures = [
    "Use your own JotForm / Google Forms",
    "5% platform fee on transactions",
  ];

  const proOnlyFeatures = [
    "Built-in adoption pipeline (Kanban)",
    "Foster & volunteer pipelines",
    "Intake manager (surrender requests)",
    "Medical pipeline dashboard",
    "E-signature contracts & PDFs",
    "Custom forms builder",
    "Grant tracking & compliance",
    "Newsletter designer & campaigns",
    "Site permissions & access control",
    "Adopter portal",
    "0% platform fees — keep every dollar",
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md flex items-center justify-center" style={{ backgroundColor: TEAL }}>
              <PawPrint className="h-5 w-5 text-white" />
            </div>
            <span className="font-display font-bold text-lg">iRescue.life</span>
          </div>
          <nav className="hidden md:flex items-center gap-4">
            <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-pricing">
              Pricing
            </a>
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-features">
              Features
            </a>
            <Link href="/platform/login">
              <Button variant="ghost" size="sm" data-testid="button-team-login">
                Team Login
              </Button>
            </Link>
            <Button 
              variant="outline" 
              size="sm" 
              data-testid="button-try-demo"
              onClick={() => setDemoAccessDialogOpen(true)}
            >
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Live Demo
            </Button>
            <Link href="/platform/signup?tier=lite">
              <Button size="sm" style={{ backgroundColor: TEAL }} className="hover:opacity-90" data-testid="button-start-free">
                Start Free
              </Button>
            </Link>
          </nav>
          <div className="md:hidden flex items-center gap-2">
            <Link href="/platform/login">
              <Button variant="ghost" size="sm" data-testid="button-mobile-login">Login</Button>
            </Link>
            <Link href="/platform/signup?tier=lite">
              <Button size="sm" style={{ backgroundColor: TEAL }} className="hover:opacity-90" data-testid="button-mobile-start">
                Start Free
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ======== FOLD 1: Hero ======== */}
      <section className="py-12 sm:py-16 lg:py-20 overflow-hidden" style={{ background: `linear-gradient(135deg, ${TEAL_LIGHT} 0%, transparent 60%)` }}>
        <div className="container max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="px-2.5 py-0.5 text-xs" style={{ backgroundColor: TEAL_BADGE, borderColor: `${TEAL}40`, color: TEAL }}>
                  <Sparkles className="h-3 w-3 mr-1" />
                  AI Assistant
                </Badge>
                <Badge variant="outline" className="px-2.5 py-0.5 text-xs" style={{ backgroundColor: TEAL_BADGE, borderColor: `${TEAL}40`, color: TEAL }}>
                  <Heart className="h-3 w-3 mr-1" style={{ color: RED_HEART }} />
                  Free Tier Available
                </Badge>
              </div>

              <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.1]" data-testid="heading-hero">
                Less Paperwork.<br />
                <span style={{ color: TEAL }}>More Happy Tails.</span>
              </h1>
              
              <p className="text-base sm:text-lg text-muted-foreground max-w-lg">
                The all-in-one platform for animal rescues. From intake to forever home, manage everything your organization needs in one place.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <Link href="/platform/signup?tier=lite">
                  <Button size="lg" className="text-white" style={{ backgroundColor: TEAL }} data-testid="button-hero-start">
                    Start Free Today
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Button 
                  variant="outline" 
                  size="lg" 
                  onClick={() => setDemoAccessDialogOpen(true)}
                  data-testid="button-hero-demo"
                >
                  <Play className="mr-2 h-4 w-4" />
                  Try Live Demo
                </Button>
              </div>

              <p className="text-sm text-muted-foreground pt-2">
                No credit card required. Start with our free Lite tier today.
              </p>
            </div>
            
            <div className="relative hidden lg:block">
              <div className="relative z-10">
                <img 
                  src={dualPhoneMockup}
                  alt="iRescue.life mobile app showing animal management dashboard"
                  className="w-full h-auto rounded-xl shadow-2xl"
                  data-testid="image-hero-mockup"
                />
              </div>
              <div className="absolute -top-6 -right-6 h-48 w-48 rounded-full blur-3xl" style={{ backgroundColor: `${TEAL}15` }} />
              <div className="absolute -bottom-6 -left-6 h-36 w-36 rounded-full blur-3xl" style={{ backgroundColor: `${TEAL}15` }} />
            </div>
          </div>
        </div>
      </section>

      {/* ======== FOLD 2: Pricing / Tier Comparison ======== */}
      <section id="pricing" className="py-12 sm:py-16 lg:py-20">
        <div className="container max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center space-y-3 mb-10">
            <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: TEAL }}>Simple Pricing</p>
            <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold" data-testid="heading-pricing">
              Choose the Plan That Fits Your Rescue
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              No hidden fees. Cancel anytime.
            </p>
          </div>

          <div id="features" className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
            {/* Lite Tier */}
            <Card className="border-2 flex flex-col" data-testid="card-lite-tier">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: TEAL_LIGHT }}>
                    <Heart className="h-5 w-5" style={{ color: TEAL }} />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Lite</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">For rescues using external forms</p>
                  </div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">$0</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <p className="text-sm mt-1" style={{ color: TEAL }}>5% platform fee on Stripe transactions</p>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <div className="space-y-4 flex-1">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Lite highlights</p>
                    <ul className="space-y-1.5">
                      {liteOnlyFeatures.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: TEAL }} />
                          <span className="font-medium">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="border-t pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2" data-testid="heading-features">Included in both tiers</p>
                    <ul className="space-y-1.5">
                      {sharedFeatures.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm" data-testid={`feature-shared-${i}`}>
                          <CheckCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-muted-foreground/60" />
                          <span className="text-muted-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <Link href="/platform/signup?tier=lite" className="mt-6">
                  <Button className="w-full" variant="outline" data-testid="button-get-lite">
                    Get Started Free
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Pro Tier */}
            <Card className="border-2 flex flex-col relative" style={{ borderColor: TEAL }} data-testid="card-pro-tier">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="text-white" style={{ backgroundColor: TEAL }}>
                  <Crown className="h-3 w-3 mr-1" />
                  BEST VALUE
                </Badge>
              </div>
              <CardHeader className="pb-3 pt-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: TEAL }}>
                    <Zap className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Professional</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Full-featured with built-in pipelines</p>
                  </div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">$39</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <p className="text-sm font-semibold mt-1" style={{ color: TEAL }}>0% platform fees</p>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <div className="space-y-4 flex-1">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Everything in Lite, plus</p>
                    <ul className="space-y-1.5">
                      {proOnlyFeatures.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: TEAL }} />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="border-t pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Plus all Lite features</p>
                    <ul className="space-y-1.5">
                      {sharedFeatures.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-muted-foreground/60" />
                          <span className="text-muted-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <Link href="/platform/signup?tier=professional" className="mt-6">
                  <Button className="w-full text-white" style={{ backgroundColor: TEAL }} data-testid="button-get-pro">
                    Start Free Trial
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ======== Final CTA ======== */}
      <section className="py-12 sm:py-16" style={{ backgroundColor: TEAL }}>
        <div className="container max-w-3xl mx-auto text-center space-y-6 px-4 sm:px-6">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-white" data-testid="heading-cta">
            Ready to save more lives?
          </h2>
          <p className="text-lg text-white/80">
            Join rescue organizations using iRescue.life to streamline their operations.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/platform/signup?tier=lite">
              <Button size="lg" className="text-lg px-8" style={{ backgroundColor: "white", color: TEAL }} data-testid="button-cta-lite">
                Start Free (Lite)
              </Button>
            </Link>
            <Link href="/platform/signup?tier=professional">
              <Button size="lg" variant="outline" className="text-lg px-8 border-white/50 text-white backdrop-blur-sm bg-white/10" data-testid="button-cta-pro">
                Start Pro Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
          <p className="text-sm text-white/60">
            No credit card required for either tier.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t bg-muted/30" data-testid="section-footer">
        <div className="container max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 rounded-md flex items-center justify-center" style={{ backgroundColor: TEAL }}>
                  <PawPrint className="h-5 w-5 text-white" />
                </div>
                <span className="font-display font-bold text-lg">iRescue.life</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Less Paperwork. More Happy Tails.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-3 text-sm" style={{ color: TEAL }}>Product</h4>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li><a href="#pricing" className="hover:text-foreground transition-colors" data-testid="link-pricing">Pricing</a></li>
                <li><a href="#features" className="hover:text-foreground transition-colors" data-testid="link-features">Features</a></li>
                <li><button onClick={() => setDemoAccessDialogOpen(true)} className="hover:text-foreground transition-colors" data-testid="link-demo">Live Demo</button></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-3 text-sm" style={{ color: TEAL }}>Company</h4>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li><button onClick={() => setAboutUsModalOpen(true)} className="hover:text-foreground transition-colors" data-testid="link-about">About Us</button></li>
                <li><button onClick={() => setBlogModalOpen(true)} className="hover:text-foreground transition-colors" data-testid="link-blog">Blog</button></li>
                <li><button onClick={() => setContactModalOpen(true)} className="hover:text-foreground transition-colors" data-testid="link-contact">Contact</button></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-3 text-sm" style={{ color: TEAL }}>Legal</h4>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li><Link href="/platform/privacy" className="hover:text-foreground transition-colors" data-testid="link-privacy">Privacy Policy</Link></li>
                <li><Link href="/platform/terms" className="hover:text-foreground transition-colors" data-testid="link-terms">Terms of Service</Link></li>
                <li><button onClick={() => setCookiePolicyModalOpen(true)} className="hover:text-foreground transition-colors" data-testid="link-cookies">Cookie Policy</button></li>
              </ul>
            </div>
          </div>
          
          <div className="mt-6 pt-4 border-t" style={{ borderColor: `${TEAL}20` }}>
            <p className="text-xs text-muted-foreground text-right">
              &copy; 2025 Turbeau, LLC. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <DemoRequestModal open={demoModalOpen} onOpenChange={setDemoModalOpen} />
      <DemoAccessDialog open={demoAccessDialogOpen} onOpenChange={setDemoAccessDialogOpen} />
      <ContactFormModal open={contactModalOpen} onOpenChange={setContactModalOpen} />
      <AboutUsModal 
        open={aboutUsModalOpen} 
        onOpenChange={setAboutUsModalOpen}
        onStartTrial={() => setDemoModalOpen(true)}
      />
      <BlogModal 
        open={blogModalOpen} 
        onOpenChange={setBlogModalOpen}
        onStartTrial={() => setDemoModalOpen(true)}
      />
      <PrivacyPolicyModal 
        open={privacyPolicyModalOpen} 
        onOpenChange={setPrivacyPolicyModalOpen}
        onOpenContact={() => setContactModalOpen(true)}
      />
      <TermsOfServiceModal 
        open={termsOfServiceModalOpen} 
        onOpenChange={setTermsOfServiceModalOpen}
        onOpenContact={() => setContactModalOpen(true)}
      />
      <CookiePolicyModal 
        open={cookiePolicyModalOpen} 
        onOpenChange={setCookiePolicyModalOpen}
        onOpenContact={() => setContactModalOpen(true)}
      />
    </div>
  );
}

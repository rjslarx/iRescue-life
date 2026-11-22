import { useState } from "react";
import { usePlatformAcquisition } from "@/hooks/usePlatformAcquisition";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DemoRequestModal } from "@/components/DemoRequestModal";
import { DemoAccessDialog } from "@/components/DemoAccessDialog";
import { ContactFormModal } from "@/components/ContactFormModal";
import { AboutUsModal } from "@/components/AboutUsModal";
import { PrivacyPolicyModal } from "@/components/PrivacyPolicyModal";
import { TermsOfServiceModal } from "@/components/TermsOfServiceModal";
import { CookiePolicyModal } from "@/components/CookiePolicyModal";
import { useSEO } from "@/hooks/useSEO";
import { 
  PawPrint,
  ArrowRight,
  Heart,
  Play,
  Sparkles,
  ExternalLink,
  Quote,
  Megaphone,
  UserRoundCheck,
  FileText,
  Radio,
  Building2,
  Stethoscope,
  CalendarDays,
  HeartHandshake,
} from "lucide-react";

interface FeaturedRescue {
  name: string;
  domain: string;
  url: string;
  logoUrl: string | null;
}

import dualPhoneMockup from "@assets/generated_images/dual_phone_app_mockup.png";

const TEAL = "#2B8CA3";
const TEAL_DARK = "#1F7189";
const TEAL_LIGHT = "#EDF6F8";
const TEAL_BADGE = "#E0F2F6";
const RED_HEART = "#E25555";

export default function PlatformLandingPage() {
  const { pricingRef, onClickCapture } = usePlatformAcquisition("landing");
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [demoAccessDialogOpen, setDemoAccessDialogOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [aboutUsModalOpen, setAboutUsModalOpen] = useState(false);
  const [privacyPolicyModalOpen, setPrivacyPolicyModalOpen] = useState(false);
  const [termsOfServiceModalOpen, setTermsOfServiceModalOpen] = useState(false);
  const [cookiePolicyModalOpen, setCookiePolicyModalOpen] = useState(false);

  const { data: featuredRescues = [], isLoading: rescuesLoading } = useQuery<FeaturedRescue[]>({
    queryKey: ["/api/platform/featured-rescues"],
  });
  const [failedLogos, setFailedLogos] = useState<Record<string, boolean>>({});

  useSEO({
    title: "iRescue.life - Complete Animal Rescue Management Platform",
    description: "All-in-one platform for animal rescues. Manage adoptions, volunteers, finances, medical records, and more. Start free or upgrade to Scale ($39/mo) for zero platform fees.",
    siteName: "iRescue.life",
  });

  return (
    <div className="min-h-screen bg-background" onClickCapture={onClickCapture}>
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
            <Link href="/platform/pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-pricing">
              Pricing
            </Link>
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
              data-acquisition-action="demo"
              onClick={() => setDemoAccessDialogOpen(true)}
            >
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Live Demo
            </Button>
            <Link href="/platform/signup?tier=lite">
              <Button size="sm" style={{ backgroundColor: TEAL }} className="text-white" data-testid="button-start-free">
                Start Free
              </Button>
            </Link>
          </nav>
          <div className="md:hidden flex items-center gap-2">
            <Link href="/platform/login">
              <Button variant="ghost" size="sm" data-testid="button-mobile-login">Login</Button>
            </Link>
            <Link href="/platform/signup?tier=lite">
              <Button size="sm" style={{ backgroundColor: TEAL }} className="text-white" data-testid="button-mobile-start">
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
                  data-acquisition-action="demo"
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

      {/* ======== FOLD 2: Pricing CTA ======== */}
      <section ref={pricingRef} id="pricing" className="py-12 sm:py-16 lg:py-20">
        <div className="container max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: TEAL }}>Simple Pricing</p>
            <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold" data-testid="heading-pricing">
              Same Features. Two Billing Models.
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Every rescue gets full access to every feature and free email support. Just pick the billing model that fits your cash flow.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 max-w-2xl mx-auto pt-6">
              <Card className="text-center p-6" data-testid="card-starter-summary">
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1">Starter</p>
                <p className="text-3xl font-bold">$0<span className="text-base font-normal text-muted-foreground">/mo</span></p>
                <p className="text-sm mt-1" style={{ color: TEAL }}>+ 5% platform fee</p>
              </Card>
              <Card className="text-center p-6 border-2" style={{ borderColor: TEAL }} data-testid="card-scale-summary">
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1">Scale</p>
                <p className="text-3xl font-bold">$39<span className="text-base font-normal text-muted-foreground">/mo</span></p>
                <p className="text-sm font-semibold mt-1" style={{ color: TEAL }}>0% platform fee</p>
              </Card>
            </div>
            <div className="pt-4">
              <Link href="/platform/pricing">
                <Button size="lg" style={{ backgroundColor: TEAL }} className="text-white" data-testid="button-view-pricing">
                  Compare Plans
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ======== Feature Highlights ======== */}
      <section id="features" className="py-12 sm:py-16 lg:py-20 bg-muted/30">
        <div className="container max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center space-y-3 mb-10">
            <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: TEAL }}>
              More Than Rescue Management
            </p>
            <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold">
              Modern tools that help your rescue grow
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Save time behind the scenes, stay connected after adoption, and reach more people who can help.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {[
              {
                icon: Megaphone,
                title: "AI-Powered Social Posts",
                description:
                  "Create stronger posts for adoptions, fosters, volunteers, fundraisers, and urgent needs—with the right action link included.",
              },
              {
                icon: UserRoundCheck,
                title: "Adopter Portal",
                description:
                  "Keep adopters connected with pet records, microchip details, care reminders, and post-adoption updates.",
              },
              {
                icon: Radio,
                title: "Targeted Team Broadcasts",
                description:
                  "Reach the right fosters, volunteers, staff, or board members by email, SMS, and push notification.",
              },
              {
                icon: FileText,
                title: "AI-Assisted Grant Work",
                description:
                  "Draft grant content, track deadlines and compliance, and export the reports funders need.",
              },
              {
                icon: Building2,
                title: "Kennel Facility Manager",
                description:
                  "Design your kennel layout, see occupancy at a glance, and keep animal locations organized across your facility.",
              },
              {
                icon: Stethoscope,
                title: "Medical Records & Care",
                description:
                  "Track vaccinations, medications, treatments, preventatives, veterinary records, and upcoming care in one place.",
              },
              {
                icon: CalendarDays,
                title: "Volunteer Calendars",
                description:
                  "Publish shifts, let volunteers schedule themselves, and keep signups and coverage organized without endless messages.",
              },
              {
                icon: HeartHandshake,
                title: "Fundraising Built for Rescues",
                description:
                  "Accept donations and launch peer-to-peer campaigns, animal fundraisers, events, recurring giving, and more.",
              },
            ].map(({ icon: Icon, title, description }) => (
              <Card key={title} className="p-6 flex gap-4" data-testid={`feature-${title.toLowerCase().replaceAll(" ", "-")}`}>
                <div
                  className="h-11 w-11 rounded-lg flex shrink-0 items-center justify-center"
                  style={{ backgroundColor: TEAL_BADGE }}
                >
                  <Icon className="h-5 w-5" style={{ color: TEAL }} aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-lg">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
                </div>
              </Card>
            ))}
          </div>

          <Card className="mt-5 p-6 sm:p-8" data-testid="feature-rescue-inbox">
            <Badge variant="secondary" className="mb-3">Optional Twilio integration</Badge>
            <h3 className="font-display font-semibold text-xl">
              One rescue number. A shared team inbox.
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Connect your rescue’s Twilio account to manage texts, calls, and voicemail in the Rescue Inbox.
              Route conversations to the right volunteers, answer common questions, and let team members
              claim conversations to avoid duplicate replies.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Optional integration. Twilio setup and usage charges apply.
            </p>
          </Card>

          <p className="mt-8 text-center text-sm font-medium text-muted-foreground">
            Every plan includes all features and free email support. Optional third-party services require separate setup and may have additional costs.
          </p>
        </div>
      </section>

      {/* ======== Customer Testimonial ======== */}
      <section className="py-12 sm:py-16" aria-labelledby="southern-pets-testimonial">
        <div className="container max-w-4xl mx-auto px-4 sm:px-6">
          <Card
            className="relative overflow-hidden border-0 p-7 sm:p-10 shadow-sm"
            style={{ backgroundColor: TEAL_LIGHT }}
            data-testid="testimonial-southern-pets"
          >
            <Quote
              className="absolute right-5 top-5 h-16 w-16 opacity-10"
              style={{ color: TEAL }}
              aria-hidden="true"
            />
            <div className="relative space-y-5">
              <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: TEAL }}>
                What Rescues Are Saying
              </p>
              <blockquote
                id="southern-pets-testimonial"
                className="font-display text-xl sm:text-2xl font-semibold leading-relaxed text-foreground"
              >
                “iRescue.life brings practical, easy-to-use tools for fundraising, animal care,
                applications, and more into one place. It saves our rescue valuable time, so we
                can spend more of it where it matters most—helping animals.”
              </blockquote>
              <footer>
                <p className="font-semibold">Southern Pets Animal Rescue</p>
                <p className="text-sm text-muted-foreground">
                  Nonprofit animal rescue
                </p>
              </footer>
            </div>
          </Card>
        </div>
      </section>

      {/* ======== Featured Rescues ======== */}
      {(rescuesLoading || featuredRescues.length > 0) && (
        <section className="py-12 sm:py-16 lg:py-20" style={{ backgroundColor: TEAL_LIGHT }} data-testid="section-featured-rescues">
          <div className="container max-w-6xl mx-auto px-4 sm:px-6">
            <div className="text-center space-y-3 mb-10">
              <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: TEAL }}>Trusted By Rescues</p>
              <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold" data-testid="heading-featured-rescues">
                Rescues Already Saving Lives on iRescue
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Real organizations using iRescue.life every day. Visit their sites to see them in action.
              </p>
            </div>

            {rescuesLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <Card key={i} className="p-6 animate-pulse" data-testid={`skeleton-rescue-${i}`}>
                    <div className="h-16 w-16 rounded-md bg-muted mx-auto mb-4" />
                    <div className="h-4 w-3/4 bg-muted rounded mx-auto mb-3" />
                    <div className="h-8 w-28 bg-muted rounded mx-auto" />
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {featuredRescues.map((rescue) => (
                  <Card
                    key={rescue.domain}
                    className="p-6 flex flex-col items-center text-center gap-4"
                    data-testid={`card-rescue-${rescue.domain}`}
                  >
                    {rescue.logoUrl && !failedLogos[rescue.domain] ? (
                      <img
                        src={rescue.logoUrl}
                        alt={`${rescue.name} logo`}
                        className="h-16 w-16 object-contain rounded-md"
                        loading="lazy"
                        onError={() => setFailedLogos((prev) => ({ ...prev, [rescue.domain]: true }))}
                        data-testid={`img-rescue-logo-${rescue.domain}`}
                      />
                    ) : (
                      <div
                        className="h-16 w-16 rounded-md flex items-center justify-center"
                        style={{ backgroundColor: TEAL_BADGE }}
                        aria-hidden="true"
                      >
                        <PawPrint className="h-8 w-8" style={{ color: TEAL }} />
                      </div>
                    )}

                    {/* Tile reserves space for an optional testimonial quote (added later). */}
                    <h3 className="font-display font-semibold text-lg leading-snug flex-1" data-testid={`text-rescue-name-${rescue.domain}`}>
                      {rescue.name}
                    </h3>

                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      data-testid={`link-rescue-visit-${rescue.domain}`}
                    >
                      <a href={rescue.url} target="_blank" rel="noopener noreferrer">
                        Visit Site
                        <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

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
              <Button size="lg" className="text-lg px-8" style={{ backgroundColor: "white", color: TEAL }} data-testid="button-cta-starter">
                Start for Free
              </Button>
            </Link>
            <Link href="/platform/pricing">
              <Button size="lg" variant="outline" className="text-lg px-8 border-white/50 text-white backdrop-blur-sm bg-white/10" data-testid="button-cta-pricing">
                Compare Plans
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
          <p className="text-sm text-white/60">
            No credit card required for either plan.
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
                <li><Link href="/platform/pricing" className="hover:text-foreground transition-colors" data-testid="link-pricing">Pricing</Link></li>
                <li><a href="#features" className="hover:text-foreground transition-colors" data-testid="link-features">Features</a></li>
                <li><button data-acquisition-action="demo" onClick={() => setDemoAccessDialogOpen(true)} className="hover:text-foreground transition-colors" data-testid="link-demo">Live Demo</button></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-3 text-sm" style={{ color: TEAL }}>Company</h4>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li><button onClick={() => setAboutUsModalOpen(true)} className="hover:text-foreground transition-colors" data-testid="link-about">About Us</button></li>
                <li><Link href="/platform/blog" className="hover:text-foreground transition-colors" data-testid="link-blog">Blog</Link></li>
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

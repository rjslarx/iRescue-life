import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Users, 
  Calendar, 
  DollarSign, 
  FileText, 
  Mail, 
  BarChart3, 
  Shield, 
  Smartphone,
  Globe,
  CheckCircle,
  ArrowRight,
  Building2,
  Heart,
  Play,
  Sparkles,
  Bot,
  QrCode,
  Truck,
  Package,
  RefreshCw,
  Clock,
  Zap,
  Upload,
  X,
  Minus
} from "lucide-react";
import { SiGoogle } from "react-icons/si";

import mobileAppMockup from "@assets/generated_images/mobile_app_dashboard_mockup.png";
import dualPhoneMockup from "@assets/generated_images/dual_phone_app_mockup.png";
import familyAdoptingImage from "@assets/generated_images/family_adopting_puppy.png";
import instantSyncImage from "@assets/generated_images/instant_sync_illustration.png";

export default function PlatformLandingPage() {
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [demoAccessDialogOpen, setDemoAccessDialogOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [aboutUsModalOpen, setAboutUsModalOpen] = useState(false);
  const [blogModalOpen, setBlogModalOpen] = useState(false);
  const [privacyPolicyModalOpen, setPrivacyPolicyModalOpen] = useState(false);
  const [termsOfServiceModalOpen, setTermsOfServiceModalOpen] = useState(false);
  const [cookiePolicyModalOpen, setCookiePolicyModalOpen] = useState(false);
  const [activeRoleTab, setActiveRoleTab] = useState<"fosters" | "volunteers" | "staff" | "board">("fosters");

  useSEO({
    title: "iRescue.life - Complete Animal Rescue Management Platform | SaaS for Rescues",
    description: "All-in-one platform for animal rescues with AI assistant, PWA mobile app, integrated donations, and Google Workspace integration. Manage adoptions, volunteers, finances, medical records, and more. Try our free demo today!",
    siteName: "iRescue.life",
  });

  const features = [
    {
      icon: PawPrint,
      title: "Animal Management",
      description: "Complete intake-to-adoption tracking with kennel locations, photos, status updates, and surrender requests."
    },
    {
      icon: FileText,
      title: "Medical Records & E-Signatures",
      description: "Comprehensive medical tracking with native e-signature contracts and automatic PDF generation."
    },
    {
      icon: Users,
      title: "Application Workflow",
      description: "Kanban-style processing with automated screening, vet checks, and 3-3-3 rule follow-ups."
    },
    {
      icon: DollarSign,
      title: "Stripe Payments & Donations",
      description: "Secure payment processing with donor covers fees option, IRS-compliant receipts, and medical fund campaigns."
    },
    {
      icon: Calendar,
      title: "Event & Volunteer Management",
      description: "Public and internal calendars with volunteer signups, shift coordination, and SMS alerts."
    },
    {
      icon: Heart,
      title: "Foster & Smart Matching",
      description: "Foster portal with AI-powered matching, supply wishlists, and automated update requests."
    },
    {
      icon: BarChart3,
      title: "Analytics & Grant Tracking",
      description: "Dashboard insights, exportable reports, and restricted fund budget tracking."
    },
    {
      icon: Mail,
      title: "Email & Newsletter Campaigns",
      description: "Professional templates, automated workflows, and optional Google Workspace integration."
    },
    {
      icon: Shield,
      title: "Security & Compliance",
      description: "Role-based access, TOTP MFA, encrypted data, automatic archiving, and audit logs."
    }
  ];

  const roleContent = {
    fosters: {
      title: "For Foster Caregivers",
      features: ["View assigned animals & medical info", "Submit foster updates & photos", "Request supplies from wishlist", "Receive push notifications"]
    },
    volunteers: {
      title: "For Volunteers", 
      features: ["Browse volunteer opportunities", "Sign up for shifts & events", "Track volunteer hours", "View task assignments"]
    },
    staff: {
      title: "For Staff Members",
      features: ["Full animal management access", "Process applications & adoptions", "Update medical records", "Manage contacts & communications"]
    },
    board: {
      title: "For Board Members",
      features: ["Financial reports & analytics", "Donation tracking dashboards", "Compliance documentation", "Strategic metrics & trends"]
    }
  };

  const benefits = [
    { stat: "60%", label: "Save Time" },
    { stat: "3x", label: "Increase Adoptions" },
    { stat: "2x", label: "Boost Donations" },
    { stat: "100%", label: "Improve Compliance" }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header/Navigation */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between max-w-7xl mx-auto px-6">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-[#5B7B6B] flex items-center justify-center">
              <PawPrint className="h-5 w-5 text-white" />
            </div>
            <span className="font-display font-bold text-xl">iRescue.life</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-features">
              Features
            </a>
            <a href="#compare" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-compare">
              Compare
            </a>
            <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-pricing">
              Pricing
            </a>
            <a href="#integrations" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-integrations">
              Integrations
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
              Try Live Demo
            </Button>
            <Link href="/platform/signup?tier=free">
              <Button size="sm" className="bg-[#5B7B6B] hover:bg-[#4A6A5A]" data-testid="button-start-trial">
                Start Free Trial
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-16 sm:py-20 lg:py-24 overflow-hidden bg-gradient-to-br from-[#F5F8F5] via-background to-[#F0F5F0]">
        <div className="container max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Column - Text Content */}
            <div className="space-y-6">
              {/* Feature Badges */}
              <div className="flex flex-wrap gap-3">
                <Badge variant="outline" className="bg-[#E8F0E8] border-[#5B7B6B]/30 text-[#5B7B6B] px-3 py-1">
                  <Sparkles className="h-3 w-3 mr-1.5" />
                  New: AI Assistant
                </Badge>
                <Badge variant="outline" className="bg-[#E8F0E8] border-[#5B7B6B]/30 text-[#5B7B6B] px-3 py-1">
                  <Smartphone className="h-3 w-3 mr-1.5" />
                  New: Mobile PWA
                </Badge>
              </div>
              
              {/* Main Headline */}
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]" data-testid="heading-hero">
                Less Paperwork.<br />
                <span className="text-[#5B7B6B]">More Happy Tails.</span>
              </h1>
              
              <p className="text-lg sm:text-xl text-muted-foreground max-w-xl">
                The all-in-one platform managing everything from intake-to-adoption. Stop juggling tools and start saving more lives with powerful, easy-to-use tools.
              </p>
              
              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <Link href="/platform/signup?tier=free">
                  <Button size="lg" className="bg-[#5B7B6B] hover:bg-[#4A6A5A] text-white px-8" data-testid="button-hero-trial">
                    Start Your Free Trial
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="px-8"
                  onClick={() => setDemoAccessDialogOpen(true)}
                  data-testid="button-hero-video"
                >
                  <Play className="mr-2 h-4 w-4" />
                  Watch Video
                </Button>
              </div>
              
              {/* Tagline */}
              <div className="pt-8 border-t border-border/50">
                <p className="text-lg text-muted-foreground">We help you save time so you have more time to help save them.</p>
              </div>
            </div>
            
            {/* Right Column - Hero Image */}
            <div className="relative">
              <div className="relative z-10">
                <img 
                  src={dualPhoneMockup}
                  alt="iRescue.life mobile app showing animal management dashboard"
                  className="w-full h-auto rounded-xl shadow-2xl"
                  data-testid="image-hero-mockup"
                />
              </div>
              {/* Decorative elements */}
              <div className="absolute -top-8 -right-8 h-64 w-64 bg-[#5B7B6B]/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-8 -left-8 h-48 w-48 bg-[#5B7B6B]/10 rounded-full blur-3xl" />
            </div>
          </div>
        </div>
      </section>

      {/* One Platform Problem/Solution Section */}
      <section id="features" className="py-16 sm:py-24 bg-muted/30">
        <div className="container max-w-7xl mx-auto px-6">
          <div className="text-center space-y-4 mb-12">
            <p className="text-sm font-medium text-[#5B7B6B] uppercase tracking-wide">One Platform Problem/Solution</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold" data-testid="heading-features">
              Everything Your Rescue Needs to Thrive
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              iRescue.life handles your entire operation with zero data entry duplication.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <Card key={index} className="border-2 hover-elevate" data-testid={`feature-card-${index}`}>
                <CardHeader className="space-y-3">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-lg bg-[#5B7B6B]/10 flex items-center justify-center flex-shrink-0">
                      <feature.icon className="h-6 w-6 text-[#5B7B6B]" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{feature.title}</CardTitle>
                      <CardDescription className="mt-1">
                        {feature.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Stop Juggling Section */}
      <section className="py-16 sm:py-24">
        <div className="container max-w-7xl mx-auto px-6">
          <div className="text-center space-y-4 mb-12">
            <p className="text-sm font-medium text-[#5B7B6B] uppercase tracking-wide">One Platform Problem/Solution</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold">
              Stop Juggling Multiple Tools.
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              iRescue.life handles your entire operation with zero data entry duplication.
            </p>
          </div>

          {/* Device Sync Illustration */}
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="relative">
              <img 
                src={instantSyncImage}
                alt="Devices syncing data instantly across platforms"
                className="w-full h-auto rounded-xl"
                data-testid="image-sync"
              />
            </div>
            <div className="space-y-8">
              <div className="grid sm:grid-cols-2 gap-6">
                <Card className="border-2">
                  <CardHeader>
                    <Globe className="h-8 w-8 text-[#5B7B6B] mb-2" />
                    <CardTitle className="text-lg">Public-Facing Website</CardTitle>
                    <CardDescription>
                      <ul className="mt-2 space-y-1 text-sm">
                        <li>Adoptable Profiles</li>
                        <li>Online Applications</li>
                        <li>Donation Pages</li>
                      </ul>
                    </CardDescription>
                  </CardHeader>
                </Card>
                <Card className="border-2">
                  <CardHeader>
                    <Shield className="h-8 w-8 text-[#5B7B6B] mb-2" />
                    <CardTitle className="text-lg">Internal Operations Portal</CardTitle>
                    <CardDescription>
                      <ul className="mt-2 space-y-1 text-sm">
                        <li>Medical Records</li>
                        <li>Rescue Workflows</li>
                        <li>Volunteer Schedules</li>
                      </ul>
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
              <div className="flex items-center gap-3 p-4 bg-[#5B7B6B]/5 rounded-lg border border-[#5B7B6B]/20">
                <RefreshCw className="h-6 w-6 text-[#5B7B6B] flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm">INSTANT SYNC</p>
                  <p className="text-sm text-muted-foreground">When you add an animal or update a record, it syncs everywhere instantly.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Highlights - New Features */}
      <section className="py-16 sm:py-24 bg-muted/30">
        <div className="container max-w-7xl mx-auto px-6">
          <div className="text-center space-y-4 mb-12">
            <p className="text-sm font-medium text-[#5B7B6B] uppercase tracking-wide">Feature Highlights</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold">
              Everything Your Rescue Needs to Thrive
            </h2>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {/* AI Assistant */}
            <Card className="hover-elevate">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-[#5B7B6B]/10 flex items-center justify-center mb-3">
                  <Bot className="h-6 w-6 text-[#5B7B6B]" />
                </div>
                <Badge className="w-fit mb-2 bg-[#5B7B6B]">New</Badge>
                <CardTitle>AI Help Assistant</CardTitle>
                <CardDescription>
                  Context-aware AI answers questions about your animals, applications, and workflows instantly.
                </CardDescription>
              </CardHeader>
            </Card>

            {/* PWA */}
            <Card className="hover-elevate">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-[#5B7B6B]/10 flex items-center justify-center mb-3">
                  <Smartphone className="h-6 w-6 text-[#5B7B6B]" />
                </div>
                <Badge className="w-fit mb-2 bg-[#5B7B6B]">New</Badge>
                <CardTitle>Progressive Web App</CardTitle>
                <CardDescription>
                  Install on mobile for offline access, push notifications, and field updates anywhere.
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Medical Fund QR Codes */}
            <Card className="hover-elevate">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-[#5B7B6B]/10 flex items-center justify-center mb-3">
                  <QrCode className="h-6 w-6 text-[#5B7B6B]" />
                </div>
                <Badge className="w-fit mb-2 bg-[#5B7B6B]">New</Badge>
                <CardTitle>Medical Fund QR Codes</CardTitle>
                <CardDescription>
                  Generate QR codes for kennel cards that link to fundraising campaigns.
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Collaboration Hub */}
            <Card className="hover-elevate">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-[#5B7B6B]/10 flex items-center justify-center mb-3">
                  <Truck className="h-6 w-6 text-[#5B7B6B]" />
                </div>
                <Badge className="w-fit mb-2 bg-[#5B7B6B]">New</Badge>
                <CardTitle>Collaboration Hub</CardTitle>
                <CardDescription>
                  Transport coordination with SMS alerts, Google Chat integration, and regional SOS broadcasts.
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Stripe Payments */}
            <Card className="hover-elevate">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-[#5B7B6B]/10 flex items-center justify-center mb-3">
                  <Heart className="h-6 w-6 text-[#5B7B6B]" />
                </div>
                <Badge className="w-fit mb-2 bg-[#5B7B6B]">New</Badge>
                <CardTitle>Stripe Payments</CardTitle>
                <CardDescription>
                  Secure donation processing with donor tickers, Wall of Love displays, and medical fund campaigns.
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Supply Wishlist */}
            <Card className="hover-elevate">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-[#5B7B6B]/10 flex items-center justify-center mb-3">
                  <Package className="h-6 w-6 text-[#5B7B6B]" />
                </div>
                <CardTitle>Supply Wishlist</CardTitle>
                <CardDescription>
                  Multi-retailer wishlists with Amazon, Chewy integration and donation tracking.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Modern Tools Section */}
      <section className="py-16 sm:py-24">
        <div className="container max-w-7xl mx-auto px-6">
          <div className="text-center space-y-4 mb-12">
            <p className="text-sm font-medium text-[#5B7B6B] uppercase tracking-wide">Tech Spotlight</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold">
              Modern Tools for Modern Rescues
            </h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* AI Assistant Card */}
            <Card className="overflow-hidden">
              <div className="grid md:grid-cols-2 h-full">
                <div className="p-8 flex flex-col justify-center">
                  <Badge className="w-fit mb-3 bg-[#5B7B6B]">
                    <Sparkles className="h-3 w-3 mr-1" />
                    AI Powered
                  </Badge>
                  <h3 className="text-2xl font-bold mb-3">AI Help Assistant</h3>
                  <p className="text-muted-foreground mb-4">
                    Get instant answers about your rescue operations. Our AI understands your animals, applications, and workflows.
                  </p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-[#5B7B6B]" />
                      Context-aware responses
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-[#5B7B6B]" />
                      Multi-language support
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-[#5B7B6B]" />
                      Save staff time on FAQs
                    </li>
                  </ul>
                </div>
                <div className="bg-gradient-to-br from-[#5B7B6B]/10 to-[#5B7B6B]/5 p-8 flex items-center justify-center">
                  <div className="relative">
                    <Bot className="h-32 w-32 text-[#5B7B6B]" />
                    <div className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-[#5B7B6B] flex items-center justify-center">
                      <Sparkles className="h-4 w-4 text-white" />
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* PWA Card */}
            <Card className="overflow-hidden">
              <div className="grid md:grid-cols-2 h-full">
                <div className="p-8 flex flex-col justify-center">
                  <Badge className="w-fit mb-3 bg-[#5B7B6B]">
                    <Smartphone className="h-3 w-3 mr-1" />
                    Mobile Ready
                  </Badge>
                  <h3 className="text-2xl font-bold mb-3">Progressive Web App</h3>
                  <p className="text-muted-foreground mb-4">
                    Install on any device for a native app experience. Works offline and sends push notifications.
                  </p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-[#5B7B6B]" />
                      Offline access
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-[#5B7B6B]" />
                      Push notifications
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-[#5B7B6B]" />
                      Field updates anywhere
                    </li>
                  </ul>
                </div>
                <div className="bg-gradient-to-br from-[#5B7B6B]/10 to-[#5B7B6B]/5 p-8 flex items-center justify-center">
                  <img 
                    src={mobileAppMockup}
                    alt="Progressive Web App on mobile device"
                    className="h-48 w-auto object-contain rounded-lg shadow-lg"
                  />
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Google Workspace Integration */}
      <section id="integrations" className="py-16 sm:py-24 bg-muted/30">
        <div className="container max-w-7xl mx-auto px-6">
          <Card className="overflow-hidden border-2">
            <div className="grid lg:grid-cols-2 gap-0">
              {/* Left Content */}
              <div className="p-8 sm:p-12">
                <Badge variant="outline" className="mb-4 bg-[#E8F0E8] border-[#5B7B6B]/30">
                  <Heart className="h-3 w-3 mr-1 text-[#5B7B6B]" />
                  Google Integration
                </Badge>
                <h2 className="font-display text-2xl sm:text-3xl font-bold mb-4">
                  Supercharge Your Rescue with Google Workspace
                </h2>
                <p className="text-muted-foreground mb-6">
                  Free for 501(c)(3) nonprofits with Google for Nonprofits
                </p>
                <ul className="space-y-4 mb-8">
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-[#5B7B6B] mt-0.5 flex-shrink-0" />
                    <span>Unlimited free email sending via Gmail API</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-[#5B7B6B] mt-0.5 flex-shrink-0" />
                    <span>Calendar sync with Google Meet integration</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-[#5B7B6B] mt-0.5 flex-shrink-0" />
                    <span>Google Drive document storage</span>
                  </li>
                </ul>
                <p className="text-sm text-muted-foreground italic">
                  Optional: Works perfectly without Google—automatic fallback to our built-in email service.
                </p>
              </div>
              
              {/* Right Visual */}
              <div className="bg-gradient-to-br from-[#5B7B6B]/5 to-[#5B7B6B]/10 p-8 sm:p-12 flex items-center justify-center">
                <div className="text-center space-y-6">
                  <div className="inline-flex items-center justify-center h-24 w-24 rounded-2xl bg-white shadow-lg">
                    <SiGoogle className="h-12 w-12 text-[#4285F4]" />
                  </div>
                  <div>
                    <p className="font-display text-2xl font-bold">Google</p>
                    <p className="text-lg text-muted-foreground">Workspace</p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Personalized Experience Section */}
      <section className="py-16 sm:py-24">
        <div className="container max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left - Mobile Mockup */}
            <div className="relative order-2 lg:order-1">
              <img 
                src={mobileAppMockup}
                alt="Personalized experience on mobile"
                className="w-full max-w-md mx-auto rounded-xl shadow-2xl"
              />
            </div>
            
            {/* Right - Content */}
            <div className="space-y-6 order-1 lg:order-2">
              <p className="text-sm font-medium text-[#5B7B6B] uppercase tracking-wide">Feature</p>
              <h2 className="font-display text-3xl sm:text-4xl font-bold">
                A Personalized Experience for Every Team Member
              </h2>
              <p className="text-muted-foreground">
                Each role sees only what they need—no clutter, no confusion.
              </p>
              
              {/* Role Tabs */}
              <div className="flex flex-wrap gap-2">
                {(["fosters", "volunteers", "staff", "board"] as const).map((role) => (
                  <Button
                    key={role}
                    variant={activeRoleTab === role ? "default" : "outline"}
                    size="sm"
                    className={activeRoleTab === role ? "bg-[#5B7B6B] hover:bg-[#4A6A5A]" : ""}
                    onClick={() => setActiveRoleTab(role)}
                    data-testid={`button-role-${role}`}
                  >
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </Button>
                ))}
              </div>

              <ul className="space-y-3" data-testid={`list-role-features-${activeRoleTab}`}>
                {roleContent[activeRoleTab].features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-3" data-testid={`item-role-feature-${activeRoleTab}-${index}`}>
                    <CheckCircle className="h-5 w-5 text-[#5B7B6B]" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <p className="text-sm text-muted-foreground italic">
                Administrators can customize exactly which features, pages, and data each role can access.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Impact Metrics */}
      <section className="py-16 sm:py-24 bg-muted/30">
        <div className="container max-w-7xl mx-auto px-6">
          <div className="text-center space-y-4 mb-12">
            <p className="text-sm font-medium text-[#5B7B6B] uppercase tracking-wide">Impact Metrics</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold">
              Real Results for Real Rescues
            </h2>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {benefits.map((benefit, index) => (
              <div key={index} className="text-center" data-testid={`metric-${index}`}>
                <div className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#5B7B6B] mb-2">
                  {benefit.stat}
                </div>
                <p className="text-muted-foreground font-medium">{benefit.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Success Story */}
      <section className="py-16 sm:py-24">
        <div className="container max-w-7xl mx-auto px-6">
          <div className="relative overflow-hidden rounded-2xl">
            <img 
              src={familyAdoptingImage}
              alt="Happy family adopting a puppy"
              className="w-full h-[400px] object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent flex items-center">
              <div className="p-8 sm:p-12 max-w-xl text-white">
                <h2 className="font-display text-3xl sm:text-4xl font-bold mb-4">
                  Every Adoption Tells a Story
                </h2>
                <p className="text-lg text-white/90 mb-6">
                  From intake to forever home, iRescue.life streamlines the entire journey, helping rescues save more lives.
                </p>
                <Link href="/platform/signup?tier=free">
                  <Button size="lg" className="bg-white text-[#5B7B6B] hover:bg-white/90" data-testid="button-start-your-story">
                    Start Your Story
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Chart Section */}
      <section id="compare" className="py-16 sm:py-24 bg-muted/30">
        <div className="container max-w-7xl mx-auto px-6">
          <div className="text-center space-y-4 mb-12">
            <p className="text-sm font-medium text-[#5B7B6B] uppercase tracking-wide">Why Switch?</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold" data-testid="heading-comparison">
              iRescue.life vs RescueGroups.org
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              See how iRescue.life compares to RescueGroups.org and discover why rescues are making the switch.
            </p>
          </div>

          <Card className="overflow-hidden max-w-4xl mx-auto">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left py-4 px-6 font-semibold">Feature</th>
                    <th className="text-center py-4 px-4 font-semibold">
                      <div className="flex flex-col items-center gap-1">
                        <div className="h-8 w-8 rounded-md bg-[#5B7B6B] flex items-center justify-center">
                          <PawPrint className="h-4 w-4 text-white" />
                        </div>
                        <span>iRescue.life</span>
                      </div>
                    </th>
                    <th className="text-center py-4 px-4 font-semibold text-muted-foreground">RescueGroups.org</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="py-3 px-6">AI Help Assistant</td>
                    <td className="py-3 px-4 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    <td className="py-3 px-4 text-center"><X className="h-5 w-5 text-muted-foreground/50 mx-auto" /></td>
                  </tr>
                  <tr className="bg-muted/20">
                    <td className="py-3 px-6">Progressive Web App (PWA)</td>
                    <td className="py-3 px-4 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    <td className="py-3 px-4 text-center"><X className="h-5 w-5 text-muted-foreground/50 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-3 px-6">Google Workspace Integration</td>
                    <td className="py-3 px-4 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    <td className="py-3 px-4 text-center"><X className="h-5 w-5 text-muted-foreground/50 mx-auto" /></td>
                  </tr>
                  <tr className="bg-muted/20">
                    <td className="py-3 px-6">Medical Fund QR Codes</td>
                    <td className="py-3 px-4 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    <td className="py-3 px-4 text-center"><X className="h-5 w-5 text-muted-foreground/50 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-3 px-6">Foster Management Portal</td>
                    <td className="py-3 px-4 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    <td className="py-3 px-4 text-center"><Minus className="h-5 w-5 text-muted-foreground/50 mx-auto" /></td>
                  </tr>
                  <tr className="bg-muted/20">
                    <td className="py-3 px-6">Transport Coordination Hub</td>
                    <td className="py-3 px-4 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    <td className="py-3 px-4 text-center"><X className="h-5 w-5 text-muted-foreground/50 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-3 px-6">Smart Foster Matching</td>
                    <td className="py-3 px-4 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    <td className="py-3 px-4 text-center"><X className="h-5 w-5 text-muted-foreground/50 mx-auto" /></td>
                  </tr>
                  <tr className="bg-muted/20">
                    <td className="py-3 px-6">Stripe Payment Processing</td>
                    <td className="py-3 px-4 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    <td className="py-3 px-4 text-center"><X className="h-5 w-5 text-muted-foreground/50 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-3 px-6">IRS-Compliant Donation Receipts</td>
                    <td className="py-3 px-4 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    <td className="py-3 px-4 text-center"><Minus className="h-5 w-5 text-muted-foreground/50 mx-auto" /></td>
                  </tr>
                  <tr className="bg-muted/20">
                    <td className="py-3 px-6">Canva Flyer Design Integration</td>
                    <td className="py-3 px-4 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    <td className="py-3 px-4 text-center"><X className="h-5 w-5 text-muted-foreground/50 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-3 px-6">Animal Management</td>
                    <td className="py-3 px-4 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    <td className="py-3 px-4 text-center"><CheckCircle className="h-5 w-5 text-muted-foreground/50 mx-auto" /></td>
                  </tr>
                  <tr className="bg-muted/20">
                    <td className="py-3 px-6">Adoption Applications</td>
                    <td className="py-3 px-4 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    <td className="py-3 px-4 text-center"><CheckCircle className="h-5 w-5 text-muted-foreground/50 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-3 px-6">PetFinder/Adopt-a-Pet Sync</td>
                    <td className="py-3 px-4 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    <td className="py-3 px-4 text-center"><CheckCircle className="h-5 w-5 text-muted-foreground/50 mx-auto" /></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="text-center text-xs text-muted-foreground p-4 bg-muted/30">
              <CheckCircle className="h-3 w-3 text-[#5B7B6B] inline mr-1" /> Full Support
              <Minus className="h-3 w-3 text-muted-foreground/50 inline ml-4 mr-1" /> Limited
              <X className="h-3 w-3 text-muted-foreground/50 inline ml-4 mr-1" /> Not Available
            </div>
          </Card>

          {/* Easy Migration Card */}
          <Card className="mt-8 max-w-4xl mx-auto border-2 border-[#5B7B6B]/30 bg-[#F5F8F5]">
            <CardContent className="p-8">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="h-16 w-16 rounded-xl bg-[#5B7B6B] flex items-center justify-center flex-shrink-0">
                  <Upload className="h-8 w-8 text-white" />
                </div>
                <div className="text-center md:text-left flex-1">
                  <h3 className="text-xl font-bold mb-2">Easy Migration from RescueGroups.org</h3>
                  <p className="text-muted-foreground">
                    Already using RescueGroups.org? No problem! Simply export your animals as a CSV file and import them directly into iRescue.life. 
                    All your animal data and photos transfer automatically in minutes.
                  </p>
                </div>
                <Link href="/platform/signup?tier=free">
                  <Button className="bg-[#5B7B6B] hover:bg-[#4A6A5A] whitespace-nowrap" data-testid="button-migrate-now">
                    Migrate Now
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-16 sm:py-24">
        <div className="container max-w-7xl mx-auto px-6">
          <div className="text-center space-y-4 mb-12">
            <p className="text-sm font-medium text-[#5B7B6B] uppercase tracking-wide">Pricing</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold" data-testid="heading-pricing">
              Simple, Transparent Pricing
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Two simple tiers. No hidden fees. Cancel anytime.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 max-w-4xl mx-auto mb-16">
            {/* Free Tier */}
            <Card className="border-2">
              <CardHeader className="text-center pb-4">
                <CardTitle className="text-xl">Free</CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-bold">$0</span>
                  <span className="text-muted-foreground">/mo</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">5% platform fee on donations & adoptions</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-[#5B7B6B] mt-0.5 flex-shrink-0" />
                    <span>Unlimited animals</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-[#5B7B6B] mt-0.5 flex-shrink-0" />
                    <span>500 emails/month</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-[#5B7B6B] mt-0.5 flex-shrink-0" />
                    <span>Online applications</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-[#5B7B6B] mt-0.5 flex-shrink-0" />
                    <span>Basic reporting</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-[#5B7B6B] mt-0.5 flex-shrink-0" />
                    <span>Stripe payments</span>
                  </li>
                </ul>
                <Link href="/platform/signup?tier=free">
                  <Button className="w-full" variant="outline" data-testid="button-free">
                    Get Started Free
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Professional */}
            <Card className="border-2 border-[#5B7B6B] relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-[#5B7B6B]">BEST VALUE</Badge>
              </div>
              <CardHeader className="text-center pb-4 pt-6">
                <CardTitle className="text-xl">Professional</CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-bold">$39</span>
                  <span className="text-muted-foreground">/mo</span>
                </div>
                <p className="text-sm text-[#5B7B6B] font-medium mt-2">0% platform fees</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-[#5B7B6B] mt-0.5 flex-shrink-0" />
                    <span>Unlimited animals</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-[#5B7B6B] mt-0.5 flex-shrink-0" />
                    <span>10,000 emails/month</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-[#5B7B6B] mt-0.5 flex-shrink-0" />
                    <span>Advanced reporting & analytics</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-[#5B7B6B] mt-0.5 flex-shrink-0" />
                    <span>Optional custom domain</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-[#5B7B6B] mt-0.5 flex-shrink-0" />
                    <span>Optional Google Workspace</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-[#5B7B6B] mt-0.5 flex-shrink-0" />
                    <span>Priority support</span>
                  </li>
                </ul>
                <Link href="/platform/signup?tier=professional">
                  <Button className="w-full bg-[#5B7B6B] hover:bg-[#4A6A5A]" data-testid="button-professional">
                    Start Free Trial
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Feature Comparison */}
          <div className="max-w-5xl mx-auto">
            <h3 className="text-2xl font-bold text-center mb-8" data-testid="heading-tier-comparison">
              Free vs Professional: Full Feature Comparison
            </h3>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left py-4 px-6 font-semibold">Feature</th>
                      <th className="text-center py-4 px-6 font-semibold min-w-[120px]">
                        <div className="flex flex-col items-center gap-1">
                          <span>Free</span>
                          <span className="text-xs font-normal text-muted-foreground">$0/mo</span>
                        </div>
                      </th>
                      <th className="text-center py-4 px-6 font-semibold min-w-[120px]">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[#5B7B6B]">Professional</span>
                          <span className="text-xs font-normal text-muted-foreground">$39/mo</span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {/* Pricing & Fees */}
                    <tr className="bg-[#5B7B6B]/5">
                      <td colSpan={3} className="py-2 px-6 font-semibold text-[#5B7B6B]">Pricing & Fees</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-6">Platform Fee on Donations & Adoptions</td>
                      <td className="py-3 px-6 text-center font-medium">5%</td>
                      <td className="py-3 px-6 text-center font-medium text-[#5B7B6B]">0%</td>
                    </tr>
                    <tr className="bg-muted/20">
                      <td className="py-3 px-6">Monthly Subscription</td>
                      <td className="py-3 px-6 text-center font-medium">$0</td>
                      <td className="py-3 px-6 text-center font-medium">$39</td>
                    </tr>

                    {/* Core Features */}
                    <tr className="bg-[#5B7B6B]/5">
                      <td colSpan={3} className="py-2 px-6 font-semibold text-[#5B7B6B]">Core Features</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-6">Animals</td>
                      <td className="py-3 px-6 text-center">Unlimited</td>
                      <td className="py-3 px-6 text-center">Unlimited</td>
                    </tr>
                    <tr className="bg-muted/20">
                      <td className="py-3 px-6">Team Members</td>
                      <td className="py-3 px-6 text-center">Unlimited</td>
                      <td className="py-3 px-6 text-center">Unlimited</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-6">Applications & Adoptions</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>
                    <tr className="bg-muted/20">
                      <td className="py-3 px-6">Medical Records</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>
                    <tr>
                      <td className="py-3 px-6">Foster Management</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>
                    <tr className="bg-muted/20">
                      <td className="py-3 px-6">Volunteer Coordination</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>
                    <tr>
                      <td className="py-3 px-6">Event Calendar</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>
                    <tr className="bg-muted/20">
                      <td className="py-3 px-6">Supply Wishlist</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>

                    {/* Payments & Donations */}
                    <tr className="bg-[#5B7B6B]/5">
                      <td colSpan={3} className="py-2 px-6 font-semibold text-[#5B7B6B]">Payments & Donations</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-6">Stripe Payment Processing</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>
                    <tr className="bg-muted/20">
                      <td className="py-3 px-6">Adoption Checkout with E-Signatures</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>
                    <tr>
                      <td className="py-3 px-6">Medical Fund Campaigns</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>
                    <tr className="bg-muted/20">
                      <td className="py-3 px-6">IRS-Compliant Donation Receipts</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>
                    <tr>
                      <td className="py-3 px-6">Donor Covers Fees Option</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>

                    {/* Communication */}
                    <tr className="bg-[#5B7B6B]/5">
                      <td colSpan={3} className="py-2 px-6 font-semibold text-[#5B7B6B]">Communication</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-6">Monthly Emails</td>
                      <td className="py-3 px-6 text-center font-medium">500</td>
                      <td className="py-3 px-6 text-center font-medium text-[#5B7B6B]">10,000</td>
                    </tr>
                    <tr className="bg-muted/20">
                      <td className="py-3 px-6">Email Templates</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>
                    <tr>
                      <td className="py-3 px-6">Newsletter Campaigns</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>
                    <tr className="bg-muted/20">
                      <td className="py-3 px-6">Automated Adoption Follow-ups (3-3-3 Rule)</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>

                    {/* Advanced Features */}
                    <tr className="bg-[#5B7B6B]/5">
                      <td colSpan={3} className="py-2 px-6 font-semibold text-[#5B7B6B]">Advanced Features</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-6">AI Help Assistant</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>
                    <tr className="bg-muted/20">
                      <td className="py-3 px-6">Progressive Web App (PWA)</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>
                    <tr>
                      <td className="py-3 px-6">Push Notifications</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>
                    <tr className="bg-muted/20">
                      <td className="py-3 px-6">Smart Foster Matching</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>
                    <tr>
                      <td className="py-3 px-6">Transport Coordination Hub</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>
                    <tr className="bg-muted/20">
                      <td className="py-3 px-6">Medical Fund QR Codes</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>
                    <tr>
                      <td className="py-3 px-6">Grant Budget Tracking</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>

                    {/* Reporting */}
                    <tr className="bg-[#5B7B6B]/5">
                      <td colSpan={3} className="py-2 px-6 font-semibold text-[#5B7B6B]">Reporting & Analytics</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-6">Dashboard Analytics</td>
                      <td className="py-3 px-6 text-center">Basic</td>
                      <td className="py-3 px-6 text-center font-medium text-[#5B7B6B]">Advanced</td>
                    </tr>
                    <tr className="bg-muted/20">
                      <td className="py-3 px-6">Exportable Reports</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>

                    {/* Integrations */}
                    <tr className="bg-[#5B7B6B]/5">
                      <td colSpan={3} className="py-2 px-6 font-semibold text-[#5B7B6B]">Integrations</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-6">PetFinder / Adopt-a-Pet Sync</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>
                    <tr className="bg-muted/20">
                      <td className="py-3 px-6">Google Workspace (Gmail, Calendar, Drive)</td>
                      <td className="py-3 px-6 text-center"><X className="h-5 w-5 text-muted-foreground/50 mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>
                    <tr>
                      <td className="py-3 px-6">Custom Domain</td>
                      <td className="py-3 px-6 text-center"><X className="h-5 w-5 text-muted-foreground/50 mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>

                    {/* Support */}
                    <tr className="bg-[#5B7B6B]/5">
                      <td colSpan={3} className="py-2 px-6 font-semibold text-[#5B7B6B]">Support</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-6">Documentation & Guides</td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                      <td className="py-3 px-6 text-center"><CheckCircle className="h-5 w-5 text-[#5B7B6B] mx-auto" /></td>
                    </tr>
                    <tr className="bg-muted/20">
                      <td className="py-3 px-6">Email Support</td>
                      <td className="py-3 px-6 text-center">Standard</td>
                      <td className="py-3 px-6 text-center font-medium text-[#5B7B6B]">Priority</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="text-center text-xs text-muted-foreground p-4 bg-muted/30">
                <CheckCircle className="h-3 w-3 text-[#5B7B6B] inline mr-1" /> Included
                <X className="h-3 w-3 text-muted-foreground/50 inline ml-4 mr-1" /> Not Included
              </div>
            </Card>

            {/* ROI Calculator Callout */}
            <Card className="mt-8 border-2 border-[#5B7B6B]/30 bg-[#F5F8F5]">
              <CardContent className="p-8">
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="h-16 w-16 rounded-xl bg-[#5B7B6B] flex items-center justify-center flex-shrink-0">
                    <DollarSign className="h-8 w-8 text-white" />
                  </div>
                  <div className="text-center md:text-left flex-1">
                    <h3 className="text-xl font-bold mb-2">When Does Professional Pay for Itself?</h3>
                    <p className="text-muted-foreground">
                      If your rescue receives more than <strong>$780/month</strong> in donations, the Professional tier saves you money. 
                      At $780/month, the 5% free tier fee ($39) equals the Professional subscription cost with 0% fees.
                    </p>
                  </div>
                  <Link href="/platform/signup?tier=professional">
                    <Button className="bg-[#5B7B6B] hover:bg-[#4A6A5A] whitespace-nowrap" data-testid="button-upgrade-professional">
                      Upgrade to Professional
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 sm:py-24 bg-[#5B7B6B]">
        <div className="container max-w-4xl mx-auto text-center space-y-8 px-6">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-white" data-testid="heading-cta">
            Ready to transform your rescue?
          </h2>
          <p className="text-xl text-white/80">
            Join hundreds of organizations saving more lives today.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/platform/signup?tier=free">
              <Button size="lg" className="bg-white text-[#5B7B6B] hover:bg-white/90 text-lg px-8" data-testid="button-cta-trial">
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t bg-muted/30" data-testid="section-footer">
        <div className="container max-w-7xl mx-auto px-6">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
            {/* Brand Column */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-10 w-10 rounded-lg bg-[#5B7B6B] flex items-center justify-center">
                  <PawPrint className="h-6 w-6 text-white" />
                </div>
                <span className="font-display font-bold text-xl">iRescue.life</span>
              </div>
              <p className="text-muted-foreground mb-4 max-w-sm">
                The all-in-one platform helping animal rescue organizations streamline operations and save more lives.
              </p>
              <p className="text-sm text-[#5B7B6B] font-medium">
                Less Paperwork. More Happy Tails.
              </p>
            </div>
            
            {/* Product Column */}
            <div>
              <h4 className="font-semibold mb-4 text-[#5B7B6B]">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-[#5B7B6B] transition-colors" data-testid="link-features">Features</a></li>
                <li><a href="#pricing" className="hover:text-[#5B7B6B] transition-colors" data-testid="link-pricing">Pricing</a></li>
                <li><a href="#integrations" className="hover:text-[#5B7B6B] transition-colors" data-testid="link-integrations">Integrations</a></li>
                <li><Link href="/demo" className="hover:text-[#5B7B6B] transition-colors" data-testid="link-demo">Live Demo</Link></li>
              </ul>
            </div>
            
            {/* Company Column */}
            <div>
              <h4 className="font-semibold mb-4 text-[#5B7B6B]">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><button onClick={() => setAboutUsModalOpen(true)} className="hover:text-[#5B7B6B] transition-colors" data-testid="link-about">About Us</button></li>
                <li><button onClick={() => setBlogModalOpen(true)} className="hover:text-[#5B7B6B] transition-colors" data-testid="link-blog">Blog</button></li>
                <li><button onClick={() => setContactModalOpen(true)} className="hover:text-[#5B7B6B] transition-colors" data-testid="link-contact">Contact</button></li>
              </ul>
            </div>
            
            {/* Legal Column */}
            <div>
              <h4 className="font-semibold mb-4 text-[#5B7B6B]">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/platform/privacy" className="hover:text-[#5B7B6B] transition-colors" data-testid="link-privacy">Privacy Policy</Link></li>
                <li><Link href="/platform/terms" className="hover:text-[#5B7B6B] transition-colors" data-testid="link-terms">Terms of Service</Link></li>
                <li><button onClick={() => setCookiePolicyModalOpen(true)} className="hover:text-[#5B7B6B] transition-colors" data-testid="link-cookies">Cookie Policy</button></li>
              </ul>
            </div>
          </div>
          
          {/* Bottom Bar */}
          <div className="mt-12 pt-8 border-t border-[#5B7B6B]/20">
            <div className="flex justify-end">
              <p className="text-sm text-muted-foreground">
                © 2025 Turbeau, LLC. All rights reserved.
              </p>
            </div>
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

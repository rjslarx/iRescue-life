import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useSEO } from "@/hooks/useSEO";
import {
  PawPrint,
  CheckCircle,
  ArrowRight,
  Crown,
  Zap,
  Heart,
} from "lucide-react";

const TEAL = "#2B8CA3";
const TEAL_DARK = "#1F7189";
const TEAL_LIGHT = "#EDF6F8";
const TEAL_BADGE = "#E0F2F6";

const features = [
  "Unlimited Adoption Applications",
  "Peer-to-Peer Campaigns",
  "Grant Compliance Tracker",
  "Donor Covers the Fee Option",
  "Unlimited Animals & Team Members",
  "Public Website & Adoptable Profiles",
  "Stripe Donation & Adoption Payments",
  "Kennel Management & Layout Editor",
  "Foster & Volunteer Pipelines",
  "Medical Pipeline Dashboard",
  "E-Signature Contracts & PDFs",
  "Custom Forms Builder",
  "Newsletter Designer & Campaigns",
  "Contact & Communications Hub",
  "Event Calendar & Volunteer Signups",
  "Supply Wishlist (Amazon, Chewy)",
  "Happy Tails Success Stories",
  "Analytics & Reporting",
  "PWA Mobile App",
  "AI Help Assistant",
];

const faqItems = [
  {
    question: "Do I have to pay credit card fees?",
    answer:
      "Yes, standard Stripe processing fees (~2.9% + 30\u00A2) apply to all transactions on both plans. However, our \u201CCover the Fees\u201D feature allows donors to pay this for you!",
  },
  {
    question: "When should I upgrade to Scale?",
    answer:
      "Once you are raising more than $800 a month through our platform, the $39 flat rate becomes cheaper than paying the 5% platform fee. For example, at $800/mo in donations, 5% = $40 \u2014 so Scale saves you money from that point onward.",
  },
  {
    question: "Can I switch plans at any time?",
    answer:
      "Absolutely. You can upgrade to Scale or downgrade back to Starter whenever you like. Changes take effect on your next billing cycle with no penalties or lock-in contracts.",
  },
  {
    question: "Is there a free trial for Scale?",
    answer:
      "Every new organization starts on Starter for free. When you\u2019re ready, upgrading to Scale is instant \u2014 no trial needed because you already have full access to every feature.",
  },
];

export default function PlatformPricingPage() {
  useSEO({
    title: "Pricing - iRescue.life",
    description:
      "Simple, transparent pricing for animal rescues. Full access on both plans \u2014 choose the billing model that fits your cash flow. Start free or go flat-rate at $39/mo.",
    siteName: "iRescue.life",
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between max-w-6xl mx-auto px-4 sm:px-6">
          <Link href="/platform">
            <div className="flex items-center gap-2 cursor-pointer" data-testid="link-logo">
              <div
                className="h-8 w-8 rounded-md flex items-center justify-center"
                style={{ backgroundColor: TEAL }}
              >
                <PawPrint className="h-5 w-5 text-white" />
              </div>
              <span className="font-display font-bold text-lg">iRescue.life</span>
            </div>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link href="/platform/login">
              <Button variant="ghost" size="sm" data-testid="button-team-login">
                Team Login
              </Button>
            </Link>
            <Link href="/platform/signup?tier=lite">
              <Button
                size="sm"
                style={{ backgroundColor: TEAL }}
                className="text-white"
                data-testid="button-header-start-free"
              >
                Start Free
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <section className="py-12 sm:py-16 lg:py-20">
        <div className="container max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center space-y-3 mb-12">
            <h1
              className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight"
              data-testid="heading-pricing"
            >
              Simple, transparent pricing built for rescues of all sizes.
            </h1>
            <p
              className="text-muted-foreground max-w-2xl mx-auto text-base sm:text-lg"
              data-testid="text-pricing-subtitle"
            >
              Get full access to all features on both plans. Just pick the billing model
              that fits your cash flow.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
            <Card className="border flex flex-col" data-testid="card-starter-tier">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: TEAL_LIGHT }}
                  >
                    <Heart className="h-5 w-5" style={{ color: TEAL }} />
                  </div>
                  <CardTitle className="text-xl" data-testid="text-starter-title">
                    Starter
                  </CardTitle>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold" data-testid="text-starter-price">
                    $0
                  </span>
                  <span className="text-muted-foreground">/ month</span>
                </div>
                <p
                  className="text-sm mt-1 font-medium"
                  style={{ color: TEAL }}
                  data-testid="text-starter-subtitle"
                >
                  + 5% platform fee on donations
                </p>
                <div className="pt-3">
                  <Badge
                    variant="outline"
                    className="text-xs"
                    style={{
                      backgroundColor: TEAL_BADGE,
                      borderColor: `${TEAL}40`,
                      color: TEAL_DARK,
                    }}
                    data-testid="badge-starter-highlight"
                  >
                    Best for rescues raising less than $800/mo
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <ul className="space-y-2 flex-1">
                  {features.map((feature, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm"
                      data-testid={`feature-starter-${i}`}
                    >
                      <CheckCircle
                        className="h-4 w-4 mt-0.5 flex-shrink-0"
                        style={{ color: "#16a34a" }}
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/platform/signup?tier=lite" className="mt-6">
                  <Button
                    className="w-full"
                    variant="outline"
                    data-testid="button-start-free"
                  >
                    Start for Free
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card
              className="border-2 flex flex-col relative"
              style={{ borderColor: TEAL }}
              data-testid="card-scale-tier"
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge
                  className="text-white"
                  style={{ backgroundColor: TEAL }}
                  data-testid="badge-most-popular"
                >
                  <Crown className="h-3 w-3 mr-1" />
                  MOST POPULAR
                </Badge>
              </div>
              <CardHeader className="pb-3 pt-8">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: TEAL }}
                  >
                    <Zap className="h-5 w-5 text-white" />
                  </div>
                  <CardTitle className="text-xl" data-testid="text-scale-title">
                    Scale
                  </CardTitle>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold" data-testid="text-scale-price">
                    $39
                  </span>
                  <span className="text-muted-foreground">/ month</span>
                </div>
                <p
                  className="text-sm mt-1 font-semibold"
                  style={{ color: TEAL }}
                  data-testid="text-scale-subtitle"
                >
                  0% platform fee on donations
                </p>
                <div className="pt-3">
                  <Badge
                    variant="outline"
                    className="text-xs"
                    style={{
                      backgroundColor: TEAL_BADGE,
                      borderColor: `${TEAL}40`,
                      color: TEAL_DARK,
                    }}
                    data-testid="badge-scale-highlight"
                  >
                    Best for rescues raising over $800/mo
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <ul className="space-y-2 flex-1">
                  {features.map((feature, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm"
                      data-testid={`feature-scale-${i}`}
                    >
                      <CheckCircle
                        className="h-4 w-4 mt-0.5 flex-shrink-0"
                        style={{ color: "#16a34a" }}
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/platform/signup?tier=professional" className="mt-6">
                  <Button
                    className="w-full text-white"
                    style={{ backgroundColor: TEAL }}
                    data-testid="button-upgrade-scale"
                  >
                    Upgrade to Scale
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 border-t">
        <div className="container max-w-3xl mx-auto px-4 sm:px-6">
          <h2
            className="font-display text-xl sm:text-2xl font-bold text-center mb-8"
            data-testid="heading-faq"
          >
            Frequently Asked Questions
          </h2>
          <Accordion type="single" collapsible className="w-full">
            {faqItems.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger
                  className="text-left text-sm sm:text-base"
                  data-testid={`faq-trigger-${i}`}
                >
                  {item.question}
                </AccordionTrigger>
                <AccordionContent data-testid={`faq-content-${i}`}>
                  <p className="text-muted-foreground">{item.answer}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className="py-12 sm:py-16" style={{ backgroundColor: TEAL }}>
        <div className="container max-w-3xl mx-auto text-center space-y-6 px-4 sm:px-6">
          <h2
            className="font-display text-2xl sm:text-3xl font-bold text-white"
            data-testid="heading-cta"
          >
            Ready to save more lives?
          </h2>
          <p className="text-lg text-white/80">
            Join rescue organizations using iRescue.life to streamline their operations.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/platform/signup?tier=lite">
              <Button
                size="lg"
                className="text-lg px-8"
                style={{ backgroundColor: "white", color: TEAL }}
                data-testid="button-cta-starter"
              >
                Start for Free
              </Button>
            </Link>
            <Link href="/platform/signup?tier=professional">
              <Button
                size="lg"
                variant="outline"
                className="text-lg px-8 border-white/50 text-white backdrop-blur-sm bg-white/10"
                data-testid="button-cta-scale"
              >
                Upgrade to Scale
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
          <p className="text-sm text-white/60">
            No credit card required for either plan.
          </p>
        </div>
      </section>

      <footer className="py-8 border-t bg-muted/30" data-testid="section-footer">
        <div className="container max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <Link href="/platform">
              <div className="flex items-center gap-2 cursor-pointer">
                <div
                  className="h-7 w-7 rounded-md flex items-center justify-center"
                  style={{ backgroundColor: TEAL }}
                >
                  <PawPrint className="h-4 w-4 text-white" />
                </div>
                <span className="font-display font-bold">iRescue.life</span>
              </div>
            </Link>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link
                href="/platform/privacy"
                className="hover:text-foreground transition-colors"
                data-testid="link-privacy"
              >
                Privacy
              </Link>
              <Link
                href="/platform/terms"
                className="hover:text-foreground transition-colors"
                data-testid="link-terms"
              >
                Terms
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              &copy; 2025 Turbeau, LLC.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

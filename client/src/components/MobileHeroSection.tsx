import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PawPrint, Heart } from "lucide-react";

interface ThreeDoorsConfig {
  door1?: {
    title?: string;
    description?: string;
    linkText?: string;
    linkUrl?: string;
    icon?: string;
  };
  door2?: {
    title?: string;
    description?: string;
    linkText?: string;
    linkUrl?: string;
    icon?: string;
  };
  door3?: {
    title?: string;
    description?: string;
    linkText?: string;
    linkUrl?: string;
    icon?: string;
  };
}

interface MobileHeroSectionProps {
  heroImage: string;
  mobileHeroImage?: string | null;
  heroHeadline?: string | null;
  rescueName: string;
  tagline: string;
  onDonate: () => void;
  basePath: string;
  threeDoorsConfig?: ThreeDoorsConfig;
}

export default function MobileHeroSection({
  heroImage,
  mobileHeroImage,
  heroHeadline,
  rescueName,
  tagline,
  onDonate,
  basePath,
  threeDoorsConfig,
}: MobileHeroSectionProps) {
  const displayImage = mobileHeroImage || heroImage;

  const adoptConfig = threeDoorsConfig?.door1;
  const fosterConfig = threeDoorsConfig?.door2;

  return (
    <div className="px-4 py-4 space-y-4 bg-background">
      <div className="relative rounded-md overflow-hidden" data-testid="mobile-hero-photo">
        <img
          src={displayImage}
          alt={rescueName}
          className="w-full h-72 object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
          <h2 className="text-xl font-bold leading-tight mb-3" data-testid="text-mobile-hero-headline">
            {heroHeadline || tagline || rescueName}
          </h2>
          <Button
            variant="default"
            onClick={onDonate}
            data-testid="button-mobile-hero-donate"
          >
            Donate Now
          </Button>
        </div>
      </div>

      <div
        className="rounded-md p-5 relative overflow-hidden bg-amber-50 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-800/30"
        data-testid="mobile-recruitment-banner"
      >
        <div className="absolute top-2 right-3 opacity-30 select-none" aria-hidden="true">
          <PawPrint className="w-8 h-8 text-amber-700/30 dark:text-amber-400/20" />
        </div>
        <div className="absolute bottom-2 right-10 opacity-20 select-none" aria-hidden="true">
          <Heart className="w-6 h-6 text-amber-700/20 dark:text-amber-400/15" />
        </div>
        <h3 className="font-bold text-base mb-1 text-foreground" data-testid="text-recruitment-heading">
          Join Our Pack:
        </h3>
        <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
          Volunteers needed to keep our furry friends fed and happy. Your time is a life-line.
        </p>
        <Link href={`/volunteer`} asChild>
          <Button
            variant="default"
            data-testid="button-mobile-volunteer-apply"
          >
            Apply Now
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3" data-testid="mobile-action-cards">
        <Link href={adoptConfig?.linkUrl || `/animals`} data-testid="link-mobile-adopt">
          <div
            className="rounded-md border bg-card p-4 text-center space-y-1.5 hover-elevate h-full"
            data-testid="card-mobile-adopt"
          >
            <div className="flex justify-center">
              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                <PawPrint className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <h4 className="font-bold text-sm uppercase tracking-wide text-foreground" data-testid="text-adopt-title">
              {adoptConfig?.title || "Adopt"}
            </h4>
            <p className="text-xs text-muted-foreground" data-testid="text-adopt-description">
              {adoptConfig?.description || "Find a friend."}
            </p>
            <Badge variant="default" data-testid="badge-adopt-cta">
              {adoptConfig?.linkText || "See Pets"}
            </Badge>
          </div>
        </Link>

        <Link href={fosterConfig?.linkUrl || `/foster`} data-testid="link-mobile-foster">
          <div
            className="rounded-md border bg-card p-4 text-center space-y-1.5 hover-elevate h-full"
            data-testid="card-mobile-foster"
          >
            <div className="flex justify-center">
              <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center">
                <Heart className="w-5 h-5 text-rose-500 dark:text-rose-400" />
              </div>
            </div>
            <h4 className="font-bold text-sm uppercase tracking-wide text-foreground" data-testid="text-foster-title">
              {fosterConfig?.title || "Foster"}
            </h4>
            <p className="text-xs text-muted-foreground" data-testid="text-foster-description">
              {fosterConfig?.description || "Save a life."}
            </p>
            <Badge variant="default" data-testid="badge-foster-cta">
              {fosterConfig?.linkText || "Apply Now"}
            </Badge>
          </div>
        </Link>
      </div>
    </div>
  );
}

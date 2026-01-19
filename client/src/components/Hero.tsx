import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import ActionCircle from "./ActionCircle";
import ThreeDoors from "./ThreeDoors";

interface ActionConfig {
  imageUrl?: string;
  title?: string;
  description?: string;
}

type CirclePosition = 'top-right' | 'bottom-right' | 'center';
type CircleSize = 'sm' | 'md' | 'lg';
type HeroLayoutType = 'none' | 'action_circle' | 'three_doors' | 'both';

interface ActionCircleConfig {
  enabled?: boolean;
  rotationSpeed?: number;
  position?: CirclePosition;
  size?: CircleSize;
  actions?: {
    adopt?: ActionConfig;
    foster?: ActionConfig;
    volunteer?: ActionConfig;
    donate?: ActionConfig;
  };
}

const POSITION_CLASSES: Record<CirclePosition, string> = {
  'top-right': 'top-4 right-4 md:top-8 md:right-8',
  'bottom-right': 'bottom-4 right-4 md:bottom-8 md:right-8',
  'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
};

interface ThreeDoorsConfig {
  door1?: {
    title?: string;
    description?: string;
    linkText?: string;
    linkUrl?: string;
    icon?: 'paw' | 'home' | 'heart' | 'dollar';
  };
  door2?: {
    title?: string;
    description?: string;
    linkText?: string;
    linkUrl?: string;
    icon?: 'paw' | 'home' | 'heart' | 'dollar';
  };
  door3?: {
    title?: string;
    description?: string;
    linkText?: string;
    linkUrl?: string;
    icon?: 'paw' | 'home' | 'heart' | 'dollar';
  };
}

type FocalPoint = 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface HeroProps {
  rescueName: string;
  tagline: string;
  backgroundImage: string;
  mobileBackgroundImage?: string | null;
  onViewAnimals?: () => void;
  onDonate?: () => void;
  actionCircle?: ActionCircleConfig;
  heroLayoutType?: HeroLayoutType;
  threeDoorsConfig?: ThreeDoorsConfig;
  basePath?: string;
  heroHeadline?: string | null;
  heroButtonText?: string | null;
  heroButton2Text?: string | null;
  heroFocalPoint?: FocalPoint | null;
}

// Map focal point values to CSS background-position
const FOCAL_POINT_MAP: Record<FocalPoint, string> = {
  'center': 'center center',
  'top': 'center top',
  'bottom': 'center bottom',
  'left': 'left center',
  'right': 'right center',
  'top-left': 'left top',
  'top-right': 'right top',
  'bottom-left': 'left bottom',
  'bottom-right': 'right bottom',
};

export default function Hero({ 
  rescueName, 
  tagline, 
  backgroundImage, 
  mobileBackgroundImage,
  onViewAnimals, 
  onDonate,
  actionCircle,
  heroLayoutType = 'none',
  threeDoorsConfig,
  basePath = '',
  heroHeadline,
  heroButtonText,
  heroButton2Text,
  heroFocalPoint = 'center'
}: HeroProps) {
  // Get the CSS background-position value for the focal point
  const backgroundPosition = FOCAL_POINT_MAP[heroFocalPoint || 'center'] || 'center center';
  // Use mobile image if provided, otherwise fall back to main image with focal point
  const hasMobileImage = !!mobileBackgroundImage;
  // Check if action circle has any configured images
  const hasActionCircle = (heroLayoutType === 'action_circle' || heroLayoutType === 'both') && 
    actionCircle?.enabled && actionCircle?.actions && 
    Object.values(actionCircle.actions).some(action => action?.imageUrl);
  
  // Check if three doors layout is enabled
  const hasThreeDoors = heroLayoutType === 'three_doors' || heroLayoutType === 'both';

  return (
    <>
    <section className="relative min-h-[400px] sm:min-h-[450px] md:min-h-[500px] w-full overflow-visible">
      <div 
        className="absolute inset-0 overflow-hidden"
      >
        {/* Mobile background image - shown on small screens if mobile image is provided */}
        {hasMobileImage && (
          <div 
            className="absolute inset-0 sm:hidden"
            style={{ backgroundImage: `url(${mobileBackgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center center', filter: 'brightness(1.1)' }}
          />
        )}
        {/* Desktop background image - always shown on sm+ screens, or on mobile if no mobile image */}
        <div 
          className={hasMobileImage ? "absolute inset-0 hidden sm:block" : "absolute inset-0"}
          style={{ backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition, filter: 'brightness(1.1)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-black/30" />
      </div>
      
      <div className="relative container flex flex-col h-full px-4 sm:px-6 py-8 sm:py-12">
        <div className="flex flex-col lg:flex-row items-center justify-between w-full gap-8 lg:gap-12 flex-1">
          {/* Left side - Text content */}
          <div className="max-w-2xl space-y-4 sm:space-y-6 text-white text-center lg:text-left">
            <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold leading-tight tracking-tight lg:text-6xl">
              {heroHeadline || rescueName}
            </h1>
            <p className="text-lg sm:text-xl leading-relaxed text-white/90 lg:text-2xl">
              {tagline}
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap justify-center lg:justify-start gap-3 sm:gap-4 pt-2 sm:pt-4">
              <Button 
                size="lg" 
                variant="default"
                onClick={onViewAnimals}
                data-testid="button-view-animals"
                className="hidden sm:inline-flex gap-2 w-full sm:w-auto"
              >
                {heroButtonText || "Meet Our Pets"}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={onDonate}
                data-testid="button-hero-donate"
                className="bg-background/20 backdrop-blur-sm border-white/30 text-white w-full sm:w-auto"
              >
                {heroButton2Text || "Donate Now"}
              </Button>
            </div>
          </div>

        </div>

      </div>

      {/* Three Doors Layout - Normal flow on mobile, overlapping on larger screens */}
      {hasThreeDoors && (
        <>
          {/* Mobile: Normal stacked layout below hero */}
          <div className="sm:hidden relative z-10 pt-6 pb-4 bg-background" data-testid="three-doors-container-mobile">
            <ThreeDoors basePath={basePath} config={threeDoorsConfig} />
          </div>
        </>
      )}

      {/* Action Circle - Hidden on mobile, shown on md+ with absolute positioning */}
      {hasActionCircle && (
        <div 
          className={`hidden md:block absolute ${POSITION_CLASSES[actionCircle.position || 'top-right']}`}
          data-testid="action-circle-container"
        >
          <ActionCircle
            actions={actionCircle.actions}
            rotationSpeed={actionCircle.rotationSpeed || 5}
            size={actionCircle.size || 'md'}
            basePath={basePath}
          />
        </div>
      )}
    </section>
    {/* Desktop: Three doors in normal flow with negative margin to overlap hero - space is naturally reserved
        Original used translate-y-[calc(60%+7px)] pushing down 60% of height + 7px
        To match: pull up by (40% of height - 7px) so same portion overlaps with hero
        Three doors ~140px tall, so: -(140 * 0.4 - 7) = -(56 - 7) = -49px */}
    {hasThreeDoors && (
      <div 
        className="hidden sm:block relative z-10" 
        style={{ marginTop: '-52px' }}
        data-testid="three-doors-container"
      >
        <ThreeDoors basePath={basePath} config={threeDoorsConfig} />
      </div>
    )}
    </>
  );
}

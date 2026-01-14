import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import PublicHeader from "@/components/PublicHeader";
import Hero from "@/components/Hero";
import AnnouncementBar from "@/components/AnnouncementBar";
import { useTenant } from "@/contexts/TenantContext";
import MascotWidget from "@/components/MascotWidget";
import AnimalCard from "@/components/AnimalCard";
import EventCard from "@/components/EventCard";
import HappyTailsCard from "@/components/HappyTailsCard";
import DonationForm from "@/components/DonationForm";
import NewsletterSubscribe from "@/components/NewsletterSubscribe";
import { PublicAdoptionDialog } from "@/components/PublicAdoptionDialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { SiFacebook, SiInstagram, SiYoutube, SiTiktok } from "react-icons/si";
import { useSEO } from "@/hooks/useSEO";
import type { Animal, Tenant, CustomPage, HappyTail, ContentModule } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DOMPurify from 'isomorphic-dompurify';

import heroImage from '@assets/generated_images/Happy_rescued_dogs_with_adopters_9de74d7d.png';
import dogPhoto from '@assets/generated_images/Golden_retriever_dog_portrait_fdeb8a78.png';

// Sanitize color values with strict allowlist
function sanitizeColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  
  const trimmed = value.trim().toLowerCase();
  
  // Allow hex colors (#RGB, #RRGGBB, #RRGGBBAA) - with end anchor
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) {
    return trimmed;
  }
  
  // Allow rgb/rgba colors with strict numeric range validation
  // RGB values: 0-255, Alpha: 0.0-1.0 (no scientific notation)
  // Returns CANONICAL format to prevent injection
  const rgbaMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(0|1|0?\.\d+)\s*)?\)$/i);
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch;
    const rNum = parseInt(r);
    const gNum = parseInt(g);
    const bNum = parseInt(b);
    
    if (rNum <= 255 && gNum <= 255 && bNum <= 255) {
      if (a) {
        const aNum = parseFloat(a);
        if (aNum >= 0 && aNum <= 1) {
          // Return canonical rgba format, NOT user input
          return `rgba(${rNum}, ${gNum}, ${bNum}, ${aNum})`;
        }
      } else {
        // Return canonical rgb format, NOT user input
        return `rgb(${rNum}, ${gNum}, ${bNum})`;
      }
    }
  }
  
  // Allow HSL colors with strict numeric range validation
  // Hue: 0-360, Saturation/Lightness: 0-100%, Alpha: 0.0-1.0
  // Returns CANONICAL format to prevent injection
  const hslaMatch = trimmed.match(/^hsla?\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*(?:,\s*(0|1|0?\.\d+)\s*)?\)$/i);
  if (hslaMatch) {
    const [, h, s, l, a] = hslaMatch;
    const hNum = parseInt(h);
    const sNum = parseInt(s);
    const lNum = parseInt(l);
    
    if (hNum <= 360 && sNum <= 100 && lNum <= 100) {
      if (a) {
        const aNum = parseFloat(a);
        if (aNum >= 0 && aNum <= 1) {
          // Return canonical hsla format, NOT user input
          return `hsla(${hNum}, ${sNum}%, ${lNum}%, ${aNum})`;
        }
      } else {
        // Return canonical hsl format, NOT user input
        return `hsl(${hNum}, ${sNum}%, ${lNum}%)`;
      }
    }
  }
  
  // Allow named colors (common safe ones) - return canonical lowercase value
  const namedColors: { [key: string]: string } = {
    'transparent': 'transparent',
    'black': 'black',
    'white': 'white',
    'red': 'red',
    'blue': 'blue',
    'green': 'green',
    'yellow': 'yellow',
    'orange': 'orange',
    'purple': 'purple',
    'pink': 'pink',
    'gray': 'gray',
    'grey': 'grey',
    'brown': 'brown',
    'cyan': 'cyan',
    'magenta': 'magenta',
    'navy': 'navy',
    'teal': 'teal',
    'lime': 'lime',
    'aqua': 'aqua',
    'maroon': 'maroon',
    'olive': 'olive',
    'silver': 'silver',
    'fuchsia': 'fuchsia'
  };
  
  return namedColors[trimmed] || undefined;
}

// Sanitize font family with allowlist
function sanitizeFontFamily(value: string | undefined): string | undefined {
  if (!value) return undefined;
  
  const trimmed = value.trim().toLowerCase();
  
  // Allow common safe font families - return ONLY the canonical safe value
  const safeFonts: { [key: string]: string } = {
    'inherit': 'inherit',
    'arial': 'Arial',
    'helvetica': 'Helvetica',
    'sans-serif': 'sans-serif',
    'serif': 'serif',
    'monospace': 'monospace',
    'times new roman': 'Times New Roman',
    'georgia': 'Georgia',
    'courier new': 'Courier New',
    'verdana': 'Verdana',
    'tahoma': 'Tahoma',
    'trebuchet ms': 'Trebuchet MS',
    'comic sans ms': 'Comic Sans MS',
    'impact': 'Impact',
    'palatino': 'Palatino',
    'garamond': 'Garamond',
    'bookman': 'Bookman',
    'courier': 'Courier',
    'monaco': 'Monaco',
    'lucida console': 'Lucida Console'
  };
  
  // Return the canonical safe value, NOT the user's input
  // This prevents attackers from appending extra CSS directives
  return safeFonts[trimmed] || undefined;
}

// Sanitize font size with strict pattern
// Returns CANONICAL format to prevent injection
function sanitizeFontSize(value: string | undefined): string | undefined {
  if (!value) return undefined;
  
  const trimmed = value.trim().toLowerCase();
  
  // Allow rem, em, px with numbers - validate single decimal point
  const unitMatch = trimmed.match(/^(\d+(?:\.\d+)?)(rem|em|px)$/i);
  if (unitMatch) {
    const [, num, unit] = unitMatch;
    // Ensure single decimal point (no 1.2.3)
    if ((num.match(/\./g) || []).length <= 1) {
      // Return canonical format
      return `${parseFloat(num)}${unit.toLowerCase()}`;
    }
  }
  
  // Allow percentage - validate single decimal point
  const pctMatch = trimmed.match(/^(\d+(?:\.\d+)?)%$/);
  if (pctMatch) {
    const [, num] = pctMatch;
    // Ensure single decimal point
    if ((num.match(/\./g) || []).length <= 1) {
      // Return canonical format
      return `${parseFloat(num)}%`;
    }
  }
  
  return undefined;
}

// Sanitize background image URLs
// Returns CANONICAL URL (for storage) - caller wraps in url() for rendering
function sanitizeBgImage(url: string | undefined): string | undefined {
  if (!url || url === "") return undefined;
  
  // Handle already-wrapped url() format from stored data
  const urlMatch = url.match(/^url\(['"]?([^'"()]+)['"]?\)$/i);
  const trimmed = urlMatch ? urlMatch[1].trim() : url.trim();
  
  // Allow relative paths from object storage (e.g., /objects/animals/uuid)
  if (trimmed.startsWith('/objects/')) {
    return trimmed;
  }
  
  try {
    const parsed = new URL(trimmed, window.location.origin);
    // Only allow http/https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return undefined;
    }
    // Return canonical URL (fully resolved, no trailing junk)
    // Caller will wrap in url() with proper escaping
    return parsed.href;
  } catch {
    return undefined;
  }
}

export default function Home() {
  const { basePath, tenantId } = useTenant();
  const [donationDialogOpen, setDonationDialogOpen] = useState(false);
  const [adoptionDialogOpen, setAdoptionDialogOpen] = useState(false);
  const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null);
  const [sponsorAnimalName, setSponsorAnimalName] = useState<string | null>(null);

  // Include tenantId in queryKey to prevent stale data flash when switching between tenant sites
  const { data: animalsData, isLoading: isLoadingAnimals } = useQuery<{ animals: Animal[] }>({
    queryKey: ['/api/animals', tenantId],
  });

  const { data: tenantData, isLoading: isLoadingTenant } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant', tenantId],
  });

  const { data: customPagesData } = useQuery<{ pages: CustomPage[] }>({
    queryKey: ['/api/custom-pages', tenantId],
  });

  const { data: eventsData, isLoading: isLoadingEvents } = useQuery<{ 
    events: Array<{
      id: string;
      title: string;
      description: string | null;
      startTime: string;
      endTime: string;
      location: string | null;
      customPageSlug?: string | null;
      calendarName: string;
      calendarColor: string;
      calendarType: "events" | "fundraising";
    }> 
  }>({
    queryKey: ['/api/public-events', tenantId],
  });

  const { data: happyTailsData, isLoading: isLoadingHappyTails } = useQuery<{ happyTails: HappyTail[] }>({
    queryKey: ['/api/happy-tails', tenantId],
  });

  const { data: contentModulesData } = useQuery<{ modules: ContentModule[] }>({
    queryKey: ['/api/content-modules', tenantId],
  });

  const animals = animalsData?.animals || [];
  const tenant = tenantData?.tenant;
  const publishedPages = customPagesData?.pages?.filter(page => page.isPublished) || [];
  const upcomingEvents = eventsData?.events || [];
  const happyTails = happyTailsData?.happyTails?.filter(tail => tail.isPublished) || [];
  const contentModules = contentModulesData?.modules?.filter(module => module.isActive).sort((a, b) => a.displayOrder - b.displayOrder) || [];

  // Helper component to render a content module card with sanitized values
  const ContentModuleCard = ({ module, testId }: { module: ContentModule; testId?: string }) => {
    // Sanitize background image URL
    const bgImageUrl = sanitizeBgImage(module.styling?.backgroundImage);
    const imagePosition = module.styling?.imagePosition || "background";
    
    // Only use as background image when position is "background"
    const sanitizedBgImage = (bgImageUrl && imagePosition === "background")
      ? `url('${bgImageUrl.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\)/g, "\\)").replace(/\(/g, "\\(")}')` 
      : undefined;
    
    const sanitizedStyle = {
      backgroundColor: sanitizeColor(module.styling?.backgroundColor),
      color: sanitizeColor(module.styling?.textColor),
      backgroundImage: sanitizedBgImage,
      backgroundSize: 'cover' as const,
      backgroundPosition: 'center' as const,
      backgroundRepeat: 'no-repeat' as const,
    };

    const textStyle = {
      fontFamily: sanitizeFontFamily(module.styling?.fontFamily),
      fontSize: sanitizeFontSize(module.styling?.fontSize),
      textAlign: module.styling?.textAlign || 'left' as const,
      color: sanitizeColor(module.styling?.textColor),
    };

    // Sanitize content to prevent XSS
    const sanitizedContent = DOMPurify.sanitize(module.content, {
      ALLOWED_TAGS: [], // No HTML tags allowed, text only
      KEEP_CONTENT: true,
    });

    // Render image element for above/below positions
    const renderImage = () => {
      if (!bgImageUrl || imagePosition === "background") return null;
      return (
        <div className="w-full">
          <img 
            src={bgImageUrl} 
            alt={module.title}
            className="w-full h-48 object-cover rounded-md"
          />
        </div>
      );
    };

    const showBorder = module.styling?.showBorder ?? false;
    
    return (
      <Card 
        className={`relative flex h-full flex-col overflow-hidden ${showBorder ? 'border-2 border-border' : ''}`}
        style={sanitizedStyle}
        data-testid={testId}
      >
        {imagePosition === "background" && bgImageUrl && (
          <div className="absolute inset-0 bg-black/40" />
        )}
        
        {imagePosition === "above" && (
          <div className="p-4 pb-0">
            {renderImage()}
          </div>
        )}
        
        <CardHeader className="relative z-10">
          <CardTitle style={textStyle}>
            {DOMPurify.sanitize(module.title, { ALLOWED_TAGS: [], KEEP_CONTENT: true })}
          </CardTitle>
        </CardHeader>
        <CardContent className="relative z-10 flex-1">
          <p style={textStyle} className="whitespace-pre-wrap">
            {sanitizedContent}
          </p>
        </CardContent>
        
        {imagePosition === "below" && (
          <div className="p-4 pt-0 mt-auto">
            {renderImage()}
          </div>
        )}
      </Card>
    );
  };

  // Randomly select and limit animals for homepage display
  const displayedAnimals = useMemo(() => {
    const availableAnimals = animals.filter(animal => 
      animal.status === "available" || animal.status === "foster"
    );
    // Shuffle array using Fisher-Yates algorithm
    const shuffled = [...availableAnimals].sort(() => Math.random() - 0.5);
    // Return first 8 animals
    return shuffled.slice(0, 8);
  }, [animals]);

  const handleAdopt = (animal: Animal) => {
    setSelectedAnimal(animal);
    setAdoptionDialogOpen(true);
  };

  const handleSponsor = (animalName: string) => {
    setSponsorAnimalName(animalName);
    setDonationDialogOpen(true);
  };

  // Use tenant branding or fallback to defaults
  // Show loading state to prevent flash of incorrect branding
  const rescueName = tenant?.name || "";
  const rescueTagline = tenant?.tagline || "";
  const rescueHeroImage = tenant?.heroImageUrl || heroImage;

  // SEO configuration
  useSEO({
    title: `${rescueName} - Adopt, Volunteer, Donate | Animal Rescue`,
    description: `${rescueTagline} Browse available animals for adoption, upcoming events, and learn how you can support ${rescueName}.`,
    image: tenant?.logoUrl || rescueHeroImage,
    siteName: rescueName,
  });

  // Get announcement bar settings
  const announcementBar = tenant?.announcementBar as {
    enabled?: boolean;
    text?: string;
    linkText?: string;
    linkUrl?: string;
    style?: "info" | "warning" | "urgent";
  } | null;

  // Show loading state while tenant data is being fetched to prevent branding flash
  if (isLoadingTenant || !tenant) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
      
      {announcementBar?.enabled && announcementBar?.text && (
        <AnnouncementBar
          text={announcementBar.text}
          linkText={announcementBar.linkText}
          linkUrl={announcementBar.linkUrl}
          style={announcementBar.style || "info"}
        />
      )}

      <Hero 
        rescueName={rescueName}
        tagline={rescueTagline}
        backgroundImage={rescueHeroImage}
        onViewAnimals={() => document.getElementById('animals')?.scrollIntoView({ behavior: 'smooth' })}
        onDonate={() => setDonationDialogOpen(true)}
        actionCircle={tenant?.actionCircle as any}
        heroLayoutType={(tenant?.heroLayoutType as 'none' | 'action_circle' | 'three_doors') || 'none'}
        threeDoorsConfig={tenant?.threeDoorsConfig as any}
        basePath={basePath}
        heroHeadline={tenant?.heroHeadline}
        heroButtonText={tenant?.heroButtonText}
        heroButton2Text={tenant?.heroButton2Text}
      />
      
      {/* Spacer for Three Doors overlap */}
      {tenant?.heroLayoutType === 'three_doors' && (
        <div className="h-16 sm:h-20 bg-background" />
      )}

      {upcomingEvents.length > 0 && (
        <section className="py-12 sm:py-20 bg-primary/5">
          <div className="container px-6 sm:px-8 space-y-8 sm:space-y-12">
            <div className="max-w-3xl">
              <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4">Upcoming Events</h2>
              <p className="text-base sm:text-lg text-muted-foreground">
                Join us at our upcoming adoption events and fundraisers. Meet our animals in person and support our mission!
              </p>
            </div>
            
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 justify-items-center sm:justify-items-stretch">
              {isLoadingEvents ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-3 w-full max-w-md sm:max-w-none">
                    <Skeleton className="h-48 w-full" data-testid="skeleton-event" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ))
              ) : (
                upcomingEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    id={event.id}
                    title={event.title}
                    description={event.description}
                    startTime={event.startTime}
                    endTime={event.endTime}
                    location={event.location}
                    customPageSlug={event.customPageSlug}
                    calendarType={event.calendarType}
                    calendarColor={event.calendarColor}
                  />
                ))
              )}
            </div>
          </div>
        </section>
      )}

      <section id="animals" className="py-12 sm:py-20 bg-background">
        <div className="w-full max-w-7xl mx-auto px-6 sm:px-8 space-y-8 sm:space-y-12">
          <div className="max-w-3xl">
            <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4">Available for Adoption</h2>
            <p className="text-base sm:text-lg text-muted-foreground">
              Meet our wonderful animals waiting for their forever homes. Each one has a unique personality and so much love to give.
            </p>
          </div>
          
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 w-full">
            {isLoadingAnimals ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-3 w-full">
                  <Skeleton className="h-48 w-full" data-testid="skeleton-animal" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))
            ) : displayedAnimals.length > 0 ? (
              displayedAnimals.map((animal) => (
                <AnimalCard
                  key={animal.id}
                  id={animal.id.toString()}
                  name={animal.name}
                  species={animal.species}
                  breed={animal.breed}
                  age={`${animal.age} years`}
                  photo={animal.photoUrls?.[0] ?? dogPhoto}
                  photos={animal.photoUrls && animal.photoUrls.length > 0 ? animal.photoUrls : undefined}
                  bio={animal.bio ?? undefined}
                  basePath={basePath}
                  onAdopt={() => handleAdopt(animal)}
                  onSponsor={() => handleSponsor(animal.name)}
                />
              ))
            ) : (
              <div className="col-span-full text-center py-12" data-testid="no-animals">
                <p className="text-lg text-muted-foreground">
                  No animals available for adoption at this time. Check back soon!
                </p>
              </div>
            )}
          </div>
          
          {animals.filter(animal => animal.status === "available").length > 8 && (
            <div className="flex justify-center mt-8 sm:mt-12">
              <div className="w-full sm:w-auto">
                <Link href="/animals" asChild>
                  <Button size="lg" variant="default" className="w-full sm:w-auto min-h-[48px]" data-testid="button-view-all-animals">
                    View All Available Animals
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      {(isLoadingHappyTails || happyTails.length > 0) && (
        <section className="py-12 sm:py-20 bg-muted/30">
          <div className="container px-6 sm:px-8 space-y-8 sm:space-y-12">
            <div className="max-w-3xl">
              <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4">Happy Tails</h2>
              <p className="text-base sm:text-lg text-muted-foreground">
                See the joy our adopted animals bring to their new families. These success stories inspire us every day.
              </p>
            </div>
            
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 justify-items-center sm:justify-items-stretch">
              {isLoadingHappyTails ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-3 w-full max-w-md sm:max-w-none">
                    <Skeleton className="h-64 w-full" data-testid="skeleton-happy-tail" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ))
              ) : (
                happyTails.map((tail) => (
                  <HappyTailsCard 
                    key={tail.id} 
                    tail={{
                      id: tail.id,
                      animalName: tail.animalName,
                      adopterName: tail.adopterName,
                      story: tail.story,
                      photo: tail.photoUrl || dogPhoto,
                      date: tail.date,
                    }} 
                  />
                ))
              )}
            </div>
          </div>
        </section>
      )}

      <section className="py-12 sm:py-20 bg-primary/5">
        <div className="max-w-6xl mx-auto px-6">
          {contentModules.length > 0 ? (
            <div className="flex flex-col gap-8">
              {/* Donation section - always first/top */}
              <div className="w-full max-w-2xl mx-auto">
                <div className="text-center mb-8">
                  <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4" data-testid="text-donation-heading">
                    {(tenant as any)?.donationSection?.sectionHeading || "Support Our Mission"}
                  </h2>
                  <p className="text-base sm:text-lg text-muted-foreground" data-testid="text-donation-description">
                    {(tenant as any)?.donationSection?.sectionDescription || "Your donation helps us rescue, care for, and find homes for animals in need."}
                  </p>
                </div>
                <DonationForm 
                  tenant={tenant}
                />
              </div>

              {/* Content modules - flexbox layout that centers items and adapts to count */}
              <div className="flex flex-wrap justify-center gap-6">
                {contentModules.map((module, idx) => (
                  <div key={module.id} className="w-full sm:w-[calc(50%-0.75rem)] xl:w-[calc(33.333%-1rem)] max-w-md">
                    <ContentModuleCard module={module} testId={`content-module-${idx}`} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-8 sm:mb-12">
                <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4" data-testid="text-donation-heading">
                  {(tenant as any)?.donationSection?.sectionHeading || "Support Our Mission"}
                </h2>
                <p className="text-base sm:text-lg text-muted-foreground" data-testid="text-donation-description">
                  {(tenant as any)?.donationSection?.sectionDescription || "Your donation helps us rescue, care for, and find homes for animals in need."}
                </p>
              </div>
              <DonationForm 
                tenant={tenant}
              />
            </div>
          )}
        </div>
      </section>

      <PublicAdoptionDialog
        animal={selectedAnimal}
        open={adoptionDialogOpen}
        onOpenChange={setAdoptionDialogOpen}
      />

      <Dialog open={donationDialogOpen} onOpenChange={setDonationDialogOpen}>
        <DialogContent className="max-w-2xl" aria-describedby={undefined}>
          <DonationForm 
            tenant={tenant}
            sponsoredAnimalName={sponsorAnimalName || undefined}
          />
        </DialogContent>
      </Dialog>

      <footer className="border-t py-8 sm:py-12 bg-card">
        <div className="container px-6 sm:px-8">
          <div className="grid gap-6 sm:gap-8 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <h3 className="font-display text-lg font-semibold mb-4">About Us</h3>
              {tenant?.missionStatement ? (
                <div className="text-sm text-muted-foreground prose prose-sm dark:prose-invert max-w-none" data-testid="text-mission-statement">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {tenant.missionStatement}
                  </ReactMarkdown>
                </div>
              ) : publishedPages.find(p => p.slug === 'about-us') ? (
                <Link href="/about-us">
                  <p className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    Learn more about our mission and how we help animals in need.
                  </p>
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {tenant?.tagline || `${rescueName} is dedicated to rescuing, rehabilitating, and rehoming animals in need.`}
                </p>
              )}
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold mb-4">Contact</h3>
              <div className="text-sm flex flex-col gap-2">
                <Link href="/contact" data-testid="link-footer-contact">
                  <span className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    Send us a message
                  </span>
                </Link>
                {tenant?.contactPhone && (
                  <a href={`tel:${tenant.contactPhone}`} className="text-muted-foreground hover:text-foreground transition-colors">
                    {tenant.contactPhone}
                  </a>
                )}
                {tenant?.footerAddress && (
                  <p className="text-muted-foreground" data-testid="text-footer-address">
                    {tenant.footerAddress}
                  </p>
                )}
                {tenant?.footerHours && (
                  <p className="text-muted-foreground" data-testid="text-footer-hours">
                    {tenant.footerHours}
                  </p>
                )}
                {(tenant?.socialFacebook || tenant?.socialInstagram || tenant?.socialYoutube || tenant?.socialTiktok) && (
                  <div className="flex items-center gap-3 mt-3" data-testid="social-media-links">
                    {tenant?.socialFacebook && (
                      <a 
                        href={tenant.socialFacebook} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        data-testid="link-social-facebook"
                        aria-label="Facebook"
                      >
                        <SiFacebook className="h-5 w-5" />
                      </a>
                    )}
                    {tenant?.socialInstagram && (
                      <a 
                        href={tenant.socialInstagram} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        data-testid="link-social-instagram"
                        aria-label="Instagram"
                      >
                        <SiInstagram className="h-5 w-5" />
                      </a>
                    )}
                    {tenant?.socialYoutube && (
                      <a 
                        href={tenant.socialYoutube} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        data-testid="link-social-youtube"
                        aria-label="YouTube"
                      >
                        <SiYoutube className="h-5 w-5" />
                      </a>
                    )}
                    {tenant?.socialTiktok && (
                      <a 
                        href={tenant.socialTiktok} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        data-testid="link-social-tiktok"
                        aria-label="TikTok"
                      >
                        <SiTiktok className="h-5 w-5" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold mb-4">Get Involved</h3>
              <div className="text-sm flex flex-col gap-2">
                <Link href="/volunteer" data-testid="link-footer-volunteer">
                  <span className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    Volunteer
                  </span>
                </Link>
                <Link href="/become-a-foster" data-testid="link-footer-foster">
                  <span className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    Become a Foster
                  </span>
                </Link>
                <Link href="/surrender" data-testid="link-footer-surrender">
                  <span className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    Surrender an Animal
                  </span>
                </Link>
                {publishedPages.map((page) => (
                  <Link key={page.id} href={`/${page.slug}`} data-testid={`link-page-${page.slug}`}>
                    <span className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                      {page.title}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <NewsletterSubscribe variant="inline" />
            </div>
          </div>

          {/* Sponsor Logos Section */}
          {((tenant?.sponsorLogos as any[]) || []).length > 0 && (
            <div className="mt-8 pt-8 border-t">
              <h4 className="text-sm font-medium text-center mb-4 text-muted-foreground">Our Sponsors & Partners</h4>
              <div className="flex flex-wrap justify-center items-center gap-6">
                {((tenant?.sponsorLogos as { id: string; imageUrl: string; altText: string; linkUrl?: string }[]) || []).map((sponsor) => (
                  sponsor.linkUrl ? (
                    <a 
                      key={sponsor.id}
                      href={sponsor.linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="grayscale hover:grayscale-0 transition-all opacity-70 hover:opacity-100"
                      data-testid={`link-sponsor-${sponsor.id}`}
                    >
                      <img 
                        src={sponsor.imageUrl} 
                        alt={sponsor.altText}
                        className="h-14 w-auto object-contain"
                      />
                    </a>
                  ) : (
                    <div 
                      key={sponsor.id}
                      className="grayscale opacity-70"
                      data-testid={`img-sponsor-${sponsor.id}`}
                    >
                      <img 
                        src={sponsor.imageUrl} 
                        alt={sponsor.altText}
                        className="h-14 w-auto object-contain"
                      />
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 pt-8 border-t text-center text-sm text-muted-foreground space-y-2">
            <p>{tenant?.footerText || `© ${new Date().getFullYear()} ${tenant?.name || "Animal Rescue"}. All rights reserved.`}</p>
            <p>
              Powered by <a href="https://irescue.life" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" data-testid="link-powered-by">iRescue.life</a>
            </p>
          </div>
        </div>
      </footer>

      {/* Mascot Widget - Fixed in bottom-right corner */}
      <MascotWidget
        rescueName={rescueName}
        speechText={(tenant?.mascot as { speechText?: string } | undefined)?.speechText}
        enabled={(tenant?.mascot as { enabled?: boolean } | undefined)?.enabled}
        tenantId={tenant?.id}
      />
    </div>
  );
}

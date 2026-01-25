import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import PublicHeader from "@/components/PublicHeader";
import AnimalCard from "@/components/AnimalCard";
import { PublicAdoptionDialog } from "@/components/PublicAdoptionDialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import DonationForm from "@/components/DonationForm";
import NewsletterSubscribe from "@/components/NewsletterSubscribe";
import MascotWidget from "@/components/MascotWidget";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter } from "lucide-react";
import { DonorTickerMarquee } from "@/components/DonorTicker";
import { useTenant } from "@/contexts/TenantContext";
import type { Animal, Tenant, Page } from "@shared/schema";

import dogPhoto from '@assets/generated_images/Golden_retriever_dog_portrait_fdeb8a78.png';

export default function AvailableAnimalsPage() {
  const { basePath, tenantId } = useTenant();
  const [donationDialogOpen, setDonationDialogOpen] = useState(false);
  const [adoptionDialogOpen, setAdoptionDialogOpen] = useState(false);
  const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null);
  const [sponsorAnimalName, setSponsorAnimalName] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState<string>("all");
  const [ageFilter, setAgeFilter] = useState<string>("all");

  // Include tenantId in queryKey to prevent stale data flash when switching between tenant sites
  const { data: animalsData, isLoading: isLoadingAnimals } = useQuery<{ animals: Animal[] }>({
    queryKey: ['/api/animals', tenantId],
  });

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant', tenantId],
  });

  const { data: pagesData } = useQuery<{ pages: Page[] }>({
    queryKey: ['/api/pages', tenantId],
  });

  const animals = animalsData?.animals || [];
  const tenant = tenantData?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";
  const publishedPages = (pagesData?.pages || []).filter(p => p.isPublished);

  const handleAdopt = (animal: Animal) => {
    setSelectedAnimal(animal);
    setAdoptionDialogOpen(true);
  };

  const handleSponsor = (animalName: string) => {
    setSponsorAnimalName(animalName);
    setDonationDialogOpen(true);
  };

  // Filter animals - include available, foster, adoption_pending, and in_trial animals
  // Animals with pending/trial status are shown but with badges indicating they're spoken for
  const availableAnimals = animals.filter(animal => 
    animal.status === "available" || 
    animal.status === "foster" ||
    animal.status === "adoption_pending" ||
    animal.status === "in_trial"
  );
  
  const filteredAnimals = availableAnimals.filter(animal => {
    const matchesSearch = searchQuery === "" || 
      animal.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      animal.breed.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesSpecies = speciesFilter === "all" || 
      animal.species.toLowerCase() === speciesFilter.toLowerCase();
    
    const animalAge = typeof animal.age === 'string' ? parseFloat(animal.age) : animal.age;
    const matchesAge = ageFilter === "all" || 
      (ageFilter === "young" && animalAge < 2) ||
      (ageFilter === "adult" && animalAge >= 2 && animalAge < 7) ||
      (ageFilter === "senior" && animalAge >= 7);
    
    return matchesSearch && matchesSpecies && matchesAge;
  });

  // Get unique species for filter
  const uniqueSpecies = Array.from(new Set(availableAnimals.map(a => a.species)));

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader rescueName={rescueName} />
      
      {/* Wall of Love Ticker */}
      <DonorTickerMarquee limit={20} />
      
      {/* Hero Section */}
      <section className="py-16 bg-primary/5">
        <div className="container px-6">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="font-display text-5xl font-bold mb-4" data-testid="heading-available-animals">
              Available for Adoption
            </h1>
            <p className="text-xl text-muted-foreground">
              Browse all of our wonderful animals waiting for their forever homes. Each one has a unique personality and so much love to give.
            </p>
          </div>
        </div>
      </section>

      {/* Filters Section */}
      <section className="py-8 border-b bg-background sticky top-0 z-10">
        <div className="container px-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or breed..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-animals"
              />
            </div>
            
            <Select value={speciesFilter} onValueChange={setSpeciesFilter}>
              <SelectTrigger className="w-full sm:w-48" data-testid="select-species-filter">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Species" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Species</SelectItem>
                {uniqueSpecies.map(species => (
                  <SelectItem key={species} value={species.toLowerCase()}>
                    {species}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={ageFilter} onValueChange={setAgeFilter}>
              <SelectTrigger className="w-full sm:w-48" data-testid="select-age-filter">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Ages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ages</SelectItem>
                <SelectItem value="young">Young (0-2 years)</SelectItem>
                <SelectItem value="adult">Adult (2-7 years)</SelectItem>
                <SelectItem value="senior">Senior (7+ years)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="mt-4 text-sm text-muted-foreground" data-testid="text-animal-count">
            Showing {filteredAnimals.length} of {availableAnimals.length} available animals
          </div>
        </div>
      </section>

      {/* Animals Grid */}
      <section className="py-12 bg-background">
        <div className="w-full max-w-7xl mx-auto px-6 sm:px-8">
          {isLoadingAnimals ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 w-full">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="space-y-3 w-full">
                  <Skeleton className="h-48 w-full" data-testid="skeleton-animal" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : filteredAnimals.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 w-full">
              {filteredAnimals.map((animal) => (
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
                  status={animal.status}
                  onAdopt={() => handleAdopt(animal)}
                  onSponsor={() => handleSponsor(animal.name)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-16" data-testid="no-animals-found">
              <p className="text-lg text-muted-foreground mb-4">
                {searchQuery || speciesFilter !== "all" || ageFilter !== "all"
                  ? "No animals match your search criteria. Try adjusting your filters."
                  : "No animals available for adoption at this time. Check back soon!"}
              </p>
              {(searchQuery || speciesFilter !== "all" || ageFilter !== "all") && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery("");
                    setSpeciesFilter("all");
                    setAgeFilter("all");
                  }}
                  data-testid="button-clear-filters"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Adoption Dialog */}
      <PublicAdoptionDialog
        animal={selectedAnimal}
        open={adoptionDialogOpen}
        onOpenChange={setAdoptionDialogOpen}
      />

      {/* Donation Dialog */}
      <Dialog open={donationDialogOpen} onOpenChange={(open) => {
        setDonationDialogOpen(open);
        if (!open) setSponsorAnimalName(null);
      }}>
        <DialogContent className="max-w-md">
          <DonationForm
            tenant={tenant}
            sponsoredAnimalName={sponsorAnimalName || undefined}
          />
        </DialogContent>
      </Dialog>

      {/* Universal Footer */}
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
                        className="h-12 w-auto object-contain"
                      />
                    </a>
                  ) : (
                    <img 
                      key={sponsor.id}
                      src={sponsor.imageUrl} 
                      alt={sponsor.altText}
                      className="h-12 w-auto object-contain grayscale opacity-70"
                    />
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

      {/* Mascot Widget */}
      <MascotWidget
        rescueName={rescueName}
        speechText={(tenant?.mascot as { speechText?: string } | undefined)?.speechText}
        enabled={(tenant?.mascot as { enabled?: boolean } | undefined)?.enabled}
        tenantId={tenant?.id}
      />
    </div>
  );
}

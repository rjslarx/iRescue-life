import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useSEO, useJsonLd } from "@/hooks/useSEO";
import PublicHeader from "@/components/PublicHeader";
import { PublicAdoptionDialog } from "@/components/PublicAdoptionDialog";
import DonationForm from "@/components/DonationForm";
import PublicFooter from "@/components/PublicFooter";
import { CompatibilityQuiz } from "@/components/CompatibilityQuiz";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Heart, 
  Share2, 
  Facebook, 
  Mail, 
  Link as LinkIcon, 
  Check,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  Dice5,
  PawPrint,
} from "lucide-react";
import { SiX } from "react-icons/si";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Animal, Tenant } from "@shared/schema";
import { useTenant } from "@/contexts/TenantContext";

import dogPhoto from '@assets/generated_images/Golden_retriever_dog_portrait_fdeb8a78.png';

function getThumbnailUrl(url: string): string {
  if (!url.startsWith('/objects/') || url.endsWith('-thumb')) {
    return url;
  }

  return `${url}-thumb`;
}

export default function PublicAnimalProfilePage() {
  const { animalId } = useParams<{ animalId: string }>();
  const { basePath, tenantId } = useTenant();
  const { toast } = useToast();
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const photoTouchStartX = useRef<number | null>(null);
  const [donationDialogOpen, setDonationDialogOpen] = useState(false);
  const [adoptionDialogOpen, setAdoptionDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [failedPhotoUrls, setFailedPhotoUrls] = useState<Set<string>>(() => new Set());
  const [revealedCards, setRevealedCards] = useState<Set<number>>(() => new Set());
  const [selectedTrait, setSelectedTrait] = useState<string | null>(null);

  // Include tenantId in queryKey to prevent stale data flash when switching between tenant sites
  const { data: animalData, isLoading: isLoadingAnimal } = useQuery<{ animal: Animal }>({
    queryKey: ['/api/animals', animalId, tenantId],
    enabled: !!animalId,
  });

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant', tenantId],
  });

  const animal = animalData?.animal;
  const tenant = tenantData?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";
  const personalityTags = ((animal as any)?.personalityTags || []) as string[];
  const superpowers = ((animal as any)?.superpowerBadges || []) as { key: string; label: string; explanation: string }[];
  const revealCards = ((animal as any)?.revealCards || []) as { title: string; body: string }[];
  const compatibilityTraits = [
    animal?.dogFriendly ? "Dog friendly" : null,
    animal?.catFriendly ? "Cat friendly" : null,
    animal?.childFriendly ? "Good with kids" : null,
    animal?.activityLevel ? "Similar energy" : null,
    animal?.weight ? "Similar size" : null,
  ].filter((trait): trait is string => !!trait);
  const traitChoices = Array.from(new Set([...personalityTags, ...compatibilityTraits])).slice(0, 5);
  const { data: discoveries, isFetching: isDiscovering } = useQuery<{ animals: Animal[] }>({
    queryKey: ["/api/public/animals", animalId, "discover", selectedTrait],
    queryFn: async () => (await apiRequest("GET", `/api/public/animals/${animalId}/discover?trait=${encodeURIComponent(selectedTrait || "")}`)).json(),
    enabled: !!animalId && !!selectedTrait,
  });
  const chooseTrait = (trait: string) => setSelectedTrait(trait);
  const surpriseMe = () => chooseTrait(traitChoices[Math.floor(Math.random() * traitChoices.length)] || "Similar energy");

  const isLiteTier = (tenant as any)?.subscriptionTier === 'lite';
  const jotformAdoptionUrl = (tenant as any)?.jotformAdoptionUrl;

  const handleAdoptClick = () => {
    if (isLiteTier && jotformAdoptionUrl && animal) {
      try {
        const url = new URL(jotformAdoptionUrl);
        url.searchParams.set('animalName', animal.name);
        url.searchParams.set('animalBreed', animal.breed);
        url.searchParams.set('animalSpecies', animal.species);
        url.searchParams.set('animalId', animal.id.toString());
        window.open(url.toString(), '_blank', 'noopener,noreferrer');
      } catch {
        window.open(jotformAdoptionUrl, '_blank', 'noopener,noreferrer');
      }
    } else {
      setAdoptionDialogOpen(true);
    }
  };

  const validPhotoUrls = useMemo(
    () => (animal?.photoUrls || []).filter(
      (url): url is string => typeof url === 'string' && url.trim().length > 0,
    ),
    [animal?.photoUrls],
  );
  const photoArray = validPhotoUrls.filter((url) => !failedPhotoUrls.has(url));
  const displayPhotoArray = photoArray.length > 0 ? photoArray : [dogPhoto];

  const hasMultiplePhotos = displayPhotoArray.length > 1;

  useEffect(() => {
    setCurrentPhotoIndex(0);
    setFailedPhotoUrls(new Set());
  }, [animal?.id]);

  useEffect(() => {
    if (currentPhotoIndex >= displayPhotoArray.length) {
      setCurrentPhotoIndex(Math.max(0, displayPhotoArray.length - 1));
    }
  }, [currentPhotoIndex, displayPhotoArray.length]);

  const pageTitle = animal 
    ? `Meet ${animal.name} - ${animal.breed} | ${rescueName}`
    : `Animal Profile | ${rescueName}`;
  
  const pageDescription = animal?.bio 
    ? animal.bio.slice(0, 200) + (animal.bio.length > 200 ? '...' : '')
    : animal 
      ? `${animal.name} is a ${animal.age} year old ${animal.breed} looking for a forever home at ${rescueName}.`
      : `Find your perfect companion at ${rescueName}.`;

  const ogImage = displayPhotoArray[0] || undefined;
  const canonicalUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${basePath}/animal/${animalId}`
    : undefined;
  const absoluteOgImage = ogImage && typeof window !== 'undefined'
    ? new URL(ogImage, window.location.origin).toString()
    : ogImage;

  useSEO({
    title: pageTitle,
    description: pageDescription,
    siteName: rescueName,
    image: absoluteOgImage,
    url: canonicalUrl,
    type: 'website',
  });

  const tenantOriginAnimal = typeof window !== 'undefined' ? window.location.origin : '';

  useJsonLd({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "name": rescueName,
        "url": tenantOriginAnimal
      },
      {
        "@type": "Organization",
        "name": rescueName,
        "url": tenantOriginAnimal,
        ...(tenant?.logoUrl ? { "logo": tenant.logoUrl } : {})
      },
      ...(animal ? [{
        "@type": "WebPage",
        "name": pageTitle,
        "url": canonicalUrl,
        "description": pageDescription,
        ...(absoluteOgImage ? { "image": absoluteOgImage } : {})
      }] : [])
    ]
  });

  const getShareUrl = () => {
    return window.location.href;
  };

  const getShareText = () => {
    if (!animal) return "Check out this pet looking for a home!";
    return `Meet ${animal.name}, a ${animal.age} year old ${animal.breed} looking for a loving home!`;
  };

  const handleShare = (platform: string) => {
    const shareUrl = encodeURIComponent(getShareUrl());
    const shareText = encodeURIComponent(getShareText());

    let url = '';
    
    switch (platform) {
      case 'facebook':
        url = `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`;
        break;
      case 'twitter':
        url = `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`;
        break;
      case 'whatsapp':
        url = `https://wa.me/?text=${shareText}%20${shareUrl}`;
        break;
      case 'email':
        url = `mailto:?subject=${encodeURIComponent(`Adopt ${animal?.name || 'this pet'}`)}&body=${shareText}%20${shareUrl}`;
        break;
      case 'copy':
        navigator.clipboard.writeText(getShareUrl()).then(() => {
          setCopied(true);
          toast({
            title: "Link copied!",
            description: "Share link copied to clipboard",
          });
          setTimeout(() => setCopied(false), 2000);
        });
        return;
    }

    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer,width=600,height=400');
    }
  };

  const nextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev + 1) % displayPhotoArray.length);
  };

  const prevPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev - 1 + displayPhotoArray.length) % displayPhotoArray.length);
  };

  const handlePhotoTouchEnd = (clientX: number) => {
    if (photoTouchStartX.current === null) return;
    const distance = clientX - photoTouchStartX.current;
    photoTouchStartX.current = null;
    if (Math.abs(distance) < 50 || !hasMultiplePhotos) return;
    if (distance < 0) nextPhoto();
    else prevPhoto();
  };

  const handlePhotoError = (url: string) => {
    if (url === dogPhoto) return;
    setFailedPhotoUrls((current) => {
      const next = new Set(current);
      next.add(url);
      return next;
    });
  };

  if (isLoadingAnimal) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
        <main className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <Skeleton className="h-96 w-full rounded-xl mb-6" />
            <Skeleton className="h-8 w-48 mb-4" />
            <Skeleton className="h-20 w-full mb-4" />
          </div>
        </main>
      </div>
    );
  }

  if (!animal) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
        <main className="container mx-auto px-4 py-12">
          <Card className="max-w-lg mx-auto">
            <CardContent className="pt-6 text-center">
              <Heart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Animal Not Found</h2>
              <p className="text-muted-foreground">
                This animal may have been adopted or is no longer available.
              </p>
              <Button 
                className="mt-4"
                onClick={() => window.location.href = `${basePath}/animals`}
                data-testid="button-view-all-animals"
              >
                View Available Animals
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Card className="overflow-hidden">
            <div className="md:flex">
              <div className="relative md:w-1/2 p-3">
                <div
                  className="aspect-square relative overflow-hidden rounded-lg bg-muted"
                  role="group"
                  aria-label={`${animal.name} photo gallery`}
                  tabIndex={hasMultiplePhotos ? 0 : undefined}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowLeft') {
                      event.preventDefault();
                      prevPhoto();
                    } else if (event.key === 'ArrowRight') {
                      event.preventDefault();
                      nextPhoto();
                    }
                  }}
                >
                  <button
                    type="button"
                    className="block h-full w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    onClick={() => setPhotoViewerOpen(true)}
                    aria-label={`Enlarge photo ${currentPhotoIndex + 1} of ${animal.name}`}
                    data-testid="button-enlarge-animal-photo"
                  >
                    <img
                      src={displayPhotoArray[currentPhotoIndex]}
                      alt={`${animal.name}, photo ${currentPhotoIndex + 1} of ${displayPhotoArray.length}`}
                      className="w-full h-full object-cover"
                      loading="eager"
                      decoding="async"
                      onError={() => handlePhotoError(displayPhotoArray[currentPhotoIndex])}
                      data-testid="img-animal-profile"
                    />
                  </button>
                  
                  {hasMultiplePhotos && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute z-10 left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full shadow-md"
                        onClick={prevPhoto}
                        aria-label={`Show previous photo of ${animal.name}`}
                        data-testid="button-prev-photo"
                      >
                        <ChevronLeft className="h-6 w-6" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute z-10 right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full shadow-md"
                        onClick={nextPhoto}
                        aria-label={`Show next photo of ${animal.name}`}
                        data-testid="button-next-photo"
                      >
                        <ChevronRight className="h-6 w-6" />
                      </Button>
                      <div className="absolute z-10 bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/65 px-3 py-1 text-xs font-medium text-white">
                        {currentPhotoIndex + 1} / {displayPhotoArray.length}
                      </div>
                    </>
                  )}
                </div>
                {hasMultiplePhotos && (
                  <div
                    className="mt-3 flex gap-2 overflow-x-auto pb-1"
                    aria-label={`Choose a photo of ${animal.name}`}
                    data-testid="animal-photo-thumbnails"
                  >
                    {displayPhotoArray.map((url, index) => (
                      <button
                        type="button"
                        key={`${url}-${index}`}
                        className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                          index === currentPhotoIndex
                            ? 'border-primary ring-1 ring-primary'
                            : 'border-transparent opacity-75 hover:opacity-100'
                        }`}
                        onClick={() => setCurrentPhotoIndex(index)}
                        aria-label={`Show photo ${index + 1} of ${animal.name}`}
                        aria-pressed={index === currentPhotoIndex}
                        data-testid={`thumbnail-photo-${index}`}
                      >
                        <img
                          src={getThumbnailUrl(url)}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                          onError={(event) => {
                            const image = event.currentTarget;
                            if (image.src.endsWith('-thumb')) {
                              image.src = url;
                              return;
                            }
                            handlePhotoError(url);
                          }}
                        />
                        <span className="sr-only">
                          {index === currentPhotoIndex ? 'Currently selected' : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <CardContent className="md:w-1/2 p-6 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h1 className="text-3xl font-bold" data-testid="text-animal-name">
                        {animal.name}
                      </h1>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge variant="secondary">{animal.species}</Badge>
                        <Badge variant="outline">{animal.breed}</Badge>
                        {animal.colors?.length > 0 && (
                          <Badge variant="outline" data-testid="badge-animal-colors">{animal.colors.join(', ')}</Badge>
                        )}
                        <Badge variant="outline">{animal.age} years old</Badge>
                        {animal.status === 'adoption_pending' && (
                          <Badge variant="default" className="bg-amber-500">Adoption Pending</Badge>
                        )}
                        {animal.status === 'in_trial' && (
                          <Badge variant="default" className="bg-blue-500">In Trial</Badge>
                        )}
                      </div>
                    </div>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="icon"
                          data-testid="button-share"
                        >
                          {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => handleShare('facebook')} data-testid="share-facebook">
                          <Facebook className="h-4 w-4 mr-2" />
                          Share on Facebook
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleShare('twitter')} data-testid="share-twitter">
                          <SiX className="h-4 w-4 mr-2" />
                          Share on X
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleShare('whatsapp')} data-testid="share-whatsapp">
                          <MessageCircle className="h-4 w-4 mr-2" />
                          Share on WhatsApp
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleShare('email')} data-testid="share-email">
                          <Mail className="h-4 w-4 mr-2" />
                          Share via Email
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleShare('copy')} data-testid="share-copy">
                          <LinkIcon className="h-4 w-4 mr-2" />
                          Copy Link
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {animal.bio && (
                    <div className="prose prose-sm max-w-none text-muted-foreground" data-testid="text-animal-bio">
                      <p>{animal.bio}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-3 mt-6">
                  {animal.status === 'adoption_pending' || animal.status === 'in_trial' ? (
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <p className="text-muted-foreground">
                        {animal.status === 'in_trial' 
                          ? `${animal.name} is currently in a trial adoption period.`
                          : `${animal.name} has a pending adoption application.`
                        }
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Check back soon or contact us for other available animals.
                      </p>
                    </div>
                  ) : (
                    <Button 
                      className="w-full" 
                      size="lg"
                      onClick={handleAdoptClick}
                      data-testid="button-adopt"
                    >
                      Adopt {animal.name}
                    </Button>
                  )}
                  
                  <Button 
                    variant="outline"
                    className="w-full"
                    size="lg"
                    onClick={() => setDonationDialogOpen(true)}
                    data-testid="button-sponsor"
                  >
                    <Heart className="h-4 w-4 mr-2" />
                    Sponsor {animal.name}
                  </Button>
                </div>
              </CardContent>
            </div>
          </Card>

          {(personalityTags.length > 0 || superpowers.length > 0 || revealCards.length > 0) && (
            <section className="mt-7 space-y-5" aria-labelledby="personality-heading">
              <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Beyond the basics</p><h2 id="personality-heading" className="mt-1 text-2xl font-bold">Getting to know {animal.name}</h2></div><PawPrint className="h-7 w-7 text-primary/50" aria-hidden="true" /></div>
              {personalityTags.length > 0 && <div className="flex flex-wrap gap-2">{personalityTags.map((tag) => <Badge key={tag} className="rounded-full bg-primary/10 px-3 py-1 text-primary" variant="secondary">{tag}</Badge>)}</div>}
              {superpowers.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{superpowers.map((power) => <div key={power.key} className="rounded-xl border border-primary/15 bg-card p-4 transition-transform duration-200 hover:-translate-y-0.5"><div className="flex gap-3"><Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h3 className="font-semibold">{power.label}</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{power.explanation}</p></div></div></div>)}</div>}
              {revealCards.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{revealCards.map((card, index) => { const revealed = revealedCards.has(index); return <button type="button" key={`${card.title}-${index}`} onClick={() => setRevealedCards((current) => { const next = new Set(current); next.has(index) ? next.delete(index) : next.add(index); return next; })} className="min-h-32 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-5 text-left transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={revealed}><span className="text-xs font-semibold uppercase tracking-[.15em] text-primary">{revealed ? "A little more" : "Tap to reveal"}</span><h3 className="mt-2 font-semibold">{card.title}</h3>{revealed ? <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{card.body}</p> : <p className="mt-2 text-sm text-muted-foreground">A small clue awaits</p>}</button>; })}</div>}
            </section>
          )}
          <CompatibilityQuiz animal={animal} onApply={handleAdoptClick} />
          <section className="mt-7 rounded-2xl border border-primary/15 bg-primary/[.045] p-5 sm:p-6" aria-labelledby="fit-heading">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 id="fit-heading" className="text-xl font-bold">Who should I meet next?</h2></div><p className="mt-1 text-sm text-muted-foreground">Start with a feeling. We will introduce you to other animals with a similar fit.</p></div><Button type="button" variant="outline" size="sm" onClick={surpriseMe} disabled={isDiscovering}><Dice5 className="h-4 w-4" />Surprise me</Button></div>
            <div className="mt-4 flex flex-wrap gap-2">{traitChoices.map((trait) => <Button key={trait} type="button" size="sm" variant={selectedTrait === trait ? "default" : "outline"} onClick={() => chooseTrait(trait)} aria-pressed={selectedTrait === trait}>{trait}</Button>)}</div>
            {selectedTrait && <div className="mt-5" aria-live="polite">{isDiscovering ? <div className="flex gap-3">{[1, 2].map((item) => <Skeleton key={item} className="h-20 w-40 rounded-xl" />)}</div> : discoveries?.animals?.length ? <div className="grid gap-3 sm:grid-cols-2">{discoveries.animals.slice(0, 4).map((match) => <button type="button" key={match.id} onClick={() => window.location.assign(`${basePath}/animal/${match.id}`)} className="flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="h-12 w-12 overflow-hidden rounded-lg bg-muted">{match.photoUrls?.[0] && <img src={match.photoUrls[0]} alt="" className="h-full w-full object-cover" />}</div><span><strong className="block">{match.name}</strong><span className="text-sm text-muted-foreground">{match.breed}</span></span></button>)}</div> : <p className="text-sm text-muted-foreground">We are still finding the right introductions. Try another trait.</p>}</div>}
          </section>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>
              Interested in adopting? <strong>{rescueName}</strong> would love to hear from you!
            </p>
          </div>
        </div>
      </main>

      <PublicFooter tenant={tenant} basePath={basePath} />

      <PublicAdoptionDialog
        animal={animal}
        open={adoptionDialogOpen}
        onOpenChange={setAdoptionDialogOpen}
      />

      <Dialog open={photoViewerOpen} onOpenChange={setPhotoViewerOpen}>
        <DialogContent
          className="h-[100dvh] w-screen max-w-none border-0 bg-black p-0 text-white shadow-none sm:h-[95dvh] sm:w-[95vw] sm:rounded-lg [&>button]:right-4 [&>button]:top-4 [&>button]:z-20 [&>button]:rounded-full [&>button]:bg-black/70 [&>button]:p-3 [&>button]:text-white [&>button]:opacity-100"
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              prevPhoto();
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              nextPhoto();
            }
          }}
          onTouchStart={(event) => {
            photoTouchStartX.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            handlePhotoTouchEnd(event.changedTouches[0]?.clientX ?? 0);
          }}
          data-testid="animal-photo-viewer"
        >
          <DialogTitle className="sr-only">{animal.name} photo viewer</DialogTitle>
          <div
            className="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden"
            role="group"
            aria-label={`${animal.name}, photo ${currentPhotoIndex + 1} of ${displayPhotoArray.length}`}
            aria-live="polite"
          >
            <img
              src={displayPhotoArray[currentPhotoIndex]}
              alt={`${animal.name}, enlarged photo ${currentPhotoIndex + 1} of ${displayPhotoArray.length}`}
              className="max-h-full max-w-full select-none object-contain"
              decoding="async"
              onError={() => handlePhotoError(displayPhotoArray[currentPhotoIndex])}
              draggable={false}
            />
            {hasMultiplePhotos && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-3 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full bg-black/70 text-white hover:bg-black/90 hover:text-white"
                  onClick={prevPhoto}
                  aria-label={`Show previous photo of ${animal.name}`}
                  data-testid="button-viewer-prev-photo"
                >
                  <ChevronLeft className="h-7 w-7" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-3 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full bg-black/70 text-white hover:bg-black/90 hover:text-white"
                  onClick={nextPhoto}
                  aria-label={`Show next photo of ${animal.name}`}
                  data-testid="button-viewer-next-photo"
                >
                  <ChevronRight className="h-7 w-7" />
                </Button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-sm font-medium">
                  {currentPhotoIndex + 1} / {displayPhotoArray.length}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={donationDialogOpen} onOpenChange={setDonationDialogOpen}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DonationForm
            tenant={tenant}
            sponsoredAnimalName={animal.name}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

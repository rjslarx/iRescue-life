import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useSEO } from "@/hooks/useSEO";
import PublicHeader from "@/components/PublicHeader";
import { PublicAdoptionDialog } from "@/components/PublicAdoptionDialog";
import DonationForm from "@/components/DonationForm";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
} from "lucide-react";
import { SiX } from "react-icons/si";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import type { Animal, Tenant } from "@shared/schema";
import { useTenant } from "@/contexts/TenantContext";

import dogPhoto from '@assets/generated_images/Golden_retriever_dog_portrait_fdeb8a78.png';

export default function PublicAnimalProfilePage() {
  const { animalId } = useParams<{ animalId: string }>();
  const { basePath, tenantId } = useTenant();
  const { toast } = useToast();
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [donationDialogOpen, setDonationDialogOpen] = useState(false);
  const [adoptionDialogOpen, setAdoptionDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const photoArray = animal?.photoUrls && animal.photoUrls.length > 0 
    ? animal.photoUrls 
    : animal?.primaryPhotoUrl 
      ? [animal.primaryPhotoUrl]
      : [dogPhoto];

  const hasMultiplePhotos = photoArray.length > 1;

  const pageTitle = animal 
    ? `Meet ${animal.name} - ${animal.breed} | ${rescueName}`
    : `Animal Profile | ${rescueName}`;
  
  const pageDescription = animal?.bio 
    ? animal.bio.slice(0, 200) + (animal.bio.length > 200 ? '...' : '')
    : animal 
      ? `${animal.name} is a ${animal.age} year old ${animal.breed} looking for a forever home at ${rescueName}.`
      : `Find your perfect companion at ${rescueName}.`;

  const ogImage = photoArray[0] || undefined;

  useSEO({
    title: pageTitle,
    description: pageDescription,
    siteName: rescueName,
    image: ogImage,
    type: 'website',
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
    setCurrentPhotoIndex((prev) => (prev + 1) % photoArray.length);
  };

  const prevPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev - 1 + photoArray.length) % photoArray.length);
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
    <div className="min-h-screen bg-background">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Card className="overflow-hidden">
            <div className="md:flex">
              <div className="relative md:w-1/2">
                <div className="aspect-square relative overflow-hidden">
                  <img
                    src={photoArray[currentPhotoIndex]}
                    alt={animal.name}
                    className="w-full h-full object-cover"
                    data-testid="img-animal-profile"
                  />
                  
                  {hasMultiplePhotos && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full"
                        onClick={prevPhoto}
                        data-testid="button-prev-photo"
                      >
                        <ChevronLeft className="h-6 w-6" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full"
                        onClick={nextPhoto}
                        data-testid="button-next-photo"
                      >
                        <ChevronRight className="h-6 w-6" />
                      </Button>
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                        {photoArray.map((_, index) => (
                          <button
                            key={index}
                            className={`h-2 w-2 rounded-full transition-all ${
                              index === currentPhotoIndex 
                                ? 'bg-white w-4' 
                                : 'bg-white/50'
                            }`}
                            onClick={() => setCurrentPhotoIndex(index)}
                            data-testid={`indicator-photo-${index}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
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
                        <Badge variant="outline">{animal.age} years old</Badge>
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
                  <Button 
                    className="w-full" 
                    size="lg"
                    onClick={() => setAdoptionDialogOpen(true)}
                    data-testid="button-adopt"
                  >
                    Adopt {animal.name}
                  </Button>
                  
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

          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>
              Interested in adopting? <strong>{rescueName}</strong> would love to hear from you!
            </p>
          </div>
        </div>
      </main>

      <Dialog open={adoptionDialogOpen} onOpenChange={setAdoptionDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <PublicAdoptionDialog
            animal={animal}
            onClose={() => setAdoptionDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={donationDialogOpen} onOpenChange={setDonationDialogOpen}>
        <DialogContent className="max-w-md">
          <DonationForm
            animalToSponsor={animal.name}
            onClose={() => {
              setDonationDialogOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Share2, Facebook, MessageCircle, Mail, Link as LinkIcon, Check, Heart, ExternalLink, FileText, PawPrint, ArrowRight } from "lucide-react";
import { SiX } from "react-icons/si";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

function getThumbUrl(url: string): string {
  if (!url || !url.startsWith('/objects/') || url.endsWith('-thumb')) return url;
  return url + '-thumb';
}

interface AnimalCardProps {
  id: string;
  name: string;
  species: string;
  breed: string;
  age: string;
  photo: string;
  photos?: string[];
  bio?: string;
  basePath?: string;
  status?: string;
  useThumbnails?: boolean;
  featuredActions?: boolean;
  onAdopt?: () => void;
  onSponsor?: () => void;
}

export default function AnimalCard({ 
  id,
  name, 
  species, 
  breed, 
  age, 
  photo, 
  photos,
  bio,
  basePath = '',
  status,
  useThumbnails = false,
  featuredActions = false,
  onAdopt,
  onSponsor 
}: AnimalCardProps) {
  const isAdoptionPending = status === 'adoption_pending';
  const isInTrial = status === 'in_trial';
  const isUnavailable = isAdoptionPending || isInTrial;
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [isBioTruncated, setIsBioTruncated] = useState(false);
  const [sponsorDialogOpen, setSponsorDialogOpen] = useState(false);
  const bioRef = useRef<HTMLParagraphElement>(null);
  const { toast } = useToast();
  
  const handleSponsorClick = () => {
    if (onSponsor) {
      onSponsor();
    }
  };

  useEffect(() => {
    if (bioRef.current) {
      setIsBioTruncated(bioRef.current.scrollHeight > bioRef.current.clientHeight);
    }
  }, [bio]);
  
  const rawPhotoArray = photos && photos.length > 0 ? photos : [photo];
  const photoArray = useThumbnails ? rawPhotoArray.map(getThumbUrl) : rawPhotoArray;
  const hasMultiplePhotos = photoArray.length > 1;

  // Auto-rotate photos continuously every 4 seconds when there are multiple photos
  useEffect(() => {
    if (!hasMultiplePhotos) {
      return;
    }

    const interval = setInterval(() => {
      setCurrentPhotoIndex((prev) => (prev + 1) % photoArray.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [hasMultiplePhotos, photoArray.length]);

  // Speed up rotation on hover/interaction
  useEffect(() => {
    if (!isActive || !hasMultiplePhotos) {
      return;
    }

    const interval = setInterval(() => {
      setCurrentPhotoIndex((prev) => (prev + 1) % photoArray.length);
    }, 800);

    return () => clearInterval(interval);
  }, [isActive, hasMultiplePhotos, photoArray.length]);

  const handleImageInteraction = () => {
    if (hasMultiplePhotos) {
      setIsActive(true);
      setTimeout(() => setIsActive(false), 3000);
    }
  };

  const getShareUrl = () => {
    return `${window.location.origin}${basePath}/animal/${id}`;
  };
  const profileUrl = `${basePath}/animal/${id}`;

  const getShareText = () => {
    return `Meet ${name}, a ${age} ${breed} looking for a loving home!`;
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
        url = `mailto:?subject=${encodeURIComponent(`Adopt ${name}`)}&body=${shareText}%20${shareUrl}`;
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
      case 'text':
        navigator.clipboard.writeText(`${getShareText()} ${getShareUrl()}`).then(() => {
          setCopied(true);
          toast({
            title: "Text copied!",
            description: "Share message copied to clipboard",
          });
          setTimeout(() => setCopied(false), 2000);
        });
        return;
    }

    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer,width=600,height=400');
    }
  };

  return (
    <Card className="rounded-[2rem] p-3 w-full h-full flex flex-col hover-elevate" data-testid={`card-animal-${name.toLowerCase().replace(/\s/g, '-')}`}>
      <div 
        className="overflow-hidden bg-muted relative aspect-[4/3] rounded-[1.5rem]"
        onMouseEnter={() => setIsActive(true)}
        onMouseLeave={() => setIsActive(false)}
        onTouchStart={handleImageInteraction}
        onClick={handleImageInteraction}
      >
        <img 
          src={photoArray[currentPhotoIndex]} 
          alt={name}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover object-center transition-opacity duration-500"
          onError={(e) => {
            const target = e.currentTarget;
            const src = target.src;
            if (src.endsWith('-thumb')) {
              target.src = src.slice(0, -6);
            }
          }}
          data-testid={`img-animal-${name.toLowerCase().replace(/\s/g, '-')}`}
        />
        {hasMultiplePhotos && (
          <div className="absolute bottom-3 right-3 flex gap-1.5" data-testid="photo-indicators">
            {photoArray.map((_, index) => (
              <div
                key={index}
                className={`h-2 rounded-full transition-all ${
                  index === currentPhotoIndex 
                    ? 'bg-white w-5' 
                    : 'bg-white/50 w-2'
                }`}
                data-testid={`indicator-${index}`}
              />
            ))}
          </div>
        )}
      </div>
      <CardContent className="px-4 pt-5 pb-2 space-y-3 flex-1 text-center">
        <div className="space-y-1.5">
          <h3 className="font-display text-2xl font-bold" data-testid={`text-animal-name-${name.toLowerCase().replace(/\s/g, '-')}`}>
            <a href={profileUrl} className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
              {name}
            </a>
          </h3>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground font-medium uppercase tracking-wider">
            <span>{breed}</span>
            <span>·</span>
            <span>{age}</span>
          </div>
          <div className="flex justify-center gap-1.5 pt-1">
            <Badge variant="secondary">
              {species}
            </Badge>
            {isAdoptionPending && (
              <Badge className="bg-amber-500 text-white">Pending</Badge>
            )}
            {isInTrial && (
              <Badge className="bg-blue-500 text-white">In Trial</Badge>
            )}
          </div>
        </div>
        {bio && (
          <div className="space-y-1">
            <p 
              ref={bioRef}
              className={`text-sm leading-relaxed text-muted-foreground ${bioExpanded ? '' : 'line-clamp-2'}`}
            >
              {bio}
            </p>
            {(isBioTruncated || bioExpanded) && (
              <button
                onClick={() => setBioExpanded(!bioExpanded)}
                className="text-sm font-medium text-muted-foreground hover:underline"
                data-testid="button-read-more"
              >
                {bioExpanded ? 'Read less' : 'Read more'}
              </button>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className={`flex flex-col px-4 pb-4 pt-1 mt-auto ${featuredActions ? 'gap-3' : 'gap-2'}`}>
        <Button
          variant="ghost"
          className={featuredActions
            ? "group w-full gap-2 rounded-xl text-base font-semibold text-foreground hover:bg-primary/5 hover:text-primary"
            : "w-full"
          }
          asChild
        >
          <a href={profileUrl} data-testid="button-view-profile">
            {featuredActions && <PawPrint className="h-4 w-4 text-primary/70" aria-hidden="true" />}
            View Profile
            {featuredActions
              ? <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              : <ExternalLink className="h-4 w-4 ml-2" aria-hidden="true" />
            }
          </a>
        </Button>
        <div className={featuredActions ? "contents" : "flex gap-2 w-full"}>
          {isUnavailable ? (
            <Button 
              className={featuredActions ? "h-12 w-full rounded-xl text-base font-semibold" : "flex-1"}
              variant="secondary"
              disabled
              data-testid="button-adopt-disabled"
            >
              {isInTrial ? 'In Trial' : 'Adoption Pending'}
            </Button>
          ) : (
            <Button 
              className={featuredActions
                ? "h-12 w-full rounded-xl text-base font-bold shadow-sm transition-transform hover:-translate-y-0.5"
                : "flex-1"
              }
              onClick={onAdopt}
              data-testid="button-adopt"
            >
              Adopt Me
              {featuredActions && <Heart className="ml-2 h-5 w-5" aria-hidden="true" />}
            </Button>
          )}
          {featuredActions && (
            <div className="grid w-full grid-cols-2 gap-2">
              {onSponsor && (
                <Button 
                  variant="outline"
                  className="h-11 min-w-0 rounded-xl border-primary/25 px-2 font-semibold text-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                  onClick={handleSponsorClick}
                  data-testid="button-sponsor"
                >
                  <Heart className="mr-1.5 h-4 w-4 shrink-0 text-primary/75" aria-hidden="true" />
                  <span className="truncate">Sponsor {name}</span>
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-11 rounded-xl border-primary/15 font-semibold text-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                    data-testid="button-share"
                  >
                    {copied ? <Check className="mr-1.5 h-4 w-4 text-primary" /> : <Share2 className="mr-1.5 h-4 w-4 text-primary/75" />}
                    Share
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
                  <DropdownMenuItem onClick={() => handleShare('text')} data-testid="share-text">
                    <FileText className="h-4 w-4 mr-2" />
                    Copy as Text
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          {!featuredActions && (
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
              <DropdownMenuItem onClick={() => handleShare('text')} data-testid="share-text">
                <FileText className="h-4 w-4 mr-2" />
                Copy as Text
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>
        
        {onSponsor && !featuredActions && (
          <Button 
            variant="outline"
            className="w-full"
            onClick={handleSponsorClick}
            data-testid="button-sponsor"
          >
            <Heart className="h-4 w-4 mr-2" />
            Sponsor {name}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

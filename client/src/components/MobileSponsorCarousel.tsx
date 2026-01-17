import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";

interface Sponsor {
  id: string;
  imageUrl: string;
  altText: string;
  linkUrl?: string;
}

interface MobileSponsorCarouselProps {
  sponsors: Sponsor[];
}

export default function MobileSponsorCarousel({ sponsors }: MobileSponsorCarouselProps) {
  const hasMultipleSponsors = sponsors.length > 1;
  
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      align: "center",
      loop: hasMultipleSponsors,
      skipSnaps: false,
    },
    hasMultipleSponsors
      ? [
          Autoplay({
            delay: 3000,
            stopOnInteraction: false,
            stopOnMouseEnter: true,
          }),
        ]
      : []
  );
  const [selectedIndex, setSelectedIndex] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  if (sponsors.length === 0) {
    return null;
  }

  const renderSponsor = (sponsor: Sponsor) => {
    const img = (
      <img
        src={sponsor.imageUrl}
        alt={sponsor.altText}
        className="h-12 w-auto object-contain max-w-[150px]"
      />
    );

    if (sponsor.linkUrl) {
      return (
        <a
          href={sponsor.linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="grayscale opacity-70"
          data-testid={`link-sponsor-${sponsor.id}`}
        >
          {img}
        </a>
      );
    }

    return (
      <div
        className="grayscale opacity-70"
        data-testid={`img-sponsor-${sponsor.id}`}
      >
        {img}
      </div>
    );
  };

  return (
    <div className="relative w-full" data-testid="mobile-sponsor-carousel">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex touch-pan-y items-center">
          {sponsors.map((sponsor) => (
            <div
              key={sponsor.id}
              className="flex-[0_0_50%] min-w-0 px-3 flex justify-center items-center"
            >
              {renderSponsor(sponsor)}
            </div>
          ))}
        </div>
      </div>

      {sponsors.length > 2 && (
        <div className="flex justify-center gap-1.5 mt-3" data-testid="sponsor-carousel-dots">
          {sponsors.map((_, index) => (
            <button
              key={index}
              onClick={() => emblaApi?.scrollTo(index)}
              className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                index === selectedIndex
                  ? "bg-primary w-3"
                  : "bg-muted-foreground/30"
              }`}
              aria-label={`Go to sponsor ${index + 1}`}
              data-testid={`sponsor-dot-${index}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

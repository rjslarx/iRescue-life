import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import AnimalCard from "@/components/AnimalCard";
import type { Animal } from "@shared/schema";

interface MobileAnimalCarouselProps {
  animals: Animal[];
  basePath: string;
  onAdopt: (animal: Animal) => void;
  onSponsor: (animalName: string) => void;
  defaultPhoto: string;
}

export default function MobileAnimalCarousel({
  animals,
  basePath,
  onAdopt,
  onSponsor,
  defaultPhoto,
}: MobileAnimalCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "center",
    loop: animals.length > 1,
    skipSnaps: false,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  const scrollTo = useCallback(
    (index: number) => {
      if (emblaApi) emblaApi.scrollTo(index);
    },
    [emblaApi]
  );

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
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

  if (animals.length === 0) {
    return null;
  }

  return (
    <div className="relative w-full" data-testid="mobile-animal-carousel">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex touch-pan-y">
          {animals.map((animal) => (
            <div
              key={animal.id}
              className="flex-[0_0_100%] min-w-0 px-2"
            >
              <AnimalCard
                id={animal.id.toString()}
                name={animal.name}
                species={animal.species}
                breed={animal.breed}
                age={`${animal.age} years`}
                photo={animal.photoUrls?.[0] ?? defaultPhoto}
                photos={animal.photoUrls && animal.photoUrls.length > 0 ? animal.photoUrls : undefined}
                bio={animal.bio ?? undefined}
                basePath={basePath}
                onAdopt={() => onAdopt(animal)}
                onSponsor={() => onSponsor(animal.name)}
              />
            </div>
          ))}
        </div>
      </div>

      {animals.length > 1 && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-background/80 backdrop-blur-sm shadow-md"
            onClick={scrollPrev}
            disabled={!canScrollPrev && !animals.length}
            data-testid="carousel-prev"
            aria-label="Previous animal"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-background/80 backdrop-blur-sm shadow-md"
            onClick={scrollNext}
            disabled={!canScrollNext && !animals.length}
            data-testid="carousel-next"
            aria-label="Next animal"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>

          <div className="flex justify-center gap-2 mt-4" data-testid="carousel-dots">
            {animals.map((_, index) => (
              <button
                key={index}
                onClick={() => scrollTo(index)}
                className={`w-2 h-2 rounded-full transition-all duration-200 ${
                  index === selectedIndex
                    ? "bg-primary w-4"
                    : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
                aria-label={`Go to animal ${index + 1}`}
                data-testid={`carousel-dot-${index}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

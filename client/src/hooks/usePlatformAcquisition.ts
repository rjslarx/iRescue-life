import { useEffect, useRef } from "react";
import type { MouseEvent } from "react";
import { trackPlatformCtaClick, trackPlatformEvent } from "@/lib/platformAnalytics";

export function usePlatformAcquisition(location: "landing" | "pricing") {
  const pricingRef = useRef<HTMLElement | null>(null);
  const viewed = useRef(false);
  useEffect(() => {
    const element = pricingRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      if (!viewed.current && entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.1)) {
        viewed.current = true;
        trackPlatformEvent("platform_pricing_view", { location });
        observer.disconnect();
      }
    }, { threshold: 0.1 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [location]);

  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (!(event.target instanceof Element)) return;
    trackPlatformCtaClick(event.target, location);
  };
  return { pricingRef, onClickCapture };
}

import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { isSensitiveVolunteerTrainingUrl } from '@shared/sensitive-routes';

declare global {
  interface Window {
    gtag?: (command: string, targetId: string, config?: Record<string, any>) => void;
  }
}

export function usePageTracking() {
  const [location] = useLocation();

  useEffect(() => {
    if (isSensitiveVolunteerTrainingUrl(location)) return;
    if (typeof window.gtag !== 'undefined') {
      window.gtag('config', 'G-W9DLZZFSFX', {
        page_path: location,
      });
    }
  }, [location]);
}

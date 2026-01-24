import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';

type PageType = 'home' | 'animals' | 'animal_profile' | 'donate' | 'wishlist' | 'foster' | 'volunteer' | 'surrender' | 'contact' | 'shop' | 'campaign' | 'custom' | 'other';

const getVisitorId = (): string => {
  const key = 'irescue_visitor_id';
  let visitorId = localStorage.getItem(key);
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem(key, visitorId);
  }
  return visitorId;
};

const getSessionId = (): string => {
  const key = 'irescue_session_id';
  let sessionId = sessionStorage.getItem(key);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(key, sessionId);
  }
  return sessionId;
};

const pathToPageType = (path: string): PageType => {
  if (path === '/' || path === '') return 'home';
  if (path.startsWith('/animals/')) return 'animal_profile';
  if (path === '/animals') return 'animals';
  if (path === '/donate' || path === '/give') return 'donate';
  if (path === '/wishlist') return 'wishlist';
  if (path === '/foster' || path.startsWith('/foster')) return 'foster';
  if (path === '/volunteer' || path.startsWith('/volunteer')) return 'volunteer';
  if (path === '/surrender' || path.startsWith('/surrender')) return 'surrender';
  if (path === '/contact') return 'contact';
  if (path === '/shop' || path.startsWith('/shop')) return 'shop';
  if (path.startsWith('/campaign/')) return 'campaign';
  if (path.startsWith('/page/')) return 'custom';
  return 'other';
};

export function useVisitTracking() {
  const [location] = useLocation();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    const excludedPaths = [
      '/dashboard',
      '/login',
      '/platform',
      '/reset-password',
      '/forgot-password',
      '/accept-invitation',
      '/api',
    ];
    
    if (excludedPaths.some(path => location.startsWith(path))) {
      return;
    }

    if (lastTrackedPath.current === location) {
      return;
    }

    lastTrackedPath.current = location;

    const trackVisit = async () => {
      try {
        await apiRequest('POST', '/api/page-visits', {
          pagePath: location,
          pageType: pathToPageType(location),
          visitorId: getVisitorId(),
          sessionId: getSessionId(),
          referrer: document.referrer || null,
        });
      } catch (error) {
      }
    };

    const timeoutId = setTimeout(trackVisit, 500);
    return () => clearTimeout(timeoutId);
  }, [location]);
}

export function trackPageVisit(path: string, pageType?: PageType) {
  const actualPageType = pageType || pathToPageType(path);
  
  apiRequest('POST', '/api/page-visits', {
    pagePath: path,
    pageType: actualPageType,
    visitorId: getVisitorId(),
    sessionId: getSessionId(),
    referrer: document.referrer || null,
  }).catch(() => {});
}

import { useEffect, useRef } from 'react';

export interface SEOConfig {
  title: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  siteName?: string;
}

const SEO_OWNER_ATTR = 'data-seo-owner';
let instanceCounter = 0;

export function useSEO(config: SEOConfig) {
  const instanceIdRef = useRef<string>('');
  
  useEffect(() => {
    const { title, description, image, url, type = 'website', siteName } = config;

    instanceCounter += 1;
    const currentInstanceId = `seo-${instanceCounter}`;
    instanceIdRef.current = currentInstanceId;

    const originalTitle = document.title;
    document.title = title;

    const currentUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
    const defaultImage = typeof window !== 'undefined' 
      ? `${window.location.origin}/icon-512.png` 
      : '/icon-512.png';

    const metaTags = [
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: currentUrl },
      { property: 'og:image', content: image || defaultImage },
      { property: 'og:type', content: type },
      { property: 'og:site_name', content: siteName },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: image || defaultImage },
      { name: 'twitter:url', content: currentUrl },
    ];

    const allPossibleMetaSelectors = [
      'meta[name="description"]',
      'meta[property="og:title"]',
      'meta[property="og:description"]',
      'meta[property="og:url"]',
      'meta[property="og:image"]',
      'meta[property="og:type"]',
      'meta[property="og:site_name"]',
      'meta[name="twitter:card"]',
      'meta[name="twitter:title"]',
      'meta[name="twitter:description"]',
      'meta[name="twitter:image"]',
      'meta[name="twitter:url"]',
    ];

    allPossibleMetaSelectors.forEach(selector => {
      const existingElement = document.querySelector(selector) as HTMLMetaElement;
      if (existingElement && existingElement.getAttribute(SEO_OWNER_ATTR)) {
        existingElement.remove();
      }
    });

    metaTags.forEach(({ name, property, content }) => {
      if (!content) return;

      const attribute = property ? 'property' : 'name';
      const value = property || name;
      
      let element = document.querySelector(`meta[${attribute}="${value}"]`) as HTMLMetaElement;
      
      if (element) {
        element.setAttribute('content', content);
        element.setAttribute(SEO_OWNER_ATTR, currentInstanceId);
      } else {
        element = document.createElement('meta');
        element.setAttribute(attribute, value);
        element.setAttribute('content', content);
        element.setAttribute(SEO_OWNER_ATTR, currentInstanceId);
        document.head.appendChild(element);
      }
    });

    return () => {
      document.title = originalTitle;
      
      const ownedElements = document.querySelectorAll(`meta[${SEO_OWNER_ATTR}="${currentInstanceId}"]`);
      ownedElements.forEach(el => el.remove());
    };
  }, [config.title, config.description, config.image, config.url, config.type, config.siteName]);
}

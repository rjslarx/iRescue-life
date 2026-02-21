import { useEffect } from 'react';
import { useTenant } from '@/contexts/TenantContext';

interface BrandingColors {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  successColor?: string;
  warningColor?: string;
  destructiveColor?: string;
}

function hexToHSL(hex: string): { h: number; s: number; l: number } | null {
  if (!hex || !hex.startsWith('#')) return null;
  
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function toHSLString(hsl: { h: number; s: number; l: number }): string {
  return `${hsl.h} ${hsl.s}% ${hsl.l}%`;
}

function adjustLightness(hsl: { h: number; s: number; l: number }, lightness: number): { h: number; s: number; l: number } {
  return { ...hsl, l: Math.max(0, Math.min(100, lightness)) };
}

function generateForegroundColor(hsl: { h: number; s: number; l: number }): { h: number; s: number; l: number } {
  return hsl.l > 50 
    ? { h: hsl.h, s: Math.max(0, hsl.s - 20), l: 10 }
    : { h: hsl.h, s: Math.max(0, hsl.s - 20), l: 98 };
}

export function useTenantBranding() {
  const { tenant } = useTenant();

  useEffect(() => {
    if (!tenant) return;

    const branding = tenant.branding as BrandingColors | null;
    if (!branding) return;

    const root = document.documentElement;

    if (branding.primaryColor) {
      const hsl = hexToHSL(branding.primaryColor);
      if (hsl) {
        root.style.setProperty('--primary', toHSLString(hsl));
        root.style.setProperty('--primary-foreground', toHSLString(generateForegroundColor(hsl)));
      }
    }

    if (branding.secondaryColor) {
      const hsl = hexToHSL(branding.secondaryColor);
      if (hsl) {
        root.style.setProperty('--secondary', toHSLString(hsl));
        root.style.setProperty('--secondary-foreground', toHSLString(generateForegroundColor(hsl)));
      }
    }

    if (branding.accentColor) {
      const hsl = hexToHSL(branding.accentColor);
      if (hsl) {
        root.style.setProperty('--accent', toHSLString(hsl));
        root.style.setProperty('--accent-foreground', toHSLString(generateForegroundColor(hsl)));
      }
    }

    if (branding.successColor) {
      const hsl = hexToHSL(branding.successColor);
      if (hsl) {
        root.style.setProperty('--success', toHSLString(hsl));
        root.style.setProperty('--success-foreground', toHSLString(generateForegroundColor(hsl)));
      }
    }

    if (branding.warningColor) {
      const hsl = hexToHSL(branding.warningColor);
      if (hsl) {
        root.style.setProperty('--warning', toHSLString(hsl));
        root.style.setProperty('--warning-foreground', toHSLString(generateForegroundColor(hsl)));
      }
    }

    if (branding.destructiveColor) {
      const hsl = hexToHSL(branding.destructiveColor);
      if (hsl) {
        root.style.setProperty('--destructive', toHSLString(hsl));
        root.style.setProperty('--destructive-foreground', toHSLString(generateForegroundColor(hsl)));
      }
    }

    return () => {
      root.style.removeProperty('--primary');
      root.style.removeProperty('--primary-foreground');
      root.style.removeProperty('--secondary');
      root.style.removeProperty('--secondary-foreground');
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-foreground');
      root.style.removeProperty('--success');
      root.style.removeProperty('--success-foreground');
      root.style.removeProperty('--warning');
      root.style.removeProperty('--warning-foreground');
      root.style.removeProperty('--destructive');
      root.style.removeProperty('--destructive-foreground');
    };
  }, [tenant?.branding]);
}

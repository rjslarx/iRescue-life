export interface VendingProduct {
  code: string;        // e.g., 'A1'
  id: string;
  name: string;
  priceCents: number;
  impactNote: string;  // Shown in LCD & receipt
  badgeColor: string;
  imageUrl: string;    // Crisp product photo or stylized SVG/icon fallback
}

declare global {
  interface Window {
    VENDING_INVENTORY?: VendingProduct[];
  }
}

export const DEFAULT_INVENTORY: VendingProduct[] = [
  { code: 'A1', id: 'treats', name: 'Peanut Butter Treats', priceCents: 500, impactNote: 'Training rewards', badgeColor: '#f59e0b', imageUrl: '' },
  { code: 'A2', id: 'toy', name: 'Squeaky Plush Toy', priceCents: 800, impactNote: 'Kennel enrichment', badgeColor: '#ec4899', imageUrl: '' },
  { code: 'B1', id: 'shampoo', name: 'Oatmeal Dog Shampoo', priceCents: 1200, impactNote: 'Soothing intake baths', badgeColor: '#06b6d4', imageUrl: '' },
  { code: 'B2', id: 'hay', name: 'Sanctuary Hay Bale', priceCents: 1500, impactNote: 'Feed for rescue horses', badgeColor: '#84cc16', imageUrl: '' },
  { code: 'C1', id: 'flea', name: 'Flea & Tick Chew', priceCents: 1800, impactNote: 'Parasite prevention support', badgeColor: '#8b5cf6', imageUrl: '' },
  { code: 'C2', id: 'microchip', name: 'Microchip & ID Tag', priceCents: 2000, impactNote: 'Lost-pet protection', badgeColor: '#3b82f6', imageUrl: '' },
  { code: 'D1', id: 'heartworm', name: 'Heartworm Prevention', priceCents: 2500, impactNote: 'Preventative care support', badgeColor: '#ef4444', imageUrl: '' },
  { code: 'D2', id: 'kibble', name: '30lb Bag of Kibble', priceCents: 3500, impactNote: 'Food for foster dogs', badgeColor: '#10b981', imageUrl: '' }
];

/**
 * Sanitizes markdown-wrapped URLs like "[https://...](https://...)" if passed by external config.
 */
export function sanitizeImageUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  const markdownMatch = trimmed.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (markdownMatch) {
    return markdownMatch[2].trim();
  }
  return trimmed;
}

/**
 * Returns the active inventory, checking `window.VENDING_INVENTORY` first.
 */
export function getActiveInventory(): VendingProduct[] {
  const source =
    typeof window !== 'undefined' &&
    Array.isArray(window.VENDING_INVENTORY)
      ? window.VENDING_INVENTORY
      : DEFAULT_INVENTORY;

  return source.map((item) => ({
    ...item,
    code: String(item.code).toUpperCase().trim(),
    imageUrl: sanitizeImageUrl(item.imageUrl)
  }));
}

/**
 * Crisp custom SVG product illustrations used as automatic fallbacks if external images fail to load.
 */
const SVG_ILLUSTRATIONS: Record<string, string> = {
  treats: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="bg-treats" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#451a03"/>
        <stop offset="100%" stop-color="#78350f"/>
      </linearGradient>
      <linearGradient id="bag-treats" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fbbf24"/>
        <stop offset="100%" stop-color="#d97706"/>
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="22" fill="url(#bg-treats)"/>
    <circle cx="80" cy="80" r="58" fill="#f59e0b" opacity="0.14"/>
    <!-- Pouch -->
    <path d="M44 34 H116 L122 132 Q122 140 112 140 H48 Q38 140 38 132 Z" fill="url(#bag-treats)" stroke="#fde68a" stroke-width="3"/>
    <path d="M42 34 Q80 26 118 34 L116 44 H44 Z" fill="#b45309"/>
    <rect x="48" y="54" width="64" height="36" rx="8" fill="#fffbeb"/>
    <text x="80" y="70" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="11" fill="#92400e">PEANUT</text>
    <text x="80" y="83" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="10" fill="#d97706">TREATS</text>
    <!-- Bone biscuit icon -->
    <g transform="translate(80, 114) rotate(-8)">
      <circle cx="-18" cy="-6" r="7" fill="#fef3c7" stroke="#92400e" stroke-width="2"/>
      <circle cx="-18" cy="6" r="7" fill="#fef3c7" stroke="#92400e" stroke-width="2"/>
      <circle cx="18" cy="-6" r="7" fill="#fef3c7" stroke="#92400e" stroke-width="2"/>
      <circle cx="18" cy="6" r="7" fill="#fef3c7" stroke="#92400e" stroke-width="2"/>
      <rect x="-18" y="-5" width="36" height="10" fill="#fef3c7"/>
      <line x1="-14" y1="-5" x2="14" y2="-5" stroke="#92400e" stroke-width="2"/>
      <line x1="-14" y1="5" x2="14" y2="5" stroke="#92400e" stroke-width="2"/>
    </g>
  </svg>`,

  toy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="bg-toy" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#500724"/>
        <stop offset="100%" stop-color="#831843"/>
      </linearGradient>
      <radialGradient id="plush-grad" cx="0.4" cy="0.35" r="0.65">
        <stop offset="0%" stop-color="#f472b6"/>
        <stop offset="100%" stop-color="#db2777"/>
      </radialGradient>
    </defs>
    <rect width="160" height="160" rx="22" fill="url(#bg-toy)"/>
    <circle cx="80" cy="82" r="56" fill="#ec4899" opacity="0.16"/>
    <!-- Squeaky wave lines -->
    <path d="M26 48 Q20 38 30 32" stroke="#fbcfe8" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M134 48 Q140 38 130 32" stroke="#fbcfe8" stroke-width="3" fill="none" stroke-linecap="round"/>
    <!-- Plush Bear / Pup -->
    <circle cx="52" cy="48" r="16" fill="url(#plush-grad)" stroke="#fbcfe8" stroke-width="2.5"/>
    <circle cx="52" cy="48" r="8" fill="#fce7f3"/>
    <circle cx="108" cy="48" r="16" fill="url(#plush-grad)" stroke="#fbcfe8" stroke-width="2.5"/>
    <circle cx="108" cy="48" r="8" fill="#fce7f3"/>
    <ellipse cx="80" cy="115" rx="30" ry="24" fill="url(#plush-grad)" stroke="#fbcfe8" stroke-width="2.5"/>
    <ellipse cx="80" cy="116" rx="16" ry="13" fill="#fce7f3"/>
    <!-- Stitch marks -->
    <path d="M80 104 V128 M75 112 H85 M75 120 H85" stroke="#be185d" stroke-width="2" stroke-linecap="round"/>
    <circle cx="80" cy="76" r="32" fill="url(#plush-grad)" stroke="#fbcfe8" stroke-width="2.5"/>
    <ellipse cx="80" cy="83" rx="14" ry="10" fill="#fce7f3"/>
    <circle cx="68" cy="70" r="4.5" fill="#1f2937"/>
    <circle cx="66.5" cy="68.5" r="1.5" fill="#ffffff"/>
    <circle cx="92" cy="70" r="4.5" fill="#1f2937"/>
    <circle cx="90.5" cy="68.5" r="1.5" fill="#ffffff"/>
    <ellipse cx="80" cy="80" rx="5" ry="3.5" fill="#831843"/>
  </svg>`,

  shampoo: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="bg-shampoo" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#083344"/>
        <stop offset="100%" stop-color="#155e75"/>
      </linearGradient>
      <linearGradient id="bottle-grad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#22d3ee"/>
        <stop offset="50%" stop-color="#67e8f9"/>
        <stop offset="100%" stop-color="#0891b2"/>
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="22" fill="url(#bg-shampoo)"/>
    <!-- Bubbles -->
    <circle cx="38" cy="52" r="10" fill="#cffafe" opacity="0.35" stroke="#a5f3fc" stroke-width="1.5"/>
    <circle cx="124" cy="68" r="13" fill="#cffafe" opacity="0.35" stroke="#a5f3fc" stroke-width="1.5"/>
    <circle cx="118" cy="40" r="7" fill="#cffafe" opacity="0.45" stroke="#a5f3fc" stroke-width="1.5"/>
    <!-- Pump top -->
    <rect x="74" y="22" width="12" height="16" rx="3" fill="#e2e8f0"/>
    <path d="M68 24 H98 Q104 24 106 30 L102 32 H68 Z" fill="#f8fafc"/>
    <rect x="66" y="36" width="28" height="10" rx="4" fill="#0284c7" stroke="#bae6fd" stroke-width="2"/>
    <!-- Bottle body -->
    <rect x="48" y="46" width="64" height="94" rx="18" fill="url(#bottle-grad)" stroke="#cffafe" stroke-width="3"/>
    <rect x="55" y="66" width="50" height="54" rx="8" fill="#f0fdff"/>
    <!-- Paw droplet -->
    <circle cx="80" cy="86" r="6" fill="#0891b2"/>
    <circle cx="71" cy="78" r="3" fill="#0891b2"/>
    <circle cx="77" cy="75" r="3" fill="#0891b2"/>
    <circle cx="83" cy="75" r="3" fill="#0891b2"/>
    <circle cx="89" cy="78" r="3" fill="#0891b2"/>
    <text x="80" y="109" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="9.5" fill="#0e7490">OATMEAL</text>
    <text x="80" y="117" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="700" font-size="7.5" fill="#0284c7">WASH</text>
  </svg>`,

  hay: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="bg-hay" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#1a2e05"/>
        <stop offset="100%" stop-color="#365314"/>
      </linearGradient>
      <linearGradient id="bale-front" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#bef264"/>
        <stop offset="50%" stop-color="#84cc16"/>
        <stop offset="100%" stop-color="#65a30d"/>
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="22" fill="url(#bg-hay)"/>
    <!-- 3D Hay Bale -->
    <polygon points="30,66 56,44 134,44 108,66" fill="#d9f99d" stroke="#ecfccb" stroke-width="2"/>
    <polygon points="108,66 134,44 134,112 108,130" fill="#4d7c0f" stroke="#ecfccb" stroke-width="2"/>
    <rect x="30" y="66" width="78" height="64" rx="4" fill="url(#bale-front)" stroke="#ecfccb" stroke-width="2.5"/>
    <!-- Twine straps -->
    <line x1="52" y1="66" x2="52" y2="130" stroke="#b45309" stroke-width="4"/>
    <line x1="52" y1="66" x2="78" y2="44" stroke="#d97706" stroke-width="3.5"/>
    <line x1="86" y1="66" x2="86" y2="130" stroke="#b45309" stroke-width="4"/>
    <line x1="86" y1="66" x2="112" y2="44" stroke="#d97706" stroke-width="3.5"/>
    <!-- Straw texture details -->
    <path d="M36 80 H46 M60 92 H78 M38 112 H48 M92 84 H102 M62 116 H76" stroke="#fef08a" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="44" y="84" width="50" height="22" rx="5" fill="#1a2e05" opacity="0.82"/>
    <text x="69" y="99" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="11" fill="#ecfccb">FRESH HAY</text>
  </svg>`,

  flea: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="bg-flea" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#2e1065"/>
        <stop offset="100%" stop-color="#4c1d95"/>
      </linearGradient>
      <linearGradient id="shield-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#a78bfa"/>
        <stop offset="100%" stop-color="#7c3aed"/>
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="22" fill="url(#bg-flea)"/>
    <!-- Box & Shield -->
    <rect x="32" y="42" width="96" height="82" rx="12" fill="url(#shield-grad)" stroke="#ddd6fe" stroke-width="3"/>
    <rect x="32" y="42" width="96" height="22" rx="10" fill="#5b21b6"/>
    <text x="80" y="57" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="10" fill="#ede9fe">30-DAY SHIELD</text>
    <!-- Protection Shield Emblem -->
    <path d="M64 72 L80 65 L96 72 V90 C96 103 80 113 80 113 C80 113 64 103 64 90 Z" fill="#f5f3ff" stroke="#4c1d95" stroke-width="2.5"/>
    <path d="M73 89 L78 94 L88 82" fill="none" stroke="#10b981" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <!-- Chew tablet -->
    <ellipse cx="112" cy="116" rx="16" ry="11" fill="#b45309" stroke="#fef3c7" stroke-width="2.5"/>
    <ellipse cx="112" cy="113" rx="12" ry="7" fill="#d97706"/>
  </svg>`,

  microchip: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="bg-chip" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#172554"/>
        <stop offset="100%" stop-color="#1d4ed8"/>
      </linearGradient>
      <linearGradient id="tag-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#60a5fa"/>
        <stop offset="100%" stop-color="#2563eb"/>
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="22" fill="url(#bg-chip)"/>
    <!-- Signal waves -->
    <path d="M46 42 A48 48 0 0 1 114 42" fill="none" stroke="#93c5fd" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="4 4"/>
    <path d="M56 50 A34 34 0 0 1 104 50" fill="none" stroke="#bfdbfe" stroke-width="2.5" stroke-linecap="round"/>
    <!-- Keyring -->
    <circle cx="80" cy="48" r="10" fill="none" stroke="#e2e8f0" stroke-width="4"/>
    <!-- Heart / Round ID Tag -->
    <circle cx="80" cy="95" r="38" fill="url(#tag-grad)" stroke="#dbeafe" stroke-width="3.5"/>
    <circle cx="80" cy="64" r="4" fill="#1e3a8a"/>
    <!-- Microchip circuit icon inside tag -->
    <rect x="64" y="79" width="32" height="32" rx="6" fill="#eff6ff" stroke="#1e40af" stroke-width="2"/>
    <rect x="72" y="87" width="16" height="16" rx="3" fill="#fbbf24" stroke="#b45309" stroke-width="1.5"/>
    <path d="M60 85 H64 M60 95 H64 M60 105 H64 M96 85 H100 M96 95 H100 M96 105 H100 M70 75 V79 M80 75 V79 M90 75 V79 M70 111 V115 M80 111 V115 M90 111 V115" stroke="#dbeafe" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,

  heartworm: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="bg-heart" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#450a0a"/>
        <stop offset="100%" stop-color="#991b1b"/>
      </linearGradient>
      <linearGradient id="heart-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f87171"/>
        <stop offset="100%" stop-color="#dc2626"/>
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="22" fill="url(#bg-heart)"/>
    <!-- Medical Box -->
    <rect x="34" y="36" width="92" height="90" rx="14" fill="#fef2f2" stroke="#fecaca" stroke-width="3"/>
    <rect x="34" y="36" width="92" height="24" rx="12" fill="#dc2626"/>
    <text x="80" y="52" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="10" fill="#ffffff">HEARTCARE RX</text>
    <!-- Glowing Heart + Cross -->
    <path d="M80 114 C80 114 52 96 52 78 C52 68 60 62 68 62 C74 62 78 66 80 70 C82 66 86 62 92 62 C100 62 108 68 108 78 C108 96 80 114 80 114 Z" fill="url(#heart-grad)" stroke="#b91c1c" stroke-width="2"/>
    <rect x="76" y="74" width="8" height="22" rx="2" fill="#ffffff"/>
    <rect x="69" y="81" width="22" height="8" rx="2" fill="#ffffff"/>
  </svg>`,

  kibble: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="bg-kibble" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#064e3b"/>
        <stop offset="100%" stop-color="#047857"/>
      </linearGradient>
      <linearGradient id="sack-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#34d399"/>
        <stop offset="100%" stop-color="#059669"/>
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="22" fill="url(#bg-kibble)"/>
    <!-- Heavy 30lb Kibble Sack -->
    <path d="M40 28 L120 28 L126 132 Q126 140 116 140 H44 Q34 140 34 132 Z" fill="url(#sack-grad)" stroke="#a7f3d0" stroke-width="3"/>
    <path d="M38 28 L44 36 H116 L122 28 Z" fill="#065f46" stroke="#a7f3d0" stroke-width="2"/>
    <rect x="46" y="48" width="68" height="44" rx="8" fill="#ecfdf5"/>
    <text x="80" y="65" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="12" fill="#065f46">30LB KIBBLE</text>
    <text x="80" y="80" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="9" fill="#059669">SHELTER CHOW</text>
    <!-- Bowl of Kibble at bottom -->
    <circle cx="68" cy="112" r="5" fill="#78350f"/>
    <circle cx="76" cy="109" r="5.5" fill="#92400e"/>
    <circle cx="84" cy="110" r="5" fill="#78350f"/>
    <circle cx="91" cy="113" r="5" fill="#92400e"/>
    <path d="M56 114 H104 L110 128 Q110 132 102 132 H58 Q50 132 50 128 Z" fill="#fbbf24" stroke="#fffbeb" stroke-width="2"/>
  </svg>`
};

/**
 * Generates a data:image/svg+xml URI for any product as a guaranteed crisp fallback.
 */
export function getFallbackSvgDataUri(product: VendingProduct): string {
  const key = product.id.toLowerCase();
  const knownSvg = SVG_ILLUSTRATIONS[key];
  if (knownSvg) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(knownSvg)}`;
  }

  // Dynamic fallback SVG for custom overridden products
  const safeName = product.name.replace(/[<>&"']/g, '').slice(0, 16).toUpperCase();
  const safeCode = product.code.replace(/[<>&"']/g, '').slice(0, 4);
  const color = product.badgeColor || '#38bdf8';
  const genericSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <rect width="160" height="160" rx="22" fill="#1e293b"/>
    <circle cx="80" cy="74" r="44" fill="${color}" opacity="0.22"/>
    <rect x="36" y="34" width="88" height="92" rx="16" fill="${color}" stroke="#f8fafc" stroke-width="3"/>
    <circle cx="80" cy="70" r="20" fill="#0f172a" opacity="0.35"/>
    <text x="80" y="76" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="16" fill="#ffffff">${safeCode}</text>
    <rect x="44" y="98" width="72" height="18" rx="5" fill="#0f172a" opacity="0.75"/>
    <text x="80" y="110" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="8.5" fill="#f8fafc">${safeName}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(genericSvg)}`;
}

import type { CSSProperties } from "react";

export const CAMPAIGN_THEME_OPTIONS: { value: string; label: string }[] = [
  { value: "birthday", label: "Birthday" },
  { value: "confetti", label: "Confetti" },
  { value: "hearts", label: "Hearts" },
  { value: "paws", label: "Paw Prints" },
  { value: "stars", label: "Stars" },
];

const THEME_PATTERNS: Record<string, (color: string) => string> = {
  birthday: (c) => `
    <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
      <g fill="none" stroke="${c}" stroke-width="2">
        <ellipse cx="24" cy="26" rx="10" ry="13"/>
        <path d="M24 39 l-3 5 h6 z M24 44 q4 8 -2 16" fill="${c}" stroke="none"/>
        <ellipse cx="88" cy="80" rx="9" ry="12"/>
        <path d="M88 92 l-3 5 h6 z M88 97 q-4 8 2 14" fill="${c}" stroke="none"/>
      </g>
      <g fill="${c}">
        <rect x="60" y="18" width="6" height="3" transform="rotate(30 63 19)"/>
        <rect x="100" y="34" width="6" height="3" transform="rotate(-20 103 35)"/>
        <rect x="14" y="76" width="6" height="3" transform="rotate(45 17 77)"/>
        <rect x="48" y="98" width="6" height="3" transform="rotate(-40 51 99)"/>
        <circle cx="72" cy="56" r="2.4"/>
        <circle cx="36" cy="60" r="2"/>
        <circle cx="106" cy="106" r="2.4"/>
      </g>
    </svg>`,
  confetti: (c) => `
    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
      <g fill="${c}">
        <rect x="10" y="12" width="8" height="3.5" transform="rotate(25 14 13)"/>
        <rect x="66" y="20" width="8" height="3.5" transform="rotate(-35 70 21)"/>
        <rect x="36" y="48" width="8" height="3.5" transform="rotate(60 40 49)"/>
        <rect x="82" y="66" width="8" height="3.5" transform="rotate(-15 86 67)"/>
        <rect x="18" y="80" width="8" height="3.5" transform="rotate(40 22 81)"/>
        <circle cx="52" cy="10" r="2.6"/>
        <circle cx="90" cy="40" r="2.2"/>
        <circle cx="8" cy="50" r="2.2"/>
        <circle cx="58" cy="88" r="2.6"/>
      </g>
    </svg>`,
  hearts: (c) => `
    <svg xmlns="http://www.w3.org/2000/svg" width="110" height="110" viewBox="0 0 110 110">
      <g fill="${c}">
        <path d="M28 24 c-3-6 -12-5 -12 2 c0 5 7 9 12 13 c5-4 12-8 12-13 c0-7 -9-8 -12-2 z"/>
        <path d="M82 70 c-2.4-4.8 -9.6-4 -9.6 1.6 c0 4 5.6 7.2 9.6 10.4 c4-3.2 9.6-6.4 9.6-10.4 c0-5.6 -7.2-6.4 -9.6-1.6 z"/>
        <path d="M60 34 c-1.5-3 -6-2.5 -6 1 c0 2.5 3.5 4.5 6 6.5 c2.5-2 6-4 6-6.5 c0-3.5 -4.5-4 -6-1 z" opacity="0.7"/>
      </g>
    </svg>`,
  paws: (c) => `
    <svg xmlns="http://www.w3.org/2000/svg" width="110" height="110" viewBox="0 0 110 110">
      <g fill="${c}">
        <g transform="translate(22,24)">
          <ellipse cx="0" cy="4" rx="7" ry="6"/>
          <ellipse cx="-8" cy="-4" rx="3" ry="4"/>
          <ellipse cx="-2.5" cy="-8" rx="3" ry="4"/>
          <ellipse cx="4" cy="-7.5" rx="3" ry="4"/>
          <ellipse cx="9" cy="-2.5" rx="3" ry="3.6"/>
        </g>
        <g transform="translate(78,76) rotate(-20)">
          <ellipse cx="0" cy="4" rx="7" ry="6"/>
          <ellipse cx="-8" cy="-4" rx="3" ry="4"/>
          <ellipse cx="-2.5" cy="-8" rx="3" ry="4"/>
          <ellipse cx="4" cy="-7.5" rx="3" ry="4"/>
          <ellipse cx="9" cy="-2.5" rx="3" ry="3.6"/>
        </g>
      </g>
    </svg>`,
  stars: (c) => `
    <svg xmlns="http://www.w3.org/2000/svg" width="110" height="110" viewBox="0 0 110 110">
      <g fill="${c}">
        <path d="M26 14 l3 7 7 1 -5 5 1 7 -6-3.5 -6 3.5 1-7 -5-5 7-1 z"/>
        <path d="M82 62 l2.4 5.6 5.6 0.8 -4 4 0.8 5.6 -4.8-2.8 -4.8 2.8 0.8-5.6 -4-4 5.6-0.8 z"/>
        <circle cx="60" cy="30" r="2"/>
        <circle cx="18" cy="72" r="2"/>
        <circle cx="98" cy="20" r="2"/>
        <circle cx="52" cy="96" r="2"/>
      </g>
    </svg>`,
};

export function getThemeBackgroundStyle(theme: string | null | undefined, primary: string | null): CSSProperties | undefined {
  if (!theme || !THEME_PATTERNS[theme]) return undefined;
  const color = primary || "#6366f1";
  const svg = THEME_PATTERNS[theme](color).replace(/\s+/g, " ").trim();
  return {
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
  };
}


import { CAMPAIGN_THEME_OPTIONS, campaignThemeSvg } from "./campaignThemes";

export const VOTING_THEME_OPTIONS = [
  ...CAMPAIGN_THEME_OPTIONS,
  { value: "halloween", label: "Halloween" },
  { value: "christmas", label: "Christmas" },
  { value: "easter", label: "Easter" },
  { value: "lsu_tigers", label: "LSU Tigers" },
  { value: "christmas_sweater", label: "Ugliest Christmas Sweater" },
  { value: "santa_paws", label: "Santa Paws" },
  { value: "valentines", label: "Valentine's Love Your Pet" },
  { value: "mardi_gras", label: "Mardi Gras Pets" },
  { value: "patriotic", label: "Patriotic Pets" },
  { value: "summer", label: "Beach / Summer Pets" },
  { value: "back_to_school", label: "Back-to-School Pets" },
];

export const VOTING_THEME_PRESET_COLORS: Record<string, { primaryColor: string; accentColor: string }> = {
  halloween: { primaryColor: "#7c2d8e", accentColor: "#c45a0b" },
  christmas: { primaryColor: "#166534", accentColor: "#c62828" },
  easter: { primaryColor: "#9361b5", accentColor: "#d56894" },
  lsu_tigers: { primaryColor: "#461D7C", accentColor: "#FDD023" },
  christmas_sweater: { primaryColor: "#14532d", accentColor: "#b91c1c" },
  santa_paws: { primaryColor: "#991b1b", accentColor: "#d4a346" },
  valentines: { primaryColor: "#9d174d", accentColor: "#f472b6" },
  mardi_gras: { primaryColor: "#55267c", accentColor: "#c99924" },
  patriotic: { primaryColor: "#173b77", accentColor: "#c33143" },
  summer: { primaryColor: "#086c80", accentColor: "#e9a23b" },
  back_to_school: { primaryColor: "#254962", accentColor: "#e3ac38" },
};

// Original vector motifs are intentionally drawn along the tile's edges: a
// narrow portrait inlay shows them even when the middle of the tile is hidden
// behind the photo. No fonts, uploads or user-provided markup enter the SVG.
const paw = (color: string) => `<g fill="${color}"><ellipse cy="3" rx="5" ry="4"/><circle cx="-6" cy="-4" r="2"/><circle cx="-2" cy="-7" r="2"/><circle cx="3" cy="-7" r="2"/><circle cx="7" cy="-4" r="2"/></g>`;
const star = (color: string) => `<path d="M0-9 2.5-3 9-3 4 1 6 8 0 4-6 8-4 1-9-3-2.5-3Z" fill="${color}"/>`;
const heart = (color: string) => `<path d="M0 8C-15-2-7-12 0-5 7-12 15-2 0 8Z" fill="${color}"/>`;
const snowflake = (color: string) => `<path d="M0-9V9M-9 0H9M-6-6 6 6M6-6-6 6" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
const FRAME_ARTWORK: Record<string, (primary: string, accent: string) => string> = {
  birthday: (_, a) => `<path d="M-7 0H7V8H-7ZM-9-3H9V0H-9ZM0-3V8M-2-4C-10-4-8-10-4-9q4 0 4 6m2-1c8 0 6-6 2-5q-4 0-4 6" fill="none" stroke="${a}" stroke-width="2"/>`,
  confetti: (_, a) => `<path d="M-8-7h4v5h-4ZM3-9l4 2-2 4-4-2ZM-3 3l5 2-2 5-5-2ZM6 4l3 4-4 2-3-4Z" fill="${a}"/>`,
  hearts: (_, a) => heart(a),
  paws: (_, a) => paw(a),
  stars: (_, a) => star(a),
  halloween: (_, a) => `<path d="M-8-1Q-8-7-3-7H3Q8-7 8-1Q8 7 0 8Q-8 7-8-1ZM0-7v-4m0 4q1-5 5-5" fill="${a}" stroke="#ffffff" stroke-width="1.2"/><path d="M-5 1-2-2 0 1 2-2 5 1M-3 4q3 3 6 0" fill="none" stroke="#ffffff" stroke-width="1.3"/>`,
  christmas: (_, a) => `<path d="M0-10-8 0h4l-5 6H9L4 0h4Z" fill="${a}"/><rect x="-2" y="6" width="4" height="4" fill="#ffffff"/>`,
  easter: (_, a) => `<ellipse rx="7" ry="10" fill="${a}" stroke="#ffffff" stroke-width="1.3"/><path d="M-6-2q3-3 6 0t6 0M-6 3q3-3 6 0t6 0" fill="none" stroke="#ffffff" stroke-width="1.5"/>`,
  lsu_tigers: (_, a) => paw(a),
  christmas_sweater: (_, a) => snowflake(a),
  santa_paws: (_, a) => `<path d="M-8 2 1-10 8 2Z" fill="${a}"/><path d="M-9 2H9" stroke="#ffffff" stroke-width="3"/><circle cx="1" cy="-10" r="2.5" fill="#ffffff"/>`,
  valentines: (_, a) => heart(a),
  mardi_gras: (_, a) => `<path d="M-10 0Q0-7 10 0" fill="none" stroke="#ffffff" stroke-width="1"/><circle cx="-7" cy="-2" r="3" fill="${a}"/><circle cx="-2" cy="-4" r="3" fill="#278447"/><circle cx="3" cy="-4" r="3" fill="${a}"/><circle cx="8" cy="-2" r="3" fill="#278447"/>`,
  patriotic: (_, a) => `<path d="M-10-9H10V9H-10Z" fill="#ffffff"/>${star(a)}`,
  summer: (_, a) => `<circle cy="-2" r="5" fill="${a}"/><path d="M0-10v-3m0 20v3M-8-2h-3m19 0h3M-6-8l-2-2m14 2 2-2" stroke="${a}" stroke-width="2" stroke-linecap="round"/>`,
  back_to_school: (_, a) => `<g transform="rotate(35)"><path d="M-3-10H3V5L0 10-3 5Z" fill="${a}" stroke="#ffffff" stroke-width="1.2"/><path d="M-3-6H3M-3 5H3" stroke="#ffffff" stroke-width="1.5"/></g>`,
};

export function votingFrameColors(theme: string | null | undefined, primary: string | null | undefined, accent: string | null | undefined) {
  if (!theme || !FRAME_ARTWORK[theme]) return null;
  const preset = VOTING_THEME_PRESET_COLORS[theme];
  return {
    primary: validVotingColor(primary) || preset?.primaryColor || "#544079",
    accent: validVotingColor(accent) || preset?.accentColor || "#edb957",
  };
}

export function votingFrameTileSvg(theme: string | null | undefined, primary: string, accent: string): string | undefined {
  const motif = theme && FRAME_ARTWORK[theme];
  if (!motif) return undefined;
  const safePrimary = validVotingColor(primary) || "#544079";
  const safeAccent = validVotingColor(accent) || "#edb957";
  const knit = theme === "christmas_sweater"
    ? `<path d="M0 20 9 26 18 20 27 26 36 20 45 26 54 20 63 26 72 20M0 54 9 48 18 54 27 48 36 54 45 48 54 54 63 48 72 54" fill="none" stroke="${safeAccent}" stroke-width="3"/>`
    : "";
  const stripes = theme === "lsu_tigers"
    ? `<path d="M0 0 15 0 0 15ZM72 0 57 0 72 15ZM0 72 15 72 0 57ZM72 72 57 72 72 57Z" fill="${safeAccent}" opacity=".75"/>`
    : "";
  const waves = theme === "summer"
    ? `<path d="M0 24q9-8 18 0t18 0 18 0 18 0M0 50q9-8 18 0t18 0 18 0 18 0" fill="none" stroke="#ffffff" stroke-width="2" opacity=".75"/>`
    : "";
  const ruled = theme === "back_to_school"
    ? `<path d="M0 24H72M0 48H72" stroke="#ffffff" stroke-width="1.5" opacity=".65"/>`
    : "";
  const bats = theme === "halloween"
    ? `<path d="M0 9Q5 3 10 9l4-4 4 4q5-6 10 0-6-1-7 6-5-3-7 2-2-5-7-2Q6 8 0 9ZM44 67q5-6 10 0l4-4 4 4q5-6 10 0-6-1-7 5-5-3-7 2-2-5-7-2-1-6-7-5Z" fill="#ffffff" opacity=".9"/>`
    : "";
  const flowers = theme === "easter"
    ? `<g transform="translate(9 9)" fill="#ffffff"><circle cx="-4" r="3"/><circle cx="4" r="3"/><circle cy="-4" r="3"/><circle cy="4" r="3"/><circle r="2" fill="${safeAccent}"/></g>`
    : "";
  const santaPaws = theme === "santa_paws"
    ? `<g transform="translate(9 9)">${paw("#ffffff")}</g>`
    : "";
  // The four positions hug the outer edges so the 12–22px visible inlay
  // retains recognizable artwork on both compact cards and wide share cards.
  const ornaments = [[36, 8], [8, 36], [64, 36], [36, 64]]
    .map(([x, y]) => `<g transform="translate(${x} ${y})">${motif(safePrimary, safeAccent)}</g>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><rect width="72" height="72" fill="${safePrimary}"/>${knit}${stripes}${waves}${ruled}${bats}${flowers}${santaPaws}${ornaments}</svg>`;
}

export const VOTING_THEME_SURFACES: Record<string, string> = {
  halloween: "#fff8f0", christmas: "#f5faf3", christmas_sweater: "#f5faf3",
  santa_paws: "#fff9f2", easter: "#fff7fc", valentines: "#fff5f8",
  mardi_gras: "#faf5ff", patriotic: "#f3f7fc", summer: "#effafd",
  back_to_school: "#fcf9f0", lsu_tigers: "#fcf9ed",
};

export type VotingAppearance = {
  backgroundImageUrl?: string | null;
  backgroundImageTarget?: "page" | "frames" | "both";
  primaryColor: string | null;
  accentColor: string | null;
  themeBackground: string | null;
};

export const DEFAULT_VOTING_APPEARANCE: VotingAppearance = {
  backgroundImageUrl: null,
  backgroundImageTarget: "both",
  primaryColor: null,
  accentColor: null,
  themeBackground: null,
};

export function votingAppearanceForTheme(value: VotingAppearance, theme: string): VotingAppearance {
  const preset = VOTING_THEME_PRESET_COLORS[theme];
  return { ...value, ...preset, themeBackground: theme === "none" ? null : theme };
}

export function validVotingColor(color: string | null | undefined): string | null {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
}

export function contrastText(color: string): string {
  const channels = [1, 3, 5].map((i) => {
    const v = parseInt(color.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 > 0.38 ? "#211b2b" : "#ffffff";
}

export function readableColor(color: string): string {
  if (contrastText(color) === "#ffffff") return color;
  const values = [1, 3, 5].map((i) => Math.round(parseInt(color.slice(i, i + 2), 16) * 0.58));
  return `#${values.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const SPECIAL_VOTING_PATTERNS: Record<string, string> = {
    christmas_sweater: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><path d="M0 20h120M0 100h120M0 60l20-14 20 28 20-28 20 28 20-28 20 14" fill="none" stroke="#14532d" stroke-width="5"/><path d="M0 30h120M0 90h120" stroke="#b91c1c" stroke-width="4"/></svg>`,
    santa_paws: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><path d="M30 45l20-27 20 27Z" fill="#991b1b"/><circle cx="50" cy="18" r="5" fill="#d4a346"/><path d="M25 45h50" stroke="#d4a346" stroke-width="8"/><circle cx="98" cy="96" r="5" fill="#d4a346"/></svg>`,
    valentines: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><path d="M60 72C5 35 45 12 60 38c15-26 55-3 0 34Z" fill="#f472b6" stroke="#9d174d" stroke-width="2"/></svg>`,
    mardi_gras: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><circle cx="25" cy="45" r="10" fill="#55267c"/><circle cx="50" cy="49" r="10" fill="#c99924"/><circle cx="75" cy="45" r="10" fill="#20804d"/><circle cx="100" cy="35" r="10" fill="#55267c"/></svg>`,
    patriotic: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><path d="M30 15l5 14 15 1-12 9 4 15-12-9-12 9 4-15-12-9 15-1Z" fill="#173b77"/><path d="M85 62l5 14 15 1-12 9 4 15-12-9-12 9 4-15-12-9 15-1Z" fill="#c33143"/></svg>`,
    summer: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><circle cx="31" cy="31" r="14" fill="#e9a23b"/><path d="M0 82q15-16 30 0t30 0 30 0 30 0M0 100q15-16 30 0t30 0 30 0 30 0" fill="none" stroke="#086c80" stroke-width="5"/></svg>`,
    back_to_school: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><path d="M20 18h75v86H20Z" fill="none" stroke="#254962" stroke-width="4"/><path d="M35 18v86M42 38h42M42 57h42M42 76h42" stroke="#e3ac38" stroke-width="3"/></svg>`,
    halloween: `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
    <g fill="none" stroke="#b66123" stroke-width="2" opacity=".65">
      <path d="M34 49c-3-8 1-15 8-15s11 7 8 15M42 34v-7c0-4 4-6 7-6"/>
      <path d="M22 50c0-10 9-15 15-11m10 0c7-4 16 1 16 11 0 13-8 22-21 22S22 63 22 50Z"/>
      <path d="M36 39c-6 9-5 21 0 31m12-31c6 9 5 21 0 31"/>
    </g>
    <g fill="#55345e" opacity=".62">
      <path d="M116 90q8-9 16-2l5-5 5 5q8-7 16 2-7-1-10 8-6-4-11 3-5-7-11-3-3-9-10-8Z"/>
      <path d="M62 145q5-6 11-1l4-4 4 4q6-5 11 1-5-1-7 6-5-3-8 2-3-5-8-2-2-7-7-6Z"/>
      <circle cx="105" cy="28" r="2"/><circle cx="154" cy="45" r="1.5"/>
    </g>
  </svg>`,
    christmas: `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
      <g fill="#166534" opacity=".75">
        <path d="M40 19 20 48h8L15 67h50L52 48h8L40 19Z"/>
        <rect x="36" y="67" width="8" height="10" fill="#8b5e3c"/>
        <path d="M136 102 120 125h6l-11 16h42l-11-16h6l-16-23Z"/>
        <rect x="133" y="141" width="6" height="8" fill="#8b5e3c"/>
      </g>
      <g fill="#c62828"><circle cx="38" cy="45" r="3"/><circle cx="48" cy="59" r="3"/>
        <circle cx="135" cy="126" r="2.5"/><circle cx="130" cy="139" r="2.5"/></g>
      <g fill="none" stroke="#5185ae" stroke-width="2" stroke-linecap="round" opacity=".8">
        <path d="M123 32v28m-14-14h28m-24-10 20 20m0-20-20 20"/>
        <path d="M69 117v22m-11-11h22m-19-8 16 16m0-16-16 16"/>
      </g>
    </svg>`,
    easter: `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
      <g fill="#d9c6f3" stroke="#9361b5" stroke-width="2">
        <ellipse cx="42" cy="50" rx="17" ry="24" transform="rotate(-12 42 50)"/>
        <ellipse cx="135" cy="128" rx="16" ry="23" transform="rotate(16 135 128)" fill="#ffe1d5"/>
      </g>
      <g fill="none" stroke="#d56894" stroke-width="2.5">
        <path d="M26 49q8-8 17 0t16-1M29 59q8-8 17 0t13-1"/>
        <path d="M121 127q7-7 15 0t14-1M123 137q7-7 15 0t11-1"/>
      </g>
      <g fill="#ffce72" stroke="#e8a0bc" stroke-width="3">
        <circle cx="113" cy="37" r="6"/><circle cx="69" cy="133" r="6"/>
      </g>
      <g fill="none" stroke="#e8a0bc" stroke-width="4" stroke-linecap="round">
        <path d="M113 23v7m0 14v7m-14-14h7m14 0h7M69 119v7m0 14v7m-14-14h7m14 0h7"/>
      </g>
      <g fill="#9bc9a2"><circle cx="159" cy="57" r="3"/><circle cx="17" cy="119" r="3"/></g>
    </svg>`,
    lsu_tigers: `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
      <g fill="#461D7C" opacity=".8">
        <path d="M0 18q17 9 39 3l-19 10Q9 30 0 27ZM64 0q-3 22-24 36l27-8Q80 12 80 0Z"/>
        <path d="M180 68q-19-10-40-3l20 10q12-1 20 2ZM110 180q4-20 25-35l-28 8q-12 13-13 27Z"/>
        <path d="M0 138q17-9 33-5l-15 10q-9 0-18 4ZM180 8q-14 10-32 8l14 9q10-1 18-6Z"/>
      </g>
      <g fill="#FDD023" opacity=".95">
        <g transform="translate(110 103) rotate(-15)">
          <ellipse cx="0" cy="5" rx="10" ry="8"/>
          <ellipse cx="-12" cy="-5" rx="4" ry="5"/><ellipse cx="-4" cy="-10" rx="4" ry="5"/>
          <ellipse cx="5" cy="-10" rx="4" ry="5"/><ellipse cx="13" cy="-5" rx="4" ry="5"/>
        </g>
        <g transform="translate(44 100) rotate(18) scale(.7)">
          <ellipse cx="0" cy="5" rx="10" ry="8"/>
          <ellipse cx="-12" cy="-5" rx="4" ry="5"/><ellipse cx="-4" cy="-10" rx="4" ry="5"/>
          <ellipse cx="5" cy="-10" rx="4" ry="5"/><ellipse cx="13" cy="-5" rx="4" ry="5"/>
        </g>
      </g>
    </svg>`,
};

export function votingPatternSvg(theme: string | null | undefined, primary: string | null): string | undefined {
  const svg = theme && SPECIAL_VOTING_PATTERNS[theme];
  return svg ? svg.replace(/\s+/g, " ").trim() : campaignThemeSvg(theme, validVotingColor(primary));
}

export function votingBackgroundStyle(theme: string | null | undefined, primary: string | null): { backgroundImage: string } | undefined {
  const svg = votingPatternSvg(theme, primary);
  return svg ? { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")` } : undefined;
}
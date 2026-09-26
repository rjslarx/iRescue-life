import type { CSSProperties } from "react";
import { CAMPAIGN_THEME_OPTIONS, getThemeBackgroundStyle } from "./campaignThemes";

export const VOTING_THEME_OPTIONS = [
  ...CAMPAIGN_THEME_OPTIONS,
  { value: "halloween", label: "Halloween" },
  { value: "christmas", label: "Christmas" },
  { value: "easter", label: "Easter" },
  { value: "lsu_tigers", label: "LSU Tigers" },
];

export const VOTING_THEME_PRESET_COLORS: Record<string, { primaryColor: string; accentColor: string }> = {
  halloween: { primaryColor: "#7c2d8e", accentColor: "#c45a0b" },
  christmas: { primaryColor: "#166534", accentColor: "#c62828" },
  easter: { primaryColor: "#9361b5", accentColor: "#d56894" },
  lsu_tigers: { primaryColor: "#461D7C", accentColor: "#FDD023" },
};

export type VotingAppearance = {
  primaryColor: string | null;
  accentColor: string | null;
  themeBackground: string | null;
};

export const DEFAULT_VOTING_APPEARANCE: VotingAppearance = {
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

export function votingBackgroundStyle(theme: string | null | undefined, primary: string | null): CSSProperties | undefined {
  const svg = theme && SPECIAL_VOTING_PATTERNS[theme];
  if (!svg) return getThemeBackgroundStyle(theme, validVotingColor(primary));
  return { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}")` };
}
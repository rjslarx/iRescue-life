import type { CSSProperties } from "react";
import { CAMPAIGN_THEME_OPTIONS, getThemeBackgroundStyle } from "./campaignThemes";

export const VOTING_THEME_OPTIONS = [
  ...CAMPAIGN_THEME_OPTIONS,
  { value: "halloween", label: "Halloween" },
];

export const HALLOWEEN_COLORS = { primaryColor: "#7c2d8e", accentColor: "#c45a0b" };

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

export function votingBackgroundStyle(theme: string | null | undefined, primary: string | null): CSSProperties | undefined {
  if (theme !== "halloween") return getThemeBackgroundStyle(theme, validVotingColor(primary));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
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
  </svg>`;
  return { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}")` };
}
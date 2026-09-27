import { VOTING_THEME_OPTIONS } from "../../../client/src/lib/votingThemes";

// Derived from the real options so adding a theme requires new baselines.
export const themes = [{ value: "none", label: "No theme" }, ...VOTING_THEME_OPTIONS];
export const scenarios = [
  { id: "portrait", name: "Biscuit", ownerDisplayName: "Jordan", photo: "portrait" },
  { id: "long-text", name: "Professor Marshmallow Fluffington the Third Extraordinary Adventure Companion", ownerDisplayName: "Alexandria and Christopher Longfamilyname", photo: "portrait" },
  { id: "unbroken-name", name: "SupercalifragilisticexpialidociousFluffingtonMarshmallow", ownerDisplayName: null, photo: "landscape" },
  { id: "blank-owner", name: "Clover", ownerDisplayName: "", photo: "landscape" },
  { id: "missing-photo", name: "Maple Bean", ownerDisplayName: null, photo: null },
  { id: "custom-dark", name: "Midnight", ownerDisplayName: "Sam", photo: "portrait", primaryColor: "#12263a", accentColor: "#f4d35e" },
  { id: "custom-light", name: "Sunny", ownerDisplayName: "", photo: null, primaryColor: "#fff1b8", accentColor: "#29335c" },
] as const;

// Visible edge markers make accidental cropping apparent. No real animal data.
export function photoSvg(landscape: boolean) {
  const w = landscape ? 640 : 240, h = landscape ? 240 : 480;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="#cce6ea"/>
    <rect x="4" y="4" width="${w - 8}" height="${h - 8}" fill="none" stroke="#e94560" stroke-width="8"/>
    <path d="M0 0L${w} ${h}M${w} 0L0 ${h}" stroke="#7da6af" stroke-width="3"/>
    <ellipse cx="${w / 2}" cy="${h / 2}" rx="75" ry="95" fill="#a86835"/>
    <circle cx="${w / 2 - 25}" cy="${h / 2 - 15}" r="9" fill="#172c36"/>
    <circle cx="${w / 2 + 25}" cy="${h / 2 - 15}" r="9" fill="#172c36"/>
    <ellipse cx="${w / 2}" cy="${h / 2 + 22}" rx="14" ry="10" fill="#172c36"/>
  </svg>`;
}
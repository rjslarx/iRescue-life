import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_VOTING_APPEARANCE, VOTING_THEME_OPTIONS, VOTING_THEME_SURFACES, contrastText, validVotingColor, votingAppearanceForTheme, votingBackgroundStyle, type VotingAppearance } from "@/lib/votingThemes";
import ContestEntrantPhoto from "@/components/ContestEntrantPhoto";
import { ObjectUploader } from "@/components/ObjectUploader";
import { votingBackgroundApplies } from "@shared/voting-background";

export function VotingAppearanceControls({ value, onChange, disabled = false }: {
  value: VotingAppearance;
  onChange: (appearance: VotingAppearance) => void;
  disabled?: boolean;
}) {
  const [showError, setShowError] = useState(false);
  const primary = validVotingColor(value.primaryColor);
  const accent = validVotingColor(value.accentColor);
  const set = (field: keyof VotingAppearance, next: string | null) => onChange({ ...value, [field]: next || null });
  const invalid = [value.primaryColor, value.accentColor].some((v) => v && !validVotingColor(v));

  return (
    <div className="space-y-4" data-testid="voting-appearance-controls">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-base font-semibold">Appearance</Label>
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { onChange(DEFAULT_VOTING_APPEARANCE); setShowError(false); }} data-testid="button-reset-voting-appearance">Reset to default</Button>
      </div>
      <div className="space-y-2">
        <Label>Background theme</Label>
        <Select disabled={disabled} value={value.themeBackground || "none"} onValueChange={(theme) => onChange(votingAppearanceForTheme(value, theme))}>
          <SelectTrigger data-testid="select-voting-theme"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {VOTING_THEME_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Themes style the background and each entry portrait. You can change the colors afterward.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <fieldset disabled={disabled} className="space-y-2 sm:col-span-2">
          <Label>Custom background (optional)</Label>
          <ObjectUploader uploadEndpoint="/api/voting-contests/background/upload" accept="image/jpeg,image/png,image/webp" maxFiles={1} maxFileSize={5 * 1024 * 1024}
            value={value.backgroundImageUrl ? [value.backgroundImageUrl] : []}
            onChange={(urls) => onChange({ ...value, backgroundImageUrl: urls[0] || null })} buttonText="Upload background" />
          <Select disabled={disabled} value={value.backgroundImageTarget || "both"} onValueChange={(target) => onChange({ ...value, backgroundImageTarget: target as "page" | "frames" | "both" })}>
            <SelectTrigger aria-label="Apply custom background to"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="page">Page only</SelectItem><SelectItem value="frames">Portrait frames only</SelectItem><SelectItem value="both">Page and portrait frames</SelectItem></SelectContent>
          </Select>
          {value.backgroundImageUrl && <Button type="button" variant="outline" disabled={disabled} onClick={() => onChange({ ...value, backgroundImageUrl: null })}>Remove custom background</Button>}
          <p className="text-xs text-muted-foreground">Static JPEG, PNG or WebP, up to 5 MB. Recommended: 2400 × 1600 pixels. Backgrounds cover their area and crop on mobile; keep important details centered. Photos and nameplates stay unchanged. Removing restores your preset.</p>
        </fieldset>
        {(["primaryColor", "accentColor"] as const).map((field) => (
          <div className="space-y-2" key={field}>
            <Label htmlFor={`voting-${field}`}>{field === "primaryColor" ? "Primary color" : "Accent color"}</Label>
            <div className="flex gap-2">
              <input aria-label={`Pick ${field === "primaryColor" ? "primary" : "accent"} color`} type="color" disabled={disabled}
                value={validVotingColor(value[field]) || (field === "primaryColor" ? "#7c2d8e" : "#c45a0b")}
                onChange={(e) => set(field, e.target.value)} className="w-10 h-9 rounded border cursor-pointer" />
              <Input id={`voting-${field}`} disabled={disabled} value={value[field] || ""} placeholder="#7c2d8e" maxLength={7}
                onChange={(e) => set(field, e.target.value)} onBlur={() => setShowError(true)} className="font-mono" data-testid={`input-voting-${field}`} />
            </div>
          </div>
        ))}
      </div>
      {showError && invalid && <p role="alert" className="text-sm text-destructive">Enter colors as six-digit hex values (for example, #7c2d8e), or leave them blank.</p>}
       <div className="relative overflow-hidden rounded-xl border bg-background p-5" style={value.themeBackground && VOTING_THEME_SURFACES[value.themeBackground] ? { backgroundColor: VOTING_THEME_SURFACES[value.themeBackground] } : undefined} data-testid="preview-voting-appearance">
        {value.themeBackground && <div aria-hidden="true" className="absolute inset-0 opacity-20 pointer-events-none" style={votingBackgroundStyle(value.themeBackground, primary)} />}
        {value.backgroundImageUrl && votingBackgroundApplies(value.backgroundImageTarget, "page") && <div aria-hidden="true" className="absolute inset-0 pointer-events-none bg-cover bg-center" style={{ backgroundImage: `url("${value.backgroundImageUrl}")` }} />}
        <div className="relative bg-white rounded-lg shadow-sm border p-4 space-y-2 text-[#27232e]">
          <h3 className="text-lg font-bold" style={primary ? { color: primary } : undefined}>Your contest title</h3>
          <p className="text-sm text-[#504b57]">Supporters can vote for their favorite entrant.</p>
          <div className="max-w-48">
            <ContestEntrantPhoto name="Your pet" ownerDisplayName="Owner name" theme={value.themeBackground} primaryColor={primary} accentColor={accent} backgroundImageUrl={value.backgroundImageUrl} backgroundImageTarget={value.backgroundImageTarget} />
          </div>
          <div className="flex items-center gap-3">
            <span className="font-bold" style={primary ? { color: primary } : undefined}>42 votes</span>
            <span className="px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground" style={accent ? { backgroundColor: accent, color: contrastText(accent) } : undefined}>Vote now</span>
          </div>
        </div>
      </div>
    </div>
  );
}
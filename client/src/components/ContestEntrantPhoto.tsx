import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { votingBackgroundApplies } from "@shared/voting-background";
import { votingFrameColors, votingFrameTileSvg, contrastText } from "@/lib/votingThemes";

interface ContestEntrantPhotoProps {
  backgroundImageUrl?: string | null;
  backgroundImageTarget?: string | null;
  name: string;
  photoUrl?: string | null;
  ownerDisplayName?: string | null;
  theme?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  className?: string;
}

export default function ContestEntrantPhoto({ name, photoUrl, ownerDisplayName, theme, primaryColor, accentColor, className, backgroundImageUrl, backgroundImageTarget }: ContestEntrantPhotoProps) {
  const custom = backgroundImageUrl && votingBackgroundApplies(backgroundImageTarget, "frames");
  const colors = votingFrameColors(theme, primaryColor, accentColor);
  const tile = colors && votingFrameTileSvg(theme, colors.primary, colors.accent);
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <figure className={cn("w-full min-w-0 overflow-hidden rounded-[1.5rem]", className)} data-testid="contest-portrait">
      <div className={cn("relative", colors ? "p-3 sm:p-4" : "bg-muted/40 p-2")}
        style={custom ? { backgroundImage: `url("${backgroundImageUrl}")`, backgroundSize: "cover", backgroundPosition: "center" } : tile ? { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(tile)}")`, backgroundColor: colors!.primary } : undefined}>
        <div className={cn("relative", colors && "rounded-xl bg-white p-1 shadow-lg")}>
          <Avatar className="aspect-[4/3] h-auto w-full rounded-xl bg-muted after:rounded-xl">
            {photoUrl && <AvatarImage src={photoUrl} alt={name} className="aspect-[4/3] h-full w-full object-contain object-center" />}
            <AvatarFallback className="h-full w-full rounded-xl text-3xl font-semibold">{initials}</AvatarFallback>
          </Avatar>
        </div>
        <figcaption
          className={cn("mt-2 min-w-0 rounded-xl border px-3 py-2.5 text-center shadow-sm", !colors && "border-border bg-background text-foreground")}
          style={colors ? { backgroundColor: colors.primary, borderColor: colors.accent, color: contrastText(colors.primary) } : undefined}
          data-testid="contest-portrait-nameplate"
        >
          <span className="block break-words text-base font-bold leading-tight">{name}</span>
          {ownerDisplayName?.trim() && <span className="block break-words text-xs opacity-90">with {ownerDisplayName.trim()}</span>}
        </figcaption>
      </div>
    </figure>
  );
}
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { votingFrameColors, votingFrameTileSvg, contrastText } from "@/lib/votingThemes";

interface ContestEntrantPhotoProps {
  name: string;
  photoUrl?: string | null;
  ownerDisplayName?: string | null;
  theme?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  className?: string;
}

export default function ContestEntrantPhoto({ name, photoUrl, ownerDisplayName, theme, primaryColor, accentColor, className }: ContestEntrantPhotoProps) {
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
      <div className={cn("relative", colors ? "p-3 sm:p-4" : "")}
        style={tile ? { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(tile)}")`, backgroundColor: colors!.primary } : undefined}>
        <div className={cn("relative", colors && "rounded-xl bg-white p-1 shadow-lg")}>
          <Avatar className="aspect-[4/3] h-auto w-full rounded-xl bg-muted after:rounded-xl">
            {photoUrl && <AvatarImage src={photoUrl} alt={name} className="aspect-[4/3] h-full w-full object-contain object-center" />}
            <AvatarFallback className="h-full w-full rounded-xl text-3xl font-semibold">{initials}</AvatarFallback>
          </Avatar>
        </div>
      </div>
      <figcaption className="min-w-0 px-3 py-2.5 text-center" style={colors ? { backgroundColor: colors.primary, color: contrastText(colors.primary) } : undefined}>
        <span className="block break-words text-base font-bold leading-tight">{name}</span>
        {ownerDisplayName?.trim() && <span className="block break-words text-xs opacity-90">with {ownerDisplayName.trim()}</span>}
      </figcaption>
    </figure>
  );
}
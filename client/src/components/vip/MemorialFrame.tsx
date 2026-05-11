import { Heart, PawPrint } from "lucide-react";

export type FrameStyle = "heart" | "paw";

interface MemorialFrameProps {
  photoUrl?: string | null;
  name?: string | null;
  frameStyle?: FrameStyle;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "h-16 w-16",
  md: "h-24 w-24",
  lg: "h-32 w-32",
};

const iconSizeClasses = {
  sm: "h-8 w-8",
  md: "h-12 w-12",
  lg: "h-16 w-16",
};

export function MemorialFrame({
  photoUrl,
  name,
  frameStyle = "heart",
  size = "md",
  className,
}: MemorialFrameProps) {
  const FrameIcon = frameStyle === "paw" ? PawPrint : Heart;
  const ringClass =
    frameStyle === "paw"
      ? "ring-amber-400/60 dark:ring-amber-700/50"
      : "ring-rose-400/60 dark:ring-rose-700/50";

  return (
    <div
      className={`relative shrink-0 ${sizeClasses[size]} rounded-full overflow-hidden ring-2 ${ringClass} bg-muted flex items-center justify-center ${className || ""}`}
      data-testid="memorial-frame"
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={name || "Memorial photo"}
          className="w-full h-full object-cover"
        />
      ) : (
        <FrameIcon
          className={`${iconSizeClasses[size]} text-muted-foreground/40`}
          fill="currentColor"
        />
      )}
      <div className="pointer-events-none absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-background flex items-center justify-center shadow-sm border">
        <FrameIcon className="h-4 w-4 text-rose-500 dark:text-rose-400" fill="currentColor" />
      </div>
    </div>
  );
}

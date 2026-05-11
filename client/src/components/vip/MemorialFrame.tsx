import { useId } from "react";
import { Heart, PawPrint } from "lucide-react";

export type FrameStyle = "heart" | "paw";

interface MemorialFrameProps {
  photoUrl?: string | null;
  name?: string | null;
  frameStyle?: FrameStyle;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const pxSize: Record<NonNullable<MemorialFrameProps["size"]>, number> = {
  sm: 64,
  md: 96,
  lg: 128,
};

const HEART_PATH =
  "M50 88 C 18 60 8 40 24 22 C 36 8 50 16 50 28 C 50 16 64 8 76 22 C 92 40 82 60 50 88 Z";

function PawShape({ id }: { id: string }) {
  return (
    <g id={id}>
      <ellipse cx="50" cy="68" rx="28" ry="22" />
      <ellipse cx="20" cy="40" rx="10" ry="14" />
      <ellipse cx="40" cy="20" rx="10" ry="14" />
      <ellipse cx="60" cy="20" rx="10" ry="14" />
      <ellipse cx="80" cy="40" rx="10" ry="14" />
    </g>
  );
}

export function MemorialFrame({
  photoUrl,
  name,
  frameStyle = "heart",
  size = "md",
  className,
}: MemorialFrameProps) {
  const uid = useId().replace(/:/g, "");
  const clipId = `memorial-clip-${frameStyle}-${uid}`;
  const px = pxSize[size];
  const FallbackIcon = frameStyle === "paw" ? PawPrint : Heart;
  const accent =
    frameStyle === "paw"
      ? "text-amber-500 dark:text-amber-400"
      : "text-rose-500 dark:text-rose-400";
  const strokeColor =
    frameStyle === "paw"
      ? "rgba(245,158,11,0.7)"
      : "rgba(244,63,94,0.7)";

  return (
    <div
      className={`relative shrink-0 inline-flex items-center justify-center ${className || ""}`}
      style={{ width: px, height: px }}
      data-testid="memorial-frame"
      aria-label={name ? `Memorial photo of ${name}` : "Memorial photo"}
      role="img"
    >
      <svg
        viewBox="0 0 100 100"
        width={px}
        height={px}
        xmlns="http://www.w3.org/2000/svg"
        className="block"
      >
        <defs>
          <clipPath id={clipId}>
            {frameStyle === "heart" ? (
              <path d={HEART_PATH} />
            ) : (
              <PawShape id={`${clipId}-shape`} />
            )}
          </clipPath>
        </defs>

        {photoUrl ? (
          <image
            href={photoUrl}
            x="0"
            y="0"
            width="100"
            height="100"
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
          />
        ) : (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="100" height="100" className="fill-muted" />
          </g>
        )}

        {/* Crisp outline drawn over the masked image */}
        {frameStyle === "heart" ? (
          <path
            d={HEART_PATH}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        ) : (
          <g fill="none" stroke={strokeColor} strokeWidth="2.5">
            <ellipse cx="50" cy="68" rx="28" ry="22" />
            <ellipse cx="20" cy="40" rx="10" ry="14" />
            <ellipse cx="40" cy="20" rx="10" ry="14" />
            <ellipse cx="60" cy="20" rx="10" ry="14" />
            <ellipse cx="80" cy="40" rx="10" ry="14" />
          </g>
        )}
      </svg>

      {!photoUrl && (
        <FallbackIcon
          className={`absolute ${accent} opacity-50`}
          style={{ width: px * 0.32, height: px * 0.32 }}
          fill="currentColor"
        />
      )}
    </div>
  );
}

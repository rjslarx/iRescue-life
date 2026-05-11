import { useId } from "react";
import { Heart } from "lucide-react";

/**
 * Soft, feathered round avatar for tribute photos.
 *
 * Uses an SVG <radialGradient> alpha mask so the photo's edges fade gently
 * into the surrounding background instead of being clipped to a hard
 * silhouette. Falls back to a Heart icon on a rose-tinted disc when no
 * photo is provided.
 *
 * This is the single avatar used everywhere a tribute photo is shown — the
 * public Wall of Heroes tiles AND the in-form previews in the donate
 * tribute section, the donor VIP portal, and the staff Members page —
 * so the upload UIs always show what visitors will actually see.
 */
export function FeatheredAvatar({
  photoUrl,
  name,
  sizePx = 56,
}: {
  photoUrl: string | null | undefined;
  name: string;
  sizePx?: number;
}) {
  // Stable, hydration-safe mask id per instance so multiple avatars on the
  // same page don't collide.
  const rawId = useId();
  const maskId = `feather-mask-${rawId.replace(/:/g, "")}`;

  if (!photoUrl) {
    return (
      <div
        className="shrink-0 rounded-full flex items-center justify-center bg-rose-100 dark:bg-rose-950/40 ring-1 ring-rose-300/60 dark:ring-rose-800/60"
        style={{ width: sizePx, height: sizePx }}
        aria-label={`Tribute for ${name}`}
        role="img"
        data-testid="feathered-avatar-fallback"
      >
        <Heart
          className="text-rose-500 dark:text-rose-400"
          style={{ width: sizePx * 0.4, height: sizePx * 0.4 }}
          fill="currentColor"
        />
      </div>
    );
  }

  return (
    <div
      className="relative shrink-0 rounded-full ring-1 ring-rose-300/60 dark:ring-rose-800/60"
      style={{ width: sizePx, height: sizePx }}
      aria-label={`Tribute photo for ${name}`}
      role="img"
      data-testid="feathered-avatar"
    >
      <svg
        viewBox="0 0 100 100"
        width={sizePx}
        height={sizePx}
        xmlns="http://www.w3.org/2000/svg"
        className="block rounded-full"
      >
        <defs>
          <radialGradient id={maskId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="70%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id={`${maskId}-mask`}>
            <rect x="0" y="0" width="100" height="100" fill={`url(#${maskId})`} />
          </mask>
        </defs>
        <image
          href={photoUrl}
          x="0"
          y="0"
          width="100"
          height="100"
          preserveAspectRatio="xMidYMid slice"
          mask={`url(#${maskId}-mask)`}
        />
      </svg>
    </div>
  );
}

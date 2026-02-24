export function LitterPawsIcon({ className = "w-4 h-4", ...props }: { className?: string; [key: string]: any }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      className={className}
      fill="currentColor"
      {...props}
    >
      <defs>
        <g id="single-paw">
          <path d="M 50 85 C 20 85 15 55 35 45 C 45 40 50 55 50 55 C 50 55 55 40 65 45 C 85 55 80 85 50 85 Z" />
          <ellipse cx="22" cy="48" rx="9" ry="14" transform="rotate(-35 22 48)" />
          <ellipse cx="38" cy="25" rx="9" ry="14" transform="rotate(-10 38 25)" />
          <ellipse cx="62" cy="25" rx="9" ry="14" transform="rotate(10 62 25)" />
          <ellipse cx="78" cy="48" rx="9" ry="14" transform="rotate(35 78 48)" />
        </g>
      </defs>
      <g transform="translate(15, 85) rotate(15 50 50) scale(0.75)">
        <use href="#single-paw" />
      </g>
      <g transform="translate(95, 15) rotate(35 50 50) scale(0.85)">
        <use href="#single-paw" opacity="0.8" />
      </g>
    </svg>
  );
}

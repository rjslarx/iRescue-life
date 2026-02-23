import { PawPrint } from "lucide-react";
import { cn } from "@/lib/utils";

interface LitterPawsIconProps {
  className?: string;
}

export function LitterPawsIcon({ className }: LitterPawsIconProps) {
  return (
    <span className={cn("relative inline-flex items-center justify-center", className)}>
      <PawPrint className="h-[1em] w-[1em] absolute -translate-x-[0.2em] translate-y-[0.15em] opacity-60" />
      <PawPrint className="h-[1em] w-[1em] relative translate-x-[0.15em] -translate-y-[0.1em]" />
    </span>
  );
}

import {
  Dog,
  Cat,
  Bone,
  PawPrint,
  Bird,
  Fish,
  Rabbit,
  Turtle,
  Star,
  Heart,
  type LucideIcon,
} from "lucide-react";

const AVATAR_MAP: Record<string, LucideIcon> = {
  dog1: Dog,
  cat1: Cat,
  bone: Bone,
  paw: PawPrint,
  bird1: Bird,
  fish1: Fish,
  rabbit1: Rabbit,
  turtle1: Turtle,
  star: Star,
  heart: Heart,
};

export const AVATAR_TYPES = Object.keys(AVATAR_MAP);

export function getAvatarIcon(type: string): LucideIcon {
  return AVATAR_MAP[type] || PawPrint;
}

export const AVATAR_COLORS: Record<string, string> = {
  dog1: "text-amber-600",
  cat1: "text-orange-500",
  bone: "text-stone-500",
  paw: "text-emerald-600",
  bird1: "text-sky-500",
  fish1: "text-cyan-500",
  rabbit1: "text-pink-500",
  turtle1: "text-green-600",
  star: "text-yellow-500",
  heart: "text-rose-500",
};

export function getAvatarColor(type: string): string {
  return AVATAR_COLORS[type] || "text-primary";
}

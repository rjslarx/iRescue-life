import { Heart, Shield, PawPrint, Star, Users, Home, HandHeart } from "lucide-react";

export const VIP_ICON_OPTIONS = [
  { value: "heart", label: "Heart", Icon: Heart },
  { value: "shield", label: "Shield", Icon: Shield },
  { value: "paw", label: "Paw", Icon: PawPrint },
  { value: "star", label: "Star", Icon: Star },
  { value: "hand-heart", label: "Hand Heart", Icon: HandHeart },
  { value: "users", label: "Community", Icon: Users },
  { value: "home", label: "Home", Icon: Home },
];

export function getTierIcon(name?: string | null) {
  const found = VIP_ICON_OPTIONS.find((i) => i.value === name);
  return found ? found.Icon : Heart;
}

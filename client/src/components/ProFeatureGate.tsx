import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import DashboardLayout from "@/components/DashboardLayout";

interface ProFeatureGateProps {
  children: React.ReactNode;
  featureName?: string;
}

export function ProFeatureGate({ children, featureName }: ProFeatureGateProps) {
  return <>{children}</>;
}

export function useIsLiteTier(): { isLiteTier: boolean; isLoading: boolean } {
  return {
    isLiteTier: false,
    isLoading: false,
  };
}

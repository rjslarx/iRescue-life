interface ProFeatureGateProps {
  children: React.ReactNode;
  featureName?: string;
}

export function ProFeatureGate({ children }: ProFeatureGateProps) {
  return <>{children}</>;
}

export function useIsLiteTier(): { isLiteTier: boolean; isLoading: boolean } {
  return {
    isLiteTier: false,
    isLoading: false,
  };
}

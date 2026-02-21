import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";

/**
 * Hook to ensure user is a platform admin
 * Redirects to home if not
 */
export function usePlatformAdmin() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;

    if (!user || !user.roles || !user.roles.includes('platform_admin')) {
      // Not a platform admin - redirect to home
      setLocation('/');
    }
  }, [user, isLoading, setLocation]);

  return {
    isPlatformAdmin: user?.roles?.includes('platform_admin') || false,
    isLoading,
  };
}

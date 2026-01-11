import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface RequirePageAccessProps {
  pageId: string;
  children: React.ReactNode;
  fallbackPath?: string;
}

/**
 * Route guard component that checks if user has permission to access a page
 * Redirects to fallback path (default: /dashboard) if access is denied
 */
export function RequirePageAccess({ 
  pageId, 
  children, 
  fallbackPath = '/dashboard' 
}: RequirePageAccessProps) {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { canAccessPage, isLoading: permissionsLoading } = usePagePermissions();

  useEffect(() => {
    // Wait for auth to complete
    if (authLoading) {
      return;
    }

    // If not authenticated, redirect to login
    if (!user) {
      navigate('/login');
      return;
    }

    // Wait for permissions to load
    if (permissionsLoading) {
      return;
    }

    // Check if user has access
    const hasAccess = canAccessPage(pageId);

    if (!hasAccess) {
      // Redirect to fallback path
      navigate(fallbackPath);
    }
  }, [pageId, canAccessPage, permissionsLoading, authLoading, user, navigate, fallbackPath]);

  // Show loading state while auth or permissions are loading
  if (authLoading || permissionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If not authenticated, return null while redirecting
  if (!user) {
    return null;
  }

  // Check access one more time before rendering
  const hasAccess = canAccessPage(pageId);

  if (!hasAccess) {
    // Return null while redirecting
    return null;
  }

  // User has access, render children
  return <>{children}</>;
}

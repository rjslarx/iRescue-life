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
 * Redirects to fallback path if access is denied
 * Special handling for dashboard: redirects to calendar if user has calendar access but not dashboard
 * Note: wouter Router already has base path configured, so navigate paths should be relative to base
 */
export function RequirePageAccess({ 
  pageId, 
  children, 
  fallbackPath
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

    // Foster users always have access to the dashboard - it renders a dedicated foster view
    const isFosterDashboard = pageId === 'dashboard' && user.activeRole === 'foster';

    if (!hasAccess && !isFosterDashboard) {
      // Smart redirect: if accessing dashboard without permission but has calendar access,
      // redirect to calendar instead of generic fallback (prevents redirect loops)
      // Note: paths are relative to wouter base path, no need to prepend basePath
      if (pageId === 'dashboard' && canAccessPage('calendar')) {
        navigate('/dashboard/calendar');
      } else {
        // Use provided fallback or default to dashboard
        navigate(fallbackPath || '/dashboard');
      }
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

  // Foster users always have access to the dashboard - it renders a dedicated foster view
  const isFosterDashboard = pageId === 'dashboard' && user.activeRole === 'foster';

  if (!hasAccess && !isFosterDashboard) {
    // Return null while redirecting
    return null;
  }

  // User has access, render children
  return <>{children}</>;
}

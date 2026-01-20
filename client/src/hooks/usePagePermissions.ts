import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

interface PagePermission {
  id: string;
  pageId: string;
  displayName: string;
  description: string | null;
  allowedRoles: ('admin' | 'board_member' | 'staff' | 'foster' | 'volunteer')[];
  isActive: boolean;
}

/**
 * Hook to check if the current user has permission to access pages
 * Returns functions to check access for specific pages
 */
export function usePagePermissions() {
  const { user } = useAuth();
  
  // Fetch all page permissions for the tenant
  const { data: permissionsData, isLoading } = useQuery<{ pagePermissions: PagePermission[] }>({
    queryKey: ['/api/page-permissions'],
    enabled: !!user, // Only fetch if user is logged in
  });

  const permissions = permissionsData?.pagePermissions || [];
  const userRole = user?.activeRole;

  /**
   * Check if the current user can access a specific page
   * @param pageId - The page identifier (e.g., 'animals', 'finance', 'team')
   * @returns boolean - true if user has access, false otherwise
   */
  const canAccessPage = (pageId: string): boolean => {
    // If no user or no role, deny access
    if (!user || !userRole) {
      return false;
    }

    // Platform admin always has access
    if (userRole === 'platform_admin') {
      return true;
    }

    // Owner and Admin roles always have access to all pages
    // Owner is the organization founder with highest privileges
    if (userRole === 'owner' || userRole === 'admin') {
      return true;
    }

    // Find permission for this page
    const permission = permissions.find(p => p.pageId === pageId && p.isActive);
    
    // If no permission exists, default to admin-only
    if (!permission) {
      return userRole === 'admin';
    }

    // Check if user's role is in the allowed roles
    return permission.allowedRoles.includes(userRole);
  };

  /**
   * Get list of pages the current user can access
   * @returns array of page IDs the user has access to
   */
  const getAccessiblePages = (): string[] => {
    if (!user || !userRole) {
      return [];
    }

    // Platform admin, owner, and admin have access to all pages
    if (userRole === 'platform_admin' || userRole === 'owner' || userRole === 'admin') {
      return permissions.map(p => p.pageId);
    }

    // Filter permissions by user's role
    return permissions
      .filter(p => p.isActive && p.allowedRoles.includes(userRole))
      .map(p => p.pageId);
  };

  return {
    canAccessPage,
    getAccessiblePages,
    permissions,
    isLoading,
  };
}

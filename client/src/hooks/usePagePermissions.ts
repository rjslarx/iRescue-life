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

interface UserPagePermission {
  id: string;
  pageId: string;
  createdAt: string;
}

// Default permissions when no database records exist
// These provide sensible fallbacks for each role
const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  volunteer: ['calendar', 'volunteers', 'animals', 'tutorials'],
  foster: ['my-fosters', 'animals', 'tutorials', 'kennels'],
  staff: ['dashboard', 'animals', 'applications', 'foster-management', 'volunteers', 'calendar', 'kennels', 'medical-tasks', 'tutorials'],
  board_member: ['dashboard', 'animals', 'applications', 'foster-management', 'volunteers', 'calendar', 'finance', 'grants', 'donors', 'analytics', 'reports', 'kennels', 'medical-tasks', 'tutorials'],
};

/**
 * Hook to check if the current user has permission to access pages
 * Returns functions to check access for specific pages
 */
export function usePagePermissions() {
  const { user } = useAuth();
  
  // Fetch all page permissions for the tenant (role-based)
  const { data: permissionsData, isLoading: isLoadingRolePermissions } = useQuery<{ pagePermissions: PagePermission[] }>({
    queryKey: ['/api/page-permissions'],
    enabled: !!user, // Only fetch if user is logged in
  });

  // Fetch user-specific page permissions
  const { data: userPermissionsData, isLoading: isLoadingUserPermissions } = useQuery<{ permissions: UserPagePermission[] }>({
    queryKey: ['/api/user-page-permissions/me'],
    enabled: !!user, // Only fetch if user is logged in
  });

  const permissions = permissionsData?.pagePermissions || [];
  const userPermissions = userPermissionsData?.permissions || [];
  const userRole = user?.activeRole;
  const isLoading = isLoadingRolePermissions || isLoadingUserPermissions;

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

    // Admin and owner roles always have access to all pages
    if (userRole === 'admin' || userRole === 'owner') {
      return true;
    }

    // Check user-specific permissions first (grants access beyond role)
    if (userPermissions.some(p => p.pageId === pageId)) {
      return true;
    }

    // If permissions table has any records, use database permissions only
    if (permissions.length > 0) {
      const permission = permissions.find(p => p.pageId === pageId && p.isActive);
      if (permission) {
        return permission.allowedRoles.includes(userRole as any);
      }
      // Page not configured in database - deny by default
      return false;
    }

    // No database permissions configured - use default role permissions
    const defaultPages = DEFAULT_ROLE_PERMISSIONS[userRole];
    if (defaultPages) {
      return defaultPages.includes(pageId);
    }

    // Ultimate fallback: admin-only
    return userRole === 'admin' || userRole === 'owner';
  };

  /**
   * Get list of pages the current user can access
   * @returns array of page IDs the user has access to
   */
  const getAccessiblePages = (): string[] => {
    if (!user || !userRole) {
      return [];
    }

    // Start with user-specific granted permissions
    const accessiblePages = new Set<string>(userPermissions.map(p => p.pageId));

    // Platform admin, admin, and owner have access to all pages
    if (userRole === 'platform_admin' || userRole === 'admin' || userRole === 'owner') {
      // Return all known page IDs
      permissions.forEach(p => accessiblePages.add(p.pageId));
      Object.values(DEFAULT_ROLE_PERMISSIONS).flat().forEach(p => accessiblePages.add(p));
      return Array.from(accessiblePages);
    }

    // If permissions table has records, use database permissions only
    if (permissions.length > 0) {
      permissions
        .filter(p => p.isActive && p.allowedRoles.includes(userRole as any))
        .forEach(p => accessiblePages.add(p.pageId));
      return Array.from(accessiblePages);
    }

    // No database permissions configured - use defaults for this role
    (DEFAULT_ROLE_PERMISSIONS[userRole] || []).forEach(p => accessiblePages.add(p));
    return Array.from(accessiblePages);
  };

  return {
    canAccessPage,
    getAccessiblePages,
    permissions,
    userPermissions,
    isLoading,
  };
}

import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, X, Lock } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface PagePermission {
  id: string;
  pageId: string;
  displayName: string;
  description: string | null;
  isActive: boolean;
}

interface UserPagePermission {
  id: string;
  pageId: string;
  grantedBy: string | null;
  createdAt: string;
}

interface UserPagePermissionsManagerProps {
  userId: string;
  userRoles: string[];
}

const DEFAULT_GRANTABLE_PAGES = [
  { pageId: 'volunteer-applications', displayName: 'Volunteer Applications', description: 'Manage volunteer application pipeline' },
  { pageId: 'applications', displayName: 'Adoption Applications', description: 'Manage adoption application pipeline' },
  { pageId: 'foster-management', displayName: 'Foster Management', description: 'Manage foster application pipeline' },
  { pageId: 'animals', displayName: 'Animals', description: 'View and manage animals' },
  { pageId: 'medical-tasks', displayName: 'Medical Tasks', description: 'View and complete medical tasks' },
  { pageId: 'calendar', displayName: 'Calendar', description: 'View organization calendar' },
  { pageId: 'volunteers', displayName: 'Volunteers', description: 'Manage volunteer opportunities' },
];

export function UserPagePermissionsManager({ userId, userRoles }: UserPagePermissionsManagerProps) {
  const { toast } = useToast();

  const { data: allPagesData, isLoading: isLoadingPages } = useQuery<{ pagePermissions: PagePermission[] }>({
    queryKey: ['/api/page-permissions'],
  });

  const { data: userPermsData, isLoading: isLoadingUserPerms } = useQuery<{ permissions: UserPagePermission[] }>({
    queryKey: ['/api/user-page-permissions', userId],
    enabled: !!userId,
  });

  const grantPermissionMutation = useMutation({
    mutationFn: async (pageId: string) => {
      return await apiRequest("POST", "/api/user-page-permissions", {
        userId,
        pageId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user-page-permissions', userId] });
      toast({
        title: "Permission Granted",
        description: "The user now has access to this page.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const revokePermissionMutation = useMutation({
    mutationFn: async (pageId: string) => {
      return await apiRequest("DELETE", `/api/user-page-permissions/${userId}/${pageId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user-page-permissions', userId] });
      toast({
        title: "Permission Revoked",
        description: "The user no longer has access to this page.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isLoading = isLoadingPages || isLoadingUserPerms;
  const allPages = allPagesData?.pagePermissions || [];
  const userPermissions = userPermsData?.permissions || [];
  const grantedPageIds = new Set(userPermissions.map(p => p.pageId));

  const grantablePages = allPages.length > 0 
    ? allPages.filter(p => p.isActive).map(p => ({ pageId: p.pageId, displayName: p.displayName, description: p.description }))
    : DEFAULT_GRANTABLE_PAGES;

  const availablePages = grantablePages.filter(p => !grantedPageIds.has(p.pageId));

  if (userRoles.includes('admin') || userRoles.includes('owner') || userRoles.includes('platform_admin')) {
    return (
      <div className="bg-muted/50 border rounded-lg p-3 mt-2 space-y-1" data-testid="section-full-access">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4" />
          <span className="text-sm font-medium">Full Access</span>
        </div>
        <p className="text-xs text-muted-foreground">
          This user has admin access to all pages.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4" data-testid="loading-permissions">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  const getPageDisplayName = (pageId: string) => {
    const dbPage = allPages.find(p => p.pageId === pageId);
    if (dbPage) return dbPage.displayName;
    const defaultPage = DEFAULT_GRANTABLE_PAGES.find(p => p.pageId === pageId);
    if (defaultPage) return defaultPage.displayName;
    return pageId;
  };

  return (
    <div className="space-y-3" data-testid="section-user-permissions">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Grant access to specific pages beyond their role's default permissions.
        </p>
      </div>

      {userPermissions.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="list-granted-permissions">
          {userPermissions.map((perm) => (
            <Badge
              key={perm.id}
              variant="secondary"
              className="cursor-pointer"
              onClick={() => revokePermissionMutation.mutate(perm.pageId)}
              data-testid={`badge-permission-${perm.pageId}`}
            >
              <span>{getPageDisplayName(perm.pageId)}</span>
              <X className="h-3 w-3 ml-1.5" data-testid={`button-revoke-permission-${perm.pageId}`} />
            </Badge>
          ))}
        </div>
      )}

      {availablePages.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              data-testid="button-add-permission"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Page Access
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-1" align="start">
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {availablePages.map((page) => (
                <Button
                  key={page.pageId}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-left h-auto min-h-8"
                  onClick={() => grantPermissionMutation.mutate(page.pageId)}
                  disabled={grantPermissionMutation.isPending}
                  data-testid={`option-grant-permission-${page.pageId}`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-normal truncate block">
                      {page.displayName}
                    </span>
                    {page.description && (
                      <span className="text-xs text-muted-foreground truncate block">
                        {page.description}
                      </span>
                    )}
                  </div>
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {userPermissions.length === 0 && availablePages.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2" data-testid="text-no-pages">
          No additional pages available to grant.
        </p>
      )}
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Shield, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PagePermission {
  id: string;
  pageId: string;
  displayName: string;
  description: string | null;
  allowedRoles: ('admin' | 'board_member' | 'staff' | 'foster' | 'volunteer')[];
  isActive: boolean;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

const ROLES = [
  { value: "admin", label: "Admin", description: "Full system access" },
  { value: "board_member", label: "Board Member", description: "Leadership & oversight" },
  { value: "staff", label: "Staff", description: "Day-to-day operations" },
  { value: "foster", label: "Foster", description: "Foster care management" },
  { value: "volunteer", label: "Volunteer", description: "Limited access" },
] as const;

export default function PagePermissionsPage() {
  const { user: currentUser, tenant } = useAuth();
  const { toast } = useToast();
  const [editingPageId, setEditingPageId] = useState<string | null>(null);

  const rescueName = tenant?.name || "Rescue Portal";

  const { data: permissionsData, isLoading } = useQuery<{ pagePermissions: PagePermission[] }>({
    queryKey: ['/api/page-permissions'],
  });

  const updatePermissionMutation = useMutation({
    mutationFn: async (data: { id: string; allowedRoles: string[] }) => {
      return await apiRequest('PATCH', `/api/page-permissions/${data.id}`, {
        allowedRoles: data.allowedRoles,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/page-permissions'] });
      setEditingPageId(null);
      toast({ title: "Page permissions updated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update permissions",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const handleToggleRole = (permission: PagePermission, role: string) => {
    const allowedRoles = [...permission.allowedRoles];
    const roleIndex = allowedRoles.indexOf(role as any);
    
    if (roleIndex > -1) {
      allowedRoles.splice(roleIndex, 1);
    } else {
      allowedRoles.push(role as any);
    }

    updatePermissionMutation.mutate({
      id: permission.id,
      allowedRoles,
    });
  };

  const permissions = permissionsData?.pagePermissions || [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="border-b p-4">
        <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-page-title">
          Page Permissions
        </h1>
        <p className="text-sm text-muted-foreground">
          Control which roles can access each page
        </p>
      </header>
      <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="max-w-6xl mx-auto space-y-6">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Configure which roles have access to each page in the dashboard. Users will only see
                  navigation items and pages that their role allows them to access.
                </AlertDescription>
              </Alert>

              <Card className="p-6">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : permissions.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No page permissions found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[200px]">Page</TableHead>
                          <TableHead className="min-w-[300px]">Description</TableHead>
                          <TableHead className="text-center min-w-[100px]">Admin</TableHead>
                          <TableHead className="text-center min-w-[120px]">Board</TableHead>
                          <TableHead className="text-center min-w-[100px]">Staff</TableHead>
                          <TableHead className="text-center min-w-[100px]">Foster</TableHead>
                          <TableHead className="text-center min-w-[120px]">Volunteer</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {permissions.map((permission) => (
                          <TableRow key={permission.id} data-testid={`row-permission-${permission.pageId}`}>
                            <TableCell className="font-medium">
                              {permission.displayName}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {permission.description}
                            </TableCell>
                            {ROLES.map((role) => {
                              const hasAccess = permission.allowedRoles.includes(role.value);
                              const isAdmin = role.value === 'admin';
                              
                              return (
                                <TableCell key={role.value} className="text-center">
                                  <div className="flex justify-center">
                                    <Checkbox
                                      data-testid={`checkbox-${permission.pageId}-${role.value}`}
                                      checked={hasAccess}
                                      disabled={isAdmin || updatePermissionMutation.isPending}
                                      onCheckedChange={() => !isAdmin && handleToggleRole(permission, role.value)}
                                      aria-label={`${role.label} access to ${permission.displayName}`}
                                    />
                                  </div>
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>Note:</strong> Admin role always has access to all pages and cannot be restricted.
                  Changes take effect immediately for all users.
                </AlertDescription>
              </Alert>
            </div>
      </main>
    </div>
  );
}

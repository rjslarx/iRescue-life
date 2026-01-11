import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Shield, UserPlus, X, Globe } from "lucide-react";

interface Animal {
  id: string;
  name: string;
  species: string;
  status: string;
}

interface MedicalRecordPermission {
  id: string;
  userId: string;
  animalId: string;
  canEdit: boolean;
  userName: string;
  userEmail: string;
}

interface MedicalRecordRolePermission {
  id: string;
  animalId: string;
  role: "admin" | "staff" | "board_member" | "foster" | "volunteer";
  canEdit: boolean;
}

interface GlobalMedicalRecordRolePermission {
  id: string;
  role: "admin" | "staff" | "board_member" | "foster" | "volunteer";
  canView: boolean;
  canEdit: boolean;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface User {
  id: string;
  email: string;
  fullName: string;
}

const ROLES = [
  { value: "volunteer", label: "Volunteers" },
  { value: "foster", label: "Fosters" },
  { value: "staff", label: "Staff" },
  { value: "board_member", label: "Board Members" },
] as const;

export default function MedicalRecordPermissionsPage() {
  const { user: currentUser, tenant } = useAuth();
  const { toast } = useToast();
  const [managingAnimal, setManagingAnimal] = useState<Animal | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("");

  const rescueName = tenant?.name || "Rescue Portal";
  const userName = currentUser?.fullName || "";
  const userRole = currentUser?.activeRole || "volunteer";

  const { data: animalsData, isLoading: animalsLoading } = useQuery<{ animals: Animal[] }>({
    queryKey: ['/api/animals'],
  });

  const { data: usersData } = useQuery<{ users: User[] }>({
    queryKey: ['/api/users'],
  });

  const { data: permissionsData, isLoading: permissionsLoading } = useQuery<{ permissions: MedicalRecordPermission[] }>({
    queryKey: ['/api/animals', managingAnimal?.id, 'medical-permissions'],
    enabled: !!managingAnimal,
  });

  const { data: rolePermissionsData, isLoading: rolePermissionsLoading } = useQuery<{ rolePermissions: MedicalRecordRolePermission[] }>({
    queryKey: ['/api/animals', managingAnimal?.id, 'medical-role-permissions'],
    enabled: !!managingAnimal,
  });

  const { data: globalPermissionsData, isLoading: globalPermissionsLoading } = useQuery<{ globalPermissions: GlobalMedicalRecordRolePermission[] }>({
    queryKey: ['/api/global-medical-role-permissions'],
  });

  const saveGlobalPermissionMutation = useMutation({
    mutationFn: async (data: { role: string; canView: boolean; canEdit: boolean }) => {
      return await apiRequest('POST', '/api/global-medical-role-permissions', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/global-medical-role-permissions'] });
      toast({ title: "Global permission saved successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save global permission",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const deleteGlobalPermissionMutation = useMutation({
    mutationFn: async (permissionId: string) => {
      return await apiRequest('DELETE', `/api/global-medical-role-permissions/${permissionId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/global-medical-role-permissions'] });
      toast({ title: "Global permission removed successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to remove global permission",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const addPermissionMutation = useMutation({
    mutationFn: async (data: { userId: string; canEdit: boolean }) => {
      return await apiRequest('POST', `/api/animals/${managingAnimal!.id}/medical-permissions`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals', managingAnimal?.id, 'medical-permissions'] });
      setSelectedUserId("");
      toast({ title: "Permission granted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to grant permission",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const revokePermissionMutation = useMutation({
    mutationFn: async (permissionId: string) => {
      return await apiRequest('DELETE', `/api/animals/${managingAnimal!.id}/medical-permissions/${permissionId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals', managingAnimal?.id, 'medical-permissions'] });
      toast({ title: "Permission revoked successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to revoke permission",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const addRolePermissionMutation = useMutation({
    mutationFn: async (data: { role: string; canEdit: boolean }) => {
      return await apiRequest('POST', `/api/animals/${managingAnimal!.id}/medical-role-permissions`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals', managingAnimal?.id, 'medical-role-permissions'] });
      setSelectedRole("");
      toast({ title: "Role permission granted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to grant role permission",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const revokeRolePermissionMutation = useMutation({
    mutationFn: async (permissionId: string) => {
      return await apiRequest('DELETE', `/api/animals/${managingAnimal!.id}/medical-role-permissions/${permissionId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals', managingAnimal?.id, 'medical-role-permissions'] });
      toast({ title: "Role permission revoked successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to revoke role permission",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const handleGrantPermission = (canEdit: boolean) => {
    if (!selectedUserId) {
      toast({
        title: "Please select a user",
        variant: "destructive",
      });
      return;
    }
    addPermissionMutation.mutate({ userId: selectedUserId, canEdit });
  };

  const handleGrantRolePermission = (canEdit: boolean) => {
    if (!selectedRole) {
      toast({
        title: "Please select a role",
        variant: "destructive",
      });
      return;
    }
    addRolePermissionMutation.mutate({ role: selectedRole, canEdit });
  };

  const animals = animalsData?.animals || [];
  const users = usersData?.users || [];
  const permissions = permissionsData?.permissions || [];
  const rolePermissions = rolePermissionsData?.rolePermissions || [];
  const globalPermissions = globalPermissionsData?.globalPermissions || [];

  const availableUsers = users.filter(
    u => !permissions.some(p => p.userId === u.id)
  );

  const availableRoles = ROLES.filter(
    r => !rolePermissions.some(rp => rp.role === r.value)
  );

  const handleToggleGlobalPermission = (role: string, field: 'canView' | 'canEdit', value: boolean) => {
    const existing = globalPermissions.find(p => p.role === role);
    
    // Start with existing values or defaults
    let canView = existing?.canView ?? false;
    let canEdit = existing?.canEdit ?? false;
    
    // Update the field being toggled
    if (field === 'canView') {
      canView = value;
      // If disabling view, also disable edit
      if (!value) {
        canEdit = false;
      }
    } else if (field === 'canEdit') {
      canEdit = value;
      // If enabling edit, also enable view
      if (value) {
        canView = true;
      }
    }
    
    saveGlobalPermissionMutation.mutate({
      role,
      canView,
      canEdit,
    });
  };

  const handleRemoveGlobalPermission = (permissionId: string) => {
    deleteGlobalPermissionMutation.mutate(permissionId);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="border-b p-4">
        <h1 className="text-xl sm:text-2xl font-bold">Medical Records Permissions</h1>
      </header>
      <main className="flex-1 overflow-auto p-6">
            {animalsLoading && globalPermissionsLoading ? (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="w-8 h-8 animate-spin" data-testid="loader-animals" />
              </div>
            ) : (
              <div className="space-y-6">
                <p className="text-muted-foreground">
                  Control who can view and edit medical records. Set global defaults for all animals or manage individual animal permissions.
                </p>

                {/* Global Permissions Section */}
                <Card data-testid="card-global-permissions">
                  <div className="p-4 border-b">
                    <div className="flex items-center gap-2">
                      <Globe className="h-5 w-5 text-primary" />
                      <h2 className="text-lg font-semibold">Global Medical Record Permissions</h2>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Set default view/edit permissions for all animals by role. Individual animal permissions override these settings. Admins always have full access.
                    </p>
                  </div>
                  <div className="p-4">
                    {globalPermissionsLoading ? (
                      <div className="flex justify-center p-8">
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Role</TableHead>
                              <TableHead className="text-center">Can View</TableHead>
                              <TableHead className="text-center">Can Edit</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {ROLES.map((role) => {
                              const permission = globalPermissions.find(p => p.role === role.value);
                              return (
                                <TableRow key={role.value} data-testid={`global-permission-row-${role.value}`}>
                                  <TableCell className="font-medium">{role.label}</TableCell>
                                  <TableCell className="text-center">
                                    <Checkbox
                                      checked={permission?.canView ?? false}
                                      onCheckedChange={(checked) => 
                                        handleToggleGlobalPermission(role.value, 'canView', checked as boolean)
                                      }
                                      disabled={saveGlobalPermissionMutation.isPending}
                                      data-testid={`checkbox-view-${role.value}`}
                                    />
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Checkbox
                                      checked={permission?.canEdit ?? false}
                                      onCheckedChange={(checked) => 
                                        handleToggleGlobalPermission(role.value, 'canEdit', checked as boolean)
                                      }
                                      disabled={saveGlobalPermissionMutation.isPending}
                                      data-testid={`checkbox-edit-${role.value}`}
                                    />
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {permission && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleRemoveGlobalPermission(permission.id)}
                                        disabled={deleteGlobalPermissionMutation.isPending}
                                        data-testid={`button-remove-global-${role.value}`}
                                      >
                                        <X className="w-4 h-4" />
                                        Reset
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </Card>

                {/* Individual Animal Permissions Section */}
                <div>
                  <h2 className="text-lg font-semibold mb-4">Individual Animal Permissions</h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    Override global permissions for specific animals.
                  </p>
                
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {animals.map((animal) => (
                    <Card key={animal.id} className="p-4 hover-elevate">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate" data-testid={`animal-name-${animal.id}`}>
                            {animal.name}
                          </h3>
                          <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{animal.species}</span>
                            <span>•</span>
                            <span>{animal.status}</span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setManagingAnimal(animal)}
                          data-testid={`button-manage-permissions-${animal.id}`}
                        >
                          <Shield className="w-4 h-4" />
                          Manage
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>

                  {animals.length === 0 && (
                    <Card className="p-8">
                      <div className="text-center text-muted-foreground">
                        No animals found. Add animals to manage their medical record permissions.
                      </div>
                    </Card>
                  )}
                </div>
              </div>
            )}
          </main>

      <Dialog open={!!managingAnimal} onOpenChange={() => setManagingAnimal(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Medical Records Permissions - {managingAnimal?.name}
            </DialogTitle>
            <DialogDescription>
              Manage who can view and edit medical records for this animal
            </DialogDescription>
          </DialogHeader>

          {managingAnimal && (
            <Tabs defaultValue="users" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="users" data-testid="tab-user-permissions">
                  User Permissions
                </TabsTrigger>
                <TabsTrigger value="roles" data-testid="tab-role-permissions">
                  Role Permissions
                </TabsTrigger>
              </TabsList>

              <TabsContent value="users" className="space-y-4">
                <div className="flex gap-2">
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger className="flex-1" data-testid="select-user">
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.fullName} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => handleGrantPermission(false)}
                    disabled={!selectedUserId || addPermissionMutation.isPending}
                    data-testid="button-grant-view-permission"
                  >
                    <UserPlus className="w-4 h-4" />
                    View Only
                  </Button>
                  <Button
                    onClick={() => handleGrantPermission(true)}
                    disabled={!selectedUserId || addPermissionMutation.isPending}
                    data-testid="button-grant-edit-permission"
                  >
                    <UserPlus className="w-4 h-4" />
                    Can Edit
                  </Button>
                </div>

                {permissionsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : permissions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Access Level</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {permissions.map((permission) => (
                          <TableRow key={permission.id} data-testid={`permission-row-${permission.id}`}>
                            <TableCell>{permission.userName}</TableCell>
                            <TableCell>{permission.userEmail}</TableCell>
                            <TableCell>
                              <Badge variant={permission.canEdit ? "default" : "secondary"}>
                                {permission.canEdit ? "Can Edit" : "View Only"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => revokePermissionMutation.mutate(permission.id)}
                                disabled={revokePermissionMutation.isPending}
                                data-testid={`button-revoke-${permission.id}`}
                              >
                                <X className="w-4 h-4" />
                                Revoke
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <Card className="p-8">
                    <div className="text-center text-muted-foreground">
                      No user permissions set. Add users above to grant access.
                    </div>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="roles" className="space-y-4">
                <div className="flex gap-2">
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger className="flex-1" data-testid="select-role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRoles.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => handleGrantRolePermission(false)}
                    disabled={!selectedRole || addRolePermissionMutation.isPending}
                    data-testid="button-grant-role-view-permission"
                  >
                    <UserPlus className="w-4 h-4" />
                    View Only
                  </Button>
                  <Button
                    onClick={() => handleGrantRolePermission(true)}
                    disabled={!selectedRole || addRolePermissionMutation.isPending}
                    data-testid="button-grant-role-edit-permission"
                  >
                    <UserPlus className="w-4 h-4" />
                    Can Edit
                  </Button>
                </div>

                {rolePermissionsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : rolePermissions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Role</TableHead>
                          <TableHead>Access Level</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rolePermissions.map((permission) => (
                          <TableRow key={permission.id} data-testid={`role-permission-row-${permission.id}`}>
                            <TableCell>
                              {ROLES.find((r) => r.value === permission.role)?.label || permission.role}
                            </TableCell>
                            <TableCell>
                              <Badge variant={permission.canEdit ? "default" : "secondary"}>
                                {permission.canEdit ? "Can Edit" : "View Only"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => revokeRolePermissionMutation.mutate(permission.id)}
                                disabled={revokeRolePermissionMutation.isPending}
                                data-testid={`button-revoke-role-${permission.id}`}
                              >
                                <X className="w-4 h-4" />
                                Revoke
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <Card className="p-8">
                    <div className="text-center text-muted-foreground">
                      No role permissions set. Add roles above to grant access.
                    </div>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

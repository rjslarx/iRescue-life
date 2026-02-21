import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Shield, UserPlus, X, Info, CalendarPlus, Edit2, Trash2, Globe } from "lucide-react";

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
  tenantId: string;
  role: "admin" | "staff" | "board_member" | "foster" | "volunteer";
  canView: boolean;
  canEdit: boolean;
}

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

interface Calendar {
  id: string;
  name: string;
  description: string | null;
  type: "volunteer" | "events" | "fundraising" | "vet_appointments" | "custom";
  color: string;
  isActive: boolean;
  isPublic: boolean;
  canEdit: boolean;
}

interface CalendarPermission {
  id: string;
  userId: string;
  calendarId: string;
  canEdit: boolean;
  userName: string;
  userEmail: string;
}

interface CalendarRolePermission {
  id: string;
  calendarId: string;
  role: "admin" | "staff" | "board_member" | "foster" | "volunteer";
  canEdit: boolean;
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

const PAGE_ROLES = [
  { value: "admin", label: "Admin", description: "Full system access" },
  { value: "board_member", label: "Board Member", description: "Leadership & oversight" },
  { value: "staff", label: "Staff", description: "Day-to-day operations" },
  { value: "foster", label: "Foster", description: "Foster care management" },
  { value: "volunteer", label: "Volunteer", description: "Limited access" },
] as const;

const CALENDAR_TYPES = [
  { value: "volunteer", label: "Volunteer Schedule" },
  { value: "events", label: "Events Calendar" },
  { value: "fundraising", label: "Fundraising Calendar" },
  { value: "vet_appointments", label: "Vet Appointments" },
  { value: "custom", label: "Custom Calendar" },
] as const;

const CALENDAR_COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
];

export default function SitePermissionsPage() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  
  // Medical permissions state
  const [managingAnimal, setManagingAnimal] = useState<Animal | null>(null);
  const [selectedMedicalUserId, setSelectedMedicalUserId] = useState<string>("");
  const [selectedMedicalRole, setSelectedMedicalRole] = useState<string>("");

  // Calendar permissions state
  const [createCalendarDialogOpen, setCreateCalendarDialogOpen] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<Calendar | null>(null);
  const [calendarToDelete, setCalendarToDelete] = useState<Calendar | null>(null);
  const [managingCalendarPermissions, setManagingCalendarPermissions] = useState<Calendar | null>(null);
  const [selectedCalendarUserId, setSelectedCalendarUserId] = useState<string>("");
  const [selectedCalendarRole, setSelectedCalendarRole] = useState<string>("");
  const [newCalendar, setNewCalendar] = useState({
    name: "",
    description: "",
    type: "custom" as Calendar["type"],
    color: CALENDAR_COLORS[0],
    isPublic: false,
  });

  // Queries
  const { data: animalsData, isLoading: animalsLoading } = useQuery<{ animals: Animal[] }>({
    queryKey: ['/api/animals'],
  });

  const { data: usersData } = useQuery<{ users: User[] }>({
    queryKey: ['/api/users'],
  });

  const { data: medicalPermissionsData, isLoading: medicalPermissionsLoading } = useQuery<{ permissions: MedicalRecordPermission[] }>({
    queryKey: ['/api/animals', managingAnimal?.id, 'medical-permissions'],
    enabled: !!managingAnimal,
  });

  const { data: medicalRolePermissionsData, isLoading: medicalRolePermissionsLoading } = useQuery<{ rolePermissions: MedicalRecordRolePermission[] }>({
    queryKey: ['/api/animals', managingAnimal?.id, 'medical-role-permissions'],
    enabled: !!managingAnimal,
  });

  const { data: pagePermissionsData, isLoading: pagePermissionsLoading } = useQuery<{ pagePermissions: PagePermission[] }>({
    queryKey: ['/api/page-permissions'],
  });

  const { data: calendarsData, isLoading: calendarsLoading } = useQuery<{ calendars: Calendar[] }>({
    queryKey: ['/api/calendars'],
    enabled: currentUser?.activeRole === 'admin',
  });

  const { data: calendarPermissionsData } = useQuery<{ permissions: CalendarPermission[] }>({
    queryKey: ['/api/calendars', managingCalendarPermissions?.id, 'permissions'],
    enabled: !!managingCalendarPermissions,
  });

  const { data: calendarRolePermissionsData } = useQuery<{ rolePermissions: CalendarRolePermission[] }>({
    queryKey: ['/api/calendars', managingCalendarPermissions?.id, 'role-permissions'],
    enabled: !!managingCalendarPermissions,
  });

  const { data: globalMedicalPermissionsData, isLoading: globalMedicalPermissionsLoading } = useQuery<{ permissions: GlobalMedicalRecordRolePermission[] }>({
    queryKey: ['/api/global-medical-role-permissions'],
  });

  // Medical permissions mutations
  const addMedicalPermissionMutation = useMutation({
    mutationFn: async (data: { userId: string; canEdit: boolean }) => {
      return await apiRequest('POST', `/api/animals/${managingAnimal!.id}/medical-permissions`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals', managingAnimal?.id, 'medical-permissions'] });
      setSelectedMedicalUserId("");
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

  const revokeMedicalPermissionMutation = useMutation({
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

  const addMedicalRolePermissionMutation = useMutation({
    mutationFn: async (data: { role: string; canEdit: boolean }) => {
      return await apiRequest('POST', `/api/animals/${managingAnimal!.id}/medical-role-permissions`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals', managingAnimal?.id, 'medical-role-permissions'] });
      setSelectedMedicalRole("");
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

  const revokeMedicalRolePermissionMutation = useMutation({
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

  // Global medical permissions mutations
  const saveGlobalMedicalPermissionMutation = useMutation({
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

  const deleteGlobalMedicalPermissionMutation = useMutation({
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

  // Page permissions mutations
  const updatePagePermissionMutation = useMutation({
    mutationFn: async (data: { id: string; allowedRoles: string[] }) => {
      return await apiRequest('PATCH', `/api/page-permissions/${data.id}`, {
        allowedRoles: data.allowedRoles,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/page-permissions'] });
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

  // Calendar mutations
  const createCalendarMutation = useMutation({
    mutationFn: async (calendarData: typeof newCalendar) => {
      return await apiRequest("POST", "/api/calendars", calendarData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendars'] });
      setCreateCalendarDialogOpen(false);
      setNewCalendar({
        name: "",
        description: "",
        type: "custom",
        color: CALENDAR_COLORS[0],
        isPublic: false,
      });
      toast({
        title: "Calendar Created",
        description: "The new calendar has been successfully created.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateCalendarMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Calendar> }) => {
      return await apiRequest("PATCH", `/api/calendars/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendars'] });
      setEditingCalendar(null);
      toast({
        title: "Calendar Updated",
        description: "The calendar has been successfully updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteCalendarMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/calendars/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendars'] });
      setCalendarToDelete(null);
      toast({
        title: "Calendar Deleted",
        description: "The calendar has been successfully deleted.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Deletion Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addCalendarPermissionMutation = useMutation({
    mutationFn: async ({ calendarId, userId }: { calendarId: string; userId: string }) => {
      return await apiRequest("POST", `/api/calendars/${calendarId}/permissions`, {
        userId,
        canEdit: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendars', managingCalendarPermissions?.id, 'permissions'] });
      setSelectedCalendarUserId("");
      toast({
        title: "Permission Granted",
        description: "User can now edit this calendar.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Grant Permission",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removeCalendarPermissionMutation = useMutation({
    mutationFn: async ({ calendarId, permissionId }: { calendarId: string; permissionId: string }) => {
      return await apiRequest("DELETE", `/api/calendars/${calendarId}/permissions/${permissionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendars', managingCalendarPermissions?.id, 'permissions'] });
      toast({
        title: "Permission Revoked",
        description: "User can no longer edit this calendar.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Revoke Permission",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addCalendarRolePermissionMutation = useMutation({
    mutationFn: async ({ calendarId, role }: { calendarId: string; role: string }) => {
      return await apiRequest("POST", `/api/calendars/${calendarId}/role-permissions`, {
        role,
        canEdit: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendars', managingCalendarPermissions?.id, 'role-permissions'] });
      setSelectedCalendarRole("");
      toast({
        title: "Role Permission Granted",
        description: "All members with this role can now edit this calendar.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Grant Role Permission",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removeCalendarRolePermissionMutation = useMutation({
    mutationFn: async ({ calendarId, permissionId }: { calendarId: string; permissionId: string }) => {
      return await apiRequest("DELETE", `/api/calendars/${calendarId}/role-permissions/${permissionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendars', managingCalendarPermissions?.id, 'role-permissions'] });
      toast({
        title: "Role Permission Revoked",
        description: "Role members can no longer edit this calendar.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Revoke Role Permission",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handlers
  const handleGrantMedicalPermission = (canEdit: boolean) => {
    if (!selectedMedicalUserId) {
      toast({
        title: "Please select a user",
        variant: "destructive",
      });
      return;
    }
    addMedicalPermissionMutation.mutate({ userId: selectedMedicalUserId, canEdit });
  };

  const handleGrantMedicalRolePermission = (canEdit: boolean) => {
    if (!selectedMedicalRole) {
      toast({
        title: "Please select a role",
        variant: "destructive",
      });
      return;
    }
    addMedicalRolePermissionMutation.mutate({ role: selectedMedicalRole, canEdit });
  };

  const handleToggleGlobalPermission = (role: string, field: 'canView' | 'canEdit', value: boolean) => {
    const existing = globalMedicalPermissions.find(p => p.role === role);
    
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
    
    saveGlobalMedicalPermissionMutation.mutate({
      role,
      canView,
      canEdit,
    });
  };

  const handleRemoveGlobalPermission = (permissionId: string) => {
    deleteGlobalMedicalPermissionMutation.mutate(permissionId);
  };

  const handleTogglePageRole = (permission: PagePermission, role: string) => {
    const allowedRoles = [...permission.allowedRoles];
    const roleIndex = allowedRoles.indexOf(role as any);
    
    if (roleIndex > -1) {
      allowedRoles.splice(roleIndex, 1);
    } else {
      allowedRoles.push(role as any);
    }

    updatePagePermissionMutation.mutate({
      id: permission.id,
      allowedRoles,
    });
  };

  const handleCreateCalendar = (e: React.FormEvent) => {
    e.preventDefault();
    createCalendarMutation.mutate(newCalendar);
  };

  const handleUpdateCalendar = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCalendar) {
      updateCalendarMutation.mutate({
        id: editingCalendar.id,
        data: {
          name: editingCalendar.name,
          description: editingCalendar.description,
          type: editingCalendar.type,
          color: editingCalendar.color,
          isPublic: editingCalendar.isPublic,
        },
      });
    }
  };

  const handleAddCalendarPermission = () => {
    if (managingCalendarPermissions && selectedCalendarUserId) {
      addCalendarPermissionMutation.mutate({
        calendarId: managingCalendarPermissions.id,
        userId: selectedCalendarUserId,
      });
    }
  };

  const handleAddCalendarRolePermission = () => {
    if (managingCalendarPermissions && selectedCalendarRole) {
      addCalendarRolePermissionMutation.mutate({
        calendarId: managingCalendarPermissions.id,
        role: selectedCalendarRole,
      });
    }
  };

  const getRoleLabel = (role: string) => {
    return ROLES.find(r => r.value === role)?.label || role;
  };

  const getTypeLabel = (type: Calendar["type"]) => {
    return CALENDAR_TYPES.find(t => t.value === type)?.label || type;
  };

  const animals = animalsData?.animals || [];
  const users = usersData?.users || [];
  const medicalPermissions = medicalPermissionsData?.permissions || [];
  const globalMedicalPermissions = globalMedicalPermissionsData?.permissions || [];
  const medicalRolePermissions = medicalRolePermissionsData?.rolePermissions || [];
  const pagePermissions = pagePermissionsData?.pagePermissions || [];
  const calendars = calendarsData?.calendars || [];
  const calendarPermissions = calendarPermissionsData?.permissions || [];
  const calendarRolePermissions = calendarRolePermissionsData?.rolePermissions || [];

  const availableMedicalUsers = users.filter(
    u => !medicalPermissions.some(p => p.userId === u.id)
  );

  const availableMedicalRoles = ROLES.filter(
    r => !medicalRolePermissions.some(rp => rp.role === r.value)
  );

  const availableCalendarUsers = users.filter(
    u => !calendarPermissions.some(p => p.userId === u.id)
  );

  const availableCalendarRoles = ROLES.filter(
    r => !calendarRolePermissions.some(rp => rp.role === r.value)
  );

  if (currentUser?.activeRole !== 'admin') {
    return (
      <DashboardLayout
        title="Site Permissions"
        description="Only administrators can manage site permissions"
      >
        <div className="flex-1 overflow-auto p-6">
          <Card className="p-6">
            <h2 className="text-xl font-semibold text-destructive">Access Denied</h2>
            <p className="text-muted-foreground mt-2">
              Only administrators can manage site permissions.
            </p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Site Permissions"
      description="Control access to medical records, calendars, and pages"
    >
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <Tabs defaultValue="medical" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="medical" data-testid="tab-medical-permissions">
              Medical Records
            </TabsTrigger>
            <TabsTrigger value="calendars" data-testid="tab-calendar-permissions">
              Calendars
            </TabsTrigger>
            <TabsTrigger value="pages" data-testid="tab-page-permissions">
              Pages
            </TabsTrigger>
          </TabsList>

          {/* Medical Records Permissions Tab */}
          <TabsContent value="medical" className="space-y-4">
            {animalsLoading && globalMedicalPermissionsLoading ? (
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
                    {globalMedicalPermissionsLoading ? (
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
                              const permission = globalMedicalPermissions.find(p => p.role === role.value);
                              return (
                                <TableRow key={role.value} data-testid={`global-permission-row-${role.value}`}>
                                  <TableCell className="font-medium">{role.label}</TableCell>
                                  <TableCell className="text-center">
                                    <Checkbox
                                      checked={permission?.canView ?? false}
                                      onCheckedChange={(checked) => 
                                        handleToggleGlobalPermission(role.value, 'canView', checked as boolean)
                                      }
                                      disabled={saveGlobalMedicalPermissionMutation.isPending}
                                      data-testid={`checkbox-view-${role.value}`}
                                    />
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Checkbox
                                      checked={permission?.canEdit ?? false}
                                      onCheckedChange={(checked) => 
                                        handleToggleGlobalPermission(role.value, 'canEdit', checked as boolean)
                                      }
                                      disabled={saveGlobalMedicalPermissionMutation.isPending}
                                      data-testid={`checkbox-edit-${role.value}`}
                                    />
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {permission && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleRemoveGlobalPermission(permission.id)}
                                        disabled={deleteGlobalMedicalPermissionMutation.isPending}
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
          </TabsContent>

          {/* Calendar Permissions Tab */}
          <TabsContent value="calendars" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={createCalendarDialogOpen} onOpenChange={setCreateCalendarDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-calendar">
                    <CalendarPlus className="mr-2 h-4 w-4" />
                    Create Calendar
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Calendar</DialogTitle>
                    <DialogDescription>
                      Create a new calendar for your organization.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateCalendar} className="space-y-4">
                    <div>
                      <Label htmlFor="calendar-name">Calendar Name</Label>
                      <Input
                        id="calendar-name"
                        value={newCalendar.name}
                        onChange={(e) => setNewCalendar({ ...newCalendar, name: e.target.value })}
                        placeholder="e.g., Volunteer Schedule"
                        required
                        data-testid="input-calendar-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="calendar-description">Description (Optional)</Label>
                      <Textarea
                        id="calendar-description"
                        value={newCalendar.description}
                        onChange={(e) => setNewCalendar({ ...newCalendar, description: e.target.value })}
                        placeholder="Brief description of this calendar"
                        data-testid="input-calendar-description"
                      />
                    </div>
                    <div>
                      <Label htmlFor="calendar-type">Calendar Type</Label>
                      <Select
                        value={newCalendar.type}
                        onValueChange={(value: Calendar["type"]) => setNewCalendar({ ...newCalendar, type: value })}
                      >
                        <SelectTrigger data-testid="select-calendar-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CALENDAR_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Calendar Color</Label>
                      <div className="flex gap-2 mt-2">
                        {CALENDAR_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className="w-8 h-8 rounded-md border-2 hover-elevate active-elevate-2"
                            style={{
                              backgroundColor: color,
                              borderColor: newCalendar.color === color ? "#000" : "transparent",
                            }}
                            onClick={() => setNewCalendar({ ...newCalendar, color })}
                            data-testid={`button-color-${color}`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="calendar-public"
                        checked={newCalendar.isPublic}
                        onCheckedChange={(checked) => setNewCalendar({ ...newCalendar, isPublic: checked as boolean })}
                        data-testid="checkbox-calendar-public"
                      />
                      <Label htmlFor="calendar-public" className="cursor-pointer">
                        Show events on public home page
                      </Label>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setCreateCalendarDialogOpen(false)}
                        className="flex-1"
                        data-testid="button-cancel-create"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={createCalendarMutation.isPending}
                        className="flex-1"
                        data-testid="button-submit-create"
                      >
                        {createCalendarMutation.isPending ? "Creating..." : "Create Calendar"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {calendarsLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : calendars.length === 0 ? (
              <Card className="p-6">
                <p className="text-muted-foreground text-center">
                  No calendars yet. Create your first calendar to get started.
                </p>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Calendar Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calendars.map((calendar) => (
                      <TableRow 
                        key={calendar.id} 
                        data-testid={`row-calendar-${calendar.id}`}
                      >
                        <TableCell className="font-medium">{calendar.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{getTypeLabel(calendar.type)}</Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {calendar.description || <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-6 h-6 rounded"
                              style={{ backgroundColor: calendar.color }}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Badge variant={calendar.isActive ? "default" : "secondary"}>
                              {calendar.isActive ? "Active" : "Inactive"}
                            </Badge>
                            {calendar.isPublic && (
                              <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400">
                                Public
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setManagingCalendarPermissions(calendar)}
                              data-testid={`button-manage-calendar-permissions-${calendar.id}`}
                            >
                              <UserPlus className="h-4 w-4 mr-1" />
                              Permissions
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingCalendar(calendar)}
                              data-testid={`button-edit-calendar-${calendar.id}`}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setCalendarToDelete(calendar)}
                              data-testid={`button-delete-calendar-${calendar.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* Page Permissions Tab */}
          <TabsContent value="pages" className="space-y-4">
            <div className="max-w-6xl mx-auto space-y-6">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Configure which roles have access to each page in the dashboard. Users will only see
                  navigation items and pages that their role allows them to access.
                </AlertDescription>
              </Alert>

              <Card className="p-6">
                {pagePermissionsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : pagePermissions.length === 0 ? (
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
                        {pagePermissions.map((permission) => (
                          <TableRow key={permission.id} data-testid={`row-permission-${permission.pageId}`}>
                            <TableCell className="font-medium">
                              {permission.displayName}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {permission.description}
                            </TableCell>
                            {PAGE_ROLES.map((role) => {
                              const hasAccess = permission.allowedRoles.includes(role.value);
                              const isAdmin = role.value === 'admin';
                              
                              return (
                                <TableCell key={role.value} className="text-center">
                                  <div className="flex justify-center">
                                    <Checkbox
                                      data-testid={`checkbox-${permission.pageId}-${role.value}`}
                                      checked={hasAccess}
                                      disabled={isAdmin || updatePagePermissionMutation.isPending}
                                      onCheckedChange={() => !isAdmin && handleTogglePageRole(permission, role.value)}
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
          </TabsContent>
        </Tabs>
      </div>

      {/* Medical Record Permissions Dialog */}
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
                <TabsTrigger value="users" data-testid="tab-medical-user-permissions">
                  User Permissions
                </TabsTrigger>
                <TabsTrigger value="roles" data-testid="tab-medical-role-permissions">
                  Role Permissions
                </TabsTrigger>
              </TabsList>

              <TabsContent value="users" className="space-y-4">
                <div className="flex gap-2">
                  <Select value={selectedMedicalUserId} onValueChange={setSelectedMedicalUserId}>
                    <SelectTrigger className="flex-1" data-testid="select-medical-user">
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMedicalUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.fullName} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => handleGrantMedicalPermission(false)}
                    disabled={!selectedMedicalUserId || addMedicalPermissionMutation.isPending}
                    data-testid="button-grant-view-permission"
                  >
                    <UserPlus className="w-4 h-4" />
                    View Only
                  </Button>
                  <Button
                    onClick={() => handleGrantMedicalPermission(true)}
                    disabled={!selectedMedicalUserId || addMedicalPermissionMutation.isPending}
                    data-testid="button-grant-edit-permission"
                  >
                    <UserPlus className="w-4 h-4" />
                    Can Edit
                  </Button>
                </div>

                {medicalPermissionsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : medicalPermissions.length > 0 ? (
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
                        {medicalPermissions.map((permission) => (
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
                                onClick={() => revokeMedicalPermissionMutation.mutate(permission.id)}
                                disabled={revokeMedicalPermissionMutation.isPending}
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
                  <Select value={selectedMedicalRole} onValueChange={setSelectedMedicalRole}>
                    <SelectTrigger className="flex-1" data-testid="select-medical-role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMedicalRoles.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => handleGrantMedicalRolePermission(false)}
                    disabled={!selectedMedicalRole || addMedicalRolePermissionMutation.isPending}
                    data-testid="button-grant-role-view-permission"
                  >
                    <UserPlus className="w-4 h-4" />
                    View Only
                  </Button>
                  <Button
                    onClick={() => handleGrantMedicalRolePermission(true)}
                    disabled={!selectedMedicalRole || addMedicalRolePermissionMutation.isPending}
                    data-testid="button-grant-role-edit-permission"
                  >
                    <UserPlus className="w-4 h-4" />
                    Can Edit
                  </Button>
                </div>

                {medicalRolePermissionsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : medicalRolePermissions.length > 0 ? (
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
                        {medicalRolePermissions.map((permission) => (
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
                                onClick={() => revokeMedicalRolePermissionMutation.mutate(permission.id)}
                                disabled={revokeMedicalRolePermissionMutation.isPending}
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

      {/* Calendar Permissions Dialog - continuing in next part due to length */}
      <Dialog open={!!managingCalendarPermissions} onOpenChange={() => setManagingCalendarPermissions(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Calendar Permissions - {managingCalendarPermissions?.name}
            </DialogTitle>
            <DialogDescription>
              Manage who can edit this calendar
            </DialogDescription>
          </DialogHeader>

          {managingCalendarPermissions && (
            <Tabs defaultValue="users" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="users" data-testid="tab-calendar-user-permissions">
                  User Permissions
                </TabsTrigger>
                <TabsTrigger value="roles" data-testid="tab-calendar-role-permissions">
                  Role Permissions
                </TabsTrigger>
              </TabsList>

              <TabsContent value="users" className="space-y-4">
                <div className="flex gap-2">
                  <Select value={selectedCalendarUserId} onValueChange={setSelectedCalendarUserId}>
                    <SelectTrigger className="flex-1" data-testid="select-calendar-user">
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCalendarUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.fullName} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleAddCalendarPermission}
                    disabled={!selectedCalendarUserId || addCalendarPermissionMutation.isPending}
                    data-testid="button-grant-calendar-permission"
                  >
                    <UserPlus className="w-4 h-4" />
                    Grant Edit Access
                  </Button>
                </div>

                {calendarPermissions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {calendarPermissions.map((permission) => (
                          <TableRow key={permission.id} data-testid={`calendar-permission-row-${permission.id}`}>
                            <TableCell>{permission.userName}</TableCell>
                            <TableCell>{permission.userEmail}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removeCalendarPermissionMutation.mutate({
                                  calendarId: managingCalendarPermissions.id,
                                  permissionId: permission.id,
                                })}
                                disabled={removeCalendarPermissionMutation.isPending}
                                data-testid={`button-revoke-calendar-${permission.id}`}
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
                  <Select value={selectedCalendarRole} onValueChange={setSelectedCalendarRole}>
                    <SelectTrigger className="flex-1" data-testid="select-calendar-role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCalendarRoles.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleAddCalendarRolePermission}
                    disabled={!selectedCalendarRole || addCalendarRolePermissionMutation.isPending}
                    data-testid="button-grant-calendar-role-permission"
                  >
                    <UserPlus className="w-4 h-4" />
                    Grant Edit Access
                  </Button>
                </div>

                {calendarRolePermissions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Role</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {calendarRolePermissions.map((permission) => (
                          <TableRow key={permission.id} data-testid={`calendar-role-permission-row-${permission.id}`}>
                            <TableCell>{getRoleLabel(permission.role)}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removeCalendarRolePermissionMutation.mutate({
                                  calendarId: managingCalendarPermissions.id,
                                  permissionId: permission.id,
                                })}
                                disabled={removeCalendarRolePermissionMutation.isPending}
                                data-testid={`button-revoke-calendar-role-${permission.id}`}
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

      {/* Edit Calendar Dialog */}
      <Dialog open={!!editingCalendar} onOpenChange={() => setEditingCalendar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Calendar</DialogTitle>
            <DialogDescription>
              Update calendar details.
            </DialogDescription>
          </DialogHeader>
          {editingCalendar && (
            <form onSubmit={handleUpdateCalendar} className="space-y-4">
              <div>
                <Label htmlFor="edit-calendar-name">Calendar Name</Label>
                <Input
                  id="edit-calendar-name"
                  value={editingCalendar.name}
                  onChange={(e) => setEditingCalendar({ ...editingCalendar, name: e.target.value })}
                  required
                  data-testid="input-edit-calendar-name"
                />
              </div>
              <div>
                <Label htmlFor="edit-calendar-description">Description</Label>
                <Textarea
                  id="edit-calendar-description"
                  value={editingCalendar.description || ""}
                  onChange={(e) => setEditingCalendar({ ...editingCalendar, description: e.target.value })}
                  data-testid="input-edit-calendar-description"
                />
              </div>
              <div>
                <Label htmlFor="edit-calendar-type">Calendar Type</Label>
                <Select
                  value={editingCalendar.type}
                  onValueChange={(value: Calendar["type"]) => setEditingCalendar({ ...editingCalendar, type: value })}
                >
                  <SelectTrigger data-testid="select-edit-calendar-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CALENDAR_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Calendar Color</Label>
                <div className="flex gap-2 mt-2">
                  {CALENDAR_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="w-8 h-8 rounded-md border-2 hover-elevate active-elevate-2"
                      style={{
                        backgroundColor: color,
                        borderColor: editingCalendar.color === color ? "#000" : "transparent",
                      }}
                      onClick={() => setEditingCalendar({ ...editingCalendar, color })}
                      data-testid={`button-edit-color-${color}`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit-calendar-public"
                  checked={editingCalendar.isPublic}
                  onCheckedChange={(checked) => setEditingCalendar({ ...editingCalendar, isPublic: checked as boolean })}
                  data-testid="checkbox-edit-calendar-public"
                />
                <Label htmlFor="edit-calendar-public" className="cursor-pointer">
                  Show events on public home page
                </Label>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingCalendar(null)}
                  className="flex-1"
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateCalendarMutation.isPending}
                  className="flex-1"
                  data-testid="button-submit-edit"
                >
                  {updateCalendarMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Calendar Confirmation */}
      <AlertDialog open={!!calendarToDelete} onOpenChange={() => setCalendarToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Calendar</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{calendarToDelete?.name}"? All events in this calendar will be removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => calendarToDelete && deleteCalendarMutation.mutate(calendarToDelete.id)}
              data-testid="button-confirm-delete"
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete Calendar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

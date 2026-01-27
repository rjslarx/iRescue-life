import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DashboardLayout from "@/components/DashboardLayout";
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
import { Loader2, UserPlus, Shield, Users as UsersIcon, Trash2, Mail, Clock, Send, Pencil, UserCheck } from "lucide-react";

interface User {
  id: string;
  email: string;
  fullName: string;
  roles: Array<"owner" | "admin" | "board_member" | "staff" | "foster" | "volunteer">;
  createdAt: Date;
}

interface Invitation {
  id: string;
  email: string;
  fullName: string | null;
  roles: Array<"admin" | "board_member" | "staff" | "foster" | "volunteer">;
  expiresAt: Date;
  createdAt: Date;
  invitedBy: {
    id: string;
    fullName: string;
    email: string;
  };
}

interface UsersData {
  users: User[];
}

interface InvitationsData {
  invitations: Invitation[];
}

const AVAILABLE_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "board_member", label: "Board Member" },
  { value: "staff", label: "Staff" },
  { value: "foster", label: "Foster" },
  { value: "volunteer", label: "Volunteer" },
] as const;

export default function TeamManagementPage() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [invitationsDialogOpen, setInvitationsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [invitationToCancel, setInvitationToCancel] = useState<Invitation | null>(null);
  const [selectedRoleTab, setSelectedRoleTab] = useState<string>("all");

  const [newInvitation, setNewInvitation] = useState({
    email: "",
    fullName: "",
    roles: ["volunteer"] as Array<"admin" | "board_member" | "staff" | "foster" | "volunteer">,
  });

  const canAccessTeamData = currentUser?.activeRole === 'admin' || 
    currentUser?.roles?.includes('owner') || 
    currentUser?.roles?.includes('admin');

  const { data: usersData, isLoading: isLoadingUsers } = useQuery<UsersData>({
    queryKey: ['/api/users'],
    enabled: canAccessTeamData,
  });

  const { data: invitationsData, isLoading: isLoadingInvitations } = useQuery<InvitationsData>({
    queryKey: ['/api/invitations'],
    enabled: canAccessTeamData,
  });

  const sendInvitationMutation = useMutation({
    mutationFn: async (invitationData: typeof newInvitation) => {
      return await apiRequest("POST", "/api/invitations", invitationData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invitations'] });
      setInviteDialogOpen(false);
      setNewInvitation({
        email: "",
        fullName: "",
        roles: ["volunteer"],
      });
      toast({
        title: "Invitation Sent",
        description: "The invitation email has been sent successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Invitation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resendInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      return await apiRequest("POST", `/api/invitations/${invitationId}/resend`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invitations'] });
      toast({
        title: "Invitation Resent",
        description: "The invitation email has been sent again.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Resend Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      return await apiRequest("DELETE", `/api/invitations/${invitationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invitations'] });
      setInvitationToCancel(null);
      toast({
        title: "Invitation Cancelled",
        description: "The invitation has been cancelled.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Cancellation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, roles, fullName }: { id: string; roles?: User["roles"]; fullName?: string }) => {
      const payload: { roles?: User["roles"]; fullName?: string } = {};
      if (roles) payload.roles = roles;
      if (fullName) payload.fullName = fullName;
      return await apiRequest("PATCH", `/api/users/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/me'] });
      setEditingUser(null);
      toast({
        title: "User Updated",
        description: "User information has been successfully updated.",
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

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      setUserToDelete(null);
      toast({
        title: "User Deleted",
        description: "The user has been successfully removed.",
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

  const impersonateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("POST", "/api/impersonation/start", { userId });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/impersonation/status'] });
      toast({
        title: "Impersonation Started",
        description: `You are now viewing as ${data.impersonating?.userName || 'the selected user'}.`,
      });
      window.location.reload();
    },
    onError: (error: Error) => {
      toast({
        title: "Impersonation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isOwner = currentUser?.roles?.includes('owner');
  
  const canImpersonate = (user: User) => {
    if (!isOwner) return false;
    if (user.id === currentUser?.id) return false;
    if (user.roles.includes('owner')) return false;
    return true;
  };

  const users = usersData?.users || [];
  const invitations = invitationsData?.invitations || [];

  const filteredUsers = useMemo(() => {
    if (selectedRoleTab === "all") {
      return users;
    }
    return users.filter(user => user.roles.includes(selectedRoleTab as any));
  }, [users, selectedRoleTab]);

  const roleTabsData = useMemo(() => [
    { value: "all", label: "All Members", count: users.length },
    { value: "admin", label: "Admins", count: users.filter(u => u.roles.includes("admin")).length },
    { value: "board_member", label: "Board Members", count: users.filter(u => u.roles.includes("board_member")).length },
    { value: "staff", label: "Staff", count: users.filter(u => u.roles.includes("staff")).length },
    { value: "foster", label: "Fosters", count: users.filter(u => u.roles.includes("foster")).length },
    { value: "volunteer", label: "Volunteers", count: users.filter(u => u.roles.includes("volunteer")).length },
  ], [users]);

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "owner":
        return "default";
      case "admin":
        return "destructive";
      case "board_member":
        return "default";
      case "staff":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      owner: "Owner",
      admin: "Admin",
      board_member: "Board Member",
      staff: "Staff",
      foster: "Foster",
      volunteer: "Volunteer",
    };
    return labels[role] || role;
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString();
  };

  const formatDateTime = (date: Date | string) => {
    return new Date(date).toLocaleString();
  };

  const handleSendInvitation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvitation.fullName.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter the team member's name",
        variant: "destructive",
      });
      return;
    }
    if (newInvitation.roles.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please select at least one role",
        variant: "destructive",
      });
      return;
    }
    sendInvitationMutation.mutate(newInvitation);
  };

  const handleUpdateRoles = (userId: string, newRoles: User["roles"]) => {
    updateUserMutation.mutate({ id: userId, roles: newRoles });
  };

  const toggleRole = (role: string) => {
    setNewInvitation(prev => {
      const isRemoving = prev.roles.includes(role as any);
      const newRoles = isRemoving
        ? prev.roles.filter(r => r !== role)
        : [...prev.roles, role as any];
      
      if (isRemoving && newRoles.length === 0) {
        toast({
          title: "Validation Error",
          description: "At least one role must be selected",
          variant: "destructive",
        });
        return prev;
      }
      
      return { ...prev, roles: newRoles };
    });
  };

  const toggleEditRole = (user: User, role: string) => {
    const isRemoving = user.roles.includes(role as any);
    const newRoles = isRemoving
      ? user.roles.filter(r => r !== role)
      : [...user.roles, role as any];
    
    if (isRemoving && newRoles.length === 0) {
      toast({
        title: "Validation Error",
        description: "At least one role must be selected",
        variant: "destructive",
      });
      return;
    }
    
    handleUpdateRoles(user.id, newRoles);
  };

  const canAccessTeamManagement = currentUser && (
    currentUser.activeRole === 'admin' || 
    currentUser.roles?.includes('owner') ||
    currentUser.roles?.includes('admin')
  );

  if (currentUser && !canAccessTeamManagement) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md p-8 text-center">
          <Shield className="h-16 w-16 mx-auto mb-4 text-destructive" />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">
            Only administrators and owners can access team management. Please contact your admin if you need access.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <DashboardLayout
      title="Team Management"
      description={`${users.length} team member${users.length !== 1 ? 's' : ''} • ${invitations.length} pending invitation${invitations.length !== 1 ? 's' : ''}`}
      actions={
        <div className="flex gap-2">
          <Dialog open={invitationsDialogOpen} onOpenChange={setInvitationsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-pending-invitations">
                <Clock className="h-4 w-4 mr-2" />
                Pending Invitations ({invitations.length})
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl max-h-[80vh] overflow-auto">
              <DialogHeader>
                <DialogTitle>Pending Invitations</DialogTitle>
                <DialogDescription>
                  View and manage pending team member invitations.
                </DialogDescription>
              </DialogHeader>
              {isLoadingInvitations ? (
                <div className="flex items-center justify-center h-64" data-testid="loading-invitations">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : invitations.length === 0 ? (
                <div className="p-12 text-center">
                  <Mail className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">No Pending Invitations</h3>
                  <p className="text-muted-foreground">
                    All invitations have been accepted or cancelled.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Roles</TableHead>
                      <TableHead>Invited By</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invitations.map((invitation) => (
                      <TableRow key={invitation.id} data-testid={`row-invitation-${invitation.id}`}>
                        <TableCell className="font-medium">{invitation.email}</TableCell>
                        <TableCell>{invitation.fullName || "-"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {invitation.roles.map((role) => (
                              <Badge key={role} variant={getRoleBadgeVariant(role) as any}>
                                {getRoleLabel(role)}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>{invitation.invitedBy.fullName}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatDate(invitation.createdAt)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            {formatDate(invitation.expiresAt)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => resendInvitationMutation.mutate(invitation.id)}
                              disabled={resendInvitationMutation.isPending}
                              data-testid={`button-resend-${invitation.id}`}
                            >
                              <Send className="h-4 w-4 mr-1" />
                              Resend
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setInvitationToCancel(invitation)}
                              data-testid={`button-cancel-${invitation.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </DialogContent>
          </Dialog>
          <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-invite-user">
                <Mail className="h-4 w-4 mr-2" />
                Invite Team Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Team Member</DialogTitle>
                <DialogDescription>
                  Send an email invitation to join your team. They'll set their own password when accepting.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSendInvitation} className="space-y-4">
                <div>
                  <Label htmlFor="fullName">Full Name *</Label>
                  <Input
                    id="fullName"
                    value={newInvitation.fullName}
                    onChange={(e) => setNewInvitation({ ...newInvitation, fullName: e.target.value })}
                    placeholder="John Doe"
                    required
                    data-testid="input-full-name"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newInvitation.email}
                    onChange={(e) => setNewInvitation({ ...newInvitation, email: e.target.value })}
                    required
                    placeholder="john@example.com"
                    data-testid="input-email"
                  />
                </div>
                <div>
                  <Label>Roles * (select at least one)</Label>
                  <div className="space-y-3 mt-2">
                    {AVAILABLE_ROLES.map((role) => (
                      <div key={role.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`role-${role.value}`}
                          checked={newInvitation.roles.includes(role.value as any)}
                          onCheckedChange={() => toggleRole(role.value)}
                          data-testid={`checkbox-role-${role.value}`}
                        />
                        <Label
                          htmlFor={`role-${role.value}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {role.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setInviteDialogOpen(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={sendInvitationMutation.isPending || newInvitation.roles.length === 0}
                    className="flex-1"
                    data-testid="button-send-invitation"
                  >
                    {sendInvitationMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send Invitation
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <div className="flex-1 overflow-auto p-6">
        <Tabs value={selectedRoleTab} onValueChange={setSelectedRoleTab} className="w-full">
          <TabsList className="mb-4">
            {roleTabsData.map((tab) => (
              <TabsTrigger 
                key={tab.value} 
                value={tab.value} 
                data-testid={`tab-${tab.value}`}
              >
                {tab.label} ({tab.count})
              </TabsTrigger>
            ))}
          </TabsList>

          {roleTabsData.map((tab) => (
            <TabsContent key={tab.value} value={tab.value}>
              {isLoadingUsers ? (
                <div className="flex items-center justify-center h-64" data-testid="loading-users">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : filteredUsers.length === 0 ? (
                <Card className="p-12 text-center">
                  <UsersIcon className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">
                    {selectedRoleTab === "all" ? "No Team Members Yet" : `No ${tab.label}`}
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    {selectedRoleTab === "all" 
                      ? "Invite team members to collaborate on animal rescue operations."
                      : `No team members with this role yet.`
                    }
                  </p>
                  {selectedRoleTab === "all" && (
                    <Button onClick={() => setInviteDialogOpen(true)}>
                      <Mail className="h-4 w-4 mr-2" />
                      Send First Invitation
                    </Button>
                  )}
                </Card>
              ) : (
                <>
                  {/* Mobile Card Layout */}
                  <div className="md:hidden space-y-3">
                    {filteredUsers.map((user) => (
                      <Card key={user.id} className="p-4" data-testid={`card-user-${user.id}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium truncate">{user.fullName}</span>
                              {user.id === currentUser?.id && (
                                <Badge variant="outline" className="shrink-0">You</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate mt-1">{user.email}</p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {user.roles.map((role) => (
                                <Badge key={role} variant={getRoleBadgeVariant(role) as any}>
                                  <Shield className="h-3 w-3 mr-1" />
                                  {getRoleLabel(role)}
                                </Badge>
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">Joined {formatDate(user.createdAt)}</p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  data-testid={`button-edit-mobile-${user.id}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Edit Team Member</DialogTitle>
                                  <DialogDescription>
                                    Update user information and roles.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div>
                                    <Label htmlFor={`edit-name-mobile-${user.id}`}>Display Name</Label>
                                    <div className="flex gap-2 mt-1">
                                      <Input
                                        id={`edit-name-mobile-${user.id}`}
                                        defaultValue={user.fullName}
                                        placeholder="Enter display name"
                                        data-testid={`input-edit-name-mobile-${user.id}`}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            const input = e.target as HTMLInputElement;
                                            if (input.value.trim() && input.value !== user.fullName) {
                                              updateUserMutation.mutate({ id: user.id, fullName: input.value.trim() });
                                            }
                                          }
                                        }}
                                      />
                                      <Button
                                        size="sm"
                                        onClick={(e) => {
                                          const input = (e.target as HTMLElement).parentElement?.querySelector('input') as HTMLInputElement;
                                          if (input?.value.trim() && input.value !== user.fullName) {
                                            updateUserMutation.mutate({ id: user.id, fullName: input.value.trim() });
                                          }
                                        }}
                                        disabled={updateUserMutation.isPending}
                                        data-testid={`button-save-name-mobile-${user.id}`}
                                      >
                                        {updateUserMutation.isPending ? "Saving..." : "Save"}
                                      </Button>
                                    </div>
                                  </div>
                                  
                                  <div className="border-t pt-4">
                                    <Label className="text-base font-medium">Roles</Label>
                                    {user.roles.includes('admin') ? (
                                      <div className="bg-muted/50 border rounded-lg p-3 mt-2 space-y-1">
                                        <div className="flex items-center gap-2">
                                          <Shield className="h-4 w-4 text-primary" />
                                          <span className="text-sm font-medium">Admin Role</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                          Admins automatically have full access to all features.
                                        </p>
                                      </div>
                                    ) : (
                                      <div className="space-y-3 mt-2">
                                        {AVAILABLE_ROLES.map((role) => (
                                          <div key={role.value} className="flex items-center space-x-2">
                                            <Checkbox
                                              id={`edit-role-mobile-${user.id}-${role.value}`}
                                              checked={user.roles.includes(role.value as any)}
                                              onCheckedChange={() => toggleEditRole(user, role.value)}
                                              disabled={updateUserMutation.isPending}
                                              data-testid={`checkbox-edit-role-mobile-${user.id}-${role.value}`}
                                            />
                                            <Label
                                              htmlFor={`edit-role-mobile-${user.id}-${role.value}`}
                                              className="text-sm font-normal cursor-pointer"
                                            >
                                              {role.label}
                                            </Label>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                            {canImpersonate(user) && (
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={() => impersonateMutation.mutate(user.id)}
                                disabled={impersonateMutation.isPending}
                                data-testid={`button-impersonate-mobile-${user.id}`}
                                title={`View as ${user.fullName}`}
                              >
                                <UserCheck className="h-4 w-4" />
                              </Button>
                            )}
                            {user.id !== currentUser?.id && (
                              <Button
                                size="icon"
                                variant="destructive"
                                onClick={() => setUserToDelete(user)}
                                data-testid={`button-delete-mobile-${user.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>

                  {/* Desktop Table Layout */}
                  <Card className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Roles</TableHead>
                          <TableHead>Joined</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((user) => (
                            <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                              <TableCell className="font-medium">
                                {user.fullName}
                                {user.id === currentUser?.id && (
                                  <Badge variant="outline" className="ml-2">You</Badge>
                                )}
                              </TableCell>
                              <TableCell>{user.email}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {user.roles.map((role) => (
                                    <Badge key={role} variant={getRoleBadgeVariant(role) as any}>
                                      <Shield className="h-3 w-3 mr-1" />
                                      {getRoleLabel(role)}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell>{formatDate(user.createdAt)}</TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        data-testid={`button-edit-${user.id}`}
                                      >
                                        Manage Roles
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                      <DialogHeader>
                                        <DialogTitle>Edit Team Member</DialogTitle>
                                        <DialogDescription>
                                          Update user information and roles.
                                        </DialogDescription>
                                      </DialogHeader>
                                      <div className="space-y-4">
                                        <div>
                                          <Label htmlFor={`edit-name-${user.id}`}>Display Name</Label>
                                          <div className="flex gap-2 mt-1">
                                            <Input
                                              id={`edit-name-${user.id}`}
                                              defaultValue={user.fullName}
                                              placeholder="Enter display name"
                                              data-testid={`input-edit-name-${user.id}`}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  const input = e.target as HTMLInputElement;
                                                  if (input.value.trim() && input.value !== user.fullName) {
                                                    updateUserMutation.mutate({ id: user.id, fullName: input.value.trim() });
                                                  }
                                                }
                                              }}
                                            />
                                            <Button
                                              size="sm"
                                              onClick={(e) => {
                                                const input = (e.target as HTMLElement).parentElement?.querySelector('input') as HTMLInputElement;
                                                if (input?.value.trim() && input.value !== user.fullName) {
                                                  updateUserMutation.mutate({ id: user.id, fullName: input.value.trim() });
                                                }
                                              }}
                                              disabled={updateUserMutation.isPending}
                                              data-testid={`button-save-name-${user.id}`}
                                            >
                                              {updateUserMutation.isPending ? "Saving..." : "Save"}
                                            </Button>
                                          </div>
                                        </div>
                                        
                                        <div className="border-t pt-4">
                                          <Label className="text-base font-medium">Roles</Label>
                                          {user.roles.includes('admin') ? (
                                            <div className="bg-muted/50 border rounded-lg p-3 mt-2 space-y-1">
                                              <div className="flex items-center gap-2">
                                                <Shield className="h-4 w-4 text-primary" />
                                                <span className="text-sm font-medium">Admin Role</span>
                                              </div>
                                              <p className="text-xs text-muted-foreground">
                                                Admins automatically have full access to all features.
                                              </p>
                                            </div>
                                          ) : (
                                            <div className="space-y-3 mt-2">
                                              {AVAILABLE_ROLES.map((role) => (
                                                <div key={role.value} className="flex items-center space-x-2">
                                                  <Checkbox
                                                    id={`edit-role-${user.id}-${role.value}`}
                                                    checked={user.roles.includes(role.value as any)}
                                                    onCheckedChange={() => toggleEditRole(user, role.value)}
                                                    disabled={updateUserMutation.isPending}
                                                    data-testid={`checkbox-edit-role-${user.id}-${role.value}`}
                                                  />
                                                  <Label
                                                    htmlFor={`edit-role-${user.id}-${role.value}`}
                                                    className="text-sm font-normal cursor-pointer"
                                                  >
                                                    {role.label}
                                                  </Label>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </DialogContent>
                                  </Dialog>
                                  {canImpersonate(user) && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => impersonateMutation.mutate(user.id)}
                                      disabled={impersonateMutation.isPending}
                                      data-testid={`button-impersonate-${user.id}`}
                                      title={`View as ${user.fullName}`}
                                    >
                                      <UserCheck className="h-4 w-4 mr-1" />
                                      View As
                                    </Button>
                                  )}
                                  {user.id !== currentUser?.id && (
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => setUserToDelete(user)}
                                      data-testid={`button-delete-${user.id}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Card>
                </>
                )}
              </TabsContent>
            ))}
          </Tabs>
      </div>

      {/* Delete User Confirmation Dialog */}
      <AlertDialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team Member?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {userToDelete?.fullName}? This action cannot be undone.
              Their account and all associated data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => userToDelete && deleteUserMutation.mutate(userToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteUserMutation.isPending ? "Deleting..." : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Invitation Confirmation Dialog */}
      <AlertDialog open={!!invitationToCancel} onOpenChange={() => setInvitationToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel the invitation for {invitationToCancel?.email}? 
              The invitation link will no longer work.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Invitation</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => invitationToCancel && cancelInvitationMutation.mutate(invitationToCancel.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-cancel"
            >
              {cancelInvitationMutation.isPending ? "Cancelling..." : "Cancel Invitation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

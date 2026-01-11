import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PlatformAdminSidebar } from "@/components/PlatformAdminSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Flag, Plus, Edit, Trash2 } from "lucide-react";

interface FeatureFlag {
  id: string;
  tenantId: string | null;
  featureName: string;
  isEnabled: boolean;
  config: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

interface Tenant {
  id: string;
  name: string;
  subdomain: string;
}

export default function FeatureFlagsPage() {
  const { user } = useAuth();
  const { isLoading: isCheckingAccess } = usePlatformAdmin();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);

  const { data: flagsData, isLoading: flagsLoading } = useQuery<{ featureFlags: FeatureFlag[] }>({
    queryKey: ['/api/platform/feature-flags'],
  });

  const { data: tenantsData } = useQuery<{ tenants: Tenant[] }>({
    queryKey: ['/api/platform/tenants'],
  });

  const createFlagMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/platform/feature-flags', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/feature-flags'] });
      setIsDialogOpen(false);
      setEditingFlag(null);
      toast({
        title: "Success",
        description: "Feature flag created successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create feature flag",
        variant: "destructive",
      });
    },
  });

  const updateFlagMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest('PATCH', `/api/platform/feature-flags/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/feature-flags'] });
      setIsDialogOpen(false);
      setEditingFlag(null);
      toast({
        title: "Success",
        description: "Feature flag updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update feature flag",
        variant: "destructive",
      });
    },
  });

  const deleteFlagMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/platform/feature-flags/${id}`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/feature-flags'] });
      toast({
        title: "Success",
        description: "Feature flag deleted successfully",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const tenantId = formData.get('tenantId') as string;

    const data = {
      tenantId: tenantId === 'all' ? null : tenantId,
      featureName: formData.get('featureName'),
      isEnabled: formData.get('isEnabled') === 'on',
      config: null,
    };

    if (editingFlag) {
      updateFlagMutation.mutate({ id: editingFlag.id, data });
    } else {
      createFlagMutation.mutate(data);
    }
  };

  const handleEdit = (flag: FeatureFlag) => {
    setEditingFlag(flag);
    setIsDialogOpen(true);
  };

  const handleDelete = (flagId: string) => {
    if (confirm('Are you sure you want to delete this feature flag?')) {
      deleteFlagMutation.mutate(flagId);
    }
  };

  if (isCheckingAccess) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  const style = {
    "--sidebar-width": "16rem",
  };

  const flags = flagsData?.featureFlags || [];
  const tenants = tenantsData?.tenants || [];

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <PlatformAdminSidebar userName={user?.fullName || "Administrator"} />
        <div className="flex flex-col flex-1">
          <header className="flex items-center gap-4 border-b p-4">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex-1">
              <h1 className="text-2xl font-semibold" data-testid="heading-feature-flags">Feature Flags</h1>
              <p className="text-sm text-muted-foreground">Control feature availability per tenant</p>
            </div>
            <Button onClick={() => { setEditingFlag(null); setIsDialogOpen(true); }} data-testid="button-create-flag">
              <Plus className="h-4 w-4 mr-2" />
              New Feature Flag
            </Button>
          </header>
          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-7xl space-y-6">
              {flagsLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Card key={i}>
                      <CardHeader>
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-4 w-64" />
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              ) : flags.length > 0 ? (
                <div className="grid gap-4">
                  {flags.map((flag) => (
                    <Card key={flag.id} data-testid={`flag-card-${flag.featureName}`} className="hover-elevate">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0">
                        <div className="flex-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <Flag className="h-4 w-4" />
                            {flag.featureName}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            {flag.tenantId ? `Tenant-specific` : 'Platform-wide default'}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={flag.isEnabled ? "default" : "secondary"} data-testid={`flag-status-${flag.featureName}`}>
                            {flag.isEnabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                          <Button size="sm" variant="outline" onClick={() => handleEdit(flag)} data-testid={`button-edit-flag-${flag.id}`}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(flag.id)} data-testid={`button-delete-flag-${flag.id}`}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Flag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No feature flags configured</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </main>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent data-testid="dialog-create-flag">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editingFlag ? 'Edit Feature Flag' : 'New Feature Flag'}</DialogTitle>
              <DialogDescription>
                {editingFlag ? 'Update feature flag configuration' : 'Create a feature flag to control feature availability'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="featureName">Feature Name</Label>
                <Input
                  id="featureName"
                  name="featureName"
                  placeholder="advanced_reports"
                  defaultValue={editingFlag?.featureName}
                  required
                  disabled={!!editingFlag}
                  data-testid="input-feature-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tenantId">Scope</Label>
                <Select name="tenantId" defaultValue={editingFlag?.tenantId || 'all'}>
                  <SelectTrigger data-testid="select-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Platform-wide Default</SelectItem>
                    {tenants.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name} ({tenant.subdomain})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <Switch id="isEnabled" name="isEnabled" defaultChecked={editingFlag?.isEnabled} data-testid="switch-enabled" />
                <Label htmlFor="isEnabled">Enabled</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); setEditingFlag(null); }}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createFlagMutation.isPending || updateFlagMutation.isPending}
                data-testid="button-submit-flag"
              >
                {editingFlag ? 'Save Changes' : createFlagMutation.isPending ? 'Creating...' : 'Create Flag'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}

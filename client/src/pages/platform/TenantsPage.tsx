import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { PlatformAdminSidebar } from "@/components/PlatformAdminSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Building2, Users, PawPrint, CheckCircle, XCircle, Plus, Edit, UserCircle, Globe, Send, Loader2, ShieldCheck, ShieldX, DollarSign } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Tenant {
  id: string;
  subdomain: string;
  name: string;
  contactEmail: string | null;
  customDomain: string | null;
  customDomainVerified: boolean;
  isActive: boolean;
  createdAt: string;
  subscriptionTier: string | null;
  platformFeePercent: number | null;
  stats: {
    userCount: number;
    animalCount: number;
  };
}

export default function TenantsPage() {
  const { user } = useAuth();
  const { isLoading: isCheckingAccess } = usePlatformAdmin();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [isDnsDialogOpen, setIsDnsDialogOpen] = useState(false);
  const [dnsTenant, setDnsTenant] = useState<Tenant | null>(null);
  const [aRecordValue, setARecordValue] = useState("");
  const [txtRecordValue, setTxtRecordValue] = useState("");
  const [platformFeeOverride, setPlatformFeeOverride] = useState<string>("");

  const { data: tenantsData, isLoading } = useQuery<{ tenants: Tenant[] }>({
    queryKey: ['/api/platform/tenants'],
  });

  const createTenantMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/platform/tenants', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/tenants'] });
      setIsDialogOpen(false);
      setEditingTenant(null);
      toast({
        title: "Success",
        description: "Tenant created successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create tenant",
        variant: "destructive",
      });
    },
  });

  const updateTenantMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest('PATCH', `/api/platform/tenants/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/tenants'] });
      toast({
        title: "Success",
        description: "Tenant updated",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const data: Record<string, unknown> = {
      subdomain: formData.get('subdomain'),
      name: formData.get('name'),
      contactEmail: formData.get('contactEmail'),
      isActive: formData.get('isActive') === 'on',
    };

    // Add platform fee override (null means use default tier-based fee)
    if (editingTenant) {
      if (platformFeeOverride === "" || platformFeeOverride === null) {
        data.platformFeePercent = null; // Use default based on tier
      } else {
        const feeValue = parseFloat(platformFeeOverride);
        if (!isNaN(feeValue) && feeValue >= 0 && feeValue <= 100) {
          data.platformFeePercent = feeValue;
        }
      }
    }

    if (editingTenant) {
      updateTenantMutation.mutate({ id: editingTenant.id, data });
      setIsDialogOpen(false);
      setEditingTenant(null);
      setPlatformFeeOverride("");
    } else {
      createTenantMutation.mutate(data);
    }
  };

  const handleEdit = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setPlatformFeeOverride(tenant.platformFeePercent !== null ? String(tenant.platformFeePercent) : "");
    setIsDialogOpen(true);
  };

  const handleToggleActive = (tenant: Tenant) => {
    updateTenantMutation.mutate({
      id: tenant.id,
      data: { isActive: !tenant.isActive },
    });
  };

  const impersonateMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      const response = await apiRequest('POST', `/api/platform/impersonate/${tenantId}`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/impersonation-status'] });
      toast({
        title: "Impersonation started",
        description: "You are now viewing as this tenant. Redirecting...",
      });
      setTimeout(() => {
        setLocation('/dashboard');
      }, 1000);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to start impersonation",
        variant: "destructive",
      });
    },
  });

  const sendDnsRecordsMutation = useMutation({
    mutationFn: async ({ tenantId, aRecordValue, txtRecordValue }: { tenantId: string; aRecordValue: string; txtRecordValue: string }) => {
      const response = await apiRequest('POST', `/api/platform/tenants/${tenantId}/send-dns-records`, {
        aRecordValue,
        txtRecordValue,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setIsDnsDialogOpen(false);
      setDnsTenant(null);
      setARecordValue("");
      setTxtRecordValue("");
      toast({
        title: "DNS records sent",
        description: data.message || "DNS records email sent successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send DNS records",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const verifyDomainMutation = useMutation({
    mutationFn: async ({ tenantId, verified }: { tenantId: string; verified: boolean }) => {
      const response = await apiRequest('PATCH', `/api/admin/tenants/${tenantId}/custom-domain`, {
        verified,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/tenants'] });
      toast({
        title: data.tenant?.customDomainVerified ? "Domain verified" : "Verification revoked",
        description: data.message,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update domain verification",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleOpenDnsDialog = (tenant: Tenant) => {
    setDnsTenant(tenant);
    setARecordValue("");
    setTxtRecordValue("");
    setIsDnsDialogOpen(true);
  };

  const handleSendDnsRecords = () => {
    if (!dnsTenant || !aRecordValue || !txtRecordValue) {
      toast({
        title: "Missing information",
        description: "Please enter both A record and TXT record values.",
        variant: "destructive",
      });
      return;
    }
    sendDnsRecordsMutation.mutate({
      tenantId: dnsTenant.id,
      aRecordValue,
      txtRecordValue,
    });
  };

  const tenants = tenantsData?.tenants || [];

  if (isCheckingAccess) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  const style = {
    "--sidebar-width": "16rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <PlatformAdminSidebar userName={user?.fullName || "Administrator"} />
        <div className="flex flex-col flex-1">
          <header className="flex items-center gap-4 border-b p-4">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex-1">
              <h1 className="text-2xl font-semibold" data-testid="heading-tenants">Tenant Management</h1>
              <p className="text-sm text-muted-foreground">View and manage all rescue organizations</p>
            </div>
            <Button onClick={() => { setEditingTenant(null); setIsDialogOpen(true); }} data-testid="button-create-tenant">
              <Plus className="h-4 w-4 mr-2" />
              Create Tenant
            </Button>
          </header>
          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-7xl space-y-6">
              {isLoading ? (
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
              ) : tenants.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {tenants.map((tenant) => (
                    <Card key={tenant.id} data-testid={`tenant-card-${tenant.subdomain}`} className="hover-elevate">
                      <CardHeader className="space-y-1">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-lg" data-testid={`tenant-name-${tenant.subdomain}`}>
                              {tenant.name}
                            </CardTitle>
                            <CardDescription className="flex flex-col gap-1 mt-1">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-3 w-3" />
                                <span className="font-mono text-xs">{tenant.subdomain}.irescue.life</span>
                              </div>
                              {tenant.customDomain && (
                                <div className="flex items-center gap-2">
                                  <Globe className="h-3 w-3" />
                                  <span className="font-mono text-xs">{tenant.customDomain}</span>
                                  {tenant.customDomainVerified ? (
                                    <Badge variant="default" className="text-[10px] px-1 py-0">
                                      <CheckCircle className="h-2 w-2 mr-0.5" />
                                      Verified
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                      Pending
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </CardDescription>
                          </div>
                          <Badge
                            variant={tenant.isActive ? "default" : "secondary"}
                            data-testid={`tenant-status-${tenant.subdomain}`}
                          >
                            {tenant.isActive ? (
                              <>
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Active
                              </>
                            ) : (
                              <>
                                <XCircle className="h-3 w-3 mr-1" />
                                Inactive
                              </>
                            )}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 text-sm">
                          {tenant.contactEmail && (
                            <div className="text-muted-foreground">{tenant.contactEmail}</div>
                          )}
                          <div className="flex items-center gap-4 pt-2">
                            <div className="flex items-center gap-1">
                              <Users className="h-3 w-3 text-muted-foreground" />
                              <span data-testid={`tenant-users-${tenant.subdomain}`}>
                                {tenant.stats.userCount}
                              </span>
                              <span className="text-muted-foreground text-xs">users</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <PawPrint className="h-3 w-3 text-muted-foreground" />
                              <span data-testid={`tenant-animals-${tenant.subdomain}`}>
                                {tenant.stats.animalCount}
                              </span>
                              <span className="text-muted-foreground text-xs">animals</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-2">
                            <DollarSign className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs">
                              {tenant.platformFeePercent !== null ? (
                                <span className="font-medium">
                                  {tenant.platformFeePercent === 0 ? (
                                    <Badge variant="secondary" className="text-[10px] px-1 py-0">No Platform Fee</Badge>
                                  ) : (
                                    <>{tenant.platformFeePercent}% platform fee</>
                                  )}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Default fee ({tenant.subscriptionTier === 'professional' ? '0%' : '5%'})</span>
                              )}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground pt-2">
                            Created {new Date(tenant.createdAt).toLocaleDateString()}
                          </div>
                          <div className="flex flex-col gap-2 pt-4">
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => handleEdit(tenant)} data-testid={`button-edit-${tenant.subdomain}`}>
                                <Edit className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant={tenant.isActive ? "secondary" : "default"}
                                onClick={() => handleToggleActive(tenant)}
                                data-testid={`button-toggle-${tenant.subdomain}`}
                              >
                                {tenant.isActive ? 'Disable' : 'Enable'}
                              </Button>
                            </div>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => impersonateMutation.mutate(tenant.id)}
                              disabled={!tenant.isActive || impersonateMutation.isPending}
                              data-testid={`button-impersonate-${tenant.subdomain}`}
                              className="w-full"
                            >
                              <UserCircle className="h-3 w-3 mr-1" />
                              {impersonateMutation.isPending ? 'Starting...' : 'View as Tenant'}
                            </Button>
                            {tenant.customDomain && (
                              <div className="flex flex-col gap-2">
                                {!tenant.customDomainVerified && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleOpenDnsDialog(tenant)}
                                      data-testid={`button-send-dns-${tenant.subdomain}`}
                                      className="w-full"
                                    >
                                      <Send className="h-3 w-3 mr-1" />
                                      Send DNS Records
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="default"
                                      onClick={() => verifyDomainMutation.mutate({ tenantId: tenant.id, verified: true })}
                                      disabled={verifyDomainMutation.isPending}
                                      data-testid={`button-verify-domain-${tenant.subdomain}`}
                                      className="w-full"
                                    >
                                      {verifyDomainMutation.isPending ? (
                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                      ) : (
                                        <ShieldCheck className="h-3 w-3 mr-1" />
                                      )}
                                      Mark Domain Verified
                                    </Button>
                                  </>
                                )}
                                {tenant.customDomainVerified && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => verifyDomainMutation.mutate({ tenantId: tenant.id, verified: false })}
                                    disabled={verifyDomainMutation.isPending}
                                    data-testid={`button-revoke-domain-${tenant.subdomain}`}
                                    className="w-full"
                                  >
                                    {verifyDomainMutation.isPending ? (
                                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    ) : (
                                      <ShieldX className="h-3 w-3 mr-1" />
                                    )}
                                    Revoke Verification
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No tenants found</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </main>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent data-testid="dialog-tenant-form">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editingTenant ? 'Edit Tenant' : 'Create Tenant'}</DialogTitle>
              <DialogDescription>
                {editingTenant ? 'Update tenant information' : 'Create a new rescue organization'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="subdomain">Subdomain</Label>
                <Input
                  id="subdomain"
                  name="subdomain"
                  placeholder="happy-paws"
                  defaultValue={editingTenant?.subdomain}
                  required
                  disabled={!!editingTenant}
                  data-testid="input-subdomain"
                />
                <p className="text-xs text-muted-foreground">.irescue.life</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Organization Name</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Happy Paws Rescue"
                  defaultValue={editingTenant?.name}
                  required
                  data-testid="input-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactEmail">Contact Email</Label>
                <Input
                  id="contactEmail"
                  name="contactEmail"
                  type="email"
                  placeholder="contact@rescue.org"
                  defaultValue={editingTenant?.contactEmail || ''}
                  data-testid="input-contact-email"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  name="isActive"
                  defaultChecked={editingTenant?.isActive ?? true}
                  data-testid="switch-active"
                />
                <Label htmlFor="isActive">Active</Label>
              </div>
              {editingTenant && (
                <div className="space-y-2 pt-4 border-t">
                  <Label htmlFor="platformFeePercent">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Platform Fee Override
                    </div>
                  </Label>
                  <Input
                    id="platformFeePercent"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    placeholder="Leave empty for default"
                    value={platformFeeOverride}
                    onChange={(e) => setPlatformFeeOverride(e.target.value)}
                    data-testid="input-platform-fee"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use default fee based on subscription tier. Set to 0 for no platform fee (e.g., for conflict-of-interest avoidance or partnerships).
                  </p>
                  {editingTenant.subscriptionTier && (
                    <p className="text-xs text-muted-foreground">
                      Current tier: <span className="font-medium capitalize">{editingTenant.subscriptionTier}</span> (default fee: {editingTenant.subscriptionTier === 'professional' ? '0%' : '5%'})
                    </p>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); setEditingTenant(null); }}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createTenantMutation.isPending || updateTenantMutation.isPending}
                data-testid="button-submit"
              >
                {editingTenant ? 'Save Changes' : 'Create Tenant'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDnsDialogOpen} onOpenChange={setIsDnsDialogOpen}>
        <DialogContent data-testid="dialog-dns-records">
          <DialogHeader>
            <DialogTitle>Send DNS Records</DialogTitle>
            <DialogDescription>
              Send DNS configuration instructions to {dnsTenant?.name} for domain {dnsTenant?.customDomain}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Alert>
              <Globe className="h-4 w-4" />
              <AlertDescription>
                Enter the A record IP and TXT record values from Replit's deployment settings after adding the custom domain.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label htmlFor="aRecordValue">A Record IP Address</Label>
              <Input
                id="aRecordValue"
                placeholder="e.g., 34.123.45.67"
                value={aRecordValue}
                onChange={(e) => setARecordValue(e.target.value)}
                data-testid="input-a-record"
              />
              <p className="text-xs text-muted-foreground">
                The IP address provided by Replit for the A record
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="txtRecordValue">TXT Record Value</Label>
              <Textarea
                id="txtRecordValue"
                placeholder="e.g., replit-verify=abc123..."
                value={txtRecordValue}
                onChange={(e) => setTxtRecordValue(e.target.value)}
                className="font-mono text-sm"
                data-testid="input-txt-record"
              />
              <p className="text-xs text-muted-foreground">
                The verification string for the TXT record
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsDnsDialogOpen(false);
                setDnsTenant(null);
                setARecordValue("");
                setTxtRecordValue("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendDnsRecords}
              disabled={sendDnsRecordsMutation.isPending || !aRecordValue || !txtRecordValue}
              data-testid="button-send-dns-submit"
            >
              {sendDnsRecordsMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}

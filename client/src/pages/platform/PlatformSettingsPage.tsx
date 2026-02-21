import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PlatformAdminSidebar } from "@/components/PlatformAdminSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Settings } from "lucide-react";

interface PlatformSetting {
  id: string;
  key: string;
  value: any;
  category: 'general' | 'email' | 'security' | 'billing' | 'features';
  description: string | null;
  isPublic: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export default function PlatformSettingsPage() {
  const { user } = useAuth();
  const { isLoading: isCheckingAccess } = usePlatformAdmin();
  const { toast } = useToast();
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const { data: settingsData, isLoading } = useQuery<{ settings: PlatformSetting[] }>({
    queryKey: ['/api/platform/settings'],
  });

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const response = await apiRequest('PUT', `/api/platform/settings/${key}`, { value });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/settings'] });
      setEditingKey(null);
      toast({
        title: "Success",
        description: "Setting updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update setting",
        variant: "destructive",
      });
    },
  });

  const handleSaveSetting = (key: string, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const value = formData.get('value');

    updateSettingMutation.mutate({ key, value });
  };

  if (isCheckingAccess) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  const style = {
    "--sidebar-width": "16rem",
  };

  const settings = settingsData?.settings || [];
  const groupedSettings = settings.reduce((acc, setting) => {
    if (!acc[setting.category]) {
      acc[setting.category] = [];
    }
    acc[setting.category].push(setting);
    return acc;
  }, {} as Record<string, PlatformSetting[]>);

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <PlatformAdminSidebar userName={user?.fullName || "Administrator"} />
        <div className="flex flex-col flex-1">
          <header className="flex items-center gap-4 border-b p-4">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div>
              <h1 className="text-2xl font-semibold" data-testid="heading-settings">Platform Settings</h1>
              <p className="text-sm text-muted-foreground">Configure platform-wide settings</p>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-4xl space-y-6">
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Card key={i}>
                      <CardHeader>
                        <Skeleton className="h-6 w-32" />
                      </CardHeader>
                      <CardContent>
                        <Skeleton className="h-10 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : Object.entries(groupedSettings).length > 0 ? (
                Object.entries(groupedSettings).map(([category, categorySettings]) => (
                  <Card key={category}>
                    <CardHeader>
                      <CardTitle className="text-lg capitalize flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        {category}
                      </CardTitle>
                      <CardDescription>{categorySettings.length} settings</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {categorySettings.map((setting) => (
                        <div key={setting.key} className="border-b last:border-0 pb-4 last:pb-0" data-testid={`setting-${setting.key}`}>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="font-medium flex items-center gap-2">
                                {setting.key}
                                {setting.isPublic && <Badge variant="outline" className="text-xs">Public</Badge>}
                              </div>
                              {setting.description && (
                                <p className="text-sm text-muted-foreground mt-1">{setting.description}</p>
                              )}
                            </div>
                            {editingKey === setting.key ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingKey(null)}
                                data-testid={`button-cancel-${setting.key}`}
                              >
                                Cancel
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingKey(setting.key)}
                                data-testid={`button-edit-${setting.key}`}
                              >
                                Edit
                              </Button>
                            )}
                          </div>
                          {editingKey === setting.key ? (
                            <form onSubmit={(e) => handleSaveSetting(setting.key, e)} className="mt-2">
                              <div className="flex gap-2">
                                <Input
                                  name="value"
                                  defaultValue={typeof setting.value === 'object' ? JSON.stringify(setting.value) : setting.value}
                                  className="flex-1"
                                  data-testid={`input-value-${setting.key}`}
                                />
                                <Button
                                  type="submit"
                                  size="sm"
                                  disabled={updateSettingMutation.isPending}
                                  data-testid={`button-save-${setting.key}`}
                                >
                                  Save
                                </Button>
                              </div>
                            </form>
                          ) : (
                            <div className="mt-2 p-2 bg-muted rounded text-sm font-mono" data-testid={`value-${setting.key}`}>
                              {typeof setting.value === 'object' ? JSON.stringify(setting.value, null, 2) : String(setting.value)}
                            </div>
                          )}
                          {setting.updatedBy && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Last updated {new Date(setting.updatedAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Settings className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No settings configured</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

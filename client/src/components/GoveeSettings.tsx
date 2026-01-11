import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Thermometer, Wifi, WifiOff, Plus, Trash2, RefreshCw, Loader2, Bell, AlertCircle, Settings, Check, X, MapPin } from "lucide-react";
import { z } from "zod";

interface GoveeDevice {
  id: string;
  goveeDeviceId: string;
  model: string;
  deviceName: string;
  locationLabel: string | null;
  isEnabled: boolean;
  pollingIntervalMinutes: number;
  batteryLevel: number | null;
  isOnline: boolean;
  lastReadingAt: string | null;
}

interface GoveeStatus {
  connected: boolean;
  status?: string;
  accountEmail?: string;
  lastSyncAt?: string;
  lastSyncError?: string;
  deviceCount?: number;
}

interface DiscoveredDevice {
  goveeDeviceId: string;
  model: string;
  deviceName: string;
  isRegistered: boolean;
}

const connectSchema = z.object({
  apiKey: z.string().min(10, "API key must be at least 10 characters"),
  accountEmail: z.string().email().optional().or(z.literal("")),
});

const deviceLabelSchema = z.object({
  locationLabel: z.string().min(1, "Location label is required"),
});

export function GoveeSettings() {
  const { toast } = useToast();
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [showDiscoverDialog, setShowDiscoverDialog] = useState(false);
  const [editingDevice, setEditingDevice] = useState<GoveeDevice | null>(null);

  const { data: status, isLoading: statusLoading } = useQuery<GoveeStatus>({
    queryKey: ["/api/govee/status"],
  });

  const { data: devicesData, isLoading: devicesLoading } = useQuery<{ devices: GoveeDevice[] }>({
    queryKey: ["/api/govee/devices"],
    enabled: status?.connected === true,
  });

  const { data: discoveredData, isLoading: discoveringDevices, refetch: refetchDiscovered } = useQuery<{ devices: DiscoveredDevice[] }>({
    queryKey: ["/api/govee/discover-devices"],
    enabled: false,
  });

  const connectForm = useForm<z.infer<typeof connectSchema>>({
    resolver: zodResolver(connectSchema),
    defaultValues: {
      apiKey: "",
      accountEmail: "",
    },
  });

  const deviceLabelForm = useForm<z.infer<typeof deviceLabelSchema>>({
    resolver: zodResolver(deviceLabelSchema),
    defaultValues: {
      locationLabel: "",
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (data: z.infer<typeof connectSchema>) => {
      return apiRequest("/api/govee/connect", { method: "POST", body: JSON.stringify(data) });
    },
    onSuccess: () => {
      toast({ title: "Connected", description: "Govee account connected successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/govee/status"] });
      setShowConnectDialog(false);
      connectForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Connection failed", description: error.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/govee/disconnect", { method: "DELETE" });
    },
    onSuccess: () => {
      toast({ title: "Disconnected", description: "Govee account disconnected" });
      queryClient.invalidateQueries({ queryKey: ["/api/govee/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/govee/devices"] });
    },
    onError: (error: Error) => {
      toast({ title: "Disconnect failed", description: error.message, variant: "destructive" });
    },
  });

  const registerDeviceMutation = useMutation({
    mutationFn: async (device: DiscoveredDevice) => {
      return apiRequest("/api/govee/devices", {
        method: "POST",
        body: JSON.stringify({
          goveeDeviceId: device.goveeDeviceId,
          model: device.model,
          deviceName: device.deviceName,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: "Device registered", description: "Temperature sensor added" });
      queryClient.invalidateQueries({ queryKey: ["/api/govee/devices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/govee/discover-devices"] });
    },
    onError: (error: Error) => {
      toast({ title: "Registration failed", description: error.message, variant: "destructive" });
    },
  });

  const updateDeviceMutation = useMutation({
    mutationFn: async ({ deviceId, ...data }: { deviceId: string; locationLabel?: string; isEnabled?: boolean }) => {
      return apiRequest(`/api/govee/devices/${deviceId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({ title: "Device updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/govee/devices"] });
      setEditingDevice(null);
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteDeviceMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      return apiRequest(`/api/govee/devices/${deviceId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast({ title: "Device removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/govee/devices"] });
    },
    onError: (error: Error) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/govee/sync", { method: "POST" });
    },
    onSuccess: (data: any) => {
      toast({ title: "Sync complete", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/govee/readings/latest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/govee/devices"] });
    },
    onError: (error: Error) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  const handleDiscoverDevices = () => {
    setShowDiscoverDialog(true);
    refetchDiscovered();
  };

  const handleEditDevice = (device: GoveeDevice) => {
    setEditingDevice(device);
    deviceLabelForm.setValue("locationLabel", device.locationLabel || "");
  };

  const handleSaveDeviceLabel = (data: z.infer<typeof deviceLabelSchema>) => {
    if (editingDevice) {
      updateDeviceMutation.mutate({
        deviceId: editingDevice.id,
        locationLabel: data.locationLabel,
      });
    }
  };

  if (statusLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading Govee integration status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Thermometer className="h-5 w-5" />
              <CardTitle>Temperature Monitoring</CardTitle>
            </div>
            {status?.connected && (
              <Badge variant={status.status === "active" ? "default" : "destructive"}>
                {status.status === "active" ? "Connected" : status.status}
              </Badge>
            )}
          </div>
          <CardDescription>
            Monitor shelter temperature and humidity using Govee WiFi sensors
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!status?.connected ? (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Connect your Govee account to start monitoring temperature. You'll need a Govee API key from the Govee Developer Portal.
                </AlertDescription>
              </Alert>
              <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
                <DialogTrigger asChild>
                  <Button data-testid="button-connect-govee">
                    <Plus className="h-4 w-4 mr-2" />
                    Connect Govee Account
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Connect Govee Account</DialogTitle>
                    <DialogDescription>
                      Enter your Govee API key to enable temperature monitoring
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...connectForm}>
                    <form onSubmit={connectForm.handleSubmit((data) => connectMutation.mutate(data))} className="space-y-4">
                      <FormField
                        control={connectForm.control}
                        name="apiKey"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>API Key</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="Enter your Govee API key"
                                {...field}
                                data-testid="input-govee-api-key"
                              />
                            </FormControl>
                            <FormDescription>
                              Get your API key from <a href="https://developer.govee.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">developer.govee.com</a>
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={connectForm.control}
                        name="accountEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Account Email (optional)</FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                placeholder="your@email.com"
                                {...field}
                                data-testid="input-govee-email"
                              />
                            </FormControl>
                            <FormDescription>
                              For reference only
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <DialogFooter>
                        <Button type="submit" disabled={connectMutation.isPending} data-testid="button-submit-govee-connect">
                          {connectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Connect
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {status.accountEmail && <span>Account: {status.accountEmail}</span>}
                  {status.lastSyncAt && (
                    <span className="ml-4">
                      Last sync: {new Date(status.lastSyncAt).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncMutation.mutate()}
                    disabled={syncMutation.isPending}
                    data-testid="button-sync-govee"
                  >
                    {syncMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    <span className="ml-2">Sync Now</span>
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    data-testid="button-disconnect-govee"
                  >
                    Disconnect
                  </Button>
                </div>
              </div>

              {status.lastSyncError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{status.lastSyncError}</AlertDescription>
                </Alert>
              )}

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Registered Devices</h4>
                  <Button variant="outline" size="sm" onClick={handleDiscoverDevices} data-testid="button-discover-devices">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Device
                  </Button>
                </div>

                {devicesLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading devices...
                  </div>
                ) : devicesData?.devices && devicesData.devices.length > 0 ? (
                  <div className="space-y-2">
                    {devicesData.devices.map((device) => (
                      <div
                        key={device.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                        data-testid={`device-row-${device.id}`}
                      >
                        <div className="flex items-center gap-3">
                          {device.isOnline ? (
                            <Wifi className="h-4 w-4 text-green-500" />
                          ) : (
                            <WifiOff className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div>
                            <div className="font-medium">
                              {device.locationLabel || device.deviceName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {device.model} {device.locationLabel && `- ${device.deviceName}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={device.isEnabled}
                            onCheckedChange={(checked) =>
                              updateDeviceMutation.mutate({ deviceId: device.id, isEnabled: checked })
                            }
                            data-testid={`switch-device-enabled-${device.id}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditDevice(device)}
                            data-testid={`button-edit-device-${device.id}`}
                          >
                            <MapPin className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteDeviceMutation.mutate(device.id)}
                            data-testid={`button-delete-device-${device.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No devices registered. Click "Add Device" to discover your Govee temperature sensors.
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDiscoverDialog} onOpenChange={setShowDiscoverDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discover Devices</DialogTitle>
            <DialogDescription>
              Select temperature sensors from your Govee account to monitor
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {discoveringDevices ? (
              <div className="flex items-center gap-2 justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Discovering devices...
              </div>
            ) : discoveredData?.devices && discoveredData.devices.length > 0 ? (
              discoveredData.devices.map((device) => (
                <div
                  key={device.goveeDeviceId}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <div className="font-medium">{device.deviceName}</div>
                    <div className="text-xs text-muted-foreground">{device.model}</div>
                  </div>
                  {device.isRegistered ? (
                    <Badge variant="secondary">
                      <Check className="h-3 w-3 mr-1" />
                      Added
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => registerDeviceMutation.mutate(device)}
                      disabled={registerDeviceMutation.isPending}
                      data-testid={`button-register-device-${device.goveeDeviceId}`}
                    >
                      Add
                    </Button>
                  )}
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-4">
                No temperature sensors found in your Govee account
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingDevice} onOpenChange={(open) => !open && setEditingDevice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Device Location</DialogTitle>
            <DialogDescription>
              Set a custom location label for this sensor (e.g., "Main Kennel", "Isolation Room")
            </DialogDescription>
          </DialogHeader>
          <Form {...deviceLabelForm}>
            <form onSubmit={deviceLabelForm.handleSubmit(handleSaveDeviceLabel)} className="space-y-4">
              <FormField
                control={deviceLabelForm.control}
                name="locationLabel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location Label</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Main Kennel Building"
                        {...field}
                        data-testid="input-device-location"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingDevice(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateDeviceMutation.isPending} data-testid="button-save-device-location">
                  {updateDeviceMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

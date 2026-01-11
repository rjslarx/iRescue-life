import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Thermometer, Droplets, Wifi, WifiOff, AlertTriangle, Settings, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { useTenant } from "@/contexts/TenantContext";

interface GoveeDevice {
  id: string;
  goveeDeviceId: string;
  model: string;
  deviceName: string;
  locationLabel: string | null;
  isEnabled: boolean;
  isOnline: boolean;
  lastReadingAt: string | null;
}

interface GoveeReading {
  id: string;
  deviceId: string;
  recordedAt: string;
  temperatureCelsius: string;
  temperatureFahrenheit: string;
  humidityPercent: string | null;
  batteryLevel: number | null;
}

interface LatestReadingData {
  device: GoveeDevice;
  reading: GoveeReading | null;
}

interface GoveeStatus {
  connected: boolean;
  status?: string;
  deviceCount?: number;
}

export function TemperatureWidget() {
  const { basePath } = useTenant();

  const { data: status, isLoading: statusLoading } = useQuery<GoveeStatus>({
    queryKey: ["/api/govee/status"],
    refetchInterval: 60000,
  });

  const { data: readingsData, isLoading: readingsLoading } = useQuery<{ readings: LatestReadingData[] }>({
    queryKey: ["/api/govee/readings/latest"],
    enabled: status?.connected === true,
    refetchInterval: 60000,
  });

  const { data: alertsData } = useQuery<{ alerts: any[] }>({
    queryKey: ["/api/govee/alerts"],
    enabled: status?.connected === true,
    refetchInterval: 60000,
  });

  const activeAlerts = alertsData?.alerts?.filter((a) => a.status === "triggered") || [];

  if (statusLoading) {
    return (
      <Card data-testid="widget-temperature-loading">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!status?.connected) {
    return (
      <Card data-testid="widget-temperature-disconnected">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Thermometer className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Temperature Monitoring</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Monitor shelter temperature with Govee sensors
          </p>
          <Link href={`${basePath}/settings`}>
            <Button variant="outline" size="sm" data-testid="button-setup-govee">
              <Settings className="h-4 w-4 mr-2" />
              Set Up
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const readings = readingsData?.readings || [];

  return (
    <Card data-testid="widget-temperature">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Thermometer className="h-5 w-5" />
            <CardTitle className="text-base">Temperature</CardTitle>
          </div>
          {activeAlerts.length > 0 && (
            <Badge variant="destructive" data-testid="badge-temperature-alerts">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {activeAlerts.length} Alert{activeAlerts.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {readingsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : readings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No devices configured.{" "}
            <Link href={`${basePath}/settings`} className="text-primary hover:underline">
              Add sensors
            </Link>
          </p>
        ) : (
          <div className="space-y-2">
            {readings.slice(0, 4).map(({ device, reading }) => (
              <TemperatureRow
                key={device.id}
                device={device}
                reading={reading}
                hasAlert={activeAlerts.some((a) => a.deviceId === device.id)}
              />
            ))}
            {readings.length > 4 && (
              <Link href={`${basePath}/settings`}>
                <Button variant="ghost" size="sm" className="w-full text-xs">
                  View all {readings.length} sensors
                </Button>
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TemperatureRow({
  device,
  reading,
  hasAlert,
}: {
  device: GoveeDevice;
  reading: GoveeReading | null;
  hasAlert: boolean;
}) {
  const tempF = reading ? parseFloat(reading.temperatureFahrenheit) : null;
  const humidity = reading?.humidityPercent ? parseFloat(reading.humidityPercent) : null;
  
  const getTempColor = (temp: number | null): string => {
    if (temp === null) return "text-muted-foreground";
    if (temp < 50) return "text-blue-500";
    if (temp < 65) return "text-cyan-500";
    if (temp < 75) return "text-green-500";
    if (temp < 85) return "text-orange-500";
    return "text-red-500";
  };

  return (
    <div
      className={`flex items-center justify-between p-2 rounded-lg border ${
        hasAlert ? "border-destructive bg-destructive/5" : "border-border"
      }`}
      data-testid={`temperature-row-${device.id}`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {device.isOnline ? (
          <Wifi className="h-3 w-3 text-green-500 flex-shrink-0" />
        ) : (
          <WifiOff className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        )}
        <span className="text-sm font-medium truncate">
          {device.locationLabel || device.deviceName}
        </span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {reading ? (
          <>
            <div className={`flex items-center gap-1 ${getTempColor(tempF)}`}>
              <Thermometer className="h-3 w-3" />
              <span className="text-sm font-semibold" data-testid={`temp-value-${device.id}`}>
                {tempF?.toFixed(1)}°F
              </span>
            </div>
            {humidity !== null && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Droplets className="h-3 w-3" />
                <span className="text-sm" data-testid={`humidity-value-${device.id}`}>
                  {humidity.toFixed(0)}%
                </span>
              </div>
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">No data</span>
        )}
      </div>
    </div>
  );
}

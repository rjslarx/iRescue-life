import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Thermometer, Droplets, Wifi, WifiOff, AlertTriangle, Battery } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { formatDistanceToNow } from "date-fns";

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

interface AlertEvent {
  id: string;
  deviceId: string;
  status: string;
}

function SensorCard({ device, reading, hasAlert }: { device: GoveeDevice; reading: GoveeReading | null; hasAlert: boolean }) {
  const tempF = reading ? parseFloat(reading.temperatureFahrenheit).toFixed(1) : null;
  const tempC = reading ? parseFloat(reading.temperatureCelsius).toFixed(1) : null;
  const humidity = reading?.humidityPercent ? parseFloat(reading.humidityPercent).toFixed(0) : null;
  const battery = reading?.batteryLevel ?? null;
  const lastSeen = reading?.recordedAt
    ? formatDistanceToNow(new Date(reading.recordedAt), { addSuffix: true })
    : "No data yet";

  return (
    <Card data-testid={`card-sensor-${device.id}`} className={hasAlert ? "border-destructive" : undefined}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base truncate" data-testid={`text-device-name-${device.id}`}>
              {device.deviceName}
            </CardTitle>
            {device.locationLabel && (
              <CardDescription className="truncate">{device.locationLabel}</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {hasAlert && (
              <Badge variant="destructive" className="gap-1" data-testid={`badge-alert-${device.id}`}>
                <AlertTriangle className="h-3 w-3" />
                Alert
              </Badge>
            )}
            {device.isOnline ? (
              <Badge variant="outline" className="gap-1" data-testid={`badge-online-${device.id}`}>
                <Wifi className="h-3 w-3" />
                Online
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1" data-testid={`badge-offline-${device.id}`}>
                <WifiOff className="h-3 w-3" />
                Offline
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {reading ? (
          <>
            <div className="flex items-baseline gap-2">
              <Thermometer className="h-5 w-5 text-muted-foreground" />
              <div className="text-3xl font-semibold" data-testid={`text-temperature-${device.id}`}>
                {tempF}&deg;F
              </div>
              <div className="text-sm text-muted-foreground">{tempC}&deg;C</div>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {humidity !== null && (
                <div className="flex items-center gap-1.5" data-testid={`text-humidity-${device.id}`}>
                  <Droplets className="h-4 w-4" />
                  {humidity}% humidity
                </div>
              )}
              {battery !== null && (
                <div className="flex items-center gap-1.5" data-testid={`text-battery-${device.id}`}>
                  <Battery className="h-4 w-4" />
                  {battery}%
                </div>
              )}
            </div>
            <div className="text-xs text-muted-foreground" data-testid={`text-last-seen-${device.id}`}>
              Updated {lastSeen}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Waiting for first reading…</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function TemperaturePage() {
  const { data: status, isLoading: statusLoading } = useQuery<GoveeStatus>({
    queryKey: ["/api/govee/status"],
    refetchInterval: 60000,
  });

  const { data: readingsData, isLoading: readingsLoading } = useQuery<{ readings: LatestReadingData[] }>({
    queryKey: ["/api/govee/readings/latest"],
    enabled: status?.connected === true,
    refetchInterval: 60000,
  });

  const { data: alertsData } = useQuery<{ alerts: AlertEvent[] }>({
    queryKey: ["/api/govee/alerts"],
    enabled: status?.connected === true,
    refetchInterval: 60000,
  });

  const activeAlertDeviceIds = new Set(
    (alertsData?.alerts ?? []).filter((a) => a.status === "triggered").map((a) => a.deviceId),
  );
  const readings = readingsData?.readings ?? [];

  return (
    <DashboardLayout>
      <div className="container max-w-6xl py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Thermometer className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold" data-testid="heading-temperature">
              Shelter Temperature
            </h1>
            <p className="text-sm text-muted-foreground">
              Live readings from your Govee sensors
            </p>
          </div>
        </div>

        {statusLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44 w-full" />
            ))}
          </div>
        ) : !status?.connected ? (
          <Card data-testid="card-not-connected">
            <CardHeader>
              <CardTitle className="text-base">No sensors connected</CardTitle>
              <CardDescription>
                Temperature monitoring is not set up for this shelter yet. Ask an admin
                to connect a Govee account in Settings &rarr; Integrations.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : readingsLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44 w-full" />
            ))}
          </div>
        ) : readings.length === 0 ? (
          <Card data-testid="card-no-devices">
            <CardHeader>
              <CardTitle className="text-base">No devices yet</CardTitle>
              <CardDescription>
                The Govee account is connected but no sensors have been added.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="grid-sensors">
            {readings.map(({ device, reading }) => (
              <SensorCard
                key={device.id}
                device={device}
                reading={reading}
                hasAlert={activeAlertDeviceIds.has(device.id)}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

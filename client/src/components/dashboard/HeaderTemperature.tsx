import { useQuery } from "@tanstack/react-query";
import { Thermometer, Droplets, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

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

function getTempColor(temp: number | null): string {
  if (temp === null) return "text-muted-foreground";
  if (temp < 50) return "text-blue-500";
  if (temp < 65) return "text-cyan-500";
  if (temp < 75) return "text-green-500";
  if (temp < 85) return "text-orange-500";
  return "text-red-500";
}

export default function HeaderTemperature() {
  const { data: status } = useQuery<GoveeStatus>({
    queryKey: ["/api/govee/status"],
    refetchInterval: 60000,
  });

  const { data: readingsData } = useQuery<{ readings: LatestReadingData[] }>({
    queryKey: ["/api/govee/readings/latest"],
    enabled: status?.connected === true,
    refetchInterval: 60000,
  });

  const { data: alertsData } = useQuery<{ alerts: any[] }>({
    queryKey: ["/api/govee/alerts"],
    enabled: status?.connected === true,
    refetchInterval: 60000,
  });

  if (!status?.connected) return null;

  const readings = readingsData?.readings || [];
  if (readings.length === 0) return null;

  const display = readings.find((r) => r.reading) || readings[0];
  const reading = display.reading;
  const tempF = reading ? parseFloat(reading.temperatureFahrenheit) : NaN;
  const humidity = reading?.humidityPercent ? parseFloat(reading.humidityPercent) : null;
  const activeAlerts = (alertsData?.alerts || []).filter((a) => a.status === "triggered");
  const hasAnyAlert = activeAlerts.length > 0;
  const overflowCount = readings.length - 1;
  const label = display.device.locationLabel || display.device.deviceName;

  return (
    <Link
      href="/dashboard/temperature"
      data-testid="link-header-temperature"
    >
      <div
        className={`flex items-center gap-2 h-10 sm:h-12 px-3 rounded-full border-2 hover-elevate ${
          hasAnyAlert
            ? "border-destructive bg-destructive/10"
            : "border-muted-foreground/30 bg-muted/50"
        }`}
        data-testid="header-temperature-pill"
        title={label}
      >
        {hasAnyAlert ? (
          <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
        ) : (
          <Thermometer className={`h-4 w-4 flex-shrink-0 ${getTempColor(isNaN(tempF) ? null : tempF)}`} />
        )}
        <span
          className={`text-sm sm:text-base font-bold ${
            hasAnyAlert ? "text-destructive" : getTempColor(isNaN(tempF) ? null : tempF)
          }`}
          data-testid="text-header-temp-value"
        >
          {isNaN(tempF) ? "--" : `${tempF.toFixed(1)}°F`}
        </span>
        {humidity !== null && !isNaN(humidity) && (
          <span
            className="flex items-center gap-1 text-xs text-muted-foreground"
            data-testid="text-header-humidity-value"
          >
            <Droplets className="h-3 w-3" />
            {humidity.toFixed(0)}%
          </span>
        )}
        {overflowCount > 0 && (
          <span
            className="text-[10px] sm:text-xs text-muted-foreground font-medium ml-0.5"
            data-testid="text-header-temp-overflow"
          >
            +{overflowCount}
          </span>
        )}
      </div>
    </Link>
  );
}

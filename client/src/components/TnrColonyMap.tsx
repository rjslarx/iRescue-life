import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cat, MapPin, ExternalLink, X, RefreshCw, Loader2 } from "lucide-react";

interface MapRecord {
  id: string;
  name: string;
  localShelterId: string | null;
  colonyName: string | null;
  colonyLocation: string | null;
  latitude: number;
  longitude: number;
  tnrOutcomeType: string | null;
  photoUrls: string[] | null;
  sex: string | null;
  colors: string[] | null;
  intakeDate: string | null;
  trapNumber: string | null;
}

const OUTCOME_COLORS: Record<string, string> = {
  returned_to_colony: "#22c55e",
  relocated: "#3b82f6",
  transferred_to_rescue: "#f59e0b",
  euthanized: "#ef4444",
  died_in_care: "#ef4444",
};

const OUTCOME_LABELS: Record<string, string> = {
  returned_to_colony: "Returned to Colony",
  relocated: "Relocated",
  transferred_to_rescue: "Transferred to Rescue",
  euthanized: "Euthanized",
  died_in_care: "Died in Care",
};

const DEFAULT_CENTER = { lat: 39.8283, lng: -98.5795 };

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

let mapsScriptPromise: Promise<void> | null = null;

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if ((window as any).google?.maps) return Promise.resolve();
  if (mapsScriptPromise) return mapsScriptPromise;

  mapsScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return mapsScriptPromise;
}

interface InfoPanelProps {
  record: MapRecord;
  onClose: () => void;
  onViewRecord: (record: MapRecord) => void;
}

function InfoPanel({ record, onClose, onViewRecord }: InfoPanelProps) {
  const fmtSex = (s: string | null) => s === "male" ? "M" : s === "female" ? "F" : s || "";
  const photoUrl = record.photoUrls && record.photoUrls.length > 0 ? record.photoUrls[0] : null;

  return (
    <div className="absolute top-4 right-4 z-10 bg-background border rounded-md shadow-lg p-4 min-w-[260px] max-w-[320px]" data-testid="map-info-panel">
      <button onClick={onClose} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground" data-testid="button-close-info-panel">
        <X className="h-4 w-4" />
      </button>

      {photoUrl && (
        <div className="mb-2 rounded-md overflow-hidden">
          <img
            src={photoUrl.startsWith("http") ? photoUrl : photoUrl}
            alt={record.name}
            className="w-full h-32 object-cover"
            data-testid="img-tnr-photo"
          />
        </div>
      )}

      <div className="flex items-center gap-2 mb-1">
        <Cat className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="font-semibold text-sm" data-testid="text-info-name">{record.name}</span>
      </div>
      {record.localShelterId && (
        <p className="text-xs text-muted-foreground mb-1" data-testid="text-info-id">ID: {record.localShelterId}</p>
      )}
      {record.colonyName && (
        <p className="text-xs mb-0.5"><span className="font-medium">Colony:</span> {record.colonyName}</p>
      )}
      {record.colonyLocation && (
        <p className="text-xs mb-0.5"><span className="font-medium">Location:</span> {record.colonyLocation}</p>
      )}
      {record.trapNumber && (
        <p className="text-xs mb-0.5"><span className="font-medium">Trap #:</span> {record.trapNumber}</p>
      )}
      {record.sex && (
        <p className="text-xs mb-0.5"><span className="font-medium">Sex:</span> {fmtSex(record.sex)}</p>
      )}
      {record.intakeDate && (
        <p className="text-xs mb-0.5"><span className="font-medium">Date:</span> {new Date(record.intakeDate).toLocaleDateString()}</p>
      )}
      {record.tnrOutcomeType && (
        <Badge variant="secondary" className="mt-1 text-xs">
          {OUTCOME_LABELS[record.tnrOutcomeType] || record.tnrOutcomeType}
        </Badge>
      )}

      <div className="mt-3 pt-2 border-t">
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => onViewRecord(record)}
          data-testid="button-view-full-record"
        >
          <ExternalLink className="h-3 w-3 mr-1.5" />
          View Full Record
        </Button>
      </div>
    </div>
  );
}

interface TnrColonyMapProps {
  onViewRecord?: (record: MapRecord) => void;
}

export default function TnrColonyMap({ onViewRecord }: TnrColonyMapProps) {
  const { toast } = useToast();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<MapRecord | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const backfillMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/tnr-records/geocode-backfill"),
    onSuccess: async (res: any) => {
      const data = typeof res.json === "function" ? await res.json() : res;
      queryClient.invalidateQueries({ queryKey: ["/api/tnr-records/map"] });
      toast({
        title: "Geocoding complete",
        description: `Updated ${data.updated || 0} of ${data.total || 0} records.`,
      });
    },
    onError: () => {
      toast({ title: "Geocoding failed", description: "Could not backfill coordinates.", variant: "destructive" });
    },
  });

  const { data, isLoading } = useQuery<{ records: MapRecord[] }>({
    queryKey: ["/api/tnr-records/map"],
  });

  const records = data?.records || [];

  const center = useMemo(() => {
    if (records.length === 0) return DEFAULT_CENTER;
    const avgLat = records.reduce((sum, r) => sum + r.latitude, 0) / records.length;
    const avgLng = records.reduce((sum, r) => sum + r.longitude, 0) / records.length;
    return { lat: avgLat, lng: avgLng };
  }, [records]);

  const colonyCount = useMemo(() => {
    const names = new Set<string>();
    for (const r of records) {
      names.add(r.colonyName || r.colonyLocation || "Unknown");
    }
    return names.size;
  }, [records]);

  useEffect(() => {
    if (!MAPS_API_KEY) return;
    loadGoogleMapsScript(MAPS_API_KEY)
      .then(() => setMapLoaded(true))
      .catch((err) => setLoadError(err.message));
  }, []);

  useEffect(() => {
    if (!mapLoaded || !mapContainerRef.current) return;
    if (mapRef.current) return;

    mapRef.current = new google.maps.Map(mapContainerRef.current, {
      center,
      zoom: records.length <= 1 ? 12 : 10,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
    });
  }, [mapLoaded]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    for (const m of markersRef.current) {
      m.setMap(null);
    }
    markersRef.current = [];

    const bounds = new google.maps.LatLngBounds();
    let hasBounds = false;

    for (const record of records) {
      const color = OUTCOME_COLORS[record.tnrOutcomeType || ""] || "#6b7280";
      const marker = new google.maps.Marker({
        position: { lat: record.latitude, lng: record.longitude },
        map: mapRef.current,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: color,
          fillOpacity: 0.9,
          strokeColor: "#ffffff",
          strokeWeight: 2,
          scale: 10,
        },
        title: record.name,
      });

      marker.addListener("click", () => {
        setSelectedRecord(record);
      });

      markersRef.current.push(marker);
      bounds.extend({ lat: record.latitude, lng: record.longitude });
      hasBounds = true;
    }

    if (hasBounds && records.length > 1) {
      mapRef.current.fitBounds(bounds, 60);
    } else if (records.length === 1) {
      mapRef.current.setCenter({ lat: records[0].latitude, lng: records[0].longitude });
      mapRef.current.setZoom(14);
    } else {
      mapRef.current.setCenter(center);
      mapRef.current.setZoom(10);
    }
  }, [records, mapLoaded]);

  const handleViewRecord = (record: MapRecord) => {
    if (onViewRecord) {
      onViewRecord(record);
    }
  };

  if (!MAPS_API_KEY) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground" data-testid="tnr-colony-map">
        <MapPin className="h-12 w-12 opacity-40" />
        <p className="text-sm">Google Maps API key not configured.</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground" data-testid="tnr-colony-map">
        <MapPin className="h-12 w-12 opacity-40" />
        <p className="text-sm">Failed to load Google Maps. Please check your API key.</p>
      </div>
    );
  }

  if (!mapLoaded || isLoading) {
    return (
      <div className="space-y-3 p-4" data-testid="tnr-colony-map">
        <Skeleton className="h-[500px] w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="tnr-colony-map">
      <div className="flex items-center gap-4 flex-wrap px-4 py-2 border-b">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium" data-testid="text-map-count">{records.length} mapped</span>
          <span>across {colonyCount} {colonyCount === 1 ? "colony" : "colonies"}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap ml-auto">
          {Object.entries(OUTCOME_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs">
              <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: OUTCOME_COLORS[key] }} />
              <span>{label}</span>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => backfillMutation.mutate()}
            disabled={backfillMutation.isPending}
            data-testid="button-geocode-backfill"
          >
            {backfillMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Geocode All
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-[500px] relative">
        <div ref={mapContainerRef} className="w-full h-full" />
        {selectedRecord && (
          <InfoPanel
            record={selectedRecord}
            onClose={() => setSelectedRecord(null)}
            onViewRecord={handleViewRecord}
          />
        )}
      </div>
    </div>
  );
}

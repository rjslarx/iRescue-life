import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MapPin, RefreshCw, Loader2 } from "lucide-react";

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

interface BackfillResponse {
  total: number;
  updated: number;
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

let mapsScriptPromise: Promise<void> | null = null;

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  const win = window as unknown as { google?: { maps?: { Map?: unknown } } };
  if (win.google?.maps?.Map) return Promise.resolve();
  if (mapsScriptPromise) return mapsScriptPromise;

  mapsScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelectorAll('script[src*="maps.googleapis.com"], script[data-gmaps]');
    existing.forEach((el) => el.remove());

    const directUrl = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    const proxyUrl = `/api/config/maps-script?key=${apiKey}`;

    function tryLoad(url: string, isProxy: boolean) {
      const script = document.createElement("script");
      script.setAttribute("data-gmaps", "true");
      script.src = url;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        const w = window as unknown as { google?: { maps?: { Map?: unknown } } };
        if (w.google?.maps?.Map) {
          resolve();
        } else {
          mapsScriptPromise = null;
          reject(new Error("Google Maps script loaded but the Maps JavaScript API is not available. Please verify the Maps JavaScript API is enabled in Google Cloud Console."));
        }
      };
      script.onerror = () => {
        script.remove();
        if (!isProxy) {
          tryLoad(proxyUrl, true);
        } else {
          mapsScriptPromise = null;
          reject(new Error("Could not load Google Maps. This may be caused by a browser extension, firewall, or network restriction blocking googleapis.com."));
        }
      };
      document.head.appendChild(script);
    }

    tryLoad(directUrl, false);
  });
  return mapsScriptPromise;
}

function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === "https:" || parsed.protocol === "http:" || parsed.pathname.startsWith("/");
  } catch {
    return false;
  }
}

function buildInfoWindowElement(record: MapRecord, onViewClick: () => void): HTMLElement {
  const fmtSex = (s: string | null) => s === "male" ? "M" : s === "female" ? "F" : s || "";

  const container = document.createElement("div");
  container.style.cssText = "font-family:system-ui,sans-serif;min-width:200px;max-width:280px;font-size:13px;";
  container.setAttribute("data-testid", "map-info-window");

  const photoUrl = record.photoUrls && record.photoUrls.length > 0 ? record.photoUrls[0] : null;
  if (photoUrl && isValidImageUrl(photoUrl)) {
    const imgWrap = document.createElement("div");
    imgWrap.style.cssText = "margin-bottom:8px;border-radius:6px;overflow:hidden;";
    const img = document.createElement("img");
    img.src = photoUrl;
    img.alt = record.name;
    img.style.cssText = "width:100%;height:100px;object-fit:cover;";
    img.setAttribute("data-testid", "img-tnr-photo");
    imgWrap.appendChild(img);
    container.appendChild(imgWrap);
  }

  const nameDiv = document.createElement("div");
  nameDiv.style.cssText = "font-weight:600;font-size:14px;margin-bottom:2px;";
  nameDiv.setAttribute("data-testid", "text-info-name");
  nameDiv.textContent = record.name;
  container.appendChild(nameDiv);

  if (record.localShelterId) {
    const idDiv = document.createElement("div");
    idDiv.style.cssText = "color:#6b7280;font-size:11px;margin-bottom:4px;";
    idDiv.setAttribute("data-testid", "text-info-id");
    idDiv.textContent = `ID: ${record.localShelterId}`;
    container.appendChild(idDiv);
  }

  const fields: [string, string][] = [];
  if (record.colonyName) fields.push(["Colony", record.colonyName]);
  if (record.colonyLocation) fields.push(["Location", record.colonyLocation]);
  if (record.trapNumber) fields.push(["Trap #", record.trapNumber]);
  if (record.sex) fields.push(["Sex", fmtSex(record.sex)]);
  if (record.intakeDate) fields.push(["Date", new Date(record.intakeDate).toLocaleDateString()]);

  for (const [label, value] of fields) {
    const fieldDiv = document.createElement("div");
    fieldDiv.style.cssText = "font-size:12px;margin-bottom:2px;";
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    fieldDiv.appendChild(strong);
    fieldDiv.appendChild(document.createTextNode(value));
    container.appendChild(fieldDiv);
  }

  const outcomeLabel = record.tnrOutcomeType ? (OUTCOME_LABELS[record.tnrOutcomeType] || record.tnrOutcomeType) : "";
  const outcomeColor = record.tnrOutcomeType ? (OUTCOME_COLORS[record.tnrOutcomeType] || "#6b7280") : "";

  if (outcomeLabel) {
    const badge = document.createElement("div");
    badge.style.cssText = `display:inline-block;margin-top:4px;padding:2px 8px;border-radius:9999px;font-size:11px;background:${outcomeColor}20;color:${outcomeColor};font-weight:500;`;
    badge.textContent = outcomeLabel;
    container.appendChild(badge);
  }

  const footer = document.createElement("div");
  footer.style.cssText = "margin-top:8px;padding-top:6px;border-top:1px solid #e5e7eb;";
  const btn = document.createElement("button");
  btn.setAttribute("data-testid", "button-view-full-record");
  btn.style.cssText = "width:100%;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;gap:4px;";
  btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
  btn.appendChild(document.createTextNode("View Full Record"));
  btn.addEventListener("click", onViewClick);
  footer.appendChild(btn);
  container.appendChild(footer);

  return container;
}

interface TnrColonyMapProps {
  onViewRecord?: (record: MapRecord) => void;
}

export default function TnrColonyMap({ onViewRecord }: TnrColonyMapProps) {
  const { toast } = useToast();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const backfillMutation = useMutation({
    mutationFn: async (): Promise<BackfillResponse> => {
      const res = await apiRequest("POST", "/api/tnr-records/geocode-backfill");
      return res.json() as Promise<BackfillResponse>;
    },
    onSuccess: (data: BackfillResponse) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tnr-records/map"] });
      toast({
        title: "Geocoding complete",
        description: `Updated ${data.updated} of ${data.total} records.`,
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
    fetch("/api/config/maps-key")
      .then((r) => r.json())
      .then((data: { key: string }) => {
        const key = data.key || import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
        if (!key) {
          setLoadError("Google Maps API key not configured. Set GOOGLE_MAPS_API_KEY in your environment.");
          return;
        }
        return loadGoogleMapsScript(key);
      })
      .then((result) => {
        if (result !== undefined) setMapLoaded(true);
      })
      .catch((err) => {
        setLoadError(err.message);
      });
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

    infoWindowRef.current = new google.maps.InfoWindow();
  }, [mapLoaded]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !infoWindowRef.current) return;

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
        if (!infoWindowRef.current || !mapRef.current) return;
        const element = buildInfoWindowElement(record, () => {
          if (onViewRecord) onViewRecord(record);
        });
        infoWindowRef.current.setContent(element);
        infoWindowRef.current.open(mapRef.current, marker);
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
  }, [records, mapLoaded, onViewRecord]);

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground" data-testid="tnr-colony-map">
        <MapPin className="h-12 w-12 opacity-40" />
        <p className="text-sm font-medium">Failed to load Google Maps</p>
        <p className="text-xs max-w-md text-center">{loadError}</p>
        <Button
          size="sm"
          variant="outline"
          data-testid="button-retry-maps"
          onClick={() => {
            setLoadError(null);
            fetch("/api/config/maps-key")
              .then((r) => r.json())
              .then((data: { key: string }) => {
                const key = data.key || import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
                if (!key) {
                  setLoadError("Google Maps API key not configured.");
                  return;
                }
                return loadGoogleMapsScript(key);
              })
              .then((result) => {
                if (result !== undefined) setMapLoaded(true);
              })
              .catch((err) => setLoadError(err.message));
          }}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </Button>
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

      <div className="flex-1 min-h-[500px]">
        <div ref={mapContainerRef} className="w-full h-full" />
      </div>
    </div>
  );
}

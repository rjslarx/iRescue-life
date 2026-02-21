import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import SignaturePad from "signature_pad";
import { 
  Loader2, 
  Truck, 
  MapPin, 
  Calendar, 
  CheckCircle2, 
  PawPrint,
  Phone,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  User,
  Clock,
  Pill,
  Ban,
  ShieldAlert,
  Eraser,
  PenLine,
  AlertCircle,
  Heart,
  Star,
  MapPinned,
  ClipboardSignature,
  MessageCircle,
  Send,
  Coffee,
  Car,
  Printer,
} from "lucide-react";
import type { 
  TransportEvent, 
  TransportManifestItem,
  TransportStop,
  TransportParticipant,
  TransportUpdate,
  Animal,
} from "@shared/schema";

interface TransportDetailData {
  transport: TransportEvent;
  participants: TransportParticipant[];
  updates: TransportUpdate[];
}

interface ManifestData {
  items: (TransportManifestItem & { animal?: Animal | null })[];
}

interface StopsData {
  stops: TransportStop[];
}

function ConfirmDropoffDialog({
  item,
  open,
  onOpenChange,
  transportId,
}: {
  item: TransportManifestItem & { animal?: Animal | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transportId: string;
}) {
  const { toast } = useToast();
  const [confirmedBy, setConfirmedBy] = useState("");
  const [notes, setNotes] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signaturePadRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    let cancelled = false;
    let rafId: number | null = null;
    
    if (open && canvasRef.current) {
      const initializeSignaturePad = () => {
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const width = canvas.offsetWidth;
        const height = canvas.offsetHeight;
        
        if (width === 0 || height === 0) {
          rafId = requestAnimationFrame(initializeSignaturePad);
          return;
        }
        
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.scale(ratio, ratio);
        }
        signaturePadRef.current = new SignaturePad(canvas, {
          backgroundColor: "rgb(255, 255, 255)",
          penColor: "rgb(0, 0, 0)",
        });
      };
      
      rafId = requestAnimationFrame(initializeSignaturePad);
    }
    return () => {
      cancelled = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (signaturePadRef.current) {
        signaturePadRef.current.off();
        signaturePadRef.current = null;
      }
    };
  }, [open]);

  const clearSignature = () => {
    if (signaturePadRef.current) {
      signaturePadRef.current.clear();
    }
  };

  const getSignatureDataUrl = (): string | null => {
    if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
      return signaturePadRef.current.toDataURL("image/png");
    }
    return null;
  };

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const signatureDataUrl = getSignatureDataUrl();
      if (!signatureDataUrl) {
        throw new Error("Signature is required");
      }
      const response = await apiRequest('POST', `/api/transport/manifest/${item.id}/confirm-delivery`, {
        confirmedBy,
        notes: notes || undefined,
        signatureDataUrl,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/transport/events', transportId, 'manifest'] });
      onOpenChange(false);
      setConfirmedBy("");
      setNotes("");
      clearSignature();
      toast({
        title: "Dropoff confirmed",
        description: `${item.animal?.name || 'Animal'} has been marked as delivered.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to confirm dropoff",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const animalName = item.animal?.name || 'Unknown Animal';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PawPrint className="h-5 w-5" />
            Confirm Dropoff
          </DialogTitle>
          <DialogDescription>
            Confirm delivery of <strong>{animalName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Received By *</label>
            <Input
              placeholder="Name of person receiving the animal"
              value={confirmedBy}
              onChange={(e) => setConfirmedBy(e.target.value)}
              data-testid="input-confirmed-by"
            />
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <PenLine className="h-4 w-4" />
                Signature *
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSignature}
                type="button"
                data-testid="button-clear-signature"
              >
                <Eraser className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
            <div className="border-2 border-dashed rounded-lg overflow-hidden bg-white">
              <canvas
                ref={canvasRef}
                className="w-full touch-none cursor-crosshair"
                style={{ height: "150px" }}
                data-testid="canvas-dropoff-signature"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Sign with your finger or stylus to confirm receipt
            </p>
          </div>

          <div>
            <label className="text-sm font-medium">Notes (Optional)</label>
            <Textarea
              placeholder="Any notes about the dropoff..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              data-testid="input-dropoff-notes"
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            onClick={() => confirmMutation.mutate()}
            disabled={!confirmedBy || confirmMutation.isPending}
            className="w-full sm:w-auto"
            data-testid="button-confirm-dropoff"
          >
            {confirmMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Confirm Dropoff
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmStopHandoverDialog({
  stop,
  animals,
  open,
  onOpenChange,
  transportId,
}: {
  stop: TransportStop;
  animals: (TransportManifestItem & { animal?: Animal | null })[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transportId: string;
}) {
  const { toast } = useToast();
  const [receiverName, setReceiverName] = useState("");
  const [notes, setNotes] = useState("");
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [locationCoords, setLocationCoords] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signaturePadRef = useRef<SignaturePad | null>(null);

  const undeliveredAnimals = animals.filter(a => !a.isDelivered);

  useEffect(() => {
    let cancelled = false;
    let rafId: number | null = null;
    
    if (open && canvasRef.current) {
      const initializeSignaturePad = () => {
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const width = canvas.offsetWidth;
        const height = canvas.offsetHeight;
        
        if (width === 0 || height === 0) {
          rafId = requestAnimationFrame(initializeSignaturePad);
          return;
        }
        
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.scale(ratio, ratio);
        }
        signaturePadRef.current = new SignaturePad(canvas, {
          backgroundColor: "rgb(255, 255, 255)",
          penColor: "rgb(0, 0, 0)",
        });
      };
      
      rafId = requestAnimationFrame(initializeSignaturePad);
    }
    return () => {
      cancelled = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (signaturePadRef.current) {
        signaturePadRef.current.off();
        signaturePadRef.current = null;
      }
    };
  }, [open]);

  const clearSignature = () => {
    if (signaturePadRef.current) {
      signaturePadRef.current.clear();
    }
  };

  const getSignatureDataUrl = (): string | null => {
    if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
      return signaturePadRef.current.toDataURL("image/png");
    }
    return null;
  };

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      return;
    }
    
    setIsGettingLocation(true);
    setLocationError(null);
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = `${position.coords.latitude},${position.coords.longitude}`;
        setLocationCoords(coords);
        setIsGettingLocation(false);
        toast({
          title: "Location captured",
          description: "Your current location has been recorded.",
        });
      },
      (error) => {
        setIsGettingLocation(false);
        let message = "Failed to get location";
        if (error.code === 1) {
          message = "Location access denied. Please enable location permissions.";
        } else if (error.code === 2) {
          message = "Location unavailable. Please try again.";
        } else if (error.code === 3) {
          message = "Location request timed out.";
        }
        setLocationError(message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const signatureDataUrl = getSignatureDataUrl();
      if (!signatureDataUrl) {
        throw new Error("Signature is required");
      }
      const response = await apiRequest('POST', `/api/transport/stops/${stop.id}/confirm-handover`, {
        receiverName,
        signatureDataUrl,
        notes: notes || undefined,
        locationCoords: locationCoords || undefined,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/transport/events', transportId, 'manifest'] });
      queryClient.invalidateQueries({ queryKey: ['/api/transport/events', transportId, 'stops'] });
      onOpenChange(false);
      setReceiverName("");
      setNotes("");
      setLocationCoords(null);
      clearSignature();
      toast({
        title: "Handover confirmed",
        description: `${data.deliveredCount} animal(s) marked as delivered at ${stop.locationName}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to confirm handover",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardSignature className="h-5 w-5" />
            Confirm Stop Handover
          </DialogTitle>
          <DialogDescription>
            Sign to confirm delivery of all {undeliveredAnimals.length} animal(s) at <strong>{stop.locationName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-sm font-medium mb-2 flex items-center gap-2">
              <PawPrint className="h-4 w-4" />
              Animals Being Delivered ({undeliveredAnimals.length})
            </p>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {undeliveredAnimals.map((item) => (
                <div key={item.id} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  <span>{item.animal?.name || 'Unknown'}</span>
                  {item.animal?.species && (
                    <span className="text-muted-foreground">({item.animal.species})</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Receiver Name *</label>
            <Input
              placeholder="Name of person receiving the animals"
              value={receiverName}
              onChange={(e) => setReceiverName(e.target.value)}
              data-testid="input-stop-receiver-name"
            />
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <PenLine className="h-4 w-4" />
                Signature *
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSignature}
                type="button"
                data-testid="button-clear-stop-signature"
              >
                <Eraser className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
            <div className="border-2 border-dashed rounded-lg overflow-hidden bg-white">
              <canvas
                ref={canvasRef}
                className="w-full touch-none cursor-crosshair"
                style={{ height: "150px" }}
                data-testid="canvas-stop-signature"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Sign to confirm receipt of all animals at this stop
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <MapPinned className="h-4 w-4" />
                Location (Optional)
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={captureLocation}
                disabled={isGettingLocation}
                type="button"
                data-testid="button-capture-location"
              >
                {isGettingLocation ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <MapPinned className="h-4 w-4 mr-1" />
                )}
                {locationCoords ? "Update" : "Capture"}
              </Button>
            </div>
            {locationCoords && (
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-950/30 p-2 rounded">
                <CheckCircle2 className="h-4 w-4" />
                Location recorded
              </div>
            )}
            {locationError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-2 rounded">
                <AlertTriangle className="h-4 w-4" />
                {locationError}
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">Notes (Optional)</label>
            <Textarea
              placeholder="Any notes about the handover..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              data-testid="input-stop-handover-notes"
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            onClick={() => confirmMutation.mutate()}
            disabled={!receiverName || confirmMutation.isPending}
            className="w-full sm:w-auto"
            data-testid="button-confirm-stop-handover"
          >
            {confirmMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <ClipboardSignature className="h-4 w-4 mr-2" />
            Confirm Handover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AnimalCard({
  item,
  onConfirmClick,
}: {
  item: TransportManifestItem & { animal?: Animal | null };
  onConfirmClick: () => void;
}) {
  const isDelivered = item.isDelivered;
  const animalName = item.animal?.name || 'Unknown';
  const animalPhoto = item.animal?.photoUrls?.[0];

  return (
    <div 
      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
        isDelivered 
          ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' 
          : 'bg-card hover:bg-accent/50'
      }`}
      data-testid={`card-animal-${item.id}`}
    >
      {animalPhoto ? (
        <img 
          src={animalPhoto} 
          alt={animalName}
          className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
          <PawPrint className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold truncate">{animalName}</p>
          {isDelivered && (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 flex-shrink-0">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Delivered
            </Badge>
          )}
        </div>
        
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {item.animal?.species && (
            <span className="text-xs text-muted-foreground">{item.animal.species}</span>
          )}
          {item.animal?.breed && (
            <span className="text-xs text-muted-foreground">• {item.animal.breed}</span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 mt-2">
          {item.needsMedication && (
            <Badge variant="outline" className="text-xs border-orange-300 text-orange-700 dark:text-orange-400">
              <Pill className="h-3 w-3 mr-1" />
              Meds
            </Badge>
          )}
          {item.isFlightRisk && (
            <Badge variant="outline" className="text-xs border-red-300 text-red-700 dark:text-red-400">
              <Ban className="h-3 w-3 mr-1" />
              Flight Risk
            </Badge>
          )}
          {item.isAggressive && (
            <Badge variant="outline" className="text-xs border-red-300 text-red-700 dark:text-red-400">
              <ShieldAlert className="h-3 w-3 mr-1" />
              Caution
            </Badge>
          )}
          {item.hasSpecialNeeds && (
            <Badge variant="outline" className="text-xs border-purple-300 text-purple-700 dark:text-purple-400">
              <Heart className="h-3 w-3 mr-1" />
              Special Needs
            </Badge>
          )}
        </div>

        {item.specialInstructions && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
            {item.specialInstructions}
          </p>
        )}
      </div>

      {!isDelivered && (
        <Button
          size="sm"
          onClick={onConfirmClick}
          className="flex-shrink-0"
          data-testid={`button-confirm-dropoff-${item.id}`}
        >
          <CheckCircle2 className="h-4 w-4 mr-1" />
          Confirm
        </Button>
      )}
    </div>
  );
}

export default function ActiveTransportPage() {
  const { transportId } = useParams<{ transportId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<(TransportManifestItem & { animal?: Animal | null }) | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedStop, setSelectedStop] = useState<TransportStop | null>(null);
  const [stopHandoverDialogOpen, setStopHandoverDialogOpen] = useState(false);
  const [stopAnimalsForHandover, setStopAnimalsForHandover] = useState<(TransportManifestItem & { animal?: Animal | null })[]>([]);
  
  // Quick Status bar state
  const [delayDialogOpen, setDelayDialogOpen] = useState(false);
  const [delayMinutes, setDelayMinutes] = useState("15");
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [quickNote, setQuickNote] = useState("");

  // Quick action mutations
  const delayMutation = useMutation({
    mutationFn: async (delayMinutes: number) => {
      const response = await apiRequest('POST', `/api/transport/events/${transportId}/timeline/delay`, { delayMinutes });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/transport/events', transportId, 'timeline'] });
      toast({ title: "Delay reported", description: "Traffic delay has been logged." });
      setDelayDialogOpen(false);
      setDelayMinutes("15");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to report delay",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const pottyBreakMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/transport/events/${transportId}/timeline/potty-break`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/transport/events', transportId, 'timeline'] });
      toast({ title: "Logged", description: "Potty break recorded." });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to log",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const commentMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest('POST', `/api/transport/events/${transportId}/comment`, { message });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/transport/events', transportId, 'timeline'] });
      toast({ title: "Note added", description: "Your note has been recorded." });
      setNoteDialogOpen(false);
      setQuickNote("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add note",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleDelaySubmit = () => {
    const mins = parseInt(delayMinutes) || 15;
    delayMutation.mutate(mins);
  };

  const handlePottyBreak = () => {
    pottyBreakMutation.mutate();
  };

  const handleQuickNoteSubmit = () => {
    if (!quickNote.trim()) return;
    commentMutation.mutate(quickNote.trim());
  };

  const isQuickActionPending = delayMutation.isPending || pottyBreakMutation.isPending || commentMutation.isPending;

  const { data: transportData, isLoading: transportLoading } = useQuery<TransportDetailData>({
    queryKey: ['/api/transport/events', transportId],
    enabled: !!transportId,
  });

  const { data: manifestData, isLoading: manifestLoading } = useQuery<ManifestData>({
    queryKey: ['/api/transport/events', transportId, 'manifest'],
    enabled: !!transportId,
  });

  const { data: stopsData, isLoading: stopsLoading } = useQuery<StopsData>({
    queryKey: ['/api/transport/events', transportId, 'stops'],
    enabled: !!transportId,
  });

  const isLoading = transportLoading || manifestLoading || stopsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading transport...</p>
        </div>
      </div>
    );
  }

  if (!transportData?.transport) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-6 w-6" />
              <CardTitle>Transport Not Found</CardTitle>
            </div>
            <CardDescription>
              This transport could not be found or you don't have access to it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => window.history.back()}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { transport } = transportData;
  const manifest = manifestData?.items || [];
  const stops = (stopsData?.stops || []).sort((a, b) => a.orderIndex - b.orderIndex);

  const deliveredCount = manifest.filter((item) => item.isDelivered).length;
  const progress = manifest.length > 0 ? (deliveredCount / manifest.length) * 100 : 0;

  const getAnimalsForStop = (stopId: string) => {
    return manifest.filter((item) => item.dropoffStopId === stopId);
  };

  const animalsWithoutStop = manifest.filter((item) => !item.dropoffStopId);

  const handleConfirmClick = (item: TransportManifestItem & { animal?: Animal | null }) => {
    setSelectedItem(item);
    setConfirmDialogOpen(true);
  };

  const handleStopHandoverClick = (stop: TransportStop, stopAnimals: (TransportManifestItem & { animal?: Animal | null })[]) => {
    setSelectedStop(stop);
    setStopAnimalsForHandover(stopAnimals);
    setStopHandoverDialogOpen(true);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center px-4 gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => window.history.back()}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Truck className="h-5 w-5 text-primary" />
          <span className="font-semibold truncate flex-1">{transport.name}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation(`/dashboard/transport/${transportId}/driver-packet`)}
            data-testid="button-print-driver-packet"
          >
            <Printer className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Print Driver Packet</span>
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Delivery Progress</span>
                <span className="font-medium">{deliveredCount} / {manifest.length}</span>
              </div>
              <Progress value={progress} className="h-3" />
              
              {transport.departureDate && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>{new Date(transport.departureDate).toLocaleDateString()}</span>
                </div>
              )}

              {(transport.originLocation || transport.destinationLocation) && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">
                    {transport.originLocation}
                    {transport.originLocation && transport.destinationLocation && (
                      <ArrowRight className="h-3 w-3 inline mx-1" />
                    )}
                    {transport.destinationLocation}
                  </span>
                </div>
              )}

              {transport.driverName && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>Driver: {transport.driverName}</span>
                  {transport.driverPhone && (
                    <a 
                      href={`tel:${transport.driverPhone}`} 
                      className="text-primary ml-1"
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {stops.length === 0 && manifest.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <PawPrint className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No stops or animals on this transport yet.</p>
            </CardContent>
          </Card>
        )}

        {stops.map((stop, index) => {
          const stopAnimals = getAnimalsForStop(stop.id);
          const stopDelivered = stopAnimals.filter((a) => a.isDelivered).length;
          const allDelivered = stopAnimals.length > 0 && stopDelivered === stopAnimals.length;

          return (
            <Card key={stop.id} data-testid={`card-stop-${stop.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    allDelivered 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                      : 'bg-primary text-primary-foreground'
                  }`}>
                    {allDelivered ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base flex items-center gap-2">
                      {stop.locationName}
                      {allDelivered && (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          Complete
                        </Badge>
                      )}
                    </CardTitle>
                    {stop.address && (
                      <CardDescription className="mt-1">{stop.address}</CardDescription>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {stop.estimatedArrival && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          ETA: {new Date(stop.estimatedArrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {stop.destinationContactName && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {stop.destinationContactName}
                        </span>
                      )}
                      {stop.destinationContactPhone && (
                        <a 
                          href={`tel:${stop.destinationContactPhone}`}
                          className="flex items-center gap-1 text-primary"
                        >
                          <Phone className="h-3 w-3" />
                          Call
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              
              {stopAnimals.length > 0 && (
                <CardContent className="pt-0">
                  <Separator className="mb-3" />
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <PawPrint className="h-4 w-4" />
                      Dropoffs ({stopAnimals.length})
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {stopDelivered}/{stopAnimals.length} delivered
                    </span>
                  </div>
                  <div className="space-y-2">
                    {stopAnimals.map((item) => (
                      <AnimalCard 
                        key={item.id} 
                        item={item} 
                        onConfirmClick={() => handleConfirmClick(item)}
                      />
                    ))}
                  </div>
                  
                  {!allDelivered && stopAnimals.filter(a => !a.isDelivered).length > 0 && (
                    <div className="mt-4 pt-3 border-t">
                      <Button
                        onClick={() => handleStopHandoverClick(stop, stopAnimals)}
                        className="w-full"
                        data-testid={`button-confirm-stop-handover-${stop.id}`}
                      >
                        <ClipboardSignature className="h-4 w-4 mr-2" />
                        Confirm Handover ({stopAnimals.filter(a => !a.isDelivered).length} animals)
                      </Button>
                      {stop.signedAt && (
                        <div className="flex items-center gap-2 text-xs text-green-600 mt-2 justify-center">
                          <CheckCircle2 className="h-3 w-3" />
                          Signed by {stop.signedByName} at {new Date(stop.signedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {allDelivered && stop.signedAt && (
                    <div className="mt-4 pt-3 border-t">
                      <div className="flex items-center gap-2 text-xs text-green-600 justify-center">
                        <CheckCircle2 className="h-3 w-3" />
                        Signed by {stop.signedByName} at {new Date(stop.signedAt).toLocaleString()}
                      </div>
                    </div>
                  )}
                </CardContent>
              )}

              {stopAnimals.length === 0 && (
                <CardContent className="pt-0">
                  <Separator className="mb-3" />
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No animals assigned to this stop
                  </p>
                </CardContent>
              )}
            </Card>
          );
        })}

        {animalsWithoutStop.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500" />
                Unassigned Animals
              </CardTitle>
              <CardDescription>
                These animals don't have a dropoff stop assigned
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Separator className="mb-3" />
              <div className="space-y-2">
                {animalsWithoutStop.map((item) => (
                  <AnimalCard 
                    key={item.id} 
                    item={item} 
                    onConfirmClick={() => handleConfirmClick(item)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {selectedItem && (
        <ConfirmDropoffDialog
          item={selectedItem}
          open={confirmDialogOpen}
          onOpenChange={setConfirmDialogOpen}
          transportId={transportId!}
        />
      )}

      {selectedStop && (
        <ConfirmStopHandoverDialog
          stop={selectedStop}
          animals={stopAnimalsForHandover}
          open={stopHandoverDialogOpen}
          onOpenChange={setStopHandoverDialogOpen}
          transportId={transportId!}
        />
      )}

      {/* Quick Status Bar - Fixed bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-2 safe-area-inset-bottom z-40">
        <div className="flex justify-around gap-1 max-w-lg mx-auto">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 flex-col h-auto py-2 gap-1"
            onClick={() => setDelayDialogOpen(true)}
            disabled={isQuickActionPending}
            data-testid="button-quick-delay"
          >
            <Car className="h-4 w-4 text-amber-600" />
            <span className="text-xs">Delay</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 flex-col h-auto py-2 gap-1"
            onClick={handlePottyBreak}
            disabled={isQuickActionPending}
            data-testid="button-quick-potty"
          >
            <Coffee className="h-4 w-4 text-blue-600" />
            <span className="text-xs">Potty Break</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 flex-col h-auto py-2 gap-1"
            onClick={() => setNoteDialogOpen(true)}
            disabled={isQuickActionPending}
            data-testid="button-quick-note"
          >
            <MessageCircle className="h-4 w-4 text-green-600" />
            <span className="text-xs">Add Note</span>
          </Button>
        </div>
      </div>

      {/* Traffic Delay Dialog */}
      <Dialog open={delayDialogOpen} onOpenChange={setDelayDialogOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Car className="h-5 w-5 text-amber-600" />
              Report Traffic Delay
            </DialogTitle>
            <DialogDescription>
              How long is the estimated delay?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={delayMinutes}
                onChange={(e) => setDelayMinutes(e.target.value)}
                className="flex-1"
                min="1"
                max="180"
                data-testid="input-delay-minutes"
              />
              <span className="text-sm text-muted-foreground">minutes</span>
            </div>
            <div className="flex gap-2">
              {[15, 30, 45, 60].map((mins) => (
                <Button
                  key={mins}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setDelayMinutes(String(mins))}
                  data-testid={`button-delay-${mins}`}
                >
                  {mins}m
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" onClick={() => setDelayDialogOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button 
              onClick={handleDelaySubmit} 
              disabled={delayMutation.isPending}
              className="flex-1"
              data-testid="button-submit-delay"
            >
              {delayMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Note Dialog */}
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-green-600" />
              Add Quick Note
            </DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Type your note..."
            value={quickNote}
            onChange={(e) => setQuickNote(e.target.value)}
            rows={3}
            data-testid="input-quick-note"
          />
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" onClick={() => setNoteDialogOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button 
              onClick={handleQuickNoteSubmit} 
              disabled={!quickNote.trim() || commentMutation.isPending}
              className="flex-1"
              data-testid="button-submit-note"
            >
              {commentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1" /> Send</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

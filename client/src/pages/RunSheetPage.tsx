import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import SignaturePad from "signature_pad";
import { 
  Loader2, 
  Truck, 
  MapPin, 
  Calendar, 
  CheckCircle, 
  PawPrint,
  Phone,
  AlertTriangle,
  ArrowRight,
  User,
  FileText,
  Clock,
  Pill,
  Ban,
  ShieldAlert,
  Eraser,
  PenLine,
} from "lucide-react";
import type { 
  TransportEvent, 
  TransportManifestItem,
  TransportStop,
  Animal,
} from "@shared/schema";

interface RunSheetData {
  transport: TransportEvent;
  manifest: (TransportManifestItem & { animal?: Animal | null })[];
  stops: TransportStop[];
  organization: {
    name: string;
    phone?: string;
    email?: string;
  };
}

function DeliveryConfirmDialog({
  item,
  open,
  onOpenChange,
  token,
}: {
  item: TransportManifestItem & { animal?: Animal | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
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
      const response = await apiRequest('POST', `/api/transport/run-sheet/${token}/confirm-delivery/${item.id}`, {
        confirmedBy,
        notes: notes || undefined,
        signatureDataUrl: signatureDataUrl || undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/transport/run-sheet', token] });
      onOpenChange(false);
      setConfirmedBy("");
      setNotes("");
      clearSignature();
      toast({
        title: "Delivery confirmed",
        description: `${item.animal?.name || item.animalName} has been marked as delivered.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to confirm delivery",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm Delivery</DialogTitle>
          <DialogDescription>
            Confirm delivery of {item.animal?.name || item.animalName}
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
                Signature (Chain of Custody)
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
            <div className="border rounded-lg overflow-hidden bg-white">
              <canvas
                ref={canvasRef}
                className="w-full touch-none"
                style={{ height: "120px" }}
                data-testid="canvas-signature"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Sign above to confirm receipt (legal proof of transfer)
            </p>
          </div>

          <div>
            <label className="text-sm font-medium">Notes (Optional)</label>
            <Textarea
              placeholder="Any notes about the delivery..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              data-testid="input-delivery-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => confirmMutation.mutate()}
            disabled={!confirmedBy || confirmMutation.isPending}
            data-testid="button-confirm-delivery"
          >
            {confirmMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <CheckCircle className="h-4 w-4 mr-2" />
            Confirm Delivery
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RunSheetPage() {
  const { token } = useParams();
  const [selectedItem, setSelectedItem] = useState<(TransportManifestItem & { animal?: Animal | null }) | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const { data, isLoading, error } = useQuery<RunSheetData>({
    queryKey: ['/api/transport/run-sheet', token],
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading run sheet...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-6 w-6" />
              <CardTitle>Run Sheet Not Found</CardTitle>
            </div>
            <CardDescription>
              This run sheet link may have expired or is invalid.
              Please contact the transport coordinator for a new link.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { transport, manifest, stops, organization } = data;
  const deliveredCount = manifest.filter((item) => item.deliveryStatus === 'delivered').length;
  const progress = manifest.length > 0 ? (deliveredCount / manifest.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center px-4">
          <Truck className="h-6 w-6 text-primary mr-2" />
          <span className="font-semibold">Transport Run Sheet</span>
        </div>
      </header>

      <main className="container max-w-2xl mx-auto p-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {transport.name}
            </CardTitle>
            <CardDescription>
              From {organization.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 text-sm">
              {transport.originLocation && transport.destinationLocation && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {transport.originLocation}
                    <ArrowRight className="h-3 w-3 inline mx-1" />
                    {transport.destinationLocation}
                  </span>
                </div>
              )}
              {transport.departureDate && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{new Date(transport.departureDate).toLocaleString()}</span>
                </div>
              )}
              {transport.driverName && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>Driver: {transport.driverName}</span>
                </div>
              )}
              {transport.driverPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${transport.driverPhone}`} className="text-primary">
                    {transport.driverPhone}
                  </a>
                </div>
              )}
              {transport.vehicleInfo && (
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  <span>{transport.vehicleInfo}</span>
                </div>
              )}
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Progress</span>
              <span className="text-sm text-muted-foreground">
                {deliveredCount} of {manifest.length} delivered
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className="bg-primary rounded-full h-2 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {stops.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Stops ({stops.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stops.map((stop, index) => (
                <div 
                  key={stop.id}
                  className="flex items-center gap-3 p-3 rounded-lg border"
                >
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{stop.locationName}</p>
                    {stop.address && (
                      <p className="text-sm text-muted-foreground truncate">{stop.address}</p>
                    )}
                    {stop.estimatedArrival && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Clock className="h-3 w-3" />
                        ETA: {new Date(stop.estimatedArrival).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                  {stop.actualArrival ? (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Arrived
                    </Badge>
                  ) : (
                    <Badge variant="outline">Pending</Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <PawPrint className="h-5 w-5" />
              Animals ({manifest.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {manifest.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <PawPrint className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No animals on manifest</p>
              </div>
            ) : (
              manifest.map((item) => {
                const isDelivered = item.deliveryStatus === 'delivered';
                return (
                  <Card 
                    key={item.id} 
                    className={`${isDelivered ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' : ''}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">
                              {item.animal?.name || item.animalName}
                            </span>
                            {isDelivered && (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Delivered
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {item.animal?.species || item.animalSpecies} - {item.animal?.breed || item.animalBreed || 'Unknown breed'}
                          </div>
                          {(item.needsMedication || item.isFlightRisk || item.isAggressive) && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {item.needsMedication && (
                                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 border-blue-300 dark:border-blue-700">
                                  <Pill className="h-3 w-3 mr-1" />
                                  Needs Meds
                                </Badge>
                              )}
                              {item.isFlightRisk && (
                                <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200 border-orange-300 dark:border-orange-700">
                                  <Ban className="h-3 w-3 mr-1" />
                                  No Walking
                                </Badge>
                              )}
                              {item.isAggressive && (
                                <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 border-red-300 dark:border-red-700">
                                  <ShieldAlert className="h-3 w-3 mr-1" />
                                  Handle w/ Care
                                </Badge>
                              )}
                            </div>
                          )}
                          {item.animal?.microchipNumber && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Microchip: {item.animal.microchipNumber}
                            </div>
                          )}
                          {item.destinationOrgName && (
                            <div className="text-sm text-muted-foreground mt-1">
                              <MapPin className="h-3 w-3 inline mr-1" />
                              To: {item.destinationOrgName}
                            </div>
                          )}
                          {item.specialInstructions && (
                            <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950 rounded text-sm border border-amber-200 dark:border-amber-800">
                              <AlertTriangle className="h-3 w-3 inline mr-1 text-amber-600" />
                              {item.specialInstructions}
                            </div>
                          )}
                          {isDelivered && item.deliveryConfirmedBy && (
                            <div className="text-xs text-muted-foreground mt-2">
                              Received by: {item.deliveryConfirmedBy}
                              {item.deliveryConfirmedAt && (
                                <> at {new Date(item.deliveryConfirmedAt).toLocaleString()}</>
                              )}
                            </div>
                          )}
                        </div>
                        {!isDelivered && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedItem(item);
                              setConfirmDialogOpen(true);
                            }}
                            data-testid={`button-deliver-${item.id}`}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Deliver
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </CardContent>
        </Card>

        {transport.notes && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{transport.notes}</p>
            </CardContent>
          </Card>
        )}

        <div className="text-center text-xs text-muted-foreground pb-4">
          <p>Powered by iRescue.life</p>
        </div>
      </main>

      {selectedItem && token && (
        <DeliveryConfirmDialog
          item={selectedItem}
          open={confirmDialogOpen}
          onOpenChange={setConfirmDialogOpen}
          token={token}
        />
      )}
    </div>
  );
}

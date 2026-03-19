import { useRef, useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useTenant } from "@/contexts/TenantContext";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Copy, TicketPercent, Users, ImagePlus, X, QrCode, Download, Printer } from "lucide-react";
import type { FundraiserEvent } from "@shared/schema";

type EventWithSold = FundraiserEvent & { soldCount: number };

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

interface EventFormState {
  title: string;
  description: string;
  bodyContent: string;
  imageUrl: string | null;
  priceStr: string;
  inventoryCapStr: string;
  pickupTimes: string[];
  isActive: boolean;
}

const defaultForm = (): EventFormState => ({
  title: "",
  description: "",
  bodyContent: "",
  imageUrl: null,
  priceStr: "",
  inventoryCapStr: "",
  pickupTimes: [],
  isActive: true,
});

export default function FundraisersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { basePath, tenantId } = useTenant();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventWithSold | null>(null);
  const [form, setForm] = useState<EventFormState>(defaultForm());
  const [pickupInput, setPickupInput] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<EventWithSold | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [qrEvent, setQrEvent] = useState<EventWithSold | null>(null);
  const [showPrintAll, setShowPrintAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<{ events: EventWithSold[] }>({
    queryKey: ["/api/fundraiser-events"],
  });

  const createMutation = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/fundraiser-events", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/fundraiser-events"] });
      setDialogOpen(false);
      toast({ title: "Event created" });
    },
    onError: () => toast({ title: "Error", description: "Could not create event.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => apiRequest("PATCH", `/api/fundraiser-events/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/fundraiser-events"] });
      setDialogOpen(false);
      toast({ title: "Event updated" });
    },
    onError: () => toast({ title: "Error", description: "Could not update event.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/fundraiser-events/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/fundraiser-events"] });
      setDeleteTarget(null);
      toast({ title: "Event deactivated" });
    },
    onError: () => toast({ title: "Error", description: "Could not deactivate event.", variant: "destructive" }),
  });

  function openCreate() {
    setEditingEvent(null);
    setForm(defaultForm());
    setPickupInput("");
    setImagePreview(null);
    setDialogOpen(true);
  }

  function openEdit(evt: EventWithSold) {
    setEditingEvent(evt);
    setForm({
      title: evt.title,
      description: evt.description ?? "",
      bodyContent: (evt as any).bodyContent ?? "",
      imageUrl: (evt as any).imageUrl ?? null,
      priceStr: (evt.priceCents / 100).toFixed(2),
      inventoryCapStr: evt.inventoryCap != null ? String(evt.inventoryCap) : "",
      pickupTimes: [...evt.pickupTimes],
      isActive: evt.isActive,
    });
    setImagePreview((evt as any).imageUrl ?? null);
    setPickupInput("");
    setDialogOpen(true);
  }

  async function handleImageUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/fundraiser-events/images/upload", {
        method: "POST",
        headers: { "x-tenant-id": tenantId || "" },
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      const { imageUrl } = await res.json();
      setForm((f) => ({ ...f, imageUrl }));
      setImagePreview(imageUrl);
    } catch {
      toast({ title: "Upload failed", description: "Could not upload image.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  function handleAddPickupTime() {
    const val = pickupInput.trim();
    if (!val || form.pickupTimes.includes(val)) return;
    setForm((f) => ({ ...f, pickupTimes: [...f.pickupTimes, val] }));
    setPickupInput("");
  }

  function handleRemovePickupTime(t: string) {
    setForm((f) => ({ ...f, pickupTimes: f.pickupTimes.filter((x) => x !== t) }));
  }

  function handleSave() {
    const priceCents = Math.round(parseFloat(form.priceStr) * 100);
    if (!form.title.trim() || isNaN(priceCents) || priceCents <= 0) {
      toast({ title: "Validation error", description: "Title and a valid price are required.", variant: "destructive" });
      return;
    }
    const inventoryCap = form.inventoryCapStr.trim() ? parseInt(form.inventoryCapStr, 10) : null;
    const body = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      bodyContent: form.bodyContent.trim() || null,
      imageUrl: form.imageUrl || null,
      priceCents,
      inventoryCap,
      pickupTimes: form.pickupTimes,
      isActive: form.isActive,
    };
    if (editingEvent) {
      updateMutation.mutate({ id: editingEvent.id, body });
    } else {
      createMutation.mutate(body);
    }
  }

  function copyPublicLink(evt: EventWithSold) {
    const url = `${window.location.origin}${basePath}/donate/event/${evt.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied!" });
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Fundraiser Events & Products</h1>
            <p className="text-sm text-muted-foreground mt-1">Create and manage events, products, and items for sale with Stripe checkout</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {data?.events && data.events.filter(e => e.isActive).length > 0 && (
              <Button variant="outline" onClick={() => setShowPrintAll(true)} data-testid="button-print-all-qr">
                <Printer className="h-4 w-4 mr-2" />
                Print All QR Codes
              </Button>
            )}
            <Button data-testid="button-new-event" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              New Event
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3].map((n) => (
              <Card key={n} className="animate-pulse">
                <CardHeader><div className="h-5 bg-muted rounded w-2/3" /></CardHeader>
                <CardContent><div className="h-4 bg-muted rounded w-1/2" /></CardContent>
              </Card>
            ))}
          </div>
        ) : !data?.events?.length ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <TicketPercent className="h-12 w-12 text-muted-foreground" />
              <div>
                <p className="font-medium">No events or products yet</p>
                <p className="text-sm text-muted-foreground">Create your first event or product to start selling online</p>
              </div>
              <Button onClick={openCreate} data-testid="button-new-event-empty">
                <Plus className="h-4 w-4 mr-2" />
                Create Event
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.events.map((evt) => {
              const isSoldOut = evt.inventoryCap != null && evt.soldCount >= evt.inventoryCap;
              const evtAny = evt as any;
              return (
                <Card key={evt.id} data-testid={`card-event-${evt.id}`}>
                  {evtAny.imageUrl && (
                    <div className="relative h-40 w-full overflow-hidden rounded-t-md">
                      <img src={evtAny.imageUrl} alt={evt.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-3 left-3">
                        <Badge variant={evt.isActive ? (isSoldOut ? "destructive" : "default") : "secondary"}>
                          {!evt.isActive ? "Inactive" : isSoldOut ? "Sold Out" : "Active"}
                        </Badge>
                      </div>
                    </div>
                  )}
                  <CardHeader className="flex flex-row items-start justify-between gap-2 flex-wrap">
                    <div className="space-y-1 flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{evt.title}</CardTitle>
                      <CardDescription className="line-clamp-2">{evt.description || "No description"}</CardDescription>
                    </div>
                    {!evtAny.imageUrl && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge variant={evt.isActive ? (isSoldOut ? "destructive" : "default") : "secondary"}>
                          {!evt.isActive ? "Inactive" : isSoldOut ? "Sold Out" : "Active"}
                        </Badge>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-4 text-sm">
                      <span className="font-medium">{formatCents(evt.priceCents)}</span>
                      <span className="text-muted-foreground">
                        {evt.inventoryCap != null
                          ? `${evt.soldCount} / ${evt.inventoryCap} sold`
                          : `${evt.soldCount} sold (unlimited)`}
                      </span>
                    </div>
                    {evt.pickupTimes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {evt.pickupTimes.map((t) => (
                          <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/dashboard/fundraisers/${evt.id}`} data-testid={`link-orders-${evt.id}`}>
                          <Users className="h-3.5 w-3.5 mr-1.5" />
                          View Orders
                        </Link>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => copyPublicLink(evt)} data-testid={`button-copy-link-${evt.id}`}>
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        Copy Link
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setQrEvent(evt)} data-testid={`button-qr-code-${evt.id}`}>
                        <QrCode className="h-3.5 w-3.5 mr-1.5" />
                        QR Code
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(evt)} data-testid={`button-edit-${evt.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(evt)} data-testid={`button-deactivate-${evt.id}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-event-form">
          <DialogHeader>
            <DialogTitle>{editingEvent ? "Edit Event / Product" : "Create Event / Product"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">

            {/* Hero Image Upload */}
            <div className="space-y-2">
              <Label>Hero Image <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                data-testid="input-image-file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                  e.target.value = "";
                }}
              />
              {imagePreview ? (
                <div className="relative rounded-md overflow-hidden h-40 w-full bg-muted">
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-2 right-2"
                    onClick={() => { setImagePreview(null); setForm((f) => ({ ...f, imageUrl: null })); }}
                    data-testid="button-remove-image"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid="button-upload-image"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full h-32 rounded-md border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-2 text-muted-foreground hover-elevate transition-colors"
                >
                  <ImagePlus className="h-8 w-8" />
                  <span className="text-sm">{uploading ? "Uploading…" : "Click to upload a hero image"}</span>
                </button>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-title">Title <span className="text-destructive">*</span></Label>
              <Input
                id="event-title"
                data-testid="input-event-title"
                placeholder="Annual Poboy Sale"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-description">Short Description <span className="text-muted-foreground text-xs">(shown in listings)</span></Label>
              <Input
                id="event-description"
                data-testid="input-event-description"
                placeholder="A brief tagline for this event"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-body">Full Details <span className="text-muted-foreground text-xs">(shown on event page)</span></Label>
              <Textarea
                id="event-body"
                data-testid="input-event-body"
                placeholder="Tell customers everything about this event — what they're getting, how it supports the rescue, pickup logistics, etc."
                value={form.bodyContent}
                onChange={(e) => setForm((f) => ({ ...f, bodyContent: e.target.value }))}
                rows={5}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="event-price">Price per item ($) <span className="text-destructive">*</span></Label>
                <Input
                  id="event-price"
                  data-testid="input-price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="12.00"
                  value={form.priceStr}
                  onChange={(e) => setForm((f) => ({ ...f, priceStr: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-cap">Inventory cap <span className="text-muted-foreground text-xs">(blank = unlimited)</span></Label>
                <Input
                  id="event-cap"
                  data-testid="input-inventory-cap"
                  type="number"
                  min="1"
                  placeholder="100"
                  value={form.inventoryCapStr}
                  onChange={(e) => setForm((f) => ({ ...f, inventoryCapStr: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Pickup Times <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <div className="flex gap-2">
                <Input
                  data-testid="input-pickup-time-entry"
                  placeholder='e.g. "11:00 AM – 11:30 AM"'
                  value={pickupInput}
                  onChange={(e) => setPickupInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddPickupTime())}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddPickupTime}
                  data-testid="button-add-pickup-time"
                >
                  Add
                </Button>
              </div>
              {form.pickupTimes.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {form.pickupTimes.map((t) => (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => handleRemovePickupTime(t)}
                      data-testid={`badge-pickup-${t}`}
                    >
                      {t} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="event-active"
                data-testid="switch-event-active"
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
              <Label htmlFor="event-active">Active (visible to public)</Label>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving || uploading} data-testid="button-save-event">
              {isSaving ? "Saving…" : editingEvent ? "Save Changes" : "Create Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Event?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.title}" will be hidden from the public checkout page. Existing orders are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {qrEvent && (
        <QrCodeDialog
          event={qrEvent}
          checkoutUrl={`${window.location.origin}${basePath}/donate/event/${qrEvent.id}`}
          onClose={() => setQrEvent(null)}
        />
      )}

      {showPrintAll && data?.events && (
        <PrintAllQrDialog
          events={data.events.filter(e => e.isActive)}
          basePath={basePath}
          onClose={() => setShowPrintAll(false)}
        />
      )}
    </DashboardLayout>
  );
}

function QrCodeDialog({
  event,
  checkoutUrl,
  onClose,
}: {
  event: EventWithSold;
  checkoutUrl: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, checkoutUrl, {
        width: 240,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      })
        .then(() => setReady(true))
        .catch(() => setReady(false));
    }
  }, [checkoutUrl]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    const safeName = event.title.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
    link.download = `${safeName}-qr-code.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  const handlePrint = useCallback(() => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    const w = window.open("", "_blank");
    if (!w) {
      toast({ title: "Pop-up blocked", description: "Please allow pop-ups to print.", variant: "destructive" });
      return;
    }
    const safeTitle = escapeHtml(event.title);
    const safePrice = escapeHtml(formatCents(event.priceCents));
    w.document.write(`
      <html><head><title>QR Code - ${safeTitle}</title>
      <style>
        @page { size: auto; margin: 0.5in; }
        body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; text-align: center; }
        .card { border: 2px solid #e5e7eb; border-radius: 12px; padding: 32px; max-width: 320px; }
        .title { font-size: 20px; font-weight: 700; margin: 0 0 4px; }
        .price { font-size: 16px; color: #6b7280; margin: 0 0 16px; }
        img { width: 240px; height: 240px; }
        .hint { font-size: 12px; color: #9ca3af; margin-top: 16px; }
      </style></head><body>
      <div class="card">
        <p class="title">${safeTitle}</p>
        <p class="price">${safePrice}</p>
        <img src="${dataUrl}" alt="QR Code" />
        <p class="hint">Scan to pay with your phone</p>
      </div>
      </body></html>
    `);
    w.document.close();
    w.onload = () => { w.print(); };
  }, [event, toast]);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(checkoutUrl);
      toast({ title: "Link copied" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm" data-testid="dialog-qr-code">
        <DialogHeader>
          <DialogTitle data-testid="text-qr-dialog-title">QR Code — {event.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div className="bg-white rounded-lg p-4">
            <canvas ref={canvasRef} data-testid="canvas-qr-code" />
          </div>
          <p className="text-sm text-muted-foreground text-center" data-testid="text-qr-price">
            {formatCents(event.priceCents)} per item
          </p>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <Button variant="outline" onClick={handleCopyUrl} data-testid="button-qr-copy-url">
              <Copy className="h-4 w-4 mr-2" />
              Copy URL
            </Button>
            <Button variant="outline" onClick={handleDownload} disabled={!ready} data-testid="button-qr-download">
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button onClick={handlePrint} disabled={!ready} data-testid="button-qr-print">
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PrintAllQrDialog({
  events,
  basePath,
  onClose,
}: {
  events: EventWithSold[];
  basePath: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const [generated, setGenerated] = useState(false);
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const generate = async () => {
      for (const evt of events) {
        const canvas = canvasRefs.current.get(evt.id);
        if (!canvas) continue;
        const url = `${window.location.origin}${basePath}/donate/event/${evt.id}`;
        await QRCode.toCanvas(canvas, url, {
          width: 180,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
        });
      }
      if (!cancelled) setGenerated(true);
    };
    const timer = setTimeout(generate, 100);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [events, basePath]);

  const handlePrint = useCallback(() => {
    const cards: string[] = [];
    for (const evt of events) {
      const canvas = canvasRefs.current.get(evt.id);
      if (!canvas) continue;
      const dataUrl = canvas.toDataURL("image/png");
      const safeTitle = escapeHtml(evt.title);
      const safePrice = escapeHtml(formatCents(evt.priceCents));
      cards.push(`
        <div class="card">
          <p class="title">${safeTitle}</p>
          <p class="price">${safePrice}</p>
          <img src="${dataUrl}" alt="QR Code" />
          <p class="hint">Scan to pay with your phone</p>
        </div>
      `);
    }
    const w = window.open("", "_blank");
    if (!w) {
      toast({ title: "Pop-up blocked", description: "Please allow pop-ups to print.", variant: "destructive" });
      return;
    }
    w.document.write(`
      <html><head><title>All QR Codes - Fundraiser Events &amp; Products</title>
      <style>
        @page { size: auto; margin: 0.4in; }
        body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 24px; }
        .card { border: 2px solid #e5e7eb; border-radius: 12px; padding: 20px; text-align: center; page-break-inside: avoid; }
        .title { font-size: 16px; font-weight: 700; margin: 0 0 2px; }
        .price { font-size: 14px; color: #6b7280; margin: 0 0 12px; }
        img { width: 180px; height: 180px; }
        .hint { font-size: 11px; color: #9ca3af; margin-top: 12px; }
      </style></head><body>
      <div class="grid">${cards.join("")}</div>
      </body></html>
    `);
    w.document.close();
    w.onload = () => { w.print(); };
  }, [events, toast]);

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-print-all-qr">
        <DialogHeader>
          <DialogTitle data-testid="text-print-all-title">QR Codes — All Active Events ({events.length})</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Preview all QR codes below, then print them as tent cards for your table.
        </p>
        <div ref={containerRef} className="grid grid-cols-2 gap-4">
          {events.map((evt) => (
            <div key={evt.id} className="flex flex-col items-center gap-2 p-3 border rounded-lg" data-testid={`print-qr-card-${evt.id}`}>
              <p className="text-sm font-medium text-center truncate w-full" data-testid={`text-print-qr-title-${evt.id}`}>{evt.title}</p>
              <p className="text-xs text-muted-foreground">{formatCents(evt.priceCents)}</p>
              <div className="bg-white rounded-md p-2">
                <canvas
                  ref={(el) => { if (el) canvasRefs.current.set(evt.id, el); }}
                  data-testid={`canvas-print-qr-${evt.id}`}
                />
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handlePrint} disabled={!generated} data-testid="button-print-all-confirm">
            <Printer className="h-4 w-4 mr-2" />
            Print All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

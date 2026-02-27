import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Plus, Pencil, Trash2, ExternalLink, Copy, TicketPercent, Users } from "lucide-react";
import type { FundraiserEvent } from "@shared/schema";

type EventWithSold = FundraiserEvent & { soldCount: number };

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface EventFormState {
  title: string;
  description: string;
  priceStr: string;
  inventoryCapStr: string;
  pickupTimes: string[];
  isActive: boolean;
}

const defaultForm = (): EventFormState => ({
  title: "",
  description: "",
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
    setDialogOpen(true);
  }

  function openEdit(evt: EventWithSold) {
    setEditingEvent(evt);
    setForm({
      title: evt.title,
      description: evt.description ?? "",
      priceStr: (evt.priceCents / 100).toFixed(2),
      inventoryCapStr: evt.inventoryCap != null ? String(evt.inventoryCap) : "",
      pickupTimes: [...evt.pickupTimes],
      isActive: evt.isActive,
    });
    setPickupInput("");
    setDialogOpen(true);
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
            <h1 className="text-2xl font-bold">Fundraiser Events</h1>
            <p className="text-sm text-muted-foreground mt-1">Create and manage public sales events with Stripe checkout</p>
          </div>
          <Button data-testid="button-new-event" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New Event
          </Button>
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
                <p className="font-medium">No fundraiser events yet</p>
                <p className="text-sm text-muted-foreground">Create your first event to start selling tickets or items online</p>
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
              return (
                <Card key={evt.id} data-testid={`card-event-${evt.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between gap-2 flex-wrap">
                    <div className="space-y-1 flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{evt.title}</CardTitle>
                      <CardDescription className="line-clamp-2">{evt.description || "No description"}</CardDescription>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant={evt.isActive ? (isSoldOut ? "destructive" : "default") : "secondary"}>
                        {!evt.isActive ? "Inactive" : isSoldOut ? "Sold Out" : "Active"}
                      </Badge>
                    </div>
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
        <DialogContent className="max-w-lg" data-testid="dialog-event-form">
          <DialogHeader>
            <DialogTitle>{editingEvent ? "Edit Event" : "Create Fundraiser Event"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
              <Label htmlFor="event-description">Description</Label>
              <Textarea
                id="event-description"
                data-testid="input-event-description"
                placeholder="Tell customers about this event…"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
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
            <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-event">
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

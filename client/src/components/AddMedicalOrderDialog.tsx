import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertTriangle, Pill, Syringe, FlaskConical, Stethoscope, ShieldCheck, ClipboardCheck, Package, Loader2, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface ActiveOrder {
  id: string;
  name: string;
  category: string;
  status: string;
  dueDate: string | null;
  source: string;
}

interface CatalogItem {
  id: string;
  name: string;
  category: 'Medication' | 'Vaccine' | 'Lab' | 'Procedure' | 'Preventative' | 'Exam';
  defaultDose: string | null;
  defaultFrequency: string | null;
}

interface OrderSetWithItems {
  id: string;
  setName: string;
  description: string | null;
  items: { id: string; sortOrder: number; catalogItem: CatalogItem }[];
}

type SelectedItem = { type: 'catalog'; item: CatalogItem } | { type: 'orderSet'; orderSet: OrderSetWithItems };

interface AddMedicalOrderDialogProps {
  animalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const categoryIcons: Record<string, typeof Pill> = {
  Medication: Pill,
  Vaccine: Syringe,
  Lab: FlaskConical,
  Procedure: Stethoscope,
  Preventative: ShieldCheck,
  Exam: ClipboardCheck,
};

const categoryColors: Record<string, string> = {
  Medication: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Vaccine: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  Lab: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Procedure: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Exam: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  Preventative: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
};

function getStatusBadgeInfo(order: ActiveOrder) {
  const now = new Date();
  if (order.dueDate) {
    const due = new Date(order.dueDate);
    const diffMs = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { label: "Overdue", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", icon: AlertCircle };
    if (diffDays <= 1) return { label: "Due Tomorrow", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", icon: Clock };
    if (diffDays <= 7) return { label: `Due in ${diffDays}d`, className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", icon: Clock };
    return { label: "Scheduled", className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", icon: CheckCircle2 };
  }
  if (order.status === 'active') return { label: "Active", className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", icon: CheckCircle2 };
  return { label: "Pending", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", icon: Clock };
}

export function AddMedicalOrderDialog({ animalId, open, onOpenChange }: AddMedicalOrderDialogProps) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<SelectedItem | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [duplicateConfirm, setDuplicateConfirm] = useState<{ item: CatalogItem; existingName: string } | null>(null);

  const [formData, setFormData] = useState({
    dose: "",
    frequency: "",
    route: "PO" as string,
    startDate: new Date().toISOString().split('T')[0],
    endDate: "",
    dueDate: new Date().toISOString().split('T')[0],
    scheduledDate: new Date().toISOString().split('T')[0],
    clinicLocation: "In-House",
  });

  const { data: activeOrdersData, isLoading: loadingActive } = useQuery<{ activeOrders: ActiveOrder[] }>({
    queryKey: [`/api/animals/${animalId}/medical/active-orders`],
    enabled: open,
  });

  const { data: catalogData } = useQuery<CatalogItem[]>({
    queryKey: ['/api/medical-catalog'],
    enabled: open,
  });

  const { data: orderSetsData } = useQuery<OrderSetWithItems[]>({
    queryKey: ['/api/order-sets'],
    enabled: open,
  });

  const activeOrders = activeOrdersData?.activeOrders || [];
  const catalogItems = catalogData || [];
  const orderSets = orderSetsData || [];

  const activeNameSet = useMemo(() => {
    const set = new Set<string>();
    for (const ao of activeOrders) {
      set.add(ao.name.toLowerCase());
    }
    return set;
  }, [activeOrders]);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setSearchValue("");
      setDuplicateConfirm(null);
      setFormData({
        dose: "",
        frequency: "",
        route: "PO",
        startDate: new Date().toISOString().split('T')[0],
        endDate: "",
        dueDate: new Date().toISOString().split('T')[0],
        scheduledDate: new Date().toISOString().split('T')[0],
        clinicLocation: "In-House",
        estimatedCost: "",
        notes: "",
        examReason: "",
      });
    }
  }, [open]);

  function handleSelectCatalogItem(item: CatalogItem) {
    const isDuplicate = activeNameSet.has(item.name.toLowerCase());
    if (isDuplicate) {
      setDuplicateConfirm({ item, existingName: item.name });
      return;
    }
    confirmSelectItem(item);
  }

  function confirmSelectItem(item: CatalogItem) {
    setSelected({ type: 'catalog', item });
    setFormData(prev => ({
      ...prev,
      dose: item.defaultDose || "",
      frequency: item.defaultFrequency || "",
    }));
    setSearchValue("");
  }

  function handleSelectOrderSet(os: OrderSetWithItems) {
    setSelected({ type: 'orderSet', orderSet: os });
    setSearchValue("");
  }

  async function handleSubmit() {
    if (!selected) return;
    setSubmitting(true);

    try {
      const payload: Record<string, any> = { animalId };

      if (selected.type === 'catalog') {
        payload.catalogItemId = selected.item.id;
        payload.formData = { ...formData };
      } else {
        payload.orderSetId = selected.orderSet.id;
        payload.formData = {};
      }

      const res = await apiRequest('POST', '/api/medical-orders/dispatch', payload);
      const result = await res.json();

      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/prescriptions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/vaccines`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/diagnostics`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/procedures`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/exams`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/preventative-care`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/active-orders`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/history`] });

      if (selected.type === 'catalog') {
        toast({ title: "Order Created", description: `${selected.item.name} has been added.` });
      } else {
        toast({
          title: "Order Set Applied",
          description: `${result.dispatched} items from "${selected.orderSet.setName}" created.`,
        });
      }

      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Failed to create order", description: err.message || "An error occurred", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  function renderCategoryForm() {
    if (!selected || selected.type !== 'catalog') return null;
    const { category } = selected.item;

    switch (category) {
      case 'Medication':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="form-medication">
            <div className="space-y-1.5">
              <Label>Dose</Label>
              <Input
                value={formData.dose}
                onChange={e => setFormData(p => ({ ...p, dose: e.target.value }))}
                placeholder="e.g., 250mg"
                data-testid="input-dose"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Input
                value={formData.frequency}
                onChange={e => setFormData(p => ({ ...p, frequency: e.target.value }))}
                placeholder="e.g., BID x 7 days"
                data-testid="input-frequency"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Route</Label>
              <Select value={formData.route} onValueChange={v => setFormData(p => ({ ...p, route: v }))}>
                <SelectTrigger data-testid="select-route">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PO">PO (Oral)</SelectItem>
                  <SelectItem value="SQ">SQ (Subcutaneous)</SelectItem>
                  <SelectItem value="IM">IM (Intramuscular)</SelectItem>
                  <SelectItem value="IV">IV (Intravenous)</SelectItem>
                  <SelectItem value="Topical">Topical</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={formData.startDate}
                onChange={e => setFormData(p => ({ ...p, startDate: e.target.value }))}
                data-testid="input-start-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label>End Date (optional)</Label>
              <Input
                type="date"
                value={formData.endDate}
                onChange={e => setFormData(p => ({ ...p, endDate: e.target.value }))}
                data-testid="input-end-date"
              />
            </div>
          </div>
        );
      case 'Vaccine':
      case 'Preventative':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="form-vaccine-preventative">
            <div className="space-y-1.5">
              <Label>{category === 'Vaccine' ? 'Date Given' : 'Date Administered'}</Label>
              <Input
                type="date"
                value={formData.dueDate}
                onChange={e => setFormData(p => ({ ...p, dueDate: e.target.value }))}
                data-testid="input-due-date"
              />
            </div>
          </div>
        );
      case 'Lab':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="form-lab">
            <div className="space-y-1.5">
              <Label>Scheduled Date</Label>
              <Input
                type="date"
                value={formData.scheduledDate}
                onChange={e => setFormData(p => ({ ...p, scheduledDate: e.target.value }))}
                data-testid="input-scheduled-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Clinic / Location</Label>
              <Input
                value={formData.clinicLocation}
                onChange={e => setFormData(p => ({ ...p, clinicLocation: e.target.value }))}
                placeholder="e.g., In-House, VCA"
                data-testid="input-clinic-location"
              />
            </div>
          </div>
        );
      case 'Procedure':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="form-procedure">
            <div className="space-y-1.5">
              <Label>Scheduled Date</Label>
              <Input
                type="date"
                value={formData.scheduledDate}
                onChange={e => setFormData(p => ({ ...p, scheduledDate: e.target.value }))}
                data-testid="input-procedure-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Clinic / Vet Name</Label>
              <Input
                value={formData.clinicLocation}
                onChange={e => setFormData(p => ({ ...p, clinicLocation: e.target.value }))}
                placeholder="e.g., Dr. Smith, VCA Animal Hospital"
                data-testid="input-procedure-clinic"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Estimated Cost (optional)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.estimatedCost}
                onChange={e => setFormData(p => ({ ...p, estimatedCost: e.target.value }))}
                placeholder="e.g., 350.00"
                data-testid="input-procedure-cost"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={formData.notes}
                onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                placeholder="e.g., Requires drop-off at 7 AM"
                rows={2}
                className="resize-none text-sm"
                data-testid="input-procedure-notes"
              />
            </div>
          </div>
        );
      case 'Exam':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="form-exam">
            <div className="space-y-1.5">
              <Label>Scheduled Date</Label>
              <Input
                type="date"
                value={formData.scheduledDate}
                onChange={e => setFormData(p => ({ ...p, scheduledDate: e.target.value }))}
                data-testid="input-exam-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Clinic / Vet Name</Label>
              <Input
                value={formData.clinicLocation}
                onChange={e => setFormData(p => ({ ...p, clinicLocation: e.target.value }))}
                placeholder="e.g., Dr. Smith"
                data-testid="input-exam-clinic"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Reason for Exam</Label>
              <Textarea
                value={formData.examReason}
                onChange={e => setFormData(p => ({ ...p, examReason: e.target.value }))}
                placeholder="e.g., Intake wellness check, limping on right rear leg"
                rows={2}
                className="resize-none text-sm"
                data-testid="input-exam-reason"
              />
            </div>
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-add-medical-order">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="w-5 h-5" />
              Add Medical Order
            </DialogTitle>
            <DialogDescription>
              Search for a medication, vaccine, lab, procedure, or apply an order set.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Active Orders Context Badges */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Active / Pending Orders</p>
              {loadingActive ? (
                <div className="flex flex-wrap gap-1.5">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-6 w-20" />
                </div>
              ) : activeOrders.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No active orders</p>
              ) : (
                <div className="flex flex-wrap gap-1.5" data-testid="container-active-orders">
                  {activeOrders.map(ao => {
                    const badge = getStatusBadgeInfo(ao);
                    const BadgeIcon = badge.icon;
                    return (
                      <Badge key={ao.id} variant="outline" className={`text-xs ${badge.className}`} data-testid={`badge-active-order-${ao.id}`}>
                        <BadgeIcon className="w-3 h-3 mr-1 shrink-0" />
                        {ao.name} - {badge.label}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Search / Selection */}
            {!selected ? (
              <Command className="border rounded-md" data-testid="command-search">
                <CommandInput
                  placeholder="Search catalog or order sets..."
                  value={searchValue}
                  onValueChange={setSearchValue}
                  data-testid="input-search-catalog"
                />
                <CommandList className="max-h-64">
                  <CommandEmpty>No results found.</CommandEmpty>
                  {catalogItems.length > 0 && (
                    <CommandGroup heading="Catalog Items">
                      {catalogItems
                        .filter(ci => ci.name.toLowerCase().includes(searchValue.toLowerCase()) || !searchValue)
                        .map(ci => {
                          const isDuplicate = activeNameSet.has(ci.name.toLowerCase());
                          const Icon = categoryIcons[ci.category] || Pill;
                          return (
                            <CommandItem
                              key={ci.id}
                              value={ci.name}
                              onSelect={() => handleSelectCatalogItem(ci)}
                              className="flex items-center gap-2"
                              data-testid={`item-catalog-${ci.id}`}
                            >
                              <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                              <span className={isDuplicate ? "text-amber-600 dark:text-amber-400" : ""}>
                                {ci.name}
                              </span>
                              <Badge variant="secondary" className={`ml-auto text-[10px] px-1.5 py-0 ${categoryColors[ci.category] || ""}`}>
                                {ci.category}
                              </Badge>
                              {ci.defaultDose && (
                                <span className="text-xs text-muted-foreground">{ci.defaultDose}</span>
                              )}
                              {isDuplicate && (
                                <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 shrink-0">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  Active
                                </span>
                              )}
                            </CommandItem>
                          );
                        })}
                    </CommandGroup>
                  )}
                  {orderSets.length > 0 && (
                    <CommandGroup heading="Order Sets">
                      {orderSets
                        .filter(os => os.setName.toLowerCase().includes(searchValue.toLowerCase()) || !searchValue)
                        .map(os => (
                          <CommandItem
                            key={os.id}
                            value={os.setName}
                            onSelect={() => handleSelectOrderSet(os)}
                            className="flex items-center gap-2"
                            data-testid={`item-orderset-${os.id}`}
                          >
                            <Package className="w-4 h-4 shrink-0 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{os.setName}</span>
                              <span className="text-xs text-muted-foreground ml-2">
                                ({os.items.length} items)
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            ) : (
              <div className="space-y-4">
                {/* Selected Item Header */}
                <div className="flex items-center justify-between gap-2 p-3 border rounded-md bg-muted/30">
                  {selected.type === 'catalog' ? (
                    <div className="flex items-center gap-2 min-w-0">
                      {(() => { const Icon = categoryIcons[selected.item.category] || Pill; return <Icon className="w-4 h-4 shrink-0" />; })()}
                      <span className="font-medium truncate">{selected.item.name}</span>
                      <Badge variant="secondary" className={`text-[10px] shrink-0 ${categoryColors[selected.item.category] || ""}`}>
                        {selected.item.category}
                      </Badge>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 min-w-0">
                      <Package className="w-4 h-4 shrink-0" />
                      <span className="font-medium truncate">{selected.orderSet.setName}</span>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {selected.orderSet.items.length} items
                      </Badge>
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelected(null)}
                    data-testid="button-change-selection"
                  >
                    Change
                  </Button>
                </div>

                {/* Dynamic Form for catalog items */}
                {selected.type === 'catalog' && renderCategoryForm()}

                {/* Order Set item list */}
                {selected.type === 'orderSet' && (
                  <div className="space-y-1.5" data-testid="container-orderset-items">
                    <p className="text-sm font-medium">Items in this order set:</p>
                    {selected.orderSet.items.map(osi => {
                      const Icon = categoryIcons[osi.catalogItem.category] || Pill;
                      const isDuplicate = activeNameSet.has(osi.catalogItem.name.toLowerCase());
                      return (
                        <div key={osi.id} className="flex items-center gap-2 p-2 border rounded-md text-sm">
                          <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                          <span className={isDuplicate ? "text-amber-600 dark:text-amber-400" : ""}>{osi.catalogItem.name}</span>
                          <Badge variant="secondary" className={`text-[10px] ml-auto shrink-0 ${categoryColors[osi.catalogItem.category] || ""}`}>
                            {osi.catalogItem.category}
                          </Badge>
                          {isDuplicate && (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Submit */}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-order">
                    Cancel
                  </Button>
                  <Button onClick={handleSubmit} disabled={submitting} data-testid="button-submit-order">
                    {submitting ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</>
                    ) : (
                      selected.type === 'orderSet' ? `Apply ${selected.orderSet.items.length} Items` : 'Create Order'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Duplicate Confirmation Dialog */}
      <AlertDialog open={!!duplicateConfirm} onOpenChange={(o) => { if (!o) setDuplicateConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Duplicate Order Warning
            </AlertDialogTitle>
            <AlertDialogDescription>
              This animal already has an active order for <strong>{duplicateConfirm?.existingName}</strong>. Are you sure you want to add another?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-duplicate">Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-duplicate"
              onClick={() => {
                if (duplicateConfirm) {
                  confirmSelectItem(duplicateConfirm.item);
                }
                setDuplicateConfirm(null);
              }}
            >
              Add Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

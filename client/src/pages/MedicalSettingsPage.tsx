import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, Stethoscope, Bug, Heart, ShieldAlert, Plus, Trash2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

interface CareType {
  id: string;
  name: string;
  category: string;
  targetSpecies: string;
  defaultIntervalDays: number | null;
  puppyIntervalDays: number | null;
  coversHeartworm: boolean;
  coversFleaTick: boolean;
  manufacturer: string | null;
  tenantId: string | null;
}

interface IntervalUpdate {
  id: string;
  defaultIntervalDays: number | null;
  puppyIntervalDays: number | null;
}

type GroupKey = "dewormer" | "fleaTick" | "heartworm";

function groupCareTypes(types: CareType[]): Record<GroupKey, CareType[]> {
  const groups: Record<GroupKey, CareType[]> = {
    dewormer: [],
    fleaTick: [],
    heartworm: [],
  };

  for (const t of types) {
    if (t.coversHeartworm) {
      groups.heartworm.push(t);
    } else if (t.coversFleaTick) {
      groups.fleaTick.push(t);
    } else {
      groups.dewormer.push(t);
    }
  }

  return groups;
}

const groupConfig: Record<GroupKey, { title: string; icon: typeof Bug; description: string }> = {
  dewormer: {
    title: "Dewormer Protocols",
    icon: ShieldAlert,
    description: "Set treatment intervals for intestinal parasite prevention products.",
  },
  fleaTick: {
    title: "Flea & Tick Protocols",
    icon: Bug,
    description: "Set treatment intervals for flea and tick prevention products.",
  },
  heartworm: {
    title: "Heartworm Prevention Protocols",
    icon: Heart,
    description: "Set treatment intervals for heartworm prevention products.",
  },
};

const protocolGroupOptions = [
  { value: "dewormer", label: "Dewormer" },
  { value: "fleaTick", label: "Flea & Tick" },
  { value: "heartworm", label: "Heartworm Prevention" },
];

export default function MedicalSettingsPage() {
  const { toast } = useToast();
  const [editedValues, setEditedValues] = useState<Record<string, { defaultIntervalDays: string; puppyIntervalDays: string }>>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState({
    name: "",
    manufacturer: "",
    targetSpecies: "Both",
    protocolGroup: "dewormer" as GroupKey,
    defaultIntervalDays: "",
    puppyIntervalDays: "",
  });

  const { data, isLoading } = useQuery<{ types: CareType[] }>({
    queryKey: ["/api/medical/preventative-care/types"],
  });

  const allTypes = (data?.types || []).filter((t) => t.category === "parasite_prevention");
  const groups = groupCareTypes(allTypes);

  const saveMutation = useMutation({
    mutationFn: async (updates: IntervalUpdate[]) => {
      await apiRequest("PATCH", "/api/medical/preventative-care/types/intervals", { updates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/medical/preventative-care/types"] });
      setEditedValues({});
      toast({ title: "Protocols saved", description: "Medical protocol intervals have been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save protocol settings.", variant: "destructive" });
    },
  });

  const addMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/medical/preventative-care/types", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/medical/preventative-care/types"] });
      setAddDialogOpen(false);
      setNewProduct({ name: "", manufacturer: "", targetSpecies: "Both", protocolGroup: "dewormer", defaultIntervalDays: "", puppyIntervalDays: "" });
      toast({ title: "Product added", description: "New preventative care product has been created." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message || "Failed to add product.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/medical/preventative-care/types/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/medical/preventative-care/types"] });
      setDeleteConfirmId(null);
      toast({ title: "Product removed", description: "The product has been deleted from your protocols." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message || "Failed to delete product.", variant: "destructive" });
    },
  });

  function getEditedOrOriginal(type: CareType) {
    const edited = editedValues[type.id];
    return {
      defaultIntervalDays: edited ? edited.defaultIntervalDays : (type.defaultIntervalDays?.toString() ?? ""),
      puppyIntervalDays: edited ? edited.puppyIntervalDays : (type.puppyIntervalDays?.toString() ?? ""),
    };
  }

  function handleFieldChange(typeId: string, field: "defaultIntervalDays" | "puppyIntervalDays", value: string) {
    const original = allTypes.find((t) => t.id === typeId);
    if (!original) return;

    setEditedValues((prev) => {
      const current = prev[typeId] || {
        defaultIntervalDays: original.defaultIntervalDays?.toString() ?? "",
        puppyIntervalDays: original.puppyIntervalDays?.toString() ?? "",
      };
      return { ...prev, [typeId]: { ...current, [field]: value } };
    });
  }

  function handleSave() {
    const updates: IntervalUpdate[] = [];

    for (const type of allTypes) {
      const vals = getEditedOrOriginal(type);
      const newDefault = vals.defaultIntervalDays === "" ? null : parseInt(vals.defaultIntervalDays, 10);
      const newPuppy = vals.puppyIntervalDays === "" ? null : parseInt(vals.puppyIntervalDays, 10);

      if (newDefault !== type.defaultIntervalDays || newPuppy !== type.puppyIntervalDays) {
        updates.push({
          id: type.id,
          defaultIntervalDays: isNaN(newDefault as number) ? null : newDefault,
          puppyIntervalDays: isNaN(newPuppy as number) ? null : newPuppy,
        });
      }
    }

    if (updates.length === 0) {
      toast({ title: "No changes", description: "No protocol intervals have been modified." });
      return;
    }

    saveMutation.mutate(updates);
  }

  function handleAddProduct() {
    const defaultInterval = parseInt(newProduct.defaultIntervalDays, 10);
    if (!newProduct.name.trim() || isNaN(defaultInterval) || defaultInterval < 1) {
      toast({ title: "Missing fields", description: "Product name and adult interval are required.", variant: "destructive" });
      return;
    }

    const puppyInterval = newProduct.puppyIntervalDays ? parseInt(newProduct.puppyIntervalDays, 10) : null;

    addMutation.mutate({
      name: newProduct.name.trim(),
      targetSpecies: newProduct.targetSpecies,
      defaultIntervalDays: defaultInterval,
      puppyIntervalDays: puppyInterval && !isNaN(puppyInterval) ? puppyInterval : null,
      coversHeartworm: newProduct.protocolGroup === "heartworm",
      coversFleaTick: newProduct.protocolGroup === "fleaTick",
      manufacturer: newProduct.manufacturer.trim() || null,
      description: null,
    });
  }

  const hasChanges = Object.keys(editedValues).length > 0;
  const deleteTarget = deleteConfirmId ? allTypes.find((t) => t.id === deleteConfirmId) : null;

  return (
    <DashboardLayout
      title="Medical Protocols"
      subtitle="Configure treatment intervals for your organization's preventative care products"
      breadcrumbs={[
        { label: "Settings" },
        { label: "Medical Protocols" },
      ]}
    >
      <div className="space-y-6 max-w-4xl">
        <div className="flex justify-end">
          <Button onClick={() => setAddDialogOpen(true)} data-testid="button-add-product">
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" data-testid="loading-spinner" />
          </div>
        ) : allTypes.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No parasite prevention products found. Use the "Add Product" button above to get started.
            </CardContent>
          </Card>
        ) : (
          <>
            {(Object.keys(groupConfig) as GroupKey[]).map((groupKey) => {
              const types = groups[groupKey];
              if (types.length === 0) return null;
              const config = groupConfig[groupKey];
              const Icon = config.icon;

              return (
                <Card key={groupKey} data-testid={`card-protocol-group-${groupKey}`}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 flex-wrap">
                      <Icon className="h-5 w-5" />
                      {config.title}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{config.description}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-[1fr_140px_140px_40px] gap-3 items-center">
                        <div className="text-sm font-medium text-muted-foreground">Product</div>
                        <div className="text-sm font-medium text-muted-foreground text-center">Adult Interval (Days)</div>
                        <div className="text-sm font-medium text-muted-foreground text-center">Puppy Interval (Days)</div>
                        <div />
                      </div>
                      {types.map((type) => {
                        const vals = getEditedOrOriginal(type);
                        return (
                          <div key={type.id} className="grid grid-cols-[1fr_140px_140px_40px] gap-3 items-center" data-testid={`row-protocol-${type.id}`}>
                            <div>
                              <span className="text-sm font-medium" data-testid={`text-protocol-name-${type.id}`}>{type.name}</span>
                              {type.manufacturer && (
                                <span className="text-xs text-muted-foreground ml-2">({type.manufacturer})</span>
                              )}
                              {type.targetSpecies !== "Both" && (
                                <span className="text-xs text-muted-foreground ml-1">[{type.targetSpecies}]</span>
                              )}
                              {type.tenantId && (
                                <span className="text-xs text-muted-foreground ml-1 italic">Custom</span>
                              )}
                            </div>
                            <div>
                              <Input
                                type="number"
                                min={1}
                                placeholder="N/A"
                                value={vals.defaultIntervalDays}
                                onChange={(e) => handleFieldChange(type.id, "defaultIntervalDays", e.target.value)}
                                data-testid={`input-adult-interval-${type.id}`}
                              />
                            </div>
                            <div>
                              <Input
                                type="number"
                                min={1}
                                placeholder="Same as adult"
                                value={vals.puppyIntervalDays}
                                onChange={(e) => handleFieldChange(type.id, "puppyIntervalDays", e.target.value)}
                                data-testid={`input-puppy-interval-${type.id}`}
                              />
                            </div>
                            <div className="flex justify-center">
                              {type.tenantId ? (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setDeleteConfirmId(type.id)}
                                  data-testid={`button-delete-product-${type.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              ) : (
                                <div className="h-9 w-9" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending || !hasChanges}
                data-testid="button-save-protocols"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Protocols
              </Button>
            </div>
          </>
        )}
      </div>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Preventative Care Product</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="product-name">Product Name</Label>
              <Input
                id="product-name"
                placeholder="e.g. Triwormer"
                value={newProduct.name}
                onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))}
                data-testid="input-new-product-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-manufacturer">Manufacturer (optional)</Label>
              <Input
                id="product-manufacturer"
                placeholder="e.g. Durvet"
                value={newProduct.manufacturer}
                onChange={(e) => setNewProduct((p) => ({ ...p, manufacturer: e.target.value }))}
                data-testid="input-new-product-manufacturer"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Target Species</Label>
                <Select
                  value={newProduct.targetSpecies}
                  onValueChange={(v) => setNewProduct((p) => ({ ...p, targetSpecies: v }))}
                >
                  <SelectTrigger data-testid="select-new-product-species">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Both">Both (Dog & Cat)</SelectItem>
                    <SelectItem value="Dog">Dog Only</SelectItem>
                    <SelectItem value="Cat">Cat Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Protocol Group</Label>
                <Select
                  value={newProduct.protocolGroup}
                  onValueChange={(v) => setNewProduct((p) => ({ ...p, protocolGroup: v as GroupKey }))}
                >
                  <SelectTrigger data-testid="select-new-product-group">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {protocolGroupOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product-adult-interval">Adult Interval (Days)</Label>
                <Input
                  id="product-adult-interval"
                  type="number"
                  min={1}
                  placeholder="e.g. 14"
                  value={newProduct.defaultIntervalDays}
                  onChange={(e) => setNewProduct((p) => ({ ...p, defaultIntervalDays: e.target.value }))}
                  data-testid="input-new-product-adult-interval"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-puppy-interval">Puppy Interval (Days)</Label>
                <Input
                  id="product-puppy-interval"
                  type="number"
                  min={1}
                  placeholder="Same as adult"
                  value={newProduct.puppyIntervalDays}
                  onChange={(e) => setNewProduct((p) => ({ ...p, puppyIntervalDays: e.target.value }))}
                  data-testid="input-new-product-puppy-interval"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} data-testid="button-cancel-add-product">
              Cancel
            </Button>
            <Button onClick={handleAddProduct} disabled={addMutation.isPending} data-testid="button-confirm-add-product">
              {addMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Are you sure you want to remove <strong>{deleteTarget?.name}</strong> from your protocols? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => { if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId); }}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

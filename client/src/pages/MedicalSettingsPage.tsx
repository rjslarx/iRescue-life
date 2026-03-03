import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, Stethoscope, Bug, Heart, ShieldAlert } from "lucide-react";
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

export default function MedicalSettingsPage() {
  const { toast } = useToast();
  const [editedValues, setEditedValues] = useState<Record<string, { defaultIntervalDays: string; puppyIntervalDays: string }>>({});

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

  const hasChanges = Object.keys(editedValues).length > 0;

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
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" data-testid="loading-spinner" />
          </div>
        ) : allTypes.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No parasite prevention products found. Add products through the Medical Catalog first.
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
                      <div className="grid grid-cols-[1fr_140px_140px] gap-3 items-center">
                        <div className="text-sm font-medium text-muted-foreground">Product</div>
                        <div className="text-sm font-medium text-muted-foreground text-center">Adult Interval (Days)</div>
                        <div className="text-sm font-medium text-muted-foreground text-center">Puppy Interval (Days)</div>
                      </div>
                      {types.map((type) => {
                        const vals = getEditedOrOriginal(type);
                        return (
                          <div key={type.id} className="grid grid-cols-[1fr_140px_140px] gap-3 items-center" data-testid={`row-protocol-${type.id}`}>
                            <div>
                              <span className="text-sm font-medium" data-testid={`text-protocol-name-${type.id}`}>{type.name}</span>
                              {type.manufacturer && (
                                <span className="text-xs text-muted-foreground ml-2">({type.manufacturer})</span>
                              )}
                              {type.targetSpecies !== "Both" && (
                                <span className="text-xs text-muted-foreground ml-1">[{type.targetSpecies}]</span>
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
    </DashboardLayout>
  );
}

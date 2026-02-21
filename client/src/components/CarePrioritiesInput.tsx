import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Stethoscope, Brain, UtensilsCrossed, AlertTriangle, ChevronDown, ChevronRight, Bookmark, Save, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CarePriorities, CarePriorityFlag, CareInstructionSnippet } from "@shared/schema";

type FlagKey = "medicalNeeds" | "behavioral" | "diet" | "flightRisk";

interface FlagConfig {
  key: FlagKey;
  adoptionLabel: string;
  fosterLabel: string;
  icon: typeof Stethoscope;
  placeholder: string;
  fosterPlaceholder: string;
}

const FLAG_CONFIGS: FlagConfig[] = [
  {
    key: "medicalNeeds",
    adoptionLabel: "Medical Needs",
    fosterLabel: "Medical Needs",
    icon: Stethoscope,
    placeholder: "Describe dosage, frequency, chronic conditions, upcoming vet appointments...",
    fosterPlaceholder: "Report if coughing persists, administer medications as directed...",
  },
  {
    key: "behavioral",
    adoptionLabel: "Behavioral",
    fosterLabel: "Behavioral",
    icon: Brain,
    placeholder: "Triggers, management strategies, training needs, anxiety notes...",
    fosterPlaceholder: "Socialize slowly with cats, use crate when unsupervised...",
  },
  {
    key: "diet",
    adoptionLabel: "Diet",
    fosterLabel: "Diet",
    icon: UtensilsCrossed,
    placeholder: "Brand, quantity, feeding schedule, food sensitivities...",
    fosterPlaceholder: "Brand, quantity, feeding schedule, allergies to watch for...",
  },
  {
    key: "flightRisk",
    adoptionLabel: "Flight Risk",
    fosterLabel: "Flight Risk",
    icon: AlertTriangle,
    placeholder: "Harness requirements, door-dashing behavior, fence specifications...",
    fosterPlaceholder: "Must use martingale collar, never off-leash, secure fencing required...",
  },
];

interface CarePrioritiesInputProps {
  animalName: string;
  mode: "adoption" | "foster";
  value: CarePriorities;
  onChange: (value: CarePriorities) => void;
  tenantId?: string;
}

export default function CarePrioritiesInput({
  animalName,
  mode,
  value,
  onChange,
  tenantId,
}: CarePrioritiesInputProps) {
  const [expandedFlags, setExpandedFlags] = useState<Set<FlagKey>>(new Set());
  const { toast } = useToast();

  const { data: snippets } = useQuery<CareInstructionSnippet[]>({
    queryKey: ["/api/care-instruction-snippets"],
    enabled: value.enabled,
  });

  const saveSnippetMutation = useMutation({
    mutationFn: async ({ category, text }: { category: FlagKey; text: string }) => {
      const res = await apiRequest("POST", "/api/care-instruction-snippets", { category, text });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-instruction-snippets"] });
      toast({ title: "Snippet saved" });
    },
    onError: () => {
      toast({ title: "Failed to save snippet", variant: "destructive" });
    },
  });

  const deleteSnippetMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/care-instruction-snippets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-instruction-snippets"] });
      toast({ title: "Snippet removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove snippet", variant: "destructive" });
    },
  });

  useEffect(() => {
    const checked = new Set<FlagKey>();
    for (const key of Object.keys(value.flags) as FlagKey[]) {
      if (value.flags[key]?.checked) {
        checked.add(key);
      }
    }
    setExpandedFlags(checked);
  }, []);

  const toggleEnabled = (enabled: boolean) => {
    onChange({ ...value, enabled });
  };

  const toggleFlag = (key: FlagKey, checked: boolean) => {
    const newFlags = { ...value.flags };
    newFlags[key] = {
      checked,
      notes: newFlags[key]?.notes || "",
    };
    const newExpanded = new Set(expandedFlags);
    if (checked) {
      newExpanded.add(key);
    } else {
      newExpanded.delete(key);
    }
    setExpandedFlags(newExpanded);
    onChange({ ...value, flags: newFlags });
  };

  const updateNotes = (key: FlagKey, notes: string) => {
    const newFlags = { ...value.flags };
    newFlags[key] = {
      checked: true,
      notes,
    };
    onChange({ ...value, flags: newFlags });
  };

  const applySnippet = (key: FlagKey, snippetText: string) => {
    const current = value.flags[key]?.notes || "";
    const separator = current.trim() ? "\n" : "";
    updateNotes(key, current + separator + snippetText);
  };

  const sectionLabel = mode === "adoption" ? "Lifestyle & Long-term Care" : "Management & Observation";
  const snippetsByCategory = (category: FlagKey) =>
    snippets?.filter((s) => s.category === category) || [];

  return (
    <div className="space-y-3" data-testid="care-priorities-section">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-medium" htmlFor="care-priorities-toggle">
          Does {animalName} have special care instructions?
        </Label>
        <Switch
          id="care-priorities-toggle"
          checked={value.enabled}
          onCheckedChange={toggleEnabled}
          data-testid="switch-care-priorities-toggle"
        />
      </div>

      {value.enabled && (
        <Card className="border-dashed" data-testid="care-priorities-flags-panel">
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {sectionLabel}
              </span>
            </div>

            {FLAG_CONFIGS.map((config) => {
              const flag = value.flags[config.key];
              const isChecked = flag?.checked || false;
              const isExpanded = expandedFlags.has(config.key);
              const Icon = config.icon;
              const label = mode === "adoption" ? config.adoptionLabel : config.fosterLabel;
              const placeholder = mode === "adoption" ? config.placeholder : config.fosterPlaceholder;
              const categorySnippets = snippetsByCategory(config.key);

              return (
                <Collapsible
                  key={config.key}
                  open={isChecked && isExpanded}
                  onOpenChange={(open) => {
                    if (isChecked) {
                      const newExpanded = new Set(expandedFlags);
                      if (open) newExpanded.add(config.key);
                      else newExpanded.delete(config.key);
                      setExpandedFlags(newExpanded);
                    }
                  }}
                >
                  <div
                    className="flex items-center gap-2 py-1.5 px-2 rounded-md hover-elevate cursor-pointer"
                    data-testid={`care-flag-row-${config.key}`}
                  >
                    <Switch
                      checked={isChecked}
                      onCheckedChange={(checked) => toggleFlag(config.key, checked)}
                      className="scale-75"
                      data-testid={`switch-care-flag-${config.key}`}
                    />
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <CollapsibleTrigger asChild>
                      <button className="flex items-center gap-1 flex-1 text-left text-sm">
                        {label}
                        {isChecked && flag?.notes && (
                          <Badge variant="secondary" className="ml-1 text-xs">
                            noted
                          </Badge>
                        )}
                        {isChecked && (
                          isExpanded ? (
                            <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground" />
                          )
                        )}
                      </button>
                    </CollapsibleTrigger>
                  </div>

                  <CollapsibleContent>
                    <div className="pl-10 pr-2 pb-2 space-y-2">
                      {categorySnippets.length > 0 && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Bookmark className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Saved snippets</span>
                          </div>
                          {categorySnippets.map((s) => (
                            <div
                              key={s.id}
                              className="flex items-center gap-1 group"
                              data-testid={`snippet-item-${s.id}`}
                            >
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-auto py-1 px-2 text-xs text-left justify-start flex-1 font-normal"
                                onClick={() => applySnippet(config.key, s.text)}
                                data-testid={`button-insert-snippet-${s.id}`}
                              >
                                {s.text.length > 60 ? s.text.slice(0, 60) + "..." : s.text}
                              </Button>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => deleteSnippetMutation.mutate(s.id)}
                                    disabled={deleteSnippetMutation.isPending}
                                    data-testid={`button-delete-snippet-${s.id}`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Remove snippet</TooltipContent>
                              </Tooltip>
                            </div>
                          ))}
                        </div>
                      )}
                      <Textarea
                        value={flag?.notes || ""}
                        onChange={(e) => updateNotes(config.key, e.target.value)}
                        placeholder={placeholder}
                        rows={3}
                        className="text-sm"
                        data-testid={`textarea-care-notes-${config.key}`}
                      />
                      {flag?.notes && flag.notes.trim().length > 0 && (
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs gap-1"
                            onClick={() =>
                              saveSnippetMutation.mutate({
                                category: config.key,
                                text: flag.notes!.trim().slice(0, 500),
                              })
                            }
                            disabled={saveSnippetMutation.isPending}
                            data-testid={`button-save-snippet-${config.key}`}
                          >
                            <Save className="h-3 w-3" />
                            Save as snippet
                          </Button>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

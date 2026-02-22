import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, ArrowRight, ArrowLeft, Loader2, Check, Baby } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ANIMAL_COLORS, PETFINDER_TYPES, PETFINDER_AGES, PETFINDER_SIZES } from "@shared/schema";
import { getBreedsForType } from "@shared/petfinder-breeds";

const litterRowSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sex: z.enum(["male", "female", "unknown"]).default("unknown"),
  colors: z.array(z.string()).default([]),
  weight: z.string().default(""),
});

const bulkIntakeFormSchema = z.object({
  intakeDate: z.string().default(() => new Date().toISOString().split('T')[0]),
  intakeSource: z.enum(["stray", "owner_surrender", "transfer", "born_in_care", "other"]).default("stray"),
  petfinderType: z.string().default("Dog"),
  petfinderBreed: z.string().default(""),
  petfinderAge: z.string().default("Baby"),
  petfinderSize: z.string().default("Small"),
  locationType: z.enum(["shelter", "foster", "clinic", "transport", "offsite"]).default("shelter"),
  locationName: z.string().default(""),
  motherId: z.string().optional().nullable(),
  applyProtocol: z.boolean().default(true),
  animals: z.array(litterRowSchema).min(1, "Add at least one animal"),
});

type BulkIntakeFormData = z.infer<typeof bulkIntakeFormSchema>;

interface BulkLitterIntakeWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (animalIds: string[]) => void;
}

export function BulkLitterIntakeWizard({ open, onOpenChange, onSuccess }: BulkLitterIntakeWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [expandedColorRow, setExpandedColorRow] = useState<number | null>(null);
  const { toast } = useToast();

  const form = useForm<BulkIntakeFormData>({
    resolver: zodResolver(bulkIntakeFormSchema),
    defaultValues: {
      intakeDate: new Date().toISOString().split('T')[0],
      intakeSource: "stray",
      petfinderType: "Dog",
      petfinderBreed: "",
      petfinderAge: "Baby",
      petfinderSize: "Small",
      locationType: "shelter",
      locationName: "",
      motherId: null,
      applyProtocol: true,
      animals: [
        { name: "", sex: "unknown", colors: [], weight: "" },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "animals",
  });

  const watchedType = form.watch("petfinderType");
  const availableBreeds = getBreedsForType(watchedType as any) || [];

  const { data: existingAnimalsData } = useQuery<{ animals: any[] }>({
    queryKey: ['/api/animals'],
    enabled: open,
  });

  const existingAnimals = Array.isArray(existingAnimalsData) ? existingAnimalsData : (existingAnimalsData?.animals || []);

  const femaleAnimals = existingAnimals.filter(
    (a: any) => (a.sex === 'female' || a.petfinderGender === 'Female') && !['adopted', 'transported', 'deceased', 'returned_to_owner'].includes(a.status)
  );

  const bulkIntakeMutation = useMutation({
    mutationFn: async (data: BulkIntakeFormData) => {
      const payload = {
        sharedData: {
          intakeDate: data.intakeDate ? new Date(data.intakeDate).toISOString() : new Date().toISOString(),
          intakeSource: data.intakeSource,
          petfinderType: data.petfinderType,
          petfinderBreed: data.petfinderBreed,
          petfinderAge: data.petfinderAge,
          petfinderSize: data.petfinderSize,
          species: data.petfinderType,
          breed: data.petfinderBreed,
          locationType: data.locationType,
          locationName: data.locationName,
          motherId: data.motherId || null,
        },
        animals: data.animals,
        applyProtocol: data.applyProtocol,
      };
      const res = await apiRequest('POST', '/api/animals/bulk-intake', payload);
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });
      toast({
        title: "Litter Intake Complete",
        description: `Successfully created ${result.count} animal${result.count > 1 ? 's' : ''}.`,
      });
      onOpenChange(false);
      setStep(1);
      form.reset();
      onSuccess?.(result.animalIds);
    },
    onError: (error: any) => {
      toast({
        title: "Intake Failed",
        description: error.message || "Failed to create animals. Check for duplicate names.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: BulkIntakeFormData) => {
    bulkIntakeMutation.mutate(data);
  };

  const handleNext = async () => {
    const valid = await form.trigger(["intakeDate", "intakeSource", "petfinderType", "petfinderBreed", "petfinderAge", "petfinderSize"]);
    if (valid) setStep(2);
  };

  const speciesLabel = watchedType?.toLowerCase().includes('cat') ? 'Kitten' : 'Puppy';

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setStep(1); } }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-bulk-intake-title">
            <Baby className="h-5 w-5" />
            Bulk Litter Intake {step === 1 ? "- Shared Data" : "- Speed Grid"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-4">
          <div className={`flex items-center justify-center h-8 w-8 rounded-full text-sm font-medium ${step === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>1</div>
          <div className="h-px flex-1 bg-border" />
          <div className={`flex items-center justify-center h-8 w-8 rounded-full text-sm font-medium ${step === 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>2</div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {step === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="intakeDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Intake Date</FormLabel>
                        <FormControl>
                          <Input type="date" data-testid="input-bulk-intake-date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="intakeSource"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Intake Source</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-bulk-intake-source">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="stray">Stray</SelectItem>
                            <SelectItem value="owner_surrender">Owner Surrender</SelectItem>
                            <SelectItem value="transfer">Transfer</SelectItem>
                            <SelectItem value="born_in_care">Born in Care</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="petfinderType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Species Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-bulk-species-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {PETFINDER_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="petfinderBreed"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Primary Breed</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-bulk-breed">
                              <SelectValue placeholder="Select breed..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {availableBreeds.map((b) => (
                              <SelectItem key={b} value={b}>{b}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="petfinderAge"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Age Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-bulk-age">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {PETFINDER_AGES.map((a) => (
                              <SelectItem key={a} value={a}>{a}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="petfinderSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Size</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-bulk-size">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {PETFINDER_SIZES.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="locationType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-bulk-location-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="shelter">Shelter</SelectItem>
                            <SelectItem value="foster">Foster</SelectItem>
                            <SelectItem value="clinic">Clinic</SelectItem>
                            <SelectItem value="offsite">Offsite</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="locationName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Foster: Sarah Jenkins" data-testid="input-bulk-location-name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="motherId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mother (Optional)</FormLabel>
                      <Select onValueChange={(v) => field.onChange(v === "__none__" ? null : v)} value={field.value || "__none__"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-bulk-mother">
                            <SelectValue placeholder="Link litter to a mother..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">No mother link</SelectItem>
                          {femaleAnimals.map((a: any) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name} ({a.breed || a.species || 'Unknown breed'})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>If this litter has a mother in the system, link them for medical history tracking.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex items-center justify-between rounded-md border p-4">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Apply {speciesLabel} Protocol</Label>
                    <p className="text-xs text-muted-foreground">
                      Auto-schedule dewormer and first-round vaccinations for all animals
                    </p>
                  </div>
                  <FormField
                    control={form.control}
                    name="applyProtocol"
                    render={({ field }) => (
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-bulk-apply-protocol"
                      />
                    )}
                  />
                </div>

                <div className="flex justify-end">
                  <Button type="button" onClick={handleNext} data-testid="button-bulk-next-step">
                    Next: Enter Individual Data <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Enter the unique details for each animal. Use Tab to move quickly between fields.
                </p>

                <div className="border rounded-md overflow-hidden">
                  <div className="grid grid-cols-[2fr_1fr_2fr_1fr_auto] gap-2 p-2 bg-muted/50 text-xs font-medium text-muted-foreground">
                    <span>Name</span>
                    <span>Sex</span>
                    <span>Color(s)</span>
                    <span>Weight</span>
                    <span></span>
                  </div>

                  {fields.map((field, index) => {
                    const watchedColors = form.watch(`animals.${index}.colors`) || [];
                    return (
                      <div key={field.id}>
                        <div className="grid grid-cols-[2fr_1fr_2fr_1fr_auto] gap-2 p-2 items-center border-t">
                          <FormField
                            control={form.control}
                            name={`animals.${index}.name`}
                            render={({ field: f }) => (
                              <FormItem className="space-y-0">
                                <FormControl>
                                  <Input
                                    placeholder={`${speciesLabel} ${index + 1}`}
                                    data-testid={`input-litter-name-${index}`}
                                    {...f}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`animals.${index}.sex`}
                            render={({ field: f }) => (
                              <FormItem className="space-y-0">
                                <Select onValueChange={f.onChange} value={f.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid={`select-litter-sex-${index}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="male">Male</SelectItem>
                                    <SelectItem value="female">Female</SelectItem>
                                    <SelectItem value="unknown">Unknown</SelectItem>
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />

                          <div className="flex flex-wrap gap-1 min-h-[36px] items-center">
                            {watchedColors.length > 0 ? (
                              watchedColors.map((c: string) => (
                                <Badge key={c} variant="default" className="text-xs">
                                  {c}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground">No colors</span>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => setExpandedColorRow(expandedColorRow === index ? null : index)}
                              data-testid={`button-litter-colors-${index}`}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>

                          <FormField
                            control={form.control}
                            name={`animals.${index}.weight`}
                            render={({ field: f }) => (
                              <FormItem className="space-y-0">
                                <FormControl>
                                  <Input
                                    placeholder="lbs"
                                    data-testid={`input-litter-weight-${index}`}
                                    {...f}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => { if (fields.length > 1) remove(index); }}
                            disabled={fields.length <= 1}
                            data-testid={`button-litter-remove-${index}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {expandedColorRow === index && (
                          <div className="px-2 pb-2 pt-1 border-t bg-muted/20">
                            <div className="flex flex-wrap gap-1">
                              {ANIMAL_COLORS.map((color) => {
                                const isSelected = watchedColors.includes(color);
                                return (
                                  <Badge
                                    key={color}
                                    variant={isSelected ? "default" : "outline"}
                                    className={`cursor-pointer select-none text-xs ${isSelected ? "toggle-elevate toggle-elevated" : "toggle-elevate"}`}
                                    onClick={() => {
                                      const current = form.getValues(`animals.${index}.colors`) || [];
                                      const next = isSelected
                                        ? current.filter((c: string) => c !== color)
                                        : [...current, color];
                                      form.setValue(`animals.${index}.colors`, next);
                                    }}
                                    data-testid={`badge-litter-color-${index}-${color.toLowerCase().replace(/\s+/g, '-')}`}
                                  >
                                    {isSelected && <Check className="h-3 w-3 mr-0.5" />}
                                    {color}
                                  </Badge>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => append({ name: "", sex: "unknown", colors: [], weight: "" })}
                  data-testid="button-litter-add-row"
                >
                  <Plus className="mr-2 h-4 w-4" /> Add Another {speciesLabel}
                </Button>

                <div className="flex justify-between gap-2">
                  <Button type="button" variant="outline" onClick={() => setStep(1)} data-testid="button-bulk-back">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={bulkIntakeMutation.isPending}
                    data-testid="button-bulk-save-litter"
                  >
                    {bulkIntakeMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>Save Litter ({fields.length} animal{fields.length > 1 ? 's' : ''})</>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

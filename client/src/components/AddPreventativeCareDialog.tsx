import { useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Shield, Star, Loader2 } from "lucide-react";

const preventativeCareSchema = z.object({
  careTypeId: z.string().min(1, "Care type is required"),
  dateAdministered: z.string().min(1, "Date is required"),
  administeredBy: z.string().optional(),
  notes: z.string().optional(),
  lotNumber: z.string().optional(),
  manufacturer: z.string().optional(),
});

type PreventativeCareFormData = z.infer<typeof preventativeCareSchema>;

interface PreventativeCareType {
  id: string;
  name: string;
  category: string;
  targetSpecies: string;
  isCore: boolean;
  defaultIntervalDays: number | null;
  description: string | null;
}

interface PreventativeCareRecord {
  id: string;
  careTypeId: string;
  dateAdministered: string;
  nextDueDate: string | null;
  administeredBy: string | null;
  notes: string | null;
  lotNumber: string | null;
  manufacturer: string | null;
}

interface AddPreventativeCareDialogProps {
  animalId: string;
  animalSpecies: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record?: PreventativeCareRecord | null;
}

export function AddPreventativeCareDialog({ 
  animalId, 
  animalSpecies, 
  open, 
  onOpenChange, 
  record 
}: AddPreventativeCareDialogProps) {
  const { toast } = useToast();
  const isEditing = !!record;

  const form = useForm<PreventativeCareFormData>({
    resolver: zodResolver(preventativeCareSchema),
    defaultValues: {
      careTypeId: "",
      dateAdministered: new Date().toISOString().split('T')[0],
      administeredBy: "",
      notes: "",
      lotNumber: "",
      manufacturer: "",
    },
  });

  const { data: careTypesData, isLoading: isLoadingTypes } = useQuery<{ types: PreventativeCareType[] }>({
    queryKey: ['/api/medical/preventative-care/types', { species: animalSpecies }],
    enabled: open,
  });

  const careTypes = careTypesData?.types || [];

  const sortedCareTypes = useMemo(() => {
    const grouped: Record<string, PreventativeCareType[]> = {};
    
    careTypes.forEach(type => {
      if (!grouped[type.category]) {
        grouped[type.category] = [];
      }
      grouped[type.category].push(type);
    });

    Object.keys(grouped).forEach(category => {
      grouped[category].sort((a, b) => {
        if (a.isCore !== b.isCore) return a.isCore ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    });

    return grouped;
  }, [careTypes]);

  const selectedCareType = careTypes.find(t => t.id === form.watch("careTypeId"));
  const dateAdministered = form.watch("dateAdministered");

  const calculatedNextDue = useMemo(() => {
    if (!selectedCareType?.defaultIntervalDays || !dateAdministered) return null;
    const date = new Date(dateAdministered);
    date.setDate(date.getDate() + selectedCareType.defaultIntervalDays);
    return date.toISOString().split('T')[0];
  }, [selectedCareType, dateAdministered]);

  useEffect(() => {
    if (record && open) {
      form.reset({
        careTypeId: record.careTypeId,
        dateAdministered: record.dateAdministered?.split('T')[0] || new Date().toISOString().split('T')[0],
        administeredBy: record.administeredBy || "",
        notes: record.notes || "",
        lotNumber: record.lotNumber || "",
        manufacturer: record.manufacturer || "",
      });
    } else if (!record && open) {
      form.reset({
        careTypeId: "",
        dateAdministered: new Date().toISOString().split('T')[0],
        administeredBy: "",
        notes: "",
        lotNumber: "",
        manufacturer: "",
      });
    }
  }, [record, open, form]);

  const createMutation = useMutation({
    mutationFn: async (data: PreventativeCareFormData) => {
      return apiRequest(`/api/medical/preventative-care/records`, {
        method: "POST",
        body: JSON.stringify({
          animalId,
          careTypeId: data.careTypeId,
          dateAdministered: data.dateAdministered,
          administeredBy: data.administeredBy || null,
          notes: data.notes || null,
          lotNumber: data.lotNumber || null,
          manufacturer: data.manufacturer || null,
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: isEditing ? "Record updated" : "Record added",
        description: `Preventative care ${isEditing ? "updated" : "recorded"} successfully`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/medical/preventative-care/records', animalId] });
      queryClient.invalidateQueries({ queryKey: ['/api/medical/preventative-care/coming-due'] });
      queryClient.invalidateQueries({ queryKey: ['/api/animals', animalId] });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save preventative care record",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: PreventativeCareFormData) => {
      return apiRequest(`/api/medical/preventative-care/records/${record?.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          careTypeId: data.careTypeId,
          dateAdministered: data.dateAdministered,
          administeredBy: data.administeredBy || null,
          notes: data.notes || null,
          lotNumber: data.lotNumber || null,
          manufacturer: data.manufacturer || null,
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Record updated",
        description: "Preventative care record updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/medical/preventative-care/records', animalId] });
      queryClient.invalidateQueries({ queryKey: ['/api/medical/preventative-care/coming-due'] });
      queryClient.invalidateQueries({ queryKey: ['/api/animals', animalId] });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update preventative care record",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PreventativeCareFormData) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const categoryOrder = ['Vaccines', 'Parasite Prevention', 'Diagnostics', 'Other'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            {isEditing ? "Edit Preventative Care" : "Add Preventative Care"}
          </DialogTitle>
          <DialogDescription>
            Record a preventative care item for this {animalSpecies.toLowerCase()}.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="careTypeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Care Type *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-care-type">
                        <SelectValue placeholder="Select care type..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {isLoadingTypes ? (
                        <div className="flex items-center justify-center p-4">
                          <Loader2 className="w-4 h-4 animate-spin" />
                        </div>
                      ) : (
                        categoryOrder.map(category => {
                          const types = sortedCareTypes[category];
                          if (!types?.length) return null;
                          return (
                            <div key={category}>
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">
                                {category}
                              </div>
                              {types.map(type => (
                                <SelectItem key={type.id} value={type.id}>
                                  <div className="flex items-center gap-2">
                                    <span>{type.name}</span>
                                    {type.isCore && (
                                      <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                                    )}
                                    {type.defaultIntervalDays && (
                                      <Badge variant="outline" className="text-xs ml-1">
                                        {type.defaultIntervalDays >= 365 
                                          ? `${Math.round(type.defaultIntervalDays / 365)}yr`
                                          : type.defaultIntervalDays >= 30
                                          ? `${Math.round(type.defaultIntervalDays / 30)}mo`
                                          : `${type.defaultIntervalDays}d`}
                                      </Badge>
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </div>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                  {selectedCareType?.description && (
                    <FormDescription>{selectedCareType.description}</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dateAdministered"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date Administered *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-date-administered" />
                  </FormControl>
                  {calculatedNextDue && (
                    <FormDescription className="text-green-600">
                      Next due: {new Date(calculatedNextDue).toLocaleDateString()}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="administeredBy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Administered By</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Veterinarian or staff name" 
                      {...field} 
                      data-testid="input-administered-by"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="lotNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lot Number</FormLabel>
                    <FormControl>
                      <Input placeholder="Optional" {...field} data-testid="input-lot-number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="manufacturer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Manufacturer</FormLabel>
                    <FormControl>
                      <Input placeholder="Optional" {...field} data-testid="input-manufacturer" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Any additional notes..." 
                      className="resize-none"
                      {...field} 
                      data-testid="input-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isPending}
                data-testid="button-submit-preventative-care"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  isEditing ? "Update Record" : "Add Record"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

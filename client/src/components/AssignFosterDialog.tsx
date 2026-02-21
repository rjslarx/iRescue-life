import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import type { Animal, CarePriorities } from "@shared/schema";
import CarePrioritiesInput from "@/components/CarePrioritiesInput";

const assignFosterSchema = z.object({
  fosterId: z.string().min(1, "Please select a foster parent"),
  notes: z.string().optional(),
});

type AssignFosterFormData = z.infer<typeof assignFosterSchema>;

interface EligibleFoster {
  id: string;
  fullName: string;
  email: string;
  roles: string[];
}

interface AssignFosterDialogProps {
  animal: Animal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (animalId?: string) => void;
  pendingEdits?: Record<string, any> | null;
}

export function AssignFosterDialog({ animal, open, onOpenChange, onSuccess, pendingEdits }: AssignFosterDialogProps) {
  const { toast } = useToast();
  const [carePriorities, setCarePriorities] = useState<CarePriorities>({
    enabled: false,
    flags: {},
  });

  const form = useForm<AssignFosterFormData>({
    resolver: zodResolver(assignFosterSchema),
    defaultValues: {
      fosterId: "",
      notes: "",
    },
  });

  // Fetch eligible foster parents
  const { data: fostersData, isLoading: isLoadingFosters } = useQuery<{ fosters: EligibleFoster[] }>({
    queryKey: ['/api/fosters/eligible'],
    enabled: open, // Only fetch when dialog is open
  });

  const fosters = fostersData?.fosters || [];

  const assignFosterMutation = useMutation({
    mutationFn: async (data: AssignFosterFormData) => {
      if (!animal) throw new Error("No animal selected");
      
      const response = await apiRequest('POST', '/api/foster-animals', {
        animalId: animal.id,
        fosterId: data.fosterId,
        notes: data.notes || null,
        status: 'active',
        carePriorities: carePriorities.enabled ? carePriorities : null,
      });
      return response.json();
    },
    onSuccess: async () => {
      // If there are pending edits (non-status fields), apply them now
      if (pendingEdits && animal?.id && Object.keys(pendingEdits).length > 0) {
        try {
          await apiRequest('PATCH', `/api/animals/${animal.id}`, pendingEdits);
        } catch (error) {
          console.error('Failed to apply pending edits:', error);
          // Continue anyway - the foster assignment succeeded
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/foster-animals'] });
      
      toast({
        title: "Foster assigned",
        description: `${animal?.name} has been assigned to a foster parent.`,
      });
      
      form.reset();
      setCarePriorities({ enabled: false, flags: {} });
      onSuccess(animal?.id);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to assign foster",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: AssignFosterFormData) => {
    assignFosterMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign to Foster Parent</DialogTitle>
          <DialogDescription>
            Assign {animal?.name} to a foster parent. The animal's information and health records will be available on their foster dashboard.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="fosterId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Foster Parent *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger data-testid="select-foster-parent">
                        <SelectValue placeholder={isLoadingFosters ? "Loading fosters..." : "Select a foster parent"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {fosters.length === 0 && !isLoadingFosters && (
                        <div className="p-2 text-sm text-muted-foreground">
                          No eligible foster parents found. Make sure users have the 'foster' role.
                        </div>
                      )}
                      {fosters.map((foster) => (
                        <SelectItem key={foster.id} value={foster.id}>
                          {foster.fullName} ({foster.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <CarePrioritiesInput
              animalName={animal?.name || "this animal"}
              mode="foster"
              value={carePriorities}
              onChange={setCarePriorities}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any other notes for the foster parent..."
                      className="resize-none"
                      rows={3}
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      data-testid="input-foster-notes"
                    />
                  </FormControl>
                  <FormDescription>
                    Optional free-form notes beyond the care priorities above.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={assignFosterMutation.isPending}
                data-testid="button-cancel-foster-assignment"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={assignFosterMutation.isPending || fosters.length === 0}
                data-testid="button-assign-foster"
              >
                {assignFosterMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Assign Foster
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

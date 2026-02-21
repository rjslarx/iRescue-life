import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

const procedureSchema = z.object({
  procedureName: z.string().min(1, "Procedure name is required"),
  procedureDate: z.string().min(1, "Procedure date is required"),
  veterinarian: z.string().optional(),
  notes: z.string().optional(),
  billVendor: z.string().optional(),
  billAmount: z.string().optional(),
  billInvoiceNumber: z.string().optional(),
  billPaymentStatus: z.string().optional(),
  billPaidAmount: z.string().optional(),
  billNotes: z.string().optional(),
});

type ProcedureFormData = z.infer<typeof procedureSchema>;

interface Procedure {
  id: string;
  procedureName: string;
  procedureDate: string;
  veterinarian?: string | null;
  outcome?: string | null;
  cost?: string | null;
  notes?: string | null;
  billVendor?: string | null;
  billAmount?: string | null;
  billInvoiceNumber?: string | null;
  billPaymentStatus?: string | null;
  billPaidAmount?: string | null;
  billNotes?: string | null;
}

interface AddProcedureDialogProps {
  animalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  procedure?: Procedure | null;
}

export function AddProcedureDialog({ animalId, open, onOpenChange, procedure }: AddProcedureDialogProps) {
  const { toast } = useToast();
  const isEditing = !!procedure;

  const form = useForm<ProcedureFormData>({
    resolver: zodResolver(procedureSchema),
    defaultValues: {
      procedureName: "",
      procedureDate: new Date().toISOString().split('T')[0],
      veterinarian: "",
      notes: "",
      billVendor: "",
      billAmount: "",
      billInvoiceNumber: "",
      billPaymentStatus: "",
      billPaidAmount: "",
      billNotes: "",
    },
  });

  const { reset } = form;
  useEffect(() => {
    if (procedure && open) {
      reset({
        procedureName: procedure.procedureName || "",
        procedureDate: procedure.procedureDate ? new Date(procedure.procedureDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        veterinarian: procedure.veterinarian || "",
        notes: procedure.outcome || procedure.notes || "",
        billVendor: procedure.billVendor || "",
        billAmount: procedure.billAmount || procedure.cost || "",
        billInvoiceNumber: procedure.billInvoiceNumber || "",
        billPaymentStatus: procedure.billPaymentStatus || "",
        billPaidAmount: procedure.billPaidAmount || "",
        billNotes: procedure.billNotes || "",
      });
    } else if (!procedure && open) {
      reset({
        procedureName: "",
        procedureDate: new Date().toISOString().split('T')[0],
        veterinarian: "",
        notes: "",
        billVendor: "",
        billAmount: "",
        billInvoiceNumber: "",
        billPaymentStatus: "",
        billPaidAmount: "",
        billNotes: "",
      });
    }
  }, [procedure, open, reset]);

  const createMutation = useMutation({
    mutationFn: async (data: ProcedureFormData) => {
      const response = await apiRequest('POST', `/api/animals/${animalId}/medical/procedures`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/procedures`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/history`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/bills`] });
      toast({
        title: "Procedure added",
        description: "Procedure record has been successfully added.",
      });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add procedure record.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ProcedureFormData) => {
      const response = await apiRequest('PATCH', `/api/medical/procedures/${procedure!.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/procedures`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/history`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/bills`] });
      toast({
        title: "Procedure updated",
        description: "Procedure record has been successfully updated.",
      });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update procedure record.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProcedureFormData) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Medical Procedure' : 'Add Medical Procedure'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update the procedure record' : 'Record a medical procedure performed on this animal'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="procedureName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Procedure Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Spay, Neuter, Dental Cleaning" {...field} data-testid="input-procedure-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="procedureDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Procedure Date *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-procedure-date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="veterinarian"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Veterinarian</FormLabel>
                  <FormControl>
                    <Input placeholder="Dr. Smith" {...field} data-testid="input-veterinarian" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Additional details about the procedure"
                      {...field}
                      data-testid="textarea-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-medium mb-3">Billing Information (Optional)</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="billVendor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vendor/Clinic</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., City Vet Clinic" {...field} data-testid="input-bill-vendor" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="billAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="0.00" {...field} data-testid="input-bill-amount" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="billInvoiceNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Invoice Number</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., INV-2024-001" {...field} data-testid="input-bill-invoice-number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="billPaymentStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-bill-payment-status">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="unpaid">Unpaid</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="partially_paid">Partially Paid</SelectItem>
                            <SelectItem value="insurance_pending">Insurance Pending</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="billPaidAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Paid Amount</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="0.00" {...field} data-testid="input-bill-paid-amount" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="billNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Billing Notes</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Additional notes about this bill" {...field} data-testid="textarea-bill-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-submit"
              >
                {isEditing
                  ? (updateMutation.isPending ? "Updating..." : "Update Procedure")
                  : (createMutation.isPending ? "Adding..." : "Add Procedure")
                }
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

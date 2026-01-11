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

const diagnosticSchema = z.object({
  testName: z.string().min(1, "Test name is required"),
  testDate: z.string().min(1, "Test date is required"),
  result: z.string().min(1, "Result is required"),
  notes: z.string().optional(),
  billVendor: z.string().optional(),
  billAmount: z.string().optional(),
  billInvoiceNumber: z.string().optional(),
  billPaymentStatus: z.string().optional(),
  billPaidAmount: z.string().optional(),
  billNotes: z.string().optional(),
});

type DiagnosticFormData = z.infer<typeof diagnosticSchema>;

interface Diagnostic {
  id: string;
  testName: string;
  testDate: string;
  testType?: string;
  results?: string;
  notes?: string | null;
  billVendor?: string | null;
  billAmount?: string | null;
  billInvoiceNumber?: string | null;
  billPaymentStatus?: string | null;
  billPaidAmount?: string | null;
  billNotes?: string | null;
}

interface AddDiagnosticDialogProps {
  animalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diagnostic?: Diagnostic | null;
}

export function AddDiagnosticDialog({ animalId, open, onOpenChange, diagnostic }: AddDiagnosticDialogProps) {
  const { toast } = useToast();
  const isEditing = !!diagnostic;

  const form = useForm<DiagnosticFormData>({
    resolver: zodResolver(diagnosticSchema),
    defaultValues: {
      testName: "",
      testDate: new Date().toISOString().split('T')[0],
      result: "",
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
    if (diagnostic && open) {
      reset({
        testName: diagnostic.testName || "",
        testDate: diagnostic.testDate ? new Date(diagnostic.testDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        result: diagnostic.results || "",
        notes: diagnostic.notes || "",
        billVendor: diagnostic.billVendor || "",
        billAmount: diagnostic.billAmount || "",
        billInvoiceNumber: diagnostic.billInvoiceNumber || "",
        billPaymentStatus: diagnostic.billPaymentStatus || "",
        billPaidAmount: diagnostic.billPaidAmount || "",
        billNotes: diagnostic.billNotes || "",
      });
    } else if (!diagnostic && open) {
      reset({
        testName: "",
        testDate: new Date().toISOString().split('T')[0],
        result: "",
        notes: "",
        billVendor: "",
        billAmount: "",
        billInvoiceNumber: "",
        billPaymentStatus: "",
        billPaidAmount: "",
        billNotes: "",
      });
    }
  }, [diagnostic, open, reset]);

  const createMutation = useMutation({
    mutationFn: async (data: DiagnosticFormData) => {
      const response = await apiRequest('POST', `/api/animals/${animalId}/medical/diagnostics`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/diagnostics`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/history`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/bills`] });
      toast({
        title: "Diagnostic test added",
        description: "Diagnostic test record has been successfully added.",
      });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add diagnostic test record.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: DiagnosticFormData) => {
      const response = await apiRequest('PATCH', `/api/medical/diagnostics/${diagnostic!.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/diagnostics`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/history`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/bills`] });
      toast({
        title: "Diagnostic test updated",
        description: "Diagnostic test record has been successfully updated.",
      });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update diagnostic test record.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: DiagnosticFormData) => {
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
          <DialogTitle>{isEditing ? 'Edit Diagnostic Test' : 'Add Diagnostic Test'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update the diagnostic test record' : 'Record a diagnostic test or lab work for this animal'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="testName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Test Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., CBC, Heartworm Test, X-ray" {...field} data-testid="input-test-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="testDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Test Date *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-test-date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="result"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Result *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Test results and findings"
                      className="min-h-[100px]"
                      {...field}
                      data-testid="textarea-result"
                    />
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
                      placeholder="Any additional notes"
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
                <div className="grid grid-cols-2 gap-4">
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
                <div className="grid grid-cols-2 gap-4">
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
                        <Select onValueChange={field.onChange} value={field.value}>
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
                  ? (updateMutation.isPending ? "Updating..." : "Update Test")
                  : (createMutation.isPending ? "Adding..." : "Add Test")
                }
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

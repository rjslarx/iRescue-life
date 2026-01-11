import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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

const billSchema = z.object({
  billDate: z.string().min(1, "Bill date is required"),
  vendor: z.string().min(1, "Vendor name is required"),
  amount: z.string().min(1, "Amount is required").refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Amount must be a positive number",
  }),
  description: z.string().min(1, "Description is required"),
  invoiceNumber: z.string().optional(),
  paymentStatus: z.enum(["unpaid", "paid", "partially_paid", "insurance_pending"]),
  paidAmount: z.string().optional().refine((val) => !val || (!isNaN(Number(val)) && Number(val) >= 0), {
    message: "Paid amount must be a positive number or zero",
  }),
  notes: z.string().optional(),
  grantId: z.string().optional(),
});

type BillFormData = z.infer<typeof billSchema>;

interface Bill {
  id: string;
  billDate: string;
  vendor: string;
  amount: string | number;
  description: string;
  invoiceNumber?: string | null;
  paymentStatus: string;
  paidAmount?: string | number | null;
  notes?: string | null;
  grantId?: string | null;
}

interface AddMedicalBillDialogProps {
  animalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill?: Bill | null;
}

export function AddMedicalBillDialog({ animalId, open, onOpenChange, bill }: AddMedicalBillDialogProps) {
  const { toast } = useToast();
  const isEditing = !!bill;

  const { data: grantsData } = useQuery({
    queryKey: ['/api/grants'],
    enabled: open,
  });

  const form = useForm<BillFormData>({
    resolver: zodResolver(billSchema),
    defaultValues: {
      billDate: new Date().toISOString().split('T')[0],
      vendor: "",
      amount: "",
      description: "",
      invoiceNumber: "",
      paymentStatus: "unpaid",
      paidAmount: "",
      notes: "",
      grantId: "",
    },
  });

  const { reset } = form;
  useEffect(() => {
    if (bill && open) {
      reset({
        billDate: bill.billDate ? new Date(bill.billDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        vendor: bill.vendor || "",
        amount: String(bill.amount) || "",
        description: bill.description || "",
        invoiceNumber: bill.invoiceNumber || "",
        paymentStatus: (bill.paymentStatus as "unpaid" | "paid" | "partially_paid" | "insurance_pending") || "unpaid",
        paidAmount: bill.paidAmount ? String(bill.paidAmount) : "",
        notes: bill.notes || "",
        grantId: bill.grantId || "",
      });
    } else if (!bill && open) {
      reset({
        billDate: new Date().toISOString().split('T')[0],
        vendor: "",
        amount: "",
        description: "",
        invoiceNumber: "",
        paymentStatus: "unpaid",
        paidAmount: "",
        notes: "",
        grantId: "",
      });
    }
  }, [bill, open, reset]);

  const createMutation = useMutation({
    mutationFn: async (data: BillFormData) => {
      const response = await apiRequest('POST', `/api/animals/${animalId}/medical/bills`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/bills`] });
      toast({
        title: "Bill added",
        description: "Medical bill has been successfully added.",
      });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add medical bill.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: BillFormData) => {
      const response = await apiRequest('PATCH', `/api/medical/bills/${bill!.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/bills`] });
      toast({
        title: "Bill updated",
        description: "Medical bill has been successfully updated.",
      });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update medical bill.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: BillFormData) => {
    const payload = {
      ...data,
      grantId: data.grantId || undefined,
    };
    if (isEditing) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Medical Bill' : 'Add Medical Bill'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update the medical bill record' : 'Record a medical bill for this animal'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="billDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bill Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-bill-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="vendor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor/Clinic *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., City Vet Clinic" {...field} data-testid="input-vendor" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Annual checkup and vaccinations" {...field} data-testid="input-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Amount *</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="0.00" {...field} data-testid="input-amount" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="invoiceNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice Number</FormLabel>
                    <FormControl>
                      <Input placeholder="INV-12345" {...field} data-testid="input-invoice-number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="paymentStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Status *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-payment-status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unpaid">Unpaid</SelectItem>
                        <SelectItem value="partially_paid">Partially Paid</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="insurance_pending">Insurance Pending</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="paidAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Paid Amount</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="0.00" {...field} data-testid="input-paid-amount" />
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
                      placeholder="Additional notes about this bill..." 
                      {...field} 
                      data-testid="input-notes"
                      className="resize-none"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="grantId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Grant (Optional)</FormLabel>
                  <Select onValueChange={(val) => field.onChange(val === "none" ? "" : val)} value={field.value || "none"}>
                    <FormControl>
                      <SelectTrigger data-testid="select-grant">
                        <SelectValue placeholder="Select a grant to tag this expense" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {grantsData?.grants?.map((grant: any) => (
                        <SelectItem key={grant.id} value={grant.id}>
                          {grant.programName} - {grant.funderName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                  ? (updateMutation.isPending ? "Updating..." : "Update Bill")
                  : (createMutation.isPending ? "Adding..." : "Add Bill")
                }
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

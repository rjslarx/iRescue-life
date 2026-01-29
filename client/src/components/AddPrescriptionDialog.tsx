import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

const prescriptionSchema = z.object({
  medicationName: z.string().min(1, "Medication name is required"),
  dosage: z.string().min(1, "Dosage is required"),
  frequency: z.string().min(1, "Frequency is required"),
  route: z.string().min(1, "Route is required"),
  startDate: z.string().min(1, "Start date is required"),
  nextScheduledDose: z.string().optional(),
  endDate: z.string().optional(),
  isControlledSubstance: z.boolean().optional(),
  notes: z.string().optional(),
  billVendor: z.string().optional(),
  billAmount: z.string().optional(),
  billInvoiceNumber: z.string().optional(),
  billPaymentStatus: z.string().optional(),
  billPaidAmount: z.string().optional(),
  billNotes: z.string().optional(),
  grantId: z.string().optional(),
});

type PrescriptionFormData = z.infer<typeof prescriptionSchema>;

interface Prescription {
  id: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  route: string;
  startDate: string;
  nextScheduledDose?: string | null;
  endDate?: string | null;
  isControlledSubstance?: boolean;
  notes?: string | null;
  billVendor?: string | null;
  billAmount?: string | null;
  billInvoiceNumber?: string | null;
  billPaymentStatus?: string | null;
  billPaidAmount?: string | null;
  billNotes?: string | null;
  grantId?: string | null;
}

interface AddPrescriptionDialogProps {
  animalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prescription?: Prescription | null;
}

export function AddPrescriptionDialog({ animalId, open, onOpenChange, prescription }: AddPrescriptionDialogProps) {
  const { toast } = useToast();
  const isEditing = !!prescription;

  // Fetch available grants for this tenant
  const { data: grantsData } = useQuery({
    queryKey: ['/api/grants'],
    enabled: open,
  });

  const form = useForm<PrescriptionFormData>({
    resolver: zodResolver(prescriptionSchema),
    defaultValues: {
      medicationName: "",
      dosage: "",
      frequency: "",
      route: "",
      startDate: new Date().toISOString().split('T')[0],
      nextScheduledDose: "",
      endDate: "",
      isControlledSubstance: false,
      notes: "",
      billVendor: "",
      billAmount: "",
      billInvoiceNumber: "",
      billPaymentStatus: "",
      billPaidAmount: "",
      billNotes: "",
      grantId: "",
    },
  });
  
  // Watch startDate to conditionally show nextScheduledDose field
  const watchedStartDate = form.watch("startDate");
  const today = new Date().toISOString().split('T')[0];
  const isStartDateInPast = watchedStartDate && watchedStartDate < today;

  // Reset form when prescription changes (for editing)
  const { reset } = form;
  useEffect(() => {
    if (prescription && open) {
      reset({
        medicationName: prescription.medicationName || "",
        dosage: prescription.dosage || "",
        frequency: prescription.frequency || "",
        route: prescription.route || "",
        startDate: prescription.startDate ? new Date(prescription.startDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        nextScheduledDose: prescription.nextScheduledDose ? new Date(prescription.nextScheduledDose).toISOString().split('T')[0] : "",
        endDate: prescription.endDate ? new Date(prescription.endDate).toISOString().split('T')[0] : "",
        isControlledSubstance: prescription.isControlledSubstance || false,
        notes: prescription.notes || "",
        billVendor: prescription.billVendor || "",
        billAmount: prescription.billAmount || "",
        billInvoiceNumber: prescription.billInvoiceNumber || "",
        billPaymentStatus: prescription.billPaymentStatus || "",
        billPaidAmount: prescription.billPaidAmount || "",
        billNotes: prescription.billNotes || "",
        grantId: prescription.grantId || "",
      });
    } else if (!prescription && open) {
      reset({
        medicationName: "",
        dosage: "",
        frequency: "",
        route: "",
        startDate: new Date().toISOString().split('T')[0],
        nextScheduledDose: "",
        endDate: "",
        isControlledSubstance: false,
        notes: "",
        billVendor: "",
        billAmount: "",
        billInvoiceNumber: "",
        billPaymentStatus: "",
        billPaidAmount: "",
        billNotes: "",
        grantId: "",
      });
    }
  }, [prescription, open, reset]);
  
  // Auto-set nextScheduledDose to today when startDate changes to past
  useEffect(() => {
    if (isStartDateInPast && !form.getValues("nextScheduledDose")) {
      form.setValue("nextScheduledDose", today);
    }
  }, [isStartDateInPast, today, form]);

  const createMutation = useMutation({
    mutationFn: async (data: PrescriptionFormData) => {
      const response = await apiRequest('POST', `/api/animals/${animalId}/medical/prescriptions`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/prescriptions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/history`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/bills`] });
      queryClient.invalidateQueries({ queryKey: ['/api/medical/doses/today'] });
      toast({
        title: "Prescription added",
        description: "Prescription has been created and medication doses have been scheduled.",
      });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add prescription.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: PrescriptionFormData) => {
      const response = await apiRequest('PATCH', `/api/medical/prescriptions/${prescription!.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/prescriptions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/history`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/bills`] });
      queryClient.invalidateQueries({ queryKey: ['/api/medical/doses/today'] });
      toast({
        title: "Prescription updated",
        description: "The prescription has been updated successfully.",
      });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update prescription.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PrescriptionFormData) => {
    // Normalize grantId: convert empty string to undefined
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
          <DialogTitle>{isEditing ? 'Edit Prescription' : 'Add Medication Prescription'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update prescription details' : 'Create a prescription and automatically schedule medication doses'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="medicationName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Medication Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Amoxicillin" {...field} data-testid="input-medication-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="dosage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dosage *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 250mg" {...field} data-testid="input-dosage" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frequency *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-frequency">
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="SID">SID (Once Daily)</SelectItem>
                        <SelectItem value="BID">BID (Twice Daily)</SelectItem>
                        <SelectItem value="TID">TID (Three Times Daily)</SelectItem>
                        <SelectItem value="QID">QID (Four Times Daily)</SelectItem>
                        <SelectItem value="HS">HS (At Bedtime)</SelectItem>
                        <SelectItem value="EOD">EOD (Every Other Day)</SelectItem>
                        <SelectItem value="WEEKLY">Weekly (Every 7 Days)</SelectItem>
                        <SelectItem value="MONTHLY">Monthly (Every 30 Days)</SelectItem>
                        <SelectItem value="Q3M">Every 3 Months (Bravecto)</SelectItem>
                        <SelectItem value="Q6M">Every 6 Months (ProHeart 6)</SelectItem>
                        <SelectItem value="Q8M">Every 8 Months (Seresto)</SelectItem>
                        <SelectItem value="ANNUALLY">Annually (Every 365 Days)</SelectItem>
                        <SelectItem value="ONCE">One Time (No Repeat)</SelectItem>
                        <SelectItem value="PRN">PRN (As Needed)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-start-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date (Optional)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-end-date" />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Leave blank for ongoing medication
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {isStartDateInPast && (
              <FormField
                control={form.control}
                name="nextScheduledDose"
                render={({ field }) => (
                  <FormItem className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 p-4">
                    <FormLabel className="text-amber-800 dark:text-amber-200">Next Dose Due *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-next-scheduled-dose" />
                    </FormControl>
                    <FormDescription className="text-xs text-amber-700 dark:text-amber-300">
                      Since the start date is in the past, specify when the next dose is due to avoid creating overdue tasks for historical entries.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="route"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Route of Administration *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-route">
                        <SelectValue placeholder="Select route" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="PO">PO (Oral)</SelectItem>
                      <SelectItem value="SQ">SQ (Subcutaneous)</SelectItem>
                      <SelectItem value="IM">IM (Intramuscular)</SelectItem>
                      <SelectItem value="IV">IV (Intravenous)</SelectItem>
                      <SelectItem value="Topical">Topical</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isControlledSubstance"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-controlled-substance"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>
                      Controlled Substance
                    </FormLabel>
                    <FormDescription>
                      Check if this medication is a DEA-regulated controlled substance
                    </FormDescription>
                  </div>
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
                      placeholder="Special instructions for administering this medication"
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
                  ? (updateMutation.isPending ? "Updating..." : "Update Prescription")
                  : (createMutation.isPending ? "Creating..." : "Create Prescription")
                }
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

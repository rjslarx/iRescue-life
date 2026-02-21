import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

const vaccineSchema = z.object({
  itemName: z.string().min(1, "Vaccine name is required"),
  dateGiven: z.string().min(1, "Date given is required"),
  validDurationMonths: z.string().optional(), // "12", "36", or custom number
  dateDue: z.string().optional(),
  administeredBy: z.string().optional(),
  lotNumber: z.string().optional(),
  manufacturer: z.string().optional(),
  clinicName: z.string().optional(),
  anatomicalSite: z.string().optional(),
  billVendor: z.string().optional(),
  billAmount: z.string().optional(),
  billInvoiceNumber: z.string().optional(),
  billPaymentStatus: z.string().optional(),
  billPaidAmount: z.string().optional(),
  billNotes: z.string().optional(),
});

type VaccineFormData = z.infer<typeof vaccineSchema>;

interface Vaccine {
  id: string;
  vaccineName: string;
  dateGiven: string;
  dueDate?: string | null;
  validDurationMonths?: number | null;
  veterinarian?: string | null;
  lotNumber?: string | null;
  manufacturer?: string | null;
  clinicName?: string | null;
  anatomicalSite?: string | null;
  billVendor?: string | null;
  billAmount?: string | null;
  billInvoiceNumber?: string | null;
  billPaymentStatus?: string | null;
  billPaidAmount?: string | null;
  billNotes?: string | null;
}

interface AddVaccineDialogProps {
  animalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vaccine?: Vaccine | null;
}

export function AddVaccineDialog({ animalId, open, onOpenChange, vaccine }: AddVaccineDialogProps) {
  const { toast } = useToast();
  const isEditing = !!vaccine;

  const form = useForm<VaccineFormData>({
    resolver: zodResolver(vaccineSchema),
    defaultValues: {
      itemName: "",
      dateGiven: new Date().toISOString().split('T')[0],
      validDurationMonths: "",
      dateDue: "",
      administeredBy: "",
      lotNumber: "",
      manufacturer: "",
      clinicName: "In-House",
      anatomicalSite: "",
      billVendor: "",
      billAmount: "",
      billInvoiceNumber: "",
      billPaymentStatus: "",
      billPaidAmount: "",
      billNotes: "",
    },
  });

  // Auto-calculate due date when date given or duration changes
  const dateGiven = form.watch("dateGiven");
  const validDurationMonths = form.watch("validDurationMonths");
  
  useEffect(() => {
    if (dateGiven && validDurationMonths && validDurationMonths !== "custom") {
      const months = parseInt(validDurationMonths, 10);
      if (!isNaN(months) && months > 0) {
        const givenDate = new Date(dateGiven);
        givenDate.setMonth(givenDate.getMonth() + months);
        form.setValue("dateDue", givenDate.toISOString().split('T')[0]);
      }
    }
  }, [dateGiven, validDurationMonths, form]);

  const { reset } = form;
  useEffect(() => {
    if (vaccine && open) {
      reset({
        itemName: vaccine.vaccineName || "",
        dateGiven: vaccine.dateGiven ? new Date(vaccine.dateGiven).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        validDurationMonths: vaccine.validDurationMonths ? String(vaccine.validDurationMonths) : "",
        dateDue: vaccine.dueDate ? new Date(vaccine.dueDate).toISOString().split('T')[0] : "",
        administeredBy: vaccine.veterinarian || "",
        lotNumber: vaccine.lotNumber || "",
        manufacturer: vaccine.manufacturer || "",
        clinicName: vaccine.clinicName || "In-House",
        anatomicalSite: vaccine.anatomicalSite || "",
        billVendor: vaccine.billVendor || "",
        billAmount: vaccine.billAmount || "",
        billInvoiceNumber: vaccine.billInvoiceNumber || "",
        billPaymentStatus: vaccine.billPaymentStatus || "",
        billPaidAmount: vaccine.billPaidAmount || "",
        billNotes: vaccine.billNotes || "",
      });
    } else if (!vaccine && open) {
      reset({
        itemName: "",
        dateGiven: new Date().toISOString().split('T')[0],
        validDurationMonths: "",
        dateDue: "",
        administeredBy: "",
        lotNumber: "",
        manufacturer: "",
        clinicName: "In-House",
        anatomicalSite: "",
        billVendor: "",
        billAmount: "",
        billInvoiceNumber: "",
        billPaymentStatus: "",
        billPaidAmount: "",
        billNotes: "",
      });
    }
  }, [vaccine, open, reset]);

  const createMutation = useMutation({
    mutationFn: async (data: VaccineFormData) => {
      const response = await apiRequest('POST', `/api/animals/${animalId}/medical/vaccines`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/vaccines`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/history`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/bills`] });
      toast({
        title: "Vaccine added",
        description: "Vaccine record has been successfully added.",
      });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add vaccine record.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: VaccineFormData) => {
      const response = await apiRequest('PATCH', `/api/medical/vaccines/${vaccine!.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/vaccines`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/history`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/bills`] });
      toast({
        title: "Vaccine updated",
        description: "Vaccine record has been successfully updated.",
      });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update vaccine record.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: VaccineFormData) => {
    // Transform validDurationMonths to a number for API
    const transformedData = {
      ...data,
      validDurationMonths: data.validDurationMonths && data.validDurationMonths !== "custom" 
        ? parseInt(data.validDurationMonths, 10) 
        : null,
    };
    if (isEditing) {
      updateMutation.mutate(transformedData as any);
    } else {
      createMutation.mutate(transformedData as any);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Vaccine Record' : 'Add Vaccine Record'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update the vaccine record' : 'Record a vaccine administered to this animal'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="itemName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vaccine Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Rabies, DHPP" {...field} data-testid="input-vaccine-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="dateGiven"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date Given *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-date-given" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="validDurationMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-duration">
                          <SelectValue placeholder="Select duration" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="12">1 Year</SelectItem>
                        <SelectItem value="36">3 Years</SelectItem>
                        <SelectItem value="6">6 Months</SelectItem>
                        <SelectItem value="custom">Custom (enter below)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="dateDue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due Date (Next Dose) {validDurationMonths && validDurationMonths !== "custom" && <span className="text-xs text-muted-foreground">(auto-calculated)</span>}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-due-date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="lotNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lot Number</FormLabel>
                    <FormControl>
                      <Input placeholder="LOT123456" {...field} data-testid="input-lot-number" />
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
                      <Input placeholder="e.g., Zoetis, Merck" {...field} data-testid="input-manufacturer" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="administeredBy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Administered By</FormLabel>
                    <FormControl>
                      <Input placeholder="Dr. Smith" {...field} data-testid="input-administered-by" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="clinicName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Clinic/Location</FormLabel>
                    <FormControl>
                      <Input placeholder="In-House" {...field} data-testid="input-clinic-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="anatomicalSite"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Anatomical Site (Injection Location)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger data-testid="select-anatomical-site">
                        <SelectValue placeholder="Select injection site" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Right Rear">Right Rear Leg</SelectItem>
                      <SelectItem value="Right Front">Right Front Leg</SelectItem>
                      <SelectItem value="Left Rear">Left Rear Leg</SelectItem>
                      <SelectItem value="Left Front">Left Front Leg</SelectItem>
                      <SelectItem value="Scruff">Scruff (Back of Neck)</SelectItem>
                      <SelectItem value="Subcutaneous">Subcutaneous (Between Shoulders)</SelectItem>
                      <SelectItem value="Intranasal">Intranasal</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
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
                  ? (updateMutation.isPending ? "Updating..." : "Update Vaccine")
                  : (createMutation.isPending ? "Adding..." : "Add Vaccine")
                }
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

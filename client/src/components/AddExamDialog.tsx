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

const examSchema = z.object({
  examType: z.string().min(1, "Exam type is required"),
  examDate: z.string().min(1, "Exam date is required"),
  performedBy: z.string().min(1, "Performed by is required"),
  subjective: z.string().optional(),
  objective: z.string().optional(),
  assessment: z.string().optional(),
  plan: z.string().optional(),
  billVendor: z.string().optional(),
  billAmount: z.string().optional(),
  billInvoiceNumber: z.string().optional(),
  billPaymentStatus: z.string().optional(),
  billPaidAmount: z.string().optional(),
  billNotes: z.string().optional(),
});

type ExamFormData = z.infer<typeof examSchema>;

interface Exam {
  id: string;
  examType?: string;
  examDate: string;
  veterinarian?: string;
  soapFields?: {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  };
  billVendor?: string | null;
  billAmount?: string | null;
  billInvoiceNumber?: string | null;
  billPaymentStatus?: string | null;
  billPaidAmount?: string | null;
  billNotes?: string | null;
}

interface AddExamDialogProps {
  animalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exam?: Exam | null;
}

export function AddExamDialog({ animalId, open, onOpenChange, exam }: AddExamDialogProps) {
  const { toast } = useToast();
  const isEditing = !!exam;

  const form = useForm<ExamFormData>({
    resolver: zodResolver(examSchema),
    defaultValues: {
      examType: "",
      examDate: new Date().toISOString().split('T')[0],
      performedBy: "",
      subjective: "",
      objective: "",
      assessment: "",
      plan: "",
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
    if (exam && open) {
      reset({
        examType: exam.examType || "",
        examDate: exam.examDate ? new Date(exam.examDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        performedBy: exam.veterinarian || "",
        subjective: exam.soapFields?.subjective || "",
        objective: exam.soapFields?.objective || "",
        assessment: exam.soapFields?.assessment || "",
        plan: exam.soapFields?.plan || "",
        billVendor: exam.billVendor || "",
        billAmount: exam.billAmount || "",
        billInvoiceNumber: exam.billInvoiceNumber || "",
        billPaymentStatus: exam.billPaymentStatus || "",
        billPaidAmount: exam.billPaidAmount || "",
        billNotes: exam.billNotes || "",
      });
    } else if (!exam && open) {
      reset({
        examType: "",
        examDate: new Date().toISOString().split('T')[0],
        performedBy: "",
        subjective: "",
        objective: "",
        assessment: "",
        plan: "",
        billVendor: "",
        billAmount: "",
        billInvoiceNumber: "",
        billPaymentStatus: "",
        billPaidAmount: "",
        billNotes: "",
      });
    }
  }, [exam, open, reset]);

  const createMutation = useMutation({
    mutationFn: async (data: ExamFormData) => {
      const response = await apiRequest('POST', `/api/animals/${animalId}/medical/exams`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/exams`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/history`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/bills`] });
      toast({
        title: "Exam added",
        description: "Medical exam has been successfully recorded.",
      });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add medical exam.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ExamFormData) => {
      const response = await apiRequest('PATCH', `/api/medical/exams/${exam!.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/exams`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/history`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/bills`] });
      toast({
        title: "Exam updated",
        description: "Medical exam has been successfully updated.",
      });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update medical exam.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ExamFormData) => {
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
          <DialogTitle>{isEditing ? 'Edit Medical Exam' : 'Add Medical Exam'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update the medical examination record' : 'Record a medical examination using SOAP format (Subjective, Objective, Assessment, Plan)'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="examType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Exam Type *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-exam-type">
                          <SelectValue placeholder="Select exam type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="intake">Intake</SelectItem>
                        <SelectItem value="recheck">Recheck</SelectItem>
                        <SelectItem value="adoption">Adoption</SelectItem>
                        <SelectItem value="wellness">Wellness</SelectItem>
                        <SelectItem value="emergency">Emergency</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="examDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Exam Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-exam-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="performedBy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Performed By *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Dr. Smith" {...field} data-testid="input-performed-by" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-medium mb-3">SOAP Notes</h3>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="subjective"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subjective (S)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Patient history, symptoms, owner observations..."
                          className="min-h-[80px]"
                          {...field}
                          data-testid="textarea-subjective"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="objective"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Objective (O)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Physical exam findings, vital signs, test results..."
                          className="min-h-[80px]"
                          {...field}
                          data-testid="textarea-objective"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="assessment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assessment (A)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Diagnosis, problem list, interpretation..."
                          className="min-h-[80px]"
                          {...field}
                          data-testid="textarea-assessment"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="plan"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plan (P)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Treatment plan, follow-up recommendations..."
                          className="min-h-[80px]"
                          {...field}
                          data-testid="textarea-plan"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

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
                          <Input placeholder="e.g., INV-2024-001" {...field} data-testid="input-bill-invoice" />
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
                        <Textarea
                          placeholder="Additional notes about this bill"
                          {...field}
                          data-testid="textarea-bill-notes"
                        />
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
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit">
                {isEditing
                  ? (updateMutation.isPending ? "Updating..." : "Update Exam")
                  : (createMutation.isPending ? "Adding..." : "Add Exam")
                }
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

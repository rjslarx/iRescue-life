import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Banknote, CheckCircle2 } from "lucide-react";

const formSchema = z.object({
  paymentMethod: z.enum(["cash", "check", "money_order", "other"]),
  amount: z.string().min(1, "Amount is required").refine(val => !isNaN(parseFloat(val)) && parseFloat(val) > 0, "Amount must be positive"),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface RecordOfflinePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  applicantName: string;
  animalName: string;
  baseFee?: string;
}

export function RecordOfflinePaymentDialog({ 
  open, 
  onOpenChange, 
  sessionId,
  applicantName,
  animalName,
  baseFee 
}: RecordOfflinePaymentDialogProps) {
  const { toast } = useToast();
  const [success, setSuccess] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      paymentMethod: "cash",
      amount: baseFee || "",
      referenceNumber: "",
      notes: "",
    },
  });

  const recordPaymentMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await apiRequest('POST', `/api/adoptions/checkouts/${sessionId}/offline-payment`, data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || "Failed to record payment");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/adoptions/checkouts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/applications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });
      setSuccess(true);
      toast({
        title: "Payment recorded",
        description: `Offline payment for ${animalName}'s adoption has been recorded and finalized.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to record payment",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: FormData) => {
    recordPaymentMutation.mutate(data);
  };

  const handleClose = () => {
    setSuccess(false);
    form.reset();
    onOpenChange(false);
  };

  const paymentMethodLabels: Record<string, string> = {
    cash: "Cash",
    check: "Check",
    money_order: "Money Order",
    other: "Other",
  };

  if (success) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent data-testid="dialog-offline-payment-success">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <DialogTitle className="text-xl mb-2">Adoption Finalized!</DialogTitle>
            <DialogDescription className="mb-6">
              The offline payment has been recorded and {animalName}'s adoption is now complete.
            </DialogDescription>
            <Button onClick={handleClose} data-testid="button-close-success">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-record-offline-payment">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Record Offline Payment
          </DialogTitle>
          <DialogDescription>
            Record a cash, check, or other offline payment for {applicantName}'s adoption of {animalName}.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Method *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger data-testid="select-payment-method">
                        <SelectValue placeholder="Select payment method" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="check">Check</SelectItem>
                      <SelectItem value="money_order">Money Order</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount *</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="200.00"
                        {...field}
                        data-testid="input-payment-amount"
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    The amount received from the adopter
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="referenceNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reference Number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Check #, receipt #, etc."
                      {...field}
                      data-testid="input-reference-number"
                    />
                  </FormControl>
                  <FormDescription>
                    Optional: Check number or other reference for your records
                  </FormDescription>
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
                      placeholder="Any additional notes about this payment..."
                      className="resize-none"
                      rows={2}
                      {...field}
                      data-testid="input-payment-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={recordPaymentMutation.isPending}
                data-testid="button-cancel-payment"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={recordPaymentMutation.isPending}
                data-testid="button-submit-payment"
              >
                {recordPaymentMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Recording...
                  </>
                ) : (
                  <>Record Payment & Finalize</>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

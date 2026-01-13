import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, DollarSign, Banknote, CreditCard } from "lucide-react";

const formSchema = z.object({
  donorName: z.string().min(1, "Donor name is required"),
  donorEmail: z.string().email("Valid email required").optional().or(z.literal("")),
  amount: z.string().min(1, "Amount is required").refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    "Amount must be a positive number"
  ),
  paymentMethod: z.enum(["cash", "check", "other"]),
  checkNumber: z.string().optional(),
  notes: z.string().optional(),
  donationDate: z.string().min(1, "Date is required"),
});

type FormData = z.infer<typeof formSchema>;

interface RecordOfflineDonationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RecordOfflineDonationDialog({
  open,
  onOpenChange,
}: RecordOfflineDonationDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      donorName: "",
      donorEmail: "",
      amount: "",
      paymentMethod: "cash",
      checkNumber: "",
      notes: "",
      donationDate: new Date().toISOString().split("T")[0],
    },
  });

  const paymentMethod = form.watch("paymentMethod");

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      return apiRequest("POST", "/api/donations/offline", {
        donorName: data.donorName,
        donorEmail: data.donorEmail || null,
        amount: parseFloat(data.amount),
        paymentMethod: data.paymentMethod,
        checkNumber: data.checkNumber || null,
        notes: data.notes || null,
        donationDate: data.donationDate,
      });
    },
    onSuccess: () => {
      toast({
        title: "Donation Recorded",
        description: "The offline donation has been recorded successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/donations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/activity"] });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to record donation",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: FormData) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Record Offline Donation
          </DialogTitle>
          <DialogDescription>
            Record a cash, check, or other offline donation
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="donorName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Donor Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="John Smith"
                      {...field}
                      data-testid="input-donor-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="donorEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Donor Email (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="john@example.com"
                      {...field}
                      data-testid="input-donor-email"
                    />
                  </FormControl>
                  <FormDescription>For sending a thank you receipt</FormDescription>
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
                    <FormLabel>Amount *</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">$</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="100.00"
                          {...field}
                          data-testid="input-amount"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="donationDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date *</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        data-testid="input-donation-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Method *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-payment-method">
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="cash">
                        <div className="flex items-center gap-2">
                          <Banknote className="h-4 w-4" />
                          Cash
                        </div>
                      </SelectItem>
                      <SelectItem value="check">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4" />
                          Check
                        </div>
                      </SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {paymentMethod === "check" && (
              <FormField
                control={form.control}
                name="checkNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Check Number</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="1234"
                        {...field}
                        data-testid="input-check-number"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any additional notes about this donation..."
                      className="resize-none"
                      rows={2}
                      {...field}
                      data-testid="textarea-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                data-testid="button-record-donation"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Recording...
                  </>
                ) : (
                  "Record Donation"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

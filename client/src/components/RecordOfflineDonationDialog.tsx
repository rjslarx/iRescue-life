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
import { Loader2, DollarSign, Banknote, CreditCard, Gift, Globe } from "lucide-react";

const formSchema = z.object({
  donorName: z.string().min(1, "Donor name is required"),
  donorEmail: z.string().email("Valid email required").optional().or(z.literal("")),
  donationType: z.enum(["cash", "check", "online", "in_kind"]),
  amount: z.string().optional(),
  checkNumber: z.string().optional(),
  itemDescription: z.string().optional(),
  estimatedValue: z.string().optional(),
  notes: z.string().optional(),
  donationDate: z.string().min(1, "Date is required"),
}).superRefine((data, ctx) => {
  if (data.donationType === "in_kind") {
    if (!data.itemDescription || data.itemDescription.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Item description is required for in-kind donations",
        path: ["itemDescription"],
      });
    }
  } else {
    if (!data.amount || isNaN(parseFloat(data.amount)) || parseFloat(data.amount) <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A valid amount is required",
        path: ["amount"],
      });
    }
  }
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
      donationType: "cash",
      amount: "",
      checkNumber: "",
      itemDescription: "",
      estimatedValue: "",
      notes: "",
      donationDate: new Date().toISOString().split("T")[0],
    },
  });

  const donationType = form.watch("donationType");

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload: Record<string, unknown> = {
        donorName: data.donorName,
        donorEmail: data.donorEmail || null,
        donationType: data.donationType,
        donationDate: data.donationDate,
        notes: data.notes || null,
      };

      if (data.donationType === "in_kind") {
        payload.itemDescription = data.itemDescription;
        payload.estimatedValue = data.estimatedValue ? parseFloat(data.estimatedValue) : null;
      } else {
        payload.amount = parseFloat(data.amount!);
        if (data.donationType === "check" && data.checkNumber) {
          payload.checkNumber = data.checkNumber;
        }
      }

      return apiRequest("POST", "/api/donations/offline", payload);
    },
    onSuccess: () => {
      toast({
        title: "Donation Recorded",
        description: donationType === "in_kind" 
          ? "The in-kind donation has been recorded successfully."
          : "The donation has been recorded successfully.",
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
            Record Donation
          </DialogTitle>
          <DialogDescription>
            Record a cash, check, online, or in-kind donation
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

            <FormField
              control={form.control}
              name="donationType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Donation Type *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-donation-type">
                        <SelectValue placeholder="Select type" />
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
                      <SelectItem value="online">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4" />
                          Online (Non-Stripe)
                        </div>
                      </SelectItem>
                      <SelectItem value="in_kind">
                        <div className="flex items-center gap-2">
                          <Gift className="h-4 w-4" />
                          In-Kind (Goods/Services)
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {donationType !== "in_kind" && (
              <>
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

                {donationType === "check" && (
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
              </>
            )}

            {donationType === "in_kind" && (
              <>
                <FormField
                  control={form.control}
                  name="itemDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Item Description *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g., 5 bags of dog food, 10 blankets, grooming services..."
                          className="resize-none"
                          rows={3}
                          {...field}
                          data-testid="textarea-item-description"
                        />
                      </FormControl>
                      <FormDescription>
                        Describe the goods or services donated
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="estimatedValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estimated Value (Optional)</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <span className="text-lg">$</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              {...field}
                              data-testid="input-estimated-value"
                            />
                          </div>
                        </FormControl>
                        <FormDescription className="text-xs">
                          Internal tracking only
                        </FormDescription>
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
              </>
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

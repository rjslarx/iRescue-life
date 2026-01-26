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
import { Loader2, Gift, Banknote, CreditCard, Package, Wrench } from "lucide-react";

const formSchema = z.object({
  donorName: z.string().min(1, "Donor name is required"),
  donorEmail: z.string().email("Valid email required").optional().or(z.literal("")),
  donorAddress: z.string().optional(),
  donorCity: z.string().optional(),
  donorState: z.string().optional(),
  donorZip: z.string().optional(),
  donationType: z.enum(["cash", "check", "in_kind_goods", "in_kind_services"]),
  amount: z.string().optional(),
  description: z.string().optional(),
  donorStatedValue: z.string().optional(),
  estimatedValue: z.string().optional(),
  checkNumber: z.string().optional(),
  notes: z.string().optional(),
  donationDate: z.string().min(1, "Date is required"),
}).superRefine((data, ctx) => {
  const isCashOrCheck = data.donationType === "cash" || data.donationType === "check";
  const isInKind = data.donationType === "in_kind_goods" || data.donationType === "in_kind_services";
  
  if (isCashOrCheck) {
    if (!data.amount || parseFloat(data.amount) <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Amount is required for cash/check donations",
        path: ["amount"],
      });
    }
  }
  
  if (isInKind) {
    if (!data.description || data.description.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Description is required for in-kind donations",
        path: ["description"],
      });
    }
    // IRS compliance: require email, full address, and donor-stated value
    if (!data.donorEmail || data.donorEmail.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Email is required for IRS-compliant receipt",
        path: ["donorEmail"],
      });
    }
    if (!data.donorAddress || data.donorAddress.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Street address is required for IRS compliance",
        path: ["donorAddress"],
      });
    }
    if (!data.donorCity || data.donorCity.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "City is required for IRS compliance",
        path: ["donorCity"],
      });
    }
    if (!data.donorState || data.donorState.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "State is required for IRS compliance",
        path: ["donorState"],
      });
    }
    if (!data.donorZip || data.donorZip.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ZIP code is required for IRS compliance",
        path: ["donorZip"],
      });
    }
    if (!data.donorStatedValue || parseFloat(data.donorStatedValue) <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Donor-stated value is required for IRS-compliant receipt",
        path: ["donorStatedValue"],
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
      donorAddress: "",
      donorCity: "",
      donorState: "",
      donorZip: "",
      donationType: "cash",
      amount: "",
      description: "",
      donorStatedValue: "",
      estimatedValue: "",
      checkNumber: "",
      notes: "",
      donationDate: new Date().toISOString().split("T")[0],
    },
  });

  const donationType = form.watch("donationType");
  const isCashOrCheck = donationType === "cash" || donationType === "check";
  const isInKind = donationType === "in_kind_goods" || donationType === "in_kind_services";

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      return apiRequest("POST", "/api/donations/offline", {
        donorName: data.donorName,
        donorEmail: data.donorEmail || null,
        donorAddress: data.donorAddress || null,
        donorCity: data.donorCity || null,
        donorState: data.donorState || null,
        donorZip: data.donorZip || null,
        donationType: data.donationType,
        amount: data.amount ? parseFloat(data.amount) : null,
        description: data.description || null,
        donorStatedValue: data.donorStatedValue ? parseFloat(data.donorStatedValue) : null,
        estimatedValue: data.estimatedValue ? parseFloat(data.estimatedValue) : null,
        checkNumber: data.checkNumber || null,
        notes: data.notes || null,
        donationDate: data.donationDate,
      });
    },
    onSuccess: (data: any) => {
      const receiptSent = data?.receiptSent;
      const hasEmail = form.getValues('donorEmail');
      
      let description = isInKind 
        ? "The in-kind donation has been recorded. The donor will be added to your contacts."
        : "The donation has been recorded successfully.";
      
      if (hasEmail) {
        description += receiptSent 
          ? " A tax receipt has been emailed to the donor."
          : " Receipt could not be emailed (email service may not be configured).";
      }
      
      toast({
        title: "Donation Recorded",
        description,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/donations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            Record Donation
          </DialogTitle>
          <DialogDescription>
            Record a cash, check, or in-kind donation
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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
                      <SelectItem value="in_kind_goods">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          In-Kind Goods
                        </div>
                      </SelectItem>
                      <SelectItem value="in_kind_services">
                        <div className="flex items-center gap-2">
                          <Wrench className="h-4 w-4" />
                          In-Kind Services
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                  <FormLabel>Donor Email {isInKind ? "(Required for receipt)" : "(Optional)"}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="john@example.com"
                      {...field}
                      data-testid="input-donor-email"
                    />
                  </FormControl>
                  <FormDescription>
                    {isInKind 
                      ? "Required to send the IRS-compliant in-kind donation receipt"
                      : "For sending a thank you receipt"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isInKind && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="donorAddress"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Street Address *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="123 Main St"
                            {...field}
                            data-testid="input-donor-address"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="donorCity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="City"
                            {...field}
                            data-testid="input-donor-city"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <FormField
                      control={form.control}
                      name="donorState"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="TX"
                              {...field}
                              data-testid="input-donor-state"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="donorZip"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ZIP *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="12345"
                              {...field}
                              data-testid="input-donor-zip"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description of Donated Items/Services *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g., Large wire dog crate, 5 bags of premium dog food, veterinary exam services"
                          className="resize-none"
                          rows={3}
                          {...field}
                          data-testid="textarea-description"
                        />
                      </FormControl>
                      <FormDescription>
                        This description will appear on the IRS-compliant receipt
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="donorStatedValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Donor Stated Value *</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <span className="text-lg">$</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0.01"
                              placeholder="0.00"
                              {...field}
                              data-testid="input-donor-stated-value"
                            />
                          </div>
                        </FormControl>
                        <FormDescription className="text-xs">
                          Required for IRS-compliant receipt
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="estimatedValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Org Estimated Value</FormLabel>
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
                </div>
              </>
            )}

            {isCashOrCheck && (
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
                </div>
              </>
            )}

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

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Heart, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const reportPassingSchema = z.object({
  dateOfPassing: z.date({ required_error: "Please select the date of passing" }),
  causeOrNotes: z.string().optional(),
});

type ReportPassingFormValues = z.infer<typeof reportPassingSchema>;

interface ReportPassingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  petId: string;
  petName: string;
}

export function ReportPassingModal({ open, onOpenChange, petId, petName }: ReportPassingModalProps) {
  const { toast } = useToast();
  const [confirmStep, setConfirmStep] = useState(false);

  const form = useForm<ReportPassingFormValues>({
    resolver: zodResolver(reportPassingSchema),
    defaultValues: {
      dateOfPassing: undefined,
      causeOrNotes: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: ReportPassingFormValues) => {
      return apiRequest("POST", "/api/adopter/report-passing", {
        animalId: petId,
        dateOfPassing: values.dateOfPassing.toISOString(),
        causeOrNotes: values.causeOrNotes?.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/adopter/my-pets"] });
      toast({
        title: "Records updated",
        description: `${petName}'s records have been updated. No further automated reminders will be sent.`,
      });
      handleClose();
    },
    onError: () => {
      toast({
        title: "Something went wrong",
        description: "We were unable to process your report. Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    form.reset();
    setConfirmStep(false);
    onOpenChange(false);
  };

  const onFormSubmit = (values: ReportPassingFormValues) => {
    if (!confirmStep) {
      setConfirmStep(true);
      return;
    }
    mutation.mutate(values);
  };

  const handleConfirmSubmit = () => {
    form.handleSubmit(onFormSubmit)();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-report-passing">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Heart className="h-5 w-5 text-muted-foreground" />
            <DialogTitle data-testid="text-dialog-title">
              {confirmStep ? "Confirm Report" : `Report Passing of ${petName}`}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm leading-relaxed" data-testid="text-dialog-description">
            {confirmStep
              ? `Please confirm that you would like to report ${petName}'s passing. This will update our records and stop any automated reminders.`
              : "We are so sorry for your loss. Please share a few details so we can update our records and ensure you do not receive further automated reminders."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onFormSubmit)}>
            {!confirmStep && (
              <div className="space-y-4 py-2">
                <FormField
                  control={form.control}
                  name="dateOfPassing"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Date of Passing</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              data-testid="button-date-of-passing"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? format(field.value, "PPP") : "Select date"}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date > new Date()}
                            initialFocus
                            data-testid="calendar-date-of-passing"
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="causeOrNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Any details you'd like to share..."
                          rows={3}
                          data-testid="textarea-cause-or-notes"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <DialogFooter className="flex-col gap-2 sm:flex-row mt-4">
              {confirmStep && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmStep(false)}
                  data-testid="button-back"
                >
                  Go Back
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                data-testid="button-cancel-report"
              >
                Cancel
              </Button>
              {confirmStep ? (
                <Button
                  type="button"
                  onClick={handleConfirmSubmit}
                  disabled={mutation.isPending}
                  data-testid="button-submit-report"
                >
                  {mutation.isPending ? "Submitting..." : "Yes, Submit Report"}
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!form.watch("dateOfPassing")}
                  data-testid="button-continue-report"
                >
                  Continue
                </Button>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

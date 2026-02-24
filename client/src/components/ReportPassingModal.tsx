import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Heart, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ReportPassingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  petId: string;
  petName: string;
}

export function ReportPassingModal({ open, onOpenChange, petId, petName }: ReportPassingModalProps) {
  const { toast } = useToast();
  const [dateOfPassing, setDateOfPassing] = useState<Date | undefined>(undefined);
  const [causeOrNotes, setCauseOrNotes] = useState("");
  const [confirmStep, setConfirmStep] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/adopter/report-passing", {
        animalId: petId,
        dateOfPassing: dateOfPassing!.toISOString(),
        causeOrNotes: causeOrNotes.trim() || undefined,
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
    setDateOfPassing(undefined);
    setCauseOrNotes("");
    setConfirmStep(false);
    onOpenChange(false);
  };

  const handleSubmit = () => {
    if (!confirmStep) {
      setConfirmStep(true);
      return;
    }
    mutation.mutate();
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

        {!confirmStep && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="date-of-passing">Date of Passing *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateOfPassing && "text-muted-foreground"
                    )}
                    data-testid="button-date-of-passing"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateOfPassing ? format(dateOfPassing, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateOfPassing}
                    onSelect={setDateOfPassing}
                    disabled={(date) => date > new Date()}
                    initialFocus
                    data-testid="calendar-date-of-passing"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cause-or-notes">Notes (optional)</Label>
              <Textarea
                id="cause-or-notes"
                placeholder="Any details you'd like to share..."
                value={causeOrNotes}
                onChange={(e) => setCauseOrNotes(e.target.value)}
                rows={3}
                data-testid="textarea-cause-or-notes"
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {confirmStep && (
            <Button
              variant="outline"
              onClick={() => setConfirmStep(false)}
              data-testid="button-back"
            >
              Go Back
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleClose}
            data-testid="button-cancel-report"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!dateOfPassing || mutation.isPending}
            data-testid="button-submit-report"
          >
            {mutation.isPending
              ? "Submitting..."
              : confirmStep
                ? "Yes, Submit Report"
                : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

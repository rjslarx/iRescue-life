import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const markDeceasedSchema = z.object({
  deceasedDate: z.date({
    required_error: "Date of death is required",
  }),
  causeOfDeath: z.enum(["natural_death", "euthanasia"], {
    required_error: "Please select a cause of death",
  }),
  deceasedNotes: z.string().min(1, "Please provide details about the circumstances"),
});

type MarkDeceasedFormData = z.infer<typeof markDeceasedSchema>;

interface MarkDeceasedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animalId: string;
  animalName: string;
}

export default function MarkDeceasedDialog({
  open,
  onOpenChange,
  animalId,
  animalName,
}: MarkDeceasedDialogProps) {
  const { toast } = useToast();
  const [showConfirmation, setShowConfirmation] = useState(false);

  const form = useForm<MarkDeceasedFormData>({
    resolver: zodResolver(markDeceasedSchema),
    defaultValues: {
      deceasedDate: new Date(),
      deceasedNotes: "",
    },
  });

  const markDeceasedMutation = useMutation({
    mutationFn: async (data: MarkDeceasedFormData) => {
      const response = await apiRequest("PATCH", `/api/animals/${animalId}/deceased`, {
        deceasedDate: data.deceasedDate.toISOString(),
        causeOfDeath: data.causeOfDeath,
        deceasedNotes: data.deceasedNotes,
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/animals', animalId] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      toast({
        title: "Animal marked as deceased",
        description: `${animalName} has been marked as deceased. This animal will no longer appear in active animal lists.`,
      });
      onOpenChange(false);
      form.reset();
      setShowConfirmation(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to mark animal as deceased",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: MarkDeceasedFormData) => {
    if (!showConfirmation) {
      setShowConfirmation(true);
      return;
    }
    markDeceasedMutation.mutate(data);
  };

  const handleCancel = () => {
    form.reset();
    setShowConfirmation(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-mark-deceased">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Mark Animal as Deceased
          </DialogTitle>
          <DialogDescription>
            {!showConfirmation ? (
              <>
                Record the passing of <strong>{animalName}</strong>. This action will remove the animal from active care and preserve their record for historical purposes.
              </>
            ) : (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-sm text-destructive font-medium mb-2">
                  ⚠️ Please confirm this action
                </p>
                <p className="text-sm text-destructive/90">
                  You are about to mark <strong>{animalName}</strong> as deceased. This will:
                </p>
                <ul className="list-disc list-inside text-sm text-destructive/90 mt-2 space-y-1">
                  <li>Remove the animal from all active lists</li>
                  <li>Preserve their medical and care history</li>
                  <li>This action cannot be easily undone</li>
                </ul>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {!showConfirmation && (
              <>
                <FormField
                  control={form.control}
                  name="deceasedDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Date of Death *</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              data-testid="button-select-deceased-date"
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
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
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="causeOfDeath"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cause of Death *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-cause-of-death">
                            <SelectValue placeholder="Select cause of death" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="natural_death">Natural Death</SelectItem>
                          <SelectItem value="euthanasia">Euthanasia</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="deceasedNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Details *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Please provide details about the circumstances, veterinary records reference, etc."
                          className="min-h-[100px]"
                          data-testid="textarea-deceased-notes"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                data-testid="button-cancel-deceased"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant={showConfirmation ? "destructive" : "default"}
                disabled={markDeceasedMutation.isPending}
                data-testid="button-submit-deceased"
              >
                {markDeceasedMutation.isPending
                  ? "Saving..."
                  : showConfirmation
                  ? "Confirm & Mark Deceased"
                  : "Continue"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { insertVolunteerOpportunitySchema, type InsertVolunteerOpportunity, type VolunteerOpportunity } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface AddOpportunityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity?: VolunteerOpportunity;
}

export default function AddOpportunityDialog({
  open,
  onOpenChange,
  opportunity,
}: AddOpportunityDialogProps) {
  const { toast } = useToast();
  const isEditing = !!opportunity;

  const form = useForm<InsertVolunteerOpportunity>({
    resolver: zodResolver(insertVolunteerOpportunitySchema.omit({ tenantId: true })),
    defaultValues: {
      title: "",
      description: "",
      date: "",
      time: "",
      location: "",
      slotsTotal: 1,
    },
  });

  // Reset form when opportunity changes (for editing)
  useEffect(() => {
    if (opportunity) {
      form.reset(opportunity);
    } else {
      form.reset({
        title: "",
        description: "",
        date: "",
        time: "",
        location: "",
        slotsTotal: 1,
      });
    }
  }, [opportunity, form]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertVolunteerOpportunity) => {
      return await apiRequest("POST", "/api/volunteer-opportunities", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities"] });
      toast({
        title: "Success",
        description: "Volunteer opportunity created successfully",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: InsertVolunteerOpportunity) => {
      return await apiRequest("PATCH", `/api/volunteer-opportunities/${opportunity!.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities"] });
      toast({
        title: "Success",
        description: "Volunteer opportunity updated successfully",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertVolunteerOpportunity) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle data-testid="text-dialog-title">
            {isEditing ? "Edit Volunteer Opportunity" : "Create Volunteer Opportunity"}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? "Update the details of this volunteer opportunity."
              : "Post a new volunteer opportunity for your team."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="e.g., Driver Needed for Vet Run"
                      data-testid="input-opportunity-title"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      placeholder="Describe what volunteers will do..."
                      rows={3}
                      data-testid="input-opportunity-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="date"
                        data-testid="input-opportunity-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="e.g., 9:00 AM - 12:00 PM"
                        data-testid="input-opportunity-time"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="e.g., Main Shelter or Remote"
                      data-testid="input-opportunity-location"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="slotsTotal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Number of Volunteer Slots</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      type="number"
                      min={1}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                      data-testid="input-opportunity-slots"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                data-testid="button-submit-opportunity"
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving..."
                  : isEditing
                  ? "Update Opportunity"
                  : "Create Opportunity"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSupplyRequestSchema, type InsertSupplyRequest } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

interface SupplyRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animalId: string;
  animalName: string;
}

export default function SupplyRequestDialog({
  open,
  onOpenChange,
  animalId,
  animalName,
}: SupplyRequestDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const form = useForm<InsertSupplyRequest>({
    resolver: zodResolver(insertSupplyRequestSchema),
    defaultValues: {
      animalId,
      category: "food",
      item: "",
      quantity: "",
      notes: "",
    },
  });

  useEffect(() => {
    form.reset({
      animalId,
      category: "food",
      item: "",
      quantity: "",
      notes: "",
    });
  }, [animalId, form]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertSupplyRequest) => {
      const res = await apiRequest("POST", "/api/supply-requests", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Supply request submitted",
        description: "Your request has been sent to the foster coordinator.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/supply-requests'] });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to submit request",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertSupplyRequest) => {
    console.log("Supply Request Form Data:", data);
    console.log("Form Errors:", form.formState.errors);
    createMutation.mutate(data);
  };

  // Common supply items by category
  const supplyItems = {
    food: [
      "Dry Food - Puppy",
      "Dry Food - Adult Dog",
      "Dry Food - Senior Dog",
      "Dry Food - Kitten",
      "Dry Food - Adult Cat",
      "Wet Food - Dog",
      "Wet Food - Cat",
      "Treats - Dog",
      "Treats - Cat",
      "Special Diet Food",
      "Other",
    ],
    medication: [
      "Flea/Tick Preventative",
      "Heartworm Preventative",
      "Pain Medication",
      "Antibiotics",
      "Probiotics",
      "Vitamins/Supplements",
      "Eye Drops",
      "Ear Medication",
      "Other",
    ],
    supplies: [
      "Collar",
      "Leash",
      "Harness",
      "Bed",
      "Crate - Small",
      "Crate - Medium",
      "Crate - Large",
      "Litter Box",
      "Litter",
      "Food Bowl",
      "Water Bowl",
      "Toys",
      "Blankets",
      "Cleaning Supplies",
      "Other",
    ],
    other: [
      "Other",
    ],
  };

  const category = form.watch("category");
  const itemList = supplyItems[category as keyof typeof supplyItems] || supplyItems.other;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-supply-request">
        <DialogHeader>
          <DialogTitle>Request Supplies</DialogTitle>
          <DialogDescription>
            Request supplies for <strong>{animalName}</strong>. Your request will be sent to the foster coordinator.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="food" data-testid="option-category-food">Food</SelectItem>
                      <SelectItem value="medication" data-testid="option-category-medication">Medication</SelectItem>
                      <SelectItem value="supplies" data-testid="option-category-supplies">Supplies</SelectItem>
                      <SelectItem value="other" data-testid="option-category-other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="item"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Item</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger data-testid="select-item">
                        <SelectValue placeholder="Select item" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {itemList.map((item) => (
                        <SelectItem key={item} value={item} data-testid={`option-item-${item.toLowerCase().replace(/\s+/g, '-')}`}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="e.g., 1 bag, 2 boxes, 3 bottles"
                      data-testid="input-quantity"
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
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Add any additional details or preferences..."
                      className="resize-none"
                      rows={3}
                      data-testid="textarea-notes"
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
                disabled={createMutation.isPending}
                data-testid="button-submit-request"
              >
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Request
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

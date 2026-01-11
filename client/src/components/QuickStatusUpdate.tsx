import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Loader2, 
  MessageSquare, 
  Heart, 
  AlertTriangle, 
  Stethoscope,
  Activity,
  Send
} from "lucide-react";
import type { Animal } from "@shared/schema";

interface QuickStatusUpdateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animal: Animal;
}

type QuickOption = {
  id: "doing_great" | "needs_attention" | "medical_concern" | "behavior_update";
  label: string;
  icon: typeof Heart;
  updateType: "general_update" | "behavioral_note" | "medical_concern";
  priority: "low" | "normal" | "high" | "urgent";
  template: string;
  description: string;
};

const quickOptions: QuickOption[] = [
  {
    id: "doing_great",
    label: "Doing Great",
    icon: Heart,
    updateType: "general_update",
    priority: "low",
    template: "is doing great! Happy, healthy, and enjoying foster care.",
    description: "Everything is going well",
  },
  {
    id: "needs_attention",
    label: "Needs Attention",
    icon: AlertTriangle,
    updateType: "behavioral_note",
    priority: "normal",
    template: "needs some attention. Something to be aware of.",
    description: "Something to monitor",
  },
  {
    id: "medical_concern",
    label: "Medical Concern",
    icon: Stethoscope,
    updateType: "medical_concern",
    priority: "high",
    template: "may need medical attention. Please advise.",
    description: "Health issue to address",
  },
  {
    id: "behavior_update",
    label: "Behavior Update",
    icon: Activity,
    updateType: "behavioral_note",
    priority: "normal",
    template: "showing some behavior I wanted to share with you.",
    description: "Behavioral observation",
  },
];

export default function QuickStatusUpdate({
  open,
  onOpenChange,
  animal,
}: QuickStatusUpdateProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedOption, setSelectedOption] = useState<QuickOption | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetState = () => {
    setSelectedOption(null);
    setCustomMessage("");
    setIsSubmitting(false);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const handleOptionSelect = (option: QuickOption) => {
    setSelectedOption(option);
    setCustomMessage(`${animal.name} ${option.template}`);
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOption || !customMessage.trim()) {
        throw new Error("Please select an option and provide details");
      }

      setIsSubmitting(true);

      const updateData = {
        animalId: animal.id,
        updateType: selectedOption.updateType,
        statusId: selectedOption.id,
        description: customMessage.trim(),
        priority: selectedOption.priority,
      };

      return await apiRequest("POST", "/api/foster-updates", updateData);
    },
    onSuccess: () => {
      toast({
        title: "Update sent!",
        description: `Your update about ${animal.name} has been shared with the rescue team.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/foster-updates"] });
      handleClose();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to send update",
        description: error.message || "Please try again.",
      });
      setIsSubmitting(false);
    },
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "destructive";
      case "high":
        return "destructive";
      case "normal":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Quick Status Update
          </DialogTitle>
          <DialogDescription>
            Send a quick update about {animal.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {quickOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = selectedOption?.id === option.id;
              return (
                <Button
                  key={option.id}
                  variant={isSelected ? "default" : "outline"}
                  className={`h-auto py-4 px-4 flex flex-col items-center gap-2 ${
                    isSelected ? "" : "hover-elevate"
                  }`}
                  onClick={() => handleOptionSelect(option)}
                  data-testid={`button-quick-${option.id}`}
                >
                  <Icon className={`h-6 w-6 ${
                    option.priority === "high" || option.priority === "urgent" 
                      ? "text-destructive" 
                      : ""
                  }`} />
                  <span className="text-sm font-medium text-center leading-tight">
                    {option.label}
                  </span>
                  <span className="text-xs text-muted-foreground text-center">
                    {option.description}
                  </span>
                </Button>
              );
            })}
          </div>

          {selectedOption && (
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label htmlFor="message">Your update</Label>
                <Badge variant={getPriorityColor(selectedOption.priority) as any}>
                  {selectedOption.priority} priority
                </Badge>
              </div>
              <Textarea
                id="message"
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Add more details..."
                className="resize-none min-h-[100px]"
                rows={4}
                data-testid="input-status-message"
              />
              <p className="text-xs text-muted-foreground">
                You can customize the message above or just send as-is.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
            data-testid="button-cancel-update"
          >
            Cancel
          </Button>
          {selectedOption && (
            <Button
              onClick={() => submitMutation.mutate()}
              disabled={isSubmitting || !customMessage.trim()}
              data-testid="button-submit-update"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Update
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

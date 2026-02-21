import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowRight, Send, FileSignature, AlertCircle, Zap } from "lucide-react";

interface FosterApplicationData {
  id: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone?: string;
}

interface MoveAndSendFosterAgreementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: FosterApplicationData | null;
  onSuccess?: () => void;
}

export function MoveAndSendFosterAgreementDialog({ 
  open, 
  onOpenChange, 
  application,
  onSuccess 
}: MoveAndSendFosterAgreementDialogProps) {
  const { toast } = useToast();
  const [moveAction, setMoveAction] = useState<"move_and_send" | "move_only">("move_and_send");

  const moveMutation = useMutation({
    mutationFn: async ({ applicationId, skipAutomation }: { applicationId: string; skipAutomation: boolean }) => {
      const response = await apiRequest('PATCH', `/api/foster-applications/${applicationId}`, {
        pipelineStatus: 'agreement',
        skipAutomation,
      });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/foster-applications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/foster-agreements/sessions'] });
      
      if (!variables.skipAutomation) {
        toast({
          title: "Moved to Agreement & Email Sent",
          description: `${application?.applicantName} has been moved to Agreement stage and sent the foster agreement for e-signature.`,
        });
      } else {
        toast({
          title: "Moved to Agreement Stage",
          description: `${application?.applicantName} has been moved to Agreement stage. You can send the agreement manually later.`,
        });
      }
      
      setMoveAction("move_and_send");
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update application",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!application) return;
    moveMutation.mutate({
      applicationId: application.id,
      skipAutomation: moveAction === "move_only",
    });
  };

  if (!application) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-move-foster-agreement">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-cyan-600" />
            Move to Agreement Stage
          </DialogTitle>
          <DialogDescription>
            Moving {application.applicantName} to the Agreement stage
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup
            value={moveAction}
            onValueChange={(value) => setMoveAction(value as "move_and_send" | "move_only")}
            className="flex flex-col space-y-2"
          >
            <div className="flex items-start space-x-3 p-3 rounded-lg border hover-elevate cursor-pointer" onClick={() => setMoveAction("move_and_send")}>
              <RadioGroupItem value="move_and_send" id="move_and_send" data-testid="radio-move-and-send" className="mt-1" />
              <label
                htmlFor="move_and_send"
                className="flex flex-col cursor-pointer flex-1"
              >
                <span className="font-medium flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Move & Send Agreement
                </span>
                <span className="text-sm text-muted-foreground">
                  Automatically email the foster agreement for e-signature
                </span>
              </label>
            </div>
            <div className="flex items-start space-x-3 p-3 rounded-lg border hover-elevate cursor-pointer" onClick={() => setMoveAction("move_only")}>
              <RadioGroupItem value="move_only" id="move_only" data-testid="radio-move-only" className="mt-1" />
              <label
                htmlFor="move_only"
                className="flex flex-col cursor-pointer flex-1"
              >
                <span className="font-medium flex items-center gap-2">
                  <ArrowRight className="h-4 w-4" />
                  Move Only
                </span>
                <span className="text-sm text-muted-foreground">
                  Just update the stage (send agreement manually later)
                </span>
              </label>
            </div>
          </RadioGroup>

          {moveAction === "move_and_send" && (
            <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
              <CardContent className="pt-4">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-700 dark:text-blue-300">
                    <p className="font-medium">What happens next:</p>
                    <ol className="list-decimal list-inside mt-1 space-y-1 text-blue-600 dark:text-blue-400">
                      <li>Application moves to Agreement stage</li>
                      <li>Foster agreement email is sent for e-signature</li>
                      <li>After signing, foster is moved to Active Pool</li>
                    </ol>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={moveMutation.isPending}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={moveMutation.isPending}
            data-testid="button-confirm-move"
          >
            {moveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : moveAction === "move_and_send" ? (
              <>
                <Send className="mr-2 h-4 w-4" />
                Move & Send Agreement
              </>
            ) : (
              <>
                <ArrowRight className="mr-2 h-4 w-4" />
                Move to Agreement
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

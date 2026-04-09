import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowRight, Send, FileSignature, AlertCircle, Zap, Mail, MessageSquare, MailPlus } from "lucide-react";

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
  const [sendMethod, setSendMethod] = useState<"email" | "sms" | "both">("email");

  const hasPhone = !!application?.applicantPhone;
  const hasEmail = !!application?.applicantEmail;

  const moveMutation = useMutation({
    mutationFn: async ({ applicationId, skipAutomation, sendMethod }: { applicationId: string; skipAutomation: boolean; sendMethod: string }) => {
      const response = await apiRequest('PATCH', `/api/foster-applications/${applicationId}`, {
        pipelineStatus: 'agreement',
        skipAutomation,
        sendMethod,
      });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/foster-applications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/foster-agreements/sessions'] });
      
      if (!variables.skipAutomation) {
        const methodLabel = variables.sendMethod === 'both' ? 'email & SMS' : variables.sendMethod === 'sms' ? 'SMS' : 'email';
        toast({
          title: `Moved to Agreement & Sent via ${methodLabel}`,
          description: `${application?.applicantName} has been sent the foster agreement for e-signature.`,
        });
      } else {
        toast({
          title: "Moved to Agreement Stage",
          description: `${application?.applicantName} has been moved to Agreement stage. You can send the agreement manually later.`,
        });
      }
      
      setMoveAction("move_and_send");
      setSendMethod("email");
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
      sendMethod,
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
              <RadioGroupItem value="move_and_send" id="foster-move_and_send" data-testid="radio-move-and-send" className="mt-1" />
              <label
                htmlFor="foster-move_and_send"
                className="flex flex-col cursor-pointer flex-1"
              >
                <span className="font-medium flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Move & Send Agreement
                </span>
                <span className="text-sm text-muted-foreground">
                  Send the foster agreement for e-signature
                </span>
              </label>
            </div>
            <div className="flex items-start space-x-3 p-3 rounded-lg border hover-elevate cursor-pointer" onClick={() => setMoveAction("move_only")}>
              <RadioGroupItem value="move_only" id="foster-move_only" data-testid="radio-move-only" className="mt-1" />
              <label
                htmlFor="foster-move_only"
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
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Delivery method:</p>
              <RadioGroup
                value={sendMethod}
                onValueChange={(value) => setSendMethod(value as "email" | "sms" | "both")}
                className="flex flex-col space-y-2"
              >
                {hasEmail && (
                  <div className="flex items-center space-x-3 p-3 rounded-lg border hover-elevate cursor-pointer" onClick={() => setSendMethod("email")}>
                    <RadioGroupItem value="email" id="foster-send-email" data-testid="radio-send-email" />
                    <label htmlFor="foster-send-email" className="flex items-center gap-2 cursor-pointer flex-1">
                      <Mail className="h-4 w-4 text-blue-500" />
                      <div>
                        <span className="font-medium">Email</span>
                        <p className="text-xs text-muted-foreground">{application.applicantEmail}</p>
                      </div>
                    </label>
                  </div>
                )}
                {hasPhone && (
                  <div className="flex items-center space-x-3 p-3 rounded-lg border hover-elevate cursor-pointer" onClick={() => setSendMethod("sms")}>
                    <RadioGroupItem value="sms" id="foster-send-sms" data-testid="radio-send-sms" />
                    <label htmlFor="foster-send-sms" className="flex items-center gap-2 cursor-pointer flex-1">
                      <MessageSquare className="h-4 w-4 text-green-500" />
                      <div>
                        <span className="font-medium">SMS</span>
                        <p className="text-xs text-muted-foreground">{application.applicantPhone}</p>
                      </div>
                    </label>
                  </div>
                )}
                {hasEmail && hasPhone && (
                  <div className="flex items-center space-x-3 p-3 rounded-lg border hover-elevate cursor-pointer" onClick={() => setSendMethod("both")}>
                    <RadioGroupItem value="both" id="foster-send-both" data-testid="radio-send-both" />
                    <label htmlFor="foster-send-both" className="flex items-center gap-2 cursor-pointer flex-1">
                      <MailPlus className="h-4 w-4 text-purple-500" />
                      <span className="font-medium">Both (Email & SMS)</span>
                    </label>
                  </div>
                )}
              </RadioGroup>

              <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                <CardContent className="pt-4">
                  <div className="flex gap-3">
                    <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-700 dark:text-blue-300">
                      <p className="font-medium">What happens next:</p>
                      <ol className="list-decimal list-inside mt-1 space-y-1 text-blue-600 dark:text-blue-400">
                        <li>Application moves to Agreement stage</li>
                        <li>Foster agreement link sent via {sendMethod === 'both' ? 'email & SMS' : sendMethod}</li>
                        <li>After signing, foster is moved to Active Pool</li>
                      </ol>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
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

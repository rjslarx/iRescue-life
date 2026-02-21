import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Mail, Send, Loader2 } from "lucide-react";

interface EmailComposerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  recipientEmail: string;
  recipientName: string;
  defaultSubject?: string;
  context?: {
    type: "adoption_application" | "foster_application" | "volunteer_application" | "intake_request" | "general";
    id?: string;
    animalName?: string;
  };
}

export default function EmailComposerDialog({
  isOpen,
  onClose,
  recipientEmail,
  recipientName,
  defaultSubject = "",
  context,
}: EmailComposerDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState("");
  
  // Track previous open state to detect open transition
  const wasOpenRef = useRef(false);

  // Only sync subject when dialog transitions from closed to open
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      // Dialog just opened - set initial values
      setSubject(defaultSubject);
      setMessage("");
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, defaultSubject]);

  const sendEmailMutation = useMutation({
    mutationFn: async (data: { to: string; subject: string; message: string; context?: typeof context }) => {
      const response = await apiRequest("POST", "/api/send-email", data);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to send email (${response.status})`);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Email Sent",
        description: `Your message has been sent to ${recipientName}.`,
      });
      setSubject("");
      setMessage("");
      onClose();
      if (context?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/activity-logs"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/activity"] });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Send",
        description: error.message || "Could not send email. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast({
        title: "Missing Fields",
        description: "Please enter both a subject and message.",
        variant: "destructive",
      });
      return;
    }
    
    sendEmailMutation.mutate({
      to: recipientEmail,
      subject: subject.trim(),
      message: message.trim(),
      context,
    });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Compose Email
          </DialogTitle>
          <DialogDescription>
            Send an email to {recipientName}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email-to">To</Label>
            <Input
              id="email-to"
              value={`${recipientName} <${recipientEmail}>`}
              disabled
              className="bg-muted"
              data-testid="input-email-to"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter email subject..."
              data-testid="input-email-subject"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-message">Message</Label>
            <Textarea
              id="email-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message here..."
              rows={8}
              className="resize-none"
              data-testid="input-email-message"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={sendEmailMutation.isPending}
              data-testid="button-cancel-email"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={sendEmailMutation.isPending || !subject.trim() || !message.trim()}
              data-testid="button-send-email"
            >
              {sendEmailMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Mail, MessageSquare, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type SendMethod = "email" | "sms" | "both";

interface SendHoldHarmlessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SendResponse {
  success: boolean;
  message: string;
  delivery: {
    email?: { ok: boolean; error?: string };
    sms?: { ok: boolean; error?: string };
  };
}

export function SendHoldHarmlessDialog({ open, onOpenChange }: SendHoldHarmlessDialogProps) {
  const { toast } = useToast();
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [sendMethod, setSendMethod] = useState<SendMethod>("email");

  useEffect(() => {
    if (!open) {
      setRecipientName("");
      setRecipientEmail("");
      setRecipientPhone("");
      setSendMethod("email");
    }
  }, [open]);

  const hasEmail = recipientEmail.trim().length > 0;
  const hasPhone = recipientPhone.trim().length > 0;

  const availableMethods = useMemo(() => {
    return {
      email: hasEmail,
      sms: hasPhone,
      both: hasEmail && hasPhone,
    };
  }, [hasEmail, hasPhone]);

  // Auto-correct method when fields change so user can't submit an impossible combo
  useEffect(() => {
    if (sendMethod === "email" && !hasEmail && hasPhone) {
      setSendMethod("sms");
    } else if (sendMethod === "sms" && !hasPhone && hasEmail) {
      setSendMethod("email");
    } else if (sendMethod === "both" && !(hasEmail && hasPhone)) {
      setSendMethod(hasEmail ? "email" : hasPhone ? "sms" : "email");
    }
  }, [hasEmail, hasPhone, sendMethod]);

  const mutation = useMutation<SendResponse, Error, void>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/hold-harmless/send-adhoc", {
        recipientName: recipientName.trim(),
        recipientEmail: recipientEmail.trim() || undefined,
        recipientPhone: recipientPhone.trim() || undefined,
        sendMethod,
      });
      return (await res.json()) as SendResponse;
    },
    onSuccess: (data) => {
      const partial = (data.delivery.email && !data.delivery.email.ok) || (data.delivery.sms && !data.delivery.sms.ok);
      toast({
        title: partial ? "Sent (partial delivery)" : "Hold Harmless sent",
        description: data.message,
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Could not send",
        description: error?.message || "Failed to send the Hold Harmless agreement",
        variant: "destructive",
      });
    },
  });

  const canSubmit = recipientName.trim().length > 0 && (hasEmail || hasPhone) && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-send-hold-harmless">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Send Hold Harmless
          </DialogTitle>
          <DialogDescription>
            Email or text the Hold Harmless agreement to anyone — for example, community-service workers or walk-in volunteers. They'll receive a secure link valid for 14 days.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="hh-name">Recipient name</Label>
            <Input
              id="hh-name"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Jane Doe"
              autoComplete="off"
              data-testid="input-hh-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hh-email">Email address</Label>
            <Input
              id="hh-email"
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="jane@example.com"
              autoComplete="off"
              data-testid="input-hh-email"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hh-phone">Mobile phone</Label>
            <Input
              id="hh-phone"
              type="tel"
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value)}
              placeholder="555-123-4567"
              autoComplete="off"
              data-testid="input-hh-phone"
            />
            <p className="text-xs text-muted-foreground">Include at least one — email, phone, or both.</p>
          </div>

          <div className="space-y-2">
            <Label>Send via</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant={sendMethod === "email" ? "default" : "outline"}
                size="sm"
                disabled={!availableMethods.email}
                onClick={() => setSendMethod("email")}
                data-testid="button-method-email"
              >
                <Mail className="h-4 w-4 mr-1" />
                Email
              </Button>
              <Button
                type="button"
                variant={sendMethod === "sms" ? "default" : "outline"}
                size="sm"
                disabled={!availableMethods.sms}
                onClick={() => setSendMethod("sms")}
                data-testid="button-method-sms"
              >
                <MessageSquare className="h-4 w-4 mr-1" />
                SMS
              </Button>
              <Button
                type="button"
                variant={sendMethod === "both" ? "default" : "outline"}
                size="sm"
                disabled={!availableMethods.both}
                onClick={() => setSendMethod("both")}
                data-testid="button-method-both"
              >
                Both
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
            data-testid="button-hh-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
            data-testid="button-hh-send"
          >
            {mutation.isPending ? "Sending…" : "Send Agreement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

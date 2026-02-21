import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MessageSquare, Send, Loader2, Check, Copy, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ContactButtonProps {
  mode: "manual" | "automated";
  phoneNumber: string;
  recipientName?: string;
  messageBody?: string;
  label?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "icon";
  className?: string;
  onSendComplete?: (result: { success: boolean; error?: string }) => void;
  "data-testid"?: string;
}

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    return true;
  }
  return navigator.maxTouchPoints > 0 && /Macintosh/i.test(navigator.userAgent);
}

function buildSmsUri(phoneNumber: string, body?: string): string {
  const cleaned = phoneNumber.replace(/[^\d+]/g, "");
  const encodedBody = body ? encodeURIComponent(body) : "";
  return `sms:${cleaned}${encodedBody ? `?body=${encodedBody}` : ""}`;
}

export default function ContactButton({
  mode,
  phoneNumber,
  recipientName,
  messageBody,
  label,
  variant = "outline",
  size = "sm",
  className,
  onSendComplete,
  "data-testid": testId,
}: ContactButtonProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/notifications/send", {
        phoneNumber,
        message: messageBody || "",
        recipientName: recipientName || "",
      });
      return res;
    },
    onSuccess: (data: any) => {
      toast({ title: "Reminder sent", description: `Message sent to ${recipientName || phoneNumber}` });
      onSendComplete?.({ success: true });
    },
    onError: (error: any) => {
      const msg = error?.message || "Failed to send message";
      toast({ title: "Send failed", description: msg, variant: "destructive" });
      onSendComplete?.({ success: false, error: msg });
    },
  });

  const handleCopyNumber = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(phoneNumber);
      setCopied(true);
      toast({ title: "Phone number copied" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy number", variant: "destructive" });
    }
  }, [phoneNumber, toast]);

  const handleManualClick = useCallback(() => {
    if (isMobileDevice()) {
      window.location.href = buildSmsUri(phoneNumber, messageBody);
    } else {
      handleCopyNumber();
    }
  }, [phoneNumber, messageBody, handleCopyNumber]);

  const handleAutomatedClick = useCallback(() => {
    if (!phoneNumber) {
      toast({ title: "No phone number", description: "This contact has no phone number on file.", variant: "destructive" });
      return;
    }
    sendMutation.mutate();
  }, [phoneNumber, sendMutation, toast]);

  if (!phoneNumber) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size={size}
            variant="ghost"
            disabled
            className={className}
            data-testid={testId}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {size !== "icon" && <span className="ml-1.5">{label || "No Phone"}</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent>No phone number on file</TooltipContent>
      </Tooltip>
    );
  }

  if (mode === "manual") {
    if (isMobileDevice()) {
      return (
        <Button
          size={size}
          variant={variant}
          onClick={handleManualClick}
          className={className}
          data-testid={testId}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {size !== "icon" && <span className="ml-1.5">{label || "Text"}</span>}
        </Button>
      );
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size={size}
            variant={variant}
            onClick={handleManualClick}
            className={className}
            data-testid={testId}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {size !== "icon" && (
              <span className="ml-1.5">{copied ? "Copied!" : label || "Copy Number"}</span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {copied ? "Copied to clipboard" : `Copy ${phoneNumber} to clipboard`}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      size={size}
      variant={variant}
      onClick={handleAutomatedClick}
      disabled={sendMutation.isPending}
      className={className}
      data-testid={testId}
    >
      {sendMutation.isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : sendMutation.isSuccess ? (
        <Check className="h-3.5 w-3.5" />
      ) : sendMutation.isError ? (
        <AlertCircle className="h-3.5 w-3.5" />
      ) : (
        <Send className="h-3.5 w-3.5" />
      )}
      {size !== "icon" && (
        <span className="ml-1.5">
          {sendMutation.isPending
            ? "Sending..."
            : sendMutation.isSuccess
              ? "Sent"
              : label || "Send Reminder"}
        </span>
      )}
    </Button>
  );
}

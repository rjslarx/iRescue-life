import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Candidate = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  roles: string[];
  source: string[];
  linkedToUser: boolean;
};

export function VolunteerIdentityVerificationDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string | null;
  applicantName?: string;
  onVerified: () => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const { toast } = useToast();
  useEffect(() => {
    if (props.open) setReason("");
  }, [props.open, props.applicationId]);
  const review = useQuery<{ candidate: Candidate | null }>({
    queryKey: [`/api/volunteer-applications/${props.applicationId}/identity-review`],
    enabled: props.open && !!props.applicationId,
  });
  const verify = useMutation({
    mutationFn: async () => {
      if (!props.applicationId || !review.data?.candidate) return;
      const response = await apiRequest("POST", `/api/volunteer-applications/${props.applicationId}/identity-review`, {
        contactId: review.data.candidate.id,
        reason: reason.trim(),
      });
      return response.json();
    },
    onSuccess: async () => {
      props.onOpenChange(false);
      await props.onVerified();
    },
    onError: (error: Error) => toast({ title: "Identity verification failed", description: error.message, variant: "destructive" }),
  });
  const candidate = review.data?.candidate;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Verify applicant identity</DialogTitle>
          <DialogDescription>
            Explicitly approve the unique existing contact for {props.applicantName || "this applicant"}. This action and reason are permanently audited.
          </DialogDescription>
        </DialogHeader>
        {review.isLoading ? (
          <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : candidate ? (
          <div className="space-y-4">
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div className="font-medium">{candidate.name}</div>
              <div>{candidate.email}</div>
              {candidate.phone && <div>{candidate.phone}</div>}
              <div className="text-muted-foreground">
                {candidate.source.join(", ") || "Unknown source"}{candidate.linkedToUser ? " · linked to a user" : ""}
              </div>
            </div>
            <Textarea
              value={reason}
              onChange={event => setReason(event.target.value)}
              maxLength={1000}
              placeholder="Why you verified this is the same person (10–1000 characters)"
              data-testid="input-volunteer-identity-review-reason"
            />
          </div>
        ) : (
          <div className="rounded-md border border-destructive/30 p-3 text-sm">
            No unique safe candidate is available. Resolve duplicate or mismatched contact data before retrying; free-form contact selection is not allowed.
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!candidate || reason.trim().length < 10 || verify.isPending}
            onClick={() => verify.mutate()}
            data-testid="button-confirm-volunteer-identity-review"
          >
            {verify.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verify and retry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Link } from "wouter";
import {
  AlertCircle,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Loader2,
  PawPrint,
  User,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface PendingComplianceConfirmation {
  id: string;
  animalId: string;
  careCategory: string;
  careName: string;
  dateAdministered: string;
  clinicName: string | null;
  notes: string | null;
  createdAt: string;
  adopterName: string | null;
  adopterEmail: string | null;
  animalName: string | null;
  fileUrl: string | null;
}

export default function PendingComplianceReviewsTab() {
  const { toast } = useToast();
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const {
    data: confirmations = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<PendingComplianceConfirmation[]>({
    queryKey: ["/api/tenant/pending-compliance-confirmations"],
  });

  const reviewMutation = useMutation({
    mutationFn: async ({
      confirmationId,
      action,
      notes,
    }: {
      confirmationId: string;
      action: "approve" | "reject";
      notes: string;
    }) => {
      const response = await apiRequest(
        "POST",
        `/api/compliance-confirmations/${confirmationId}/review`,
        {
          action,
          reviewNotes: notes.trim() || undefined,
        },
      );
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/pending-compliance-confirmations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/counts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/adopter-compliance"] });
      toast({
        title: variables.action === "approve" ? "Document approved" : "Document rejected",
        description:
          variables.action === "approve"
            ? "The adopter compliance record has been updated."
            : "The submission has been removed from the review queue.",
      });
      setReviewingId(null);
      setReviewNotes("");
    },
    onError: (error: Error) => {
      toast({
        title: "Review failed",
        description: error.message || "The document could not be reviewed.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading documents for review…</span>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <AlertCircle className="mx-auto mb-3 h-9 w-9 text-destructive" />
          <p className="font-medium">The review queue could not be loaded.</p>
          <Button className="mt-4" variant="outline" onClick={() => refetch()}>
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-orange-600" />
              Adopter Documents Awaiting Approval
            </CardTitle>
            <CardDescription>
              Review proof submitted by adopters before updating their compliance records.
            </CardDescription>
          </div>
          {confirmations.length > 0 && (
            <Badge variant="destructive" data-testid="badge-action-required-count">
              {confirmations.length} pending
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {confirmations.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground" data-testid="empty-pending-compliance-reviews">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-600" />
            <p className="font-medium text-foreground">All caught up</p>
            <p className="mt-1 text-sm">There are no adopter documents awaiting approval.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {confirmations.map((confirmation) => {
              const isReviewing = reviewingId === confirmation.id;
              const isSubmitting =
                reviewMutation.isPending && reviewMutation.variables?.confirmationId === confirmation.id;

              return (
                <div
                  key={confirmation.id}
                  className="rounded-lg border border-orange-300/60 bg-orange-50/60 p-4 dark:border-orange-900/70 dark:bg-orange-950/20"
                  data-testid={`pending-compliance-review-${confirmation.id}`}
                >
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">
                          {confirmation.animalName || "Animal"} — {confirmation.careName}
                        </h3>
                        <Badge variant="outline">{confirmation.careCategory}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />
                          {confirmation.adopterName || confirmation.adopterEmail || "Adopter"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          Given {format(parseISO(confirmation.dateAdministered), "MMM d, yyyy")}
                        </span>
                        {confirmation.clinicName && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" />
                            {confirmation.clinicName}
                          </span>
                        )}
                      </div>
                      {confirmation.notes && (
                        <p className="text-sm">
                          <span className="font-medium">Adopter notes:</span> {confirmation.notes}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Submitted {format(new Date(confirmation.createdAt), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                      <div className="flex flex-wrap gap-3 text-sm">
                        {confirmation.fileUrl ? (
                          <a
                            href={confirmation.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                            data-testid={`link-review-document-${confirmation.id}`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            View Document
                          </a>
                        ) : (
                          <span className="text-muted-foreground">No document attached</span>
                        )}
                        <Link
                          href={`/dashboard/animals/${confirmation.animalId}/medical`}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                          data-testid={`link-review-animal-${confirmation.id}`}
                        >
                          <PawPrint className="h-3.5 w-3.5" />
                          Open Animal Record
                        </Link>
                      </div>
                    </div>
                    {!isReviewing && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setReviewingId(confirmation.id);
                          setReviewNotes("");
                        }}
                        data-testid={`button-review-confirmation-${confirmation.id}`}
                      >
                        <ClipboardCheck className="mr-1 h-4 w-4" />
                        Review
                      </Button>
                    )}
                  </div>

                  {isReviewing && (
                    <div className="mt-4 space-y-3 border-t pt-4">
                      <Textarea
                        value={reviewNotes}
                        onChange={(event) => setReviewNotes(event.target.value)}
                        placeholder="Optional review notes…"
                        disabled={isSubmitting}
                        data-testid={`textarea-review-confirmation-${confirmation.id}`}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={isSubmitting}
                          onClick={() =>
                            reviewMutation.mutate({
                              confirmationId: confirmation.id,
                              action: "approve",
                              notes: reviewNotes,
                            })
                          }
                          data-testid={`button-approve-confirmation-${confirmation.id}`}
                        >
                          {isSubmitting && reviewMutation.variables?.action === "approve" ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="mr-1 h-4 w-4" />
                          )}
                          Approve & Update Record
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={isSubmitting}
                          onClick={() =>
                            reviewMutation.mutate({
                              confirmationId: confirmation.id,
                              action: "reject",
                              notes: reviewNotes,
                            })
                          }
                          data-testid={`button-reject-confirmation-${confirmation.id}`}
                        >
                          {isSubmitting && reviewMutation.variables?.action === "reject" ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <X className="mr-1 h-4 w-4" />
                          )}
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isSubmitting}
                          onClick={() => {
                            setReviewingId(null);
                            setReviewNotes("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
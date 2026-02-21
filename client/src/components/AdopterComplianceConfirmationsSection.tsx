import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  Check,
  X,
  Clock,
  User,
  Calendar,
  Loader2,
  ClipboardCheck,
  Building2,
  Pill,
} from "lucide-react";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Confirmation {
  id: string;
  userId: string;
  animalId: string;
  preventativeCareRecordId: string | null;
  careCategory: string;
  careName: string;
  dateAdministered: string;
  clinicName: string | null;
  notes: string | null;
  status: string;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  adopterName: string | null;
  adopterEmail: string | null;
}

interface MedicationLog {
  id: string;
  medicationName: string;
  confirmedAt: string;
  confirmedVia: string | null;
  adopterName: string | null;
  adopterEmail: string | null;
}

interface Props {
  animalId: string;
}

export function AdopterComplianceConfirmationsSection({ animalId }: Props) {
  const { toast } = useToast();
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const { data, isLoading } = useQuery<{ confirmations: Confirmation[] }>({
    queryKey: [`/api/animals/${animalId}/compliance-confirmations`],
  });

  const { data: medLogsData, isLoading: medLogsLoading } = useQuery<{ logs: MedicationLog[] }>({
    queryKey: [`/api/animals/${animalId}/medication-confirmation-logs`],
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ confirmationId, action, notes }: { confirmationId: string; action: string; notes: string }) => {
      const res = await apiRequest("POST", `/api/compliance-confirmations/${confirmationId}/review`, {
        action,
        reviewNotes: notes || undefined,
      });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/compliance-confirmations`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/preventative-care`] });
      toast({
        title: variables.action === "approve" ? "Confirmation approved" : "Confirmation rejected",
        description: variables.action === "approve"
          ? "The preventative care record has been updated."
          : "The adopter's confirmation was rejected.",
      });
      setReviewingId(null);
      setReviewNotes("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to review confirmation",
        variant: "destructive",
      });
    },
  });

  const confirmations = data?.confirmations || [];
  const pendingConfirmations = confirmations.filter((c) => c.status === "pending_review");
  const reviewedConfirmations = confirmations.filter((c) => c.status !== "pending_review");
  const medicationLogs = medLogsData?.logs || [];

  if (isLoading && medLogsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (confirmations.length === 0 && medicationLogs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 mt-6">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <ClipboardCheck className="w-5 h-5" />
        Adopter Compliance Confirmations
        {pendingConfirmations.length > 0 && (
          <Badge variant="destructive" data-testid="badge-pending-confirmations-count">
            {pendingConfirmations.length} pending
          </Badge>
        )}
      </h3>

      {pendingConfirmations.length > 0 && (
        <div className="space-y-3">
          {pendingConfirmations.map((confirmation) => (
            <Card
              key={confirmation.id}
              className="border-orange-500/30"
              data-testid={`card-pending-confirmation-${confirmation.id}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-orange-500" />
                      {confirmation.careName}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-4 flex-wrap">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {confirmation.adopterName || confirmation.adopterEmail || "Adopter"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Given: {format(new Date(confirmation.dateAdministered), "MMM d, yyyy")}
                      </span>
                      {confirmation.clinicName && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {confirmation.clinicName}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20">
                      <Clock className="w-3 h-3 mr-1" />
                      Pending Review
                    </Badge>
                    <Badge variant="outline">{confirmation.careCategory}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {confirmation.notes && (
                  <p className="text-sm text-muted-foreground mb-3">
                    <span className="font-medium">Adopter notes:</span> {confirmation.notes}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mb-3">
                  Submitted {format(new Date(confirmation.createdAt), "MMM d, yyyy 'at' h:mm a")}
                </p>

                {reviewingId === confirmation.id ? (
                  <div className="space-y-3">
                    <Textarea
                      placeholder="Optional review notes..."
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      className="text-sm"
                      data-testid={`textarea-review-notes-${confirmation.id}`}
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        onClick={() =>
                          reviewMutation.mutate({
                            confirmationId: confirmation.id,
                            action: "approve",
                            notes: reviewNotes,
                          })
                        }
                        disabled={reviewMutation.isPending}
                        data-testid={`button-confirm-approve-${confirmation.id}`}
                      >
                        {reviewMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4 mr-1" />
                        )}
                        Approve & Update Record
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          reviewMutation.mutate({
                            confirmationId: confirmation.id,
                            action: "reject",
                            notes: reviewNotes,
                          })
                        }
                        disabled={reviewMutation.isPending}
                        data-testid={`button-confirm-reject-${confirmation.id}`}
                      >
                        {reviewMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <X className="h-4 w-4 mr-1" />
                        )}
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setReviewingId(null);
                          setReviewNotes("");
                        }}
                        data-testid={`button-cancel-review-${confirmation.id}`}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => setReviewingId(confirmation.id)}
                      data-testid={`button-review-${confirmation.id}`}
                    >
                      <ClipboardCheck className="h-4 w-4 mr-1" />
                      Review
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {reviewedConfirmations.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Previously Reviewed</h4>
          {reviewedConfirmations.map((confirmation) => (
            <Card
              key={confirmation.id}
              className="opacity-75"
              data-testid={`card-reviewed-confirmation-${confirmation.id}`}
            >
              <CardHeader className="py-3">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div className="space-y-0.5">
                    <CardTitle className="text-sm">{confirmation.careName}</CardTitle>
                    <CardDescription className="text-xs flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {confirmation.adopterName || confirmation.adopterEmail || "Adopter"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(confirmation.dateAdministered), "MMM d, yyyy")}
                      </span>
                      {confirmation.clinicName && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {confirmation.clinicName}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {confirmation.status === "approved" ? (
                      <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20">
                        <Check className="w-3 h-3 mr-1" />
                        Approved
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <X className="w-3 h-3 mr-1" />
                        Rejected
                      </Badge>
                    )}
                  </div>
                </div>
                {confirmation.reviewNotes && (
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className="font-medium">Review notes:</span> {confirmation.reviewNotes}
                  </p>
                )}
                {confirmation.reviewedAt && (
                  <p className="text-xs text-muted-foreground">
                    Reviewed {format(new Date(confirmation.reviewedAt), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                )}
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {medicationLogs.length > 0 && (
        <div className="space-y-3 mt-6">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Pill className="w-5 h-5" />
            Medication Confirmation History
            <Badge variant="secondary">{medicationLogs.length}</Badge>
          </h3>
          <div className="space-y-2">
            {medicationLogs.map((log) => (
              <Card key={log.id} data-testid={`card-medication-log-${log.id}`}>
                <CardHeader className="py-3">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="space-y-0.5">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-500" />
                        {log.medicationName}
                      </CardTitle>
                      <CardDescription className="text-xs flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {log.adopterName || log.adopterEmail || "Adopter"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(log.confirmedAt), "MMM d, yyyy 'at' h:mm a")}
                        </span>
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20">
                      Confirmed via {log.confirmedVia || "app"}
                    </Badge>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

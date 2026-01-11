import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, Mail, Phone, MapPin, Calendar, CheckCircle, XCircle, FileText } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { VolunteerApplication } from "@shared/schema";

export default function VolunteerApplicationManagementPage() {
  const { toast } = useToast();
  const [selectedApplication, setSelectedApplication] = useState<VolunteerApplication | null>(null);
  const [notes, setNotes] = useState("");
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);

  const { data, isLoading } = useQuery<{ applications: VolunteerApplication[] }>({
    queryKey: ['/api/volunteer-applications'],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: 'approved' | 'rejected'; notes?: string }) => {
      return await apiRequest("PATCH", `/api/volunteer-applications/${id}`, { status, notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/volunteer-applications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      toast({
        title: "Application Updated",
        description: "The volunteer application status has been updated successfully.",
      });
      setReviewDialogOpen(false);
      setSelectedApplication(null);
      setNotes("");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update application status.",
      });
    },
  });

  const handleReview = (application: VolunteerApplication) => {
    setSelectedApplication(application);
    setNotes(application.notes || "");
    setReviewDialogOpen(true);
  };

  const handleApprove = () => {
    if (selectedApplication) {
      updateStatusMutation.mutate({
        id: selectedApplication.id,
        status: 'approved',
        notes: notes || undefined,
      });
    }
  };

  const handleReject = () => {
    if (selectedApplication) {
      updateStatusMutation.mutate({
        id: selectedApplication.id,
        status: 'rejected',
        notes: notes || undefined,
      });
    }
  };

  const applications = data?.applications || [];
  const pendingApplications = applications.filter(app => app.status === 'pending');
  const approvedApplications = applications.filter(app => app.status === 'approved');
  const rejectedApplications = applications.filter(app => app.status === 'rejected');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Approved</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout
      title="Volunteer Applications"
      description="Review and manage volunteer applications"
    >
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Loading applications...</p>
          </div>
        ) : (
          <>
            {/* Pending Applications */}
            {pendingApplications.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-yellow-600" />
                  <h2 className="text-xl font-semibold">Pending Applications ({pendingApplications.length})</h2>
                </div>
                <div className="grid gap-4">
                  {pendingApplications.map((application) => (
                    <Card key={application.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <CardTitle className="text-lg">{application.applicantName}</CardTitle>
                            <CardDescription>
                              Applied on {new Date(application.createdAt).toLocaleDateString()}
                            </CardDescription>
                          </div>
                          {getStatusBadge(application.status)}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-3">
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span>{application.applicantEmail}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span>{application.applicantPhone}</span>
                          </div>
                          {application.address && (
                            <div className="flex items-center gap-2 text-sm">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              <span>{application.address}</span>
                            </div>
                          )}
                        </div>

                        <div className="space-y-3 pt-2">
                          <div>
                            <h4 className="font-medium text-sm mb-1">Experience with Animals:</h4>
                            <p className="text-sm text-muted-foreground">{application.experience}</p>
                          </div>
                          <div>
                            <h4 className="font-medium text-sm mb-1">Availability:</h4>
                            <p className="text-sm text-muted-foreground">{application.availability}</p>
                          </div>
                          {application.interests && (
                            <div>
                              <h4 className="font-medium text-sm mb-1">Areas of Interest:</h4>
                              <p className="text-sm text-muted-foreground">{application.interests}</p>
                            </div>
                          )}
                          {application.skills && (
                            <div>
                              <h4 className="font-medium text-sm mb-1">Special Skills:</h4>
                              <p className="text-sm text-muted-foreground">{application.skills}</p>
                            </div>
                          )}
                          {(application.emergencyContactName || application.emergencyContactPhone) && (
                            <div>
                              <h4 className="font-medium text-sm mb-1">Emergency Contact:</h4>
                              <p className="text-sm text-muted-foreground">
                                {application.emergencyContactName} - {application.emergencyContactPhone}
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2 pt-4">
                          <Button
                            onClick={() => handleReview(application)}
                            size="sm"
                            data-testid={`button-review-${application.id}`}
                          >
                            <FileText className="w-4 h-4 mr-2" />
                            Review Application
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Approved Applications */}
            {approvedApplications.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <h2 className="text-xl font-semibold">Approved ({approvedApplications.length})</h2>
                </div>
                <div className="grid gap-4">
                  {approvedApplications.map((application) => (
                    <Card key={application.id} className="bg-green-50/50">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <CardTitle className="text-lg">{application.applicantName}</CardTitle>
                            <CardDescription>
                              {application.applicantEmail} • {application.applicantPhone}
                            </CardDescription>
                          </div>
                          {getStatusBadge(application.status)}
                        </div>
                      </CardHeader>
                      {application.notes && (
                        <CardContent>
                          <div className="text-sm">
                            <strong>Notes:</strong> {application.notes}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Rejected Applications */}
            {rejectedApplications.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <h2 className="text-xl font-semibold">Rejected ({rejectedApplications.length})</h2>
                </div>
                <div className="grid gap-4">
                  {rejectedApplications.map((application) => (
                    <Card key={application.id} className="bg-red-50/50">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <CardTitle className="text-lg">{application.applicantName}</CardTitle>
                            <CardDescription>
                              {application.applicantEmail} • {application.applicantPhone}
                            </CardDescription>
                          </div>
                          {getStatusBadge(application.status)}
                        </div>
                      </CardHeader>
                      {application.notes && (
                        <CardContent>
                          <div className="text-sm">
                            <strong>Notes:</strong> {application.notes}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {applications.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center h-64">
                  <Users className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No volunteer applications yet</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Applications will appear here once people submit the volunteer form
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Volunteer Application</DialogTitle>
            <DialogDescription>
              Review the application and approve or reject the applicant
            </DialogDescription>
          </DialogHeader>

          {selectedApplication && (
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="font-semibold text-lg">{selectedApplication.applicantName}</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedApplication.applicantEmail}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedApplication.applicantPhone}</span>
                  </div>
                  {selectedApplication.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedApplication.address}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>Applied {new Date(selectedApplication.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <h4 className="font-medium mb-1">Experience with Animals:</h4>
                  <p className="text-sm text-muted-foreground">{selectedApplication.experience}</p>
                </div>
                <div>
                  <h4 className="font-medium mb-1">Availability:</h4>
                  <p className="text-sm text-muted-foreground">{selectedApplication.availability}</p>
                </div>
                {selectedApplication.interests && (
                  <div>
                    <h4 className="font-medium mb-1">Areas of Interest:</h4>
                    <p className="text-sm text-muted-foreground">{selectedApplication.interests}</p>
                  </div>
                )}
                {selectedApplication.skills && (
                  <div>
                    <h4 className="font-medium mb-1">Special Skills:</h4>
                    <p className="text-sm text-muted-foreground">{selectedApplication.skills}</p>
                  </div>
                )}
                {(selectedApplication.emergencyContactName || selectedApplication.emergencyContactPhone) && (
                  <div>
                    <h4 className="font-medium mb-1">Emergency Contact:</h4>
                    <p className="text-sm text-muted-foreground">
                      {selectedApplication.emergencyContactName} - {selectedApplication.emergencyContactPhone}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Notes (optional)</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about this application..."
                  rows={3}
                  data-testid="textarea-notes"
                />
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  variant="outline"
                  onClick={() => setReviewDialogOpen(false)}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={updateStatusMutation.isPending}
                  data-testid="button-reject"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={updateStatusMutation.isPending}
                  data-testid="button-approve"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approve
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import VolunteerKanbanBoard from "@/components/VolunteerKanbanBoard";
import { ViewApplicationDialog } from "@/components/ViewApplicationDialog";
import { MoveAndSendVolunteerWaiverDialog } from "@/components/MoveAndSendVolunteerWaiverDialog";
import { useAuth } from "@/contexts/AuthContext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users, UserCheck, Search, XCircle, RotateCcw, Mail, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { VolunteerApplication } from "@shared/schema";
import DashboardLayout from "@/components/DashboardLayout";

type WaiverSendMethod = "email" | "sms" | "both";

interface ResendTarget {
  id: string;
  applicantName: string;
  applicantEmail: string | null;
  applicantPhone: string | null;
}

export default function VolunteerApplicationsPipelinePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sendingWaiverId, setSendingWaiverId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pipeline" | "active_pool" | "rejected">("pipeline");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewApplicationId, setViewApplicationId] = useState<string | null>(null);
  const [waiverDialogOpen, setWaiverDialogOpen] = useState(false);
  const [applicationForWaiver, setApplicationForWaiver] = useState<{
    id: string;
    applicantName: string;
    applicantEmail: string;
    applicantPhone?: string;
  } | null>(null);
  const [resendPickerTarget, setResendPickerTarget] = useState<ResendTarget | null>(null);

  const { data, isLoading } = useQuery<{ applications: VolunteerApplication[] }>({
    queryKey: ['/api/volunteer-applications'],
  });

  const updatePipelineStatusMutation = useMutation({
    mutationFn: async ({ id, pipelineStatus }: { id: string; pipelineStatus: string }) => {
      const response = await apiRequest('PATCH', `/api/volunteer-applications/${id}`, { pipelineStatus });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/volunteer-applications'] });
      toast({
        title: "Application updated",
        description: "The volunteer application status has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update application",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const sendWaiverMutation = useMutation({
    mutationFn: async ({ id, sendMethod }: { id: string; sendMethod: WaiverSendMethod }) => {
      setSendingWaiverId(id);
      const response = await apiRequest('POST', `/api/volunteer-applications/${id}/send-waiver`, {
        sendMethod,
      });
      return response.json() as Promise<{ message?: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/volunteer-applications'] });
      toast({
        title: "Waiver sent",
        description: data?.message || "The volunteer has been sent a link to sign the Hold Harmless form.",
      });
      setSendingWaiverId(null);
      setResendPickerTarget(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send waiver",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
      setSendingWaiverId(null);
    },
  });

  const applications = data?.applications || [];

  const kanbanApplications = useMemo(() => {
    return applications
      .filter(app => app.pipelineStatus !== 'rejected')
      .map(app => ({
        id: app.id,
        applicantName: app.applicantName,
        applicantEmail: app.applicantEmail,
        applicantPhone: app.applicantPhone,
        pipelineStatus: app.pipelineStatus || 'new_applicant',
        availability: app.availability,
        interests: app.interests,
        skills: app.skills,
        holdHarmlessFormId: app.holdHarmlessFormId,
        holdHarmlessSignedAt: app.holdHarmlessSignedAt?.toString(),
      }));
  }, [applications]);

  const activePoolVolunteers = useMemo(() => {
    return applications
      .filter(app => app.pipelineStatus === 'active_pool')
      .filter(app => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
          app.applicantName.toLowerCase().includes(q) ||
          app.applicantEmail.toLowerCase().includes(q) ||
          (app.interests?.toLowerCase() || '').includes(q) ||
          (app.skills?.toLowerCase() || '').includes(q)
        );
      });
  }, [applications, searchQuery]);

  const rejectedVolunteers = useMemo(() => {
    return applications.filter(app => app.pipelineStatus === 'rejected');
  }, [applications]);

  const handleMoveApplication = (applicationId: string, newStatus: string) => {
    if (newStatus === 'waiver_needed') {
      const application = applications.find(a => a.id === applicationId);
      if (application) {
        setApplicationForWaiver({
          id: application.id,
          applicantName: application.applicantName,
          applicantEmail: application.applicantEmail,
          applicantPhone: application.applicantPhone || undefined,
        });
        setWaiverDialogOpen(true);
        return;
      }
    }
    updatePipelineStatusMutation.mutate({ id: applicationId, pipelineStatus: newStatus });
  };

  const handleSendWaiver = (application: { id: string; applicantName: string; applicantEmail: string | null; applicantPhone?: string | null }) => {
    const hasEmail = !!application.applicantEmail && application.applicantEmail.trim().length > 0;
    const hasPhone = !!application.applicantPhone && application.applicantPhone.trim().length > 0;

    if (!hasEmail && !hasPhone) {
      toast({
        title: "No contact info",
        description: "This applicant has no email or phone on file.",
        variant: "destructive",
      });
      return;
    }

    if (hasEmail && hasPhone) {
      // Let the user choose Email / SMS / Both
      setResendPickerTarget({
        id: application.id,
        applicantName: application.applicantName,
        applicantEmail: application.applicantEmail,
        applicantPhone: application.applicantPhone || null,
      });
      return;
    }

    // Single channel — send immediately
    sendWaiverMutation.mutate({
      id: application.id,
      sendMethod: hasEmail ? "email" : "sms",
    });
  };

  const handleViewApplication = (application: { id: string; applicantName: string; applicantEmail: string; applicantPhone: string; pipelineStatus: string }) => {
    setViewApplicationId(application.id);
    setViewDialogOpen(true);
  };

  const applicationToView = useMemo(() => {
    if (!viewApplicationId || !applications.length) return null;
    const app = applications.find(a => a.id === viewApplicationId);
    if (!app) return null;
    return {
      ...app,
      pipelineStatus: app.pipelineStatus || 'new_applicant',
      createdAt: app.createdAt?.toString(),
      formResponses: app.customResponses,
    };
  }, [viewApplicationId, applications]);

  if (isLoading) {
    return (
      <DashboardLayout
        title="Volunteer Pipeline"
        description="Manage volunteer applications through the approval process"
      >
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  const pipelineCount = applications.filter(a => a.pipelineStatus !== 'active_pool' && a.pipelineStatus !== 'rejected').length;
  const activeCount = applications.filter(a => a.pipelineStatus === 'active_pool').length;
  const rejectedCount = applications.filter(a => a.pipelineStatus === 'rejected').length;

  return (
    <DashboardLayout
      title="Volunteer Pipeline"
      description="Manage volunteer applications through the approval process"
    >
      <div className="flex-1 overflow-auto p-6 min-w-0">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "pipeline" | "active_pool" | "rejected")}>
          <div className="w-full overflow-x-auto mb-6">
            <TabsList className="w-max">
              <TabsTrigger value="pipeline" className="gap-2" data-testid="tab-pipeline">
                <Users className="h-4 w-4" />
                Pipeline
                <Badge variant="secondary">{pipelineCount}</Badge>
              </TabsTrigger>
              <TabsTrigger value="active_pool" className="gap-2" data-testid="tab-active-pool">
                <UserCheck className="h-4 w-4" />
                Active Pool
                <Badge variant="secondary">{activeCount}</Badge>
              </TabsTrigger>
              <TabsTrigger value="rejected" className="gap-2" data-testid="tab-rejected">
                <XCircle className="h-4 w-4" />
                Rejected
                <Badge variant="secondary">{rejectedCount}</Badge>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="pipeline" className="mt-0">
            <VolunteerKanbanBoard
              applications={kanbanApplications}
              onMoveApplication={handleMoveApplication}
              onSendWaiver={handleSendWaiver}
              onViewApplication={handleViewApplication}
              sendingWaiverId={sendingWaiverId}
            />
          </TabsContent>

          <TabsContent value="active_pool" className="mt-0">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search volunteers by name, email, skills..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-volunteers"
                  />
                </div>
              </div>

              {activePoolVolunteers.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <UserCheck className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground text-center">
                      {searchQuery ? "No volunteers match your search" : "No active volunteers yet"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Move volunteers through the pipeline to add them to the active pool
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 min-w-0">
                  {activePoolVolunteers.map((volunteer) => (
                    <Card key={volunteer.id} className="min-w-0 overflow-hidden" data-testid={`card-active-volunteer-${volunteer.id}`}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center justify-between gap-2 min-w-0">
                          <span className="truncate">{volunteer.applicantName}</span>
                          {volunteer.holdHarmlessSignedAt && (
                            <Badge variant="default" className="text-xs shrink-0">Waiver Signed</Badge>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 min-w-0">
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p className="truncate">{volunteer.applicantEmail}</p>
                          <p className="truncate">{volunteer.applicantPhone}</p>
                        </div>
                        {volunteer.availability && (
                          <div className="text-sm line-clamp-2">
                            <span className="font-medium">Availability:</span> {volunteer.availability}
                          </div>
                        )}
                        {(volunteer.interests || volunteer.skills) && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {volunteer.interests?.split(',').slice(0, 2).map(interest => (
                              <Badge key={interest.trim()} variant="outline" className="text-xs">
                                {interest.trim()}
                              </Badge>
                            ))}
                            {volunteer.skills?.split(',').slice(0, 2).map(skill => (
                              <Badge key={skill.trim()} variant="secondary" className="text-xs">
                                {skill.trim()}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="rejected" className="mt-0">
            {rejectedVolunteers.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <XCircle className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">No rejected applications</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Applicants moved to Rejected from the pipeline will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 min-w-0">
                {rejectedVolunteers.map((volunteer) => (
                  <Card key={volunteer.id} className="min-w-0 overflow-hidden" data-testid={`card-rejected-volunteer-${volunteer.id}`}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center justify-between gap-2 min-w-0">
                        <span className="truncate">{volunteer.applicantName}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 min-w-0">
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p className="truncate">{volunteer.applicantEmail}</p>
                        {volunteer.applicantPhone && (
                          <p className="truncate">{volunteer.applicantPhone}</p>
                        )}
                      </div>
                      {volunteer.availability && (
                        <div className="text-sm line-clamp-2">
                          <span className="font-medium">Availability:</span> {volunteer.availability}
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-2 border-t">
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => handleViewApplication({
                            id: volunteer.id,
                            applicantName: volunteer.applicantName,
                            applicantEmail: volunteer.applicantEmail,
                            applicantPhone: volunteer.applicantPhone || '',
                            pipelineStatus: volunteer.pipelineStatus || 'rejected',
                          })}
                          data-testid={`button-view-rejected-volunteer-${volunteer.id}`}
                          title="View application"
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 gap-2 text-sm"
                          onClick={() => handleMoveApplication(volunteer.id, 'new_applicant')}
                          disabled={updatePipelineStatusMutation.isPending}
                          data-testid={`button-restore-volunteer-${volunteer.id}`}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restore to Pipeline
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ViewApplicationDialog
        application={applicationToView}
        applicationType="volunteer"
        open={viewDialogOpen}
        onOpenChange={(open) => {
          setViewDialogOpen(open);
          if (!open) {
            setViewApplicationId(null);
          }
        }}
      />

      <MoveAndSendVolunteerWaiverDialog
        open={waiverDialogOpen}
        onOpenChange={(open) => {
          setWaiverDialogOpen(open);
          if (!open) {
            setApplicationForWaiver(null);
          }
        }}
        application={applicationForWaiver}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/volunteer-applications'] });
        }}
      />

      <Dialog
        open={!!resendPickerTarget}
        onOpenChange={(open) => {
          if (!open && !sendWaiverMutation.isPending) {
            setResendPickerTarget(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm" data-testid="dialog-resend-waiver-method">
          <DialogHeader>
            <DialogTitle>Send Hold Harmless waiver</DialogTitle>
            <DialogDescription>
              {resendPickerTarget && (
                <>How should we send the waiver to <strong>{resendPickerTarget.applicantName}</strong>?</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2 py-2">
            <Button
              variant="outline"
              onClick={() => resendPickerTarget && sendWaiverMutation.mutate({ id: resendPickerTarget.id, sendMethod: "email" })}
              disabled={sendWaiverMutation.isPending}
              data-testid="button-resend-method-email"
            >
              <Mail className="h-4 w-4 mr-2" />
              Email only
            </Button>
            <Button
              variant="outline"
              onClick={() => resendPickerTarget && sendWaiverMutation.mutate({ id: resendPickerTarget.id, sendMethod: "sms" })}
              disabled={sendWaiverMutation.isPending}
              data-testid="button-resend-method-sms"
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              SMS only
            </Button>
            <Button
              onClick={() => resendPickerTarget && sendWaiverMutation.mutate({ id: resendPickerTarget.id, sendMethod: "both" })}
              disabled={sendWaiverMutation.isPending}
              data-testid="button-resend-method-both"
            >
              {sendWaiverMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Both Email and SMS
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setResendPickerTarget(null)}
              disabled={sendWaiverMutation.isPending}
              data-testid="button-resend-method-cancel"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import VolunteerKanbanBoard from "@/components/VolunteerKanbanBoard";
import { ViewApplicationDialog } from "@/components/ViewApplicationDialog";
import { useAuth } from "@/contexts/AuthContext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users, Filter, UserCheck, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import type { VolunteerApplication } from "@shared/schema";
import DashboardLayout from "@/components/DashboardLayout";

export default function VolunteerApplicationsPipelinePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sendingWaiverId, setSendingWaiverId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pipeline" | "active_pool">("pipeline");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewApplicationId, setViewApplicationId] = useState<string | null>(null);

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
    mutationFn: async (application: { id: string; applicantName: string; applicantEmail: string }) => {
      setSendingWaiverId(application.id);
      const response = await apiRequest('POST', `/api/volunteer-applications/${application.id}/send-waiver`, {
        applicantEmail: application.applicantEmail,
        applicantName: application.applicantName,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/volunteer-applications'] });
      toast({
        title: "Waiver sent",
        description: "The volunteer has been sent a link to sign the Hold Harmless form.",
      });
      setSendingWaiverId(null);
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
    return applications.map(app => ({
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

  const handleMoveApplication = (applicationId: string, newStatus: string) => {
    updatePipelineStatusMutation.mutate({ id: applicationId, pipelineStatus: newStatus });
  };

  const handleSendWaiver = (application: { id: string; applicantName: string; applicantEmail: string }) => {
    sendWaiverMutation.mutate(application);
  };

  const handleViewApplication = (application: { id: string; applicantName: string; applicantEmail: string; applicantPhone: string; pipelineStatus: string }) => {
    setViewApplicationId(application.id);
    setViewDialogOpen(true);
  };

  // Derive application data from fresh query data each render (prevents stale dropdown)
  const applicationToView = useMemo(() => {
    if (!viewApplicationId || !applications.length) return null;
    const app = applications.find(a => a.id === viewApplicationId);
    if (!app) return null;
    return {
      id: app.id,
      applicantName: app.applicantName,
      applicantEmail: app.applicantEmail,
      applicantPhone: app.applicantPhone,
      pipelineStatus: app.pipelineStatus || 'new_applicant',
      createdAt: app.createdAt?.toString(),
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

  return (
    <DashboardLayout
      title="Volunteer Pipeline"
      description="Manage volunteer applications through the approval process"
    >
      <div className="flex-1 overflow-auto p-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "pipeline" | "active_pool")}>
          <TabsList className="mb-6">
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
          </TabsList>

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
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {activePoolVolunteers.map((volunteer) => (
                    <Card key={volunteer.id} data-testid={`card-active-volunteer-${volunteer.id}`}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center justify-between gap-2">
                          {volunteer.applicantName}
                          {volunteer.holdHarmlessSignedAt && (
                            <Badge variant="default" className="text-xs">Waiver Signed</Badge>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p>{volunteer.applicantEmail}</p>
                          <p>{volunteer.applicantPhone}</p>
                        </div>
                        {volunteer.availability && (
                          <div className="text-sm">
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
        </Tabs>
      </div>

      {/* View Application Dialog */}
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
    </DashboardLayout>
  );
}

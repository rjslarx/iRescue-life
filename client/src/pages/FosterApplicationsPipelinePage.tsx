import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import FosterKanbanBoard from "@/components/FosterKanbanBoard";
import { ViewApplicationDialog } from "@/components/ViewApplicationDialog";
import { useAuth } from "@/contexts/AuthContext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users, Filter, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FosterApplication, FosterAgreementSession } from "@shared/schema";
import DashboardLayout from "@/components/DashboardLayout";

interface SendAgreementDialogData {
  applicationId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
}

interface ViewApplicationData {
  id: string;
  applicantName: string;
  email: string;
  phone: string;
  stage: string;
  createdAt?: string;
}

export default function FosterApplicationsPipelinePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sendingAgreementId, setSendingAgreementId] = useState<string | null>(null);
  const [downloadingAgreementId, setDownloadingAgreementId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pipeline" | "active_pool">("pipeline");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [applicationToView, setApplicationToView] = useState<ViewApplicationData | null>(null);
  const [filters, setFilters] = useState({
    hasFencedYard: false,
    acceptsLargeDogs: false,
    acceptsCats: false,
    acceptsPuppies: false,
    acceptsSeniors: false,
    acceptsMedicalNeeds: false,
  });

  const { data, isLoading } = useQuery<{ applications: FosterApplication[] }>({
    queryKey: ['/api/foster-applications'],
  });

  const { data: agreementSessionsData } = useQuery<{ sessions: FosterAgreementSession[] }>({
    queryKey: ['/api/foster-agreements/sessions'],
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest('PATCH', `/api/foster-applications/${id}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/foster-applications'] });
      toast({
        title: "Application updated",
        description: "The foster application status has been updated successfully.",
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

  const sendAgreementMutation = useMutation({
    mutationFn: async (application: { id: string; applicantName: string; applicantEmail: string }) => {
      setSendingAgreementId(application.id);
      const response = await apiRequest('POST', '/api/foster-agreements/sessions', {
        fosterApplicationId: application.id,
        fosterName: application.applicantName,
        fosterEmail: application.applicantEmail,
      });
      const sessionData = await response.json();
      
      const sendResponse = await apiRequest('POST', `/api/foster-agreements/sessions/${sessionData.session.id}/send-link`, {
        fosterEmail: application.applicantEmail,
        fosterName: application.applicantName,
      });
      return sendResponse.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/foster-agreements/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/foster-applications'] });
      toast({
        title: "Foster agreement sent",
        description: "The foster has been sent a link to sign the foster care agreement.",
      });
      setSendingAgreementId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send agreement",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
      setSendingAgreementId(null);
    },
  });

  const downloadAgreementMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      setDownloadingAgreementId(sessionId);
      const response = await apiRequest('GET', `/api/foster-agreements/sessions/${sessionId}/download`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.downloadUrl) {
        window.open(data.downloadUrl, '_blank');
        toast({
          title: "Download started",
          description: "The signed foster agreement is being downloaded.",
        });
      }
      setDownloadingAgreementId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to download agreement",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
      setDownloadingAgreementId(null);
    },
  });

  const agreementSessionsByAppId = useMemo(() => {
    const map = new Map<string, { status: string; sessionId?: string; expiresAt?: string }>();
    const sessions = agreementSessionsData?.sessions || [];
    sessions.forEach(session => {
      if (session.fosterApplicationId) {
        const existing = map.get(session.fosterApplicationId);
        if (!existing) {
          map.set(session.fosterApplicationId, {
            status: session.status,
            sessionId: session.id,
            expiresAt: session.expiresAt?.toString(),
          });
        }
      }
    });
    return map;
  }, [agreementSessionsData]);

  // Valid foster pipeline stages - unrecognized statuses default to 'new_app' to prevent vanishing
  const validFosterStages = ['new_app', 'interview', 'home_check', 'orientation', 'agreement', 'active_pool', 'rejected'];
  
  const applications = (data?.applications || []).map(app => {
    const agreementStatus = agreementSessionsByAppId.get(app.id);
    // Use pipelineStatus for proper pipeline stage, falling back to status for backwards compatibility
    let pipelineStage = app.pipelineStatus || (app.status === 'pending' ? 'new_app' : app.status === 'approved' ? 'active_pool' : app.status);
    // Fallback unrecognized statuses to 'new_app' so they don't disappear
    if (!validFosterStages.includes(pipelineStage)) {
      pipelineStage = 'new_app';
    }
    return {
      id: app.id,
      applicantName: app.applicantName,
      email: app.applicantEmail,
      phone: app.applicantPhone,
      stage: pipelineStage,
      hasYard: app.hasYard,
      hasFencedYard: (app as any).hasFencedYard,
      acceptsLargeDogs: (app as any).acceptsLargeDogs,
      acceptsCats: (app as any).acceptsCats,
      acceptsPuppies: (app as any).acceptsPuppies,
      acceptsSeniors: (app as any).acceptsSeniors,
      acceptsMedicalNeeds: (app as any).acceptsMedicalNeeds,
      maxAnimals: (app as any).maxAnimals,
      agreementStatus: agreementStatus || null,
    };
  });

  const normalizeStage = (status: string): string => {
    switch (status) {
      case 'pending':
        return 'new_app';
      case 'approved':
        return 'active_pool';
      default:
        return status;
    }
  };

  const activePoolApplications = applications.filter(app => normalizeStage(app.stage) === 'active_pool');

  const filteredActivePool = useMemo(() => {
    let filtered = activePoolApplications;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(app => 
        app.applicantName.toLowerCase().includes(query) ||
        app.email.toLowerCase().includes(query) ||
        app.phone.includes(query)
      );
    }

    if (filters.hasFencedYard) {
      filtered = filtered.filter(app => app.hasFencedYard);
    }
    if (filters.acceptsLargeDogs) {
      filtered = filtered.filter(app => app.acceptsLargeDogs);
    }
    if (filters.acceptsCats) {
      filtered = filtered.filter(app => app.acceptsCats);
    }
    if (filters.acceptsPuppies) {
      filtered = filtered.filter(app => app.acceptsPuppies);
    }
    if (filters.acceptsSeniors) {
      filtered = filtered.filter(app => app.acceptsSeniors);
    }
    if (filters.acceptsMedicalNeeds) {
      filtered = filtered.filter(app => app.acceptsMedicalNeeds);
    }

    return filtered;
  }, [activePoolApplications, searchQuery, filters]);

  const handleMoveApplication = (applicationId: string, newStage: string) => {
    updateStageMutation.mutate({ id: applicationId, status: newStage });
  };

  const handleSendAgreement = (application: { id: string; applicantName: string; email: string }) => {
    sendAgreementMutation.mutate({
      id: application.id,
      applicantName: application.applicantName,
      applicantEmail: application.email,
    });
  };

  const handleDownloadAgreement = (sessionId: string) => {
    downloadAgreementMutation.mutate(sessionId);
  };

  const handleViewApplication = (application: { id: string; applicantName: string; email: string; phone: string; stage: string }) => {
    const fullApp = data?.applications.find(a => a.id === application.id);
    setApplicationToView({
      id: application.id,
      applicantName: application.applicantName,
      email: application.email,
      phone: application.phone,
      stage: application.stage,
      createdAt: fullApp?.createdAt?.toString(),
    });
    setViewDialogOpen(true);
  };

  const activeFiltersCount = Object.values(filters).filter(Boolean).length;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">Foster Pipeline</h1>
            <p className="text-muted-foreground">
              Manage foster applications from submission to active pool
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1" data-testid="badge-total-applications">
              <Users className="h-4 w-4" />
              {applications.length} Applications
            </Badge>
            <Badge variant="default" className="gap-1" data-testid="badge-active-fosters">
              <UserCheck className="h-4 w-4" />
              {activePoolApplications.length} Active Fosters
            </Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="pipeline" data-testid="tab-pipeline">
              Pipeline View
            </TabsTrigger>
            <TabsTrigger value="active_pool" data-testid="tab-active-pool">
              Active Foster Pool ({activePoolApplications.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" className="mt-4">
            <FosterKanbanBoard
              applications={applications}
              onMoveApplication={handleMoveApplication}
              onSendAgreement={handleSendAgreement}
              onViewApplication={handleViewApplication}
              onDownloadAgreement={handleDownloadAgreement}
              sendingAgreementId={sendingAgreementId}
              downloadingAgreementId={downloadingAgreementId}
            />
          </TabsContent>

          <TabsContent value="active_pool" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <CardTitle className="flex items-center gap-2">
                    <UserCheck className="h-5 w-5" />
                    Active Foster Roster
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Search fosters..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-64"
                      data-testid="input-search-fosters"
                    />
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" data-testid="button-filter-fosters">
                          <Filter className="h-4 w-4 mr-2" />
                          Filters
                          {activeFiltersCount > 0 && (
                            <Badge variant="default" className="ml-2">{activeFiltersCount}</Badge>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64" align="end">
                        <div className="space-y-4">
                          <h4 className="font-medium">Filter by Preferences</h4>
                          <div className="space-y-2">
                            {[
                              { key: 'hasFencedYard', label: 'Has Fenced Yard' },
                              { key: 'acceptsLargeDogs', label: 'Accepts Large Dogs' },
                              { key: 'acceptsCats', label: 'Accepts Cats' },
                              { key: 'acceptsPuppies', label: 'Accepts Puppies' },
                              { key: 'acceptsSeniors', label: 'Accepts Seniors' },
                              { key: 'acceptsMedicalNeeds', label: 'Accepts Medical Needs' },
                            ].map(({ key, label }) => (
                              <div key={key} className="flex items-center space-x-2">
                                <Checkbox
                                  id={key}
                                  checked={filters[key as keyof typeof filters]}
                                  onCheckedChange={(checked) => 
                                    setFilters(prev => ({ ...prev, [key]: checked }))
                                  }
                                  data-testid={`checkbox-filter-${key}`}
                                />
                                <Label htmlFor={key} className="text-sm">{label}</Label>
                              </div>
                            ))}
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="w-full"
                            onClick={() => setFilters({
                              hasFencedYard: false,
                              acceptsLargeDogs: false,
                              acceptsCats: false,
                              acceptsPuppies: false,
                              acceptsSeniors: false,
                              acceptsMedicalNeeds: false,
                            })}
                            data-testid="button-clear-filters"
                          >
                            Clear All Filters
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredActivePool.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <UserCheck className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">No Active Fosters</h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      {activePoolApplications.length === 0 
                        ? "When foster applications complete the pipeline, they'll appear here."
                        : "No fosters match the current filters."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredActivePool.map((foster) => (
                      <Card key={foster.id} data-testid={`card-active-foster-${foster.id}`}>
                        <CardContent className="p-4">
                          <div className="space-y-2">
                            <h4 className="font-medium">{foster.applicantName}</h4>
                            <div className="text-sm text-muted-foreground space-y-1">
                              <p>{foster.email}</p>
                              <p>{foster.phone}</p>
                            </div>
                            <div className="flex flex-wrap gap-1 pt-2">
                              {foster.hasFencedYard && (
                                <Badge variant="outline" className="text-xs">Fenced Yard</Badge>
                              )}
                              {foster.acceptsLargeDogs && (
                                <Badge variant="outline" className="text-xs">Large Dogs</Badge>
                              )}
                              {foster.acceptsCats && (
                                <Badge variant="outline" className="text-xs">Cats OK</Badge>
                              )}
                              {foster.acceptsPuppies && (
                                <Badge variant="outline" className="text-xs">Puppies</Badge>
                              )}
                              {foster.acceptsSeniors && (
                                <Badge variant="outline" className="text-xs">Seniors</Badge>
                              )}
                              {foster.acceptsMedicalNeeds && (
                                <Badge variant="outline" className="text-xs">Medical Needs</Badge>
                              )}
                              {foster.maxAnimals && foster.maxAnimals > 1 && (
                                <Badge variant="secondary" className="text-xs">
                                  Up to {foster.maxAnimals} animals
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* View Application Dialog */}
      <ViewApplicationDialog
        application={applicationToView}
        applicationType="foster"
        open={viewDialogOpen}
        onOpenChange={(open) => {
          setViewDialogOpen(open);
          if (!open) {
            setApplicationToView(null);
          }
        }}
      />
    </DashboardLayout>
  );
}

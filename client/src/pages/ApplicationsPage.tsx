import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import KanbanBoard from "@/components/KanbanBoard";
import { AdoptionDialog } from "@/components/AdoptionDialog";
import { AssignFosterDialog } from "@/components/AssignFosterDialog";
import { FinalizeAdoptionDialog } from "@/components/FinalizeAdoptionDialog";
import { ApproveAndSendAgreementDialog } from "@/components/ApproveAndSendAgreementDialog";
import { ApplicationDetailsDialog } from "@/components/ApplicationDetailsDialog";
import type { PendingApplication } from "@/components/PendingApplicationsWidget";
import { useAuth } from "@/contexts/AuthContext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, DollarSign, Clock, X, CheckCircle, XCircle, AlertTriangle, RotateCcw, Users } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Application, ApplicationWithAnimal, Animal, Tenant, AdoptionCheckoutSession } from "@shared/schema";
import DashboardLayout from "@/components/DashboardLayout";

interface ApprovalApplicationData {
  id: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  animalId: string;
  animalName?: string;
}

export default function ApplicationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [adoptionDialogOpen, setAdoptionDialogOpen] = useState(false);
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [applicationToApprove, setApplicationToApprove] = useState<ApprovalApplicationData | null>(null);
  const [viewDetailsOpen, setViewDetailsOpen] = useState(false);
  const [applicationToView, setApplicationToView] = useState<PendingApplication | null>(null);
  const [activeTab, setActiveTab] = useState<"pipeline" | "adopted" | "denied" | "trial_failed">("pipeline");

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });
  const [fosterDialogOpen, setFosterDialogOpen] = useState(false);
  const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);

  const { data, isLoading } = useQuery<{ applications: ApplicationWithAnimal[] }>({
    queryKey: ['/api/applications'],
  });

  const { data: animalsData } = useQuery<{ animals: Animal[] }>({
    queryKey: ['/api/animals'],
  });

  const { data: checkoutSessionsData } = useQuery<{ sessions: AdoptionCheckoutSession[] }>({
    queryKey: ['/api/adoptions/checkouts'],
  });

  const [sendingContractId, setSendingContractId] = useState<string | null>(null);

  const checkoutSessionsByAppId = useMemo(() => {
    const map = new Map<string, { status: string; expiresAt?: string; sessionId?: string; baseFee?: string }>();
    (checkoutSessionsData?.sessions || []).forEach(session => {
      if (session.status !== 'completed' && session.status !== 'expired' && session.status !== 'cancelled') {
        if (!map.has(session.applicationId)) {
          map.set(session.applicationId, {
            status: session.status,
            expiresAt: session.expiresAt,
            sessionId: session.id,
            baseFee: session.baseFee,
          });
        }
      }
    });
    return map;
  }, [checkoutSessionsData]);

  const updateStageMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const response = await apiRequest('PATCH', `/api/applications/${id}/stage`, { stage });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/applications'] });
      toast({
        title: "Application updated",
        description: "The application stage has been updated successfully.",
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

  const animals = animalsData?.animals || [];
  const allApps = data?.applications || [];

  const terminalStages = ['adopted', 'denied', 'trial_failed'];

  const activeApplications = allApps.filter(app => !terminalStages.includes(app.stage));
  const adoptedApplications = allApps.filter(app => app.stage === 'adopted').sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const deniedApplications = allApps.filter(app => app.stage === 'denied').sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const trialFailedApplications = allApps.filter(app => app.stage === 'trial_failed').sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const applications = activeApplications.map(app => {
    const animal = animals.find(a => a.id === app.animalId);
    const checkoutStatus = checkoutSessionsByAppId.get(app.id);
    return {
      id: app.id,
      applicantName: app.applicantName,
      animalName: animal?.name || "Unknown Animal",
      email: app.applicantEmail,
      phone: app.applicantPhone,
      stage: app.stage,
      animalId: app.animalId,
      applicationType: "adoption" as const,
      checkoutStatus: checkoutStatus || null,
      adoptionFeeStatus: (app as any).adoptionFeeStatus || 'pending',
      adoptionFeeAmount: (app as any).adoptionFeeAmount,
    };
  });

  const handleStartCheckout = (applicationId: string, animalId: string, signerEmail: string, signerName: string) => {
    const animal = animalsData?.animals.find(a => a.id === animalId);
    if (animal) {
      setSelectedAnimal(animal);
      setFinalizeDialogOpen(true);
    } else {
      toast({
        title: "Animal not found",
        description: "Unable to load animal details for checkout.",
        variant: "destructive",
      });
    }
  };

  const handleMoveApplication = (applicationId: string, newStage: string) => {
    if (newStage === 'approved') {
      const fullApp = data?.applications.find(a => a.id === applicationId);
      if (fullApp) {
        const animal = animals.find(a => a.id === fullApp.animalId);
        setApplicationToApprove({
          id: fullApp.id,
          applicantName: fullApp.applicantName,
          applicantEmail: fullApp.applicantEmail,
          applicantPhone: fullApp.applicantPhone,
          animalId: fullApp.animalId,
          animalName: animal?.name || fullApp.animalName,
        });
        setApprovalDialogOpen(true);
        return;
      }
    }
    updateStageMutation.mutate({ id: applicationId, stage: newStage });
  };

  const handleViewApplication = (application: any) => {
    const fullApp = data?.applications.find(a => a.id === application.id);
    if (fullApp) {
      const appType = (fullApp.applicationType as 'adoption' | 'foster') || 'adoption';
      const pendingApp: PendingApplication = {
        id: fullApp.id,
        type: appType,
        applicantName: fullApp.applicantName,
        applicantEmail: fullApp.applicantEmail,
        applicantPhone: fullApp.applicantPhone,
        status: fullApp.stage,
        createdAt: fullApp.createdAt,
        animalName: fullApp.animalName || animals.find(a => a.id === fullApp.animalId)?.name,
        animalId: fullApp.animalId,
        formData: fullApp.customResponses as Record<string, any> | undefined,
      };
      setApplicationToView(pendingApp);
      setViewDetailsOpen(true);
    } else {
      toast({
        title: "Application not found",
        description: "Unable to load application details.",
        variant: "destructive",
      });
    }
  };

  const getStatusDisplay = (stage: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      new: { label: "New", variant: "default" },
      screening: { label: "Screening", variant: "secondary" },
      vet_check: { label: "Vet Check", variant: "secondary" },
      home_visit: { label: "Home Visit", variant: "secondary" },
      approved: { label: "Approved", variant: "default" },
      trial: { label: "Trial", variant: "secondary" },
      denied: { label: "Denied", variant: "destructive" },
      adopted: { label: "Adopted", variant: "default" },
      trial_failed: { label: "Trial Failed", variant: "destructive" },
    };
    return statusMap[stage] || { label: stage, variant: "outline" as const };
  };

  const getFeeStatusDisplay = (status: string, amount?: string | null) => {
    if (status === 'paid') {
      return { label: amount ? `$${parseFloat(amount).toFixed(0)} Paid` : "Fee Paid", variant: "default" as const, icon: DollarSign };
    }
    if (status === 'waived') {
      return { label: "Fee Waived", variant: "secondary" as const, icon: X };
    }
    return { label: "Fee Pending", variant: "outline" as const, icon: Clock };
  };

  const handleAssignAnimal = (application: any) => {
    const animal = animals.find(a => a.id === application.animalId);
    if (!animal) {
      toast({
        title: "Animal not found",
        description: "Unable to find the animal for this application.",
        variant: "destructive",
      });
      return;
    }

    const fullApplication = data?.applications.find(a => a.id === application.id);
    if (!fullApplication) return;

    setSelectedAnimal(animal);
    setSelectedApplication(fullApplication);
    setAdoptionDialogOpen(true);
  };

  const TerminalAppCard = ({ app, showFee = false }: { app: ApplicationWithAnimal; showFee?: boolean }) => {
    const statusDisplay = getStatusDisplay(app.stage);
    const submittedDate = new Date(app.createdAt).toLocaleDateString();
    const animalName = app.animalName || "Unknown Animal";
    const feeStatus = getFeeStatusDisplay((app as any).adoptionFeeStatus || 'pending', (app as any).adoptionFeeAmount);
    const FeeIcon = feeStatus.icon;

    return (
      <Card data-testid={`card-terminal-${app.id}`} className="hover-elevate">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base truncate">{app.applicantName}</CardTitle>
            <div className="flex flex-col gap-1 items-end shrink-0">
              <Badge variant={statusDisplay.variant} data-testid={`badge-status-${app.id}`}>
                {statusDisplay.label}
              </Badge>
              {showFee && (
                <Badge variant={feeStatus.variant} className="text-xs gap-1" data-testid={`badge-fee-${app.id}`}>
                  <FeeIcon className="h-3 w-3" />
                  {feeStatus.label}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Applied for:</p>
            {app.animalName ? (
              <Link href={`/dashboard/animals/${app.animalId}/medical`}>
                <span
                  className="text-sm font-medium hover:underline cursor-pointer"
                  data-testid={`link-animal-${app.id}`}
                >
                  {animalName}
                </span>
              </Link>
            ) : (
              <span className="text-sm text-muted-foreground">Unknown Animal</span>
            )}
          </div>
          <div className="space-y-0.5">
            <p className="text-sm text-muted-foreground">{app.applicantEmail}</p>
            <p className="text-sm text-muted-foreground">{app.applicantPhone}</p>
          </div>
          <div className="pt-2 border-t flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Submitted: {submittedDate}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs shrink-0"
              onClick={() => handleMoveApplication(app.id, 'new')}
              disabled={updateStageMutation.isPending}
              data-testid={`button-restore-application-${app.id}`}
            >
              <RotateCcw className="h-3 w-3" />
              Restore
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <DashboardLayout
      title="Application Workflow"
      description="Manage adoption applications through each stage"
    >
      <div className="flex-1 overflow-auto p-6 min-w-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-64" data-testid="loading-applications">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <div className="w-full overflow-x-auto mb-6">
              <TabsList className="w-max">
                <TabsTrigger value="pipeline" className="gap-2" data-testid="tab-pipeline">
                  <Users className="h-4 w-4" />
                  Pipeline
                  <Badge variant="secondary">{activeApplications.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="adopted" className="gap-2" data-testid="tab-adopted">
                  <CheckCircle className="h-4 w-4" />
                  Adopted
                  <Badge variant="secondary">{adoptedApplications.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="denied" className="gap-2" data-testid="tab-denied">
                  <XCircle className="h-4 w-4" />
                  Denied
                  <Badge variant="secondary">{deniedApplications.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="trial_failed" className="gap-2" data-testid="tab-trial-failed">
                  <AlertTriangle className="h-4 w-4" />
                  Trial Failed
                  <Badge variant="secondary">{trialFailedApplications.length}</Badge>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="pipeline" className="mt-0">
              <KanbanBoard
                applications={applications}
                onMoveApplication={handleMoveApplication}
                onAssignAnimal={handleAssignAnimal}
                onStartCheckout={handleStartCheckout}
                onViewApplication={handleViewApplication}
                sendingContractId={sendingContractId}
                subscriptionTier={tenantData?.tenant?.subscriptionTier}
              />
            </TabsContent>

            <TabsContent value="adopted" className="mt-0">
              {adoptedApplications.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <CheckCircle className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground text-center">No adopted applications yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Applications moved to Adopted will appear here
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {adoptedApplications.map(app => (
                    <TerminalAppCard key={app.id} app={app} showFee />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="denied" className="mt-0">
              {deniedApplications.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <XCircle className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground text-center">No denied applications</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Applications moved to Denied will appear here
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {deniedApplications.map(app => (
                    <TerminalAppCard key={app.id} app={app} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="trial_failed" className="mt-0">
              {trialFailedApplications.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground text-center">No failed trials</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Applications moved to Trial Failed will appear here
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {trialFailedApplications.map(app => (
                    <TerminalAppCard key={app.id} app={app} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <AdoptionDialog
        animal={selectedAnimal}
        open={adoptionDialogOpen}
        onOpenChange={(open) => {
          setAdoptionDialogOpen(open);
          if (!open) {
            setSelectedAnimal(null);
            setSelectedApplication(null);
          }
        }}
        pendingEdits={null}
        onSuccess={() => {
          setSelectedAnimal(null);
          setSelectedApplication(null);
        }}
        prefilledData={selectedApplication ? {
          adopterName: selectedApplication.applicantName,
          adopterEmail: selectedApplication.applicantEmail,
          adopterPhone: selectedApplication.applicantPhone,
          applicationId: selectedApplication.id,
        } : undefined}
      />

      <AssignFosterDialog
        animal={selectedAnimal}
        open={fosterDialogOpen}
        onOpenChange={(open) => {
          setFosterDialogOpen(open);
          if (!open) {
            setSelectedAnimal(null);
            setSelectedApplication(null);
          }
        }}
        pendingEdits={null}
        onSuccess={() => {
          setSelectedAnimal(null);
          setSelectedApplication(null);
        }}
      />

      {selectedAnimal && (
        <FinalizeAdoptionDialog
          open={finalizeDialogOpen}
          onOpenChange={(open) => {
            setFinalizeDialogOpen(open);
            if (!open) {
              setSelectedAnimal(null);
            }
          }}
          animal={selectedAnimal}
        />
      )}

      <ApproveAndSendAgreementDialog
        open={approvalDialogOpen}
        onOpenChange={(open) => {
          setApprovalDialogOpen(open);
          if (!open) {
            setApplicationToApprove(null);
          }
        }}
        application={applicationToApprove}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/applications'] });
          queryClient.invalidateQueries({ queryKey: ['/api/adoptions/checkouts'] });
        }}
      />

      <ApplicationDetailsDialog
        open={viewDetailsOpen}
        onOpenChange={(open) => {
          setViewDetailsOpen(open);
          if (!open) {
            setApplicationToView(null);
          }
        }}
        application={applicationToView}
      />
    </DashboardLayout>
  );
}

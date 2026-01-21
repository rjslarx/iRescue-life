import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import KanbanBoard from "@/components/KanbanBoard";
import { AdoptionDialog } from "@/components/AdoptionDialog";
import { AssignFosterDialog } from "@/components/AssignFosterDialog";
import { FinalizeAdoptionDialog } from "@/components/FinalizeAdoptionDialog";
import { ApproveAndSendAgreementDialog } from "@/components/ApproveAndSendAgreementDialog";
import { ViewApplicationDialog } from "@/components/ViewApplicationDialog";
import { useAuth } from "@/contexts/AuthContext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, History, DollarSign, Clock, X } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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

interface ViewApplicationData {
  id: string;
  applicantName: string;
  email: string;
  phone: string;
  stage: string;
  animalName?: string;
  createdAt?: string;
}

export default function ApplicationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [adoptionDialogOpen, setAdoptionDialogOpen] = useState(false);
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [applicationToApprove, setApplicationToApprove] = useState<ApprovalApplicationData | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [applicationToView, setApplicationToView] = useState<ViewApplicationData | null>(null);

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

  // Native e-signature flow using checkout sessions (replaces DocuSign)
  const startCheckoutMutation = useMutation({
    mutationFn: async ({ applicationId, animalId, signerEmail, signerName }: {
      applicationId: string;
      animalId: string;
      signerEmail: string;
      signerName: string;
    }) => {
      setSendingContractId(applicationId);
      // Get animal for adoption fee
      const animalData = animalsData?.animals.find(a => a.id === animalId);
      const baseFee = animalData?.adoptionFee || "0";
      
      // Create checkout session
      const createResponse = await apiRequest('POST', '/api/adoptions/checkouts', {
        applicationId,
        animalId,
        baseFee,
      });
      const sessionData = await createResponse.json();
      
      // Send checkout link to adopter
      const sendResponse = await apiRequest('POST', `/api/adoptions/checkouts/${sessionData.session.id}/send-link`, {
        signerEmail,
        signerName,
      });
      return sendResponse.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/adoptions/checkouts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/applications'] });
      toast({
        title: "Adoption checkout started",
        description: "The adopter has been sent a link to sign the contract and complete payment.",
      });
      setSendingContractId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to start checkout",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
      setSendingContractId(null);
    },
  });

  // Map checkout sessions by application ID, prioritizing completed sessions
  // to ensure adopted applications show correct "completed" status
  const checkoutSessionsByAppId = useMemo(() => {
    const map = new Map<string, { status: string; expiresAt?: string; sessionId?: string; baseFee?: string; feeStatus?: string; totalAmount?: string }>();
    const sessions = checkoutSessionsData?.sessions || [];
    
    // Sort sessions by updatedAt (oldest first), then by completed status (completed last)
    // This ensures the most recent session overwrites older ones, with completed taking priority
    const sortedSessions = [...sessions].sort((a, b) => {
      // First sort by completion status - completed should come last to overwrite
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;
      // Then sort by updatedAt so most recent session is processed last
      const aTime = new Date(a.updatedAt || a.createdAt).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt).getTime();
      return aTime - bTime;
    });
    
    sortedSessions.forEach(session => {
      // Skip expired and cancelled sessions
      if (session.status === 'expired' || session.status === 'cancelled') return;
      
      // Determine fee status from totals.total (accounts for grants/waivers)
      // waived = total is 0, paid = completed with non-zero total
      let feeStatus = 'pending';
      const totalAmount = session.totals?.total || session.baseFee;
      if (session.status === 'completed') {
        const totalNum = parseFloat(totalAmount || '0');
        feeStatus = totalNum === 0 ? 'waived' : 'paid';
      }
      
      map.set(session.applicationId, {
        status: session.status,
        expiresAt: session.expiresAt,
        sessionId: session.id,
        baseFee: session.baseFee,
        feeStatus,
        totalAmount,
      });
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

  // Separate applications into active and history
  // Only move denied/adopted applications to history after 7 days
  // Keep all other statuses in the active queue regardless of age
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const activeApplications: ApplicationWithAnimal[] = [];
  const historicalApplications: ApplicationWithAnimal[] = [];

  (data?.applications || []).forEach(app => {
    // Use updatedAt for archival timing - applications should stay visible for 7 days
    // after reaching terminal status (adopted/denied), not 7 days after creation
    const statusChangeDate = new Date(app.updatedAt || app.createdAt);
    const isTerminalStatus = app.stage === 'denied' || app.stage === 'adopted';
    const isOldEnough = statusChangeDate < sevenDaysAgo;
    
    // Only archive if it's denied/adopted AND more than 7 days since status change
    if (isTerminalStatus && isOldEnough) {
      historicalApplications.push(app);
    } else {
      activeApplications.push(app);
    }
  });

  // Sort historical applications by date (most recent first)
  historicalApplications.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Transform active applications to KanbanBoard format
  const applications = activeApplications.map(app => {
    const animal = animals.find(a => a.id === app.animalId);
    const checkoutSession = checkoutSessionsByAppId.get(app.id);
    
    // Derive fee status from checkout session - completed sessions have paid/waived status
    const adoptionFeeStatus = checkoutSession?.feeStatus || 'pending';
    const adoptionFeeAmount = checkoutSession?.totalAmount || checkoutSession?.baseFee;
    
    return {
      id: app.id,
      applicantName: app.applicantName,
      animalName: animal?.name || "Unknown Animal",
      email: app.applicantEmail,
      phone: app.applicantPhone,
      stage: app.stage,
      animalId: app.animalId,
      applicationType: "adoption" as const,
      checkoutStatus: checkoutSession || null,
      adoptionFeeStatus,
      adoptionFeeAmount,
    };
  });

  const handleStartCheckout = (applicationId: string, animalId: string, signerEmail: string, signerName: string) => {
    startCheckoutMutation.mutate({ applicationId, animalId, signerEmail, signerName });
  };

  const handleMoveApplication = (applicationId: string, newStage: string) => {
    // If moving to "approved", show the approval dialog with option to send contract
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
    
    // For other stage changes, just update the stage directly
    updateStageMutation.mutate({ id: applicationId, stage: newStage });
  };

  const getStatusDisplay = (stage: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      new: { label: "New", variant: "default" },
      screening: { label: "Screening", variant: "secondary" },
      vet_check: { label: "Vet Check", variant: "secondary" },
      home_visit: { label: "Home Visit", variant: "secondary" },
      approved: { label: "Approved", variant: "default" },
      denied: { label: "Denied", variant: "destructive" },
      adopted: { label: "Adopted", variant: "default" },
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

    // For now, all applications in the applications table are adoption applications
    // Foster applications are in a separate table
    setAdoptionDialogOpen(true);
  };

  const handleFeePendingClick = (application: any) => {
    // Open the approval dialog to set fee and send checkout link
    const fullApp = data?.applications.find(a => a.id === application.id);
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
    }
  };

  const handleViewApplication = (application: { id: string; applicantName: string; email: string; phone: string; stage: string; animalName?: string }) => {
    const fullApp = data?.applications.find(a => a.id === application.id);
    setApplicationToView({
      id: application.id,
      applicantName: application.applicantName,
      email: application.email,
      phone: application.phone,
      stage: application.stage,
      animalName: application.animalName,
      createdAt: fullApp?.createdAt?.toString(),
    });
    setViewDialogOpen(true);
  };

  return (
    <DashboardLayout
      title="Application Workflow"
      description="Manage adoption applications through each stage"
    >
      <div className="flex-1 overflow-auto p-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-64" data-testid="loading-applications">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <div className="space-y-6">
                <KanbanBoard 
                  applications={applications}
                  onMoveApplication={handleMoveApplication}
                  onAssignAnimal={handleAssignAnimal}
                  onStartCheckout={handleStartCheckout}
                  onFeePendingClick={handleFeePendingClick}
                  onViewApplication={handleViewApplication}
                  sendingContractId={sendingContractId}
                  subscriptionTier={tenantData?.tenant?.subscriptionTier}
                />

                {/* Application History Accordion */}
                {historicalApplications.length > 0 && (
                  <Accordion type="single" collapsible data-testid="accordion-application-history">
                    <AccordionItem value="history">
                      <AccordionTrigger className="hover:no-underline" data-testid="trigger-application-history">
                        <div className="flex items-center gap-2">
                          <History className="h-5 w-5" />
                          <span className="font-semibold">Application History</span>
                          <Badge variant="secondary" data-testid="badge-history-count">
                            {historicalApplications.length}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
                          {historicalApplications.map((app) => {
                            const statusDisplay = getStatusDisplay(app.stage);
                            const submittedDate = new Date(app.createdAt).toLocaleDateString();
                            const animalName = app.animalName || "Unknown Animal";
                            // Derive fee status from checkout session (consistent with active applications)
                            const checkoutSession = checkoutSessionsByAppId.get(app.id);
                            const adoptionFeeStatus = checkoutSession?.feeStatus || 'pending';
                            const adoptionFeeAmount = checkoutSession?.totalAmount || checkoutSession?.baseFee;
                            const feeStatus = getFeeStatusDisplay(adoptionFeeStatus, adoptionFeeAmount);
                            const FeeIcon = feeStatus.icon;

                            return (
                              <Card key={app.id} data-testid={`card-history-${app.id}`} className="hover-elevate">
                                <CardHeader className="pb-3">
                                  <div className="flex items-start justify-between gap-2">
                                    <CardTitle className="text-base">{app.applicantName}</CardTitle>
                                    <div className="flex flex-col gap-1 items-end">
                                      <Badge variant={statusDisplay.variant} data-testid={`badge-status-${app.id}`}>
                                        {statusDisplay.label}
                                      </Badge>
                                      {app.stage === 'adopted' && (
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
                                          className="text-sm font-medium hover:underline cursor-pointer text-primary"
                                          data-testid={`link-animal-${app.id}`}
                                        >
                                          {animalName}
                                        </span>
                                      </Link>
                                    ) : (
                                      <span className="text-sm text-muted-foreground">Unknown Animal</span>
                                    )}
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-sm text-muted-foreground">Contact:</p>
                                    <p className="text-sm">{app.applicantEmail}</p>
                                    <p className="text-sm">{app.applicantPhone}</p>
                                  </div>
                                  <div className="pt-2 border-t">
                                    <p className="text-xs text-muted-foreground">
                                      Submitted: {submittedDate}
                                    </p>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}
              </div>
            )}
      </div>

      {/* Adoption Dialog - Pre-populated with applicant info */}
      <AdoptionDialog
        animal={selectedAnimal}
        open={adoptionDialogOpen}
        onOpenChange={(open) => {
          setAdoptionDialogOpen(open);
          // Clear state when dialog closes to prevent stale data
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

      {/* Foster Dialog - Pre-populated with applicant info */}
      <AssignFosterDialog
        animal={selectedAnimal}
        open={fosterDialogOpen}
        onOpenChange={(open) => {
          setFosterDialogOpen(open);
          // Clear state when dialog closes to prevent stale data
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

      {/* Finalize Adoption Dialog */}
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

      {/* Approve and Send Agreement Dialog */}
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

      {/* View Application Dialog */}
      <ViewApplicationDialog
        application={applicationToView}
        applicationType="adoption"
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

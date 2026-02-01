import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { RecordOfflineDonationDialog } from "@/components/RecordOfflineDonationDialog";
import { Heart, Users, Pill, Loader2, Inbox, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import type { Tenant, FosterAnimal, Animal, User } from "@shared/schema";
import DashboardLayout from "@/components/DashboardLayout";
import SetupWizard from "@/components/SetupWizard";
import SupplyRequestDialog from "@/components/SupplyRequestDialog";
import FosterUpdateDialog from "@/components/FosterUpdateDialog";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  HeaderStats,
  MedicalSnapshotWidget,
  ComplianceWidget,
  DailyBriefing,
} from "@/components/dashboard";
import PipelineManager, { PipelineTab } from "@/components/dashboard/PipelineManager";

interface FosterAnimalWithDetails extends FosterAnimal {
  animal: Animal | null;
  foster: User | null;
}

interface MyFostersData {
  fosterAnimals: FosterAnimalWithDetails[];
}

const actionButtons = [
  { id: "new-intake", label: "New Intake", icon: Inbox, href: "/surrender", color: "bg-blue-600 text-white border-blue-600" },
  { id: "log-meds", label: "Log Meds", icon: Pill, href: "/dashboard/medical-pipeline?tab=treatments", color: "bg-red-600 text-white border-red-600" },
  { id: "find-foster", label: "Find Foster", icon: Heart, href: "/dashboard/foster-management", color: "bg-green-600 text-white border-green-600" },
  { id: "invite-team-member", label: "Invite Team Member", icon: Users, href: "/dashboard/team?action=invite", color: "bg-purple-600 text-white border-purple-600" },
];

// Valid pipeline tabs that can be set via URL hash
const validPipelineTabs: PipelineTab[] = ["adoptions", "fosters", "volunteers", "intake"];

function getInitialPipelineTab(): PipelineTab | undefined {
  const hash = window.location.hash.slice(1); // Remove the # prefix
  if (validPipelineTabs.includes(hash as PipelineTab)) {
    return hash as PipelineTab;
  }
  return undefined;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { basePath } = useTenant();
  const { toast } = useToast();
  const { canAccessPage, isLoading: isLoadingRolePermissions } = usePagePermissions();
  // Treat as loading if user data isn't loaded yet OR permission queries are still running
  // This prevents blank screens during "View As" when user context is still being fetched
  const isLoadingPermissions = !user || isLoadingRolePermissions;
  const [showWizard, setShowWizard] = useState(false);
  const [supplyDialogOpen, setSupplyDialogOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [selectedAnimal, setSelectedAnimal] = useState<{id: string, name: string} | null>(null);
  const [offlineDonationDialogOpen, setOfflineDonationDialogOpen] = useState(false);
  const [pipelineTab, setPipelineTab] = useState<PipelineTab | undefined>(getInitialPipelineTab);
  
  // Permission checks for dashboard widgets
  const canViewMedical = canAccessPage('medical-tasks');
  const canViewApplications = canAccessPage('applications');
  const canViewFosterManagement = canAccessPage('foster-management');
  const canViewVolunteers = canAccessPage('volunteers');
  const canViewVolunteerPipeline = canAccessPage('volunteer-pipeline');
  const canViewDashboard = canAccessPage('dashboard');
  const canViewAnalytics = canAccessPage('analytics');
  const canViewReports = canAccessPage('reports');
  const canViewCalendar = canAccessPage('calendar');
  const canViewAnimals = canAccessPage('animals');
  const canViewFinance = canAccessPage('finance');
  const canViewIntake = canAccessPage('intake');
  
  // Check if user has access to any pipeline tabs (for pipeline widget rendering)
  // Include volunteer-pipeline as a separate permission for granular volunteer-only access
  const hasPipelineAccess = canViewApplications || canViewFosterManagement || canViewVolunteers || canViewVolunteerPipeline || canViewIntake;
  
  // Check if user has access to full dashboard features (requires explicit dashboard permission)
  // This is stricter - requires 'dashboard' access, not just any other page access
  const hasFullDashboardAccess = canViewDashboard;
  
  // Check if user can see the KPI header stats (animals counts + intake numbers)
  // Only show for users with explicit dashboard permission - these are high-level metrics
  // that staff/admin need, not general volunteers
  const canViewHeaderStats = canViewDashboard;
  
  // Check if user can see the Daily Briefing widget (surgeries, medical tasks, calendar events)
  // Only show for users with explicit dashboard permission - contains sensitive operational info
  const canViewDailyBriefing = canViewDashboard;
  
  // Check if user has some level of command center access (dashboard OR specific widget permissions)
  // NOTE: This is for dashboard widgets only - don't include standalone page access like 'volunteers' 
  // which is a separate page volunteers can access but NOT a dashboard widget.
  // hasPipelineAccess includes canViewVolunteers, but that gives access to the Volunteers PAGE,
  // not the dashboard pipeline widget. We need canViewVolunteerPipeline for the pipeline widget.
  const hasDashboardPipelineWidgetAccess = canViewApplications || canViewFosterManagement || canViewVolunteerPipeline || canViewIntake;
  const hasAnyCommandCenterAccess = canViewDashboard || canViewMedical || hasDashboardPipelineWidgetAccess || canViewAnalytics || canViewReports;

  // Wouter navigation hook for redirects
  const [, setLocation] = useLocation();

  // Redirect calendar-only users (volunteers) directly to the calendar page
  // This provides a better UX than showing a "Go to Calendar" button
  useEffect(() => {
    if (!isLoadingPermissions && !hasAnyCommandCenterAccess && canViewCalendar && user?.activeRole !== 'foster') {
      setLocation(`${basePath}/dashboard/calendar`);
    }
  }, [isLoadingPermissions, hasAnyCommandCenterAccess, canViewCalendar, user?.activeRole, basePath, setLocation]);

  // Listen for hash changes and update pipeline tab
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (validPipelineTabs.includes(hash as PipelineTab)) {
        setPipelineTab(hash as PipelineTab);
        // Scroll the Pipeline Manager into view
        const pipelineElement = document.querySelector('[data-testid="pipeline-manager"]');
        if (pipelineElement) {
          pipelineElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    };

    // Handle initial hash on mount
    handleHashChange();

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Update URL hash when tab changes
  const handlePipelineTabChange = (tab: PipelineTab) => {
    setPipelineTab(tab);
    window.history.replaceState(null, '', `#${tab}`);
  };

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant', user?.activeRole],
  });

  const { data: statsData } = useQuery<{
    stats: { animalsInCare: number };
  }>({
    queryKey: ['/api/stats', user?.activeRole],
    enabled: !!user && user.activeRole !== 'foster',
  });

  const { data: wizardStatus } = useQuery<{
    wizardCompleted: boolean;
    wizardStep: number;
    wizardSkipped: boolean;
  }>({
    queryKey: ['/api/wizard/status', user?.activeRole],
    enabled: user?.activeRole === 'admin',
  });

  const { data: emailUsage } = useQuery<{
    usePlatformKey: boolean;
    hasOwnApiKey: boolean;
  }>({
    queryKey: ['/api/tenant/email-usage'],
  });

  useEffect(() => {
    if (user?.activeRole === 'admin' && wizardStatus) {
      const shouldShowWizard = !wizardStatus.wizardCompleted && !wizardStatus.wizardSkipped;
      setShowWizard(shouldShowWizard);
    }
  }, [user, wizardStatus]);

  const { data: fosterAnimalsData, isLoading: isLoadingFosterAnimals } = useQuery<MyFostersData>({
    queryKey: ['/api/foster-animals', user?.activeRole],
    enabled: user?.activeRole === 'foster',
  });
  const fosterAnimals = fosterAnimalsData?.fosterAnimals || [];
  const activeFosters = fosterAnimals.filter(fa => fa.status === 'active');

  const handleRequestSupplies = (animalId: string, animalName: string) => {
    if (fosterAnimals.length === 0) {
      toast({
        title: "No foster animals",
        description: "You don't have any foster animals assigned to you.",
        variant: "destructive",
      });
      return;
    }
    setSelectedAnimal({ id: animalId, name: animalName });
    setSupplyDialogOpen(true);
  };

  const handleAddUpdate = (animalId: string, animalName: string) => {
    if (fosterAnimals.length === 0) {
      toast({
        title: "No foster animals",
        description: "You don't have any foster animals assigned to you.",
        variant: "destructive",
      });
      return;
    }
    setSelectedAnimal({ id: animalId, name: animalName });
    setUpdateDialogOpen(true);
  };

  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <>
      {user?.activeRole === 'admin' && (
        <SetupWizard open={showWizard} onOpenChange={setShowWizard} />
      )}

      <DashboardLayout
        title="Command Center"
        description=""
      >
        <div className="flex-1 overflow-y-auto overflow-x-hidden w-full min-w-0 space-y-6 sm:p-6">
          {/* Show loading state while permissions are being fetched */}
          {isLoadingPermissions ? (
            <div className="flex items-center justify-center h-64" data-testid="loading-permissions">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : user?.activeRole === 'foster' ? (
          /* Foster role gets a dedicated dashboard experience showing their foster animals.
              This is role-based by design: fosters are a distinct user type with their own
              workflow (viewing/updating their assigned animals) separate from staff permissions. */
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold mb-2">My Foster Animals</h2>
                <p className="text-sm text-muted-foreground">
                  {activeFosters.length} active foster{activeFosters.length !== 1 ? 's' : ''}
                </p>
              </div>

              {isLoadingFosterAnimals ? (
                <div className="flex items-center justify-center h-64" data-testid="loading-fosters">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : fosterAnimals.length === 0 ? (
                <Card className="p-12 text-center">
                  <Heart className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">No Foster Animals Yet</h3>
                  <p className="text-muted-foreground mb-6">
                    You don't have any foster animals assigned to you at the moment.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Contact your rescue coordinator to get started with fostering!
                  </p>
                </Card>
              ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {fosterAnimals.map((fosterAnimal) => {
                    const animal = fosterAnimal.animal;
                    if (!animal) return null;
                    const photoUrl = animal.photoUrls && animal.photoUrls.length > 0 ? animal.photoUrls[0] : null;

                    return (
                      <Card key={fosterAnimal.id} className="overflow-hidden hover-elevate flex flex-col" data-testid={`card-foster-animal-${fosterAnimal.id}`}>
                        <Link href={`/dashboard/my-fosters/${animal.id}`}>
                          <div className="cursor-pointer">
                            {photoUrl ? (
                              <div className="aspect-video overflow-hidden bg-muted">
                                <img src={photoUrl} alt={animal.name} className="w-full h-full object-cover" data-testid={`img-animal-photo-${fosterAnimal.id}`} />
                              </div>
                            ) : (
                              <div className="aspect-video bg-muted flex items-center justify-center">
                                <Heart className="h-16 w-16 text-muted-foreground/30" />
                              </div>
                            )}
                            <CardHeader className="pb-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-xl font-semibold mb-1 truncate" data-testid={`text-animal-name-${fosterAnimal.id}`}>{animal.name}</h3>
                                  <p className="text-sm text-muted-foreground">{animal.species} • {animal.breed}</p>
                                </div>
                                <Badge variant={fosterAnimal.status === 'active' ? 'default' : 'secondary'} className="shrink-0" data-testid={`badge-status-${fosterAnimal.id}`}>{fosterAnimal.status}</Badge>
                              </div>
                            </CardHeader>
                          </div>
                        </Link>

                        <CardContent className="flex-1 pb-3">
                          {animal.medicalAlertMemo && (
                            <div className="mb-3 p-2 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-destructive">Medical Alert</p>
                                <p className="text-xs text-destructive/90 line-clamp-2">{animal.medicalAlertMemo}</p>
                              </div>
                            </div>
                          )}

                          {fosterAnimal.notes && (
                            <div className="mb-3 p-2 bg-muted rounded-md">
                              <div className="flex items-start gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-foreground">Care Notes</p>
                                  <p className="text-xs text-muted-foreground line-clamp-3">{fosterAnimal.notes}</p>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Fostering since {new Date(fosterAnimal.startDate).toLocaleDateString()}</span>
                          </div>
                        </CardContent>

                        {fosterAnimal.status === 'active' && (
                          <CardFooter className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3 border-t">
                            <Button variant="outline" size="sm" onClick={() => handleRequestSupplies(animal.id, animal.name)} data-testid={`button-request-supplies-${fosterAnimal.id}`} className="gap-2">
                              <Package className="h-4 w-4" />
                              Request Supplies
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleAddUpdate(animal.id, animal.name)} data-testid={`button-add-update-${fosterAnimal.id}`} className="gap-2">
                              <MessageSquare className="h-4 w-4" />
                              Add Update
                            </Button>
                            <Link href={`/dashboard/my-fosters/${animal.id}/medical`} className="sm:col-span-2">
                              <Button variant="default" size="sm" className="w-full gap-2" data-testid={`button-view-medical-${fosterAnimal.id}`}>
                                <Pill className="h-4 w-4" />
                                View Medical Info
                              </Button>
                            </Link>
                          </CardFooter>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <header className="mb-4" data-testid="section-header">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h1 className="text-2xl font-bold">
                      Welcome back, {user?.fullName?.split(' ')[0] || 'User'}
                    </h1>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {formattedDate}
                    </p>
                  </div>
                  {canViewHeaderStats && <HeaderStats />}
                </div>
              </header>

              {/* OnboardingChecklist - admin-only by design: this is a one-time setup wizard 
                  that guides admins through initial platform configuration. Not a page permission
                  but an admin-specific onboarding feature. */}
              {user?.activeRole === 'admin' && tenantData?.tenant && (
                <OnboardingChecklist
                  tenant={tenantData.tenant}
                  animalCount={statsData?.stats.animalsInCare || 0}
                  hasPlatformEmailKey={emailUsage?.usePlatformKey || emailUsage?.hasOwnApiKey || false}
                />
              )}

              {/* Limited access view for users with minimal permissions (e.g., calendar-only) */}
              {!hasAnyCommandCenterAccess && canViewCalendar && (
                <section data-testid="section-limited-access" className="w-full">
                  <Card className="p-8 text-center">
                    <Calendar className="h-16 w-16 mx-auto mb-4 text-primary" />
                    <h3 className="text-xl font-semibold mb-2">Welcome to Your Dashboard</h3>
                    <p className="text-muted-foreground mb-6">
                      Your primary workspace is the Volunteer Calendar. Click below to view shifts and sign up for opportunities.
                    </p>
                    <Link href={`${basePath}/dashboard/calendar`}>
                      <Button size="lg" className="gap-2" data-testid="button-go-to-calendar">
                        <Calendar className="h-5 w-5" />
                        Go to Calendar
                      </Button>
                    </Link>
                  </Card>
                </section>
              )}

              {/* Fallback for users with no calendar and no command center access */}
              {!hasAnyCommandCenterAccess && !canViewCalendar && (
                <section data-testid="section-no-access" className="w-full">
                  <Card className="p-8 text-center">
                    <Heart className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-xl font-semibold mb-2">Welcome!</h3>
                    <p className="text-muted-foreground mb-6">
                      Please use the sidebar to navigate to the features available to you.
                    </p>
                  </Card>
                </section>
              )}

              {/* Two-Column Layout: Left (2/3) for KPIs + Actions, Right (1/3) for Daily Briefing */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column - KPIs and Quick Actions */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Medical Snapshot - only show if user has explicit medical-tasks permission */}
                  {canViewMedical && (
                    <section data-testid="section-priority-medical" className="w-full">
                      <MedicalSnapshotWidget />
                    </section>
                  )}

                  {/* Quick Actions Grid - only show if user has dashboard access and at least one permitted action */}
                  {(() => {
                    const filteredActions = actionButtons.filter(action => {
                      // Filter actions based on permissions only (no role checks)
                      if (action.id === 'new-intake') return canViewApplications;
                      if (action.id === 'log-meds') return canViewMedical;
                      if (action.id === 'find-foster') return canViewFosterManagement;
                      if (action.id === 'invite-team-member') return canAccessPage('team');
                      return false; // Default to hidden unless explicitly permitted
                    });
                    
                    return hasFullDashboardAccess && filteredActions.length > 0 && (
                      <section data-testid="section-quick-actions">
                        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">Quick Actions</h3>
                        <div className="grid grid-cols-2 gap-3">
                          {filteredActions.map((action) => (
                            <Link key={action.id} href={action.href}>
                              <Button 
                                variant="outline" 
                                size="lg"
                                className={`w-full gap-2 justify-center ${action.color}`}
                                data-testid={`button-action-${action.id}`}
                              >
                                <action.icon className="h-5 w-5" />
                                <span className="font-medium">{action.label}</span>
                              </Button>
                            </Link>
                          ))}
                        </div>
                      </section>
                    );
                  })()}
                </div>

                {/* Right Column - Daily Briefing (1/3 width, scrollable) */}
                {canViewDailyBriefing && (
                  <div className="lg:col-span-1" style={{ maxHeight: '500px' }}>
                    <DailyBriefing />
                  </div>
                )}
              </div>

              {/* Pipeline Manager - only show if user has access to at least one pipeline */}
              {hasPipelineAccess && (
                <section data-testid="section-workspace" className="w-full min-w-0 space-y-6">
                  <div 
                    id="section-pipeline-manager" 
                    className="w-full min-w-0" 
                    data-testid="workspace-pipeline"
                  >
                    <PipelineManager 
                      activeTab={pipelineTab} 
                      onTabChange={handlePipelineTabChange}
                      permissions={{
                        canViewAdoptions: canViewApplications,
                        canViewFosters: canViewFosterManagement,
                        canViewVolunteers: canViewVolunteers || canViewVolunteerPipeline,
                        canViewIntake: canViewIntake || canViewApplications,
                      }}
                    />
                  </div>
                </section>
              )}

              {/* Compliance Widget - only show if user has analytics OR reports permission */}
              {(canViewAnalytics || canViewReports) && (
                <section data-testid="section-compliance" className="w-full min-w-0">
                  <div 
                    id="compliance-widget" 
                    className="w-full min-w-0" 
                    data-testid="workspace-compliance"
                  >
                    <ComplianceWidget />
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </DashboardLayout>

      {selectedAnimal && (
        <>
          <SupplyRequestDialog open={supplyDialogOpen} onOpenChange={setSupplyDialogOpen} animalId={selectedAnimal.id} animalName={selectedAnimal.name} />
          <FosterUpdateDialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen} animalId={selectedAnimal.id} animalName={selectedAnimal.name} />
        </>
      )}

      {/* FloatingActionButton - show if user has finance permission (to record donations) */}
      {canViewFinance && (
        <FloatingActionButton onRecordDonation={() => setOfflineDonationDialogOpen(true)} />
      )}

      <RecordOfflineDonationDialog open={offlineDonationDialogOpen} onOpenChange={setOfflineDonationDialogOpen} />
    </>
  );
}

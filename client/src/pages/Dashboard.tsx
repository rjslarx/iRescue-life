import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { RecordOfflineDonationDialog } from "@/components/RecordOfflineDonationDialog";
import { Heart, FileText, Users, Package, MessageSquare, PawPrint, AlertCircle, Pill, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import type { Tenant, SupplyRequest, FosterUpdate, FosterAnimal, Animal, User } from "@shared/schema";
import DashboardLayout from "@/components/DashboardLayout";
import SetupWizard from "@/components/SetupWizard";
import SupplyRequestDialog from "@/components/SupplyRequestDialog";
import FosterUpdateDialog from "@/components/FosterUpdateDialog";
import RecentActivityWidget from "@/components/RecentActivityWidget";
import PendingApplicationsWidget from "@/components/PendingApplicationsWidget";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuickActions } from "@/hooks/useQuickActions";
import {
  StatsOverview,
  IntakeSummaryWidget,
  VolunteerSummaryWidget,
  MedicalSnapshotWidget,
  FosterSummaryWidget,
} from "@/components/dashboard";

interface FosterAnimalWithDetails extends FosterAnimal {
  animal: Animal | null;
  foster: User | null;
}

interface MyFostersData {
  fosterAnimals: FosterAnimalWithDetails[];
}

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showWizard, setShowWizard] = useState(false);
  const [supplyDialogOpen, setSupplyDialogOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [selectedAnimal, setSelectedAnimal] = useState<{id: string, name: string} | null>(null);
  const [offlineDonationDialogOpen, setOfflineDonationDialogOpen] = useState(false);

  const { actions: quickActions, handleAction } = useQuickActions({
    onRecordDonation: () => setOfflineDonationDialogOpen(true),
  });

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

  const { data: supplyRequestsData } = useQuery<{ supplyRequests: SupplyRequest[] }>({
    queryKey: ['/api/supply-requests'],
    enabled: user?.activeRole === 'admin' || user?.activeRole === 'staff',
  });

  const { data: fosterUpdatesData } = useQuery<{ fosterUpdates: FosterUpdate[] }>({
    queryKey: ['/api/foster-updates'],
    enabled: user?.activeRole === 'admin' || user?.activeRole === 'staff',
  });

  const { data: fosterAnimalsData, isLoading: isLoadingFosterAnimals } = useQuery<MyFostersData>({
    queryKey: ['/api/foster-animals', user?.activeRole],
    enabled: user?.activeRole === 'foster',
  });

  const pendingSupplyRequests = supplyRequestsData?.supplyRequests.filter(sr => sr.status === 'pending') || [];
  const unacknowledgedUpdates = fosterUpdatesData?.fosterUpdates.filter(fu => fu.status === 'pending') || [];
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

  return (
    <>
      {user?.activeRole === 'admin' && (
        <SetupWizard open={showWizard} onOpenChange={setShowWizard} />
      )}

      <DashboardLayout
        title="Dashboard"
        description={`Welcome back, ${user?.fullName?.split(' ')[0] || 'User'}`}
      >
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {user?.activeRole === 'foster' ? (
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
              {user?.activeRole === 'admin' && tenantData?.tenant && (
                <OnboardingChecklist
                  tenant={tenantData.tenant}
                  animalCount={statsData?.stats.animalsInCare || 0}
                  hasPlatformEmailKey={emailUsage?.usePlatformKey || emailUsage?.hasOwnApiKey || false}
                />
              )}

              <section data-testid="section-stats-overview">
                <StatsOverview />
              </section>

              <section data-testid="section-quick-actions">
                <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                  {quickActions.map((action) => (
                    action.href ? (
                      <Link key={action.id} href={action.href}>
                        <Button variant="outline" className="w-full justify-start h-auto py-3" data-testid={`button-quick-action-${action.id}`}>
                          <action.icon className="mr-2 h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{action.label}</span>
                        </Button>
                      </Link>
                    ) : (
                      <Button key={action.id} variant="outline" className="w-full justify-start h-auto py-3" onClick={() => handleAction(action.id)} data-testid={`button-quick-action-${action.id}`}>
                        <action.icon className="mr-2 h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{action.label}</span>
                      </Button>
                    )
                  ))}
                </div>
              </section>

              <section data-testid="section-command-center">
                <h2 className="text-lg font-semibold mb-3">Command Center</h2>
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="space-y-4" data-testid="zone-inbound">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Inbound</h3>
                    <IntakeSummaryWidget />
                    {(user?.activeRole === 'admin' || user?.activeRole === 'staff') && (
                      <PendingApplicationsWidget />
                    )}
                  </div>

                  <div className="space-y-4" data-testid="zone-people">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">People</h3>
                    <FosterSummaryWidget />
                    <VolunteerSummaryWidget />
                  </div>

                  <div className="space-y-4" data-testid="zone-operations">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Operations</h3>
                    <MedicalSnapshotWidget />
                    <RecentActivityWidget />
                  </div>
                </div>
              </section>

              {(user?.activeRole === 'admin' || user?.activeRole === 'staff') && (pendingSupplyRequests.length > 0 || unacknowledgedUpdates.length > 0) && (
                <Card className="border-l-4 border-l-primary" data-testid="card-foster-alerts">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <PawPrint className="h-5 w-5" />
                      Foster Management
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Link href="/dashboard/foster-management?tab=supply-requests">
                        <div className="p-4 rounded-lg border hover-elevate cursor-pointer" data-testid="tile-supply-requests">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Package className="h-5 w-5 text-muted-foreground" />
                              <h3 className="font-medium">Supply Requests</h3>
                            </div>
                            <Badge variant={pendingSupplyRequests.length > 0 ? "secondary" : "outline"} data-testid="badge-supply-count">{pendingSupplyRequests.length}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {pendingSupplyRequests.length > 0 ? "Foster parents need supplies" : "No pending supply requests"}
                          </p>
                        </div>
                      </Link>

                      <Link href="/dashboard/foster-management?tab=foster-updates">
                        <div className="p-4 rounded-lg border hover-elevate cursor-pointer" data-testid="tile-foster-updates">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <MessageSquare className="h-5 w-5 text-muted-foreground" />
                              <h3 className="font-medium">Foster Updates</h3>
                            </div>
                            <Badge variant={unacknowledgedUpdates.length > 0 ? "secondary" : "outline"} data-testid="badge-updates-count">{unacknowledgedUpdates.length}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {unacknowledgedUpdates.length > 0 ? "New updates need your attention" : "No unread foster updates"}
                          </p>
                        </div>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
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

      {(user?.activeRole === 'admin' || user?.activeRole === 'staff') && (
        <FloatingActionButton onRecordDonation={() => setOfflineDonationDialogOpen(true)} />
      )}

      <RecordOfflineDonationDialog open={offlineDonationDialogOpen} onOpenChange={setOfflineDonationDialogOpen} />
    </>
  );
}

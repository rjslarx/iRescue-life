import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { RecordOfflineDonationDialog } from "@/components/RecordOfflineDonationDialog";
import { Heart, Users, MessageSquare, Pill, Loader2, Stethoscope, Inbox, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import type { Tenant, FosterAnimal, Animal, User } from "@shared/schema";
import DashboardLayout from "@/components/DashboardLayout";
import SetupWizard from "@/components/SetupWizard";
import SupplyRequestDialog from "@/components/SupplyRequestDialog";
import FosterUpdateDialog from "@/components/FosterUpdateDialog";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  StatsOverview,
  MedicalSnapshotWidget,
  ComplianceWidget,
} from "@/components/dashboard";
import PipelineManager from "@/components/dashboard/PipelineManager";

interface FosterAnimalWithDetails extends FosterAnimal {
  animal: Animal | null;
  foster: User | null;
}

interface MyFostersData {
  fosterAnimals: FosterAnimalWithDetails[];
}

const actionButtons = [
  { id: "new-intake", label: "New Intake", icon: Inbox, href: "/dashboard/intake" },
  { id: "log-medical", label: "Log Medical", icon: Stethoscope, href: "/dashboard/medical-pipeline" },
  { id: "find-foster", label: "Find Foster", icon: Heart, href: "/dashboard/foster-management" },
  { id: "add-volunteer", label: "Add Volunteer", icon: Users, href: "/dashboard/volunteers/new" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showWizard, setShowWizard] = useState(false);
  const [supplyDialogOpen, setSupplyDialogOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [selectedAnimal, setSelectedAnimal] = useState<{id: string, name: string} | null>(null);
  const [offlineDonationDialogOpen, setOfflineDonationDialogOpen] = useState(false);

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
              <header className="mb-2" data-testid="section-header">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h1 className="text-2xl font-bold">
                      Welcome back, {user?.fullName?.split(' ')[0] || 'User'}
                    </h1>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {formattedDate}
                    </p>
                  </div>
                </div>
              </header>

              {user?.activeRole === 'admin' && tenantData?.tenant && (
                <OnboardingChecklist
                  tenant={tenantData.tenant}
                  animalCount={statsData?.stats.animalsInCare || 0}
                  hasPlatformEmailKey={emailUsage?.usePlatformKey || emailUsage?.hasOwnApiKey || false}
                />
              )}

              {/* Volunteer/Staff priority: Medical first */}
              {(user?.activeRole === 'volunteer' || user?.activeRole === 'staff') && (
                <section data-testid="section-priority-medical" className="w-full">
                  <div className="grid gap-4 md:grid-cols-2">
                    <MedicalSnapshotWidget />
                    <div className="space-y-4">
                      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Quick Actions</h3>
                      <div className="flex flex-wrap gap-2">
                        {actionButtons.map((action) => (
                          <Link key={action.id} href={action.href}>
                            <Button 
                              variant="outline" 
                              className="gap-2"
                              data-testid={`button-action-${action.id}`}
                            >
                              <action.icon className="h-4 w-4" />
                              {action.label}
                            </Button>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              )}

              <section data-testid="section-stats-overview">
                <StatsOverview />
              </section>

              {/* Action bar - horizontally scrollable on mobile */}
              {(user?.activeRole === 'admin' || user?.activeRole === 'staff') && (
                <section data-testid="section-action-bar">
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                    {actionButtons.map((action) => (
                      <Link key={action.id} href={action.href}>
                        <Button 
                          variant="outline" 
                          className="gap-2 whitespace-nowrap shrink-0"
                          data-testid={`button-action-${action.id}`}
                        >
                          <action.icon className="h-4 w-4" />
                          {action.label}
                        </Button>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* The Workspace - 70/30 Grid Layout */}
              <section data-testid="section-workspace" className="w-full min-w-0">
                <div className="grid gap-6 lg:grid-cols-[7fr_3fr] w-full min-w-0">
                  {/* Left: Pipeline Manager (70%) */}
                  <div id="section-pipeline-manager" className="w-full min-w-0 order-1" data-testid="workspace-pipeline">
                    <PipelineManager />
                  </div>

                  {/* Right: Compliance Widget (30%) */}
                  <div id="compliance-widget" className="w-full min-w-0 order-2 lg:order-2" data-testid="workspace-compliance">
                    <ComplianceWidget />
                  </div>
                </div>
              </section>
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

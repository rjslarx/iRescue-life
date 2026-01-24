import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import StatsCard from "@/components/StatsCard";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { RecordOfflineDonationDialog } from "@/components/RecordOfflineDonationDialog";
import { Heart, FileText, Users, DollarSign, Package, MessageSquare, PawPrint, AlertTriangle, Calendar, Pill, Clock, Home, Loader2, AlertCircle, Mail, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Link } from "wouter";
import type { Tenant, SupplyRequest, FosterUpdate, FosterAnimal, Animal, User } from "@shared/schema";
import DashboardLayout from "@/components/DashboardLayout";
import SetupWizard from "@/components/SetupWizard";
import SupplyRequestDialog from "@/components/SupplyRequestDialog";
import FosterUpdateDialog from "@/components/FosterUpdateDialog";
import MedicalRemindersWidget from "@/components/MedicalRemindersWidget";
import RecentActivityWidget from "@/components/RecentActivityWidget";
import PendingApplicationsWidget from "@/components/PendingApplicationsWidget";
import { TemperatureWidget } from "@/components/TemperatureWidget";
import WebsiteVisitsWidget from "@/components/WebsiteVisitsWidget";
import { formatDistanceToNow } from "date-fns";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuickActions } from "@/hooks/useQuickActions";

interface Activity {
  type: 'application' | 'donation' | 'status_change' | 'volunteer_app' | 'foster_app' | 'event' | 'happy_tail' | 'animal_new';
  title: string;
  description: string;
  timestamp: string;
}

interface UrgentItems {
  overdueMedicalDoses: number;
  overdueMedicalDosesDetails: Array<{
    id: string;
    medication: string;
    animalName: string;
    dueDate: string;
  }>;
  oldPendingApplications: number;
  oldPendingApplicationsDetails: Array<{
    id: string;
    applicantName: string;
    createdAt: string;
  }>;
  longTermAvailableAnimals: number;
  longTermAvailableAnimalsDetails: Array<{
    id: string;
    name: string;
    intakeDate: string;
  }>;
}

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  location: string | null;
  customPageSlug: string | null;
  calendarName: string;
  calendarColor: string;
}

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

  const { data: statsData, isLoading: isLoadingStats } = useQuery<{
    stats: {
      animalsInCare: number;
      animalsInCareTrend: { change: number; isPositive: boolean };
      pendingApplications: number;
      pendingApplicationsTrend: { change: number; isPositive: boolean };
      activeVolunteers: number;
      donationsThisMonth: number;
      cashRevenueThisMonth: number;
      inKindRevenueThisMonth: number;
      donationsThisMonthTrend: { change: number; isPositive: boolean };
      totalKennels: number;
      occupiedKennels: number;
      vacantKennels: number;
      pendingVolunteerApplications: number;
      pendingFosterApplications: number;
    };
  }>({
    queryKey: ['/api/stats', user?.activeRole],
    enabled: !!user && user.activeRole !== 'foster',
  });

  const { data: activitiesData, isLoading: isLoadingActivities } = useQuery<{
    activities: Activity[];
  }>({
    queryKey: ['/api/dashboard/activity', user?.activeRole],
  });

  const { data: urgentItemsData } = useQuery<{
    urgentItems: UrgentItems;
  }>({
    queryKey: ['/api/dashboard/urgent-items', user?.activeRole],
    enabled: user?.activeRole === 'admin' || user?.activeRole === 'staff',
  });

  const { data: eventsData } = useQuery<{ events: CalendarEvent[] }>({
    queryKey: ['/api/events', { role: user?.activeRole }],
  });

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant', { role: user?.activeRole }],
  });

  // Fetch wizard status for admins
  const { data: wizardStatus } = useQuery<{
    wizardCompleted: boolean;
    wizardStep: number;
    wizardSkipped: boolean;
  }>({
    queryKey: ['/api/wizard/status', user?.activeRole],
    enabled: user?.activeRole === 'admin',
  });

  // Auto-show wizard for admins who haven't completed it
  useEffect(() => {
    if (user?.activeRole === 'admin' && wizardStatus) {
      const shouldShowWizard = !wizardStatus.wizardCompleted && !wizardStatus.wizardSkipped;
      setShowWizard(shouldShowWizard);
    }
  }, [user, wizardStatus]);

  const { data: emailUsage } = useQuery<{
    sent: number;
    limit: number;
    remaining: number;
    lastReset: string;
    usePlatformKey: boolean;
    hasOwnApiKey: boolean;
  }>({
    queryKey: ['/api/tenant/email-usage'],
  });

  // Fetch unprocessed inbox count for notification badge
  const { data: inboxCountData } = useQuery<{ count: number }>({
    queryKey: ['/api/inbound-emails/unprocessed/count'],
    enabled: !!user && (user.activeRole === 'admin' || user.activeRole === 'staff'),
    refetchInterval: 60000, // Refresh every minute
  });

  // Only fetch for admin/staff roles
  const { data: supplyRequestsData } = useQuery<{ supplyRequests: SupplyRequest[] }>({
    queryKey: ['/api/supply-requests'],
    enabled: user?.activeRole === 'admin' || user?.activeRole === 'staff',
  });

  const { data: fosterUpdatesData } = useQuery<{ fosterUpdates: FosterUpdate[] }>({
    queryKey: ['/api/foster-updates'],
    enabled: user?.activeRole === 'admin' || user?.activeRole === 'staff',
  });

  // Fetch foster animals for foster role
  const { data: fosterAnimalsData, isLoading: isLoadingFosterAnimals } = useQuery<MyFostersData>({
    queryKey: ['/api/foster-animals', user?.activeRole],
    enabled: user?.activeRole === 'foster',
  });

  const pendingSupplyRequests = supplyRequestsData?.supplyRequests.filter(sr => sr.status === 'pending') || [];
  const unacknowledgedUpdates = fosterUpdatesData?.fosterUpdates.filter(fu => fu.status === 'pending') || [];

  // Foster animals data
  const fosterAnimals = fosterAnimalsData?.fosterAnimals || [];
  const activeFosters = fosterAnimals.filter(fa => fa.status === 'active');

  // Handlers for foster dialogs
  const handleRequestSupplies = (animalId: string, animalName: string) => {
    if (fosterAnimals.length === 0) {
      toast({
        title: "No foster animals",
        description: "You don't have any foster animals assigned to you. Contact your rescue coordinator to get started with fostering.",
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
        description: "You don't have any foster animals assigned to you. Contact your rescue coordinator to get started with fostering.",
        variant: "destructive",
      });
      return;
    }
    setSelectedAnimal({ id: animalId, name: animalName });
    setUpdateDialogOpen(true);
  };

  // Get icon for activity type
  const getActivityIcon = (type: Activity['type']) => {
    switch (type) {
      case 'application':
        return FileText;
      case 'donation':
        return DollarSign;
      case 'status_change':
        return Heart;
      case 'volunteer_app':
        return Users;
      case 'foster_app':
        return Heart;
      case 'event':
        return Calendar;
      case 'happy_tail':
        return MessageSquare;
      case 'animal_new':
        return PawPrint;
      default:
        return Heart;
    }
  };

  // Prepare stats with trends
  const stats = statsData ? [
    { 
      title: "Animals in Care", 
      value: statsData.stats.animalsInCare, 
      icon: Heart,
      trend: statsData.stats.animalsInCareTrend,
      color: 'pink' as const,
    },
    { 
      title: "Pending Adoption Applications", 
      value: statsData.stats.pendingApplications, 
      icon: FileText,
      trend: statsData.stats.pendingApplicationsTrend,
      color: 'purple' as const,
    },
    // Only show kennel occupancy if kennel data is available
    ...(statsData.stats.totalKennels !== undefined ? [{
      title: "Kennel Occupancy", 
      value: `${statsData.stats.occupiedKennels} / ${statsData.stats.totalKennels}`, 
      icon: Home,
      color: 'cyan' as const,
    }] : []),
    // Only show volunteer applications tile if there are pending applications
    ...(statsData.stats.pendingVolunteerApplications > 0 ? [{
      title: "New Volunteer Applications",
      value: statsData.stats.pendingVolunteerApplications,
      icon: Users,
      color: 'green' as const,
    }] : []),
    // Only show foster applications tile if there are pending applications
    ...(statsData.stats.pendingFosterApplications > 0 ? [{
      title: "New Foster Applications",
      value: statsData.stats.pendingFosterApplications,
      icon: Heart,
      color: 'orange' as const,
    }] : []),
    { 
      title: "Active Volunteers", 
      value: statsData.stats.activeVolunteers, 
      icon: Users,
      color: 'blue' as const,
    },
    { 
      title: "Cash Revenue", 
      value: `$${((statsData.stats.cashRevenueThisMonth || statsData.stats.donationsThisMonth || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, 
      icon: DollarSign,
      trend: statsData.stats.donationsThisMonthTrend,
      color: 'amber' as const,
    },
    // Only show In-Kind Revenue tile if there's in-kind revenue
    ...(statsData.stats.inKindRevenueThisMonth > 0 ? [{
      title: "In-Kind Revenue (Est.)",
      value: `$${(statsData.stats.inKindRevenueThisMonth / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      icon: Gift,
      color: 'purple' as const,
    }] : []),
  ] : [];

  // Filter upcoming events (next 3)
  const upcomingEvents = eventsData?.events
    ?.filter(event => new Date(event.startTime) > new Date())
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, 3) || [];

  // Check if there are any urgent items
  const hasUrgentItems = urgentItemsData && (
    urgentItemsData.urgentItems.overdueMedicalDoses > 0 ||
    urgentItemsData.urgentItems.oldPendingApplications > 0 ||
    urgentItemsData.urgentItems.longTermAvailableAnimals > 0
  );

  return (
    <>
      {/* Setup Wizard for new admins */}
      {user?.activeRole === 'admin' && (
        <SetupWizard 
          open={showWizard} 
          onOpenChange={setShowWizard}
        />
      )}

      <DashboardLayout
        title="Dashboard"
        description={`Welcome back, ${user?.fullName?.split(' ')[0] || 'User'}`}
      >
      <div className="flex-1 overflow-auto p-6 space-y-8">
        {/* Foster Dashboard - Show "My Fosters" content for foster users */}
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
                  
                  const photoUrl = animal.photoUrls && animal.photoUrls.length > 0 
                    ? animal.photoUrls[0] 
                    : null;

                  return (
                    <Card 
                      key={fosterAnimal.id} 
                      className="overflow-hidden hover-elevate flex flex-col"
                      data-testid={`card-foster-animal-${fosterAnimal.id}`}
                    >
                      <Link href={`/dashboard/my-fosters/${animal.id}`}>
                        <div className="cursor-pointer">
                          {photoUrl ? (
                            <div className="aspect-video overflow-hidden bg-muted">
                              <img 
                                src={photoUrl} 
                                alt={animal.name}
                                className="w-full h-full object-cover"
                                data-testid={`img-animal-photo-${fosterAnimal.id}`}
                              />
                            </div>
                          ) : (
                            <div className="aspect-video bg-muted flex items-center justify-center">
                              <Heart className="h-16 w-16 text-muted-foreground/30" />
                            </div>
                          )}
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <h3 className="text-xl font-semibold mb-1 truncate" data-testid={`text-animal-name-${fosterAnimal.id}`}>
                                  {animal.name}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                  {animal.species} • {animal.breed}
                                </p>
                              </div>
                              <Badge 
                                variant={fosterAnimal.status === 'active' ? 'default' : 'secondary'}
                                className="shrink-0"
                                data-testid={`badge-status-${fosterAnimal.id}`}
                              >
                                {fosterAnimal.status}
                              </Badge>
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
                              <p className="text-xs text-destructive/90 line-clamp-2">
                                {animal.medicalAlertMemo}
                              </p>
                            </div>
                          </div>
                        )}

                        {fosterAnimal.notes && (
                          <div className="mb-3 p-2 bg-muted rounded-md">
                            <div className="flex items-start gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-foreground">Care Notes</p>
                                <p className="text-xs text-muted-foreground line-clamp-3">
                                  {fosterAnimal.notes}
                                </p>
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
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleRequestSupplies(animal.id, animal.name)}
                            data-testid={`button-request-supplies-${fosterAnimal.id}`}
                            className="gap-2"
                          >
                            <Package className="h-4 w-4" />
                            Request Supplies
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleAddUpdate(animal.id, animal.name)}
                            data-testid={`button-add-update-${fosterAnimal.id}`}
                            className="gap-2"
                          >
                            <MessageSquare className="h-4 w-4" />
                            Add Update
                          </Button>
                          <Link href={`/dashboard/my-fosters/${animal.id}/medical`} className="sm:col-span-2">
                            <Button 
                              variant="default"
                              size="sm"
                              className="w-full gap-2"
                              data-testid={`button-view-medical-${fosterAnimal.id}`}
                            >
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
            {/* Default Dashboard - For all other roles */}
            {/* Onboarding Checklist - Only for admin role */}
            {user?.activeRole === 'admin' && tenantData?.tenant && (
              <OnboardingChecklist 
                tenant={tenantData.tenant} 
                animalCount={statsData?.stats.animalsInCare || 0}
                hasPlatformEmailKey={emailUsage?.usePlatformKey || emailUsage?.hasOwnApiKey || false}
              />
            )}

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4" data-testid="stats-grid">
              {isLoadingStats ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-3 p-6 rounded-lg border">
                    <Skeleton className="h-4 w-32" data-testid="skeleton-stat" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                ))
              ) : stats.length > 0 ? (
                stats.map((stat, idx) => (
                  <StatsCard key={idx} {...stat} data-testid={`stat-card-${idx}`} />
                ))
              ) : (
                <div data-testid="no-stats">No stats available</div>
              )}
            </div>

        {/* Quick Actions and Recent Activity - Moved to top */}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Quick Actions</h2>
            <div className="grid gap-3">
              {quickActions.map((action) => (
                action.href ? (
                  <Link key={action.id} href={action.href}>
                    <Button 
                      variant="outline" 
                      className="w-full justify-start" 
                      data-testid={`button-quick-action-${action.id}`}
                    >
                      <action.icon className="mr-2 h-4 w-4" />
                      {action.label}
                    </Button>
                  </Link>
                ) : (
                  <Button
                    key={action.id}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => handleAction(action.id)}
                    data-testid={`button-quick-action-${action.id}`}
                  >
                    <action.icon className="mr-2 h-4 w-4" />
                    {action.label}
                  </Button>
                )
              ))}
            </div>
          </div>

          <RecentActivityWidget />
        </div>

        {/* Pending Applications Widget - Only for admin/staff */}
        {(user?.activeRole === 'admin' || user?.activeRole === 'staff') && (
          <PendingApplicationsWidget />
        )}

        {/* Foster Management Alerts - Only for admin/staff */}
        {(user?.activeRole === 'admin' || user?.activeRole === 'staff') && (
          <Card className="border-l-4 border-l-primary" data-testid="card-foster-alerts">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PawPrint className="h-5 w-5" />
                Foster Management
              </CardTitle>
              <CardDescription>
                {pendingSupplyRequests.length === 0 && unacknowledgedUpdates.length === 0 
                  ? "All caught up! No pending items from foster parents."
                  : "Action items from foster parents"}
              </CardDescription>
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
                      <Badge 
                        variant={pendingSupplyRequests.length > 0 ? "secondary" : "outline"} 
                        data-testid="badge-supply-count"
                      >
                        {pendingSupplyRequests.length}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {pendingSupplyRequests.length > 0 
                        ? "Foster parents need supplies for their animals"
                        : "No pending supply requests"}
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
                      <Badge 
                        variant={unacknowledgedUpdates.length > 0 ? "secondary" : "outline"} 
                        data-testid="badge-updates-count"
                      >
                        {unacknowledgedUpdates.length}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {unacknowledgedUpdates.length > 0 
                        ? "New updates from foster parents need your attention"
                        : "No unread foster updates"}
                    </p>
                  </div>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Medical Reminders - Only for admin/staff */}
        {(user?.activeRole === 'admin' || user?.activeRole === 'staff') && (
          <MedicalRemindersWidget />
        )}

        {/* Temperature Monitoring Widget - Only for admin/staff */}
        {(user?.activeRole === 'admin' || user?.activeRole === 'staff') && (
          <TemperatureWidget />
        )}

        {/* Website Visits Widget - Only for admin */}
        {user?.activeRole === 'admin' && (
          <WebsiteVisitsWidget />
        )}

        {/* Urgent Items Alert - Only for admin/staff and only if there are urgent items */}
        {(user?.activeRole === 'admin' || user?.activeRole === 'staff') && hasUrgentItems && (
          <Alert variant="destructive" className="border-l-4" data-testid="alert-urgent-items">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Urgent Items Require Attention</AlertTitle>
            <AlertDescription>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {urgentItemsData!.urgentItems.overdueMedicalDoses > 0 && (
                  <Link href="/dashboard/medical-tasks">
                    <div className="p-3 rounded-md bg-background hover-elevate cursor-pointer" data-testid="link-overdue-doses">
                      <div className="flex items-center gap-2 mb-1">
                        <Pill className="h-4 w-4" />
                        <span className="font-medium text-sm">Overdue Medical Doses</span>
                      </div>
                      <Badge variant="secondary" data-testid="badge-overdue-doses-count">
                        {urgentItemsData!.urgentItems.overdueMedicalDoses}
                      </Badge>
                    </div>
                  </Link>
                )}
                {urgentItemsData!.urgentItems.oldPendingApplications > 0 && (
                  <Link href="/dashboard/applications">
                    <div className="p-3 rounded-md bg-background hover-elevate cursor-pointer" data-testid="link-old-applications">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="h-4 w-4" />
                        <span className="font-medium text-sm">Old Pending Applications</span>
                      </div>
                      <Badge variant="secondary" data-testid="badge-old-applications-count">
                        {urgentItemsData!.urgentItems.oldPendingApplications} over 7 days
                      </Badge>
                    </div>
                  </Link>
                )}
                {urgentItemsData!.urgentItems.longTermAvailableAnimals > 0 && (
                  <Link href="/dashboard/animals">
                    <div className="p-3 rounded-md bg-background hover-elevate cursor-pointer" data-testid="link-long-term-animals">
                      <div className="flex items-center gap-2 mb-1">
                        <Home className="h-4 w-4" />
                        <span className="font-medium text-sm">Long-Term Available</span>
                      </div>
                      <Badge variant="secondary" data-testid="badge-long-term-animals-count">
                        {urgentItemsData!.urgentItems.longTermAvailableAnimals} over 90 days
                      </Badge>
                    </div>
                  </Link>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Upcoming Calendar Events */}
        {upcomingEvents.length > 0 && (
          <Card data-testid="card-upcoming-events">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Upcoming Events
              </CardTitle>
              <CardDescription>Your next scheduled events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {upcomingEvents.map((event) => (
                  <Link key={event.id} href={`/dashboard/calendar-management?eventId=${event.id}`}>
                    <div className="p-4 rounded-lg border hover-elevate cursor-pointer" data-testid={`event-${event.id}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium mb-1">{event.title}</h3>
                          {event.description && (
                            <p className="text-sm text-muted-foreground line-clamp-1 mb-2">
                              {event.description}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(event.startTime).toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {event.location && (
                              <span className="flex items-center gap-1 line-clamp-1">
                                📍 {event.location}
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge 
                          variant="outline" 
                          style={{ borderColor: event.calendarColor }}
                          data-testid={`badge-event-calendar-${event.id}`}
                        >
                          {event.calendarName}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              <Link href="/dashboard/calendar-management">
                <Button variant="outline" className="w-full mt-4" data-testid="button-view-all-events">
                  View All Events
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
          </>
        )}
      </div>
    </DashboardLayout>

    {/* Foster Dialogs */}
    {selectedAnimal && (
      <>
        <SupplyRequestDialog
          open={supplyDialogOpen}
          onOpenChange={setSupplyDialogOpen}
          animalId={selectedAnimal.id}
          animalName={selectedAnimal.name}
        />
        <FosterUpdateDialog
          open={updateDialogOpen}
          onOpenChange={setUpdateDialogOpen}
          animalId={selectedAnimal.id}
          animalName={selectedAnimal.name}
        />
      </>
    )}

    {/* Floating Action Button - Only for admin/staff */}
    {(user?.activeRole === 'admin' || user?.activeRole === 'staff') && (
      <FloatingActionButton onRecordDonation={() => setOfflineDonationDialogOpen(true)} />
    )}

    {/* Record Offline Donation Dialog */}
    <RecordOfflineDonationDialog
      open={offlineDonationDialogOpen}
      onOpenChange={setOfflineDonationDialogOpen}
    />
    </>
  );
}

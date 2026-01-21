import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Search, 
  Pill, 
  TrendingUp, 
  TrendingDown,
  Users,
  PawPrint,
  Mail,
  RefreshCcw,
  Calendar,
  AlertTriangle,
  Loader2,
  Syringe
} from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ComplianceStats {
  totalReminders: number;
  activeReminders: number;
  confirmedToday: number;
  overdueReminders: number;
  complianceRate: number;
}

interface ReminderWithDetails {
  id: string;
  animalId: string;
  animalName: string;
  adopterName: string;
  adopterEmail: string;
  medicationName: string;
  dosage?: string;
  frequency: string;
  nextDueDate: string;
  lastConfirmedDate?: string;
  lastNotifiedDate?: string;
  isOverdue: boolean;
  daysSinceConfirmation?: number;
}

interface ConfirmationLog {
  id: string;
  animalName: string;
  medicationName: string;
  confirmedAt: string;
  confirmationMethod: string;
  adopterName: string;
}

interface ExpiringSoonItem {
  id: string;
  animalId: string;
  animalName: string;
  medicationName: string;
  nextDueDate: string;
  adopterName: string;
  adopterEmail: string;
  daysUntilDue: number;
}

interface AtRiskAdopter {
  userId: string;
  name: string;
  email: string;
  missedCount: number;
  oldestMissedDate: string;
  reminders: Array<{
    id: string;
    animalName: string;
    medicationName: string;
    dueDate: string;
    daysMissed: number;
  }>;
}

export default function AdopterCompliancePage() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [nudgingUserId, setNudgingUserId] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading } = useQuery<ComplianceStats>({
    queryKey: ["/api/adopter/staff/compliance/stats"],
  });

  const { data: reminders, isLoading: remindersLoading } = useQuery<ReminderWithDetails[]>({
    queryKey: ["/api/adopter/staff/compliance/reminders"],
  });

  const { data: recentConfirmations, isLoading: confirmationsLoading } = useQuery<ConfirmationLog[]>({
    queryKey: ["/api/adopter/staff/compliance/confirmations"],
  });

  const { data: expiringSoon, isLoading: expiringSoonLoading } = useQuery<ExpiringSoonItem[]>({
    queryKey: ["/api/adopter/staff/compliance/expiring-soon"],
  });

  const { data: atRiskAdopters, isLoading: atRiskLoading } = useQuery<AtRiskAdopter[]>({
    queryKey: ["/api/adopter/staff/compliance/at-risk"],
  });

  const nudgeMutation = useMutation({
    mutationFn: async (userId: string) => {
      setNudgingUserId(userId);
      const response = await apiRequest("POST", `/api/adopter/staff/compliance/nudge/${userId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Nudge sent",
        description: "A friendly reminder email has been sent to the adopter",
      });
      setNudgingUserId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send nudge",
        description: error.message || "Please try again",
        variant: "destructive",
      });
      setNudgingUserId(null);
    },
  });

  const filteredReminders = reminders?.filter(r => 
    r.animalName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.adopterName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.medicationName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const overdueReminders = filteredReminders?.filter(r => r.isOverdue) || [];
  const upcomingReminders = filteredReminders?.filter(r => !r.isOverdue) || [];

  if (statsLoading) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Medication Compliance Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-compliance">
            Medication Compliance Dashboard
          </h1>
          <p className="text-muted-foreground">
            Track adopter medication compliance and follow-ups
          </p>
        </div>
        <Button variant="outline" size="sm">
          <RefreshCcw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Reminders</p>
                <p className="text-3xl font-bold" data-testid="stat-active-reminders">
                  {stats?.activeReminders || 0}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Pill className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Confirmed Today</p>
                <p className="text-3xl font-bold text-green-600" data-testid="stat-confirmed-today">
                  {stats?.confirmedToday || 0}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-3xl font-bold text-orange-600" data-testid="stat-overdue">
                  {stats?.overdueReminders || 0}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Compliance Rate</p>
                <p className="text-3xl font-bold" data-testid="stat-compliance-rate">
                  {stats?.complianceRate || 0}%
                </p>
              </div>
              <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
                (stats?.complianceRate || 0) >= 80 ? 'bg-green-100' : 'bg-orange-100'
              }`}>
                {(stats?.complianceRate || 0) >= 80 ? (
                  <TrendingUp className="h-6 w-6 text-green-600" />
                ) : (
                  <TrendingDown className="h-6 w-6 text-orange-600" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 flex-wrap gap-1">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="overdue" data-testid="tab-overdue">
            Overdue ({overdueReminders.length})
          </TabsTrigger>
          <TabsTrigger value="expiring" data-testid="tab-expiring">
            Expiring Soon ({expiringSoon?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="at-risk" data-testid="tab-at-risk">
            At-Risk ({atRiskAdopters?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="upcoming" data-testid="tab-upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">Activity</TabsTrigger>
        </TabsList>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by animal, adopter, or medication..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-compliance"
          />
        </div>

        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Overdue Reminders Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-orange-600" />
                  Needs Attention
                </CardTitle>
                <CardDescription>
                  Reminders that are overdue or haven't been confirmed
                </CardDescription>
              </CardHeader>
              <CardContent>
                {remindersLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : overdueReminders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-600" />
                    <p>All reminders are up to date!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {overdueReminders.slice(0, 5).map((reminder) => (
                      <div
                        key={reminder.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20"
                        data-testid={`reminder-overdue-${reminder.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <PawPrint className="h-8 w-8 text-orange-600" />
                          <div>
                            <p className="font-medium">{reminder.animalName}</p>
                            <p className="text-sm text-muted-foreground">
                              {reminder.medicationName} - {reminder.adopterName}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant="destructive" className="text-xs">
                            {reminder.daysSinceConfirmation} days overdue
                          </Badge>
                        </div>
                      </div>
                    ))}
                    {overdueReminders.length > 5 && (
                      <Button 
                        variant="ghost" 
                        className="w-full" 
                        onClick={() => setActiveTab("overdue")}
                      >
                        View all {overdueReminders.length} overdue reminders
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Confirmations */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Recent Confirmations
                </CardTitle>
                <CardDescription>
                  Medications confirmed in the last 24 hours
                </CardDescription>
              </CardHeader>
              <CardContent>
                {confirmationsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (recentConfirmations?.length || 0) === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-8 w-8 mx-auto mb-2" />
                    <p>No recent confirmations</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentConfirmations?.slice(0, 5).map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                        data-testid={`confirmation-${log.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="h-8 w-8 text-green-600" />
                          <div>
                            <p className="font-medium">{log.animalName}</p>
                            <p className="text-sm text-muted-foreground">
                              {log.medicationName} - {log.adopterName}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            {new Date(log.confirmedAt).toLocaleTimeString()}
                          </p>
                          <Badge variant="secondary" className="text-xs">
                            {log.confirmationMethod}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="overdue">
          <Card>
            <CardHeader>
              <CardTitle>Overdue Reminders</CardTitle>
              <CardDescription>
                These adopters haven't confirmed their pet's medication
              </CardDescription>
            </CardHeader>
            <CardContent>
              {overdueReminders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-600" />
                  <p className="text-lg">No overdue reminders!</p>
                  <p className="text-sm">All adopters are up to date with medications.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {overdueReminders.map((reminder) => (
                    <div
                      key={reminder.id}
                      className="flex items-center justify-between p-4 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20"
                      data-testid={`reminder-detail-${reminder.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <PawPrint className="h-10 w-10 text-orange-600" />
                        <div>
                          <p className="font-semibold text-lg">{reminder.animalName}</p>
                          <p className="text-muted-foreground">
                            {reminder.medicationName}
                            {reminder.dosage && ` - ${reminder.dosage}`}
                          </p>
                          <p className="text-sm mt-1">
                            <span className="font-medium">Adopter:</span> {reminder.adopterName}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex flex-col gap-2 items-end">
                        <Badge variant="destructive">
                          {reminder.daysSinceConfirmation} days overdue
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          Due: {new Date(reminder.nextDueDate).toLocaleDateString()}
                        </p>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => window.open(`mailto:${reminder.adopterEmail}`)}
                        >
                          <Mail className="h-4 w-4 mr-1" />
                          Contact
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="upcoming">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Reminders</CardTitle>
              <CardDescription>
                Medications due soon
              </CardDescription>
            </CardHeader>
            <CardContent>
              {upcomingReminders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4" />
                  <p>No upcoming reminders</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingReminders.map((reminder) => (
                    <div
                      key={reminder.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                      data-testid={`reminder-upcoming-${reminder.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <Clock className="h-8 w-8 text-primary" />
                        <div>
                          <p className="font-medium">{reminder.animalName}</p>
                          <p className="text-sm text-muted-foreground">
                            {reminder.medicationName} - {reminder.adopterName}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          Due: {new Date(reminder.nextDueDate).toLocaleDateString()}
                        </p>
                        <Badge variant="secondary" className="text-xs">
                          {reminder.frequency}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expiring">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Syringe className="h-5 w-5 text-blue-600" />
                Expiring in Next 30 Days
              </CardTitle>
              <CardDescription>
                Vaccine boosters and preventatives coming due soon
              </CardDescription>
            </CardHeader>
            <CardContent>
              {expiringSoonLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (expiringSoon?.length || 0) === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 text-green-600" />
                  <p className="text-lg">No upcoming expirations</p>
                  <p className="text-sm">All boosters are scheduled beyond 30 days</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {expiringSoon?.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-4 rounded-lg border"
                      data-testid={`expiring-${item.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                          item.daysUntilDue <= 7 ? 'bg-orange-100' : 'bg-blue-100'
                        }`}>
                          <Syringe className={`h-5 w-5 ${
                            item.daysUntilDue <= 7 ? 'text-orange-600' : 'text-blue-600'
                          }`} />
                        </div>
                        <div>
                          <p className="font-semibold">{item.animalName}</p>
                          <p className="text-muted-foreground">{item.medicationName}</p>
                          <p className="text-sm">Adopter: {item.adopterName}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={item.daysUntilDue <= 7 ? "destructive" : "secondary"}>
                          {item.daysUntilDue} days
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          Due: {new Date(item.nextDueDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="at-risk">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                At-Risk Adopters
              </CardTitle>
              <CardDescription>
                Adopters who have missed 2 or more consecutive medication confirmations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {atRiskLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : (atRiskAdopters?.length || 0) === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-600" />
                  <p className="text-lg">No at-risk adopters</p>
                  <p className="text-sm">All adopters are staying on top of their pet's health</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {atRiskAdopters?.map((adopter) => (
                    <div
                      key={adopter.userId}
                      className="p-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20"
                      data-testid={`at-risk-${adopter.userId}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                            <Users className="h-5 w-5 text-red-600" />
                          </div>
                          <div>
                            <p className="font-semibold">{adopter.name}</p>
                            <p className="text-sm text-muted-foreground">{adopter.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="destructive">
                            {adopter.missedCount} missed
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => nudgeMutation.mutate(adopter.userId)}
                            disabled={nudgingUserId === adopter.userId}
                            data-testid={`button-nudge-${adopter.userId}`}
                          >
                            {nudgingUserId === adopter.userId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Mail className="h-4 w-4 mr-1" />
                                Nudge
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                      <div className="ml-13 space-y-1">
                        {adopter.reminders.slice(0, 3).map((r) => (
                          <div key={r.id} className="flex items-center gap-2 text-sm">
                            <PawPrint className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{r.animalName}:</span>
                            <span className="text-muted-foreground">{r.medicationName}</span>
                            <Badge variant="outline" className="text-xs">
                              {r.daysMissed} days overdue
                            </Badge>
                          </div>
                        ))}
                        {adopter.reminders.length > 3 && (
                          <p className="text-xs text-muted-foreground">
                            +{adopter.reminders.length - 3} more missed reminders
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Confirmation Activity</CardTitle>
              <CardDescription>
                Recent medication confirmations from adopters
              </CardDescription>
            </CardHeader>
            <CardContent>
              {confirmationsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (recentConfirmations?.length || 0) === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4" />
                  <p>No confirmation activity yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentConfirmations?.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                      data-testid={`activity-${log.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-8 w-8 text-green-600" />
                        <div>
                          <p className="font-medium">
                            {log.adopterName} confirmed {log.medicationName}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {log.animalName}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm">
                          {new Date(log.confirmedAt).toLocaleString()}
                        </p>
                        <Badge variant="outline" className="text-xs">
                          via {log.confirmationMethod}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

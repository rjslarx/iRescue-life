import { useQuery } from "@tanstack/react-query";
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
  RefreshCcw
} from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";

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

export default function AdopterCompliancePage() {
  const { tenant } = useTenant();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const { data: stats, isLoading: statsLoading } = useQuery<ComplianceStats>({
    queryKey: ["/api/adopter/staff/compliance/stats"],
  });

  const { data: reminders, isLoading: remindersLoading } = useQuery<ReminderWithDetails[]>({
    queryKey: ["/api/adopter/staff/compliance/reminders"],
  });

  const { data: recentConfirmations, isLoading: confirmationsLoading } = useQuery<ConfirmationLog[]>({
    queryKey: ["/api/adopter/staff/compliance/confirmations"],
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
        <TabsList className="mb-4">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="overdue" data-testid="tab-overdue">
            Overdue ({overdueReminders.length})
          </TabsTrigger>
          <TabsTrigger value="upcoming" data-testid="tab-upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">Recent Activity</TabsTrigger>
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

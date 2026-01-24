import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  AlertTriangle, 
  Package, 
  FileText, 
  Camera, 
  CheckCircle2, 
  XCircle, 
  Clock,
  Pill,
  Heart,
  ChevronRight,
  Mail,
  AlertCircle,
  Loader2,
  Eye,
  RefreshCcw
} from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import DashboardLayout from "@/components/DashboardLayout";
import { Link } from "wouter";

interface ActionItem {
  id: string;
  type: 'supply_request' | 'bio_submission' | 'behavior_alert' | 'photo_approval' | 'happy_tail';
  category: 'logistics' | 'content' | 'medical' | 'marketing';
  title: string;
  description: string;
  animalId: string;
  animalName: string;
  personName: string;
  status: string;
  data: any;
  createdAt: string;
}

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

interface FosterDashboardStats {
  pendingSupplyRequests: number;
  pendingBioSubmissions: number;
  flaggedNotes: number;
  pendingPhotoApprovals: number;
}

export default function OperationsDashboardPage() {
  const { tenant } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("action-center");
  const [complianceTab, setComplianceTab] = useState("overdue");

  const { data: actionItems, isLoading: actionLoading, refetch: refetchActions } = useQuery<{ actionItems: ActionItem[] }>({
    queryKey: ["/api/foster-portal/staff/action-center"],
  });

  const { data: fosterStats, isLoading: fosterStatsLoading } = useQuery<FosterDashboardStats>({
    queryKey: ["/api/foster-portal/staff/dashboard"],
  });

  const { data: complianceStats, isLoading: complianceLoading } = useQuery<ComplianceStats>({
    queryKey: ["/api/adopter/staff/compliance/stats"],
  });

  const { data: overdueReminders } = useQuery<ReminderWithDetails[]>({
    queryKey: ["/api/adopter/staff/compliance/reminders", { status: "overdue" }],
  });

  const { data: atRiskAdopters, isLoading: atRiskLoading } = useQuery<any[]>({
    queryKey: ["/api/adopter/staff/compliance/at-risk"],
  });

  const updateSupplyMutation = useMutation({
    mutationFn: async ({ requestId, status }: { requestId: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/foster-portal/staff/supply-requests/${requestId}`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/foster-portal/staff/action-center"] });
      queryClient.invalidateQueries({ queryKey: ["/api/foster-portal/staff/dashboard"] });
      toast({ title: "Supply request updated" });
    },
  });

  const updateBioMutation = useMutation({
    mutationFn: async ({ bioId, status, applyToAnimal }: { bioId: string; status: string; applyToAnimal?: boolean }) => {
      const response = await apiRequest("PATCH", `/api/foster-portal/staff/bio-submissions/${bioId}`, { status, applyToAnimal });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/foster-portal/staff/action-center"] });
      queryClient.invalidateQueries({ queryKey: ["/api/foster-portal/staff/dashboard"] });
      toast({ title: "Bio submission updated" });
    },
  });

  const reviewNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const response = await apiRequest("PATCH", `/api/foster-portal/staff/behavior-notes/${noteId}/review`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/foster-portal/staff/action-center"] });
      queryClient.invalidateQueries({ queryKey: ["/api/foster-portal/staff/dashboard"] });
      toast({ title: "Note marked as reviewed" });
    },
  });

  const approvePhotoMutation = useMutation({
    mutationFn: async (photoId: string) => {
      const response = await apiRequest("PATCH", `/api/foster-portal/staff/photo-uploads/${photoId}/approve`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/foster-portal/staff/action-center"] });
      queryClient.invalidateQueries({ queryKey: ["/api/foster-portal/staff/dashboard"] });
      toast({ title: "Photo approved" });
    },
  });

  const approveHappyTailMutation = useMutation({
    mutationFn: async (updateId: string) => {
      const response = await apiRequest("PATCH", `/api/foster-portal/staff/happy-tail-updates/${updateId}/approve`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/foster-portal/staff/action-center"] });
      toast({ title: "Happy tail approved" });
    },
  });

  const promoteHappyTailMutation = useMutation({
    mutationFn: async (updateId: string) => {
      const response = await apiRequest("POST", `/api/foster-portal/staff/happy-tail-updates/${updateId}/promote`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/foster-portal/staff/action-center"] });
      queryClient.invalidateQueries({ queryKey: ["/api/happy-tails"] });
      toast({ title: "Added to Success Stories!" });
    },
  });

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'supply_request': return <Package className="h-4 w-4" />;
      case 'bio_submission': return <FileText className="h-4 w-4" />;
      case 'behavior_alert': return <AlertTriangle className="h-4 w-4" />;
      case 'photo_approval': return <Camera className="h-4 w-4" />;
      case 'happy_tail': return <Heart className="h-4 w-4" />;
      default: return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getActionBadgeColor = (type: string) => {
    switch (type) {
      case 'supply_request': return 'secondary';
      case 'bio_submission': return 'default';
      case 'behavior_alert': return 'destructive';
      case 'photo_approval': return 'outline';
      case 'happy_tail': return 'default';
      default: return 'secondary';
    }
  };

  const pendingHappyTails = actionItems?.actionItems?.filter(item => item.type === 'happy_tail')?.length || 0;
  const totalPendingItems = (fosterStats?.pendingSupplyRequests || 0) + 
    (fosterStats?.pendingBioSubmissions || 0) + 
    (fosterStats?.flaggedNotes || 0) + 
    (fosterStats?.pendingPhotoApprovals || 0) +
    pendingHappyTails;

  const totalComplianceIssues = (complianceStats?.overdueReminders || 0);

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Operations Dashboard</h1>
            <p className="text-muted-foreground">Monitor compliance and manage incoming requests from adopters and fosters</p>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              refetchActions();
              queryClient.invalidateQueries({ queryKey: ["/api/adopter/staff/compliance/stats"] });
              queryClient.invalidateQueries({ queryKey: ["/api/adopter/staff/compliance/reminders"] });
              queryClient.invalidateQueries({ queryKey: ["/api/adopter/staff/compliance/at-risk"] });
              queryClient.invalidateQueries({ queryKey: ["/api/foster-portal/staff/dashboard"] });
            }}
            data-testid="button-refresh"
          >
            <RefreshCcw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Action Items</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-action-items-count">{totalPendingItems}</div>
              <p className="text-xs text-muted-foreground">Pending requests to process</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Overdue Meds</CardTitle>
              <Pill className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-overdue-meds-count">{complianceStats?.overdueReminders || 0}</div>
              <p className="text-xs text-muted-foreground">Adopters behind on medication</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Compliance Rate</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-compliance-rate">
                {complianceStats?.complianceRate?.toFixed(0) || 0}%
              </div>
              <p className="text-xs text-muted-foreground">Medication confirmations</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Behavior Alerts</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-behavior-alerts-count">{fosterStats?.flaggedNotes || 0}</div>
              <p className="text-xs text-muted-foreground">Flagged for review</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Compliance Monitor
              </CardTitle>
              <CardDescription>People who need follow-up (the "silence")</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={complianceTab} onValueChange={setComplianceTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="overdue" data-testid="tab-overdue-meds">Overdue Meds</TabsTrigger>
                  <TabsTrigger value="at-risk" data-testid="tab-at-risk">At-Risk Adopters</TabsTrigger>
                </TabsList>
                <TabsContent value="overdue" className="mt-4">
                  <ScrollArea className="h-[300px]">
                    {complianceLoading ? (
                      <div className="space-y-3">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                      </div>
                    ) : overdueReminders && overdueReminders.length > 0 ? (
                      <div className="space-y-3">
                        {overdueReminders.slice(0, 10).map((reminder) => (
                          <div 
                            key={reminder.id} 
                            className="flex items-center justify-between p-3 bg-destructive/10 rounded-lg border border-destructive/20"
                            data-testid={`card-overdue-${reminder.id}`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Pill className="h-4 w-4 text-destructive flex-shrink-0" />
                                <span className="font-medium truncate">{reminder.animalName}</span>
                              </div>
                              <p className="text-sm text-muted-foreground truncate">
                                {reminder.medicationName} - {reminder.adopterName}
                              </p>
                              <p className="text-xs text-destructive">
                                Due: {format(new Date(reminder.nextDueDate), 'MMM d, yyyy')}
                              </p>
                            </div>
                            <Link href={`/adopter-compliance`}>
                              <Button variant="ghost" size="sm" data-testid={`button-view-${reminder.id}`}>
                                <Mail className="h-4 w-4" />
                              </Button>
                            </Link>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                        <CheckCircle2 className="h-8 w-8 mb-2 text-green-500" />
                        <p>All medication reminders up to date!</p>
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="at-risk" className="mt-4">
                  <ScrollArea className="h-[300px]">
                    {atRiskLoading ? (
                      <div className="space-y-3">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                      </div>
                    ) : atRiskAdopters && atRiskAdopters.length > 0 ? (
                      <div className="space-y-3">
                        {atRiskAdopters.map((adopter: any) => (
                          <div 
                            key={adopter.userId} 
                            className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20"
                            data-testid={`card-at-risk-${adopter.userId}`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{adopter.name}</p>
                                <p className="text-sm text-muted-foreground">{adopter.email}</p>
                              </div>
                              <Badge variant="destructive">{adopter.missedCount} missed</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                        <CheckCircle2 className="h-8 w-8 mb-2 text-green-500" />
                        <p>No at-risk adopters</p>
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
              </Tabs>
              <div className="mt-4 pt-4 border-t">
                <Link href="/adopter-compliance">
                  <Button variant="outline" className="w-full" data-testid="button-view-compliance">
                    View Full Compliance Dashboard
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                Action Center
              </CardTitle>
              <CardDescription>Incoming requests to process (the "noise")</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[380px]">
                {actionLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 w-full" />)}
                  </div>
                ) : actionItems?.actionItems && actionItems.actionItems.length > 0 ? (
                  <div className="space-y-3">
                    {actionItems.actionItems.map((item) => (
                      <div 
                        key={`${item.type}-${item.id}`} 
                        className="p-3 bg-muted rounded-lg border"
                        data-testid={`card-action-${item.type}-${item.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <div className={`mt-0.5 p-1.5 rounded-full ${
                              item.type === 'behavior_alert' ? 'bg-destructive/20 text-destructive' :
                              item.type === 'supply_request' ? 'bg-blue-500/20 text-blue-500' :
                              item.type === 'photo_approval' ? 'bg-purple-500/20 text-purple-500' :
                              item.type === 'happy_tail' ? 'bg-pink-500/20 text-pink-500' :
                              'bg-primary/20 text-primary'
                            }`}>
                              {getActionIcon(item.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant={getActionBadgeColor(item.type) as any} className="text-xs">
                                  {item.type.replace(/_/g, ' ')}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                                </span>
                              </div>
                              <p className="font-medium text-sm mt-1">{item.animalName}</p>
                              <p className="text-sm text-muted-foreground truncate">{item.description}</p>
                            </div>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            {item.type === 'supply_request' && (
                              <>
                                {item.status === 'pending' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => updateSupplyMutation.mutate({ requestId: item.id, status: 'preparing' })}
                                    disabled={updateSupplyMutation.isPending}
                                    data-testid={`button-prepare-${item.id}`}
                                  >
                                    Prepare
                                  </Button>
                                )}
                                {item.status === 'preparing' && (
                                  <Button
                                    size="sm"
                                    onClick={() => updateSupplyMutation.mutate({ requestId: item.id, status: 'ready' })}
                                    disabled={updateSupplyMutation.isPending}
                                    data-testid={`button-ready-${item.id}`}
                                  >
                                    Ready
                                  </Button>
                                )}
                                {item.status === 'ready' && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => updateSupplyMutation.mutate({ requestId: item.id, status: 'completed' })}
                                    disabled={updateSupplyMutation.isPending}
                                    data-testid={`button-complete-${item.id}`}
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </>
                            )}
                            {item.type === 'bio_submission' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateBioMutation.mutate({ bioId: item.id, status: 'approved', applyToAnimal: true })}
                                  disabled={updateBioMutation.isPending}
                                  data-testid={`button-approve-bio-${item.id}`}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => updateBioMutation.mutate({ bioId: item.id, status: 'rejected' })}
                                  disabled={updateBioMutation.isPending}
                                  data-testid={`button-reject-bio-${item.id}`}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {item.type === 'behavior_alert' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => reviewNoteMutation.mutate(item.id)}
                                disabled={reviewNoteMutation.isPending}
                                data-testid={`button-review-${item.id}`}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Review
                              </Button>
                            )}
                            {item.type === 'photo_approval' && (
                              <Button
                                size="sm"
                                onClick={() => approvePhotoMutation.mutate(item.id)}
                                disabled={approvePhotoMutation.isPending}
                                data-testid={`button-approve-photo-${item.id}`}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            )}
                            {item.type === 'happy_tail' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => approveHappyTailMutation.mutate(item.id)}
                                  disabled={approveHappyTailMutation.isPending}
                                  data-testid={`button-approve-happy-tail-${item.id}`}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => promoteHappyTailMutation.mutate(item.id)}
                                  disabled={promoteHappyTailMutation.isPending}
                                  data-testid={`button-promote-${item.id}`}
                                >
                                  <Heart className="h-4 w-4 mr-1" />
                                  Story
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mb-2 text-green-500" />
                    <p>All caught up! No pending actions.</p>
                  </div>
                )}
              </ScrollArea>
              <div className="mt-4 pt-4 border-t">
                <Link href="/foster-management">
                  <Button variant="outline" className="w-full" data-testid="button-view-foster-management">
                    View Foster Management
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

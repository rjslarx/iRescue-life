import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Bell, Clock, Users, AlertCircle, CheckCircle2, Edit, Play, History, MessageSquare, Mail, Smartphone, Calendar } from "lucide-react";
import { z } from "zod";
import { format } from "date-fns";

interface CalendarInfo {
  id: string;
  name: string;
  type: string;
  color: string;
}

const alertSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  isEnabled: z.boolean().default(true),
  minimumVolunteers: z.number().int().min(1).max(50).default(2),
  daysAhead: z.number().int().min(1).max(30).default(3),
  pushEnabled: z.boolean().default(true),
  smsEnabled: z.boolean().default(false),
  emailEnabled: z.boolean().default(true),
  targetAllVolunteers: z.boolean().default(true),
  targetRoles: z.array(z.string()).optional(),
  calendarIds: z.array(z.string()).optional(),
  checkTime: z.string().regex(/^\d{2}:\d{2}$/).default("09:00"),
  daysOfWeek: z.array(z.string()).min(1, "Select at least one day"),
  messageTemplate: z.string().max(500).optional(),
});

type AlertFormData = z.infer<typeof alertSchema>;

interface VolunteerThresholdAlert {
  id: string;
  name: string;
  isEnabled: boolean;
  minimumVolunteers: number;
  daysAhead: number;
  pushEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  targetAllVolunteers: boolean;
  targetRoles: string[] | null;
  calendarIds: string[] | null;
  checkTime: string;
  daysOfWeek: string[];
  messageTemplate: string | null;
  lastCheckedAt: string | null;
  lastAlertSentAt: string | null;
  createdAt: string;
}

interface AlertHistory {
  id: string;
  opportunityTitle: string | null;
  currentVolunteers: number;
  minimumRequired: number;
  pushSent: number;
  smsSent: number;
  emailSent: number;
  totalRecipients: number;
  createdAt: string;
}

const DAYS_OF_WEEK = [
  { value: "sun", label: "Sun" },
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
];

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "staff", label: "Staff" },
  { value: "volunteer", label: "Volunteer" },
  { value: "foster", label: "Foster" },
  { value: "board_member", label: "Board Member" },
];

export function VolunteerAlertSettings() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<VolunteerThresholdAlert | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const { data: alertsData, isLoading } = useQuery<{ alerts: VolunteerThresholdAlert[] }>({
    queryKey: ["/api/volunteer-alerts"],
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<{ history: AlertHistory[] }>({
    queryKey: ["/api/volunteer-alerts/history"],
    enabled: showHistory,
  });

  const { data: calendarsData } = useQuery<{ calendars: CalendarInfo[] }>({
    queryKey: ["/api/calendars"],
  });

  const availableCalendars = calendarsData?.calendars || [];

  const createMutation = useMutation({
    mutationFn: async (data: AlertFormData) => {
      return apiRequest("/api/volunteer-alerts", { method: "POST", body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-alerts"] });
      setIsCreateDialogOpen(false);
      toast({ title: "Alert created", description: "Volunteer threshold alert has been created." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AlertFormData> }) => {
      return apiRequest(`/api/volunteer-alerts/${id}`, { method: "PATCH", body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-alerts"] });
      setEditingAlert(null);
      toast({ title: "Alert updated", description: "Volunteer threshold alert has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/volunteer-alerts/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-alerts"] });
      toast({ title: "Alert deleted", description: "Volunteer threshold alert has been deleted." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/volunteer-alerts/${id}/test`, { method: "POST" });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-alerts/history"] });
      const calendarShortages = data.result?.calendarShortages?.length || 0;
      const legacyShortages = data.result?.shortages?.length || 0;
      const totalShortages = calendarShortages + legacyShortages;
      
      if (totalShortages > 0) {
        toast({ 
          title: "Test alert sent", 
          description: `Found ${totalShortages} day(s) with volunteer shortages. Notifications sent.` 
        });
      } else {
        toast({ 
          title: "No shortages", 
          description: "All upcoming calendar days have sufficient volunteers." 
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Test failed", description: error.message, variant: "destructive" });
    },
  });

  const toggleEnabled = (alert: VolunteerThresholdAlert) => {
    updateMutation.mutate({ id: alert.id, data: { isEnabled: !alert.isEnabled } });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const alerts = alertsData?.alerts || [];
  const history = historyData?.history || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium" data-testid="text-volunteer-alerts-title">Volunteer Threshold Alerts</h3>
          <p className="text-sm text-muted-foreground">
            Get notified when volunteer opportunities don't have enough signups
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setShowHistory(!showHistory)}
            data-testid="button-toggle-history"
          >
            <History className="h-4 w-4 mr-2" />
            {showHistory ? "Hide" : "Show"} History
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-alert">
                <Plus className="h-4 w-4 mr-2" />
                New Alert
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Volunteer Threshold Alert</DialogTitle>
                <DialogDescription>
                  Configure when and how to notify staff about volunteer shortages on your calendars
                </DialogDescription>
              </DialogHeader>
              <AlertForm
                onSubmit={(data) => createMutation.mutate(data)}
                isPending={createMutation.isPending}
                calendars={availableCalendars}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {alerts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No alerts configured</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create an alert to get notified when volunteer opportunities need more signups
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-alert">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Alert
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <Card key={alert.id} data-testid={`card-alert-${alert.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={alert.isEnabled}
                      onCheckedChange={() => toggleEnabled(alert)}
                      data-testid={`switch-alert-${alert.id}`}
                    />
                    <div>
                      <CardTitle className="text-base">{alert.name}</CardTitle>
                      <CardDescription className="text-sm">
                        Alert when {"<"} {alert.minimumVolunteers} volunteers, {alert.daysAhead} days ahead
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {alert.isEnabled ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-50 text-gray-500">
                        Disabled
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {alert.checkTime}
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {alert.calendarIds && alert.calendarIds.length > 0 
                      ? `${alert.calendarIds.length} calendar(s)` 
                      : "All volunteer calendars"}
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {alert.targetAllVolunteers ? "All volunteers" : alert.targetRoles?.join(", ")}
                  </div>
                  <div className="flex items-center gap-2">
                    {alert.pushEnabled && (
                      <Badge variant="secondary" className="text-xs">
                        <Bell className="h-3 w-3 mr-1" />
                        Push
                      </Badge>
                    )}
                    {alert.emailEnabled && (
                      <Badge variant="secondary" className="text-xs">
                        <Mail className="h-3 w-3 mr-1" />
                        Email
                      </Badge>
                    )}
                    {alert.smsEnabled && (
                      <Badge variant="secondary" className="text-xs">
                        <Smartphone className="h-3 w-3 mr-1" />
                        SMS
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                  <span>Days: {alert.daysOfWeek.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")}</span>
                  {alert.lastCheckedAt && (
                    <>
                      <span>•</span>
                      <span>Last checked: {format(new Date(alert.lastCheckedAt), "MMM d, h:mm a")}</span>
                    </>
                  )}
                </div>
                <Separator className="my-3" />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testMutation.mutate(alert.id)}
                    disabled={testMutation.isPending}
                    data-testid={`button-test-alert-${alert.id}`}
                  >
                    {testMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Play className="h-4 w-4 mr-1" />
                    )}
                    Test
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingAlert(alert)}
                    data-testid={`button-edit-alert-${alert.id}`}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteMutation.mutate(alert.id)}
                    disabled={deleteMutation.isPending}
                    className="text-destructive hover:text-destructive"
                    data-testid={`button-delete-alert-${alert.id}`}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showHistory && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alert History</CardTitle>
            <CardDescription>Recent volunteer shortage alerts that were sent</CardDescription>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No alerts have been sent yet</p>
            ) : (
              <div className="space-y-3">
                {history.slice(0, 10).map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium text-sm">{item.opportunityTitle || "Unknown opportunity"}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.currentVolunteers}/{item.minimumRequired} volunteers • {format(new Date(item.createdAt), "MMM d, h:mm a")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {item.pushSent > 0 && <Badge variant="secondary">Push: {item.pushSent}</Badge>}
                      {item.emailSent > 0 && <Badge variant="secondary">Email: {item.emailSent}</Badge>}
                      {item.smsSent > 0 && <Badge variant="secondary">SMS: {item.smsSent}</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!editingAlert} onOpenChange={(open) => !open && setEditingAlert(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Volunteer Threshold Alert</DialogTitle>
            <DialogDescription>
              Update the alert configuration
            </DialogDescription>
          </DialogHeader>
          {editingAlert && (
            <AlertForm
              defaultValues={{
                name: editingAlert.name,
                isEnabled: editingAlert.isEnabled,
                minimumVolunteers: editingAlert.minimumVolunteers,
                daysAhead: editingAlert.daysAhead,
                pushEnabled: editingAlert.pushEnabled,
                smsEnabled: editingAlert.smsEnabled,
                emailEnabled: editingAlert.emailEnabled,
                targetAllVolunteers: editingAlert.targetAllVolunteers,
                targetRoles: editingAlert.targetRoles || [],
                calendarIds: editingAlert.calendarIds || [],
                checkTime: editingAlert.checkTime,
                daysOfWeek: editingAlert.daysOfWeek,
                messageTemplate: editingAlert.messageTemplate || "",
              }}
              onSubmit={(data) => updateMutation.mutate({ id: editingAlert.id, data })}
              isPending={updateMutation.isPending}
              calendars={availableCalendars}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AlertForm({
  defaultValues,
  onSubmit,
  isPending,
  calendars,
}: {
  defaultValues?: Partial<AlertFormData>;
  onSubmit: (data: AlertFormData) => void;
  isPending: boolean;
  calendars: CalendarInfo[];
}) {
  const form = useForm<AlertFormData>({
    resolver: zodResolver(alertSchema),
    defaultValues: {
      name: "",
      isEnabled: true,
      minimumVolunteers: 2,
      daysAhead: 3,
      pushEnabled: true,
      smsEnabled: false,
      emailEnabled: true,
      targetAllVolunteers: true,
      targetRoles: [],
      calendarIds: [],
      checkTime: "09:00",
      daysOfWeek: ["mon", "tue", "wed", "thu", "fri"],
      messageTemplate: "",
      ...defaultValues,
    },
  });

  const targetAllVolunteers = form.watch("targetAllVolunteers");
  const selectedCalendarIds = form.watch("calendarIds") || [];
  
  const volunteerCalendars = calendars.filter(c => c.type === "volunteer");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Alert Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g., Daily Volunteer Coverage Check" data-testid="input-alert-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="minimumVolunteers"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Minimum Volunteers</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    min={1} 
                    max={50}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                    data-testid="input-minimum-volunteers"
                  />
                </FormControl>
                <FormDescription>Alert when below this number</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="daysAhead"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Days Ahead</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    min={1} 
                    max={30}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                    data-testid="input-days-ahead"
                  />
                </FormControl>
                <FormDescription>Check opportunities within X days</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {volunteerCalendars.length > 0 && (
          <FormField
            control={form.control}
            name="calendarIds"
            render={() => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Calendars to Monitor
                </FormLabel>
                <FormDescription className="text-xs mb-2">
                  Select which volunteer calendars to check for shortages. If none selected, all volunteer calendars will be checked.
                </FormDescription>
                <div className="flex flex-wrap gap-2">
                  {volunteerCalendars.map((cal) => (
                    <FormField
                      key={cal.id}
                      control={form.control}
                      name="calendarIds"
                      render={({ field }) => (
                        <FormItem key={cal.id}>
                          <FormControl>
                            <Button
                              type="button"
                              variant={field.value?.includes(cal.id) ? "default" : "outline"}
                              size="sm"
                              className="gap-2"
                              onClick={() => {
                                const current = field.value || [];
                                if (current.includes(cal.id)) {
                                  field.onChange(current.filter((id) => id !== cal.id));
                                } else {
                                  field.onChange([...current, cal.id]);
                                }
                              }}
                              data-testid={`button-calendar-${cal.id}`}
                            >
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: cal.color }}
                              />
                              {cal.name}
                            </Button>
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
                {selectedCalendarIds.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    No calendars selected - will check all {volunteerCalendars.length} volunteer calendar(s)
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {volunteerCalendars.length === 0 && calendars.length > 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No volunteer-type calendars found. Create a calendar with type "volunteer" in Calendar Management to use threshold alerts.
            </AlertDescription>
          </Alert>
        )}

        <FormField
          control={form.control}
          name="checkTime"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Check Time (24h format)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="09:00" data-testid="input-check-time" />
              </FormControl>
              <FormDescription>Time of day to check for shortages (UTC)</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="daysOfWeek"
          render={() => (
            <FormItem>
              <FormLabel>Days to Check</FormLabel>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day) => (
                  <FormField
                    key={day.value}
                    control={form.control}
                    name="daysOfWeek"
                    render={({ field }) => (
                      <FormItem key={day.value}>
                        <FormControl>
                          <Button
                            type="button"
                            variant={field.value?.includes(day.value) ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              const current = field.value || [];
                              if (current.includes(day.value)) {
                                field.onChange(current.filter((d) => d !== day.value));
                              } else {
                                field.onChange([...current, day.value]);
                              }
                            }}
                            data-testid={`button-day-${day.value}`}
                          >
                            {day.label}
                          </Button>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />

        <div className="space-y-4">
          <h4 className="font-medium">Notification Channels</h4>
          <div className="flex flex-wrap gap-6">
            <FormField
              control={form.control}
              name="pushEnabled"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-push-enabled" />
                  </FormControl>
                  <FormLabel className="cursor-pointer">
                    <Bell className="h-4 w-4 inline mr-1" />
                    Push
                  </FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="emailEnabled"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-email-enabled" />
                  </FormControl>
                  <FormLabel className="cursor-pointer">
                    <Mail className="h-4 w-4 inline mr-1" />
                    Email
                  </FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="smsEnabled"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-sms-enabled" />
                  </FormControl>
                  <FormLabel className="cursor-pointer">
                    <Smartphone className="h-4 w-4 inline mr-1" />
                    SMS
                  </FormLabel>
                  <FormDescription className="text-xs">(requires Twilio)</FormDescription>
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <h4 className="font-medium">Notification Targets</h4>
          <FormField
            control={form.control}
            name="targetAllVolunteers"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2 space-y-0">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-target-all" />
                </FormControl>
                <FormLabel className="cursor-pointer">Notify all team members</FormLabel>
              </FormItem>
            )}
          />

          {!targetAllVolunteers && (
            <FormField
              control={form.control}
              name="targetRoles"
              render={() => (
                <FormItem>
                  <FormLabel>Select Roles to Notify</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {ROLES.map((role) => (
                      <FormField
                        key={role.value}
                        control={form.control}
                        name="targetRoles"
                        render={({ field }) => (
                          <FormItem key={role.value} className="flex items-center gap-1.5 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(role.value)}
                                onCheckedChange={(checked) => {
                                  const current = field.value || [];
                                  if (checked) {
                                    field.onChange([...current, role.value]);
                                  } else {
                                    field.onChange(current.filter((r) => r !== role.value));
                                  }
                                }}
                                data-testid={`checkbox-role-${role.value}`}
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal cursor-pointer">{role.label}</FormLabel>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        <FormField
          control={form.control}
          name="messageTemplate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Custom Message (optional)</FormLabel>
              <FormControl>
                <Input 
                  {...field} 
                  placeholder="Use {shortages} to insert the list of shortages" 
                  data-testid="input-message-template"
                />
              </FormControl>
              <FormDescription>Leave empty for default message</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button type="submit" disabled={isPending} data-testid="button-save-alert">
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save Alert
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export default VolunteerAlertSettings;

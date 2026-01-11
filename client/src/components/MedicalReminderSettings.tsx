import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Stethoscope, Save, Loader2, Bell, Users, Clock, Mail, AlertCircle, Send, CheckCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface MedicalReminderSettings {
  id?: string;
  isEnabled: boolean;
  vaccineLeadDays: number;
  prescriptionLeadDays: number;
  examLeadDays: number;
  procedureLeadDays: number;
  sendDailyDigest: boolean;
  sendIndividualAlerts: boolean;
  sendOverdueAlerts: boolean;
  notifyAdmins: boolean;
  notifyStaff: boolean;
  notifyFosters: boolean;
  requireFosterConfirmation: boolean;
  escalationHours: number;
}

interface ReminderLog {
  id: string;
  recipientEmail: string;
  emailType: string;
  itemCount: number;
  sentAt: string;
  status: string;
}

export default function MedicalReminderSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [settings, setSettings] = useState<MedicalReminderSettings>({
    isEnabled: true,
    vaccineLeadDays: 7,
    prescriptionLeadDays: 3,
    examLeadDays: 7,
    procedureLeadDays: 3,
    sendDailyDigest: true,
    sendIndividualAlerts: false,
    sendOverdueAlerts: true,
    notifyAdmins: true,
    notifyStaff: true,
    notifyFosters: true,
    requireFosterConfirmation: false,
    escalationHours: 24,
  });

  // Only admins can access this
  if (user?.activeRole !== 'admin') {
    return null;
  }

  const { data, isLoading, error } = useQuery<MedicalReminderSettings>({
    queryKey: ['/api/settings/medical-reminders'],
  });

  const { data: logsData, isLoading: isLoadingLogs } = useQuery<{ logs: ReminderLog[] }>({
    queryKey: ['/api/medical-reminders/logs'],
  });

  useEffect(() => {
    if (data) {
      setSettings(data);
    }
  }, [data]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: Partial<MedicalReminderSettings>) => {
      const response = await apiRequest('PUT', '/api/settings/medical-reminders', newSettings);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/medical-reminders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/medical-reminders'] });
      toast({
        title: "Settings saved",
        description: "Medical reminder settings have been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save settings",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const sendNowMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/medical-reminders/send', {});
      return response.json();
    },
    onSuccess: (data: { success: boolean; emailsSent: number; message: string }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/medical-reminders/logs'] });
      toast({
        title: data.success ? "Reminders sent" : "Some errors occurred",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send reminders",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateSettingsMutation.mutate(settings);
  };

  const handleToggle = (field: keyof MedicalReminderSettings) => {
    const newSettings = { ...settings, [field]: !settings[field as keyof typeof settings] };
    setSettings(newSettings);
  };

  const handleNumberChange = (field: keyof MedicalReminderSettings, value: number) => {
    const newSettings = { ...settings, [field]: value };
    setSettings(newSettings);
  };

  if (isLoading) {
    return (
      <Card data-testid="card-medical-reminder-settings-loading">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card data-testid="card-medical-reminder-settings-error">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5" />
            Medical Reminder Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Failed to load settings. Please refresh the page.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-medical-reminder-settings">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5" />
            <CardTitle>Medical Reminder Settings</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="reminders-enabled" className="text-sm">
              {settings.isEnabled ? "Enabled" : "Disabled"}
            </Label>
            <Switch
              id="reminders-enabled"
              checked={settings.isEnabled}
              onCheckedChange={() => handleToggle('isEnabled')}
              data-testid="switch-reminders-enabled"
            />
          </div>
        </div>
        <CardDescription>
          Configure automated email reminders for vaccines, medications, exams, and procedures.
          Reminders are sent daily at 8:00 AM UTC.
        </CardDescription>
      </CardHeader>
      
      {settings.isEnabled && (
        <CardContent className="space-y-6">
          {/* Lead Time Settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-medium">Lead Time (days before due date)</h4>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vaccine-lead">Vaccines</Label>
                <Input
                  id="vaccine-lead"
                  type="number"
                  min={1}
                  max={30}
                  value={settings.vaccineLeadDays}
                  onChange={(e) => handleNumberChange('vaccineLeadDays', parseInt(e.target.value) || 7)}
                  data-testid="input-vaccine-lead-days"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prescription-lead">Prescriptions</Label>
                <Input
                  id="prescription-lead"
                  type="number"
                  min={1}
                  max={30}
                  value={settings.prescriptionLeadDays}
                  onChange={(e) => handleNumberChange('prescriptionLeadDays', parseInt(e.target.value) || 3)}
                  data-testid="input-prescription-lead-days"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exam-lead">Exams</Label>
                <Input
                  id="exam-lead"
                  type="number"
                  min={1}
                  max={30}
                  value={settings.examLeadDays}
                  onChange={(e) => handleNumberChange('examLeadDays', parseInt(e.target.value) || 7)}
                  data-testid="input-exam-lead-days"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="procedure-lead">Procedures</Label>
                <Input
                  id="procedure-lead"
                  type="number"
                  min={1}
                  max={30}
                  value={settings.procedureLeadDays}
                  onChange={(e) => handleNumberChange('procedureLeadDays', parseInt(e.target.value) || 3)}
                  data-testid="input-procedure-lead-days"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Notification Types */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-medium">Email Notifications</h4>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="daily-digest">Daily Digest</Label>
                  <p className="text-sm text-muted-foreground">
                    Send a single summary email each morning
                  </p>
                </div>
                <Switch
                  id="daily-digest"
                  checked={settings.sendDailyDigest}
                  onCheckedChange={() => handleToggle('sendDailyDigest')}
                  data-testid="switch-daily-digest"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="overdue-alerts">Overdue Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Send immediate alerts for overdue items
                  </p>
                </div>
                <Switch
                  id="overdue-alerts"
                  checked={settings.sendOverdueAlerts}
                  onCheckedChange={() => handleToggle('sendOverdueAlerts')}
                  data-testid="switch-overdue-alerts"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="individual-alerts">Individual Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Send separate emails for each item (more emails)
                  </p>
                </div>
                <Switch
                  id="individual-alerts"
                  checked={settings.sendIndividualAlerts}
                  onCheckedChange={() => handleToggle('sendIndividualAlerts')}
                  data-testid="switch-individual-alerts"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Recipients */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-medium">Recipients</h4>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="notify-admins">Notify Admins</Label>
                  <p className="text-sm text-muted-foreground">
                    Send reminders to all admin users
                  </p>
                </div>
                <Switch
                  id="notify-admins"
                  checked={settings.notifyAdmins}
                  onCheckedChange={() => handleToggle('notifyAdmins')}
                  data-testid="switch-notify-admins"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="notify-staff">Notify Staff</Label>
                  <p className="text-sm text-muted-foreground">
                    Send reminders to staff members
                  </p>
                </div>
                <Switch
                  id="notify-staff"
                  checked={settings.notifyStaff}
                  onCheckedChange={() => handleToggle('notifyStaff')}
                  data-testid="switch-notify-staff"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="notify-fosters">Notify Foster Parents</Label>
                  <p className="text-sm text-muted-foreground">
                    Send reminders to foster parents about their animals
                  </p>
                </div>
                <Switch
                  id="notify-fosters"
                  checked={settings.notifyFosters}
                  onCheckedChange={() => handleToggle('notifyFosters')}
                  data-testid="switch-notify-fosters"
                />
              </div>
            </div>
          </div>

          {settings.notifyFosters && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <h4 className="font-medium">Foster Settings</h4>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="foster-confirm">Require Foster Confirmation</Label>
                    <p className="text-sm text-muted-foreground">
                      Ask foster parents to confirm they will handle the appointment
                    </p>
                  </div>
                  <Switch
                    id="foster-confirm"
                    checked={settings.requireFosterConfirmation}
                    onCheckedChange={() => handleToggle('requireFosterConfirmation')}
                    data-testid="switch-foster-confirm"
                  />
                </div>

                {settings.requireFosterConfirmation && (
                  <div className="space-y-2">
                    <Label htmlFor="escalation-hours">Escalation Time (hours)</Label>
                    <p className="text-sm text-muted-foreground">
                      If foster doesn't confirm within this time, notify staff
                    </p>
                    <Input
                      id="escalation-hours"
                      type="number"
                      min={1}
                      max={72}
                      value={settings.escalationHours}
                      onChange={(e) => handleNumberChange('escalationHours', parseInt(e.target.value) || 24)}
                      className="w-32"
                      data-testid="input-escalation-hours"
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Recent Logs */}
          {logsData && logsData.logs.length > 0 && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Recent Email Activity</h4>
                  <Badge variant="outline">{logsData.logs.length} emails sent</Badge>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {logsData.logs.slice(0, 5).map((log) => (
                    <div 
                      key={log.id} 
                      className="flex items-center justify-between p-2 rounded-md border text-sm"
                      data-testid={`log-entry-${log.id}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {log.status === 'sent' ? (
                          <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate">{log.recipientEmail}</p>
                          <p className="text-xs text-muted-foreground">
                            {log.emailType} • {log.itemCount} items
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(log.sentAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      )}
      
      <CardFooter className="flex justify-between gap-2 border-t pt-4">
        <Button
          variant="outline"
          onClick={() => sendNowMutation.mutate()}
          disabled={!settings.isEnabled || sendNowMutation.isPending}
          data-testid="button-send-now"
        >
          {sendNowMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Send Reminders Now
        </Button>
        <Button
          onClick={handleSave}
          disabled={updateSettingsMutation.isPending}
          data-testid="button-save-medical-settings"
        >
          {updateSettingsMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Settings
        </Button>
      </CardFooter>
    </Card>
  );
}

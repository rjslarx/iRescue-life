import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BellRing, Mail, MessageSquare, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AlertRule {
  id: string;
  deviceId: string | null;
  name: string;
  isEnabled: boolean;
  minTemperatureF: string | null;
  maxTemperatureF: string | null;
  minHumidityPercent: string | null;
  maxHumidityPercent: string | null;
  notifyEmail: boolean;
  notifySms: boolean;
  notificationEmails: string[] | null;
  notificationPhones: string[] | null;
  cooldownMinutes: number;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  lastTriggeredAt: string | null;
}

interface DeviceOption {
  id: string;
  deviceName: string;
  locationLabel: string | null;
}

interface FormState {
  name: string;
  isEnabled: boolean;
  deviceId: string;
  minTemperatureF: string;
  maxTemperatureF: string;
  minHumidityPercent: string;
  maxHumidityPercent: string;
  notifyEmail: boolean;
  notifySms: boolean;
  emailsText: string;
  phonesText: string;
  cooldownMinutes: string;
  quietHoursStart: string;
  quietHoursEnd: string;
}

interface FormErrors {
  name?: string;
  thresholds?: string;
  channels?: string;
  emails?: string;
  phones?: string;
}

const ALL_DEVICES_VALUE = "__all__";

const blankForm: FormState = {
  name: "",
  isEnabled: true,
  deviceId: ALL_DEVICES_VALUE,
  minTemperatureF: "",
  maxTemperatureF: "",
  minHumidityPercent: "",
  maxHumidityPercent: "",
  notifyEmail: true,
  notifySms: false,
  emailsText: "",
  phonesText: "",
  cooldownMinutes: "30",
  quietHoursStart: "",
  quietHoursEnd: "",
};

function formToPayload(form: FormState) {
  const emails = form.emailsText
    .split(/[,;\n]/)
    .map((e) => e.trim())
    .filter(Boolean);
  const phones = form.phonesText
    .split(/[,;\n]/)
    .map((p) => p.trim())
    .filter(Boolean);

  const optionalNumString = (v: string) => {
    const trimmed = v.trim();
    return trimmed.length === 0 ? null : trimmed;
  };
  const optionalString = (v: string) => {
    const trimmed = v.trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  return {
    name: form.name.trim(),
    isEnabled: form.isEnabled,
    deviceId: form.deviceId === ALL_DEVICES_VALUE ? null : form.deviceId,
    minTemperatureF: optionalNumString(form.minTemperatureF),
    maxTemperatureF: optionalNumString(form.maxTemperatureF),
    minHumidityPercent: optionalNumString(form.minHumidityPercent),
    maxHumidityPercent: optionalNumString(form.maxHumidityPercent),
    notifyEmail: form.notifyEmail,
    notifySms: form.notifySms,
    notificationEmails: emails,
    notificationPhones: phones,
    cooldownMinutes: parseInt(form.cooldownMinutes, 10) || 30,
    quietHoursStart: optionalString(form.quietHoursStart),
    quietHoursEnd: optionalString(form.quietHoursEnd),
  };
}

function ruleToForm(rule: AlertRule): FormState {
  return {
    name: rule.name,
    isEnabled: rule.isEnabled,
    deviceId: rule.deviceId ?? ALL_DEVICES_VALUE,
    minTemperatureF: rule.minTemperatureF ?? "",
    maxTemperatureF: rule.maxTemperatureF ?? "",
    minHumidityPercent: rule.minHumidityPercent ?? "",
    maxHumidityPercent: rule.maxHumidityPercent ?? "",
    notifyEmail: rule.notifyEmail,
    notifySms: rule.notifySms,
    emailsText: (rule.notificationEmails ?? []).join(", "),
    phonesText: (rule.notificationPhones ?? []).join(", "),
    cooldownMinutes: String(rule.cooldownMinutes ?? 30),
    quietHoursStart: rule.quietHoursStart ?? "",
    quietHoursEnd: rule.quietHoursEnd ?? "",
  };
}

function describeThresholds(rule: AlertRule): string {
  const parts: string[] = [];
  if (rule.minTemperatureF) parts.push(`< ${parseFloat(rule.minTemperatureF)}°F`);
  if (rule.maxTemperatureF) parts.push(`> ${parseFloat(rule.maxTemperatureF)}°F`);
  if (rule.minHumidityPercent) parts.push(`humidity < ${parseFloat(rule.minHumidityPercent)}%`);
  if (rule.maxHumidityPercent) parts.push(`humidity > ${parseFloat(rule.maxHumidityPercent)}%`);
  return parts.length ? parts.join(" or ") : "No thresholds set";
}

interface Props {
  isAdmin: boolean;
  devices: DeviceOption[];
}

export default function AlertRulesSection({ isAdmin, devices }: Props) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [deleteTarget, setDeleteTarget] = useState<AlertRule | null>(null);

  const { data: rulesData, isLoading } = useQuery<{ rules: AlertRule[] }>({
    queryKey: ["/api/govee/alert-rules"],
  });

  const rules = rulesData?.rules ?? [];

  const saveMutation = useMutation({
    mutationFn: async ({ ruleId, payload }: { ruleId: string | null; payload: ReturnType<typeof formToPayload> }) => {
      const res = ruleId
        ? await apiRequest("PATCH", `/api/govee/alert-rules/${ruleId}`, payload)
        : await apiRequest("POST", "/api/govee/alert-rules", payload);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save alert rule");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/govee/alert-rules"] });
      setDialogOpen(false);
      setEditingRule(null);
      toast({ title: editingRule ? "Alert rule updated" : "Alert rule created" });
    },
    onError: (err: Error) => {
      toast({ title: "Could not save alert rule", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      const res = await apiRequest("DELETE", `/api/govee/alert-rules/${ruleId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to delete rule");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/govee/alert-rules"] });
      setDeleteTarget(null);
      toast({ title: "Alert rule deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Could not delete rule", description: err.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      const res = await apiRequest("POST", `/api/govee/alert-rules/${ruleId}/test`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to send test alert");
      }
      return res.json() as Promise<{
        emailSent: boolean;
        smsSent: boolean;
        emailRecipients: string[];
        smsRecipients: string[];
        smsErrors: string[];
      }>;
    },
    onSuccess: (data) => {
      const parts: string[] = [];
      if (data.emailSent) parts.push(`Email sent to ${data.emailRecipients.length} recipient(s)`);
      if (data.smsSent) parts.push(`SMS sent to ${data.smsRecipients.length} recipient(s)`);
      if (parts.length === 0) {
        toast({
          title: "Test alert sent — no channels delivered",
          description: data.smsErrors.length ? data.smsErrors.join("; ") : "Check that channels are enabled and recipients are configured.",
          variant: "destructive",
        });
      } else if (data.smsErrors.length > 0) {
        toast({
          title: "Test sent with some failures",
          description: `${parts.join(". ")}. SMS errors: ${data.smsErrors.join("; ")}`,
        });
      } else {
        toast({ title: "Test alert sent", description: parts.join(". ") });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    },
  });

  function openCreate() {
    setEditingRule(null);
    setForm(blankForm);
    setFormErrors({});
    setDialogOpen(true);
  }

  function openEdit(rule: AlertRule) {
    setEditingRule(rule);
    setForm(ruleToForm(rule));
    setFormErrors({});
    setDialogOpen(true);
  }

  function validateForm(payload: ReturnType<typeof formToPayload>): FormErrors {
    const errors: FormErrors = {};
    if (!payload.name) {
      errors.name = "Give this rule a name (e.g. \"Kennel A overheat\").";
    }
    if (
      !payload.minTemperatureF &&
      !payload.maxTemperatureF &&
      !payload.minHumidityPercent &&
      !payload.maxHumidityPercent
    ) {
      errors.thresholds = "Set at least one threshold — a min or max temperature or humidity.";
    }
    if (!payload.notifyEmail && !payload.notifySms) {
      errors.channels = "Turn on email or SMS so the alert can be delivered.";
    }
    if (payload.notifyEmail && payload.notificationEmails.length === 0) {
      errors.emails = "Add at least one email address — email alerts are on but no addresses are listed.";
    }
    if (payload.notifySms && payload.notificationPhones.length === 0) {
      errors.phones = "Add at least one phone number — SMS alerts are on but no numbers are listed.";
    }
    return errors;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = formToPayload(form);
    const errors = validateForm(payload);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    saveMutation.mutate({ ruleId: editingRule?.id ?? null, payload });
  }

  return (
    <Card data-testid="card-alert-rules">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2 min-w-0">
            <BellRing className="h-5 w-5 mt-0.5 text-primary shrink-0" />
            <div className="min-w-0">
              <CardTitle className="text-base">Temperature Alerts</CardTitle>
              <CardDescription>
                Get an email or text when a sensor crosses a threshold.
              </CardDescription>
            </div>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={openCreate} data-testid="button-add-alert-rule">
              <Plus className="h-4 w-4 mr-1" />
              Add Alert Rule
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-no-alert-rules">
            No alert rules yet. {isAdmin ? "Add one to start getting notifications." : "Ask an admin to set one up."}
          </p>
        ) : (
          rules.map((rule) => {
            const deviceLabel = rule.deviceId
              ? devices.find((d) => d.id === rule.deviceId)?.locationLabel ||
                devices.find((d) => d.id === rule.deviceId)?.deviceName ||
                "Specific sensor"
              : "All sensors";
            const lastFired = rule.lastTriggeredAt
              ? formatDistanceToNow(new Date(rule.lastTriggeredAt), { addSuffix: true })
              : "Never";
            return (
              <div
                key={rule.id}
                className="rounded-md border p-3 space-y-2"
                data-testid={`row-alert-rule-${rule.id}`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium" data-testid={`text-rule-name-${rule.id}`}>{rule.name}</span>
                      {!rule.isEnabled && <Badge variant="secondary">Disabled</Badge>}
                      <Badge variant="outline">{deviceLabel}</Badge>
                      {rule.notifyEmail && (
                        <Badge variant="outline" className="gap-1">
                          <Mail className="h-3 w-3" />
                          Email
                        </Badge>
                      )}
                      {rule.notifySms && (
                        <Badge variant="outline" className="gap-1">
                          <MessageSquare className="h-3 w-3" />
                          SMS
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Triggers when {describeThresholds(rule)} · cooldown {rule.cooldownMinutes} min
                      {rule.quietHoursStart && rule.quietHoursEnd && (
                        <> · quiet {rule.quietHoursStart}–{rule.quietHoursEnd}</>
                      )}
                    </p>
                    {rule.notifyEmail && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1.5" data-testid={`text-rule-emails-${rule.id}`}>
                        <Mail className="h-3 w-3 mt-0.5 shrink-0" />
                        <span className="break-all">
                          {rule.notificationEmails && rule.notificationEmails.length > 0
                            ? rule.notificationEmails.join(", ")
                            : "No email recipients"}
                        </span>
                      </p>
                    )}
                    {rule.notifySms && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1.5" data-testid={`text-rule-phones-${rule.id}`}>
                        <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                        <span className="break-all">
                          {rule.notificationPhones && rule.notificationPhones.length > 0
                            ? rule.notificationPhones.join(", ")
                            : "No phone recipients"}
                        </span>
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1" data-testid={`text-rule-last-${rule.id}`}>
                      Last fired: {lastFired}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1 shrink-0 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => testMutation.mutate(rule.id)}
                        disabled={testMutation.isPending}
                        data-testid={`button-test-rule-${rule.id}`}
                      >
                        <Send className="h-4 w-4 mr-1" />
                        Test
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(rule)}
                        data-testid={`button-edit-rule-${rule.id}`}
                      >
                        <Pencil className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDeleteTarget(rule)}
                        data-testid={`button-delete-rule-${rule.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit alert rule" : "New alert rule"}</DialogTitle>
            <DialogDescription>
              Choose the sensor, thresholds, and who should be notified when they're crossed.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rule-name">Rule name</Label>
              <Input
                id="rule-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Kennel A overheat"
                data-testid="input-rule-name"
              />
              {formErrors.name && (
                <p className="text-xs text-destructive" data-testid="error-rule-name">{formErrors.name}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-device">Applies to</Label>
              <Select value={form.deviceId} onValueChange={(v) => setForm({ ...form, deviceId: v })}>
                <SelectTrigger id="rule-device" data-testid="select-rule-device">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_DEVICES_VALUE}>All sensors</SelectItem>
                  {devices.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.locationLabel || d.deviceName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="min-temp">Min °F (alert if below)</Label>
                <Input
                  id="min-temp"
                  type="number"
                  step="0.1"
                  value={form.minTemperatureF}
                  onChange={(e) => setForm({ ...form, minTemperatureF: e.target.value })}
                  placeholder="e.g. 50"
                  data-testid="input-min-temp"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max-temp">Max °F (alert if above)</Label>
                <Input
                  id="max-temp"
                  type="number"
                  step="0.1"
                  value={form.maxTemperatureF}
                  onChange={(e) => setForm({ ...form, maxTemperatureF: e.target.value })}
                  placeholder="e.g. 85"
                  data-testid="input-max-temp"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="min-hum">Min humidity %</Label>
                <Input
                  id="min-hum"
                  type="number"
                  step="0.1"
                  value={form.minHumidityPercent}
                  onChange={(e) => setForm({ ...form, minHumidityPercent: e.target.value })}
                  placeholder="optional"
                  data-testid="input-min-humidity"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max-hum">Max humidity %</Label>
                <Input
                  id="max-hum"
                  type="number"
                  step="0.1"
                  value={form.maxHumidityPercent}
                  onChange={(e) => setForm({ ...form, maxHumidityPercent: e.target.value })}
                  placeholder="optional"
                  data-testid="input-max-humidity"
                />
              </div>
            </div>
            {formErrors.thresholds && (
              <p className="text-xs text-destructive" data-testid="error-thresholds">{formErrors.thresholds}</p>
            )}

            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="notify-email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Send email
                </Label>
                <Switch
                  id="notify-email"
                  checked={form.notifyEmail}
                  onCheckedChange={(v) => setForm({ ...form, notifyEmail: v })}
                  data-testid="switch-notify-email"
                />
              </div>
              {form.notifyEmail && (
                <>
                  <Textarea
                    value={form.emailsText}
                    onChange={(e) => setForm({ ...form, emailsText: e.target.value })}
                    placeholder="alerts@shelter.org, manager@shelter.org"
                    rows={2}
                    data-testid="textarea-rule-emails"
                  />
                  {formErrors.emails && (
                    <p className="text-xs text-destructive" data-testid="error-emails">{formErrors.emails}</p>
                  )}
                </>
              )}

              <div className="flex items-center justify-between gap-3 pt-2 border-t">
                <Label htmlFor="notify-sms" className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Send SMS
                </Label>
                <Switch
                  id="notify-sms"
                  checked={form.notifySms}
                  onCheckedChange={(v) => setForm({ ...form, notifySms: v })}
                  data-testid="switch-notify-sms"
                />
              </div>
              {form.notifySms && (
                <>
                  <Textarea
                    value={form.phonesText}
                    onChange={(e) => setForm({ ...form, phonesText: e.target.value })}
                    placeholder="(555) 123-4567, +15551234568"
                    rows={2}
                    data-testid="textarea-rule-phones"
                  />
                  {formErrors.phones && (
                    <p className="text-xs text-destructive" data-testid="error-phones">{formErrors.phones}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    US 10-digit numbers are auto-formatted. International numbers must include + and country code.
                    SMS requires a configured phone provider for your shelter.
                  </p>
                </>
              )}
              {formErrors.channels && (
                <p className="text-xs text-destructive" data-testid="error-channels">{formErrors.channels}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cooldown">Cooldown (minutes)</Label>
                <Input
                  id="cooldown"
                  type="number"
                  min={5}
                  max={1440}
                  value={form.cooldownMinutes}
                  onChange={(e) => setForm({ ...form, cooldownMinutes: e.target.value })}
                  data-testid="input-cooldown"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Quiet hours (optional)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={form.quietHoursStart}
                    onChange={(e) => setForm({ ...form, quietHoursStart: e.target.value })}
                    data-testid="input-quiet-start"
                  />
                  <span className="text-sm text-muted-foreground">to</span>
                  <Input
                    type="time"
                    value={form.quietHoursEnd}
                    onChange={(e) => setForm({ ...form, quietHoursEnd: e.target.value })}
                    data-testid="input-quiet-end"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <Label htmlFor="rule-enabled">Rule enabled</Label>
              <Switch
                id="rule-enabled"
                checked={form.isEnabled}
                onCheckedChange={(v) => setForm({ ...form, isEnabled: v })}
                data-testid="switch-rule-enabled"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-rule">
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-rule">
                {saveMutation.isPending ? "Saving…" : editingRule ? "Save changes" : "Create rule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this alert rule?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" will stop firing notifications. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-rule">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="button-confirm-delete-rule"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

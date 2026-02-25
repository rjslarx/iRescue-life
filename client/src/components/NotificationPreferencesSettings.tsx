import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Loader2, Bell, Mail, Plus, X, Save, Users, FileText, PawPrint, Heart, Truck, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { NOTIFICATION_EVENT_LABELS, NOTIFICATION_EVENT_KEYS } from "@shared/schema";
import type { NotificationEventKey } from "@shared/schema";

interface NotificationPref {
  id: string | null;
  tenantId: string;
  eventKey: NotificationEventKey;
  channel: string;
  isEnabled: boolean;
  recipientRoles: string[];
  recipientEmails: string[];
  recipientPhones: string[];
}

interface NotificationPreferencesSettingsProps {
  twilioEnabled?: boolean;
}

const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "staff", label: "Staff" },
  { value: "board_member", label: "Board Member" },
  { value: "foster", label: "Foster" },
  { value: "volunteer", label: "Volunteer" },
];

const CATEGORY_ICONS: Record<string, typeof Bell> = {
  "Applications & Forms": FileText,
  "Animal Management": PawPrint,
  "Agreements": FileText,
  "Foster & Compliance": Heart,
  "Financial": Heart,
  "Operations": Truck,
};

const CATEGORY_ORDER = [
  "Applications & Forms",
  "Animal Management",
  "Agreements",
  "Foster & Compliance",
  "Financial",
  "Operations",
];

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export default function NotificationPreferencesSettings({ twilioEnabled }: NotificationPreferencesSettingsProps) {
  const { toast } = useToast();

  // Email prefs keyed by eventKey
  const [localEmailPrefs, setLocalEmailPrefs] = useState<Map<string, NotificationPref>>(new Map());
  // SMS prefs keyed by eventKey
  const [localSmsPrefs, setLocalSmsPrefs] = useState<Map<string, NotificationPref>>(new Map());

  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [newEmailInputs, setNewEmailInputs] = useState<Record<string, string>>({});
  const [newPhoneInputs, setNewPhoneInputs] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const { data, isLoading } = useQuery<{ preferences: NotificationPref[] }>({
    queryKey: ['/api/tenant/notification-preferences'],
  });

  const saveMutation = useMutation({
    mutationFn: async (preferences: NotificationPref[]) => {
      const payload = preferences.map(p => ({
        eventKey: p.eventKey,
        channel: p.channel,
        isEnabled: p.isEnabled,
        recipientRoles: p.recipientRoles,
        recipientEmails: p.recipientEmails,
        recipientPhones: p.recipientPhones,
      }));
      return await apiRequest('PATCH', '/api/tenant/notification-preferences', { preferences: payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/notification-preferences'] });
      setHasChanges(false);
      setLocalEmailPrefs(new Map());
      setLocalSmsPrefs(new Map());
      toast({
        title: "Notification preferences saved",
        description: "Your notification settings have been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error saving preferences",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getEmailPref = (eventKey: string): NotificationPref => {
    if (localEmailPrefs.has(eventKey)) return localEmailPrefs.get(eventKey)!;
    const serverPref = data?.preferences?.find(p => p.eventKey === eventKey && p.channel === "email");
    if (serverPref) return { ...serverPref, recipientPhones: serverPref.recipientPhones || [] };
    return {
      id: null,
      tenantId: "",
      eventKey: eventKey as NotificationEventKey,
      channel: "email",
      isEnabled: false,
      recipientRoles: ["admin"],
      recipientEmails: [],
      recipientPhones: [],
    };
  };

  const getSmsPref = (eventKey: string): NotificationPref => {
    if (localSmsPrefs.has(eventKey)) return localSmsPrefs.get(eventKey)!;
    const serverPref = data?.preferences?.find(p => p.eventKey === eventKey && p.channel === "sms");
    if (serverPref) return { ...serverPref, recipientPhones: serverPref.recipientPhones || [] };
    return {
      id: null,
      tenantId: "",
      eventKey: eventKey as NotificationEventKey,
      channel: "sms",
      isEnabled: false,
      recipientRoles: [],
      recipientEmails: [],
      recipientPhones: [],
    };
  };

  const updateEmailPref = (eventKey: string, updates: Partial<NotificationPref>) => {
    const current = getEmailPref(eventKey);
    const updated = { ...current, ...updates };
    const newMap = new Map(localEmailPrefs);
    newMap.set(eventKey, updated);
    setLocalEmailPrefs(newMap);
    setHasChanges(true);
  };

  const updateSmsPref = (eventKey: string, updates: Partial<NotificationPref>) => {
    const current = getSmsPref(eventKey);
    const updated = { ...current, ...updates };
    const newMap = new Map(localSmsPrefs);
    newMap.set(eventKey, updated);
    setLocalSmsPrefs(newMap);
    setHasChanges(true);
  };

  const toggleEvent = (eventKey: string) => {
    const newSet = new Set(expandedEvents);
    if (newSet.has(eventKey)) {
      newSet.delete(eventKey);
    } else {
      newSet.add(eventKey);
    }
    setExpandedEvents(newSet);
  };

  const addEmail = (eventKey: string) => {
    const email = (newEmailInputs[eventKey] || "").trim().toLowerCase();
    if (!email) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    const pref = getEmailPref(eventKey);
    if (pref.recipientEmails.includes(email)) {
      toast({ title: "Duplicate", description: "This email is already added.", variant: "destructive" });
      return;
    }
    updateEmailPref(eventKey, { recipientEmails: [...pref.recipientEmails, email] });
    setNewEmailInputs(prev => ({ ...prev, [eventKey]: "" }));
  };

  const removeEmail = (eventKey: string, emailToRemove: string) => {
    const pref = getEmailPref(eventKey);
    updateEmailPref(eventKey, {
      recipientEmails: pref.recipientEmails.filter(e => e !== emailToRemove),
    });
  };

  const addPhone = (eventKey: string) => {
    const raw = (newPhoneInputs[eventKey] || "").trim();
    if (!raw) return;
    const phone = raw.startsWith("+") ? raw : `+${raw}`;
    if (!E164_REGEX.test(phone)) {
      toast({ title: "Invalid phone number", description: "Use E.164 format, e.g. +15551234567", variant: "destructive" });
      return;
    }
    const pref = getSmsPref(eventKey);
    if (pref.recipientPhones.includes(phone)) {
      toast({ title: "Duplicate", description: "This phone number is already added.", variant: "destructive" });
      return;
    }
    updateSmsPref(eventKey, { recipientPhones: [...pref.recipientPhones, phone] });
    setNewPhoneInputs(prev => ({ ...prev, [eventKey]: "" }));
  };

  const removePhone = (eventKey: string, phoneToRemove: string) => {
    const pref = getSmsPref(eventKey);
    updateSmsPref(eventKey, {
      recipientPhones: pref.recipientPhones.filter(p => p !== phoneToRemove),
    });
  };

  const toggleRole = (eventKey: string, role: string) => {
    const pref = getEmailPref(eventKey);
    const newRoles = pref.recipientRoles.includes(role)
      ? pref.recipientRoles.filter(r => r !== role)
      : [...pref.recipientRoles, role];
    updateEmailPref(eventKey, { recipientRoles: newRoles });
  };

  const handleSave = () => {
    const changedPrefs: NotificationPref[] = [];

    for (const eventKey of NOTIFICATION_EVENT_KEYS) {
      if (localEmailPrefs.has(eventKey)) {
        changedPrefs.push(localEmailPrefs.get(eventKey)!);
      }
      if (localSmsPrefs.has(eventKey)) {
        changedPrefs.push(localSmsPrefs.get(eventKey)!);
      }
    }

    if (changedPrefs.length === 0) return;
    saveMutation.mutate(changedPrefs);
  };

  const enabledCount = NOTIFICATION_EVENT_KEYS.filter(key => getEmailPref(key).isEnabled).length;

  const groupedEvents = CATEGORY_ORDER.map(category => ({
    category,
    events: NOTIFICATION_EVENT_KEYS.filter(
      key => NOTIFICATION_EVENT_LABELS[key].category === category
    ),
  })).filter(g => g.events.length > 0);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Event Notification Preferences
              </CardTitle>
              <CardDescription className="mt-1">
                Choose which events trigger notifications and who receives them.
                {" "}{enabledCount} of {NOTIFICATION_EVENT_KEYS.length} events enabled.
                {twilioEnabled && (
                  <span className="ml-2 text-xs text-muted-foreground">SMS alerts available via Twilio.</span>
                )}
              </CardDescription>
            </div>
            {hasChanges && (
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                data-testid="button-save-notification-prefs"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {groupedEvents.map(({ category, events }) => (
            <div key={category} className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {category}
              </h3>
              <div className="space-y-2">
                {events.map(eventKey => {
                  const emailPref = getEmailPref(eventKey);
                  const smsPref = getSmsPref(eventKey);
                  const meta = NOTIFICATION_EVENT_LABELS[eventKey];
                  const isExpanded = expandedEvents.has(eventKey);

                  return (
                    <div
                      key={eventKey}
                      className="border rounded-md"
                      data-testid={`notification-event-${eventKey}`}
                    >
                      {/* Row header */}
                      <div className="flex items-center justify-between gap-3 p-3">
                        <button
                          type="button"
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                          onClick={() => toggleEvent(eventKey)}
                          data-testid={`button-expand-${eventKey}`}
                        >
                          <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium">{meta.label}</span>
                            {emailPref.isEnabled && (
                              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                {emailPref.recipientRoles.length > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {emailPref.recipientRoles.map(r => ROLE_OPTIONS.find(ro => ro.value === r)?.label || r).join(", ")}
                                  </span>
                                )}
                                {emailPref.recipientEmails.length > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {emailPref.recipientRoles.length > 0 ? " + " : ""}
                                    {emailPref.recipientEmails.length} email{emailPref.recipientEmails.length !== 1 ? "s" : ""}
                                  </span>
                                )}
                                {twilioEnabled && smsPref.isEnabled && smsPref.recipientPhones.length > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {" · "}{smsPref.recipientPhones.length} SMS
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                        </button>
                        <Switch
                          checked={emailPref.isEnabled}
                          onCheckedChange={(checked) => updateEmailPref(eventKey, { isEnabled: checked })}
                          data-testid={`switch-${eventKey}`}
                        />
                      </div>

                      {isExpanded && (
                        <div className="border-t px-3 pb-3 pt-3 space-y-4 bg-muted/30">
                          {/* Email section */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5">
                              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                Email — Notify by Role
                              </Label>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-2">
                              {ROLE_OPTIONS.map(role => (
                                <div key={role.value} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`role-${eventKey}-${role.value}`}
                                    checked={emailPref.recipientRoles.includes(role.value)}
                                    onCheckedChange={() => toggleRole(eventKey, role.value)}
                                    data-testid={`checkbox-role-${eventKey}-${role.value}`}
                                  />
                                  <Label
                                    htmlFor={`role-${eventKey}-${role.value}`}
                                    className="text-sm font-normal cursor-pointer"
                                  >
                                    {role.label}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                              Additional Email Recipients
                            </Label>
                            {emailPref.recipientEmails.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {emailPref.recipientEmails.map(email => (
                                  <Badge key={email} variant="secondary">
                                    {email}
                                    <button
                                      type="button"
                                      onClick={() => removeEmail(eventKey, email)}
                                      className="ml-1"
                                      data-testid={`button-remove-email-${eventKey}-${email}`}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                ))}
                              </div>
                            )}
                            <div className="flex gap-2">
                              <Input
                                placeholder="email@example.com"
                                value={newEmailInputs[eventKey] || ""}
                                onChange={(e) => setNewEmailInputs(prev => ({ ...prev, [eventKey]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    addEmail(eventKey);
                                  }
                                }}
                                className="flex-1"
                                data-testid={`input-email-${eventKey}`}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => addEmail(eventKey)}
                                data-testid={`button-add-email-${eventKey}`}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {/* SMS section — only shown when Twilio is enabled */}
                          {twilioEnabled && (
                            <>
                              <Separator />
                              <div className="space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-1.5">
                                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                                    <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                      SMS Alerts
                                    </Label>
                                  </div>
                                  <Switch
                                    checked={smsPref.isEnabled}
                                    onCheckedChange={(checked) => updateSmsPref(eventKey, { isEnabled: checked })}
                                    data-testid={`switch-sms-${eventKey}`}
                                  />
                                </div>

                                {smsPref.isEnabled && (
                                  <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">
                                      Phone numbers to receive SMS alerts for this event (E.164 format, e.g. +15551234567)
                                    </Label>
                                    {smsPref.recipientPhones.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {smsPref.recipientPhones.map(phone => (
                                          <Badge key={phone} variant="secondary">
                                            {phone}
                                            <button
                                              type="button"
                                              onClick={() => removePhone(eventKey, phone)}
                                              className="ml-1"
                                              data-testid={`button-remove-phone-${eventKey}-${phone}`}
                                            >
                                              <X className="h-3 w-3" />
                                            </button>
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                    <div className="flex gap-2">
                                      <Input
                                        placeholder="+15551234567"
                                        value={newPhoneInputs[eventKey] || ""}
                                        onChange={(e) => setNewPhoneInputs(prev => ({ ...prev, [eventKey]: e.target.value }))}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            addPhone(eventKey);
                                          }
                                        }}
                                        className="flex-1"
                                        data-testid={`input-phone-${eventKey}`}
                                      />
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => addPhone(eventKey)}
                                        data-testid={`button-add-phone-${eventKey}`}
                                      >
                                        <Plus className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

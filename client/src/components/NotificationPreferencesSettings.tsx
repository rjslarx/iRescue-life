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
import { Loader2, Bell, Mail, Plus, X, Save, Users, FileText, PawPrint, Heart, Truck, ChevronDown, ChevronUp } from "lucide-react";
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

export default function NotificationPreferencesSettings() {
  const { toast } = useToast();
  const [localPrefs, setLocalPrefs] = useState<Map<string, NotificationPref>>(new Map());
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [newEmailInputs, setNewEmailInputs] = useState<Record<string, string>>({});
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
      }));
      return await apiRequest('PATCH', '/api/tenant/notification-preferences', { preferences: payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/notification-preferences'] });
      setHasChanges(false);
      setLocalPrefs(new Map());
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

  const getPref = (eventKey: string): NotificationPref => {
    if (localPrefs.has(eventKey)) {
      return localPrefs.get(eventKey)!;
    }
    const serverPref = data?.preferences?.find(p => p.eventKey === eventKey);
    if (serverPref) return serverPref;
    return {
      id: null,
      tenantId: "",
      eventKey: eventKey as NotificationEventKey,
      channel: "email",
      isEnabled: false,
      recipientRoles: ["admin"],
      recipientEmails: [],
    };
  };

  const updatePref = (eventKey: string, updates: Partial<NotificationPref>) => {
    const current = getPref(eventKey);
    const updated = { ...current, ...updates };
    const newMap = new Map(localPrefs);
    newMap.set(eventKey, updated);
    setLocalPrefs(newMap);
    setHasChanges(true);
  };

  const toggleEvent = (eventKey: string) => {
    const current = expandedEvents.has(eventKey);
    const newSet = new Set(expandedEvents);
    if (current) {
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
    const pref = getPref(eventKey);
    if (pref.recipientEmails.includes(email)) {
      toast({ title: "Duplicate", description: "This email is already added.", variant: "destructive" });
      return;
    }
    updatePref(eventKey, { recipientEmails: [...pref.recipientEmails, email] });
    setNewEmailInputs(prev => ({ ...prev, [eventKey]: "" }));
  };

  const removeEmail = (eventKey: string, emailToRemove: string) => {
    const pref = getPref(eventKey);
    updatePref(eventKey, {
      recipientEmails: pref.recipientEmails.filter(e => e !== emailToRemove),
    });
  };

  const toggleRole = (eventKey: string, role: string) => {
    const pref = getPref(eventKey);
    const newRoles = pref.recipientRoles.includes(role)
      ? pref.recipientRoles.filter(r => r !== role)
      : [...pref.recipientRoles, role];
    updatePref(eventKey, { recipientRoles: newRoles });
  };

  const handleSave = () => {
    const allPrefs = NOTIFICATION_EVENT_KEYS.map(eventKey => getPref(eventKey));
    const changedPrefs = allPrefs.filter(p => localPrefs.has(p.eventKey));
    if (changedPrefs.length === 0) return;
    saveMutation.mutate(changedPrefs);
  };

  const enabledCount = NOTIFICATION_EVENT_KEYS.filter(key => getPref(key).isEnabled).length;

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
                Choose which events trigger email notifications and who receives them.
                {" "}{enabledCount} of {NOTIFICATION_EVENT_KEYS.length} events enabled.
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
                  const pref = getPref(eventKey);
                  const meta = NOTIFICATION_EVENT_LABELS[eventKey];
                  const isExpanded = expandedEvents.has(eventKey);

                  return (
                    <div
                      key={eventKey}
                      className="border rounded-md"
                      data-testid={`notification-event-${eventKey}`}
                    >
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
                            {pref.isEnabled && (
                              <div className="flex items-center gap-1 mt-0.5">
                                {pref.recipientRoles.length > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {pref.recipientRoles.map(r => ROLE_OPTIONS.find(ro => ro.value === r)?.label || r).join(", ")}
                                  </span>
                                )}
                                {pref.recipientEmails.length > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {pref.recipientRoles.length > 0 ? " + " : ""}
                                    {pref.recipientEmails.length} email{pref.recipientEmails.length !== 1 ? "s" : ""}
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
                          checked={pref.isEnabled}
                          onCheckedChange={(checked) => updatePref(eventKey, { isEnabled: checked })}
                          data-testid={`switch-${eventKey}`}
                        />
                      </div>

                      {isExpanded && (
                        <div className="border-t px-3 pb-3 pt-3 space-y-4 bg-muted/30">
                          <div className="space-y-2">
                            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                              Notify by Role
                            </Label>
                            <div className="flex flex-wrap gap-x-4 gap-y-2">
                              {ROLE_OPTIONS.map(role => (
                                <div key={role.value} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`role-${eventKey}-${role.value}`}
                                    checked={pref.recipientRoles.includes(role.value)}
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

                          <Separator />

                          <div className="space-y-2">
                            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                              Additional Email Recipients
                            </Label>
                            {pref.recipientEmails.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {pref.recipientEmails.map(email => (
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

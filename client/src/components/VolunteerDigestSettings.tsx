import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Calendar, Mail, Play, Clock, CheckCircle2 } from "lucide-react";

interface DigestSettings {
  enabled?: boolean;
  dayOfWeek?: "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";
  sendTime?: string;
  includeUpcomingDays?: number;
  lastSentAt?: string;
}

const DAYS_OF_WEEK = [
  { value: "sunday", label: "Sunday" },
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
];

export function VolunteerDigestSettings() {
  const { toast } = useToast();
  const [localSettings, setLocalSettings] = useState<DigestSettings>({});

  const { data, isLoading } = useQuery<{ settings: DigestSettings }>({
    queryKey: ["/api/tenant/settings/volunteer-digest"],
  });

  useEffect(() => {
    if (data?.settings) {
      setLocalSettings(data.settings);
    }
  }, [data?.settings]);

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<DigestSettings>) => {
      const response = await apiRequest("PATCH", "/api/tenant/settings/volunteer-digest", updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/settings/volunteer-digest"] });
      toast({ title: "Settings saved", description: "Volunteer digest settings have been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/tenant/settings/volunteer-digest/test", {});
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.result?.emailsSent > 0) {
        toast({ 
          title: "Test digest sent", 
          description: `Sent ${data.result.emailsSent} digest email(s) to ${data.result.volunteersWithCommitments} volunteer(s).`
        });
      } else if (data.result?.volunteersWithCommitments === 0) {
        toast({ 
          title: "No commitments found", 
          description: "No volunteers have upcoming shifts scheduled."
        });
      } else {
        toast({ 
          title: "Test completed", 
          description: data.result?.errors?.length > 0 
            ? `Completed with errors: ${data.result.errors.join(', ')}`
            : "No emails sent - check that email is configured."
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Test failed", description: error.message, variant: "destructive" });
    },
  });

  const handleToggle = (enabled: boolean) => {
    setLocalSettings(prev => ({ ...prev, enabled }));
    updateMutation.mutate({ enabled });
  };

  const handleDayChange = (dayOfWeek: string) => {
    setLocalSettings(prev => ({ ...prev, dayOfWeek: dayOfWeek as DigestSettings["dayOfWeek"] }));
    updateMutation.mutate({ dayOfWeek: dayOfWeek as DigestSettings["dayOfWeek"] });
  };

  const handleTimeChange = (sendTime: string) => {
    setLocalSettings(prev => ({ ...prev, sendTime }));
    updateMutation.mutate({ sendTime });
  };

  const handleDaysAheadChange = (days: string) => {
    const num = parseInt(days);
    if (num >= 1 && num <= 14) {
      setLocalSettings(prev => ({ ...prev, includeUpcomingDays: num }));
      updateMutation.mutate({ includeUpcomingDays: num });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" data-testid="loader-digest-settings" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="container-digest-settings">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Switch
            checked={localSettings.enabled || false}
            onCheckedChange={handleToggle}
            disabled={updateMutation.isPending}
            data-testid="switch-digest-enabled"
          />
          <div>
            <Label className="text-base cursor-pointer">Enable Weekly Digest</Label>
            <p className="text-sm text-muted-foreground">
              Send volunteers a summary of their upcoming shifts
            </p>
          </div>
        </div>
        {localSettings.enabled && (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800" data-testid="badge-digest-active">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Active
          </Badge>
        )}
      </div>

      {localSettings.enabled && (
        <div className="grid gap-4 pt-4 border-t">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="day-of-week" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Send Day
              </Label>
              <Select
                value={localSettings.dayOfWeek || "sunday"}
                onValueChange={handleDayChange}
              >
                <SelectTrigger id="day-of-week" data-testid="select-digest-day">
                  <SelectValue placeholder="Select day" />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((day) => (
                    <SelectItem key={day.value} value={day.value} data-testid={`option-day-${day.value}`}>
                      {day.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="send-time" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Send Time (UTC)
              </Label>
              <Input
                id="send-time"
                type="time"
                value={localSettings.sendTime || "08:00"}
                onChange={(e) => handleTimeChange(e.target.value)}
                data-testid="input-digest-time"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="days-ahead" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Days Ahead
              </Label>
              <Select
                value={String(localSettings.includeUpcomingDays || 7)}
                onValueChange={handleDaysAheadChange}
              >
                <SelectTrigger id="days-ahead" data-testid="select-digest-days">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 5, 7, 10, 14].map((days) => (
                    <SelectItem key={days} value={String(days)} data-testid={`option-days-${days}`}>
                      {days} days
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2 pt-4 border-t">
            <div className="text-sm text-muted-foreground" data-testid="text-last-sent">
              {localSettings.lastSentAt ? (
                <span>Last sent: {new Date(localSettings.lastSentAt).toLocaleDateString()} at {new Date(localSettings.lastSentAt).toLocaleTimeString()}</span>
              ) : (
                <span>No digests sent yet</span>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              data-testid="button-test-digest"
            >
              {testMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Send Test Digest
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default VolunteerDigestSettings;

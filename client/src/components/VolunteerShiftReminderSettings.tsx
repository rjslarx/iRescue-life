import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Clock, Play, CheckCircle2 } from "lucide-react";

interface DigestSettings {
  shiftReminderEnabled?: boolean;
  shiftReminderHour?: number;
}

const HOURS = Array.from({ length: 24 }, (_, h) => {
  const period = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return { value: h, label: `${display}:00 ${period}` };
});

export function VolunteerShiftReminderSettings() {
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
      toast({ title: "Settings saved", description: "Shift reminder settings have been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/tenant/settings/volunteer-digest/shift-reminder-test", {});
      return response.json();
    },
    onSuccess: (data: any) => {
      const sent = data.result?.emailsSent ?? 0;
      const found = data.result?.shiftsFound ?? 0;
      if (sent > 0) {
        toast({
          title: "Reminders sent",
          description: `Sent ${sent} reminder email${sent !== 1 ? "s" : ""} for tomorrow's shifts.`,
        });
      } else if (found === 0) {
        toast({
          title: "No shifts tomorrow",
          description: "No volunteers with an assigned shift tomorrow were found.",
        });
      } else {
        toast({
          title: "Nothing to send",
          description: data.result?.errors?.length > 0
            ? `Completed with errors: ${data.result.errors.join(", ")}`
            : "Tomorrow's volunteers have already been reminded.",
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Test failed", description: error.message, variant: "destructive" });
    },
  });

  const handleToggle = (shiftReminderEnabled: boolean) => {
    setLocalSettings((prev) => ({ ...prev, shiftReminderEnabled }));
    updateMutation.mutate({ shiftReminderEnabled });
  };

  const handleHourChange = (hour: string) => {
    const shiftReminderHour = parseInt(hour, 10);
    setLocalSettings((prev) => ({ ...prev, shiftReminderHour }));
    updateMutation.mutate({ shiftReminderHour });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" data-testid="loader-shift-reminder-settings" />
      </div>
    );
  }

  const currentHour = typeof localSettings.shiftReminderHour === "number" ? localSettings.shiftReminderHour : 17;

  return (
    <div className="space-y-4" data-testid="container-shift-reminder-settings">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Switch
            checked={localSettings.shiftReminderEnabled || false}
            onCheckedChange={handleToggle}
            disabled={updateMutation.isPending}
            data-testid="switch-shift-reminder-enabled"
          />
          <div>
            <Label className="text-base cursor-pointer">Enable Day-Before Reminders</Label>
            <p className="text-sm text-muted-foreground">
              Email each volunteer the day before their scheduled shift
            </p>
          </div>
        </div>
        {localSettings.shiftReminderEnabled && (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800" data-testid="badge-shift-reminder-active">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Active
          </Badge>
        )}
      </div>

      {localSettings.shiftReminderEnabled && (
        <div className="grid gap-4 pt-4 border-t">
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="shift-reminder-hour" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Send Time (organization's local time)
            </Label>
            <Select value={String(currentHour)} onValueChange={handleHourChange}>
              <SelectTrigger id="shift-reminder-hour" data-testid="select-shift-reminder-hour">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => (
                  <SelectItem key={h.value} value={String(h.value)} data-testid={`option-hour-${h.value}`}>
                    {h.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Reminders go out at this hour the evening before each shift.
            </p>
          </div>

          <div className="flex items-center justify-end flex-wrap gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              data-testid="button-test-shift-reminder"
            >
              {testMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Send Tomorrow's Reminders Now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default VolunteerShiftReminderSettings;

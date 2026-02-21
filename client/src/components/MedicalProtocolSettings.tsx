import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Pill, Save, Loader2, Clock, Sun, Sunset } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface MedicalProtocolSettings {
  defaultMorningRounds: string;
  defaultMiddayRounds: string;
  defaultEveningRounds: string;
}

export default function MedicalProtocolSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [settings, setSettings] = useState<MedicalProtocolSettings>({
    defaultMorningRounds: "08:00",
    defaultMiddayRounds: "13:00",
    defaultEveningRounds: "17:00",
  });

  if (user?.activeRole !== 'admin' && user?.activeRole !== 'owner') {
    return null;
  }

  const { data: tenantData, isLoading } = useQuery<{ tenant: MedicalProtocolSettings }>({
    queryKey: ['/api/tenant'],
  });

  useEffect(() => {
    if (tenantData?.tenant) {
      setSettings({
        defaultMorningRounds: tenantData.tenant.defaultMorningRounds || "08:00",
        defaultMiddayRounds: tenantData.tenant.defaultMiddayRounds || "13:00",
        defaultEveningRounds: tenantData.tenant.defaultEveningRounds || "17:00",
      });
    }
  }, [tenantData]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: MedicalProtocolSettings) => {
      const response = await apiRequest('PATCH', '/api/tenant/medical-protocols', newSettings);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      toast({
        title: "Settings saved",
        description: "Medical protocol settings have been updated. New medications will use these times.",
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

  const handleSave = () => {
    updateSettingsMutation.mutate(settings);
  };

  const formatTimeDisplay = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Pill className="h-5 w-5" />
            <CardTitle>Medical Protocols</CardTitle>
          </div>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Pill className="h-5 w-5 text-primary" />
          <CardTitle>Medical Protocols</CardTitle>
        </div>
        <CardDescription>
          Set default medication rounds times. These times are used when scheduling medications based on frequency.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="morning-rounds" className="flex items-center gap-2">
              <Sun className="h-4 w-4 text-yellow-500" />
              Morning Rounds
            </Label>
            <Input
              id="morning-rounds"
              type="time"
              value={settings.defaultMorningRounds}
              onChange={(e) => setSettings({ ...settings, defaultMorningRounds: e.target.value })}
              data-testid="input-morning-rounds"
            />
            <p className="text-xs text-muted-foreground">
              SID (once daily) medications
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="midday-rounds" className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              Midday Rounds
            </Label>
            <Input
              id="midday-rounds"
              type="time"
              value={settings.defaultMiddayRounds}
              onChange={(e) => setSettings({ ...settings, defaultMiddayRounds: e.target.value })}
              data-testid="input-midday-rounds"
            />
            <p className="text-xs text-muted-foreground">
              TID (three times daily) medications
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="evening-rounds" className="flex items-center gap-2">
              <Sunset className="h-4 w-4 text-orange-500" />
              Evening Rounds
            </Label>
            <Input
              id="evening-rounds"
              type="time"
              value={settings.defaultEveningRounds}
              onChange={(e) => setSettings({ ...settings, defaultEveningRounds: e.target.value })}
              data-testid="input-evening-rounds"
            />
            <p className="text-xs text-muted-foreground">
              BID (twice daily) medications
            </p>
          </div>
        </div>
        
        <div className="rounded-lg border p-4 bg-muted/30">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            How Frequencies Use These Times
          </h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li><strong>SID (Once Daily):</strong> Morning rounds ({formatTimeDisplay(settings.defaultMorningRounds)})</li>
            <li><strong>BID (Twice Daily):</strong> Morning ({formatTimeDisplay(settings.defaultMorningRounds)}) + Evening ({formatTimeDisplay(settings.defaultEveningRounds)})</li>
            <li><strong>TID (Three Times):</strong> Morning ({formatTimeDisplay(settings.defaultMorningRounds)}) + Midday ({formatTimeDisplay(settings.defaultMiddayRounds)}) + Evening ({formatTimeDisplay(settings.defaultEveningRounds)})</li>
          </ul>
        </div>
      </CardContent>
      <CardFooter>
        <Button 
          onClick={handleSave} 
          disabled={updateSettingsMutation.isPending}
          data-testid="button-save-medical-protocols"
        >
          {updateSettingsMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Medical Protocols
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

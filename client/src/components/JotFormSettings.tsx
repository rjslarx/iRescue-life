import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, ExternalLink, Info } from "lucide-react";
import type { Tenant } from "@shared/schema";

export function JotFormSettings() {
  const { toast } = useToast();
  
  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });
  
  const tenant = tenantData?.tenant;
  
  const [adoptionUrl, setAdoptionUrl] = useState(tenant?.jotformAdoptionUrl || "");
  const [fosterUrl, setFosterUrl] = useState(tenant?.jotformFosterUrl || "");
  const [volunteerUrl, setVolunteerUrl] = useState(tenant?.jotformVolunteerUrl || "");
  const [surrenderUrl, setSurrenderUrl] = useState(tenant?.jotformSurrenderUrl || "");
  const [initialized, setInitialized] = useState(false);
  
  if (tenant && !initialized) {
    setAdoptionUrl(tenant.jotformAdoptionUrl || "");
    setFosterUrl(tenant.jotformFosterUrl || "");
    setVolunteerUrl(tenant.jotformVolunteerUrl || "");
    setSurrenderUrl(tenant.jotformSurrenderUrl || "");
    setInitialized(true);
  }
  
  const saveMutation = useMutation({
    mutationFn: async (data: {
      jotformAdoptionUrl: string | null;
      jotformFosterUrl: string | null;
      jotformVolunteerUrl: string | null;
      jotformSurrenderUrl: string | null;
    }) => {
      const res = await apiRequest("PATCH", "/api/tenant/settings/jotform", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      toast({
        title: "JotForm settings saved",
        description: "Your external form URLs have been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      jotformAdoptionUrl: adoptionUrl || null,
      jotformFosterUrl: fosterUrl || null,
      jotformVolunteerUrl: volunteerUrl || null,
      jotformSurrenderUrl: surrenderUrl || null,
    });
  };

  return (
    <Card data-testid="card-jotform-settings">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ExternalLink className="h-5 w-5" />
          <CardTitle>External Form Links (JotForm)</CardTitle>
        </div>
        <CardDescription>
          Link your existing JotForm (or other external form) URLs. When set, public site buttons will open these forms instead of the built-in application system.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            The animal's name and ID will be automatically appended to the URL when visitors click "Apply to Adopt" on an animal's profile (e.g., ?dogName=Rex&animalId=123).
          </AlertDescription>
        </Alert>
        
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="jotform-adoption" data-testid="label-jotform-adoption">Adoption Application URL</Label>
            <Input
              id="jotform-adoption"
              data-testid="input-jotform-adoption"
              placeholder="https://form.jotform.com/your-adoption-form"
              value={adoptionUrl}
              onChange={(e) => setAdoptionUrl(e.target.value)}
            />
          </div>
          
          <div className="space-y-1.5">
            <Label htmlFor="jotform-foster" data-testid="label-jotform-foster">Foster Application URL</Label>
            <Input
              id="jotform-foster"
              data-testid="input-jotform-foster"
              placeholder="https://form.jotform.com/your-foster-form"
              value={fosterUrl}
              onChange={(e) => setFosterUrl(e.target.value)}
            />
          </div>
          
          <div className="space-y-1.5">
            <Label htmlFor="jotform-volunteer" data-testid="label-jotform-volunteer">Volunteer Application URL</Label>
            <Input
              id="jotform-volunteer"
              data-testid="input-jotform-volunteer"
              placeholder="https://form.jotform.com/your-volunteer-form"
              value={volunteerUrl}
              onChange={(e) => setVolunteerUrl(e.target.value)}
            />
          </div>
          
          <div className="space-y-1.5">
            <Label htmlFor="jotform-surrender" data-testid="label-jotform-surrender">Surrender/Intake Form URL</Label>
            <Input
              id="jotform-surrender"
              data-testid="input-jotform-surrender"
              placeholder="https://form.jotform.com/your-surrender-form"
              value={surrenderUrl}
              onChange={(e) => setSurrenderUrl(e.target.value)}
            />
          </div>
        </div>
        
        <Button 
          onClick={handleSave} 
          disabled={saveMutation.isPending}
          data-testid="button-save-jotform"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Form Links
        </Button>
      </CardContent>
    </Card>
  );
}

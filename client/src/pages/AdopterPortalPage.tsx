import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useLocation } from "wouter";
import { PawPrint, Calendar, Heart, ChevronRight, Bell, Mail, MessageSquare, Settings } from "lucide-react";
import { PWAInstallPrompt } from "@/components/IOSInstallPrompt";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AdoptedAnimal {
  id: string;
  name: string;
  species: string;
  breed: string;
  photoUrls?: string[];
  adoptedAt: string;
  microchipNumber?: string;
}

interface NotificationPrefs {
  emailNotifications: boolean;
  smsNotifications: boolean;
  phone: string | null;
  vaccinationReminders: boolean;
  medicationReminders: boolean;
  generalUpdates: boolean;
}

export default function AdopterPortalPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showSettings, setShowSettings] = useState(false);
  
  const { data: pets, isLoading, error } = useQuery<AdoptedAnimal[]>({
    queryKey: ["/api/adopter/my-pets"],
    enabled: !!user && user.roles?.includes("adopter"),
  });

  const { data: notifPrefs } = useQuery<NotificationPrefs>({
    queryKey: ["/api/adopter/notification-preferences"],
    enabled: !!user && user.roles?.includes("adopter") && showSettings,
  });

  const updatePrefsMutation = useMutation({
    mutationFn: async (prefs: Partial<NotificationPrefs>) => {
      return apiRequest("PUT", "/api/adopter/notification-preferences", prefs);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/adopter/notification-preferences"] });
      toast({ title: "Preferences saved", description: "Your notification preferences have been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save preferences. Please try again.", variant: "destructive" });
    },
  });

  // Redirect to login if not authenticated or not an adopter
  if (!authLoading && (!user || !user.roles?.includes("adopter"))) {
    setLocation("/my-pets/login");
    return null;
  }

  if (authLoading || isLoading) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">My Pets</h1>
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="h-48 w-full" />
              <CardContent className="p-4">
                <Skeleton className="h-6 w-1/2 mb-2" />
                <Skeleton className="h-4 w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Card className="p-6">
          <div className="text-center">
            <PawPrint className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Unable to load your pets</h2>
            <p className="text-muted-foreground">Please try again later.</p>
          </div>
        </Card>
      </div>
    );
  }

  if (!pets || pets.length === 0) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">My Pets</h1>
        <Card className="p-8">
          <div className="text-center">
            <Heart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No pets yet</h2>
            <p className="text-muted-foreground mb-4">
              When you adopt a pet, their information will appear here.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold" data-testid="heading-my-pets">My Pets</h1>
        <p className="text-muted-foreground mt-1">
          Access your pet's medical records, set reminders, and share updates
        </p>
      </div>

      {/* PWA Install Prompt for iOS/Android */}
      <PWAInstallPrompt />

      <div className="grid gap-6 md:grid-cols-2">
        {pets.map((pet) => (
          <Link key={pet.id} href={`/my-pets/${pet.id}`}>
            <Card 
              className="overflow-hidden cursor-pointer hover-elevate transition-all"
              data-testid={`card-pet-${pet.id}`}
            >
              {pet.photoUrls && pet.photoUrls.length > 0 ? (
                <div className="aspect-video relative overflow-hidden">
                  <img
                    src={pet.photoUrls[0]}
                    alt={pet.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="aspect-video bg-muted flex items-center justify-center">
                  <PawPrint className="h-16 w-16 text-muted-foreground" />
                </div>
              )}
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-semibold" data-testid={`text-pet-name-${pet.id}`}>
                      {pet.name}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {pet.breed} • {pet.species}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground mt-1" />
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Badge variant="secondary" className="text-xs">
                    <Calendar className="h-3 w-3 mr-1" />
                    Adopted {new Date(pet.adoptedAt).toLocaleDateString()}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-8">
        <Button
          variant="outline"
          onClick={() => setShowSettings(!showSettings)}
          data-testid="button-notification-settings"
        >
          <Bell className="h-4 w-4 mr-2" />
          Notification Settings
        </Button>

        {showSettings && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Notification Preferences
              </CardTitle>
              <CardDescription>
                Choose how you'd like to receive reminders about your pet's care
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <NotificationPrefsForm
                prefs={notifPrefs}
                onSave={(prefs) => updatePrefsMutation.mutate(prefs)}
                isSaving={updatePrefsMutation.isPending}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function NotificationPrefsForm({
  prefs,
  onSave,
  isSaving,
}: {
  prefs?: NotificationPrefs;
  onSave: (prefs: Partial<NotificationPrefs>) => void;
  isSaving: boolean;
}) {
  const [emailEnabled, setEmailEnabled] = useState(prefs?.emailNotifications ?? true);
  const [smsEnabled, setSmsEnabled] = useState(prefs?.smsNotifications ?? false);
  const [phone, setPhone] = useState(prefs?.phone ?? "");
  const [vaccinationEnabled, setVaccinationEnabled] = useState(prefs?.vaccinationReminders ?? true);
  const [medicationEnabled, setMedicationEnabled] = useState(prefs?.medicationReminders ?? true);
  const [generalEnabled, setGeneralEnabled] = useState(prefs?.generalUpdates ?? true);

  useEffect(() => {
    if (prefs) {
      setEmailEnabled(prefs.emailNotifications);
      setSmsEnabled(prefs.smsNotifications);
      setPhone(prefs.phone ?? "");
      setVaccinationEnabled(prefs.vaccinationReminders);
      setMedicationEnabled(prefs.medicationReminders);
      setGeneralEnabled(prefs.generalUpdates);
    }
  }, [prefs]);

  const handleSave = () => {
    onSave({
      emailNotifications: emailEnabled,
      smsNotifications: smsEnabled,
      phone: phone || null,
      vaccinationReminders: vaccinationEnabled,
      medicationReminders: medicationEnabled,
      generalUpdates: generalEnabled,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-medium mb-3">Delivery Channels</h4>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="email-toggle">Email Notifications</Label>
                <p className="text-sm text-muted-foreground">Receive reminders via email</p>
              </div>
            </div>
            <Switch
              id="email-toggle"
              checked={emailEnabled}
              onCheckedChange={setEmailEnabled}
              data-testid="switch-email-notifications"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="sms-toggle">Text Message (SMS)</Label>
                <p className="text-sm text-muted-foreground">Receive urgent reminders by text</p>
              </div>
            </div>
            <Switch
              id="sms-toggle"
              checked={smsEnabled}
              onCheckedChange={setSmsEnabled}
              data-testid="switch-sms-notifications"
            />
          </div>

          {smsEnabled && (
            <div className="ml-7 pl-3 border-l-2 border-muted">
              <Label htmlFor="phone-input">Phone Number</Label>
              <Input
                id="phone-input"
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 max-w-xs"
                data-testid="input-phone-number"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Standard messaging rates may apply
              </p>
            </div>
          )}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium mb-3">Reminder Types</h4>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="vaccination-toggle">Vaccination Reminders</Label>
              <p className="text-sm text-muted-foreground">When vaccines are due or overdue</p>
            </div>
            <Switch
              id="vaccination-toggle"
              checked={vaccinationEnabled}
              onCheckedChange={setVaccinationEnabled}
              data-testid="switch-vaccination-reminders"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="medication-toggle">Medication Reminders</Label>
              <p className="text-sm text-muted-foreground">When medications are due</p>
            </div>
            <Switch
              id="medication-toggle"
              checked={medicationEnabled}
              onCheckedChange={setMedicationEnabled}
              data-testid="switch-medication-reminders"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="general-toggle">General Updates</Label>
              <p className="text-sm text-muted-foreground">Other pet care tips and updates</p>
            </div>
            <Switch
              id="general-toggle"
              checked={generalEnabled}
              onCheckedChange={setGeneralEnabled}
              data-testid="switch-general-updates"
            />
          </div>
        </div>
      </div>

      <Button
        onClick={handleSave}
        disabled={isSaving || (smsEnabled && !phone)}
        data-testid="button-save-preferences"
      >
        {isSaving ? "Saving..." : "Save Preferences"}
      </Button>
    </div>
  );
}

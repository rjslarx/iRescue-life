import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useFosterAnimals } from "@/hooks/useFosterAnimals";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import QuickPhotoUpload from "@/components/QuickPhotoUpload";
import SupplyRequestDialog from "@/components/SupplyRequestDialog";
import FosterUpdateDialog from "@/components/FosterUpdateDialog";
import type { Animal, RescueContact } from "@shared/schema";
import { Home, Heart, Package, User, Camera, Pill, Phone, AlertCircle, Check, X, Clock, ChevronRight, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface MedTask {
  id: string;
  drugName: string;
  dosage: string;
  scheduledTime: string;
  roundLabel: string;
  status: "pending" | "given" | "skipped";
  completedAt: string | null;
  instructions: string | null;
  skipReason: string | null;
}

interface AnimalMedGroup {
  animalId: string;
  animalName: string;
  tasks: MedTask[];
}

export default function FosterMobilePortal() {
  const { user } = useAuth();
  const { basePath } = useTenant();
  const { toast } = useToast();
  const medsRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null);
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [showSupplyRequest, setShowSupplyRequest] = useState(false);
  const [showFosterUpdate, setShowFosterUpdate] = useState(false);
  const [skipReasonTaskId, setSkipReasonTaskId] = useState<string | null>(null);
  const [skipReasonText, setSkipReasonText] = useState("");

  const { activeFosters, activeAnimals, isLoading: fostersLoading } = useFosterAnimals();

  const { data: medGroups, isLoading: medsLoading } = useQuery<AnimalMedGroup[]>({
    queryKey: ["/api/medications/tasks/today"],
  });

  const { data: contactsData } = useQuery<{ rescueContacts: RescueContact[] }>({
    queryKey: ["/api/rescue-contacts"],
  });
  const emergencyContact = contactsData?.rescueContacts.find(c => c.contactType === "medical_emergency");

  const markTaskMutation = useMutation({
    mutationFn: async ({ taskId, status, skipReason }: { taskId: string; status: string; skipReason?: string }) => {
      const res = await apiRequest("PATCH", `/api/medications/tasks/${taskId}/status`, { status, skipReason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/medications/tasks/today"] });
      toast({ title: "Medication updated" });
      setSkipReasonTaskId(null);
      setSkipReasonText("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update task", variant: "destructive" });
    },
  });

  const handleQuickPhoto = () => {
    if (activeAnimals.length > 0) {
      setSelectedAnimal(activeAnimals[0]);
      setShowPhotoUpload(true);
    }
  };

  const handleQuickSupply = () => {
    if (activeAnimals.length > 0) {
      setSelectedAnimal(activeAnimals[0]);
      setShowSupplyRequest(true);
    }
  };

  const renderDashboard = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => medsRef.current?.scrollIntoView({ behavior: "smooth" })}
          data-testid="button-quick-meds"
        >
          <Pill className="h-4 w-4" />
          Log Meds
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={handleQuickPhoto}
          data-testid="button-quick-photo"
        >
          <Camera className="h-4 w-4" />
          Upload Photo
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={handleQuickSupply}
          data-testid="button-quick-supply"
        >
          <Package className="h-4 w-4" />
          Request Supplies
        </Button>
      </div>

      <div ref={medsRef}>
        <Card data-testid="card-todays-meds">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Pill className="h-4 w-4" />
              Today's Meds
            </CardTitle>
          </CardHeader>
          <CardContent>
            {medsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !medGroups || medGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No medications due today</p>
            ) : (
              <div className="space-y-4">
                {medGroups.map((group) => (
                  <div key={group.animalId}>
                    <h4 className="text-sm font-semibold mb-2">{group.animalName}</h4>
                    <div className="space-y-2">
                      {group.tasks.map((task) => (
                        <div key={task.id} className="p-3 rounded-md bg-muted/50 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{task.drugName}</p>
                              <p className="text-xs text-muted-foreground">
                                {task.dosage} &middot; {task.roundLabel}
                              </p>
                              {task.instructions && (
                                <p className="text-xs text-muted-foreground mt-1">{task.instructions}</p>
                              )}
                            </div>
                            {task.status === "pending" && (
                              <div className="flex gap-1 flex-shrink-0">
                                <Button
                                  size="sm"
                                  onClick={() => markTaskMutation.mutate({ taskId: task.id, status: "given" })}
                                  disabled={markTaskMutation.isPending}
                                  data-testid={`button-mark-given-${task.id}`}
                                >
                                  <Check className="h-3 w-3 mr-1" />
                                  Given
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSkipReasonTaskId(task.id);
                                    setSkipReasonText("");
                                  }}
                                  disabled={markTaskMutation.isPending}
                                  data-testid={`button-mark-skip-${task.id}`}
                                >
                                  <X className="h-3 w-3 mr-1" />
                                  Skip
                                </Button>
                              </div>
                            )}
                            {task.status === "given" && (
                              <div className="flex items-center gap-1 text-green-600 flex-shrink-0">
                                <Check className="h-4 w-4" />
                                <span className="text-xs">
                                  Given{task.completedAt ? ` at ${new Date(task.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                                </span>
                              </div>
                            )}
                            {task.status === "skipped" && (
                              <span className="text-xs text-muted-foreground flex-shrink-0">
                                Skipped: {task.skipReason || "No reason"}
                              </span>
                            )}
                          </div>
                          {skipReasonTaskId === task.id && (
                            <div className="flex gap-2">
                              <Input
                                placeholder="Reason for skipping..."
                                value={skipReasonText}
                                onChange={(e) => setSkipReasonText(e.target.value)}
                                data-testid={`input-skip-reason-${task.id}`}
                              />
                              <Button
                                size="sm"
                                onClick={() => markTaskMutation.mutate({ taskId: task.id, status: "skipped", skipReason: skipReasonText })}
                                disabled={markTaskMutation.isPending}
                              >
                                Submit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSkipReasonTaskId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Heart className="h-4 w-4" />
            My Fosters
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fostersLoading ? (
            <div className="flex gap-3 overflow-x-auto">
              <Skeleton className="min-w-[180px] h-[140px] flex-shrink-0" />
              <Skeleton className="min-w-[180px] h-[140px] flex-shrink-0" />
            </div>
          ) : activeAnimals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No active fosters</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {activeAnimals.map((animal) => {
                const photoUrl = animal.photoUrls && animal.photoUrls.length > 0 ? animal.photoUrls[0] : null;
                return (
                  <Link key={animal.id} href={`/dashboard/my-fosters/${animal.id}`}>
                    <Card className="min-w-[180px] flex-shrink-0 hover-elevate cursor-pointer" data-testid={`card-foster-animal-${animal.id}`}>
                      <div className="h-24 bg-muted overflow-hidden rounded-t-md">
                        {photoUrl ? (
                          <img src={photoUrl} alt={animal.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Heart className="h-8 w-8 text-muted-foreground/30" />
                          </div>
                        )}
                      </div>
                      <CardContent className="p-3">
                        <p className="text-sm font-medium truncate">{animal.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{animal.species} &middot; {animal.breed}</p>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderAnimals = () => (
    <div className="space-y-3">
      {fostersLoading ? (
        <>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </>
      ) : activeAnimals.length === 0 ? (
        <Card className="text-center py-8">
          <Heart className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No active fosters</p>
        </Card>
      ) : (
        activeAnimals.map((animal) => {
          const photoUrl = animal.photoUrls && animal.photoUrls.length > 0 ? animal.photoUrls[0] : null;
          return (
            <Card key={animal.id} data-testid={`card-foster-animal-${animal.id}`}>
              <div className="flex">
                <div className="w-24 h-24 flex-shrink-0 bg-muted rounded-l-md overflow-hidden">
                  {photoUrl ? (
                    <img src={photoUrl} alt={animal.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Heart className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
                <div className="flex-1 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-base">{animal.name}</h3>
                      <p className="text-xs text-muted-foreground">{animal.species} &middot; {animal.breed}</p>
                    </div>
                    <Link href={`/dashboard/my-fosters/${animal.id}`}>
                      <Button variant="ghost" size="icon" data-testid={`button-view-details-${animal.id}`}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                  {animal.medicalAlertMemo && (
                    <div className="mt-2 flex items-center gap-1 text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      <span className="text-xs font-medium">Medical Alert</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );

  const renderRequests = () => (
    <div className="space-y-3">
      {fostersLoading ? (
        <Skeleton className="h-28 w-full" />
      ) : activeAnimals.length === 0 ? (
        <Card className="text-center py-8">
          <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No active fosters to manage</p>
        </Card>
      ) : (
        activeAnimals.map((animal) => (
          <Card key={animal.id}>
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-3">{animal.name}</h3>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => {
                    setSelectedAnimal(animal);
                    setShowSupplyRequest(true);
                  }}
                  data-testid={`button-supply-${animal.id}`}
                >
                  <Package className="h-3 w-3" />
                  Request Supplies
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => {
                    setSelectedAnimal(animal);
                    setShowFosterUpdate(true);
                  }}
                  data-testid={`button-update-${animal.id}`}
                >
                  <ArrowRight className="h-3 w-3" />
                  Submit Update
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );

  const renderProfile = () => (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">{user?.firstName} {user?.lastName}</h3>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
              {user?.activeRole && (
                <Badge variant="secondary" className="mt-1">{user.activeRole}</Badge>
              )}
            </div>
          </div>
          <Link href="/dashboard">
            <Button variant="outline" className="w-full gap-2" data-testid="button-go-dashboard">
              <ArrowRight className="h-4 w-4" />
              Go to Main Dashboard
            </Button>
          </Link>
        </CardContent>
      </Card>

      {emergencyContact && (
        <Card data-testid="card-emergency-contact">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <Phone className="h-5 w-5 text-destructive" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold">Emergency Contact</h4>
                <p className="text-xs text-muted-foreground">
                  {emergencyContact.name} &middot; {emergencyContact.availability}
                </p>
              </div>
              <a href={`tel:${emergencyContact.phone}`}>
                <Button variant="destructive" size="sm" data-testid="button-call-emergency">
                  Call Now
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-muted/30">
      <div className="p-4 border-b bg-background sticky top-0 z-40">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold" data-testid="heading-foster-portal">Foster Portal</h1>
            <p className="text-sm text-muted-foreground">Quick updates from your phone</p>
          </div>
          {emergencyContact && (
            <a href={`tel:${emergencyContact.phone}`} data-testid="link-emergency-call">
              <Button variant="destructive" size="sm" className="gap-1">
                <Phone className="h-4 w-4" />
                <span className="hidden sm:inline">Emergency</span>
              </Button>
            </a>
          )}
        </div>
      </div>

      <main className="flex-1 overflow-auto p-4 pb-20">
        {activeTab === "dashboard" && renderDashboard()}
        {activeTab === "animals" && renderAnimals()}
        {activeTab === "requests" && renderRequests()}
        {activeTab === "profile" && renderProfile()}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t">
        <div className="grid grid-cols-4">
          <button
            className={`flex flex-col items-center gap-1 py-3 text-xs ${activeTab === "dashboard" ? "text-primary font-medium" : "text-muted-foreground"}`}
            onClick={() => setActiveTab("dashboard")}
            data-testid="tab-dashboard"
          >
            <Home className="h-5 w-5" />
            Dashboard
          </button>
          <button
            className={`flex flex-col items-center gap-1 py-3 text-xs ${activeTab === "animals" ? "text-primary font-medium" : "text-muted-foreground"}`}
            onClick={() => setActiveTab("animals")}
            data-testid="tab-animals"
          >
            <Heart className="h-5 w-5" />
            My Animals
          </button>
          <button
            className={`flex flex-col items-center gap-1 py-3 text-xs ${activeTab === "requests" ? "text-primary font-medium" : "text-muted-foreground"}`}
            onClick={() => setActiveTab("requests")}
            data-testid="tab-requests"
          >
            <Package className="h-5 w-5" />
            Requests
          </button>
          <button
            className={`flex flex-col items-center gap-1 py-3 text-xs ${activeTab === "profile" ? "text-primary font-medium" : "text-muted-foreground"}`}
            onClick={() => setActiveTab("profile")}
            data-testid="tab-profile"
          >
            <User className="h-5 w-5" />
            Profile
          </button>
        </div>
      </nav>

      {selectedAnimal && (
        <>
          <QuickPhotoUpload
            open={showPhotoUpload}
            onOpenChange={setShowPhotoUpload}
            animal={selectedAnimal}
          />
          <SupplyRequestDialog
            open={showSupplyRequest}
            onOpenChange={setShowSupplyRequest}
            animalId={selectedAnimal.id}
            animalName={selectedAnimal.name}
          />
          <FosterUpdateDialog
            open={showFosterUpdate}
            onOpenChange={setShowFosterUpdate}
            animalId={selectedAnimal.id}
            animalName={selectedAnimal.name}
          />
        </>
      )}
    </div>
  );
}

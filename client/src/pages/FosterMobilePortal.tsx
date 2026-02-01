import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Camera, 
  MessageSquare, 
  Heart, 
  ArrowRight,
  Loader2,
  Phone,
  AlertCircle,
  Package,
  Clock,
  ChevronRight
} from "lucide-react";
import QuickPhotoUpload from "@/components/QuickPhotoUpload";
import QuickStatusUpdate from "@/components/QuickStatusUpdate";
import FosterUpdateDialog from "@/components/FosterUpdateDialog";
import SupplyRequestDialog from "@/components/SupplyRequestDialog";
import type { FosterAnimal, Animal, User, RescueContact, FosterUpdate } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

interface FosterAnimalWithDetails extends FosterAnimal {
  animal: Animal | null;
  foster: User | null;
}

interface MyFostersData {
  fosterAnimals: FosterAnimalWithDetails[];
}

interface FosterUpdateWithDetails extends FosterUpdate {
  animal: Animal | null;
  foster: User | null;
}

interface FosterUpdatesData {
  fosterUpdates: FosterUpdateWithDetails[];
}

interface RescueContactsData {
  rescueContacts: RescueContact[];
}

export default function FosterMobilePortal() {
  const { user } = useAuth();
  const { basePath } = useTenant();
  const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null);
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [showStatusUpdate, setShowStatusUpdate] = useState(false);
  const [showFullUpdate, setShowFullUpdate] = useState(false);
  const [showSupplyRequest, setShowSupplyRequest] = useState(false);

  const { data: fostersData, isLoading: fostersLoading } = useQuery<MyFostersData>({
    queryKey: ["/api/foster-animals"],
  });

  const { data: updatesData, isLoading: updatesLoading } = useQuery<FosterUpdatesData>({
    queryKey: ["/api/foster-updates"],
  });

  const { data: contactsData } = useQuery<RescueContactsData>({
    queryKey: ["/api/rescue-contacts"],
  });

  const myFosters = fostersData?.fosterAnimals.filter(fa => fa.status === "active") || [];
  const recentUpdates = updatesData?.fosterUpdates.slice(0, 3) || [];
  const emergencyContact = contactsData?.rescueContacts.find(
    c => c.contactType === "medical_emergency"
  );

  const handleQuickAction = (animal: Animal, action: "photo" | "status" | "full" | "supply") => {
    setSelectedAnimal(animal);
    if (action === "photo") {
      setShowPhotoUpload(true);
    } else if (action === "status") {
      setShowStatusUpdate(true);
    } else if (action === "full") {
      setShowFullUpdate(true);
    } else if (action === "supply") {
      setShowSupplyRequest(true);
    }
  };

  if (fostersLoading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b bg-background">
          <h1 className="text-xl font-bold">Foster Portal</h1>
          <p className="text-sm text-muted-foreground">Quick updates from your phone</p>
        </div>
        <main className="flex-1 overflow-auto p-4 space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </main>
      </div>
    );
  }

  if (myFosters.length === 0) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b bg-background">
          <h1 className="text-xl font-bold">Foster Portal</h1>
          <p className="text-sm text-muted-foreground">Quick updates from your phone</p>
        </div>
        <main className="flex-1 overflow-auto p-4">
          <Card className="text-center py-12">
            <Heart className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
            <h3 className="text-lg font-semibold mb-2">No Active Fosters</h3>
            <p className="text-sm text-muted-foreground mb-4 px-4">
              You don't have any animals in foster care right now.
            </p>
            <Link href="/dashboard">
              <Button variant="outline">Go to Dashboard</Button>
            </Link>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-muted/30">
      <div className="p-4 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between">
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

      <main className="flex-1 overflow-auto p-4 space-y-4">
        {myFosters.map((fosterAnimal) => {
          const animal = fosterAnimal.animal;
          if (!animal) return null;

          const photoUrl = animal.photoUrls && animal.photoUrls.length > 0 
            ? animal.photoUrls[0] 
            : null;

          return (
            <Card 
              key={fosterAnimal.id} 
              className="overflow-hidden"
              data-testid={`card-foster-animal-${animal.id}`}
            >
              <div className="flex">
                <div className="w-24 h-24 flex-shrink-0 bg-muted">
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt={animal.name}
                      className="w-full h-full object-cover"
                      data-testid={`img-animal-${animal.id}`}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Heart className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
                <div className="flex-1 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-base" data-testid={`text-animal-name-${animal.id}`}>
                        {animal.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {animal.species} • {animal.breed}
                      </p>
                    </div>
                    <Link href={`/dashboard/my-fosters/${animal.id}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-view-details-${animal.id}`}>
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

              <div className="border-t px-2 py-2 bg-muted/30">
                <div className="grid grid-cols-4 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto py-2 flex flex-col items-center gap-1"
                    onClick={() => handleQuickAction(animal, "photo")}
                    data-testid={`button-quick-photo-${animal.id}`}
                  >
                    <Camera className="h-5 w-5 text-primary" />
                    <span className="text-[10px]">Photo</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto py-2 flex flex-col items-center gap-1"
                    onClick={() => handleQuickAction(animal, "status")}
                    data-testid={`button-quick-status-${animal.id}`}
                  >
                    <MessageSquare className="h-5 w-5 text-primary" />
                    <span className="text-[10px]">Update</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto py-2 flex flex-col items-center gap-1"
                    onClick={() => handleQuickAction(animal, "supply")}
                    data-testid={`button-quick-supply-${animal.id}`}
                  >
                    <Package className="h-5 w-5 text-primary" />
                    <span className="text-[10px]">Supplies</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto py-2 flex flex-col items-center gap-1"
                    onClick={() => handleQuickAction(animal, "full")}
                    data-testid={`button-full-update-${animal.id}`}
                  >
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                    <span className="text-[10px]">More</span>
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}

        {recentUpdates.length > 0 && (
          <Card data-testid="card-recent-updates">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Recent Updates
              </CardTitle>
              <CardDescription className="text-xs">
                Your recent submissions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentUpdates.map((update) => (
                <div 
                  key={update.id}
                  className="flex items-start gap-3 p-2 rounded-md bg-muted/50"
                  data-testid={`update-item-${update.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium truncate">
                        {update.animal?.name || "Unknown"}
                      </span>
                      <Badge variant={
                        update.status === "pending" ? "secondary" :
                        update.status === "acknowledged" ? "default" :
                        "outline"
                      } className="text-[10px]">
                        {update.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {update.description}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(update.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  {update.photoUrls && update.photoUrls.length > 0 && (
                    <div className="w-12 h-12 rounded overflow-hidden flex-shrink-0">
                      <img
                        src={update.photoUrls[0]}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>
              ))}
              <Link href="/dashboard/foster-updates">
                <Button variant="ghost" size="sm" className="w-full text-xs" data-testid="button-view-all-updates">
                  View All Updates
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {emergencyContact && (
          <Card className="border-destructive/50" data-testid="card-emergency-contact">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <Phone className="h-5 w-5 text-destructive" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold">Emergency Contact</h4>
                  <p className="text-xs text-muted-foreground">
                    {emergencyContact.name} • {emergencyContact.availability}
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
      </main>

      {selectedAnimal && (
        <>
          <QuickPhotoUpload
            open={showPhotoUpload}
            onOpenChange={setShowPhotoUpload}
            animal={selectedAnimal}
          />
          <QuickStatusUpdate
            open={showStatusUpdate}
            onOpenChange={setShowStatusUpdate}
            animal={selectedAnimal}
          />
          <FosterUpdateDialog
            open={showFullUpdate}
            onOpenChange={setShowFullUpdate}
            animalId={selectedAnimal.id}
            animalName={selectedAnimal.name}
          />
          <SupplyRequestDialog
            open={showSupplyRequest}
            onOpenChange={setShowSupplyRequest}
            animalId={selectedAnimal.id}
            animalName={selectedAnimal.name}
          />
        </>
      )}
    </div>
  );
}

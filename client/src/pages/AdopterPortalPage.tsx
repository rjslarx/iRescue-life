import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useLocation } from "wouter";
import { PawPrint, Calendar, Heart, ChevronRight } from "lucide-react";
import { PWAInstallPrompt } from "@/components/IOSInstallPrompt";
import { useAuth } from "@/contexts/AuthContext";

interface AdoptedAnimal {
  id: string;
  name: string;
  species: string;
  breed: string;
  photoUrls?: string[];
  adoptedAt: string;
  microchipNumber?: string;
}

export default function AdopterPortalPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  
  const { data: pets, isLoading, error } = useQuery<AdoptedAnimal[]>({
    queryKey: ["/api/adopter/my-pets"],
    enabled: !!user && user.roles?.includes("adopter"),
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
    </div>
  );
}

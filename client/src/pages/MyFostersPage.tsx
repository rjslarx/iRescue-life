import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Heart, Package, MessageSquare, AlertCircle, Pill, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { FosterAnimal, Animal, User } from "@shared/schema";
import SupplyRequestDialog from "@/components/SupplyRequestDialog";
import FosterUpdateDialog from "@/components/FosterUpdateDialog";
import DashboardLayout from "@/components/DashboardLayout";

interface FosterAnimalWithDetails extends FosterAnimal {
  animal: Animal | null;
  foster: User | null;
}

interface MyFostersData {
  fosterAnimals: FosterAnimalWithDetails[];
}

export default function MyFostersPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [supplyDialogOpen, setSupplyDialogOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [selectedAnimal, setSelectedAnimal] = useState<{id: string, name: string} | null>(null);

  const { data, isLoading } = useQuery<MyFostersData>({
    queryKey: ['/api/foster-animals'],
  });

  const fosterAnimals = data?.fosterAnimals || [];
  const activeFosters = fosterAnimals.filter(fa => fa.status === 'active');

  const handleRequestSupplies = (animalId: string, animalName: string) => {
    if (fosterAnimals.length === 0) {
      toast({
        title: "No foster animals",
        description: "You don't have any foster animals assigned to you. Contact your rescue coordinator to get started with fostering.",
        variant: "destructive",
      });
      return;
    }
    setSelectedAnimal({ id: animalId, name: animalName });
    setSupplyDialogOpen(true);
  };

  const handleAddUpdate = (animalId: string, animalName: string) => {
    if (fosterAnimals.length === 0) {
      toast({
        title: "No foster animals",
        description: "You don't have any foster animals assigned to you. Contact your rescue coordinator to get started with fostering.",
        variant: "destructive",
      });
      return;
    }
    setSelectedAnimal({ id: animalId, name: animalName });
    setUpdateDialogOpen(true);
  };

  return (
    <DashboardLayout
      title="My Foster Animals"
      description={`${activeFosters.length} active foster${activeFosters.length !== 1 ? 's' : ''}`}
    >
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64" data-testid="loading-fosters">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : fosterAnimals.length === 0 ? (
          <Card className="p-12 text-center">
            <Heart className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">No Foster Animals Yet</h3>
            <p className="text-muted-foreground mb-6">
              You don't have any foster animals assigned to you at the moment.
            </p>
            <p className="text-sm text-muted-foreground">
              Contact your rescue coordinator to get started with fostering!
            </p>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {fosterAnimals.map((fosterAnimal) => {
                  const animal = fosterAnimal.animal;
                  if (!animal) return null;
                  
                  const photoUrl = animal.photoUrls && animal.photoUrls.length > 0 
                    ? animal.photoUrls[0] 
                    : null;

                  return (
                    <Card 
                      key={fosterAnimal.id} 
                      className="overflow-hidden hover-elevate flex flex-col"
                      data-testid={`card-foster-animal-${fosterAnimal.id}`}
                    >
                      <Link href={`/dashboard/my-fosters/${animal.id}`}>
                        <div className="cursor-pointer">
                          {photoUrl ? (
                            <div className="aspect-video overflow-hidden bg-muted">
                              <img 
                                src={photoUrl} 
                                alt={animal.name}
                                className="w-full h-full object-cover"
                                data-testid={`img-animal-photo-${fosterAnimal.id}`}
                              />
                            </div>
                          ) : (
                            <div className="aspect-video bg-muted flex items-center justify-center">
                              <Heart className="h-16 w-16 text-muted-foreground/30" />
                            </div>
                          )}
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <h3 className="text-xl font-semibold mb-1 truncate" data-testid={`text-animal-name-${fosterAnimal.id}`}>
                                  {animal.name}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                  {animal.species} • {animal.breed}
                                </p>
                              </div>
                              <Badge 
                                variant={fosterAnimal.status === 'active' ? 'default' : 'secondary'}
                                className="shrink-0"
                                data-testid={`badge-status-${fosterAnimal.id}`}
                              >
                                {fosterAnimal.status}
                              </Badge>
                            </div>
                          </CardHeader>
                        </div>
                      </Link>

                      <CardContent className="flex-1 pb-3">
                        {animal.medicalAlertMemo && (
                          <div className="mb-3 p-2 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-destructive">Medical Alert</p>
                              <p className="text-xs text-destructive/90 line-clamp-2">
                                {animal.medicalAlertMemo}
                              </p>
                            </div>
                          </div>
                        )}

                        {fosterAnimal.notes && (
                          <div className="mb-3 p-2 bg-muted rounded-md">
                            <div className="flex items-start gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-foreground">Care Notes</p>
                                <p className="text-xs text-muted-foreground line-clamp-3">
                                  {fosterAnimal.notes}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Fostering since {new Date(fosterAnimal.startDate).toLocaleDateString()}</span>
                        </div>
                      </CardContent>

                      {fosterAnimal.status === 'active' && (
                        <CardFooter className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3 border-t">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleRequestSupplies(animal.id, animal.name)}
                            data-testid={`button-request-supplies-${fosterAnimal.id}`}
                            className="gap-2"
                          >
                            <Package className="h-4 w-4" />
                            Request Supplies
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleAddUpdate(animal.id, animal.name)}
                            data-testid={`button-add-update-${fosterAnimal.id}`}
                            className="gap-2"
                          >
                            <MessageSquare className="h-4 w-4" />
                            Add Update
                          </Button>
                          <Button 
                            variant="default"
                            size="sm"
                            className="w-full gap-2 sm:col-span-2"
                            onClick={() => setLocation(`/dashboard/my-fosters/${animal.id}/medical`)}
                            data-testid={`button-view-medical-${fosterAnimal.id}`}
                          >
                            <Pill className="h-4 w-4" />
                            View Medical Info
                          </Button>
                        </CardFooter>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
      </div>

      {selectedAnimal && (
        <>
          <SupplyRequestDialog
            open={supplyDialogOpen}
            onOpenChange={setSupplyDialogOpen}
            animalId={selectedAnimal.id}
            animalName={selectedAnimal.name}
          />
          <FosterUpdateDialog
            open={updateDialogOpen}
            onOpenChange={setUpdateDialogOpen}
            animalId={selectedAnimal.id}
            animalName={selectedAnimal.name}
          />
        </>
      )}
    </DashboardLayout>
  );
}

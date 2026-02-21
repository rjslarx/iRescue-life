import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Home, Dog, Settings } from 'lucide-react';
import type { Kennel, Animal } from '@shared/schema';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';

export default function KennelGridPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isAdmin = user?.roles.includes('admin');

  const { data: kennelsData, isLoading: kennelsLoading } = useQuery<{ kennels: Kennel[] }>({
    queryKey: ['/api/kennels'],
  });

  const { data: animalsData, isLoading: animalsLoading } = useQuery<{ animals: Animal[] }>({
    queryKey: ['/api/animals'],
  });

  const kennels = kennelsData?.kennels || [];
  const animals = animalsData?.animals || [];

  const isLoading = kennelsLoading || animalsLoading;

  // Group animals by kennel location
  const kennelOccupancy = new Map<string, Animal[]>();
  const unassignedAnimals: Animal[] = [];

  // Only include active animals (not adopted or deceased, and not in foster)
  const activeAnimals = animals.filter(
    (animal) =>
      animal.status === 'available' ||
      animal.status === 'pending' ||
      animal.status === 'medical_hold'
  );

  activeAnimals.forEach((animal) => {
    // Use structured kennel data (kennelRowName + kennelPosition) instead of legacy kennelLocation
    if (animal.kennelRowName && animal.kennelPosition !== null && animal.kennelPosition !== undefined) {
      const kennelKey = `${animal.kennelRowName} - #${animal.kennelPosition + 1}`;
      const existing = kennelOccupancy.get(kennelKey) || [];
      kennelOccupancy.set(kennelKey, [...existing, animal]);
    } else {
      unassignedAnimals.push(animal);
    }
  });

  // Calculate stats
  const totalKennels = kennels.filter((k) => k.isActive).length;
  const occupiedKennels = Array.from(kennelOccupancy.keys()).filter((kennelName) =>
    kennels.some((k) => k.name === kennelName && k.isActive)
  ).length;
  const availableKennels = totalKennels - occupiedKennels;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-500';
      case 'pending':
        return 'bg-yellow-500';
      case 'medical_hold':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <DashboardLayout
      title="Kennel Occupancy"
      description="View current kennel assignments and availability"
    >
      <div className="space-y-6">
        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Kennels</CardTitle>
              <Home className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-kennels">
                {totalKennels}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Occupied</CardTitle>
              <Dog className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-occupied-kennels">
                {occupiedKennels}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Available</CardTitle>
              <Home className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="text-available-kennels">
                {availableKennels}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Admin Setup Links */}
        {isAdmin && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="bg-muted/50">
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">Configure Kennel Locations</p>
                  <p className="text-sm text-muted-foreground">
                    Add, edit, or remove kennel locations
                  </p>
                </div>
                <Button
                  onClick={() => setLocation('/dashboard/kennel-setup')}
                  data-testid="button-setup-kennels"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Setup
                </Button>
              </CardContent>
            </Card>
            <Card className="bg-muted/50">
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">Design Facility Layout</p>
                  <p className="text-sm text-muted-foreground">
                    Drag-and-drop visual kennel layout editor
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setLocation('/dashboard/kennel-layout')}
                  data-testid="button-layout-editor"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Layout Editor
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Loading kennel information...</p>
          </div>
        ) : kennels.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Home className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">No kennels configured</p>
              <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
                {isAdmin
                  ? 'Get started by configuring your kennel locations in the setup page'
                  : 'Ask an administrator to set up kennel locations'}
              </p>
              {isAdmin && (
                <Button onClick={() => setLocation('/dashboard/kennel-setup')} data-testid="button-go-to-setup">
                  <Settings className="h-4 w-4 mr-2" />
                  Go to Setup
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Kennel Grid */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Kennel Assignments</h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {kennels
                  .filter((k) => k.isActive)
                  .sort((a, b) => a.displayOrder - b.displayOrder)
                  .map((kennel) => {
                    const occupants = kennelOccupancy.get(kennel.name) || [];
                    const isOccupied = occupants.length > 0;

                    return (
                      <Card
                        key={kennel.id}
                        className={isOccupied ? '' : 'border-dashed'}
                        data-testid={`card-kennel-${kennel.id}`}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <CardTitle className="text-base">{kennel.name}</CardTitle>
                            <Badge
                              variant={isOccupied ? 'default' : 'secondary'}
                              data-testid={`badge-status-${kennel.id}`}
                            >
                              {isOccupied ? 'Occupied' : 'Available'}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {isOccupied ? (
                            <div className="space-y-2">
                              {occupants.map((animal) => (
                                <div
                                  key={animal.id}
                                  className="flex items-center gap-2 text-sm"
                                  data-testid={`occupant-${animal.id}`}
                                >
                                  <div className={`w-2 h-2 rounded-full ${getStatusColor(animal.status)}`} />
                                  <span className="font-medium">{animal.name}</span>
                                  <span className="text-muted-foreground">
                                    ({animal.species})
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">
                              No animals assigned
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </div>

            {/* Animals without kennel assignments */}
            {unassignedAnimals.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Animals Without Kennel Assignment</h3>
                <Card>
                  <CardHeader>
                    <CardDescription>
                      These animals are onsite but don't have a kennel location assigned
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {unassignedAnimals.map((animal) => (
                        <div
                          key={animal.id}
                          className="flex items-center gap-2 text-sm"
                          data-testid={`unassigned-${animal.id}`}
                        >
                          <div className={`w-2 h-2 rounded-full ${getStatusColor(animal.status)}`} />
                          <span className="font-medium">{animal.name}</span>
                          <span className="text-muted-foreground">
                            ({animal.species} - {animal.status.replace('_', ' ')})
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Legend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Status Legend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span>Available for adoption</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <span>Pending adoption</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span>Medical hold</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  Building2, 
  Plus, 
  Trash2, 
  LayoutGrid, 
  Dog,
  Cat, 
  Edit2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { tenantApiRequest } from '@/lib/tenantApi';
import type { KennelBuilding, KennelRow } from '@shared/schema';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import DashboardLayout from '@/components/DashboardLayout';

type BuildingWithRows = KennelBuilding & { rows: KennelRow[] };

type OccupiedKennel = {
  id: string;
  name: string;
  animalId: string;
  species: string;
  buildingId: string | null;
  rowId: string | null;
  position: number | null;
  status: string;
  medicalAlertMemo: string | null;
};

type AnimalSelectorDialogProps = {
  open: boolean;
  onClose: () => void;
  buildingId: string;
  rowId: string;
  position: number;
  currentAnimalId?: string;
};

const CLEAR_KENNEL_VALUE = '__clear__';

function AnimalSelectorDialog({ open, onClose, buildingId, rowId, position, currentAnimalId }: AnimalSelectorDialogProps) {
  const { toast } = useToast();
  const [selectedAnimalId, setSelectedAnimalId] = useState<string>(CLEAR_KENNEL_VALUE);

  // Fetch available animals (not assigned to kennels or currently assigned to this position)
  const { data: animalsData, isLoading } = useQuery<{ animals: any[] }>({
    queryKey: ['/api/animals'],
    enabled: open,
  });

  const animals = animalsData?.animals || [];

  // Filter animals that are available for kennel assignment
  const availableAnimals = animals.filter(animal => 
    animal.id === currentAnimalId || 
    (!animal.kennelBuildingId && !animal.kennelRowId && animal.status !== 'adopted' && animal.status !== 'deceased')
  );

  const isClearAction = selectedAnimalId === CLEAR_KENNEL_VALUE;

  const assignMutation = useMutation({
    mutationFn: async (animalId: string) => {
      if (animalId === CLEAR_KENNEL_VALUE) {
        // Clear assignment
        if (currentAnimalId) {
          return tenantApiRequest('PATCH', `/api/animals/${currentAnimalId}/kennel-assignment`, { 
            buildingId: null, rowId: null, position: null 
          });
        }
        return null;
      }
      
      // Assign animal to kennel
      return tenantApiRequest('PATCH', `/api/animals/${animalId}/kennel-assignment`, { 
        buildingId, rowId, position 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/kennel-occupancy'] });
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });
      toast({
        title: isClearAction ? 'Kennel cleared' : 'Animal assigned',
        description: isClearAction 
          ? 'Kennel has been cleared successfully'
          : 'Animal has been assigned to kennel successfully',
      });
      onClose();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update kennel assignment',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = () => {
    assignMutation.mutate(selectedAnimalId);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Animal to Kennel #{position + 1}</DialogTitle>
          <DialogDescription>
            Select an animal to assign to this kennel position, or clear to leave empty.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <div>
              <Label>Animal</Label>
              <Select value={selectedAnimalId} onValueChange={setSelectedAnimalId}>
                <SelectTrigger data-testid="select-animal">
                  <SelectValue placeholder="Select an animal or leave empty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CLEAR_KENNEL_VALUE}>-- Clear kennel --</SelectItem>
                  {availableAnimals.map(animal => (
                    <SelectItem key={animal.id} value={animal.id}>
                      {animal.name} ({animal.animalId}) - {animal.species}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} data-testid="button-cancel">
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={assignMutation.isPending}
              data-testid="button-assign"
            >
              {assignMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function KennelManagementPage() {
  const { toast } = useToast();
  // Default to visualize mode as the primary view
  const [viewMode, setViewMode] = useState<'edit' | 'visualize'>('visualize');
  const [activeBuildingId, setActiveBuildingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'building' | 'row'; id: string } | null>(null);
  const [animalDialogOpen, setAnimalDialogOpen] = useState(false);
  const [selectedKennel, setSelectedKennel] = useState<{ buildingId: string; rowId: string; position: number; currentAnimalId?: string } | null>(null);

  // Fetch buildings with rows
  const { data: buildings = [], isLoading: buildingsLoading } = useQuery<BuildingWithRows[]>({
    queryKey: ['/api/kennel-buildings'],
  });

  // Fetch kennel occupancy
  const { data: occupancy = [] } = useQuery<OccupiedKennel[]>({
    queryKey: ['/api/kennel-occupancy'],
  });

  // Set active building when buildings load - use useEffect to avoid render-time state updates
  useEffect(() => {
    if (!activeBuildingId && buildings.length > 0) {
      setActiveBuildingId(buildings[0].id);
    }
  }, [buildings, activeBuildingId]);

  const activeBuilding = buildings.find(b => b.id === activeBuildingId);

  // Mutations for buildings
  const createBuildingMutation = useMutation({
    mutationFn: () => tenantApiRequest('POST', '/api/kennel-buildings', { 
      name: 'New Building', displayOrder: buildings.length 
    }),
    onSuccess: (newBuilding: BuildingWithRows) => {
      queryClient.invalidateQueries({ queryKey: ['/api/kennel-buildings'] });
      setActiveBuildingId(newBuilding.id);
      toast({ title: 'Building created' });
    },
  });

  const updateBuildingMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => 
      tenantApiRequest('PATCH', `/api/kennel-buildings/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/kennel-buildings'] });
    },
  });

  const deleteBuildingMutation = useMutation({
    mutationFn: (id: string) => tenantApiRequest('DELETE', `/api/kennel-buildings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/kennel-buildings'] });
      setActiveBuildingId(null);
      toast({ title: 'Building deleted' });
    },
  });

  // Mutations for rows
  const createRowMutation = useMutation({
    mutationFn: (buildingId: string) => tenantApiRequest('POST', '/api/kennel-rows', { 
      buildingId, 
      name: 'New Row', 
      capacity: 5,
      type: 'standard',
      displayOrder: activeBuilding?.rows.length || 0
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/kennel-buildings'] });
      toast({ title: 'Row created' });
    },
  });

  const updateRowMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<KennelRow> }) => 
      tenantApiRequest('PATCH', `/api/kennel-rows/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/kennel-buildings'] });
      toast({ 
        title: 'Saved',
        description: 'Changes saved automatically',
        duration: 1500,
      });
    },
  });

  const deleteRowMutation = useMutation({
    mutationFn: (id: string) => tenantApiRequest('DELETE', `/api/kennel-rows/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/kennel-buildings'] });
      toast({ title: 'Row deleted' });
    },
  });

  const handleDelete = () => {
    if (!itemToDelete) return;
    
    if (itemToDelete.type === 'building') {
      if (buildings.length === 1) {
        toast({
          title: 'Cannot delete',
          description: 'You must have at least one building',
          variant: 'destructive',
        });
        return;
      }
      deleteBuildingMutation.mutate(itemToDelete.id);
    } else {
      deleteRowMutation.mutate(itemToDelete.id);
    }
    
    setDeleteDialogOpen(false);
    setItemToDelete(null);
  };

  const handleKennelClick = (buildingId: string, rowId: string, position: number) => {
    const animal = occupancy.find(
      a => a.buildingId === buildingId && a.rowId === rowId && a.position === position
    );
    
    setSelectedKennel({ 
      buildingId, 
      rowId, 
      position,
      currentAnimalId: animal?.id 
    });
    setAnimalDialogOpen(true);
  };

  if (buildingsLoading) {
    return (
      <DashboardLayout
        title="Facility Manager"
        description="Kennel Layout & Occupancy Management"
      >
        <div className="p-8 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  const headerActions = (
    <div className="flex gap-2">
      <Button 
        variant={viewMode === 'edit' ? 'default' : 'ghost'}
        onClick={() => setViewMode('edit')}
        data-testid="button-edit-mode"
      >
        <Edit2 className="w-4 h-4 mr-2" />
        Edit Layout
      </Button>
      <Button 
        variant={viewMode === 'visualize' ? 'default' : 'ghost'}
        onClick={() => setViewMode('visualize')}
        data-testid="button-visualize-mode"
      >
        <LayoutGrid className="w-4 h-4 mr-2" />
        Visualizer
      </Button>
    </div>
  );

  return (
    <DashboardLayout
      title="Facility Manager"
      description="Kennel Layout & Occupancy Management"
      actions={headerActions}
    >
      <div className="flex flex-1 overflow-hidden h-full">
        {/* Sidebar: Building Navigation */}
        <aside className="w-64 bg-card border-r flex flex-col">
          <div className="p-4 border-b">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Buildings
            </h2>
            <div className="space-y-2">
              {buildings.map(b => (
                <button
                  key={b.id}
                  onClick={() => setActiveBuildingId(b.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between group transition-all ${
                    activeBuildingId === b.id 
                      ? 'bg-primary/10 text-primary font-medium ring-1 ring-primary/20' 
                      : 'text-foreground hover:bg-accent'
                  }`}
                  data-testid={`building-${b.id}`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Building2 className="w-4 h-4 opacity-70" />
                    {b.name}
                  </span>
                  {activeBuildingId === b.id && (
                    <span className="bg-primary/20 text-primary text-[10px] px-1.5 py-0.5 rounded-full">
                      {b.rows.length} rows
                    </span>
                  )}
                </button>
              ))}
            </div>
            <Button 
              variant="outline"
              onClick={() => createBuildingMutation.mutate()}
              className="mt-3 w-full border-dashed"
              data-testid="button-add-building"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Building
            </Button>
          </div>

          <div className="p-4 mt-auto bg-muted/30 border-t">
            <div className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Tip:</strong> Create separate buildings for Quarantine or Intake areas to better manage disease control.
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-8">
          {!activeBuilding ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Select or create a building to get started</p>
            </div>
          ) : (
            <div className="max-w-5xl mx-auto">
              {/* Building Header */}
              <div className="mb-8 flex items-end gap-4 border-b pb-6">
                <div className="flex-1">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                    Building Name
                  </Label>
                  <Input 
                    value={activeBuilding.name}
                    onChange={(e) => updateBuildingMutation.mutate({ 
                      id: activeBuilding.id, 
                      name: e.target.value 
                    })}
                    className="text-3xl font-bold bg-transparent border-none p-0 focus-visible:ring-0 h-auto"
                    placeholder="e.g. Main Kennel"
                    data-testid="input-building-name"
                  />
                </div>
                <Button 
                  variant="destructive"
                  onClick={() => {
                    setItemToDelete({ type: 'building', id: activeBuilding.id });
                    setDeleteDialogOpen(true);
                  }}
                  data-testid="button-delete-building"
                >
                  Delete Building
                </Button>
              </div>

              {/* Content Switcher */}
              {viewMode === 'edit' ? (
                /* --- EDIT MODE --- */
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold">Row Configuration</h3>
                    <Button 
                      onClick={() => createRowMutation.mutate(activeBuilding.id)}
                      data-testid="button-add-row"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Row
                    </Button>
                  </div>

                  {activeBuilding.rows.length === 0 ? (
                    <div className="text-center py-12 bg-card rounded-xl border border-dashed">
                      <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                        <LayoutGrid className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <h3 className="font-medium">No rows configured</h3>
                      <p className="text-muted-foreground text-sm mt-1">
                        Start by adding a row of kennels to this building.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {activeBuilding.rows.map((row, index) => (
                        <div 
                          key={row.id} 
                          className="bg-card p-4 rounded-xl border shadow-sm flex items-center gap-4 group hover:border-primary/30 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold text-sm">
                            {index + 1}
                          </div>
                          
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <Label className="text-xs font-medium text-muted-foreground mb-1">
                                Row Name
                              </Label>
                              <Input 
                                value={row.name}
                                onChange={(e) => updateRowMutation.mutate({ 
                                  id: row.id, 
                                  data: { name: e.target.value } 
                                })}
                                placeholder="e.g. Row A"
                                data-testid={`input-row-name-${row.id}`}
                              />
                            </div>
                            <div>
                              <Label className="text-xs font-medium text-muted-foreground mb-1">
                                Capacity (Kennels)
                              </Label>
                              <Input 
                                type="number" 
                                min="1"
                                max="100"
                                value={row.capacity}
                                onChange={(e) => updateRowMutation.mutate({ 
                                  id: row.id, 
                                  data: { capacity: parseInt(e.target.value) || 0 } 
                                })}
                                data-testid={`input-row-capacity-${row.id}`}
                              />
                            </div>
                            <div>
                              <Label className="text-xs font-medium text-muted-foreground mb-1">
                                Type
                              </Label>
                              <Select 
                                value={row.type}
                                onValueChange={(value) => updateRowMutation.mutate({ 
                                  id: row.id, 
                                  data: { type: value as any } 
                                })}
                              >
                                <SelectTrigger data-testid={`select-row-type-${row.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="standard">Standard Run</SelectItem>
                                  <SelectItem value="isolation">Isolation/Quarantine</SelectItem>
                                  <SelectItem value="puppy">Puppy Pen</SelectItem>
                                  <SelectItem value="cat">Cat Condo</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setItemToDelete({ type: 'row', id: row.id });
                              setDeleteDialogOpen(true);
                            }}
                            className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                            data-testid={`button-delete-row-${row.id}`}
                          >
                            <Trash2 className="w-5 h-5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* --- VISUALIZE MODE --- */
                <div className="space-y-8">
                  <div className="bg-primary/10 text-primary p-4 rounded-lg flex items-start gap-3 border border-primary/20">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-sm">Interactive Kennel Map</h4>
                      <p className="text-xs opacity-90 mt-1">
                        Click any kennel box to assign or remove animals. Occupied kennels show the animal's name.
                      </p>
                    </div>
                  </div>

                  {activeBuilding.rows.map((row) => (
                    <div key={row.id} className="bg-card rounded-xl border shadow-sm overflow-hidden">
                      <div className="bg-muted border-b px-4 py-3 flex justify-between items-center">
                        <h3 className="font-semibold">{row.name}</h3>
                        <span className="text-xs font-medium px-2 py-1 bg-background border rounded-md text-muted-foreground uppercase">
                          {row.type} • {row.capacity} Units
                        </span>
                      </div>
                      
                      <div className="p-6">
                        <div className="flex flex-wrap gap-3">
                          {Array.from({ length: row.capacity }).map((_, i) => {
                            const animal = occupancy.find(
                              a => a.buildingId === activeBuilding.id && 
                                   a.rowId === row.id && 
                                   a.position === i
                            );
                            
                            return (
                              <button
                                key={i}
                                onClick={() => handleKennelClick(activeBuilding.id, row.id, i)}
                                className={`
                                  relative w-20 h-24 rounded-lg border-2 flex flex-col items-center justify-center gap-1 transition-all
                                  ${animal 
                                    ? 'bg-primary/10 border-primary shadow-md' 
                                    : 'bg-background border-border hover:border-primary/50 hover:shadow-md'
                                  }
                                `}
                                data-testid={`kennel-${row.id}-${i}`}
                              >
                                <span className={`text-xs font-bold ${animal ? 'text-primary' : 'text-muted-foreground'}`}>
                                  #{i + 1}
                                </span>
                                
                                {animal ? (
                                  <>
                                    {animal.species?.toLowerCase() === 'cat' ? (
                                      <Cat className="w-6 h-6 text-primary" />
                                    ) : (
                                      <Dog className="w-6 h-6 text-primary" />
                                    )}
                                    <div className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full animate-pulse" />
                                    <span className="text-[10px] font-medium text-primary truncate w-full px-1 text-center">
                                      {animal.name}
                                    </span>
                                  </>
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                                    <Plus className="w-3 h-3 text-muted-foreground" />
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}

                  {activeBuilding.rows.length === 0 && (
                    <p className="text-center text-muted-foreground italic">
                      No layout configured for this building yet.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {itemToDelete?.type === 'building' 
                ? 'This will delete the building and all its rows. Animals will be unassigned from their kennels.'
                : 'This will delete the row and unassign all animals in it.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} data-testid="button-confirm-delete">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Animal Assignment Dialog */}
      {selectedKennel && (
        <AnimalSelectorDialog 
          open={animalDialogOpen}
          onClose={() => {
            setAnimalDialogOpen(false);
            setSelectedKennel(null);
          }}
          buildingId={selectedKennel.buildingId}
          rowId={selectedKennel.rowId}
          position={selectedKennel.position}
          currentAnimalId={selectedKennel.currentAnimalId}
        />
      )}
    </DashboardLayout>
  );
}

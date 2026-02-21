import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, PawPrint, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Animal {
  id: string;
  name: string;
  species: string;
  breed?: string;
  status: string;
  photos?: string[];
}

interface ChangeAnimalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  applicationType: "adoption" | "foster";
  currentAnimalId?: string;
  currentAnimalName?: string;
  applicantName: string;
}

export function ChangeAnimalDialog({
  open,
  onOpenChange,
  applicationId,
  applicationType,
  currentAnimalId,
  currentAnimalName,
  applicantName,
}: ChangeAnimalDialogProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);

  const { data: animalsData, isLoading: loadingAnimals, isError: animalsError } = useQuery<{ animals: Animal[] }>({
    queryKey: ["/api/animals"],
    enabled: open,
  });

  const changeAnimalMutation = useMutation({
    mutationFn: async (newAnimalId: string) => {
      return apiRequest("POST", `/api/applications/${applicationId}/change-animal`, {
        newAnimalId,
      });
    },
    onSuccess: () => {
      toast({
        title: "Animal changed",
        description: "The application has been updated with the new animal.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/foster-applications"] });
      onOpenChange(false);
      setSelectedAnimalId(null);
      setSearchQuery("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to change animal",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const animals = animalsData?.animals || [];
  
  const availableAnimals = animals.filter((animal) => {
    const isAvailable = ["available", "foster", "hold", "medical_hold", "pending"].includes(animal.status);
    const isNotCurrent = animal.id !== currentAnimalId;
    const matchesSearch = searchQuery === "" || 
      animal.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      animal.breed?.toLowerCase().includes(searchQuery.toLowerCase());
    return isAvailable && isNotCurrent && matchesSearch;
  });

  const selectedAnimal = animals.find(a => a.id === selectedAnimalId);

  const handleConfirm = () => {
    if (selectedAnimalId) {
      changeAnimalMutation.mutate(selectedAnimalId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Change Animal</DialogTitle>
          <DialogDescription>
            Select a different animal for {applicantName}'s {applicationType} application.
            {currentAnimalName && (
              <span className="block mt-1">
                Currently: <strong>{currentAnimalName}</strong>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search animals by name or breed..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-animals"
            />
          </div>

          {loadingAnimals ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : animalsError ? (
            <div className="text-center py-8 text-destructive">
              <PawPrint className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Failed to load animals</p>
              <p className="text-sm text-muted-foreground mt-1">Please try again</p>
            </div>
          ) : availableAnimals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <PawPrint className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No available animals found</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2">
                {availableAnimals.map((animal) => (
                  <div
                    key={animal.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedAnimalId === animal.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => setSelectedAnimalId(animal.id)}
                    data-testid={`animal-option-${animal.id}`}
                  >
                    <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center overflow-hidden">
                      {animal.photos && animal.photos[0] ? (
                        <img
                          src={animal.photos[0].startsWith('/') ? `/api/objects${animal.photos[0]}` : animal.photos[0]}
                          alt={animal.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <PawPrint className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{animal.name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {animal.species} {animal.breed && `• ${animal.breed}`}
                      </p>
                    </div>
                    <Badge variant="secondary" className="capitalize shrink-0">
                      {animal.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {selectedAnimal && currentAnimalName && (
            <div className="flex items-center justify-center gap-2 py-2 px-3 bg-muted/50 rounded-lg text-sm">
              <span className="text-muted-foreground">{currentAnimalName}</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{selectedAnimal.name}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-change-animal"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedAnimalId || changeAnimalMutation.isPending}
            data-testid="button-confirm-change-animal"
          >
            {changeAnimalMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Change Animal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

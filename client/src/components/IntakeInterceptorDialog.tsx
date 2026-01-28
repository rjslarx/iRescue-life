import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/use-debounce";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Search, 
  Dog, 
  AlertTriangle, 
  ChevronRight, 
  RefreshCw,
  Fingerprint,
  Archive,
  CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";

type MatchType = 'microchip_exact' | 'name_exact' | 'name_prefix' | 'name_contains' | 'name_similar';

interface AnimalMatch {
  id: string;
  name: string;
  status: string;
  species: string;
  breed: string;
  primaryPhotoUrl: string | null;
  microchipNumber: string | null;
  intakeDate: string | null;
  matchType: MatchType;
  similarity?: number;
}

interface SearchResults {
  microchipMatches: AnimalMatch[];
  nameMatches: AnimalMatch[];
}

interface IntakeInterceptorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinueToIntake: () => void;
  onReactivate?: (animalId: string) => void;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  available: { label: "Available", variant: "default" },
  adopted: { label: "Adopted", variant: "secondary" },
  foster: { label: "In Foster", variant: "outline" },
  pending: { label: "Pending", variant: "outline" },
  adoption_pending: { label: "Adoption Pending", variant: "outline" },
  in_trial: { label: "Trial", variant: "outline" },
  medical_hold: { label: "Medical Hold", variant: "destructive" },
  behavioral_hold: { label: "Behavioral Hold", variant: "destructive" },
  intake: { label: "Intake", variant: "secondary" },
  archived: { label: "Archived", variant: "secondary" },
  deceased: { label: "Deceased", variant: "secondary" },
  merged: { label: "Merged", variant: "secondary" },
};

function getMatchLabel(matchType: MatchType, similarity?: number): string {
  switch (matchType) {
    case 'microchip_exact':
      return 'Microchip Match';
    case 'name_exact':
      return 'Exact Name';
    case 'name_prefix':
      return 'Name Prefix';
    case 'name_contains':
      return 'Name Contains';
    case 'name_similar':
      return `${Math.round((similarity || 0) * 100)}% Similar`;
    default:
      return 'Match';
  }
}

function AnimalMatchCard({ 
  animal, 
  onSelect,
  isReactivatable
}: { 
  animal: AnimalMatch; 
  onSelect: () => void;
  isReactivatable: boolean;
}) {
  const [, navigate] = useLocation();
  const status = statusConfig[animal.status] || { label: animal.status, variant: "secondary" as const };
  
  return (
    <Card 
      className={cn(
        "hover-elevate cursor-pointer transition-colors",
        animal.matchType === 'microchip_exact' && "border-amber-500 dark:border-amber-600"
      )}
      onClick={onSelect}
      data-testid={`card-animal-match-${animal.id}`}
    >
      <CardContent className="p-3 flex items-center gap-3">
        <Avatar className="h-12 w-12 rounded-lg">
          <AvatarImage src={animal.primaryPhotoUrl || undefined} alt={animal.name} />
          <AvatarFallback className="rounded-lg bg-muted">
            <Dog className="h-5 w-5 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{animal.name}</span>
            <Badge variant={status.variant} className="text-xs">
              {status.label}
            </Badge>
            {animal.matchType === 'microchip_exact' && (
              <Badge variant="outline" className="text-xs bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300">
                <Fingerprint className="h-3 w-3 mr-1" />
                {getMatchLabel(animal.matchType)}
              </Badge>
            )}
            {animal.matchType !== 'microchip_exact' && (
              <Badge variant="outline" className="text-xs">
                {getMatchLabel(animal.matchType, animal.similarity)}
              </Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground truncate">
            {animal.breed}
            {animal.microchipNumber && (
              <span className="ml-2 text-xs">
                Chip: {animal.microchipNumber}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isReactivatable && (
            <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300">
              <RefreshCw className="h-3 w-3 mr-1" />
              Re-Intake
            </Badge>
          )}
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function IntakeInterceptorDialog({
  open,
  onOpenChange,
  onContinueToIntake,
  onReactivate
}: IntakeInterceptorDialogProps) {
  const [, navigate] = useLocation();
  const [microchipSearch, setMicrochipSearch] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedAnimal, setSelectedAnimal] = useState<AnimalMatch | null>(null);

  const debouncedMicrochip = useDebounce(microchipSearch, 300);
  const debouncedName = useDebounce(nameSearch, 300);

  const shouldSearch = (debouncedMicrochip.trim().length > 0) || (debouncedName.trim().length >= 2);

  const { data: searchResults, isLoading, isFetching } = useQuery<SearchResults>({
    queryKey: ['/api/animals/search-duplicates', { microchip: debouncedMicrochip, name: debouncedName }],
    enabled: open && shouldSearch,
  });

  useEffect(() => {
    if (shouldSearch && searchResults) {
      setHasSearched(true);
    }
  }, [shouldSearch, searchResults]);

  const handleReset = useCallback(() => {
    setMicrochipSearch("");
    setNameSearch("");
    setHasSearched(false);
    setSelectedAnimal(null);
  }, []);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      handleReset();
    }
    onOpenChange(newOpen);
  };

  const handleContinueToIntake = () => {
    handleReset();
    onOpenChange(false);
    onContinueToIntake();
  };

  const handleAnimalSelect = (animal: AnimalMatch) => {
    const isReactivatable = ['archived', 'deceased', 'adopted'].includes(animal.status);
    
    if (isReactivatable && onReactivate) {
      onReactivate(animal.id);
      handleReset();
      onOpenChange(false);
    } else {
      navigate(`/manage/animals/${animal.id}`);
      handleReset();
      onOpenChange(false);
    }
  };

  const totalMatches = (searchResults?.microchipMatches?.length || 0) + (searchResults?.nameMatches?.length || 0);
  const hasMicrochipMatch = (searchResults?.microchipMatches?.length || 0) > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Check for Existing Records
          </DialogTitle>
          <DialogDescription>
            Search by microchip or name to prevent creating duplicate records.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="microchip-search" className="flex items-center gap-2">
                <Fingerprint className="h-4 w-4" />
                Microchip Number
              </Label>
              <Input
                id="microchip-search"
                placeholder="Enter microchip number..."
                value={microchipSearch}
                onChange={(e) => setMicrochipSearch(e.target.value)}
                data-testid="input-microchip-search"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name-search" className="flex items-center gap-2">
                <Dog className="h-4 w-4" />
                Animal Name
              </Label>
              <Input
                id="name-search"
                placeholder="Enter animal name (min 2 chars)..."
                value={nameSearch}
                onChange={(e) => setNameSearch(e.target.value)}
                data-testid="input-name-search"
              />
            </div>
          </div>

          {isLoading && shouldSearch && (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {!isLoading && hasSearched && totalMatches > 0 && (
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {hasMicrochipMatch && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm font-medium mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    Microchip Already Registered
                  </div>
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    This microchip is already in the system. Select the animal to view or re-intake.
                  </p>
                </div>
              )}

              {searchResults?.microchipMatches?.map((animal) => (
                <AnimalMatchCard
                  key={animal.id}
                  animal={animal}
                  onSelect={() => handleAnimalSelect(animal)}
                  isReactivatable={['archived', 'deceased', 'adopted'].includes(animal.status)}
                />
              ))}

              {searchResults?.nameMatches && searchResults.nameMatches.length > 0 && (
                <>
                  {hasMicrochipMatch && (
                    <div className="text-xs text-muted-foreground pt-2">
                      Other name matches:
                    </div>
                  )}
                  {searchResults.nameMatches.map((animal) => (
                    <AnimalMatchCard
                      key={animal.id}
                      animal={animal}
                      onSelect={() => handleAnimalSelect(animal)}
                      isReactivatable={['archived', 'deceased', 'adopted'].includes(animal.status)}
                    />
                  ))}
                </>
              )}
            </div>
          )}

          {!isLoading && hasSearched && totalMatches === 0 && (
            <div className="p-4 text-center bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-lg">
              <CheckCircle2 className="h-8 w-8 mx-auto text-green-600 dark:text-green-400 mb-2" />
              <p className="text-sm font-medium text-green-700 dark:text-green-300">
                No matching records found
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                You can proceed with creating a new intake.
              </p>
            </div>
          )}

          {!shouldSearch && !hasSearched && (
            <div className="p-4 text-center text-muted-foreground border border-dashed rounded-lg">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                Enter a microchip number or name to search for existing animals.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 mt-auto border-t">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="w-full sm:w-auto"
            data-testid="button-cancel-interceptor"
          >
            Cancel
          </Button>
          <Button
            onClick={handleContinueToIntake}
            className="w-full sm:w-auto"
            data-testid="button-continue-intake"
          >
            {hasMicrochipMatch ? (
              <>
                <AlertTriangle className="h-4 w-4 mr-2" />
                Proceed Anyway
              </>
            ) : (
              <>
                <Dog className="h-4 w-4 mr-2" />
                Continue to New Intake
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

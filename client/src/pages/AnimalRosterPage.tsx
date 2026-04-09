import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Dog,
  Cat,
  PawPrint,
  MapPin,
  Calendar,
  Filter,
  X,
} from "lucide-react";
import { format } from "date-fns";
import type { Animal } from "@shared/schema";

import dogPhoto from "@assets/generated_images/Golden_retriever_dog_portrait_fdeb8a78.png";

function getSpeciesIcon(species: string) {
  const s = species?.toLowerCase();
  if (s === "cat" || s === "kitten") return <Cat className="h-4 w-4" />;
  if (s === "dog" || s === "puppy") return <Dog className="h-4 w-4" />;
  return <PawPrint className="h-4 w-4" />;
}

function getStatusBadge(status: string) {
  const label = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  switch (status) {
    case "available":
      return <Badge variant="default" data-testid={`badge-status-${status}`}>{label}</Badge>;
    case "in_trial":
      return <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400 border-transparent" data-testid={`badge-status-${status}`}>{label}</Badge>;
    case "foster":
    case "in_foster":
      return <Badge className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400 border-transparent" data-testid={`badge-status-${status}`}>{label}</Badge>;
    case "medical_hold":
    case "bite_hold":
    case "stray_hold":
      return <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400 border-transparent" data-testid={`badge-status-${status}`}>{label}</Badge>;
    case "pending":
    case "adoption_pending":
    case "transfer_pending":
      return <Badge variant="outline" data-testid={`badge-status-${status}`}>{label}</Badge>;
    case "deceased":
      return <Badge variant="secondary" data-testid={`badge-status-${status}`}>{label}</Badge>;
    default:
      return <Badge variant="secondary" data-testid={`badge-status-${status}`}>{label}</Badge>;
  }
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  try {
    return format(new Date(dateStr), "MMM d, yyyy");
  } catch {
    return null;
  }
}

export default function AnimalRosterPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading } = useQuery<{ animals: Animal[] }>({
    queryKey: ["/api/animals"],
  });

  const allAnimals = data?.animals || [];

  const filteredAnimals = useMemo(() => {
    return allAnimals
      .filter((a) => a.status !== "adopted" && a.status !== "deceased" && a.status !== "merged" && a.status !== "transported" && a.status !== "returned_to_owner" && a.status !== "returned_to_field")
      .filter((a) => {
        if (speciesFilter !== "all" && a.species?.toLowerCase() !== speciesFilter.toLowerCase()) return false;
        if (statusFilter !== "all" && a.status !== statusFilter) return false;
        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          return (
            a.name?.toLowerCase().includes(term) ||
            a.breed?.toLowerCase().includes(term) ||
            (a as any).localShelterId?.toLowerCase().includes(term) ||
            (a as any).kennelLocation?.toLowerCase().includes(term)
          );
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allAnimals, searchTerm, speciesFilter, statusFilter]);

  const speciesOptions = useMemo(() => {
    const set = new Set<string>();
    allAnimals
      .filter((a) => a.status !== "adopted" && a.status !== "deceased" && a.status !== "merged" && a.status !== "transported" && a.status !== "returned_to_owner" && a.status !== "returned_to_field")
      .forEach((a) => {
        if (a.species) set.add(a.species);
      });
    return Array.from(set).sort();
  }, [allAnimals]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    allAnimals
      .filter((a) => a.status !== "adopted" && a.status !== "deceased" && a.status !== "merged" && a.status !== "transported" && a.status !== "returned_to_owner" && a.status !== "returned_to_field")
      .forEach((a) => {
        if (a.status) set.add(a.status);
      });
    return Array.from(set).sort();
  }, [allAnimals]);

  const hasActiveFilters = speciesFilter !== "all" || statusFilter !== "all" || searchTerm.trim() !== "";

  return (
    <DashboardLayout
      title="Animal Roster"
      description="Current animals in care"
    >
      <div className="flex-1 overflow-auto p-4 md:p-6 min-w-0">
        <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, breed, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              data-testid="input-search-roster"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={speciesFilter} onValueChange={setSpeciesFilter}>
              <SelectTrigger className="w-[130px]" data-testid="select-species-filter">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Species" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Species</SelectItem>
                {speciesOptions.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setSearchTerm("");
                  setSpeciesFilter("all");
                  setStatusFilter("all");
                }}
                data-testid="button-clear-filters"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-4" data-testid="text-animal-count">
          Showing {filteredAnimals.length} animal{filteredAnimals.length !== 1 ? "s" : ""}
        </p>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i}>
                <Skeleton className="h-48 w-full rounded-t-lg" />
                <CardContent className="p-3 space-y-2">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredAnimals.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <PawPrint className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground" data-testid="text-no-animals">
                {hasActiveFilters ? "No animals match your filters." : "No animals currently in care."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredAnimals.map((animal) => {
              const photoUrl = animal.photoUrls && animal.photoUrls.length > 0
                ? animal.photoUrls[0]
                : dogPhoto;
              const intakeFormatted = formatDate(animal.intakeDate);
              const kennelLocation = (animal as any).kennelLocation;
              const localId = (animal as any).localShelterId;

              return (
                <Card key={animal.id} data-testid={`card-animal-${animal.id}`}>
                  <div className="aspect-square overflow-hidden rounded-t-lg bg-muted">
                    <img
                      src={photoUrl}
                      alt={animal.name}
                      className="w-full h-full object-cover"
                      data-testid={`img-animal-${animal.id}`}
                    />
                  </div>
                  <CardContent className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold truncate" data-testid={`text-name-${animal.id}`}>
                        {animal.name}
                      </h3>
                      {getStatusBadge(animal.status)}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      {getSpeciesIcon(animal.species)}
                      <span className="truncate" data-testid={`text-breed-${animal.id}`}>
                        {animal.breed || animal.species}
                      </span>
                    </div>
                    {animal.age && (
                      <p className="text-xs text-muted-foreground" data-testid={`text-age-${animal.id}`}>
                        {animal.age}
                      </p>
                    )}
                    {localId && (
                      <p className="text-xs text-muted-foreground" data-testid={`text-id-${animal.id}`}>
                        ID: {localId}
                      </p>
                    )}
                    {kennelLocation && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate" data-testid={`text-location-${animal.id}`}>{kennelLocation}</span>
                      </div>
                    )}
                    {intakeFormatted && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3 shrink-0" />
                        <span data-testid={`text-intake-${animal.id}`}>Intake: {intakeFormatted}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

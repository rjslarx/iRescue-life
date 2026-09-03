import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Search, Sparkles } from "lucide-react";
import type { Animal, FosterAnimal, User } from "@shared/schema";
import DashboardLayout from "@/components/DashboardLayout";
import { PersonalityFitEditor } from "@/components/PersonalityFitEditor";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface FosterAnimalWithDetails extends FosterAnimal {
  animal: Animal | null;
  foster: User | null;
}

interface FosterAnimalsResponse {
  fosterAnimals: FosterAnimalWithDetails[];
}

function completionFor(animal: Animal) {
  const sections = [
    { label: "personality tags", complete: (animal.personalityTags?.length || 0) > 0 },
    { label: "a superpower", complete: (animal.superpowerBadges?.length || 0) > 0 },
    { label: "a reveal moment", complete: (animal.revealCards?.length || 0) > 0 },
  ];
  return {
    completed: sections.filter((section) => section.complete).length,
    next: sections.find((section) => !section.complete)?.label,
  };
}

export default function ProfileContributionsPage() {
  const { user } = useAuth();
  const activeRole = user?.activeRole;
  const isFoster = activeRole === "foster";
  const isVolunteer = activeRole === "volunteer";
  const canReview = activeRole === "owner" || activeRole === "admin";
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const animalsQuery = useQuery<{ animals: Animal[] }>({
    queryKey: [isVolunteer ? "/api/animals?publicOnly=true" : "/api/animals"],
    enabled: !!activeRole && !isFoster,
  });
  const fosterQuery = useQuery<FosterAnimalsResponse>({
    queryKey: ["/api/foster-animals"],
    enabled: isFoster,
  });

  const animals = useMemo(() => {
    const eligible = isFoster
      ? (fosterQuery.data?.fosterAnimals || [])
          .filter((assignment) => assignment.status === "active" && assignment.animal)
          .map((assignment) => assignment.animal as Animal)
      : animalsQuery.data?.animals || [];

    return eligible
      .filter((animal) => !["adopted", "deceased", "transported"].includes(animal.status))
      .filter((animal) => animal.name.toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => completionFor(a).completed - completionFor(b).completed || a.name.localeCompare(b.name));
  }, [animalsQuery.data?.animals, fosterQuery.data?.fosterAnimals, isFoster, search]);

  const selectedAnimal = animals.find((animal) => animal.id === selectedId)
    || animals.find((animal) => completionFor(animal).completed < 3)
    || animals[0];
  const isLoading = isFoster ? fosterQuery.isLoading : animalsQuery.isLoading;

  return (
    <DashboardLayout
      title="Profile Contributions"
      description="Add the small details that help adopters find the right match."
    >
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
        <Card className="border-primary/20 bg-gradient-to-r from-primary/10 via-card to-card">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 font-semibold"><Sparkles className="h-5 w-5 text-primary" />A few minutes can make a profile memorable</p>
              <p className="mt-1 text-sm text-muted-foreground">Choose an animal below. We put the profiles needing help first.</p>
            </div>
            <Badge variant="secondary" className="w-fit">{animals.filter((animal) => completionFor(animal).completed < 3).length} profiles need details</Badge>
          </CardContent>
        </Card>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find an animal" className="pl-9" />
        </div>

        {isLoading ? (
          <div className="flex h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
        ) : animals.length === 0 ? (
          <Card><CardContent className="p-10 text-center text-muted-foreground">No animals are currently available for you to contribute to.</CardContent></Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-3">
              {animals.map((animal) => {
                const progress = completionFor(animal);
                const selected = animal.id === selectedAnimal?.id;
                return (
                  <Button
                    key={animal.id}
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedId(animal.id)}
                    className={`h-auto w-full justify-start p-3 text-left ${selected ? "border-primary bg-primary/5" : ""}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">{animal.name}</span>
                        <span className="text-xs text-muted-foreground">{progress.completed}/3</span>
                      </div>
                      <p className="mt-1 whitespace-normal text-xs font-normal text-muted-foreground">
                        {progress.next ? `Next: add ${progress.next}` : "Profile essentials complete"}
                      </p>
                    </div>
                    {!progress.next && <CheckCircle2 className="ml-2 h-4 w-4 text-primary" />}
                  </Button>
                );
              })}
            </div>

            {selectedAnimal && (
              <div>
                <div className="mb-3">
                  <h2 className="text-xl font-semibold">Help with {selectedAnimal.name}&apos;s profile</h2>
                  <p className="text-sm text-muted-foreground">
                    {completionFor(selectedAnimal).next
                      ? `A great next step is to add ${completionFor(selectedAnimal).next}. You can update any section below.`
                      : "All essentials are present, but you can still add or improve details."}
                  </p>
                </div>
                <PersonalityFitEditor
                  animalId={selectedAnimal.id}
                  animalName={selectedAnimal.name}
                  initialProfile={{
                    personalityTags: selectedAnimal.personalityTags || [],
                    superpowerBadges: selectedAnimal.superpowerBadges || [],
                    revealCards: selectedAnimal.revealCards || [],
                  }}
                  canReview={canReview}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
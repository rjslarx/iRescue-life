import { useQuery } from "@tanstack/react-query";
import type { FosterAnimal, Animal, User } from "@shared/schema";

interface FosterAnimalWithDetails extends FosterAnimal {
  animal: Animal | null;
  foster: User | null;
}

interface MyFostersData {
  fosterAnimals: FosterAnimalWithDetails[];
}

export function useFosterAnimals() {
  const query = useQuery<MyFostersData>({
    queryKey: ["/api/foster-animals"],
    staleTime: 30000,
  });

  const allFosters = query.data?.fosterAnimals || [];
  const activeFosters = allFosters.filter(fa => fa.status === "active");
  const activeAnimals = activeFosters
    .map(fa => fa.animal)
    .filter((a): a is Animal => a !== null);

  return {
    ...query,
    allFosters,
    activeFosters,
    activeAnimals,
  };
}

import type { Animal } from "@shared/schema";

/**
 * Maps iRescue animal data to PetFinder format
 * Note: PetFinder API v2 is READ-ONLY
 * This mapper is for reference and potential future POST capabilities
 */
export function mapToPetFinder(animal: Animal): any {
  // Map our species to PetFinder types
  const typeMap: Record<string, string> = {
    dog: "Dog",
    cat: "Cat",
    rabbit: "Rabbit",
    "small & furry": "Small & Furry",
    horse: "Horse",
    bird: "Bird",
    "scales, fins & other": "Scales, Fins & Other",
    barnyard: "Barnyard",
  };

  // Map our age to PetFinder age
  const ageMap: Record<string, string> = {
    baby: "Baby",
    young: "Young",
    adult: "Adult",
    senior: "Senior",
  };

  // Map our status to PetFinder status
  const statusMap: Record<string, string> = {
    available: "adoptable",
    pending: "adoptable",
    adopted: "adopted",
    foster: "adoptable",
    medical_hold: "adoptable",
  };

  return {
    type: typeMap[animal.species.toLowerCase()] || "Dog",
    species: typeMap[animal.species.toLowerCase()] || "Dog",
    breeds: {
      primary: animal.breed,
      secondary: null,
      mixed: false,
      unknown: false,
    },
    age: ageMap[animal.age.toLowerCase()] || "Adult",
    gender: animal.sex === "male" ? "Male" : animal.sex === "female" ? "Female" : "Unknown",
    size: "Medium", // iRescue doesn't track size - could be inferred or added
    name: animal.name,
    description: animal.bio || `Meet ${animal.name}!`,
    photos: (animal.photoUrls || []).map(url => ({
      small: url,
      medium: url,
      large: url,
      full: url,
    })),
    status: statusMap[animal.status] || "adoptable",
    attributes: {
      spayed_neutered: animal.neuterStatus === "neutered" || animal.neuterStatus === "spayed",
      house_trained: null,
      declawed: null,
      special_needs: animal.medicalAlertMemo ? true : null,
      shots_current: null,
    },
    environment: {
      children: null,
      dogs: null,
      cats: null,
    },
    tags: [],
  };
}

/**
 * Maps iRescue animal data to RescueGroups format
 * RescueGroups uses JSON:API format
 */
export function mapToRescueGroups(animal: Animal, organizationId: string): any {
  // Map species
  const speciesMap: Record<string, string> = {
    dog: "Dog",
    cat: "Cat",
    rabbit: "Rabbit",
    bird: "Bird",
    horse: "Horse",
  };

  // Map age
  const ageMap: Record<string, string> = {
    baby: "Baby",
    young: "Young",
    adult: "Adult",
    senior: "Senior",
  };

  // Map sex
  const sexMap: Record<string, string> = {
    male: "Male",
    female: "Female",
    unknown: "Unknown",
  };

  return {
    type: "animals",
    attributes: {
      name: animal.name,
      species: speciesMap[animal.species.toLowerCase()] || "Dog",
      breeds: [{ name: animal.breed }],
      sex: sexMap[animal.sex || "unknown"],
      ageGroup: ageMap[animal.age.toLowerCase()] || "Adult",
      description: animal.bio || "",
      descriptionText: animal.bio || "",
      statusName: animal.status === "available" ? "Available" : "Not Available",
      altered: animal.neuterStatus === "neutered" || animal.neuterStatus === "spayed",
      birthDate: animal.dateOfBirth?.toISOString(),
      microchipNumber: animal.microchipNumber,
      pictures: (animal.photoUrls || []).map((url, index) => ({
        mediaOrder: index,
        original: {
          url: url,
        },
      })),
    },
    relationships: {
      orgs: {
        data: [
          {
            type: "orgs",
            id: organizationId,
          },
        ],
      },
    },
  };
}

/**
 * Maps iRescue animal data to Adopt-a-Pet format
 * Note: Adopt-a-Pet API is primarily read-only for partners
 * Updates are done through their dashboard
 */
export function mapToAdoptAPet(animal: Animal): any {
  const speciesMap: Record<string, string> = {
    dog: "Dog",
    cat: "Cat",
    rabbit: "Rabbit",
    bird: "Bird",
    horse: "Horse",
  };

  const sexMap: Record<string, string> = {
    male: "Male",
    female: "Female",
    unknown: "Unknown",
  };

  return {
    pet_name: animal.name,
    species: speciesMap[animal.species.toLowerCase()] || "Dog",
    primary_breed: animal.breed,
    secondary_breed: null,
    age: animal.age,
    gender: sexMap[animal.sex || "unknown"],
    size: "Medium", // Would need to be added to schema
    description: animal.bio || "",
    color: null, // Would need to be added to schema
    adoption_fee: null, // Would need to be added to schema
    images: animal.photoUrls || [],
    special_needs: animal.medicalAlertMemo ? true : false,
    shots_current: null, // Would need medical records integration
    altered: animal.neuterStatus === "neutered" || animal.neuterStatus === "spayed",
  };
}

/**
 * Generic mapper that routes to the appropriate platform
 */
export function mapAnimalToPlatform(
  animal: Animal,
  platform: "petfinder" | "rescuegroups" | "adoptapet",
  organizationId?: string
): any {
  switch (platform) {
    case "petfinder":
      return mapToPetFinder(animal);
    case "rescuegroups":
      if (!organizationId) {
        throw new Error("Organization ID required for RescueGroups");
      }
      return mapToRescueGroups(animal, organizationId);
    case "adoptapet":
      return mapToAdoptAPet(animal);
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

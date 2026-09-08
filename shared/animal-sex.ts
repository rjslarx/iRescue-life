/**
 * Prefer the gender edited on the animal profile; support older intake records
 * that only populated sex. Never infer sex from an animal's name or neuter status.
 */
export function formatAnimalSex(animal: {
  petfinderGender?: string | null;
  sex?: string | null;
}): 'Male' | 'Female' | 'Unknown' {
  for (const value of [animal.petfinderGender, animal.sex]) {
    switch (value?.trim().toLowerCase()) {
      case 'm':
      case 'male':
        return 'Male';
      case 'f':
      case 'female':
        return 'Female';
    }
  }
  return 'Unknown';
}
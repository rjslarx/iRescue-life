import { addWeeks, addMonths, addYears, differenceInWeeks, differenceInMonths } from 'date-fns';

export interface VaccineRecord {
  type: string;
  administeredAt: Date;
  expiresAt?: Date;
}

export interface HealthPlanItem {
  type: string;
  dueDate: Date;
  isRecurring: boolean;
  recurrenceRule?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  notes: string;
  enabled: boolean;
  reminderType: 'vaccine_booster' | 'heartworm' | 'flea_tick' | 'other';
}

interface Animal {
  id: string;
  species: string;
  dob?: Date | null;
  intakeDate?: Date | null;
}

const VACCINE_RULES = {
  RABIES: {
    minAgeWeeks: 12,
    puppyValidFor: { value: 1, unit: 'years' as const },
    adultValidFor: { value: 3, unit: 'years' as const },
  },
  DHPP: {
    puppySeriesInterval: { value: 3, unit: 'weeks' as const },
    puppySeriesEndAge: 16,
    adultValidFor: { value: 1, unit: 'years' as const },
  },
  FVRCP: {
    puppySeriesInterval: { value: 3, unit: 'weeks' as const },
    puppySeriesEndAge: 16,
    adultValidFor: { value: 1, unit: 'years' as const },
  },
  BORDETELLA: {
    validFor: { value: 1, unit: 'years' as const },
  },
  HEARTWORM: {
    interval: { value: 1, unit: 'months' as const },
  },
  FLEA_TICK: {
    interval: { value: 1, unit: 'months' as const },
  },
};

function estimateAge(animal: Animal): { ageInWeeks: number; dob: Date } {
  if (animal.dob) {
    const dob = new Date(animal.dob);
    return {
      ageInWeeks: differenceInWeeks(new Date(), dob),
      dob,
    };
  }
  
  const estimatedDob = animal.intakeDate 
    ? addMonths(new Date(animal.intakeDate), -6)
    : addYears(new Date(), -2);
  
  return {
    ageInWeeks: differenceInWeeks(new Date(), estimatedDob),
    dob: estimatedDob,
  };
}

export function generateHealthPlan(
  animal: Animal,
  medicalHistory: VaccineRecord[],
  adoptionDate: Date = new Date()
): HealthPlanItem[] {
  const plan: HealthPlanItem[] = [];
  const { ageInWeeks, dob } = estimateAge(animal);
  const isPuppy = ageInWeeks < 20;
  const isDog = animal.species?.toLowerCase() === 'dog';
  const isCat = animal.species?.toLowerCase() === 'cat';

  const rabiesRecords = medicalHistory
    .filter(r => r.type.toLowerCase().includes('rabies'))
    .sort((a, b) => new Date(a.administeredAt).getTime() - new Date(b.administeredAt).getTime());
  
  const lastRabies = rabiesRecords.length > 0 ? rabiesRecords[rabiesRecords.length - 1] : null;

  let rabiesDue: Date;

  if (!lastRabies) {
    if (ageInWeeks >= VACCINE_RULES.RABIES.minAgeWeeks) {
      rabiesDue = adoptionDate;
    } else {
      rabiesDue = addWeeks(dob, VACCINE_RULES.RABIES.minAgeWeeks);
    }
  } else {
    const lastRabiesDate = new Date(lastRabies.administeredAt);
    const ageAtLastRabiesWeeks = differenceInWeeks(lastRabiesDate, dob);
    
    const wasFirstRabies = rabiesRecords.length === 1 && ageAtLastRabiesWeeks < 72;
    const validDuration = wasFirstRabies
      ? VACCINE_RULES.RABIES.puppyValidFor
      : VACCINE_RULES.RABIES.adultValidFor;

    rabiesDue = addYears(lastRabiesDate, validDuration.value);
  }

  plan.push({
    type: 'Rabies Booster',
    dueDate: rabiesDue,
    isRecurring: false,
    notes: isPuppy ? '1-Year Puppy Shot' : '3-Year Booster',
    enabled: true,
    reminderType: 'vaccine_booster',
  });

  if (isDog) {
    const lastDHPP = medicalHistory
      .filter(r => r.type.toLowerCase().includes('dhpp') || r.type.toLowerCase().includes('distemper'))
      .sort((a, b) => new Date(b.administeredAt).getTime() - new Date(a.administeredAt).getTime())[0];

    let dhppDue: Date;

    if (ageInWeeks < VACCINE_RULES.DHPP.puppySeriesEndAge) {
      if (!lastDHPP) {
        dhppDue = adoptionDate;
      } else {
        dhppDue = addWeeks(new Date(lastDHPP.administeredAt), VACCINE_RULES.DHPP.puppySeriesInterval.value);
      }
    } else {
      if (!lastDHPP) {
        dhppDue = adoptionDate;
      } else {
        dhppDue = addYears(new Date(lastDHPP.administeredAt), VACCINE_RULES.DHPP.adultValidFor.value);
      }
    }

    plan.push({
      type: 'DHPP Booster',
      dueDate: dhppDue,
      isRecurring: false,
      notes: (ageInWeeks < VACCINE_RULES.DHPP.puppySeriesEndAge) ? 'Puppy Booster Series' : 'Annual Booster',
      enabled: true,
      reminderType: 'vaccine_booster',
    });

    const lastBordetella = medicalHistory
      .filter(r => r.type.toLowerCase().includes('bordetella') || r.type.toLowerCase().includes('kennel'))
      .sort((a, b) => new Date(b.administeredAt).getTime() - new Date(a.administeredAt).getTime())[0];

    const bordetellaDue = lastBordetella
      ? addYears(new Date(lastBordetella.administeredAt), VACCINE_RULES.BORDETELLA.validFor.value)
      : adoptionDate;

    plan.push({
      type: 'Bordetella',
      dueDate: bordetellaDue,
      isRecurring: false,
      notes: 'Annual - recommended for dogs in boarding/grooming',
      enabled: false,
      reminderType: 'vaccine_booster',
    });
  }

  if (isCat) {
    const lastFVRCP = medicalHistory
      .filter(r => r.type.toLowerCase().includes('fvrcp') || r.type.toLowerCase().includes('distemper'))
      .sort((a, b) => new Date(b.administeredAt).getTime() - new Date(a.administeredAt).getTime())[0];

    let fvrcpDue: Date;

    if (ageInWeeks < VACCINE_RULES.FVRCP.puppySeriesEndAge) {
      if (!lastFVRCP) {
        fvrcpDue = adoptionDate;
      } else {
        fvrcpDue = addWeeks(new Date(lastFVRCP.administeredAt), VACCINE_RULES.FVRCP.puppySeriesInterval.value);
      }
    } else {
      if (!lastFVRCP) {
        fvrcpDue = adoptionDate;
      } else {
        fvrcpDue = addYears(new Date(lastFVRCP.administeredAt), VACCINE_RULES.FVRCP.adultValidFor.value);
      }
    }

    plan.push({
      type: 'FVRCP Booster',
      dueDate: fvrcpDue,
      isRecurring: false,
      notes: (ageInWeeks < VACCINE_RULES.FVRCP.puppySeriesEndAge) ? 'Kitten Booster Series' : 'Annual Booster',
      enabled: true,
      reminderType: 'vaccine_booster',
    });
  }

  if (isDog) {
    plan.push({
      type: 'Heartworm Prevention',
      dueDate: addMonths(adoptionDate, 1),
      isRecurring: true,
      recurrenceRule: 'MONTHLY',
      notes: 'Give on the same day every month',
      enabled: true,
      reminderType: 'heartworm',
    });
  }

  plan.push({
    type: 'Flea/Tick Prevention',
    dueDate: addMonths(adoptionDate, 1),
    isRecurring: true,
    recurrenceRule: 'MONTHLY',
    notes: 'Monthly preventative treatment',
    enabled: true,
    reminderType: 'flea_tick',
  });

  return plan.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

export function getVaccineRecordsFromMedicalHistory(vaccinations: Array<{
  vaccineName: string;
  dateAdministered: Date | string;
  expirationDate?: Date | string | null;
}>): VaccineRecord[] {
  return vaccinations.map(v => ({
    type: v.vaccineName,
    administeredAt: new Date(v.dateAdministered),
    expiresAt: v.expirationDate ? new Date(v.expirationDate) : undefined,
  }));
}

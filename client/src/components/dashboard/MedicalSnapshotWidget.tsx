import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Stethoscope, ChevronRight, Syringe, ClipboardCheck, Pill } from "lucide-react";
import type { Animal } from "@shared/schema";
import { useTenant } from "@/contexts/TenantContext";

interface AnimalsResponse {
  animals: Animal[];
}

interface IntakeAnimal {
  id: string;
  name: string;
  species: string;
  status: string;
  intakeDate: string | null;
  medicalStatus: string | null;
  photoUrls: string[] | null;
  checklist: {
    intakeExam: boolean;
    vaccines: boolean;
    microchip: boolean;
    fecalTest: boolean;
    heartwormTest: boolean;
    spayNeuter: boolean;
  };
}

interface IntakeAnimalsResponse {
  animals: IntakeAnimal[];
}

interface DoseInfo {
  dose: {
    id: string;
    prescriptionId: string;
    dueDate: string;
    status: string;
  };
  prescription: {
    id: string;
    medicationName: string;
    dosage: string;
    frequency: string;
    animalId: string;
  } | null;
  animal: {
    id: string;
    name: string;
    species: string;
    photoUrls: string[] | null;
  } | null;
}

interface DosesTodayResponse {
  doses: DoseInfo[];
}

export default function MedicalSnapshotWidget() {
  const { basePath } = useTenant();
  const { data, isLoading } = useQuery<AnimalsResponse>({
    queryKey: ['/api/animals'],
  });

  const { data: dosesTodayData, isLoading: isLoadingDoses } = useQuery<DosesTodayResponse>({
    queryKey: ['/api/medical/doses/today'],
  });

  const { data: intakeAnimalsData, isLoading: isLoadingIntake } = useQuery<IntakeAnimalsResponse>({
    queryKey: ['/api/medical/intake-animals'],
  });

  const animals = data?.animals || [];
  const intakeAnimals = intakeAnimalsData?.animals || [];
  
  // Calculate needs vetting using same logic as Medical Pipeline intake tab:
  // Animals that are missing intake exam OR vaccines
  const needsVettingCount = intakeAnimals.filter(a => 
    !a.checklist.intakeExam || !a.checklist.vaccines
  ).length;
  
  const surgeryPending = animals.filter(a => a.medicalStatus === 'surgery_pending');
  const medsDueToday = dosesTodayData?.doses?.length || 0;

  if (isLoading || isLoadingDoses || isLoadingIntake) {
    return (
      <Card data-testid="card-medical-snapshot-widget">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-medium">Medical Pipeline</CardTitle>
          <Stethoscope className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-medical-snapshot-widget">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium">Medical Pipeline</CardTitle>
        <Stethoscope className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Link href={`${basePath}/dashboard/medical-pipeline?tab=treatments`}>
            <div 
              className={`flex flex-col items-center p-3 rounded-md cursor-pointer hover-elevate ${
                medsDueToday > 0 
                  ? 'bg-primary/10 border border-primary/20' 
                  : 'bg-muted/50'
              }`}
              data-testid="tile-meds-due-today"
            >
              <Pill className={`h-5 w-5 mb-1 ${medsDueToday > 0 ? 'text-primary' : 'text-muted-foreground'}`} />
              <div className={`text-xl font-bold ${medsDueToday > 0 ? 'text-primary' : 'text-foreground'}`} data-testid="text-meds-due-count">
                {medsDueToday}
              </div>
              <p className="text-xs text-muted-foreground text-center">Meds Due Today</p>
            </div>
          </Link>
          
          <Link href={`${basePath}/dashboard/medical-pipeline?tab=intake`}>
            <div 
              className={`flex flex-col items-center p-3 rounded-md cursor-pointer hover-elevate ${
                needsVettingCount > 0 
                  ? 'bg-primary/10 border border-primary/20' 
                  : 'bg-muted/50'
              }`}
              data-testid="tile-needs-vetting"
            >
              <ClipboardCheck className={`h-5 w-5 mb-1 ${needsVettingCount > 0 ? 'text-primary' : 'text-muted-foreground'}`} />
              <div className={`text-xl font-bold ${needsVettingCount > 0 ? 'text-primary' : 'text-foreground'}`} data-testid="text-needs-vetting-count">
                {needsVettingCount}
              </div>
              <p className="text-xs text-muted-foreground text-center">Needs Vetting</p>
            </div>
          </Link>
          
          <Link href={`${basePath}/dashboard/medical-pipeline?tab=surgery&section=scheduled-surgeries`}>
            <div 
              className={`flex flex-col items-center p-3 rounded-md cursor-pointer hover-elevate ${
                surgeryPending.length > 0 
                  ? 'bg-primary/10 border border-primary/20' 
                  : 'bg-muted/50'
              }`}
              data-testid="tile-surgery-pending"
            >
              <Syringe className={`h-5 w-5 mb-1 ${surgeryPending.length > 0 ? 'text-primary' : 'text-muted-foreground'}`} />
              <div className={`text-xl font-bold ${surgeryPending.length > 0 ? 'text-primary' : 'text-foreground'}`} data-testid="text-surgery-pending-count">
                {surgeryPending.length}
              </div>
              <p className="text-xs text-muted-foreground text-center">Surgery Pending</p>
            </div>
          </Link>
        </div>

        <Link href={`${basePath}/dashboard/medical-pipeline`}>
          <Button variant="ghost" size="sm" className="w-full" data-testid="link-view-medical">
            View Medical Pipeline
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

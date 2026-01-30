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

  const animals = data?.animals || [];
  const needsVetting = animals.filter(a => a.medicalStatus === 'needs_vetting');
  const surgeryPending = animals.filter(a => a.medicalStatus === 'surgery_pending');
  const medsDueToday = dosesTodayData?.doses?.length || 0;

  if (isLoading || isLoadingDoses) {
    return (
      <Card data-testid="card-medical-snapshot-widget">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-medium">Medical Pipeline</CardTitle>
          <Stethoscope className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-14 w-full mb-4" />
          <div className="grid grid-cols-2 gap-4 mb-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
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
        <Link href={`${basePath}/dashboard/medical-pipeline?tab=treatments`}>
          <div 
            className={`flex items-center justify-between p-3 rounded-md mb-4 cursor-pointer transition-all hover-elevate ${
              medsDueToday > 0 
                ? 'bg-primary/10 border border-primary/30' 
                : 'bg-muted/50'
            }`}
            data-testid="tile-meds-due-today"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${medsDueToday > 0 ? 'bg-primary/20' : 'bg-muted'}`}>
                <Pill className={`h-5 w-5 ${medsDueToday > 0 ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className={`text-sm font-semibold ${medsDueToday > 0 ? 'text-primary' : 'text-foreground'}`}>
                  Meds Due Today
                </p>
                <p className="text-xs text-muted-foreground">Click to view treatments</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${medsDueToday > 0 ? 'text-primary' : 'text-muted-foreground'}`} data-testid="text-meds-due-count">
                {medsDueToday}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </Link>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col items-center p-3 rounded-md bg-muted/50">
            <ClipboardCheck className="h-5 w-5 text-orange-500 mb-1" />
            <div className="text-xl font-bold" data-testid="text-needs-vetting-count">{needsVetting.length}</div>
            <p className="text-xs text-muted-foreground text-center">Needs Vetting</p>
          </div>
          <div className="flex flex-col items-center p-3 rounded-md bg-muted/50">
            <Syringe className="h-5 w-5 text-blue-500 mb-1" />
            <div className="text-xl font-bold" data-testid="text-surgery-pending-count">{surgeryPending.length}</div>
            <p className="text-xs text-muted-foreground text-center">Surgery Pending</p>
          </div>
        </div>

        {(needsVetting.length > 0 || surgeryPending.length > 0) && (
          <Badge variant="secondary" className="w-full justify-center mb-4 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
            {needsVetting.length + surgeryPending.length} animals need attention
          </Badge>
        )}

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

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Pill, PawPrint, Users, CheckCircle, ChevronRight, UserX } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

interface AnimalNeedingMedical {
  id: string;
  name: string;
  species: string;
  status: string;
  daysSinceLastExam: number | null;
  lastExamDate: string | null;
}

interface SilentFoster {
  fosterAnimalId: string;
  animalId: string;
  animalName: string;
  fosterName: string | null;
  fosterEmail: string | null;
  daysSinceLastUpdate: number;
  lastUpdateDate: string | null;
}

interface OverdueMedication {
  doseId: string;
  medicationName: string;
  animalId: string;
  animalName: string;
  dueDate: string;
  daysOverdue: number;
}

interface AtRiskAdopter {
  userId: string;
  name: string;
  email: string;
  missedCount: number;
}

interface ComplianceResponse {
  compliance: {
    animalsNeedingMedical: {
      count: number;
      items: AnimalNeedingMedical[];
    };
    silentFosters: {
      count: number;
      items: SilentFoster[];
    };
    overdueMedications: {
      count: number;
      items: OverdueMedication[];
    };
    complianceRate: number;
    totalActiveAnimals: number;
  };
}

export default function ComplianceWidget() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery<ComplianceResponse>({
    queryKey: ['/api/dashboard/compliance', user?.activeRole],
    enabled: !!user && user.activeRole !== 'foster',
  });

  const { data: atRiskData } = useQuery<AtRiskAdopter[]>({
    queryKey: ['/api/adopter/staff/compliance/at-risk'],
    enabled: !!user && (user.activeRole === 'admin' || user.activeRole === 'staff'),
  });

  const atRiskAdopters = atRiskData || [];

  if (isLoading) {
    return (
      <Card data-testid="compliance-widget-skeleton">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  const compliance = data?.compliance;
  const totalAtRisk = (compliance?.animalsNeedingMedical.count || 0) + 
                      (compliance?.silentFosters.count || 0) + 
                      (compliance?.overdueMedications.count || 0) +
                      atRiskAdopters.length;

  const hasNoIssues = totalAtRisk === 0;

  return (
    <Card id="compliance-widget" className={hasNoIssues ? "" : "border-l-4 border-l-destructive"} data-testid="compliance-widget">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className={`h-4 w-4 ${hasNoIssues ? 'text-green-500' : 'text-destructive'}`} />
          Compliance Monitor
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {hasNoIssues ? "All caught up!" : `${totalAtRisk} items need follow-up`}
        </p>
      </CardHeader>
      <CardContent>
        {hasNoIssues ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <CheckCircle className="h-10 w-10 text-green-500 mb-2" />
            <p className="text-sm text-muted-foreground">All compliance checks passed</p>
          </div>
        ) : (
          <Tabs defaultValue="meds" className="w-full">
            <TabsList className="w-full grid grid-cols-4 h-auto">
              <TabsTrigger value="meds" className="text-xs py-1.5 px-1" data-testid="tab-overdue-meds">
                <span className="flex items-center gap-0.5">
                  <Pill className="h-3 w-3" />
                  <span className="hidden sm:inline">Meds</span>
                  {(compliance?.overdueMedications.count || 0) > 0 && (
                    <Badge variant="destructive" className="ml-0.5 h-4 min-w-4 px-1 text-xs">
                      {compliance?.overdueMedications.count}
                    </Badge>
                  )}
                </span>
              </TabsTrigger>
              <TabsTrigger value="fosters" className="text-xs py-1.5 px-1" data-testid="tab-silent-fosters">
                <span className="flex items-center gap-0.5">
                  <Users className="h-3 w-3" />
                  <span className="hidden sm:inline">Fosters</span>
                  {(compliance?.silentFosters.count || 0) > 0 && (
                    <Badge variant="destructive" className="ml-0.5 h-4 min-w-4 px-1 text-xs">
                      {compliance?.silentFosters.count}
                    </Badge>
                  )}
                </span>
              </TabsTrigger>
              <TabsTrigger value="exams" className="text-xs py-1.5 px-1" data-testid="tab-medical-exams">
                <span className="flex items-center gap-0.5">
                  <PawPrint className="h-3 w-3" />
                  <span className="hidden sm:inline">Exams</span>
                  {(compliance?.animalsNeedingMedical.count || 0) > 0 && (
                    <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-xs">
                      {compliance?.animalsNeedingMedical.count}
                    </Badge>
                  )}
                </span>
              </TabsTrigger>
              <TabsTrigger value="at-risk" className="text-xs py-1.5 px-1" data-testid="tab-at-risk-adopters">
                <span className="flex items-center gap-0.5">
                  <UserX className="h-3 w-3" />
                  <span className="hidden sm:inline">At-Risk</span>
                  {atRiskAdopters.length > 0 && (
                    <Badge variant="destructive" className="ml-0.5 h-4 min-w-4 px-1 text-xs">
                      {atRiskAdopters.length}
                    </Badge>
                  )}
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="meds" className="mt-3 space-y-2">
              {(compliance?.overdueMedications.items || []).length === 0 ? (
                <div className="flex items-center justify-center py-4 text-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-sm text-muted-foreground">No overdue medications</span>
                </div>
              ) : (
                (compliance?.overdueMedications.items || []).slice(0, 3).map((med) => (
                  <Link key={med.doseId} href={`/dashboard/animals/${med.animalId}/medical`}>
                    <div className="p-2 border border-destructive/30 bg-destructive/5 rounded-md hover-elevate cursor-pointer" data-testid={`alert-overdue-med-${med.doseId}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{med.medicationName}</p>
                          <p className="text-xs text-muted-foreground">{med.animalName}</p>
                        </div>
                        <Badge variant="destructive" className="shrink-0">
                          {med.daysOverdue}d overdue
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </TabsContent>

            <TabsContent value="fosters" className="mt-3 space-y-2">
              {(compliance?.silentFosters.items || []).length === 0 ? (
                <div className="flex items-center justify-center py-4 text-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-sm text-muted-foreground">All fosters are up to date</span>
                </div>
              ) : (
                (compliance?.silentFosters.items || []).slice(0, 3).map((foster) => (
                  <Link key={foster.fosterAnimalId} href={`/dashboard/animals/${foster.animalId}`}>
                    <div className="p-2 border border-destructive/30 bg-destructive/5 rounded-md hover-elevate cursor-pointer" data-testid={`alert-silent-foster-${foster.fosterAnimalId}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{foster.animalName}</p>
                          <p className="text-xs text-muted-foreground truncate">{foster.fosterName || 'Foster'}</p>
                        </div>
                        <Badge variant="destructive" className="shrink-0">
                          {foster.daysSinceLastUpdate}d silent
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </TabsContent>

            <TabsContent value="exams" className="mt-3 space-y-2">
              {(compliance?.animalsNeedingMedical.items || []).length === 0 ? (
                <div className="flex items-center justify-center py-4 text-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-sm text-muted-foreground">All animals have recent exams</span>
                </div>
              ) : (
                (compliance?.animalsNeedingMedical.items || []).slice(0, 3).map((animal) => (
                  <Link key={animal.id} href={`/dashboard/animals/${animal.id}/medical`}>
                    <div className="p-2 border border-orange-300/50 bg-orange-50 dark:bg-orange-950/20 rounded-md hover-elevate cursor-pointer" data-testid={`alert-needs-exam-${animal.id}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{animal.name}</p>
                          <p className="text-xs text-muted-foreground">{animal.species}</p>
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          {animal.daysSinceLastExam ? `${animal.daysSinceLastExam}d ago` : 'No exam'}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </TabsContent>

            <TabsContent value="at-risk" className="mt-3 space-y-2">
              {atRiskAdopters.length === 0 ? (
                <div className="flex items-center justify-center py-4 text-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-sm text-muted-foreground">No at-risk adopters</span>
                </div>
              ) : (
                atRiskAdopters.slice(0, 3).map((adopter) => (
                  <div key={adopter.userId} className="p-2 border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 rounded-md" data-testid={`alert-at-risk-${adopter.userId}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{adopter.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{adopter.email}</p>
                      </div>
                      <Badge variant="destructive" className="shrink-0">
                        {adopter.missedCount} missed
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
      <CardFooter className="pt-0">
        <Link href="/dashboard/medical-pipeline" className="w-full">
          <Button variant="ghost" size="sm" className="w-full justify-between" data-testid="button-view-full-compliance">
            View Full Compliance Dashboard
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}

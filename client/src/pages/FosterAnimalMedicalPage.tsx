import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Heart, ArrowLeft, AlertCircle, Pill, Syringe, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FosterAnimal, Animal, User } from "@shared/schema";

interface FosterAnimalWithDetails extends FosterAnimal {
  animal: Animal | null;
  foster: User | null;
}

interface MyFostersData {
  fosterAnimals: FosterAnimalWithDetails[];
}

interface MedicalPrescription {
  id: string;
  medicationName: string;
  dosage: string;
  route: string;
  frequency: string;
  startDate: Date;
  endDate: Date | null;
  notes: string | null;
  isControlledSubstance: boolean;
}

interface MedicalVaccine {
  id: string;
  itemName: string;
  dateGiven: Date;
  dateDue: Date | null;
  administeredBy: string;
  lotNumber: string | null;
}

interface MedicalDataResponse {
  prescriptions: MedicalPrescription[];
  vaccines: MedicalVaccine[];
}

export default function FosterAnimalMedicalPage() {
  const { user } = useAuth();
  const { basePath } = useTenant();
  const { animalId } = useParams<{ animalId: string }>();

  const { data: fostersData, isLoading: fostersLoading } = useQuery<MyFostersData>({
    queryKey: ['/api/foster-animals'],
  });

  const { data: medicalData, isLoading: medicalLoading } = useQuery<MedicalDataResponse>({
    queryKey: [`/api/animals/${animalId}/medical-summary`],
    enabled: !!animalId,
  });

  const fosterAnimal = fostersData?.fosterAnimals.find(
    (fa) => fa.animal?.id === animalId
  );

  const animal = fosterAnimal?.animal;
  const prescriptions = medicalData?.prescriptions || [];
  const vaccines = medicalData?.vaccines || [];

  // Filter active prescriptions (no end date or end date in future)
  const activePrescriptions = prescriptions.filter(
    (p) => !p.endDate || new Date(p.endDate) >= new Date()
  );

  if (fostersLoading || medicalLoading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b p-4 bg-background">
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">Loading...</h1>
          </div>
        </div>
        <main className="flex-1 overflow-auto p-6">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </main>
      </div>
    );
  }

  if (!animal || !fosterAnimal) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b p-4 bg-background">
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">Animal Not Found</h1>
          </div>
        </div>
        <main className="flex-1 overflow-auto p-6">
          <Card className="p-12 text-center">
            <Heart className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">Animal Not Found</h3>
            <p className="text-muted-foreground mb-6">
              This animal is not assigned to you or does not exist.
            </p>
            <Link href="/dashboard/my-fosters">
              <Button>Back to My Fosters</Button>
            </Link>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b p-4 bg-background">
        <div className="flex-1 flex items-center gap-4">
          <Link href={`/dashboard/my-fosters/${animal.id}`}>
            <Button variant="ghost" size="sm" className="gap-2" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
              Back to Profile
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">{animal.name} - Medical Information</h1>
            <p className="text-sm text-muted-foreground">
              Read-only view for foster care reference
            </p>
          </div>
        </div>
      </div>
      <main className="flex-1 overflow-auto p-6">
            <div className="max-w-5xl mx-auto space-y-6">
              {/* Medical Alert */}
              {animal.medicalAlertMemo && (
                <Card className="border-destructive bg-destructive/5">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-destructive" />
                      <CardTitle className="text-destructive">Medical Alert</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm font-semibold" data-testid="text-medical-alert">
                      {animal.medicalAlertMemo}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Active Medications */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Pill className="h-5 w-5" />
                    <div className="flex-1">
                      <CardTitle>Medication Schedule (e-MAR)</CardTitle>
                      <CardDescription>Current medications and dosing instructions</CardDescription>
                    </div>
                    {activePrescriptions.length > 0 && (
                      <Badge variant="default">{activePrescriptions.length} active</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {activePrescriptions.length === 0 ? (
                    <div className="text-center py-8">
                      <Pill className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">
                        No active medications at this time.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {activePrescriptions.map((prescription) => (
                        <div 
                          key={prescription.id} 
                          className="p-4 border rounded-lg"
                          data-testid={`medication-${prescription.id}`}
                        >
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div className="flex-1">
                              <h4 className="font-semibold text-base mb-1">
                                {prescription.medicationName}
                                {prescription.isControlledSubstance && (
                                  <Badge variant="destructive" className="ml-2 text-xs">
                                    Controlled Substance
                                  </Badge>
                                )}
                              </h4>
                              <div className="text-sm text-muted-foreground space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">Dosage:</span>
                                  <span>{prescription.dosage}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">Route:</span>
                                  <span className="uppercase">{prescription.route}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">Frequency:</span>
                                  <span className="uppercase">{prescription.frequency}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Clock className="h-3 w-3" />
                                  <span className="text-xs">
                                    Started {new Date(prescription.startDate).toLocaleDateString()}
                                    {prescription.endDate && ` • Ends ${new Date(prescription.endDate).toLocaleDateString()}`}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          {prescription.notes && (
                            <div className="mt-3 p-3 bg-muted rounded-md">
                              <p className="text-xs font-medium text-muted-foreground mb-1">Notes:</p>
                              <p className="text-sm">{prescription.notes}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Vaccine History */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Syringe className="h-5 w-5" />
                    <div className="flex-1">
                      <CardTitle>Vaccine & Preventative History</CardTitle>
                      <CardDescription>Vaccination records and due dates</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {vaccines.length === 0 ? (
                    <div className="text-center py-8">
                      <Syringe className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">
                        No vaccination records available.
                      </p>
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Vaccine</TableHead>
                            <TableHead>Date Given</TableHead>
                            <TableHead>Next Due</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {vaccines.map((vaccine) => {
                            const isOverdue = vaccine.dateDue && new Date(vaccine.dateDue) < new Date();
                            const isDueSoon = vaccine.dateDue && 
                              new Date(vaccine.dateDue) > new Date() && 
                              new Date(vaccine.dateDue) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                            
                            return (
                              <TableRow 
                                key={vaccine.id}
                                data-testid={`vaccine-${vaccine.id}`}
                              >
                                <TableCell className="font-medium">
                                  {vaccine.itemName}
                                  {vaccine.lotNumber && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      Lot: {vaccine.lotNumber}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {new Date(vaccine.dateGiven).toLocaleDateString()}
                                </TableCell>
                                <TableCell>
                                  {vaccine.dateDue ? new Date(vaccine.dateDue).toLocaleDateString() : 'N/A'}
                                </TableCell>
                                <TableCell>
                                  {!vaccine.dateDue ? (
                                    <Badge variant="secondary">Complete</Badge>
                                  ) : isOverdue ? (
                                    <Badge variant="destructive">Overdue</Badge>
                                  ) : isDueSoon ? (
                                    <Badge variant="default">Due Soon</Badge>
                                  ) : (
                                    <Badge variant="outline">Current</Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Important Notes */}
              <Card className="bg-muted/50">
                <CardHeader>
                  <CardTitle className="text-base">Important Reminders</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <p>
                      For medical emergencies, contact your rescue coordinator immediately or call the emergency contact listed in your animal's profile.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Pill className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <p>
                      Always administer medications exactly as prescribed. Never adjust dosages without veterinary approval.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Syringe className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <p>
                      If you notice any vaccine is overdue or due soon, please notify your foster coordinator.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
      </main>
    </div>
  );
}

import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Printer, X } from "lucide-react";
import { format } from "date-fns";
import { useEffect } from "react";

export default function PrintableHealthRecordPage() {
  const { animalId } = useParams<{ animalId: string }>();

  // Fetch animal details
  const { data: animalData } = useQuery({
    queryKey: [`/api/animals/${animalId}`],
    enabled: !!animalId,
  });

  // Fetch medical history
  const { data: historyData } = useQuery({
    queryKey: [`/api/animals/${animalId}/medical/history`],
    enabled: !!animalId,
  });

  // Fetch all medical records
  const { data: examsData } = useQuery({
    queryKey: [`/api/animals/${animalId}/medical/exams`],
    enabled: !!animalId,
  });

  const { data: vaccinesData } = useQuery({
    queryKey: [`/api/animals/${animalId}/medical/vaccines`],
    enabled: !!animalId,
  });

  const { data: proceduresData } = useQuery({
    queryKey: [`/api/animals/${animalId}/medical/procedures`],
    enabled: !!animalId,
  });

  const { data: prescriptionsData } = useQuery({
    queryKey: [`/api/animals/${animalId}/medical/prescriptions`],
    enabled: !!animalId,
  });

  // Fetch diagnostics (includes heartworm tests)
  const { data: diagnosticsData } = useQuery({
    queryKey: [`/api/animals/${animalId}/medical/diagnostics`],
    enabled: !!animalId,
  });

  // Fetch preventative care records (flea/heartworm preventions)
  const { data: preventativeCareData } = useQuery({
    queryKey: [`/api/animals/${animalId}/preventative-care`],
    enabled: !!animalId,
  });

  const animal = animalData?.animal;
  const exams = examsData?.exams || [];
  const vaccines = vaccinesData?.vaccines || [];
  const procedures = proceduresData?.procedures || [];
  const prescriptions = prescriptionsData?.prescriptions || [];
  const diagnostics = diagnosticsData?.diagnostics || [];
  const preventativeCare = preventativeCareData?.records || [];

  // Hide non-printable elements and adjust for print
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @media print {
        .no-print {
          display: none !important;
        }
        body {
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }
        @page {
          size: auto;
          margin: 15mm;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const handleClose = () => {
    window.close();
  };

  if (!animal) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Loading health record...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      {/* Print Controls - Hidden when printing */}
      <div className="no-print fixed top-4 right-4 flex gap-2 z-50">
        <Button onClick={handlePrint} data-testid="button-print">
          <Printer className="w-4 h-4 mr-2" />
          Print
        </Button>
        <Button variant="outline" onClick={handleClose} data-testid="button-close">
          <X className="w-4 h-4 mr-2" />
          Close
        </Button>
      </div>

      {/* Printable Content */}
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold" data-testid="text-animal-name">
            {animal.name} - Health Record
          </h1>
          <p className="text-muted-foreground">
            Prepared on {format(new Date(), 'MMMM d, yyyy')}
          </p>
        </div>

        <Separator />

        {/* Animal Information */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">Animal Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Species</p>
                <p className="font-medium">{animal.species}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Breed</p>
                <p className="font-medium">{animal.breed}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Gender</p>
                <p className="font-medium">{animal.petfinderGender || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Neutered/Spayed</p>
                <p className="font-medium">{animal.neuterStatus || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Date of Birth</p>
                <p className="font-medium">
                  {animal.dateOfBirth ? format(new Date(animal.dateOfBirth), 'MMMM d, yyyy') : 'Unknown'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Microchip Number</p>
                <p className="font-medium">{animal.microchipNumber || 'None'}</p>
              </div>
            </div>
            {animal.medicalAlertMemo && (
              <div className="mt-4 p-4 bg-destructive/10 border border-destructive rounded-lg">
                <p className="font-semibold text-destructive mb-1">Medical Alert:</p>
                <p className="text-sm">{animal.medicalAlertMemo}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Vaccination History */}
        {vaccines.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">Vaccination History</h2>
              <div className="space-y-3">
                {vaccines.map((vaccine: any) => (
                  <div key={vaccine.id} className="flex justify-between items-start border-b pb-3 last:border-0">
                    <div>
                      <p className="font-medium">{vaccine.vaccineName}</p>
                      <p className="text-sm text-muted-foreground">
                        {vaccine.veterinarian && `Administered by ${vaccine.veterinarian}`}
                      </p>
                      {vaccine.lotNumber && (
                        <p className="text-sm text-muted-foreground">Lot: {vaccine.lotNumber}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm">Given: {format(new Date(vaccine.dateGiven), 'MMM d, yyyy')}</p>
                      {vaccine.dueDate && (
                        <p className="text-sm text-muted-foreground">
                          Due: {format(new Date(vaccine.dueDate), 'MMM d, yyyy')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Medical Procedures */}
        {procedures.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">Medical Procedures</h2>
              <div className="space-y-3">
                {procedures.map((proc: any) => (
                  <div key={proc.id} className="border-b pb-3 last:border-0">
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-medium">{proc.procedureName}</p>
                      <p className="text-sm">{format(new Date(proc.procedureDate), 'MMM d, yyyy')}</p>
                    </div>
                    {proc.veterinarian && (
                      <p className="text-sm text-muted-foreground">Veterinarian: {proc.veterinarian}</p>
                    )}
                    {proc.outcome && (
                      <p className="text-sm mt-1">{proc.outcome}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Current Medications */}
        {prescriptions.filter((p: any) => !p.endDate || new Date(p.endDate) >= new Date()).length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">Current Medications</h2>
              <div className="space-y-3">
                {prescriptions
                  .filter((p: any) => !p.endDate || new Date(p.endDate) >= new Date())
                  .map((rx: any) => (
                    <div key={rx.id} className="border-b pb-3 last:border-0">
                      <div className="flex justify-between items-start mb-1">
                        <p className="font-medium">{rx.medicationName}</p>
                        <p className="text-sm">Started: {format(new Date(rx.startDate), 'MMM d, yyyy')}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Dosage: {rx.dosage} - {rx.frequency}
                      </p>
                      {rx.prescribedBy && (
                        <p className="text-sm text-muted-foreground">Prescribed by: {rx.prescribedBy}</p>
                      )}
                      {rx.instructions && (
                        <p className="text-sm mt-1">{rx.instructions}</p>
                      )}
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Medical Exams */}
        {exams.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">Recent Medical Exams</h2>
              <div className="space-y-4">
                {exams.slice(0, 3).map((exam: any) => (
                  <div key={exam.id} className="border-b pb-4 last:border-0">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-medium">Exam Date</p>
                      <p className="text-sm">{format(new Date(exam.examDate), 'MMMM d, yyyy')}</p>
                    </div>
                    {exam.veterinarian && (
                      <p className="text-sm text-muted-foreground mb-2">Veterinarian: {exam.veterinarian}</p>
                    )}
                    {exam.soapFields && (
                      <div className="space-y-2 text-sm">
                        {exam.soapFields.subjective && (
                          <div>
                            <p className="font-medium">Subjective:</p>
                            <p className="text-muted-foreground">{exam.soapFields.subjective}</p>
                          </div>
                        )}
                        {exam.soapFields.objective && (
                          <div>
                            <p className="font-medium">Objective:</p>
                            <p className="text-muted-foreground">{exam.soapFields.objective}</p>
                          </div>
                        )}
                        {exam.soapFields.assessment && (
                          <div>
                            <p className="font-medium">Assessment:</p>
                            <p className="text-muted-foreground">{exam.soapFields.assessment}</p>
                          </div>
                        )}
                        {exam.soapFields.plan && (
                          <div>
                            <p className="font-medium">Plan:</p>
                            <p className="text-muted-foreground">{exam.soapFields.plan}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Diagnostics (Heartworm Tests, Labs, etc.) */}
        {diagnostics.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">Diagnostics & Lab Results</h2>
              <div className="space-y-4">
                {diagnostics.map((diagnostic: any, index: number) => (
                  <div key={diagnostic.id || index} className="border-b pb-3 last:border-b-0">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-medium">{diagnostic.testName}</p>
                      <p className="text-sm">{diagnostic.testDate ? format(new Date(diagnostic.testDate), 'MMMM d, yyyy') : 'N/A'}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {diagnostic.result && (
                        <div>
                          <span className="text-muted-foreground">Result: </span>
                          <span className={diagnostic.result?.toLowerCase() === 'positive' ? 'text-red-600 font-medium' : diagnostic.result?.toLowerCase() === 'negative' ? 'text-green-600 font-medium' : ''}>{diagnostic.result}</span>
                        </div>
                      )}
                      {diagnostic.testType && (
                        <div>
                          <span className="text-muted-foreground">Type: </span>
                          <span>{diagnostic.testType}</span>
                        </div>
                      )}
                      {diagnostic.laboratory && (
                        <div>
                          <span className="text-muted-foreground">Lab: </span>
                          <span>{diagnostic.laboratory}</span>
                        </div>
                      )}
                      {diagnostic.veterinarian && (
                        <div>
                          <span className="text-muted-foreground">Veterinarian: </span>
                          <span>{diagnostic.veterinarian}</span>
                        </div>
                      )}
                    </div>
                    {diagnostic.notes && (
                      <p className="text-sm text-muted-foreground mt-2">{diagnostic.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preventative Care (Flea/Heartworm Prevention, etc.) */}
        {preventativeCare.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">Preventative Care</h2>
              <div className="space-y-4">
                {preventativeCare.map((record: any, index: number) => (
                  <div key={record.id || index} className="border-b pb-3 last:border-b-0">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium">{record.careName}</p>
                        {record.careType && (
                          <p className="text-sm text-muted-foreground capitalize">{record.careType?.replace(/_/g, ' ')}</p>
                        )}
                      </div>
                      <div className="text-right text-sm">
                        {record.lastAdministered && (
                          <p>Given: {format(new Date(record.lastAdministered), 'MMM d, yyyy')}</p>
                        )}
                        {record.dueDate && (
                          <p className="text-muted-foreground">Due: {format(new Date(record.dueDate), 'MMM d, yyyy')}</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {record.manufacturer && (
                        <div>
                          <span className="text-muted-foreground">Brand: </span>
                          <span>{record.manufacturer}</span>
                        </div>
                      )}
                      {record.lotNumber && (
                        <div>
                          <span className="text-muted-foreground">Lot #: </span>
                          <span>{record.lotNumber}</span>
                        </div>
                      )}
                      {record.administeredBy && (
                        <div>
                          <span className="text-muted-foreground">Administered by: </span>
                          <span>{record.administeredBy}</span>
                        </div>
                      )}
                    </div>
                    {record.notes && (
                      <p className="text-sm text-muted-foreground mt-2">{record.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground pt-6 border-t">
          <p>This health record is provided for informational purposes.</p>
          <p>Please consult with a licensed veterinarian for any medical concerns.</p>
        </div>
      </div>
    </div>
  );
}

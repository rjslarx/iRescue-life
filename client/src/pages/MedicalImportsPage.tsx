import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  FileText, Loader2, Check, X, AlertTriangle,
  Syringe, Stethoscope, Pill, TestTube, ClipboardList,
  CheckCircle2, XCircle, Sparkles, Mail, ArrowLeft,
  PawPrint, Calendar
} from "lucide-react";
import type { Animal, MedicalImportBatch, MedicalImportItem } from "@shared/schema";
import { Link } from "wouter";

interface BatchWithItems extends MedicalImportBatch {
  items: MedicalImportItem[];
}

function getRecordTypeIcon(type: string) {
  switch (type) {
    case 'vaccine': return <Syringe className="w-4 h-4" />;
    case 'procedure': return <Stethoscope className="w-4 h-4" />;
    case 'prescription': return <Pill className="w-4 h-4" />;
    case 'diagnostic': return <TestTube className="w-4 h-4" />;
    case 'exam': return <ClipboardList className="w-4 h-4" />;
    default: return <FileText className="w-4 h-4" />;
  }
}

function getConfidenceBadge(confidence: string | number | null) {
  const value = typeof confidence === 'string' ? parseFloat(confidence) : confidence || 0;
  if (value >= 80) return <Badge variant="default" className="bg-green-500">High</Badge>;
  if (value >= 60) return <Badge variant="default" className="bg-yellow-500">Medium</Badge>;
  return <Badge variant="default" className="bg-orange-500">Low</Badge>;
}

function formatExtractedData(item: MedicalImportItem) {
  const data = item.extractedData as Record<string, unknown>;
  switch (item.recordType) {
    case 'vaccine':
      return (
        <div className="space-y-1 text-sm">
          <p><span className="font-medium">Vaccine:</span> {data.itemName as string}</p>
          <p><span className="font-medium">Date Given:</span> {data.dateGiven as string}</p>
          {data.dateDue && <p><span className="font-medium">Due:</span> {data.dateDue as string}</p>}
          {data.manufacturer && <p><span className="font-medium">Manufacturer:</span> {data.manufacturer as string}</p>}
          {data.lotNumber && <p><span className="font-medium">Lot #:</span> {data.lotNumber as string}</p>}
        </div>
      );
    case 'procedure':
      return (
        <div className="space-y-1 text-sm">
          <p><span className="font-medium">Procedure:</span> {data.procedureName as string}</p>
          <p><span className="font-medium">Date:</span> {data.procedureDate as string}</p>
          {data.veterinarian && <p><span className="font-medium">Vet:</span> {data.veterinarian as string}</p>}
          {data.notes && <p><span className="font-medium">Notes:</span> {data.notes as string}</p>}
        </div>
      );
    case 'prescription':
      return (
        <div className="space-y-1 text-sm">
          <p><span className="font-medium">Medication:</span> {data.medicationName as string}</p>
          <p><span className="font-medium">Dosage:</span> {data.dosage as string}</p>
          <p><span className="font-medium">Frequency:</span> {data.frequency as string}</p>
          {data.route && <p><span className="font-medium">Route:</span> {data.route as string}</p>}
          <p><span className="font-medium">Start:</span> {data.startDate as string}</p>
          {data.endDate && <p><span className="font-medium">End:</span> {data.endDate as string}</p>}
        </div>
      );
    case 'diagnostic':
      return (
        <div className="space-y-1 text-sm">
          <p><span className="font-medium">Test:</span> {data.testName as string}</p>
          <p><span className="font-medium">Date:</span> {data.testDate as string}</p>
          <p><span className="font-medium">Result:</span> {data.result as string}</p>
          {data.notes && <p><span className="font-medium">Notes:</span> {data.notes as string}</p>}
        </div>
      );
    case 'exam':
      return (
        <div className="space-y-1 text-sm">
          <p><span className="font-medium">Type:</span> {data.examType as string}</p>
          <p><span className="font-medium">Date:</span> {data.examDate as string}</p>
          <p><span className="font-medium">Performed By:</span> {data.performedBy as string}</p>
          {data.weight && <p><span className="font-medium">Weight:</span> {data.weight as string}</p>}
          {data.temperature && <p><span className="font-medium">Temp:</span> {data.temperature as string}</p>}
        </div>
      );
    default:
      return <pre className="text-xs">{JSON.stringify(data, null, 2)}</pre>;
  }
}

function BatchCard({ batch, animals }: { batch: BatchWithItems; animals: Animal[] }) {
  const { toast } = useToast();
  const [selectedAnimalId, setSelectedAnimalId] = useState<string>(batch.animalId || "");

  const assignAnimalMutation = useMutation({
    mutationFn: async (animalId: string) => {
      return apiRequest(`/api/medical-import/batches/${batch.id}/assign-animal`, {
        method: 'POST',
        body: JSON.stringify({ animalId }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      toast({ title: "Animal Assigned", description: "Animal has been linked to this import batch" });
      queryClient.invalidateQueries({ queryKey: ['/api/medical-import/email-batches'] });
    },
    onError: (error: Error) => {
      toast({ title: "Assignment Failed", description: error.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return apiRequest(`/api/medical-import/items/${itemId}/approve`, { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/medical-import/email-batches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/counts'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return apiRequest(`/api/medical-import/items/${itemId}/reject`, { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/medical-import/email-batches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/counts'] });
    },
  });

  const approveAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/medical-import/batches/${batch.id}/approve-all`, { method: 'POST' });
    },
    onSuccess: (data: { imported: number }) => {
      toast({ title: "Records Imported", description: `Successfully imported ${data.imported} medical records` });
      queryClient.invalidateQueries({ queryKey: ['/api/medical-import/email-batches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/counts'] });
    },
  });

  const pendingItems = batch.items.filter(i => i.status === 'pending');
  const approvedItems = batch.items.filter(i => i.status === 'approved');
  const rejectedItems = batch.items.filter(i => i.status === 'rejected');

  const assignedAnimal = animals.find(a => a.id === batch.animalId);
  const needsAnimalAssignment = !batch.animalId;

  return (
    <Card data-testid={`card-import-batch-${batch.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <Mail className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              {batch.fileName || "Email Import"}
              {batch.status === 'review' && <Badge variant="secondary">Pending Review</Badge>}
              {batch.status === 'approved' && <Badge variant="default" className="bg-green-500">Approved</Badge>}
              {batch.status === 'rejected' && <Badge variant="destructive">Rejected</Badge>}
            </CardTitle>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(batch.createdAt!).toLocaleString()}
              </span>
              <span>{batch.items.length} record{batch.items.length !== 1 ? 's' : ''} extracted</span>
              {batch.overallConfidence && (
                <span>Confidence: {Math.round(Number(batch.overallConfidence))}%</span>
              )}
            </div>
          </div>
          {assignedAnimal && (
            <Badge variant="outline" className="gap-1">
              <PawPrint className="w-3 h-3" />
              {assignedAnimal.name}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {needsAnimalAssignment && (
          <Card className="border-dashed border-amber-500/50 bg-amber-500/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium">Animal Assignment Required</p>
                  <p className="text-xs text-muted-foreground">
                    This import came from email. Please assign it to an animal before approving records.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={selectedAnimalId} onValueChange={setSelectedAnimalId}>
                      <SelectTrigger className="w-[250px]" data-testid={`select-animal-${batch.id}`}>
                        <SelectValue placeholder="Select an animal..." />
                      </SelectTrigger>
                      <SelectContent>
                        {animals.map(animal => (
                          <SelectItem key={animal.id} value={animal.id}>
                            {animal.name} ({animal.species})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      disabled={!selectedAnimalId || assignAnimalMutation.isPending}
                      onClick={() => assignAnimalMutation.mutate(selectedAnimalId)}
                      data-testid={`button-assign-animal-${batch.id}`}
                    >
                      {assignAnimalMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Assign"}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {pendingItems.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium flex items-center gap-1">
                Pending Review ({pendingItems.length})
              </h4>
              {!needsAnimalAssignment && pendingItems.length > 1 && (
                <Button
                  size="sm"
                  onClick={() => approveAllMutation.mutate()}
                  disabled={approveAllMutation.isPending}
                  data-testid={`button-approve-all-${batch.id}`}
                >
                  {approveAllMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                  )}
                  Approve All
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {pendingItems.map((item) => (
                <Card key={item.id}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 p-2 bg-muted rounded-md">
                        {getRecordTypeIcon(item.recordType)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="secondary" className="capitalize">{item.recordType}</Badge>
                          {getConfidenceBadge(item.confidence)}
                        </div>
                        {formatExtractedData(item)}
                        {item.sourceText && (
                          <details className="mt-2">
                            <summary className="text-xs text-muted-foreground cursor-pointer">View source text</summary>
                            <p className="text-xs mt-1 p-2 bg-muted rounded text-muted-foreground">{item.sourceText}</p>
                          </details>
                        )}
                      </div>
                      {!needsAnimalAssignment && (
                        <div className="flex-shrink-0 flex gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => rejectMutation.mutate(item.id)}
                            disabled={rejectMutation.isPending}
                            data-testid={`button-reject-${item.id}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            onClick={() => approveMutation.mutate(item.id)}
                            disabled={approveMutation.isPending}
                            data-testid={`button-approve-${item.id}`}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {approvedItems.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Approved ({approvedItems.length})
            </h4>
            <div className="space-y-2">
              {approvedItems.map((item) => (
                <Card key={item.id} className="border-green-500/30 bg-green-500/5">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 p-2 bg-green-500/10 rounded-md text-green-600">
                        {getRecordTypeIcon(item.recordType)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="secondary" className="capitalize">{item.recordType}</Badge>
                          <Badge variant="default" className="bg-green-500">Imported</Badge>
                        </div>
                        {formatExtractedData(item)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {rejectedItems.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-1">
              <XCircle className="w-4 h-4 text-red-500" />
              Rejected ({rejectedItems.length})
            </h4>
            <div className="space-y-2">
              {rejectedItems.map((item) => (
                <Card key={item.id} className="border-red-500/30 bg-red-500/5 opacity-60">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 p-2 bg-red-500/10 rounded-md text-red-600">
                        {getRecordTypeIcon(item.recordType)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="secondary" className="capitalize">{item.recordType}</Badge>
                          <Badge variant="destructive">Rejected</Badge>
                        </div>
                        {formatExtractedData(item)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {batch.items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No records extracted from this document</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function MedicalImportsPage() {
  const { data: batches, isLoading } = useQuery<BatchWithItems[]>({
    queryKey: ['/api/medical-import/email-batches'],
    refetchInterval: 30000,
  });

  const { data: animalsData } = useQuery<{ animals: Animal[] }>({
    queryKey: ['/api/animals'],
  });

  const animals = animalsData?.animals || [];
  const pendingBatches = batches?.filter(b => b.items.some(i => i.status === 'pending')) || [];
  const completedBatches = batches?.filter(b => !b.items.some(i => i.status === 'pending')) || [];

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" data-testid="button-back-dashboard">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-medical-imports">
            <Sparkles className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            Medical Record Imports
          </h1>
          <p className="text-sm text-muted-foreground">
            Review AI-parsed medical records from emailed vet documents
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : !batches || batches.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Mail className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="font-medium">No email imports yet</p>
            <p className="text-sm text-muted-foreground mt-1 text-center max-w-md">
              Forward vet records to your system import email address. AI will automatically parse the PDFs and they'll appear here for review.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {pendingBatches.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                Awaiting Review
                <Badge variant="secondary">{pendingBatches.length}</Badge>
              </h2>
              {pendingBatches.map(batch => (
                <BatchCard key={batch.id} batch={batch} animals={animals} />
              ))}
            </div>
          )}

          {pendingBatches.length > 0 && completedBatches.length > 0 && <Separator />}

          {completedBatches.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-muted-foreground">Previously Reviewed</h2>
              {completedBatches.map(batch => (
                <BatchCard key={batch.id} batch={batch} animals={animals} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

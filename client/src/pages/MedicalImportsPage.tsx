import { useState, useCallback } from "react";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { buildTenantUrl, getTenantHeaders } from "@/lib/tenantApi";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  FileText, Loader2, Check, X, AlertTriangle,
  Syringe, Stethoscope, Pill, TestTube, ClipboardList,
  CheckCircle2, XCircle, Sparkles, Mail, ArrowLeft,
  PawPrint, Calendar, Copy, Upload, ChevronDown, ChevronRight
} from "lucide-react";
import type { Animal, MedicalImportBatch, MedicalImportItem } from "@shared/schema";
import { Link } from "wouter";

interface BatchWithItems extends MedicalImportBatch {
  items: MedicalImportItem[];
  source: 'email' | 'upload';
  animalName: string | null;
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

type DuplicateMap = Record<string, { isDuplicate: boolean; matchedRecordId?: string; matchedSummary?: string }>;

function BatchCard({ batch, animals, defaultCollapsed = false }: { batch: BatchWithItems; animals: Animal[]; defaultCollapsed?: boolean }) {
  const { toast } = useToast();
  const [selectedAnimalId, setSelectedAnimalId] = useState<string>(batch.animalId || "");
  const [confirmApproveItemId, setConfirmApproveItemId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(!defaultCollapsed);

  const hasPendingItems = batch.items.some(i => i.status === 'pending');
  const hasAnimalAssigned = !!batch.animalId;

  const { data: dupData, isLoading: dupLoading } = useQuery<{ duplicates: DuplicateMap }>({
    queryKey: ['/api/medical-import/batches', batch.id, 'check-duplicates'],
    enabled: hasAnimalAssigned && hasPendingItems,
    staleTime: 10000,
    retry: 1,
  });

  const dupCheckReady = hasAnimalAssigned && hasPendingItems ? !dupLoading : true;
  const duplicates: DuplicateMap = dupData?.duplicates || {};

  const assignAnimalMutation = useMutation({
    mutationFn: async (animalId: string) => {
      return apiRequest("POST", `/api/medical-import/batches/${batch.id}/assign-animal`, { animalId });
    },
    onSuccess: () => {
      toast({ title: "Animal Assigned", description: "Animal has been linked to this import batch" });
      queryClient.invalidateQueries({ queryKey: ['/api/medical-import/all-batches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/medical-import/batches', batch.id, 'check-duplicates'] });
    },
    onError: (error: Error) => {
      toast({ title: "Assignment Failed", description: error.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return apiRequest("POST", `/api/medical-import/items/${itemId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/medical-import/all-batches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/counts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/medical-import/batches', batch.id, 'check-duplicates'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return apiRequest("POST", `/api/medical-import/items/${itemId}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/medical-import/all-batches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/counts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/medical-import/batches', batch.id, 'check-duplicates'] });
    },
  });

  const approveAllMutation = useMutation({
    mutationFn: async (options?: { skipDuplicates?: boolean }): Promise<{ imported: number; skippedDuplicates?: number }> => {
      if (options?.skipDuplicates) {
        const nonDupItems = pendingItems.filter(i => !duplicates[i.id]?.isDuplicate);
        const results = [];
        for (const item of nonDupItems) {
          try {
            await apiRequest("POST", `/api/medical-import/items/${item.id}/approve`);
            results.push({ success: true });
          } catch {
            results.push({ success: false });
          }
        }
        return { imported: results.filter(r => r.success).length, skippedDuplicates: pendingItems.length - nonDupItems.length };
      }
      const res = await apiRequest("POST", `/api/medical-import/batches/${batch.id}/approve-all`);
      const json = await res.json();
      return { imported: json.imported || 0 };
    },
    onSuccess: (data) => {
      const parts = [`Successfully imported ${data.imported} medical records`];
      if (data.skippedDuplicates && data.skippedDuplicates > 0) {
        parts.push(`${data.skippedDuplicates} likely duplicate(s) skipped`);
      }
      toast({ title: "Records Imported", description: parts.join('. ') });
      queryClient.invalidateQueries({ queryKey: ['/api/medical-import/all-batches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/counts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/medical-import/batches', batch.id, 'check-duplicates'] });
    },
  });

  const handleApproveClick = (itemId: string) => {
    if (duplicates[itemId]?.isDuplicate) {
      setConfirmApproveItemId(itemId);
    } else {
      approveMutation.mutate(itemId);
    }
  };

  const pendingItems = batch.items.filter(i => i.status === 'pending');
  const approvedItems = batch.items.filter(i => i.status === 'approved');
  const rejectedItems = batch.items.filter(i => i.status === 'rejected');

  const duplicateCount = pendingItems.filter(i => duplicates[i.id]?.isDuplicate).length;
  const nonDuplicateCount = pendingItems.length - duplicateCount;
  const allPendingAreDuplicates = duplicateCount > 0 && nonDuplicateCount === 0;

  const assignedAnimal = animals.find(a => a.id === batch.animalId);
  const needsAnimalAssignment = !batch.animalId;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
    <Card data-testid={`card-import-batch-${batch.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="space-y-1 flex-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-5 w-5 p-0 flex-shrink-0" data-testid={`button-toggle-batch-${batch.id}`}>
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </Button>
              </CollapsibleTrigger>
              {batch.source === 'email' ? (
                <Mail className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              ) : (
                <Upload className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              )}
              {batch.originalFileName || "Import"}
              <Badge variant="outline" className={batch.source === 'email' ? "text-purple-600 border-purple-300" : "text-blue-600 border-blue-300"}>
                {batch.source === 'email' ? 'Email' : 'Upload'}
              </Badge>
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
              {!isExpanded && (
                <>
                  {approvedItems.length > 0 && <span className="text-green-600">{approvedItems.length} approved</span>}
                  {rejectedItems.length > 0 && <span className="text-red-600">{rejectedItems.length} rejected</span>}
                  {pendingItems.length > 0 && <span className="text-amber-600">{pendingItems.length} pending</span>}
                </>
              )}
            </div>
          </div>
          {assignedAnimal && (
            <Badge variant="outline" className="gap-1">
              <PawPrint className="w-3 h-3" />
              {assignedAnimal.name}
            </Badge>
          )}
          {!assignedAnimal && batch.animalName && (
            <Badge variant="outline" className="gap-1">
              <PawPrint className="w-3 h-3" />
              {batch.animalName}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CollapsibleContent>
      <CardContent className="space-y-4">
        {needsAnimalAssignment && (
          <Card className="border-dashed border-amber-500/50 bg-amber-500/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium">Animal Assignment Required</p>
                  <p className="text-xs text-muted-foreground">
                    {batch.source === 'email'
                      ? "This import came from email. Please assign it to an animal before approving records."
                      : "Please assign this import to an animal before approving records."}
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
              <h4 className="text-sm font-medium flex items-center gap-1 flex-wrap">
                Pending Review ({pendingItems.length})
                {hasAnimalAssigned && dupLoading && (
                  <Badge variant="outline" className="text-muted-foreground ml-1 gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Checking duplicates...
                  </Badge>
                )}
                {duplicateCount > 0 && (
                  <Badge variant="outline" className="text-amber-600 border-amber-400 ml-1">
                    <Copy className="w-3 h-3 mr-1" />
                    {duplicateCount} likely duplicate{duplicateCount !== 1 ? 's' : ''}
                  </Badge>
                )}
              </h4>
              {!needsAnimalAssignment && pendingItems.length > 1 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        size="sm"
                        onClick={() => {
                          if (duplicateCount > 0) {
                            approveAllMutation.mutate({ skipDuplicates: true });
                          } else {
                            approveAllMutation.mutate();
                          }
                        }}
                        disabled={approveAllMutation.isPending || allPendingAreDuplicates || !dupCheckReady}
                        data-testid={`button-approve-all-${batch.id}`}
                      >
                        {approveAllMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                        )}
                        {duplicateCount > 0 && !allPendingAreDuplicates
                          ? `Approve ${nonDuplicateCount} Non-Duplicate${nonDuplicateCount !== 1 ? 's' : ''}`
                          : 'Approve All'}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {(allPendingAreDuplicates || !dupCheckReady) && (
                    <TooltipContent>
                      <p>{!dupCheckReady
                        ? "Checking for duplicate records..."
                        : "All pending items are likely duplicates. Review and approve individually if needed."
                      }</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              )}
            </div>
            <div className="space-y-2">
              {pendingItems.map((item) => {
                const isDup = duplicates[item.id]?.isDuplicate;
                const dupSummary = duplicates[item.id]?.matchedSummary;
                return (
                <Card key={item.id} className={isDup ? "border-amber-400/50" : ""}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className={`flex-shrink-0 p-2 rounded-md ${isDup ? "bg-amber-500/10" : "bg-muted"}`}>
                        {getRecordTypeIcon(item.recordType)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="secondary" className="capitalize">{item.recordType}</Badge>
                          {getConfidenceBadge(item.confidence)}
                          {isDup && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="text-amber-600 border-amber-400 gap-1" data-testid={`badge-duplicate-${item.id}`}>
                                  <Copy className="w-3 h-3" />
                                  Likely Duplicate
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs">
                                <p className="text-xs">Existing record found: {dupSummary}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
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
                            onClick={() => handleApproveClick(item.id)}
                            disabled={approveMutation.isPending || (!dupCheckReady && hasAnimalAssigned)}
                            data-testid={`button-approve-${item.id}`}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
                );
              })}
            </div>
          </div>
        )}

        <AlertDialog open={!!confirmApproveItemId} onOpenChange={(open) => { if (!open) setConfirmApproveItemId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Possible Duplicate Record</AlertDialogTitle>
              <AlertDialogDescription>
                A similar medical record already exists for this animal
                {confirmApproveItemId && duplicates[confirmApproveItemId]?.matchedSummary && (
                  <span className="block mt-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                    Match: {duplicates[confirmApproveItemId]?.matchedSummary}
                  </span>
                )}
                <span className="block mt-2">Are you sure you want to import this record? This may create a duplicate entry.</span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-duplicate">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (confirmApproveItemId) {
                    approveMutation.mutate(confirmApproveItemId);
                    setConfirmApproveItemId(null);
                  }
                }}
                data-testid="button-confirm-import-anyway"
              >
                Import Anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
      </CollapsibleContent>
    </Card>
    </Collapsible>
  );
}

function UploadZone({ animals, onUploadComplete }: { animals: Animal[]; onUploadComplete: () => void }) {
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedAnimalId, setSelectedAnimalId] = useState<string>("");

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedAnimalId) throw new Error("Please select an animal first");
      const formData = new FormData();
      formData.append('file', file);
      const tenantHeaders = getTenantHeaders();
      const response = await fetch(buildTenantUrl(`/api/medical-import/${selectedAnimalId}/upload`), {
        method: 'POST',
        headers: tenantHeaders,
        body: formData,
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Document Processed",
        description: `Found ${data.itemCount} medical records to review`,
      });
      onUploadComplete();
    },
    onError: (error: Error) => {
      toast({
        title: "Processing Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      uploadMutation.mutate(file);
    } else {
      toast({ title: "Invalid File", description: "Please upload a PDF file", variant: "destructive" });
    }
  }, [uploadMutation, toast]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  }, [uploadMutation]);

  return (
    <Card data-testid="card-upload-zone">
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <Select value={selectedAnimalId} onValueChange={setSelectedAnimalId}>
              <SelectTrigger data-testid="select-upload-animal">
                <SelectValue placeholder="Select animal for upload..." />
              </SelectTrigger>
              <SelectContent>
                {animals.map(animal => (
                  <SelectItem key={animal.id} value={animal.id}>
                    {animal.name} ({animal.species})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div
          className={`
            border-2 border-dashed rounded-md p-6 text-center transition-colors
            ${!selectedAnimalId ? 'opacity-50 pointer-events-none' : ''}
            ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
            ${uploadMutation.isPending ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:border-primary/50'}
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => selectedAnimalId && document.getElementById('upload-zone-pdf-input')?.click()}
          data-testid="upload-dropzone"
        >
          <input
            id="upload-zone-pdf-input"
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileSelect}
            data-testid="input-upload-pdf"
          />
          {uploadMutation.isPending ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Processing document...</p>
              <p className="text-xs text-muted-foreground">AI is extracting medical records</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm font-medium">
                {selectedAnimalId ? "Drop a PDF here or click to upload" : "Select an animal above, then upload a PDF"}
              </p>
              <p className="text-xs text-muted-foreground">
                Supports veterinary records, shelter intake forms, and medical histories
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface PaginatedResponse {
  batches: BatchWithItems[];
  total: number;
  hasMore: boolean;
}

const PAGE_SIZE = 20;

export default function MedicalImportsPage() {
  const [sourceFilter, setSourceFilter] = useState<'all' | 'email' | 'upload'>('all');

  const sourceParam = sourceFilter === 'all' ? '' : sourceFilter;

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<PaginatedResponse>({
    queryKey: ['/api/medical-import/all-batches', { source: sourceParam }],
    queryFn: async ({ pageParam }) => {
      const offset = pageParam as number;
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (sourceParam) params.set('source', sourceParam);
      const url = buildTenantUrl(`/api/medical-import/all-batches?${params.toString()}`);
      const headers = getTenantHeaders();
      const res = await fetch(url, { credentials: 'include', headers });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      const totalLoaded = allPages.reduce((sum, page) => sum + page.batches.length, 0);
      return totalLoaded;
    },
    refetchInterval: 30000,
  });

  const { data: animalsData } = useQuery<{ animals: Animal[] }>({
    queryKey: ['/api/animals'],
  });

  const terminalStatuses = ['deceased', 'transported', 'returned_to_owner', 'returned_to_field'];
  const animals = (animalsData?.animals || []).filter(a => !terminalStatuses.includes(a.status));

  const allBatches = data?.pages.flatMap(p => p.batches) || [];
  const total = data?.pages[0]?.total || 0;

  const pendingBatches = allBatches.filter(b => b.items.some(i => i.status === 'pending'));
  const completedBatches = allBatches.filter(b => !b.items.some(i => i.status === 'pending'));

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
            Review AI-parsed medical records from uploaded PDFs and emailed vet documents
          </p>
        </div>
      </div>

      <div className="space-y-4 mb-6">
        <UploadZone
          animals={animals}
          onUploadComplete={() => {
            queryClient.invalidateQueries({ queryKey: ['/api/medical-import/all-batches'] });
          }}
        />
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Button
          variant={sourceFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSourceFilter('all')}
          data-testid="filter-all"
        >
          All Imports
          {total > 0 && <Badge variant="secondary" className="ml-1">{total}</Badge>}
        </Button>
        <Button
          variant={sourceFilter === 'email' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSourceFilter('email')}
          className="gap-1"
          data-testid="filter-email"
        >
          <Mail className="w-3 h-3" />
          Email
        </Button>
        <Button
          variant={sourceFilter === 'upload' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSourceFilter('upload')}
          className="gap-1"
          data-testid="filter-upload"
        >
          <Upload className="w-3 h-3" />
          Manual Upload
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : allBatches.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="font-medium">No imports yet</p>
            <p className="text-sm text-muted-foreground mt-1 text-center max-w-md">
              {sourceFilter === 'email'
                ? "Forward vet records to your system import email address. AI will automatically parse the PDFs and they'll appear here for review."
                : sourceFilter === 'upload'
                ? "Upload a PDF using the upload zone above. AI will extract medical records for review."
                : "Upload vet record PDFs above, or forward them to your system import email address. AI will extract medical records for review."}
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
                <BatchCard key={batch.id} batch={batch} animals={animals} defaultCollapsed />
              ))}
            </div>
          )}

          {hasNextPage && (
            <div className="flex justify-center pt-2 pb-4">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="gap-2"
                data-testid="button-load-more"
              >
                {isFetchingNextPage ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                Load More
                <Badge variant="secondary">{allBatches.length} of {total}</Badge>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

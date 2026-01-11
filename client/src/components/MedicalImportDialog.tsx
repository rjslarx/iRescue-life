import { useState, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Upload, FileText, Loader2, Check, X, AlertTriangle, Syringe, Stethoscope, Pill, TestTube, ClipboardList, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import type { Animal, MedicalImportBatch, MedicalImportItem } from "@shared/schema";

interface MedicalImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animal: Animal;
}

interface UploadResponse {
  success: boolean;
  batchId: string;
  itemCount: number;
  vaccines: number;
  procedures: number;
  prescriptions: number;
  diagnostics: number;
  exams: number;
  overallConfidence: number;
  processingNotes: string;
  items: MedicalImportItem[];
}

export function MedicalImportDialog({ open, onOpenChange, animal }: MedicalImportDialogProps) {
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [items, setItems] = useState<MedicalImportItem[]>([]);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);

  const { data: batchData, refetch: refetchBatch } = useQuery<{ batch: MedicalImportBatch; items: MedicalImportItem[] }>({
    queryKey: ['/api/medical-import/batches', batchId],
    enabled: !!batchId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`/api/medical-import/${animal.id}/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }
      
      return response.json() as Promise<UploadResponse>;
    },
    onSuccess: (data) => {
      setBatchId(data.batchId);
      setItems(data.items);
      setUploadResult(data);
      toast({
        title: "Document Processed",
        description: `Found ${data.itemCount} medical records to review`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Processing Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return apiRequest(`/api/medical-import/items/${itemId}/approve`, { method: 'POST' });
    },
    onSuccess: () => {
      refetchBatch();
      queryClient.invalidateQueries({ queryKey: ['/api/animals', animal.id, 'vaccines'] });
      queryClient.invalidateQueries({ queryKey: ['/api/animals', animal.id, 'procedures'] });
      queryClient.invalidateQueries({ queryKey: ['/api/animals', animal.id, 'prescriptions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/animals', animal.id, 'diagnostics'] });
      queryClient.invalidateQueries({ queryKey: ['/api/animals', animal.id, 'exams'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return apiRequest(`/api/medical-import/items/${itemId}/reject`, { method: 'POST' });
    },
    onSuccess: () => {
      refetchBatch();
    },
  });

  const approveAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/medical-import/batches/${batchId}/approve-all`, { method: 'POST' });
    },
    onSuccess: (data: { imported: number }) => {
      toast({
        title: "Records Imported",
        description: `Successfully imported ${data.imported} medical records`,
      });
      refetchBatch();
      queryClient.invalidateQueries({ queryKey: ['/api/animals', animal.id] });
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
      toast({
        title: "Invalid File",
        description: "Please upload a PDF file",
        variant: "destructive",
      });
    }
  }, [uploadMutation, toast]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
  }, [uploadMutation]);

  const handleClose = () => {
    setBatchId(null);
    setItems([]);
    setUploadResult(null);
    onOpenChange(false);
  };

  const getRecordTypeIcon = (type: string) => {
    switch (type) {
      case 'vaccine': return <Syringe className="w-4 h-4" />;
      case 'procedure': return <Stethoscope className="w-4 h-4" />;
      case 'prescription': return <Pill className="w-4 h-4" />;
      case 'diagnostic': return <TestTube className="w-4 h-4" />;
      case 'exam': return <ClipboardList className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getConfidenceBadge = (confidence: string | number | null) => {
    const value = typeof confidence === 'string' ? parseFloat(confidence) : confidence || 0;
    if (value >= 80) return <Badge variant="default" className="bg-green-500">High Confidence</Badge>;
    if (value >= 60) return <Badge variant="default" className="bg-yellow-500">Medium Confidence</Badge>;
    return <Badge variant="default" className="bg-orange-500">Low Confidence</Badge>;
  };

  const formatExtractedData = (item: MedicalImportItem) => {
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
  };

  const displayItems = batchData?.items || items;
  const pendingItems = displayItems.filter(i => i.status === 'pending');
  const approvedItems = displayItems.filter(i => i.status === 'approved');
  const rejectedItems = displayItems.filter(i => i.status === 'rejected');

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI Medical Record Parser
          </DialogTitle>
          <DialogDescription>
            Upload a PDF of vet records for {animal.name}. AI will extract vaccines, procedures, and medical history automatically.
          </DialogDescription>
        </DialogHeader>

        {!batchId ? (
          <div
            className={`
              border-2 border-dashed rounded-lg p-12 text-center transition-colors
              ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
              ${uploadMutation.isPending ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:border-primary/50'}
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('medical-pdf-input')?.click()}
            data-testid="upload-dropzone"
          >
            <input
              id="medical-pdf-input"
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileSelect}
              data-testid="input-pdf-file"
            />
            
            {uploadMutation.isPending ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-12 h-12 animate-spin text-primary" />
                <div>
                  <p className="font-medium">Processing document...</p>
                  <p className="text-sm text-muted-foreground">AI is extracting medical records</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <Upload className="w-12 h-12 text-muted-foreground" />
                <div>
                  <p className="font-medium">Drop a PDF here or click to upload</p>
                  <p className="text-sm text-muted-foreground">
                    Supports veterinary records, shelter intake forms, and medical histories
                  </p>
                  <p className="text-xs text-muted-foreground mt-2 max-w-md">
                    For transport documents, include "Health Certificate" or "CVI" in the filename to enable transport manifest validation.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col">
            {uploadResult && (
              <Card className="mb-4">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Extraction Summary</CardTitle>
                    {getConfidenceBadge(uploadResult.overallConfidence)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 flex-wrap">
                    {uploadResult.vaccines > 0 && (
                      <Badge variant="outline" className="gap-1">
                        <Syringe className="w-3 h-3" /> {uploadResult.vaccines} Vaccines
                      </Badge>
                    )}
                    {uploadResult.procedures > 0 && (
                      <Badge variant="outline" className="gap-1">
                        <Stethoscope className="w-3 h-3" /> {uploadResult.procedures} Procedures
                      </Badge>
                    )}
                    {uploadResult.prescriptions > 0 && (
                      <Badge variant="outline" className="gap-1">
                        <Pill className="w-3 h-3" /> {uploadResult.prescriptions} Prescriptions
                      </Badge>
                    )}
                    {uploadResult.diagnostics > 0 && (
                      <Badge variant="outline" className="gap-1">
                        <TestTube className="w-3 h-3" /> {uploadResult.diagnostics} Diagnostics
                      </Badge>
                    )}
                    {uploadResult.exams > 0 && (
                      <Badge variant="outline" className="gap-1">
                        <ClipboardList className="w-3 h-3" /> {uploadResult.exams} Exams
                      </Badge>
                    )}
                  </div>
                  {uploadResult.processingNotes && (
                    <p className="text-sm text-muted-foreground mt-2 flex items-start gap-1">
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      {uploadResult.processingNotes}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            <Tabs defaultValue="pending" className="flex-1 overflow-hidden flex flex-col">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="pending" className="gap-1" data-testid="tab-pending">
                  Pending Review ({pendingItems.length})
                </TabsTrigger>
                <TabsTrigger value="approved" className="gap-1" data-testid="tab-approved">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Approved ({approvedItems.length})
                </TabsTrigger>
                <TabsTrigger value="rejected" className="gap-1" data-testid="tab-rejected">
                  <XCircle className="w-4 h-4 text-red-500" />
                  Rejected ({rejectedItems.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending" className="flex-1 overflow-hidden mt-4">
                <ScrollArea className="h-[350px]">
                  <div className="space-y-3 pr-4">
                    {pendingItems.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        All records have been reviewed
                      </p>
                    ) : (
                      pendingItems.map((item) => (
                        <Card key={item.id} className="relative">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-4">
                              <div className="flex-shrink-0 p-2 bg-muted rounded-md">
                                {getRecordTypeIcon(item.recordType)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge variant="secondary" className="capitalize">
                                    {item.recordType}
                                  </Badge>
                                  {getConfidenceBadge(item.confidence)}
                                </div>
                                {formatExtractedData(item)}
                                {item.sourceText && (
                                  <details className="mt-2">
                                    <summary className="text-xs text-muted-foreground cursor-pointer">
                                      View source text
                                    </summary>
                                    <p className="text-xs mt-1 p-2 bg-muted rounded text-muted-foreground">
                                      {item.sourceText}
                                    </p>
                                  </details>
                                )}
                              </div>
                              <div className="flex-shrink-0 flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => rejectMutation.mutate(item.id)}
                                  disabled={rejectMutation.isPending}
                                  data-testid={`button-reject-${item.id}`}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => approveMutation.mutate(item.id)}
                                  disabled={approveMutation.isPending}
                                  data-testid={`button-approve-${item.id}`}
                                >
                                  <Check className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="approved" className="flex-1 overflow-hidden mt-4">
                <ScrollArea className="h-[350px]">
                  <div className="space-y-3 pr-4">
                    {approvedItems.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        No records approved yet
                      </p>
                    ) : (
                      approvedItems.map((item) => (
                        <Card key={item.id} className="relative border-green-500/30 bg-green-500/5">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-4">
                              <div className="flex-shrink-0 p-2 bg-green-500/10 rounded-md text-green-600">
                                {getRecordTypeIcon(item.recordType)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge variant="secondary" className="capitalize">
                                    {item.recordType}
                                  </Badge>
                                  <Badge variant="default" className="bg-green-500">Imported</Badge>
                                </div>
                                {formatExtractedData(item)}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="rejected" className="flex-1 overflow-hidden mt-4">
                <ScrollArea className="h-[350px]">
                  <div className="space-y-3 pr-4">
                    {rejectedItems.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        No records rejected
                      </p>
                    ) : (
                      rejectedItems.map((item) => (
                        <Card key={item.id} className="relative border-red-500/30 bg-red-500/5 opacity-60">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-4">
                              <div className="flex-shrink-0 p-2 bg-red-500/10 rounded-md text-red-600">
                                {getRecordTypeIcon(item.recordType)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge variant="secondary" className="capitalize">
                                    {item.recordType}
                                  </Badge>
                                  <Badge variant="destructive">Rejected</Badge>
                                </div>
                                {formatExtractedData(item)}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        )}

        <Separator className="my-4" />

        <DialogFooter className="gap-2">
          {batchId && pendingItems.length > 0 && (
            <Button
              variant="default"
              onClick={() => approveAllMutation.mutate()}
              disabled={approveAllMutation.isPending}
              data-testid="button-approve-all"
            >
              {approveAllMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              Approve All ({pendingItems.length})
            </Button>
          )}
          <Button variant="outline" onClick={handleClose} data-testid="button-close-import">
            {batchId ? 'Done' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { buildTenantUrl, getTenantHeaders } from "@/lib/tenantApi";
import { Upload, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import type { Animal } from "@shared/schema";
import { useLocation } from "wouter";

interface MedicalImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animal: Animal;
}

export function MedicalImportDialog({ open, onOpenChange, animal }: MedicalImportDialogProps) {
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [itemCount, setItemCount] = useState(0);
  const [, setLocation] = useLocation();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const tenantHeaders = getTenantHeaders();
      const response = await fetch(buildTenantUrl(`/api/medical-import/${animal.id}/upload`), {
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
      setUploadComplete(true);
      setItemCount(data.itemCount || 0);
      queryClient.invalidateQueries({ queryKey: ['/api/medical-import/all-batches'] });
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
    setUploadComplete(false);
    setItemCount(0);
    onOpenChange(false);
  };

  const handleGoToReview = () => {
    handleClose();
    setLocation("/dashboard/medical-imports");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI Medical Record Parser
          </DialogTitle>
          <DialogDescription>
            Upload a PDF of vet records for {animal.name}. AI will extract vaccines, procedures, and medical history automatically.
          </DialogDescription>
        </DialogHeader>

        {uploadComplete ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <div className="text-center">
              <p className="font-medium">Document processed successfully</p>
              <p className="text-sm text-muted-foreground mt-1">
                {itemCount} medical record{itemCount !== 1 ? 's' : ''} extracted and ready for review
              </p>
            </div>
            <Button onClick={handleGoToReview} data-testid="button-go-to-review">
              Review Records
            </Button>
          </div>
        ) : (
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
                </div>
              </div>
            )}
          </div>
        )}

        <Separator className="my-2" />

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} data-testid="button-close-import">
            {uploadComplete ? 'Close' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

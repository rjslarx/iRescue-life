import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Upload, FileText, Loader2, AlertCircle, Info } from "lucide-react";
import type { Animal } from "@shared/schema";

interface MedicalFileUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animal?: Animal;
  animalId?: string;
  animalName?: string;
  transportEventId?: string;
  onSuccess?: () => void;
}

export function MedicalFileUploadDialog({ 
  open, 
  onOpenChange, 
  animal,
  animalId: propAnimalId,
  animalName: propAnimalName,
  transportEventId,
  onSuccess 
}: MedicalFileUploadDialogProps) {
  const animalId = animal?.id || propAnimalId;
  const animalName = animal?.name || propAnimalName || "Animal";
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!animalId) {
        throw new Error('Animal ID is required');
      }
      
      const uploadUrlResponse = await fetch(`/api/animals/${animalId}/upload-url`, {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!uploadUrlResponse.ok) {
        const error = await uploadUrlResponse.json();
        throw new Error(error.error || 'Failed to get upload URL');
      }
      
      const uploadInfo = await uploadUrlResponse.json();
      
      if (uploadInfo.useServerUpload) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('description', 
          file.name.toLowerCase().includes('cvi') || file.name.toLowerCase().includes('health') 
            ? 'Health Certificate / CVI' 
            : ''
        );
        
        const uploadResponse = await fetch(`/api/animals/${animalId}/upload-file`, {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });
        
        if (!uploadResponse.ok) {
          const error = await uploadResponse.json();
          throw new Error(error.error || 'Failed to upload file');
        }
        
        return uploadResponse.json();
      } else {
        const { uploadUrl, objectPath } = uploadInfo;
        
        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type,
          },
        });
        
        if (!uploadResponse.ok) {
          throw new Error('Failed to upload file');
        }
        
        const fileUrl = objectPath;
        
        const saveResponse = await fetch(`/api/animals/${animalId}/files`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fileName: file.name,
            fileUrl,
            mimeType: file.type,
            fileSize: file.size,
            description: file.name.toLowerCase().includes('cvi') || file.name.toLowerCase().includes('health') 
              ? 'Health Certificate / CVI' 
              : undefined,
          }),
        });
        
        if (!saveResponse.ok) {
          const error = await saveResponse.json();
          throw new Error(error.error || 'Failed to save file record');
        }
        
        return saveResponse.json();
      }
    },
    onSuccess: () => {
      toast({
        title: "Document Uploaded",
        description: `Successfully uploaded ${selectedFile?.name} for ${animalName}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/animals', animalId, 'files'] });
      if (transportEventId) {
        queryClient.invalidateQueries({ queryKey: [`/api/transport/events/${transportEventId}/validate-manifest`] });
        queryClient.invalidateQueries({ queryKey: [`/api/transport/events/${transportEventId}/manifest`] });
      }
      setSelectedFile(null);
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
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
    if (file) {
      const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (validTypes.includes(file.type)) {
        setSelectedFile(file);
      } else {
        toast({
          title: "Invalid File Type",
          description: "Please upload a PDF or image file (JPEG, PNG, GIF, WebP)",
          variant: "destructive",
        });
      }
    }
  }, [toast]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  }, []);

  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
  };

  const handleClose = () => {
    if (!uploadMutation.isPending) {
      setSelectedFile(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Document for {animalName}</DialogTitle>
          <DialogDescription>
            Upload a health certificate, CVI, or other medical document
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              For transport documents, include "Health Certificate" or "CVI" in the filename to enable transport manifest validation.
            </AlertDescription>
          </Alert>

          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {selectedFile ? (
              <div className="space-y-2">
                <FileText className="h-10 w-10 mx-auto text-primary" />
                <p className="font-medium">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setSelectedFile(null)}
                  disabled={uploadMutation.isPending}
                  data-testid="button-clear-file"
                >
                  Choose different file
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="text-muted-foreground">
                  Drag and drop a file here, or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  Supports PDF, JPEG, PNG, GIF, WebP
                </p>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="medical-file-input"
                  data-testid="input-medical-file"
                />
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => document.getElementById('medical-file-input')?.click()}
                  data-testid="button-browse-file"
                >
                  Browse Files
                </Button>
              </div>
            )}
          </div>

          {uploadMutation.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {uploadMutation.error?.message || 'Upload failed. Please try again.'}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={handleClose}
            disabled={uploadMutation.isPending}
            data-testid="button-cancel-upload"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleUpload}
            disabled={!selectedFile || uploadMutation.isPending}
            data-testid="button-submit-upload"
          >
            {uploadMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Upload Document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

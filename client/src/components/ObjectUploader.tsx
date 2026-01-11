import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Upload, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { buildTenantUrl, getTenantHeaders } from "@/lib/tenantApi";
import heic2any from "heic2any";

interface ObjectUploaderProps {
  value?: string[];
  onChange?: (urls: string[]) => void;
  maxFiles?: number;
  maxFileSize?: number;
  uploadEndpoint?: string;
  accept?: string;
  "data-testid"?: string;
  className?: string;
  buttonText?: string;
  buttonVariant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  showPreview?: boolean;
  previewSize?: "sm" | "md" | "lg";
}

export function ObjectUploader({
  value = [],
  onChange,
  maxFiles = 1,
  maxFileSize = 10 * 1024 * 1024, // 10MB default
  uploadEndpoint = '/api/animals/photos/upload',
  accept = "image/*",
  "data-testid": testId,
  className,
  buttonText,
  buttonVariant = "outline",
  showPreview = true,
  previewSize = "md",
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Preview size classes
  const previewSizeClasses = {
    sm: "w-16 h-16",
    md: "w-20 h-20",
    lg: "w-24 h-24",
  };

  // Clear selected files when modal closes
  useEffect(() => {
    if (!showModal) {
      setSelectedFiles([]);
      setPreviews([]);
    }
  }, [showModal]);

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    // Account for both existing uploads (value.length) and staged files (selectedFiles.length)
    const remainingSlots = Math.max(0, maxFiles - value.length - selectedFiles.length);
    if (remainingSlots === 0) {
      toast({
        title: "Maximum files reached",
        description: `You can only upload up to ${maxFiles} files.`,
        variant: "destructive",
      });
      return;
    }
    const filesToAdd = fileArray.slice(0, remainingSlots);

    // Validate file sizes
    const invalidFiles = filesToAdd.filter(file => file.size > maxFileSize);
    if (invalidFiles.length > 0) {
      toast({
        title: "File too large",
        description: `Maximum file size is ${(maxFileSize / 1024 / 1024).toFixed(0)}MB`,
        variant: "destructive",
      });
      return;
    }

    // Validate file types based on accept prop
    if (accept) {
      const acceptTypes = accept.split(',').map(t => t.trim());
      
      // Extension allowlists for wildcard MIME types
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.heic', '.heif', '.bmp', '.ico', '.avif'];
      const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v'];
      const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.wma'];
      
      const invalidTypes = filesToAdd.filter(file => {
        const fileName = file.name.toLowerCase();
        const fileExt = '.' + fileName.split('.').pop();
        
        return !acceptTypes.some(acceptType => {
          // Handle wildcard MIME types (e.g., image/*)
          if (acceptType.endsWith('/*')) {
            const baseType = acceptType.replace('/*', '');
            
            // First try MIME type if available
            if (file.type && file.type.startsWith(baseType)) {
              return true;
            }
            
            // Fallback to extension check when MIME type is missing or empty
            if (baseType === 'image') {
              return imageExtensions.includes(fileExt);
            }
            if (baseType === 'video') {
              return videoExtensions.includes(fileExt);
            }
            if (baseType === 'audio') {
              return audioExtensions.includes(fileExt);
            }
            
            return false;
          }
          
          // Exact MIME type match
          if (file.type === acceptType) {
            return true;
          }
          
          // Extension match (e.g., .pdf)
          if (acceptType.startsWith('.') && fileName.endsWith(acceptType.toLowerCase())) {
            return true;
          }
          
          return false;
        });
      });
      
      if (invalidTypes.length > 0) {
        toast({
          title: "Invalid file type",
          description: `Only ${accept} files are allowed`,
          variant: "destructive",
        });
        return;
      }
    }

    setSelectedFiles(prev => [...prev, ...filesToAdd]);

    // Generate previews (with HEIC conversion for browser compatibility)
    filesToAdd.forEach(async (file) => {
      const fileName = file.name.toLowerCase();
      const isHeic = fileName.endsWith('.heic') || fileName.endsWith('.heif') || 
                     file.type === 'image/heic' || file.type === 'image/heif';
      
      try {
        let previewBlob: Blob = file;
        
        // Convert HEIC/HEIF to JPEG for preview in browsers that don't support it
        if (isHeic) {
          try {
            const convertedBlob = await heic2any({
              blob: file,
              toType: 'image/jpeg',
              quality: 0.8,
            });
            previewBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
          } catch (heicError) {
            console.warn('HEIC preview conversion failed, using placeholder:', heicError);
            // Use a placeholder preview for HEIC files that can't be converted
            setPreviews(prev => [...prev, 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiB2aWV3Qm94PSIwIDAgMjAwIDIwMCI+PHJlY3QgZmlsbD0iI2U1ZTdlYiIgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzZiNzI4MCIgZm9udC1mYW1pbHk9InN5c3RlbS11aSIgZm9udC1zaXplPSIxNCI+SEVJQyBJbWFnZTwvdGV4dD48L3N2Zz4=']);
            return;
          }
        }
        
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviews(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(previewBlob);
      } catch (error) {
        console.error('Error generating preview:', error);
        // Fallback to standard preview attempt
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviews(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveExisting = (url: string) => {
    const newValue = value.filter(v => v !== url);
    onChange?.(newValue);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    try {
      // Create FormData and append files
      const formData = new FormData();
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });

      // Build tenant-aware URL and get tenant headers
      const tenantUrl = buildTenantUrl(uploadEndpoint);
      const tenantHeaders = getTenantHeaders();

      // Upload to backend with tenant context
      const response = await fetch(tenantUrl, {
        method: 'POST',
        credentials: 'include',
        headers: tenantHeaders,
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();
      
      if (data.uploadedPaths && data.uploadedPaths.length > 0) {
        // Append new uploads to value array and call onChange
        const newValue = [...value, ...data.uploadedPaths];
        onChange?.(newValue);
        
        toast({
          title: "Upload successful",
          description: `${data.uploadedPaths.length} file(s) uploaded successfully.`,
        });
        setShowModal(false);
      }
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const defaultButtonText = value.length === 0 
    ? (maxFiles > 1 ? "Upload Images" : "Upload Image")
    : (maxFiles > 1 ? "Upload More" : "Change Image");

  return (
    <div className={`space-y-3 ${className || ''}`}>
      {/* Display existing images */}
      {showPreview && value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((url, index) => (
            <div key={index} className={`relative group ${previewSizeClasses[previewSize]} rounded-md overflow-hidden border`}>
              <img
                src={url}
                alt={`Uploaded ${index + 1}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="h-6 w-6"
                  onClick={() => handleRemoveExisting(url)}
                  data-testid={`button-remove-image-${index}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {value.length < maxFiles && (
        <Button
          type="button"
          variant={buttonVariant}
          onClick={() => setShowModal(true)}
          data-testid={testId || "button-upload"}
        >
          <Upload className="h-4 w-4 mr-2" />
          {buttonText || defaultButtonText}
        </Button>
      )}

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload {accept?.includes('image') ? 'Images' : 'Files'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Drop zone */}
            {(() => {
              const totalFiles = value.length + selectedFiles.length;
              const canAddMore = totalFiles < maxFiles;
              return (
                <div
                  onDragOver={canAddMore ? handleDragOver : undefined}
                  onDragLeave={canAddMore ? handleDragLeave : undefined}
                  onDrop={canAddMore ? handleDrop : undefined}
                  onClick={canAddMore ? () => fileInputRef.current?.click() : undefined}
                  className={`
                    border-2 border-dashed rounded-lg p-8 text-center
                    transition-colors
                    ${!canAddMore ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    ${isDragging 
                      ? 'border-primary bg-primary/5' 
                      : canAddMore 
                        ? 'border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/50'
                        : 'border-muted-foreground/25'
                    }
                  `}
                >
                  <Upload className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm font-medium mb-1">
                    {!canAddMore
                      ? `Maximum ${maxFiles} file${maxFiles > 1 ? 's' : ''} reached`
                      : 'Click to browse or drag and drop'
                    }
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {canAddMore && (
                      <>Files up to {(maxFileSize / 1024 / 1024).toFixed(0)}MB</>
                    )}
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={accept}
                    multiple={maxFiles > 1}
                    className="hidden"
                    onChange={(e) => handleFileSelect(e.target.files)}
                    disabled={!canAddMore}
                  />
                </div>
              );
            })()}

            {/* Preview grid */}
            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {previews.map((preview, index) => (
                    <div key={index} className="relative group rounded-md overflow-hidden border bg-muted">
                      <img
                        src={preview}
                        alt={`Preview ${index + 1}`}
                        className="w-full h-40 object-cover"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Button
                          type="button"
                          size="icon"
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveFile(index);
                          }}
                          disabled={isUploading}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/75 p-2">
                        <p className="text-xs text-white truncate">
                          {selectedFiles[index].name}
                        </p>
                        <p className="text-xs text-white/70">
                          {(selectedFiles[index].size / 1024).toFixed(0)} KB
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowModal(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleUpload}
              disabled={selectedFiles.length === 0 || isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>Upload {selectedFiles.length > 0 && `(${selectedFiles.length})`}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Camera, Upload, X, Loader2, Image, Check, Replace } from "lucide-react";
import type { Animal } from "@shared/schema";

interface QuickAnimalPhotoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animal: Animal;
}

export default function QuickAnimalPhoto({
  open,
  onOpenChange,
  animal,
}: QuickAnimalPhotoProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const existingPhotos = animal.photoUrls || [];
  const hasMaxPhotos = existingPhotos.length >= 4;

  const resetState = () => {
    setSelectedFile(null);
    setPreview(null);
    setIsUploading(false);
    setReplaceExisting(false);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const objectUrl = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        
        const maxDimension = 1920;
        let { width, height } = img;
        
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = (height / width) * maxDimension;
            width = maxDimension;
          } else {
            width = (width / height) * maxDimension;
            height = maxDimension;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }
            const baseName = file.name.replace(/\.[^/.]+$/, '');
            const compressedFile = new File([blob], `${baseName}.jpg`, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          'image/jpeg',
          0.8
        );
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image'));
      };
      
      img.src = objectUrl;
    });
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum file size is 10MB",
        variant: "destructive",
      });
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Only image files are allowed",
        variant: "destructive",
      });
      return;
    }

    try {
      const compressedFile = await compressImage(file);
      setSelectedFile(compressedFile);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(compressedFile);
    } catch (error) {
      toast({
        title: "Error processing image",
        description: "Failed to process the image. Please try again.",
        variant: "destructive",
      });
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("No file selected");

      setIsUploading(true);

      const formData = new FormData();
      formData.append("files", selectedFile);

      const uploadResponse = await fetch("/api/animals/photos/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!uploadResponse.ok) {
        const error = await uploadResponse.json();
        throw new Error(error.error || "Failed to upload photo");
      }

      const { uploadedPaths } = await uploadResponse.json();

      let updatedPhotoUrls: string[];
      if (replaceExisting) {
        updatedPhotoUrls = [uploadedPaths[0]];
      } else if (existingPhotos.length >= 4) {
        updatedPhotoUrls = [...existingPhotos.slice(1), uploadedPaths[0]];
      } else {
        updatedPhotoUrls = [...existingPhotos, uploadedPaths[0]];
      }

      const updateResponse = await apiRequest('PATCH', `/api/animals/${animal.id}`, {
        photoUrls: updatedPhotoUrls,
      });

      if (!updateResponse.ok) {
        throw new Error("Failed to update animal photos");
      }

      return { uploadedPaths };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });
      toast({
        title: "Photo updated",
        description: `${animal.name}'s profile photo has been updated.`,
      });
      handleClose();
    },
    onError: (error: Error) => {
      setIsUploading(false);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload photo. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-quick-animal-photo">
            Update Photo for {animal.name}
          </DialogTitle>
          <DialogDescription>
            Take a photo or choose from your gallery to update this animal's profile picture.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!selectedFile ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-24 flex-col gap-2"
                  onClick={() => cameraInputRef.current?.click()}
                  data-testid="button-take-animal-photo"
                >
                  <Camera className="h-8 w-8" />
                  <span className="text-sm font-medium">Take Photo</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-24 flex-col gap-2"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-choose-animal-photo"
                >
                  <Image className="h-8 w-8" />
                  <span className="text-sm font-medium">Choose Photo</span>
                </Button>
              </div>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
                data-testid="input-camera-animal"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
                data-testid="input-file-animal"
              />

              {existingPhotos.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground mb-2">
                    Current photos ({existingPhotos.length}/4):
                  </p>
                  <div className="flex gap-2">
                    {existingPhotos.map((url, index) => (
                      <img
                        key={index}
                        src={url}
                        alt={`Current photo ${index + 1}`}
                        className="w-16 h-16 object-cover rounded-md border"
                        data-testid={`img-current-photo-${index}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative w-full aspect-square bg-muted rounded-lg overflow-hidden">
                <img
                  src={preview || ""}
                  alt="Preview"
                  className="w-full h-full object-cover"
                  data-testid="img-animal-photo-preview"
                />
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute top-2 right-2"
                  onClick={resetState}
                  data-testid="button-remove-animal-preview"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {hasMaxPhotos && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-2">
                    This animal already has 4 photos. Choose an option:
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant={replaceExisting ? "default" : "outline"}
                      size="sm"
                      onClick={() => setReplaceExisting(true)}
                      className="flex-1"
                      data-testid="button-replace-photos"
                    >
                      <Replace className="h-4 w-4 mr-1" />
                      Replace All
                    </Button>
                    <Button
                      variant={!replaceExisting ? "default" : "outline"}
                      size="sm"
                      onClick={() => setReplaceExisting(false)}
                      className="flex-1"
                      data-testid="button-keep-latest"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Keep Latest
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {replaceExisting 
                      ? "All existing photos will be replaced with this new one."
                      : "The oldest photo will be removed to make room for this one."
                    }
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isUploading}
            data-testid="button-cancel-animal-photo"
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
            data-testid="button-save-animal-photo"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Save Photo
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Camera, Upload, X, Loader2, Image, Send } from "lucide-react";
import type { Animal } from "@shared/schema";

interface QuickPhotoUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animal: Animal;
}

export default function QuickPhotoUpload({
  open,
  onOpenChange,
  animal,
}: QuickPhotoUploadProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setSelectedFile(null);
    setPreview(null);
    setCaption("");
    setIsUploading(false);
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

      const uploadResponse = await fetch("/api/foster-updates/photos/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!uploadResponse.ok) {
        const error = await uploadResponse.json();
        throw new Error(error.error || "Failed to upload photo");
      }

      const { paths } = await uploadResponse.json();

      const updateData = {
        animalId: animal.id,
        updateType: "photo_update" as const,
        description: caption || `New photo of ${animal.name}`,
        photoUrls: paths,
        priority: "normal" as const,
      };

      return await apiRequest("POST", "/api/foster-updates", updateData);
    },
    onSuccess: () => {
      toast({
        title: "Photo shared!",
        description: `Your photo of ${animal.name} has been shared with the rescue team.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/foster-updates"] });
      handleClose();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message || "Failed to upload photo. Please try again.",
      });
      setIsUploading(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Quick Photo Upload
          </DialogTitle>
          <DialogDescription>
            Share a photo of {animal.name} with the rescue team
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!preview ? (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
                data-testid="input-file-upload"
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
                data-testid="input-camera-capture"
              />
              
              <Button
                variant="default"
                className="w-full h-24 flex flex-col gap-2"
                onClick={() => cameraInputRef.current?.click()}
                data-testid="button-take-photo"
              >
                <Camera className="h-8 w-8" />
                <span className="text-sm font-medium">Take Photo</span>
              </Button>

              <Button
                variant="outline"
                className="w-full h-16 flex flex-col gap-1"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-choose-photo"
              >
                <Image className="h-6 w-6" />
                <span className="text-xs">Choose from Gallery</span>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full h-64 object-cover rounded-lg"
                  data-testid="img-photo-preview"
                />
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={() => {
                    setSelectedFile(null);
                    setPreview(null);
                  }}
                  data-testid="button-remove-photo"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="caption">Add a caption (optional)</Label>
                <Textarea
                  id="caption"
                  placeholder={`What's ${animal.name} up to?`}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="resize-none"
                  rows={2}
                  data-testid="input-photo-caption"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isUploading}
            data-testid="button-cancel-upload"
          >
            Cancel
          </Button>
          {preview && (
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={isUploading || !selectedFile}
              data-testid="button-submit-photo"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Share Photo
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

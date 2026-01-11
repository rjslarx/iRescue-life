import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertFosterUpdateSchema, type InsertFosterUpdate } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, AlertCircle, FileText, MessageSquare, Camera, Upload, X } from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";

interface FosterUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animalId: string;
  animalName: string;
}

export default function FosterUpdateDialog({
  open,
  onOpenChange,
  animalId,
  animalName,
}: FosterUpdateDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadedPhotoUrls, setUploadedPhotoUrls] = useState<string[]>([]);
  
  const form = useForm<InsertFosterUpdate>({
    resolver: zodResolver(insertFosterUpdateSchema),
    defaultValues: {
      animalId,
      updateType: "general_update",
      description: "",
      photoUrls: undefined,
    },
  });

  useEffect(() => {
    form.reset({
      animalId,
      updateType: "general_update",
      description: "",
      photoUrls: undefined,
    });
    setUploadedPhotoUrls([]);
  }, [animalId, form]);

  // Clear photo state and reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setUploadedPhotoUrls([]);
      form.reset({
        animalId,
        updateType: "general_update",
        description: "",
        photoUrls: undefined,
      });
    }
  }, [open, animalId, form]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertFosterUpdate) => {
      const res = await apiRequest("POST", "/api/foster-updates", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      const updateType = form.getValues("updateType");
      let description = "Your update has been logged.";
      
      if (updateType === "medical_concern") {
        description = "Your medical concern has been escalated to the medical team with high priority.";
      } else if (updateType === "behavioral_note") {
        description = "Your behavioral note has been shared with the adoption coordinator.";
      }
      
      toast({
        title: "Update submitted",
        description,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/foster-updates'] });
      setUploadedPhotoUrls([]);
      onOpenChange(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to submit update",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertFosterUpdate) => {
    // Include uploaded photo URLs if any
    const submitData = {
      ...data,
      photoUrls: uploadedPhotoUrls.length > 0 ? uploadedPhotoUrls : undefined,
    };
    console.log("Foster Update Form Data:", submitData);
    console.log("Form Errors:", form.formState.errors);
    createMutation.mutate(submitData);
  };

  const updateType = form.watch("updateType");

  const handleRemovePhoto = (index: number) => {
    const newUrls = uploadedPhotoUrls.filter((_, i) => i !== index);
    setUploadedPhotoUrls(newUrls);
    form.setValue('photoUrls', newUrls.length > 0 ? newUrls : undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]" data-testid="dialog-foster-update">
        <DialogHeader>
          <DialogTitle>Add Foster Update</DialogTitle>
          <DialogDescription>
            Share an update or concern about <strong>{animalName}</strong>. Your update will be routed to the appropriate team.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="updateType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Update Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-update-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="medical_concern" data-testid="option-type-medical">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-destructive" />
                          <div>
                            <div className="font-medium">Medical Concern</div>
                            <div className="text-xs text-muted-foreground">High priority, routed to medical team</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="behavioral_note" data-testid="option-type-behavioral">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <div>
                            <div className="font-medium">Behavioral Note</div>
                            <div className="text-xs text-muted-foreground">Shared with adoption coordinator</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="general_update" data-testid="option-type-general">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" />
                          <div>
                            <div className="font-medium">General Update</div>
                            <div className="text-xs text-muted-foreground">General progress or note</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="photo_update" data-testid="option-type-photo">
                        <div className="flex items-center gap-2">
                          <Camera className="h-4 w-4" />
                          <div>
                            <div className="font-medium">Photo Update</div>
                            <div className="text-xs text-muted-foreground">Share new photos</div>
                          </div>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {updateType === "medical_concern" && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-destructive">High Priority</p>
                    <p className="text-xs text-destructive/90">
                      This will immediately notify the medical team. For emergencies, please call your rescue coordinator directly.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {updateType === "medical_concern" ? "Describe the concern" : 
                     updateType === "behavioral_note" ? "Describe the behavior" :
                     updateType === "photo_update" ? "Caption (optional)" :
                     "Description"}
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder={
                        updateType === "medical_concern" ? "Describe symptoms, when they started, severity..." :
                        updateType === "behavioral_note" ? "Describe the behavior, frequency, triggers..." :
                        updateType === "photo_update" ? "Add a caption for your photos..." :
                        "Share your update..."
                      }
                      className="resize-none"
                      rows={updateType === "photo_update" ? 3 : 6}
                      data-testid="textarea-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {updateType === "photo_update" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <FormLabel>Photos</FormLabel>
                  <ObjectUploader
                    value={uploadedPhotoUrls}
                    onChange={(urls) => {
                      setUploadedPhotoUrls(urls);
                      form.setValue('photoUrls', urls.length > 0 ? urls : undefined);
                    }}
                    maxFiles={5}
                    uploadEndpoint="/api/foster-updates/photos/upload"
                    showPreview={false}
                    buttonText="Add Photos"
                    buttonVariant="outline"
                    data-testid="uploader-foster-photos"
                  />
                </div>

                {uploadedPhotoUrls.length > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    {uploadedPhotoUrls.map((url, index) => (
                      <div key={index} className="relative group rounded-md overflow-hidden border bg-muted">
                        <img
                          src={url}
                          alt={`Photo ${index + 1}`}
                          className="w-full h-32 object-cover"
                        />
                        <div className="absolute top-2 right-2">
                          <Button
                            type="button"
                            size="icon"
                            variant="destructive"
                            onClick={() => handleRemovePhoto(index)}
                            className="h-6 w-6"
                            data-testid={`button-remove-photo-${index}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {uploadedPhotoUrls.length === 0 && (
                  <div className="p-6 border-2 border-dashed rounded-md text-center">
                    <Camera className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      No photos added yet. Click "Add Photos" to upload.
                    </p>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending}
                variant={updateType === "medical_concern" ? "destructive" : "default"}
                data-testid="button-submit-update"
              >
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Update
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

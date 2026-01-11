import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, Plus, Edit, Trash2, Eye, EyeOff } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import HappyTailsCard from "@/components/HappyTailsCard";
import { ObjectUploader } from "@/components/ObjectUploader";
import type { HappyTail } from "@shared/schema";
import DashboardLayout from "@/components/DashboardLayout";

const happyTailFormSchema = z.object({
  animalName: z.string().min(1, "Animal name is required"),
  adopterName: z.string().min(1, "Adopter name is required"),
  story: z.string().min(10, "Story must be at least 10 characters"),
  date: z.string().min(1, "Date is required"),
  isPublished: z.boolean().default(false),
  photoUrl: z.string().optional(),
});

type HappyTailFormData = z.infer<typeof happyTailFormSchema>;

export default function HappyTailsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTail, setEditingTail] = useState<HappyTail | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [tailToDelete, setTailToDelete] = useState<string | null>(null);
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string>("");

  const { data, isLoading } = useQuery<{ happyTails: HappyTail[] }>({
    queryKey: ['/api/happy-tails'],
  });

  const form = useForm<HappyTailFormData>({
    resolver: zodResolver(happyTailFormSchema),
    defaultValues: {
      animalName: "",
      adopterName: "",
      story: "",
      date: "",
      isPublished: false,
      photoUrl: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: HappyTailFormData) => {
      const res = await apiRequest('POST', '/api/happy-tails', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/happy-tails'] });
      toast({
        title: "Success",
        description: "Happy tail has been added.",
      });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add happy tail",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<HappyTailFormData> }) => {
      const res = await apiRequest('PATCH', `/api/happy-tails/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/happy-tails'] });
      toast({
        title: "Success",
        description: "Happy tail has been updated.",
      });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update happy tail",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/happy-tails/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/happy-tails'] });
      toast({
        title: "Success",
        description: "Happy tail has been deleted.",
      });
      setDeleteConfirmOpen(false);
      setTailToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete happy tail",
        variant: "destructive",
      });
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: async ({ id, isPublished }: { id: string; isPublished: boolean }) => {
      const res = await apiRequest('PATCH', `/api/happy-tails/${id}`, { isPublished });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/happy-tails'] });
      toast({
        title: "Success",
        description: "Publication status updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update publication status",
        variant: "destructive",
      });
    },
  });

  const happyTails = data?.happyTails || [];

  const onSubmit = (data: HappyTailFormData) => {
    const submitData = {
      ...data,
      photoUrl: uploadedPhotoUrl || data.photoUrl,
    };

    if (editingTail) {
      updateMutation.mutate({ id: editingTail.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleEdit = (tail: HappyTail) => {
    setEditingTail(tail);
    setUploadedPhotoUrl(tail.photoUrl || "");
    form.reset({
      animalName: tail.animalName,
      adopterName: tail.adopterName,
      story: tail.story,
      date: tail.date,
      isPublished: tail.isPublished,
      photoUrl: tail.photoUrl || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setTailToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (tailToDelete) {
      deleteMutation.mutate(tailToDelete);
    }
  };

  const handleTogglePublish = (tail: HappyTail) => {
    togglePublishMutation.mutate({ id: tail.id, isPublished: !tail.isPublished });
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingTail(null);
    setUploadedPhotoUrl("");
    form.reset();
  };


  return (
    <DashboardLayout
      title="Happy Tails"
      description="Manage and share adoption success stories"
      actions={
        <Button onClick={() => setDialogOpen(true)} data-testid="button-add-happy-tail">
          <Plus className="h-4 w-4 mr-2" />
          Add Happy Tail
        </Button>
      }
    >
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : happyTails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <p className="text-muted-foreground mb-4">No happy tails yet</p>
            <Button onClick={() => setDialogOpen(true)} data-testid="button-add-first-happy-tail">
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Happy Tail
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {happyTails.map((tail) => (
              <div key={tail.id} className="relative group">
                <HappyTailsCard
                  tail={{
                    id: tail.id,
                    animalName: tail.animalName,
                    adopterName: tail.adopterName,
                    story: tail.story,
                    photo: tail.photoUrl || "https://images.unsplash.com/photo-1450778869180-41d0601e046e?w=400",
                    date: tail.date,
                  }}
                />
                <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="icon"
                    variant="secondary"
                    onClick={() => handleTogglePublish(tail)}
                    data-testid={`button-toggle-publish-${tail.id}`}
                    title={tail.isPublished ? "Unpublish" : "Publish"}
                  >
                    {tail.isPublished ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    onClick={() => handleEdit(tail)}
                    data-testid={`button-edit-${tail.id}`}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="destructive"
                    onClick={() => handleDelete(tail.id)}
                    data-testid={`button-delete-${tail.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {!tail.isPublished && (
                  <div className="absolute top-2 left-2">
                    <span className="bg-muted text-muted-foreground text-xs px-2 py-1 rounded">
                      Draft
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title-happy-tail">
              {editingTail ? "Edit Happy Tail" : "Add Happy Tail"}
            </DialogTitle>
            <DialogDescription>
              Share a success story about an adoption
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="animalName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Animal Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., Buddy" data-testid="input-animal-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="adopterName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adopter Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., The Smith Family" data-testid="input-adopter-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="story"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Story</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Share the adoption success story..."
                        rows={5}
                        data-testid="input-story"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" data-testid="input-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <Label>Photo</Label>
                <ObjectUploader
                  value={uploadedPhotoUrl ? [uploadedPhotoUrl] : []}
                  onChange={(urls) => {
                    const url = urls[0] || "";
                    setUploadedPhotoUrl(url);
                    form.setValue('photoUrl', url);
                  }}
                  maxFiles={1}
                  uploadEndpoint="/api/animals/photos/upload"
                  data-testid="uploader-happy-tail-photo"
                />
              </div>

              <FormField
                control={form.control}
                name="isPublished"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-is-published"
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">Publish to public website</FormLabel>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseDialog}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-submit-happy-tail"
                >
                  {createMutation.isPending || updateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : editingTail ? (
                    "Update Happy Tail"
                  ) : (
                    "Add Happy Tail"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this happy tail. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

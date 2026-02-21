import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ObjectUploader } from "@/components/ObjectUploader";
import { MessageCircle, Plus, Trash2, Clock, Loader2, ImagePlus } from "lucide-react";
import type { CampaignUpdate } from "@shared/schema";

interface CampaignUpdatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignTitle: string;
}

export function CampaignUpdatesDialog({ open, onOpenChange, campaignId, campaignTitle }: CampaignUpdatesDialogProps) {
  const { toast } = useToast();
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newPhotoUrls, setNewPhotoUrls] = useState<string[]>([]);

  const { data: updatesData, isLoading } = useQuery<{ updates: CampaignUpdate[] }>({
    queryKey: [`/api/campaign-updates/${campaignId}`],
    enabled: open && !!campaignId,
  });

  const updates = updatesData?.updates || [];

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/campaign-updates', {
        donationLinkId: campaignId,
        title: newTitle,
        content: newContent,
        photoUrls: newPhotoUrls.length > 0 ? newPhotoUrls : [],
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaign-updates/${campaignId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/public-campaign/${campaignId}`] });
      setNewTitle("");
      setNewContent("");
      setNewPhotoUrls([]);
      toast({ title: "Update posted!" });
    },
    onError: () => {
      toast({ title: "Failed to post update", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (updateId: string) => {
      await apiRequest('DELETE', `/api/campaign-updates/${updateId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaign-updates/${campaignId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/public-campaign/${campaignId}`] });
      toast({ title: "Update deleted" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col p-0">
        <div className="p-6 pb-2 flex-shrink-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Campaign Updates
            </DialogTitle>
            <DialogDescription>
              Post updates for "{campaignTitle}" that donors and the public can see.
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-6">
          <div className="space-y-3 border rounded-md p-4">
            <h4 className="text-sm font-semibold">Post New Update</h4>
            <div className="space-y-2">
              <Label htmlFor="update-title">Title</Label>
              <Input
                id="update-title"
                placeholder="e.g., Surgery went well!"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                data-testid="input-update-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="update-content">Content</Label>
              <Textarea
                id="update-content"
                placeholder="Share what's happening..."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                className="min-h-[80px]"
                data-testid="input-update-content"
              />
            </div>
            <div className="space-y-2">
              <Label>Photos (optional)</Label>
              {newPhotoUrls.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {newPhotoUrls.map((url, idx) => (
                    <div key={idx} className="relative w-16 h-16 rounded-md overflow-hidden">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button
                        className="absolute top-0 right-0 bg-destructive text-destructive-foreground rounded-bl text-xs px-1"
                        onClick={() => setNewPhotoUrls(prev => prev.filter((_, i) => i !== idx))}
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <ObjectUploader
                value={newPhotoUrls}
                onChange={setNewPhotoUrls}
                maxFiles={5}
                accept="image/*"
                showPreview={false}
                buttonText="Add Photo"
                buttonVariant="outline"
                data-testid="button-upload-update-photo"
              />
            </div>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !newTitle || !newContent}
              className="w-full"
              data-testid="button-post-update"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Post Update
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : updates.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No updates yet. Post your first update above.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold">Posted Updates ({updates.length})</h4>
              {updates.map((update) => (
                <div key={update.id} className="border rounded-md p-3 space-y-2" data-testid={`update-item-${update.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{update.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(update.createdAt).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                          hour: 'numeric', minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(update.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-update-${update.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap">{update.content}</p>
                  {update.photoUrls && update.photoUrls.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {update.photoUrls.map((url, idx) => (
                        <img key={idx} src={url} alt="" className="w-14 h-14 rounded object-cover" />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

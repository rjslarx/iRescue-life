import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Send } from "lucide-react";
import type { Animal } from "@shared/schema";

interface TransferAnimalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animal: Animal | null;
}

export function TransferAnimalDialog({ open, onOpenChange, animal }: TransferAnimalDialogProps) {
  const { toast } = useToast();
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) {
      setSelectedTenantId("");
      setNotes("");
    }
  }, [open]);

  const { data: networkData, isLoading: loadingTenants } = useQuery<{
    tenants: Array<{ id: string; name: string; subdomain: string }>;
  }>({
    queryKey: ["/api/transfers/network-tenants"],
    enabled: open,
  });

  const transferMutation = useMutation({
    mutationFn: async (data: { receivingTenantId: string; animalId: string; notes?: string }) => {
      const res = await apiRequest("POST", "/api/transfers", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Transfer Request Sent",
        description: `Transfer request for ${animal?.name} has been sent to the receiving organization.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
      setSelectedTenantId("");
      setNotes("");
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Transfer Failed",
        description: error.message || "Failed to initiate transfer",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!animal || !selectedTenantId) return;
    transferMutation.mutate({
      receivingTenantId: selectedTenantId,
      animalId: animal.id,
      notes: notes.trim() || undefined,
    });
  };

  const tenants = networkData?.tenants || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle data-testid="title-transfer-dialog">Transfer to Network Rescue</DialogTitle>
          <DialogDescription>
            Transfer {animal?.name}'s records to another rescue organization on the iRescue network.
            The receiving organization will need to accept the transfer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="receiving-tenant" data-testid="label-receiving-org">Receiving Organization</Label>
            {loadingTenants ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading organizations...
              </div>
            ) : tenants.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="text-no-network-tenants">
                No other organizations are currently on the iRescue network.
              </p>
            ) : (
              <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                <SelectTrigger id="receiving-tenant" data-testid="select-receiving-tenant">
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id} data-testid={`option-tenant-${t.id}`}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="transfer-notes" data-testid="label-transfer-notes">Notes (optional)</Label>
            <Textarea
              id="transfer-notes"
              placeholder="Any notes for the receiving organization about this animal..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none"
              rows={3}
              data-testid="input-transfer-notes"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-transfer"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedTenantId || transferMutation.isPending}
            data-testid="button-send-transfer"
          >
            {transferMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Send Transfer Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

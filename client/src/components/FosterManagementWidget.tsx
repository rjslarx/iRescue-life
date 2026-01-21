import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Package, 
  FileText, 
  AlertTriangle, 
  Camera,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Eye
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useLocation } from "wouter";

interface DashboardStats {
  pendingSupplyRequests: number;
  pendingBioSubmissions: number;
  flaggedNotes: number;
  pendingPhotoApprovals: number;
}

export function FosterManagementWidget() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/foster/staff/dashboard"],
  });

  const { data: pendingBios } = useQuery<any[]>({
    queryKey: ["/api/foster/staff/bio-submissions", { status: "pending" }],
  });

  const { data: supplyRequests } = useQuery<any[]>({
    queryKey: ["/api/foster/staff/supply-requests"],
  });

  const { data: flaggedNotes } = useQuery<any[]>({
    queryKey: ["/api/foster/staff/behavior-notes/flagged"],
  });

  const updateSupplyMutation = useMutation({
    mutationFn: async ({ requestId, status }: { requestId: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/foster/staff/supply-requests/${requestId}`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/foster/staff/supply-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/foster/staff/dashboard"] });
      toast({ title: "Supply request updated" });
    },
  });

  const updateBioMutation = useMutation({
    mutationFn: async ({ bioId, status, applyToAnimal }: { bioId: string; status: string; applyToAnimal?: boolean }) => {
      const response = await apiRequest("PATCH", `/api/foster/staff/bio-submissions/${bioId}`, { status, applyToAnimal });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/foster/staff/bio-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/foster/staff/dashboard"] });
      toast({ title: "Bio submission updated" });
    },
  });

  const reviewNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const response = await apiRequest("PATCH", `/api/foster/staff/behavior-notes/${noteId}/review`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/foster/staff/behavior-notes/flagged"] });
      queryClient.invalidateQueries({ queryKey: ["/api/foster/staff/dashboard"] });
      toast({ title: "Note marked as reviewed" });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasAnyPending = 
    (stats?.pendingSupplyRequests || 0) > 0 || 
    (stats?.pendingBioSubmissions || 0) > 0 || 
    (stats?.flaggedNotes || 0) > 0 ||
    (stats?.pendingPhotoApprovals || 0) > 0;

  if (!hasAnyPending) {
    return null;
  }

  const pendingSupplies = supplyRequests?.filter(r => r.status === "pending") || [];
  const preparingSupplies = supplyRequests?.filter(r => r.status === "preparing" || r.status === "ready") || [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Foster Activity</span>
          <Badge variant="secondary" className="ml-2">
            {(stats?.pendingSupplyRequests || 0) + (stats?.pendingBioSubmissions || 0) + (stats?.flaggedNotes || 0)} items
          </Badge>
        </CardTitle>
        <CardDescription>Pending requests from foster caregivers</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pendingSupplies.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Package className="h-4 w-4" />
              Supply Requests ({pendingSupplies.length})
            </div>
            {pendingSupplies.slice(0, 3).map((request: any) => (
              <div key={request.id} className="flex items-center justify-between p-2 bg-muted rounded-lg text-sm">
                <div>
                  <p className="font-medium">{request.fosterName}</p>
                  <p className="text-xs text-muted-foreground">
                    {request.items.length} items - {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateSupplyMutation.mutate({ requestId: request.id, status: "preparing" })}
                    disabled={updateSupplyMutation.isPending}
                    data-testid={`button-prepare-${request.id}`}
                  >
                    Prepare
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {preparingSupplies.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-yellow-600">
              <Package className="h-4 w-4" />
              In Progress ({preparingSupplies.length})
            </div>
            {preparingSupplies.slice(0, 2).map((request: any) => (
              <div key={request.id} className="flex items-center justify-between p-2 bg-yellow-50 dark:bg-yellow-950 rounded-lg text-sm">
                <div>
                  <p className="font-medium">{request.fosterName}</p>
                  <Badge variant="outline">{request.status}</Badge>
                </div>
                <Button
                  size="sm"
                  onClick={() => updateSupplyMutation.mutate({ requestId: request.id, status: request.status === "preparing" ? "ready" : "completed" })}
                  disabled={updateSupplyMutation.isPending}
                  data-testid={`button-complete-${request.id}`}
                >
                  {request.status === "preparing" ? "Mark Ready" : "Complete"}
                </Button>
              </div>
            ))}
          </div>
        )}

        {pendingBios && pendingBios.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              Bio Submissions ({pendingBios.length})
            </div>
            {pendingBios.slice(0, 3).map((bio: any) => (
              <div key={bio.id} className="p-2 bg-muted rounded-lg text-sm">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-medium">{bio.animalName}</p>
                    <p className="text-xs text-muted-foreground">by {bio.fosterName}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateBioMutation.mutate({ bioId: bio.id, status: "rejected" })}
                      disabled={updateBioMutation.isPending}
                      data-testid={`button-reject-bio-${bio.id}`}
                    >
                      <XCircle className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => updateBioMutation.mutate({ bioId: bio.id, status: "approved", applyToAnimal: true })}
                      disabled={updateBioMutation.isPending}
                      data-testid={`button-approve-bio-${bio.id}`}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Approve
                    </Button>
                  </div>
                </div>
                {bio.generatedBio && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{bio.generatedBio}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {flaggedNotes && flaggedNotes.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-red-600">
              <AlertTriangle className="h-4 w-4" />
              Flagged Concerns ({flaggedNotes.length})
            </div>
            {flaggedNotes.slice(0, 3).map((note: any) => (
              <div key={note.id} className="p-2 bg-red-50 dark:bg-red-950 rounded-lg text-sm">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <p className="font-medium">{note.animalName}</p>
                    <p className="text-xs text-muted-foreground">by {note.fosterName}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reviewNoteMutation.mutate(note.id)}
                    disabled={reviewNoteMutation.isPending}
                    data-testid={`button-review-note-${note.id}`}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    Reviewed
                  </Button>
                </div>
                <p className="text-xs">{note.content}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default FosterManagementWidget;

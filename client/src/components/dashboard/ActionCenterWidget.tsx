import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Package, 
  FileText, 
  Camera, 
  Heart, 
  CheckCircle2, 
  XCircle, 
  ChevronRight,
  Inbox
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";

interface ActionItem {
  id: string;
  type: 'supply_request' | 'bio_submission' | 'behavior_alert' | 'photo_approval' | 'happy_tail';
  category: 'logistics' | 'content' | 'medical' | 'marketing';
  title: string;
  description: string;
  animalId: string;
  animalName: string;
  personName: string;
  status: string;
  data: any;
  createdAt: string;
}

interface ActionItemsResponse {
  actionItems: ActionItem[];
}

export default function ActionCenterWidget() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<ActionItemsResponse>({
    queryKey: ['/api/foster-portal/staff/action-center'],
    enabled: !!user && (user.activeRole === 'admin' || user.activeRole === 'staff'),
  });

  const updateSupplyMutation = useMutation({
    mutationFn: async ({ requestId, status }: { requestId: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/foster-portal/staff/supply-requests/${requestId}`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/foster-portal/staff/action-center"] });
      queryClient.invalidateQueries({ queryKey: ["/api/foster-portal/staff/dashboard"] });
      toast({ title: "Supply request updated" });
    },
  });

  const updateBioMutation = useMutation({
    mutationFn: async ({ bioId, status, applyToAnimal }: { bioId: string; status: string; applyToAnimal?: boolean }) => {
      const response = await apiRequest("PATCH", `/api/foster-portal/staff/bio-submissions/${bioId}`, { status, applyToAnimal });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/foster-portal/staff/action-center"] });
      queryClient.invalidateQueries({ queryKey: ["/api/foster-portal/staff/dashboard"] });
      toast({ title: "Bio submission updated" });
    },
  });

  const approvePhotoMutation = useMutation({
    mutationFn: async (photoId: string) => {
      const response = await apiRequest("PATCH", `/api/foster-portal/staff/photo-uploads/${photoId}/approve`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/foster-portal/staff/action-center"] });
      queryClient.invalidateQueries({ queryKey: ["/api/foster-portal/staff/dashboard"] });
      toast({ title: "Photo approved" });
    },
  });

  const approveHappyTailMutation = useMutation({
    mutationFn: async (updateId: string) => {
      const response = await apiRequest("PATCH", `/api/foster-portal/staff/happy-tail-updates/${updateId}/approve`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/foster-portal/staff/action-center"] });
      queryClient.invalidateQueries({ queryKey: ["/api/foster-portal/staff/dashboard"] });
      toast({ title: "Happy tail approved" });
    },
  });

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'supply_request': return <Package className="h-3 w-3" />;
      case 'bio_submission': return <FileText className="h-3 w-3" />;
      case 'photo_approval': return <Camera className="h-3 w-3" />;
      case 'happy_tail': return <Heart className="h-3 w-3" />;
      default: return <Inbox className="h-3 w-3" />;
    }
  };

  const getActionColor = (type: string) => {
    switch (type) {
      case 'supply_request': return 'bg-blue-500/20 text-blue-600 dark:text-blue-400';
      case 'bio_submission': return 'bg-green-500/20 text-green-600 dark:text-green-400';
      case 'photo_approval': return 'bg-purple-500/20 text-purple-600 dark:text-purple-400';
      case 'happy_tail': return 'bg-pink-500/20 text-pink-600 dark:text-pink-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (isLoading) {
    return (
      <Card data-testid="action-center-widget-skeleton">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const actionItems = data?.actionItems || [];
  const displayItems = actionItems.filter(item => item.type !== 'behavior_alert').slice(0, 5);

  return (
    <Card data-testid="action-center-widget">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4" />
          Action Center
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {actionItems.length === 0 ? "All caught up!" : `${actionItems.length} items to process`}
        </p>
      </CardHeader>
      <CardContent>
        {actionItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500 mb-2" />
            <p className="text-sm text-muted-foreground">No pending actions</p>
          </div>
        ) : (
          <ScrollArea className="h-[200px]">
            <div className="space-y-2">
              {displayItems.map((item) => (
                <div 
                  key={`${item.type}-${item.id}`} 
                  className="p-2 bg-muted/50 rounded-md border"
                  data-testid={`action-item-${item.type}-${item.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <div className={`mt-0.5 p-1 rounded-full ${getActionColor(item.type)}`}>
                        {getActionIcon(item.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.animalName}</p>
                        <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {item.type === 'supply_request' && (
                        <>
                          {item.status === 'pending' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => updateSupplyMutation.mutate({ requestId: item.id, status: 'preparing' })}
                              disabled={updateSupplyMutation.isPending}
                              data-testid={`button-prepare-${item.id}`}
                            >
                              Prep
                            </Button>
                          )}
                          {item.status === 'preparing' && (
                            <Button
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => updateSupplyMutation.mutate({ requestId: item.id, status: 'ready' })}
                              disabled={updateSupplyMutation.isPending}
                              data-testid={`button-ready-${item.id}`}
                            >
                              Ready
                            </Button>
                          )}
                          {item.status === 'ready' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-7 px-2"
                              onClick={() => updateSupplyMutation.mutate({ requestId: item.id, status: 'completed' })}
                              disabled={updateSupplyMutation.isPending}
                              data-testid={`button-complete-${item.id}`}
                            >
                              <CheckCircle2 className="h-3 w-3" />
                            </Button>
                          )}
                        </>
                      )}
                      {item.type === 'bio_submission' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            onClick={() => updateBioMutation.mutate({ bioId: item.id, status: 'approved', applyToAnimal: true })}
                            disabled={updateBioMutation.isPending}
                            data-testid={`button-approve-bio-${item.id}`}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => updateBioMutation.mutate({ bioId: item.id, status: 'rejected' })}
                            disabled={updateBioMutation.isPending}
                            data-testid={`button-reject-bio-${item.id}`}
                          >
                            <XCircle className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      {item.type === 'photo_approval' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2"
                          onClick={() => approvePhotoMutation.mutate(item.id)}
                          disabled={approvePhotoMutation.isPending}
                          data-testid={`button-approve-photo-${item.id}`}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                        </Button>
                      )}
                      {item.type === 'happy_tail' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2"
                          onClick={() => approveHappyTailMutation.mutate(item.id)}
                          disabled={approveHappyTailMutation.isPending}
                          data-testid={`button-approve-happy-tail-${item.id}`}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
      <CardFooter className="pt-0">
        <Link href="/dashboard/foster-management" className="w-full">
          <Button variant="ghost" size="sm" className="w-full justify-between" data-testid="button-view-all-actions">
            View All Actions
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}

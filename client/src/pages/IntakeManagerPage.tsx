import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import MobilePipelineView, { PipelineStage, PipelineCard } from "@/components/MobilePipelineView";
import { useIsMobile } from "@/hooks/use-mobile";
import DashboardLayout from "@/components/DashboardLayout";
import { 
  Inbox, 
  Search, 
  CheckCircle2, 
  Clock, 
  Calendar, 
  Eye, 
  ArrowRight,
  Dog,
  Phone,
  Mail,
  MessageSquare,
  FileText,
  Heart,
  AlertCircle
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { SurrenderRequest } from "@shared/schema";

const stages: PipelineStage[] = [
  { id: "new", label: "New Request", color: "bg-blue-500", icon: Inbox },
  { id: "review", label: "Review", color: "bg-yellow-500", icon: Search },
  { id: "spacecheck", label: "Space Check", color: "bg-purple-500", icon: CheckCircle2 },
  { id: "waitlist", label: "Waitlist", color: "bg-orange-500", icon: Clock },
  { id: "scheduled", label: "Scheduled", color: "bg-green-500", icon: Calendar },
];

export default function IntakeManagerPage() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<SurrenderRequest | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  const { data: surrenderRequests = [], isLoading } = useQuery<SurrenderRequest[]>({
    queryKey: ["/api/surrender-requests"],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/surrender-requests/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surrender-requests"] });
      toast({
        title: "Status updated",
        description: "The request has been moved to the new stage.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    },
  });

  const getRequestsByStage = (stageId: string) => {
    return surrenderRequests.filter((req) => req.status === stageId);
  };

  const requestToCard = (request: SurrenderRequest): PipelineCard => {
    const badges: Array<{ label: string; variant?: "default" | "secondary" | "outline" | "destructive" }> = [];
    
    if (request.smsConsent) {
      badges.push({ label: "SMS OK", variant: "secondary" });
    }
    
    if (request.medicalIssues) {
      badges.push({ label: "Medical", variant: "outline" });
    }
    
    if (request.behavioralIssues) {
      badges.push({ label: "Behavioral", variant: "outline" });
    }

    return {
      id: request.id,
      title: request.dogName,
      subtitle: `${request.dogBreed} • ${request.ownerName}`,
      photoUrl: request.photoUrl || undefined,
      createdAt: request.createdAt,
      badges,
    };
  };

  const getCardsByStage = (stageId: string): PipelineCard[] => {
    return getRequestsByStage(stageId).map(requestToCard);
  };

  const handleViewCard = (card: PipelineCard) => {
    const request = surrenderRequests.find((r) => r.id === card.id);
    if (request) {
      setSelectedRequest(request);
      setDetailsDialogOpen(true);
    }
  };

  const handleMoveCard = (cardId: string, newStageId: string) => {
    updateStatusMutation.mutate({ id: cardId, status: newStageId });
  };

  const getTimeAgo = (date?: string | Date | null) => {
    if (!date) return "";
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true });
    } catch {
      return "";
    }
  };

  const breadcrumbs = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Intake Manager" },
  ];

  if (isLoading) {
    return (
      <DashboardLayout
        title="Intake Manager"
        description="Manage dog surrender requests through the intake pipeline"
        breadcrumbs={breadcrumbs}
      >
        <div className="p-4 md:p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-96" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (isMobile) {
    return (
      <DashboardLayout
        title="Intake Manager"
        description="Manage dog surrender requests"
        breadcrumbs={breadcrumbs}
      >
        <div className="p-4 space-y-4">
          <MobilePipelineView
            stages={stages}
            cards={surrenderRequests.map(requestToCard)}
            getCardsByStage={getCardsByStage}
            onMoveCard={handleMoveCard}
            onViewCard={handleViewCard}
            emptyStateText="No requests"
          />

          <SurrenderDetailsDialog
            request={selectedRequest}
            open={detailsDialogOpen}
            onOpenChange={setDetailsDialogOpen}
          />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Intake Manager"
      description="Manage dog surrender requests through the intake pipeline"
      breadcrumbs={breadcrumbs}
    >
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-5 gap-4 min-h-[calc(100vh-200px)]">
          {stages.map((stage) => {
            const stageRequests = getRequestsByStage(stage.id);
            const StageIcon = stage.icon;

            return (
              <Card key={stage.id} className="flex flex-col" data-testid={`column-${stage.id}`}>
                <CardHeader className="py-3 px-4 border-b">
                  <CardTitle className="flex items-center justify-between text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <div className={`h-3 w-3 rounded-full ${stage.color}`} />
                      {StageIcon && <StageIcon className="h-4 w-4 text-muted-foreground" />}
                      <span>{stage.label}</span>
                    </div>
                    <Badge variant="secondary" className="ml-2" data-testid={`badge-count-${stage.id}`}>
                      {stageRequests.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <ScrollArea className="flex-1 p-2">
                  <div className="space-y-2">
                    {stageRequests.length === 0 ? (
                      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground border-2 border-dashed rounded-md">
                        No requests
                      </div>
                    ) : (
                      stageRequests.map((request) => (
                        <IntakeCard
                          key={request.id}
                          request={request}
                          currentStageId={stage.id}
                          stages={stages}
                          onView={() => {
                            setSelectedRequest(request);
                            setDetailsDialogOpen(true);
                          }}
                          onMove={(newStageId) => handleMoveCard(request.id, newStageId)}
                        />
                      ))
                    )}
                  </div>
                </ScrollArea>
              </Card>
            );
          })}
        </div>

        <SurrenderDetailsDialog
          request={selectedRequest}
          open={detailsDialogOpen}
          onOpenChange={setDetailsDialogOpen}
        />
      </div>
    </DashboardLayout>
  );
}

interface IntakeCardProps {
  request: SurrenderRequest;
  currentStageId: string;
  stages: PipelineStage[];
  onView: () => void;
  onMove: (newStageId: string) => void;
}

function IntakeCard({ request, currentStageId, stages, onView, onMove }: IntakeCardProps) {
  const getTimeAgo = (date?: string | Date | null) => {
    if (!date) return "";
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true });
    } catch {
      return "";
    }
  };

  const currentStageIndex = stages.findIndex((s) => s.id === currentStageId);
  const nextStage = stages[currentStageIndex + 1];

  return (
    <Card className="hover-elevate" data-testid={`card-intake-${request.id}`}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          {request.photoUrl ? (
            <img
              src={request.photoUrl}
              alt={request.dogName}
              className="h-12 w-12 rounded-md object-cover shrink-0"
            />
          ) : (
            <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center shrink-0">
              <Dog className="h-6 w-6 text-muted-foreground" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate" data-testid={`text-dog-name-${request.id}`}>
              {request.dogName}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {request.dogBreed}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              Owner: {request.ownerName}
            </p>
            {request.createdAt && (
              <p className="text-xs text-muted-foreground mt-1">
                {getTimeAgo(request.createdAt)}
              </p>
            )}

            <div className="flex flex-wrap gap-1 mt-2">
              {request.smsConsent && (
                <Badge variant="secondary" className="text-xs">
                  <MessageSquare className="h-3 w-3 mr-1" />
                  SMS
                </Badge>
              )}
              {request.medicalIssues && (
                <Badge variant="outline" className="text-xs">
                  <Heart className="h-3 w-3 mr-1" />
                  Medical
                </Badge>
              )}
              {request.behavioralIssues && (
                <Badge variant="outline" className="text-xs">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Behavioral
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 pt-2 border-t">
          <Button
            size="sm"
            variant="ghost"
            onClick={onView}
            className="flex-1"
            data-testid={`button-view-${request.id}`}
          >
            <Eye className="h-4 w-4 mr-1" />
            View
          </Button>
          {nextStage && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onMove(nextStage.id)}
              className="flex-1"
              data-testid={`button-move-${request.id}`}
            >
              <ArrowRight className="h-4 w-4 mr-1" />
              {nextStage.label}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface SurrenderDetailsDialogProps {
  request: SurrenderRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function SurrenderDetailsDialog({ request, open, onOpenChange }: SurrenderDetailsDialogProps) {
  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Dog className="h-5 w-5" />
            {request.dogName}
          </DialogTitle>
          <DialogDescription>
            Surrender request details
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {request.photoUrl && (
            <img
              src={request.photoUrl}
              alt={request.dogName}
              className="w-full h-48 object-cover rounded-lg"
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">Dog Name</h4>
              <p className="text-sm">{request.dogName}</p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">Breed</h4>
              <p className="text-sm">{request.dogBreed}</p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">Age</h4>
              <p className="text-sm">{request.dogAge}</p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">Gender</h4>
              <p className="text-sm capitalize">{request.dogGender}</p>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-medium mb-3 flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Owner Information
            </h3>
            <div className="space-y-2">
              <p className="text-sm">
                <span className="text-muted-foreground">Name:</span> {request.ownerName}
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Email:</span> {request.ownerEmail}
              </p>
              <p className="text-sm flex items-center gap-1">
                <span className="text-muted-foreground">Phone:</span> {request.ownerPhone}
                {request.smsConsent && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    <MessageSquare className="h-3 w-3 mr-1" />
                    SMS Consent
                  </Badge>
                )}
              </p>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-medium mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Reason for Surrender
            </h3>
            <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-md">
              {request.reasonForSurrender}
            </p>
          </div>

          {request.medicalIssues && (
            <div className="border-t pt-4">
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <Heart className="h-4 w-4 text-red-500" />
                Medical Issues
              </h3>
              <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-md">
                {request.medicalIssues}
              </p>
            </div>
          )}

          {request.behavioralIssues && (
            <div className="border-t pt-4">
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                Behavioral Issues
              </h3>
              <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-md">
                {request.behavioralIssues}
              </p>
            </div>
          )}

          {request.notes && (
            <div className="border-t pt-4">
              <h3 className="font-medium mb-3">Staff Notes</h3>
              <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-md">
                {request.notes}
              </p>
            </div>
          )}

          <div className="border-t pt-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Status: <Badge variant="outline" className="ml-1 capitalize">{request.status}</Badge></span>
              {request.createdAt && (
                <span>Submitted: {new Date(request.createdAt).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

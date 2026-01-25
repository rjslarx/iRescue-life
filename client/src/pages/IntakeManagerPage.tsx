import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  AlertCircle,
  Stethoscope,
  Loader2,
  XCircle
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
  const [showDeclined, setShowDeclined] = useState(false);

  const { data: surrenderRequests = [], isLoading } = useQuery<SurrenderRequest[]>({
    queryKey: ["/api/surrender-requests"],
  });

  // Filter out declined/intaken requests for active board
  const activeRequests = surrenderRequests.filter(
    (req) => req.status !== 'declined' && req.status !== 'intaken'
  );
  
  // Get declined requests for archive view
  const declinedRequests = surrenderRequests.filter(
    (req) => req.status === 'declined'
  );

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
    return activeRequests.filter((req) => req.status === stageId);
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
          <div className="flex items-center justify-end space-x-2">
            <Checkbox
              id="show-declined-mobile"
              checked={showDeclined}
              onCheckedChange={(checked) => setShowDeclined(checked === true)}
              data-testid="checkbox-show-declined"
            />
            <Label htmlFor="show-declined-mobile" className="text-sm text-muted-foreground cursor-pointer">
              Show Declined ({declinedRequests.length})
            </Label>
          </div>

          <MobilePipelineView
            stages={stages}
            cards={activeRequests.map(requestToCard)}
            getCardsByStage={getCardsByStage}
            onMoveCard={handleMoveCard}
            onViewCard={handleViewCard}
            emptyStateText="No requests"
          />

          {showDeclined && declinedRequests.length > 0 && (
            <Card className="opacity-60">
              <CardHeader className="py-3 px-4 border-b">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span>Declined Requests</span>
                  <Badge variant="secondary">{declinedRequests.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 space-y-2">
                {declinedRequests.map((request) => (
                  <DeclinedCard
                    key={request.id}
                    request={request}
                    onView={() => {
                      setSelectedRequest(request);
                      setDetailsDialogOpen(true);
                    }}
                  />
                ))}
              </CardContent>
            </Card>
          )}

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
        <div className="flex items-center justify-end space-x-2">
          <Checkbox
            id="show-declined"
            checked={showDeclined}
            onCheckedChange={(checked) => setShowDeclined(checked === true)}
            data-testid="checkbox-show-declined"
          />
          <Label htmlFor="show-declined" className="text-sm text-muted-foreground cursor-pointer">
            Show Declined ({declinedRequests.length})
          </Label>
        </div>

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

        {showDeclined && declinedRequests.length > 0 && (
          <Card className="opacity-60">
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <XCircle className="h-4 w-4 text-destructive" />
                <span>Declined Requests</span>
                <Badge variant="secondary">{declinedRequests.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {declinedRequests.map((request) => (
                  <DeclinedCard
                    key={request.id}
                    request={request}
                    onView={() => {
                      setSelectedRequest(request);
                      setDetailsDialogOpen(true);
                    }}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <SurrenderDetailsDialog
          request={selectedRequest}
          open={detailsDialogOpen}
          onOpenChange={setDetailsDialogOpen}
        />
      </div>
    </DashboardLayout>
  );
}

interface DeclinedCardProps {
  request: SurrenderRequest;
  onView: () => void;
}

function DeclinedCard({ request, onView }: DeclinedCardProps) {
  return (
    <Card className="bg-muted/50 border-dashed" data-testid={`declined-card-${request.id}`}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Dog className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium text-sm truncate">{request.dogName}</span>
            </div>
            <p className="text-xs text-muted-foreground truncate">{request.dogBreed}</p>
            <p className="text-xs text-muted-foreground truncate">{request.ownerName}</p>
            {request.declinedReason && (
              <Badge variant="outline" className="mt-2 text-xs">
                {request.declinedReason}
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onView}
            aria-label={`View ${request.dogName} details`}
            data-testid={`button-view-declined-${request.id}`}
          >
            <Eye className="h-4 w-4" />
            <span className="sr-only">View</span>
          </Button>
        </div>
        {request.declinedAt && (
          <p className="text-xs text-muted-foreground mt-2">
            Declined: {new Date(request.declinedAt).toLocaleDateString()}
          </p>
        )}
      </CardContent>
    </Card>
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

const DECLINE_REASONS = [
  { value: "no_space", label: "No Space Available" },
  { value: "behavioral", label: "Behavioral Issues Beyond Our Capacity" },
  { value: "out_of_area", label: "Out of Service Area" },
  { value: "medical", label: "Medical Needs Beyond Our Capacity" },
  { value: "breed_restriction", label: "Breed Restriction" },
  { value: "other", label: "Other" },
];

function SurrenderDetailsDialog({ request, open, onOpenChange }: SurrenderDetailsDialogProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState<string>("");
  
  const promoteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/surrender/${id}/promote`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success!",
        description: `${data.animalName} sent to Medical.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/surrender-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/medical/intake-animals"] });
      onOpenChange(false);
      setLocation("/dashboard/medical-pipeline");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to promote to inventory",
        variant: "destructive",
      });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const response = await apiRequest("POST", `/api/surrender/${id}/decline`, { reason });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Request Declined",
        description: "The surrender request has been declined and archived.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/surrender-requests"] });
      setDeclineDialogOpen(false);
      setDeclineReason("");
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to decline request",
        variant: "destructive",
      });
    },
  });

  const handleDeclineConfirm = () => {
    if (!request || !declineReason) return;
    const reasonLabel = DECLINE_REASONS.find(r => r.value === declineReason)?.label || declineReason;
    declineMutation.mutate({ id: request.id, reason: reasonLabel });
  };
  
  if (!request) return null;

  const canPromote = request.status !== 'intaken' && request.status !== 'declined';
  const canDecline = request.status !== 'intaken' && request.status !== 'declined';

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
            {request.dogDateOfBirth && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Date of Birth</h4>
                <p className="text-sm">{new Date(request.dogDateOfBirth).toLocaleDateString()}</p>
              </div>
            )}
            {request.dogWeight && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Weight</h4>
                <p className="text-sm">{request.dogWeight}</p>
              </div>
            )}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">Spayed/Neutered</h4>
              <p className="text-sm">{request.spayedNeutered === true ? 'Yes' : request.spayedNeutered === false ? 'No' : 'Unknown'}</p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">Microchipped</h4>
              <p className="text-sm">
                {request.microchipped === true ? 'Yes' : request.microchipped === false ? 'No' : 'Unknown'}
                {request.microchipNumber && ` (${request.microchipNumber})`}
              </p>
            </div>
          </div>

          {(request.goodWithKids || request.goodWithDogs || request.goodWithCats) && (
            <div className="border-t pt-4">
              <h3 className="font-medium mb-3">Compatibility</h3>
              <div className="flex flex-wrap gap-2">
                {request.goodWithKids && (
                  <Badge variant={request.goodWithKids === 'yes' ? 'default' : request.goodWithKids === 'no' ? 'destructive' : 'secondary'}>
                    Kids: {request.goodWithKids}
                  </Badge>
                )}
                {request.goodWithDogs && (
                  <Badge variant={request.goodWithDogs === 'yes' ? 'default' : request.goodWithDogs === 'no' ? 'destructive' : 'secondary'}>
                    Dogs: {request.goodWithDogs}
                  </Badge>
                )}
                {request.goodWithCats && (
                  <Badge variant={request.goodWithCats === 'yes' ? 'default' : request.goodWithCats === 'no' ? 'destructive' : 'secondary'}>
                    Cats: {request.goodWithCats}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {request.preferredSurrenderDate && (
            <div className="border-t pt-4">
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Preferred Surrender Date
              </h3>
              <p className="text-sm">{new Date(request.preferredSurrenderDate).toLocaleDateString()}</p>
            </div>
          )}

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

          {request.status === 'declined' && request.declinedReason && (
            <div className="border-t pt-4">
              <h3 className="font-medium mb-3 flex items-center gap-2 text-destructive">
                <XCircle className="h-4 w-4" />
                Decline Reason
              </h3>
              <p className="text-sm whitespace-pre-wrap bg-destructive/10 text-destructive p-3 rounded-md">
                {request.declinedReason}
              </p>
              {request.declinedAt && (
                <p className="text-xs text-muted-foreground mt-2">
                  Declined on: {new Date(request.declinedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          )}

          <div className="border-t pt-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Status: <Badge variant={request.status === 'declined' ? 'destructive' : 'outline'} className="ml-1 capitalize">{request.status}</Badge></span>
              {request.createdAt && (
                <span>Submitted: {new Date(request.createdAt).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        </div>
        
        {(canPromote || canDecline) && (
          <DialogFooter className="mt-4 flex flex-col sm:flex-row gap-2">
            {canDecline && (
              <Button
                variant="destructive"
                onClick={() => setDeclineDialogOpen(true)}
                disabled={declineMutation.isPending}
                className="w-full sm:w-auto"
                data-testid="button-decline-request"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Decline
              </Button>
            )}
            {canPromote && (
              <Button
                onClick={() => promoteMutation.mutate(request.id)}
                disabled={promoteMutation.isPending}
                className="w-full sm:w-auto"
                data-testid="button-approve-intake"
              >
                {promoteMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Stethoscope className="mr-2 h-4 w-4" />
                    Approve & Intake
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>

      <AlertDialog open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline Surrender Request</AlertDialogTitle>
            <AlertDialogDescription>
              Please select a reason for declining this surrender request for {request.dogName}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="decline-reason" className="text-sm font-medium">
              Reason for Decline
            </Label>
            <Select value={declineReason} onValueChange={setDeclineReason}>
              <SelectTrigger className="mt-2" id="decline-reason" data-testid="select-decline-reason">
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {DECLINE_REASONS.map((reason) => (
                  <SelectItem key={reason.value} value={reason.value} data-testid={`option-${reason.value}`}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeclineReason("")} data-testid="button-cancel-decline">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeclineConfirm}
              disabled={!declineReason || declineMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-decline"
            >
              {declineMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Declining...
                </>
              ) : (
                "Confirm Decline"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

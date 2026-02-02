import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
  XCircle,
  Plus
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { SurrenderRequest, SurrenderFormField } from "@shared/schema";
import IntakeInterceptorDialog from "@/components/IntakeInterceptorDialog";

const staffIntakeSchema = z.object({
  isStray: z.boolean().default(false),
  ownerName: z.string().optional(),
  ownerEmail: z.string().optional(),
  ownerPhone: z.string().optional(),
  smsConsent: z.boolean().default(false),
  dogName: z.string().min(1, "Dog name is required"),
  dogBreed: z.string().min(1, "Breed is required"),
  dogAge: z.string().min(1, "Age is required"),
  dogGender: z.enum(["male", "female", "unknown"]),
  dogWeight: z.string().optional(),
  microchipped: z.boolean().default(false),
  microchipNumber: z.string().optional(),
  reasonForSurrender: z.string().min(1, "Reason is required"),
  medicalIssues: z.string().optional(),
  behavioralIssues: z.string().optional(),
}).superRefine((data, ctx) => {
  if (!data.isStray) {
    if (!data.ownerName || data.ownerName.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Owner name is required",
        path: ["ownerName"],
      });
    }
    if (!data.ownerEmail || data.ownerEmail.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Email is required",
        path: ["ownerEmail"],
      });
    }
    if (!data.ownerPhone || data.ownerPhone.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Phone is required",
        path: ["ownerPhone"],
      });
    }
  }
});

type StaffIntakeFormData = z.infer<typeof staffIntakeSchema>;

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
  const [newIntakeDialogOpen, setNewIntakeDialogOpen] = useState(false);
  const [interceptorDialogOpen, setInterceptorDialogOpen] = useState(false);
  const [reIntakeDialogOpen, setReIntakeDialogOpen] = useState(false);
  const [reIntakeAnimalId, setReIntakeAnimalId] = useState<string | null>(null);
  const [reIntakeReason, setReIntakeReason] = useState("");
  const [reIntakeNotes, setReIntakeNotes] = useState("");
  const [, navigate] = useLocation();

  const newIntakeForm = useForm<StaffIntakeFormData>({
    resolver: zodResolver(staffIntakeSchema),
    defaultValues: {
      isStray: false,
      ownerName: "",
      ownerEmail: "",
      ownerPhone: "",
      smsConsent: false,
      dogName: "",
      dogBreed: "",
      dogAge: "",
      dogGender: "unknown",
      dogWeight: "",
      microchipped: false,
      microchipNumber: "",
      reasonForSurrender: "",
      medicalIssues: "",
      behavioralIssues: "",
    },
  });

  const isStray = newIntakeForm.watch("isStray");

  const createIntakeMutation = useMutation({
    mutationFn: async (data: StaffIntakeFormData) => {
      const submissionData = data.isStray
        ? {
            ownerName: "STRAY - No Owner",
            ownerEmail: "stray@intake.local",
            ownerPhone: "000-000-0000",
            smsConsent: false,
            dogName: data.dogName,
            dogBreed: data.dogBreed,
            dogAge: data.dogAge,
            dogGender: data.dogGender,
            dogWeight: data.dogWeight || "",
            microchipped: data.microchipped,
            microchipNumber: data.microchipped ? data.microchipNumber : "",
            reasonForSurrender: `[STRAY INTAKE] ${data.reasonForSurrender}`,
            medicalIssues: data.medicalIssues || "",
            behavioralIssues: data.behavioralIssues || "",
          }
        : {
            ownerName: data.ownerName!,
            ownerEmail: data.ownerEmail!,
            ownerPhone: data.ownerPhone!,
            smsConsent: data.smsConsent,
            dogName: data.dogName,
            dogBreed: data.dogBreed,
            dogAge: data.dogAge,
            dogGender: data.dogGender,
            dogWeight: data.dogWeight || "",
            microchipped: data.microchipped,
            microchipNumber: data.microchipped ? data.microchipNumber : "",
            reasonForSurrender: data.reasonForSurrender,
            medicalIssues: data.medicalIssues || "",
            behavioralIssues: data.behavioralIssues || "",
          };
      return apiRequest("POST", "/api/surrender", submissionData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surrender-requests"] });
      toast({
        title: "Intake created",
        description: "The new intake request has been added to the pipeline.",
      });
      setNewIntakeDialogOpen(false);
      newIntakeForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create intake",
        variant: "destructive",
      });
    },
  });

  const reIntakeMutation = useMutation({
    mutationFn: async ({ animalId, reason, notes }: { animalId: string; reason: string; notes?: string }) => {
      return apiRequest("POST", `/api/animals/${animalId}/re-intake`, { reason, notes });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/animals"] });
      toast({
        title: "Re-intake successful",
        description: data.message || "The animal has been re-intaken successfully.",
      });
      setReIntakeDialogOpen(false);
      setReIntakeAnimalId(null);
      setReIntakeReason("");
      setReIntakeNotes("");
      // Navigate to the animal's profile
      if (data.animal?.id) {
        navigate(`/manage/animals/${data.animal.id}`);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Re-intake failed",
        description: error.message || "Failed to re-intake the animal",
        variant: "destructive",
      });
    },
  });

  const handleReIntake = (animalId: string) => {
    setReIntakeAnimalId(animalId);
    setReIntakeDialogOpen(true);
  };

  const { data: surrenderRequests = [], isLoading } = useQuery<SurrenderRequest[]>({
    queryKey: ["/api/surrender-requests"],
  });

  // Fetch surrender form fields for displaying custom responses
  const { data: formFieldsData } = useQuery<{ fields: SurrenderFormField[] }>({
    queryKey: ["/api/surrender-form-fields"],
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
          <div className="flex items-center justify-between gap-2">
            <Button
              onClick={() => setInterceptorDialogOpen(true)}
              data-testid="button-new-intake-mobile"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Intake
            </Button>
            <div className="flex items-center space-x-2">
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
            formFields={formFieldsData?.fields || []}
          />

          <NewIntakeDialog
            open={newIntakeDialogOpen}
            onOpenChange={setNewIntakeDialogOpen}
            form={newIntakeForm}
            isStray={isStray}
            onSubmit={(data) => createIntakeMutation.mutate(data)}
            isPending={createIntakeMutation.isPending}
          />

          <IntakeInterceptorDialog
            open={interceptorDialogOpen}
            onOpenChange={setInterceptorDialogOpen}
            onContinueToIntake={() => setNewIntakeDialogOpen(true)}
            onReactivate={handleReIntake}
          />

          <ReIntakeDialog
            open={reIntakeDialogOpen}
            onOpenChange={setReIntakeDialogOpen}
            reason={reIntakeReason}
            onReasonChange={setReIntakeReason}
            notes={reIntakeNotes}
            onNotesChange={setReIntakeNotes}
            onSubmit={() => {
              if (reIntakeAnimalId && reIntakeReason.trim()) {
                reIntakeMutation.mutate({ 
                  animalId: reIntakeAnimalId, 
                  reason: reIntakeReason,
                  notes: reIntakeNotes || undefined 
                });
              }
            }}
            isPending={reIntakeMutation.isPending}
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
        <div className="flex items-center justify-between gap-4">
          <Button
            onClick={() => setInterceptorDialogOpen(true)}
            data-testid="button-new-intake"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Intake
          </Button>
          <div className="flex items-center space-x-2">
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
          formFields={formFieldsData?.fields || []}
        />

        <NewIntakeDialog
          open={newIntakeDialogOpen}
          onOpenChange={setNewIntakeDialogOpen}
          form={newIntakeForm}
          isStray={isStray}
          onSubmit={(data) => createIntakeMutation.mutate(data)}
          isPending={createIntakeMutation.isPending}
        />

        <IntakeInterceptorDialog
          open={interceptorDialogOpen}
          onOpenChange={setInterceptorDialogOpen}
          onContinueToIntake={() => setNewIntakeDialogOpen(true)}
          onReactivate={handleReIntake}
        />

        <ReIntakeDialog
          open={reIntakeDialogOpen}
          onOpenChange={setReIntakeDialogOpen}
          reason={reIntakeReason}
          onReasonChange={setReIntakeReason}
          notes={reIntakeNotes}
          onNotesChange={setReIntakeNotes}
          onSubmit={() => {
            if (reIntakeAnimalId && reIntakeReason.trim()) {
              reIntakeMutation.mutate({ 
                animalId: reIntakeAnimalId, 
                reason: reIntakeReason,
                notes: reIntakeNotes || undefined 
              });
            }
          }}
          isPending={reIntakeMutation.isPending}
        />
      </div>
    </DashboardLayout>
  );
}

interface ReIntakeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  onSubmit: () => void;
  isPending: boolean;
}

function ReIntakeDialog({ 
  open, 
  onOpenChange, 
  reason, 
  onReasonChange, 
  notes, 
  onNotesChange, 
  onSubmit, 
  isPending 
}: ReIntakeDialogProps) {
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      onReasonChange("");
      onNotesChange("");
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5" />
            Re-Intake Animal
          </DialogTitle>
          <DialogDescription>
            This animal has returned to the rescue. Provide details about the re-intake.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reintake-reason">Reason for Return *</Label>
            <Input
              id="reintake-reason"
              placeholder="e.g., Owner could no longer care for animal, allergies in new home..."
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              data-testid="input-reintake-reason"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reintake-notes">Additional Notes</Label>
            <Textarea
              id="reintake-notes"
              placeholder="Any other relevant information about the return..."
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              className="min-h-[80px]"
              data-testid="input-reintake-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
            data-testid="button-cancel-reintake"
          >
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={isPending || !reason.trim()}
            data-testid="button-submit-reintake"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              "Confirm Re-Intake"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  formFields: SurrenderFormField[];
}

const DECLINE_REASONS = [
  { value: "no_space", label: "No Space Available" },
  { value: "behavioral", label: "Behavioral Issues Beyond Our Capacity" },
  { value: "out_of_area", label: "Out of Service Area" },
  { value: "medical", label: "Medical Needs Beyond Our Capacity" },
  { value: "breed_restriction", label: "Breed Restriction" },
  { value: "other", label: "Other" },
];

function SurrenderDetailsDialog({ request, open, onOpenChange, formFields }: SurrenderDetailsDialogProps) {
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

          {/* Custom Form Responses Section */}
          {request.customResponses && Object.keys(request.customResponses).length > 0 && (
            <div className="border-t pt-4">
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Additional Form Responses
              </h3>
              <div className="space-y-3">
                {Object.entries(request.customResponses).map(([fieldId, value]) => {
                  if (value === undefined || value === null || value === '') return null;
                  const field = formFields.find(f => f.id === fieldId);
                  const label = field?.label || fieldId;
                  const fieldType = field?.fieldType || 'text';
                  
                  // Render photo fields as images (supports http URLs and /objects/ storage paths)
                  if (fieldType === 'photo' && typeof value === 'string' && (value.startsWith('http') || value.startsWith('/objects/') || value.startsWith('objects/'))) {
                    const imgSrc = value.startsWith('objects/') ? `/${value}` : value;
                    return (
                      <div key={fieldId} className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground">{label}</h4>
                        <img 
                          src={imgSrc} 
                          alt={label} 
                          className="max-w-full max-h-64 rounded-lg object-cover cursor-pointer"
                          onClick={() => window.open(imgSrc, '_blank')}
                          data-testid={`img-custom-${fieldId}`}
                        />
                      </div>
                    );
                  }
                  
                  // Render arrays as comma-separated values
                  if (Array.isArray(value)) {
                    return (
                      <div key={fieldId}>
                        <h4 className="text-sm font-medium text-muted-foreground">{label}</h4>
                        <p className="text-sm">{value.join(', ')}</p>
                      </div>
                    );
                  }
                  
                  // Render booleans as Yes/No
                  if (typeof value === 'boolean') {
                    return (
                      <div key={fieldId}>
                        <h4 className="text-sm font-medium text-muted-foreground">{label}</h4>
                        <p className="text-sm">{value ? 'Yes' : 'No'}</p>
                      </div>
                    );
                  }
                  
                  // Default text rendering
                  return (
                    <div key={fieldId}>
                      <h4 className="text-sm font-medium text-muted-foreground">{label}</h4>
                      <p className="text-sm whitespace-pre-wrap">{String(value)}</p>
                    </div>
                  );
                })}
              </div>
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

interface NewIntakeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ReturnType<typeof useForm<StaffIntakeFormData>>;
  isStray: boolean;
  onSubmit: (data: StaffIntakeFormData) => void;
  isPending: boolean;
}

function NewIntakeDialog({ open, onOpenChange, form, isStray, onSubmit, isPending }: NewIntakeDialogProps) {
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      form.reset({
        isStray: false,
        ownerName: "",
        ownerEmail: "",
        ownerPhone: "",
        smsConsent: false,
        dogName: "",
        dogBreed: "",
        dogAge: "",
        dogGender: "unknown",
        dogWeight: "",
        microchipped: false,
        microchipNumber: "",
        reasonForSurrender: "",
        medicalIssues: "",
        behavioralIssues: "",
      });
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Dog className="h-5 w-5" />
            New Intake Request
          </DialogTitle>
          <DialogDescription>
            Create a new intake request for the pipeline. For strays or field pickups, check the "Stray" option.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="isStray"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-is-stray"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="text-amber-800 dark:text-amber-200 font-medium">
                      Stray / No Owner
                    </FormLabel>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Check this for field pickups, strays, or animals without owner contact information
                    </p>
                  </div>
                </FormItem>
              )}
            />

            {!isStray && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground">Owner Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="ownerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Owner Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} data-testid="input-owner-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="ownerEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email *</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="john@example.com" {...field} data-testid="input-owner-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="ownerPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone *</FormLabel>
                        <FormControl>
                          <Input type="tel" placeholder="(555) 123-4567" {...field} data-testid="input-owner-phone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="smsConsent"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 pt-6">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-sms-consent"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-sm font-normal">
                            Owner consents to SMS updates
                          </FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground">Dog Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="dogName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dog Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Buddy" {...field} data-testid="input-dog-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dogBreed"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Breed *</FormLabel>
                      <FormControl>
                        <Input placeholder="Labrador Mix" {...field} data-testid="input-dog-breed" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dogAge"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Age *</FormLabel>
                      <FormControl>
                        <Input placeholder="2 years" {...field} data-testid="input-dog-age" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dogGender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-dog-gender">
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="unknown">Unknown</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dogWeight"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Weight (lbs)</FormLabel>
                      <FormControl>
                        <Input placeholder="45" {...field} data-testid="input-dog-weight" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="microchipped"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-microchipped"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Microchipped</FormLabel>
                        <p className="text-sm text-muted-foreground">
                          Does this dog have a microchip?
                        </p>
                      </div>
                    </FormItem>
                  )}
                />

                {form.watch("microchipped") && (
                  <FormField
                    control={form.control}
                    name="microchipNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Microchip Number</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Enter 9-15 digit number" 
                            {...field} 
                            data-testid="input-microchip-number"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground">Details</h3>
              <FormField
                control={form.control}
                name="reasonForSurrender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason for Surrender / Intake Notes *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={isStray ? "Found location, circumstances, etc." : "Why is the owner surrendering this dog?"}
                        {...field}
                        rows={3}
                        data-testid="input-reason"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="medicalIssues"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Known Medical Issues</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Any known health conditions..."
                          {...field}
                          rows={2}
                          data-testid="input-medical"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="behavioralIssues"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Known Behavioral Issues</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Any known behavioral concerns..."
                          {...field}
                          rows={2}
                          data-testid="input-behavioral"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} data-testid="button-cancel-intake">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-submit-intake">
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Intake
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

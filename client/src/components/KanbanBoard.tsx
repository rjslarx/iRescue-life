import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, CreditCard, FileSignature, Clock, Loader2, DollarSign, X, Banknote, Eye, ArrowRight, RefreshCw } from "lucide-react";
import { ChangeAnimalDialog } from "./ChangeAnimalDialog";
import { RecordOfflinePaymentDialog } from "./RecordOfflinePaymentDialog";
import MobilePipelineView, { PipelineStage, PipelineCard } from "./MobilePipelineView";
import { useIsMobile } from "@/hooks/use-mobile";

interface CheckoutStatus {
  status: string;
  expiresAt?: string;
  sessionId?: string;
  baseFee?: string;
}

interface Application {
  id: string;
  applicantName: string;
  animalName: string;
  email: string;
  phone: string;
  stage: string;
  animalId?: string;
  applicationType?: "adoption" | "foster";
  checkoutStatus?: CheckoutStatus | null;
  adoptionFeeStatus?: "pending" | "paid" | "waived";
  adoptionFeeAmount?: string;
  createdAt?: string;
}

interface KanbanBoardProps {
  applications: Application[];
  onMoveApplication?: (applicationId: string, newStage: string) => void;
  onAssignAnimal?: (application: Application) => void;
  onStartCheckout?: (applicationId: string, animalId: string, signerEmail: string, signerName: string) => void;
  onViewApplication?: (application: Application) => void;
  sendingContractId?: string | null;
  subscriptionTier?: "free" | "professional";
}

const kanbanStages: PipelineStage[] = [
  { id: "new", label: "New", color: "bg-blue-500" },
  { id: "screening", label: "Screening", color: "bg-yellow-500" },
  { id: "vet_check", label: "Vet Check", color: "bg-purple-500" },
  { id: "home_visit", label: "Home Visit", color: "bg-orange-500" },
  { id: "approved", label: "Approved", color: "bg-green-500" },
  { id: "trial", label: "Trial", color: "bg-cyan-500" },
];

const allStages: PipelineStage[] = [
  ...kanbanStages,
  { id: "adopted", label: "Adopted", color: "bg-teal-500" },
  { id: "denied", label: "Denied", color: "bg-red-500" },
  { id: "trial_failed", label: "Trial Failed", color: "bg-rose-500" },
];

function CheckoutStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline"; icon: typeof FileSignature }> = {
    created: { label: "Link Sent", variant: "secondary", icon: Clock },
    awaiting_signature: { label: "Signing", variant: "outline", icon: FileSignature },
    awaiting_payment: { label: "Payment", variant: "outline", icon: CreditCard },
    completed: { label: "Complete", variant: "default", icon: Check },
    expired: { label: "Expired", variant: "secondary", icon: Clock },
    cancelled: { label: "Cancelled", variant: "secondary", icon: Clock },
  };

  const config = statusConfig[status] || { label: status, variant: "outline" as const, icon: Clock };
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="text-xs gap-1 shrink-0" data-testid={`badge-checkout-${status}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}


function AdoptionFeeStatusBadge({ status, amount }: { status: string; amount?: string }) {
  const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof DollarSign }> = {
    pending: { label: "Fee Pending", variant: "outline", icon: Clock },
    paid: { label: amount ? `$${parseFloat(amount).toFixed(0)} Paid` : "Fee Paid", variant: "default", icon: DollarSign },
    waived: { label: "Fee Waived", variant: "secondary", icon: X },
  };

  const config = statusConfig[status] || { label: status, variant: "outline" as const, icon: DollarSign };
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="text-xs gap-1 shrink-0" data-testid={`badge-fee-${status}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

export default function KanbanBoard({ applications, onMoveApplication, onAssignAnimal, onStartCheckout, onViewApplication, sendingContractId, subscriptionTier }: KanbanBoardProps) {
  const [offlinePaymentApp, setOfflinePaymentApp] = useState<Application | null>(null);
  const isMobile = useIsMobile();
  
  const canRecordOfflinePayment = subscriptionTier === "professional";
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [changeAnimalApp, setChangeAnimalApp] = useState<Application | null>(null);

  const getApplicationsByStage = (stageId: string) => {
    return applications.filter(app => app.stage === stageId);
  };

  const appToCard = (app: Application): PipelineCard => {
    const badges: Array<{ label: string; variant?: "default" | "secondary" | "outline" | "destructive" }> = [];
    
    if (app.checkoutStatus) {
      const statusLabels: Record<string, string> = {
        created: "Link Sent",
        awaiting_signature: "Signing",
        awaiting_payment: "Payment",
        completed: "Complete",
      };
      if (statusLabels[app.checkoutStatus.status]) {
        badges.push({ label: statusLabels[app.checkoutStatus.status], variant: app.checkoutStatus.status === "completed" ? "default" : "outline" });
      }
    }
    
    if (app.adoptionFeeStatus && (app.stage === "approved" || app.stage === "adopted")) {
      if (app.adoptionFeeStatus === "paid") {
        badges.push({ label: app.adoptionFeeAmount ? `$${parseFloat(app.adoptionFeeAmount).toFixed(0)} Paid` : "Fee Paid", variant: "default" });
      } else if (app.adoptionFeeStatus === "waived") {
        badges.push({ label: "Fee Waived", variant: "secondary" });
      } else if (app.adoptionFeeStatus === "pending") {
        badges.push({ label: "Fee Pending", variant: "outline" });
      }
    }

    return {
      id: app.id,
      title: app.applicantName,
      subtitle: `For: ${app.animalName}`,
      createdAt: app.createdAt,
      badges,
    };
  };

  const getCardsByStage = (stageId: string): PipelineCard[] => {
    return getApplicationsByStage(stageId).map(appToCard);
  };

  const handleViewCard = (card: PipelineCard) => {
    const app = applications.find(a => a.id === card.id);
    if (app && onViewApplication) {
      onViewApplication(app);
    }
  };

  const handleMoveCard = (cardId: string, newStageId: string) => {
    if (onMoveApplication) {
      onMoveApplication(cardId, newStageId);
    }
  };

  if (isMobile) {
    return (
      <MobilePipelineView
        stages={allStages}
        cards={applications.map(appToCard)}
        getCardsByStage={getCardsByStage}
        onMoveCard={onMoveApplication ? handleMoveCard : undefined}
        onViewCard={onViewApplication ? handleViewCard : undefined}
        emptyStateText="No applications"
      />
    );
  }

  return (
    <div className="w-full min-w-0">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {kanbanStages.map((stage) => {
          const stageApps = getApplicationsByStage(stage.id);
          return (
            <div
              key={stage.id}
              className="flex flex-col min-w-0"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedId) {
                  onMoveApplication?.(draggedId, stage.id);
                  setDraggedId(null);
                }
              }}
            >
              <Card className="min-w-0 overflow-hidden">
                <CardHeader className="pb-3 px-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm flex items-center gap-1.5 min-w-0 flex-1">
                      <div className={`h-2 w-2 rounded-full shrink-0 ${stage.color}`} />
                      <span className="truncate">{stage.label}</span>
                    </CardTitle>
                    <Badge variant="secondary" className="shrink-0">{stageApps.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 px-3">
                  <ScrollArea className="h-[400px] pr-2">
                    {stageApps.length === 0 ? (
                      <div className="flex h-24 items-center justify-center rounded-md border-2 border-dashed text-sm text-muted-foreground">
                        No applications
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {stageApps.map((app) => (
                          <Card
                            key={app.id}
                            draggable
                            onDragStart={() => setDraggedId(app.id)}
                            onDragEnd={() => setDraggedId(null)}
                            className="cursor-move hover-elevate"
                            data-testid={`card-application-${app.id}`}
                          >
                            <CardContent className="p-3 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium truncate">{app.applicantName}</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    For: {app.animalName}
                                  </p>
                                </div>
                                <div className="flex flex-col gap-1 items-end shrink-0">
                                  {app.checkoutStatus && (
                                    <CheckoutStatusBadge status={app.checkoutStatus.status} />
                                  )}
                                  {app.adoptionFeeStatus && (stage.id === "approved" || stage.id === "adopted") && (
                                    <AdoptionFeeStatusBadge status={app.adoptionFeeStatus} amount={app.adoptionFeeAmount} />
                                  )}
                                </div>
                              </div>
                              <div className="space-y-0.5 text-xs text-muted-foreground">
                                <p className="truncate">{app.email}</p>
                                <p className="truncate">{app.phone}</p>
                              </div>
                              {stage.id === "approved" && onAssignAnimal && !app.checkoutStatus && (
                                <Button
                                  size="sm"
                                  className="w-full mt-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAssignAnimal(app);
                                  }}
                                  data-testid={`button-assign-animal-${app.id}`}
                                >
                                  <Check className="h-4 w-4 mr-2" />
                                  Assign Animal
                                </Button>
                              )}
                              {['new', 'screening', 'vet_check', 'home_visit', 'approved'].includes(stage.id) && 
                               (!app.applicationType || app.applicationType === 'adoption') &&
                               !app.checkoutStatus && app.animalId && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="w-full mt-1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setChangeAnimalApp(app);
                                  }}
                                  data-testid={`button-change-animal-${app.id}`}
                                >
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                  Change Animal
                                </Button>
                              )}
                              {stage.id === "approved" && onStartCheckout && !app.checkoutStatus && app.animalId && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full mt-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onStartCheckout(app.id, app.animalId!, app.email, app.applicantName);
                                  }}
                                  disabled={sendingContractId === app.id}
                                  data-testid={`button-start-checkout-${app.id}`}
                                >
                                  {sendingContractId === app.id ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <FileSignature className="h-4 w-4 mr-2" />
                                  )}
                                  Start Checkout
                                </Button>
                              )}
                              {app.checkoutStatus && app.checkoutStatus.status === 'awaiting_signature' && (
                                <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-2">
                                  <Clock className="h-3 w-3" />
                                  Awaiting adopter signature
                                </div>
                              )}
                              {app.checkoutStatus && app.checkoutStatus.status === 'awaiting_payment' && (
                                <div className="space-y-2 mt-2">
                                  <div className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                                    <CreditCard className="h-3 w-3" />
                                    Awaiting payment
                                  </div>
                                  {canRecordOfflinePayment && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="w-full"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOfflinePaymentApp(app);
                                      }}
                                      data-testid={`button-record-offline-payment-${app.id}`}
                                    >
                                      <Banknote className="h-4 w-4 mr-2" />
                                      Record Cash/Check Payment
                                    </Button>
                                  )}
                                </div>
                              )}
                              <div className="mt-2 pt-2 border-t flex items-center gap-1.5">
                                {onViewApplication && (
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onViewApplication(app);
                                    }}
                                    data-testid={`button-view-application-${app.id}`}
                                    title="View application"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                )}
                                {onMoveApplication && (
                                  <div className="flex-1 min-w-0">
                                    <select
                                      className="w-full h-9 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground cursor-pointer"
                                      value={app.stage}
                                      onChange={(e) => {
                                        if (e.target.value !== app.stage) {
                                          onMoveApplication(app.id, e.target.value);
                                        }
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      data-testid={`select-application-stage-${app.id}`}
                                    >
                                      {allStages.map((s) => (
                                        <option key={s.id} value={s.id}>
                                          {s.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>

      {offlinePaymentApp && offlinePaymentApp.checkoutStatus?.sessionId && (
        <RecordOfflinePaymentDialog
          open={!!offlinePaymentApp}
          onOpenChange={(open) => !open && setOfflinePaymentApp(null)}
          sessionId={offlinePaymentApp.checkoutStatus.sessionId}
          applicantName={offlinePaymentApp.applicantName}
          animalName={offlinePaymentApp.animalName}
          baseFee={offlinePaymentApp.checkoutStatus.baseFee}
        />
      )}

      {changeAnimalApp && (
        <ChangeAnimalDialog
          open={!!changeAnimalApp}
          onOpenChange={(open) => !open && setChangeAnimalApp(null)}
          applicationId={changeAnimalApp.id}
          applicationType="adoption"
          currentAnimalId={changeAnimalApp.animalId}
          currentAnimalName={changeAnimalApp.animalName}
          applicantName={changeAnimalApp.applicantName}
        />
      )}
    </div>
  );
}
